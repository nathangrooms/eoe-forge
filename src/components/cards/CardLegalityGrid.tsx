import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { LEGALITY_LABEL } from '@/lib/scryfall/card-utils';

/**
 * Every format Scryfall reports, as a real grid.
 *
 * The old card view hid legality behind a tab and then filtered it down to the
 * twelve "curated" formats, so a Commander player could not see `predh`, a
 * cube player could not see `oldschool`, and the one question the grid exists
 * to answer — *can I play this in my deck?* — needed two clicks. Everything the
 * printing carries is shown, curated formats first so the common answers are
 * at the top left.
 */

const CURATED_ORDER = [
  'commander',
  'standard',
  'pioneer',
  'modern',
  'legacy',
  'vintage',
  'pauper',
  'brawl',
  'historic',
  'timeless',
  'alchemy',
  'explorer',
  'oathbreaker',
  'duel',
  'paupercommander',
  'predh',
  'premodern',
  'oldschool',
  'penny',
  'gladiator',
  'standardbrawl',
  'future',
];

/** Keys whose prettified form would read wrong. */
const LABEL_OVERRIDE: Record<string, string> = {
  paupercommander: 'Pauper EDH',
  standardbrawl: 'Standard Brawl',
  competitivebrawl: 'Competitive Brawl',
  historicbrawl: 'Historic Brawl',
  oldschool: 'Old School',
  premodern: 'Premodern',
  predh: 'PreDH',
  duel: 'Duel Commander',
  penny: 'Penny Dreadful',
  future: 'Future Standard',
  tlr: 'TLR',
};

function labelFor(key: string): string {
  if (LABEL_OVERRIDE[key]) return LABEL_OVERRIDE[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Monochrome by law — legality is a state, not an MTG colour. `banned` is the
 * single exception because it is the one state that changes what a player is
 * allowed to do, and `destructive` is the product's existing signal for that.
 */
const STATE_STYLE: Record<string, { tile: string; text: string }> = {
  legal: { tile: 'bg-muted/60', text: 'text-foreground' },
  restricted: { tile: 'bg-muted/40', text: 'text-foreground/80' },
  banned: { tile: 'bg-muted/40', text: 'text-destructive' },
  not_legal: { tile: 'bg-muted/15', text: 'text-muted-foreground/60' },
};

export interface CardLegalityGridProps {
  legalities?: Record<string, string> | null;
  className?: string;
}

export function CardLegalityGrid({ legalities, className }: CardLegalityGridProps) {
  const entries = useMemo(() => {
    if (!legalities) return [];
    const keys = Object.keys(legalities);
    const rank = (k: string) => {
      const i = CURATED_ORDER.indexOf(k);
      return i === -1 ? CURATED_ORDER.length : i;
    };
    return keys
      .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
      .map(key => ({ key, state: String(legalities[key] ?? 'not_legal') }));
  }, [legalities]);

  if (entries.length === 0) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        This printing carries no legality data.
      </p>
    );
  }

  const legalCount = entries.filter(e => e.state === 'legal').length;

  return (
    <div className={cn('min-w-0', className)}>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {entries.map(({ key, state }) => {
          const style = STATE_STYLE[state] ?? STATE_STYLE.not_legal;
          return (
            <div
              key={key}
              className={cn(
                'flex items-center justify-between gap-2 rounded-lg px-3 py-2',
                style.tile
              )}
            >
              {/* Wraps rather than truncates: at the 2-column mobile width
                  "Duel Commander" and its state share ~180px, and a clipped
                  format name is worse than a two-line one. */}
              <span className={cn('min-w-0 text-[0.8rem] leading-tight', style.text)}>
                {labelFor(key)}
              </span>
              <span
                className={cn(
                  'shrink-0 text-[0.65rem] font-medium uppercase tracking-wide',
                  style.text
                )}
              >
                {LEGALITY_LABEL[state] ?? state.replace(/_/g, ' ')}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Legal in {legalCount} of {entries.length} formats Scryfall tracks for this printing.
      </p>
    </div>
  );
}

export default CardLegalityGrid;
