import { EventEmitter } from 'node:events';
import {
  FEATURES,
  findBoardPhrase,
  type CameraPolicy,
  type HomeState,
  type Mission,
  type MissionAction,
  type Notification,
  type NotificationKind,
  type PausedRunView,
  type PromptCue,
  type PromptLevel,
  type RunView,
  type ScanOutcome,
  type Step,
  type SuggestionReason,
  type SuggestionView,
  type VoiceAction,
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
/** Minimum confidence to act on what Muse heard or saw. */
export const INTENT_CONFIDENCE = 0.75;
/** A spoken routine request between this and INTENT_CONFIDENCE is asked about instead. */
export const MAYBE_CONFIDENCE = 0.5;
/** By default the glasses stop looking around for this long after seeing a private place. */
export const PRIVATE_SCAN_PAUSE_MS = 10 * 60_000;
/** A routine the child said no to is not suggested again for this long. */
export const DECLINE_COOLDOWN_MS = 15 * 60_000;
/** Camera and voice suggestions disappear if not answered in this time. */
export const SUGGESTION_TIMEOUT_MS = 60_000;
export const MAX_CAMERA_SUGGESTIONS_PER_HOUR = 4;
/** The same trace line is not repeated within this time. */
const TRACE_REPEAT_MS = 60_000;

const NOT_UNDERSTOOD = "Sorry, I didn't understand. Try again, or use the pictures.";
const HELPER_RESTING = 'The helper is resting. Turn it on to start a routine.';

/** A request that cannot be done in the current home state. Shown to the user as-is. */
export class EngineError extends Error {
  override name = 'EngineError';
}

export type StepConfirmation = 'tap' | 'vision' | 'zone' | 'voice';
type EndReason = 'stopped' | 'left_room' | 'assistant_off' | 'not_resumed' | 'replaced';

/** Who or what a trace line is about. */
export type TraceKind = 'sensor' | 'privacy' | 'home' | 'engine' | 'muse' | 'child' | 'parent';

/** One line explaining what the hub noticed or decided. */
export interface TraceEntry {
  kind: TraceKind;
  message: string;
  at: string;
}

/** What Muse understood from the child's words. The engine decides what to do with it. */
export interface VoiceIntent {
  action: 'start_routine' | 'continue' | 'help' | 'stop' | 'break' | 'done' | 'none';
  missionId: string | null;
  confidence: number;
}

export interface StepRef {
  runId: string;
  stepIndex: number;
}

/** What happened. An empty message means a step prompt plays instead, so nothing extra is said. */
export interface VoiceOutcome {
  action: VoiceAction;
  message: string;
}

/** What Muse saw in an idle glasses frame. */
export interface SceneResult {
  private: boolean;
  missionId: string | null;
  confidence: number;
}

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

interface Suggestion extends SuggestionView {
  timer: NodeJS.Timeout | null;
}

export interface EngineEvents {
  state: [HomeState];
  notification: [Notification];
  trace: [TraceEntry];
}

export interface EngineOptions {
  repos: Repositories;
  now?: () => number;
  newId?: () => string;
  /** False turns off finding routines with the glasses camera (hub option). Default true. */
  glassesSuggestions?: boolean;
  /** How long looking around pauses after a private place (hub option). */
  privatePauseMs?: number;
}

/**
 * The deterministic heart of Bhavya. It owns the home state (room, lights,
 * camera policy) and the routines (one active, at most one paused), and decides
 * every step change, prompt level, suggestion and smart-home action. AI results
 * are inputs to it, never commands: Muse can confirm a step, report what a child
 * asked for or what the glasses see, but only this class acts on them.
 */
export class MissionEngine extends EventEmitter<EngineEvents> {
  private readonly repos: Repositories;
  private readonly now: () => number;
  private readonly makeId: () => string;
  private readonly suggestionsAvailable: boolean;
  private readonly privatePauseMs: number;

  private zoneId: string | null = null;
  private assistantEnabled = true;
  private run: ActiveRun | null = null;
  private paused: ActiveRun | null = null;
  private suggestion: Suggestion | null = null;
  private lastCompleted: HomeState['lastCompleted'] = null;
  private cueSeq = 0;
  private readonly lights = new Map<string, boolean>();
  private readonly lightTimers = new Map<string, NodeJS.Timeout>();
  /** Light-off actions waiting for the child to leave the room, by zone id. */
  private readonly lightOffWhenLeft = new Map<string, number>();

  // Glasses suggestions.
  private privateUntil = 0;
  private privateTimer: NodeJS.Timeout | null = null;
  private lastSceneMissionId: string | null = null;
  private cameraSuggestionTimes: number[] = [];
  private readonly declinedUntil = new Map<string, number>();
  private lastTrace: TraceEntry | null = null;

  constructor(options: EngineOptions) {
    super();
    this.repos = options.repos;
    this.now = options.now ?? Date.now;
    this.makeId = options.newId ?? newId;
    this.suggestionsAvailable = options.glassesSuggestions ?? true;
    this.privatePauseMs = options.privatePauseMs ?? PRIVATE_SCAN_PAUSE_MS;
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
      paused: this.paused ? viewPaused(this.paused) : null,
      suggestion: this.suggestion ? viewSuggestion(this.suggestion) : null,
      scanning: this.scanAllowed(),
      lastCompleted: this.lastCompleted,
    };
  }

  /**
   * Privacy gate for routine steps: the camera is allowed only in a known
   * camera-OK room, and never while a routine for a private room runs.
   */
  cameraPolicy(): CameraPolicy {
    if (this.run && this.findZone(this.run.mission.zone)?.type === 'private') return 'off';
    return this.currentZone()?.type === 'camera_ok' ? 'on' : 'off';
  }

  /**
   * Privacy gate for glasses suggestions: only when a parent turned them on, no
   * routine or question is waiting, the child is not in a known private room,
   * and the glasses have not just seen a private place.
   */
  scanAllowed(): boolean {
    if (!this.suggestionsAvailable || !this.assistantEnabled || this.run || this.suggestion) {
      return false;
    }
    if (!this.profile().glassesSuggestions) return false;
    if (this.currentZone()?.type === 'private') return false;
    return this.now() >= this.privateUntil;
  }

  /** The step the camera may watch right now, or null when watching is not allowed. */
  watchableStep(runId: string, stepIndex: number): Step | null {
    const run = this.matchRun(runId, stepIndex);
    return run && this.visionAllowed(run) ? currentStep(run) : null;
  }

  /** Routines a spoken request may refer to. */
  voiceCandidates(): Mission[] {
    return this.repos.missions.list().filter((m) => m.status === 'approved');
  }

  /** Routines the glasses may suggest: approved, in camera-OK rooms, not recently declined. */
  sceneCandidates(): Mission[] {
    return this.voiceCandidates().filter(
      (m) => this.findZone(m.zone)?.type === 'camera_ok' && !this.isDeclined(m.id),
    );
  }

  /** Re-publishes the state, for example after settings changed. */
  refresh(): void {
    this.emitState();
  }

  /**
   * Explains what a sensor reported, what Muse answered or what the engine
   * decided, as a 'trace' event (the hub writes it to its debug log). It never
   * changes behaviour.
   */
  trace(kind: TraceKind, message: string): void {
    const last = this.lastTrace;
    const repeated =
      last?.kind === kind &&
      last.message === message &&
      this.now() - Date.parse(last.at) < TRACE_REPEAT_MS;
    if (repeated) return;
    const entry: TraceEntry = { kind, message, at: this.iso() };
    this.lastTrace = entry;
    this.emit('trace', entry);
  }

  // ------------------------------------------------------- room and devices

  enterZone(zoneId: string): void {
    const zone = this.findZone(zoneId);
    if (!zone) throw new EngineError(`Unknown room "${zoneId}".`);
    if (this.zoneId === zoneId) return;
    if (this.zoneId) this.exitCurrentZone();

    this.zoneId = zoneId;
    if (zone.light) this.cancelLightTimer(zone.light);
    this.trace('sensor', `Child is in the ${zone.name}`);
    this.trace(
      'privacy',
      zone.type === 'private'
        ? `${zone.name} is private → camera off`
        : `${zone.name} allows the camera`,
    );
    // Publish the new camera policy before anything else happens in the room.
    this.emitState();

    if (this.assistantEnabled && !this.run) {
      const mission = this.repos.missions
        .list()
        .find((m) => m.status === 'approved' && m.trigger === 'zone_enter' && m.zone === zoneId);
      if (mission) {
        this.trace('engine', `Room rule: the ${zone.name} starts "${mission.title}"`);
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
    if ((this.lights.get(device) ?? false) !== on) {
      this.trace('home', `${zone.name} light ${on ? 'on' : 'off'} (switched by hand)`);
    }
    this.lights.set(device, on);
    this.emitState();
  }

  setAssistant(enabled: boolean): void {
    if (this.assistantEnabled === enabled) return;
    this.assistantEnabled = enabled;
    this.trace('child', enabled ? 'Turned the helper on' : 'Turned the helper off');
    if (!enabled) {
      this.clearSuggestion();
      if (this.run) this.endRun(this.run, 'ended', 'assistant_off');
      this.endPaused('assistant_off');
    }
    this.emitState();
  }

  // ---------------------------------------------------------------- missions

  startMission(missionId: string): void {
    if (!this.assistantEnabled) throw new EngineError('The assistant is turned off.');
    if (this.run) throw new EngineError('A routine is already running.');
    const mission = this.approvedMission(missionId);
    if (!mission) throw new EngineError('This routine is not ready yet.');
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
    this.trace('child', `Asked for help with "${step.action}"`);
    this.escalateRun(run);
    this.trace('engine', `More support: simpler hint (level ${run.level})`);
    this.notify('help', `${name} asked for help with "${step.action}" in "${run.mission.title}".`);
    this.armTimer(run);
    this.emitState();
  }

  setBreak(runId: string, onBreak: boolean): void {
    const run = this.matchRun(runId);
    if (!run || run.onBreak === onBreak) return;
    run.onBreak = onBreak;
    this.trace('child', onBreak ? 'Took a break (step timer paused)' : 'Back from the break');
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
    this.trace('child', `Stopped "${run.mission.title}"`);
    this.endRun(run, 'ended', 'stopped');
    this.emitState();
  }

  boardSay(phraseId: string): void {
    const phrase = findBoardPhrase(phraseId);
    if (!phrase) throw new EngineError('Unknown board phrase.');
    this.notify('board', `${this.profile().name} said "${phrase.label}".`);
  }

  // ------------------------------------------------------------- suggestions

  /** The child answered a suggestion. Stale answers are ignored. */
  answerSuggestion(suggestionId: string, accept: boolean): void {
    const suggestion = this.suggestion;
    if (!suggestion || suggestion.id !== suggestionId) return;
    this.clearSuggestion();
    this.trace('child', `Answered "${accept ? 'Yes' : 'Not now'}" to "${suggestion.prompt}"`);
    if (suggestion.reason === 'resume') {
      if (accept) this.resumePaused();
      else this.endPaused('not_resumed');
    } else if (accept) {
      const mission = this.approvedMission(suggestion.missionId);
      if (mission && this.assistantEnabled) this.switchTo(mission);
    } else {
      this.declinedUntil.set(suggestion.missionId, this.now() + DECLINE_COOLDOWN_MS);
      this.trace('engine', `Won't suggest "${suggestion.missionTitle}" again for 15 minutes`);
      this.offerResume();
    }
    this.emitState();
  }

  /** The running routine and step, so a spoken "done" can be matched to the step it was said in. */
  stepRef(): StepRef | null {
    return this.run ? { runId: this.run.id, stepIndex: this.run.stepIndex } : null;
  }

  /**
   * Acts on a spoken request. Clear requests act at once (the child asked); a
   * routine request Muse is unsure about becomes a yes/no question instead.
   * `heardDuring` is the step that was showing when the child spoke.
   */
  applyVoiceRequest(
    intent: VoiceIntent,
    heardDuring: StepRef | null = this.stepRef(),
  ): VoiceOutcome {
    const run = this.run;
    if (intent.action === 'help') {
      this.requestHelp(run?.id ?? null);
      return { action: 'help', message: run ? '' : 'Okay. I am getting help for you.' };
    }
    if (!this.assistantEnabled) return { action: 'none', message: HELPER_RESTING };

    switch (intent.action) {
      case 'stop':
        if (!run) return { action: 'none', message: 'There is nothing to stop.' };
        this.stop(run.id);
        return { action: 'stop', message: 'Okay, we stopped.' };
      case 'break':
        if (!run) return { action: 'none', message: 'Okay. Rest as long as you like.' };
        this.setBreak(run.id, true);
        return { action: 'break', message: "Okay, let's take a break." };
      case 'done':
        if (!heardDuring)
          return { action: 'none', message: 'There is no step to finish right now.' };
        // Already moved on (for example a tap while Muse listened): nothing more to do.
        this.stepDone(heardDuring.runId, heardDuring.stepIndex, 'voice');
        return { action: 'done', message: '' };
      case 'continue':
        if (run || !this.paused)
          return { action: 'none', message: 'There is nothing to continue.' };
        this.resumePaused();
        this.emitState();
        return { action: 'continue', message: '' };
      case 'start_routine':
        return this.voiceStart(intent);
      case 'none':
        return { action: 'none', message: NOT_UNDERSTOOD };
    }
  }

  /**
   * Applies what Muse saw in an idle glasses frame. A private place pauses the
   * glasses; a routine is only offered after the same confident answer twice.
   */
  applyScan(result: SceneResult): ScanOutcome {
    if (!this.scanAllowed()) return 'ignored';
    if (result.private) {
      this.lastSceneMissionId = null;
      this.pauseScanning();
      const minutes = Math.round(this.privatePauseMs / 60_000);
      this.trace(
        'privacy',
        `Private place seen → glasses stop looking for ${minutes} minute${minutes === 1 ? '' : 's'}`,
      );
      this.emitState();
      return 'private';
    }
    const mission = result.missionId
      ? this.sceneCandidates().find((m) => m.id === result.missionId)
      : undefined;
    if (!mission || result.confidence < INTENT_CONFIDENCE) {
      this.lastSceneMissionId = null;
      return 'quiet';
    }
    if (this.lastSceneMissionId !== mission.id) {
      this.lastSceneMissionId = mission.id;
      this.trace('engine', 'Needs the same answer from the next look before asking');
      return 'waiting';
    }
    const hourAgo = this.now() - 3_600_000;
    this.cameraSuggestionTimes = this.cameraSuggestionTimes.filter((t) => t > hourAgo);
    if (this.cameraSuggestionTimes.length >= MAX_CAMERA_SUGGESTIONS_PER_HOUR) {
      this.trace('engine', 'Hourly suggestion limit reached → stay quiet');
      return 'quiet';
    }
    this.cameraSuggestionTimes.push(this.now());
    this.lastSceneMissionId = null;
    this.suggest(mission, 'camera');
    this.emitState();
    return 'suggested';
  }

  /** Stops all timers. Call when shutting down. */
  dispose(): void {
    if (this.run) this.clearTimer(this.run);
    this.clearSuggestion();
    if (this.privateTimer) clearTimeout(this.privateTimer);
    for (const timer of this.lightTimers.values()) clearTimeout(timer);
    this.lightTimers.clear();
    this.removeAllListeners();
  }

  // --------------------------------------------------------------- internals

  private voiceStart(intent: VoiceIntent): VoiceOutcome {
    const mission = intent.missionId ? this.approvedMission(intent.missionId) : undefined;
    if (!mission || intent.confidence < MAYBE_CONFIDENCE) {
      return { action: 'none', message: NOT_UNDERSTOOD };
    }
    if (this.run?.mission.id === mission.id) {
      return { action: 'none', message: `We are already doing ${mission.title}.` };
    }
    if (intent.confidence < INTENT_CONFIDENCE) {
      this.suggest(mission, 'voice');
      this.emitState();
      return { action: 'suggest_routine', message: '' };
    }
    this.switchTo(mission);
    this.emitState();
    return { action: 'start_routine', message: '' };
  }

  /** Starts a routine, setting the current one aside if needed. */
  private switchTo(mission: Mission): void {
    const current = this.run;
    if (current?.mission.id === mission.id) return;
    // Asking for the paused routine again picks it up where it stopped.
    const waiting = this.paused?.mission.id === mission.id ? this.paused : null;
    if (waiting) this.paused = null;
    if (current) this.pauseRun(current);
    if (waiting) this.continueRun(waiting);
    else this.startRun(mission);
  }

  private pauseRun(run: ActiveRun): void {
    this.trace(
      'engine',
      `Pausing "${run.mission.title}" at step ${run.stepIndex + 1}/${run.mission.steps.length}: it waits for later`,
    );
    this.clearTimer(run);
    // Only one routine waits at a time.
    this.endPaused('replaced');
    run.onBreak = false;
    this.paused = run;
    this.run = null;
  }

  private resumePaused(): void {
    const run = this.paused;
    if (!run || this.run) return;
    this.paused = null;
    this.continueRun(run);
  }

  /** Makes a paused routine the active one again, replaying its current step. */
  private continueRun(run: ActiveRun): void {
    this.clearSuggestion();
    this.trace(
      'engine',
      `Continuing "${run.mission.title}" at step ${run.stepIndex + 1}/${run.mission.steps.length}`,
    );
    this.run = run;
    run.stepStartedAt = this.now();
    this.setCue(run, cueForLevel(run.level, currentStep(run)));
    this.armTimer(run);
  }

  private endPaused(reason: EndReason): void {
    const run = this.paused;
    if (!run) return;
    this.paused = null;
    this.repos.runs.end(run.id, 'ended', reason, this.iso());
    this.runActions(run.mission, run.mission.onEnd);
    this.notify('ended', this.endMessage(run, reason));
  }

  private suggest(mission: Mission, reason: SuggestionReason): void {
    this.clearSuggestion();
    const prompt =
      reason === 'resume'
        ? `Do you want to continue ${mission.title}?`
        : `Do you want to do ${mission.title}?`;
    const suggestion: Suggestion = {
      id: this.makeId(),
      missionId: mission.id,
      missionTitle: mission.title,
      reason,
      prompt,
      timer: null,
    };
    // A paused routine waits for an answer; guesses expire.
    if (reason !== 'resume') {
      suggestion.timer = setTimeout(
        () => this.expireSuggestion(suggestion.id),
        SUGGESTION_TIMEOUT_MS,
      );
    }
    this.suggestion = suggestion;
    this.trace('engine', `Ask the child first: "${prompt}"`);
  }

  private expireSuggestion(suggestionId: string): void {
    const suggestion = this.suggestion;
    if (!suggestion || suggestion.id !== suggestionId) return;
    this.suggestion = null;
    this.trace('engine', 'No answer in 60 seconds → counts as "not now"');
    // No answer counts as "not now".
    this.declinedUntil.set(suggestion.missionId, this.now() + DECLINE_COOLDOWN_MS);
    this.offerResume();
    this.emitState();
  }

  private clearSuggestion(): void {
    if (this.suggestion?.timer) clearTimeout(this.suggestion.timer);
    this.suggestion = null;
  }

  private offerResume(): void {
    if (this.paused && !this.run && this.assistantEnabled)
      this.suggest(this.paused.mission, 'resume');
  }

  private pauseScanning(): void {
    this.privateUntil = this.now() + this.privatePauseMs;
    if (this.privateTimer) clearTimeout(this.privateTimer);
    this.privateTimer = setTimeout(() => {
      this.privateTimer = null;
      this.trace('privacy', 'Glasses may look around again');
      this.emitState();
    }, this.privatePauseMs);
  }

  private isDeclined(missionId: string): boolean {
    return (this.declinedUntil.get(missionId) ?? 0) > this.now();
  }

  private startRun(mission: Mission): void {
    // A new routine replaces any open question; a paused routine is offered again after it.
    this.clearSuggestion();
    this.lastSceneMissionId = null;
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
    this.trace('engine', `Routine started: "${mission.title}"`);
    if (this.findZone(mission.zone)?.type === 'private') {
      this.trace('privacy', 'Routine for a private room → the camera stays off');
    }
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
    this.trace(
      'engine',
      `Step ${run.stepIndex + 1}/${run.mission.steps.length}: ${step.action} (support level ${run.level})`,
    );
    this.setCue(run, cueForLevel(run.level, step));
    this.armTimer(run);
  }

  private completeStep(run: ActiveRun, confirmedBy: StepConfirmation): void {
    const step = currentStep(run);
    const how: Record<StepConfirmation, [TraceKind, string]> = {
      tap: ['child', `Tapped Done: "${step.action}"`],
      vision: ['engine', `Camera check passed → "${step.action}" done`],
      voice: ['child', `Said it is done: "${step.action}"`],
      zone: ['engine', `Left the room during the last step → "${step.action}" done`],
    };
    this.trace(...how[confirmedBy]);
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

    if (status === 'completed') {
      const title = run.mission.title;
      this.trace('engine', `Routine finished ✓ "${title}"`);
      this.lastCompleted = { missionTitle: title, at: this.iso() };
      this.notify('completed', `${this.profile().name} finished "${title}".`);
    } else {
      this.notify('ended', this.endMessage(run, reason ?? 'stopped'));
    }
    if (reason !== 'assistant_off') this.offerResume();
  }

  private endMessage(run: ActiveRun, reason: EndReason): string {
    const name = this.profile().name;
    const title = run.mission.title;
    const where = `step ${run.stepIndex + 1} of ${run.mission.steps.length}`;
    const zoneName = this.findZone(run.mission.zone)?.name.toLowerCase() ?? 'room';
    const messages: Record<EndReason, string> = {
      stopped: `${name} stopped "${title}" at ${where}.`,
      left_room: `"${title}" ended at ${where}: ${name} left the ${zoneName}.`,
      assistant_off: `${name} turned the assistant off during "${title}".`,
      not_resumed: `${name} chose not to continue "${title}" (paused at ${where}).`,
      replaced: `"${title}" was set aside at ${where} for another routine.`,
    };
    return messages[reason];
  }

  private exitCurrentZone(): void {
    const leftZoneId = this.zoneId;
    this.zoneId = null;
    const left = leftZoneId ? this.findZone(leftZoneId) : undefined;
    if (left) this.trace('sensor', `Child left the ${left.name}`);

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
    this.trace(
      'engine',
      `No progress on "${currentStep(run).action}" → simpler hint (level ${run.level})`,
    );
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
        this.trace('home', `${zone.name} light stays on until the child leaves`);
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
    this.trace('home', `${zone.name} light ${on ? 'on' : 'off'}`);
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
      highlightObject:
        FEATURES.objectFinder && visionActive && run.level >= 3 && step.object !== null,
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

  private approvedMission(missionId: string): Mission | undefined {
    const mission = this.repos.missions.get(missionId);
    return mission?.status === 'approved' ? mission : undefined;
  }

  private notify(kind: NotificationKind, message: string): void {
    const notification: Notification = { id: this.makeId(), kind, message, at: this.iso() };
    this.repos.notifications.add(notification);
    this.trace('parent', `Notification: ${message}`);
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

function viewPaused(run: ActiveRun): PausedRunView {
  return {
    runId: run.id,
    missionId: run.mission.id,
    missionTitle: run.mission.title,
    stepIndex: run.stepIndex,
    totalSteps: run.mission.steps.length,
  };
}

function viewSuggestion(suggestion: Suggestion): SuggestionView {
  const { id, missionId, missionTitle, reason, prompt } = suggestion;
  return { id, missionId, missionTitle, reason, prompt };
}
