import type { HomeState, Mission, Notification } from '@bhavya/shared';
import { openDatabase } from '../src/db/database';
import { createRepositories, type Repositories } from '../src/db/repositories';
import { MissionEngine } from '../src/engine/engine';
import { seedIfEmpty } from '../src/seed';

export interface Harness {
  repos: Repositories;
  engine: MissionEngine;
  notifications: Notification[];
  state: () => HomeState;
  mission: (titleStart: string) => Mission;
}

/** An engine on an in-memory database with the two demo routines. */
export function createHarness(): Harness {
  const repos = createRepositories(openDatabase(':memory:'));
  seedIfEmpty(repos);
  const engine = new MissionEngine({ repos });
  const notifications: Notification[] = [];
  engine.on('notification', (n) => notifications.push(n));
  return {
    repos,
    engine,
    notifications,
    state: () => engine.getState(),
    mission: (titleStart) => {
      const found = repos.missions.list().find((m) => m.title.startsWith(titleStart));
      if (!found) throw new Error(`No mission starting with "${titleStart}"`);
      return found;
    },
  };
}

/** Taps "done" on every remaining step of the active run. */
export function finishRun(h: Harness): void {
  for (let guard = 0; guard < 50; guard++) {
    const run = h.state().run;
    if (!run) return;
    h.engine.stepDone(run.runId, run.stepIndex, 'tap');
  }
  throw new Error('Run did not finish');
}

/** Turns on routine suggestions from the glasses, as a parent would in Settings. */
export function enableGlassesSuggestions(h: Harness): void {
  h.repos.settings.saveProfile({ ...h.repos.settings.getProfile(), glassesSuggestions: true });
  h.engine.refresh();
}
