import {useCallback, useEffect, useState} from 'react'
import {Pressable, StyleSheet, Text, View} from 'react-native'
import * as Notifications from 'expo-notifications'
import {StatusBar} from 'expo-status-bar'
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context'

import {
  useNotificationsRegistration,
  useRequestNotificationsPermission,
} from './src/notifications/registration'
import {
  addNotificationTapListener,
  handlePushNotificationEntry,
  type NotificationPayload,
  type Screen,
} from './src/notifications/routing'
import {
  UnreadProvider,
  useUnreadNotifications,
  useUnreadNotificationsApi,
} from './src/notifications/unread'
import {ChatScreen} from './src/screens/Chat'
import {DebugScreen} from './src/screens/Debug'
import {NotificationsScreen} from './src/screens/Notifications'
import {usePalette} from './src/ui'

/*
 * Controls presentation while the app is FOREGROUNDED. This is the part of the
 * pipeline that pure expo-notifications handles well - and the part that stops
 * running the moment the app is killed, which is what the NSE exists to cover.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

const TABS: Screen[] = ['Notifications', 'Chat', 'Debug']

function Shell() {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const [screen, setScreen] = useState<Screen>('Debug')
  const [payload, setPayload] = useState<NotificationPayload | undefined>()
  const {numUnread} = useUnreadNotifications()
  const {checkUnread} = useUnreadNotificationsApi()

  useNotificationsRegistration()
  const requestPermission = useRequestNotificationsPermission()

  const navigate = useCallback((next: Screen, p?: NotificationPayload) => {
    setScreen(next)
    setPayload(p)
  }, [])

  useEffect(() => {
    void requestPermission('Launch')

    // Cold-launch tap. Guarded internally so it only ever runs once.
    handlePushNotificationEntry(navigate)

    // Taps while the app is already running.
    const sub = addNotificationTapListener(navigate)

    /*
     * A push that arrives while we are alive means the server has news the
     * poller has not seen yet, so refresh rather than waiting for the next tick.
     */
    const received = Notifications.addNotificationReceivedListener(() => {
      void checkUnread()
    })

    return () => {
      sub.remove()
      received.remove()
    }
  }, [navigate, requestPermission, checkUnread])

  return (
    <View style={[styles.root, {backgroundColor: p.bg, paddingTop: insets.top}]}>
      <View style={[styles.header, {borderBottomColor: p.border}]}>
        <Text style={[styles.title, {color: p.text}]}>{screen}</Text>
      </View>

      <View style={styles.body}>
        {screen === 'Notifications' ? <NotificationsScreen /> : null}
        {screen === 'Chat' ? <ChatScreen payload={payload} /> : null}
        {screen === 'Debug' ? <DebugScreen /> : null}
      </View>

      <View
        style={[
          styles.tabs,
          {
            borderTopColor: p.border,
            backgroundColor: p.card,
            paddingBottom: insets.bottom || 10,
          },
        ]}>
        {TABS.map(tab => (
          <Pressable
            key={tab}
            style={styles.tab}
            onPress={() => navigate(tab)}>
            <View>
              <Text
                style={[
                  styles.tabText,
                  {color: screen === tab ? p.accent : p.dim},
                ]}>
                {tab}
              </Text>
              {tab === 'Notifications' && numUnread !== '' ? (
                <View style={[styles.badge, {backgroundColor: p.accent}]}>
                  <Text style={styles.badgeText}>{numUnread}</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <UnreadProvider>
        <StatusBar style="auto" />
        <Shell />
      </UnreadProvider>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  root: {flex: 1},
  header: {paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth},
  title: {fontSize: 26, fontWeight: '700'},
  body: {flex: 1},
  tabs: {flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10},
  tab: {flex: 1, alignItems: 'center'},
  tabText: {fontSize: 13, fontWeight: '600'},
  badge: {
    position: 'absolute',
    top: -6,
    right: -14,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {color: '#fff', fontSize: 10, fontWeight: '700'},
})
