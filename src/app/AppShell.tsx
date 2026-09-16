import { useState, type ReactNode } from 'react'
import { Bell, Home, LogOut, MessageCircle, Plus, Search, Users, UserRound } from 'lucide-react'
import { useAuth } from '../shared/auth/AuthContext'
import type { NavigationItem } from '../shared/types/navigation'

interface AppShellProps {
  activeItem: NavigationItem
  onNavigate: (item: NavigationItem) => void
  onSignedOut: () => void
  children: ReactNode
}

const navItems: Array<{ id: NavigationItem; label: string; icon: typeof Home }> = [
  { id: 'home', label: 'Início', icon: Home },
  { id: 'stories', label: 'Stories', icon: Plus },
  { id: 'messages', label: 'Mensagens', icon: MessageCircle },
  { id: 'groups', label: 'Grupos', icon: Users },
  { id: 'notifications', label: 'Notificações', icon: Bell },
  { id: 'profile', label: 'Perfil', icon: UserRound },
]

export function AppShell({ activeItem, onNavigate, onSignedOut, children }: AppShellProps) {
  const { user, signOut } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const email = user?.email ?? 'Conta autenticada'
  const initials = email.slice(0, 2).toUpperCase()

  async function handleSignOut() {
    if (isSigningOut) return
    setIsSigningOut(true)
    setLogoutError('')
    const { error } = await signOut()
    setIsSigningOut(false)
    if (error) {
      setLogoutError('Não foi possível sair agora. Tente novamente.')
      return
    }
    onSignedOut()
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => onNavigate('home')} aria-label="Ir para o início"><span className="brand-mark">H</span><span>Hi You!</span></button>
        <label className="search-box" aria-disabled="true"><Search size={18} aria-hidden="true" /><input type="search" placeholder="Busca disponível em uma próxima etapa" aria-label="Buscar" disabled /><span className="foundation-badge">Em breve</span></label>
        <div className="topbar-actions">
          <button className="icon-button" aria-label="Abrir notificações" onClick={() => onNavigate('notifications')}><Bell size={20} /></button>
          <button className="mini-profile" onClick={() => onNavigate('profile')} aria-label="Abrir seu perfil"><span className="avatar avatar-small avatar-livia">{initials}</span><span className="mini-profile-copy"><strong>Sua conta</strong><small>{email}</small></span></button>
          <button className="icon-button" onClick={handleSignOut} disabled={isSigningOut} aria-label={isSigningOut ? 'Saindo da conta' : 'Sair da conta'}><LogOut size={19} /></button>
        </div>
      </header>
      {logoutError && <div className="shell-alert" role="alert">{logoutError}</div>}
      <div className="shell-grid">
        <aside className="sidebar" aria-label="Navegação principal">
          <nav>{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${activeItem === id ? 'is-active' : ''}`} onClick={() => onNavigate(id)} aria-current={activeItem === id ? 'page' : undefined}><Icon size={20} strokeWidth={activeItem === id ? 2.4 : 1.8} aria-hidden="true" /><span>{label}</span></button>)}</nav>
          <div className="sidebar-card"><span className="sparkle">✦</span><strong>Seu espaço, do seu jeito.</strong><p>Conecte-se com quem faz sentido para você.</p></div>
          <footer className="sidebar-footer"><span>Privacidade</span><span>Ajuda</span><span>Termos</span><small>© 2026 Hi You!</small></footer>
        </aside>
        <main className="main-content">{children}</main>
      </div>
      <nav className="mobile-nav" aria-label="Navegação móvel">{navItems.slice(0, 5).map(({ id, label, icon: Icon }) => <button key={id} className={activeItem === id ? 'is-active' : ''} onClick={() => onNavigate(id)} aria-current={activeItem === id ? 'page' : undefined}><Icon size={21} aria-hidden="true" /><span>{label}</span></button>)}</nav>
    </div>
  )
}
