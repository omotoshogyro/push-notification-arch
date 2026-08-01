const {withPlugins} = require('expo/config-plugins')

const {EXTENSION_NAME} = require('../../constants')
const {withAppEntitlements} = require('./withAppEntitlements')
const {withExtensionEntitlements} = require('./withExtensionEntitlements')
const {withExtensionInfoPlist} = require('./withExtensionInfoPlist')
const {withExtensionSourceFiles} = require('./withExtensionSourceFiles')
const {withSounds} = require('./withSounds')
const {withXcodeTarget} = require('./withXcodeTarget')

const CONTROLLER_NAME = 'NotificationService'
const SOUND_FILES = ['dm.aiff']

/**
 * Generates the iOS Notification Service Extension target.
 *
 * `expo prebuild` regenerates ios/ from scratch, so a hand-added Xcode target
 * would be destroyed on every run. Everything the extension needs therefore
 * lives in `modules/DemoNSE/` and is copied in by these mods.
 *
 * Order matters: `withXcodeTarget` registers file paths in the pbxproj, so the
 * three file-copying mods must run before it.
 */
const withNotificationsExtension = config => {
  return withPlugins(config, [
    withAppEntitlements,
    [withExtensionEntitlements, {extensionName: EXTENSION_NAME}],
    [withExtensionInfoPlist, {extensionName: EXTENSION_NAME}],
    [
      withExtensionSourceFiles,
      {extensionName: EXTENSION_NAME, controllerName: CONTROLLER_NAME},
    ],
    [withSounds, {extensionName: EXTENSION_NAME, soundFiles: SOUND_FILES}],
    [
      withXcodeTarget,
      {
        extensionName: EXTENSION_NAME,
        controllerName: CONTROLLER_NAME,
        soundFiles: SOUND_FILES,
      },
    ],
  ])
}

module.exports = withNotificationsExtension
