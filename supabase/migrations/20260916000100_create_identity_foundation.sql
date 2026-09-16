begin;

-- Fundação de identidade do Hi You!. O Supabase Auth permanece como única
-- fonte de autenticação; nenhuma senha ou credencial é armazenada em public.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text not null,
  bio text,
  avatar_path text,
  is_discoverable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (
    username = lower(username)
    and username ~ '^[a-z0-9_]{3,30}$'
  ),
  constraint profiles_display_name_length check (
    char_length(btrim(display_name)) between 1 and 80
  ),
  constraint profiles_bio_length check (
    bio is null or char_length(bio) <= 500
  ),
  constraint profiles_avatar_path_owner check (
    avatar_path is null
    or avatar_path like user_id::text || '/%'
  )
);

comment on table public.profiles is
  'Superfície de perfil sem dados privados; auth.users é a fonte de identidade.';
comment on column public.profiles.avatar_path is
  'Caminho relativo no bucket privado profile-avatars, nunca uma credencial ou URL assinada.';

create unique index profiles_username_unique_idx
  on public.profiles (lower(username));
create index profiles_discoverable_created_at_idx
  on public.profiles (created_at desc)
  where is_discoverable = true;

create table public.privacy_settings (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  allow_direct_messages boolean not null default false,
  show_activity_status boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.privacy_settings is
  'Preferências privadas, legíveis e alteráveis somente pelo próprio usuário.';

create table public.user_blocks (
  blocker_id uuid not null references public.profiles (user_id) on delete cascade,
  blocked_id uuid not null references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_distinct_users check (blocker_id <> blocked_id)
);

comment on table public.user_blocks is
  'Relações privadas de bloqueio; somente quem bloqueou administra sua lista.';

create index user_blocks_blocked_id_idx
  on public.user_blocks (blocked_id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger privacy_settings_set_updated_at
before update on public.privacy_settings
for each row execute function public.set_updated_at();

-- O cadastro em auth.users provisiona perfil e privacidade na mesma transação.
-- A identidade e o username inicial derivam exclusivamente do UUID criado pelo
-- Auth; metadados enviados pelo cliente não controlam user_id nem privilégios.
create function public.provision_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, username, display_name)
  values (
    new.id,
    'u_' || left(replace(new.id::text, '-', ''), 28),
    'Novo usuário'
  );

  insert into public.privacy_settings (user_id)
  values (new.id);

  return new;
end;
$$;

revoke all on function public.provision_user_profile() from public;
revoke all on function public.provision_user_profile() from anon;
revoke all on function public.provision_user_profile() from authenticated;

create trigger auth_user_provision_profile
after insert on auth.users
for each row execute function public.provision_user_profile();

-- A função é necessária para policies que devem considerar bloqueios nas duas
-- direções sem revelar ao usuário quem o bloqueou. O search_path é fixado e a
-- execução é concedida apenas ao papel authenticated.
create function public.is_blocked_between(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and other_user is not null
    and exists (
      select 1
      from public.user_blocks
      where (blocker_id = (select auth.uid()) and blocked_id = other_user)
         or (blocker_id = other_user and blocked_id = (select auth.uid()))
    );
$$;

revoke all on function public.is_blocked_between(uuid) from public;
revoke all on function public.is_blocked_between(uuid) from anon;
grant execute on function public.is_blocked_between(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.privacy_settings enable row level security;
alter table public.privacy_settings force row level security;
alter table public.user_blocks enable row level security;
alter table public.user_blocks force row level security;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy profiles_select_discoverable
on public.profiles
for select
to authenticated
using (
  is_discoverable
  and (select auth.uid()) is not null
  and not public.is_blocked_between(user_id)
);

create policy profiles_update_own
on public.profiles
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy profiles_delete_own
on public.profiles
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy privacy_settings_select_own
on public.privacy_settings
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy privacy_settings_update_own
on public.privacy_settings
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy privacy_settings_delete_own
on public.privacy_settings
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy user_blocks_select_own
on public.user_blocks
for select
to authenticated
using ((select auth.uid()) = blocker_id);

create policy user_blocks_insert_own
on public.user_blocks
for insert
to authenticated
with check ((select auth.uid()) = blocker_id);

create policy user_blocks_delete_own
on public.user_blocks
for delete
to authenticated
using ((select auth.uid()) = blocker_id);

-- Bucket privado para avatares. O primeiro segmento do caminho deve ser o UUID
-- do proprietário. Não existe policy para anon nem leitura pública do bucket.
insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', false)
on conflict (id) do update
set public = excluded.public;

create policy profile_avatars_select_own
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy profile_avatars_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy profile_avatars_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy profile_avatars_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

commit;
