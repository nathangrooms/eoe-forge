import { GameCard } from '@/lib/simulation/types';
import { FullCardDisplay } from './FullCardDisplay';
import { forwardRef } from 'react';

interface AnimatedCardProps {
  card: GameCard;
  compact?: boolean;
  faceDown?: boolean;
  onRegister?: (instanceId: string, element: HTMLElement | null) => void;
  damages?: Array<{ id: string; amount: number; timestamp: number }>;
  isAttacking?: boolean;
  isBlocking?: boolean;
}

/**
 * Wrapper around FullCardDisplay that registers itself for animations
 */
export const AnimatedCard = forwardRef<HTMLDivElement, AnimatedCardProps>(
  ({ card, compact, faceDown, onRegister, damages, isAttacking, isBlocking }, ref) => {
    const handleRef = (element: HTMLDivElement | null) => {
      if (onRegister) {
        onRegister(card.instanceId, element);
      }
      if (typeof ref === 'function') {
        ref(element);
      } else if (ref) {
        ref.current = element;
      }
    };

    return (
      <FullCardDisplay 
        ref={handleRef}
        card={card} 
        compact={compact} 
        faceDown={faceDown}
        damages={damages}
        isAttacking={isAttacking}
        isBlocking={isBlocking}
      />
    );
  }
);

AnimatedCard.displayName = 'AnimatedCard';
