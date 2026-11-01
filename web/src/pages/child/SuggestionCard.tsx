import type { ClientMessage, SuggestionView } from '@bhavya/shared';
import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import { useLoader } from '../../lib/useLoader';

interface SuggestionCardProps {
  suggestion: SuggestionView;
  send: (message: ClientMessage) => boolean;
  onSpeak: (text: string) => void;
}

/** A yes/no question from the hub. Nothing starts until the child says yes. */
export function SuggestionCard({ suggestion, send, onSpeak }: SuggestionCardProps) {
  const { id, missionId, prompt } = suggestion;
  const mission = useLoader(() => api.mission(missionId), [missionId]);
  const picture = mission.data?.steps.find((s) => s.card)?.card ?? null;
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    setAnswered(false);
    onSpeak(prompt);
    // Speak each question once, when it first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const answer = (accept: boolean) => {
    if (answered) return;
    setAnswered(send({ type: 'suggestion_answer', suggestionId: id, accept }));
  };

  return (
    <article className="step-card" aria-live="polite">
      <div className="step-picture">
        {picture ? (
          <img src={picture} alt="" />
        ) : (
          <span className="placeholder">{suggestion.missionTitle}</span>
        )}
      </div>
      <h1 className="step-title">{prompt}</h1>
      <div className="suggestion-actions">
        <button
          type="button"
          className="child-btn done"
          onClick={() => answer(true)}
          disabled={answered}
        >
          <Icon name="check" size={34} />
          Yes
        </button>
        <button
          type="button"
          className="child-btn"
          onClick={() => answer(false)}
          disabled={answered}
        >
          <Icon name="close" size={30} />
          Not now
        </button>
      </div>
    </article>
  );
}
