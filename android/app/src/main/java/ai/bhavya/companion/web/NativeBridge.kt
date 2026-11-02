package ai.bhavya.companion.web

import ai.bhavya.companion.glasses.GlassesController
import ai.bhavya.companion.speech.SpeechOutput
import android.webkit.JavascriptInterface

/**
 * Exposed to the child web app as `window.BhavyaNative` (see web/src/lib/native.ts).
 * WebView calls these on its own bridge thread, so every method must be thread-safe.
 * Only hub pages are ever loaded in the web view, so only the hub's app can call it.
 */
class NativeBridge(
    private val glasses: GlassesController,
    private val speech: SpeechOutput,
) {
  @JavascriptInterface fun version(): Int = 1

  @JavascriptInterface
  fun speak(text: String, rate: Double, volume: Double, language: String) {
    speech.speak(
        text = text.take(MAX_SPOKEN_CHARS),
        rate = rate.toFloat().coerceIn(0.5f, 1.5f),
        volume = volume.toFloat().coerceIn(0f, 1f),
        language = language,
    )
  }

  @JavascriptInterface fun stopSpeaking() = speech.stop()

  @JavascriptInterface fun startCamera() = glasses.requestCamera()

  @JavascriptInterface fun stopCamera() = glasses.releaseCamera()

  @JavascriptInterface fun cameraStatus(): String = glasses.state.value.camera.wire

  @JavascriptInterface fun cameraMessage(): String = glasses.state.value.message.orEmpty()

  /** Newest glasses frame as a JPEG data URL, or "" when the camera is off. */
  @JavascriptInterface fun captureFrame(): String = glasses.captureJpeg().orEmpty()

  private companion object {
    const val MAX_SPOKEN_CHARS = 500
  }
}
