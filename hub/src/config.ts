import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const envSchema = z.object({
  MODEL_API_KEY: z
    .string({
      required_error: 'MODEL_API_KEY is missing. Copy .env.example to .env and add your key.',
    })
    .trim()
    .min(10, 'MODEL_API_KEY looks too short.'),
  // Prefixed so that tools which set a generic PORT (dev servers, previews) cannot move the hub.
  HUB_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HUB_HOST: z.string().default('0.0.0.0'),
  MUSE_BASE_URL: z.string().url().default('https://api.meta.ai/v1'),
  DATA_DIR: z.string().default('data'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NODE_ENV: z.string().default('development'),
});

export interface AppConfig {
  apiKey: string;
  port: number;
  host: string;
  museBaseUrl: string;
  dataDir: string;
  dbPath: string;
  cardsDir: string;
  webDistDir: string;
  logLevel: z.infer<typeof envSchema>['LOG_LEVEL'];
  prettyLogs: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${problems.join('\n')}`);
  }
  const e = parsed.data;
  const dataDir = path.resolve(REPO_ROOT, e.DATA_DIR);
  return {
    apiKey: e.MODEL_API_KEY,
    port: e.HUB_PORT,
    host: e.HUB_HOST,
    museBaseUrl: e.MUSE_BASE_URL.replace(/\/+$/, ''),
    dataDir,
    dbPath: path.join(dataDir, 'bhavya.db'),
    cardsDir: path.join(dataDir, 'cards'),
    webDistDir: path.join(REPO_ROOT, 'web', 'dist'),
    logLevel: e.LOG_LEVEL,
    prettyLogs: e.NODE_ENV !== 'production',
  };
}
