import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../shared/supabase/client'

const PAGE_SIZE = 30
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface Conversation {
  id: string
  otherUserId: string
  username: string
  displayName: string
  updatedAt: string
  lastMessage: string | null
  lastMessageAt: string | null
}

export interface Message {
  id: string
  conversationId: string
  senderId: string
  clientMessageId: string
  body: string
  createdAt: string
  delivery?: 'sending' | 'sent' | 'error'
}

interface ConversationRow {
  id: string
  other_user_id: string
  other_username: string
  other_display_name: string
  updated_at: string
  last_message_body: string | null
  last_message_at: string | null
}

interface MessageRow {
  id: string
  conversation_id: string
  sender_id: string
  client_message_id: string
  body: string
  created_at: string
}

export class MessageServiceError extends Error {
  constructor(public readonly code: 'unavailable' | 'session_expired' | 'invalid_input' | 'forbidden' | 'request_failed', message: string) {
    super(message)
    this.name = 'MessageServiceError'
  }
}

function client() {
  if (!supabase) throw new MessageServiceError('unavailable', 'Mensagens não estão disponíveis neste ambiente.')
  return supabase
}

async function requireSession() {
  const { data, error } = await client().auth.getUser()
  if (error || !data.user) throw new MessageServiceError('session_expired', 'Sua sessão expirou. Entre novamente para continuar.')
  return data.user.id
}

function mapError(error: { code?: string }) {
  if (error.code === '42501') return new MessageServiceError('forbidden', 'A conversa não está disponível para esta conta.')
  if (error.code === '22023' || error.code === '22P02') return new MessageServiceError('invalid_input', 'Os dados da mensagem são inválidos.')
  return new MessageServiceError('request_failed', 'Não foi possível concluir a operação agora. Tente novamente.')
}

function mapMessage(row: MessageRow): Message {
  return { id: row.id, conversationId: row.conversation_id, senderId: row.sender_id, clientMessageId: row.client_message_id, body: row.body, createdAt: row.created_at, delivery: 'sent' }
}

export async function fetchConversations(): Promise<Conversation[]> {
  await requireSession()
  const { data, error } = await client().rpc('list_private_conversations', { page_size: 50 })
  if (error) throw mapError(error)
  return ((data ?? []) as ConversationRow[]).map((row) => ({ id: row.id, otherUserId: row.other_user_id, username: row.other_username, displayName: row.other_display_name, updatedAt: row.updated_at, lastMessage: row.last_message_body, lastMessageAt: row.last_message_at }))
}

export async function createConversation(otherUserId: string): Promise<string> {
  await requireSession()
  if (!UUID_PATTERN.test(otherUserId)) throw new MessageServiceError('invalid_input', 'Informe um identificador de perfil válido.')
  const { data, error } = await client().rpc('create_private_conversation', { other_participant: otherUserId })
  if (error || typeof data !== 'string') throw mapError(error ?? {})
  return data
}

export async function fetchMessages(conversationId: string, cursor?: Pick<Message, 'id' | 'createdAt'>): Promise<Message[]> {
  await requireSession()
  const { data, error } = await client().rpc('list_private_messages', {
    target_conversation_id: conversationId,
    cursor_created_at: cursor?.createdAt ?? null,
    cursor_id: cursor?.id ?? null,
    page_size: PAGE_SIZE,
  })
  if (error) throw mapError(error)
  return ((data ?? []) as MessageRow[]).map(mapMessage).reverse()
}

export async function sendMessage(conversationId: string, body: string, retryId: string): Promise<Message> {
  const senderId = await requireSession()
  const normalized = body.trim()
  if (!normalized || normalized.length > 4000) throw new MessageServiceError('invalid_input', 'A mensagem deve ter entre 1 e 4000 caracteres.')
  const { data, error } = await client().rpc('send_private_message', { target_conversation_id: conversationId, message_body: normalized, retry_id: retryId })
  if (error) throw mapError(error)
  const row = (data as MessageRow[] | null)?.[0]
  if (!row || row.sender_id !== senderId) throw new MessageServiceError('request_failed', 'A mensagem não pôde ser confirmada.')
  return mapMessage(row)
}

export function subscribeToMessages(conversationId: string, onMessage: (message: Message) => void, onStatus: (connected: boolean) => void): RealtimeChannel {
  return client().channel(`private-messages:${conversationId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'private_messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => onMessage(mapMessage(payload.new as MessageRow)))
    .subscribe((status) => onStatus(status === 'SUBSCRIBED'))
}

export async function unsubscribeFromMessages(channel: RealtimeChannel) {
  await client().removeChannel(channel)
}

export const messagePageSize = PAGE_SIZE
