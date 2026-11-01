import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConnectionBadge, ErrorNotice, Notice, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { useHome } from '../../lib/useHome';
import { useLoader } from '../../lib/useLoader';
import { useStoredState } from '../../lib/useStoredState';
import { BrainLog } from './BrainLog';
import { Home3DView } from './Home3DView';
import { canRender3D, type Quality } from './home3d/world';
import { PhoneFrame } from './PhoneFrame';
import { SimpleSimulator } from './SimpleSimulator';

/**
 * Home simulator: a 3D home that plays the part of presence sensors and smart
 * lights, next to the real child app. Walking the child between rooms sends
 * the same events door sensors would.
 */
export function SimulatorPage() {
  const home = useHome('simulator');
  const settings = useLoader(() => api.settings(), []);
  const zones = settings.data?.zones ?? [];
  const state = home.state;

  const [view, setView] = useStoredState<'3d' | 'simple'>('bhavya.simulator.view', '3d');
  const [quality, setQuality] = useStoredState<Quality>('bhavya.simulator.quality', 'high');
  const [follow, setFollow] = useStoredState<boolean>('bhavya.simulator.follow', false);
  const [showHelp, setShowHelp] = useStoredState<boolean>('bhavya.simulator.help', true);
  const [unavailable, setUnavailable] = useState<string | null>(() =>
    canRender3D() ? null : 'This browser cannot show 3D, so the simple view is shown.',
  );
  const [logOpen, setLogOpen] = useState(false);
  const [lightsOpen, setLightsOpen] = useState(false);
  const unread = useUnread(home.traces, logOpen);
  const use3d = view === '3d' && !unavailable;
  const lights = zones.filter((z) => z.light);

  return (
    <div className="sim3d">
      <header className="sim3d-top">
        <Link to="/" className="brand">
          <img src="/favicon.svg" alt="" />
          Bhavya AI
        </Link>
        <h1>Home simulator</h1>
        <ConnectionBadge connected={home.connected} />
        <div className="sim3d-tools">
          <button
            type="button"
            className={`sim3d-tool ${logOpen ? 'is-on' : ''}`}
            onClick={() => setLogOpen((open) => !open)}
            aria-pressed={logOpen}
          >
            🧠 Bhavya&apos;s brain
            {unread > 0 && <span className="sim3d-count">{unread > 99 ? '99+' : unread}</span>}
          </button>
          <button
            type="button"
            className={`sim3d-tool ${lightsOpen ? 'is-on' : ''}`}
            onClick={() => setLightsOpen((open) => !open)}
            aria-pressed={lightsOpen}
          >
            💡 Lights
          </button>
          {use3d && (
            <>
              <button
                type="button"
                className={`sim3d-tool ${follow ? 'is-on' : ''}`}
                onClick={() => setFollow((on) => !on)}
                aria-pressed={follow}
                title="Keep the camera on the child"
              >
                🎥 Follow child
              </button>
              <button
                type="button"
                className="sim3d-tool"
                onClick={() => setQuality((q) => (q === 'high' ? 'fast' : 'high'))}
                title="Fast is smoother on slower laptops"
              >
                {quality === 'high' ? '✨ High quality' : '⚡ Fast'}
              </button>
              <button
                type="button"
                className={`sim3d-tool ${showHelp ? 'is-on' : ''}`}
                onClick={() => setShowHelp((on) => !on)}
                aria-label="How to play"
                title="How to play"
              >
                ?
              </button>
            </>
          )}
          <button
            type="button"
            className="sim3d-tool"
            onClick={() => setView(view === '3d' ? 'simple' : '3d')}
            disabled={view === 'simple' && !!unavailable}
          >
            {view === '3d' ? '▦ Simple view' : '🧊 3D view'}
          </button>
        </div>
      </header>

      <div className="sim3d-body">
        <section className="sim3d-stage" aria-label="Home">
          {!state || !settings.data ? (
            <div className="sim3d-center">
              <Spinner label="Connecting to the home hub…" />
            </div>
          ) : use3d ? (
            <Home3DView
              state={state}
              zones={zones}
              send={home.send}
              follow={follow}
              quality={quality}
              showHelp={showHelp}
              onCloseHelp={() => setShowHelp(false)}
              onUnavailable={setUnavailable}
            />
          ) : (
            <div className="sim3d-simple">
              {unavailable && <Notice tone="info">{unavailable}</Notice>}
              <SimpleSimulator home={home} zones={zones} />
            </div>
          )}

          {(home.error ?? settings.error) && (
            <div className="sim3d-error">
              <ErrorNotice error={home.error ?? settings.error} />
            </div>
          )}

          {lightsOpen && state && (
            <div className="sim3d-panel sim3d-lights" role="dialog" aria-label="Lights">
              <header>
                <b>💡 Smart lights</b>
                <button
                  type="button"
                  className="sim3d-close"
                  onClick={() => setLightsOpen(false)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </header>
              {lights.length === 0 && <p className="muted">No lights are set up.</p>}
              {lights.map((zone) => {
                const device = zone.light ?? '';
                const on = state.lights[device] ?? false;
                return (
                  <button
                    key={zone.id}
                    type="button"
                    className={`sim3d-light ${on ? 'is-on' : ''}`}
                    onClick={() => home.send({ type: 'set_light', device, on: !on })}
                  >
                    <span className="sim3d-bulb" aria-hidden="true" />
                    <span className="spacer">{zone.name}</span>
                    <b>{on ? 'On' : 'Off'}</b>
                  </button>
                );
              })}
            </div>
          )}

          {logOpen && <BrainLog traces={home.traces} onClose={() => setLogOpen(false)} />}
        </section>

        <aside className="sim3d-side" aria-label="Child's phone">
          <div className="sim3d-side-title">Child&apos;s app</div>
          <PhoneFrame src="/child" />
          <p className="sim3d-side-note">Tap Start in the phone to turn on its voice.</p>
        </aside>
      </div>
    </div>
  );
}

/** How many log lines arrived since the log was last open. */
function useUnread(traces: { id: string }[], open: boolean): number {
  const [seenId, setSeenId] = useState<string | null>(null);
  const newest = traces[0]?.id ?? null;
  useEffect(() => {
    if (open) setSeenId(newest);
  }, [open, newest]);
  if (open) return 0;
  const index = seenId ? traces.findIndex((t) => t.id === seenId) : -1;
  return index === -1 ? traces.length : index;
}
