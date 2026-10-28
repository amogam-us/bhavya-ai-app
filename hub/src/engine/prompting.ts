import { MAX_PROMPT_LEVEL, type PromptCue, type PromptLevel, type Step } from '@bhavya/shared';
import type { StepStats } from '../db/repositories';

/** Independent completions in a row before a step needs one level less support. */
export const FADE_AFTER_STREAK = 3;

/** Escalations (timeouts) on one step before the parent is told the child may be stuck. */
export const ESCALATIONS_BEFORE_PARENT = 2;

export function startingLevel(
  stats: StepStats | undefined,
  profileStart: PromptLevel,
): PromptLevel {
  return stats?.level ?? profileStart;
}

export function escalate(level: PromptLevel): PromptLevel {
  return Math.min(MAX_PROMPT_LEVEL, level + 1) as PromptLevel;
}

/**
 * Updates a step's long-term support level after it is completed.
 * Needing help raises the level by one; doing it alone FADE_AFTER_STREAK times
 * in a row lowers it by one.
 */
export function applyOutcome(
  stats: StepStats | undefined,
  profileStart: PromptLevel,
  outcome: { neededHelp: boolean },
): StepStats {
  const base = stats ?? { level: profileStart, streak: 0 };
  if (outcome.neededHelp) return { level: escalate(base.level), streak: 0 };

  const streak = base.streak + 1;
  if (streak >= FADE_AFTER_STREAK && base.level > 0) {
    return { level: (base.level - 1) as PromptLevel, streak: 0 };
  }
  return { level: base.level, streak: Math.min(streak, FADE_AFTER_STREAK) };
}

/** What the child hears when a step starts at the given level. */
export function cueForLevel(level: PromptLevel, step: Step): Omit<PromptCue, 'seq'> {
  switch (level) {
    case 3:
      return { mode: 'speak', text: step.prompts.full };
    case 2:
      return { mode: 'speak', text: step.prompts.short };
    case 1:
      return { mode: 'chime', text: null };
    case 0:
      return { mode: 'none', text: null };
  }
}
