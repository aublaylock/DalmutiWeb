import { useEffect, useRef, useState } from 'react';
import type { Card, Trick, TaxDebt } from '../../game/types';
import { CardComponent } from '../Card/Card';
import styles from './Hand.module.css';

interface HandProps {
  cards: Card[];
  isMyTurn: boolean;
  currentTrick: Trick | null;
  inTaxPhase: boolean;
  /** Debt where this player is the payer (Peon). Their best cards were auto-staged. */
  taxDebt: TaxDebt | null;
  /** Debt where this player is the receiver (Dalmuti). They must choose cards to give back. */
  taxReceivable: TaxDebt | null;
  /** True when this player holds both Jokers and may call a Revolution. */
  canDeclareRevolution: boolean;
  /** True when this player has already called markReady this tax phase. */
  hasMarkedReady: boolean;
  /** True if this player is (or was) involved in a tax debt this round — suppresses the "no taxation" banner after a Dalmuti finishes giving back cards. */
  hasTaxRole: boolean;
  onPlayCards: (cardIds: string[]) => void;
  onPass: () => void;
  onGiveBackCards: (cardIds: string[]) => void;
  onDeclareRevolution: () => void;
  onMarkReady: () => void;
}

export function Hand({
  cards,
  isMyTurn,
  currentTrick,
  inTaxPhase,
  taxDebt,
  taxReceivable,
  canDeclareRevolution,
  hasMarkedReady,
  hasTaxRole,
  onPlayCards,
  onPass,
  onGiveBackCards,
  onDeclareRevolution,
  onMarkReady,
}: HandProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Track card IDs from the previous render to detect newly received tax cards.
  // Starts as null so the very first render (initial hand) is never highlighted.
  const prevCardIds = useRef<Set<string> | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = new Set(cards.map((c) => c.id));

    if (!inTaxPhase) {
      setHighlightedIds(new Set());
      prevCardIds.current = currentIds;
      return;
    }

    // First render in tax phase: snapshot cards without highlighting
    if (prevCardIds.current === null) {
      prevCardIds.current = currentIds;
      return;
    }

    const added = new Set([...currentIds].filter((id) => !prevCardIds.current!.has(id)));
    prevCardIds.current = currentIds;

    if (added.size > 0) {
      setHighlightedIds(added);
      const timer = setTimeout(() => setHighlightedIds(new Set()), 8000);
      return () => clearTimeout(timer);
    }
  }, [cards, inTaxPhase]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCard = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handlePlay = () => {
    if (selected.size === 0) return;
    onPlayCards([...selected]);
    setSelected(new Set());
  };

  const handlePass = () => {
    setSelected(new Set());
    onPass();
  };

  const handleGiveBack = () => {
    if (!taxReceivable || selected.size !== taxReceivable.count) return;
    onGiveBackCards([...selected]);
    setSelected(new Set());
  };

  // Sort hand: Jokers first (rank 0), then ascending rank
  const sortedCards = [...cards].sort((a, b) => {
    if (a.rank === 0) return -1;
    if (b.rank === 0) return 1;
    return a.rank - b.rank;
  });

  // offeredCards is stripped from the Dalmuti's playerView, so use count > 0
  // (guaranteed by Board.tsx) as the signal that action is required.
  const isDalmuti = taxReceivable !== null;
  const isPeon = taxDebt !== null;

  const canPlay = isMyTurn && !inTaxPhase && selected.size > 0;
  const canPass = isMyTurn && !inTaxPhase && currentTrick !== null;
  const canGiveBack = isDalmuti && selected.size === taxReceivable!.count;

  // Cards are interactive during play (on your turn) or when Dalmuti must give back
  const cardsInteractive = (!inTaxPhase && isMyTurn) || isDalmuti;

  // Show the Ready button once any pending give-back is resolved.
  // Peons and Merchants see it immediately; Dalmuties see it after giving back.
  const showReadyBtn = inTaxPhase && !isDalmuti && !hasMarkedReady;

  return (
    <div className={styles.handArea}>
      {/* Dalmuti: face-down incoming cards (contents hidden until after give-back) */}
      {isDalmuti && (
        <div className={styles.incomingSection}>
          <p className={styles.taxPrompt}>
            You are receiving {taxReceivable!.count} hidden card{taxReceivable!.count > 1 ? 's' : ''} —
            choose {taxReceivable!.count} from your hand to give back
          </p>
        </div>
      )}

      {/* Peon: show which cards were automatically sent as tax */}
      {inTaxPhase && isPeon && !isDalmuti && (
        <div className={styles.incomingSection}>
          <p className={styles.taxPrompt}>
            Sent as tax ({taxDebt!.offeredCards.length}/{taxDebt!.count} card{taxDebt!.count > 1 ? 's' : ''}):
          </p>
          <div className={styles.incomingCards}>
            {taxDebt!.offeredCards.map((card) => (
              <CardComponent key={card.id} card={card} />
            ))}
          </div>
          {!hasMarkedReady && (
            <p className={styles.waitingMsg}>Click Ready when you're satisfied.</p>
          )}
          {hasMarkedReady && (
            <p className={styles.waitingMsg}>Waiting for the Dalmuti…</p>
          )}
        </div>
      )}

      {/* Merchant: no taxation (not involved in any debt this round) */}
      {inTaxPhase && !hasTaxRole && (
        <div className={styles.incomingSection}>
          <p className={styles.taxPrompt}>
            No taxation for you this round.
          </p>
        </div>
      )}

      <div className={styles.cards}>
        {sortedCards.map((card) => (
          <CardComponent
            key={card.id}
            card={card}
            selected={selected.has(card.id)}
            onClick={() => toggleCard(card.id)}
            interactive={cardsInteractive}
            highlighted={highlightedIds.has(card.id)}
          />
        ))}
      </div>

      <div className={styles.actions}>
        {!inTaxPhase && (
          <>
            <button
              className={styles.playBtn}
              onClick={handlePlay}
              disabled={!canPlay}
            >
              Play ({selected.size})
            </button>
            <button
              className={styles.passBtn}
              onClick={handlePass}
              disabled={!canPass}
            >
              Pass
            </button>
          </>
        )}
        {isDalmuti && (
          <button
            className={styles.taxBtn}
            onClick={handleGiveBack}
            disabled={!canGiveBack}
          >
            Give Back ({selected.size}/{taxReceivable!.count})
          </button>
        )}
        {showReadyBtn && (
          <button className={styles.readyBtn} onClick={onMarkReady}>
            Ready for Round
          </button>
        )}
        {inTaxPhase && hasMarkedReady && !isDalmuti && (
          <button className={styles.readyBtn} disabled>
            Ready ✓
          </button>
        )}
        {inTaxPhase && canDeclareRevolution && (
          <button
            className={styles.revolutionBtn}
            onClick={onDeclareRevolution}
          >
            Declare Revolution
          </button>
        )}
      </div>
    </div>
  );
}
