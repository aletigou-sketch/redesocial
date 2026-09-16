import { supabase } from '../../shared/supabase/client'

export type ReportTargetType = 'profile' | 'story' | 'group' | 'message'
export type ReportCategory = 'spam' | 'harassment' | 'hate_speech' | 'violence' | 'sexual_content' | 'impersonation' | 'privacy' | 'other'

export const reportCategories: Array<{ value: ReportCategory; label: string }> = [
  { value: 'spam', label: 'Spam ou conteúdo repetitivo' },
  { value: 'harassment', label: 'Assédio ou intimidação' },
  { value: 'hate_speech', label: 'Discurso de ódio' },
  { value: 'violence', label: 'Violência ou ameaça' },
  { value: 'sexual_content', label: 'Conteúdo sexual inadequado' },
  { value: 'impersonation', label: 'Falsidade ideológica' },
  { value: 'privacy', label: 'Violação de privacidade' },
  { value: 'other', label: 'Outro motivo' },
]

export class ModerationServiceError extends Error {
  constructor(public readonly code: 'unavailable' | 'session_expired' | 'invalid_input' | 'forbidden' | 'request_failed', message: string) {
    super(message)
    this.name = 'ModerationServiceError'
  }
}

function client() {
  if (!supabase) throw new ModerationServiceError('unavailable', 'A moderação não está disponível neste ambiente.')
  return supabase
}

async function requireSession() {
  const { data, error } = await client().auth.getUser()
  if (error || !data.user) throw new ModerationServiceError('session_expired', 'Sua sessão expirou. Entre novamente para continuar.')
  return data.user.id
}

function mapError(error: { code?: string }) {
  if (error.code === '22023' || error.code === '22P02') return new ModerationServiceError('invalid_input', 'Os dados informados são inválidos.')
  if (error.code === '42501') return new ModerationServiceError('forbidden', 'Este conteúdo não está disponível para a ação solicitada.')
  return new ModerationServiceError('request_failed', 'Não foi possível concluir a operação agora. Tente novamente.')
}

export async function createReport(targetType: ReportTargetType, targetId: string, category: ReportCategory, description: string) {
  await requireSession()
  const normalized = description.trim()
  if (normalized.length > 1000) throw new ModerationServiceError('invalid_input', 'A descrição deve ter no máximo 1000 caracteres.')
  const { error } = await client().rpc('create_report', {
    report_target_type: targetType,
    report_target_id: targetId,
    report_category: category,
    report_description: normalized || null,
  })
  if (error) throw mapError(error)
}

export async function blockUser(targetUserId: string) {
  const ownId = await requireSession()
  if (ownId === targetUserId) throw new ModerationServiceError('invalid_input', 'Você não pode bloquear a própria conta.')
  const { error } = await client().rpc('block_user', { target_user_id: targetUserId })
  if (error) throw mapError(error)
}

export async function unblockUser(targetUserId: string) {
  await requireSession()
  const { error } = await client().rpc('unblock_user', { target_user_id: targetUserId })
  if (error) throw mapError(error)
}

export async function fetchBlockedUsers() {
  const ownId = await requireSession()
  const { data, error } = await client().from('user_blocks').select('blocked_id,created_at').eq('blocker_id', ownId).order('created_at', { ascending: false })
  if (error) throw mapError(error)
  return (data ?? []) as Array<{ blocked_id: string; created_at: string }>
}
