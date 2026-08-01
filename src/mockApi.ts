/*
 * Stands in for the notifications endpoint. In-memory, so the polling logic in
 * src/notifications/unread.tsx can be driven into each of its three regimes on
 * demand without a server.
 */

export type NotificationItem = {
  id: string
  reason: 'like' | 'follow' | 'reply'
  author: string
  isRead: boolean
  /** Only populated when the caller asked for the expensive hydration. */
  subject?: {text: string}
}

export type Page = {
  items: NotificationItem[]
  indexedAt: string
}

const AUTHORS = ['alice', 'bob', 'carol', 'dave', 'erin', 'frank']
const REASONS: NotificationItem['reason'][] = ['like', 'follow', 'reply']

let items: NotificationItem[] = []
let nextId = 0

/** Number of round trips made, so the Debug screen can show requests avoided. */
export let requestCount = 0

export function addUnread(count: number) {
  for (let i = 0; i < count; i++) {
    nextId++
    items.unshift({
      id: `n${nextId}`,
      reason: REASONS[nextId % REASONS.length],
      author: AUTHORS[nextId % AUTHORS.length],
      isRead: false,
    })
  }
}

export function markAllRead() {
  items = items.map(item => ({...item, isRead: true}))
}

export function reset() {
  items = []
  nextId = 0
  requestCount = 0
}

/**
 * @param fetchAdditionalData Hydrate each item's subject. The unread count does
 *   not need it, only rendering does, so the frequent polling path passes false
 *   and skips the expensive work. This is the single biggest saving in the
 *   polling loop.
 */
export async function fetchPage({
  fetchAdditionalData,
}: {
  fetchAdditionalData: boolean
}): Promise<Page> {
  requestCount++

  // Hydration is the slow part; make the difference observable.
  await new Promise(r => setTimeout(r, fetchAdditionalData ? 400 : 80))

  return {
    items: items.slice(0, 40).map(item => ({
      ...item,
      subject: fetchAdditionalData ? {text: `post by ${item.author}`} : undefined,
    })),
    indexedAt: new Date().toISOString(),
  }
}

export function countUnread(page: Page) {
  return page.items.filter(item => !item.isRead).length
}

export function getAll() {
  return items
}
