import assert from 'node:assert/strict'
import {test} from 'node:test'

import {pollSkipReason} from '../src/notifications/pollPolicy'

test('non-poll calls are never skipped', () => {
  assert.equal(pollSkipReason(50, false, () => 0.99), undefined)
})

test('0 unread always polls', () => {
  assert.equal(pollSkipReason(0, true, () => 0.99), undefined)
})

test('30+ always skips and does not consume randomness', () => {
  let calls = 0
  const r = () => (calls++, 0)
  assert.equal(pollSkipReason(30, true, r), 'skipped:30+')
  assert.equal(pollSkipReason(31, true, r), 'skipped:30+')
  assert.equal(calls, 0)
})

test('1..29 uses the injected coin flip', () => {
  assert.equal(pollSkipReason(5, true, () => 0.49), undefined)
  assert.equal(pollSkipReason(5, true, () => 0.5), 'skipped:coinflip')
  assert.equal(pollSkipReason(29, true, () => 0.99), 'skipped:coinflip')
})
