const {withXcodeProject} = require('expo/config-plugins')

const {
  FALLBACK_IOS_DEPLOYMENT_TARGET,
  FALLBACK_SWIFT_VERSION,
} = require('../../constants')

const unquote = v => (typeof v === 'string' ? v.replace(/^"|"$/g, '') : v)

/** Reads a build setting from the main app target (Expo's own defaults). */
function mainTargetSetting(pbxProject, key) {
  const main = pbxProject.getFirstTarget()
  const list = main && pbxProject.pbxXCConfigurationList()[main.firstTarget.buildConfigurationList]
  const configs = pbxProject.pbxXCBuildConfigurationSection()
  for (const ref of list?.buildConfigurations ?? []) {
    const value = unquote(configs[ref.value]?.buildSettings?.[key])
    if (value) return String(value)
  }
  return undefined
}

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
  {extensionName, controllerName, soundFiles, sharedSource, developmentTeam},
) => {
  return withXcodeProject(config, config => {
    const pbxProject = config.modResults

    /*
     * `expo prebuild` without --clean re-runs mods against an existing project.
     * addTarget would create a duplicate ("multiple commands produce"), so
     * reuse the existing target: skip creation, but still re-apply the build
     * settings below and make sure any newly added source file is registered.
     */
    let existingUuid
    const existingTargets = pbxProject.pbxNativeTargetSection()
    for (const key of Object.keys(existingTargets)) {
      const name = existingTargets[key]?.name
      if (name === extensionName || name === `"${extensionName}"`) {
        existingUuid = key
      }
    }

    const swiftVersion =
      mainTargetSetting(pbxProject, 'SWIFT_VERSION') ?? FALLBACK_SWIFT_VERSION
    const deploymentTarget =
      config.ios?.deploymentTarget ??
      mainTargetSetting(pbxProject, 'IPHONEOS_DEPLOYMENT_TARGET') ??
      FALLBACK_IOS_DEPLOYMENT_TARGET
    const team =
      developmentTeam ?? process.env.DEVELOPMENT_TEAM ?? config.ios?.appleTeamId

    if (existingUuid) {
      const hasFile = file =>
        Object.values(pbxProject.pbxFileReferenceSection()).some(
          ref => unquote(ref?.path) === file,
        )
      const pbxGroupKey = pbxProject.findPBXGroupKey({name: extensionName})
      for (const file of [
        `${extensionName}/${controllerName}.swift`,
        sharedSource && `${extensionName}/${sharedSource.name}`,
      ]) {
        if (file && !hasFile(file) && !hasFile(file.split('/').pop())) {
          pbxProject.addSourceFile(file, {target: existingUuid}, pbxGroupKey)
        }
      }
    }

    if (!existingUuid) {
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
      if (sharedSource) {
        pbxProject.addSourceFile(
          `${extensionName}/${sharedSource.name}`,
          {target: target.uuid},
          pbxGroupKey,
        )
      }

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
      buildSettings.SWIFT_VERSION = swiftVersion
      buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"'
      buildSettings.IPHONEOS_DEPLOYMENT_TARGET = deploymentTarget
      if (team) buildSettings.DEVELOPMENT_TEAM = team

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
