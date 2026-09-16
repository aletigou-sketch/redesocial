import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { ArrowLeft, Camera, ImageIcon, LoaderCircle, LogIn, LogOut, Plus, RefreshCw, Shield, Users, X } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthContext'
import { createGroup, fetchGroup, fetchGroups, GroupServiceError, joinGroup, leaveGroup, updateGroup, type Group } from './groupService'
import './groups.css'

interface FormState { name: string; description: string; image: File | null }
const EMPTY_FORM: FormState = { name: '', description: '', image: null }

function messageFor(cause: unknown, fallback: string) {
  return cause instanceof GroupServiceError ? cause.message : fallback
}

export function GroupsPage() {
  const { user } = useAuth()
  const [groups, setGroups] = useState<Group[]>([])
  const [selected, setSelected] = useState<Group | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formOpen, setFormOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [joinId, setJoinId] = useState('')
  const [saving, setSaving] = useState(false)
  const sequence = useRef(0)

  const load = useCallback(async () => {
    const current = ++sequence.current
    setStatus('loading')
    setError('')
    try {
      const result = await fetchGroups()
      if (current !== sequence.current) return
      setGroups(result)
      setSelected((existing) => existing ? result.find((item) => item.id === existing.id) ?? null : null)
      setStatus('ready')
    } catch (cause) {
      if (current !== sequence.current) return
      setGroups([])
      setError(messageFor(cause, 'Não foi possível carregar seus grupos.'))
      setStatus('error')
    }
  }, [user?.id])

  useEffect(() => {
    setSelected(null)
    void load()
    return () => { sequence.current += 1 }
  }, [load])

  function openCreate() {
    setForm(EMPTY_FORM)
    setFormOpen(true)
    setError('')
  }

  function openEdit() {
    if (!selected) return
    setForm({ name: selected.name, description: selected.description, image: null })
    setFormOpen(true)
    setError('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const result = selected
        ? await updateGroup(selected, form, form.image)
        : await createGroup(form, form.image)
      setFormOpen(false)
      setSelected(result)
      await load()
      setSelected(await fetchGroup(result.id))
    } catch (cause) {
      setError(messageFor(cause, 'Não foi possível salvar o grupo.'))
    } finally {
      setSaving(false)
    }
  }

  async function submitJoin(event: FormEvent) {
    event.preventDefault()
    if (saving || !joinId.trim()) return
    setSaving(true)
    setError('')
    try {
      await joinGroup(joinId.trim().toLowerCase())
      setJoinOpen(false)
      setJoinId('')
      await load()
    } catch (cause) {
      setError(messageFor(cause, 'Não foi possível entrar no grupo.'))
    } finally {
      setSaving(false)
    }
  }

  async function handleLeave() {
    if (!selected || saving) return
    setSaving(true)
    setError('')
    try {
      await leaveGroup(selected.id)
      setSelected(null)
      await load()
    } catch (cause) {
      setError(messageFor(cause, 'Não foi possível sair do grupo.'))
    } finally {
      setSaving(false)
    }
  }

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    setForm((current) => ({ ...current, image: event.target.files?.[0] ?? null }))
  }

  if (selected && !formOpen) {
    return (
      <section className="groups-page">
        <button className="groups-back" onClick={() => setSelected(null)}><ArrowLeft size={18} /> Seus grupos</button>
        {error && <div className="groups-alert" role="alert">{error}</div>}
        <article className="group-detail card">
          <div className="group-detail-cover">{selected.imageUrl ? <img src={selected.imageUrl} alt="" /> : <Users size={64} aria-hidden="true" />}</div>
          <div className="group-detail-body">
            <div className="group-detail-heading"><div><span className="group-role"><Shield size={14} /> {selected.role === 'admin' ? 'Administrador' : 'Membro'}</span><h1>{selected.name}</h1></div><strong>{selected.memberCount} {selected.memberCount === 1 ? 'membro' : 'membros'}</strong></div>
            <p>{selected.description || 'Este grupo ainda não possui descrição.'}</p>
            <div className="group-id"><span>Código para entrada</span><code>{selected.id}</code></div>
            <div className="group-detail-actions">
              {selected.role === 'admin' && <button className="primary-button" onClick={openEdit}>Administrar grupo</button>}
              {selected.createdBy !== user?.id && <button className="secondary-button danger-button" onClick={() => void handleLeave()} disabled={saving}><LogOut size={17} /> {saving ? 'Saindo…' : 'Sair do grupo'}</button>}
            </div>
          </div>
        </article>
      </section>
    )
  }

  return (
    <section className="groups-page">
      <header className="groups-header"><div><p className="eyebrow">ESPAÇOS PARA CONEXÕES REAIS</p><h1>Grupos</h1><p>Acesse somente as comunidades das quais você participa.</p></div><div><button className="secondary-button" onClick={() => setJoinOpen(true)}><LogIn size={17} /> Entrar</button><button className="primary-button" onClick={openCreate}><Plus size={18} /> Criar grupo</button></div></header>
      {error && <div className="groups-alert" role="alert">{error}</div>}
      {status === 'loading' && <div className="groups-state" aria-live="polite"><LoaderCircle className="spin" /><strong>Carregando seus grupos…</strong></div>}
      {status === 'error' && <div className="groups-state"><button className="secondary-button" onClick={() => void load()}><RefreshCw size={17} /> Tentar novamente</button></div>}
      {status === 'ready' && groups.length === 0 && <div className="groups-state card"><span className="empty-symbol"><Users /></span><h2>Seu espaço começa aqui</h2><p>Crie um grupo ou use um código compartilhado por outro membro para entrar.</p><button className="primary-button" onClick={openCreate}><Plus size={17} /> Criar primeiro grupo</button></div>}
      {status === 'ready' && groups.length > 0 && <div className="groups-grid">{groups.map((group) => <button className="group-card card" key={group.id} onClick={() => setSelected(group)}><span className="group-card-image">{group.imageUrl ? <img src={group.imageUrl} alt="" /> : <Users aria-hidden="true" />}</span><span className="group-card-copy"><span className="group-role">{group.role === 'admin' ? 'Administrador' : 'Membro'}</span><strong>{group.name}</strong><small>{group.description || 'Sem descrição'}</small><span>{group.memberCount} {group.memberCount === 1 ? 'membro' : 'membros'}</span></span></button>)}</div>}

      {joinOpen && <div className="group-modal" role="dialog" aria-modal="true" aria-labelledby="join-title"><form className="group-form card" onSubmit={submitJoin}><button type="button" className="group-close" onClick={() => setJoinOpen(false)} aria-label="Fechar"><X /></button><h2 id="join-title">Entrar em um grupo</h2><p>Informe o código UUID compartilhado por um membro.</p><label>Código do grupo<input value={joinId} onChange={(event) => setJoinId(event.target.value)} required pattern="[0-9a-fA-F-]{36}" placeholder="00000000-0000-0000-0000-000000000000" /></label><button className="primary-button" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <LogIn />} {saving ? 'Entrando…' : 'Entrar no grupo'}</button></form></div>}

      {formOpen && <div className="group-modal" role="dialog" aria-modal="true" aria-labelledby="group-form-title"><form className="group-form card" onSubmit={submit}><button type="button" className="group-close" onClick={() => setFormOpen(false)} aria-label="Fechar"><X /></button><h2 id="group-form-title">{selected ? 'Administrar grupo' : 'Criar novo grupo'}</h2><p>Nome e descrição ficam visíveis somente para membros.</p><label>Nome<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} minLength={3} maxLength={80} required /></label><label>Descrição<textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} maxLength={500} rows={5} /></label><label className="group-image-picker"><span>{form.image ? <ImageIcon /> : <Camera />}</span><span><strong>{form.image?.name ?? (selected?.imagePath ? 'Trocar imagem' : 'Adicionar imagem')}</strong><small>JPG, PNG ou WebP de até 5 MB</small></span><input className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} /></label><button className="primary-button" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : null}{saving ? 'Salvando…' : selected ? 'Salvar alterações' : 'Criar grupo'}</button></form></div>}
    </section>
  )
}
