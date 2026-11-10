#!/usr/bin/env node
/*
 * Drift checks for values that are duplicated across languages:
 *  1. Swift DEFAULTS == Kotlin DEFAULTS (keys and values)
 *  2. APP_GROUP literals in Swift == constants.js
 *  3. Kotlin SharedPreferences name == BUNDLE_IDENTIFIER
 *  4. if prebuild has run, ios/DemoNSE/NSEMutation.swift == the module source
 * Exits non-zero on any mismatch.
 */
import {existsSync, readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)
const {APP_GROUP, BUNDLE_IDENTIFIER, EXTENSION_NAME} = require('../constants.js')

const read = p => readFileSync(join(root, p), 'utf8')
const SWIFT_MODULE = 'modules/expo-notif-prefs/ios/ExpoNotifPrefsModule.swift'
const SWIFT_NSE = 'modules/DemoNSE/NotificationService.swift'
const SWIFT_SHARED = 'modules/expo-notif-prefs/ios/NSEMutation.swift'
const KOTLIN =
  'modules/expo-notif-prefs/android/src/main/java/expo/modules/notifprefs/ExpoNotifPrefsModule.kt'

const errors = []

function literal(v) {
  v = v.trim()
  if (v === 'true' || v === 'false') return v === 'true'
  if (/^-?\d+$/.test(v)) return Number(v)
  if (/^"(.*)"$/.test(v)) return v.slice(1, -1)
  throw new Error(`unsupported default literal: ${v}`)
}

function parseDefaults(src, startRe, endMarker, entryRe, label) {
  const start = src.search(startRe)
  if (start < 0) throw new Error(`${label}: DEFAULTS not found`)
  const end = src.indexOf(endMarker, start)
  if (end < 0) throw new Error(`${label}: end of DEFAULTS not found`)
  const out = {}
  for (const m of src.slice(start, end).matchAll(entryRe)) out[m[1]] = literal(m[2])
  if (Object.keys(out).length === 0) throw new Error(`${label}: no entries parsed`)
  return out
}

const swift = parseDefaults(
  read(SWIFT_MODULE),
  /let DEFAULTS[^=]*=\s*\[/,
  '\n]',
  /^\s*"([^"]+)":\s*([^,\n]+),?\s*$/gm,
  'swift',
)
const kotlin = parseDefaults(
  read(KOTLIN),
  /val DEFAULTS\s*=/,
  '\n  )',
  /^\s*"([^"]+)"\s+to\s+([^,\n]+),?\s*$/gm,
  'kotlin',
)

for (const k of new Set([...Object.keys(swift), ...Object.keys(kotlin)])) {
  if (!(k in swift)) errors.push(`DEFAULTS key "${k}" missing in Swift`)
  else if (!(k in kotlin)) errors.push(`DEFAULTS key "${k}" missing in Kotlin`)
  else if (swift[k] !== kotlin[k])
    errors.push(`DEFAULTS "${k}": Swift=${swift[k]} Kotlin=${kotlin[k]}`)
}

for (const f of [SWIFT_MODULE, SWIFT_NSE]) {
  const m = read(f).match(/let APP_GROUP = "([^"]+)"/)
  if (!m) errors.push(`${f}: APP_GROUP literal not found`)
  else if (m[1] !== APP_GROUP)
    errors.push(`${f}: APP_GROUP "${m[1]}" != constants.js "${APP_GROUP}"`)
}

const prefsName = read(KOTLIN).match(/getSharedPreferences\("([^"]+)"/)?.[1]
if (prefsName !== BUNDLE_IDENTIFIER)
  errors.push(`Kotlin prefs name "${prefsName}" != BUNDLE_IDENTIFIER "${BUNDLE_IDENTIFIER}"`)

const copy = join(root, 'ios', EXTENSION_NAME, 'NSEMutation.swift')
if (existsSync(copy) && readFileSync(copy, 'utf8') !== read(SWIFT_SHARED))
  errors.push(`${copy} differs from ${SWIFT_SHARED}; re-run prebuild`)

if (errors.length) {
  console.error('drift check FAILED:\n' + errors.map(e => `  - ${e}`).join('\n'))
  process.exit(1)
}
console.log(
  `drift check ok (${Object.keys(swift).length} defaults, APP_GROUP, prefs name)`,
)
