import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck, LoaderCircle, RefreshCw } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthContext'
import { useNotifications } from '../../shared/notifications/NotificationContext'
import type { NavigationItem } from '../../shared/types/navigation'
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, notificationPageSize, NotificationServiceError, subscribeToNotifications, unsubscribeFromNotifications, type Notification } from './notificationService'

export function NotificationsPage({ onNavigate }: { onNavigate: (item: NavigationItem) => void }) {
  const { user, signOut } = useAuth()
  const { refreshUnreadCount } = useNotifications()
  const [items, setItems] = useState<Notification[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const generation = useRef(0)

  const handleError = useCallback(async (cause: unknown) => {
    if (cause instanceof NotificationServiceError && cause.code === 'session_expired') { await signOut(); return }
    setError(cause instanceof NotificationServiceError ? cause.message : 'Não foi possível carregar suas notificações.')
  }, [signOut])

  const load = useCallback(async () => {
    const current = ++generation.current
    setStatus('loading'); setError('')
    try {
      const result = await fetchNotifications()
      if (current !== generation.current) return
      setItems(result); setHasMore(result.length === notificationPageSize); setStatus('ready')
    } catch (cause) { if (current === generation.current) { setStatus('error'); await handleError(cause) } }
  }, [handleError, user?.id])

  useEffect(() => { void load(); return () => { generation.current += 1 } }, [load])
  useEffect(() => {
    if (!user) return
    const channel = subscribeToNotifications(user.id, (incoming) => setItems((current) => current.some((item) => item.id === incoming.id) ? current : [incoming, ...current]), setConnected)
    return () => { void unsubscribeFromNotifications(channel) }
  }, [user?.id])

  async function read(item: Notification) {
    if (!item.readAt) {
      try {
        await markNotificationRead(item.id)
        setItems((current) => current.map((value) => value.id === item.id ? { ...value, readAt: new Date().toISOString() } : value))
        await refreshUnreadCount()
      } catch (cause) { await handleError(cause) }
    }
    if (item.contextType === 'conversation') onNavigate('messages')
    if (item.contextType === 'group') onNavigate('groups')
    if (item.contextType === 'story') onNavigate('stories')
  }
  async function readAll() {
    try {
      await markAllNotificationsRead()
      const now = new Date().toISOString()
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? now })))
      await refreshUnreadCount()
    } catch (cause) { await handleError(cause) }
  }
  async function more() {
    const cursor = items.at(-1); if (!cursor) return
    try { const result = await fetchNotifications(cursor); setItems((current) => [...current, ...result.filter((incoming) => !current.some((item) => item.id === incoming.id))]); setHasMore(result.length === notificationPageSize) } catch (cause) { await handleError(cause) }
  }

  return <section className="notifications-page">
    <header className="notifications-header"><div><p className="eyebrow">ATIVIDADES IMPORTANTES</p><h1>Notificações</h1><p>{connected ? 'Atualizações em tempo real conectadas.' : 'Reconectando atualizações…'}</p></div><button className="secondary-button" onClick={() => void readAll()} disabled={!items.some((item) => !item.readAt)}><CheckCheck size={17} /> Marcar todas como lidas</button></header>
    {error && <div className="notifications-alert" role="alert">{error}</div>}
    {status === 'loading' && <div className="notifications-state"><LoaderCircle className="spin" /> Carregando notificações…</div>}
    {status === 'error' && <div className="notifications-state"><button className="secondary-button" onClick={() => void load()}><RefreshCw size={17} /> Tentar novamente</button></div>}
    {status === 'ready' && !items.length && <div className="notifications-state card"><span className="empty-symbol"><Bell /></span><h2>Tudo em dia</h2><p>Atividades relevantes aparecerão aqui.</p></div>}
    {status === 'ready' && Boolean(items.length) && <div className="notifications-list card">{items.map((item) => <button key={item.id} className={!item.readAt ? 'is-unread' : ''} onClick={() => void read(item)}><span className="notification-icon"><Bell size={18} /></span><span><strong>{item.title}</strong>{item.body && <p>{item.body}</p>}<small>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.createdAt))}</small></span>{!item.readAt && <i aria-label="Não lida" />}</button>)}</div>}
    {hasMore && <button className="secondary-button notifications-more" onClick={() => void more()}>Carregar anteriores</button>}
  </section>
}
