import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { CallContext, type ActiveCall, type CallPeer } from './CallContext'
import { closeCallChannel, createAudioPeer, openCallChannel, requestAudioStream, sendSignal, stopStream, type CallChannel, type SignalMessage } from './callService'
import { CallOverlay } from './CallOverlay'

interface Runtime {
  callId: string
  conversationId: string
  peer: RTCPeerConnection | null
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  pendingIce: RTCIceCandidateInit[]
  accepted: boolean
  offerHandled: boolean
  answerHandled: boolean
  generation: number
}

function microphoneError(cause: unknown) {
  if (cause instanceof DOMException && (cause.name === 'NotAllowedError' || cause.name === 'SecurityError')) return 'Permissão de microfone recusada.'
  if (cause instanceof DOMException && (cause.name === 'NotFoundError' || cause.name === 'DevicesNotFoundError')) return 'Nenhum microfone disponível foi encontrado.'
  if (cause instanceof DOMException && cause.name === 'NotReadableError') return 'O microfone está indisponível ou sendo usado por outro aplicativo.'
  return cause instanceof Error ? cause.message : 'Não foi possível acessar o microfone.'
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [call, setCallState] = useState<ActiveCall | null>(null)
  const callRef = useRef<ActiveCall | null>(null)
  const channels = useRef(new Map<string, CallChannel>())
  const peers = useRef(new Map<string, CallPeer>())
  const runtime = useRef<Runtime | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const userId = useRef(user?.id.toLowerCase() ?? null)
  const generation = useRef(0)
  userId.current = user?.id.toLowerCase() ?? null

  const updateCall = useCallback((next: ActiveCall | null | ((current: ActiveCall | null) => ActiveCall | null)) => {
    setCallState((current) => {
      const value = typeof next === 'function' ? next(current) : next
      callRef.current = value
      return value
    })
  }, [])

  const cleanupMedia = useCallback((expectedCallId?: string) => {
    const current = runtime.current
    if (!current || (expectedCallId && current.callId !== expectedCallId)) return
    generation.current += 1
    current.peer?.close()
    stopStream(current.localStream)
    stopStream(current.remoteStream)
    current.pendingIce.length = 0
    if (audio.current) audio.current.srcObject = null
    runtime.current = null
  }, [])

  const failCall = useCallback((callId: string, message: string) => {
    if (runtime.current?.callId !== callId && callRef.current?.callId !== callId) return
    cleanupMedia(callId)
    updateCall((current) => current?.callId === callId ? { ...current, status: 'failed', error: message } : current)
  }, [cleanupMedia, updateCall])

  const signal = useCallback(async (conversationId: string, message: SignalMessage) => {
    const channel = channels.current.get(conversationId.toLowerCase())
    if (!channel) throw new Error('A conversa não está conectada à sinalização.')
    await sendSignal(channel, message)
  }, [])

  const flushIce = useCallback(async (current: Runtime) => {
    if (!current.peer?.remoteDescription) return
    for (const candidate of current.pendingIce.splice(0)) {
      if (runtime.current !== current) return
      await current.peer.addIceCandidate(candidate)
    }
  }, [])

  const attachPeer = useCallback(async (currentCall: ActiveCall) => {
    const current = runtime.current
    if (!current || current.callId !== currentCall.callId) return null
    if (current.peer) return current.peer
    const expectedGeneration = current.generation
    const stream = await requestAudioStream()
    if (runtime.current !== current || generation.current !== expectedGeneration) {
      stopStream(stream)
      return null
    }
    current.localStream = stream
    const peer = createAudioPeer(
      (candidate) => {
        if (runtime.current !== current) return
        void signal(currentCall.conversationId, { type: 'ice', callId: currentCall.callId, from: userId.current ?? '', to: currentCall.userId, candidate })
          .catch(() => failCall(currentCall.callId, 'A conexão de áudio perdeu a sinalização.'))
      },
      (remoteStream) => {
        if (runtime.current !== current) {
          stopStream(remoteStream)
          return
        }
        current.remoteStream = remoteStream
        if (audio.current) {
          audio.current.srcObject = remoteStream
          void audio.current.play().catch(() => failCall(currentCall.callId, 'Não foi possível reproduzir o áudio recebido.'))
        }
      },
      (state) => {
        if (runtime.current !== current) return
        if (state === 'connected') updateCall((value) => value?.callId === currentCall.callId ? { ...value, status: 'connected', error: null } : value)
        if (state === 'failed' || state === 'closed') failCall(currentCall.callId, 'A conexão de áudio foi encerrada.')
        if (state === 'disconnected') updateCall((value) => value?.callId === currentCall.callId ? { ...value, status: 'connecting' } : value)
      },
    )
    current.peer = peer
    stream.getTracks().forEach((track) => peer.addTrack(track, stream))
    return peer
  }, [failCall, signal, updateCall])

  const handleSignal = useCallback(async (conversationId: string, incoming: SignalMessage) => {
    const ownId = userId.current
    if (!ownId || incoming.to.toLowerCase() !== ownId || incoming.from.toLowerCase() === ownId) return
    const registeredPeer = peers.current.get(conversationId)
    if (!registeredPeer || registeredPeer.userId !== incoming.from.toLowerCase()) return

    if (incoming.type === 'invite') {
      if (runtime.current || callRef.current) {
        await signal(conversationId, { type: 'decline', callId: incoming.callId, from: ownId, to: incoming.from }).catch(() => undefined)
        return
      }
      const nextGeneration = ++generation.current
      runtime.current = { callId: incoming.callId, conversationId, peer: null, localStream: null, remoteStream: null, pendingIce: [], accepted: false, offerHandled: false, answerHandled: false, generation: nextGeneration }
      updateCall({ ...registeredPeer, callId: incoming.callId, direction: 'incoming', status: 'receiving', error: null })
      return
    }

    const current = runtime.current
    const snapshot = callRef.current
    if (!current || !snapshot || current.callId !== incoming.callId || snapshot.callId !== incoming.callId || current.conversationId !== conversationId) return

    if (incoming.type === 'decline' || incoming.type === 'end') {
      cleanupMedia(incoming.callId)
      updateCall({ ...snapshot, status: incoming.type === 'decline' ? 'declined' : 'ended', error: null })
      return
    }
    if (incoming.type === 'accept') {
      if (snapshot.direction !== 'outgoing' || current.accepted || current.offerHandled) return
      current.accepted = true
      current.offerHandled = true
      updateCall({ ...snapshot, status: 'connecting', error: null })
      const peer = await attachPeer(snapshot)
      if (!peer || runtime.current !== current) return
      const offer = await peer.createOffer()
      if (runtime.current !== current) return
      await peer.setLocalDescription(offer)
      await signal(conversationId, { type: 'offer', callId: incoming.callId, from: ownId, to: incoming.from, description: offer })
      return
    }
    if (incoming.type === 'offer') {
      if (snapshot.direction !== 'incoming' || !current.accepted || current.offerHandled) return
      current.offerHandled = true
      const peer = await attachPeer(snapshot)
      if (!peer || runtime.current !== current) return
      await peer.setRemoteDescription(incoming.description)
      await flushIce(current)
      const answer = await peer.createAnswer()
      if (runtime.current !== current) return
      await peer.setLocalDescription(answer)
      await signal(conversationId, { type: 'answer', callId: incoming.callId, from: ownId, to: incoming.from, description: answer })
      return
    }
    if (incoming.type === 'answer') {
      if (snapshot.direction !== 'outgoing' || !current.accepted || !current.offerHandled || current.answerHandled || !current.peer || current.peer.signalingState !== 'have-local-offer') return
      current.answerHandled = true
      await current.peer.setRemoteDescription(incoming.description)
      await flushIce(current)
      return
    }
    if (incoming.type === 'ice') {
      if (current.pendingIce.length >= 256) throw new Error('Limite de candidatos ICE excedido.')
      if (current.peer?.remoteDescription) await current.peer.addIceCandidate(incoming.candidate)
      else current.pendingIce.push(incoming.candidate)
    }
  }, [attachPeer, cleanupMedia, flushIce, signal, updateCall])

  const registerPeers = useCallback((nextPeers: CallPeer[]) => {
    if (!userId.current) return
    const retained = new Set<string>()
    for (const peer of nextPeers) {
      const conversationId = peer.conversationId.toLowerCase()
      const normalized = { ...peer, conversationId, userId: peer.userId.toLowerCase() }
      retained.add(conversationId)
      peers.current.set(conversationId, normalized)
      if (channels.current.has(conversationId)) continue
      const channel = openCallChannel(
        conversationId,
        (incoming) => void handleSignal(conversationId, incoming).catch(() => {
          const active = runtime.current
          if (active?.conversationId === conversationId) failCall(active.callId, 'A sinalização da chamada falhou.')
        }),
        (connected) => {
          const active = runtime.current
          if (!connected && active?.conversationId === conversationId && callRef.current?.status === 'connected') {
            updateCall((value) => value?.callId === active.callId ? { ...value, status: 'connecting', error: null } : value)
          }
        },
      )
      channels.current.set(conversationId, channel)
    }
    for (const [conversationId, channel] of channels.current) {
      if (retained.has(conversationId) || runtime.current?.conversationId === conversationId) continue
      channels.current.delete(conversationId)
      peers.current.delete(conversationId)
      void closeCallChannel(channel)
    }
  }, [failCall, handleSignal, updateCall])

  const startCall = useCallback(async (peer: CallPeer) => {
    const ownId = userId.current
    if (!ownId || runtime.current || callRef.current) return
    registerPeers([peer])
    const conversationId = peer.conversationId.toLowerCase()
    const callId = crypto.randomUUID()
    const next: ActiveCall = { ...peer, conversationId, userId: peer.userId.toLowerCase(), callId, direction: 'outgoing', status: 'initiating', error: null }
    const nextGeneration = ++generation.current
    runtime.current = { callId, conversationId, peer: null, localStream: null, remoteStream: null, pendingIce: [], accepted: false, offerHandled: false, answerHandled: false, generation: nextGeneration }
    updateCall(next)
    try {
      await signal(conversationId, { type: 'invite', callId, from: ownId, to: next.userId })
      if (runtime.current?.callId === callId) updateCall({ ...next, status: 'ringing' })
    } catch (cause) {
      failCall(callId, cause instanceof Error ? cause.message : 'Não foi possível iniciar a chamada.')
    }
  }, [failCall, registerPeers, signal, updateCall])

  const acceptCall = useCallback(async () => {
    const snapshot = callRef.current
    const current = runtime.current
    const ownId = userId.current
    if (!snapshot || !current || !ownId || snapshot.status !== 'receiving' || current.callId !== snapshot.callId || current.accepted) return
    current.accepted = true
    updateCall({ ...snapshot, status: 'connecting', error: null })
    try {
      const peer = await attachPeer(snapshot)
      if (!peer || runtime.current !== current) return
      await signal(snapshot.conversationId, { type: 'accept', callId: snapshot.callId, from: ownId, to: snapshot.userId })
    } catch (cause) {
      failCall(snapshot.callId, microphoneError(cause))
    }
  }, [attachPeer, failCall, signal, updateCall])

  const finish = useCallback(async (kind: 'decline' | 'end') => {
    const snapshot = callRef.current
    const ownId = userId.current
    if (!snapshot || !ownId || snapshot.status === 'ending' || snapshot.status === 'ended' || snapshot.status === 'declined') return
    updateCall({ ...snapshot, status: 'ending' })
    await signal(snapshot.conversationId, { type: kind, callId: snapshot.callId, from: ownId, to: snapshot.userId }).catch(() => undefined)
    cleanupMedia(snapshot.callId)
    updateCall({ ...snapshot, status: kind === 'decline' ? 'declined' : 'ended', error: null })
  }, [cleanupMedia, signal, updateCall])

  const dismissCall = useCallback(() => {
    cleanupMedia()
    updateCall(null)
  }, [cleanupMedia, updateCall])

  useEffect(() => {
    const close = () => {
      const snapshot = callRef.current
      const ownId = userId.current
      if (snapshot && ownId) void signal(snapshot.conversationId, { type: 'end', callId: snapshot.callId, from: ownId, to: snapshot.userId }).catch(() => undefined)
      cleanupMedia()
    }
    const offline = () => {
      const snapshot = callRef.current
      if (snapshot && runtime.current) updateCall({ ...snapshot, status: 'connecting', error: 'Conexão de rede interrompida.' })
    }
    window.addEventListener('pagehide', close)
    window.addEventListener('offline', offline)
    return () => {
      window.removeEventListener('pagehide', close)
      window.removeEventListener('offline', offline)
    }
  }, [cleanupMedia, signal, updateCall])

  useEffect(() => {
    cleanupMedia()
    updateCall(null)
    for (const channel of channels.current.values()) void closeCallChannel(channel)
    channels.current.clear()
    peers.current.clear()
  }, [cleanupMedia, updateCall, user?.id])

  useEffect(() => () => {
    cleanupMedia()
    for (const channel of channels.current.values()) void closeCallChannel(channel)
    channels.current.clear()
    peers.current.clear()
  }, [cleanupMedia])

  const value = useMemo(() => ({ call, registerPeers, startCall, acceptCall, declineCall: () => finish('decline'), endCall: () => finish('end'), dismissCall }), [acceptCall, call, dismissCall, finish, registerPeers, startCall])

  return <CallContext.Provider value={value}>{children}<audio ref={audio} autoPlay aria-hidden="true" /><CallOverlay /></CallContext.Provider>
}
