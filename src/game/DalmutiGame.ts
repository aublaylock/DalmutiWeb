import type { Game } from 'boardgame.io';
import type { DalmutiState, Card, CardRank } from './types';
import { lobbyPhase, taxPhase, playPhase, roundOverPhase } from './phases';
import { buildDeck } from './deck';

// ---------------------------------------------------------------------------
// Game definition
// ---------------------------------------------------------------------------

export const DalmutiGame: Game<DalmutiState> = {
  name: 'great-dalmuti',

  minPlayers: 4,
  maxPlayers: 8,

  setup: ({ ctx, random }): DalmutiState => {
    const deck = random.Shuffle(buildDeck());

    // Deal cards round-robin across all players
    const hands: Record<string, Card[]> = {};
    for (let i = 0; i < ctx.numPlayers; i++) {
      hands[String(i)] = [];
    }
    deck.forEach((card, i) => {
      hands[String(i % ctx.numPlayers)].push(card);
    });

    const players: DalmutiState['players'] = {};
    for (let i = 0; i < ctx.numPlayers; i++) {
      const id = String(i);
      players[id] = {
        hand: hands[id],
        socialRank: null,
        name: `Player ${i + 1}`,
        finished: false,
        finishPosition: null,
      };
    }

    return {
      players,
      currentTrick: null,
      lastPlayerToPlay: null,
      finishOrder: [],
      taxDebts: [],
      passedPlayers: [],
      roundNumber: 1,
      revolutionDeclaredBy: null,
      isGreaterRevolution: false,
      seatOrder: [],
      pendingNewTrick: false,
      readyPlayers: [],
      roundOverDone: false,
    };
  },

  // ---------------------------------------------------------------------------
  // Secret state: strip other players' hands and hide incoming tax cards
  // ---------------------------------------------------------------------------
  playerView: ({ G, playerID }) => {
    if (playerID === null) return G; // Spectator

    const sanitizedPlayers: DalmutiState['players'] = {};
    for (const [id, player] of Object.entries(G.players)) {
      sanitizedPlayers[id] = id === playerID
        ? player
        // Replace each card with a blank placeholder so hand.length stays accurate
        // but card identities remain hidden from other clients.
        : { ...player, hand: Array.from({ length: player.hand.length }, (_, i) => ({ rank: 1 as CardRank, id: `hidden-${id}-${i}` })) };
    }

    // The Dalmuti (receiver) must not see the incoming cards until after they
    // have committed their give-back cards. Strip offeredCards from their view;
    // they can still see `count` to know how many face-down cards are incoming.
    const sanitizedDebts = G.taxDebts.map((debt) =>
      debt.toPlayerID === playerID
        ? { ...debt, offeredCards: [] }
        : debt
    );

    return { ...G, players: sanitizedPlayers, taxDebts: sanitizedDebts };
  },

  phases: {
    // Game starts in the lobby; owner clicks Start to randomise seats and begin.
    // After start: lobby → tax → play → roundOver → tax → play → roundOver → ...
    // Rounds loop indefinitely. The round-over phase shows results for 15 s.
    lobby: {
      ...lobbyPhase,
      start: true,
    },
    tax: taxPhase,
    play: playPhase,
    roundOver: roundOverPhase,
  },
};
