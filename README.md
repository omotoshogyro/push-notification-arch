# push-arch-demo

A minimal, runnable implementation of the push notification architecture used by
the Bluesky social app — the five layers that exist because `expo-notifications`
alone cannot do four specific things.

This is a learning scaffold. Every file maps to a real file in
[`bluesky-social/social-app`](https://github.com/bluesky-social/social-app), at
roughly a tenth of the size.

---

## The problem this architecture solves

`expo-notifications` handles registration, permissions, foreground presentation,
and tap handling. That is most of a push pipeline, and this demo uses it for all
of those.

The gap is narrow but absolute: **`setNotificationHandler` only runs while the JS
runtime is alive.** When the app is killed and a push arrives, iOS renders it
straight from the payload. No JavaScript executes. So anything that must be
decided *per notification, using device-local state* is impossible in pure JS:

| Need | Why the payload can't carry it |
|---|---|
| Badge count | The server doesn't know what *this device* has already read |
| DM sound on/off | A local preference; the server would have to store it per-device |
| Communication Notifications | Requires donating an `INIntent` — an API call, not a payload field |
| Android per-type channels | The channel must be chosen at delivery time |

Each forces a layer.

---

## Layout

```
constants.js                          bundle id / App Group / extension name — one source of truth
app.config.js                         entitlements + plugin registration

plugins/notificationsExtension/       LAYER 1 — build time
  index.js                              composes the six mods, in order
  withAppEntitlements.js                App Group on the MAIN app
  withExtensionEntitlements.js          App Group on the EXTENSION
  withExtensionInfoPlist.js             NSExtensionPointIdentifier
  withExtensionSourceFiles.js           copies Swift out of modules/ into ios/
  withSounds.js                         bundles dm.aiff into both targets
  withXcodeTarget.js                    creates + wires the Xcode target

modules/DemoNSE/                      LAYER 2 — the extension (separate process)
  NotificationService.swift             extension lifecycle only (once-only handler, expiry)
  Info.plist

modules/expo-notif-prefs/             LAYER 3 — the App Group bridge
  ios/ExpoNotifPrefsModule.swift        UserDefaults(suiteName:) + the simulator stand-in
  ios/NSEMutation.swift                 SHARED mutation logic: badge, sound, INSendMessageIntent, avatar fetch
  android/…/ExpoNotifPrefsModule.kt     parity stub — same JS API, SharedPreferences
  src/ExpoNotifPrefs.types.ts

src/notifications/                    LAYER 5 — JS
  registration.ts                       token + permissions, with the two defensive workarounds
  badge.ts                              the two-write reconciliation
  unread.tsx                            adaptive polling + the load-shedding heuristic
  payload.ts                            runtime payload validation + payload -> screen (pure)
  routing.ts                            expo-notifications glue, once-per-runtime guard
  pollPolicy.ts                         load-shedding decision (pure)
  simulate.ts                           stand-in for APNs delivery (see Limitations)

fixtures/*.apns                       payloads for `pnpm push`
scripts/push.mjs                      xcrun simctl push wrapper
scripts/appgroup.mjs                  dumps the shared App Group plist
scripts/tap.mjs                       taps the simulator by device point
scripts/check-drift.mjs               asserts Swift/Kotlin DEFAULTS and shared literals agree
```

Layer 4 in social-app is a **load-bearing patch** to `expo-notifications` that
hooks Android's `FirebaseMessagingDelegate.onMessageReceived`. It is deliberately
out of scope here — see Limitations.

---

## Mapping to social-app

| Here | There |
|---|---|
| `plugins/notificationsExtension/` | `plugins/notificationsExtension/` |
| `modules/DemoNSE/NotificationService.swift` | `modules/BlueskyNSE/NotificationService.swift` |
| `modules/expo-notif-prefs/` | `modules/expo-background-notification-handler/` |
| `src/notifications/registration.ts` | `src/lib/notifications/notifications.ts` |
| `src/notifications/badge.ts` | `decrementBadgeCount` / `resetBadgeCount` |
| `src/notifications/unread.tsx` | `src/state/queries/notifications/unread.tsx` |
| `src/notifications/routing.ts` | `handlePushNotificationEntry` in `src/Navigation.tsx` |

---

## Running it

Requires Xcode and a booted iOS simulator.

```bash
pnpm install
pnpm exec expo prebuild -p ios --clean
pnpm exec expo run:ios
```

If `pod install` fails with gem errors, your shell has a polluted `GEM_PATH`
(RVM/rbenv). Build with a clean environment:

```bash
env -u GEM_PATH -u GEM_HOME -u RUBYOPT -u RUBYLIB \
  PATH="/usr/bin:/opt/homebrew/bin:$(dirname $(which node)):/bin" \
  pnpm exec expo prebuild -p ios --clean
```

`pnpm start` needs port 8081 free. For a self-contained build with the JS bundle
embedded (no Metro, and the honest way to test "app is killed"):

```bash
xcodebuild -workspace ios/PushArchDemo.xcworkspace -scheme PushArchDemo \
  -configuration Release -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath ios/build-release build
xcrun simctl install booted ios/build-release/Build/Products/Release-iphonesimulator/PushArchDemo.app
xcrun simctl launch booted com.demo.pusharch
```

---

## What to look at

### 1. Badge counting across processes

The Debug tab shows the App Group counter, the OS icon badge, and whether they
agree. Tap **like** under "Simulate a delivery", background the app, and watch
the icon badge increment. Then **Mark all read** and watch both drop to zero.

Two writes, not one — and they are different things:

```ts
await NotifPrefs.setBadgeCountAsync(count)  // the value the extension increments FROM
await setBadgeCountAsync(count)             // the number on the icon right now
```

Letting them drift is the classic "badge says 3, inbox is empty" bug. Inspect the
shared store directly:

```bash
node scripts/appgroup.mjs
```

Note: `UserDefaults` buffers writes, so the on-disk plist lags a running app.
The Debug screen reads live and is the source of truth; the plist catches up when
the app terminates.

### 2. The load-shedding heuristic

`src/notifications/unread.tsx`:

```ts
if (isPoll && unreadCount !== 0) {
  if (unreadCount >= 30) return           // badge shows "30+" and cannot change
  if (Math.random() >= 0.5) return        // n -> n+1 barely matters
}
```

The badge is only interesting when it *changes*. The Debug tab's poll log labels
every tick, so you can drive it through all three regimes with the +1 / +10 / +35
buttons and watch `polled` turn into `skipped:coinflip` and then `skipped:30+`.
`Math.random()` rather than every-other-tick also jitters clients apart instead of
letting them stampede a shared interval.

Also there: `AppState` gating, an overlap guard, and `fetchAdditionalData:
!!invalidate` so cheap polls skip hydrating post subjects — the single biggest
saving in the loop.

### 3. A preference crossing the process boundary

Toggle **DM sound**, force-quit the app, then trigger a DM. The sound follows the
toggle even though no JS ran. That is the entire point of the App Group.

The extension's concurrency comment is worth reading: only keys the extension
*itself* mutates need the serial queue. `playSoundChat` is written by the app and
only read by the extension, so a torn read is harmless. `badgeCount` is
read-modify-written, so it is not.

### 4. Communication Notifications

`createCommunicationNotification` in the NSE. Three non-obvious details:

- The avatar fetch is callback-based (no thread parked on a semaphore). It is
  https-only with a public-looking host, capped at 2 MB, and has a hard 8s
  overall deadline (not just an idle timeout), inside the extension's ~30s
  budget. `contentHandler` is invoked through one lock-guarded `finish()` so the
  normal path and `serviceExtensionTimeWillExpire` can never both call it.
- Group chats need `metadata.recipientCount`. Without it iOS sees zero recipients,
  classifies the notification as `MessagingDirect`, and silently drops the group
  name.
- Chat notifications deliberately **skip the badge** — they are counted by the
  conversation list, not the notifications tab.

---

## Known limitations

**1. `xcrun simctl push` does not invoke Notification Service Extensions.**

This is the big one, and it was verified here rather than assumed: a title
mutation added inside `DemoNSE` never appeared on a `simctl push`, and a payload
with no `aps.badge` produced no badge. `simctl push` injects a notification
directly into the notification center, bypassing the APNs path that runs the
extension. Running the real NSE needs a physical device and a paid Apple
Developer account.

So `pnpm push <fixture>` exercises delivery, presentation, and tap routing — but
not the extension.

To keep the extension's behaviour observable, `simulateNsePush` in
`ExpoNotifPrefsModule.swift` re-runs the same logic in-process against the same
App Group store, and the Debug tab's "Simulate a delivery" card drives it. Same
reads, same writes, same serial queue — different process.

The mutation logic is **not** duplicated any more: it lives once in
`modules/expo-notif-prefs/ios/NSEMutation.swift`, which is compiled into the pod
(for `simulateNsePush`) and copied into the extension target by the config
plugin on every prebuild. `NotificationService.swift` only handles the
extension lifecycle (once-only `contentHandler`, expiry). Edit
`NSEMutation.swift` only; `pnpm check:drift` fails if a prebuilt copy is stale.

**2. Android is a parity stub.** `ExpoNotifPrefsModule.kt` shows the same JS API
over `SharedPreferences`, but the other half of Android's story — intercepting
`FirebaseMessagingDelegate.onMessageReceived` to rewrite `channelId` per
notification type — needs a patch to `expo-notifications` plus a Firebase project.
social-app's patch is literally headed `## LOAD BEARING PATCH, DO NOT REMOVE`.

**3. `DEFAULTS` is duplicated** between the Swift and Kotlin modules (inherited
from social-app). `pnpm check:drift` (run in CI) asserts the two maps match, and
that the `APP_GROUP` literals agree with `constants.js`.

**4. Communication Notifications may render plain.** They need
`com.apple.developer.usernotifications.communication`. The simulated entitlements
do include it, but if it is not honored, `content.updating(from: intent)` throws
and the `do`/`catch` degrades to a plain notification — the same fallback
social-app ships.

**5. Tests cover the JS only.** `pnpm test` (node:test via tsx) covers payload
validation/routing and the poll load-shedding policy. The Swift NSE logic only
runs when the app is dead and has no automated tests; it is type-checked with
`swiftc` against the iOS simulator SDK but never executed in CI.

**6. Known follow-up: Expo SDK 54 is not the latest.** Upgrading the Expo major
version was deliberately out of scope here.

---

## Signing

The extension target uses ad-hoc signing by default. To set a team, pass
`DEVELOPMENT_TEAM=<id>` in the environment at prebuild, set `ios.appleTeamId` in
the Expo config, or pass `developmentTeam` to the plugin. Swift version and
deployment target come from `ios.deploymentTarget` / the main app target, with
fallbacks in `constants.js`. Re-running prebuild without `--clean` updates the
existing extension target rather than skipping it.

## Verified

- The config plugin generates a correct NSE target: `PlugIns/DemoNSE.appex`
  builds, signs ad-hoc, and passes `ValidateEmbeddedBinary`.
- Both targets carry the App Group **and** the communication entitlement in their
  simulated entitlements.
- `dm.aiff` lands in both the app bundle and the extension bundle.
- The App Group round-trips: JS seeds defaults, native increments, JS reads back.
  The counter survived app termination and reinstall.
- The OS icon badge tracks the App Group counter with the app backgrounded.
- Chat deliveries skip the badge; `like` deliveries increment it.
- The poll log shows load shedding across all three regimes.
- `pnpm push` delivers notifications and they render.

## Not verified

- The real NSE executing (needs a device + APNs; see Limitations).
- The **Mark all read** decrement path end to end. `resetBadgeCount()` is
  exercised by the same two-write code as the rest, but driving the button
  through `scripts/tap.mjs` proved unreliable, so this was never confirmed
  interactively. Tap it yourself and watch both counters drop to zero.
- Whether the DM banner renders as a true Communication Notification (avatar and
  all) versus the plain fallback. The banner fires and shows the sender as the
  title, which is `INSendMessageIntent` behaviour, but the avatar did not appear
  in testing — the `do`/`catch` fallback may be what you are seeing.
- Anything on Android.
