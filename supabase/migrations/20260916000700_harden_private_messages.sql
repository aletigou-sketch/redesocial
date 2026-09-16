begin;

-- Impede que uma chave idempotente reutilizada com outro conteúdo ou conversa
-- seja tratada como confirmação válida da tentativa original.
create or replace function public.send_private_message(
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
  existing_message public.private_messages%rowtype;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if target_conversation_id is null
     or retry_id is null
     or char_length(normalized_body) not between 1 and 4000 then
    raise exception 'invalid message' using errcode = '22023';
  end if;
  if not public.is_private_conversation_participant(target_conversation_id) then
    raise exception 'conversation unavailable' using errcode = '42501';
  end if;

  select message.*
  into existing_message
  from public.private_messages message
  where message.sender_id = caller
    and message.client_message_id = retry_id;

  if found then
    if existing_message.conversation_id <> target_conversation_id
       or existing_message.body <> normalized_body then
      raise exception 'retry key already used for another message' using errcode = '22023';
    end if;

    return query
    select existing_message.id, existing_message.conversation_id,
           existing_message.sender_id, existing_message.client_message_id,
           existing_message.body, existing_message.created_at;
    return;
  end if;

  insert into public.private_messages (conversation_id, sender_id, client_message_id, body)
  values (target_conversation_id, caller, retry_id, normalized_body)
  on conflict (sender_id, client_message_id) do nothing;

  select message.*
  into existing_message
  from public.private_messages message
  where message.sender_id = caller
    and message.client_message_id = retry_id;

  if existing_message.conversation_id <> target_conversation_id
     or existing_message.body <> normalized_body then
    raise exception 'retry key already used for another message' using errcode = '22023';
  end if;

  update public.private_conversations
  set updated_at = greatest(public.private_conversations.updated_at, existing_message.created_at)
  where public.private_conversations.id = target_conversation_id;

  return query
  select existing_message.id, existing_message.conversation_id,
         existing_message.sender_id, existing_message.client_message_id,
         existing_message.body, existing_message.created_at;
end;
$$;

revoke all on function public.send_private_message(uuid, text, uuid) from public, anon;
grant execute on function public.send_private_message(uuid, text, uuid) to authenticated;

commit;
