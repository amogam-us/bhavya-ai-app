import type { Step } from '@bhavya/shared';
import { useEffect, useState } from 'react';
import { Button, Field } from '../../components/ui';

interface StepEditorProps {
  step: Step;
  index: number;
  count: number;
  cameraAllowed: boolean;
  /** Card actions are only possible for steps the hub already knows about. */
  saved: boolean;
  cardBusy: boolean;
  hasDemoFrame: boolean;
  onChange: (patch: Partial<Step>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onMakeCard: () => void;
  onCardFromDemo: () => void;
  onUploadCard: (file: File) => void;
}

export function StepEditor(props: StepEditorProps) {
  const { step, index, count, cameraAllowed, saved, cardBusy } = props;
  const cardHint = saved ? null : 'Save the routine first to add a picture.';

  return (
    <section className="card step-editor" aria-label={`Step ${index + 1}`}>
      <div className="stack">
        <div className="step-card-image">
          {step.card ? <img src={step.card} alt={step.action} /> : <span>No picture yet</span>}
        </div>
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
        {props.hasDemoFrame && step.object && (
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
        <label className={`btn btn-secondary btn-sm ${!saved || cardBusy ? 'is-disabled' : ''}`}>
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
        {cardHint && <span className="field-hint">{cardHint}</span>}
      </div>

      <div className="stack">
        <div className="step-head">
          <span className="step-number">{index + 1}</span>
          <input
            type="text"
            aria-label="Step title"
            value={step.action}
            maxLength={80}
            onChange={(e) => props.onChange({ action: e.target.value })}
          />
          <Button
            size="sm"
            variant="ghost"
            icon="up"
            aria-label="Move up"
            disabled={index === 0}
            onClick={() => props.onMove(-1)}
          />
          <Button
            size="sm"
            variant="ghost"
            icon="down"
            aria-label="Move down"
            disabled={index === count - 1}
            onClick={() => props.onMove(1)}
          />
          <Button
            size="sm"
            variant="ghost"
            icon="trash"
            aria-label="Remove step"
            disabled={count === 1}
            onClick={props.onRemove}
          />
        </div>

        <div className="step-fields">
          <Field label="Full guidance (level 3)" hint="Spoken when the child needs the most help.">
            <textarea
              rows={2}
              maxLength={240}
              value={step.prompts.full}
              onChange={(e) =>
                props.onChange({ prompts: { ...step.prompts, full: e.target.value } })
              }
            />
          </Field>
          <Field label="If stuck" hint="A simpler explanation with a clue.">
            <textarea
              rows={2}
              maxLength={240}
              value={step.ifStuck}
              onChange={(e) => props.onChange({ ifStuck: e.target.value })}
            />
          </Field>
          <Field label="Short reminder (level 2)">
            <input
              type="text"
              maxLength={80}
              value={step.prompts.short}
              onChange={(e) =>
                props.onChange({ prompts: { ...step.prompts, short: e.target.value } })
              }
            />
          </Field>
          <Field label="Object to find" hint="Used by the object finder. Optional.">
            <input
              type="text"
              maxLength={40}
              value={step.object ?? ''}
              onChange={(e) => props.onChange({ object: e.target.value || null })}
            />
          </Field>
          <Field
            label="How the step is confirmed"
            hint={cameraAllowed ? undefined : 'Private room: camera checks are not allowed.'}
          >
            <select
              value={step.check}
              onChange={(e) => {
                const check = e.target.value === 'vision' ? 'vision' : 'tap';
                props.onChange({ check, expect: check === 'vision' ? (step.expect ?? '') : null });
              }}
            >
              <option value="tap">Child taps Done</option>
              <option value="vision" disabled={!cameraAllowed}>
                Camera sees it (child can still tap)
              </option>
            </select>
          </Field>
          <Field label="Time before a gentle reminder">
            <SecondsInput
              value={step.timeoutSec}
              onChange={(timeoutSec) => props.onChange({ timeoutSec })}
            />
          </Field>
          {step.check === 'vision' && (
            <div className="wide">
              <Field label="What the camera sees when it is done">
                <input
                  type="text"
                  maxLength={160}
                  value={step.expect ?? ''}
                  onChange={(e) => props.onChange({ expect: e.target.value })}
                  placeholder="a pencil case inside the school bag"
                />
              </Field>
            </div>
          )}
          <div className="wide">
            <Field label="Safety notes" hint="One per line, shown to the child. Optional.">
              <textarea
                rows={2}
                value={step.safety.join('\n')}
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
          </div>
        </div>
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
