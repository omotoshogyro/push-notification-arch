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
 * NOTE: this map is duplicated in the Android module. Nothing asserts they
 * match - the same maintenance hazard social-app carries. See README.
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
     * It is a DUPLICATE of the extension's logic, which is exactly the hazard
     * flagged in the README. NotificationService.swift is the canonical copy;
     * change it first, then mirror here.
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

      if reason == "chat-message" {
        // Mirrors `mutateWithChatSound`.
        if userDefaults?.bool(forKey: "playSoundChat") == true {
          content.sound = UNNotificationSound(
            named: UNNotificationSoundName(rawValue: "dm.aiff")
          )
        } else {
          content.sound = nil
        }
        // Mirrors `mutateWithGroupSubtitle`.
        if userInfo["convoKind"] as? String == "group",
          let groupName = userInfo["groupName"] as? String,
          !groupName.isEmpty {
          content.subtitle = groupName
        }
      } else {
        // Mirrors `mutateWithBadge`, including the serial queue.
        NSEPrefs.shared.queue.sync {
          var count = userDefaults?.integer(forKey: "badgeCount") ?? 0
          count += 1
          content.badge = NSNumber(value: count)
          userDefaults?.setValue(count, forKey: "badgeCount")
          badgeAfter = count
        }
      }

      var finalContent: UNNotificationContent = content
      if reason == "chat-message" {
        finalContent = Self.communicationContent(from: content, userInfo: userInfo)
      }

      let trigger =
        delaySeconds > 0
        ? UNTimeIntervalNotificationTrigger(timeInterval: delaySeconds, repeats: false)
        : nil
      let request = UNNotificationRequest(
        identifier: UUID().uuidString,
        content: finalContent,
        trigger: trigger
      )
      UNUserNotificationCenter.current().add(request)

      return badgeAfter
    }
  }

  /// Mirrors `createCommunicationNotification` in the extension.
  static func communicationContent(
    from content: UNMutableNotificationContent,
    userInfo: [String: Any]
  ) -> UNNotificationContent {
    let senderDisplayName = userInfo["senderDisplayName"] as? String ?? "Unknown"
    let isGroup = userInfo["convoKind"] as? String == "group"

    var avatarImage: INImage?
    if let urlString = userInfo["senderAvatarUrl"] as? String,
      let url = URL(string: urlString),
      let data = try? Data(contentsOf: url) {
      avatarImage = INImage(imageData: data)
    }

    let sender = INPerson(
      personHandle: INPersonHandle(value: userInfo["senderHandle"] as? String, type: .unknown),
      nameComponents: nil,
      displayName: senderDisplayName,
      image: avatarImage,
      contactIdentifier: nil,
      customIdentifier: nil
    )

    var speakableGroupName: INSpeakableString?
    if isGroup, let groupName = userInfo["groupName"] as? String, !groupName.isEmpty {
      speakableGroupName = INSpeakableString(spokenPhrase: groupName)
    }

    let intent = INSendMessageIntent(
      recipients: nil,
      outgoingMessageType: .outgoingMessageText,
      content: content.body,
      speakableGroupName: speakableGroupName,
      conversationIdentifier: userInfo["convoId"] as? String,
      serviceName: nil,
      sender: sender,
      attachments: nil
    )

    // Without recipientCount iOS classifies a group as MessagingDirect and
    // drops the group name entirely.
    if isGroup, let memberCount = userInfo["groupMemberCount"] as? Int, memberCount > 0 {
      let metadata = INSendMessageIntentDonationMetadata()
      metadata.recipientCount = memberCount
      intent.donationMetadata = metadata
    }
    if isGroup, let avatarImage {
      intent.setImage(avatarImage, forParameterNamed: \.speakableGroupName)
    }

    let interaction = INInteraction(intent: intent, response: nil)
    interaction.direction = .incoming
    interaction.donate(completion: nil)

    do {
      return try content.updating(from: intent)
    } catch {
      return content
    }
  }
}

/// Shared serial queue, mirroring `NSEUtil` in the extension.
private class NSEPrefs {
  static let shared = NSEPrefs()
  let queue = DispatchQueue(label: "NSEPrefsQueue")
}
