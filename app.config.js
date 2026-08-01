/*
 * Mirrors the shape of social-app's app.config.js, reduced to just the pieces
 * that matter for push notifications.
 *
 * The App Group id is the single value that ties the three processes together:
 * the main app writes preferences into it, and the notification service
 * extension reads them back while the app is dead. It is applied to the main
 * app by `withAppEntitlements` and to the extension by
 * `withExtensionEntitlements`. If it is missing from either side,
 * `UserDefaults(suiteName:)` returns nil rather than erroring.
 */
const {BUNDLE_IDENTIFIER, APP_GROUP} = require('./constants')

module.exports = {
  expo: {
    name: 'Push Arch Demo',
    slug: 'push-arch-demo',
    scheme: 'pusharch',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      bundleIdentifier: BUNDLE_IDENTIFIER,
      buildNumber: '1',
      supportsTablet: false,
      infoPlist: {
        /*
         * Lets the system wake the app for background notification delivery.
         * The NSE itself is invoked by `mutable-content: 1` in the payload,
         * not by this key.
         */
        UIBackgroundModes: ['remote-notification'],
      },
      entitlements: {
        /*
         * Communication Notifications (INSendMessageIntent) require this. On a
         * simulator build with no signing team it may not be honored, in which
         * case `content.updating(from:)` throws and the NSE falls back to plain
         * content. See README "Known limitations".
         */
        'com.apple.developer.usernotifications.communication': true,
      },
    },
    android: {
      package: BUNDLE_IDENTIFIER,
    },
    plugins: ['expo-notifications', './plugins/notificationsExtension/index.js'],
    extra: {
      appGroup: APP_GROUP,
    },
  },
}
