import { supabase } from '../../shared/supabase/client'

const GROUP_BUCKET = 'group-images'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const SIGNED_URL_TTL = 600
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export type GroupRole = 'admin' | 'member'

interface GroupRow {
  id: string
  name: string
  description: string
  image_path: string | null
  created_by: string
  created_at: string
  updated_at: string
  group_members: Array<{ role: GroupRole; joined_at: string }> | { role: GroupRole; joined_at: string } | null
}

export interface Group {
  id: string
  name: string
  description: string
  imagePath: string | null
  imageUrl: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  role: GroupRole
  joinedAt: string
  memberCount: number
}

export interface GroupInput {
  name: string
  description: string
}

export class GroupServiceError extends Error {
  constructor(
    public readonly code: 'unavailable' | 'session_expired' | 'invalid_input' | 'invalid_image' | 'forbidden' | 'not_found' | 'conflict' | 'request_failed',
    message: string,
  ) {
    super(message)
    this.name = 'GroupServiceError'
  }
}

function requireClient() {
  if (!supabase) throw new GroupServiceError('unavailable', 'Grupos não estão disponíveis neste ambiente.')
  return supabase
}

async function currentUserId(): Promise<string> {
  const client = requireClient()
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw new GroupServiceError('session_expired', 'Sua sessão expirou. Entre novamente para continuar.')
  return data.user.id
}

function mapError(error: { code?: string }): GroupServiceError {
  if (error.code === '23505') return new GroupServiceError('conflict', 'Esta associação já existe.')
  if (error.code === 'PGRST116') return new GroupServiceError('not_found', 'O grupo não foi encontrado ou você não possui acesso.')
  if (error.code === '42501') return new GroupServiceError('forbidden', 'Você não possui permissão para concluir esta operação.')
  return new GroupServiceError('request_failed', 'Não foi possível concluir a operação agora. Tente novamente.')
}

function normalizeInput(input: GroupInput): GroupInput {
  const name = input.name.trim().replace(/\s+/g, ' ')
  const description = input.description.trim()
  if (name.length < 3 || name.length > 80) throw new GroupServiceError('invalid_input', 'O nome deve ter entre 3 e 80 caracteres.')
  if (description.length > 500) throw new GroupServiceError('invalid_input', 'A descrição deve ter no máximo 500 caracteres.')
  return { name, description }
}

function hasExpectedSignature(type: string, bytes: Uint8Array): boolean {
  if (type === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (type === 'image/png') return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  if (type === 'image/webp') return bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  return false
}

export async function validateGroupImage(file: File): Promise<void> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) throw new GroupServiceError('invalid_image', 'Escolha uma imagem JPG, PNG ou WebP.')
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) throw new GroupServiceError('invalid_image', 'A imagem deve ter conteúdo e no máximo 5 MB.')
  try {
    const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
    if (!hasExpectedSignature(file.type, bytes)) throw new Error('signature')
  } catch {
    throw new GroupServiceError('invalid_image', 'O conteúdo do arquivo não corresponde ao formato informado.')
  }
}

async function signedImage(path: string | null): Promise<string | null> {
  if (!path) return null
  const { data, error } = await requireClient().storage.from(GROUP_BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
  return error ? null : data.signedUrl
}

async function memberCount(groupId: string): Promise<number> {
  const { count, error } = await requireClient().from('group_members').select('group_id', { count: 'exact', head: true }).eq('group_id', groupId)
  if (error) throw mapError(error)
  return count ?? 0
}

function membership(value: GroupRow['group_members']): { role: GroupRole; joined_at: string } | null {
  return Array.isArray(value) ? value[0] ?? null : value
}

async function mapGroup(row: GroupRow): Promise<Group> {
  const member = membership(row.group_members)
  if (!member) throw new GroupServiceError('forbidden', 'Você não possui acesso a este grupo.')
  const [imageUrl, count] = await Promise.all([signedImage(row.image_path), memberCount(row.id)])
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    imagePath: row.image_path,
    imageUrl,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    role: member.role,
    joinedAt: member.joined_at,
    memberCount: count,
  }
}

const GROUP_COLUMNS = 'id,name,description,image_path,created_by,created_at,updated_at,group_members!inner(role,joined_at)'

export async function fetchGroups(): Promise<Group[]> {
  const client = requireClient()
  await currentUserId()
  const { data, error } = await client.from('groups').select(GROUP_COLUMNS).order('updated_at', { ascending: false })
  if (error) throw mapError(error)
  return Promise.all(((data ?? []) as unknown as GroupRow[]).map(mapGroup))
}

export async function fetchGroup(groupId: string): Promise<Group> {
  const client = requireClient()
  await currentUserId()
  const { data, error } = await client.from('groups').select(GROUP_COLUMNS).eq('id', groupId).maybeSingle()
  if (error) throw mapError(error)
  if (!data) throw new GroupServiceError('not_found', 'O grupo não foi encontrado ou você não possui acesso.')
  return mapGroup(data as unknown as GroupRow)
}

async function uploadImage(groupId: string, file: File): Promise<string> {
  await validateGroupImage(file)
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${groupId}/${crypto.randomUUID()}.${extension}`
  const { error } = await requireClient().storage.from(GROUP_BUCKET).upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false })
  if (error) throw mapError(error)
  return path
}

export async function createGroup(input: GroupInput, image?: File | null): Promise<Group> {
  const client = requireClient()
  await currentUserId()
  const normalized = normalizeInput(input)
  const { data: groupId, error } = await client.rpc('create_group', { group_name: normalized.name, group_description: normalized.description })
  if (error || typeof groupId !== 'string') throw mapError(error ?? {})

  if (image) {
    let path: string | null = null
    try {
      path = await uploadImage(groupId, image)
      const { error: updateError } = await client.from('groups').update({ image_path: path }).eq('id', groupId)
      if (updateError) throw mapError(updateError)
    } catch (cause) {
      if (path) await client.storage.from(GROUP_BUCKET).remove([path])
      await client.rpc('delete_owned_group', { target_group_id: groupId })
      throw cause
    }
  }
  return fetchGroup(groupId)
}

export async function updateGroup(group: Group, input: GroupInput, image?: File | null): Promise<Group> {
  const client = requireClient()
  await currentUserId()
  const normalized = normalizeInput(input)
  let uploadedPath: string | null = null
  if (image) uploadedPath = await uploadImage(group.id, image)
  const changes = uploadedPath ? { ...normalized, image_path: uploadedPath } : normalized
  const { error } = await client.from('groups').update(changes).eq('id', group.id)
  if (error) {
    if (uploadedPath) await client.storage.from(GROUP_BUCKET).remove([uploadedPath])
    throw mapError(error)
  }
  if (uploadedPath && group.imagePath) await client.storage.from(GROUP_BUCKET).remove([group.imagePath])
  return fetchGroup(group.id)
}

export async function joinGroup(groupId: string): Promise<void> {
  const client = requireClient()
  await currentUserId()
  const { error } = await client.rpc('join_group', { target_group_id: groupId })
  if (error) throw mapError(error)
}

export async function leaveGroup(groupId: string): Promise<void> {
  const client = requireClient()
  await currentUserId()
  const { error } = await client.rpc('leave_group', { target_group_id: groupId })
  if (error) throw mapError(error)
}
