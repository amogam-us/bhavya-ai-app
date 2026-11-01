import { mkdirSync } from 'node:fs';
import os from 'node:os';
import { loadConfig } from './config';
import { openDatabase } from './db/database';
import { createRepositories } from './db/repositories';
import { MissionEngine } from './engine/engine';
import { createApp, registerRoutes } from './http/server';
import { nowIso } from './lib/ids';
import { MissionService } from './missions/service';
import { MuseClient } from './muse/client';
import { MuseService } from './muse/service';
import { seedIfEmpty } from './seed';

async function main(): Promise<void> {
  const config = loadConfig();
  mkdirSync(config.cardsDir, { recursive: true });

  const app = createApp(config);
  const db = openDatabase(config.dbPath);
  const repos = createRepositories(db);

  const seeded = seedIfEmpty(repos);
  if (seeded > 0) app.log.info(`Added ${seeded} demo routines.`);
  const interrupted = repos.runs.markInterrupted(nowIso());
  if (interrupted > 0) app.log.warn(`Closed ${interrupted} routine(s) interrupted by a restart.`);

  const muse = new MuseService(
    new MuseClient({ apiKey: config.apiKey, baseUrl: config.museBaseUrl }),
    app.log,
  );
  const engine = new MissionEngine({ repos });
  // What the hub noticed and decided, step by step. Shown with LOG_LEVEL=debug.
  engine.on('trace', (entry) => app.log.debug(`[${entry.kind}] ${entry.message}`));
  const missions = new MissionService({ repos, muse, cardsDir: config.cardsDir });

  await registerRoutes(app, { config, repos, engine, missions, muse });
  await app.listen({ port: config.port, host: config.host });
  logAddresses(config.port, (line) => app.log.info(line));

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info(`${signal} received, shutting down.`);
    await app.close();
    engine.dispose();
    db.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

/** Prints the LAN addresses so the child app can be opened on a phone. */
function logAddresses(port: number, log: (line: string) => void): void {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i!.address}:${port}`);
  log(`Home hub ready on http://localhost:${port}${lan.length ? ` and ${lan.join(', ')}` : ''}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
