import { FEATURES, type FrameCheckResponse, type ObjectBox, type RunView } from '@bhavya/shared';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { api, ApiError } from '../../lib/api';
import { useCamera } from '../../lib/useCamera';

/** Wait after a step starts before the first check, so the child has time to act. */
const FIRST_CHECK_MS = 4000;
/** Pause between checks. Checks never overlap: the next starts after the previous answer. */
const CHECK_INTERVAL_MS = 4000;
const HIGHLIGHT_DELAY_MS = 800;

interface CameraPanelProps {
  run: RunView;
  onHint: (hint: string | null) => void;
  /** Shows what Muse answered for each frame (hub option CAMERA_DEBUG). */
  debug: boolean;
}

/**
 * Live view for camera-OK steps. It is only mounted while the hub says the
 * camera may watch this step; unmounting stops the camera immediately.
 */
export function CameraPanel({ run, onHint, debug }: CameraPanelProps) {
  const camera = useCamera(true);
  const { capture, status } = camera;
  const { runId, stepIndex, highlightObject } = run;
  const object = run.step.object;
  const [boxes, setBoxes] = useState<ObjectBox[]>([]);
  const [finding, setFinding] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<FrameCheckResponse | null>(null);

  useEffect(() => {
    setBoxes([]);
    setNote(null);
    setLastCheck(null);
  }, [stepIndex]);

  // Step check loop.
  useEffect(() => {
    if (status !== 'on') return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const image = capture();
      if (image) {
        try {
          const result = await api.checkFrame(runId, stepIndex, image);
          if (!stopped) {
            setLastCheck(result);
            onHint(result.done ? null : result.hint);
          }
        } catch (e) {
          // 409 means the step changed or the camera was closed meanwhile; that is expected.
          if (!stopped && !(e instanceof ApiError && e.status === 409))
            setNote('Checking is slow right now.');
        }
      }
      if (!stopped) timer = setTimeout(() => void tick(), CHECK_INTERVAL_MS);
    };
    timer = setTimeout(() => void tick(), FIRST_CHECK_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [status, runId, stepIndex, capture, onHint]);

  const findObject = useCallback(async () => {
    const image = capture();
    if (!image || !object) return;
    setFinding(true);
    setNote(null);
    try {
      const result = await api.findInRun(runId, stepIndex, image);
      setBoxes(result.boxes.slice(0, 1));
      if (result.boxes.length === 0) setNote(`I can't see the ${object} yet. Look around slowly.`);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 409)) setNote('Could not look for it right now.');
    } finally {
      setFinding(false);
    }
  }, [capture, object, runId, stepIndex]);

  // At full support, highlight the object automatically once per step.
  useEffect(() => {
    if (status !== 'on' || !highlightObject) return;
    const timer = setTimeout(() => void findObject(), HIGHLIGHT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status, highlightObject, stepIndex, findObject]);

  return (
    <div className="camera-panel" style={{ aspectRatio: String(camera.aspect) }}>
      {camera.source === 'device' ? (
        <video ref={camera.videoRef} muted playsInline aria-label="Camera view" />
      ) : (
        camera.preview && (
          <img
            src={camera.preview}
            alt="Glasses camera view"
            onLoad={(e) => camera.onPreviewLoad(e.currentTarget)}
          />
        )
      )}
      {boxes.map((box, i) => (
        <div
          key={i}
          className="camera-box"
          style={{
            left: `${box.x * 100}%`,
            top: `${box.y * 100}%`,
            width: `${box.width * 100}%`,
            height: `${box.height * 100}%`,
          }}
        />
      ))}
      {debug && (
        <p className="camera-debug is-overlay">
          {lastCheck
            ? `Muse step check: ${lastCheck.done ? 'done' : 'not yet'} (${lastCheck.confidence.toFixed(2)})`
            : 'Muse step check: waiting for the first frame…'}
        </p>
      )}
      <div className="camera-overlay">
        <span className="camera-status">
          {status === 'starting' &&
            (camera.source === 'glasses' ? 'Starting the glasses camera…' : 'Starting camera…')}
          {status === 'on' && (note ?? 'Camera is helping with this step')}
          {status === 'error' && camera.error}
        </span>
        {FEATURES.objectFinder && object && status === 'on' && (
          <button
            type="button"
            className="child-btn"
            onClick={() => void findObject()}
            disabled={finding}
          >
            <Icon name="search" />
            {finding ? 'Looking…' : `Where is the ${object}?`}
          </button>
        )}
      </div>
    </div>
  );
}
