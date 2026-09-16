import { createContext, useContext } from 'react'

export interface NotificationContextValue { unreadCount: number; refreshUnreadCount: () => Promise<void> }
export const NotificationContext = createContext<NotificationContextValue | null>(null)
export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) throw new Error('useNotifications deve ser usado dentro de NotificationProvider.')
  return context
}
