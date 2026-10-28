import { BOARD_PHRASES, type BoardPhraseId } from '@bhavya/shared';

interface BoardProps {
  icons: Record<string, string>;
  showText: boolean;
  onSay: (id: BoardPhraseId, label: string) => void;
}

/** Picture communication board: one tap speaks the phrase and tells the parent. */
export function Board({ icons, showText, onSay }: BoardProps) {
  return (
    <section aria-label="Talk with pictures">
      <div className="board">
        {BOARD_PHRASES.map((phrase) => (
          <button
            key={phrase.id}
            type="button"
            className="board-tile"
            aria-label={phrase.label}
            onClick={() => onSay(phrase.id, phrase.label)}
          >
            {icons[phrase.id] ? (
              <img src={icons[phrase.id]} alt="" />
            ) : (
              <span className="board-fallback">{phrase.label}</span>
            )}
            {showText && icons[phrase.id] && <span>{phrase.label}</span>}
          </button>
        ))}
      </div>
    </section>
  );
}
