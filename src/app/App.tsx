import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { AppShell } from './AppShell'
import { AuthPage, type AuthView } from '../features/auth/AuthPage'
import { HomePage } from '../features/home/HomePage'
import { AdminPage } from '../features/admin/AdminPage'
import { useAuth } from '../shared/auth/AuthContext'
import { PublicOnly, RequireAuth } from '../shared/auth/AuthGuards'
import type { NavigationItem } from '../shared/types/navigation'

function navigate(path: string, replace = false) {
  window.history[replace ? 'replaceState' : 'pushState']({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function LoadingScreen() {
  return <main className="session-state" aria-live="polite"><LoaderCircle className="spin" size={30} aria-hidden="true" /><strong>Recuperando sua sessão…</strong><span>Isso deve levar apenas alguns instantes.</span></main>
}

export function App() {
  const { user, isLoading, isConfigured } = useAuth()
  const [activeItem, setActiveItem] = useState<NavigationItem>('home')
  const [location, setLocation] = useState(() => `${window.location.pathname}${window.location.search}`)

  useEffect(() => {
    const syncLocation = () => setLocation(`${window.location.pathname}${window.location.search}`)
    window.addEventListener('popstate', syncLocation)
    return () => window.removeEventListener('popstate', syncLocation)
  }, [])

  useEffect(() => {
    if (isLoading) return
    const publicPath = ['/login', '/cadastro', '/recuperar-senha'].includes(window.location.pathname)
    if (user && publicPath) navigate('/app', true)
    if (!user && ['/app', '/admin'].includes(window.location.pathname)) navigate('/login?motivo=sessao', true)
    if (window.location.pathname === '/') navigate(user ? '/app' : '/login', true)
  }, [isLoading, user])

  if (isLoading) return <LoadingScreen />

  const path = location.split('?')[0]
  const authView: AuthView = path === '/cadastro' ? 'signup' : path === '/recuperar-senha' ? 'forgot' : 'login'

  if (path === '/admin') {
    return (
      <RequireAuth loadingFallback={<LoadingScreen />} unauthenticatedFallback={<LoadingScreen />} configurationFallback={<AuthPage view="login" onNavigate={navigate} />}>
        <AdminPage onExit={() => navigate('/app')} />
      </RequireAuth>
    )
  }

  if (path !== '/app') {
    return (
      <PublicOnly loadingFallback={<LoadingScreen />} authenticatedFallback={<LoadingScreen />}>
        <AuthPage view={authView} sessionExpired={location.includes('motivo=sessao')} onNavigate={navigate} />
      </PublicOnly>
    )
  }

  return (
    <RequireAuth
      loadingFallback={<LoadingScreen />}
      unauthenticatedFallback={<LoadingScreen />}
      configurationFallback={<AuthPage view="login" onNavigate={navigate} />}
    >
      <AppShell activeItem={activeItem} onNavigate={setActiveItem} onSignedOut={() => navigate('/login', true)}>
        <HomePage activeItem={activeItem} onNavigate={setActiveItem} />
      </AppShell>
    </RequireAuth>
  )
}
