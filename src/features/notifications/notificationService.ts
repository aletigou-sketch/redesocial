import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../shared/supabase/client'

const PAGE_SIZE = 25

export type NotificationType = 'new_message' | 'incoming_call' | 'missed_call' | 'group_activity' | 'story_activity'
export interface Notification {
  id: string
  type: NotificationType
  title: string
  body: string
  actorId: string | null
  contextType: 'conversation' | 'group' | 'story' | null
  contextId: string | null
  readAt: string | null
  createdAt: string
}
interface Row { id: string; type: NotificationType; title: string; body: string; actor_id: string | null; context_type: Notification['contextType']; context_id: string | null; read_at: string | null; created_at: string }

export class NotificationServiceError extends Error {
  constructor(public readonly code: 'unavailable' | 'session_expired' | 'request_failed', message: string) { super(message); this.name = 'NotificationServiceError' }
}

function client() {
  if (!supabase) throw new NotificationServiceError('unavailable', 'Notificações não estão disponíveis neste ambiente.')
  return supabase
}
async function userId() {
  const { data, error } = await client().auth.getUser()
  if (error || !data.user) throw new NotificationServiceError('session_expired', 'Sua sessão expirou. Entre novamente para continuar.')
  return data.user.id
}
function map(row: Row): Notification {
  return { id: row.id, type: row.type, title: row.title, body: row.body, actorId: row.actor_id, contextType: row.context_type, contextId: row.context_id, readAt: row.read_at, createdAt: row.created_at }
}
function failed() { return new NotificationServiceError('request_failed', 'Não foi possível concluir a operação agora. Tente novamente.') }

export async function fetchNotifications(cursor?: Pick<Notification, 'id' | 'createdAt'>) {
  const recipient = await userId()
  let query = client().from('notifications').select('id,type,title,body,actor_id,context_type,context_id,read_at,created_at').eq('recipient_id', recipient).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE)
  if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`)
  const { data, error } = await query
  if (error) throw failed()
  return (data as Row[]).map(map)
}
export async function fetchUnreadCount() {
  const recipient = await userId()
  const { count, error } = await client().from('notifications').select('id', { count: 'exact', head: true }).eq('recipient_id', recipient).is('read_at', null)
  if (error) throw failed()
  return count ?? 0
}
export async function markNotificationRead(id: string) {
  await userId()
  const { error } = await client().rpc('mark_notification_read', { target_notification_id: id })
  if (error) throw failed()
}
export async function markAllNotificationsRead() {
  await userId()
  const { error } = await client().rpc('mark_all_notifications_read')
  if (error) throw failed()
}
export async function createEventNotification(input: { recipientId: string; type: NotificationType; eventKey: string; title: string; body?: string; contextType: Notification['contextType']; contextId: string }) {
  await userId()
  const { error } = await client().rpc('create_notification', { target_recipient: input.recipientId, notification_type: input.type, notification_event_key: input.eventKey, notification_title: input.title, notification_body: input.body ?? '', notification_context_type: input.contextType, notification_context_id: input.contextId })
  if (error) throw failed()
}
export function subscribeToNotifications(recipient: string, onInsert: (item: Notification) => void, onStatus: (connected: boolean) => void): RealtimeChannel {
  return client().channel(`notifications:${recipient}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${recipient}` }, (payload) => onInsert(map(payload.new as Row))).subscribe((status) => onStatus(status === 'SUBSCRIBED'))
}
export async function unsubscribeFromNotifications(channel: RealtimeChannel) { await client().removeChannel(channel) }
export const notificationPageSize = PAGE_SIZE
