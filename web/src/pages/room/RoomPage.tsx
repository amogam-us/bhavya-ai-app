import type { RoomCheckOutcome, RoomCheckResponse } from '@bhavya/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  Card,
  ConnectionBadge,
  ErrorNotice,
  Field,
  Notice,
  Spinner,
} from '../../components/ui';
import { api } from '../../lib/api';
import { captureFrame } from '../../lib/media';
import { useCamera } from '../../lib/useCamera';
import { useHome } from '../../lib/useHome';
import { useLoader } from '../../lib/useLoader';
import { useSoundLevel } from '../../lib/useSoundLevel';

const ROOM_KEY = 'bhavya.roomDevice.room';
/** Loudness is reported once a second while the child is in this room. */
const SOUND_REPORT_MS = 1000;
/** A camera burst every 20 seconds: 4 frames, one second apart. */
const BURST_EVERY_MS = 20_000;
const BURST_FRAMES = 4;
const BURST_GAP_MS = 1000;

const OUTCOMES: Record<RoomCheckOutcome, string> = {
  calm: 'no signs of distress',
  watching: 'seen once: looking again before offering a break',
  offered: 'quiet break offered',
  ignored: 'skipped (too soon, or not allowed now)',
};

function savedRoom(): string {
  try {
    return window.localStorage.getItem(ROOM_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveRoom(room: string): void {
  try {
    window.localStorage.setItem(ROOM_KEY, room);
  } catch {
    // Not kept; it still applies until the page is closed.
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calm support room device: an old phone or laptop in a camera-OK room. While
 * the child is in this room it reports loudness once a second and, if a parent
 * allows it, sends a short burst of photos every 20 seconds. Nothing is recorded.
 */
export function RoomPage() {
  const home = useHome('room');
  const settings = useLoader(() => api.settings(), []);
  const options = useLoader(() => api.options(), []);
  const [room, setRoom] = useState(savedRoom);
  const [started, setStarted] = useState(false);
  const [lastCheck, setLastCheck] = useState<RoomCheckResponse | null>(null);

  const zones = (settings.data?.zones ?? []).filter((z) => z.type === 'camera_ok');
  const zone = zones.find((z) => z.id === room);
  const rules = settings.data?.profile.calmSupport;
  const who = settings.data?.profile.name || 'The person';
  const support = home.state?.support;
  const childHere = !!zone && support?.room === zone.id;
  const listening = started && childHere;
  const watching = listening && !!support?.camera;

  const sound = useSoundLevel(started && !!zone);
  const camera = useCamera(watching);
  const { send } = home;
  const { takePeak } = sound;
  const { videoRef, status: cameraStatus } = camera;

  // Loudness, once a second, only while the child is here.
  useEffect(() => {
    if (!listening || !zone) return;
    const timer = setInterval(() => {
      send({ type: 'room_sound', room: zone.id, level: takePeak() });
    }, SOUND_REPORT_MS);
    return () => clearInterval(timer);
  }, [listening, zone, send, takePeak]);

  // A short burst of photos every 20 seconds, only while looking is allowed.
  useEffect(() => {
    if (!watching || cameraStatus !== 'on' || !zone) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const burst = async () => {
      const images: string[] = [];
      for (let i = 0; i < BURST_FRAMES && !stopped; i++) {
        const frame = captureFrame(videoRef.current);
        if (frame) images.push(frame);
        if (i < BURST_FRAMES - 1) await wait(BURST_GAP_MS);
      }
      if (!stopped && images.length >= 2) {
        const result = await api.roomCheck(zone.id, images).catch(() => null);
        if (!stopped && result) setLastCheck(result);
      }
      if (!stopped) timer = setTimeout(() => void burst(), BURST_EVERY_MS);
    };
    timer = setTimeout(() => void burst(), 3000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [watching, cameraStatus, zone, videoRef]);

  const loading = !settings.data || !options.data || !home.state;
  const threshold = rules?.loudLevel ?? 75;

  return (
    <main className="room-device">
      <header className="room-top">
        <Link to="/" className="brand">
          <img src="/logo-wordmark.png" alt="Bhavya" width={122} height={38} />
        </Link>
        <h1>Room device</h1>
        <ConnectionBadge connected={home.connected} />
      </header>
      <ErrorNotice error={home.error ?? settings.error ?? options.error} />

      {loading ? (
        <Spinner label="Connecting to the home hub…" />
      ) : !options.data?.calmSupport ? (
        <Notice tone="info">Calm support is turned off on this hub (CALM_SUPPORT=off).</Notice>
      ) : (
        <div className="stack">
          {!rules?.enabled && (
            <Notice tone="warn">
              Calm support is off. A parent can turn it on in Profile &amp; rooms.
            </Notice>
          )}

          <Card className="stack">
            <Field
              label="Which room is this device in?"
              hint="Only rooms where the camera is allowed."
            >
              <select
                value={room}
                onChange={(e) => {
                  setRoom(e.target.value);
                  saveRoom(e.target.value);
                }}
                disabled={started}
              >
                <option value="">Choose a room</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </Field>
            {!started ? (
              <>
                <p className="muted small">
                  Nothing is recorded. This device measures how loud the room is and, if a parent
                  allows it, sends a few photos to Muse when the person is in this room. Private
                  rooms are never watched.
                </p>
                <Button
                  variant="primary"
                  icon="play"
                  disabled={!zone}
                  onClick={() => setStarted(true)}
                >
                  Start listening
                </Button>
              </>
            ) : (
              <Button icon="stop" onClick={() => setStarted(false)}>
                Stop
              </Button>
            )}
          </Card>

          {started && zone && (
            <Card className="stack">
              <div className={`room-presence ${childHere ? 'is-here' : ''}`}>
                {childHere
                  ? `${who} is in the ${zone.name.toLowerCase()}. Calm support is listening.`
                  : `${who} is not in the ${zone.name.toLowerCase()}, so this device is resting.`}
              </div>

              <div>
                <div className="room-meter-label">
                  <span>Loudness</span>
                  <b>{listening ? sound.level : '—'}</b>
                </div>
                <div className="room-meter" aria-hidden="true">
                  <span
                    className={sound.level >= threshold ? 'is-loud' : ''}
                    style={{ width: `${listening ? sound.level : 0}%` }}
                  />
                  <i style={{ left: `${threshold}%` }} title="Very loud" />
                </div>
                <p className="field-hint">
                  A quiet break is offered when it stays above the line for{' '}
                  {rules?.loudSeconds ?? 10} seconds.
                </p>
                {sound.error && <ErrorNotice error={sound.error} />}
              </div>

              <div className="room-camera">
                <div className="room-camera-view">
                  {watching ? (
                    <video ref={camera.videoRef} muted playsInline aria-label="Room camera" />
                  ) : (
                    <span>Camera off</span>
                  )}
                </div>
                <p className="field-hint">
                  {watching
                    ? 'Looks for signs of distress every 20 seconds. Harmless movements like rocking or hand-flapping are never counted.'
                    : support?.camera
                      ? `The camera only turns on while ${who} is in this room.`
                      : 'The camera check is off. A parent can allow it in Profile & rooms.'}
                </p>
                {camera.status === 'error' && <ErrorNotice error={camera.error} />}
              </div>

              {options.data.cameraDebug && (
                <p className="camera-debug">
                  {lastCheck
                    ? `Muse: ${lastCheck.detail ? (lastCheck.detail.distress ? `${lastCheck.detail.signs || 'distress'} (${lastCheck.detail.confidence.toFixed(2)})` : `calm (${lastCheck.detail.confidence.toFixed(2)})`) : '—'} · ${OUTCOMES[lastCheck.outcome]}`
                    : 'Muse: waiting for the first look…'}
                </p>
              )}
            </Card>
          )}
        </div>
      )}
    </main>
  );
}
