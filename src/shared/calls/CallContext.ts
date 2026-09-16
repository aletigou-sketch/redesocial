import { createContext, useContext } from 'react'

export type CallStatus = 'initiating' | 'ringing' | 'receiving' | 'connecting' | 'connected' | 'ending' | 'ended' | 'declined' | 'failed'
export type CallKind = 'audio' | 'video'

export interface CallPeer {
  conversationId: string
  userId: string
  displayName: string
  username: string
}

export interface ActiveCall extends CallPeer {
  callId: string
  kind: CallKind
  direction: 'outgoing' | 'incoming'
  status: CallStatus
  error: string | null
  microphoneEnabled: boolean
  cameraEnabled: boolean
  localStream: MediaStream | null
  remoteStream: MediaStream | null
}

export interface CallContextValue {
  call: ActiveCall | null
  registerPeers: (peers: CallPeer[]) => void
  startCall: (peer: CallPeer, kind?: CallKind) => Promise<void>
  acceptCall: () => Promise<void>
  declineCall: () => Promise<void>
  endCall: () => Promise<void>
  toggleMicrophone: () => void
  toggleCamera: () => void
  dismissCall: () => void
}

export const CallContext = createContext<CallContextValue | null>(null)

export function useCalls(): CallContextValue {
  const context = useContext(CallContext)
  if (!context) throw new Error('useCalls deve ser usado dentro de CallProvider.')
  return context
}
