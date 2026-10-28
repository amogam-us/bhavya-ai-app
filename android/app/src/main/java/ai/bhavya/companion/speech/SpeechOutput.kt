package ai.bhavya.companion.speech

import android.content.Context
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.util.Log
import java.util.Locale
import java.util.concurrent.atomic.AtomicLong

/**
 * Speaks guidance with Android's built-in text-to-speech (an on-device voice, not an AI model).
 * When the glasses are connected as a Bluetooth audio device, the voice plays in their speakers.
 */
class SpeechOutput(context: Context) : TextToSpeech.OnInitListener {
  private data class Utterance(
      val text: String,
      val rate: Float,
      val volume: Float,
      val language: String,
  )

  private val lock = Any()
  private val utteranceIds = AtomicLong()
  // Declared before the engine: onInit may run as soon as TextToSpeech is constructed.
  private var ready = false
  private var pending: Utterance? = null
  private val tts = TextToSpeech(context.applicationContext, this)

  override fun onInit(status: Int) {
    val next: Utterance?
    synchronized(lock) {
      ready = status == TextToSpeech.SUCCESS
      next = pending.takeIf { ready }
      pending = null
    }
    if (!ready) Log.w(TAG, "Text-to-speech is not available on this phone (status $status)")
    next?.let(::speakNow)
  }

  /** Speaks [text], replacing anything still being spoken. Safe to call from any thread. */
  fun speak(text: String, rate: Float, volume: Float, language: String) {
    if (text.isBlank()) return
    val utterance = Utterance(text, rate, volume, language)
    synchronized(lock) {
      if (!ready) {
        pending = utterance
        return
      }
    }
    speakNow(utterance)
  }

  fun stop() {
    synchronized(lock) { pending = null }
    tts.stop()
  }

  fun shutdown() {
    tts.shutdown()
  }

  private fun speakNow(utterance: Utterance) {
    tts.setSpeechRate(utterance.rate)
    localeFor(utterance.language)?.let { locale ->
      if (tts.isLanguageAvailable(locale) >= TextToSpeech.LANG_AVAILABLE) tts.language = locale
    }
    val params = Bundle().apply { putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, utterance.volume) }
    tts.speak(utterance.text, TextToSpeech.QUEUE_FLUSH, params, "bhavya-${utteranceIds.incrementAndGet()}")
  }

  private companion object {
    const val TAG = "BhavyaSpeech"

    /** Same language names the parent dashboard uses (see web/src/lib/speech.ts). */
    val LANGUAGE_TAGS =
        mapOf(
            "english" to "en",
            "hindi" to "hi-IN",
            "tamil" to "ta-IN",
            "sinhala" to "si-LK",
            "spanish" to "es",
            "french" to "fr",
            "german" to "de",
            "arabic" to "ar",
        )

    fun localeFor(language: String): Locale? =
        LANGUAGE_TAGS[language.trim().lowercase()]?.let(Locale::forLanguageTag)
  }
}
