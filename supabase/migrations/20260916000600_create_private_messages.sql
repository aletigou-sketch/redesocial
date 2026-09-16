begin;

create table public.private_conversations (
  id uuid primary key default gen_random_uuid(),
  participant_one uuid not null references public.profiles (user_id) on delete cascade,
  participant_two uuid not null references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_conversations_distinct_participants check (participant_one <> participant_two),
  constraint private_conversations_canonical_order check (participant_one::text < participant_two::text),
  constraint private_conversations_unique_pair unique (participant_one, participant_two)
);

create table public.private_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.private_conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (user_id) on delete cascade,
  client_message_id uuid not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint private_messages_body_length check (char_length(btrim(body)) between 1 and 4000),
  constraint private_messages_sender_retry_unique unique (sender_id, client_message_id)
);

create index private_conversations_participant_one_updated_idx
  on public.private_conversations (participant_one, updated_at desc, id desc);
create index private_conversations_participant_two_updated_idx
  on public.private_conversations (participant_two, updated_at desc, id desc);
create index private_messages_conversation_cursor_idx
  on public.private_messages (conversation_id, created_at desc, id desc);

create trigger private_conversations_set_updated_at
before update on public.private_conversations
for each row execute function public.set_updated_at();

alter table public.private_conversations enable row level security;
alter table public.private_conversations force row level security;
alter table public.private_messages enable row level security;
alter table public.private_messages force row level security;

create function public.is_private_conversation_participant(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.private_conversations conversation
    where conversation.id = target_conversation_id
      and (select auth.uid()) in (conversation.participant_one, conversation.participant_two)
  );
$$;

revoke all on function public.is_private_conversation_participant(uuid) from public, anon;
grant execute on function public.is_private_conversation_participant(uuid) to authenticated;

create policy private_conversations_select_participants
on public.private_conversations for select to authenticated
using ((select auth.uid()) in (participant_one, participant_two));

create policy private_messages_select_participants
on public.private_messages for select to authenticated
using (public.is_private_conversation_participant(conversation_id));

-- Conversas e mensagens são criadas somente por funções transacionais. Não há
-- policies de INSERT/UPDATE/DELETE direto para clientes autenticados.
create function public.create_private_conversation(other_participant uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  first_participant uuid;
  second_participant uuid;
  conversation_id uuid;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if other_participant is null or other_participant = caller then
    raise exception 'invalid participant' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles profile
    join public.privacy_settings privacy on privacy.user_id = profile.user_id
    where profile.user_id = other_participant
      and profile.is_discoverable
      and privacy.allow_direct_messages
  ) or public.is_blocked_between(other_participant) then
    raise exception 'participant unavailable' using errcode = '42501';
  end if;

  if caller::text < other_participant::text then
    first_participant := caller;
    second_participant := other_participant;
  else
    first_participant := other_participant;
    second_participant := caller;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(first_participant::text || ':' || second_participant::text, 0));

  insert into public.private_conversations (participant_one, participant_two)
  values (first_participant, second_participant)
  on conflict (participant_one, participant_two)
  do update set updated_at = public.private_conversations.updated_at
  returning id into conversation_id;

  return conversation_id;
end;
$$;

create function public.send_private_message(
  target_conversation_id uuid,
  message_body text,
  retry_id uuid
)
returns table (id uuid, conversation_id uuid, sender_id uuid, client_message_id uuid, body text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  normalized_body text := btrim(message_body);
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if retry_id is null or char_length(normalized_body) not between 1 and 4000 then
    raise exception 'invalid message' using errcode = '22023';
  end if;
  if not public.is_private_conversation_participant(target_conversation_id) then
    raise exception 'conversation unavailable' using errcode = '42501';
  end if;

  insert into public.private_messages (conversation_id, sender_id, client_message_id, body)
  values (target_conversation_id, caller, retry_id, normalized_body)
  on conflict (sender_id, client_message_id) do nothing;

  update public.private_conversations
  set updated_at = now()
  where public.private_conversations.id = target_conversation_id;

  return query
  select message.id, message.conversation_id, message.sender_id,
         message.client_message_id, message.body, message.created_at
  from public.private_messages message
  where message.sender_id = caller and message.client_message_id = retry_id;
end;
$$;

create function public.list_private_conversations(page_size integer default 30)
returns table (
  id uuid,
  other_user_id uuid,
  other_username text,
  other_display_name text,
  updated_at timestamptz,
  last_message_body text,
  last_message_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select conversation.id,
    case when conversation.participant_one = (select auth.uid()) then conversation.participant_two else conversation.participant_one end,
    profile.username,
    profile.display_name,
    conversation.updated_at,
    latest.body,
    latest.created_at
  from public.private_conversations conversation
  join public.profiles profile on profile.user_id = case
    when conversation.participant_one = (select auth.uid()) then conversation.participant_two
    else conversation.participant_one
  end
  left join lateral (
    select message.body, message.created_at
    from public.private_messages message
    where message.conversation_id = conversation.id
    order by message.created_at desc, message.id desc
    limit 1
  ) latest on true
  where (select auth.uid()) in (conversation.participant_one, conversation.participant_two)
  order by conversation.updated_at desc, conversation.id desc
  limit least(greatest(coalesce(page_size, 30), 1), 50);
$$;

create function public.list_private_messages(
  target_conversation_id uuid,
  cursor_created_at timestamptz default null,
  cursor_id uuid default null,
  page_size integer default 30
)
returns table (id uuid, conversation_id uuid, sender_id uuid, client_message_id uuid, body text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_private_conversation_participant(target_conversation_id) then
    raise exception 'conversation unavailable' using errcode = '42501';
  end if;
  if (cursor_created_at is null) <> (cursor_id is null) then
    raise exception 'invalid cursor' using errcode = '22023';
  end if;

  return query
  select message.id, message.conversation_id, message.sender_id,
         message.client_message_id, message.body, message.created_at
  from public.private_messages message
  where message.conversation_id = target_conversation_id
    and (cursor_created_at is null or (message.created_at, message.id) < (cursor_created_at, cursor_id))
  order by message.created_at desc, message.id desc
  limit least(greatest(coalesce(page_size, 30), 1), 50);
end;
$$;

revoke all on function public.create_private_conversation(uuid) from public, anon;
revoke all on function public.send_private_message(uuid, text, uuid) from public, anon;
revoke all on function public.list_private_conversations(integer) from public, anon;
revoke all on function public.list_private_messages(uuid, timestamptz, uuid, integer) from public, anon;
grant execute on function public.create_private_conversation(uuid) to authenticated;
grant execute on function public.send_private_message(uuid, text, uuid) to authenticated;
grant execute on function public.list_private_conversations(integer) to authenticated;
grant execute on function public.list_private_messages(uuid, timestamptz, uuid, integer) to authenticated;

-- Realtime continua sujeito ao SELECT/RLS de cada linha.
alter publication supabase_realtime add table public.private_messages;

commit;
