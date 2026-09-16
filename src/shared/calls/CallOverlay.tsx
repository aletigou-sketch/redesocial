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

  return <aside className={`call-overlay is-${call.status}`} role="dialog" aria-modal="false" aria-label="Chamada de áudio">
    <div className="call-avatar"><Mic aria-hidden="true" /></div>
    <div className="call-copy"><strong>{call.displayName}</strong><small>@{call.username}</small><span>{labels[call.status]}</span>{call.error && <p role="alert">{call.error}</p>}</div>
    <div className="call-actions">
      {call.status === 'receiving' && <><button className="call-button accept" onClick={() => void acceptCall()} aria-label="Aceitar chamada"><Phone /></button><button className="call-button decline" onClick={() => void declineCall()} aria-label="Recusar chamada"><PhoneOff /></button></>}
      {!finished && call.status !== 'receiving' && <button className="call-button decline" disabled={call.status === 'ending'} onClick={() => void endCall()} aria-label="Encerrar chamada">{pending && call.status !== 'ringing' ? <LoaderCircle className="spin" /> : <PhoneOff />}</button>}
      {finished && <button className="secondary-button" onClick={dismissCall}>Fechar</button>}
    </div>
  </aside>
}
