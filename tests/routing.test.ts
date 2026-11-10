import assert from 'node:assert/strict'
import {test} from 'node:test'

import {
  parseNotificationPayload,
  payloadToScreen,
} from '../src/notifications/payload'

test('parses a valid chat payload', () => {
  const p = parseNotificationPayload({
    reason: 'chat-message',
    convoId: 'c1',
    senderDisplayName: 'Alice',
  })
  assert.deepEqual(p, {
    reason: 'chat-message',
    convoId: 'c1',
    senderDisplayName: 'Alice',
  })
  assert.equal(payloadToScreen(p!), 'Chat')
})

test('non-objects are rejected', () => {
  for (const bad of [undefined, null, 'x', 42, true, [], ['reason']]) {
    assert.equal(parseNotificationPayload(bad), undefined)
  }
})

test('wrongly typed fields are dropped, not cast through', () => {
  const p = parseNotificationPayload({
    reason: 5,
    convoId: {a: 1},
    senderDisplayName: 'Bob',
  })
  assert.deepEqual(p, {senderDisplayName: 'Bob'})
})

test('unknown fields are stripped and empty result is undefined', () => {
  assert.equal(parseNotificationPayload({evil: 'x', __proto__: {reason: 'chat-message'}}), undefined)
  assert.deepEqual(parseNotificationPayload({reason: 'like', extra: 1}), {reason: 'like'})
})

test('oversized strings are dropped', () => {
  assert.equal(parseNotificationPayload({reason: 'x'.repeat(1000)}), undefined)
})

test('unknown reasons route to Notifications', () => {
  assert.equal(payloadToScreen({reason: 'something-new'}), 'Notifications')
  assert.equal(payloadToScreen({}), 'Notifications')
})
