import * as Notifications from 'expo-notifications'

import {
  type NotificationPayload,
  parseNotificationPayload,
  payloadToScreen,
  type Screen,
} from './payload'

export {payloadToScreen, parseNotificationPayload}
export type {NotificationPayload, Screen}

export function getNotificationPayload(
  notification: Notifications.Notification,
): NotificationPayload | undefined {
  return parseNotificationPayload(notification.request.content.data)
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
