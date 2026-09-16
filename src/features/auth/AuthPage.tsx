import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthContext'

export type AuthView = 'login' | 'signup' | 'forgot'

interface AuthPageProps {
  view: AuthView
  sessionExpired?: boolean
  onNavigate: (path: string) => void
}

function friendlyError(message: string): string {
  const normalized = message.toLowerCase()
  if (normalized.includes('invalid login credentials')) return 'E-mail ou senha incorretos. Confira os dados e tente novamente.'
  if (normalized.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.'
  if (normalized.includes('already registered') || normalized.includes('already been registered')) return 'Já existe uma conta associada a este e-mail.'
  if (normalized.includes('password should be')) return 'A senha não atende aos requisitos mínimos.'
  if (normalized.includes('rate limit') || normalized.includes('too many')) return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos.'
  if (normalized.includes('configuration') || normalized.includes('configurado')) return 'A autenticação está temporariamente indisponível neste ambiente.'
  return 'Não foi possível concluir a solicitação. Tente novamente.'
}

export function AuthPage({ view, sessionExpired = false, onNavigate }: AuthPageProps) {
  const { signIn, signUp, requestPasswordReset, isConfigured } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    emailRef.current?.focus()
  }, [view])

  const title = view === 'login' ? 'Que bom ter você de volta' : view === 'signup' ? 'Crie seu espaço no Hi You!' : 'Recupere seu acesso'
  const subtitle = view === 'login'
    ? 'Entre para continuar suas conexões.'
    : view === 'signup'
      ? 'Uma conta segura, simples e feita para você.'
      : 'Enviaremos as instruções oficiais de recuperação para seu e-mail.'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return
    setError('')
    setSuccess('')

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setError('Informe um endereço de e-mail válido.')
      emailRef.current?.focus()
      return
    }
    if (view !== 'forgot' && password.length < 8) {
      setError('Use uma senha com pelo menos 8 caracteres.')
      return
    }
    if (view === 'signup' && password !== confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }

    setIsSubmitting(true)
    try {
      const result = view === 'login'
        ? await signIn(normalizedEmail, password)
        : view === 'signup'
          ? await signUp(normalizedEmail, password)
          : await requestPasswordReset(normalizedEmail, `${window.location.origin}/login`)

      if (result.error) {
        setError(friendlyError(result.error.message))
        return
      }

      if (view === 'forgot') {
        setSuccess('Se houver uma conta com este e-mail, você receberá as instruções de recuperação.')
      } else if (view === 'signup') {
        setSuccess('Conta solicitada. Confira seu e-mail caso a confirmação esteja habilitada.')
      }
    } catch {
      setError('Não foi possível conectar ao serviço de autenticação. Tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-visual" aria-label="Boas-vindas ao Hi You!">
        <button className="auth-brand" type="button" onClick={() => onNavigate('/login')} aria-label="Hi You! — ir para o login">
          <span className="brand-mark">H</span><span>Hi You!</span>
        </button>
        <div className="auth-visual-copy">
          <span className="auth-kicker">SEU ESPAÇO. SUAS CONEXÕES.</span>
          <h1>Mais perto de quem faz sentido.</h1>
          <p>Uma experiência acolhedora para compartilhar momentos e manter seus vínculos por perto.</p>
        </div>
        <div className="auth-trust"><ShieldCheck size={19} aria-hidden="true" /> Sua sessão é protegida pelo Supabase Auth.</div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          {view === 'forgot' && <button className="auth-back" type="button" onClick={() => onNavigate('/login')}><ArrowLeft size={17} /> Voltar ao login</button>}
          <div className="auth-heading"><span className="auth-mobile-mark">H</span><h2>{title}</h2><p>{subtitle}</p></div>

          {sessionExpired && view === 'login' && <div className="auth-alert warning" role="status">Sua sessão terminou. Entre novamente para continuar.</div>}
          {!isConfigured && <div className="auth-alert warning" role="status">A autenticação não está configurada neste ambiente. Seus dados não serão enviados.</div>}
          {error && <div className="auth-alert error" role="alert">{error}</div>}
          {success && <div className="auth-alert success" role="status">{success}</div>}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <label className="auth-field"><span>E-mail</span><span className="auth-input"><Mail size={18} aria-hidden="true" /><input ref={emailRef} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" inputMode="email" placeholder="voce@exemplo.com" disabled={isSubmitting} /></span></label>
            {view !== 'forgot' && <label className="auth-field"><span>Senha</span><span className="auth-input"><LockKeyhole size={18} aria-hidden="true" /><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={view === 'login' ? 'current-password' : 'new-password'} placeholder="Mínimo de 8 caracteres" disabled={isSubmitting} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>}
            {view === 'signup' && <label className="auth-field"><span>Confirme a senha</span><span className="auth-input"><LockKeyhole size={18} aria-hidden="true" /><input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder="Digite a senha novamente" disabled={isSubmitting} /></span></label>}
            {view === 'login' && <button className="auth-text-button align-right" type="button" onClick={() => onNavigate('/recuperar-senha')}>Esqueci minha senha</button>}
            <button className="primary-button auth-submit" type="submit" disabled={isSubmitting || !isConfigured}>{isSubmitting && <LoaderCircle className="spin" size={18} aria-hidden="true" />}{isSubmitting ? 'Aguarde…' : view === 'login' ? 'Entrar' : view === 'signup' ? 'Criar conta' : 'Enviar instruções'}</button>
          </form>

          {view !== 'forgot' && <p className="auth-switch">{view === 'login' ? 'Ainda não tem uma conta?' : 'Já tem uma conta?'} <button className="auth-text-button" type="button" onClick={() => onNavigate(view === 'login' ? '/cadastro' : '/login')}>{view === 'login' ? 'Criar conta' : 'Entrar'}</button></p>}
        </div>
      </section>
    </main>
  )
}
