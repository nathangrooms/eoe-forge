/**
 * A life total as an object on the mat.
 *
 * On a table the life total is not a field in a form — it is a die, a token or
 * a number written big enough that the player across from you can read it. So
 * it is a circle that floats over the playmat with its own shadow, and the
 * things that can also kill you (commander damage, poison) are pips set around
 * its rim rather than another row of table cells.
 *
 * Commander damage is deliberately per-commander and never summed: 21 from one
 * commander is lethal, 20 from each of two is not, and a UI that adds them up
 * teaches the wrong rule.
 */

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type LifeBadgeSize = 'xs' | 'sm' | 'md' | 'lg';

/**
 * `xs` exists for one measured reason: a seat's identity band is a fraction of
 * the mat's height, and on a four-seat table at 1280x800 that band is 37px
 * while the smallest badge was 52. The badge sat 15px proud of the band it was
 * supposed to be inside, which reads as a broken box rather than as a token on
 * the mat. Raising the band to fit a 52px ring instead would have cost that
 * seat's cards about 10% of their width, which is the wrong end of the trade on
 * the screen that has the least room.
 */
const RING: Record<LifeBadgeSize, number> = { xs: 38, sm: 52, md: 70, lg: 92 };
const NUMBER: Record<LifeBadgeSize, string> = {
  xs: 'text-sm',
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-4xl',
};
const PIP: Record<LifeBadgeSize, number> = { xs: 14, sm: 17, md: 20, lg: 24 };

export interface CommanderDamagePip {
  id: string;
  /** Whose commander dealt it — used for the tooltip. */
  name: string;
  amount: number;
  lethal: number;
}

export interface LifeBadgeProps {
  life: number;
  size?: LifeBadgeSize;
  /** Life total at which the number turns. Commander is 40, so this is passed in. */
  startingLife?: number;
  poison?: number;
  poisonLethal?: number;
  commanderDamage?: CommanderDamagePip[];
  /** Dead seats keep their badge, greyed, so the pod still reads as four seats. */
  dead?: boolean;
  /** The active player's badge is a touch brighter. */
  active?: boolean;
  /** Ephemeral life changes, floated and faded above the circle. */
  deltas?: Array<{ id: number; delta: number }>;
  className?: string;
}

export function LifeBadge({
  life,
  size = 'md',
  startingLife = 40,
  poison = 0,
  poisonLethal = 10,
  commanderDamage = [],
  dead,
  active,
  deltas = [],
  className,
}: LifeBadgeProps) {
  const reduceMotion = useReducedMotion();
  const diameter = RING[size];
  const pipSize = PIP[size];

  const pips: Array<{ key: string; label: string; title: string; danger: boolean }> = [];
  for (const entry of commanderDamage) {
    if (entry.amount <= 0) continue;
    pips.push({
      key: entry.id,
      label: String(entry.amount),
      title: `${entry.amount} commander damage from ${entry.name}. ${entry.lethal} is lethal.`,
      danger: entry.amount >= entry.lethal,
    });
  }
  if (poison > 0) {
    pips.push({
      key: 'poison',
      label: `${poison}☠`,
      title: `${poison} poison counters. ${poisonLethal} is lethal.`,
      danger: poison >= poisonLethal,
    });
  }

  // Pips sit on the lower arc, spread evenly, so they never cover the number.
  const arcStart = 128;
  const arcEnd = 52;
  const radius = diameter / 2 + pipSize * 0.05;

  const low = life <= Math.max(5, Math.round(startingLife * 0.15));

  return (
    <div
      className={cn('relative', className)}
      style={{ width: diameter, height: diameter }}
    >
      <div
        className={cn(
          'flex h-full w-full flex-col items-center justify-center rounded-full backdrop-blur-md',
          'shadow-[0_10px_28px_rgba(0,0,0,0.6)]',
          active ? 'bg-background/85' : 'bg-background/70',
          dead && 'opacity-50 saturate-0'
        )}
      >
        <span
          className={cn(
            'font-semibold leading-none tabular-nums',
            NUMBER[size],
            low && !dead ? 'text-destructive' : 'text-foreground'
          )}
        >
          {life}
        </span>
        {size !== 'sm' && (
          <span className="mt-0.5 text-[8px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            life
          </span>
        )}
      </div>

      {/* Pips around the rim. */}
      {pips.map((pip, index) => {
        const t = pips.length === 1 ? 0.5 : index / (pips.length - 1);
        const angle = ((arcStart + (arcEnd - arcStart) * t) * Math.PI) / 180;
        const x = diameter / 2 + Math.cos(angle) * radius;
        const y = diameter / 2 + Math.sin(angle) * radius;

        return (
          <span
            key={pip.key}
            title={pip.title}
            className={cn(
              'absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[9px] font-semibold leading-none tabular-nums shadow-md shadow-black/60',
              pip.danger
                ? 'bg-destructive text-destructive-foreground'
                : 'bg-card/95 text-foreground backdrop-blur-sm'
            )}
            style={{ left: x, top: y, width: pipSize, height: pipSize }}
          >
            {pip.label}
          </span>
        );
      })}

      {/* Life changes float off the badge and fade. */}
      <AnimatePresence>
        {deltas.map(entry => (
          <motion.span
            key={entry.id}
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 0, scale: 0.8 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: -34, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.9, ease: 'easeOut' }}
            className={cn(
              'pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap text-lg font-semibold tabular-nums',
              'drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]',
              entry.delta < 0 ? 'text-destructive' : 'text-foreground'
            )}
          >
            {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default LifeBadge;
