import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../supabase/client'

export type SignalMessage =
  | { type: 'invite'; callId: string; from: string; to: string }
  | { type: 'accept' | 'decline' | 'end'; callId: string; from: string; to: string }
  | { type: 'offer' | 'answer'; callId: string; from: string; to: string; description: RTCSessionDescriptionInit }
  | { type: 'ice'; callId: string; from: string; to: string; candidate: RTCIceCandidateInit }

export interface CallChannel {
  conversationId: string
  channel: RealtimeChannel
  connected: boolean
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function client() {
  if (!supabase) throw new Error('Chamadas não estão disponíveis neste ambiente.')
  return supabase
}

function validateId(value: string) {
  if (!UUID_PATTERN.test(value)) throw new Error('O contexto da chamada é inválido.')
  return value.toLowerCase()
}

function validSignal(value: unknown): value is SignalMessage {
  if (!value || typeof value !== 'object') return false
  const signal = value as Partial<SignalMessage>
  return typeof signal.type === 'string'
    && ['invite', 'accept', 'decline', 'end', 'offer', 'answer', 'ice'].includes(signal.type)
    && typeof signal.callId === 'string' && UUID_PATTERN.test(signal.callId)
    && typeof signal.from === 'string' && UUID_PATTERN.test(signal.from)
    && typeof signal.to === 'string' && UUID_PATTERN.test(signal.to)
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
    channel: client().channel(`call:conversation:${normalizedId}`, {
      config: { private: true, broadcast: { self: false, ack: true } },
    }),
  }

  entry.channel
    .on('broadcast', { event: 'signal' }, ({ payload }) => {
      if (validSignal(payload)) onSignal(payload)
    })
    .subscribe((status) => {
      entry.connected = status === 'SUBSCRIBED'
      onStatus(entry.connected)
    })

  return entry
}

export async function sendSignal(entry: CallChannel, signal: SignalMessage) {
  if (!entry.connected) throw new Error('A sinalização da chamada está desconectada.')
  const result = await entry.channel.send({ type: 'broadcast', event: 'signal', payload: signal })
  if (result !== 'ok') throw new Error('Não foi possível enviar a sinalização da chamada.')
}

export async function closeCallChannel(entry: CallChannel) {
  if (supabase) await supabase.removeChannel(entry.channel).catch(() => undefined)
}

export function createAudioPeer(
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

export async function requestAudioStream() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador não oferece acesso ao microfone.')
  return navigator.mediaDevices.getUserMedia({ audio: true, video: false })
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}
