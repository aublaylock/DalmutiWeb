import type { PhaseConfig, Move } from 'boardgame.io';
import type { DalmutiState } from './types';
import { playCards, pass, giveBackCards, declareRevolution, startGame, markReady, advanceRound } from './moves';

// ---------------------------------------------------------------------------
// Lobby Phase
// ---------------------------------------------------------------------------
// Players gather here after joining. Only the room owner (player "0") can act.
// When the owner calls startGame, seatOrder is randomised and the phase ends,
// transitioning to the tax phase (round 1 – no actual taxation, but players
// must click Ready before play begins).

export const lobbyPhase: PhaseConfig<DalmutiState> = {
  start: false, // set to true in DalmutiGame.ts

  moves: {
    startGame: { move: startGame, client: false } as Move<DalmutiState>,
  },

  // Phase ends as soon as seatOrder has been populated by startGame
  endIf: ({ G }) => G.seatOrder.length > 0 ? true : undefined,

  next: 'tax',

  turn: {
    // Keep the turn permanently on player "0" (the room owner).
    // Other players cannot make moves; they simply wait.
    order: {
      first: () => 0,
      next: () => 0,
    },
  },
};

// ---------------------------------------------------------------------------
// Tax Phase
// ---------------------------------------------------------------------------
// Runs before every play round (including round 1, where there is no actual
// taxation). Players must click Ready to proceed. For rounds 2+, Peons'
// best cards are auto-staged and Dalmuties must choose give-back cards.
//
// Tax rules:
//   - 1st place (Great Dalmuti) receives 2 cards from last place (Peon)
//   - 2nd place (Lesser Dalmuti) receives 1 card from 2nd-to-last (Lesser Peon)
//
// Phase does not end until ALL debts are resolved AND every player has
// clicked Ready. This way even round 1 (no debts) requires explicit confirmation.

export const taxPhase: PhaseConfig<DalmutiState> = {
  start: false,

  onBegin: ({ G }) => {
    // Card dealing, taxation setup, and debt auto-staging are all done
    // server-side in startGame (round 1) and advanceRound (rounds 2+),
    // where random.Shuffle is reliably available. This hook only resets
    // the lightweight flags that were not yet cleared by those moves.
    G.roundOverDone = false;
    G.readyPlayers = [];
    G.revolutionDeclaredBy = null;
    G.isGreaterRevolution = false;
  },

  onEnd: ({ G }) => {
    // Clean up any unresolved debts
    G.taxDebts = [];
  },

  // Phase ends when all debts are resolved AND every player has clicked Ready.
  // For round 1: no debts (allResolved = true immediately), so only readyPlayers
  // gate applies — players must explicitly confirm before play starts.
  endIf: ({ G, ctx }) => {
    const allResolved = G.taxDebts.every((d) => d.count === 0);
    const allReady = G.readyPlayers.length >= ctx.numPlayers;
    return (allResolved && allReady) ? true : undefined;
  },

  next: 'play',

  turn: {
    // All players are placed in the stage; Dalmuties give back cards and then
    // mark ready; Peons and Merchants mark ready as soon as they're satisfied.
    activePlayers: {
      all: 'waitingForTax',
    },
    stages: {
      waitingForTax: {
        moves: {
          giveBackCards: { move: giveBackCards, client: false } as Move<DalmutiState>,
          // Any player with both Jokers may cancel taxation (and invert ranks if Greater Peon)
          declareRevolution: { move: declareRevolution, client: false } as Move<DalmutiState>,
          // All players call this to signal they're ready to begin playing
          markReady: { move: markReady, client: false } as Move<DalmutiState>,
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Round-Over Phase
// ---------------------------------------------------------------------------
// Sits between playPhase and taxPhase. Displays round results for 15 seconds
// then automatically advances. The room owner's client fires advanceRound()
// after the countdown; all clients see the same results screen.

export const roundOverPhase: PhaseConfig<DalmutiState> = {
  start: false,

  next: 'tax',

  // Ends as soon as the owner's 15-second timer fires advanceRound and sets
  // G.roundOverDone. Using endIf (declarative) instead of events.endPhase()
  // (imperative, unreliable inside moves in boardgame.io 0.50.x).
  endIf: ({ G }) => G.roundOverDone ? true : undefined,

  moves: {
    advanceRound: { move: advanceRound, client: false } as Move<DalmutiState>,
  },

  turn: {
    // Pin the active turn to player "0" (the room owner) so only their
    // client needs to fire advanceRound after the 15-second countdown.
    // playOrder must be explicitly set here: the play phase leaves a
    // rank-sorted playOrder in ctx, and without overriding it first: () => 0
    // would give the Great Dalmuti (not player "0") as currentPlayer.
    order: {
      playOrder: ({ ctx }) =>
        Array.from({ length: ctx.numPlayers }, (_, i) => String(i)),
      first: () => 0,
      next: () => 0,
    },
  },
};

// ---------------------------------------------------------------------------
// Play Phase
// ---------------------------------------------------------------------------
// Standard trick-taking round. The active player plays a set of cards or passes.
// Trick is won when all other active players pass in succession.
// Round ends when all players have emptied their hands, then transitions to
// the roundOver phase (15-second results screen) before the next tax phase.

export const playPhase: PhaseConfig<DalmutiState> = {
  start: false,

  onBegin: ({ G }) => {
    G.currentTrick = null;
    G.lastPlayerToPlay = null;
    G.passedPlayers = [];
    G.pendingNewTrick = false;
    // Reset per-round player state
    for (const id of Object.keys(G.players)) {
      G.players[id].finished = false;
      G.players[id].finishPosition = null;
    }
    G.finishOrder = [];
  },

  onEnd: ({ G }) => {
    // The last player still holding cards when everyone else is done is
    // automatically the Greater Peon — they never got to finish naturally.
    const lastPlayer = Object.entries(G.players).find(([, p]) => !p.finished);
    if (lastPlayer) {
      const [id, player] = lastPlayer;
      player.finished = true;
      player.finishPosition = G.finishOrder.length + 1;
      G.finishOrder.push(id);
    }
    // Snapshot social ranks for next round's tax calculation
    G.finishOrder.forEach((playerID, index) => {
      G.players[playerID].socialRank = index + 1;
    });
    G.roundNumber += 1;
  },

  // Round ends when at most one player has cards remaining.
  // (That last player is automatically the Greater Peon, handled in onEnd.)
  endIf: ({ G }) => {
    const activeCount = Object.values(G.players).filter((p) => !p.finished).length;
    return activeCount <= 1 ? true : undefined;
  },

  // Transition to round-over screen, not directly to tax
  next: 'roundOver',

  moves: {
    playCards,
    pass,
  },

  turn: {
    // Each player makes exactly one action (play or pass) per turn.
    // boardgame.io then advances to the next player via order.next.
    moveLimit: 1,

    // Only clear trick state when a new trick is genuinely starting.
    // pendingNewTrick is set by playCards/pass when the trick is detected as won.
    // Without this guard, onBegin would wipe currentTrick on every mid-trick
    // turn advance and break in-progress tricks.
    onBegin: ({ G }) => {
      if (G.pendingNewTrick) {
        G.currentTrick = null;
        G.passedPlayers = [];
        G.pendingNewTrick = false;
      }
    },

    // Trick is won when all active players except the last to play have passed.
    endIf: ({ G, ctx }) => {
      if (G.currentTrick === null) return undefined;

      const activePlayers = Object.keys(G.players).filter(
        (id) => !G.players[id].finished
      );

      // Everyone except the last player to play has passed → trick won
      const stillNeedToRespond = activePlayers.filter(
        (id) => id !== G.lastPlayerToPlay && !G.passedPlayers.includes(id)
      );

      if (stillNeedToRespond.length === 0 && G.lastPlayerToPlay !== null) {
        // The winner leads the next trick. If they played their last card and
        // finished on this play, pass the lead to the next unfinished player
        // by social rank (one rank lower, wrapping from Greater Peon back to
        // Great Dalmuti).
        let nextLeader = G.lastPlayerToPlay;
        if (G.players[nextLeader]?.finished) {
          const winnerRank = G.players[nextLeader]?.socialRank ?? 0;
          // Collect unfinished players sorted by rank ascending (1 = best)
          const unfinished = Object.entries(G.players)
            .filter(([, p]) => !p.finished)
            .map(([id, p]) => ({ id, rank: p.socialRank ?? 0 }))
            .sort((a, b) => a.rank - b.rank);
          if (unfinished.length > 0) {
            // Pick the next player with a strictly higher rank number, or wrap to lowest
            nextLeader = (unfinished.find((p) => p.rank > winnerRank) ?? unfinished[0]).id;
          }
        }
        return { next: nextLeader };
      }
      return undefined;
    },

    order: {
      // Play order is social rank ascending: rank 1 (Great Dalmuti) first, then
      // rank 2, …, rank N (Greater Peon). This gives clockwise table movement.
      // Social ranks are always set before the play phase starts (by startGame
      // on round 1, or by playPhase.onEnd for subsequent rounds).
      playOrder: ({ G }) =>
        Object.keys(G.players).sort(
          (a, b) => (G.players[a].socialRank ?? 0) - (G.players[b].socialRank ?? 0)
        ),

      // Great Dalmuti (rank 1) is always at index 0 of the rank-sorted playOrder.
      // Subsequent trick leadership is handled by turn.endIf's { next } return.
      first: () => 0,

      // Next player within a trick: skip finished players, maintain rank order.
      next: ({ G, ctx }) => {
        let next = (ctx.playOrderPos + 1) % ctx.playOrder.length;
        let attempts = 0;
        while (G.players[ctx.playOrder[next]]?.finished && attempts < ctx.playOrder.length) {
          next = (next + 1) % ctx.playOrder.length;
          attempts++;
        }
        return next;
      },
    },
  },
};
