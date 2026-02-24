import type { Card } from '../../game/types';
import styles from './Card.module.css';

interface CardProps {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  interactive?: boolean;
  faceDown?: boolean;
}

/**
 * Derive the public URL for a card image from the card object.
 *
 * Deck ID formats (from deck.ts):
 *   Jesters  → "jester-{seq}"  (seq 0 → jester-1.png, seq 1 → jester-2.png)
 *   Regular  → "r{rank}-{copy}-{seq}"  (rank 1–12, copy 0-indexed)
 *              → "{rank:02d}-{copy+1:02d}.png
 */
function getCardImageUrl(card: Card): string {
  if (card.rank === 0) {
    const seq = parseInt(card.id.split('-')[1], 10);
    return `/cards/jester-${seq + 1}.png`;
  }
  // "r{rank}-{copy}-{seq}"
  const parts = card.id.split('-');
  const rank = parseInt(parts[0].slice(1), 10);
  const copy = parseInt(parts[1], 10);
  const rankStr = rank.toString().padStart(2, '0');
  const copyStr = (copy + 1).toString().padStart(2, '0');
  return `/cards/${rankStr}-${copyStr}.png`;
}

export function CardComponent({ card, selected, onClick, interactive, faceDown }: CardProps) {
  const src = faceDown ? '/cards/back.png' : getCardImageUrl(card);
  const isJester = card.rank === 0;
  const altText = faceDown
    ? 'Card back'
    : isJester
      ? 'Jester (wild)'
      : `Rank ${card.rank}`;

  return (
    <button
      className={[
        styles.card,
        selected ? styles.selected : '',
        interactive ? styles.interactive : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={interactive ? onClick : undefined}
      aria-pressed={selected}
      aria-label={altText}
      disabled={!interactive}
    >
      <img src={src} alt={altText} className={styles.cardImage} draggable={false} />
    </button>
  );
}
