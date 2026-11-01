import { useEffect } from 'react';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import { useCamera } from '../../lib/useCamera';

/** Give the child a moment after a routine or a question before the first look. */
const FIRST_LOOK_MS = 5000;
/** Pause between looks. Looks never overlap: the next starts after the previous answer. */
const LOOK_INTERVAL_MS = 15_000;

/**
 * Looks around with the glasses (or the device camera in a browser) while no
 * routine runs, so the hub can suggest one. It is only mounted while the hub
 * says looking is allowed; unmounting stops the camera immediately. A
 * suggestion arrives through the home state, not from here.
 */
export function IdleScanner() {
  const camera = useCamera(true);
  const { capture, status } = camera;

  useEffect(() => {
    if (status !== 'on') return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const look = async () => {
      const image = capture();
      if (image) {
        // A failed look is simply skipped; the next one tries again.
        await api.scan(image).catch(() => undefined);
      }
      if (!stopped) timer = setTimeout(() => void look(), LOOK_INTERVAL_MS);
    };
    timer = setTimeout(() => void look(), FIRST_LOOK_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [status, capture]);

  if (status === 'error') return null;

  return (
    <div className="scan-chip" role="status">
      {camera.source === 'device' ? (
        <video ref={camera.videoRef} muted playsInline aria-hidden="true" />
      ) : camera.preview ? (
        <img src={camera.preview} alt="" />
      ) : (
        <Icon name="camera" size={20} />
      )}
      {status !== 'on'
        ? 'Starting the camera…'
        : camera.source === 'glasses'
          ? 'Glasses are looking around'
          : 'Camera is looking around'}
    </div>
  );
}
