import { useCallback, useEffect, useRef, useState } from 'react';
import { captureFrame, mediaErrorMessage } from './media';
import { nativeApp, readGlassesCamera } from './native';

export type CameraStatus = 'off' | 'starting' | 'on' | 'error';

/** How often the glasses preview and status refresh inside the Android app. */
const GLASSES_POLL_MS = 1000;

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * Runs the camera only while `active` is true. When `active` turns false
 * (for example the privacy gate closes) the camera stops at once.
 *
 * Inside the Bhavya Android app this uses the glasses camera through the native
 * bridge; in a browser it uses the device camera.
 */
export function useCamera(active: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<CameraStatus>('off');
  const [error, setError] = useState<string | null>(null);
  const [aspect, setAspect] = useState(4 / 3);
  const [preview, setPreview] = useState<string | null>(null);

  // Glasses camera (Android app).
  useEffect(() => {
    const bridge = nativeApp;
    if (!active || !bridge) return;
    setStatus('starting');
    setError(null);
    bridge.startCamera();

    const refresh = () => {
      const { status: glasses, message } = readGlassesCamera(bridge);
      if (glasses === 'on') {
        setStatus('on');
        setError(null);
        const frame = bridge.captureFrame();
        if (frame) setPreview(frame);
      } else if (glasses === 'off' || glasses === 'starting') {
        setStatus('starting');
      } else {
        setStatus('error');
        setError(message);
      }
    };
    const timer = setInterval(refresh, GLASSES_POLL_MS);
    return () => {
      clearInterval(timer);
      bridge.stopCamera();
      setPreview(null);
      setStatus('off');
    };
  }, [active]);

  // Device camera (browser).
  useEffect(() => {
    if (nativeApp) return;
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

  const capture = useCallback(
    () => (nativeApp ? nativeApp.captureFrame() || null : captureFrame(videoRef.current)),
    [],
  );

  /** Keeps the overlay aligned with the glasses preview image. */
  const onPreviewLoad = useCallback((image: HTMLImageElement) => {
    if (image.naturalWidth && image.naturalHeight) {
      setAspect(image.naturalWidth / image.naturalHeight);
    }
  }, []);

  return {
    source: nativeApp ? ('glasses' as const) : ('device' as const),
    videoRef,
    preview,
    onPreviewLoad,
    status,
    error,
    aspect,
    capture,
  };
}
