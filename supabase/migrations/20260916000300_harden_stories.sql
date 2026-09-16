begin;

-- O índice parcial anterior usa uma condição invariável para registros válidos.
-- Este índice atende diretamente à filtragem de expiração das consultas e RLS.
drop index if exists public.stories_active_created_at_idx;
create index if not exists stories_expires_created_at_idx
  on public.stories (expires_at, created_at);

-- Até o proprietário deve acessar a mídia apenas enquanto existir um Story
-- ativo correspondente. Uploads não dependem de SELECT e continuam autorizados
-- exclusivamente pela policy de INSERT vinculada à pasta de auth.uid().
drop policy if exists story_media_select_authorized on storage.objects;
create policy story_media_select_authorized
on storage.objects for select to authenticated
using (
  bucket_id = 'story-media'
  and exists (
    select 1
    from public.stories s
    where s.media_path = name
      and s.expires_at > now()
      and (
        s.owner_id = (select auth.uid())
        or (
          exists (
            select 1
            from public.profiles p
            where p.user_id = s.owner_id
              and p.is_discoverable
          )
          and not public.is_blocked_between(s.owner_id)
        )
      )
  )
);

commit;
