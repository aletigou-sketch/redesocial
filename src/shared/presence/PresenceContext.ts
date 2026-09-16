import { createContext, useContext, useEffect, useState } from 'react'
import type { PresenceScope, PresenceSnapshot, PresenceStatus } from './presenceService'

export interface PresenceContextValue {
  ownStatus: PresenceStatus
  subscribe: (scope: PresenceScope, listener: (snapshot: PresenceSnapshot) => void) => () => void
}

export const PresenceContext = createContext<PresenceContextValue | null>(null)

export function usePresence() {
  const context = useContext(PresenceContext)
  if (!context) throw new Error('usePresence deve ser usado dentro de PresenceProvider.')
  return context
}

export function usePresenceScope(scope: PresenceScope | null): PresenceSnapshot {
  const { subscribe } = usePresence()
  const [snapshot, setSnapshot] = useState<PresenceSnapshot>(() => ({ connected: false, users: new Map() }))

  useEffect(() => {
    setSnapshot({ connected: false, users: new Map() })
    if (!scope) return
    return subscribe(scope, setSnapshot)
  }, [scope?.id, scope?.kind, subscribe])

  return snapshot
}
