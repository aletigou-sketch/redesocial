import { useEffect, useRef } from 'react'
import { Camera, CameraOff, LoaderCircle, Mic, MicOff, Phone, PhoneOff, Video } from 'lucide-react'
import { useCalls } from './CallContext'
import './calls.css'

const labels = {
  initiating: 'Iniciando chamada…',
  ringing: 'Chamando…',
  receiving: 'recebida',
  connecting: 'Conectando…',
  connected: 'Chamada conectada',
  ending: 'Encerrando…',
  ended: 'Chamada encerrada',
  declined: 'Chamada recusada',
  failed: 'Falha na chamada',
}

function MediaVideo({ stream, muted, label, className }: { stream: MediaStream | null; muted?: boolean; label: string; className: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    element.srcObject = stream
    if (stream) void element.play().catch(() => undefined)
    return () => { element.srcObject = null }
  }, [stream])
  return <video ref={ref} className={className} autoPlay playsInline muted={muted} aria-label={label} />
}

export function CallOverlay() {
  const { call, acceptCall, declineCall, endCall, toggleCamera, toggleMicrophone, dismissCall } = useCalls()
  if (!call) return null
  const finished = call.status === 'ended' || call.status === 'declined' || call.status === 'failed'
  const pending = call.status === 'initiating' || call.status === 'connecting' || call.status === 'ending'
  const activeMedia = call.status === 'connecting' || call.status === 'connected'
  const titleId = `call-title-${call.callId}`
  const statusId = `call-status-${call.callId}`

  return <aside className={`call-overlay is-${call.status} is-${call.kind}`} role="dialog" aria-modal="false" aria-labelledby={titleId} aria-describedby={statusId}>
    {call.kind === 'video' && <div className="call-video-stage">
      {call.remoteStream ? <MediaVideo stream={call.remoteStream} label={`Vídeo remoto de ${call.displayName}`} className="call-video-remote" /> : <div className="call-video-placeholder"><Video aria-hidden="true" /><span>{call.status === 'connected' ? 'Câmera remota indisponível' : 'Aguardando vídeo remoto'}</span></div>}
      {call.localStream && <MediaVideo stream={call.localStream} muted label="Prévia da sua câmera" className={`call-video-local ${call.cameraEnabled ? '' : 'is-camera-off'}`} />}
    </div>}
    <div className="call-avatar">{call.kind === 'video' ? <Video aria-hidden="true" /> : <Mic aria-hidden="true" />}</div>
    <div className="call-copy"><strong id={titleId}>{call.displayName}</strong><small>@{call.username}</small><span id={statusId} aria-live="polite">{call.status === 'receiving' ? `Videochamada ${labels.receiving}` : labels[call.status]}</span>{call.error && <p role="alert">{call.error}</p>}</div>
    <div className="call-actions">
      {call.status === 'receiving' && <><button type="button" className="call-button accept" onClick={() => void acceptCall()} aria-label={`Aceitar ${call.kind === 'video' ? 'videochamada' : 'chamada de áudio'}`}><Phone aria-hidden="true" /></button><button type="button" className="call-button decline" onClick={() => void declineCall()} aria-label="Recusar chamada"><PhoneOff aria-hidden="true" /></button></>}
      {!finished && call.status !== 'receiving' && <>
        {activeMedia && <button type="button" className={`call-button media ${call.microphoneEnabled ? '' : 'is-off'}`} onClick={toggleMicrophone} aria-label={call.microphoneEnabled ? 'Desativar microfone' : 'Ativar microfone'} aria-pressed={!call.microphoneEnabled}>{call.microphoneEnabled ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />}</button>}
        {activeMedia && call.kind === 'video' && <button type="button" className={`call-button media ${call.cameraEnabled ? '' : 'is-off'}`} onClick={toggleCamera} aria-label={call.cameraEnabled ? 'Desativar câmera' : 'Ativar câmera'} aria-pressed={!call.cameraEnabled}>{call.cameraEnabled ? <Camera aria-hidden="true" /> : <CameraOff aria-hidden="true" />}</button>}
        <button type="button" className="call-button decline" disabled={call.status === 'ending'} onClick={() => void endCall()} aria-label="Encerrar chamada">{pending && call.status !== 'ringing' ? <LoaderCircle className="spin" aria-hidden="true" /> : <PhoneOff aria-hidden="true" />}</button>
      </>}
      {finished && <button type="button" className="secondary-button" onClick={dismissCall}>Fechar</button>}
    </div>
  </aside>
}
