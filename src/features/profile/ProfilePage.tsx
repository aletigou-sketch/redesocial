import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Camera, LoaderCircle, RefreshCw, Trash2, UserRound } from 'lucide-react'
import { useProfile } from '../../shared/profile/ProfileContext'
import type { ProfileInput } from '../../shared/profile/profileService'

interface FormErrors { username?: string; displayName?: string; bio?: string; avatar?: string }

export function ProfilePage() {
  const { profile, avatarUrl, status, error, isLoading, isSaving, reloadProfile, saveProfile } = useProfile()
  const [form, setForm] = useState<ProfileInput>({ username: '', display_name: '', bio: null, is_discoverable: false })
  const [avatar, setAvatar] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [success, setSuccess] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!profile) return
    setForm({ username: profile.username, display_name: profile.display_name, bio: profile.bio, is_discoverable: profile.is_discoverable })
    setAvatar(null)
    setRemoveAvatar(false)
    setPreview(null)
  }, [profile])

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  function validate(): FormErrors {
    const next: FormErrors = {}
    if (!/^[a-z0-9_]{3,30}$/.test(form.username)) next.username = 'Use de 3 a 30 caracteres: letras minúsculas, números ou _.'
    const nameLength = form.display_name.trim().length
    if (nameLength < 1 || nameLength > 80) next.displayName = 'Informe um nome com até 80 caracteres.'
    if ((form.bio?.length ?? 0) > 500) next.bio = 'A bio deve ter no máximo 500 caracteres.'
    return next
  }

  function chooseAvatar(file?: File) {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setErrors((current) => ({ ...current, avatar: 'Escolha uma imagem JPG, PNG ou WebP de até 5 MB.' }))
      return
    }
    if (preview) URL.revokeObjectURL(preview)
    setAvatar(file)
    setPreview(URL.createObjectURL(file))
    setRemoveAvatar(false)
    setErrors((current) => ({ ...current, avatar: undefined }))
    setSuccess('')
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (isSaving) return
    const nextErrors = validate()
    setErrors(nextErrors)
    setSuccess('')
    if (Object.keys(nextErrors).length) return
    const saved = await saveProfile({ ...form, display_name: form.display_name.trim(), bio: form.bio?.trim() || null }, avatar, removeAvatar)
    if (saved) setSuccess('Perfil atualizado com sucesso.')
  }

  if (isLoading || status === 'idle') return <ProfileSkeleton />
  if (!profile) {
    return <section className="profile-state card" aria-live="polite"><span className="profile-state-icon"><UserRound size={28} /></span><h1>{status === 'missing' ? 'Perfil ainda não disponível' : 'Não foi possível abrir seu perfil'}</h1><p>{error || 'O perfil vinculado à sua conta não foi encontrado.'}</p><button className="primary-button" onClick={() => void reloadProfile()}><RefreshCw size={17} /> Tentar novamente</button></section>
  }

  const shownAvatar = removeAvatar ? null : preview || avatarUrl
  const initials = profile.display_name.slice(0, 2).toUpperCase()

  return (
    <section className="profile-page">
      <header className="profile-hero card">
        <div className="profile-cover" />
        <div className="profile-identity">
          <span className="profile-avatar">{shownAvatar ? <img src={shownAvatar} alt="Avatar atual do perfil" /> : initials}</span>
          <div><p className="eyebrow">SEU PERFIL</p><h1>{profile.display_name}</h1><span>@{profile.username}</span></div>
        </div>
      </header>

      <form className="profile-form card" onSubmit={handleSubmit} noValidate>
        <div className="profile-form-heading"><div><h2>Informações do perfil</h2><p>Esses dados são carregados e salvos no seu perfil real.</p></div><button type="button" className="secondary-button" onClick={() => void reloadProfile()} disabled={isSaving}><RefreshCw size={16} /> Recarregar</button></div>
        {(error || success) && <div className={`auth-alert ${success ? 'success' : 'error'}`} role={success ? 'status' : 'alert'}>{success || error}</div>}

        <div className="avatar-editor">
          <span className="profile-avatar profile-avatar-edit">{shownAvatar ? <img src={shownAvatar} alt="Prévia do avatar" /> : initials}</span>
          <div><strong>Foto do perfil</strong><p>JPG, PNG ou WebP, com até 5 MB. O arquivo permanece em área privada.</p><div className="avatar-actions"><button type="button" className="secondary-button" onClick={() => fileRef.current?.click()} disabled={isSaving}><Camera size={16} /> Escolher imagem</button>{(shownAvatar || profile.avatar_path) && <button type="button" className="profile-remove" onClick={() => { setAvatar(null); setPreview(null); setRemoveAvatar(true); setSuccess('') }} disabled={isSaving}><Trash2 size={16} /> Remover</button>}</div><input ref={fileRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseAvatar(event.target.files?.[0])} />{errors.avatar && <small className="field-error">{errors.avatar}</small>}</div>
        </div>

        <div className="profile-fields">
          <label className="profile-field">Nome de exibição<input value={form.display_name} maxLength={80} aria-invalid={Boolean(errors.displayName)} onChange={(event) => setForm({ ...form, display_name: event.target.value })} />{errors.displayName && <small className="field-error">{errors.displayName}</small>}</label>
          <label className="profile-field">Nome de usuário<div className="profile-prefix"><span>@</span><input value={form.username} maxLength={30} autoCapitalize="none" spellCheck={false} aria-invalid={Boolean(errors.username)} onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase().replace(/\s/g, '') })} /></div>{errors.username && <small className="field-error">{errors.username}</small>}</label>
          <label className="profile-field profile-field-wide">Bio<textarea value={form.bio ?? ''} maxLength={500} rows={5} aria-invalid={Boolean(errors.bio)} onChange={(event) => setForm({ ...form, bio: event.target.value })} /><span className="field-counter">{form.bio?.length ?? 0}/500</span>{errors.bio && <small className="field-error">{errors.bio}</small>}</label>
          <label className="discoverability profile-field-wide"><span><strong>Perfil encontrável</strong><small>Permite que outros usuários autenticados encontrem seu perfil, conforme as regras de privacidade.</small></span><input type="checkbox" checked={form.is_discoverable} onChange={(event) => setForm({ ...form, is_discoverable: event.target.checked })} /></label>
        </div>
        <footer className="profile-form-footer"><span>Alterações são aplicadas somente à conta desta sessão.</span><button className="primary-button" type="submit" disabled={isSaving}>{isSaving ? <><LoaderCircle className="spin" size={17} /> Salvando…</> : 'Salvar alterações'}</button></footer>
      </form>
    </section>
  )
}

function ProfileSkeleton() {
  return <section className="profile-page" aria-live="polite" aria-label="Carregando perfil"><div className="profile-skeleton profile-skeleton-hero card" /><div className="profile-skeleton profile-skeleton-form card" /></section>
}
