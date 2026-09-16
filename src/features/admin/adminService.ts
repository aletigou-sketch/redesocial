import { supabase } from '../../shared/supabase/client'

export type ReportStatus = 'open' | 'in_review' | 'resolved' | 'closed'
export type AdminPermission = 'reports.read' | 'reports.update_status'

export interface AdminAccess { allowed: boolean; roleKey: string | null; permissions: AdminPermission[] }
export interface AdminStats { open: number; inReview: number; resolved: number; closed: number; total: number }
export interface AdminReport {
  id: string
  targetType: string
  targetId: string
  category: string
  status: ReportStatus
  description: string | null
  createdAt: string
  updatedAt: string
  totalCount?: number
}

type AccessRow = { allowed: boolean; role_key: string | null; permissions: AdminPermission[] | null }
type StatsRow = { open_count: number; in_review_count: number; resolved_count: number; closed_count: number; total_count: number }
type ReportRow = { id: string; target_type: string; target_id: string; category: string; status: ReportStatus; description?: string | null; description_preview?: string | null; created_at: string; updated_at: string; total_count?: number }

export class AdminServiceError extends Error {
  constructor(public readonly code: 'unavailable' | 'session_expired' | 'forbidden' | 'not_found' | 'request_failed', message: string) { super(message); this.name = 'AdminServiceError' }
}

function client() {
  if (!supabase) throw new AdminServiceError('unavailable', 'A área administrativa não está disponível neste ambiente.')
  return supabase
}

async function requireSession() {
  const { data, error } = await client().auth.getUser()
  if (error || !data.user) throw new AdminServiceError('session_expired', 'Sua sessão expirou. Entre novamente.')
}

function failure(error: { code?: string }) {
  if (error.code === '42501') return new AdminServiceError('forbidden', 'Sua conta não possui permissão administrativa para esta ação.')
  if (error.code === 'P0002') return new AdminServiceError('not_found', 'A denúncia não foi encontrada.')
  return new AdminServiceError('request_failed', 'Não foi possível concluir a operação administrativa agora.')
}

function mapReport(row: ReportRow): AdminReport {
  return { id: row.id, targetType: row.target_type, targetId: row.target_id, category: row.category, status: row.status, description: row.description ?? row.description_preview ?? null, createdAt: row.created_at, updatedAt: row.updated_at, totalCount: row.total_count }
}

export async function fetchAdminAccess(): Promise<AdminAccess> {
  await requireSession()
  const { data, error } = await client().rpc('get_admin_access')
  if (error) throw failure(error)
  const row = (data?.[0] ?? null) as AccessRow | null
  return { allowed: Boolean(row?.allowed), roleKey: row?.role_key ?? null, permissions: row?.permissions ?? [] }
}

export async function fetchAdminStats(): Promise<AdminStats> {
  await requireSession()
  const { data, error } = await client().rpc('get_admin_report_stats')
  if (error) throw failure(error)
  const row = data?.[0] as StatsRow | undefined
  return { open: Number(row?.open_count ?? 0), inReview: Number(row?.in_review_count ?? 0), resolved: Number(row?.resolved_count ?? 0), closed: Number(row?.closed_count ?? 0), total: Number(row?.total_count ?? 0) }
}

export async function fetchAdminReports(page: number, status: ReportStatus | '', category: string) {
  await requireSession()
  const { data, error } = await client().rpc('list_admin_reports', { page_number: page, page_size: 20, status_filter: status || null, category_filter: category || null })
  if (error) throw failure(error)
  const reports = ((data ?? []) as ReportRow[]).map(mapReport)
  return { reports, total: Number(reports[0]?.totalCount ?? 0) }
}

export async function fetchAdminReport(id: string) {
  await requireSession()
  const { data, error } = await client().rpc('get_admin_report', { report_id: id })
  if (error) throw failure(error)
  const row = data?.[0] as ReportRow | undefined
  if (!row) throw new AdminServiceError('not_found', 'A denúncia não foi encontrada.')
  return mapReport(row)
}

export async function updateAdminReportStatus(id: string, status: ReportStatus) {
  await requireSession()
  const { error } = await client().rpc('update_admin_report_status', { report_id: id, next_status: status })
  if (error) throw failure(error)
}
