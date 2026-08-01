#!/usr/bin/env node
/*
 * Taps a point on the booted simulator, in DEVICE POINTS.
 *
 * `xcrun simctl` has no tap command, so this drives the Simulator window
 * through System Events. Window bounds are read live on every call - the window
 * moves, and hardcoded screen coordinates silently stop landing on anything,
 * which looks exactly like "the button did nothing".
 *
 * usage: node scripts/tap.mjs <x> <y>        # device points, e.g. 77 446
 */
import {execFileSync} from 'node:child_process'

const [x, y] = process.argv.slice(2).map(Number)
if (!Number.isFinite(x) || !Number.isFinite(y)) {
  console.error('usage: node scripts/tap.mjs <x> <y>   (device points)')
  process.exit(1)
}

// Logical screen size in points for the device this demo targets.
const DEVICE_WIDTH = 402
// Height of the Simulator window's title bar, above the device screen.
const TITLE_BAR = 24

const bounds = execFileSync(
  'osascript',
  [
    '-e',
    'tell application "Simulator" to activate',
    '-e',
    'delay 0.4',
    '-e',
    'tell application "System Events" to tell process "Simulator" to return (position of window 1) & (size of window 1)',
  ],
  {encoding: 'utf8'},
)
  .trim()
  .split(',')
  .map(s => Number(s.trim()))

const [wx, wy, ww] = bounds
const scale = ww / DEVICE_WIDTH
const screenX = Math.round(wx + x * scale)
const screenY = Math.round(wy + TITLE_BAR + y * scale)

execFileSync('osascript', [
  '-e',
  `tell application "System Events" to click at {${screenX}, ${screenY}}`,
])

console.log(`tapped device(${x},${y}) -> screen(${screenX},${screenY})`)
