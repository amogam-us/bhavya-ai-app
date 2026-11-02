import type { PromptLevel, RunSummary } from '@bhavya/shared';
import { Icon } from '../../components/Icon';
import { Badge, Button, ErrorNotice, PageHeader, Spinner, Stat } from '../../components/ui';
import { api } from '../../lib/api';
import { LEVEL_LABELS, timeAgo } from '../../lib/format';
import { useLoader } from '../../lib/useLoader';

/** More filled bars means more support; independent steps get a green tick instead. */
function SupportMeter({ level }: { level: PromptLevel }) {
  if (level === 0) {
    return (
      <span className="support-meter is-independent">
        <Icon name="check" size={14} />
        {LEVEL_LABELS[0]}
      </span>
    );
  }
  return (
    <span className={`support-meter level-${level}`}>
      <span className="level-bar" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span key={n} className={n <= level ? 'on' : ''} />
        ))}
      </span>
      {LEVEL_LABELS[level]}
    </span>
  );
}

const STATUS: Record<
  RunSummary['status'],
  { label: string; tone: 'success' | 'neutral' | 'warn' | 'info' }
> = {
  completed: { label: 'Finished', tone: 'success' },
  ended: { label: 'Ended early', tone: 'neutral' },
  interrupted: { label: 'Interrupted', tone: 'warn' },
  active: { label: 'In progress', tone: 'info' },
};

const END_REASONS: Record<string, string> = {
  stopped: 'Child stopped it',
  left_room: 'Left the room',
  assistant_off: 'Helper turned off',
  not_resumed: 'Paused, not continued',
  replaced: 'Set aside for another routine',
  hub_restarted: 'Hub restarted',
};

export function ProgressPage() {
  const progress = useLoader(() => api.progress(), []);
  const missions = progress.data?.missions ?? [];
  const steps = missions.flatMap((m) => m.steps);
  const independent = steps.filter((s) => s.level === 0).length;

  return (
    <>
      <PageHeader
        title="Progress"
        subtitle="How much support each step still needs. Bhavya fades reminders as your child becomes independent. This is not a score."
        actions={
          <Button icon="refresh" onClick={progress.reload} disabled={progress.loading}>
            Refresh
          </Button>
        }
      />
      <ErrorNotice error={progress.error} />
      {progress.loading && !progress.data && <Spinner label="Loading progress…" />}

      {progress.data && (
        <div className="stack">
          {missions.length > 0 && (
            <div className="stat-row">
              <Stat
                icon="play"
                value={missions.reduce((n, m) => n + m.runs, 0)}
                label="Routines started"
              />
              <Stat
                icon="check"
                tone="success"
                value={missions.reduce((n, m) => n + m.completed, 0)}
                label="Finished"
              />
              <Stat
                icon="sparkle"
                tone="purple"
                value={`${independent} of ${steps.length}`}
                label="Steps done independently"
              />
            </div>
          )}

          <div className="progress-grid">
            {missions.map((m) => (
              <section key={m.missionId} className="card progress-card">
                <header>
                  <h2>{m.title}</h2>
                  <p className="muted small">
                    {m.runs === 0
                      ? 'Not used yet'
                      : `${m.completed} of ${m.runs} finished · last ${timeAgo(m.lastRunAt ?? '')} · ${m.avgAssistance} help moments per run`}
                  </p>
                </header>
                <div className="support-head" aria-hidden="true">
                  <span>Step</span>
                  <span>Support now</span>
                  <span>Alone in a row</span>
                </div>
                <ul className="support-list">
                  {m.steps.map((s, i) => (
                    <li key={s.stepId}>
                      <span className="support-step">
                        <span className="support-num">{i + 1}</span>
                        {s.action}
                      </span>
                      <SupportMeter level={s.level} />
                      <span
                        className={`support-streak ${s.streak > 0 ? 'is-on' : ''}`}
                        title="Times in a row done without help"
                        aria-label={`${s.streak} times in a row without help`}
                      >
                        {s.streak}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <section className="card">
            <h2>Recent routines</h2>
            {progress.data.recentRuns.length === 0 ? (
              <p className="muted">No routines have run yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="runs-table">
                  <thead>
                    <tr>
                      <th>Routine</th>
                      <th>When</th>
                      <th>Result</th>
                      <th>Steps</th>
                      <th>Asked for help</th>
                      <th>Reminders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {progress.data.recentRuns.map((r) => (
                      <tr key={r.id}>
                        <td className="strong">{r.missionTitle}</td>
                        <td className="muted">{timeAgo(r.startedAt)}</td>
                        <td>
                          <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                          {r.endReason && r.status !== 'completed' && (
                            <div className="muted small">
                              {END_REASONS[r.endReason] ?? r.endReason}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className="run-steps">
                            <span className="mini-bar" aria-hidden="true">
                              <span
                                style={{
                                  width: `${r.totalSteps ? (100 * r.stepsDone) / r.totalSteps : 0}%`,
                                }}
                              />
                            </span>
                            {r.stepsDone} / {r.totalSteps}
                          </span>
                        </td>
                        <td>{r.helpRequests}</td>
                        <td>{r.escalations}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
