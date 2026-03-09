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
 * - Shuffles active (non-kicked) player IDs into G.seatOrder.
 * - Draws initial social ranks for active players only.
 * - Deals cards only to active players.
 */
export const startGame: Move<DalmutiState> = ({ G, ctx, random }) => {
  if (ctx.currentPlayer !== '0') return INVALID_MOVE;

  // Active players are those not kicked; require at least 4
  const activeIDs = G.activePlayerIDs.filter(id => !G.kickedPlayerIDs.includes(id));
  if (activeIDs.length < 4) return INVALID_MOVE;

  // Sync activePlayerIDs to only the non-kicked set
  G.activePlayerIDs = activeIDs;

  const n = activeIDs.length;

  // Randomise seating order for the play phase
  G.seatOrder = random.Shuffle([...activeIDs]);

  // Draw initial social ranks: shuffle active IDs to assign ranks 1..N.
  const initialOrder = random.Shuffle([...activeIDs]);
  G.finishOrder = initialOrder;
  initialOrder.forEach((id, index) => {
    G.players[id].socialRank = index + 1;
  });

  // Mark inactive/kicked players so the play phase skips them
  for (const id of Object.keys(G.players)) {
    if (!activeIDs.includes(id)) {
      G.players[id].hand = [];
      G.players[id].finished = true;
      G.players[id].finishPosition = null;
      G.players[id].socialRank = null;
    }
  }

  // Deal the first hand to active players only
  for (const id of activeIDs) {
    G.players[id].hand = [];
  }
  const deck = random.Shuffle(buildDeck());
  deck.forEach((card, i) => {
    G.players[activeIDs[i % n]].hand.push(card);
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
// Host / Joining Moves
// ---------------------------------------------------------------------------

/**
 * Called by the host to remove a player from active participation.
 * Available in lobby (regular move, host is currentPlayer) and during
 * roundOver (stage move, callerID identifies the host).
 * Kicked players are permanently excluded unless reinstated via G state edits.
 */
export const kickPlayer: Move<DalmutiState> = ({ G, ctx }, callerID: string, targetID: string) => {
  // Auth: in regular (lobby) moves ctx.currentPlayer is reliable;
  // in stage moves we rely on callerID — accept both.
  const caller = callerID ?? ctx.currentPlayer;
  if (caller !== '0') return INVALID_MOVE;
  if (targetID === '0') return INVALID_MOVE; // can't kick the host
  if (!G.players[targetID]) return INVALID_MOVE;

  if (!G.kickedPlayerIDs.includes(targetID)) {
    G.kickedPlayerIDs.push(targetID);
  }
  G.activePlayerIDs = G.activePlayerIDs.filter(id => id !== targetID);
  G.pendingJoinIDs = G.pendingJoinIDs.filter(id => id !== targetID);
  G.players[targetID].hand = [];
  G.players[targetID].finished = true;
  G.players[targetID].finishPosition = null;
  G.players[targetID].socialRank = null;
};

/**
 * Called by a player who wants to join the game at the next round start.
 * Only available during the roundOver phase (stage move).
 * New players are added as merchants in advanceRound.
 */
export const joinMidGame: Move<DalmutiState> = ({ G }, callerID: string) => {
  if (!callerID || !G.players[callerID]) return INVALID_MOVE;
  if (G.kickedPlayerIDs.includes(callerID)) return INVALID_MOVE;
  if (G.activePlayerIDs.includes(callerID)) return INVALID_MOVE;
  if (!G.pendingJoinIDs.includes(callerID)) {
    G.pendingJoinIDs.push(callerID);
  }
};

// ---------------------------------------------------------------------------
// Round-Over Phase Moves
// ---------------------------------------------------------------------------

/**
 * Called by the room owner (player "0") to advance past the round-over screen.
 * Now a stage move — callerID identifies the host.
 *
 * Runs server-side (client: false) so random.Shuffle is available.
 * Also processes pending mid-game joiners and removed (kicked) players.
 */
export const advanceRound: Move<DalmutiState> = ({ G, random }, callerID: string) => {
  if (callerID !== '0') return INVALID_MOVE;

  // Incorporate any players who requested to join mid-game
  for (const newID of G.pendingJoinIDs) {
    if (!G.kickedPlayerIDs.includes(newID) && !G.activePlayerIDs.includes(newID)) {
      G.activePlayerIDs.push(newID);
    }
  }
  G.pendingJoinIDs = [];

  // Build the rank order for the new round:
  //  - Start from last round's finish order (determines tax payers)
  //  - Filter out any since-kicked players
  //  - Append new joiners at the merchant position (after the first 2 Dalmuties)
  const prevOrder = G.finishOrder.filter(id => G.activePlayerIDs.includes(id));
  const newJoiners = G.activePlayerIDs.filter(id => !prevOrder.includes(id));
  const insertPos = Math.min(2, prevOrder.length);
  const mergedOrder = [...prevOrder];
  mergedOrder.splice(insertPos, 0, ...newJoiners);

  // Assign social ranks based on the merged order
  mergedOrder.forEach((id, index) => {
    G.players[id].socialRank = index + 1;
  });

  const n = mergedOrder.length;

  // Clear play-area state left over from the previous round
  G.currentTrick = null;
  G.lastPlayerToPlay = null;
  G.passedPlayers = [];
  G.pendingNewTrick = false;

  // Reset round-level flags
  G.revolutionDeclaredBy = null;
  G.isGreaterRevolution = false;
  G.readyPlayers = [];

  // Clear all hands; then deal to active players only
  for (const id of Object.keys(G.players)) {
    G.players[id].hand = [];
    if (G.activePlayerIDs.includes(id)) {
      G.players[id].finished = false;
      G.players[id].finishPosition = null;
    } else {
      // Inactive/kicked players stay finished throughout
      G.players[id].finished = true;
      G.players[id].finishPosition = null;
      G.players[id].socialRank = null;
    }
  }
  const deck = random.Shuffle(buildDeck());
  deck.forEach((card, i) => {
    G.players[mergedOrder[i % n]].hand.push(card);
  });

  // Set up tax debts based on the merged rank order
  G.taxDebts = [];
  if (n >= 2) {
    G.taxDebts.push({
      fromPlayerID: mergedOrder[n - 1],
      toPlayerID: mergedOrder[0],
      count: 2,
      offeredCards: [],
    });
  }
  if (n >= 4) {
    G.taxDebts.push({
      fromPlayerID: mergedOrder[n - 2],
      toPlayerID: mergedOrder[1],
      count: 1,
      offeredCards: [],
    });
  }

  // Auto-stage each peon's best non-Joker cards as tax payment.
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

  // The two Jesters are spent to declare the revolution — remove them from the caller's hand
  player.hand = player.hand.filter((c) => c.rank !== 0);

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
  // Exchange is locked until every active player has agreed (markReady) to the tax
  if (G.readyPlayers.length < G.activePlayerIDs.length) return INVALID_MOVE;

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
