import type { Mission, MissionInput, MissionSource, Step, Zone } from '@bhavya/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Badge, Button, ErrorNotice, Field, Notice, Spinner } from '../../components/ui';
import { api, ApiError, errorMessage } from '../../lib/api';
import { demoFrames } from '../../lib/demoFrames';
import { cropImage, readFileAsDataUrl } from '../../lib/media';
import { useLoader } from '../../lib/useLoader';
import { StepEditor, type StepTab } from './StepEditor';
import { StepFlow } from './StepFlow';
import { StepList } from './StepList';

const LIGHT_OFF_DELAY_SEC = 120;
const FULL_IMAGE = { x: 0, y: 0, width: 1, height: 1, confidence: 1 };

const SOURCE_LABELS: Record<MissionSource, string> = {
  text: 'your instructions',
  voice: 'your voice',
  demo: 'a video',
  seed: 'the demo set',
};

function toInput(mission: Mission): MissionInput {
  const { title, zone, trigger, onStart, onEnd, steps } = mission;
  return { title, zone, trigger, onStart, onEnd, steps };
}

/** Removes blank optional values the way the hub expects them. */
function sanitize(input: MissionInput): MissionInput {
  return {
    ...input,
    title: input.title.trim(),
    steps: input.steps.map((s) => ({
      ...s,
      object: s.object?.trim() || null,
      expect: s.check === 'vision' ? s.expect?.trim() || null : null,
      safety: s.safety.map((x) => x.trim()).filter(Boolean),
    })),
  };
}

function newStep(): Step {
  return {
    id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    action: 'New step',
    object: null,
    prompts: { full: 'Say exactly what to do.', short: 'Short reminder.' },
    ifStuck: 'A simpler explanation with a clue.',
    check: 'tap',
    expect: null,
    timeoutSec: 60,
    card: null,
    safety: [],
  };
}

/** Applies a room change, keeping the routine valid for the new room. */
function withZone(input: MissionInput, zone: Zone): MissionInput {
  const privateRoom = zone.type === 'private';
  return {
    ...input,
    zone: zone.id,
    onStart: zone.light ? input.onStart : [],
    onEnd: zone.light ? input.onEnd : [],
    steps: privateRoom
      ? input.steps.map((s) => ({ ...s, check: 'tap' as const, expect: null }))
      : input.steps,
  };
}

interface UiError {
  message: string;
  details?: string[];
}

export function MissionEditorPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const loader = useLoader(() => api.mission(id), [id]);
  const settings = useLoader(() => api.settings(), []);
  const zones = useMemo(() => settings.data?.zones ?? [], [settings.data]);

  const [saved, setSaved] = useState<Mission | null>(null);
  const [form, setForm] = useState<MissionInput | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cardBusy, setCardBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<UiError | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<StepTab>('say');
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!loader.data) return;
    setSaved(loader.data);
    setForm(toInput(loader.data));
  }, [loader.data]);

  const dirty = useMemo(
    () => !!form && !!saved && JSON.stringify(form) !== JSON.stringify(toInput(saved)),
    [form, saved],
  );

  if (loader.error || settings.error) {
    return <ErrorNotice error={loader.error ?? settings.error} />;
  }
  if (loader.loading || settings.loading || !form || !saved) {
    return <Spinner label="Loading routine…" />;
  }

  const zone = zones.find((z) => z.id === form.zone);
  const selectedIndex = Math.max(
    0,
    form.steps.findIndex((s) => s.id === selectedId),
  );
  const selectedStep = form.steps[selectedIndex];
  const cover = form.steps.find((s) => s.card)?.card ?? null;
  const cameraAllowed = zone?.type === 'camera_ok';
  const savedStepIds = new Set(saved.steps.map((s) => s.id));
  const hasLightOn = form.onStart.some((a) => a.type === 'light_on');
  const hasLightOff = form.onEnd.some((a) => a.type === 'light_off');

  const fail = (e: unknown) =>
    setError({ message: errorMessage(e), details: e instanceof ApiError ? e.details : undefined });

  const update = (patch: Partial<MissionInput>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const updateStep = (index: number, patch: Partial<Step>) =>
    setForm((f) =>
      f ? { ...f, steps: f.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) } : f,
    );
  const moveStep = (index: number, direction: -1 | 1) =>
    setForm((f) => {
      if (!f) return f;
      const steps = [...f.steps];
      const target = index + direction;
      if (target < 0 || target >= steps.length) return f;
      [steps[index], steps[target]] = [steps[target]!, steps[index]!];
      return { ...f, steps };
    });
  const removeStep = (index: number) => {
    if (form.steps.length <= 1) return;
    // Keep a neighbouring step selected.
    const neighbour = form.steps[index + 1] ?? form.steps[index - 1];
    setSelectedId(neighbour?.id ?? null);
    setForm((f) =>
      f && f.steps.length > 1 ? { ...f, steps: f.steps.filter((_, i) => i !== index) } : f,
    );
  };
  const addStep = () => {
    const step = newStep();
    setForm((f) => (f ? { ...f, steps: [...f.steps, step] } : f));
    setSelectedId(step.id);
    setTab('say');
  };

  /** Accepts a mission from the hub after a card change, without losing unsaved edits. */
  const applyCard = (mission: Mission, stepId: string) => {
    const card = mission.steps.find((s) => s.id === stepId)?.card ?? null;
    setSaved(mission);
    setForm((f) =>
      f ? { ...f, steps: f.steps.map((s) => (s.id === stepId ? { ...s, card } : s)) } : f,
    );
  };

  const withCardBusy = async (stepId: string, work: () => Promise<Mission>) => {
    setCardBusy((set) => new Set(set).add(stepId));
    setError(null);
    try {
      applyCard(await work(), stepId);
    } catch (e) {
      fail(e);
    } finally {
      setCardBusy((set) => {
        const next = new Set(set);
        next.delete(stepId);
        return next;
      });
    }
  };

  const makeCard = (stepId: string) => withCardBusy(stepId, () => api.makeCard(id, stepId));

  const cardFromDemo = (step: Step) =>
    withCardBusy(step.id, async () => {
      const frame = demoFrames.frameFor(id, step.id);
      if (!frame || !step.object) throw new Error('No video frame for this step.');
      const { boxes } = await api.findObject(step.object, frame);
      const best = boxes[0];
      if (!best) throw new Error(`Could not find the ${step.object} in your video.`);
      return api.uploadCard(id, step.id, await cropImage(frame, best));
    });

  const uploadCard = (stepId: string, file: File) =>
    withCardBusy(stepId, async () => {
      const image = await cropImage(await readFileAsDataUrl(file), FULL_IMAGE, 0);
      return api.uploadCard(id, stepId, image);
    });

  const save = async (): Promise<Mission | null> => {
    setError(null);
    setMessage(null);
    try {
      const mission = await api.updateMission(id, sanitize(form));
      setSaved(mission);
      setForm(toInput(mission));
      return mission;
    } catch (e) {
      fail(e);
      return null;
    }
  };

  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    try {
      await work();
    } finally {
      setBusy(null);
    }
  };

  const onSave = () =>
    run('Saving…', async () => {
      if (await save()) setMessage('Saved. Approve the routine when you are happy with it.');
    });

  const onApprove = () =>
    run('Approving…', async () => {
      if (dirty && !(await save())) return;
      try {
        const mission = await api.approveMission(id);
        setSaved(mission);
        setForm(toInput(mission));
        setMessage('Approved. Bhavya can now guide this routine.');
      } catch (e) {
        fail(e);
      }
    });

  const onMakeAll = () =>
    run('Making pictures…', async () => {
      const missing = saved.steps.filter((s) => !s.card);
      for (const [i, step] of missing.entries()) {
        setBusy(`Making picture ${i + 1} of ${missing.length}…`);
        try {
          applyCard(await api.makeCard(id, step.id), step.id);
        } catch (e) {
          fail(e);
          return;
        }
      }
    });

  const onDelete = () => {
    if (!window.confirm(`Delete "${saved.title}"? This cannot be undone.`)) return;
    void run('Deleting…', async () => {
      try {
        await api.deleteMission(id);
        navigate('/parent');
      } catch (e) {
        fail(e);
      }
    });
  };

  const setLight = (kind: 'on' | 'off', enabled: boolean) => {
    if (kind === 'on') update({ onStart: enabled ? [{ type: 'light_on', delaySec: 0 }] : [] });
    else update({ onEnd: enabled ? [{ type: 'light_off', delaySec: LIGHT_OFF_DELAY_SEC }] : [] });
  };

  const missingCards = saved.steps.filter((s) => !s.card).length;
  const statusBadge =
    saved.status === 'approved' && !dirty ? (
      <Badge tone="success">Approved</Badge>
    ) : (
      <Badge tone="warn">Needs your approval</Badge>
    );
  const lights = [hasLightOn && 'light on at start', hasLightOff && 'off after leaving']
    .filter(Boolean)
    .join(', ');

  return (
    <div className="mission-editor">
      <header className="editor-header">
        <div className="editor-title-row">
          <Link
            to="/parent"
            className="btn btn-ghost btn-sm"
            aria-label="All routines"
            title="All routines"
          >
            <Icon name="back" size={18} />
          </Link>
          <div className="editor-cover">
            {cover ? <img src={cover} alt="" /> : <Icon name="list" size={20} />}
          </div>
          <div className="editor-title">
            <label className="title-edit">
              <input
                type="text"
                aria-label="Routine name"
                value={form.title}
                maxLength={60}
                onChange={(e) => update({ title: e.target.value })}
              />
              <Icon name="edit" size={15} />
            </label>
            <div className="editor-meta">
              {statusBadge}
              <span className="chip">
                <Icon name="home" size={14} />
                {zone?.name ?? form.zone}
                {zone?.type === 'private' && ' · private'}
              </span>
              <span className="chip">
                <Icon name="play" size={14} />
                {form.trigger === 'zone_enter' ? 'Starts when entering' : 'Started from the app'}
              </span>
              {zone?.light && lights && (
                <span className="chip">
                  <Icon name="light" size={14} />
                  {lights}
                </span>
              )}
              <button
                type="button"
                className={`chip chip-button ${settingsOpen ? 'is-open' : ''}`}
                aria-expanded={settingsOpen}
                onClick={() => setSettingsOpen((open) => !open)}
              >
                <Icon name="settings" size={14} />
                Routine settings
              </button>
              <span className="muted small">From {SOURCE_LABELS[saved.source]}</span>
            </div>
          </div>
          <div className="editor-actions">
            {busy ? (
              <Spinner label={busy} />
            ) : (
              dirty && <span className="unsaved">Unsaved changes</span>
            )}
            <Button
              variant="ghost"
              icon="trash"
              aria-label="Delete routine"
              title="Delete routine"
              onClick={onDelete}
              disabled={!!busy}
            />
            <Button onClick={() => void onSave()} disabled={!dirty || !!busy}>
              Save
            </Button>
            <Button
              variant="primary"
              icon="check"
              onClick={() => void onApprove()}
              disabled={!!busy || (saved.status === 'approved' && !dirty)}
            >
              {dirty ? 'Save and approve' : 'Approve'}
            </Button>
          </div>
        </div>

        {settingsOpen && (
          <div className="editor-settings">
            <Field label="Room">
              <select
                value={form.zone}
                onChange={(e) => {
                  const next = zones.find((z) => z.id === e.target.value);
                  if (next) setForm((f) => (f ? withZone(f, next) : f));
                }}
              >
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} {z.type === 'private' ? '(private, camera off)' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="How it starts">
              <select
                value={form.trigger}
                onChange={(e) =>
                  update({ trigger: e.target.value === 'zone_enter' ? 'zone_enter' : 'manual' })
                }
              >
                <option value="manual">Started from the companion app</option>
                <option value="zone_enter">Automatically when entering the room</option>
              </select>
            </Field>
            {zone?.light ? (
              <div className="stack" style={{ gap: 8, justifyContent: 'center' }}>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={hasLightOn}
                    onChange={(e) => setLight('on', e.target.checked)}
                  />
                  Turn the light on when it starts
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={hasLightOff}
                    onChange={(e) => setLight('off', e.target.checked)}
                  />
                  Turn the light off 2 minutes after they leave
                </label>
              </div>
            ) : (
              <p className="muted small" style={{ alignSelf: 'center' }}>
                This room has no smart light.
              </p>
            )}
            {!cameraAllowed && (
              <div className="wide">
                <Notice tone="info">
                  Private room: the camera is switched off here, so every step is confirmed by
                  tapping Done. Door locks are never automated.
                </Notice>
              </div>
            )}
          </div>
        )}
      </header>

      {(error || message) && (
        <div className="editor-notices">
          <ErrorNotice error={error?.message ?? null} details={error?.details} />
          {message && <Notice tone="success">{message}</Notice>}
        </div>
      )}

      <div className="editor-grid">
        <StepList
          steps={form.steps}
          selectedId={selectedStep?.id ?? ''}
          onSelect={setSelectedId}
          onAdd={addStep}
          canAdd={form.steps.length < 20}
          missingCards={missingCards}
          onMakeAll={() => void onMakeAll()}
          busy={!!busy}
        />
        {selectedStep && (
          <>
            <StepEditor
              key={selectedStep.id}
              step={selectedStep}
              index={selectedIndex}
              count={form.steps.length}
              cameraAllowed={cameraAllowed}
              saved={savedStepIds.has(selectedStep.id)}
              cardBusy={cardBusy.has(selectedStep.id)}
              hasDemoFrame={!!demoFrames.frameFor(id, selectedStep.id)}
              tab={tab}
              onTab={setTab}
              onSelectIndex={(i) => setSelectedId(form.steps[i]?.id ?? null)}
              onChange={(patch) => updateStep(selectedIndex, patch)}
              onMove={(direction) => moveStep(selectedIndex, direction)}
              onRemove={() => removeStep(selectedIndex)}
              onMakeCard={() => void makeCard(selectedStep.id)}
              onCardFromDemo={() => void cardFromDemo(selectedStep)}
              onUploadCard={(file) => void uploadCard(selectedStep.id, file)}
            />
            <StepFlow step={selectedStep} index={selectedIndex} />
          </>
        )}
      </div>
    </div>
  );
}
