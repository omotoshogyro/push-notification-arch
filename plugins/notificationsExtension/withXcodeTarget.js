const {withXcodeProject} = require('expo/config-plugins')

/**
 * Creates the actual Xcode target for the extension and wires the copied files
 * into it.
 *
 * Must run LAST: `addFile`/`addSourceFile` register paths in the pbxproj, and
 * the files they point at have to already exist on disk (written by
 * `withExtensionInfoPlist`, `withExtensionSourceFiles`, `withSounds`).
 */
const withXcodeTarget = (
  config,
  {extensionName, controllerName, soundFiles},
) => {
  return withXcodeProject(config, config => {
    const pbxProject = config.modResults

    /*
     * `expo prebuild` without --clean re-runs mods against an existing project.
     * addTarget would then create a duplicate, which fails the build with a
     * confusing "multiple commands produce" error, so bail if it is already there.
     */
    const existingTargets = pbxProject.pbxNativeTargetSection()
    for (const key of Object.keys(existingTargets)) {
      const name = existingTargets[key]?.name
      if (name === extensionName || name === `"${extensionName}"`) {
        return config
      }
    }

    const target = pbxProject.addTarget(
      extensionName,
      'app_extension',
      extensionName,
    )

    pbxProject.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', target.uuid)
    pbxProject.addBuildPhase(
      [],
      'PBXResourcesBuildPhase',
      'Resources',
      target.uuid,
    )

    const pbxGroupKey = pbxProject.pbxCreateGroup(extensionName, extensionName)

    pbxProject.addFile(`${extensionName}/Info.plist`, pbxGroupKey)
    pbxProject.addSourceFile(
      `${extensionName}/${controllerName}.swift`,
      {target: target.uuid},
      pbxGroupKey,
    )

    /*
     * `addResourceFile` runs `correctForResourcesPath`, which does an unguarded
     * `pbxGroupByName('Resources').path`. Expo projects have no group by that
     * name, so it throws on null. Creating an empty one first is the least
     * invasive fix; with no `path` set the correction is a no-op, which is what
     * we want since our paths are already relative to the project root.
     *
     * (social-app dodges this by calling addSourceFile for sounds instead, but
     * that lands them in the Sources phase rather than Resources.)
     */
    if (!pbxProject.pbxGroupByName('Resources')) {
      pbxProject.addPbxGroup([], 'Resources', '""')
    }

    /*
     * Register each sound against both targets, using the two distinct copies
     * written by `withSounds`. addResourceFile dedupes by path, so passing the
     * same path twice would silently drop the second registration.
     */
    const mainTarget = pbxProject.getFirstTarget()
    const projectName = config.modRequest.projectName
    for (const file of soundFiles) {
      pbxProject.addResourceFile(
        `${extensionName}/${file}`,
        {target: target.uuid},
        pbxGroupKey,
      )
      if (mainTarget?.uuid && projectName) {
        pbxProject.addResourceFile(
          `${projectName}/${file}`,
          {target: mainTarget.uuid},
          pbxGroupKey,
        )
      }
    }

    const configurations = pbxProject.pbxXCBuildConfigurationSection()
    for (const key in configurations) {
      const buildSettings = configurations[key]?.buildSettings
      if (!buildSettings) continue
      if (buildSettings.PRODUCT_NAME !== `"${extensionName}"`) continue

      buildSettings.CLANG_ENABLE_MODULES = 'YES'
      buildSettings.INFOPLIST_FILE = `"${extensionName}/Info.plist"`
      buildSettings.CODE_SIGN_ENTITLEMENTS = `"${extensionName}/${extensionName}.entitlements"`
      buildSettings.CURRENT_PROJECT_VERSION = `"${config.ios?.buildNumber ?? '1'}"`
      buildSettings.MARKETING_VERSION = `"${config.version ?? '1.0.0'}"`
      buildSettings.GENERATE_INFOPLIST_FILE = 'YES'
      buildSettings.PRODUCT_BUNDLE_IDENTIFIER = `"${config.ios?.bundleIdentifier}.${extensionName}"`
      buildSettings.SWIFT_EMIT_LOC_STRINGS = 'YES'
      buildSettings.SWIFT_VERSION = '5.0'
      buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"'
      buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '15.1'

      /*
       * social-app pins DEVELOPMENT_TEAM to Bluesky's team id here. This demo
       * has no team and relies on Xcode's ad-hoc "Sign to Run Locally"
       * identity, which is all a simulator build needs.
       *
       * Do NOT disable code signing for this target. An unsigned .appex carries
       * no entitlements, which means no App Group, which means
       * `UserDefaults(suiteName:)` silently returns nil inside the extension and
       * the badge counter never persists. Ad-hoc signing still applies the
       * entitlements file, so leave it on.
       */
      buildSettings.CODE_SIGN_STYLE = 'Automatic'
    }

    return config
  })
}

module.exports = {withXcodeTarget}
