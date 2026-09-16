import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { PresenceContext } from './PresenceContext'
import { clearPresence, subscribeToPresence, updateLocalPresence, type PresenceScope, type PresenceSnapshot, type PresenceStatus } from './presenceService'

const AWAY_AFTER_MS = 5 * 60 * 1000

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [ownStatus, setOwnStatus] = useState<PresenceStatus>(user ? 'online' : 'offline')
  const statusRef = useRef<PresenceStatus>(ownStatus)
  const activityTimer = useRef<number | null>(null)

  const applyStatus = useCallback((next: PresenceStatus) => {
    statusRef.current = next
    setOwnStatus(next)
    if (user && next !== 'offline') updateLocalPresence(user.id, next)
  }, [user?.id])

  useEffect(() => {
    clearPresence()
    if (!user) {
      applyStatus('offline')
      return
    }

    const scheduleAway = () => {
      if (activityTimer.current !== null) window.clearTimeout(activityTimer.current)
      if (document.visibilityState === 'hidden') {
        applyStatus('away')
        return
      }
      applyStatus('online')
      activityTimer.current = window.setTimeout(() => applyStatus('away'), AWAY_AFTER_MS)
    }
    const handleVisibility = () => scheduleAway()
    const handleOffline = () => applyStatus('offline')
    const handleOnline = () => scheduleAway()

    scheduleAway()
    window.addEventListener('pointerdown', scheduleAway, { passive: true })
    window.addEventListener('keydown', scheduleAway)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (activityTimer.current !== null) window.clearTimeout(activityTimer.current)
      window.removeEventListener('pointerdown', scheduleAway)
      window.removeEventListener('keydown', scheduleAway)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibility)
      clearPresence()
    }
  }, [applyStatus, user?.id])

  const subscribe = useCallback((scope: PresenceScope, listener: (snapshot: PresenceSnapshot) => void) => {
    if (!user || statusRef.current === 'offline') {
      listener({ connected: false, users: new Map() })
      return () => undefined
    }
    return subscribeToPresence(scope, user.id, statusRef.current, listener)
  }, [user?.id])

  const value = useMemo(() => ({ ownStatus, subscribe }), [ownStatus, subscribe])
  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>
}
