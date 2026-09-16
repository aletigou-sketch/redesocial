import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../supabase/client'

export type CallMediaKind = 'audio' | 'video'

export type SignalMessage =
  | { type: 'invite'; callId: string; from: string; to: string; kind: CallMediaKind }
  | { type: 'accept' | 'decline' | 'end'; callId: string; from: string; to: string }
  | { type: 'offer' | 'answer'; callId: string; from: string; to: string; description: RTCSessionDescriptionInit }
  | { type: 'ice'; callId: string; from: string; to: string; candidate: RTCIceCandidateInit }

export interface CallChannel {
  conversationId: string
  channel: RealtimeChannel
  connected: boolean
  closed: boolean
  waiters: Set<(connected: boolean) => void>
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SIGNAL_TIMEOUT_MS = 8_000

function client() {
  if (!supabase) throw new Error('Chamadas não estão disponíveis neste ambiente.')
  return supabase
}

function validateId(value: string) {
  if (!UUID_PATTERN.test(value)) throw new Error('O contexto da chamada é inválido.')
  return value.toLowerCase()
}

function isDescription(value: unknown): value is RTCSessionDescriptionInit {
  if (!value || typeof value !== 'object') return false
  const description = value as Partial<RTCSessionDescriptionInit>
  return (description.type === 'offer' || description.type === 'answer')
    && typeof description.sdp === 'string'
    && description.sdp.length > 0
    && description.sdp.length <= 200_000
}

function isCandidate(value: unknown): value is RTCIceCandidateInit {
  if (!value || typeof value !== 'object') return false
  const candidate = value as RTCIceCandidateInit
  return (candidate.candidate === undefined || (typeof candidate.candidate === 'string' && candidate.candidate.length <= 10_000))
    && (candidate.sdpMid === undefined || candidate.sdpMid === null || typeof candidate.sdpMid === 'string')
    && (candidate.sdpMLineIndex === undefined || candidate.sdpMLineIndex === null || Number.isInteger(candidate.sdpMLineIndex))
}

function validSignal(value: unknown): value is SignalMessage {
  if (!value || typeof value !== 'object') return false
  const signal = value as Record<string, unknown>
  if (typeof signal.type !== 'string'
    || !['invite', 'accept', 'decline', 'end', 'offer', 'answer', 'ice'].includes(signal.type)
    || typeof signal.callId !== 'string' || !UUID_PATTERN.test(signal.callId)
    || typeof signal.from !== 'string' || !UUID_PATTERN.test(signal.from)
    || typeof signal.to !== 'string' || !UUID_PATTERN.test(signal.to)) return false
  if (signal.type === 'offer' || signal.type === 'answer') return isDescription(signal.description)
  if (signal.type === 'ice') return isCandidate(signal.candidate)
  if (signal.type === 'invite') return signal.kind === 'audio' || signal.kind === 'video'
  return true
}

function notifyWaiters(entry: CallChannel, connected: boolean) {
  for (const resolve of entry.waiters) resolve(connected)
  entry.waiters.clear()
}

async function waitUntilConnected(entry: CallChannel) {
  if (entry.connected) return
  if (entry.closed) throw new Error('A sinalização da chamada foi encerrada.')
  const connected = await new Promise<boolean>((resolve) => {
    const timer = window.setTimeout(() => {
      entry.waiters.delete(done)
      resolve(false)
    }, SIGNAL_TIMEOUT_MS)
    const done = (result: boolean) => {
      window.clearTimeout(timer)
      resolve(result)
    }
    entry.waiters.add(done)
  })
  if (!connected || entry.closed) throw new Error('A sinalização da chamada está desconectada.')
}

export function openCallChannel(
  conversationId: string,
  onSignal: (signal: SignalMessage) => void,
  onStatus: (connected: boolean) => void,
): CallChannel {
  const normalizedId = validateId(conversationId)
  const entry: CallChannel = {
    conversationId: normalizedId,
    connected: false,
    closed: false,
    waiters: new Set(),
    channel: client().channel(`call:conversation:${normalizedId}`, {
      config: { private: true, broadcast: { self: false, ack: true } },
    }),
  }

  entry.channel
    .on('broadcast', { event: 'signal' }, ({ payload }) => {
      if (!entry.closed && validSignal(payload)) onSignal(payload)
    })
    .subscribe((status) => {
      if (entry.closed) return
      const connected = status === 'SUBSCRIBED'
      entry.connected = connected
      if (connected) notifyWaiters(entry, true)
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') notifyWaiters(entry, false)
      onStatus(connected)
    })

  return entry
}

export async function sendSignal(entry: CallChannel, signal: SignalMessage) {
  await waitUntilConnected(entry)
  if (entry.closed) throw new Error('A sinalização da chamada foi encerrada.')
  const result = await entry.channel.send({ type: 'broadcast', event: 'signal', payload: signal })
  if (result !== 'ok') throw new Error('Não foi possível enviar a sinalização da chamada.')
}

export async function closeCallChannel(entry: CallChannel) {
  if (entry.closed) return
  entry.closed = true
  entry.connected = false
  notifyWaiters(entry, false)
  if (supabase) await supabase.removeChannel(entry.channel).catch(() => undefined)
}

export function createMediaPeer(
  onIce: (candidate: RTCIceCandidateInit) => void,
  onRemoteStream: (stream: MediaStream) => void,
  onConnectionState: (state: RTCPeerConnectionState) => void,
) {
  const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
  peer.addEventListener('icecandidate', (event) => {
    if (event.candidate) onIce(event.candidate.toJSON())
  })
  peer.addEventListener('track', (event) => {
    const stream = event.streams[0]
    if (stream) onRemoteStream(stream)
  })
  peer.addEventListener('connectionstatechange', () => onConnectionState(peer.connectionState))
  return peer
}

export async function requestMediaStream(kind: CallMediaKind) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador não oferece acesso aos dispositivos de mídia.')
  return navigator.mediaDevices.getUserMedia({
    audio: true,
    video: kind === 'video' ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false,
  })
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}
