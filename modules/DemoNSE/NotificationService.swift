import Intents
import UIKit
import UserNotifications

/*
 * Must match `APP_GROUP` in constants.js and in
 * modules/expo-notif-prefs/ios/ExpoNotifPrefsModule.swift.
 */
let APP_GROUP = "group.com.demo.pusharch"

typealias ContentHandler = (UNNotificationContent) -> Void

// This extension processes a push BEFORE the system displays it. It runs in a
// separate process, on the OS's schedule, whether or not the main app exists.
//
// That is the entire reason it is here. Three things cannot be decided by the
// server or by JS:
//
// - the badge count, which depends on what THIS device has already read
// - whether to play the DM sound, which is a local preference
// - the Communication Notification style, which requires donating an INIntent
//
// The extension cannot call into JS. Every input it needs is either in the push
// payload or was written to App Group storage earlier, while the app was alive.
//
// The system may reuse one instance for several notifications, or spin up
// several in parallel. So: be careful with any value the extension itself
// mutates. `playSoundChat` is only ever WRITTEN by the app and READ here, so a
// torn read is harmless. `badgeCount` is read-modify-written here, so it needs
// the serial queue below.
class NotificationService: UNNotificationServiceExtension {
  private var contentHandler: ContentHandler?
  private var bestAttempt: UNMutableNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping ContentHandler
  ) {
    self.contentHandler = contentHandler

    guard let bestAttempt = NSEUtil.createCopy(request.content),
      let reason = request.content.userInfo["reason"] as? String
    else {
      // Always deliver something, even when the payload is unrecognized.
      contentHandler(request.content)
      return
    }

    self.bestAttempt = bestAttempt

    if reason == "chat-message" {
      mutateWithChatSound(bestAttempt)
      mutateWithGroupSubtitle(bestAttempt, userInfo: request.content.userInfo)
      // Chat notifications deliberately do not touch the badge - they are
      // counted by the conversation list, not the notifications tab.
      let finalContent = createCommunicationNotification(
        from: bestAttempt,
        userInfo: request.content.userInfo
      )
      contentHandler(finalContent)
    } else {
      mutateWithBadge(bestAttempt)
      contentHandler(bestAttempt)
    }
  }

  /*
   * The system gives the extension roughly 30 seconds. If we run out (most
   * likely inside the avatar download), ship what we have rather than letting
   * the system deliver the un-decorated original.
   */
  override func serviceExtensionTimeWillExpire() {
    guard let contentHandler = self.contentHandler,
      let bestAttempt = self.bestAttempt
    else {
      return
    }
    contentHandler(bestAttempt)
  }

  // MARK: - Communication Notification

  /*
   * Turns a plain notification into an iOS Communication Notification: sender
   * name, avatar, Focus-mode filtering, Siri suggestions.
   *
   * This cannot be expressed in the push payload. It requires building an
   * INSendMessageIntent, donating it, and re-deriving the content from it.
   */
  func createCommunicationNotification(
    from content: UNMutableNotificationContent,
    userInfo: [AnyHashable: Any]
  ) -> UNNotificationContent {
    let senderDisplayName = userInfo["senderDisplayName"] as? String ?? "Unknown"
    let convoId = userInfo["convoId"] as? String

    var avatarImage: INImage?
    if let avatarUrlString = userInfo["senderAvatarUrl"] as? String {
      avatarImage = downloadAvatarImage(from: avatarUrlString)
    }

    let senderHandle = INPersonHandle(
      value: userInfo["senderHandle"] as? String,
      type: .unknown
    )
    let sender = INPerson(
      personHandle: senderHandle,
      nameComponents: nil,
      displayName: senderDisplayName,
      image: avatarImage,
      contactIdentifier: nil,
      customIdentifier: nil
    )

    let isGroup = userInfo["convoKind"] as? String == "group"

    var speakableGroupName: INSpeakableString?
    if isGroup,
      let groupName = userInfo["groupName"] as? String,
      !groupName.isEmpty {
      speakableGroupName = INSpeakableString(spokenPhrase: groupName)
    }

    let intent = INSendMessageIntent(
      recipients: nil,
      outgoingMessageType: .outgoingMessageText,
      content: content.body,
      speakableGroupName: speakableGroupName,
      conversationIdentifier: convoId,
      serviceName: nil,
      sender: sender,
      attachments: nil
    )

    /*
     * The payload omits the full recipient list for group convos. With no
     * signal of multiple recipients iOS classifies the notification as
     * `MessagingDirect` and ignores `speakableGroupName` entirely. Setting
     * `recipientCount` on the donation metadata is Apple's documented escape
     * hatch, and it overrides the (empty) recipients array.
     */
    if isGroup,
      let groupMemberCount = userInfo["groupMemberCount"] as? Int,
      groupMemberCount > 0 {
      let metadata = INSendMessageIntentDonationMetadata()
      metadata.recipientCount = groupMemberCount
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
      /*
       * Throws when the `com.apple.developer.usernotifications.communication`
       * entitlement is not honored - which is the common case on a simulator
       * build with no signing team. Degrade to the plain notification rather
       * than dropping it.
       */
      return content
    }
  }

  /*
   * Blocking a thread on a network call is normally indefensible. Here it is
   * required: `contentHandler` must be called with finished content, and the
   * intent has to be fully built before we can return. Bounded by a 5s request
   * timeout inside the extension's ~30s budget, with
   * `serviceExtensionTimeWillExpire` as the backstop.
   */
  func downloadAvatarImage(from urlString: String) -> INImage? {
    guard let url = URL(string: urlString) else { return nil }

    var request = URLRequest(url: url)
    request.timeoutInterval = 5

    var imageData: Data?
    let semaphore = DispatchSemaphore(value: 0)

    let task = URLSession.shared.dataTask(with: request) { data, response, _ in
      if let data = data,
        let httpResponse = response as? HTTPURLResponse,
        httpResponse.statusCode == 200 {
        imageData = data
      }
      semaphore.signal()
    }
    task.resume()
    semaphore.wait()

    guard let data = imageData else { return nil }
    return INImage(imageData: data)
  }

  // MARK: - Mutations

  /*
   * The reason this whole extension exists.
   *
   * The server cannot set `aps.badge` correctly because it does not know what
   * this device has already read. So the count is maintained here, in App Group
   * storage, and decremented by JS as the user reads things.
   *
   * Read-modify-write across processes is not atomic: two pushes arriving
   * together would both read 4 and both write 5. The serial queue serializes
   * them within the extension.
   */
  func mutateWithBadge(_ content: UNMutableNotificationContent) {
    NSEUtil.shared.prefsQueue.sync {
      var count = NSEUtil.shared.prefs?.integer(forKey: "badgeCount") ?? 0
      count += 1

      content.badge = NSNumber(value: count)
      NSEUtil.shared.prefs?.setValue(count, forKey: "badgeCount")
    }
  }

  /*
   * Reads a preference the app wrote while it was foregrounded. No queue needed:
   * the extension never writes this key, so the worst case is one notification
   * using a setting the user changed moments ago.
   */
  func mutateWithChatSound(_ content: UNMutableNotificationContent) {
    if NSEUtil.shared.prefs?.bool(forKey: "playSoundChat") == true {
      content.sound = UNNotificationSound(
        named: UNNotificationSoundName(rawValue: "dm.aiff")
      )
    } else {
      content.sound = nil
    }
  }

  // For group convos, surface the group name as the subtitle. The title is
  // taken over by INSendMessageIntent to show the sender.
  func mutateWithGroupSubtitle(
    _ content: UNMutableNotificationContent,
    userInfo: [AnyHashable: Any]
  ) {
    guard userInfo["convoKind"] as? String == "group",
      let groupName = userInfo["groupName"] as? String,
      !groupName.isEmpty
    else {
      return
    }
    content.subtitle = groupName
  }
}

/*
 * Shares one UserDefaults handle and one serial queue across however many
 * NotificationService instances the system decides to create.
 */
private class NSEUtil {
  static let shared = NSEUtil()

  var prefs = UserDefaults(suiteName: APP_GROUP)
  var prefsQueue = DispatchQueue(label: "NSEPrefsQueue")

  static func createCopy(_ content: UNNotificationContent) -> UNMutableNotificationContent? {
    return content.mutableCopy() as? UNMutableNotificationContent
  }
}
