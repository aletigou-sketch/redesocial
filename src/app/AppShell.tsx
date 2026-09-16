import { useState, type ReactNode } from 'react'
import { Bell, Home, LogOut, MessageCircle, Plus, Search, Users, UserRound } from 'lucide-react'
import { useAuth } from '../shared/auth/AuthContext'
import { useProfile } from '../shared/profile/ProfileContext'
import { useNotifications } from '../shared/notifications/NotificationContext'
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
  { id: 'groups', label: 'Grupos', icon: Users },
  { id: 'messages', label: 'Mensagens', icon: MessageCircle },
  { id: 'notifications', label: 'Notificações', icon: Bell },
  { id: 'profile', label: 'Perfil', icon: UserRound },
]

const sectionLabels: Record<NavigationItem, string> = {
  home: 'Seu espaço',
  stories: 'Stories',
  groups: 'Grupos',
  messages: 'Mensagens',
  notifications: 'Notificações',
  profile: 'Seu perfil',
}

export function AppShell({ activeItem, onNavigate, onSignedOut, children }: AppShellProps) {
  const { user, signOut } = useAuth()
  const { profile, avatarUrl } = useProfile()
  const { unreadCount, refreshUnreadCount } = useNotifications()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const email = user?.email ?? 'Conta autenticada'
  const displayName = profile?.display_name ?? 'Sua conta'
  const initials = displayName.slice(0, 2).toUpperCase()

  function handleNavigate(item: NavigationItem) {
    onNavigate(item)
    if (item === 'notifications') void refreshUnreadCount()
  }

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
        <button className="brand" onClick={() => handleNavigate('home')} aria-label="Ir para o início">
          <span className="brand-mark">H</span>
          <span>Hi You!</span>
        </button>

        <div className="topbar-context" aria-live="polite">
          <span>Hi You!</span>
          <strong>{sectionLabels[activeItem]}</strong>
        </div>

        <label className="search-box" aria-disabled="true">
          <Search size={18} aria-hidden="true" />
          <input type="search" placeholder="Buscar no Hi You!" aria-label="Buscar" disabled />
          <span className="foundation-badge">Em breve</span>
        </label>

        <div className="topbar-actions">
          <button
            className={`icon-button shell-notification-button ${activeItem === 'notifications' ? 'is-active' : ''}`}
            aria-label={`Abrir notificações${unreadCount ? `, ${unreadCount} não lidas` : ''}`}
            aria-current={activeItem === 'notifications' ? 'page' : undefined}
            onClick={() => handleNavigate('notifications')}
          >
            <Bell size={20} aria-hidden="true" />
            {unreadCount > 0 && <span className="notification-count" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span>}
          </button>
          <button className="mini-profile" onClick={() => handleNavigate('profile')} aria-label="Abrir seu perfil">
            <span className="avatar avatar-small avatar-livia">{avatarUrl ? <img className="avatar-image" src={avatarUrl} alt="" /> : initials}</span>
            <span className="mini-profile-copy"><strong>{displayName}</strong><small>{profile ? `@${profile.username}` : email}</small></span>
          </button>
          <button className="icon-button shell-signout" onClick={handleSignOut} disabled={isSigningOut} aria-label={isSigningOut ? 'Saindo da conta' : 'Sair da conta'}>
            <LogOut size={19} aria-hidden="true" />
          </button>
        </div>
      </header>

      {logoutError && <div className="shell-alert" role="alert">{logoutError}</div>}

      <div className="shell-grid">
        <aside className="sidebar" aria-label="Navegação principal">
          <div className="sidebar-profile">
            <span className="avatar sidebar-avatar avatar-livia">{avatarUrl ? <img className="avatar-image" src={avatarUrl} alt="" /> : initials}</span>
            <span><strong>{displayName}</strong><small>{profile ? `@${profile.username}` : email}</small></span>
          </div>

          <nav>
            {navItems.map(({ id, label, icon: Icon }) => (
              <button key={id} className={`nav-item ${activeItem === id ? 'is-active' : ''}`} onClick={() => handleNavigate(id)} aria-current={activeItem === id ? 'page' : undefined}>
                <span className="nav-icon"><Icon size={20} strokeWidth={activeItem === id ? 2.4 : 1.8} aria-hidden="true" /></span>
                <span>{label}</span>
                {id === 'notifications' && unreadCount > 0 && <b className="nav-count" aria-label={`${unreadCount} notificações não lidas`}>{unreadCount > 99 ? '99+' : unreadCount}</b>}
              </button>
            ))}
          </nav>

          <div className="sidebar-card"><span className="sparkle">✦</span><strong>Seu espaço, do seu jeito.</strong><p>Conecte-se com quem faz sentido para você.</p></div>
          <footer className="sidebar-footer"><span>Privacidade</span><span>Ajuda</span><span>Termos</span><small>© 2026 Hi You!</small></footer>
        </aside>

        <main className="main-content" id="main-content">{children}</main>
      </div>

      <nav className="mobile-nav" aria-label="Navegação móvel">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button key={id} className={activeItem === id ? 'is-active' : ''} onClick={() => handleNavigate(id)} aria-current={activeItem === id ? 'page' : undefined}>
            <span className="mobile-nav-icon">
              <Icon size={21} strokeWidth={activeItem === id ? 2.5 : 1.8} aria-hidden="true" />
              {id === 'notifications' && unreadCount > 0 && <i aria-hidden="true" />}
            </span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
