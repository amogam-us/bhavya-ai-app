import type { PromptLevel, RunSummary } from '@bhavya/shared';
import { Badge, Button, Card, ErrorNotice, PageHeader, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { LEVEL_LABELS, timeAgo } from '../../lib/format';
import { useLoader } from '../../lib/useLoader';

function LevelBar({ level }: { level: PromptLevel }) {
  return (
    <span className="level-bar" aria-label={LEVEL_LABELS[level]} title={LEVEL_LABELS[level]}>
      {[1, 2, 3].map((n) => (
        <span key={n} className={n <= level ? 'on' : ''} />
      ))}
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
  hub_restarted: 'Hub restarted',
};

export function ProgressPage() {
  const progress = useLoader(() => api.progress(), []);

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
          {progress.data.missions.map((m) => (
            <Card key={m.missionId} className="stack">
              <div className="row">
                <h2>{m.title}</h2>
                <span className="spacer" />
                <span className="muted small">
                  {m.runs === 0
                    ? 'Not used yet'
                    : `${m.completed} of ${m.runs} finished · last ${timeAgo(m.lastRunAt ?? '')} · ${m.avgAssistance} help moments per run`}
                </span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Step</th>
                    <th>Support now</th>
                    <th>Done alone in a row</th>
                  </tr>
                </thead>
                <tbody>
                  {m.steps.map((s) => (
                    <tr key={s.stepId}>
                      <td>{s.action}</td>
                      <td>
                        <span className="row" style={{ gap: 8 }}>
                          <LevelBar level={s.level} />
                          <span className="small">{LEVEL_LABELS[s.level]}</span>
                        </span>
                      </td>
                      <td>{s.streak}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}

          <Card>
            <h2>Recent routines</h2>
            {progress.data.recentRuns.length === 0 ? (
              <p className="muted">No routines have run yet.</p>
            ) : (
              <table>
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
                      <td>{r.missionTitle}</td>
                      <td>{timeAgo(r.startedAt)}</td>
                      <td>
                        <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                        {r.endReason && r.status !== 'completed' && (
                          <div className="muted small">
                            {END_REASONS[r.endReason] ?? r.endReason}
                          </div>
                        )}
                      </td>
                      <td>
                        {r.stepsDone} / {r.totalSteps}
                      </td>
                      <td>{r.helpRequests}</td>
                      <td>{r.escalations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
