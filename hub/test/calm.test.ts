import { DEFAULT_PROFILE } from '@bhavya/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalmMonitor, SOUND_GAP_MS } from '../src/engine/calm';
import {
  CALM_DECLINE_COOLDOWN_MS,
  CALM_OFFER_COOLDOWN_MS,
  MissionEngine,
} from '../src/engine/engine';
import { createHarness, type Harness } from './helpers';

const rules = { enabled: true, loudSeconds: 10, loudLevel: 75, watchDistress: true };
const upset = { distress: true, signs: 'crying, covering ears', confidence: 0.9 };
const calmLook = { distress: false, signs: '', confidence: 0.9 };

describe('CalmMonitor', () => {
  let clock = 0;
  const monitor = () => new CalmMonitor(() => clock);
  beforeEach(() => {
    clock = 0;
  });

  /** Reports one loudness level per second for `seconds` seconds. */
  const loud = (m: CalmMonitor, level: number, seconds: number) => {
    let trigger = null;
    for (let i = 0; i <= seconds; i++) {
      trigger = m.sound(level, rules) ?? trigger;
      clock += 1000;
    }
    return trigger;
  };

  it('offers a break only after it stays loud long enough', () => {
    const m = monitor();
    expect(loud(m, 90, 8)).toBeNull();
    expect(loud(m, 90, 3)).toEqual({ kind: 'loud', seconds: 10 });
  });

  it('starts counting again after a quiet moment or a gap in reports', () => {
    const m = monitor();
    loud(m, 90, 8);
    m.sound(20, rules);
    expect(loud(m, 90, 8)).toBeNull();
    clock += SOUND_GAP_MS + 1;
    expect(loud(m, 90, 8)).toBeNull();
  });

  it('needs distress in two looks in a row', () => {
    const m = monitor();
    expect(m.distress(upset)).toBe('watching');
    expect(m.distress(upset)).toEqual({ kind: 'distress', signs: 'crying, covering ears' });
    expect(m.distress(upset)).toBe('watching');
    expect(m.distress(calmLook)).toBeNull();
    expect(m.distress(upset)).toBe('watching');
    expect(m.distress({ ...upset, confidence: 0.5 })).toBeNull();
  });

  it('stays quiet while snoozed', () => {
    const m = monitor();
    m.snooze(60_000);
    expect(loud(m, 90, 20)).toBeNull();
    m.distress(upset);
    expect(m.distress(upset)).toBe('snoozed');
    clock += 60_000;
    expect(loud(m, 90, 11)).toEqual({ kind: 'loud', seconds: 10 });
  });
});

describe('Calm support in the engine', () => {
  let h: Harness;

  beforeEach(() => {
    vi.useFakeTimers();
    h = createHarness();
    h.repos.settings.saveProfile({ ...h.repos.settings.getProfile(), calmSupport: rules });
  });

  afterEach(() => {
    h.engine.dispose();
    vi.useRealTimers();
  });

  /** One loudness report per second, like a room device. */
  const loudFor = (room: string, seconds: number, level = 90) => {
    for (let i = 0; i <= seconds; i++) {
      h.engine.applyRoomSound(room, level);
      vi.advanceTimersByTime(1000);
    }
  };

  it('is off until a parent turns it on', () => {
    h.repos.settings.saveProfile({
      ...h.repos.settings.getProfile(),
      calmSupport: { ...rules, enabled: false },
    });
    h.engine.enterZone('living_room');
    expect(h.state().support).toEqual({ room: null, camera: false });
    loudFor('living_room', 12);
    expect(h.state().suggestion).toBeNull();
  });

  it('supports only the camera-OK room the child is in, never a private room', () => {
    h.engine.enterZone('living_room');
    expect(h.state().support).toEqual({ room: 'living_room', camera: true });
    loudFor('kitchen', 12);
    expect(h.state().suggestion).toBeNull();

    h.engine.enterZone('bedroom');
    expect(h.state().support).toEqual({ room: null, camera: false });
    loudFor('bedroom', 12);
    expect(h.state().suggestion).toBeNull();
    expect(h.engine.applyDistress('bedroom', upset)).toBe('ignored');
  });

  it('offers a quiet break after it stays very loud, and tells the parent', () => {
    h.engine.enterZone('living_room');
    loudFor('living_room', 11);
    const suggestion = h.state().suggestion;
    expect(suggestion).toMatchObject({
      reason: 'calm',
      prompt: "It's very loud. Do you want a quiet break?",
    });
    expect(h.notifications.at(-1)).toMatchObject({ kind: 'support' });
    expect(h.notifications.at(-1)?.message).toContain('very loud for 10 seconds');

    h.engine.answerSuggestion(suggestion!.id, true);
    expect(h.state().calmBreak).toBe(true);
    expect(h.state().support.room).toBeNull();
    h.engine.endCalmBreak();
    expect(h.state().calmBreak).toBe(false);
  });

  it('offers a break after distress is seen twice, and waits after an offer', () => {
    h.engine.enterZone('living_room');
    expect(h.engine.applyDistress('living_room', upset)).toBe('watching');
    expect(h.engine.applyDistress('living_room', upset)).toBe('offered');
    expect(h.state().suggestion).toMatchObject({
      reason: 'calm',
      prompt: 'Do you want a quiet break?',
    });
    expect(h.notifications.at(-1)?.message).toContain('crying, covering ears');

    // No answer: the question goes away, and no new offer comes before the cooldown.
    vi.advanceTimersByTime(60_000);
    expect(h.state().suggestion).toBeNull();
    h.engine.applyDistress('living_room', upset);
    expect(h.engine.applyDistress('living_room', upset)).toBe('ignored');
    vi.advanceTimersByTime(CALM_OFFER_COOLDOWN_MS);
    h.engine.applyDistress('living_room', upset);
    expect(h.engine.applyDistress('living_room', upset)).toBe('offered');
  });

  it('waits longer after the child says "Not now"', () => {
    h.engine.enterZone('living_room');
    loudFor('living_room', 11);
    h.engine.answerSuggestion(h.state().suggestion!.id, false);
    vi.advanceTimersByTime(CALM_OFFER_COOLDOWN_MS);
    loudFor('living_room', 11);
    expect(h.state().suggestion).toBeNull();
    vi.advanceTimersByTime(CALM_DECLINE_COOLDOWN_MS);
    loudFor('living_room', 11);
    expect(h.state().suggestion?.reason).toBe('calm');
  });

  it('uses the routine break when a routine is running', () => {
    h.engine.enterZone('living_room');
    h.engine.startMission(h.mission('Pack').id);
    loudFor('living_room', 11);
    h.engine.answerSuggestion(h.state().suggestion!.id, true);
    expect(h.state().run?.onBreak).toBe(true);
    expect(h.state().calmBreak).toBe(false);
  });

  it('starts a quiet break when the child asks for one with no routine running', () => {
    const outcome = h.engine.applyVoiceRequest({
      action: 'break',
      missionId: null,
      confidence: 0.9,
    });
    expect(outcome.action).toBe('break');
    expect(h.state().calmBreak).toBe(true);
    expect(h.state().scanning).toBe(false);
  });

  it('stops looking for distress when only loudness is allowed', () => {
    h.repos.settings.saveProfile({
      ...h.repos.settings.getProfile(),
      calmSupport: { ...rules, watchDistress: false },
    });
    h.engine.enterZone('living_room');
    expect(h.state().support).toEqual({ room: 'living_room', camera: false });
    expect(h.engine.applyDistress('living_room', upset)).toBe('ignored');
  });

  it('is off for the whole hub when the hub option turns it off', () => {
    const engine = new MissionEngine({ repos: h.repos, calmSupport: false });
    engine.enterZone('living_room');
    expect(engine.getState().support).toEqual({ room: null, camera: false });
    engine.dispose();
  });

  it('keeps working profiles saved before Calm support existed', () => {
    const older: Record<string, unknown> = { ...DEFAULT_PROFILE };
    delete older.calmSupport;
    h.repos.settings.saveProfile(older as typeof DEFAULT_PROFILE);
    expect(h.repos.settings.getProfile().calmSupport.enabled).toBe(false);
  });
});
