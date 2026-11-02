import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import { speaker, type VoiceOptions } from '../../lib/speech';
import { useRecorder } from '../../lib/useRecorder';

/** A request is a few words; stop listening after this long even without a second tap. */
const MAX_TALK_MS = 10_000;
const REPLY_MS = 8000;
const NOT_REACHED = "I can't hear you right now. Use the pictures.";

interface TalkButtonProps {
  voice: VoiceOptions;
  label?: string;
}

/**
 * Tap to talk, tap again to finish. Muse Voice hears the words and the hub
 * decides what to do; a routine change shows up through the home state, so
 * this button only speaks and shows the hub's short reply.
 */
export function TalkButton({ voice, label = 'Talk' }: TalkButtonProps) {
  const recorder = useRecorder(MAX_TALK_MS);
  const [thinking, setThinking] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const starting = useRef(false);

  useEffect(() => {
    if (!reply) return;
    const timer = setTimeout(() => setReply(null), REPLY_MS);
    return () => clearTimeout(timer);
  }, [reply]);

  const answer = (message: string) => {
    if (!message) return;
    setReply(message);
    speaker.speak(message, voice);
  };

  const talk = async () => {
    if (recorder.status === 'recording') {
      recorder.stop();
      return;
    }
    if (starting.current || thinking || recorder.status === 'processing') return;
    starting.current = true;
    speaker.unlock();
    // Keep the helper's own voice out of the recording.
    speaker.stop();
    setReply(null);
    let wav: string | null;
    try {
      wav = await recorder.start();
    } finally {
      starting.current = false;
    }
    if (!wav) return;

    setThinking(true);
    try {
      answer((await api.voiceRequest(wav)).message);
    } catch {
      answer(NOT_REACHED);
    } finally {
      setThinking(false);
    }
  };

  const listening = recorder.status === 'recording';
  const busy = thinking || recorder.status === 'processing';

  return (
    <>
      <button
        type="button"
        className={`child-btn talk ${listening ? 'is-listening' : ''}`}
        onClick={() => void talk()}
        disabled={busy}
        aria-pressed={listening}
      >
        <Icon name="mic" size={26} />
        {listening ? 'Listening… tap when done' : busy ? 'Thinking…' : label}
      </button>
      {(recorder.error ?? reply) && (
        <p className="talk-reply" role="status" style={{ gridColumn: '1 / -1' }}>
          {recorder.error ?? reply}
        </p>
      )}
    </>
  );
}
