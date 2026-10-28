import { nativeApp } from './native';

/**
 * Voice output for the child app: on-device text-to-speech (the browser's or,
 * inside the Android app, Android's built-in voice; not an AI model) and a soft
 * chime made with Web Audio. Browsers only allow sound after a user gesture, so
 * call unlock() from a tap.
 */

const LANGUAGE_TAGS: Record<string, string> = {
  english: 'en',
  hindi: 'hi-IN',
  tamil: 'ta-IN',
  sinhala: 'si-LK',
  spanish: 'es',
  french: 'fr',
  german: 'de',
  arabic: 'ar',
};

export interface VoiceOptions {
  rate: number;
  volume: number;
  language?: string;
}

class Speaker {
  private audio: AudioContext | null = null;

  /** Must be called from a user gesture (tap) before any sound plays. */
  unlock(): void {
    this.audio ??= new AudioContext();
    void this.audio.resume();
    if (!nativeApp && 'speechSynthesis' in window) {
      // An empty utterance unlocks speech on iOS Safari.
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    }
  }

  get canSpeak(): boolean {
    return !!nativeApp || 'speechSynthesis' in window;
  }

  speak(text: string, options: VoiceOptions): void {
    if (!this.canSpeak || !text.trim()) return;
    if (nativeApp) {
      // Inside the Android app: Android's voice, heard through the glasses speakers.
      nativeApp.speak(text, options.rate, options.volume, options.language ?? '');
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options.rate;
    utterance.volume = options.volume;
    const tag = options.language ? LANGUAGE_TAGS[options.language.trim().toLowerCase()] : undefined;
    if (tag) utterance.lang = tag;
    synth.speak(utterance);
  }

  stop(): void {
    if (nativeApp) nativeApp.stopSpeaking();
    else if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  /** Two gentle rising notes. */
  chime(volume: number): void {
    const ctx = this.audio;
    if (!ctx) return;
    const start = ctx.currentTime;
    [523.25, 659.25].forEach((frequency, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = start + i * 0.22;
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18 * volume, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.65);
    });
  }

  get audioContext(): AudioContext | null {
    return this.audio;
  }
}

export const speaker = new Speaker();
