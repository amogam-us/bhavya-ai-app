import type { Mission, Zone } from '@bhavya/shared';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Badge, Button, Card, ErrorNotice, PageHeader, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { useLoader } from '../../lib/useLoader';

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
      {missions.data?.length === 0 && (
        <Card>
          <p>No routines yet. Create one by writing, speaking or recording a short video.</p>
        </Card>
      )}
      <div className="mission-list">
        {missions.data?.map((mission) => {
          const zone = zones.find((z) => z.id === mission.zone);
          const cards = mission.steps.filter((s) => s.card);
          const cover = cards[0]?.card ?? null;
          return (
            <Link
              key={mission.id}
              to={`/parent/missions/${mission.id}`}
              className="card mission-card"
            >
              <div className="mission-card-top">
                <div className="mission-cover">
                  {cover ? <img src={cover} alt="" /> : <Icon name="list" size={22} />}
                </div>
                <div>
                  <h2>{mission.title}</h2>
                  <div className="row" style={{ gap: 6 }}>
                    {mission.status === 'approved' ? (
                      <Badge tone="success">Approved</Badge>
                    ) : (
                      <Badge tone="warn">Draft, needs review</Badge>
                    )}
                    {zone?.type === 'private' && <Badge tone="info">Private, camera off</Badge>}
                  </div>
                </div>
              </div>
              <p className="muted small">
                {zone?.name ?? mission.zone} · {mission.steps.length} steps ·{' '}
                {triggerLabel(mission, zones)}
              </p>
              {cards.length > 1 && (
                <div className="thumbs">
                  {cards.slice(1, 8).map((s) => (
                    <img key={s.id} className="thumb" src={s.card ?? ''} alt={s.action} />
                  ))}
                </div>
              )}
              <span className="mission-open">Open routine →</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
