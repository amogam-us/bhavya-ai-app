import {
  BOARD_PHRASES,
  childProfileSchema,
  findBoardPhrase,
  zoneSchema,
  type AppOptions,
} from '@bhavya/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HttpError, parseOrThrow } from '../../lib/errors';
import { deleteCardImage, saveCardImage } from '../../lib/images';
import { boardIconPrompt } from '../../muse/prompts';
import type { AppContext } from '../context';

const zonesSchema = z
  .array(zoneSchema)
  .min(1)
  .max(12)
  .refine(
    (zones) => new Set(zones.map((z) => z.id)).size === zones.length,
    'Room ids must be unique.',
  )
  .refine((zones) => {
    const lights = zones.flatMap((z) => (z.light ? [z.light] : []));
    return new Set(lights).size === lights.length;
  }, 'Each light can belong to only one room.');

export function settingsRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { settings } = ctx.repos;

  /** Options set in the hub's .env, such as how the home simulator is offered. */
  app.get('/api/options', async (): Promise<AppOptions> => ({
    simulator: ctx.config.simulator,
    glassesSuggestions: ctx.config.glassesSuggestions,
    privatePauseMinutes: ctx.config.privatePauseMinutes,
    cameraDebug: ctx.config.cameraDebug,
  }));

  app.get('/api/settings', async () => ({
    profile: settings.getProfile(),
    zones: settings.getZones(),
  }));

  app.put('/api/settings/profile', async (req) => {
    const profile = parseOrThrow(childProfileSchema, req.body);
    settings.saveProfile(profile);
    // Settings such as glasses suggestions change what the child app shows.
    ctx.engine.refresh();
    return profile;
  });

  app.put('/api/settings/zones', async (req) => {
    const zones = parseOrThrow(zonesSchema, req.body);
    const used = new Set(ctx.repos.missions.list().map((m) => m.zone));
    const missing = [...used].filter((id) => !zones.some((z) => z.id === id));
    if (missing.length > 0) {
      throw HttpError.conflict(`Rooms used by routines cannot be removed: ${missing.join(', ')}.`);
    }
    settings.saveZones(zones);
    ctx.engine.refresh();
    return zones;
  });

  app.get('/api/board', async () => ({
    phrases: BOARD_PHRASES,
    icons: settings.getBoardIcons(),
  }));

  app.post<{ Params: { phraseId: string } }>('/api/board/:phraseId/icon', async (req) => {
    const phrase = findBoardPhrase(req.params.phraseId);
    if (!phrase) throw HttpError.notFound('Unknown board phrase.');
    const image = await ctx.muse.makePicture(boardIconPrompt(phrase.picture));
    const url = await saveCardImage(ctx.config.cardsDir, 'board', image, 'png');
    const previous = settings.getBoardIcons()[phrase.id] ?? null;
    settings.saveBoardIcon(phrase.id, url);
    await deleteCardImage(ctx.config.cardsDir, previous);
    return { icons: settings.getBoardIcons() };
  });
}
