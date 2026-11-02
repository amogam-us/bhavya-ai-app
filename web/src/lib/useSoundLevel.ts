import { useCallback, useEffect, useRef, useState } from 'react';
import { mediaErrorMessage } from './media';

/** How often the level is measured. */
const SAMPLE_MS = 200;
/** Levels from -60 dBFS (quiet room) to 0 dBFS (as loud as the microphone goes) map to 0..100. */
const FLOOR_DB = -60;

/**
 * Loudness from the microphone, 0 to 100, measured on this device only.
 * Nothing is recorded or sent: callers read the loudest level since they last asked.
 */
export function useSoundLevel(active: boolean) {
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const peak = useRef(0);

  useEffect(() => {
    if (!active) {
      setLevel(0);
      return;
    }
    let stopped = false;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(mediaErrorMessage(null, 'microphone'));
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        context = new AudioContext();
        void context.resume();
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        context.createMediaStreamSource(s).connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        timer = setInterval(() => {
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          for (const v of samples) sum += v * v;
          const db = 20 * Math.log10(Math.sqrt(sum / samples.length) || 1e-8);
          const value = Math.round(Math.max(0, Math.min(100, ((db - FLOOR_DB) / -FLOOR_DB) * 100)));
          peak.current = Math.max(peak.current, value);
          setLevel(value);
        }, SAMPLE_MS);
      })
      .catch((e: unknown) => {
        if (!stopped) setError(mediaErrorMessage(e, 'microphone'));
      });

    return () => {
      stopped = true;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      void context?.close();
    };
  }, [active]);

  /** The loudest level since the last call, then starts over. */
  const takePeak = useCallback(() => {
    const value = peak.current;
    peak.current = 0;
    return value;
  }, []);

  return { level, error, takePeak };
}
