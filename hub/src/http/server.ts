import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import type { AppConfig } from '../config';
import { EngineError } from '../engine/engine';
import { HttpError } from '../lib/errors';
import { CARDS_URL_PREFIX } from '../lib/images';
import { MuseError } from '../muse/client';
import type { AppContext } from './context';
import { missionRoutes } from './routes/missions';
import { runtimeRoutes } from './routes/runtime';
import { settingsRoutes } from './routes/settings';
import { websocketRoutes } from './ws';

/** Demo frames and card uploads are sent as base64 JSON. */
const BODY_LIMIT_BYTES = 25 * 1024 * 1024;

export function createApp(config: AppConfig): FastifyInstance {
  return Fastify({
    bodyLimit: BODY_LIMIT_BYTES,
    logger: config.prettyLogs
      ? {
          level: config.logLevel,
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
          },
        }
      : { level: config.logLevel },
  });
}

export async function registerRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.setErrorHandler(handleError);
  // Fastify logs two info lines per request; keep only warnings per request and
  // write one compact line per API call instead.
  app.addHook('onRoute', (route) => {
    if (!route.logLevel) route.logLevel = 'warn';
  });
  app.addHook('onResponse', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    const ms = Math.round(reply.elapsedTime);
    app.log.info(`${req.method} ${req.url.split('?')[0]} ${reply.statusCode} ${ms}ms`);
  });

  await app.register(fastifyWebsocket, { options: { maxPayload: 64 * 1024 } });

  await mkdir(ctx.config.cardsDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: ctx.config.cardsDir,
    prefix: CARDS_URL_PREFIX,
    decorateReply: false,
    maxAge: '7d',
    immutable: true,
  });

  const webIndex = path.join(ctx.config.webDistDir, 'index.html');
  const serveWeb = existsSync(webIndex);
  if (serveWeb) {
    // Files are looked up on each request (wildcard), so a rebuilt web app with new
    // hashed file names is served without restarting the hub.
    await app.register(fastifyStatic, { root: ctx.config.webDistDir, prefix: '/' });
  }

  missionRoutes(app, ctx);
  settingsRoutes(app, ctx);
  runtimeRoutes(app, ctx);
  websocketRoutes(app, ctx);

  app.setNotFoundHandler((req, reply) => {
    if (serveWeb && isAppPage(req)) return reply.sendFile('index.html');
    return reply.status(404).send({ error: 'Not found.' });
  });
}

/**
 * True for browser navigations to app pages such as /parent/progress, which all render
 * index.html. Missing files (anything with an extension) get a real 404 instead, so a
 * stale script URL never receives HTML.
 */
function isAppPage(req: FastifyRequest): boolean {
  const pathname = req.url.split('?')[0] ?? '';
  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
  return (
    req.method === 'GET' &&
    !pathname.startsWith('/api/') &&
    !pathname.startsWith(CARDS_URL_PREFIX) &&
    !lastSegment.includes('.')
  );
}

function handleError(error: FastifyError, req: FastifyRequest, reply: FastifyReply) {
  if (error instanceof HttpError) {
    return reply.status(error.statusCode).send({ error: error.message, details: error.details });
  }
  if (error instanceof EngineError) {
    return reply.status(409).send({ error: error.message });
  }
  if (error instanceof MuseError) {
    req.log.warn({ status: error.status, reason: error.message }, 'Meta Model API request failed');
    return reply.status(502).send({ error: `Meta AI could not finish this. ${error.message}` });
  }
  const status = error.statusCode;
  if (status && status >= 400 && status < 500) {
    return reply.status(status).send({ error: error.message });
  }
  req.log.error({ err: error }, 'Unhandled error');
  return reply.status(500).send({ error: 'Something went wrong on the home hub.' });
}
