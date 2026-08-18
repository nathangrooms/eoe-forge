import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Map } from 'lucide-react';
import { ManaPip } from '@/components/ui/mana-cost';
import type { DeckPower, PowerDeckEntry } from '@/lib/deck/power';

/**
 * Manabase analysis.
 *
 * Restored and rewritten. The previous version was entirely fabricated: three
 * hardcoded "colour hit" percentages, three hardcoded land-swap suggestions
 * naming Hallowed Fountain and Flooded Strand whatever deck was open, and an
 * "Apply" button that called `alert()`.
 *
 * Everything here is now measured off the actual decklist and off the canonical
 * seeded simulation in `DeckPower` — the same 10,000-draw figures the power
 * score itself is reported with, so the manabase verdict and the power verdict
 * cannot disagree.
 */

interface LandEnhancerUXProps {
  entries: PowerDeckEntry[];
  power: DeckPower | null;
  /** Commander colour identity, when there is one. */
  identity?: string[];
  className?: string;
}

const COLOR_NAME: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

const BASIC_BY_COLOR: Record<string, string> = {
  W: 'plains',
  U: 'island',
  B: 'swamp',
  R: 'mountain',
  G: 'forest',
};

interface LandStats {
  landCount: number;
  totalCards: number;
  tappedLands: Array<{ name: string; quantity: number }>;
  anyColorSources: number;
  sourcesByColor: Record<string, number>;
  pipsByColor: Record<string, number>;
  basicsByColor: Record<string, number>;
}

function analyseLands(entries: PowerDeckEntry[], identity: string[]): LandStats {
  const sourcesByColor: Record<string, number> = {};
  const pipsByColor: Record<string, number> = {};
  const basicsByColor: Record<string, number> = {};
  const tapped: Array<{ name: string; quantity: number }> = [];

  let landCount = 0;
  let totalCards = 0;
  let anyColorSources = 0;

  for (const color of identity) {
    sourcesByColor[color] = 0;
    pipsByColor[color] = 0;
    basicsByColor[color] = 0;
  }

  for (const entry of entries) {
    const qty = Math.max(1, entry.quantity);
    totalCards += qty;

    const type = (entry.card.type_line || '').toLowerCase();
    const text = (entry.card.oracle_text || '').toLowerCase();
    const name = entry.card.name;

    // Coloured pips in the mana costs the manabase has to support.
    const cost = entry.card.mana_cost || '';
    for (const color of identity) {
      const pips = (cost.match(new RegExp(`\\{${color}\\}`, 'g')) || []).length;
      if (pips > 0) pipsByColor[color] = (pipsByColor[color] ?? 0) + pips * qty;
    }

    if (!type.includes('land')) continue;
    landCount += qty;

    if (text.includes('enters the battlefield tapped') || text.includes('enters tapped')) {
      tapped.push({ name, quantity: qty });
    }

    const producesAny =
      text.includes('any color') || text.includes('mana of any colour');
    if (producesAny) {
      anyColorSources += qty;
      for (const color of identity) sourcesByColor[color] = (sourcesByColor[color] ?? 0) + qty;
      continue;
    }

    for (const color of identity) {
      const basic = BASIC_BY_COLOR[color];
      const isBasicType = basic ? type.includes(basic) : false;
      const addsColor = text.includes(`add {${color.toLowerCase()}}`) || text.includes(`{${color}}`);
      if (isBasicType || addsColor) {
        sourcesByColor[color] = (sourcesByColor[color] ?? 0) + qty;
        if (isBasicType && type.includes('basic')) {
          basicsByColor[color] = (basicsByColor[color] ?? 0) + qty;
        }
      }
    }
  }

  return {
    landCount,
    totalCards,
    tappedLands: tapped.sort((a, b) => b.quantity - a.quantity),
    anyColorSources,
    sourcesByColor,
    pipsByColor,
    basicsByColor,
  };
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3 shadow-sm">
      <p className="text-xl font-bold leading-none tabular-nums">{value}</p>
      <p className="mt-1.5 text-[0.7rem] font-medium leading-none text-muted-foreground">{label}</p>
      {hint && <p className="mt-1 text-[0.62rem] leading-tight text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function LandEnhancerUX({ entries, power, identity, className }: LandEnhancerUXProps) {
  const colors = useMemo(() => {
    if (identity?.length) return identity.filter(c => COLOR_NAME[c]);
    const set = new Set<string>();
    entries.forEach(e => e.card.color_identity?.forEach(c => set.add(c)));
    return Array.from(set).filter(c => COLOR_NAME[c]);
  }, [entries, identity]);

  const stats = useMemo(() => analyseLands(entries, colors), [entries, colors]);

  if (stats.landCount === 0) {
    return (
      <div className={cn('rounded-xl bg-muted/30 p-4 shadow-sm', className)}>
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Map className="h-4 w-4" />
          Manabase
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          No lands in this list yet, so there is nothing to measure.
        </p>
      </div>
    );
  }

  const tappedCount = stats.tappedLands.reduce((sum, l) => sum + l.quantity, 0);
  const landPct = (stats.landCount / Math.max(1, stats.totalCards)) * 100;
  const sim = power?.simulation;

  /**
   * The community rule of thumb for a Commander manabase: roughly 13–14 sources
   * of a colour for a single pip on curve. Reported as a shortfall, not as a
   * grade — the deck's own pip demand decides what "enough" means.
   */
  const colorRows = colors.map(color => {
    const sources = stats.sourcesByColor[color] ?? 0;
    const pips = stats.pipsByColor[color] ?? 0;
    const wanted = pips === 0 ? 0 : Math.min(20, 10 + Math.round(pips / 4));
    return { color, sources, pips, wanted, short: Math.max(0, wanted - sources) };
  });

  return (
    <div className={cn('space-y-4 rounded-xl bg-muted/30 p-4 shadow-sm', className)}>
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Map className="h-4 w-4" />
          Manabase
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Measured from this decklist and the same seeded simulation the power score uses.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile
          label="Lands"
          value={String(stats.landCount)}
          hint={`${landPct.toFixed(0)}% of the deck`}
        />
        <Tile
          label="Enter tapped"
          value={String(tappedCount)}
          hint={
            stats.landCount > 0
              ? `${((tappedCount / stats.landCount) * 100).toFixed(0)}% of lands`
              : undefined
          }
        />
        <Tile
          label="Keepable sevens"
          value={sim ? `${sim.keepable7Pct.toFixed(0)}%` : '—'}
          hint="10,000 seeded draws"
        />
        <Tile
          label="Turn-one colour"
          value={sim ? `${sim.t1ColorPct.toFixed(0)}%` : '—'}
          hint={sim ? `Two colours by T2: ${sim.t2TwoColorsPct.toFixed(0)}%` : undefined}
        />
      </div>

      {colorRows.length > 0 && (
        <div className="rounded-lg bg-background/60 p-3 shadow-sm">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Sources per colour
          </p>
          <div className="mt-2 space-y-2.5">
            {colorRows.map(row => (
              <div key={row.color}>
                <div className="flex items-center gap-2 text-xs">
                  <ManaPip symbol={row.color} size="sm" />
                  <span className="font-medium">{COLOR_NAME[row.color]}</span>
                  <span className="ml-auto tabular-nums text-muted-foreground">
                    {row.sources} source{row.sources === 1 ? '' : 's'} · {row.pips} pip
                    {row.pips === 1 ? '' : 's'} to support
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                  <div
                    className="h-full rounded-full bg-foreground/60"
                    style={{
                      width: `${Math.min(100, row.wanted > 0 ? (row.sources / row.wanted) * 100 : 100)}%`,
                    }}
                  />
                </div>
                {row.short > 0 && (
                  <p className="mt-1 text-[0.65rem] text-muted-foreground">
                    About {row.short} more {COLOR_NAME[row.color].toLowerCase()} source
                    {row.short === 1 ? '' : 's'} would match this deck's pip demand.
                  </p>
                )}
              </div>
            ))}
          </div>
          {stats.anyColorSources > 0 && (
            <p className="mt-3 text-[0.65rem] text-muted-foreground">
              {stats.anyColorSources} land{stats.anyColorSources === 1 ? '' : 's'} produce any
              colour and are counted for every colour above.
            </p>
          )}
        </div>
      )}

      {stats.tappedLands.length > 0 && (
        <div className="rounded-lg bg-background/60 p-3 shadow-sm">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Lands that cost you a turn
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            These enter tapped. Replacing the ones you play early is the cheapest way to move
            turn-one colour access, which feeds the speed and mana subscores.
          </p>
          <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-0.5 text-xs sm:grid-cols-2">
            {stats.tappedLands.slice(0, 12).map(land => (
              <li key={land.name} className="flex justify-between gap-2">
                <span className="truncate">{land.name}</span>
                {land.quantity > 1 && (
                  <span className="tabular-nums text-muted-foreground">×{land.quantity}</span>
                )}
              </li>
            ))}
          </ul>
          {stats.tappedLands.length > 12 && (
            <p className="mt-2 text-[0.65rem] text-muted-foreground">
              …and {stats.tappedLands.length - 12} more.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default LandEnhancerUX;
