import Intents
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
  // All of the below is guarded by `lock`: `didReceive`, the avatar callback
  // (arbitrary queue) and `serviceExtensionTimeWillExpire` can race.
  private let lock = NSLock()
  private var contentHandler: ContentHandler?
  private var bestAttempt: UNMutableNotificationContent?
  private var download: AvatarDownload?

  /*
   * The ONLY place `contentHandler` is invoked. Calling it twice is a contract
   * violation, and the normal path can race with the expiry callback, so the
   * handler is taken out under the lock: whoever gets here first delivers, any
   * later caller is a no-op. A pending avatar download is cancelled.
   */
  private func finish(_ content: UNNotificationContent) {
    lock.lock()
    let handler = contentHandler
    contentHandler = nil
    let pending = download
    download = nil
    lock.unlock()

    pending?.cancel()
    handler?(content)
  }

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping ContentHandler
  ) {
    lock.lock()
    self.contentHandler = contentHandler
    lock.unlock()

    guard let bestAttempt = NSEUtil.createCopy(request.content),
      let reason = request.content.userInfo["reason"] as? String
    else {
      // Always deliver something, even when the payload is unrecognized.
      finish(request.content)
      return
    }

    lock.lock()
    self.bestAttempt = bestAttempt
    lock.unlock()

    // The mutation logic lives in NSEMutation.swift, shared with the app's
    // `simulateNsePush` so the two cannot drift.
    NSEMutation.mutate(
      bestAttempt,
      reason: reason,
      userInfo: request.content.userInfo,
      prefs: NSEUtil.shared.prefs
    )

    let pending = NSEMutation.finalize(
      bestAttempt,
      reason: reason,
      userInfo: request.content.userInfo
    ) { [weak self] finalContent in
      self?.finish(finalContent)
    }

    if let pending {
      lock.lock()
      // If the download already completed, `finish` ran and the handler is
      // gone; cancelling a finished download is harmless.
      let alreadyDone = self.contentHandler == nil
      if !alreadyDone { download = pending }
      lock.unlock()
    }
  }

  /*
   * The system gives the extension roughly 30 seconds. If we run out, ship what
   * we have (badge/sound already applied) rather than letting the system
   * deliver the un-decorated original. `finish` makes this safe against the
   * normal path having just delivered.
   */
  override func serviceExtensionTimeWillExpire() {
    lock.lock()
    let attempt = bestAttempt
    lock.unlock()
    if let attempt { finish(attempt) }
  }
}

/*
 * Shares one UserDefaults handle across however many NotificationService
 * instances the system decides to create. The serial queue for read-modify-write
 * lives in NSEMutation.prefsQueue.
 */
private class NSEUtil {
  static let shared = NSEUtil()

  var prefs = UserDefaults(suiteName: APP_GROUP)

  static func createCopy(_ content: UNNotificationContent) -> UNMutableNotificationContent? {
    return content.mutableCopy() as? UNMutableNotificationContent
  }
}
