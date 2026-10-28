import { missionInputSchema, type MissionInput, type Step, type Zone } from '@bhavya/shared';
import { newShortId } from '../lib/ids';
import type { DraftStep, MissionDraft } from '../muse/schemas';

const MAX_STEPS = 20;
const LIGHT_OFF_DELAY_SEC = 120;

export interface DraftContext {
  zone: Zone;
  /** Title chosen by the parent; overrides the AI title. */
  title?: string;
  /** Start automatically when the child enters the room. */
  autoStart: boolean;
}

export interface NormalizedDraft {
  input: MissionInput;
  /** Demo frame index per step id, for steps where Muse picked one. */
  keyFrames: Record<string, number>;
}

/**
 * Turns Muse's draft into a valid mission, enforcing the privacy and safety
 * rules in code rather than trusting the model: no camera checks in private
 * rooms, bounded timeouts and text lengths, and lights only in rooms that have one.
 */
export function normalizeDraft(draft: MissionDraft, ctx: DraftContext): NormalizedDraft {
  const keyFrames: Record<string, number> = {};
  const steps = draft.steps.slice(0, MAX_STEPS).map((raw) => {
    const step = normalizeStep(raw, ctx.zone);
    if (Number.isInteger(raw.keyFrame) && raw.keyFrame >= 0) keyFrames[step.id] = raw.keyFrame;
    return step;
  });

  const useLight = ctx.autoStart && ctx.zone.light !== null;
  const input = missionInputSchema.parse({
    title: clip(ctx.title, 60) || clip(draft.title, 60) || 'New routine',
    zone: ctx.zone.id,
    trigger: ctx.autoStart ? 'zone_enter' : 'manual',
    onStart: useLight ? [{ type: 'light_on', delaySec: 0 }] : [],
    onEnd: useLight ? [{ type: 'light_off', delaySec: LIGHT_OFF_DELAY_SEC }] : [],
    steps,
  });
  return { input, keyFrames };
}

function normalizeStep(raw: DraftStep, zone: Zone): Step {
  const action = clip(raw.action, 80) || 'Next step';
  const full = clip(raw.full, 240) || action;
  const expect = clip(raw.expect, 160);
  const vision = zone.type === 'camera_ok' && raw.check === 'vision' && expect.length > 0;
  return {
    id: newShortId(),
    action,
    object: clip(raw.object, 40) || null,
    prompts: { full, short: clip(raw.short, 80) || clip(action, 80) },
    ifStuck: clip(raw.ifStuck, 240) || full,
    check: vision ? 'vision' : 'tap',
    expect: vision ? expect : null,
    timeoutSec: clampInt(raw.timeoutSec, 20, 300, 60),
    card: null,
    safety: raw.safety
      .map((s) => clip(s, 160))
      .filter((s) => s.length > 0)
      .slice(0, 5),
  };
}

function clip(value: string | undefined, max: number): string {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max).trimEnd() : text;
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}
