import { useCallback, useEffect, useRef, useState } from 'react';
import { mediaErrorMessage, toWavDataUrl } from './media';

const MAX_RECORDING_MS = 3 * 60_000;

export type RecorderStatus = 'idle' | 'recording' | 'processing';

/** Records from the microphone and returns the clip as a WAV data URL. */
export function useRecorder() {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const resolveRef = useRef<((wav: string | null) => void) | null>(null);
  const limitTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(
    () => () => {
      clearTimeout(limitTimer.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    },
    [],
  );

  /** Starts recording. The returned promise resolves with the WAV once stop() is called. */
  const start = useCallback(async (): Promise<string | null> => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setError(mediaErrorMessage(e, 'microphone'));
      return null;
    }

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    const result = new Promise<string | null>((resolve) => {
      resolveRef.current = resolve;
    });

    recorder.onstop = async () => {
      clearTimeout(limitTimer.current);
      stream.getTracks().forEach((t) => t.stop());
      setStatus('processing');
      try {
        const blob = new Blob(chunks, { type: recorder.mimeType });
        resolveRef.current?.(await toWavDataUrl(blob));
      } catch {
        setError('Could not process the recording.');
        resolveRef.current?.(null);
      } finally {
        resolveRef.current = null;
        recorderRef.current = null;
        setStatus('idle');
      }
    };

    recorder.start();
    setStatus('recording');
    limitTimer.current = setTimeout(() => recorder.stop(), MAX_RECORDING_MS);
    return result;
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') recorder.stop();
  }, []);

  return { status, error, start, stop };
}
