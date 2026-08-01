import {getBadgeCountAsync, setBadgeCountAsync} from 'expo-notifications'

import NotifPrefs from '../../modules/expo-notif-prefs'

/*
 * The badge is maintained by two processes that never talk to each other.
 *
 * The notification service extension increments a counter in App Group storage
 * every time a push arrives, including when the app is dead. JS decrements it as
 * the user actually reads things. Neither side can do the other's job: the
 * extension has no idea what has been read, and JS is not running when a push
 * lands.
 *
 * That makes every write here TWO writes, and they are not redundant:
 *
 *   NotifPrefs.setBadgeCountAsync -> the App Group value, i.e. the number the
 *                                    extension will increment FROM next time
 *   setBadgeCountAsync            -> the number on the app icon right now
 *
 * Letting those drift is the classic "badge says 3, inbox is empty" bug.
 */

export async function decrementBadgeCount(by: number) {
  const count = Math.max(0, (await getBadgeCountAsync()) - by)
  await NotifPrefs.setBadgeCountAsync(count)
  await setBadgeCountAsync(count)
}

export async function resetBadgeCount() {
  await NotifPrefs.setBadgeCountAsync(0)
  await setBadgeCountAsync(0)
}

/**
 * Both counters, for the Debug screen. They should always agree; if they do
 * not, one of the two writes above was missed somewhere.
 */
export async function readBadgeState() {
  const [appGroup, os] = await Promise.all([
    NotifPrefs.getBadgeCountAsync(),
    getBadgeCountAsync(),
  ])
  return {appGroup, os, inSync: appGroup === os}
}
