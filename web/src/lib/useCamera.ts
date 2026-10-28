import { useCallback, useEffect, useRef, useState } from 'react';
import { captureFrame, mediaErrorMessage } from './media';

export type CameraStatus = 'off' | 'starting' | 'on' | 'error';

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * Runs the camera only while `active` is true. When `active` turns false
 * (for example the privacy gate closes) the tracks are stopped at once,
 * so the camera light goes off too.
 */
export function useCamera(active: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<CameraStatus>('off');
  const [error, setError] = useState<string | null>(null);
  const [aspect, setAspect] = useState(4 / 3);

  useEffect(() => {
    if (!active) {
      setStatus('off');
      return;
    }
    const video = videoRef.current;
    let cancelled = false;
    let stream: MediaStream | null = null;
    setStatus('starting');
    setError(null);

    if (!video || !navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setError(mediaErrorMessage(null, 'camera'));
      return;
    }

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      .then(async (s) => {
        if (cancelled) {
          stopStream(s);
          return;
        }
        stream = s;
        video.srcObject = s;
        video.onloadedmetadata = () => {
          if (video.videoWidth && video.videoHeight)
            setAspect(video.videoWidth / video.videoHeight);
        };
        await video.play().catch(() => undefined);
        if (!cancelled) setStatus('on');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setStatus('error');
        setError(mediaErrorMessage(e, 'camera'));
      });

    return () => {
      cancelled = true;
      stopStream(stream);
      video.srcObject = null;
    };
  }, [active]);

  const capture = useCallback(() => captureFrame(videoRef.current), []);

  return { videoRef, status, error, aspect, capture };
}
