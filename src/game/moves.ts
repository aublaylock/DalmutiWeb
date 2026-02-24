import { INVALID_MOVE } from 'boardgame.io/core';
import type { Move } from 'boardgame.io';
import type { DalmutiState, Card, TrickRank } from './types';
import { buildDeck } from './deck';

/**
 * After any play/pass, check whether the current trick has been won
 * (all active players except the last to play have now passed).
 * If so, set G.pendingNewTrick = true so that turn.onBegin knows to clear
 * G.currentTrick and G.passedPlayers before the next trick leader's turn.
 */
function markTrickWonIfComplete(G: DalmutiState): void {
  if (G.currentTrick === null || G.lastPlayerToPlay === null) return;
  const activePlayers = Object.keys(G.players).filter((id) => !G.players[id].finished);
  const stillNeedToRespond = activePlayers.filter(
    (id) => id !== G.lastPlayerToPlay && !G.passedPlayers.includes(id)
  );
  if (stillNeedToRespond.length === 0) {
    G.pendingNewTrick = true;
  }
}

// ---------------------------------------------------------------------------
// Play Phase Moves
// ---------------------------------------------------------------------------

/**
 * Play a set of cards. Rules:
 *  - All non-Joker cards must share the same rank.
 *  - Jokers are wild when played alongside at least one non-Joker card (they
 *    substitute for that rank). Jokers played alone carry effective rank 13,
 *    which is weaker than any normal card (1–12) and can be beaten by anything.
 *
 * If a trick is active, the play must:
 *  - Use the same number of cards as the current trick.
 *  - Have a lower effective rank (better) than the current trick.
 */
export const playCards: Move<DalmutiState> = ({ G, ctx }, cardIds: string[]) => {
  const playerID = ctx.currentPlayer;
  const player = G.players[playerID];

  if (!cardIds || cardIds.length === 0) return INVALID_MOVE;

  // Validate all card IDs exist in this player's hand
  const playedCards: Card[] = [];
  for (const id of cardIds) {
    const card = player.hand.find((c) => c.id === id);
    if (!card) return INVALID_MOVE;
    playedCards.push(card);
  }

  const jesters = playedCards.filter((c) => c.rank === 0);
  const nonJesters = playedCards.filter((c) => c.rank !== 0);

  // All non-Jester cards must be the same rank
  const uniqueRanks = new Set(nonJesters.map((c) => c.rank));
  if (uniqueRanks.size > 1) return INVALID_MOVE;

  // Jokers played alongside other cards are wild (use the non-Joker rank).
  // Jokers played alone carry effective rank 13 — weaker than any normal card.
  const playedRank: TrickRank = nonJesters.length > 0
    ? nonJesters[0].rank
    : 13;

  if (G.currentTrick !== null) {
    // Must match the current trick count
    if (playedCards.length !== G.currentTrick.count) return INVALID_MOVE;
    // Must beat current trick: lower rank number is better (13 beats nothing)
    if (playedRank >= G.currentTrick.rank) return INVALID_MOVE;
  }

  // Remove played cards from hand
  const playedIdSet = new Set(cardIds);
  player.hand = player.hand.filter((c) => !playedIdSet.has(c.id));

  // Update the play area (rank 13 signals Jokers-alone trick)
  G.currentTrick = {
    cards: playedCards,
    rank: playedRank,
    count: playedCards.length,
    playedBy: playerID,
  };
  G.lastPlayerToPlay = playerID;
  G.passedPlayers = [];

  // Mark player finished if hand is empty
  if (player.hand.length === 0) {
    player.finished = true;
    player.finishPosition = G.finishOrder.length + 1;
    G.finishOrder.push(playerID);
  }

  // Flag the trick as won if all remaining active players are accounted for.
  // (Possible when only one unfinished player remains after this play.)
  markTrickWonIfComplete(G);
};

/**
 * Pass on the current trick. The current player declines to play.
 * Cannot pass if there is no active trick (must play to open).
 */
export const pass: Move<DalmutiState> = ({ G, ctx }) => {
  if (G.currentTrick === null) return INVALID_MOVE;
  G.passedPlayers.push(ctx.currentPlayer);
  // Flag the trick as won if this was the last pass needed.
  markTrickWonIfComplete(G);
};

// ---------------------------------------------------------------------------
// Lobby Phase Moves
// ---------------------------------------------------------------------------

/**
 * Called by the room owner (player "0") to start the game.
 * - Shuffles all player IDs into G.seatOrder (the fixed play order).
 * - Draws initial social ranks by randomly assigning positions 1..N,
 *   equivalent to each player drawing a unique card from a shuffled deck.
 *   This populates G.finishOrder and socialRank so that round-1 taxation
 *   works exactly like every subsequent round.
 */
export const startGame: Move<DalmutiState> = ({ G, ctx, random }) => {
  if (ctx.currentPlayer !== '0') return INVALID_MOVE;

  const playerIDs = Object.keys(G.players);
  const n = ctx.numPlayers;

  // Randomise seating order for the play phase
  G.seatOrder = random.Shuffle([...playerIDs]);

  // Draw initial social ranks: shuffle player IDs to assign ranks 1..N.
  // Index 0 → Great Dalmuti (rank 1), last index → Greater Peon (rank N).
  const initialOrder = random.Shuffle([...playerIDs]);
  G.finishOrder = initialOrder;
  initialOrder.forEach((id, index) => {
    G.players[id].socialRank = index + 1;
  });

  // Deal the first hand (server-side so random.Shuffle is available)
  for (const id of playerIDs) {
    G.players[id].hand = [];
  }
  const deck = random.Shuffle(buildDeck());
  deck.forEach((card, i) => {
    G.players[String(i % n)].hand.push(card);
  });

  // Set up round-1 tax debts based on the randomly drawn initial ranks
  G.taxDebts = [];
  if (n >= 2) {
    G.taxDebts.push({
      fromPlayerID: initialOrder[n - 1],
      toPlayerID: initialOrder[0],
      count: 2,
      offeredCards: [],
    });
  }
  if (n >= 4) {
    G.taxDebts.push({
      fromPlayerID: initialOrder[n - 2],
      toPlayerID: initialOrder[1],
      count: 1,
      offeredCards: [],
    });
  }

  // Auto-stage each peon's best non-Joker cards as tax payment.
  // Jokers (rank 0) count as rank 13 for taxation — never forcibly taken.
  for (const debt of G.taxDebts) {
    const payer = G.players[debt.fromPlayerID];
    const sortedHand = [...payer.hand].sort((a, b) => {
      const ra = a.rank === 0 ? 13 : a.rank;
      const rb = b.rank === 0 ? 13 : b.rank;
      return ra - rb;
    });
    const bestCards = sortedHand.slice(0, debt.count);
    const bestIds = new Set(bestCards.map((c) => c.id));
    payer.hand = payer.hand.filter((c) => !bestIds.has(c.id));
    debt.offeredCards = bestCards;
  }
};

// ---------------------------------------------------------------------------
// Round-Over Phase Moves
// ---------------------------------------------------------------------------

/**
 * Called by the room owner (player "0") to advance past the round-over screen.
 * The Board auto-fires this after a 15-second countdown.
 *
 * Runs server-side (client: false) so random.Shuffle is available.
 * Does all round setup here — card dealing, taxation, flag resets — rather
 * than in taxPhase.onBegin, because the random plugin is not reliably available
 * in phase hooks in boardgame.io 0.50.x. Setting G.roundOverDone = true at the
 * end signals roundOverPhase.endIf to transition to the tax phase.
 */
export const advanceRound: Move<DalmutiState> = ({ G, ctx, random }) => {
  const n = ctx.numPlayers;

  // Clear play-area state left over from the previous round
  G.currentTrick = null;
  G.lastPlayerToPlay = null;
  G.passedPlayers = [];
  G.pendingNewTrick = false;

  // Reset round-level flags
  G.revolutionDeclaredBy = null;
  G.isGreaterRevolution = false;
  G.readyPlayers = [];

  // Deal a fresh shuffled deck to all players
  for (const id of Object.keys(G.players)) {
    G.players[id].hand = [];
  }
  const deck = random.Shuffle(buildDeck());
  deck.forEach((card, i) => {
    G.players[String(i % n)].hand.push(card);
  });

  // Set up tax debts based on the finish order from the round that just ended.
  // G.finishOrder is populated by playPhase.onEnd and is still intact here
  // (playPhase.onBegin resets it later when the new play phase begins).
  const order = G.finishOrder;
  G.taxDebts = [];
  if (order.length >= 2) {
    G.taxDebts.push({
      fromPlayerID: order[n - 1],
      toPlayerID: order[0],
      count: 2,
      offeredCards: [],
    });
  }
  if (order.length >= 4) {
    G.taxDebts.push({
      fromPlayerID: order[n - 2],
      toPlayerID: order[1],
      count: 1,
      offeredCards: [],
    });
  }

  // Auto-stage each peon's best non-Joker cards as tax payment.
  // Jokers (rank 0) count as rank 13 for taxation — never forcibly taken.
  for (const debt of G.taxDebts) {
    const payer = G.players[debt.fromPlayerID];
    const sortedHand = [...payer.hand].sort((a, b) => {
      const ra = a.rank === 0 ? 13 : a.rank;
      const rb = b.rank === 0 ? 13 : b.rank;
      return ra - rb;
    });
    const bestCards = sortedHand.slice(0, debt.count);
    const bestIds = new Set(bestCards.map((c) => c.id));
    payer.hand = payer.hand.filter((c) => !bestIds.has(c.id));
    debt.offeredCards = bestCards;
  }

  // Reset per-player round state so playPhase.endIf doesn't see stale finished
  // flags from the previous round. playPhase.onBegin does the same reset, but
  // boardgame.io 0.50.x can evaluate endIf before onBegin in certain transitions.
  for (const id of Object.keys(G.players)) {
    G.players[id].finished = false;
    G.players[id].finishPosition = null;
  }

  // Signal roundOverPhase.endIf to transition to the tax phase
  G.roundOverDone = true;
};

// ---------------------------------------------------------------------------
// Tax Phase Moves
// ---------------------------------------------------------------------------

/**
 * Called by any player in the tax phase to signal they are ready to play.
 * The tax phase doesn't advance until all players have called this AND all
 * tax debts are resolved. For the Dalmuti, call markReady after giving back
 * cards. For Peons and Merchants, call it as soon as you're satisfied.
 *
 * callerID is passed explicitly by the client because in boardgame.io's
 * activePlayers stage mode ctx.currentPlayer reflects the *turn's* current
 * player, not the player who invoked the stage move.
 */
export const markReady: Move<DalmutiState> = ({ G }, callerID: string) => {
  if (!callerID || !G.players[callerID]) return INVALID_MOVE;
  if (!G.readyPlayers.includes(callerID)) {
    G.readyPlayers.push(callerID);
  }
};

/**
 * Declare a Revolution. Valid only during the tax phase, before any exchange
 * has completed, by a player who holds both Jokers (including any that were
 * auto-staged as tax from their hand).
 *
 * Regular Revolution (any player): cancels all taxation for this round.
 * Greater Revolution (Greater Peon only): also immediately inverts every
 *   player's social rank (the former losers become the new ruling class).
 *
 * Runs server-side so it can see all hands and debts unfiltered.
 */
export const declareRevolution: Move<DalmutiState> = ({ G }, callerID: string) => {
  const playerID = callerID;
  const player = G.players[playerID];
  if (!player) return INVALID_MOVE;
  const n = Object.keys(G.players).length;

  // Player must hold both Jokers. Check their hand AND any cards that were
  // auto-staged as their tax payment (peon's best cards were moved to offeredCards).
  const myDebt = G.taxDebts.find((d) => d.fromPlayerID === playerID);
  const handJokers = player.hand.filter((c) => c.rank === 0).length;
  const stagedJokers = myDebt ? myDebt.offeredCards.filter((c) => c.rank === 0).length : 0;
  if (handJokers + stagedJokers < 2) return INVALID_MOVE;

  // Return all auto-staged tax cards before cancelling debts
  for (const debt of G.taxDebts) {
    if (debt.offeredCards.length > 0) {
      G.players[debt.fromPlayerID].hand.push(...debt.offeredCards);
      debt.offeredCards = [];
    }
  }

  // Determine if this is a Greater Revolution (declarer is the Greater Peon)
  const isGreater = G.finishOrder.length >= n && G.finishOrder[n - 1] === playerID;

  if (isGreater) {
    // Invert all social ranks: last becomes first, first becomes last
    G.finishOrder = [...G.finishOrder].reverse();
    G.finishOrder.forEach((id, index) => {
      G.players[id].socialRank = index + 1;
    });
    G.isGreaterRevolution = true;
  }

  // Cancel all tax debts — taxPhase.endIf sees empty debts and exits the phase
  G.taxDebts = [];
  G.revolutionDeclaredBy = playerID;
};

/**
 * Called by the receiving player to give back their worst cards in exchange
 * for the tax cards they receive. The Great Dalmuti gives 2 worst back, etc.
 * Marked client: false — runs server-side only.
 *
 * callerID is passed explicitly by the client because in boardgame.io's
 * activePlayers stage mode ctx.currentPlayer reflects the *turn's* current
 * player, not the player who invoked the stage move.
 */
export const giveBackCards: Move<DalmutiState> = ({ G }, callerID: string, cardIds: string[]) => {
  const playerID = callerID;

  const debt = G.taxDebts.find(
    (d) => d.toPlayerID === playerID && d.offeredCards.length > 0
  );
  if (!debt) return INVALID_MOVE;
  if (cardIds.length !== debt.count) return INVALID_MOVE;

  const receiver = G.players[playerID];
  const payer = G.players[debt.fromPlayerID];

  // Validate give-back cards are in receiver's hand
  const giveBackCards: Card[] = [];
  for (const id of cardIds) {
    const card = receiver.hand.find((c) => c.id === id);
    if (!card) return INVALID_MOVE;
    giveBackCards.push(card);
  }

  // Transfer: receiver gets tax cards, payer gets give-back cards
  const giveBackIdSet = new Set(cardIds);
  receiver.hand = receiver.hand.filter((c) => !giveBackIdSet.has(c.id));
  receiver.hand.push(...debt.offeredCards);
  payer.hand.push(...giveBackCards);

  // Mark debt as fully resolved by clearing it
  debt.offeredCards = [];
  debt.count = 0;
};
