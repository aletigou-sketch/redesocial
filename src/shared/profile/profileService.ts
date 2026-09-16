import { supabase } from '../supabase/client'

const AVATAR_BUCKET = 'profile-avatars'
const AVATAR_MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']

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
    public readonly code: 'unavailable' | 'session_expired' | 'not_found' | 'conflict' | 'invalid_avatar' | 'request_failed',
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

export async function fetchOwnProfile(): Promise<Profile> {
  const client = requireClient()
  const userId = await currentUserId()
  const { data, error } = await client.from('profiles').select('*').eq('user_id', userId).maybeSingle()

  if (error) throw mapRequestError(error)
  if (!data) throw new ProfileServiceError('not_found', 'Seu perfil ainda não está disponível.')
  return data as Profile
}

export async function updateOwnProfile(input: ProfileInput): Promise<Profile> {
  const client = requireClient()
  const userId = await currentUserId()
  const { data, error } = await client
    .from('profiles')
    .update(input)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle()

  if (error) throw mapRequestError(error)
  if (!data) throw new ProfileServiceError('not_found', 'Seu perfil não foi encontrado para atualização.')
  return data as Profile
}

export function validateAvatar(file: File): void {
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
    throw new ProfileServiceError('invalid_avatar', 'Escolha uma imagem JPG, PNG ou WebP.')
  }
  if (file.size > AVATAR_MAX_BYTES) {
    throw new ProfileServiceError('invalid_avatar', 'A imagem deve ter no máximo 5 MB.')
  }
}

export async function uploadOwnAvatar(file: File): Promise<string> {
  validateAvatar(file)
  const client = requireClient()
  const userId = await currentUserId()
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${userId}/avatar-${Date.now()}.${extension}`
  const { error } = await client.storage.from(AVATAR_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  })
  if (error) throw mapRequestError(error)
  return path
}

export async function setOwnAvatarPath(path: string | null): Promise<Profile> {
  const client = requireClient()
  const userId = await currentUserId()
  if (path && !path.startsWith(`${userId}/`)) {
    throw new ProfileServiceError('invalid_avatar', 'O caminho do avatar não pertence à conta autenticada.')
  }
  const { data, error } = await client
    .from('profiles')
    .update({ avatar_path: path })
    .eq('user_id', userId)
    .select('*')
    .maybeSingle()
  if (error) throw mapRequestError(error)
  if (!data) throw new ProfileServiceError('not_found', 'Seu perfil não foi encontrado para atualização.')
  return data as Profile
}

export async function removeOwnAvatarObject(path: string): Promise<void> {
  const client = requireClient()
  const userId = await currentUserId()
  if (!path.startsWith(`${userId}/`)) return
  const { error } = await client.storage.from(AVATAR_BUCKET).remove([path])
  if (error) throw mapRequestError(error)
}

export async function createOwnAvatarUrl(path: string | null): Promise<string | null> {
  if (!path) return null
  const client = requireClient()
  const userId = await currentUserId()
  if (!path.startsWith(`${userId}/`)) {
    throw new ProfileServiceError('invalid_avatar', 'O avatar solicitado não pertence à conta autenticada.')
  }
  const { data, error } = await client.storage.from(AVATAR_BUCKET).createSignedUrl(path, 3600)
  if (error) throw mapRequestError(error)
  return data.signedUrl
}
