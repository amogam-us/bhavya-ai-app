import type { Mission, Zone } from '@bhavya/shared';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Badge, Button, ErrorNotice, PageHeader, Spinner, Stat } from '../../components/ui';
import { api } from '../../lib/api';
import { useLoader } from '../../lib/useLoader';

/** Pictures shown on a routine card; the last tile says how many steps are left. */
const CARD_PICTURES = 4;

export function triggerLabel(mission: Mission, zones: Zone[]): string {
  const zone = zones.find((z) => z.id === mission.zone);
  return mission.trigger === 'zone_enter'
    ? `Starts when entering the ${zone?.name.toLowerCase() ?? 'room'}`
    : 'Started from the child app';
}

export function MissionsPage() {
  const navigate = useNavigate();
  const missions = useLoader(() => api.missions(), []);
  const settings = useLoader(() => api.settings(), []);
  const zones = settings.data?.zones ?? [];
  const list = missions.data ?? [];
  const approved = list.filter((m) => m.status === 'approved').length;

  return (
    <>
      <PageHeader
        title="Routines"
        subtitle="Each routine is a mission Bhavya guides step by step. New routines need your approval."
        actions={
          <Button variant="primary" icon="plus" onClick={() => navigate('/parent/new')}>
            New routine
          </Button>
        }
      />
      <ErrorNotice error={missions.error ?? settings.error} />
      {missions.loading && <Spinner label="Loading routines…" />}

      {list.length > 0 && (
        <div className="stat-row">
          <Stat icon="list" value={list.length} label="Routines" />
          <Stat icon="check" tone="success" value={approved} label="Ready for your child" />
          <Stat
            icon="edit"
            tone="warn"
            value={list.length - approved}
            label="Waiting for your review"
          />
        </div>
      )}

      {missions.data?.length === 0 && (
        <div className="card empty-state">
          <span className="empty-icon">
            <Icon name="sparkle" size={26} />
          </span>
          <h2>No routines yet</h2>
          <p className="muted">
            Write, say or film a routine once. Muse turns it into simple steps for you to check.
          </p>
          <Button variant="primary" icon="plus" onClick={() => navigate('/parent/new')}>
            Create the first routine
          </Button>
        </div>
      )}

      <div className="mission-list">
        {list.map((mission) => {
          const zone = zones.find((z) => z.id === mission.zone);
          const shown = mission.steps.slice(0, CARD_PICTURES);
          const more = mission.steps.length - shown.length;
          return (
            <Link
              key={mission.id}
              to={`/parent/missions/${mission.id}`}
              className={`card mission-card ${mission.status === 'approved' ? '' : 'is-draft'}`}
            >
              <div className="mission-pics" aria-hidden="true">
                {shown.map((step, i) => (
                  <span key={step.id} className="mission-pic">
                    {step.card ? <img src={step.card} alt="" /> : <b>{i + 1}</b>}
                    {more > 0 && i === shown.length - 1 && <i>+{more}</i>}
                  </span>
                ))}
              </div>
              <div className="mission-card-body">
                <h2>{mission.title}</h2>
                <ul className="mission-meta">
                  <li>
                    <Icon name="home" size={15} />
                    {zone?.name ?? mission.zone}
                    {zone?.type === 'private' && (
                      <span className="mission-private">
                        <Icon name="lock" size={13} /> private
                      </span>
                    )}
                  </li>
                  <li>
                    <Icon name="list" size={15} />
                    {mission.steps.length} {mission.steps.length === 1 ? 'step' : 'steps'}
                  </li>
                  <li>
                    <Icon name="play" size={15} />
                    {triggerLabel(mission, zones)}
                  </li>
                </ul>
              </div>
              <div className="mission-card-foot">
                {mission.status === 'approved' ? (
                  <Badge tone="success">Approved</Badge>
                ) : (
                  <Badge tone="warn">Needs your review</Badge>
                )}
                <span className="mission-open">
                  {mission.status === 'approved' ? 'Open' : 'Review'} →
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
