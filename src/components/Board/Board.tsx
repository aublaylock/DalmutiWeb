import { useEffect, useRef, useState } from 'react';
import type { BoardProps } from 'boardgame.io/react';
import type { DalmutiState } from '../../game/types';
import { Hand } from '../Hand/Hand';
import { PlayArea } from '../PlayArea/PlayArea';
import { PlayerList } from '../PlayerList/PlayerList';
import styles from './Board.module.css';

export type DalmutiBoardProps = BoardProps<DalmutiState>;

// ---------------------------------------------------------------------------
// Table position helpers
// ---------------------------------------------------------------------------

/**
 * Assign player IDs to table positions based on social rank (or seatOrder for
 * round 1 when no ranks exist yet).
 *
 * Layout (by social rank, ascending):
 *   Left   → rank 1 (Great Dalmuti)
 *   Top    → ranks 2–(topCount+1)
 *   Right  → next rightCount players
 *   Bottom → remaining players through rank N (Greater Peon)
 *
 * Counts by player count:
 *   4p → L:1 T:1 R:1 B:1
 *   5p → L:1 T:2 R:1 B:1
 *   6p → L:1 T:2 R:1 B:2
 *   7p → L:1 T:2 R:2 B:2
 *   8p → L:1 T:2 R:2 B:3
 */
function getTablePositions(
  G: DalmutiState,
  n: number,
): { left: string[]; top: string[]; right: string[]; bottom: string[] } {
  const allIDs = Object.keys(G.players);

  // Sort by social rank when available, otherwise by seatOrder index
  const sorted = [...allIDs].sort((a, b) => {
    const ra = G.players[a].socialRank;
    const rb = G.players[b].socialRank;
    if (ra !== null && rb !== null) return ra - rb;
    const ia = G.seatOrder.indexOf(a);
    const ib = G.seatOrder.indexOf(b);
    return ia - ib;
  });

  const topCount = n >= 5 ? 2 : 1;
  const rightCount = n >= 7 ? 2 : 1;

  // Bottom is reversed so the rank order continues clockwise:
  // ...right (top→bottom) → bottom (right→left) → left.
  // Without reversal the bottom row would go left→right in ascending rank,
  // placing the Greater Peon on the right instead of the left.
  return {
    left: [sorted[0]],
    top: sorted.slice(1, 1 + topCount),
    right: sorted.slice(1 + topCount, 1 + topCount + rightCount),
    bottom: sorted.slice(1 + topCount + rightCount).reverse(),
  };
}

function getSocialTitle(rank: number | null, n: number): string {
  if (rank === null) return '';
  if (rank === 1) return 'Great Dalmuti';
  if (rank === 2) return 'Lesser Dalmuti';
  if (rank === n) return 'Greater Peon';
  if (rank === n - 1) return 'Lesser Peon';
  return 'Merchant';
}

// ---------------------------------------------------------------------------
// Board component
// ---------------------------------------------------------------------------

export function Board({
  G,
  ctx,
  moves,
  playerID,
  isActive,
  matchData,
}: DalmutiBoardProps) {
  const movesRef = useRef(moves);
  movesRef.current = moves;

  const [countdown, setCountdown] = useState(15);
  // Transient revolution announcement — shown for 4 s then auto-dismissed.
  const [revolutionAnnouncement, setRevolutionAnnouncement] = useState<string | null>(null);

  // Auto-advance from the roundOver phase after 15 s (owner only).
  useEffect(() => {
    if (ctx.phase !== 'roundOver' || playerID !== '0') return;
    const timer = setTimeout(() => movesRef.current.advanceRound(), 15000);
    return () => clearTimeout(timer);
  }, [ctx.phase, playerID]);

  // Show a transient revolution announcement for 4 s when one is declared.
  useEffect(() => {
    if (!G.revolutionDeclaredBy) {
      setRevolutionAnnouncement(null);
      return;
    }
    const name = G.players[G.revolutionDeclaredBy]?.name ?? `Player ${G.revolutionDeclaredBy}`;
    setRevolutionAnnouncement(
      `${G.isGreaterRevolution ? 'GREATER REVOLUTION' : 'REVOLUTION'} — ${name}`
    );
    const timer = setTimeout(() => setRevolutionAnnouncement(null), 4000);
    return () => clearTimeout(timer);
  }, [G.revolutionDeclaredBy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drive the visible countdown for all players.
  useEffect(() => {
    if (ctx.phase !== 'roundOver') {
      setCountdown(15);
      return;
    }
    const interval = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(interval);
  }, [ctx.phase]);

  const myPlayer = playerID !== null ? G.players[playerID] : null;
  const isMyTurn = isActive && ctx.currentPlayer === playerID;
  const inTaxPhase = ctx.phase === 'tax';
  const n = ctx.numPlayers;

  // ---- Lobby phase: waiting room before the game starts ----
  if (ctx.phase === 'lobby') {
    const joinedCount = matchData?.filter((p) => p.name).length ?? 0;
    const isOwner = playerID === '0';
    const canStart = isOwner && isActive && joinedCount >= n;

    return (
      <div className={styles.board}>
        <header className={styles.header}>
          <img src="/greatDalmutiTitle.png" alt="The Great Dalmuti" className={styles.titleImg} />
          <div className={styles.meta}>
            <span className={styles.phase}>Waiting Room</span>
          </div>
        </header>
        <div className={styles.lobbyWaiting}>
          <h2 className={styles.lobbyHeading}>
            Players ({joinedCount} / {n})
          </h2>
          <ul className={styles.playerRoster}>
            {matchData?.map((p) => (
              <li key={p.id} className={p.name ? styles.rosterJoined : styles.rosterEmpty}>
                {p.name ?? 'Waiting…'}
              </li>
            ))}
          </ul>
          {isOwner ? (
            <button
              className={styles.startBtn}
              onClick={() => moves.startGame()}
              disabled={!canStart}
            >
              {canStart ? 'Start Game' : `Waiting for players (${joinedCount}/${n})`}
            </button>
          ) : (
            <p className={styles.lobbyWaitMsg}>Waiting for the owner to start the game…</p>
          )}
        </div>
      </div>
    );
  }

  // ---- Tax / Play / Round-over phases: main game board ----
  const isRoundOver = ctx.phase === 'roundOver';
  const completedRound = G.roundNumber - 1;

  // Debt where this player is the payer (Peon) — their best cards were auto-staged
  const myTaxDebt = inTaxPhase && playerID !== null
    ? G.taxDebts.find((d) => d.fromPlayerID === playerID) ?? null
    : null;

  // Debt where this player is the receiver (Dalmuti) — they must choose cards to give back.
  const myTaxReceivable = inTaxPhase && playerID !== null
    ? G.taxDebts.find((d) => d.toPlayerID === playerID && d.count > 0) ?? null
    : null;

  // Revolution: available in the tax phase to any player holding both Jokers.
  const canDeclareRevolution = (() => {
    if (!inTaxPhase || !playerID || !myPlayer) return false;
    const handJokers = myPlayer.hand.filter((c) => c.rank === 0).length;
    const stagedJokers = myTaxDebt
      ? myTaxDebt.offeredCards.filter((c) => c.rank === 0).length
      : 0;
    return handJokers + stagedJokers >= 2;
  })();

  const hasMarkedReady = playerID !== null && G.readyPlayers.includes(playerID);

  // True if this player is involved in any tax debt this round (as payer OR receiver),
  // even after the debt has been resolved. Used to suppress the "no taxation" banner
  // for Dalmuties who have already given back their cards.
  const hasTaxRole = inTaxPhase && playerID !== null &&
    G.taxDebts.some((d) => d.fromPlayerID === playerID || d.toPlayerID === playerID);

  // Table layout: assign player IDs to positions by social rank
  const positions = getTablePositions(G, n);

  // During round-over, suppress active-turn highlights (no one is "playing")
  const activePlayerForList = inTaxPhase || isRoundOver ? '' : ctx.currentPlayer;

  return (
    <div className={styles.board}>
      <header className={styles.header}>
        <img src="/greatDalmutiTitle.png" alt="The Great Dalmuti" className={styles.titleImg} />
        <div className={styles.meta}>
          <span>Round {isRoundOver ? completedRound : G.roundNumber}</span>
          <span className={styles.phase}>
            {isRoundOver ? `Round ${completedRound} Complete` : inTaxPhase ? 'Tax Collection' : 'Play'}
          </span>
          {revolutionAnnouncement && (
            <span className={styles.revolution}>{revolutionAnnouncement}</span>
          )}
          {isMyTurn && !inTaxPhase && !isRoundOver && (
            <span className={styles.yourTurn}>Your Turn</span>
          )}
        </div>
      </header>

      <div className={styles.main}>
        {/* Top: players ranked 2–topCount */}
        <div className={styles.topPlayers}>
          <PlayerList
            players={G.players}
            currentPlayer={activePlayerForList}
            playerID={playerID}
            matchData={matchData}
            finishOrder={G.finishOrder}
            playerIDs={positions.top}
            horizontal
          />
        </div>

        {/* Left: Great Dalmuti (rank 1) */}
        <div className={styles.leftPlayer}>
          <PlayerList
            players={G.players}
            currentPlayer={activePlayerForList}
            playerID={playerID}
            matchData={matchData}
            finishOrder={G.finishOrder}
            playerIDs={positions.left}
          />
        </div>

        <div className={styles.center}>
          <PlayArea currentTrick={G.currentTrick} />
        </div>

        {/* Right: middle-ranked players */}
        <div className={styles.rightPlayers}>
          <PlayerList
            players={G.players}
            currentPlayer={activePlayerForList}
            playerID={playerID}
            matchData={matchData}
            finishOrder={G.finishOrder}
            playerIDs={positions.right}
          />
        </div>

        {/* Bottom: Greater Peon (rank N) and adjacent low-ranked players */}
        <div className={styles.bottomPlayers}>
          <PlayerList
            players={G.players}
            currentPlayer={activePlayerForList}
            playerID={playerID}
            matchData={matchData}
            finishOrder={G.finishOrder}
            playerIDs={positions.bottom}
            horizontal
          />
        </div>
      </div>

      {/* Hand: hidden during round-over since the round is complete */}
      {!isRoundOver && myPlayer && (
        <Hand
          cards={myPlayer.hand}
          isMyTurn={isMyTurn}
          currentTrick={G.currentTrick}
          inTaxPhase={inTaxPhase}
          taxDebt={myTaxDebt}
          taxReceivable={myTaxReceivable}
          hasTaxRole={hasTaxRole}
          onPlayCards={(ids) => moves.playCards(ids)}
          onPass={() => moves.pass()}
          onGiveBackCards={(ids) => moves.giveBackCards(playerID, ids)}
          canDeclareRevolution={canDeclareRevolution}
          onDeclareRevolution={() => moves.declareRevolution(playerID)}
          hasMarkedReady={hasMarkedReady}
          onMarkReady={() => moves.markReady(playerID)}
        />
      )}

      {/* Round-over overlay: transparent panel floats over the board */}
      {isRoundOver && (
        <div className={styles.roundOverOverlay}>
          <div className={styles.roundOverBox}>
            <h2 className={styles.roundOverTitle}>Round {completedRound} Results</h2>
            <ol className={styles.finishList}>
              {G.finishOrder.map((id, i) => {
                const name = matchData?.find((p) => String(p.id) === id)?.name ?? `Player ${id}`;
                const title = getSocialTitle(i + 1, n);
                return (
                  <li key={id} className={styles.finishItem}>
                    <span className={styles.finishPos}>#{i + 1}</span>
                    <span className={styles.finishName}>{name}</span>
                    {title && <span className={styles.finishTitle}>{title}</span>}
                  </li>
                );
              })}
            </ol>
            <p className={styles.countdownMsg}>
              Next round starting in <strong>{countdown}</strong>s…
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
