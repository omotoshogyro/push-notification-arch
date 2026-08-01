const fs = require('fs')
const path = require('path')

const plist = require('@expo/plist')
const {withInfoPlist} = require('expo/config-plugins')

/**
 * Copies `modules/<extensionName>/Info.plist` into the generated ios/ tree,
 * filling in the build-setting placeholders Xcode expands at compile time.
 *
 * The `$(...)` values are deliberate: they inherit from the target's build
 * settings (written by `withXcodeTarget`) so version and identifier live in
 * exactly one place.
 */
const withExtensionInfoPlist = (config, {extensionName}) => {
  return withInfoPlist(config, config => {
    const sourcePath = path.join(
      config.modRequest.projectRoot,
      'modules',
      extensionName,
      'Info.plist',
    )
    const targetPath = path.join(
      config.modRequest.platformProjectRoot,
      extensionName,
      'Info.plist',
    )

    const extPlist = plist.default.parse(fs.readFileSync(sourcePath).toString())

    extPlist.CFBundleName = '$(PRODUCT_NAME)'
    extPlist.CFBundleDisplayName = 'Demo Notifications'
    extPlist.CFBundleIdentifier = '$(PRODUCT_BUNDLE_IDENTIFIER)'
    extPlist.CFBundleVersion = '$(CURRENT_PROJECT_VERSION)'
    extPlist.CFBundleExecutable = '$(EXECUTABLE_NAME)'
    extPlist.CFBundlePackageType = '$(PRODUCT_BUNDLE_PACKAGE_TYPE)'
    extPlist.CFBundleShortVersionString = '$(MARKETING_VERSION)'

    fs.mkdirSync(path.dirname(targetPath), {recursive: true})
    fs.writeFileSync(targetPath, plist.default.build(extPlist))

    return config
  })
}

module.exports = {withExtensionInfoPlist}
