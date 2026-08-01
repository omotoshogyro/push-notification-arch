import {Alert} from 'react-native'

import NotifPrefs from '../../modules/expo-notif-prefs'

/*
 * Stand-in for a real APNs delivery.
 *
 * `xcrun simctl push` puts a notification in the notification center but does
 * NOT run the Notification Service Extension - that path only exists for pushes
 * arriving over APNs, which needs a real device. Verified empirically: a title
 * mutation added inside DemoNSE never showed up on a simctl push.
 *
 * These helpers call into the native module, which re-runs the extension's
 * logic in-process against the same App Group store. Same reads, same writes,
 * same serial queue - just a different process.
 */

export type SimulatedPush = {
  label: string
  reason: string
  userInfo: Record<string, unknown>
}

export const SIMULATED_PUSHES: SimulatedPush[] = [
  {
    label: 'like',
    reason: 'like',
    userInfo: {
      title: 'alice liked your post',
      body: '"the shadow cache is the good part"',
    },
  },
  {
    label: 'DM',
    reason: 'chat-message',
    userInfo: {
      title: 'Alice',
      body: 'hey, are you around?',
      convoId: 'convo-123',
      convoKind: 'direct',
      senderDisplayName: 'Alice',
      senderHandle: 'alice.demo.social',
      senderAvatarUrl: 'https://i.pravatar.cc/300?img=5',
    },
  },
  {
    label: 'group DM',
    reason: 'chat-message',
    userInfo: {
      title: 'Carol',
      body: 'pushing the fix now',
      convoId: 'convo-group-9',
      convoKind: 'group',
      groupName: 'Release Crew',
      groupMemberCount: 4,
      senderDisplayName: 'Carol',
      senderHandle: 'carol.demo.social',
      senderAvatarUrl: 'https://i.pravatar.cc/300?img=9',
    },
  },
]

/**
 * @param delaySeconds Time before the banner fires, so the app can be
 *   backgrounded first. A foregrounded app shows the banner through the JS
 *   handler instead, which is a different code path.
 * @returns the App Group badge count after delivery, or null if the call failed
 */
export async function simulatePush(
  push: SimulatedPush,
  delaySeconds = 5,
): Promise<number | null> {
  try {
    return await NotifPrefs.simulateNsePush(
      push.reason,
      JSON.stringify(push.userInfo),
      delaySeconds,
    )
  } catch (error) {
    // Surface it: a silently rejected promise here looks identical to "the
    // native code ran and did nothing", which is a miserable thing to debug.
    Alert.alert('Simulated push failed', String(error))
    return null
  }
}
