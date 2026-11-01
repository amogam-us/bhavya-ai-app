import type {
  CameraPolicy,
  ChildProfile,
  ClientMessage,
  PausedRunView,
  RunView,
} from '@bhavya/shared';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import type { VoiceOptions } from '../../lib/speech';
import { CameraPanel } from './CameraPanel';
import { TalkButton } from './TalkButton';

const STOP_CONFIRM_MS = 3000;

interface RunScreenProps {
  run: RunView;
  /** A routine set aside for this one, offered again when this one ends. */
  paused: PausedRunView | null;
  camera: CameraPolicy;
  profile: ChildProfile;
  voice: VoiceOptions;
  send: (message: ClientMessage) => boolean;
  onRepeat: (text: string) => void;
}

/** One step at a time: picture, words, a big Done button, and gentle ways out. */
export function RunScreen({ run, paused, camera, profile, voice, send, onRepeat }: RunScreenProps) {
  const { step, runId, stepIndex } = run;
  const [pendingStep, setPendingStep] = useState<number | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [visionHint, setVisionHint] = useState<string | null>(null);

  useEffect(() => {
    setPendingStep(null);
    setVisionHint(null);
  }, [stepIndex]);

  useEffect(() => {
    if (!confirmStop) return;
    const timer = setTimeout(() => setConfirmStop(false), STOP_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirmStop]);

  const onHint = useCallback((hint: string | null) => setVisionHint(hint), []);

  const done = () => {
    setPendingStep(stepIndex);
    if (!send({ type: 'step_done', runId, stepIndex })) setPendingStep(null);
  };

  const stop = () => {
    if (!confirmStop) {
      setConfirmStop(true);
      return;
    }
    send({ type: 'stop', runId });
  };

  const prompt = run.level >= 3 ? step.prompts.full : run.level === 2 ? step.prompts.short : null;
  const hint = run.hint ?? visionHint;

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{run.missionTitle}</strong>
        <span className={`privacy-chip ${camera === 'on' ? 'is-on' : 'is-off'}`}>
          <Icon name={camera === 'on' ? 'camera' : 'cameraOff'} size={18} />
          {camera === 'on'
            ? run.visionActive
              ? 'Camera helping'
              : 'Camera allowed'
            : 'Camera off'}
        </span>
      </div>

      <div className="progress-dots" aria-label={`Step ${stepIndex + 1} of ${run.totalSteps}`}>
        {Array.from({ length: run.totalSteps }, (_, i) => (
          <span key={i} className={i < stepIndex ? 'done' : i === stepIndex ? 'current' : ''} />
        ))}
      </div>

      <article className="step-card" aria-live="polite">
        <div className="step-picture">
          {step.card ? (
            <img src={step.card} alt={step.action} />
          ) : (
            <span className="placeholder">{step.action}</span>
          )}
        </div>
        {(profile.showText || !step.card) && <h1 className="step-title">{step.action}</h1>}
        {profile.showText && prompt && <p className="step-prompt">{prompt}</p>}
        {hint && <p className="hint-box">{hint}</p>}
        {step.safety.map((note) => (
          <p key={note} className="safety-note">
            {note}
          </p>
        ))}
        {run.helpRequested && <p className="celebrate">Help is on the way.</p>}
      </article>

      {run.visionActive && <CameraPanel run={run} onHint={onHint} />}

      <div className="child-actions">
        <button
          type="button"
          className="child-btn done"
          onClick={done}
          disabled={pendingStep === stepIndex}
        >
          <Icon name="check" size={34} />
          Done
        </button>
        <TalkButton voice={voice} />
        <button
          type="button"
          className="child-btn"
          onClick={() => onRepeat(hint ?? step.prompts.full)}
        >
          <Icon name="volume" size={26} />
          Say again
        </button>
        <button
          type="button"
          className="child-btn help"
          onClick={() => send({ type: 'help', runId })}
        >
          <Icon name="help" size={26} />
          Help
        </button>
        <button
          type="button"
          className="child-btn"
          onClick={() => send({ type: 'break', runId, onBreak: true })}
        >
          <Icon name="pause" size={26} />
          Break
        </button>
      </div>
      {paused && (
        <p className="small muted" style={{ textAlign: 'center' }}>
          {paused.missionTitle} is waiting for later.
        </p>
      )}
      <button type="button" className="btn btn-ghost btn-md" onClick={stop}>
        <Icon name="stop" size={18} />
        {confirmStop ? 'Tap again to stop this routine' : 'Stop this routine'}
      </button>
    </>
  );
}
