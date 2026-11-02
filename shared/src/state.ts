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
export type SuggestionReason = 'camera' | 'voice' | 'resume';

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
  lastCompleted: { missionTitle: string; at: string } | null;
}

export type NotificationKind = 'help' | 'stuck' | 'completed' | 'ended' | 'board';

export interface Notification {
  id: string;
  kind: NotificationKind;
  message: string;
  at: string;
}
