const fs = require('fs')
const path = require('path')

const plist = require('@expo/plist')
const {withInfoPlist} = require('expo/config-plugins')

const {APP_GROUP} = require('../../constants')

/**
 * Writes the EXTENSION's entitlements file into the generated ios/ directory.
 *
 * This runs inside `withInfoPlist` only to get a mod that fires during the iOS
 * phase with `platformProjectRoot` resolved; it does not read or modify the
 * Info.plist itself.
 */
const withExtensionEntitlements = (config, {extensionName}) => {
  return withInfoPlist(config, config => {
    const extensionEntitlementsPath = path.join(
      config.modRequest.platformProjectRoot,
      extensionName,
      `${extensionName}.entitlements`,
    )

    fs.mkdirSync(path.dirname(extensionEntitlementsPath), {recursive: true})
    fs.writeFileSync(
      extensionEntitlementsPath,
      plist.default.build({
        'com.apple.security.application-groups': [APP_GROUP],
        /*
         * Matches the main app. Without it iOS refuses the
         * INSendMessageIntent donation and `content.updating(from:)` throws.
         */
        'com.apple.developer.usernotifications.communication': true,
      }),
    )

    return config
  })
}

module.exports = {withExtensionEntitlements}
