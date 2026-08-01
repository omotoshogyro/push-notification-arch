#!/usr/bin/env node
/*
 * Prints the App Group preferences plist that the app and the notification
 * service extension share on a booted simulator.
 *
 * The container UUID changes every time the app is reinstalled, so it has to be
 * resolved by reading each container's metadata rather than hardcoded.
 *
 * usage: node scripts/appgroup.mjs [--path]
 */
import {execFileSync} from 'node:child_process'
import {existsSync, readdirSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'

const APP_GROUP = 'group.com.demo.pusharch'

const booted = execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'], {
  encoding: 'utf8',
})
const devices = Object.values(JSON.parse(booted).devices).flat()
if (devices.length === 0) {
  console.error('no booted simulator')
  process.exit(1)
}

const root = join(
  homedir(),
  'Library/Developer/CoreSimulator/Devices',
  devices[0].udid,
  'data/Containers/Shared/AppGroup',
)

if (!existsSync(root)) {
  console.error('no App Group containers yet — launch the app once')
  process.exit(1)
}

for (const dir of readdirSync(root)) {
  const metadata = join(root, dir, '.com.apple.mobile_container_manager.metadata.plist')
  if (!existsSync(metadata)) continue
  let id
  try {
    id = execFileSync('plutil', ['-extract', 'MCMMetadataIdentifier', 'raw', metadata], {
      encoding: 'utf8',
    }).trim()
  } catch {
    continue
  }
  if (id !== APP_GROUP) continue

  const plist = join(root, dir, 'Library/Preferences', `${APP_GROUP}.plist`)
  if (process.argv.includes('--path')) {
    console.log(plist)
  } else if (existsSync(plist)) {
    execFileSync('plutil', ['-p', plist], {stdio: 'inherit'})
  } else {
    console.error('container exists but no prefs written yet')
    process.exit(1)
  }
  process.exit(0)
}

console.error(`no container found for ${APP_GROUP}`)
process.exit(1)
