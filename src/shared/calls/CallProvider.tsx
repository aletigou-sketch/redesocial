import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ActiveCall, CallContext, type CallPeer } from './CallContext'
import { closeCallChannel, createAudioPeer, openCallChannel, requestAudioStream, sendSignal, stopStream, type CallChannel, type SignalMessage } from './callService'
import { CallOverlay } from './CallOverlay'

interface Runtime {
  callId: string
  conversationId: string
  peer: RTCPeerConnection | null
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  pendingIce: RTCIceCandidateInit[]
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [call, setCall] = useState<ActiveCall | null>(null)
  const channels = useRef(new Map<string, CallChannel>())
  const peers = useRef(new Map<string, CallPeer>())
  const runtime = useRef<Runtime | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const userId = useRef(user?.id.toLowerCase() ?? null)
  userId.current = user?.id.toLowerCase() ?? null

  const setFailure = useCallback((message: string) => {
    setCall((current) => current ? { ...current, status: 'failed', error: message } : current)
  }, [])

  const cleanupMedia = useCallback(() => {
    const current = runtime.current
    if (!current) return
    current.peer?.close()
    stopStream(current.localStream)
    stopStream(current.remoteStream)
    if (audio.current) audio.current.srcObject = null
    runtime.current = null
  }, [])

  const signal = useCallback(async (conversationId: string, message: SignalMessage) => {
    const channel = channels.current.get(conversationId)
    if (!channel) throw new Error('A conversa não está conectada à sinalização.')
    await sendSignal(channel, message)
  }, [])

  const attachPeer = useCallback(async (currentCall: ActiveCall) => {
    const current = runtime.current
    if (!current || current.callId !== currentCall.callId || current.peer) return current?.peer ?? null
    const stream = await requestAudioStream()
    if (runtime.current !== current) {
      stopStream(stream)
      return null
    }
    current.localStream = stream
    const peer = createAudioPeer(
      (candidate) => void signal(currentCall.conversationId, { type: 'ice', callId: currentCall.callId, from: userId.current!, to: currentCall.userId, candidate }).catch(() => setFailure('A conexão de áudio perdeu a sinalização.')),
      (remoteStream) => {
        current.remoteStream = remoteStream
        if (audio.current) {
          audio.current.srcObject = remoteStream
          void audio.current.play().catch(() => setFailure('Não foi possível reproduzir o áudio recebido.'))
        }
      },
      (state) => {
        if (state === 'connected') setCall((value) => value?.callId === currentCall.callId ? { ...value, status: 'connected', error: null } : value)
        if (state === 'failed' || state === 'closed') setFailure('A conexão de áudio foi encerrada.')
        if (state === 'disconnected') setCall((value) => value?.callId === currentCall.callId ? { ...value, status: 'connecting' } : value)
      },
    )
    current.peer = peer
    stream.getTracks().forEach((track) => peer.addTrack(track, stream))
    for (const candidate of current.pendingIce.splice(0)) await peer.addIceCandidate(candidate)
    return peer
  }, [setFailure, signal])

  const handleSignal = useCallback(async (conversationId: string, incoming: SignalMessage) => {
    const ownId = userId.current
    if (!ownId || incoming.to.toLowerCase() !== ownId || incoming.from.toLowerCase() === ownId) return
    const registeredPeer = peers.current.get(conversationId)
    if (!registeredPeer || registeredPeer.userId.toLowerCase() !== incoming.from.toLowerCase()) return

    if (incoming.type === 'invite') {
      if (runtime.current) {
        await signal(conversationId, { type: 'decline', callId: incoming.callId, from: ownId, to: incoming.from }).catch(() => undefined)
        return
      }
      runtime.current = { callId: incoming.callId, conversationId, peer: null, localStream: null, remoteStream: null, pendingIce: [] }
      setCall({ ...registeredPeer, callId: incoming.callId, direction: 'incoming', status: 'receiving', error: null })
      return
    }

    const current = runtime.current
    if (!current || current.callId !== incoming.callId || current.conversationId !== conversationId) return

    if (incoming.type === 'decline') {
      cleanupMedia()
      setCall((value) => value ? { ...value, status: 'declined' } : value)
      return
    }
    if (incoming.type === 'end') {
      cleanupMedia()
      setCall((value) => value ? { ...value, status: 'ended' } : value)
      return
    }
    if (incoming.type === 'accept') {
      const snapshot = call
      if (!snapshot || snapshot.callId !== incoming.callId || snapshot.direction !== 'outgoing') return
      setCall({ ...snapshot, status: 'connecting' })
      const peer = await attachPeer(snapshot)
      if (!peer) return
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      await signal(conversationId, { type: 'offer', callId: incoming.callId, from: ownId, to: incoming.from, description: offer })
      return
    }
    if (incoming.type === 'offer') {
      const snapshot = call
      if (!snapshot || snapshot.callId !== incoming.callId || snapshot.direction !== 'incoming') return
      const peer = await attachPeer(snapshot)
      if (!peer) return
      await peer.setRemoteDescription(incoming.description)
      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)
      await signal(conversationId, { type: 'answer', callId: incoming.callId, from: ownId, to: incoming.from, description: answer })
      return
    }
    if (incoming.type === 'answer' && current.peer) {
      await current.peer.setRemoteDescription(incoming.description)
      return
    }
    if (incoming.type === 'ice') {
      if (current.peer?.remoteDescription) await current.peer.addIceCandidate(incoming.candidate)
      else current.pendingIce.push(incoming.candidate)
    }
  }, [attachPeer, call, cleanupMedia, signal])

  const registerPeers = useCallback((nextPeers: CallPeer[]) => {
    if (!userId.current) return
    for (const peer of nextPeers) {
      const conversationId = peer.conversationId.toLowerCase()
      peers.current.set(conversationId, { ...peer, conversationId, userId: peer.userId.toLowerCase() })
      if (channels.current.has(conversationId)) continue
      const channel = openCallChannel(
        conversationId,
        (incoming) => void handleSignal(conversationId, incoming).catch(() => setFailure('A sinalização da chamada falhou.')),
        (connected) => {
          const active = runtime.current
          if (!connected && active?.conversationId === conversationId) setFailure('A sinalização da chamada foi desconectada.')
        },
      )
      channels.current.set(conversationId, channel)
    }
  }, [handleSignal, setFailure])

  const startCall = useCallback(async (peer: CallPeer) => {
    const ownId = userId.current
    if (!ownId || runtime.current || call) return
    registerPeers([peer])
    const callId = crypto.randomUUID()
    const next: ActiveCall = { ...peer, callId, direction: 'outgoing', status: 'initiating', error: null }
    runtime.current = { callId, conversationId: peer.conversationId.toLowerCase(), peer: null, localStream: null, remoteStream: null, pendingIce: [] }
    setCall(next)
    try {
      await signal(peer.conversationId.toLowerCase(), { type: 'invite', callId, from: ownId, to: peer.userId.toLowerCase() })
      setCall({ ...next, status: 'ringing' })
    } catch (cause) {
      cleanupMedia()
      setCall({ ...next, status: 'failed', error: cause instanceof Error ? cause.message : 'Não foi possível iniciar a chamada.' })
    }
  }, [call, cleanupMedia, registerPeers, signal])

  const acceptCall = useCallback(async () => {
    const snapshot = call
    const ownId = userId.current
    if (!snapshot || !ownId || snapshot.status !== 'receiving') return
    setCall({ ...snapshot, status: 'connecting', error: null })
    try {
      await attachPeer(snapshot)
      await signal(snapshot.conversationId, { type: 'accept', callId: snapshot.callId, from: ownId, to: snapshot.userId })
    } catch (cause) {
      cleanupMedia()
      setCall({ ...snapshot, status: 'failed', error: cause instanceof DOMException && cause.name === 'NotAllowedError' ? 'Permissão de microfone recusada.' : 'Não foi possível acessar o microfone.' })
    }
  }, [attachPeer, call, cleanupMedia, signal])

  const finish = useCallback(async (kind: 'decline' | 'end') => {
    const snapshot = call
    const ownId = userId.current
    if (!snapshot || !ownId) return
    setCall({ ...snapshot, status: 'ending' })
    await signal(snapshot.conversationId, { type: kind, callId: snapshot.callId, from: ownId, to: snapshot.userId }).catch(() => undefined)
    cleanupMedia()
    setCall({ ...snapshot, status: kind === 'decline' ? 'declined' : 'ended', error: null })
  }, [call, cleanupMedia, signal])

  const dismissCall = useCallback(() => {
    cleanupMedia()
    setCall(null)
  }, [cleanupMedia])

  useEffect(() => {
    const close = () => {
      const currentCall = call
      const ownId = userId.current
      if (currentCall && ownId) void signal(currentCall.conversationId, { type: 'end', callId: currentCall.callId, from: ownId, to: currentCall.userId }).catch(() => undefined)
      cleanupMedia()
    }
    window.addEventListener('pagehide', close)
    return () => window.removeEventListener('pagehide', close)
  }, [call, cleanupMedia, signal])

  useEffect(() => () => {
    cleanupMedia()
    for (const channel of channels.current.values()) void closeCallChannel(channel)
    channels.current.clear()
    peers.current.clear()
  }, [cleanupMedia, user?.id])

  const value = useMemo(() => ({ call, registerPeers, startCall, acceptCall, declineCall: () => finish('decline'), endCall: () => finish('end'), dismissCall }), [acceptCall, call, dismissCall, finish, registerPeers, startCall])

  return <CallContext.Provider value={value}>{children}<audio ref={audio} autoPlay /><CallOverlay /></CallContext.Provider>
}
