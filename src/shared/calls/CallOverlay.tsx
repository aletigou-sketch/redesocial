import { LoaderCircle, Mic, Phone, PhoneOff } from 'lucide-react'
import { useCalls } from './CallContext'
import './calls.css'

const labels = {
  initiating: 'Iniciando chamada…',
  ringing: 'Chamando…',
  receiving: 'Chamada de áudio recebida',
  connecting: 'Conectando áudio…',
  connected: 'Chamada conectada',
  ending: 'Encerrando…',
  ended: 'Chamada encerrada',
  declined: 'Chamada recusada',
  failed: 'Falha na chamada',
}

export function CallOverlay() {
  const { call, acceptCall, declineCall, endCall, dismissCall } = useCalls()
  if (!call) return null
  const finished = call.status === 'ended' || call.status === 'declined' || call.status === 'failed'
  const pending = call.status === 'initiating' || call.status === 'connecting' || call.status === 'ending'
  const titleId = `call-title-${call.callId}`
  const statusId = `call-status-${call.callId}`

  return <aside className={`call-overlay is-${call.status}`} role="dialog" aria-modal="false" aria-labelledby={titleId} aria-describedby={statusId}>
    <div className="call-avatar"><Mic aria-hidden="true" /></div>
    <div className="call-copy"><strong id={titleId}>{call.displayName}</strong><small>@{call.username}</small><span id={statusId} aria-live="polite">{labels[call.status]}</span>{call.error && <p role="alert">{call.error}</p>}</div>
    <div className="call-actions">
      {call.status === 'receiving' && <><button type="button" className="call-button accept" onClick={() => void acceptCall()} aria-label="Aceitar chamada"><Phone aria-hidden="true" /></button><button type="button" className="call-button decline" onClick={() => void declineCall()} aria-label="Recusar chamada"><PhoneOff aria-hidden="true" /></button></>}
      {!finished && call.status !== 'receiving' && <button type="button" className="call-button decline" disabled={call.status === 'ending'} onClick={() => void endCall()} aria-label="Encerrar chamada">{pending && call.status !== 'ringing' ? <LoaderCircle className="spin" aria-hidden="true" /> : <PhoneOff aria-hidden="true" />}</button>}
      {finished && <button type="button" className="secondary-button" onClick={dismissCall}>Fechar</button>}
    </div>
  </aside>
}
