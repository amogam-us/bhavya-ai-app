import { EventEmitter } from 'node:events';
import {
  findBoardPhrase,
  type CameraPolicy,
  type HomeState,
  type Mission,
  type MissionAction,
  type Notification,
  type NotificationKind,
  type PromptCue,
  type PromptLevel,
  type RunView,
  type Step,
  type Zone,
} from '@bhavya/shared';
import type { Repositories } from '../db/repositories';
import { newId } from '../lib/ids';
import {
  applyOutcome,
  cueForLevel,
  escalate,
  ESCALATIONS_BEFORE_PARENT,
  startingLevel,
} from './prompting';

/** Minimum confidence for a vision check to complete a step by itself. */
export const VISION_CONFIDENCE_THRESHOLD = 0.7;

/** A request that cannot be done in the current home state. Shown to the user as-is. */
export class EngineError extends Error {
  override name = 'EngineError';
}

export type StepConfirmation = 'tap' | 'vision' | 'zone';
type EndReason = 'stopped' | 'left_room' | 'assistant_off';

interface ActiveRun {
  id: string;
  mission: Mission;
  stepIndex: number;
  level: PromptLevel;
  stepStartedAt: number;
  helpRequests: number;
  escalations: number;
  helpRequested: boolean;
  stuckNotified: boolean;
  onBreak: boolean;
  hint: string | null;
  cue: PromptCue;
  timer: NodeJS.Timeout | null;
}

export interface EngineEvents {
  state: [HomeState];
  notification: [Notification];
}

export interface EngineOptions {
  repos: Repositories;
  now?: () => number;
  newId?: () => string;
}

/**
 * The deterministic heart of Bhavya. It owns the home state (room, lights,
 * camera policy) and the running mission, and decides every step change,
 * prompt level and smart-home action. AI results are inputs to it, never
 * commands: Muse can confirm a step, but only this class acts on the home.
 */
export class MissionEngine extends EventEmitter<EngineEvents> {
  private readonly repos: Repositories;
  private readonly now: () => number;
  private readonly makeId: () => string;

  private zoneId: string | null = null;
  private assistantEnabled = true;
  private run: ActiveRun | null = null;
  private lastCompleted: HomeState['lastCompleted'] = null;
  private cueSeq = 0;
  private readonly lights = new Map<string, boolean>();
  private readonly lightTimers = new Map<string, NodeJS.Timeout>();
  /** Light-off actions waiting for the child to leave the room, by zone id. */
  private readonly lightOffWhenLeft = new Map<string, number>();

  constructor(options: EngineOptions) {
    super();
    this.repos = options.repos;
    this.now = options.now ?? Date.now;
    this.makeId = options.newId ?? newId;
  }

  // ---------------------------------------------------------------- queries

  getState(): HomeState {
    const camera = this.cameraPolicy();
    const lights: Record<string, boolean> = {};
    for (const zone of this.zones()) {
      if (zone.light) lights[zone.light] = this.lights.get(zone.light) ?? false;
    }
    return {
      zone: this.zoneId,
      camera,
      assistantEnabled: this.assistantEnabled,
      lights,
      run: this.run ? this.viewRun(this.run, camera) : null,
      lastCompleted: this.lastCompleted,
    };
  }

  /** Privacy gate: the camera is allowed only in a known camera-OK room. */
  cameraPolicy(): CameraPolicy {
    return this.currentZone()?.type === 'camera_ok' ? 'on' : 'off';
  }

  /** The step the camera may watch right now, or null when watching is not allowed. */
  watchableStep(runId: string, stepIndex: number): Step | null {
    const run = this.matchRun(runId, stepIndex);
    return run && this.visionAllowed(run) ? currentStep(run) : null;
  }

  // ------------------------------------------------------- room and devices

  enterZone(zoneId: string): void {
    const zone = this.findZone(zoneId);
    if (!zone) throw new EngineError(`Unknown room "${zoneId}".`);
    if (this.zoneId === zoneId) return;
    if (this.zoneId) this.exitCurrentZone();

    this.zoneId = zoneId;
    if (zone.light) this.cancelLightTimer(zone.light);
    // Publish the new camera policy before anything else happens in the room.
    this.emitState();

    if (this.assistantEnabled && !this.run) {
      const mission = this.repos.missions
        .list()
        .find((m) => m.status === 'approved' && m.trigger === 'zone_enter' && m.zone === zoneId);
      if (mission) {
        this.startRun(mission);
        this.emitState();
      }
    }
  }

  leaveZone(): void {
    if (!this.zoneId) return;
    this.exitCurrentZone();
    this.emitState();
  }

  setLight(device: string, on: boolean): void {
    const zone = this.zones().find((z) => z.light === device);
    if (!zone) throw new EngineError(`Unknown light "${device}".`);
    this.cancelLightTimer(device);
    this.lights.set(device, on);
    this.emitState();
  }

  setAssistant(enabled: boolean): void {
    if (this.assistantEnabled === enabled) return;
    this.assistantEnabled = enabled;
    if (!enabled && this.run) this.endRun(this.run, 'ended', 'assistant_off');
    this.emitState();
  }

  // ---------------------------------------------------------------- missions

  startMission(missionId: string): void {
    if (!this.assistantEnabled) throw new EngineError('The assistant is turned off.');
    if (this.run) throw new EngineError('A routine is already running.');
    const mission = this.repos.missions.get(missionId);
    if (!mission || mission.status !== 'approved') {
      throw new EngineError('This routine is not ready yet.');
    }
    this.startRun(mission);
    this.emitState();
  }

  /** Marks the current step done. Returns false for stale or duplicate requests. */
  stepDone(runId: string, stepIndex: number, confirmedBy: StepConfirmation): boolean {
    const run = this.matchRun(runId, stepIndex);
    if (!run) return false;
    this.completeStep(run, confirmedBy);
    this.emitState();
    return true;
  }

  /** Applies a Muse step check. Returns true if it completed the step. */
  applyVisionCheck(
    runId: string,
    stepIndex: number,
    result: { done: boolean; confidence: number },
  ): boolean {
    if (!this.watchableStep(runId, stepIndex)) return false;
    if (!result.done || result.confidence < VISION_CONFIDENCE_THRESHOLD) return false;
    return this.stepDone(runId, stepIndex, 'vision');
  }

  requestHelp(runId: string | null): void {
    const name = this.profile().name;
    const run = runId ? this.matchRun(runId) : this.run;
    if (!run) {
      this.notify('help', `${name} asked for help.`);
      return;
    }
    const step = currentStep(run);
    run.helpRequests += 1;
    run.helpRequested = true;
    this.repos.runs.addAssistance(run.id, 1, 0);
    this.escalateRun(run);
    this.notify('help', `${name} asked for help with "${step.action}" in "${run.mission.title}".`);
    this.armTimer(run);
    this.emitState();
  }

  setBreak(runId: string, onBreak: boolean): void {
    const run = this.matchRun(runId);
    if (!run || run.onBreak === onBreak) return;
    run.onBreak = onBreak;
    if (onBreak) {
      this.clearTimer(run);
    } else {
      // Replay the current step so the child knows where they are.
      this.setCue(run, cueForLevel(run.level, currentStep(run)));
      this.armTimer(run);
    }
    this.emitState();
  }

  stop(runId: string): void {
    const run = this.matchRun(runId);
    if (!run) return;
    this.endRun(run, 'ended', 'stopped');
    this.emitState();
  }

  boardSay(phraseId: string): void {
    const phrase = findBoardPhrase(phraseId);
    if (!phrase) throw new EngineError('Unknown board phrase.');
    this.notify('board', `${this.profile().name} said "${phrase.label}".`);
  }

  /** Stops all timers. Call when shutting down. */
  dispose(): void {
    if (this.run) this.clearTimer(this.run);
    for (const timer of this.lightTimers.values()) clearTimeout(timer);
    this.lightTimers.clear();
    this.removeAllListeners();
  }

  // --------------------------------------------------------------- internals

  private startRun(mission: Mission): void {
    const run: ActiveRun = {
      id: this.makeId(),
      mission,
      stepIndex: 0,
      level: 3,
      stepStartedAt: this.now(),
      helpRequests: 0,
      escalations: 0,
      helpRequested: false,
      stuckNotified: false,
      onBreak: false,
      hint: null,
      cue: { seq: 0, mode: 'none', text: null },
      timer: null,
    };
    this.repos.runs.create({
      id: run.id,
      missionId: mission.id,
      missionTitle: mission.title,
      totalSteps: mission.steps.length,
      startedAt: this.iso(),
    });
    this.run = run;
    this.runActions(mission, mission.onStart);
    this.beginStep(run);
  }

  private beginStep(run: ActiveRun): void {
    const step = currentStep(run);
    const profileStart = this.profile().startLevel as PromptLevel;
    run.level = startingLevel(this.repos.stats.get(run.mission.id, step.id), profileStart);
    run.stepStartedAt = this.now();
    run.helpRequests = 0;
    run.escalations = 0;
    run.helpRequested = false;
    run.stuckNotified = false;
    run.hint = null;
    this.setCue(run, cueForLevel(run.level, step));
    this.armTimer(run);
  }

  private completeStep(run: ActiveRun, confirmedBy: StepConfirmation): void {
    const step = currentStep(run);
    this.repos.runs.recordStep({
      runId: run.id,
      stepIndex: run.stepIndex,
      stepId: step.id,
      level: run.level,
      helpRequests: run.helpRequests,
      escalations: run.escalations,
      confirmedBy,
      durationMs: Math.max(0, this.now() - run.stepStartedAt),
      completedAt: this.iso(),
    });
    const previous = this.repos.stats.get(run.mission.id, step.id);
    const next = applyOutcome(previous, this.profile().startLevel as PromptLevel, {
      neededHelp: run.helpRequests > 0 || run.escalations > 0,
    });
    this.repos.stats.upsert(run.mission.id, step.id, next);

    run.onBreak = false;
    if (run.stepIndex >= run.mission.steps.length - 1) {
      this.endRun(run, 'completed', null);
      return;
    }
    run.stepIndex += 1;
    this.beginStep(run);
  }

  private endRun(run: ActiveRun, status: 'completed' | 'ended', reason: EndReason | null): void {
    this.clearTimer(run);
    this.repos.runs.end(run.id, status, reason, this.iso());
    this.run = null;
    this.runActions(run.mission, run.mission.onEnd);

    const name = this.profile().name;
    const title = run.mission.title;
    if (status === 'completed') {
      this.lastCompleted = { missionTitle: title, at: this.iso() };
      this.notify('completed', `${name} finished "${title}".`);
      return;
    }
    const where = `step ${run.stepIndex + 1} of ${run.mission.steps.length}`;
    const zoneName = this.findZone(run.mission.zone)?.name.toLowerCase() ?? 'room';
    const messages: Record<EndReason, string> = {
      stopped: `${name} stopped "${title}" at ${where}.`,
      left_room: `"${title}" ended at ${where}: ${name} left the ${zoneName}.`,
      assistant_off: `${name} turned the assistant off during "${title}".`,
    };
    this.notify('ended', messages[reason ?? 'stopped']);
  }

  private exitCurrentZone(): void {
    const leftZoneId = this.zoneId;
    this.zoneId = null;

    const run = this.run;
    if (run && run.mission.zone === leftZoneId) {
      // Leaving during the last step ("leave the room") completes the routine.
      if (run.stepIndex === run.mission.steps.length - 1) this.completeStep(run, 'zone');
      else this.endRun(run, 'ended', 'left_room');
    }

    const zone = leftZoneId ? this.findZone(leftZoneId) : undefined;
    const deferredDelay = leftZoneId ? this.lightOffWhenLeft.get(leftZoneId) : undefined;
    if (zone && deferredDelay !== undefined) {
      this.lightOffWhenLeft.delete(zone.id);
      this.scheduleLight(zone, false, deferredDelay);
    }
  }

  private escalateRun(run: ActiveRun): void {
    const step = currentStep(run);
    run.level = escalate(run.level);
    run.hint = step.ifStuck;
    this.setCue(run, { mode: 'speak', text: step.ifStuck });
  }

  private onStepTimeout(runId: string, stepIndex: number): void {
    const run = this.matchRun(runId, stepIndex);
    if (!run || run.onBreak) return;
    run.timer = null;
    run.escalations += 1;
    this.repos.runs.addAssistance(run.id, 0, 1);
    this.escalateRun(run);
    if (run.escalations >= ESCALATIONS_BEFORE_PARENT && !run.stuckNotified) {
      run.stuckNotified = true;
      const step = currentStep(run);
      this.notify(
        'stuck',
        `${this.profile().name} may need help with "${step.action}" in "${run.mission.title}".`,
      );
    }
    this.armTimer(run);
    this.emitState();
  }

  private armTimer(run: ActiveRun): void {
    this.clearTimer(run);
    if (run.onBreak) return;
    const { id, stepIndex } = run;
    run.timer = setTimeout(
      () => this.onStepTimeout(id, stepIndex),
      currentStep(run).timeoutSec * 1000,
    );
  }

  private clearTimer(run: ActiveRun): void {
    if (run.timer) clearTimeout(run.timer);
    run.timer = null;
  }

  private setCue(run: ActiveRun, cue: Omit<PromptCue, 'seq'>): void {
    this.cueSeq += 1;
    run.cue = { seq: this.cueSeq, ...cue };
  }

  /** Runs allowlisted smart-home actions against the mission room's light. */
  private runActions(mission: Mission, actions: MissionAction[]): void {
    const zone = this.findZone(mission.zone);
    if (!zone?.light) return;
    for (const action of actions) {
      const on = action.type === 'light_on';
      if (!on && this.zoneId === zone.id) {
        // Never darken the room the child is in: wait until they leave.
        this.lightOffWhenLeft.set(zone.id, action.delaySec);
        continue;
      }
      this.scheduleLight(zone, on, action.delaySec);
    }
  }

  private scheduleLight(zone: Zone, on: boolean, delaySec: number): void {
    const device = zone.light;
    if (!device) return;
    this.cancelLightTimer(device);
    if (delaySec === 0) {
      this.switchLight(zone, on);
      return;
    }
    const timer = setTimeout(() => {
      this.lightTimers.delete(device);
      if (this.switchLight(zone, on)) this.emitState();
    }, delaySec * 1000);
    this.lightTimers.set(device, timer);
  }

  /** Returns true when the light changed. */
  private switchLight(zone: Zone, on: boolean): boolean {
    if (!zone.light) return false;
    if (!on && this.zoneId === zone.id) return false;
    if ((this.lights.get(zone.light) ?? false) === on) return false;
    this.lights.set(zone.light, on);
    return true;
  }

  private cancelLightTimer(device: string): void {
    const timer = this.lightTimers.get(device);
    if (timer) clearTimeout(timer);
    this.lightTimers.delete(device);
  }

  private viewRun(run: ActiveRun, camera: CameraPolicy): RunView {
    const step = currentStep(run);
    const visionActive = this.visionAllowed(run, camera);
    return {
      runId: run.id,
      missionId: run.mission.id,
      missionTitle: run.mission.title,
      stepIndex: run.stepIndex,
      totalSteps: run.mission.steps.length,
      step,
      level: run.level,
      onBreak: run.onBreak,
      helpRequested: run.helpRequested,
      visionActive,
      highlightObject: visionActive && run.level >= 3 && step.object !== null,
      hint: run.hint,
      cue: run.cue,
    };
  }

  private visionAllowed(run: ActiveRun, camera: CameraPolicy = this.cameraPolicy()): boolean {
    return (
      camera === 'on' &&
      !run.onBreak &&
      currentStep(run).check === 'vision' &&
      this.findZone(run.mission.zone)?.type === 'camera_ok'
    );
  }

  private matchRun(runId: string, stepIndex?: number): ActiveRun | null {
    const run = this.run;
    if (!run || run.id !== runId) return null;
    if (stepIndex !== undefined && run.stepIndex !== stepIndex) return null;
    return run;
  }

  private notify(kind: NotificationKind, message: string): void {
    const notification: Notification = { id: this.makeId(), kind, message, at: this.iso() };
    this.repos.notifications.add(notification);
    this.emit('notification', notification);
  }

  private emitState(): void {
    this.emit('state', this.getState());
  }

  private zones(): Zone[] {
    return this.repos.settings.getZones();
  }

  private findZone(zoneId: string): Zone | undefined {
    return this.zones().find((z) => z.id === zoneId);
  }

  private currentZone(): Zone | undefined {
    return this.zoneId ? this.findZone(this.zoneId) : undefined;
  }

  private profile() {
    return this.repos.settings.getProfile();
  }

  private iso(): string {
    return new Date(this.now()).toISOString();
  }
}

function currentStep(run: ActiveRun): Step {
  const step = run.mission.steps[run.stepIndex];
  if (!step) throw new Error(`Run ${run.id} has no step ${run.stepIndex}.`);
  return step;
}
