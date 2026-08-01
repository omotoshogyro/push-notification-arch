import * as Notifications from 'expo-notifications'

export type Screen = 'Feed' | 'Notifications' | 'Chat' | 'Debug'

export type NotificationPayload = {
  reason?: string
  convoId?: string
  senderDisplayName?: string
}

/**
 * Maps a push payload to a destination. social-app routes via a URL and its own
 * regex router so that push taps, deep links, and web URLs all share one routing
 * table; this demo is small enough to map directly.
 */
export function payloadToScreen(payload: NotificationPayload): Screen {
  if (payload.reason === 'chat-message') return 'Chat'
  return 'Notifications'
}

export function getNotificationPayload(
  notification: Notifications.Notification,
): NotificationPayload | undefined {
  const data = notification.request.content.data
  if (!data) return undefined
  return data as NotificationPayload
}

/*
 * Guards against re-consuming the launching notification.
 *
 * `getLastNotificationResponse()` keeps returning the same value natively.
 * Anything that remounts the tree (in social-app, an account switch remounting
 * on `key={currentAccount.did}`) would re-fire this and teleport the user back
 * to a notification they tapped ten minutes ago.
 */
let didHandleEntry = false

/**
 * Consumes the notification that caused a cold launch, if any. Call once, after
 * navigation is ready.
 */
export function handlePushNotificationEntry(
  navigate: (screen: Screen, payload?: NotificationPayload) => void,
) {
  if (didHandleEntry) return
  didHandleEntry = true

  const response = Notifications.getLastNotificationResponse()
  if (!response) return

  try {
    Notifications.clearLastNotificationResponse()
  } catch (error) {
    console.warn('[notifications] could not clear last response', error)
  }

  const payload = getNotificationPayload(response.notification)
  if (!payload) return

  navigate(payloadToScreen(payload), payload)
}

/**
 * Handles taps that arrive while the app is already running. Distinct from the
 * cold-launch path above, which is why the once-only guard does not apply here.
 */
export function addNotificationTapListener(
  navigate: (screen: Screen, payload?: NotificationPayload) => void,
) {
  return Notifications.addNotificationResponseReceivedListener(response => {
    const payload = getNotificationPayload(response.notification)
    if (!payload) return
    navigate(payloadToScreen(payload), payload)
  })
}
