package expo.modules.notifprefs

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/*
 * PARITY STUB - not exercised by this demo.
 *
 * Included to show the shape of the idea: the SAME JS API over a completely
 * different backend. iOS shares state with a separate extension process via an
 * App Group; Android has no extension, so the equivalent store is ordinary
 * SharedPreferences read by the FCM service inside the same process.
 *
 * What is deliberately NOT here is the other half of Android's story: the
 * interception of `FirebaseMessagingDelegate.onMessageReceived`, which in
 * social-app requires a patch to expo-notifications plus a Firebase project.
 * See README "Known limitations".
 */

// NOTE: duplicated from ios/ExpoNotifPrefsModule.swift with nothing asserting
// they match. Same maintenance hazard social-app carries.
val DEFAULTS =
  mapOf<String, Any>(
    "playSoundChat" to true,
    "badgeCount" to 0,
  )

class ExpoNotifPrefsModule : Module() {
  private fun prefs(context: Context?) =
    context?.getSharedPreferences("com.demo.pusharch", Context.MODE_PRIVATE)
      ?: throw Error("Context is null")

  override fun definition() =
    ModuleDefinition {
      Name("ExpoNotifPrefs")

      OnCreate {
        val p = prefs(appContext.reactContext)
        p.edit().apply {
          DEFAULTS.forEach { (key, value) ->
            // Existence check so a stored value is never clobbered by a default.
            if (p.contains(key)) return@forEach
            when (value) {
              is Boolean -> putBoolean(key, value)
              is Int -> putInt(key, value)
            }
          }
        }.apply()
      }

      AsyncFunction("getAllPrefsAsync") {
        return@AsyncFunction prefs(appContext.reactContext).all
      }

      AsyncFunction("getBoolAsync") { forKey: String ->
        return@AsyncFunction prefs(appContext.reactContext).getBoolean(forKey, false)
      }

      AsyncFunction("setBoolAsync") { forKey: String, value: Boolean ->
        prefs(appContext.reactContext).edit().putBoolean(forKey, value).apply()
      }

      AsyncFunction("getBadgeCountAsync") {
        return@AsyncFunction prefs(appContext.reactContext).getInt("badgeCount", 0)
      }

      // Android has no app-icon badge API of its own; social-app no-ops here too.
      AsyncFunction("setBadgeCountAsync") { _: Int -> }
    }
}
