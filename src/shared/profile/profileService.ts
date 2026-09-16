import { supabase } from '../supabase/client'

const AVATAR_BUCKET = 'profile-avatars'
const AVATAR_MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const PROFILE_COLUMNS = 'user_id, username, display_name, bio, avatar_path, is_discoverable, created_at, updated_at'

export interface Profile {
  user_id: string
  username: string
  display_name: string
  bio: string | null
  avatar_path: string | null
  is_discoverable: boolean
  created_at: string
  updated_at: string
}

export interface ProfileInput {
  username: string
  display_name: string
  bio: string | null
  is_discoverable: boolean
}

export class ProfileServiceError extends Error {
  constructor(
    public readonly code: 'unavailable' | 'session_expired' | 'not_found' | 'conflict' | 'invalid_profile' | 'invalid_avatar' | 'request_failed',
    message: string,
  ) {
    super(message)
    this.name = 'ProfileServiceError'
  }
}

function requireClient() {
  if (!supabase) {
    throw new ProfileServiceError('unavailable', 'O serviço de perfil não está disponível neste ambiente.')
  }
  return supabase
}

async function currentUserId(): Promise<string> {
  const client = requireClient()
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) {
    throw new ProfileServiceError('session_expired', 'Sua sessão expirou. Entre novamente para continuar.')
  }
  return data.user.id
}

function mapRequestError(error: { code?: string; message?: string }): ProfileServiceError {
  if (error.code === '23505') {
    return new ProfileServiceError('conflict', 'Este nome de usuário já está em uso.')
  }
  return new ProfileServiceError('request_failed', 'Não foi possível concluir a operação agora. Tente novamente.')
}

function normalizeProfileInput(input: ProfileInput): ProfileInput {
  const username = input.username.trim().toLowerCase()
  const displayName = input.display_name.trim()
  const bio = input.bio?.trim() || null

  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    throw new ProfileServiceError('invalid_profile', 'O nome de usuário informado é inválido.')
  }
  if (displayName.length < 1 || displayName.length > 80) {
    throw new ProfileServiceError('invalid_profile', 'O nome de exibição deve ter entre 1 e 80 caracteres.')
  }
  if (bio && bio.length > 500) {
    throw new ProfileServiceError('invalid_profile', 'A bio deve ter no máximo 500 caracteres.')
  }

  return {
    username,
    display_name: displayName,
    bio,
    is_discoverable: Boolean(input.is_discoverable),
  }
}

function belongsToUser(path: string, userId: string): boolean {
  return path.startsWith(`${userId}/`) && !path.slice(userId.length + 1).includes('/')
}

export async function fetchOwnProfile(): Promise<Profile> {
  const client = requireClient()
  const userId = await currentUserId()
  const { data, error } = await client
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw mapRequestError(error)
  if (!data) throw new ProfileServiceError('not_found', 'Seu perfil ainda não está disponível.')
  return data as Profile
}

export async function updateOwnProfile(input: ProfileInput, avatarPath?: string | null): Promise<Profile> {
  const client = requireClient()
  const userId = await currentUserId()
  const normalizedInput = normalizeProfileInput(input)

  if (avatarPath !== undefined && avatarPath !== null && !belongsToUser(avatarPath, userId)) {
    throw new ProfileServiceError('invalid_avatar', 'O caminho do avatar não pertence à conta autenticada.')
  }

  const changes = avatarPath === undefined
    ? normalizedInput
    : { ...normalizedInput, avatar_path: avatarPath }
  const { data, error } = await client
    .from('profiles')
    .update(changes)
    .eq('user_id', userId)
    .select(PROFILE_COLUMNS)
    .maybeSingle()

  if (error) throw mapRequestError(error)
  if (!data) throw new ProfileServiceError('not_found', 'Seu perfil não foi encontrado para atualização.')
  return data as Profile
}

export function validateAvatar(file: File): void {
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
    throw new ProfileServiceError('invalid_avatar', 'Escolha uma imagem JPG, PNG ou WebP.')
  }
  if (file.size <= 0 || file.size > AVATAR_MAX_BYTES) {
    throw new ProfileServiceError('invalid_avatar', 'A imagem deve ter conteúdo e no máximo 5 MB.')
  }
}

export async function uploadOwnAvatar(file: File): Promise<string> {
  validateAvatar(file)
  const client = requireClient()
  const userId = await currentUserId()
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${userId}/avatar-${Date.now()}-${crypto.randomUUID()}.${extension}`
  const { error } = await client.storage.from(AVATAR_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  })
  if (error) throw mapRequestError(error)
  return path
}

export async function removeOwnAvatarObject(path: string): Promise<void> {
  const client = requireClient()
  const userId = await currentUserId()
  if (!belongsToUser(path, userId)) return
  const { error } = await client.storage.from(AVATAR_BUCKET).remove([path])
  if (error) throw mapRequestError(error)
}

export async function createOwnAvatarUrl(path: string | null): Promise<string | null> {
  if (!path) return null
  const client = requireClient()
  const userId = await currentUserId()
  if (!belongsToUser(path, userId)) {
    throw new ProfileServiceError('invalid_avatar', 'O avatar solicitado não pertence à conta autenticada.')
  }
  const { data, error } = await client.storage.from(AVATAR_BUCKET).createSignedUrl(path, 3600)
  if (error) throw mapRequestError(error)
  return data.signedUrl
}
