import { supabase } from '../../shared/supabase/client'

const STORY_BUCKET = 'story-media'
const STORY_MAX_BYTES = 10 * 1024 * 1024
const STORY_DURATION_HOURS = 24
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const STORY_COLUMNS = 'id, owner_id, media_path, media_type, created_at, expires_at, profiles!stories_owner_id_fkey(username, display_name, avatar_path)'

interface StoryProfileRow {
  username: string
  display_name: string
  avatar_path: string | null
}

interface StoryRow {
  id: string
  owner_id: string
  media_path: string
  media_type: string
  created_at: string
  expires_at: string
  profiles: StoryProfileRow | StoryProfileRow[] | null
}

export interface Story {
  id: string
  ownerId: string
  mediaPath: string
  mediaType: string
  mediaUrl: string | null
  createdAt: string
  expiresAt: string
  username: string
  displayName: string
  avatarUrl: string | null
  viewed: boolean
  isOwn: boolean
}

export class StoryServiceError extends Error {
  constructor(
    public readonly code: 'unavailable' | 'session_expired' | 'invalid_file' | 'request_failed',
    message: string,
  ) {
    super(message)
    this.name = 'StoryServiceError'
  }
}

function requireClient() {
  if (!supabase) throw new StoryServiceError('unavailable', 'Stories não estão disponíveis neste ambiente.')
  return supabase
}

async function currentUserId(): Promise<string> {
  const client = requireClient()
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw new StoryServiceError('session_expired', 'Sua sessão expirou. Entre novamente para continuar.')
  return data.user.id
}

function requestFailed(): StoryServiceError {
  return new StoryServiceError('request_failed', 'Não foi possível concluir a operação agora. Tente novamente.')
}

function firstProfile(value: StoryRow['profiles']): StoryProfileRow | null {
  return Array.isArray(value) ? value[0] ?? null : value
}

async function signedMediaUrl(path: string): Promise<string | null> {
  const client = requireClient()
  const { data, error } = await client.storage.from(STORY_BUCKET).createSignedUrl(path, 300)
  return error ? null : data.signedUrl
}

async function signedAvatarUrl(path: string | null): Promise<string | null> {
  if (!path) return null
  const client = requireClient()
  const { data, error } = await client.storage.from('profile-avatars').createSignedUrl(path, 300)
  return error ? null : data.signedUrl
}

export function validateStoryImage(file: File): void {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new StoryServiceError('invalid_file', 'Escolha uma imagem JPG, PNG ou WebP.')
  }
  if (file.size <= 0 || file.size > STORY_MAX_BYTES) {
    throw new StoryServiceError('invalid_file', 'A imagem deve ter conteúdo e no máximo 10 MB.')
  }
}

export async function fetchStories(): Promise<Story[]> {
  const client = requireClient()
  const userId = await currentUserId()
  const { data, error } = await client
    .from('stories')
    .select(STORY_COLUMNS)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true })

  if (error) throw requestFailed()
  const rows = (data ?? []) as unknown as StoryRow[]
  const ids = rows.map((row) => row.id)
  const viewed = new Set<string>()

  if (ids.length) {
    const { data: views, error: viewError } = await client
      .from('story_views')
      .select('story_id')
      .in('story_id', ids)
      .eq('viewer_id', userId)
    if (viewError) throw requestFailed()
    for (const view of views ?? []) viewed.add(view.story_id as string)
  }

  return Promise.all(rows.map(async (row) => {
    const profile = firstProfile(row.profiles)
    return {
      id: row.id,
      ownerId: row.owner_id,
      mediaPath: row.media_path,
      mediaType: row.media_type,
      mediaUrl: await signedMediaUrl(row.media_path),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      username: profile?.username ?? 'perfil',
      displayName: profile?.display_name ?? 'Usuário',
      avatarUrl: await signedAvatarUrl(profile?.avatar_path ?? null),
      viewed: viewed.has(row.id),
      isOwn: row.owner_id === userId,
    }
  }))
}

export async function publishStory(file: File): Promise<void> {
  validateStoryImage(file)
  const client = requireClient()
  const userId = await currentUserId()
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${userId}/${Date.now()}-${crypto.randomUUID()}.${extension}`
  const { error: uploadError } = await client.storage.from(STORY_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  })
  if (uploadError) throw requestFailed()

  const expiresAt = new Date(Date.now() + STORY_DURATION_HOURS * 60 * 60 * 1000).toISOString()
  const { error: insertError } = await client.from('stories').insert({
    media_path: path,
    media_type: file.type,
    expires_at: expiresAt,
  })

  if (insertError) {
    await client.storage.from(STORY_BUCKET).remove([path])
    throw requestFailed()
  }
}

export async function registerStoryView(storyId: string): Promise<void> {
  const client = requireClient()
  await currentUserId()
  const { error } = await client.from('story_views').insert({ story_id: storyId })
  if (error && error.code !== '23505') throw requestFailed()
}
