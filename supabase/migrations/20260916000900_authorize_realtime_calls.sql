begin;

-- Sinalização efêmera de chamadas privadas. SDP e ICE passam somente por
-- Broadcast privado e não são persistidos em tabelas da aplicação.
create function public.can_access_call_topic(target_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  conversation_id uuid;
begin
  if caller is null or target_topic is null then return false; end if;
  if target_topic !~ '^call:conversation:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;

  conversation_id := split_part(target_topic, ':', 3)::uuid;
  return exists (
    select 1
    from public.private_conversations conversation
    where conversation.id = conversation_id
      and caller in (conversation.participant_one, conversation.participant_two)
  );
exception when invalid_text_representation then
  return false;
end;
$$;

revoke all on function public.can_access_call_topic(text) from public, anon;
grant execute on function public.can_access_call_topic(text) to authenticated;

create policy realtime_call_signaling_read_participants
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and public.can_access_call_topic(realtime.topic())
);

create policy realtime_call_signaling_write_participants
on realtime.messages
for insert
to authenticated
with check (
  extension = 'broadcast'
  and public.can_access_call_topic(realtime.topic())
);

commit;
