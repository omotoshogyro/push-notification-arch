/*
 * Pure (no react-native / expo imports) so it can be unit tested under plain
 * node. routing.ts re-exports everything here.
 */

export type Screen = 'Feed' | 'Notifications' | 'Chat' | 'Debug'

export type NotificationPayload = {
  reason?: string
  convoId?: string
  senderDisplayName?: string
}

const MAX_FIELD_LENGTH = 256

function str(raw: Record<string, unknown>, key: string): string | undefined {
  // Own properties only: never read through the prototype chain.
  if (!Object.prototype.hasOwnProperty.call(raw, key)) return undefined
  const value = raw[key]
  if (typeof value !== 'string') return undefined
  if (value.length === 0 || value.length > MAX_FIELD_LENGTH) return undefined
  return value
}

/**
 * Validates untrusted push `data` at runtime. Push payloads come from outside
 * the process (and may be absent, malformed, or from an older server), so a
 * TypeScript cast proves nothing. Returns only known fields with the expected
 * type; anything else is dropped. Returns undefined when the input is not a
 * plain object or carries no usable field.
 */
export function parseNotificationPayload(
  data: unknown,
): NotificationPayload | undefined {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return undefined
  }
  const raw = data as Record<string, unknown>
  const payload: NotificationPayload = {}
  const reason = str(raw, 'reason')
  const convoId = str(raw, 'convoId')
  const senderDisplayName = str(raw, 'senderDisplayName')
  if (reason !== undefined) payload.reason = reason
  if (convoId !== undefined) payload.convoId = convoId
  if (senderDisplayName !== undefined) payload.senderDisplayName = senderDisplayName
  return Object.keys(payload).length > 0 ? payload : undefined
}

/**
 * Maps a push payload to a destination. social-app routes via a URL and its own
 * regex router so that push taps, deep links, and web URLs all share one routing
 * table; this demo is small enough to map directly. Unknown reasons fall back
 * to the notifications list.
 */
export function payloadToScreen(payload: NotificationPayload): Screen {
  if (payload.reason === 'chat-message') return 'Chat'
  return 'Notifications'
}
