package ai.bhavya.companion

import ai.bhavya.companion.glasses.GlassesController
import ai.bhavya.companion.speech.SpeechOutput
import android.app.Application

/** Holds the long-lived services so they survive activity restarts. */
class BhavyaApp : Application() {
  val settings by lazy { AppSettings(this) }
  val glasses by lazy { GlassesController(this) }
  val speech by lazy { SpeechOutput(this) }
}
