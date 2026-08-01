#!/usr/bin/env node
/*
 * Sends a fixture to the booted simulator via `xcrun simctl push`.
 *
 * This bypasses APNs entirely, which is what makes the whole demo runnable with
 * no Apple Developer account, no device, and no server. The notification service
 * extension still runs exactly as it would in production, because the OS
 * invokes it based on `mutable-content: 1` in the payload regardless of how the
 * push got here.
 */
import {execFileSync} from 'node:child_process'
import {existsSync, readdirSync, readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const fixturesDir = join(root, 'fixtures')

const available = readdirSync(fixturesDir)
  .filter(f => f.endsWith('.apns'))
  .map(f => f.replace(/\.apns$/, ''))

const name = process.argv[2]
if (!name) {
  console.error(`usage: pnpm push <fixture>\n\navailable: ${available.join(', ')}`)
  process.exit(1)
}

const fixturePath = join(fixturesDir, `${name}.apns`)
if (!existsSync(fixturePath)) {
  console.error(`no such fixture: ${name}\n\navailable: ${available.join(', ')}`)
  process.exit(1)
}

const payload = JSON.parse(readFileSync(fixturePath, 'utf8'))
const bundleId = payload['Simulator Target Bundle']
if (!bundleId) {
  console.error(`${name}.apns is missing "Simulator Target Bundle"`)
  process.exit(1)
}

// Without this the OS displays the payload as-is and the extension never runs.
if (payload.aps?.['mutable-content'] !== 1) {
  console.warn(
    `warning: ${name}.apns has no "mutable-content": 1 — the NSE will NOT be invoked`,
  )
}

try {
  execFileSync('xcrun', ['simctl', 'push', 'booted', bundleId, fixturePath], {
    stdio: 'inherit',
  })
  console.log(`pushed ${name} -> ${bundleId}`)
} catch {
  console.error(
    '\npush failed. Check that a simulator is booted (xcrun simctl list devices | grep Booted)\n' +
      'and that the app has been installed on it at least once.',
  )
  process.exit(1)
}
