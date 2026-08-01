/**
 * Preferences shared with the notification service extension via App Group
 * storage.
 *
 * Deliberately narrower than the native `DEFAULTS` maps. Only expose a key here
 * once native code actually reads it - a settings toggle that writes a
 * preference nothing honors is a lie to the user, and the type is what enforces
 * that.
 */
export type NotifPrefs = {
  playSoundChat: boolean
  badgeCount: number
}

export type ExpoNotifPrefsModule = {
  getAllPrefsAsync: () => Promise<NotifPrefs>
  getBoolAsync: (forKey: keyof NotifPrefs) => Promise<boolean>
  setBoolAsync: (forKey: keyof NotifPrefs, value: boolean) => Promise<void>
  getBadgeCountAsync: () => Promise<number>
  setBadgeCountAsync: (count: number) => Promise<void>

  /**
   * Runs the notification service extension's logic in-process and posts the
   * resulting local notification.
   *
   * `xcrun simctl push` cannot invoke a real NSE (see the README), so this is
   * the only way to observe the extension's behaviour on a simulator. On a
   * real device over APNs the extension itself does this work and this function
   * is unnecessary.
   *
   * @returns the App Group badge count after the simulated delivery
   */
  simulateNsePush: (
    reason: string,
    /** JSON-encoded: Expo's Swift bridge cannot convert `[String: Any]`. */
    userInfoJson: string,
    delaySeconds: number,
  ) => Promise<number>
}
