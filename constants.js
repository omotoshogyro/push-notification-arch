/*
 * Single source of truth for the three identifiers that must agree across
 * JS, the Swift extension, the generated Xcode target, and the .apns fixtures.
 *
 * These are duplicated into Swift as string literals (there is no way to share
 * a constant across the process boundary), so treat this file as the canonical
 * definition and grep for the literals when changing anything here.
 */
const BUNDLE_IDENTIFIER = 'com.demo.pusharch'
const APP_GROUP = `group.${BUNDLE_IDENTIFIER}`
const EXTENSION_NAME = 'DemoNSE'

/*
 * Fallbacks for the extension target's build settings, used only when neither
 * app.config.js (`ios.deploymentTarget`) nor the main app target (Expo's own
 * defaults, read from the generated pbxproj) provides a value. 15.1 is the
 * Expo SDK 54 minimum.
 */
const FALLBACK_IOS_DEPLOYMENT_TARGET = '15.1'
const FALLBACK_SWIFT_VERSION = '5.0'

module.exports = {
  BUNDLE_IDENTIFIER,
  APP_GROUP,
  EXTENSION_NAME,
  FALLBACK_IOS_DEPLOYMENT_TARGET,
  FALLBACK_SWIFT_VERSION,
}
