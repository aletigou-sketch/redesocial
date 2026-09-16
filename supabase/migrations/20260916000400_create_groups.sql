begin;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  image_path text,
  created_by uuid not null default auth.uid() references public.profiles (user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_name_length check (char_length(btrim(name)) between 3 and 80),
  constraint groups_description_length check (char_length(description) <= 500),
  constraint groups_image_path_scope check (image_path is null or image_path like id::text || '/%')
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id),
  constraint group_members_role_check check (role in ('admin', 'member'))
);

create index groups_updated_at_idx on public.groups (updated_at desc);
create index group_members_user_joined_idx on public.group_members (user_id, joined_at desc);
create index group_members_group_role_idx on public.group_members (group_id, role);

create trigger groups_set_updated_at
before update on public.groups
for each row execute function public.set_updated_at();

alter table public.groups enable row level security;
alter table public.groups force row level security;
alter table public.group_members enable row level security;
alter table public.group_members force row level security;

create function public.is_group_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = target_group_id
      and gm.user_id = (select auth.uid())
  );
$$;

create function public.is_group_admin(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = target_group_id
      and gm.user_id = (select auth.uid())
      and gm.role = 'admin'
  );
$$;

revoke all on function public.is_group_member(uuid) from public, anon;
revoke all on function public.is_group_admin(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_admin(uuid) to authenticated;

create policy groups_select_members
on public.groups for select to authenticated
using (public.is_group_member(id));

create policy groups_update_admins
on public.groups for update to authenticated
using (public.is_group_admin(id))
with check (public.is_group_admin(id) and created_by = (select created_by from public.groups existing where existing.id = id));

create policy group_members_select_members
on public.group_members for select to authenticated
using (public.is_group_member(group_id));

create function public.create_group(group_name text, group_description text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_group_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if char_length(btrim(group_name)) not between 3 and 80 or char_length(coalesce(group_description, '')) > 500 then
    raise exception 'invalid group data' using errcode = '22023';
  end if;
  insert into public.groups (name, description, created_by)
  values (btrim(group_name), btrim(coalesce(group_description, '')), (select auth.uid()))
  returning id into new_group_id;
  insert into public.group_members (group_id, user_id, role)
  values (new_group_id, (select auth.uid()), 'admin');
  return new_group_id;
end;
$$;

create function public.join_group(target_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not exists (select 1 from public.groups where id = target_group_id) then raise exception 'group not found' using errcode = 'P0002'; end if;
  insert into public.group_members (group_id, user_id, role)
  values (target_group_id, (select auth.uid()), 'member')
  on conflict (group_id, user_id) do nothing;
end;
$$;

create function public.leave_group(target_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if exists (select 1 from public.groups where id = target_group_id and created_by = (select auth.uid())) then
    raise exception 'creator cannot leave own group' using errcode = '42501';
  end if;
  delete from public.group_members where group_id = target_group_id and user_id = (select auth.uid());
end;
$$;

create function public.delete_owned_group(target_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.groups where id = target_group_id and created_by = (select auth.uid());
end;
$$;

revoke all on function public.create_group(text, text) from public, anon;
revoke all on function public.join_group(uuid) from public, anon;
revoke all on function public.leave_group(uuid) from public, anon;
revoke all on function public.delete_owned_group(uuid) from public, anon;
grant execute on function public.create_group(text, text) to authenticated;
grant execute on function public.join_group(uuid) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.delete_owned_group(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('group-images', 'group-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy group_images_select_members
on storage.objects for select to authenticated
using (
  bucket_id = 'group-images'
  and public.is_group_member(((storage.foldername(name))[1])::uuid)
);

create policy group_images_insert_admins
on storage.objects for insert to authenticated
with check (
  bucket_id = 'group-images'
  and public.is_group_admin(((storage.foldername(name))[1])::uuid)
);

create policy group_images_delete_admins
on storage.objects for delete to authenticated
using (
  bucket_id = 'group-images'
  and public.is_group_admin(((storage.foldername(name))[1])::uuid)
);

commit;
