package ai.bhavya.companion

import android.content.Context
import androidx.core.content.edit
import java.net.URI

/** Settings chosen on the setup screen, kept across app restarts. */
class AppSettings(context: Context) {
  private val prefs = context.getSharedPreferences("bhavya", Context.MODE_PRIVATE)

  /** Origin of the home hub, e.g. "http://192.168.1.8:8787", or null before setup. */
  var hubUrl: String?
    get() = prefs.getString(KEY_HUB_URL, null)
    set(value) = prefs.edit { putString(KEY_HUB_URL, value) }

  /** Use simulated glasses that stream from the phone camera (no hardware needed). */
  var useMockGlasses: Boolean
    get() = prefs.getBoolean(KEY_MOCK_GLASSES, true)
    set(value) = prefs.edit { putBoolean(KEY_MOCK_GLASSES, value) }

  private companion object {
    const val KEY_HUB_URL = "hub_url"
    const val KEY_MOCK_GLASSES = "mock_glasses"
  }
}

/**
 * Turns what the parent typed into a clean hub origin ("http://host:port"), or returns null when
 * it is not a usable address. A missing scheme defaults to http, and any path is dropped.
 */
fun normalizeHubUrl(input: String): String? {
  // Trailing slashes are not trimmed here: "http://" must stay invalid, not become "http:".
  val trimmed = input.trim()
  if (trimmed.isEmpty()) return null
  val withScheme = if ("://" in trimmed) trimmed else "http://$trimmed"
  val uri = runCatching { URI(withScheme) }.getOrNull() ?: return null
  val scheme = uri.scheme?.lowercase()
  val host = uri.host
  if (scheme != "http" && scheme != "https" || host.isNullOrBlank()) return null
  val port = if (uri.port == -1) "" else ":${uri.port}"
  return "$scheme://$host$port"
}

/** True when [url] belongs to the hub at [hubOrigin], so the web view never leaves the hub. */
fun isHubPage(url: String, hubOrigin: String): Boolean {
  val origin = normalizeHubUrl(url) ?: return false
  return origin.equals(hubOrigin, ignoreCase = true)
}
