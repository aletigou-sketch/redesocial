import type { ReactNode } from 'react'
import { Bell, Home, Menu, MessageCircle, Plus, Search, Users, UserRound } from 'lucide-react'
import type { NavigationItem } from '../shared/types/navigation'

interface AppShellProps {
  activeItem: NavigationItem
  onNavigate: (item: NavigationItem) => void
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

export function AppShell({ activeItem, onNavigate, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="icon-button mobile-menu" aria-label="Abrir menu">
          <Menu size={21} />
        </button>
        <button className="brand" onClick={() => onNavigate('home')} aria-label="Ir para o início">
          <span className="brand-mark">H</span>
          <span>Hi You!</span>
        </button>
        <label className="search-box">
          <Search size={18} aria-hidden="true" />
          <input type="search" placeholder="Buscar pessoas, grupos..." aria-label="Buscar" />
          <kbd>⌘ K</kbd>
        </label>
        <div className="topbar-actions">
          <button className="icon-button" aria-label="Notificações" onClick={() => onNavigate('notifications')}>
            <Bell size={20} />
            <span className="notification-dot" />
          </button>
          <button className="mini-profile" onClick={() => onNavigate('profile')}>
            <span className="avatar avatar-small avatar-livia">LM</span>
            <span className="mini-profile-copy"><strong>Lívia</strong><small>@livia.m</small></span>
          </button>
        </div>
      </header>

      <div className="shell-grid">
        <aside className="sidebar" aria-label="Navegação principal">
          <nav>
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={`nav-item ${activeItem === id ? 'is-active' : ''}`}
                onClick={() => onNavigate(id)}
                aria-current={activeItem === id ? 'page' : undefined}
              >
                <Icon size={20} strokeWidth={activeItem === id ? 2.4 : 1.8} />
                <span>{label}</span>
                {id === 'messages' && <span className="nav-badge">3</span>}
              </button>
            ))}
          </nav>
          <div className="sidebar-card">
            <span className="sparkle">✦</span>
            <strong>Seu espaço, do seu jeito.</strong>
            <p>Conecte-se com quem faz sentido para você.</p>
          </div>
          <footer className="sidebar-footer">
            <span>Privacidade</span><span>Ajuda</span><span>Termos</span>
            <small>© 2026 Hi You!</small>
          </footer>
        </aside>

        <main className="main-content">{children}</main>
      </div>

      <nav className="mobile-nav" aria-label="Navegação móvel">
        {navItems.slice(0, 5).map(({ id, label, icon: Icon }) => (
          <button key={id} className={activeItem === id ? 'is-active' : ''} onClick={() => onNavigate(id)}>
            <Icon size={21} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
