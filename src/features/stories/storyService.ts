import { supabase } from '../../shared/supabase/client'

const STORY_BUCKET = 'story-media'
const STORY_MAX_BYTES = 10 * 1024 * 1024
const STORY_DURATION_HOURS = 24
const SIGNED_URL_TTL_SECONDS = 300
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

async function signedUrl(bucket: string, path: string): Promise<string | null> {
  const client = requireClient()
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  return error ? null : data.signedUrl
}

function hasExpectedSignature(type: string, bytes: Uint8Array): boolean {
  if (type === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (type === 'image/png') {
    return bytes.length >= 8
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  }
  if (type === 'image/webp') {
    return bytes.length >= 12
      && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  }
  return false
}

export async function validateStoryImage(file: File): Promise<void> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new StoryServiceError('invalid_file', 'Escolha uma imagem JPG, PNG ou WebP.')
  }
  if (file.size <= 0 || file.size > STORY_MAX_BYTES) {
    throw new StoryServiceError('invalid_file', 'A imagem deve ter conteúdo e no máximo 10 MB.')
  }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  } catch {
    throw new StoryServiceError('invalid_file', 'Não foi possível ler a imagem selecionada.')
  }

  if (!hasExpectedSignature(file.type, bytes)) {
    throw new StoryServiceError('invalid_file', 'O conteúdo do arquivo não corresponde ao formato informado.')
  }
}

export async function fetchStories(): Promise<Story[]> {
  const client = requireClient()
  const userId = await currentUserId()
  const now = new Date().toISOString()
  const { data, error } = await client
    .from('stories')
    .select(STORY_COLUMNS)
    .gt('expires_at', now)
    .order('created_at', { ascending: true })

  if (error) throw requestFailed()
  const rows = ((data ?? []) as unknown as StoryRow[]).filter((row) => row.expires_at > now)
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

  const mediaUrls = new Map<string, Promise<string | null>>()
  const avatarUrls = new Map<string, Promise<string | null>>()
  const mediaUrlFor = (path: string) => {
    const existing = mediaUrls.get(path)
    if (existing) return existing
    const pending = signedUrl(STORY_BUCKET, path)
    mediaUrls.set(path, pending)
    return pending
  }
  const avatarUrlFor = (path: string | null) => {
    if (!path) return Promise.resolve(null)
    const existing = avatarUrls.get(path)
    if (existing) return existing
    const pending = signedUrl('profile-avatars', path)
    avatarUrls.set(path, pending)
    return pending
  }

  return Promise.all(rows.map(async (row) => {
    const profile = firstProfile(row.profiles)
    const [mediaUrl, avatarUrl] = await Promise.all([
      mediaUrlFor(row.media_path),
      avatarUrlFor(profile?.avatar_path ?? null),
    ])
    return {
      id: row.id,
      ownerId: row.owner_id,
      mediaPath: row.media_path,
      mediaType: row.media_type,
      mediaUrl,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      username: profile?.username ?? 'perfil',
      displayName: profile?.display_name ?? 'Usuário',
      avatarUrl,
      viewed: viewed.has(row.id),
      isOwn: row.owner_id === userId,
    }
  }))
}

export async function publishStory(file: File): Promise<void> {
  await validateStoryImage(file)
  const client = requireClient()
  const userId = await currentUserId()
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${userId}/${crypto.randomUUID()}.${extension}`
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
    const { error: cleanupError } = await client.storage.from(STORY_BUCKET).remove([path])
    if (cleanupError) {
      throw new StoryServiceError('request_failed', 'A publicação falhou e a mídia enviada pode exigir limpeza operacional.')
    }
    throw requestFailed()
  }
}

export async function registerStoryView(storyId: string): Promise<void> {
  const client = requireClient()
  await currentUserId()
  const { error } = await client.from('story_views').insert({ story_id: storyId })
  if (error && error.code !== '23505') throw requestFailed()
}
