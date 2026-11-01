import {
  childProfileSchema,
  DEFAULT_PROFILE,
  DEFAULT_ZONES,
  missionSchema,
  zoneSchema,
  type ChildProfile,
  type Mission,
  type Notification,
  type PromptLevel,
  type RunSummary,
  type Zone,
} from '@bhavya/shared';
import { z } from 'zod';
import type { Db } from './database';

export class MissionRepo {
  constructor(private readonly db: Db) {}

  list(): Mission[] {
    const rows = this.db.prepare('SELECT data FROM missions ORDER BY created_at').all() as {
      data: string;
    }[];
    return rows.map((r) => parseMission(r.data));
  }

  get(id: string): Mission | undefined {
    const row = this.db.prepare('SELECT data FROM missions WHERE id = ?').get(id) as
      { data: string } | undefined;
    return row ? parseMission(row.data) : undefined;
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM missions').get() as { n: number };
    return row.n;
  }

  insert(mission: Mission): void {
    this.db
      .prepare(
        'INSERT INTO missions (id, data, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        mission.id,
        JSON.stringify(mission),
        mission.status,
        mission.createdAt,
        mission.updatedAt,
      );
  }

  update(mission: Mission): void {
    this.db
      .prepare('UPDATE missions SET data = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(mission), mission.status, mission.updatedAt, mission.id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM missions WHERE id = ?').run(id);
    this.db.prepare('DELETE FROM step_stats WHERE mission_id = ?').run(id);
    return Number(result.changes) > 0;
  }
}

function parseMission(data: string): Mission {
  return missionSchema.parse(JSON.parse(data));
}

const boardIconsSchema = z.record(z.string(), z.string());

export class SettingsRepo {
  constructor(private readonly db: Db) {}

  getProfile(): ChildProfile {
    return this.read('profile', childProfileSchema, DEFAULT_PROFILE);
  }

  saveProfile(profile: ChildProfile): void {
    this.write('profile', profile);
  }

  getZones(): Zone[] {
    return this.read('zones', z.array(zoneSchema), DEFAULT_ZONES);
  }

  saveZones(zones: Zone[]): void {
    this.write('zones', zones);
  }

  getBoardIcons(): Record<string, string> {
    return this.read('board_icons', boardIconsSchema, {});
  }

  saveBoardIcon(phraseId: string, url: string): void {
    this.write('board_icons', { ...this.getBoardIcons(), [phraseId]: url });
  }

  private read<T>(key: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, fallback: T): T {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      { value: string } | undefined;
    if (!row) return fallback;
    const parsed = schema.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : fallback;
  }

  private write(key: string, value: unknown): void {
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      )
      .run(key, JSON.stringify(value));
  }
}

export interface NewRun {
  id: string;
  missionId: string;
  missionTitle: string;
  totalSteps: number;
  startedAt: string;
}

export interface StepRecord {
  runId: string;
  stepIndex: number;
  stepId: string;
  level: PromptLevel;
  helpRequests: number;
  escalations: number;
  confirmedBy: 'tap' | 'vision' | 'zone' | 'voice';
  durationMs: number;
  completedAt: string;
}

export interface MissionRunTotals {
  runs: number;
  completed: number;
  lastRunAt: string | null;
  avgAssistance: number;
}

export class RunRepo {
  constructor(private readonly db: Db) {}

  create(run: NewRun): void {
    this.db
      .prepare(
        `INSERT INTO runs (id, mission_id, mission_title, total_steps, started_at, status)
         VALUES (?, ?, ?, ?, ?, 'active')`,
      )
      .run(run.id, run.missionId, run.missionTitle, run.totalSteps, run.startedAt);
  }

  addAssistance(runId: string, helpRequests: number, escalations: number): void {
    this.db
      .prepare(
        'UPDATE runs SET help_requests = help_requests + ?, escalations = escalations + ? WHERE id = ?',
      )
      .run(helpRequests, escalations, runId);
  }

  recordStep(step: StepRecord): void {
    this.db
      .prepare(
        `INSERT INTO run_steps
           (run_id, step_index, step_id, level, help_requests, escalations, confirmed_by, duration_ms, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        step.runId,
        step.stepIndex,
        step.stepId,
        step.level,
        step.helpRequests,
        step.escalations,
        step.confirmedBy,
        step.durationMs,
        step.completedAt,
      );
  }

  end(runId: string, status: 'completed' | 'ended', reason: string | null, endedAt: string): void {
    this.db
      .prepare('UPDATE runs SET status = ?, end_reason = ?, ended_at = ? WHERE id = ?')
      .run(status, reason, endedAt, runId);
  }

  /** Closes runs left active by a hub restart. Returns how many were closed. */
  markInterrupted(endedAt: string): number {
    const result = this.db
      .prepare(
        `UPDATE runs SET status = 'interrupted', end_reason = 'hub_restarted', ended_at = ?
         WHERE status = 'active'`,
      )
      .run(endedAt);
    return Number(result.changes);
  }

  recent(limit: number): RunSummary[] {
    const rows = this.db
      .prepare(
        `SELECT r.id, r.mission_title, r.started_at, r.ended_at, r.status, r.end_reason,
                r.total_steps, r.help_requests, r.escalations,
                (SELECT COUNT(*) FROM run_steps s WHERE s.run_id = r.id) AS steps_done
         FROM runs r ORDER BY r.started_at DESC LIMIT ?`,
      )
      .all(limit) as {
      id: string;
      mission_title: string;
      started_at: string;
      ended_at: string | null;
      status: RunSummary['status'];
      end_reason: string | null;
      total_steps: number;
      help_requests: number;
      escalations: number;
      steps_done: number;
    }[];
    return rows.map((r) => ({
      id: r.id,
      missionTitle: r.mission_title,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      status: r.status,
      endReason: r.end_reason,
      stepsDone: r.steps_done,
      totalSteps: r.total_steps,
      helpRequests: r.help_requests,
      escalations: r.escalations,
    }));
  }

  totalsForMission(missionId: string, assistanceWindow = 10): MissionRunTotals {
    const totals = this.db
      .prepare(
        `SELECT COUNT(*) AS runs,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
                MAX(started_at) AS last_run_at
         FROM runs WHERE mission_id = ?`,
      )
      .get(missionId) as { runs: number; completed: number | null; last_run_at: string | null };
    const assistance = this.db
      .prepare(
        `SELECT AVG(help_requests + escalations) AS avg FROM (
           SELECT help_requests, escalations FROM runs
           WHERE mission_id = ? AND status != 'active'
           ORDER BY started_at DESC LIMIT ?
         )`,
      )
      .get(missionId, assistanceWindow) as { avg: number | null };
    return {
      runs: totals.runs,
      completed: totals.completed ?? 0,
      lastRunAt: totals.last_run_at,
      avgAssistance: Math.round((assistance.avg ?? 0) * 10) / 10,
    };
  }
}

export interface StepStats {
  level: PromptLevel;
  streak: number;
}

export class StatsRepo {
  constructor(private readonly db: Db) {}

  get(missionId: string, stepId: string): StepStats | undefined {
    const row = this.db
      .prepare('SELECT level, streak FROM step_stats WHERE mission_id = ? AND step_id = ?')
      .get(missionId, stepId) as { level: number; streak: number } | undefined;
    return row ? { level: clampLevel(row.level), streak: row.streak } : undefined;
  }

  upsert(missionId: string, stepId: string, stats: StepStats): void {
    this.db
      .prepare(
        `INSERT INTO step_stats (mission_id, step_id, level, streak) VALUES (?, ?, ?, ?)
         ON CONFLICT (mission_id, step_id) DO UPDATE SET level = excluded.level, streak = excluded.streak`,
      )
      .run(missionId, stepId, stats.level, stats.streak);
  }
}

function clampLevel(value: number): PromptLevel {
  return Math.max(0, Math.min(3, Math.round(value))) as PromptLevel;
}

export class NotificationRepo {
  constructor(private readonly db: Db) {}

  add(notification: Notification): void {
    this.db
      .prepare('INSERT INTO notifications (id, kind, message, at) VALUES (?, ?, ?, ?)')
      .run(notification.id, notification.kind, notification.message, notification.at);
  }

  /** Newest first. */
  recent(limit: number): Notification[] {
    return this.db
      .prepare('SELECT id, kind, message, at FROM notifications ORDER BY at DESC LIMIT ?')
      .all(limit) as unknown as Notification[];
  }
}

export interface Repositories {
  missions: MissionRepo;
  settings: SettingsRepo;
  runs: RunRepo;
  stats: StatsRepo;
  notifications: NotificationRepo;
}

export function createRepositories(db: Db): Repositories {
  return {
    missions: new MissionRepo(db),
    settings: new SettingsRepo(db),
    runs: new RunRepo(db),
    stats: new StatsRepo(db),
    notifications: new NotificationRepo(db),
  };
}
