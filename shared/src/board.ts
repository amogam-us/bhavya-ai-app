/** Phrases on the child's communication board. Help, Stop and Break are separate actions. */
export const BOARD_PHRASES = [
  { id: 'yes', label: 'Yes', picture: 'a green thumbs up' },
  { id: 'no', label: 'No', picture: 'a red hand gesture meaning no' },
  { id: 'toilet', label: 'Toilet', picture: 'a clean white toilet' },
  { id: 'drink', label: 'Drink', picture: 'a glass of water' },
  { id: 'food', label: 'Food', picture: 'a plate with a sandwich and apple' },
  { id: 'too_loud', label: 'Too loud', picture: 'over-ear headphones' },
  { id: 'hug', label: 'Hug', picture: 'a soft red heart' },
  { id: 'all_done', label: 'All done', picture: 'a big green check mark' },
] as const;

export type BoardPhraseId = (typeof BOARD_PHRASES)[number]['id'];

export const BOARD_PHRASE_IDS = BOARD_PHRASES.map((p) => p.id) as [
  BoardPhraseId,
  ...BoardPhraseId[],
];

export function findBoardPhrase(id: string) {
  return BOARD_PHRASES.find((p) => p.id === id);
}
