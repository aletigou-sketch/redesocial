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
  status: PresenceStatus
  connected: boolean
  generation: number
  operations: Promise<void>
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

function isCurrent(topic: string, entry: Entry, generation: number) {
  return entries.get(topic) === entry && entry.generation === generation
}

function readSnapshot(entry: Entry): PresenceSnapshot {
  const users = new Map<string, Exclude<PresenceStatus, 'offline'>>()
  const state = entry.channel.presenceState<PresencePayload>()
  for (const presences of Object.values(state)) {
    for (const presence of presences) {
      if (typeof presence.user_id !== 'string' || !UUID_PATTERN.test(presence.user_id)) continue
      const userId = presence.user_id.toLowerCase()
      const status = presence.status === 'away' ? 'away' : presence.status === 'online' ? 'online' : null
      if (!status) continue
      if (status === 'online' || !users.has(userId)) users.set(userId, status)
    }
  }
  return { connected: entry.connected, users }
}

function emit(entry: Entry) {
  const snapshot = readSnapshot(entry)
  for (const listener of entry.listeners) listener(snapshot)
}

function queueReconcile(topic: string, entry: Entry) {
  const generation = entry.generation
  entry.operations = entry.operations.then(async () => {
    if (!isCurrent(topic, entry, generation) || !entry.connected) return
    if (entry.status === 'offline') {
      await entry.channel.untrack()
    } else {
      await entry.channel.track({ user_id: entry.userId, status: entry.status })
    }
    if (isCurrent(topic, entry, generation)) emit(entry)
  }).catch(() => {
    if (!isCurrent(topic, entry, generation)) return
    entry.connected = false
    emit(entry)
  })
}

function removeEntry(topic: string, entry: Entry) {
  if (entries.get(topic) === entry) entries.delete(topic)
  entry.generation += 1
  entry.connected = false
  const channel = entry.channel
  entry.operations = entry.operations.catch(() => undefined).then(async () => {
    await channel.untrack().catch(() => undefined)
    if (supabase) await supabase.removeChannel(channel).catch(() => undefined)
  })
}

function createEntry(topic: string, userId: string, status: PresenceStatus): Entry {
  const channel = client().channel(topic, { config: { private: true, presence: { key: userId } } })
  const entry: Entry = {
    channel,
    listeners: new Set(),
    userId: userId.toLowerCase(),
    status,
    connected: false,
    generation: 0,
    operations: Promise.resolve(),
  }
  entries.set(topic, entry)

  channel
    .on('presence', { event: 'sync' }, () => {
      if (entries.get(topic) === entry) emit(entry)
    })
    .on('presence', { event: 'join' }, () => {
      if (entries.get(topic) === entry) emit(entry)
    })
    .on('presence', { event: 'leave' }, () => {
      if (entries.get(topic) === entry) emit(entry)
    })
    .subscribe((channelStatus) => {
      if (entries.get(topic) !== entry) return
      entry.connected = channelStatus === 'SUBSCRIBED'
      entry.generation += 1
      emit(entry)
      if (entry.connected) queueReconcile(topic, entry)
    })

  return entry
}

export function subscribeToPresence(
  scope: PresenceScope,
  userId: string,
  status: PresenceStatus,
  listener: Listener,
): () => void {
  if (!UUID_PATTERN.test(userId)) throw new Error('A sessão de presença é inválida.')
  const normalizedUserId = userId.toLowerCase()
  const topic = topicFor(scope)
  let entry = entries.get(topic)

  if (entry && entry.userId !== normalizedUserId) {
    removeEntry(topic, entry)
    entry = undefined
  }
  if (!entry) entry = createEntry(topic, normalizedUserId, status)

  entry.status = status
  const subscriptionListener: Listener = (snapshot) => listener(snapshot)
  entry.listeners.add(subscriptionListener)
  listener(readSnapshot(entry))
  if (entry.connected) {
    entry.generation += 1
    queueReconcile(topic, entry)
  }

  return () => {
    const active = entries.get(topic)
    if (!active || active !== entry) return
    active.listeners.delete(subscriptionListener)
    if (!active.listeners.size) removeEntry(topic, active)
  }
}

export function updateLocalPresence(userId: string, status: PresenceStatus) {
  const normalizedUserId = userId.toLowerCase()
  for (const [topic, entry] of entries) {
    if (entry.userId !== normalizedUserId || entry.status === status) continue
    entry.status = status
    entry.generation += 1
    if (entry.connected) queueReconcile(topic, entry)
  }
}

export function clearPresence() {
  for (const [topic, entry] of [...entries]) removeEntry(topic, entry)
}
