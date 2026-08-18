/**
 * The mana-base consequence of a swap, rendered only when there is one.
 *
 * Every number here is computed by `playability.ts` from the real decklist —
 * nothing on this component is an estimate, and `measureManaImpact` returns
 * `null` for the swaps that do not touch the mana base, which is most of them.
 * That is deliberate: a castability figure bolted onto every row would be
 * noise, and the one row where cutting a blue source costs you six points
 * across nine cards would not stand out at all.
 */

import { Droplets } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ManaImpact } from './manaImpact';

interface ManaImpactNoteProps {
  impact: ManaImpact | null;
  className?: string;
}

export function ManaImpactNote({ impact, className }: ManaImpactNoteProps) {
  if (!impact) return null;

  const worse = impact.averageDelta < 0;
  const points = Math.abs(impact.averageDelta);

  return (
    <div className={cn('rounded-xl bg-background/60 p-4', className)}>
      <div className="mb-2 flex items-center gap-2">
        <Droplets className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Mana base</span>
        <span className="text-sm text-muted-foreground">
          {impact.sourcesBefore} → {impact.sourcesAfter} sources
        </span>
      </div>

      {/* `text-power-*` is reserved for EDH power semantics, so a castability
          delta uses `destructive` for the direction that is a fault and plain
          foreground for the one that is not. */}
      <p className="text-sm leading-relaxed">
        {points >= 0.5 ? (
          <>
            Everything else in the deck gets{' '}
            <span
              className={cn('font-semibold', worse ? 'text-destructive' : 'text-foreground')}
            >
              {points.toFixed(1)} points {worse ? 'harder' : 'easier'}
            </span>{' '}
            to cast on average ({impact.averageBefore.toFixed(1)}% →{' '}
            {impact.averageAfter.toFixed(1)}%).
          </>
        ) : (
          <>Source count changes, but average castability barely moves.</>
        )}
        {impact.newlyHardToCast > 0 && (
          <>
            {' '}
            <span className="font-semibold text-destructive">
              {impact.newlyHardToCast} card{impact.newlyHardToCast === 1 ? '' : 's'}
            </span>{' '}
            drop below 50%.
          </>
        )}
      </p>

      {impact.colourChanges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {impact.colourChanges.map(c => (
            <span
              key={c.colour}
              className="rounded-lg bg-muted px-2.5 py-1 text-xs font-medium"
            >
              {c.colour} {c.before} → {c.after}
            </span>
          ))}
        </div>
      )}

      {impact.worstHit.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Most affected
          </p>
          <ul className="space-y-1">
            {impact.worstHit.map(card => (
              <li key={card.name} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate">{card.name}</span>
                <span
                  className={cn(
                    'shrink-0 font-medium tabular-nums',
                    card.delta < 0 ? 'text-destructive' : 'text-foreground'
                  )}
                >
                  {card.before.toFixed(0)}% → {card.after.toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
