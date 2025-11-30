import { useEffect, useRef } from 'react';
import { GameState } from '@/lib/simulation/types';
import { AnimationManager } from '@/lib/simulation/animations';

/**
 * Hook that triggers animations based on game state changes
 */
export const useGameAnimations = (gameState: GameState | null, speed: number) => {
  const previousStateRef = useRef<GameState | null>(null);
  const cardRefsRef = useRef<Map<string, HTMLElement>>(new Map());

  // Update animation speed when changed
  useEffect(() => {
    AnimationManager.setSpeed(speed);
  }, [speed]);

  // Register a card element for animations
  const registerCard = (instanceId: string, element: HTMLElement | null) => {
    if (element) {
      cardRefsRef.current.set(instanceId, element);
    } else {
      cardRefsRef.current.delete(instanceId);
    }
  };

  // Detect and animate changes between game states
  useEffect(() => {
    if (!gameState || !previousStateRef.current) {
      previousStateRef.current = gameState;
      return;
    }

    const prevState = previousStateRef.current;
    const newState = gameState;

    // Helper to find card element
    const getCardElement = (instanceId: string) => {
      return cardRefsRef.current.get(instanceId);
    };

    // Check for zone changes
    const checkZoneChanges = (prevCards: any[], newCards: any[], zone: string) => {
      const prevIds = new Set(prevCards.map(c => c.instanceId));
      const newIds = new Set(newCards.map(c => c.instanceId));

      // Cards that left this zone
      prevIds.forEach(id => {
        if (!newIds.has(id)) {
          const element = getCardElement(id);
          if (element) {
            // Card left this zone - determine where it went
            if (zone === 'battlefield') {
              // Likely died or was exiled
              const inGY = newState.player1.graveyard.some(c => c.instanceId === id) ||
                           newState.player2.graveyard.some(c => c.instanceId === id);
              const inExile = newState.player1.exile.some(c => c.instanceId === id) ||
                              newState.player2.exile.some(c => c.instanceId === id);

              if (inGY) {
                AnimationManager.creatureDies({ cardElement: element });
              } else if (inExile) {
                AnimationManager.exile({ cardElement: element });
              }
            }
          }
        }
      });

      // Cards that entered this zone
      newIds.forEach(id => {
        if (!prevIds.has(id)) {
          const element = getCardElement(id);
          if (element && zone === 'battlefield') {
            // Check if it's a token
            const card = newCards.find(c => c.instanceId === id);
            if (card?.name.includes('Token')) {
              AnimationManager.tokenCreated({ cardElement: element });
            }
          }
        }
      });
    };

    // Check both players' zones
    [
      { prev: prevState.player1, new: newState.player1 },
      { prev: prevState.player2, new: newState.player2 }
    ].forEach(({ prev, new: curr }) => {
      checkZoneChanges(prev.battlefield, curr.battlefield, 'battlefield');
      checkZoneChanges(prev.graveyard, curr.graveyard, 'graveyard');
      checkZoneChanges(prev.exile, curr.exile, 'exile');
    });

    // Check for tap/untap
    const checkTapChanges = (prevCards: any[], newCards: any[]) => {
      prevCards.forEach(prevCard => {
        const newCard = newCards.find(c => c.instanceId === prevCard.instanceId);
        if (newCard && prevCard.isTapped !== newCard.isTapped) {
          const element = getCardElement(newCard.instanceId);
          if (element) {
            if (newCard.isTapped) {
              AnimationManager.tap({ cardElement: element });
            } else {
              AnimationManager.untap({ cardElement: element });
            }
          }
        }
      });
    };

    checkTapChanges(prevState.player1.battlefield, newState.player1.battlefield);
    checkTapChanges(prevState.player2.battlefield, newState.player2.battlefield);

    // Check for damage/counter changes
    const checkModifierChanges = (prevCards: any[], newCards: any[]) => {
      prevCards.forEach(prevCard => {
        const newCard = newCards.find(c => c.instanceId === prevCard.instanceId);
        if (newCard) {
          const element = getCardElement(newCard.instanceId);
          if (!element) return;

          // Damage marked
          if (newCard.damageMarked > prevCard.damageMarked) {
            const damage = newCard.damageMarked - prevCard.damageMarked;
            AnimationManager.battleDamage({ cardElement: element, damage });
          }

          // Counters added
          const prevCounters = Object.values(prevCard.counters || {}).reduce((a, b) => (a as number) + (b as number), 0) as number;
          const newCounters = Object.values(newCard.counters || {}).reduce((a, b) => (a as number) + (b as number), 0) as number;
          if (newCounters > prevCounters) {
            AnimationManager.counterAdded({ cardElement: element, counters: newCounters - prevCounters });
          }
        }
      });
    };

    checkModifierChanges(prevState.player1.battlefield, newState.player1.battlefield);
    checkModifierChanges(prevState.player2.battlefield, newState.player2.battlefield);

    // Check for combat
    if (newState.combat.isActive && !prevState.combat.isActive) {
      // Combat started - animate attackers
      newState.combat.attackers.forEach(attacker => {
        const element = getCardElement(attacker.instanceId);
        if (element) {
          AnimationManager.attackStart({ cardElement: element });
        }
      });
    }

    previousStateRef.current = gameState;
  }, [gameState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      AnimationManager.killAll();
    };
  }, []);

  return { registerCard };
};
