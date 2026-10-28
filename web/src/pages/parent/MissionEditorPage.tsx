import type { Mission, MissionInput, MissionSource, Step, Zone } from '@bhavya/shared';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  ErrorNotice,
  Field,
  Notice,
  PageHeader,
  Spinner,
} from '../../components/ui';
import { api, ApiError, errorMessage } from '../../lib/api';
import { demoFrames } from '../../lib/demoFrames';
import { cropImage, readFileAsDataUrl } from '../../lib/media';
import { useLoader } from '../../lib/useLoader';
import { StepEditor } from './StepEditor';

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
  const removeStep = (index: number) =>
    setForm((f) =>
      f && f.steps.length > 1 ? { ...f, steps: f.steps.filter((_, i) => i !== index) } : f,
    );

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

  return (
    <>
      <PageHeader
        title={saved.title}
        subtitle={
          <span className="row">
            {saved.status === 'approved' && !dirty ? (
              <Badge tone="success">Approved</Badge>
            ) : (
              <Badge tone="warn">Needs your approval</Badge>
            )}
            <span>Created from {SOURCE_LABELS[saved.source]}</span>
          </span>
        }
        actions={
          <Button variant="danger" icon="trash" onClick={onDelete} disabled={!!busy}>
            Delete
          </Button>
        }
      />

      <div className="stack">
        <Card className="stack">
          <div className="grid-2">
            <Field label="Name">
              <input
                type="text"
                value={form.title}
                maxLength={60}
                onChange={(e) => update({ title: e.target.value })}
              />
            </Field>
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
                <option value="manual">Child starts it from the app</option>
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
                  Turn the light off 2 minutes after the child leaves
                </label>
              </div>
            ) : (
              <p className="muted small">This room has no smart light.</p>
            )}
          </div>
          {!cameraAllowed && (
            <Notice tone="info">
              Private room: the camera is switched off here, so every step is confirmed by your
              child tapping Done. Door locks are never automated.
            </Notice>
          )}
        </Card>

        {form.steps.map((step, index) => (
          <StepEditor
            key={step.id}
            step={step}
            index={index}
            count={form.steps.length}
            cameraAllowed={cameraAllowed}
            saved={savedStepIds.has(step.id)}
            cardBusy={cardBusy.has(step.id)}
            hasDemoFrame={!!demoFrames.frameFor(id, step.id)}
            onChange={(patch) => updateStep(index, patch)}
            onMove={(direction) => moveStep(index, direction)}
            onRemove={() => removeStep(index)}
            onMakeCard={() => void makeCard(step.id)}
            onCardFromDemo={() => void cardFromDemo(step)}
            onUploadCard={(file) => void uploadCard(step.id, file)}
          />
        ))}

        <div>
          <Button
            icon="plus"
            disabled={form.steps.length >= 20}
            onClick={() => setForm((f) => (f ? { ...f, steps: [...f.steps, newStep()] } : f))}
          >
            Add step
          </Button>
        </div>

        <ErrorNotice error={error?.message ?? null} details={error?.details} />
        {message && <Notice tone="success">{message}</Notice>}
      </div>

      <div className="save-bar">
        <Button variant="secondary" onClick={() => void onSave()} disabled={!dirty || !!busy}>
          Save changes
        </Button>
        <Button
          variant="primary"
          icon="check"
          onClick={() => void onApprove()}
          disabled={!!busy || (saved.status === 'approved' && !dirty)}
        >
          {dirty ? 'Save and approve' : 'Approve'}
        </Button>
        <Button
          icon="sparkle"
          onClick={() => void onMakeAll()}
          disabled={!!busy || missingCards === 0}
        >
          {missingCards > 0 ? `Make ${missingCards} missing pictures` : 'All steps have pictures'}
        </Button>
        <span className="spacer" />
        {busy ? (
          <Spinner label={busy} />
        ) : (
          dirty && <span className="muted small">Unsaved changes. Edits need approval again.</span>
        )}
      </div>
    </>
  );
}
