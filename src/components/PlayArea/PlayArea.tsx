import type { Trick } from '../../game/types';
import { CardComponent } from '../Card/Card';
import styles from './PlayArea.module.css';

interface PlayAreaProps {
  currentTrick: Trick | null;
}

export function PlayArea({ currentTrick }: PlayAreaProps) {
  return (
    <div className={styles.playArea}>
      {currentTrick === null ? (
        <p className={styles.empty}>Lead a trick to begin</p>
      ) : (
        <div className={styles.trick}>
          <p className={styles.trickLabel}>
            {currentTrick.count}× Rank {currentTrick.rank === 13 ? 'Joker (13)' : currentTrick.rank}
          </p>
          <div className={styles.cards}>
            {currentTrick.cards.map((card) => (
              <CardComponent key={card.id} card={card} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
