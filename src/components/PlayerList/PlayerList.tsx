import type { DalmutiState } from '../../game/types';
import styles from './PlayerList.module.css';

/** Fan of face-down card backs representing an opponent's hand size. */
function CardFan({ count }: { count: number }) {
  if (count === 0) return <div className={styles.cardFanEmpty}>—</div>;

  const maxVisible = Math.min(count, 8);
  // Spread cards across up to 70 px (each card step = 10 px), centered
  const totalSpread = Math.min(70, (maxVisible - 1) * 10);
  const maxAngle = 18; // ± degrees at the extremes

  return (
    <div className={styles.cardFanContainer}>
      {Array.from({ length: maxVisible }, (_, i) => {
        const t = maxVisible > 1 ? i / (maxVisible - 1) : 0.5; // 0..1
        // Spread cards evenly across totalSpread px, centered on the container midpoint
        const offset = (t - 0.5) * totalSpread;
        const angle = (t - 0.5) * 2 * maxAngle;
        return (
          <img
            key={i}
            src="/cards/back.png"
            alt=""
            aria-hidden="true"
            className={styles.fanCard}
            style={{ transform: `translateX(calc(-50% + ${offset}px)) rotate(${angle}deg)` }}
          />
        );
      })}
      <span className={styles.fanCount}>{count}</span>
    </div>
  );
}

interface MatchPlayer {
  id: number;
  name?: string;
}

interface PlayerListProps {
  players: DalmutiState['players'];
  currentPlayer: string;
  playerID: string | null;
  matchData?: MatchPlayer[];
  finishOrder: string[];
  /** Specific player IDs to render (in order). */
  playerIDs: string[];
  /** Lay cards out in a row instead of a column. */
  horizontal?: boolean;
}


export function PlayerList({
  players,
  currentPlayer,
  playerID,
  matchData,
  finishOrder,
  playerIDs,
  horizontal = false,
}: PlayerListProps) {
  const numPlayers = Object.keys(players).length;

  const getSocialTitle = (id: string): string => {
    const rank = players[id].socialRank;
    if (rank === null) return '';
    if (rank === 1) return 'Great Dalmuti';
    if (rank === 2) return 'Lesser Dalmuti';
    if (rank === numPlayers) return 'Greater Peon';
    if (rank === numPlayers - 1) return 'Lesser Peon';
    return 'Merchant';
  };

  const getDisplayName = (id: string): string => {
    const matchPlayer = matchData?.find((p) => String(p.id) === id);
    return matchPlayer?.name ?? players[id].name ?? `Player ${id}`;
  };

  const finishPosition = (id: string): number | null => {
    const idx = finishOrder.indexOf(id);
    return idx >= 0 ? idx + 1 : null;
  };

  return (
    <div className={horizontal ? styles.playerListH : styles.playerList}>
      {playerIDs.map((id) => {
        const player = players[id];
        const isActive = id === currentPlayer;
        const isMe = id === playerID;
        const finished = player.finished;
        const pos = finishPosition(id);
        const title = getSocialTitle(id);

        return (
          <div
            key={id}
            className={[
              styles.player,
              isActive ? styles.active : '',
              isMe ? styles.me : '',
              finished ? styles.finished : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className={styles.nameRow}>
              <span className={styles.name}>{getDisplayName(id)}</span>
              {isMe && <span className={styles.meTag}>You</span>}
            </div>
            {title && <span className={styles.title}>{title}</span>}
            {!finished && <CardFan count={player.hand.length} />}
            {pos !== null && <div className={styles.finishBadge}>#{pos} out</div>}
          </div>
        );
      })}
    </div>
  );
}
