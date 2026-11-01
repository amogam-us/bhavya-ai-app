import type { ScanOutcome, SceneScanResponse } from '@bhavya/shared';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useCamera } from '../../lib/useCamera';

/** Give the child a moment after a routine or a question before the first look. */
const FIRST_LOOK_MS = 5000;
/** Pause between looks. Looks never overlap: the next starts after the previous answer. */
const LOOK_INTERVAL_MS = 15_000;

const OUTCOMES: Record<ScanOutcome, string> = {
  waiting: 'needs one more matching look',
  suggested: 'asking the child',
  quiet: 'nothing to suggest',
  private: 'private place: the camera pauses for 10 minutes',
  ignored: 'look skipped (too soon, or not allowed now)',
};

/** One line for the camera debug view: what Muse saw in the last look. */
function describeLook(result: SceneScanResponse | null): string {
  if (!result) return 'Muse: waiting for the first look…';
  const outcome = OUTCOMES[result.outcome];
  const detail = result.detail;
  if (!detail) return `Muse: ${outcome}`;
  const fits = detail.private
    ? 'private place'
    : detail.routine
      ? `fits "${detail.routine}"`
      : 'no routine fits';
  return `Muse saw: ${detail.seen || 'nothing clear'} → ${fits} (${detail.confidence.toFixed(2)}) · ${outcome}`;
}

/**
 * Looks around with the glasses (or the device camera in a browser) while no
 * routine runs, so the hub can suggest one. It is only mounted while the hub
 * says looking is allowed; unmounting stops the camera immediately. A
 * suggestion arrives through the home state, not from here.
 */
export function IdleScanner({ debug }: { debug: boolean }) {
  const camera = useCamera(true);
  const { capture, status } = camera;
  const [lastLook, setLastLook] = useState<SceneScanResponse | null>(null);

  useEffect(() => {
    if (status !== 'on') return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const look = async () => {
      const image = capture();
      if (image) {
        // A failed look is simply skipped; the next one tries again.
        const result = await api.scan(image).catch(() => null);
        if (!stopped && result) setLastLook(result);
      }
      if (!stopped) timer = setTimeout(() => void look(), LOOK_INTERVAL_MS);
    };
    timer = setTimeout(() => void look(), FIRST_LOOK_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [status, capture]);

  const who = camera.source === 'glasses' ? 'Glasses are' : 'Camera is';
  return (
    <section className="scan-card" aria-label="Glasses camera">
      <div className="scan-view">
        {camera.source === 'device' ? (
          <video ref={camera.videoRef} muted playsInline aria-hidden="true" />
        ) : (
          camera.preview && <img src={camera.preview} alt="" />
        )}
        {status !== 'on' && (
          <span className="scan-wait">
            {status === 'error' ? camera.error : 'Starting the camera…'}
          </span>
        )}
      </div>
      <p className="scan-label" role="status">
        👓 {who} looking around
      </p>
      {debug && <p className="camera-debug">{describeLook(lastLook)}</p>}
    </section>
  );
}
