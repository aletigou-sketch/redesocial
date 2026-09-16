import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { LoaderCircle, MessageCircle, Phone, Plus, RefreshCw, Send, Video } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthContext'
import { useCalls } from '../../shared/calls/CallContext'
import { usePresenceScope } from '../../shared/presence/PresenceContext'
import { createConversation, fetchConversations, fetchMessages, messagePageSize, MessageServiceError, sendMessage, subscribeToMessages, unsubscribeFromMessages, type Conversation, type Message } from './messageService'
import './messages.css'

function errorText(cause: unknown, fallback: string) {
  return cause instanceof MessageServiceError ? cause.message : fallback
}

function mergeMessages(current: Message[], incoming: Message[]) {
  const values = new Map(current.map((message) => [message.clientMessageId, message]))
  for (const message of incoming) values.set(message.clientMessageId, message)
  return [...values.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

export function MessagesPage() {
  const { user, signOut } = useAuth()
  const { call, registerPeers, startCall } = useCalls()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [historyStatus, setHistoryStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [hasOlder, setHasOlder] = useState(false)
  const [connected, setConnected] = useState(false)
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [newParticipant, setNewParticipant] = useState('')
  const [creating, setCreating] = useState(false)
  const request = useRef(0)
  const selectedId = useRef<string | null>(null)
  selectedId.current = selected?.id ?? null
  const presence = usePresenceScope(selected ? { kind: 'conversation', id: selected.id } : null)
  const otherPresence = selected ? presence.users.get(selected.otherUserId) ?? 'offline' : 'offline'

  const handleError = useCallback(async (cause: unknown, fallback: string) => {
    if (cause instanceof MessageServiceError && cause.code === 'session_expired') {
      await signOut()
      return
    }
    setError(errorText(cause, fallback))
  }, [signOut])

  const loadConversations = useCallback(async () => {
    setStatus('loading')
    setError('')
    try {
      const result = await fetchConversations()
      setConversations(result)
      setSelected((current) => current ? result.find((item) => item.id === current.id) ?? result[0] ?? null : result[0] ?? null)
      setStatus('ready')
    } catch (cause) {
      setStatus('error')
      await handleError(cause, 'Não foi possível carregar suas conversas.')
    }
  }, [handleError, user?.id])

  useEffect(() => { void loadConversations() }, [loadConversations])

  useEffect(() => {
    registerPeers(conversations.map((conversation) => ({ conversationId: conversation.id, userId: conversation.otherUserId, displayName: conversation.displayName, username: conversation.username })))
  }, [conversations, registerPeers])

  useEffect(() => {
    const conversationId = selected?.id
    const currentRequest = ++request.current
    setMessages([])
    setConnected(false)
    if (!conversationId) return

    setHistoryStatus('loading')
    void fetchMessages(conversationId).then((result) => {
      if (request.current !== currentRequest) return
      setMessages((current) => mergeMessages(result, current.filter((message) => message.conversationId === conversationId)))
      setHasOlder(result.length === messagePageSize)
      setHistoryStatus('idle')
    }).catch(async (cause) => {
      if (request.current !== currentRequest) return
      setHistoryStatus('error')
      await handleError(cause, 'Não foi possível carregar as mensagens.')
    })

    const channel = subscribeToMessages(conversationId, (message) => {
      if (request.current === currentRequest && message.conversationId === conversationId) {
        setMessages((current) => mergeMessages(current, [message]))
      }
    }, (isConnected) => {
      if (request.current === currentRequest) setConnected(isConnected)
    })
    return () => { request.current += 1; void unsubscribeFromMessages(channel) }
  }, [handleError, selected?.id])

  async function loadOlder() {
    const oldest = messages[0]
    if (!selected || !oldest || historyStatus === 'loading') return
    const conversationId = selected.id
    const currentRequest = request.current
    setHistoryStatus('loading')
    try {
      const result = await fetchMessages(conversationId, oldest)
      if (request.current !== currentRequest || selectedId.current !== conversationId) return
      setMessages((current) => mergeMessages(result, current))
      setHasOlder(result.length === messagePageSize)
      setHistoryStatus('idle')
    } catch (cause) {
      if (request.current !== currentRequest || selectedId.current !== conversationId) return
      setHistoryStatus('error')
      await handleError(cause, 'Não foi possível carregar mensagens anteriores.')
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!selected || !body.trim()) return
    const text = body.trim()
    const conversationId = selected.id
    const retryId = crypto.randomUUID()
    const optimistic: Message = { id: retryId, conversationId, senderId: user?.id ?? '', clientMessageId: retryId, body: text, createdAt: new Date().toISOString(), delivery: 'sending' }
    setBody('')
    setMessages((current) => mergeMessages(current, [optimistic]))
    try {
      const sent = await sendMessage(conversationId, text, retryId)
      if (selectedId.current === conversationId) {
        setMessages((current) => mergeMessages(current.filter((item) => item.clientMessageId !== retryId), [sent]))
      }
      void loadConversations()
    } catch (cause) {
      if (selectedId.current === conversationId) {
        setMessages((current) => current.map((item) => item.clientMessageId === retryId ? { ...item, delivery: 'error' } : item))
      }
      await handleError(cause, 'Não foi possível enviar a mensagem.')
    }
  }

  async function retry(message: Message) {
    if (!selected || message.delivery !== 'error' || message.conversationId !== selected.id) return
    const conversationId = selected.id
    setMessages((current) => current.map((item) => item.clientMessageId === message.clientMessageId ? { ...item, delivery: 'sending' } : item))
    try {
      const sent = await sendMessage(conversationId, message.body, message.clientMessageId)
      if (selectedId.current === conversationId) {
        setMessages((current) => mergeMessages(current.filter((item) => item.clientMessageId !== message.clientMessageId), [sent]))
      }
    } catch (cause) {
      if (selectedId.current === conversationId) {
        setMessages((current) => current.map((item) => item.clientMessageId === message.clientMessageId ? { ...item, delivery: 'error' } : item))
      }
      await handleError(cause, 'A mensagem ainda não pôde ser enviada.')
    }
  }

  async function startConversation(event: FormEvent) {
    event.preventDefault()
    if (creating) return
    setCreating(true)
    setError('')
    try {
      const id = await createConversation(newParticipant.trim())
      setNewParticipant('')
      await loadConversations()
      setSelected((await fetchConversations()).find((item) => item.id === id) ?? null)
    } catch (cause) {
      await handleError(cause, 'Não foi possível iniciar a conversa.')
    } finally {
      setCreating(false)
    }
  }

  return <section className="messages-page">
    <header className="messages-header"><div><p className="eyebrow">CONVERSAS PRIVADAS</p><h1>Mensagens</h1><p>Somente você e a outra pessoa podem acessar este histórico.</p></div></header>
    {error && <div className="messages-alert" role="alert">{error}</div>}
    <div className="messages-shell card">
      <aside className="messages-sidebar">
        <form className="new-conversation" onSubmit={startConversation}><label htmlFor="participant-id">Nova conversa</label><div><input id="participant-id" value={newParticipant} onChange={(event) => setNewParticipant(event.target.value)} placeholder="ID de um perfil disponível" required /><button className="icon-button" disabled={creating} aria-label="Iniciar conversa">{creating ? <LoaderCircle className="spin" /> : <Plus />}</button></div></form>
        {status === 'loading' && <div className="messages-side-state"><LoaderCircle className="spin" /> Carregando…</div>}
        {status === 'error' && <button className="secondary-button" onClick={() => void loadConversations()}><RefreshCw size={16} /> Tentar novamente</button>}
        {status === 'ready' && conversations.length === 0 && <div className="messages-side-state"><MessageCircle /><strong>Nenhuma conversa</strong><span>Inicie uma conversa com um perfil disponível.</span></div>}
        <div className="messages-conversations">{conversations.map((conversation) => <button key={conversation.id} className={selected?.id === conversation.id ? 'is-active' : ''} onClick={() => setSelected(conversation)}><span className="message-avatar">{conversation.displayName.slice(0, 2).toUpperCase()}</span><span><strong>{conversation.displayName}</strong><small>@{conversation.username}</small><small>{conversation.lastMessage ?? 'Conversa iniciada'}</small></span></button>)}</div>
      </aside>
      <div className="messages-thread">
        {!selected ? <div className="messages-empty"><MessageCircle size={42} /><h2>Escolha uma conversa</h2><p>Seu histórico privado aparecerá aqui.</p></div> : <>
          <header className="thread-header"><div><strong>{selected.displayName}</strong><small>@{selected.username}</small></div><div className="thread-header-actions"><div className="thread-status"><span className={`presence-label is-${otherPresence}`}><i aria-hidden="true" />{otherPresence === 'online' ? 'Online' : otherPresence === 'away' ? 'Ausente' : 'Offline'}</span><span className={connected ? 'is-online' : ''}>{connected ? 'Mensagens conectadas' : 'Reconectando mensagens…'}</span>{!presence.connected && <small>Presença reconectando…</small>}</div><button className="icon-button call-start" disabled={Boolean(call)} onClick={() => void startCall({ conversationId: selected.id, userId: selected.otherUserId, displayName: selected.displayName, username: selected.username }, 'audio')} aria-label={`Ligar para ${selected.displayName}`} title="Iniciar chamada de áudio"><Phone size={19} /></button><button className="icon-button call-start" disabled={Boolean(call)} onClick={() => void startCall({ conversationId: selected.id, userId: selected.otherUserId, displayName: selected.displayName, username: selected.username }, 'video')} aria-label={`Iniciar videochamada com ${selected.displayName}`} title="Iniciar videochamada"><Video size={19} /></button></div></header>
          <div className="thread-history" aria-live="polite">
            {hasOlder && <button className="history-button" onClick={() => void loadOlder()} disabled={historyStatus === 'loading'}>{historyStatus === 'loading' ? 'Carregando…' : 'Carregar anteriores'}</button>}
            {historyStatus === 'loading' && messages.length === 0 && <div className="messages-empty"><LoaderCircle className="spin" /> Carregando histórico…</div>}
            {historyStatus !== 'loading' && messages.length === 0 && <div className="messages-empty"><p>Nenhuma mensagem ainda. Comece a conversa.</p></div>}
            {messages.map((message) => <div key={message.clientMessageId} className={`message-bubble ${message.senderId === user?.id ? 'is-own' : ''}`}><p>{message.body}</p><small>{new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.createdAt))}{message.delivery === 'sending' ? ' · enviando' : message.delivery === 'error' ? ' · erro' : ' · enviado'}</small>{message.delivery === 'error' && <button onClick={() => void retry(message)}>Tentar novamente</button>}</div>)}
          </div>
          <form className="message-composer" onSubmit={submit}><label className="visually-hidden" htmlFor="message-body">Mensagem</label><textarea id="message-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} rows={2} placeholder="Escreva uma mensagem…" /><button className="primary-button" disabled={!body.trim()}><Send size={17} /> Enviar</button></form>
        </>}
      </div>
    </div>
  </section>
}
