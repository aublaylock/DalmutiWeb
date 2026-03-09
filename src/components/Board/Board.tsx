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
 * Assign active player IDs to table positions based on social rank.
 *
 * Layout (by social rank, ascending):
 *   Left   → rank 1 (Great Dalmuti)
 *   Top    → ranks 2–(topCount+1)
 *   Right  → next rightCount players
 *   Bottom → remaining players through rank N (Greater Peon)
 */
function getTablePositions(
  G: DalmutiState,
  myID: string | null,
): { left: string[]; top: string[]; right: string[]; bottom: string[] } {
  // Only show active players in positions (excludes self — rendered in Hand area below)
  const allIDs = G.activePlayerIDs.filter(id => id !== myID);
  const n = allIDs.length;

  // Sort by social rank when available, otherwise by seatOrder index
  const sorted = [...allIDs].sort((a, b) => {
    const ra = G.players[a]?.socialRank;
    const rb = G.players[b]?.socialRank;
    if (ra !== null && ra !== undefined && rb !== null && rb !== undefined) return ra - rb;
    const ia = G.seatOrder.indexOf(a);
    const ib = G.seatOrder.indexOf(b);
    return ia - ib;
  });

  const topCount = n >= 4 ? 2 : 1;
  const rightCount = n >= 6 ? 2 : 1;

  return {
    left: sorted.slice(0, 1),
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

  // Transient revolution announcement — shown for 4 s then auto-dismissed.
  const [revolutionAnnouncement, setRevolutionAnnouncement] = useState<string | null>(null);

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

  const isHost = playerID === '0';
  const myPlayer = playerID !== null ? G.players[playerID] : null;
  const isMyTurn = isActive && ctx.currentPlayer === playerID;
  const inTaxPhase = ctx.phase === 'tax';
  // The current player is "active" (participates in gameplay) if in activePlayerIDs
  const isActivePlayer = playerID !== null && G.activePlayerIDs.includes(playerID);

  // Play pass sound whenever a new player passes.
  const passedCountRef = useRef(G.passedPlayers.length);
  useEffect(() => {
    if (G.passedPlayers.length > passedCountRef.current) {
      const audio = new Audio('/pass.mp3');
      audio.play().catch(() => {/* autoplay policy — ignore */});
    }
    passedCountRef.current = G.passedPlayers.length;
  }, [G.passedPlayers.length]);

  // Play a reminder sound 5 s after it becomes the player's turn (if still their turn).
  const isMyTurnRef = useRef(isMyTurn);
  isMyTurnRef.current = isMyTurn;
  useEffect(() => {
    if (!isMyTurn) return;
    const timer = setTimeout(() => {
      if (!isMyTurnRef.current) return;
      const audio = new Audio('/yourTurn.mp3');
      audio.play().catch(() => {/* autoplay policy — ignore */});
    }, 5000);
    return () => clearTimeout(timer);
  }, [isMyTurn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Number of active players — used for title calculation throughout
  const n = G.activePlayerIDs.length;

  // ---- Lobby phase: waiting room before the game starts ----
  if (ctx.phase === 'lobby') {
    const joinedCount = matchData?.filter((p) => p.name).length ?? 0;
    const kickedCount = G.kickedPlayerIDs.length;
    const activeJoinedCount = joinedCount - kickedCount;
    const canStart = isHost && activeJoinedCount >= 4;

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
            Players ({activeJoinedCount} joined)
          </h2>
          <ul className={styles.playerRoster}>
            {matchData?.map((p) => {
              const pid = String(p.id);
              const isKicked = G.kickedPlayerIDs.includes(pid);
              const isJoined = !!p.name;
              return (
                <li
                  key={p.id}
                  className={isKicked ? styles.rosterKicked : isJoined ? styles.rosterJoined : styles.rosterEmpty}
                >
                  <span>{isKicked ? `${p.name ?? 'Player ' + (p.id + 1)} (kicked)` : p.name ?? 'Waiting…'}</span>
                  {isHost && isJoined && pid !== '0' && !isKicked && (
                    <button
                      className={styles.kickBtn}
                      onClick={() => moves.kickPlayer(playerID, pid)}
                    >
                      Kick
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {isHost ? (
            <button
              className={styles.startBtn}
              onClick={() => moves.startGame()}
              disabled={!canStart}
            >
              {canStart
                ? 'Start Game'
                : activeJoinedCount < 4
                  ? `Need at least 4 players (${activeJoinedCount} active)`
                  : 'Start Game'}
            </button>
          ) : (
            <p className={styles.lobbyWaitMsg}>Waiting for the host to start the game…</p>
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

  const hasTaxRole = inTaxPhase && playerID !== null &&
    G.taxDebts.some((d) => d.fromPlayerID === playerID || d.toPlayerID === playerID);

  // Table layout: assign active player IDs to positions by social rank (excludes self)
  const positions = getTablePositions(G, playerID);

  // During round-over, suppress active-turn highlights and pass badges
  const activePlayerForList = inTaxPhase || isRoundOver ? '' : ctx.currentPlayer;
  const passedPlayersForList = inTaxPhase || isRoundOver ? [] : G.passedPlayers;
  const allPlayersReady = G.readyPlayers.length >= n;
  const hasPendingTax = inTaxPhase && G.taxDebts.some((d) => d.count > 0);

  // Non-active player in roundOver: show "Join Next Round" option
  const canJoinMidGame = isRoundOver && playerID !== null &&
    !G.activePlayerIDs.includes(playerID) &&
    !G.kickedPlayerIDs.includes(playerID);
  const hasPendingJoin = playerID !== null && G.pendingJoinIDs.includes(playerID);

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
            passedPlayers={passedPlayersForList}
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
            passedPlayers={passedPlayersForList}
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
            passedPlayers={passedPlayersForList}
          />
        </div>

        {/* Bottom: Greater Peon and adjacent low-ranked players */}
        <div className={styles.bottomPlayers}>
          <PlayerList
            players={G.players}
            currentPlayer={activePlayerForList}
            playerID={playerID}
            matchData={matchData}
            finishOrder={G.finishOrder}
            playerIDs={positions.bottom}
            passedPlayers={passedPlayersForList}
            horizontal
          />
        </div>
      </div>

      {/* Hand: only for active players, hidden during round-over */}
      {!isRoundOver && isActivePlayer && myPlayer && (
        <Hand
          cards={myPlayer.hand}
          isMyTurn={isMyTurn}
          currentTrick={G.currentTrick}
          inTaxPhase={inTaxPhase}
          taxDebt={myTaxDebt}
          taxReceivable={myTaxReceivable}
          hasTaxRole={hasTaxRole}
          allPlayersReady={allPlayersReady}
          hasPendingTax={hasPendingTax}
          onPlayCards={(ids) => moves.playCards(ids)}
          onPass={() => moves.pass()}
          onGiveBackCards={(ids) => moves.giveBackCards(playerID, ids)}
          canDeclareRevolution={canDeclareRevolution}
          onDeclareRevolution={() => moves.declareRevolution(playerID)}
          hasMarkedReady={hasMarkedReady}
          onMarkReady={() => moves.markReady(playerID)}
        />
      )}

      {/* Round-over overlay */}
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
                    {isHost && id !== '0' && (
                      <button
                        className={styles.kickBtnSmall}
                        onClick={() => moves.kickPlayer(playerID, id)}
                        title="Kick player"
                      >
                        ✕
                      </button>
                    )}
                  </li>
                );
              })}
              {/* Show players who requested to join next round */}
              {G.pendingJoinIDs.map((id) => {
                const name = matchData?.find((p) => String(p.id) === id)?.name ?? `Player ${id}`;
                return (
                  <li key={id} className={styles.finishItem}>
                    <span className={styles.finishPos}>—</span>
                    <span className={styles.finishName}>{name}</span>
                    <span className={styles.finishTitle}>Joining next round</span>
                  </li>
                );
              })}
            </ol>

            {/* Non-active player: request to join next round */}
            {canJoinMidGame && (
              <button
                className={styles.startBtn}
                onClick={() => moves.joinMidGame(playerID)}
                disabled={hasPendingJoin}
                style={{ marginBottom: '12px' }}
              >
                {hasPendingJoin ? 'Joining next round…' : 'Join Next Round'}
              </button>
            )}

            {/* Host: start next round */}
            {isHost ? (
              <button
                className={styles.startBtn}
                onClick={() => moves.advanceRound(playerID)}
              >
                Start Next Round
              </button>
            ) : (
              <p className={styles.countdownMsg}>Waiting for host to start the next round…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
