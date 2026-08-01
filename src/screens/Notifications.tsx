import {useEffect, useState} from 'react'
import {ScrollView, Text, View} from 'react-native'

import * as mockApi from '../mockApi'
import {useUnreadNotificationsApi} from '../notifications/unread'
import {Button, Card, usePalette} from '../ui'

export function NotificationsScreen() {
  const p = usePalette()
  const {checkUnread, markAllRead, getCachedUnreadPage} =
    useUnreadNotificationsApi()
  const [page, setPage] = useState<mockApi.Page | undefined>()
  const [source, setSource] = useState<'cache' | 'network'>('network')

  useEffect(() => {
    /*
     * Try the poll's page first. If the most recent poll hydrated subjects, it
     * is complete enough to render and the screen opens with zero latency; the
     * usableInFeed flag is what makes that safe to assume.
     */
    const cached = getCachedUnreadPage()
    if (cached) {
      setPage(cached)
      setSource('cache')
      return
    }
    setSource('network')
    void checkUnread({invalidate: true}).then(() => {
      setPage(getCachedUnreadPage())
    })
  }, [checkUnread, getCachedUnreadPage])

  return (
    <ScrollView
      style={{backgroundColor: p.bg}}
      contentContainerStyle={{padding: 16, paddingBottom: 48}}>
      <Card title={`Rendered from ${source}`}>
        <Text style={{color: p.dim, fontSize: 12}}>
          A poll that skipped hydration updates the count but is marked
          unusable, so this screen refetches. A poll with invalidate:true is
          handed straight over.
        </Text>
        <View style={{flexDirection: 'row', gap: 8, marginTop: 10}}>
          <Button label="Mark all read" tone="accent" onPress={() => void markAllRead().then(() => setPage(undefined))} />
        </View>
      </Card>

      {(page?.items ?? []).length === 0 ? (
        <Card>
          <Text style={{color: p.dim}}>
            Nothing here. Add some from the Debug tab, or run{' '}
            <Text style={{fontWeight: '700'}}>pnpm push like</Text>.
          </Text>
        </Card>
      ) : (
        page!.items.map(item => (
          <Card key={item.id}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
              <Text style={{color: p.text, fontWeight: '600'}}>
                {item.author} {item.reason}ed
              </Text>
              {!item.isRead ? (
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: p.accent,
                  }}
                />
              ) : null}
            </View>
            <Text style={{color: p.dim, fontSize: 12}}>
              {item.subject?.text ?? '(subject not hydrated)'}
            </Text>
          </Card>
        ))
      )}
    </ScrollView>
  )
}
