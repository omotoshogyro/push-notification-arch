const {withEntitlementsPlist} = require('expo/config-plugins')

const {APP_GROUP} = require('../../constants')

/**
 * Adds the App Group to the MAIN app target.
 *
 * Both this and `withExtensionEntitlements` are required. If only one side
 * declares the group, `UserDefaults(suiteName:)` returns nil in the other
 * process rather than throwing, so the failure shows up as "preferences are
 * always the default value" rather than as an error.
 */
const withAppEntitlements = config => {
  return withEntitlementsPlist(config, async config => {
    config.modResults['com.apple.security.application-groups'] = [APP_GROUP]
    return config
  })
}

module.exports = {withAppEntitlements}
