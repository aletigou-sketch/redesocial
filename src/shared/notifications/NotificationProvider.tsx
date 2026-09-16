import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { fetchUnreadCount, subscribeToNotifications, unsubscribeFromNotifications } from '../../features/notifications/notificationService'
import { NotificationContext } from './NotificationContext'

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const refreshUnreadCount = useCallback(async () => { if (!user) { setUnreadCount(0); return }; try { setUnreadCount(await fetchUnreadCount()) } catch { setUnreadCount(0) } }, [user?.id])
  useEffect(() => { void refreshUnreadCount() }, [refreshUnreadCount])
  useEffect(() => {
    if (!user) return
    const channel = subscribeToNotifications(user.id, (item) => { if (!item.readAt) setUnreadCount((value) => value + 1) }, () => undefined)
    return () => { void unsubscribeFromNotifications(channel) }
  }, [user?.id])
  const value = useMemo(() => ({ unreadCount, refreshUnreadCount }), [refreshUnreadCount, unreadCount])
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}
