import {
  FEATURES,
  findObjectSchema,
  frameCheckSchema,
  sceneScanSchema,
  transcribeSchema,
  voiceRequestSchema,
  type FindObjectResponse,
  type FrameCheckResponse,
  type SceneScanResponse,
  type TranscribeResponse,
  type VoiceRequestResponse,
} from '@bhavya/shared';
import type { FastifyInstance } from 'fastify';
import {
  VISION_CONFIDENCE_THRESHOLD,
  type SceneResult,
  type VoiceIntent,
} from '../../engine/engine';
import { HttpError, parseOrThrow } from '../../lib/errors';
import { buildProgress } from '../../progress';
import type { AppContext } from '../context';

type RunParams = { Params: { runId: string } };

const CAMERA_NOT_ALLOWED = 'The camera is not allowed for this step right now.';
/** Glasses frames closer together than this are skipped, so Muse is not called too often. */
const MIN_SCAN_INTERVAL_MS = 10_000;
const NOTHING_HEARD = "I didn't hear anything. Hold the button and talk.";

const percent = (confidence: number) => confidence.toFixed(2);

/** One brain-log line for what Muse understood from the child's words. */
function describeIntent(intent: VoiceIntent, titleOf: (id: string) => string | undefined): string {
  const title = intent.missionId ? titleOf(intent.missionId) : undefined;
  const what =
    intent.action === 'start_routine'
      ? `start "${title ?? 'an unknown routine'}"`
      : intent.action === 'none'
        ? 'not sure what was meant'
        : intent.action;
  return `Muse Spark → ${what} (${percent(intent.confidence)})`;
}

/** One brain-log line for what Muse saw in an idle glasses frame. */
function describeScene(scene: SceneResult, titleOf: (id: string) => string | undefined): string {
  if (scene.private)
    return `Muse Spark (glasses frame): private place (${percent(scene.confidence)})`;
  const title = scene.missionId ? titleOf(scene.missionId) : undefined;
  return title
    ? `Muse Spark (glasses frame): fits "${title}" (${percent(scene.confidence)})`
    : 'Muse Spark (glasses frame): no routine fits here';
}

function decodeWav(dataUrl: string): Buffer {
  const wav = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  if (wav.length < 1000) throw HttpError.badRequest('The recording is too short.');
  return wav;
}

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
    if (result.done && confidence >= VISION_CONFIDENCE_THRESHOLD) {
      engine.trace(
        'muse',
        `Muse Spark (step check): "${step.action}" looks done (${percent(confidence)})`,
      );
    }
    engine.applyVisionCheck(req.params.runId, body.stepIndex, { done: result.done, confidence });
    return { done: result.done, confidence, hint: result.done ? null : result.hint || null };
  });

  if (FEATURES.objectFinder) {
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
  }

  app.post('/api/voice/transcribe', async (req): Promise<TranscribeResponse> => {
    const body = parseOrThrow(transcribeSchema, req.body);
    return { transcript: await muse.transcribe(decodeWav(body.audio)) };
  });

  /**
   * The child's Talk button: Muse Voice hears the words, Muse Spark works out
   * what they want, and the engine decides what to do. The audio is never stored.
   */
  app.post('/api/voice/request', async (req): Promise<VoiceRequestResponse> => {
    const body = parseOrThrow(voiceRequestSchema, req.body);
    const heardDuring = engine.stepRef();
    const transcript = (await muse.transcribe(decodeWav(body.audio))).trim();
    engine.trace('child', transcript ? `Talk: "${transcript}"` : 'Talk: nothing heard');
    if (!transcript) return { transcript: '', action: 'none', message: NOTHING_HEARD };

    const state = engine.getState();
    const routines = engine.voiceCandidates();
    const intent = await muse.interpretRequest(transcript, {
      profile: repos.settings.getProfile(),
      routines,
      zones: repos.settings.getZones(),
      current: state.run?.missionTitle ?? null,
      paused: state.paused?.missionTitle ?? null,
    });
    engine.trace(
      'muse',
      describeIntent(intent, (id) => routines.find((m) => m.id === id)?.title),
    );
    return { transcript, ...engine.applyVoiceRequest(intent, heardDuring) };
  });

  /**
   * One idle glasses frame, used only to suggest a routine. Muse is not called
   * unless a parent turned suggestions on and the privacy rules allow it, and
   * the frame is never stored.
   */
  let lastScanAt = 0;
  let scanBusy = false;
  app.post('/api/scan', async (req): Promise<SceneScanResponse> => {
    const body = parseOrThrow(sceneScanSchema, req.body);
    const now = Date.now();
    if (!engine.scanAllowed() || scanBusy || now - lastScanAt < MIN_SCAN_INTERVAL_MS) {
      return { outcome: 'ignored' };
    }
    const routines = engine.sceneCandidates();
    if (routines.length === 0) return { outcome: 'quiet' };

    lastScanAt = now;
    scanBusy = true;
    try {
      const scene = await muse.checkScene(body.image, {
        routines,
        zones: repos.settings.getZones(),
      });
      engine.trace(
        'muse',
        describeScene(scene, (id) => routines.find((m) => m.id === id)?.title),
      );
      return { outcome: engine.applyScan(scene) };
    } finally {
      scanBusy = false;
    }
  });
}
