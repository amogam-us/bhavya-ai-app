import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EngineError } from '../src/engine/engine';
import { createHarness, finishRun, type Harness } from './helpers';

describe('MissionEngine', () => {
  let h: Harness;

  beforeEach(() => {
    vi.useFakeTimers();
    h = createHarness();
  });

  afterEach(() => {
    h.engine.dispose();
    vi.useRealTimers();
  });

  describe('privacy gate', () => {
    it('keeps the camera off while the room is unknown', () => {
      expect(h.state().camera).toBe('off');
    });

    it('turns the camera off in a private room and starts its routine with the light on', () => {
      h.engine.enterZone('restroom');
      const state = h.state();
      expect(state.camera).toBe('off');
      expect(state.lights.restroom_light).toBe(true);
      expect(state.run?.missionTitle).toBe('Using the restroom');
      expect(state.run?.visionActive).toBe(false);
    });

    it('publishes the camera-off state before the routine starts', () => {
      const states: { camera: string; hasRun: boolean }[] = [];
      h.engine.on('state', (s) => states.push({ camera: s.camera, hasRun: s.run !== null }));
      h.engine.enterZone('living_room');
      h.engine.enterZone('restroom');
      expect(states.at(-2)).toEqual({ camera: 'off', hasRun: false });
      expect(states.at(-1)).toEqual({ camera: 'off', hasRun: true });
    });

    it('allows vision only in camera-OK rooms', () => {
      h.engine.enterZone('living_room');
      h.engine.startMission(h.mission('Pack').id);
      const run = h.state().run!;
      expect(run.visionActive).toBe(true);
      expect(run.highlightObject).toBe(true);
      expect(h.engine.watchableStep(run.runId, run.stepIndex)).not.toBeNull();

      h.engine.setBreak(run.runId, true);
      expect(h.state().run?.visionActive).toBe(false);
      expect(h.engine.watchableStep(run.runId, run.stepIndex)).toBeNull();
      h.engine.setBreak(run.runId, false);

      h.engine.enterZone('bedroom');
      expect(h.state().camera).toBe('off');
      expect(h.state().run).toBeNull();
      expect(h.engine.watchableStep(run.runId, run.stepIndex)).toBeNull();
    });
  });

  describe('steps', () => {
    it('advances once per step and ignores stale or duplicate taps', () => {
      h.engine.enterZone('restroom');
      const run = h.state().run!;
      expect(h.engine.stepDone(run.runId, 0, 'tap')).toBe(true);
      expect(h.engine.stepDone(run.runId, 0, 'tap')).toBe(false);
      expect(h.engine.stepDone('other-run', 1, 'tap')).toBe(false);
      expect(h.state().run?.stepIndex).toBe(1);
    });

    it('speaks the full prompt at level 3 with a new cue for every step', () => {
      h.engine.enterZone('restroom');
      const first = h.state().run!;
      expect(first.level).toBe(3);
      expect(first.cue).toMatchObject({ mode: 'speak', text: first.step.prompts.full });
      h.engine.stepDone(first.runId, 0, 'tap');
      expect(h.state().run!.cue.seq).toBeGreaterThan(first.cue.seq);
    });

    it('completes the routine and notifies the parent', () => {
      h.engine.enterZone('restroom');
      finishRun(h);
      expect(h.state().run).toBeNull();
      expect(h.state().lastCompleted?.missionTitle).toBe('Using the restroom');
      expect(h.notifications.at(-1)?.kind).toBe('completed');
      expect(h.repos.runs.recent(1)[0]).toMatchObject({ status: 'completed', stepsDone: 8 });
    });
  });

  describe('getting stuck', () => {
    it('escalates with the simpler hint on timeout and tells the parent after two', () => {
      h.engine.enterZone('restroom');
      const step = h.state().run!.step;

      vi.advanceTimersByTime(step.timeoutSec * 1000);
      let run = h.state().run!;
      expect(run.hint).toBe(step.ifStuck);
      expect(run.cue).toMatchObject({ mode: 'speak', text: step.ifStuck });
      expect(h.notifications.filter((n) => n.kind === 'stuck')).toHaveLength(0);

      vi.advanceTimersByTime(step.timeoutSec * 1000);
      run = h.state().run!;
      expect(h.notifications.filter((n) => n.kind === 'stuck')).toHaveLength(1);

      vi.advanceTimersByTime(step.timeoutSec * 1000);
      expect(h.notifications.filter((n) => n.kind === 'stuck')).toHaveLength(1);
      expect(run.runId).toBe(h.state().run!.runId);
    });

    it('notifies the parent when the child asks for help', () => {
      h.engine.enterZone('restroom');
      const run = h.state().run!;
      h.engine.requestHelp(run.runId);
      expect(h.state().run!.helpRequested).toBe(true);
      expect(h.state().run!.hint).toBe(run.step.ifStuck);
      expect(h.notifications.at(-1)).toMatchObject({ kind: 'help' });
      expect(h.notifications.at(-1)!.message).toContain(run.step.action);
    });

    it('accepts help requests outside a routine', () => {
      h.engine.requestHelp(null);
      expect(h.notifications.at(-1)).toMatchObject({
        kind: 'help',
        message: 'Bhavya asked for help.',
      });
    });

    it('pauses the step timer during a break', () => {
      h.engine.enterZone('restroom');
      const run = h.state().run!;
      h.engine.setBreak(run.runId, true);
      vi.advanceTimersByTime(run.step.timeoutSec * 3000);
      expect(h.state().run!.hint).toBeNull();

      h.engine.setBreak(run.runId, false);
      expect(h.state().run!.cue.seq).toBeGreaterThan(run.cue.seq);
      vi.advanceTimersByTime(run.step.timeoutSec * 1000);
      expect(h.state().run!.hint).toBe(run.step.ifStuck);
    });
  });

  describe('adaptive prompting', () => {
    it('fades a step after three independent completions and raises it after help', () => {
      const mission = h.mission('Pack');
      h.engine.enterZone('living_room');
      for (let i = 0; i < 3; i++) {
        h.engine.startMission(mission.id);
        finishRun(h);
      }
      h.engine.startMission(mission.id);
      const run = h.state().run!;
      expect(run.level).toBe(2);
      expect(run.cue).toMatchObject({ mode: 'speak', text: run.step.prompts.short });
      expect(run.highlightObject).toBe(false);

      h.engine.requestHelp(run.runId);
      h.engine.stepDone(run.runId, 0, 'tap');
      finishRun(h);
      expect(h.repos.stats.get(mission.id, run.step.id)).toEqual({ level: 3, streak: 0 });
    });
  });

  describe('leaving the room', () => {
    it('ends the routine early and tells the parent where it stopped', () => {
      h.engine.enterZone('restroom');
      const run = h.state().run!;
      h.engine.stepDone(run.runId, 0, 'tap');
      h.engine.leaveZone();
      expect(h.state().run).toBeNull();
      expect(h.notifications.at(-1)).toMatchObject({ kind: 'ended' });
      expect(h.notifications.at(-1)!.message).toContain('step 2 of 8');
    });

    it('completes the routine when the child leaves during the last step', () => {
      h.engine.enterZone('restroom');
      const run = h.state().run!;
      for (let i = 0; i < run.totalSteps - 1; i++) h.engine.stepDone(run.runId, i, 'tap');
      h.engine.leaveZone();
      expect(h.notifications.at(-1)?.kind).toBe('completed');
    });

    it('never switches the light off while the child is still in the room', () => {
      h.engine.enterZone('restroom');
      finishRun(h);
      vi.advanceTimersByTime(10 * 60_000);
      expect(h.state().lights.restroom_light).toBe(true);

      h.engine.leaveZone();
      vi.advanceTimersByTime(119_000);
      expect(h.state().lights.restroom_light).toBe(true);
      vi.advanceTimersByTime(1_000);
      expect(h.state().lights.restroom_light).toBe(false);
    });

    it('keeps the light on when the child comes back before it switches off', () => {
      h.engine.enterZone('restroom');
      h.engine.leaveZone();
      vi.advanceTimersByTime(60_000);
      h.engine.enterZone('restroom');
      vi.advanceTimersByTime(10 * 60_000);
      expect(h.state().lights.restroom_light).toBe(true);
    });
  });

  describe('control', () => {
    it('only starts approved routines, one at a time', () => {
      const mission = h.mission('Pack');
      h.repos.missions.update({ ...mission, status: 'draft' });
      expect(() => h.engine.startMission(mission.id)).toThrow(EngineError);

      h.engine.enterZone('restroom');
      h.repos.missions.update({ ...mission, status: 'approved' });
      expect(() => h.engine.startMission(mission.id)).toThrow('already running');
    });

    it('turning the assistant off ends the routine and stops automatic starts', () => {
      h.engine.enterZone('restroom');
      h.engine.setAssistant(false);
      expect(h.state().run).toBeNull();
      h.engine.leaveZone();
      h.engine.enterZone('restroom');
      expect(h.state().run).toBeNull();
      expect(() => h.engine.startMission(h.mission('Pack').id)).toThrow('turned off');
    });

    it('completes a vision step only with enough confidence', () => {
      h.engine.enterZone('living_room');
      h.engine.startMission(h.mission('Pack').id);
      const run = h.state().run!;
      expect(h.engine.applyVisionCheck(run.runId, 0, { done: true, confidence: 0.5 })).toBe(false);
      expect(h.engine.applyVisionCheck(run.runId, 0, { done: false, confidence: 0.9 })).toBe(false);
      expect(h.engine.applyVisionCheck(run.runId, 0, { done: true, confidence: 0.9 })).toBe(true);
      expect(h.state().run!.stepIndex).toBe(1);
    });

    it('rejects unknown rooms and lights', () => {
      expect(() => h.engine.enterZone('garage')).toThrow(EngineError);
      expect(() => h.engine.setLight('garage_light', true)).toThrow(EngineError);
    });
  });
});
