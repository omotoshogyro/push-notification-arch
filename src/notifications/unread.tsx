import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {AppState} from 'react-native'

import * as mockApi from '../mockApi'
import {resetBadgeCount} from './badge'

const UPDATE_INTERVAL = 5 * 1e3 // 30s in social-app; shortened so the demo is watchable

/** Why a given tick did or did not hit the network. */
export type PollOutcome =
  | 'polled'
  | 'skipped:coinflip'
  | 'skipped:30+'
  | 'skipped:background'
  | 'skipped:overlap'

export type PollLogEntry = {
  at: number
  outcome: PollOutcome
  unreadAtDecision: number
}

type CachedPage = {
  /**
   * Whether `data` is complete enough to render. A poll that skipped hydration
   * still updates the count, but its page cannot be handed to the feed.
   */
  usableInFeed: boolean
  data: mockApi.Page | undefined
  syncedAt: Date
  unreadCount: number
}

type StateContext = {
  numUnread: string
  pollLog: PollLogEntry[]
  requestCount: number
}

type ApiContext = {
  checkUnread: (opts?: {invalidate?: boolean; isPoll?: boolean}) => Promise<void>
  markAllRead: () => Promise<void>
  getCachedUnreadPage: () => mockApi.Page | undefined
}

const stateContext = createContext<StateContext>({
  numUnread: '',
  pollLog: [],
  requestCount: 0,
})
const apiContext = createContext<ApiContext>({
  async checkUnread() {},
  async markAllRead() {},
  getCachedUnreadPage: () => undefined,
})

export function UnreadProvider({children}: React.PropsWithChildren<{}>) {
  const [numUnread, setNumUnread] = useState('')
  const [pollLog, setPollLog] = useState<PollLogEntry[]>([])
  const [requestCount, setRequestCount] = useState(0)

  const cacheRef = useRef<CachedPage>({
    usableInFeed: false,
    data: undefined,
    syncedAt: new Date(),
    unreadCount: 0,
  })
  const isFetchingRef = useRef(false)
  const checkUnreadRef = useRef<ApiContext['checkUnread'] | null>(null)

  const log = useCallback((outcome: PollOutcome, unreadAtDecision: number) => {
    setPollLog(prev =>
      [{at: Date.now(), outcome, unreadAtDecision}, ...prev].slice(0, 40),
    )
  }, [])

  const api = useMemo<ApiContext>(() => {
    return {
      async checkUnread({invalidate, isPoll} = {}) {
        const unreadCount = cacheRef.current.unreadCount

        // Polling in the background wakes the CPU for a badge nobody can see.
        if (AppState.currentState !== 'active') {
          if (isPoll) log('skipped:background', unreadCount)
          return
        }

        /*
         * The load-shedding heuristic, and the most interesting six lines here.
         *
         * The badge is only interesting when it CHANGES. At 0 unread the next
         * notification matters, so poll every tick. Between 1 and 29 the dot is
         * already showing and n -> n+1 barely matters, so poll ~half as often.
         * At 30+ the badge displays "30+" and literally cannot change, so stop.
         *
         * Math.random() rather than a deterministic every-other-tick because it
         * also jitters clients apart instead of letting them stampede the server
         * on a shared interval.
         */
        if (isPoll && unreadCount !== 0) {
          if (unreadCount >= 30) {
            log('skipped:30+', unreadCount)
            return
          }
          if (Math.random() >= 0.5) {
            log('skipped:coinflip', unreadCount)
            return
          }
        }

        // Overlapping fetches would race to write cacheRef.
        if (isFetchingRef.current) {
          if (isPoll) log('skipped:overlap', unreadCount)
          return
        }
        // Do not move this without ensuring a symmetrical reset in `finally`.
        isFetchingRef.current = true

        try {
          const page = await mockApi.fetchPage({
            // Only hydrate subjects when the page will actually be rendered.
            fetchAdditionalData: !!invalidate,
          })
          const nextUnread = mockApi.countUnread(page)
          const unreadStr =
            nextUnread >= 30 ? '30+' : nextUnread === 0 ? '' : String(nextUnread)

          cacheRef.current = {
            usableInFeed: !!invalidate,
            data: page,
            syncedAt: new Date(),
            unreadCount: nextUnread,
          }

          setNumUnread(unreadStr)
          setRequestCount(mockApi.requestCount)
          if (isPoll) log('polled', unreadCount)
        } finally {
          isFetchingRef.current = false
        }
      },

      async markAllRead() {
        mockApi.markAllRead()
        cacheRef.current = {
          usableInFeed: false,
          data: undefined,
          syncedAt: new Date(),
          unreadCount: 0,
        }
        setNumUnread('')
        // Clears both the App Group counter and the OS badge.
        await resetBadgeCount()
      },

      getCachedUnreadPage() {
        // Hand the poll's page straight to the feed, but only if it is complete.
        if (cacheRef.current.usableInFeed) {
          return cacheRef.current.data
        }
      },
    }
  }, [log])

  checkUnreadRef.current = api.checkUnread

  useEffect(() => {
    void checkUnreadRef.current?.()
    const interval = setInterval(
      () => void checkUnreadRef.current?.({isPoll: true}),
      UPDATE_INTERVAL,
    )
    return () => clearInterval(interval)
  }, [])

  const state = useMemo(
    () => ({numUnread, pollLog, requestCount}),
    [numUnread, pollLog, requestCount],
  )

  return (
    <stateContext.Provider value={state}>
      <apiContext.Provider value={api}>{children}</apiContext.Provider>
    </stateContext.Provider>
  )
}

export function useUnreadNotifications() {
  return useContext(stateContext)
}

export function useUnreadNotificationsApi() {
  return useContext(apiContext)
}
