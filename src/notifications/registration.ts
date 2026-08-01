import {useCallback, useEffect} from 'react'
import * as Notifications from 'expo-notifications'

/*
 * Token registration and permissions.
 *
 * This demo has no server, so `registerToken` just logs. The structure is what
 * matters - both defensive constructs below are workarounds for
 * expo-notifications behaving inconsistently, and both are load bearing in
 * social-app.
 */

type PushToken = Notifications.DevicePushToken

/*
 * Poor man's debounce. `registerToken` is deliberately called from two racing
 * paths (see `useGetAndRegisterToken`), and this is what collapses them into one
 * request. Without it the double-call would be a real double-request.
 */
function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: A) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

async function _registerToken({token}: {token: PushToken}) {
  // Where `agent.app.bsky.notification.registerPush(...)` would go.
  console.log('[notifications] registerToken', token.data)
}

const _registerTokenDebounced = debounce(_registerToken, 100)

async function getPushToken() {
  const {granted} = await Notifications.getPermissionsAsync()
  if (!granted) return undefined
  return Notifications.getDevicePushTokenAsync()
}

/**
 * Fetches the device token and registers it.
 *
 * N.B. A regression in expo-notifications caused `addPushTokenListener` not to
 * fire on Android after calling `getDevicePushTokenAsync()`. As insurance we
 * also register here directly.
 *
 * Because registration is debounced, calling it from both places is safe - only
 * one request should go out. It does race the listener, so a duplicate is
 * possible, and that is acceptable.
 *
 * @see https://github.com/expo/expo/issues/28656
 * @see https://github.com/bluesky-social/social-app/pull/4467
 */
export function useGetAndRegisterToken() {
  return useCallback(async () => {
    const token = await getPushToken()
    if (token) {
      _registerTokenDebounced({token})
    }
    return token
  }, [])
}

/**
 * Registers on mount and re-registers whenever the token rotates. Expo warns
 * the token can change while the app is open in rare cases.
 */
export function useNotificationsRegistration() {
  const getAndRegisterToken = useGetAndRegisterToken()

  useEffect(() => {
    void getAndRegisterToken()

    const subscription = Notifications.addPushTokenListener(token => {
      _registerTokenDebounced({token})
    })

    return () => subscription.remove()
  }, [getAndRegisterToken])
}

/*
 * Tracks whether the OS permission prompt has already been shown this session.
 * On Android `canAskAgain` stays true after a single in-app denial, so without
 * this guard a later call site would surface a second prompt. Resets on restart.
 */
let hasRequestedPermissionsThisSession = false

export function useRequestNotificationsPermission() {
  const getAndRegisterToken = useGetAndRegisterToken()

  return useCallback(
    async (context: 'Launch' | 'Settings') => {
      const permissions = await Notifications.getPermissionsAsync()

      if (
        permissions.status === 'granted' ||
        (permissions.status === 'denied' && !permissions.canAskAgain)
      ) {
        return permissions.status
      }

      if (hasRequestedPermissionsThisSession) return permissions.status
      hasRequestedPermissionsThisSession = true

      const res = await Notifications.requestPermissionsAsync({
        ios: {
          /*
           * These three default to true when no argument is passed, but passing
           * an options object opts out of that default, so they have to be set
           * explicitly to preserve the expected behavior.
           */
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          /*
           * Adds an in-app notification settings button to this app's page in
           * the system Settings app, which calls back into the app when tapped.
           */
          provideAppNotificationSettings: true,
        },
      })

      console.log('[notifications] permission request', {context, status: res.status})

      if (res.granted) {
        void getAndRegisterToken()
      }

      return res.status
    },
    [getAndRegisterToken],
  )
}
