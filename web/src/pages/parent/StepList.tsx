import type { Step } from '@bhavya/shared';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/ui';

interface StepListProps {
  steps: Step[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  canAdd: boolean;
  /** Saved steps without a picture card. */
  missingCards: number;
  onMakeAll: () => void;
  busy: boolean;
}

/** The routine's steps as a list to jump between; the selected one is edited next to it. */
export function StepList(props: StepListProps) {
  const { steps, selectedId, missingCards } = props;
  return (
    <section className="editor-steps" aria-label="Steps">
      <div className="editor-col-head">
        <h2>Steps</h2>
        <span className="muted small">{steps.length}</span>
      </div>
      <ol className="step-list">
        {steps.map((step, index) => {
          const selected = step.id === selectedId;
          return (
            <li key={step.id}>
              <button
                type="button"
                className={`step-item ${selected ? 'is-selected' : ''}`}
                aria-current={selected ? 'step' : undefined}
                onClick={() => props.onSelect(step.id)}
              >
                <span className="step-item-pic">
                  {step.card ? <img src={step.card} alt="" /> : <span>{index + 1}</span>}
                </span>
                <span className="step-item-text">
                  <span className="step-item-num">Step {index + 1}</span>
                  <span className="step-item-title">{step.action || 'Untitled step'}</span>
                </span>
                <span className="step-item-icons">
                  {step.check === 'vision' ? (
                    <span title="The camera checks this step">
                      <Icon name="camera" size={15} />
                    </span>
                  ) : (
                    <span title="Your child taps Done">
                      <Icon name="tap" size={15} />
                    </span>
                  )}
                  {!step.card && (
                    <span className="is-missing" title="No picture yet">
                      <Icon name="image" size={15} />
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="step-list-actions">
        <Button size="sm" icon="plus" disabled={!props.canAdd} onClick={props.onAdd}>
          Add step
        </Button>
        {missingCards > 0 && (
          <Button size="sm" icon="sparkle" disabled={props.busy} onClick={props.onMakeAll}>
            Make {missingCards} {missingCards === 1 ? 'picture' : 'pictures'}
          </Button>
        )}
      </div>
    </section>
  );
}
