begin;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (user_id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  category text not null,
  description text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_target_type_check check (target_type in ('profile', 'story', 'group', 'message')),
  constraint reports_category_check check (category in ('spam', 'harassment', 'hate_speech', 'violence', 'sexual_content', 'impersonation', 'privacy', 'other')),
  constraint reports_description_length check (description is null or char_length(description) between 1 and 1000),
  constraint reports_status_check check (status in ('open', 'in_review', 'resolved', 'closed'))
);

comment on table public.reports is
  'Denúncias privadas. O cliente cria denúncias próprias, mas não lê dados internos nem altera o fluxo de análise.';

create index reports_reporter_created_idx
  on public.reports (reporter_id, created_at desc, id desc);
create index reports_status_created_idx
  on public.reports (status, created_at asc, id asc);
create index reports_target_idx
  on public.reports (target_type, target_id, created_at desc);
create unique index reports_active_duplicate_idx
  on public.reports (reporter_id, target_type, target_id, category)
  where status in ('open', 'in_review');

create trigger reports_set_updated_at
before update on public.reports
for each row execute function public.set_updated_at();

alter table public.reports enable row level security;
alter table public.reports force row level security;

-- Não há policy de SELECT/UPDATE/DELETE para usuários comuns. Isso evita
-- revelar estado interno, identidade de denunciantes ou dados de triagem.

create function public.create_report(
  report_target_type text,
  report_target_id uuid,
  report_category text,
  report_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  normalized_description text := nullif(btrim(report_description), '');
  report_id uuid;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if report_target_type not in ('profile', 'story', 'group', 'message')
     or report_category not in ('spam', 'harassment', 'hate_speech', 'violence', 'sexual_content', 'impersonation', 'privacy', 'other')
     or report_target_id is null
     or char_length(coalesce(normalized_description, '')) > 1000 then
    raise exception 'invalid report' using errcode = '22023';
  end if;

  if report_target_type = 'profile' then
    if report_target_id = caller or not exists (
      select 1 from public.profiles profile
      where profile.user_id = report_target_id
        and profile.is_discoverable
        and not public.is_blocked_between(profile.user_id)
    ) then raise exception 'target unavailable' using errcode = '42501'; end if;
  elsif report_target_type = 'story' then
    if not exists (
      select 1 from public.stories story
      where story.id = report_target_id
        and story.owner_id <> caller
        and story.expires_at > now()
        and not public.is_blocked_between(story.owner_id)
    ) then raise exception 'target unavailable' using errcode = '42501'; end if;
  elsif report_target_type = 'group' then
    if not exists (
      select 1 from public.group_members member
      where member.group_id = report_target_id and member.user_id = caller
    ) then raise exception 'target unavailable' using errcode = '42501'; end if;
  else
    if not exists (
      select 1
      from public.private_messages message
      join public.private_conversations conversation on conversation.id = message.conversation_id
      where message.id = report_target_id
        and message.sender_id <> caller
        and caller in (conversation.participant_one, conversation.participant_two)
    ) then raise exception 'target unavailable' using errcode = '42501'; end if;
  end if;

  insert into public.reports (reporter_id, target_type, target_id, category, description)
  values (caller, report_target_type, report_target_id, report_category, normalized_description)
  on conflict (reporter_id, target_type, target_id, category)
    where status in ('open', 'in_review')
  do update set reporter_id = excluded.reporter_id
  returning id into report_id;

  return report_id;
end;
$$;

create function public.block_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid());
begin
  if caller is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if target_user_id is null or target_user_id = caller then
    raise exception 'invalid user' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where user_id = target_user_id) then
    raise exception 'user unavailable' using errcode = '42501';
  end if;
  insert into public.user_blocks (blocker_id, blocked_id)
  values (caller, target_user_id)
  on conflict (blocker_id, blocked_id) do nothing;
end;
$$;

create function public.unblock_user(target_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.user_blocks
  where blocker_id = (select auth.uid()) and blocked_id = target_user_id;
$$;

revoke all on function public.create_report(text, uuid, text, text) from public, anon;
revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
grant execute on function public.create_report(text, uuid, text, text) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;

-- Bloqueios passam a valer também em conversas já existentes.
drop policy if exists private_conversations_select_participants on public.private_conversations;
create policy private_conversations_select_participants
on public.private_conversations for select to authenticated
using (
  (select auth.uid()) in (participant_one, participant_two)
  and not public.is_blocked_between(
    case when participant_one = (select auth.uid()) then participant_two else participant_one end
  )
);

drop policy if exists private_messages_select_participants on public.private_messages;
create policy private_messages_select_participants
on public.private_messages for select to authenticated
using (
  exists (
    select 1 from public.private_conversations conversation
    where conversation.id = conversation_id
      and (select auth.uid()) in (conversation.participant_one, conversation.participant_two)
      and not public.is_blocked_between(
        case when conversation.participant_one = (select auth.uid()) then conversation.participant_two else conversation.participant_one end
      )
  )
);

create or replace function public.is_private_conversation_participant(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.private_conversations conversation
    where conversation.id = target_conversation_id
      and (select auth.uid()) in (conversation.participant_one, conversation.participant_two)
      and not public.is_blocked_between(
        case when conversation.participant_one = (select auth.uid()) then conversation.participant_two else conversation.participant_one end
      )
  );
$$;

create or replace function public.list_private_conversations(page_size integer default 30)
returns table (id uuid, other_user_id uuid, other_username text, other_display_name text, updated_at timestamptz, last_message_body text, last_message_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select conversation.id,
    case when conversation.participant_one = (select auth.uid()) then conversation.participant_two else conversation.participant_one end,
    profile.username, profile.display_name, conversation.updated_at, latest.body, latest.created_at
  from public.private_conversations conversation
  join public.profiles profile on profile.user_id = case
    when conversation.participant_one = (select auth.uid()) then conversation.participant_two else conversation.participant_one end
  left join lateral (
    select message.body, message.created_at from public.private_messages message
    where message.conversation_id = conversation.id
    order by message.created_at desc, message.id desc limit 1
  ) latest on true
  where (select auth.uid()) in (conversation.participant_one, conversation.participant_two)
    and not public.is_blocked_between(profile.user_id)
  order by conversation.updated_at desc, conversation.id desc
  limit least(greatest(coalesce(page_size, 30), 1), 50);
$$;

-- Presença e chamadas também deixam de autorizar contextos entre bloqueados.
create or replace function public.can_access_call_topic(target_topic text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare caller uuid := (select auth.uid()); conversation_id uuid; other_user uuid;
begin
  if caller is null or target_topic !~ '^call:conversation:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false; end if;
  conversation_id := split_part(target_topic, ':', 3)::uuid;
  select case when participant_one = caller then participant_two else participant_one end into other_user
  from public.private_conversations where id = conversation_id and caller in (participant_one, participant_two);
  return other_user is not null and not public.is_blocked_between(other_user);
exception when invalid_text_representation then return false;
end;
$$;

create or replace function public.can_access_presence_topic(target_topic text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare caller uuid := (select auth.uid()); target_id uuid; other_user uuid;
begin
  if caller is null or target_topic is null then return false; end if;
  if target_topic ~ '^presence:conversation:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    target_id := split_part(target_topic, ':', 3)::uuid;
    select case when participant_one = caller then participant_two else participant_one end into other_user
    from public.private_conversations where id = target_id and caller in (participant_one, participant_two);
    return other_user is not null and not public.is_blocked_between(other_user);
  end if;
  if target_topic ~ '^presence:group:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    target_id := split_part(target_topic, ':', 3)::uuid;
    return exists (select 1 from public.group_members where group_id = target_id and user_id = caller);
  end if;
  return false;
exception when invalid_text_representation then return false;
end;
$$;

-- Notificações de interações bloqueadas não podem ser criadas.
create or replace function public.create_notification(
  target_recipient uuid, notification_type text, notification_event_key text,
  notification_title text, notification_body text default '',
  notification_context_type text default null, notification_context_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare caller uuid := (select auth.uid()); notification_id uuid;
begin
  if caller is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if target_recipient is null or target_recipient = caller or public.is_blocked_between(target_recipient) then
    raise exception 'invalid recipient' using errcode = '42501';
  end if;
  if notification_type in ('new_message', 'incoming_call', 'missed_call') then
    if notification_context_type <> 'conversation' or not exists (
      select 1 from public.private_conversations c where c.id = notification_context_id
      and caller in (c.participant_one,c.participant_two) and target_recipient in (c.participant_one,c.participant_two)
    ) then raise exception 'conversation unavailable' using errcode = '42501'; end if;
  elsif notification_type = 'group_activity' then
    if notification_context_type <> 'group' or not exists (
      select 1 from public.group_members a join public.group_members b on b.group_id=a.group_id
      where a.group_id=notification_context_id and a.user_id=caller and b.user_id=target_recipient
    ) then raise exception 'group unavailable' using errcode = '42501'; end if;
  elsif notification_type = 'story_activity' then
    if notification_context_type <> 'story' or not exists (
      select 1 from public.stories where id=notification_context_id and owner_id=target_recipient
    ) then raise exception 'story unavailable' using errcode = '42501'; end if;
  else raise exception 'invalid notification type' using errcode = '22023'; end if;
  insert into public.notifications(recipient_id,actor_id,type,event_key,title,body,context_type,context_id)
  values(target_recipient,caller,notification_type,notification_event_key,btrim(notification_title),btrim(coalesce(notification_body,'')),notification_context_type,notification_context_id)
  on conflict(recipient_id,event_key) do update set event_key=excluded.event_key returning id into notification_id;
  return notification_id;
end;
$$;

commit;
