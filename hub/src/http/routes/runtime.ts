import {
  findObjectSchema,
  frameCheckSchema,
  transcribeSchema,
  type FindObjectResponse,
  type FrameCheckResponse,
  type TranscribeResponse,
} from '@bhavya/shared';
import type { FastifyInstance } from 'fastify';
import { HttpError, parseOrThrow } from '../../lib/errors';
import { buildProgress } from '../../progress';
import type { AppContext } from '../context';

type RunParams = { Params: { runId: string } };

const CAMERA_NOT_ALLOWED = 'The camera is not allowed for this step right now.';

export function runtimeRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { engine, muse, repos } = ctx;

  app.get('/api/state', async () => engine.getState());

  app.get('/api/progress', async () => buildProgress(repos));

  app.get('/api/notifications', async () => repos.notifications.recent(50));

  /**
   * Checks one live frame against the current step. The frame is only held in
   * memory for the Muse call and is never stored. The privacy gate is checked
   * both before and after the call, since the child may move rooms meanwhile.
   */
  app.post<RunParams>('/api/runs/:runId/frame', async (req): Promise<FrameCheckResponse> => {
    const body = parseOrThrow(frameCheckSchema, req.body);
    const step = engine.watchableStep(req.params.runId, body.stepIndex);
    if (!step) throw HttpError.conflict(CAMERA_NOT_ALLOWED);

    const result = await muse.checkStep({
      profile: repos.settings.getProfile(),
      step,
      image: body.image,
    });
    const confidence = Math.max(0, Math.min(1, result.confidence));
    engine.applyVisionCheck(req.params.runId, body.stepIndex, { done: result.done, confidence });
    return { done: result.done, confidence, hint: result.done ? null : result.hint || null };
  });

  /** Object finder for the child's live view. Same privacy gate as frame checks. */
  app.post<RunParams>('/api/runs/:runId/find', async (req): Promise<FindObjectResponse> => {
    const body = parseOrThrow(frameCheckSchema, req.body);
    const step = engine.watchableStep(req.params.runId, body.stepIndex);
    if (!step) throw HttpError.conflict(CAMERA_NOT_ALLOWED);
    if (!step.object) return { boxes: [] };
    return { boxes: await muse.findObject(step.object, body.image) };
  });

  /** Object finder for the parent's demonstration frames (used to crop real-object cards). */
  app.post('/api/vision/find', async (req): Promise<FindObjectResponse> => {
    const body = parseOrThrow(findObjectSchema, req.body);
    return { boxes: await muse.findObject(body.object, body.image) };
  });

  app.post('/api/voice/transcribe', async (req): Promise<TranscribeResponse> => {
    const body = parseOrThrow(transcribeSchema, req.body);
    const wav = Buffer.from(body.audio.slice(body.audio.indexOf(',') + 1), 'base64');
    if (wav.length < 1000) throw HttpError.badRequest('The recording is too short.');
    return { transcript: await muse.transcribe(wav) };
  });
}
