begin;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (user_id) on delete cascade,
  actor_id uuid references public.profiles (user_id) on delete set null,
  type text not null,
  event_key text not null,
  title text not null,
  body text not null default '',
  context_type text,
  context_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type_check check (type in ('new_message', 'incoming_call', 'missed_call', 'group_activity', 'story_activity')),
  constraint notifications_title_length check (char_length(btrim(title)) between 1 and 160),
  constraint notifications_body_length check (char_length(body) <= 500),
  constraint notifications_event_key_length check (char_length(event_key) between 1 and 200),
  constraint notifications_context_check check (
    (context_type is null and context_id is null)
    or (context_type in ('conversation', 'group', 'story') and context_id is not null)
  )
);

create unique index notifications_recipient_event_unique_idx
  on public.notifications (recipient_id, event_key);
create index notifications_recipient_unread_created_idx
  on public.notifications (recipient_id, (read_at is null), created_at desc, id desc);

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

create policy notifications_select_own
on public.notifications for select to authenticated
using ((select auth.uid()) = recipient_id);

create policy notifications_update_own
on public.notifications for update to authenticated
using ((select auth.uid()) = recipient_id)
with check ((select auth.uid()) = recipient_id);

create function public.protect_notification_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.recipient_id is distinct from old.recipient_id
     or new.actor_id is distinct from old.actor_id
     or new.type is distinct from old.type
     or new.event_key is distinct from old.event_key
     or new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.context_type is distinct from old.context_type
     or new.context_id is distinct from old.context_id
     or new.created_at is distinct from old.created_at then
    raise exception 'notification content is immutable' using errcode = '42501';
  end if;
  if old.read_at is not null and new.read_at is distinct from old.read_at then
    raise exception 'notification cannot become unread' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger notifications_protect_identity
before update on public.notifications
for each row execute function public.protect_notification_identity();

create function public.create_notification(
  target_recipient uuid,
  notification_type text,
  notification_event_key text,
  notification_title text,
  notification_body text default '',
  notification_context_type text default null,
  notification_context_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  notification_id uuid;
begin
  if caller is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if target_recipient is null or target_recipient = caller then raise exception 'invalid recipient' using errcode = '22023'; end if;

  if notification_type = 'new_message' then
    if notification_context_type <> 'conversation'
       or not exists (
         select 1 from public.private_conversations conversation
         where conversation.id = notification_context_id
           and caller in (conversation.participant_one, conversation.participant_two)
           and target_recipient in (conversation.participant_one, conversation.participant_two)
       ) then raise exception 'conversation unavailable' using errcode = '42501'; end if;
  elsif notification_type = 'group_activity' then
    if notification_context_type <> 'group'
       or not exists (
         select 1 from public.group_members caller_member
         join public.group_members recipient_member on recipient_member.group_id = caller_member.group_id
         where caller_member.group_id = notification_context_id
           and caller_member.user_id = caller
           and recipient_member.user_id = target_recipient
       ) then raise exception 'group unavailable' using errcode = '42501'; end if;
  elsif notification_type in ('incoming_call', 'missed_call') then
    if notification_context_type <> 'conversation'
       or not exists (
         select 1 from public.private_conversations conversation
         where conversation.id = notification_context_id
           and caller in (conversation.participant_one, conversation.participant_two)
           and target_recipient in (conversation.participant_one, conversation.participant_two)
       ) then raise exception 'conversation unavailable' using errcode = '42501'; end if;
  elsif notification_type = 'story_activity' then
    if notification_context_type <> 'story'
       or not exists (
         select 1 from public.stories story
         where story.id = notification_context_id and story.owner_id = target_recipient
       ) then raise exception 'story unavailable' using errcode = '42501'; end if;
  else
    raise exception 'invalid notification type' using errcode = '22023';
  end if;

  insert into public.notifications (
    recipient_id, actor_id, type, event_key, title, body, context_type, context_id
  ) values (
    target_recipient, caller, notification_type, notification_event_key,
    btrim(notification_title), btrim(coalesce(notification_body, '')),
    notification_context_type, notification_context_id
  )
  on conflict (recipient_id, event_key) do update
    set event_key = excluded.event_key
  returning id into notification_id;

  return notification_id;
end;
$$;

create function public.mark_notification_read(target_notification_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = target_notification_id and recipient_id = (select auth.uid());
$$;

create function public.mark_all_notifications_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
  set read_at = now()
  where recipient_id = (select auth.uid()) and read_at is null;
$$;

revoke all on function public.create_notification(uuid, text, text, text, text, text, uuid) from public, anon;
revoke all on function public.mark_notification_read(uuid) from public, anon;
revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.create_notification(uuid, text, text, text, text, text, uuid) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

alter publication supabase_realtime add table public.notifications;

commit;
