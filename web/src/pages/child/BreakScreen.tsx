import type { ChildProfile } from '@bhavya/shared';
import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { startCalmMusic } from '../../lib/calmMusic';
import { speaker } from '../../lib/speech';

/** Half of the breathing animation length in styles.css. */
const BREATH_PHASE_MS = 5000;

/** A calm, child-chosen pause. Nothing here is timed or measured. */
export function BreakScreen({ profile, onReady }: { profile: ChildProfile; onReady: () => void }) {
  const [breatheIn, setBreatheIn] = useState(true);
  const [music, setMusic] = useState(false);

  useEffect(() => {
    speaker.stop();
    if (!profile.calming.breathing) return;
    const timer = setInterval(() => setBreatheIn((v) => !v), BREATH_PHASE_MS);
    return () => clearInterval(timer);
  }, [profile.calming.breathing]);

  useEffect(() => {
    const ctx = speaker.audioContext;
    if (!music || !ctx) return;
    return startCalmMusic(ctx, profile.volume);
  }, [music, profile.volume]);

  return (
    <div className="break-view">
      <h1>Break time</h1>
      {profile.calming.breathing && (
        <div className="breath" aria-live="polite">
          {breatheIn ? 'Breathe in' : 'Breathe out'}
        </div>
      )}
      {profile.calming.music && speaker.audioContext && (
        <button type="button" className="child-btn" onClick={() => setMusic((m) => !m)}>
          <Icon name={music ? 'pause' : 'play'} size={26} />
          {music ? 'Stop music' : 'Calm music'}
        </button>
      )}
      <button
        type="button"
        className="child-btn done"
        style={{ maxWidth: 420, width: '100%' }}
        onClick={onReady}
      >
        <Icon name="check" size={30} />
        I&apos;m ready
      </button>
    </div>
  );
}
