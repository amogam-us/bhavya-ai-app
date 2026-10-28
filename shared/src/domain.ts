import { z } from 'zod';

/** A room in the home. Private rooms never allow the camera. */
export const zoneTypeSchema = z.enum(['private', 'camera_ok']);
export type ZoneType = z.infer<typeof zoneTypeSchema>;

export const zoneSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/, 'Use lowercase letters, digits and _'),
  name: z.string().trim().min(1).max(40),
  type: zoneTypeSchema,
  /** Device id of the room's smart light, or null when the room has none. */
  light: z.string().trim().min(1).max(40).nullable(),
});
export type Zone = z.infer<typeof zoneSchema>;

/** How a step is confirmed. Vision checks only run in camera-OK rooms. */
export const checkTypeSchema = z.enum(['tap', 'vision']);
export type CheckType = z.infer<typeof checkTypeSchema>;

export const stepSchema = z.object({
  id: z.string().min(1).max(40),
  /** Short title shown on the card, e.g. "Wash your hands". */
  action: z.string().trim().min(1).max(80),
  /** The object this step needs, used by the object finder. */
  object: z.string().trim().min(1).max(40).nullable(),
  prompts: z.object({
    /** Spoken at prompt level 3. */
    full: z.string().trim().min(1).max(240),
    /** Spoken at prompt level 2. */
    short: z.string().trim().min(1).max(80),
  }),
  /** Simpler explanation used when the child is stuck. */
  ifStuck: z.string().trim().min(1).max(240),
  check: checkTypeSchema,
  /** What "done" looks like, for vision checks. */
  expect: z.string().trim().min(1).max(160).nullable(),
  timeoutSec: z.number().int().min(10).max(600),
  /** URL of the picture card, or null until one is made. */
  card: z.string().max(300).nullable(),
  safety: z.array(z.string().trim().min(1).max(160)).max(5),
});
export type Step = z.infer<typeof stepSchema>;

/**
 * Smart-home actions a mission may run. This is a closed allowlist: there is
 * deliberately no lock or unlock action, so door locks can never be automated.
 * Actions always target the light of the mission's own zone.
 */
export const actionTypeSchema = z.enum(['light_on', 'light_off']);
export type ActionType = z.infer<typeof actionTypeSchema>;

export const actionSchema = z.object({
  type: actionTypeSchema,
  delaySec: z.number().int().min(0).max(900),
});
export type MissionAction = z.infer<typeof actionSchema>;

export const triggerSchema = z.enum(['manual', 'zone_enter']);
export type Trigger = z.infer<typeof triggerSchema>;

export const missionSourceSchema = z.enum(['text', 'voice', 'demo', 'seed']);
export type MissionSource = z.infer<typeof missionSourceSchema>;

export const missionStatusSchema = z.enum(['draft', 'approved']);
export type MissionStatus = z.infer<typeof missionStatusSchema>;

/** The editable part of a mission. */
export const missionInputSchema = z.object({
  title: z.string().trim().min(1).max(60),
  zone: z.string().min(1),
  trigger: triggerSchema,
  onStart: z.array(actionSchema).max(3),
  onEnd: z.array(actionSchema).max(3),
  steps: z.array(stepSchema).min(1).max(20),
});
export type MissionInput = z.infer<typeof missionInputSchema>;

export const missionSchema = missionInputSchema.extend({
  id: z.string(),
  status: missionStatusSchema,
  source: missionSourceSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Mission = z.infer<typeof missionSchema>;

export const readingLevelSchema = z.enum(['simple', 'standard']);

export const childProfileSchema = z.object({
  name: z.string().trim().min(1).max(40),
  /** Language for all guidance, e.g. "English". */
  language: z.string().trim().min(2).max(30),
  readingLevel: readingLevelSchema,
  /** Speech rate for text-to-speech (1 is normal). */
  speechRate: z.number().min(0.5).max(1.5),
  volume: z.number().min(0).max(1),
  /** Prompt level new missions start at (3 = most support). */
  startLevel: z.number().int().min(0).max(3),
  /** Show written words next to pictures. */
  showText: z.boolean(),
  calming: z.object({
    breathing: z.boolean(),
    music: z.boolean(),
  }),
});
export type ChildProfile = z.infer<typeof childProfileSchema>;

export type PromptLevel = 0 | 1 | 2 | 3;
export const MAX_PROMPT_LEVEL: PromptLevel = 3;
