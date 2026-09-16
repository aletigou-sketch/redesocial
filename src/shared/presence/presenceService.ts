import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../supabase/client'

export type PresenceStatus = 'online' | 'away' | 'offline'
export type PresenceScope = { kind: 'conversation' | 'group'; id: string }
export interface PresenceSnapshot {
  connected: boolean
  users: ReadonlyMap<string, Exclude<PresenceStatus, 'offline'>>
}

type Listener = (snapshot: PresenceSnapshot) => void
interface PresencePayload { user_id?: unknown; status?: unknown }
interface Entry {
  channel: RealtimeChannel
  listeners: Set<Listener>
  userId: string
  status: Exclude<PresenceStatus, 'offline'>
  connected: boolean
  generation: number
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const entries = new Map<string, Entry>()

function client() {
  if (!supabase) throw new Error('Presença não está disponível neste ambiente.')
  return supabase
}

function topicFor(scope: PresenceScope): string {
  if (!UUID_PATTERN.test(scope.id)) throw new Error('O contexto de presença é inválido.')
  return `presence:${scope.kind}:${scope.id.toLowerCase()}`
}

function readSnapshot(entry: Entry): PresenceSnapshot {
  const users = new Map<string, Exclude<PresenceStatus, 'offline'>>()
  const state = entry.channel.presenceState<PresencePayload>()
  for (const presences of Object.values(state)) {
    for (const presence of presences) {
      if (typeof presence.user_id !== 'string' || !UUID_PATTERN.test(presence.user_id)) continue
      const status = presence.status === 'away' ? 'away' : presence.status === 'online' ? 'online' : null
      if (!status) continue
      if (status === 'online' || !users.has(presence.user_id)) users.set(presence.user_id, status)
    }
  }
  return { connected: entry.connected, users }
}

function emit(entry: Entry) {
  const snapshot = readSnapshot(entry)
  for (const listener of entry.listeners) listener(snapshot)
}

async function track(entry: Entry) {
  const generation = entry.generation
  await entry.channel.track({ user_id: entry.userId, status: entry.status })
  if (entry.generation !== generation) return
  emit(entry)
}

export function subscribeToPresence(
  scope: PresenceScope,
  userId: string,
  status: Exclude<PresenceStatus, 'offline'>,
  listener: Listener,
): () => void {
  if (!UUID_PATTERN.test(userId)) throw new Error('A sessão de presença é inválida.')
  const topic = topicFor(scope)
  let entry = entries.get(topic)

  if (!entry) {
    const channel = client().channel(topic, { config: { private: true, presence: { key: userId } } })
    entry = { channel, listeners: new Set(), userId, status, connected: false, generation: 0 }
    entries.set(topic, entry)
    const current = entry
    channel
      .on('presence', { event: 'sync' }, () => emit(current))
      .on('presence', { event: 'join' }, () => emit(current))
      .on('presence', { event: 'leave' }, () => emit(current))
      .subscribe((channelStatus) => {
        const active = entries.get(topic)
        if (active !== current) return
        current.connected = channelStatus === 'SUBSCRIBED'
        current.generation += 1
        emit(current)
        if (current.connected) void track(current).catch(() => {
          current.connected = false
          emit(current)
        })
      })
  } else if (entry.userId !== userId) {
    throw new Error('O contexto de presença pertence a outra sessão.')
  }

  entry.status = status
  entry.listeners.add(listener)
  listener(readSnapshot(entry))
  if (entry.connected) void track(entry).catch(() => undefined)

  return () => {
    const active = entries.get(topic)
    if (!active) return
    active.listeners.delete(listener)
    if (active.listeners.size) return
    entries.delete(topic)
    active.generation += 1
    active.connected = false
    void active.channel.untrack().catch(() => undefined).finally(() => {
      if (supabase) void supabase.removeChannel(active.channel)
    })
  }
}

export function updateLocalPresence(userId: string, status: Exclude<PresenceStatus, 'offline'>) {
  for (const entry of entries.values()) {
    if (entry.userId !== userId || entry.status === status) continue
    entry.status = status
    entry.generation += 1
    if (entry.connected) void track(entry).catch(() => undefined)
  }
}

export function clearPresence() {
  for (const [topic, entry] of entries) {
    entries.delete(topic)
    entry.generation += 1
    entry.connected = false
    void entry.channel.untrack().catch(() => undefined).finally(() => {
      if (supabase) void supabase.removeChannel(entry.channel)
    })
  }
}
