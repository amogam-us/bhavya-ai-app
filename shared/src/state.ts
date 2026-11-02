import type { PromptLevel, Step } from './domain';

export type CameraPolicy = 'on' | 'off';

/** What the child app should play when a step starts or changes. */
export interface PromptCue {
  /** Increments every time a new cue should be played. */
  seq: number;
  mode: 'speak' | 'chime' | 'none';
  text: string | null;
}

export interface RunView {
  runId: string;
  missionId: string;
  missionTitle: string;
  stepIndex: number;
  totalSteps: number;
  step: Step;
  level: PromptLevel;
  onBreak: boolean;
  helpRequested: boolean;
  /** True when the camera may watch this step (camera-OK room, vision check, not on break). */
  visionActive: boolean;
  /** True when the next object should be highlighted automatically. */
  highlightObject: boolean;
  /** Simpler hint shown after the child got stuck or asked for help. */
  hint: string | null;
  cue: PromptCue;
}

/** Why Bhavya is offering a routine. */
/** camera/voice/resume offer a routine; calm offers a quiet break. */
export type SuggestionReason = 'camera' | 'voice' | 'resume' | 'calm';

/** A routine Bhavya offers; it only starts when the child answers yes. */
export interface SuggestionView {
  id: string;
  missionId: string;
  missionTitle: string;
  reason: SuggestionReason;
  /** The question shown and spoken to the child. */
  prompt: string;
}

/** A routine set aside so another one could run, waiting to be continued. */
export interface PausedRunView {
  runId: string;
  missionId: string;
  missionTitle: string;
  stepIndex: number;
  totalSteps: number;
}

/** Where a room device may support the child right now (Calm support). */
export interface SupportView {
  /** The room whose device should listen, or null when no room is being supported. */
  room: string | null;
  /** True when that room's camera may also look for signs of distress. */
  camera: boolean;
}

export interface HomeState {
  zone: string | null;
  camera: CameraPolicy;
  assistantEnabled: boolean;
  lights: Record<string, boolean>;
  run: RunView | null;
  paused: PausedRunView | null;
  suggestion: SuggestionView | null;
  /** True while the glasses camera may look around to suggest a routine. */
  scanning: boolean;
  /** The child is on a quiet break outside a routine (Calm support or "I need a break"). */
  calmBreak: boolean;
  support: SupportView;
  lastCompleted: { missionTitle: string; at: string } | null;
}

export type NotificationKind = 'help' | 'stuck' | 'completed' | 'ended' | 'board' | 'support';

export interface Notification {
  id: string;
  kind: NotificationKind;
  message: string;
  at: string;
}
