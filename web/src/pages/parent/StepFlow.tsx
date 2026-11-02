import type { Step } from '@bhavya/shared';
import { Icon } from '../../components/Icon';

/** After this many reminders without progress the parent is told (see the hub's prompting rules). */
const REMINDERS_BEFORE_PARENT = 2;

/**
 * A read-only picture of how Bhavya runs the selected step, built from the
 * same fields the editor changes, so parents can see the effect of each one.
 */
export function StepFlow({ step, index }: { step: Step; index: number }) {
  return (
    <section className="editor-flow" aria-label="How this step runs">
      <div className="editor-col-head">
        <h2>How step {index + 1} runs</h2>
      </div>
      <ol className="flow">
        <li className="flow-node is-start">
          <span className="flow-pic">
            {step.card ? <img src={step.card} alt="" /> : <Icon name="volume" size={18} />}
          </span>
          <div>
            <b>Your child sees and hears</b>
            <p>&ldquo;{step.prompts.full}&rdquo;</p>
            <p className="flow-note">
              After doing it alone a few times: &ldquo;{step.prompts.short}&rdquo;
            </p>
          </div>
        </li>
        <li className="flow-arrow" aria-hidden="true">
          No progress for {step.timeoutSec} s, or Help
        </li>
        <li className="flow-node is-help">
          <span className="flow-icon">
            <Icon name="help" size={18} />
          </span>
          <div>
            <b>A simpler hint</b>
            <p>&ldquo;{step.ifStuck}&rdquo;</p>
            <p className="flow-note">
              You are told at once when your child taps Help, or after {REMINDERS_BEFORE_PARENT}{' '}
              hints without progress.
            </p>
          </div>
        </li>
        <li className="flow-arrow" aria-hidden="true" />
        <li className="flow-node is-done">
          <span className="flow-icon">
            <Icon name={step.check === 'vision' ? 'camera' : 'tap'} size={18} />
          </span>
          <div>
            <b>Step done</b>
            <p>
              {step.check === 'vision'
                ? `The camera sees ${step.expect?.trim() || 'the finished step'}, or your child taps Done.`
                : 'Your child taps Done.'}
            </p>
          </div>
        </li>
        {step.safety.length > 0 && (
          <li className="flow-node is-safety">
            <span className="flow-icon">
              <Icon name="lock" size={18} />
            </span>
            <div>
              <b>Safety notes shown</b>
              {step.safety.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          </li>
        )}
      </ol>
    </section>
  );
}
