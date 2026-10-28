import type { PromptLevel, ProgressResponse } from '@bhavya/shared';
import type { Repositories } from './db/repositories';

const RECENT_RUNS = 20;

/** Progress for the parent: how much support each step still needs. Never a score. */
export function buildProgress(repos: Repositories): ProgressResponse {
  const startLevel = repos.settings.getProfile().startLevel as PromptLevel;
  const missions = repos.missions.list().map((mission) => {
    const totals = repos.runs.totalsForMission(mission.id);
    return {
      missionId: mission.id,
      title: mission.title,
      runs: totals.runs,
      completed: totals.completed,
      lastRunAt: totals.lastRunAt,
      avgAssistance: totals.avgAssistance,
      steps: mission.steps.map((step) => {
        const stats = repos.stats.get(mission.id, step.id);
        return {
          stepId: step.id,
          action: step.action,
          level: stats?.level ?? startLevel,
          streak: stats?.streak ?? 0,
        };
      }),
    };
  });
  return { missions, recentRuns: repos.runs.recent(RECENT_RUNS) };
}
