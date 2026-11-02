import { FEATURES, type Step } from '@bhavya/shared';
import { useEffect, useState } from 'react';
import { Icon, type IconName } from '../../components/Icon';
import { Button, Field } from '../../components/ui';

export type StepTab = 'say' | 'stuck' | 'check' | 'picture' | 'safety';

const TABS: { id: StepTab; label: string; icon: IconName }[] = [
  { id: 'say', label: 'Say', icon: 'volume' },
  { id: 'stuck', label: 'If stuck', icon: 'help' },
  { id: 'check', label: 'Done check', icon: 'check' },
  { id: 'picture', label: 'Picture', icon: 'image' },
  { id: 'safety', label: 'Safety', icon: 'lock' },
];

interface StepEditorProps {
  step: Step;
  index: number;
  count: number;
  cameraAllowed: boolean;
  /** Card actions are only possible for steps the hub already knows about. */
  saved: boolean;
  cardBusy: boolean;
  hasDemoFrame: boolean;
  tab: StepTab;
  onTab: (tab: StepTab) => void;
  onSelectIndex: (index: number) => void;
  onChange: (patch: Partial<Step>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onMakeCard: () => void;
  onCardFromDemo: () => void;
  onUploadCard: (file: File) => void;
}

/** Edits one step, a tab at a time, so nothing needs a long scroll. */
export function StepEditor(props: StepEditorProps) {
  const { step, index, count, cameraAllowed, saved, cardBusy, tab } = props;
  const cardHint = saved ? null : 'Save the routine first to add a picture.';
  // Small dots point the parent at things still to do.
  const needs: Partial<Record<StepTab, boolean>> = {
    picture: !step.card,
    check: step.check === 'vision' && !step.expect?.trim(),
  };

  return (
    <section className="editor-panel" aria-label={`Step ${index + 1}`}>
      <div className="step-head">
        <span className="step-number">{index + 1}</span>
        <input
          type="text"
          className="step-title-input"
          aria-label="Step name"
          value={step.action}
          maxLength={80}
          onChange={(e) => props.onChange({ action: e.target.value })}
        />
        <Button
          size="sm"
          variant="ghost"
          icon="up"
          aria-label="Move step up"
          title="Move up"
          disabled={index === 0}
          onClick={() => props.onMove(-1)}
        />
        <Button
          size="sm"
          variant="ghost"
          icon="down"
          aria-label="Move step down"
          title="Move down"
          disabled={index === count - 1}
          onClick={() => props.onMove(1)}
        />
        <Button
          size="sm"
          variant="ghost"
          icon="trash"
          aria-label="Remove step"
          title={count === 1 ? 'A routine needs at least one step' : 'Remove step'}
          disabled={count === 1}
          onClick={props.onRemove}
        />
      </div>

      <div className="step-tabs" role="tablist" aria-label="Step details">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'is-active' : ''}
            onClick={() => props.onTab(t.id)}
          >
            <Icon name={t.icon} size={15} />
            {t.label}
            {needs[t.id] && <span className="tab-dot" aria-label="needs attention" />}
          </button>
        ))}
      </div>

      <div className="step-tab-body" role="tabpanel">
        {tab === 'say' && (
          <>
            <Field
              label="Full guidance"
              hint="Spoken and shown when the most help is needed (level 3)."
            >
              <textarea
                rows={3}
                maxLength={240}
                value={step.prompts.full}
                onChange={(e) =>
                  props.onChange({ prompts: { ...step.prompts, full: e.target.value } })
                }
              />
            </Field>
            <Field
              label="Short reminder"
              hint="Used once this step has been done alone a few times (level 2)."
            >
              <input
                type="text"
                maxLength={80}
                value={step.prompts.short}
                onChange={(e) =>
                  props.onChange({ prompts: { ...step.prompts, short: e.target.value } })
                }
              />
            </Field>
          </>
        )}

        {tab === 'stuck' && (
          <>
            <Field
              label="If stuck"
              hint="A simpler explanation with a clue: where to look or what it looks like."
            >
              <textarea
                rows={3}
                maxLength={240}
                value={step.ifStuck}
                onChange={(e) => props.onChange({ ifStuck: e.target.value })}
              />
            </Field>
            <Field label="Time before a gentle reminder">
              <SecondsInput
                value={step.timeoutSec}
                onChange={(timeoutSec) => props.onChange({ timeoutSec })}
              />
            </Field>
          </>
        )}

        {tab === 'check' && (
          <>
            <Field
              label="How the step is confirmed"
              hint={cameraAllowed ? undefined : 'Private room: camera checks are not allowed.'}
            >
              <select
                value={step.check}
                onChange={(e) => {
                  const check = e.target.value === 'vision' ? 'vision' : 'tap';
                  props.onChange({
                    check,
                    expect: check === 'vision' ? (step.expect ?? '') : null,
                  });
                }}
              >
                <option value="tap">Tap Done in the app</option>
                <option value="vision" disabled={!cameraAllowed}>
                  Camera sees it (tapping Done still works)
                </option>
              </select>
            </Field>
            {step.check === 'vision' && (
              <Field label="What the camera sees when it is done">
                <input
                  type="text"
                  maxLength={160}
                  value={step.expect ?? ''}
                  onChange={(e) => props.onChange({ expect: e.target.value })}
                  placeholder="a pencil case inside the school bag"
                />
              </Field>
            )}
            {FEATURES.objectFinder && (
              <Field label="Object to find" hint="Used by the object finder. Optional.">
                <input
                  type="text"
                  maxLength={40}
                  value={step.object ?? ''}
                  onChange={(e) => props.onChange({ object: e.target.value || null })}
                />
              </Field>
            )}
          </>
        )}

        {tab === 'picture' && (
          <div className="step-picture-tab">
            <div className="step-card-image">
              {step.card ? <img src={step.card} alt={step.action} /> : <span>No picture yet</span>}
            </div>
            <div className="stack" style={{ gap: 8 }}>
              <Button
                size="sm"
                icon="sparkle"
                busy={cardBusy}
                disabled={!saved}
                title={cardHint ?? 'Draw a picture card with Muse Image'}
                onClick={props.onMakeCard}
              >
                {step.card ? 'New picture' : 'Make picture'}
              </Button>
              {FEATURES.objectFinder && props.hasDemoFrame && step.object && (
                <Button
                  size="sm"
                  icon="image"
                  disabled={!saved || cardBusy}
                  title="Cut the real object out of your video with SAM 3.1"
                  onClick={props.onCardFromDemo}
                >
                  Photo from video
                </Button>
              )}
              <label
                className={`btn btn-secondary btn-sm ${!saved || cardBusy ? 'is-disabled' : ''}`}
              >
                Upload photo
                <input
                  type="file"
                  accept="image/*"
                  className="visually-hidden"
                  disabled={!saved || cardBusy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) props.onUploadCard(file);
                  }}
                />
              </label>
              <span className="field-hint">
                {cardHint ?? 'A clear picture of the step helps most.'}
              </span>
            </div>
          </div>
        )}

        {tab === 'safety' && (
          <Field label="Safety notes" hint="One per line, shown in the app. Optional.">
            <textarea
              rows={4}
              value={step.safety.join('\n')}
              placeholder="The water can be hot. Use the blue tap."
              onChange={(e) =>
                props.onChange({
                  safety: e.target.value
                    .split('\n')
                    .map((s) => s.slice(0, 160))
                    .slice(0, 5),
                })
              }
            />
          </Field>
        )}
      </div>

      <div className="step-nav">
        <Button
          size="sm"
          variant="ghost"
          icon="back"
          disabled={index === 0}
          onClick={() => props.onSelectIndex(index - 1)}
        >
          Previous
        </Button>
        <span className="muted small">
          Step {index + 1} of {count}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={index === count - 1}
          onClick={() => props.onSelectIndex(index + 1)}
        >
          Next step →
        </Button>
      </div>
    </section>
  );
}

/** Number field that only commits a clamped value when the user leaves it. */
function SecondsInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const parsed = Number.parseInt(text, 10);
    const next = Number.isFinite(parsed) ? Math.min(600, Math.max(10, parsed)) : value;
    setText(String(next));
    if (next !== value) onChange(next);
  };
  return (
    <div className="row" style={{ flexWrap: 'nowrap' }}>
      <input
        type="number"
        min={10}
        max={600}
        style={{ maxWidth: 120 }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
      />
      <span className="muted small">seconds</span>
    </div>
  );
}
