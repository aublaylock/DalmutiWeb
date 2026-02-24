import type { DalmutiState } from '../../game/types';
import styles from './PlayerList.module.css';

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
            <div className={styles.stats}>
              <span>{player.hand.length} cards</span>
              {pos !== null && <span>#{pos} out</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
