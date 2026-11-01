import { z } from 'zod';
import type { Mission, PromptLevel } from './domain';

const dataUrl = (prefix: string) =>
  z.string().refine((v) => v.startsWith(prefix), `Expected a ${prefix} data URL`);

export const imageDataUrlSchema = dataUrl('data:image/');

export const MAX_DEMO_FRAMES = 24;

export const draftFromTextSchema = z.object({
  zone: z.string().min(1),
  instructions: z.string().trim().min(3).max(4000),
  title: z.string().trim().max(60).optional(),
  source: z.enum(['text', 'voice']).default('text'),
});
export type DraftFromTextRequest = z.input<typeof draftFromTextSchema>;

export const draftFromDemoSchema = z.object({
  zone: z.string().min(1),
  title: z.string().trim().max(60).optional(),
  narration: z.string().trim().max(4000).optional(),
  frames: z.array(imageDataUrlSchema).min(2).max(MAX_DEMO_FRAMES),
});
export type DraftFromDemoRequest = z.input<typeof draftFromDemoSchema>;

export const frameCheckSchema = z.object({
  stepIndex: z.number().int().min(0),
  image: imageDataUrlSchema,
});
export type FrameCheckRequest = z.infer<typeof frameCheckSchema>;

export interface FrameCheckResponse {
  done: boolean;
  confidence: number;
  hint: string | null;
}

export const findObjectSchema = z.object({
  object: z.string().trim().min(1).max(40),
  image: imageDataUrlSchema,
});
export type FindObjectRequest = z.infer<typeof findObjectSchema>;

/** A box in normalized 0..1 image coordinates. */
export interface ObjectBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface FindObjectResponse {
  boxes: ObjectBox[];
}

export const transcribeSchema = z.object({
  /** WAV audio as a data URL (data:audio/wav;base64,...). */
  audio: dataUrl('data:audio/wav;base64,'),
});
export interface TranscribeResponse {
  transcript: string;
}

/** The child spoke to Bhavya with the Talk button. Same audio format as transcribeSchema. */
export const voiceRequestSchema = transcribeSchema;

/** What Bhavya understood and did with a spoken request. */
export type VoiceAction =
  'start_routine' | 'suggest_routine' | 'continue' | 'help' | 'stop' | 'break' | 'done' | 'none';

export interface VoiceRequestResponse {
  /** What Muse heard, or "" when nothing was heard. */
  transcript: string;
  action: VoiceAction;
  /** Short reply the child app speaks and shows. */
  message: string;
}

/** One idle glasses frame, sent so Bhavya can suggest a routine. */
export const sceneScanSchema = z.object({ image: imageDataUrlSchema });

/** private: camera paused; quiet: nothing fits; waiting: needs a second matching look. */
export type ScanOutcome = 'private' | 'quiet' | 'waiting' | 'suggested' | 'ignored';

export interface SceneScanResponse {
  outcome: ScanOutcome;
}

export const uploadCardSchema = z.object({ image: imageDataUrlSchema });

export interface DraftResponse {
  mission: Mission;
  /** For demo drafts: index of the demo frame that best shows each step, by step id. */
  keyFrames: Record<string, number>;
}

export interface StepProgress {
  stepId: string;
  action: string;
  level: PromptLevel;
  streak: number;
}

export interface MissionProgress {
  missionId: string;
  title: string;
  runs: number;
  completed: number;
  lastRunAt: string | null;
  /** Average help requests plus escalations per run, over the last 10 runs. */
  avgAssistance: number;
  steps: StepProgress[];
}

export interface RunSummary {
  id: string;
  missionTitle: string;
  startedAt: string;
  endedAt: string | null;
  status: 'active' | 'completed' | 'ended' | 'interrupted';
  endReason: string | null;
  stepsDone: number;
  totalSteps: number;
  helpRequests: number;
  escalations: number;
}

export interface ProgressResponse {
  missions: MissionProgress[];
  recentRuns: RunSummary[];
}

export interface BoardIcons {
  icons: Record<string, string>;
}
