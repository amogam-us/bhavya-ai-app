import type { BoardPhraseId, ChildProfile, HomeState, Mission } from '@bhavya/shared';
import { DEFAULT_PROFILE } from '@bhavya/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { speaker, type VoiceOptions } from '../../lib/speech';
import { useHome, type HomeConnection } from '../../lib/useHome';
import { useLoader } from '../../lib/useLoader';
import { Board } from './Board';
import { BreakScreen } from './BreakScreen';
import { IdleScanner } from './IdleScanner';
import { RunScreen } from './RunScreen';
import { SuggestionCard } from './SuggestionCard';
import { TalkButton } from './TalkButton';

/** How long the "you finished" message stays on the home screen. */
const CELEBRATE_MS = 2 * 60_000;

export function ChildApp() {
  const home = useHome('child');
  const settings = useLoader(() => api.settings(), []);
  const board = useLoader(() => api.board(), []);
  const options = useLoader(() => api.options(), []);
  const cameraDebug = options.data?.cameraDebug ?? false;
  // "?camera=off" (the simulator's phone preview) shows the screens without using a camera,
  // so a second camera cannot interfere with the child's real phone or glasses.
  const [cameraHere] = useState(
    () => new URLSearchParams(window.location.search).get('camera') !== 'off',
  );
  const profile = settings.data?.profile ?? DEFAULT_PROFILE;
  const [started, setStarted] = useState(false);

  const voice: VoiceOptions = {
    rate: profile.speechRate,
    volume: profile.volume,
    language: profile.language,
  };
  const say = (text: string) => speaker.speak(text, voice);

  usePromptCues(started, home.state, profile);

  const start = () => {
    speaker.unlock();
    setStarted(true);
    if (!home.state?.run) say(`Hi ${profile.name}!`);
  };

  const sayPhrase = (id: BoardPhraseId, label: string) => {
    say(label);
    home.send({ type: 'board_say', phraseId: id });
  };

  return (
    <div className="child">
      {!home.connected && <div className="child-banner">Connecting to home…</div>}
      {home.error && <div className="child-banner">{home.error}</div>}

      {!started ? (
        <div className="child-gate">
          <div>
            <h1>Hi {profile.name}!</h1>
            <p>Tap to start your helper.</p>
            <button type="button" className="btn btn-primary btn-lg" onClick={start}>
              Start
            </button>
          </div>
        </div>
      ) : !home.state ? (
        <div className="child-gate">
          <Spinner label="Connecting to home…" />
        </div>
      ) : home.state.run?.onBreak || home.state.calmBreak ? (
        <BreakScreen
          profile={profile}
          onReady={() => {
            const runId = home.state?.run?.runId;
            if (runId) home.send({ type: 'break', runId, onBreak: false });
            else home.send({ type: 'calm_end' });
          }}
        />
      ) : (
        <main className="child-main">
          {home.state.suggestion ? (
            <SuggestionCard suggestion={home.state.suggestion} send={home.send} onSpeak={say} />
          ) : home.state.run ? (
            <RunScreen
              run={home.state.run}
              paused={home.state.paused}
              camera={home.state.camera}
              profile={profile}
              voice={voice}
              cameraDebug={cameraDebug}
              cameraHere={cameraHere}
              send={home.send}
              onRepeat={say}
            />
          ) : (
            <HomeScreen
              home={home}
              profile={profile}
              voice={voice}
              cameraDebug={cameraDebug}
              cameraHere={cameraHere}
              icons={board.data?.icons ?? {}}
              onSay={sayPhrase}
            />
          )}
        </main>
      )}
    </div>
  );
}

/** Plays each new prompt cue from the hub exactly once. */
function usePromptCues(started: boolean, state: HomeState | null, profile: ChildProfile) {
  const lastSeq = useRef<number | null>(null);
  const cue = state?.run?.cue;
  const hasRun = !!state?.run;

  useEffect(() => {
    if (!started || !cue || cue.seq === lastSeq.current) return;
    lastSeq.current = cue.seq;
    if (cue.mode === 'speak' && cue.text) {
      speaker.speak(cue.text, {
        rate: profile.speechRate,
        volume: profile.volume,
        language: profile.language,
      });
    } else if (cue.mode === 'chime') {
      speaker.chime(profile.volume);
    }
  }, [started, cue, profile]);

  useEffect(() => {
    if (!hasRun) speaker.stop();
  }, [hasRun]);
}

interface HomeScreenProps {
  home: HomeConnection;
  profile: ChildProfile;
  voice: VoiceOptions;
  cameraDebug: boolean;
  cameraHere: boolean;
  icons: Record<string, string>;
  onSay: (id: BoardPhraseId, label: string) => void;
}

function HomeScreen(props: HomeScreenProps) {
  const { home, profile, voice, cameraDebug, cameraHere, icons, onSay } = props;
  const missions = useLoader(() => api.missions(), []);
  const state = home.state;
  const [now, setNow] = useState(() => Date.now());
  const refreshNow = useCallback(() => setNow(Date.now()), []);

  useEffect(() => {
    const timer = setInterval(refreshNow, 15_000);
    return () => clearInterval(timer);
  }, [refreshNow]);

  if (!state) return null;
  const ready: Mission[] = (missions.data ?? []).filter((m) => m.status === 'approved');
  const finished =
    state.lastCompleted && now - new Date(state.lastCompleted.at).getTime() < CELEBRATE_MS
      ? state.lastCompleted
      : null;

  if (!state.assistantEnabled) {
    return (
      <div className="step-card">
        <h1 className="step-title">Helper is resting</h1>
        <p className="step-prompt">Turn it back on whenever you like.</p>
        <button
          type="button"
          className="child-btn done"
          onClick={() => home.send({ type: 'set_assistant', enabled: true })}
        >
          <Icon name="play" size={28} />
          Turn helper on
        </button>
      </div>
    );
  }

  return (
    <>
      <h1 className="step-title" style={{ textAlign: 'center' }}>
        Hi {profile.name}!
      </h1>
      {finished && <p className="celebrate">You finished {finished.missionTitle}!</p>}
      {state.scanning &&
        (cameraHere ? (
          <IdleScanner debug={cameraDebug} />
        ) : (
          <p className="camera-elsewhere">
            👓 The glasses are looking around on the child&apos;s phone
          </p>
        ))}
      <div className="talk-row">
        <TalkButton voice={voice} label="Tell me what you need" />
      </div>

      <section className="stack" aria-label="Routines">
        <h2>What do you want to do?</h2>
        {missions.loading && <Spinner />}
        <div className="mission-picker">
          {ready.map((mission) => {
            const picture = mission.steps.find((s) => s.card)?.card;
            return (
              <button
                key={mission.id}
                type="button"
                className="mission-tile"
                onClick={() => home.send({ type: 'start_mission', missionId: mission.id })}
              >
                <div className="step-picture">
                  {picture ? (
                    <img src={picture} alt="" />
                  ) : (
                    <span className="placeholder">{mission.title}</span>
                  )}
                </div>
                {mission.title}
              </button>
            );
          })}
        </div>
      </section>

      <section className="stack" aria-label="Talk with pictures">
        <h2>Tell someone</h2>
        <Board icons={icons} showText={profile.showText} onSay={onSay} />
        <div className="board-actions">
          <button
            type="button"
            className="child-btn help"
            onClick={() => home.send({ type: 'help', runId: null })}
          >
            <Icon name="help" size={26} />I need help
          </button>
          <button
            type="button"
            className="child-btn"
            onClick={() => home.send({ type: 'set_assistant', enabled: false })}
          >
            <Icon name="pause" size={26} />
            Pause helper
          </button>
        </div>
      </section>
    </>
  );
}
