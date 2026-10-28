import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

/**
 * Schema migrations, applied in order. The index + 1 is stored in PRAGMA user_version.
 * Never edit a migration that has shipped; add a new one instead.
 */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE missions (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    status     TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE runs (
    id            TEXT PRIMARY KEY,
    mission_id    TEXT NOT NULL,
    mission_title TEXT NOT NULL,
    total_steps   INTEGER NOT NULL,
    started_at    TEXT NOT NULL,
    ended_at      TEXT,
    status        TEXT NOT NULL,
    end_reason    TEXT,
    help_requests INTEGER NOT NULL DEFAULT 0,
    escalations   INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX runs_by_mission ON runs (mission_id, started_at);
  CREATE INDEX runs_by_start ON runs (started_at);

  CREATE TABLE run_steps (
    run_id        TEXT NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
    step_index    INTEGER NOT NULL,
    step_id       TEXT NOT NULL,
    level         INTEGER NOT NULL,
    help_requests INTEGER NOT NULL,
    escalations   INTEGER NOT NULL,
    confirmed_by  TEXT NOT NULL,
    duration_ms   INTEGER NOT NULL,
    completed_at  TEXT NOT NULL,
    PRIMARY KEY (run_id, step_index)
  );

  CREATE TABLE step_stats (
    mission_id TEXT NOT NULL,
    step_id    TEXT NOT NULL,
    level      INTEGER NOT NULL,
    streak     INTEGER NOT NULL,
    PRIMARY KEY (mission_id, step_id)
  );

  CREATE TABLE notifications (
    id      TEXT PRIMARY KEY,
    kind    TEXT NOT NULL,
    message TEXT NOT NULL,
    at      TEXT NOT NULL
  );
  CREATE INDEX notifications_by_time ON notifications (at);
  `,
];

export function openDatabase(file: string): Db {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
  const current = row?.user_version ?? 0;
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version] as string);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

/** Runs `fn` inside a transaction, rolling back if it throws. */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
