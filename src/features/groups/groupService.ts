import { supabase } from '../../shared/supabase/client'

const GROUP_BUCKET = 'group-images'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const SIGNED_URL_TTL = 600
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type GroupRole = 'admin' | 'member'

interface GroupRow {
  id: string
  name: string
  description: string
  image_path: string | null
  created_by: string
  created_at: string
  updated_at: string
  group_members: Array<{ role: GroupRole; joined_at: string; user_id: string }> | { role: GroupRole; joined_at: string; user_id: string } | null
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
  if (error.code === '22023' || error.code === '22P02') return new GroupServiceError('invalid_input', 'Os dados informados são inválidos.')
  return new GroupServiceError('request_failed', 'Não foi possível concluir a operação agora. Tente novamente.')
}

function normalizeInput(input: GroupInput): GroupInput {
  const name = input.name.trim().replace(/\s+/g, ' ')
  const description = input.description.trim()
  if (name.length < 3 || name.length > 80) throw new GroupServiceError('invalid_input', 'O nome deve ter entre 3 e 80 caracteres.')
  if (description.length > 500) throw new GroupServiceError('invalid_input', 'A descrição deve ter no máximo 500 caracteres.')
  return { name, description }
}

function normalizeGroupId(groupId: string): string {
  const normalized = groupId.trim().toLowerCase()
  if (!UUID_PATTERN.test(normalized)) throw new GroupServiceError('invalid_input', 'Informe um código de grupo válido.')
  return normalized
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

function membership(value: GroupRow['group_members']): { role: GroupRole; joined_at: string; user_id: string } | null {
  return Array.isArray(value) ? value[0] ?? null : value
}

function mapGroup(row: GroupRow, memberCount: number, imageUrl: string | null): Group {
  const member = membership(row.group_members)
  if (!member) throw new GroupServiceError('forbidden', 'Você não possui acesso a este grupo.')
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
    memberCount,
  }
}

const GROUP_COLUMNS = 'id,name,description,image_path,created_by,created_at,updated_at,group_members!inner(role,joined_at,user_id)'

export async function fetchGroups(): Promise<Group[]> {
  const client = requireClient()
  const userId = await currentUserId()
  const { data, error } = await client
    .from('groups')
    .select(GROUP_COLUMNS)
    .eq('group_members.user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) throw mapError(error)

  const rows = (data ?? []) as unknown as GroupRow[]
  if (!rows.length) return []

  const groupIds = rows.map((row) => row.id)
  const { data: members, error: membersError } = await client
    .from('group_members')
    .select('group_id')
    .in('group_id', groupIds)
  if (membersError) throw mapError(membersError)

  const counts = new Map<string, number>()
  for (const member of members ?? []) {
    const groupId = member.group_id as string
    counts.set(groupId, (counts.get(groupId) ?? 0) + 1)
  }

  return Promise.all(rows.map(async (row) => mapGroup(row, counts.get(row.id) ?? 0, await signedImage(row.image_path))))
}

export async function fetchGroup(groupId: string): Promise<Group> {
  const client = requireClient()
  const userId = await currentUserId()
  const normalizedId = normalizeGroupId(groupId)
  const { data, error } = await client
    .from('groups')
    .select(GROUP_COLUMNS)
    .eq('id', normalizedId)
    .eq('group_members.user_id', userId)
    .maybeSingle()
  if (error) throw mapError(error)
  if (!data) throw new GroupServiceError('not_found', 'O grupo não foi encontrado ou você não possui acesso.')

  const { count, error: countError } = await client
    .from('group_members')
    .select('group_id', { count: 'exact', head: true })
    .eq('group_id', normalizedId)
  if (countError) throw mapError(countError)

  const row = data as unknown as GroupRow
  return mapGroup(row, count ?? 0, await signedImage(row.image_path))
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
      let cleanupFailed = false
      if (path) {
        const { error: storageCleanupError } = await client.storage.from(GROUP_BUCKET).remove([path])
        cleanupFailed = Boolean(storageCleanupError)
      }
      const { error: groupCleanupError } = await client.rpc('delete_owned_group', { target_group_id: groupId })
      cleanupFailed = cleanupFailed || Boolean(groupCleanupError)
      if (cleanupFailed) throw new GroupServiceError('request_failed', 'A criação falhou e alguns dados podem exigir limpeza operacional.')
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
  const { data, error } = await client.from('groups').update(changes).eq('id', group.id).select('id').maybeSingle()
  if (error || !data) {
    if (uploadedPath) await client.storage.from(GROUP_BUCKET).remove([uploadedPath])
    if (!error) throw new GroupServiceError('not_found', 'O grupo não foi encontrado ou você não possui acesso.')
    throw mapError(error)
  }
  if (uploadedPath && group.imagePath) {
    const { error: cleanupError } = await client.storage.from(GROUP_BUCKET).remove([group.imagePath])
    if (cleanupError) throw new GroupServiceError('request_failed', 'O grupo foi atualizado, mas a imagem anterior pode exigir limpeza operacional.')
  }
  return fetchGroup(group.id)
}

export async function joinGroup(groupId: string): Promise<void> {
  const client = requireClient()
  await currentUserId()
  const { error } = await client.rpc('join_group', { target_group_id: normalizeGroupId(groupId) })
  if (error) throw mapError(error)
}

export async function leaveGroup(groupId: string): Promise<void> {
  const client = requireClient()
  await currentUserId()
  const { error } = await client.rpc('leave_group', { target_group_id: normalizeGroupId(groupId) })
  if (error) throw mapError(error)
}
