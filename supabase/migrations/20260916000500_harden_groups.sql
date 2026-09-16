begin;

-- Campos de identidade e autoria de um grupo são imutáveis mesmo que uma
-- policy futura conceda UPDATE mais amplo por engano.
create function public.protect_group_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'group identity is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger groups_protect_identity
before update on public.groups
for each row execute function public.protect_group_identity();

-- O vínculo administrativo do criador é uma invariável do domínio. A proteção
-- vale também para operações privilegiadas acidentais, não apenas para a UI.
create function public.protect_group_creator_membership()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  owner_id uuid;
begin
  select created_by into owner_id
  from public.groups
  where id = old.group_id;

  if old.user_id = owner_id and (
    tg_op = 'DELETE'
    or new.group_id is distinct from old.group_id
    or new.user_id is distinct from old.user_id
    or new.role is distinct from 'admin'
  ) then
    raise exception 'creator membership is immutable' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger group_members_protect_creator
before update or delete on public.group_members
for each row execute function public.protect_group_creator_membership();

-- A autoria é protegida pelo trigger acima; a policy não consulta novamente a
-- própria tabela durante o WITH CHECK.
drop policy if exists groups_update_admins on public.groups;
create policy groups_update_admins
on public.groups for update to authenticated
using (public.is_group_admin(id))
with check (public.is_group_admin(id));

-- Serializa tentativas concorrentes da mesma sessão para o mesmo grupo e não
-- distingue externamente UUID inexistente de UUID inacessível.
create or replace function public.join_group(target_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended((select auth.uid())::text || ':' || target_group_id::text, 0));

  begin
    insert into public.group_members (group_id, user_id, role)
    values (target_group_id, (select auth.uid()), 'member')
    on conflict (group_id, user_id) do nothing;
  exception
    when foreign_key_violation then
      raise exception 'group unavailable' using errcode = '42501';
  end;
end;
$$;

create or replace function public.leave_group(target_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended((select auth.uid())::text || ':' || target_group_id::text, 0));

  if exists (
    select 1 from public.groups
    where id = target_group_id
      and created_by = (select auth.uid())
  ) then
    raise exception 'creator cannot leave own group' using errcode = '42501';
  end if;

  delete from public.group_members
  where group_id = target_group_id
    and user_id = (select auth.uid());
end;
$$;

revoke all on function public.join_group(uuid) from public, anon;
revoke all on function public.leave_group(uuid) from public, anon;
grant execute on function public.join_group(uuid) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;

-- Caminhos malformados deixam de provocar cast UUID durante a avaliação das
-- policies de Storage.
drop policy if exists group_images_select_members on storage.objects;
create policy group_images_select_members
on storage.objects for select to authenticated
using (
  bucket_id = 'group-images'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_group_member(((storage.foldername(name))[1])::uuid)
    else false
  end
);

drop policy if exists group_images_insert_admins on storage.objects;
create policy group_images_insert_admins
on storage.objects for insert to authenticated
with check (
  bucket_id = 'group-images'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_group_admin(((storage.foldername(name))[1])::uuid)
    else false
  end
);

drop policy if exists group_images_delete_admins on storage.objects;
create policy group_images_delete_admins
on storage.objects for delete to authenticated
using (
  bucket_id = 'group-images'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_group_admin(((storage.foldername(name))[1])::uuid)
    else false
  end
);

commit;
