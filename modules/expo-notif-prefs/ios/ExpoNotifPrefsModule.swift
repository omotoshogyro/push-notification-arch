import ExpoModulesCore
import Intents
import UserNotifications

/*
 * Must match `APP_GROUP` in constants.js and the literal in
 * DemoNSE/NotificationService.swift. There is no way to share a constant across
 * the process boundary, so this value is duplicated in three places by design.
 */
let APP_GROUP = "group.com.demo.pusharch"

/*
 * Defaults are seeded here rather than read lazily so that the notification
 * service extension never encounters a missing key. The extension runs when the
 * app may never have launched in this state, and a nil read there would silently
 * mean "sound off" rather than the intended default.
 *
 * NOTE: this map is duplicated in the Android module. `pnpm check:drift`
 * (scripts/check-drift.mjs, run in CI) asserts they match. Keep one
 * `"key": value,` entry per line so the script can parse it.
 */
let DEFAULTS: [String: Any] = [
  "playSoundChat": true,
  "badgeCount": 0,
]

/*
 * The purpose of this module is to store values that the notification service
 * extension needs. Since we would rather write values while the app is
 * foregrounded, we should use this module liberally and keep background fetches
 * out of the extension entirely.
 */
public class ExpoNotifPrefsModule: Module {
  let userDefaults = UserDefaults(suiteName: APP_GROUP)

  public func definition() -> ModuleDefinition {
    Name("ExpoNotifPrefs")

    OnCreate {
      /*
       * Existence check, not an unconditional write: a real value set by the
       * user in a previous launch must never be clobbered by a default.
       */
      DEFAULTS.forEach { pref in
        if userDefaults?.value(forKey: pref.key) == nil {
          userDefaults?.setValue(pref.value, forKey: pref.key)
        }
      }
    }

    AsyncFunction("getAllPrefsAsync") { () -> [String: Any]? in
      return userDefaults?.dictionaryWithValues(forKeys: Array(DEFAULTS.keys))
    }

    AsyncFunction("getBoolAsync") { (forKey: String) -> Bool in
      return userDefaults?.bool(forKey: forKey) ?? false
    }

    AsyncFunction("setBoolAsync") { (forKey: String, value: Bool) in
      userDefaults?.setValue(value, forKey: forKey)
    }

    AsyncFunction("getBadgeCountAsync") { () -> Int in
      return userDefaults?.integer(forKey: "badgeCount") ?? 0
    }

    /*
     * Writes only the App Group copy of the count - the number the extension
     * will increment FROM next time. The OS badge is set separately by JS via
     * expo-notifications. Both writes are required; see src/notifications/badge.ts.
     */
    AsyncFunction("setBadgeCountAsync") { (count: Int) in
      userDefaults?.setValue(count, forKey: "badgeCount")
    }

    /*
     * ---------------------------------------------------------------------
     * SIMULATOR-ONLY STAND-IN FOR THE NOTIFICATION SERVICE EXTENSION
     * ---------------------------------------------------------------------
     *
     * `xcrun simctl push` delivers a notification straight into the
     * notification center. It does NOT run the app's Notification Service
     * Extension - that only happens for pushes that arrive over APNs, which
     * needs a real device and a paid developer account. Verified empirically:
     * a title mutation added inside DemoNSE never appeared on a simctl push.
     *
     * So the real extension (modules/DemoNSE/NotificationService.swift) builds,
     * signs, and embeds correctly, but cannot be *invoked* here. This function
     * runs the same logic in-process against the same App Group store so the
     * cross-process coordination is still observable on a simulator.
     *
     * The mutation itself is NOT duplicated: both this function and the
     * extension call `NSEMutation` (NSEMutation.swift, a single source file
     * compiled into both targets), so they cannot diverge.
     */
    /*
     * `userInfo` arrives as a JSON string rather than a dictionary: Expo's Swift
     * bridge has no conversion for `[String: Any]`, and passing one makes the
     * call reject before the body ever runs.
     */
    AsyncFunction("simulateNsePush") {
      (reason: String, userInfoJson: String, delaySeconds: Double) -> Int in
      let userInfo =
        (try? JSONSerialization.jsonObject(with: Data(userInfoJson.utf8)))
        as? [String: Any] ?? [:]

      let content = UNMutableNotificationContent()
      content.title = (userInfo["title"] as? String) ?? "Notification"
      content.body = (userInfo["body"] as? String) ?? ""
      content.userInfo = userInfo.merging(["reason": reason]) { _, new in new }

      var badgeAfter = userDefaults?.integer(forKey: "badgeCount") ?? 0
      let info = userInfo as [AnyHashable: Any]
      if let newBadge = NSEMutation.mutate(
        content, reason: reason, userInfo: info, prefs: userDefaults)
      {
        badgeAfter = newBadge
      }

      // Same non-blocking avatar pipeline as the extension; the request is
      // scheduled when it completes, so the JS call returns immediately.
      let delay = delaySeconds
      NSEMutation.finalize(content, reason: reason, userInfo: info) { finalContent in
        let trigger =
          delay > 0
          ? UNTimeIntervalNotificationTrigger(timeInterval: delay, repeats: false)
          : nil
        let request = UNNotificationRequest(
          identifier: UUID().uuidString,
          content: finalContent,
          trigger: trigger
        )
        UNUserNotificationCenter.current().add(request)
      }

      return badgeAfter
    }
  }
}
