begin;

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  media_path text not null,
  media_type text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint stories_owner_identity check (owner_id = auth.uid()),
  constraint stories_media_path_owner check (media_path like owner_id::text || '/%'),
  constraint stories_media_type_check check (media_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint stories_expiration_check check (expires_at > created_at and expires_at <= created_at + interval '24 hours')
);

create index stories_active_created_at_idx on public.stories (created_at) where expires_at > created_at;
create index stories_owner_created_at_idx on public.stories (owner_id, created_at desc);

create table public.story_views (
  story_id uuid not null references public.stories (id) on delete cascade,
  viewer_id uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id),
  constraint story_views_viewer_identity check (viewer_id = auth.uid())
);

alter table public.stories enable row level security;
alter table public.stories force row level security;
alter table public.story_views enable row level security;
alter table public.story_views force row level security;

create policy stories_select_available
on public.stories for select to authenticated
using (
  expires_at > now()
  and (
    owner_id = (select auth.uid())
    or (
      exists (select 1 from public.profiles p where p.user_id = owner_id and p.is_discoverable)
      and not public.is_blocked_between(owner_id)
    )
  )
);

create policy stories_insert_own
on public.stories for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and media_path like (select auth.uid())::text || '/%'
  and expires_at > now()
  and expires_at <= now() + interval '24 hours 5 minutes'
);

create policy stories_delete_own
on public.stories for delete to authenticated
using (owner_id = (select auth.uid()));

create policy story_views_select_own
on public.story_views for select to authenticated
using (viewer_id = (select auth.uid()));

create policy story_views_insert_own
on public.story_views for insert to authenticated
with check (
  viewer_id = (select auth.uid())
  and exists (select 1 from public.stories s where s.id = story_id and s.expires_at > now())
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('story-media', 'story-media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy story_media_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'story-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy story_media_select_authorized
on storage.objects for select to authenticated
using (
  bucket_id = 'story-media'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.stories s
      where s.media_path = name
        and s.expires_at > now()
        and exists (select 1 from public.profiles p where p.user_id = s.owner_id and p.is_discoverable)
        and not public.is_blocked_between(s.owner_id)
    )
  )
);

create policy story_media_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'story-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

commit;
