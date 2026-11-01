import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DECLINE_COOLDOWN_MS,
  EngineError,
  MAX_CAMERA_SUGGESTIONS_PER_HOUR,
  PRIVATE_SCAN_PAUSE_MS,
  SUGGESTION_TIMEOUT_MS,
  type SceneResult,
  type VoiceIntent,
} from '../src/engine/engine';
import { createHarness, enableGlassesSuggestions, finishRun, type Harness } from './helpers';

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
      // The object finder is switched off (FEATURES.objectFinder).
      expect(run.highlightObject).toBe(false);
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

  describe('voice requests', () => {
    const ask = (missionId: string, confidence = 0.9): VoiceIntent => ({
      action: 'start_routine',
      missionId,
      confidence,
    });
    const say = (action: VoiceIntent['action']) =>
      h.engine.applyVoiceRequest({ action, missionId: null, confidence: 0.9 }).action;

    it('pauses the current routine for a clear request and offers it again after', () => {
      const pack = h.mission('Pack');
      const restroom = h.mission('Using');
      h.engine.enterZone('living_room');
      h.engine.startMission(pack.id);
      const packRun = h.state().run!;
      h.engine.stepDone(packRun.runId, 0, 'tap');

      expect(h.engine.applyVoiceRequest(ask(restroom.id)).action).toBe('start_routine');
      let state = h.state();
      expect(state.run?.missionTitle).toBe(restroom.title);
      expect(state.paused).toMatchObject({ runId: packRun.runId, stepIndex: 1 });
      // A private-room routine keeps the camera off wherever the child is.
      expect(state.camera).toBe('off');

      finishRun(h);
      state = h.state();
      expect(state.suggestion).toMatchObject({ reason: 'resume', missionId: pack.id });

      h.engine.answerSuggestion(state.suggestion!.id, true);
      state = h.state();
      expect(state.run).toMatchObject({ runId: packRun.runId, stepIndex: 1 });
      expect(state.paused).toBeNull();
      expect(state.suggestion).toBeNull();
    });

    it('asks first when Muse is unsure which routine was meant', () => {
      const pack = h.mission('Pack');
      expect(h.engine.applyVoiceRequest(ask(pack.id, 0.6)).action).toBe('suggest_routine');
      const { suggestion, run } = h.state();
      expect(run).toBeNull();
      expect(suggestion).toMatchObject({ reason: 'voice', missionId: pack.id });

      h.engine.answerSuggestion(suggestion!.id, true);
      expect(h.state().run?.missionId).toBe(pack.id);
    });

    it('does nothing for unclear or unknown requests', () => {
      const pack = h.mission('Pack');
      expect(h.engine.applyVoiceRequest(ask(pack.id, 0.3)).action).toBe('none');
      expect(h.engine.applyVoiceRequest(ask('no-such-routine')).action).toBe('none');
      const none = h.engine.applyVoiceRequest({ action: 'none', missionId: null, confidence: 1 });
      expect(none.action).toBe('none');
      expect(none.message).not.toBe('');
      expect(h.state().run).toBeNull();
      expect(h.state().suggestion).toBeNull();
    });

    it('ends the paused routine when the child does not want to continue', () => {
      h.engine.enterZone('living_room');
      h.engine.startMission(h.mission('Pack').id);
      h.engine.applyVoiceRequest(ask(h.mission('Using').id));
      h.engine.stop(h.state().run!.runId);

      const resume = h.state().suggestion!;
      expect(resume.reason).toBe('resume');
      h.engine.answerSuggestion(resume.id, false);
      expect(h.state().paused).toBeNull();
      expect(h.notifications.at(-1)?.message).toContain('chose not to continue');
    });

    it('picks a paused routine up again when the child asks for it', () => {
      const pack = h.mission('Pack');
      const restroom = h.mission('Using');
      h.engine.startMission(pack.id);
      const packRun = h.state().run!;
      h.engine.applyVoiceRequest(ask(restroom.id));
      h.engine.applyVoiceRequest(ask(pack.id));
      const state = h.state();
      expect(state.run?.runId).toBe(packRun.runId);
      expect(state.paused?.missionId).toBe(restroom.id);
    });

    it('handles done, break, help, stop and continue', () => {
      h.engine.startMission(h.mission('Pack').id);
      expect(say('done')).toBe('done');
      expect(h.state().run?.stepIndex).toBe(1);
      expect(say('break')).toBe('break');
      expect(h.state().run?.onBreak).toBe(true);
      expect(say('help')).toBe('help');
      expect(h.state().run?.helpRequested).toBe(true);
      expect(say('stop')).toBe('stop');
      expect(h.state().run).toBeNull();
      expect(say('continue')).toBe('none');
    });

    it('does not finish a later step when the child spoke during an earlier one', () => {
      h.engine.startMission(h.mission('Pack').id);
      const run = h.state().run!;
      const heardDuring = h.engine.stepRef();
      h.engine.stepDone(run.runId, 0, 'tap');
      h.engine.applyVoiceRequest({ action: 'done', missionId: null, confidence: 0.9 }, heardDuring);
      expect(h.state().run?.stepIndex).toBe(1);
    });

    it('clears paused routines and questions when the assistant is turned off', () => {
      h.engine.startMission(h.mission('Pack').id);
      h.engine.applyVoiceRequest(ask(h.mission('Using').id));
      h.engine.setAssistant(false);
      const state = h.state();
      expect(state.run).toBeNull();
      expect(state.paused).toBeNull();
      expect(state.suggestion).toBeNull();
      expect(h.engine.applyVoiceRequest(ask(h.mission('Pack').id)).action).toBe('none');
    });
  });

  describe('glasses suggestions', () => {
    const sees = (missionId: string | null, confidence = 0.9): SceneResult => ({
      private: false,
      missionId,
      confidence,
    });
    const privatePlace: SceneResult = { private: true, missionId: null, confidence: 0.9 };

    it('stays off until a parent turns it on', () => {
      expect(h.state().scanning).toBe(false);
      expect(h.engine.applyScan(sees(h.mission('Pack').id))).toBe('ignored');
      enableGlassesSuggestions(h);
      expect(h.state().scanning).toBe(true);
    });

    it('only suggests routines in camera-OK rooms', () => {
      enableGlassesSuggestions(h);
      expect(h.engine.sceneCandidates().map((m) => m.id)).toEqual([h.mission('Pack').id]);
      expect(h.engine.applyScan(sees(h.mission('Using').id))).toBe('quiet');
    });

    it('suggests a routine after two matching looks and starts it on yes', () => {
      enableGlassesSuggestions(h);
      const pack = h.mission('Pack');
      expect(h.engine.applyScan(sees(pack.id))).toBe('waiting');
      expect(h.engine.applyScan(sees(pack.id))).toBe('suggested');
      const { suggestion, scanning } = h.state();
      expect(suggestion).toMatchObject({ reason: 'camera', missionId: pack.id });
      expect(scanning).toBe(false);

      h.engine.answerSuggestion(suggestion!.id, true);
      expect(h.state().run?.missionId).toBe(pack.id);
      expect(h.engine.applyScan(sees(pack.id))).toBe('ignored');
    });

    it('needs confident, consecutive looks', () => {
      enableGlassesSuggestions(h);
      const pack = h.mission('Pack');
      expect(h.engine.applyScan(sees(pack.id))).toBe('waiting');
      expect(h.engine.applyScan(sees(null))).toBe('quiet');
      expect(h.engine.applyScan(sees(pack.id))).toBe('waiting');
      expect(h.engine.applyScan(sees(pack.id, 0.6))).toBe('quiet');
    });

    it('waits before suggesting a declined or unanswered routine again', () => {
      enableGlassesSuggestions(h);
      const pack = h.mission('Pack');
      h.engine.applyScan(sees(pack.id));
      h.engine.applyScan(sees(pack.id));
      h.engine.answerSuggestion(h.state().suggestion!.id, false);
      expect(h.engine.sceneCandidates()).toEqual([]);

      vi.advanceTimersByTime(DECLINE_COOLDOWN_MS);
      h.engine.applyScan(sees(pack.id));
      h.engine.applyScan(sees(pack.id));
      expect(h.state().suggestion).not.toBeNull();
      vi.advanceTimersByTime(SUGGESTION_TIMEOUT_MS);
      expect(h.state().suggestion).toBeNull();
      expect(h.engine.sceneCandidates()).toEqual([]);
    });

    it('limits camera suggestions per hour', () => {
      enableGlassesSuggestions(h);
      const pack = h.mission('Pack');
      for (let i = 0; i < MAX_CAMERA_SUGGESTIONS_PER_HOUR; i++) {
        h.engine.applyScan(sees(pack.id));
        expect(h.engine.applyScan(sees(pack.id))).toBe('suggested');
        // Saying yes and then stopping leaves no cooldown, so only the hourly limit applies.
        h.engine.answerSuggestion(h.state().suggestion!.id, true);
        h.engine.stop(h.state().run!.runId);
        vi.advanceTimersByTime(60_000);
      }
      h.engine.applyScan(sees(pack.id));
      expect(h.engine.applyScan(sees(pack.id))).toBe('quiet');
    });

    it('stops looking for ten minutes after seeing a private place', () => {
      enableGlassesSuggestions(h);
      const states: boolean[] = [];
      h.engine.on('state', (s) => states.push(s.scanning));
      expect(h.engine.applyScan(privatePlace)).toBe('private');
      expect(h.state().scanning).toBe(false);
      expect(h.engine.applyScan(sees(h.mission('Pack').id))).toBe('ignored');

      vi.advanceTimersByTime(PRIVATE_SCAN_PAUSE_MS);
      expect(h.state().scanning).toBe(true);
      expect(states.at(-1)).toBe(true);
    });

    it('never looks in a private room or while a routine runs', () => {
      enableGlassesSuggestions(h);
      h.engine.enterZone('bedroom');
      expect(h.state().scanning).toBe(false);
      h.engine.enterZone('living_room');
      expect(h.state().scanning).toBe(true);
      h.engine.startMission(h.mission('Pack').id);
      expect(h.state().scanning).toBe(false);
    });
  });

  describe('trace lines', () => {
    it('explains what happened without repeating itself', () => {
      const lines: string[] = [];
      h.engine.on('trace', (entry) => lines.push(`${entry.kind}: ${entry.message}`));
      h.engine.enterZone('restroom');
      expect(lines).toEqual(
        expect.arrayContaining([
          'sensor: Child is in the Restroom',
          'privacy: Restroom is private → camera off',
          'engine: Routine started: "Using the restroom"',
          'home: Restroom light on',
        ]),
      );

      const count = lines.length;
      h.engine.trace('engine', 'Same line');
      h.engine.trace('engine', 'Same line');
      expect(lines.length).toBe(count + 1);
    });

    it('includes parent notifications', () => {
      const lines: string[] = [];
      h.engine.on('trace', (entry) => lines.push(`${entry.kind}: ${entry.message}`));
      h.engine.requestHelp(null);
      expect(lines).toContain('parent: Notification: Bhavya asked for help.');
    });
  });
});
