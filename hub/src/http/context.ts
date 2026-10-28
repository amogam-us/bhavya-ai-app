import type { AppConfig } from '../config';
import type { Repositories } from '../db/repositories';
import type { MissionEngine } from '../engine/engine';
import type { MissionService } from '../missions/service';
import type { MuseService } from '../muse/service';

/** Everything the HTTP layer needs, created once at startup. */
export interface AppContext {
  config: AppConfig;
  repos: Repositories;
  engine: MissionEngine;
  missions: MissionService;
  muse: MuseService;
}
