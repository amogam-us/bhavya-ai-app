import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ConnectionBadge, ErrorNotice, Notice, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { useHome } from '../../lib/useHome';
import { useLoader } from '../../lib/useLoader';
import { Home3DView } from './Home3DView';
import { canRender3D } from './home3d/world';
import { PhoneFrame } from './PhoneFrame';
import { SimpleSimulator } from './SimpleSimulator';

/**
 * Home simulator: a 3D home that plays the part of presence sensors and smart
 * lights, next to the real child app. Walking the child between rooms sends
 * the same events door sensors would. The hub's SIMULATOR_VIEW option can
 * offer the simple button view instead, or as well.
 */
export function SimulatorPage() {
  const home = useHome('simulator');
  const settings = useLoader(() => api.settings(), []);
  const options = useLoader(() => api.options(), []);
  const zones = settings.data?.zones ?? [];
  const state = home.state;
  // If the hub cannot say, offer both views.
  const view = options.data?.simulator.view ?? (options.error ? 'both' : null);

  const [unavailable, setUnavailable] = useState<string | null>(() =>
    canRender3D() ? null : 'This browser cannot show 3D, so the simple simulator is shown.',
  );
  const [simpleChosen, setSimpleChosen] = useState(false);
  const [lightsOpen, setLightsOpen] = useState(false);
  const lights = zones.filter((z) => z.light);
  const error = home.error ?? settings.error;

  const can3d = view !== 'simple' && !unavailable;
  const show3d = can3d && !(view === 'both' && simpleChosen);
  const ready = !!state && !!settings.data && view !== null;

  return (
    <div className="sim3d">
      <header className="sim3d-top">
        <Link to="/" className="brand">
          <img src="/logo-wordmark.png" alt="Bhavya" width={121} height={38} />
        </Link>
        <h1>Home simulator</h1>
        <ConnectionBadge connected={home.connected} />
        <div className="sim3d-actions">
          {ready && show3d && (
            <button
              type="button"
              className={`sim3d-tool ${lightsOpen ? 'is-on' : ''}`}
              onClick={() => setLightsOpen((open) => !open)}
              aria-pressed={lightsOpen}
            >
              💡 Lights
            </button>
          )}
          {ready && view === 'both' && can3d && (
            <button
              type="button"
              className="sim3d-tool"
              onClick={() => {
                setSimpleChosen((simple) => !simple);
                setLightsOpen(false);
              }}
            >
              {simpleChosen ? '🧊 3D view' : '▦ Simple view'}
            </button>
          )}
        </div>
      </header>

      <div className="sim3d-body">
        <section className="sim3d-stage" aria-label="Home">
          {!ready || !state ? (
            <div className="sim3d-center">
              <Spinner label="Connecting to the home hub…" />
            </div>
          ) : show3d ? (
            <Home3DView
              state={state}
              zones={zones}
              send={home.send}
              onUnavailable={setUnavailable}
            />
          ) : (
            <div className="sim3d-simple">
              {unavailable && view !== 'simple' && <Notice tone="info">{unavailable}</Notice>}
              <SimpleSimulator home={home} zones={zones} />
            </div>
          )}

          {error && (
            <div className="sim3d-error">
              <ErrorNotice error={error} />
            </div>
          )}

          {lightsOpen && show3d && state && (
            <div className="sim3d-panel" role="dialog" aria-label="Lights">
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
        </section>

        <aside className="sim3d-side" aria-label="Child's phone">
          {/* The preview never uses this computer's camera: the camera belongs to the child's phone or glasses. */}
          <PhoneFrame src="/child?camera=off" />
          <p className="sim3d-side-note">The child&apos;s app. Tap Start to turn on its voice.</p>
        </aside>
      </div>
    </div>
  );
}
