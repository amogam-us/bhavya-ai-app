import { describe, expect, it } from 'vitest';
import { applyOutcome, escalate, FADE_AFTER_STREAK, startingLevel } from '../src/engine/prompting';

describe('prompting', () => {
  it('starts at the profile level when a step has no history', () => {
    expect(startingLevel(undefined, 3)).toBe(3);
    expect(startingLevel({ level: 1, streak: 2 }, 3)).toBe(1);
  });

  it('never escalates above level 3', () => {
    expect(escalate(2)).toBe(3);
    expect(escalate(3)).toBe(3);
  });

  it(`fades one level after ${FADE_AFTER_STREAK} independent completions`, () => {
    let stats = applyOutcome(undefined, 3, { neededHelp: false });
    expect(stats).toEqual({ level: 3, streak: 1 });
    stats = applyOutcome(stats, 3, { neededHelp: false });
    stats = applyOutcome(stats, 3, { neededHelp: false });
    expect(stats).toEqual({ level: 2, streak: 0 });
  });

  it('raises the level and resets the streak when help was needed', () => {
    expect(applyOutcome({ level: 1, streak: 2 }, 3, { neededHelp: true })).toEqual({
      level: 2,
      streak: 0,
    });
  });

  it('stays at level 0 without growing the streak forever', () => {
    let stats = { level: 0 as const, streak: 0 };
    for (let i = 0; i < 10; i++)
      stats = applyOutcome(stats, 3, { neededHelp: false }) as typeof stats;
    expect(stats).toEqual({ level: 0, streak: FADE_AFTER_STREAK });
  });
});
