begin;

-- Presence usa canais privados efêmeros. A autorização do tópico deriva da
-- sessão e da participação real; nenhum estado de atividade é persistido.
create function public.can_access_presence_topic(target_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_id uuid;
begin
  if caller is null or target_topic is null then return false; end if;

  if target_topic ~ '^presence:conversation:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    target_id := split_part(target_topic, ':', 3)::uuid;
    return exists (
      select 1 from public.private_conversations conversation
      where conversation.id = target_id
        and caller in (conversation.participant_one, conversation.participant_two)
    );
  end if;

  if target_topic ~ '^presence:group:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    target_id := split_part(target_topic, ':', 3)::uuid;
    return exists (
      select 1 from public.group_members member
      where member.group_id = target_id and member.user_id = caller
    );
  end if;

  return false;
exception when invalid_text_representation then
  return false;
end;
$$;

revoke all on function public.can_access_presence_topic(text) from public, anon;
grant execute on function public.can_access_presence_topic(text) to authenticated;

create policy realtime_presence_read_authorized_context
on realtime.messages
for select
to authenticated
using (
  extension in ('presence')
  and public.can_access_presence_topic(realtime.topic())
);

create policy realtime_presence_write_authorized_context
on realtime.messages
for insert
to authenticated
with check (
  extension in ('presence')
  and public.can_access_presence_topic(realtime.topic())
);

commit;
