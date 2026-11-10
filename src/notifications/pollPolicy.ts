/*
 * The load-shedding decision, extracted from unread.tsx so it can be tested
 * without React or react-native.
 */

export type PollSkip = 'skipped:coinflip' | 'skipped:30+'

/**
 * Returns why a poll tick should be skipped, or undefined to proceed.
 *
 * At 0 unread the next notification matters, so poll every tick. Between 1 and
 * 29 the dot is already showing and n -> n+1 barely matters, so poll ~half as
 * often. At 30+ the badge displays "30+" and cannot change, so stop.
 *
 * `random` is injectable (returns [0, 1)) so tests are deterministic.
 */
export function pollSkipReason(
  unreadCount: number,
  isPoll: boolean,
  random: () => number,
): PollSkip | undefined {
  if (!isPoll || unreadCount === 0) return undefined
  if (unreadCount >= 30) return 'skipped:30+'
  if (random() >= 0.5) return 'skipped:coinflip'
  return undefined
}
