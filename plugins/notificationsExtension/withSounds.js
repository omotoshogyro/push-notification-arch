const fs = require('fs')
const path = require('path')

const {withXcodeProject} = require('expo/config-plugins')

/**
 * Copies custom notification sounds into BOTH the extension's directory and the
 * main app's.
 *
 * Apple documents that custom notification sounds are resolved against the
 * containing app's bundle, but it is the extension that sets `content.sound`.
 * Rather than gamble on which bundle iOS consults, ship it in both. The file is
 * small and this removes an entire class of silent-notification debugging.
 *
 * Two copies are also needed because `pbxProject.addResourceFile` dedupes by
 * path - registering the same relative path against a second target is a silent
 * no-op, so the app target needs its own distinct path.
 */
const withSounds = (config, {extensionName, soundFiles}) => {
  return withXcodeProject(config, config => {
    for (const file of soundFiles) {
      const sourcePath = path.join(
        config.modRequest.projectRoot,
        'assets',
        'sounds',
        file,
      )

      for (const dir of [extensionName, config.modRequest.projectName]) {
        if (!dir) continue
        const targetPath = path.join(
          config.modRequest.platformProjectRoot,
          dir,
          file,
        )
        fs.mkdirSync(path.dirname(targetPath), {recursive: true})
        fs.copyFileSync(sourcePath, targetPath)
      }
    }

    return config
  })
}

module.exports = {withSounds}
