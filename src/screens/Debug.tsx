import {useEffect, useState} from 'react'
import {AppState, ScrollView, Switch, Text, View} from 'react-native'

import NotifPrefs from '../../modules/expo-notif-prefs'
import * as mockApi from '../mockApi'
import {readBadgeState} from '../notifications/badge'
import {SIMULATED_PUSHES, simulatePush} from '../notifications/simulate'
import {
  useUnreadNotifications,
  useUnreadNotificationsApi,
} from '../notifications/unread'
import {Button, Card, Row, usePalette} from '../ui'

/**
 * The observability screen. Everything the three processes cooperate on is
 * shown here at once, because the interesting behaviour is otherwise invisible:
 * the extension writes a value while the app is dead, and JS reads it later.
 */
export function DebugScreen() {
  const p = usePalette()
  const {numUnread, pollLog, requestCount} = useUnreadNotifications()
  const {checkUnread, markAllRead} = useUnreadNotificationsApi()

  const [badge, setBadge] = useState({appGroup: 0, os: 0, inSync: true})
  const [playSoundChat, setPlaySoundChat] = useState(true)

  // Re-read native state on focus and whenever the app returns to the
  // foreground - that is exactly when the extension may have changed it.
  useEffect(() => {
    async function refresh() {
      setBadge(await readBadgeState())
      setPlaySoundChat(await NotifPrefs.getBoolAsync('playSoundChat'))
    }
    void refresh()
    const interval = setInterval(refresh, 1000)
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') void refresh()
    })
    return () => {
      clearInterval(interval)
      sub.remove()
    }
  }, [])

  async function onToggleSound(next: boolean) {
    setPlaySoundChat(next)
    // Written while foregrounded so the extension can read it while dead.
    await NotifPrefs.setBoolAsync('playSoundChat', next)
  }

  const skipped = pollLog.filter(e => e.outcome !== 'polled').length

  return (
    <ScrollView
      style={{backgroundColor: p.bg}}
      contentContainerStyle={{padding: 16, paddingBottom: 48}}>
      <Card title="Badge — written by the NSE, read here">
        <Row
          label="App Group badgeCount"
          value={badge.appGroup}
          valueColor={p.accent}
        />
        <Row label="OS icon badge" value={badge.os} />
        <Row
          label="In sync"
          value={badge.inSync ? 'yes' : 'DRIFT'}
          valueColor={badge.inSync ? p.good : p.bad}
        />
        <Text style={{color: p.dim, fontSize: 12, marginTop: 6}}>
          The extension increments the App Group value on every non-chat push,
          even with the app force-quit. JS decrements it as you read.
        </Text>
      </Card>

      <Card title="Simulate a delivery (5s delay)">
        <Text style={{color: p.dim, fontSize: 12, marginBottom: 8}}>
          Runs the extension's logic against the same App Group store. Tap, then
          background the app to watch the banner. `pnpm push` cannot do this —
          simctl does not invoke Notification Service Extensions.
        </Text>
        <View style={{flexDirection: 'row', gap: 8}}>
          {SIMULATED_PUSHES.map(push => (
            <Button
              key={push.label}
              label={push.label}
              onPress={() => void simulatePush(push)}
            />
          ))}
        </View>
      </Card>

      <Card title="Preference read by the extension">
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
          <Text style={{color: p.text, fontSize: 14}}>DM sound (dm.aiff)</Text>
          <Switch value={playSoundChat} onValueChange={onToggleSound} />
        </View>
        <Text style={{color: p.dim, fontSize: 12, marginTop: 6}}>
          Toggle this, force-quit the app, then push a chat-message. The sound
          changes even though no JS ran.
        </Text>
      </Card>

      <Card title="Unread state">
        <Row label="Badge string" value={numUnread === '' ? '(none)' : numUnread} />
        <Row label="Unread items" value={mockApi.getAll().filter(i => !i.isRead).length} />
        <Row label="Network requests made" value={requestCount} />
        <Row
          label="Ticks shed"
          value={`${skipped} / ${pollLog.length}`}
          valueColor={skipped > 0 ? p.warn : p.dim}
        />
        <View style={{flexDirection: 'row', gap: 8, marginTop: 10}}>
          <Button label="+1 unread" onPress={() => mockApi.addUnread(1)} />
          <Button label="+10" onPress={() => mockApi.addUnread(10)} />
          <Button label="+35" onPress={() => mockApi.addUnread(35)} />
        </View>
        <View style={{flexDirection: 'row', gap: 8, marginTop: 8}}>
          <Button
            label="Poll now"
            onPress={() => void checkUnread({invalidate: true})}
          />
          <Button
            label="Mark all read"
            tone="accent"
            onPress={() => void markAllRead()}
          />
        </View>
      </Card>

      <Card title="Poll log — load shedding, live">
        <Text style={{color: p.dim, fontSize: 12, marginBottom: 8}}>
          0 unread: every tick polls. 1–29: ~half are shed by coin flip. 30+: all
          shed, because the badge cannot change.
        </Text>
        {pollLog.length === 0 ? (
          <Text style={{color: p.dim, fontSize: 13}}>Waiting for first tick…</Text>
        ) : (
          pollLog.map(entry => (
            <View
              key={entry.at}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: 2,
              }}>
              <Text
                style={{
                  color: entry.outcome === 'polled' ? p.good : p.warn,
                  fontSize: 12,
                  fontWeight: '600',
                }}>
                {entry.outcome}
              </Text>
              <Text style={{color: p.dim, fontSize: 12}}>
                at {entry.unreadAtDecision} unread
              </Text>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  )
}
