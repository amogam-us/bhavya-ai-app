import { MAX_DEMO_FRAMES } from '@bhavya/shared';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button, Card, ErrorNotice, Field, Notice, PageHeader, Spinner } from '../../components/ui';
import { api, ApiError, errorMessage } from '../../lib/api';
import { demoFrames } from '../../lib/demoFrames';
import { extractVideoFrames } from '../../lib/media';
import { useLoader } from '../../lib/useLoader';
import { useRecorder } from '../../lib/useRecorder';

type Mode = 'text' | 'demo';
type RecordTarget = 'instructions' | 'narration';

const DEMO_FRAMES = { min: 4, max: Math.min(16, MAX_DEMO_FRAMES) };

export function NewMissionPage() {
  const navigate = useNavigate();
  const settings = useLoader(() => api.settings(), []);
  const zones = settings.data?.zones ?? [];

  const [zoneId, setZoneId] = useState('');
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<Mode>('text');
  const [instructions, setInstructions] = useState('');
  const [narration, setNarration] = useState('');
  const [video, setVideo] = useState<File | null>(null);
  const [usedVoice, setUsedVoice] = useState(false);

  const recorder = useRecorder();
  const [recordTarget, setRecordTarget] = useState<RecordTarget | null>(null);
  const [transcribing, setTranscribing] = useState(false);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; details?: string[] } | null>(null);

  const zone = zones.find((z) => z.id === zoneId) ?? zones[0];
  const isPrivate = zone?.type === 'private';
  const activeMode: Mode = isPrivate ? 'text' : mode;

  const toggleRecording = async (target: RecordTarget) => {
    if (recorder.status === 'recording') {
      recorder.stop();
      return;
    }
    setRecordTarget(target);
    const wav = await recorder.start();
    if (!wav) {
      setRecordTarget(null);
      return;
    }
    setTranscribing(true);
    try {
      const { transcript } = await api.transcribe(wav);
      if (!transcript) {
        setError({ message: 'Muse did not hear any words. Try again a little closer.' });
        return;
      }
      const append = (text: string) => (text ? `${text.trimEnd()}\n${transcript}` : transcript);
      if (target === 'instructions') setInstructions(append);
      else setNarration(append);
      setUsedVoice(true);
    } catch (e) {
      setError({ message: errorMessage(e) });
    } finally {
      setTranscribing(false);
      setRecordTarget(null);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!zone) return;
    setError(null);
    try {
      if (activeMode === 'text') {
        setBusy('Muse is turning your instructions into steps…');
        const { mission } = await api.draftFromText({
          zone: zone.id,
          instructions,
          title: title.trim() || undefined,
          source: usedVoice ? 'voice' : 'text',
        });
        navigate(`/parent/missions/${mission.id}`);
        return;
      }
      if (!video) return;
      setBusy('Reading the video…');
      const frames = await extractVideoFrames(video, DEMO_FRAMES, (done, total) =>
        setBusy(`Reading the video… ${done} of ${total} frames`),
      );
      setBusy('Muse is watching your demonstration…');
      const { mission, keyFrames } = await api.draftFromDemo({
        zone: zone.id,
        frames,
        narration: narration.trim() || undefined,
        title: title.trim() || undefined,
      });
      demoFrames.set(mission.id, frames, keyFrames);
      navigate(`/parent/missions/${mission.id}`);
    } catch (e) {
      setError({
        message: errorMessage(e),
        details: e instanceof ApiError ? e.details : undefined,
      });
    } finally {
      setBusy(null);
    }
  };

  const recordButton = (target: RecordTarget) => {
    const recordingThis = recorder.status === 'recording' && recordTarget === target;
    const processingThis =
      (recorder.status === 'processing' || transcribing) && recordTarget === target;
    return (
      <Button
        icon={recordingThis ? 'stop' : 'mic'}
        variant={recordingThis ? 'danger' : 'secondary'}
        busy={processingThis}
        disabled={!!busy || (recorder.status !== 'idle' && recordTarget !== target)}
        onClick={() => void toggleRecording(target)}
      >
        {recordingThis ? 'Stop recording' : processingThis ? 'Listening…' : 'Speak instead'}
      </Button>
    );
  };

  const canSubmit =
    !!zone && !busy && (activeMode === 'text' ? instructions.trim().length >= 3 : !!video);

  return (
    <>
      <PageHeader
        title="New routine"
        subtitle="Muse drafts the steps. You review and approve them before your child sees anything."
      />
      {settings.loading && <Spinner label="Loading rooms…" />}
      <ErrorNotice error={settings.error} />

      {zone && (
        <form className="stack" onSubmit={(e) => void submit(e)}>
          <Card className="stack">
            <div className="grid-2">
              <Field label="Room">
                <select value={zone.id} onChange={(e) => setZoneId(e.target.value)}>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} {z.type === 'private' ? '(private, camera off)' : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Name (optional)" hint="Leave empty and Muse will suggest one.">
                <input
                  type="text"
                  value={title}
                  maxLength={60}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Brushing teeth"
                />
              </Field>
            </div>

            <div className="segmented" role="group" aria-label="How do you want to teach?">
              <button
                type="button"
                aria-pressed={activeMode === 'text'}
                onClick={() => setMode('text')}
              >
                <Icon name="list" size={16} /> Write or speak
              </button>
              <button
                type="button"
                aria-pressed={activeMode === 'demo'}
                disabled={isPrivate}
                onClick={() => setMode('demo')}
              >
                <Icon name="video" size={16} /> Show with a video
              </button>
            </div>
            {isPrivate && (
              <Notice tone="info">
                The {zone.name.toLowerCase()} is private, so it is taught with words only. No video
                is ever used there.
              </Notice>
            )}
          </Card>

          {activeMode === 'text' ? (
            <Card className="stack">
              <h2>Describe the routine</h2>
              <Field
                label="Steps in your own words"
                hint="Mention the objects your child uses and anything that often goes wrong."
              >
                <textarea
                  value={instructions}
                  rows={6}
                  maxLength={4000}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Take the toothbrush from the blue cup, put a little toothpaste on it, brush top and bottom teeth, spit, rinse the brush and put it back."
                />
              </Field>
              <div className="row">{recordButton('instructions')}</div>
            </Card>
          ) : (
            <Card className="stack">
              <h2>Show the routine</h2>
              <p className="muted small">
                Record yourself doing the routine once, slowly, with the glasses or a phone. 30 to
                90 seconds works best. Muse picks the steps and the objects from the video.
              </p>
              <Field label="Video">
                <input
                  type="file"
                  accept="video/*"
                  capture="environment"
                  onChange={(e) => setVideo(e.target.files?.[0] ?? null)}
                />
              </Field>
              <Field label="What you said while showing it (optional)">
                <textarea
                  value={narration}
                  rows={3}
                  maxLength={4000}
                  onChange={(e) => setNarration(e.target.value)}
                  placeholder="First I open the bag on the table, then the pencil case goes in…"
                />
              </Field>
              <div className="row">{recordButton('narration')}</div>
            </Card>
          )}

          <ErrorNotice error={recorder.error} />
          <ErrorNotice error={error?.message ?? null} details={error?.details} />

          <div className="row">
            <Button
              type="submit"
              variant="primary"
              icon="sparkle"
              busy={!!busy}
              disabled={!canSubmit}
            >
              Create draft with Muse
            </Button>
            {busy && <span className="muted">{busy}</span>}
          </div>
        </form>
      )}
    </>
  );
}
