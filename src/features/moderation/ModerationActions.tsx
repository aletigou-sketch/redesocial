import { useState, type FormEvent } from 'react'
import { Ban, Flag, LoaderCircle, X } from 'lucide-react'
import { blockUser, createReport, ModerationServiceError, reportCategories, type ReportCategory, type ReportTargetType } from './moderationService'

interface Props {
  targetType: ReportTargetType
  targetId: string
  userId?: string
  compact?: boolean
  onBlocked?: () => void
}

export function ModerationActions({ targetType, targetId, userId, compact, onBlocked }: Props) {
  const [reportOpen, setReportOpen] = useState(false)
  const [blockOpen, setBlockOpen] = useState(false)
  const [category, setCategory] = useState<ReportCategory>('spam')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submitReport(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true); setError(''); setMessage('')
    try {
      await createReport(targetType, targetId, category, description)
      setReportOpen(false); setDescription(''); setMessage('Denúncia registrada para análise.')
    } catch (cause) {
      setError(cause instanceof ModerationServiceError ? cause.message : 'Não foi possível registrar a denúncia.')
    } finally { setSaving(false) }
  }

  async function confirmBlock() {
    if (!userId || saving) return
    setSaving(true); setError(''); setMessage('')
    try {
      await blockUser(userId)
      setBlockOpen(false); setMessage('Usuário bloqueado. As interações futuras foram restringidas.')
      onBlocked?.()
    } catch (cause) {
      setError(cause instanceof ModerationServiceError ? cause.message : 'Não foi possível bloquear o usuário.')
    } finally { setSaving(false) }
  }

  return <div className={`moderation-actions ${compact ? 'is-compact' : ''}`}>
    <div className="moderation-buttons">
      <button className="moderation-button" type="button" onClick={() => { setReportOpen(true); setError(''); setMessage('') }}><Flag size={15} /> Denunciar</button>
      {userId && <button className="moderation-button danger-button" type="button" onClick={() => { setBlockOpen(true); setError(''); setMessage('') }}><Ban size={15} /> Bloquear</button>}
    </div>
    {message && <span className="moderation-feedback success" role="status">{message}</span>}
    {error && <span className="moderation-feedback error" role="alert">{error}</span>}

    {reportOpen && <div className="moderation-modal" role="dialog" aria-modal="true" aria-labelledby="report-title">
      <form className="moderation-form card" onSubmit={submitReport}>
        <button type="button" className="moderation-close" onClick={() => setReportOpen(false)} aria-label="Fechar"><X /></button>
        <h2 id="report-title">Denunciar conteúdo</h2>
        <p>Escolha o motivo mais adequado. A identidade de quem denuncia não é exibida ao usuário denunciado.</p>
        <label>Motivo<select value={category} onChange={(event) => setCategory(event.target.value as ReportCategory)}>{reportCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label>Descrição opcional<textarea rows={5} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} /><small>{description.length}/1000</small></label>
        <button className="primary-button" disabled={saving}>{saving && <LoaderCircle className="spin" size={17} />}{saving ? 'Enviando…' : 'Enviar denúncia'}</button>
      </form>
    </div>}

    {blockOpen && <div className="moderation-modal" role="dialog" aria-modal="true" aria-labelledby="block-title">
      <div className="moderation-form card">
        <button type="button" className="moderation-close" onClick={() => setBlockOpen(false)} aria-label="Fechar"><X /></button>
        <h2 id="block-title">Bloquear usuário?</h2>
        <p>Mensagens, chamadas, presença e novas interações entre vocês serão restringidas. O usuário não será avisado.</p>
        <div className="moderation-confirm"><button className="secondary-button" type="button" onClick={() => setBlockOpen(false)} disabled={saving}>Cancelar</button><button className="primary-button danger-action" type="button" onClick={() => void confirmBlock()} disabled={saving}>{saving && <LoaderCircle className="spin" size={17} />}{saving ? 'Bloqueando…' : 'Confirmar bloqueio'}</button></div>
      </div>
    </div>}
  </div>
}
