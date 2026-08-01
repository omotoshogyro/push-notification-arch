import {requireNativeModule} from 'expo-modules-core'

import {type ExpoNotifPrefsModule} from './src/ExpoNotifPrefs.types'

export type {NotifPrefs} from './src/ExpoNotifPrefs.types'

/**
 * Bridge to App Group storage, the only channel through which the main app can
 * influence the notification service extension.
 *
 * The extension runs in a separate process and cannot call into JS, so anything
 * it needs at delivery time must already be sitting in this store, written
 * while the app was alive.
 */
export default requireNativeModule<ExpoNotifPrefsModule>('ExpoNotifPrefs')
