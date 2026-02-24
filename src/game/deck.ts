import type { Card, CardRank } from './types';

/** Build the standard 80-card Great Dalmuti deck. */
export function buildDeck(): Card[] {
  const cards: Card[] = [];
  let seq = 0;

  // 2 Jesters (rank 0, wild)
  for (let i = 0; i < 2; i++) {
    cards.push({ rank: 0 as CardRank, id: `jester-${seq++}` });
  }

  // Ranks 1–12: rank N has exactly N cards
  for (let rank = 1; rank <= 12; rank++) {
    for (let copy = 0; copy < rank; copy++) {
      cards.push({ rank: rank as CardRank, id: `r${rank}-${copy}-${seq++}` });
    }
  }

  return cards; // 2 + 78 = 80 cards total
}
