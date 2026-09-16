import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, FileSearch, LoaderCircle, LogOut, ShieldCheck, X } from 'lucide-react'
import { reportCategories } from '../moderation/moderationService'
import { useAuth } from '../../shared/auth/AuthContext'
import { AdminServiceError, fetchAdminAccess, fetchAdminReport, fetchAdminReports, fetchAdminStats, updateAdminReportStatus, type AdminAccess, type AdminReport, type AdminStats, type ReportStatus } from './adminService'

const statuses: Array<{ value: ReportStatus; label: string }> = [
  { value: 'open', label: 'Aberta' }, { value: 'in_review', label: 'Em análise' },
  { value: 'resolved', label: 'Resolvida' }, { value: 'closed', label: 'Encerrada' },
]
const categoryLabel = Object.fromEntries(reportCategories.map((item) => [item.value, item.label]))
const statusLabel = Object.fromEntries(statuses.map((item) => [item.value, item.label]))
const targetLabel: Record<string, string> = { profile: 'Perfil', story: 'Story', group: 'Grupo', message: 'Mensagem' }

function messageOf(error: unknown) { return error instanceof AdminServiceError ? error.message : 'Não foi possível carregar a área administrativa.' }
function date(value: string) { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) }

export function AdminPage({ onExit }: { onExit: () => void }) {
  const { signOut } = useAuth()
  const [access, setAccess] = useState<AdminAccess | null>(null)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [reports, setReports] = useState<AdminReport[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<ReportStatus | ''>('')
  const [category, setCategory] = useState('')
  const [selected, setSelected] = useState<AdminReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const authorization = await fetchAdminAccess()
      setAccess(authorization)
      if (!authorization.allowed) return
      const [nextStats, result] = await Promise.all([fetchAdminStats(), fetchAdminReports(page, status, category)])
      setStats(nextStats); setReports(result.reports); setTotal(result.total)
    } catch (cause) { setError(messageOf(cause)) }
    finally { setLoading(false) }
  }, [category, page, status])

  useEffect(() => { void load() }, [load])

  async function openDetail(id: string) {
    setDetailLoading(true); setError('')
    try { setSelected(await fetchAdminReport(id)) }
    catch (cause) { setError(messageOf(cause)) }
    finally { setDetailLoading(false) }
  }

  async function changeStatus(next: ReportStatus) {
    if (!selected || saving) return
    setSaving(true); setError('')
    try {
      await updateAdminReportStatus(selected.id, next)
      setSelected({ ...selected, status: next })
      await load()
    } catch (cause) { setError(messageOf(cause)) }
    finally { setSaving(false) }
  }

  if (loading && !access) return <main className="admin-state"><LoaderCircle className="spin" /><strong>Validando autorização no servidor…</strong></main>
  if (!access?.allowed) return <main className="admin-state"><ShieldCheck size={44} /><h1>Acesso negado</h1><p>{error || 'Esta área exige uma permissão administrativa ativa validada pelo servidor.'}</p><button className="secondary-button" onClick={onExit}><ArrowLeft size={17} /> Voltar ao Hi You!</button></main>

  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <button className="brand" onClick={onExit}><span className="brand-mark">H</span><span>Hi You! Admin</span></button>
      <nav><button className="nav-item is-active"><FileSearch size={19} /> Denúncias</button></nav>
      <small>Perfil: {access.roleKey}</small>
      <button className="admin-exit" onClick={onExit}><ArrowLeft size={17} /> Voltar ao aplicativo</button>
      <button className="admin-exit" onClick={() => void signOut()}><LogOut size={17} /> Sair</button>
    </aside>
    <main className="admin-main">
      <header className="admin-header"><div><p className="eyebrow">OPERAÇÕES DE MODERAÇÃO</p><h1>Painel administrativo</h1><p>Triagem de denúncias com autorização e auditoria no backend.</p></div><button className="secondary-button" onClick={() => void load()} disabled={loading}>{loading && <LoaderCircle className="spin" size={16} />}Atualizar</button></header>
      {error && <div className="admin-alert" role="alert">{error}</div>}
      <section className="admin-stats" aria-label="Indicadores de denúncias">
        <article><span>Abertas</span><strong>{stats?.open ?? 0}</strong></article><article><span>Em análise</span><strong>{stats?.inReview ?? 0}</strong></article><article><span>Resolvidas</span><strong>{stats?.resolved ?? 0}</strong></article><article><span>Encerradas</span><strong>{stats?.closed ?? 0}</strong></article><article><span>Total</span><strong>{stats?.total ?? 0}</strong></article>
      </section>
      <section className="admin-panel card">
        <div className="admin-filters"><label>Estado<select value={status} onChange={(event) => { setStatus(event.target.value as ReportStatus | ''); setPage(1) }}><option value="">Todos</option>{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>Categoria<select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1) }}><option value="">Todas</option>{reportCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>
        {loading ? <div className="admin-list-state"><LoaderCircle className="spin" /> Carregando denúncias…</div> : reports.length === 0 ? <div className="admin-list-state"><FileSearch /><strong>Nenhuma denúncia encontrada</strong><span>Ajuste os filtros ou aguarde novos registros.</span></div> : <div className="admin-table-wrap"><table><thead><tr><th>Estado</th><th>Categoria</th><th>Alvo</th><th>Recebida</th><th></th></tr></thead><tbody>{reports.map((report) => <tr key={report.id}><td><span className={`admin-status ${report.status}`}>{statusLabel[report.status]}</span></td><td>{categoryLabel[report.category] ?? report.category}</td><td>{targetLabel[report.targetType] ?? report.targetType}</td><td>{date(report.createdAt)}</td><td><button onClick={() => void openDetail(report.id)} disabled={detailLoading}>Analisar</button></td></tr>)}</tbody></table></div>}
        <footer className="admin-pagination"><span>{total} registro(s)</span><div><button disabled={page === 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft /></button><b>Página {page}</b><button disabled={page * 20 >= total || loading} onClick={() => setPage((value) => value + 1)}><ChevronRight /></button></div></footer>
      </section>
    </main>
    {selected && <div className="moderation-modal" role="dialog" aria-modal="true" aria-labelledby="admin-detail-title"><section className="admin-detail card"><button className="moderation-close" onClick={() => setSelected(null)} aria-label="Fechar"><X /></button><p className="eyebrow">DETALHES DA DENÚNCIA</p><h2 id="admin-detail-title">{categoryLabel[selected.category] ?? selected.category}</h2><dl><div><dt>Estado</dt><dd><span className={`admin-status ${selected.status}`}>{statusLabel[selected.status]}</span></dd></div><div><dt>Tipo do alvo</dt><dd>{targetLabel[selected.targetType] ?? selected.targetType}</dd></div><div><dt>Identificador do alvo</dt><dd><code>{selected.targetId}</code></dd></div><div><dt>Recebida</dt><dd>{date(selected.createdAt)}</dd></div><div><dt>Descrição</dt><dd>{selected.description || 'Nenhuma descrição informada.'}</dd></div></dl>{access.permissions.includes('reports.update_status') && <label>Alterar estado<select value={selected.status} disabled={saving} onChange={(event) => void changeStatus(event.target.value as ReportStatus)}>{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>}<small>Cada alteração de estado é registrada na auditoria administrativa.</small></section></div>}
  </div>
}
