// Rank of a card. 1 = Great Dalmuti (best), 12 = worst. 0 = Joker (wild when paired).
export type CardRank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

// Effective rank of a played trick. Jokers played alone count as 13 (worse than any normal card).
export type TrickRank = CardRank | 13;

export interface Card {
  rank: CardRank;
  // Unique ID used by the UI to track/animate individual cards
  id: string;
}

// 1 = Great Dalmuti (best social position), higher number = worse position
export type SocialRank = number | null;

export interface PlayerState {
  // Cards in this player's hand. Stripped from other players' views via playerView.
  hand: Card[];
  // Social rank held entering this round. null = first round (no hierarchy yet).
  socialRank: SocialRank;
  // Display name set during lobby join
  name: string;
  // Has this player played out all their cards this round?
  finished: boolean;
  // Order in which this player finished (1 = first out). null if not yet finished.
  finishPosition: number | null;
}

export interface TaxDebt {
  // Lower-ranked player who must give cards
  fromPlayerID: string;
  // Higher-ranked player who receives cards
  toPlayerID: string;
  // Number of cards to transfer
  count: number;
  // Cards selected by the payer, pending transfer
  offeredCards: Card[];
}

export interface Trick {
  cards: Card[];
  // The rank these cards represent. Jokers paired with other cards use the non-Joker rank;
  // Jokers played alone use 13 (weaker than any normal card).
  rank: TrickRank;
  // How many cards were played
  count: number;
  // PlayerID of who played this trick
  playedBy: string;
}

export interface DalmutiState {
  // Keyed by playerID string ("0", "1", ...).
  // Each client only sees its own full hand; others have hand: [].
  players: Record<string, PlayerState>;

  // Cards currently in the center play area. null = area is clear (round start or all passed).
  currentTrick: Trick | null;

  // PlayerID of whoever last played (not passed).
  // When all others pass, this player leads the next trick.
  lastPlayerToPlay: string | null;

  // PlayerIDs ordered by finish position (index 0 = Great Dalmuti next round).
  finishOrder: string[];

  // Pending tax transfers to resolve before the play phase each round.
  taxDebts: TaxDebt[];

  // PlayerIDs who have passed on the current trick. Cleared on each new play.
  passedPlayers: string[];

  // Display counter
  roundNumber: number;

  // Revolution state for the current round (cleared at the start of each tax phase).
  // revolutionDeclaredBy: the playerID who called it, or null if no revolution.
  // isGreaterRevolution: true when the Greater Peon called it (ranks are inverted).
  revolutionDeclaredBy: string | null;
  isGreaterRevolution: boolean;

  // Randomized seat order set by the owner when starting the game.
  // Populated in the lobby phase; used as the play order for all subsequent phases.
  // Empty array means the game hasn't started yet (lobby phase is active).
  seatOrder: string[];

  // Set to true by playCards/pass when the current trick is detected as won.
  // turn.onBegin reads this flag to know whether to clear currentTrick and
  // passedPlayers before the next trick leader's turn. Without this, onBegin
  // would incorrectly clear trick state on every mid-trick turn advance.
  pendingNewTrick: boolean;

  // Players who have clicked "Ready" in the tax phase.
  // The phase won't advance to play until all players are in this list
  // AND all tax debts are resolved. This ensures the tax screen is always
  // seen — even in round 1 where there is no actual taxation.
  readyPlayers: string[];

  // Set to true by advanceRound; watched by roundOverPhase.endIf.
  // Avoids relying on events.endPhase() from inside a move, which is
  // unreliable in boardgame.io 0.50.x.
  roundOverDone: boolean;
}
