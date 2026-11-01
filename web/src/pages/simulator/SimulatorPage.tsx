import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import {
  Badge,
  Button,
  Card,
  ConnectionBadge,
  ErrorNotice,
  PageHeader,
  Spinner,
} from '../../components/ui';
import { api } from '../../lib/api';
import { LEVEL_LABELS } from '../../lib/format';
import { useHome } from '../../lib/useHome';
import { useLoader } from '../../lib/useLoader';

/**
 * Stands in for the home's presence sensors and smart lights during the demo.
 * In a real home these events come from door or motion sensors, never from a camera.
 */
export function SimulatorPage() {
  const home = useHome('simulator');
  const settings = useLoader(() => api.settings(), []);
  const zones = settings.data?.zones ?? [];
  const state = home.state;
  const currentZone = zones.find((z) => z.id === state?.zone);

  return (
    <main className="simulator">
      <Link to="/" className="brand">
        <img src="/favicon.svg" alt="" />
        Bhavya AI
      </Link>
      <div style={{ marginTop: 20 }}>
        <PageHeader
          title="Home simulator"
          subtitle="Plays the part of presence sensors and smart lights. Move the child between rooms to trigger routines."
          actions={<ConnectionBadge connected={home.connected} />}
        />
      </div>
      <ErrorNotice error={home.error ?? settings.error} />
      {!state || !settings.data ? (
        <Spinner label="Connecting to the home hub…" />
      ) : (
        <div className="stack">
          <div className={`camera-state ${state.camera === 'on' ? 'is-on' : 'is-off'}`}>
            <Icon name={state.camera === 'on' ? 'camera' : 'cameraOff'} size={28} />
            <div>
              {state.camera === 'on' ? 'Camera allowed' : 'Camera off'}
              <div className="small" style={{ fontWeight: 500 }}>
                {currentZone
                  ? `Child is in the ${currentZone.name.toLowerCase()}${currentZone.type === 'private' ? ', a private room' : ''}.`
                  : 'Child location unknown, so the camera stays off.'}
              </div>
            </div>
          </div>

          <Card className="stack">
            <h2>Presence sensors</h2>
            <div className="room-grid">
              {zones.map((zone) => (
                <button
                  key={zone.id}
                  type="button"
                  className={`room-button ${state.zone === zone.id ? 'is-here' : ''}`}
                  onClick={() => home.send({ type: 'zone_enter', zone: zone.id })}
                >
                  <strong>{zone.name}</strong>
                  <span className="row" style={{ gap: 6 }}>
                    {zone.type === 'private' ? (
                      <Badge tone="info">Private</Badge>
                    ) : (
                      <Badge tone="neutral">Camera OK</Badge>
                    )}
                    {state.zone === zone.id && <Badge tone="success">Child is here</Badge>}
                  </span>
                </button>
              ))}
            </div>
            <div>
              <Button
                icon="home"
                disabled={!state.zone}
                onClick={() => home.send({ type: 'zone_leave' })}
              >
                Child leaves the room
              </Button>
            </div>
          </Card>

          <div className="grid-2">
            <Card className="stack">
              <h2>Smart lights</h2>
              {Object.keys(state.lights).length === 0 && (
                <p className="muted">No lights configured.</p>
              )}
              {Object.entries(state.lights).map(([device, on]) => {
                const zone = zones.find((z) => z.light === device);
                return (
                  <div key={device} className="light-toggle">
                    <span className={`bulb ${on ? 'is-on' : ''}`}>
                      <Icon name="light" />
                    </span>
                    <span className="spacer">{zone?.name ?? device}</span>
                    <Button
                      size="sm"
                      onClick={() => home.send({ type: 'set_light', device, on: !on })}
                    >
                      Turn {on ? 'off' : 'on'}
                    </Button>
                  </div>
                );
              })}
            </Card>

            <Card className="stack">
              <h2>Active routine</h2>
              {!state.assistantEnabled && <Badge tone="warn">Helper paused by the child</Badge>}
              {state.run ? (
                <>
                  <strong>{state.run.missionTitle}</strong>
                  <span>
                    Step {state.run.stepIndex + 1} of {state.run.totalSteps}:{' '}
                    {state.run.step.action}
                  </span>
                  <span className="row" style={{ gap: 6 }}>
                    <Badge tone="info">{LEVEL_LABELS[state.run.level]}</Badge>
                    {state.run.visionActive && <Badge tone="neutral">Camera checking</Badge>}
                    {state.run.onBreak && <Badge tone="warn">On a break</Badge>}
                    {state.run.helpRequested && <Badge tone="danger">Asked for help</Badge>}
                  </span>
                </>
              ) : (
                <p className="muted">
                  {state.lastCompleted
                    ? `Last finished: ${state.lastCompleted.missionTitle}.`
                    : 'No routine running.'}
                </p>
              )}
              {state.paused && (
                <span className="small">
                  Waiting: {state.paused.missionTitle} (step {state.paused.stepIndex + 1} of{' '}
                  {state.paused.totalSteps})
                </span>
              )}
              {state.suggestion && (
                <span className="row" style={{ gap: 6 }}>
                  <Badge tone="info">Asking</Badge>
                  <span className="small">{state.suggestion.prompt}</span>
                </span>
              )}
              {state.scanning && <Badge tone="neutral">Glasses looking for routines</Badge>}
            </Card>
          </div>
        </div>
      )}
    </main>
  );
}
