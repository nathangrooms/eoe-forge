import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CardGrid } from '@/components/cards';
import { ManaPip } from '@/components/ui/mana-cost';
import { MetricRow } from '@/components/listing';
import type { DeckCardRow } from '@/lib/deck/deckCards';
import type { DeckPower, PowerDeckEntry } from '@/lib/deck/power';
import { DeckCardTile } from '@/components/deck/DeckCardTile';

/**
 * The lands themselves.
 *
 * Everything here is measured off the actual decklist and off the canonical
 * castability readout in `DeckPower` — the same figures the power score itself
 * is reported with, so the manabase verdict and the power verdict cannot
 * disagree. An earlier version of this file was entirely fabricated: three
 * hardcoded "colour hit" percentages, three hardcoded land-swap suggestions
 * naming Hallowed Fountain whatever deck was open, and an Apply button that
 * called `alert()`. None of that survived and none of it should come back.
 *
 * ## THE SOURCE COUNT LEFT THIS FILE, AND THAT IS A BUG FIX
 *
 * This panel drew a block headed **Sources per colour**. `ManaSourcesPanel`,
 * directly above it on the same tab, drew a block headed **Sources by colour**.
 * They were two implementations of one figure and they did not agree, because
 * they were not measuring the same thing:
 *
 * - `ManaSourcesPanel` reads `ManaProfile.sourcesByColour`, from
 *   `src/engine/playability/castability.ts` — every repeatable source in the
 *   library, so lands, rocks and dorks, with a fetchland counted for the
 *   colours the deck can actually fetch.
 * - This file counted `type_line` containing "land" and then matched
 *   `add {u}` against lower-cased oracle text, so it saw lands only, missed
 *   every mana rock, and missed any land whose text spells its production
 *   differently.
 *
 * On any deck with mana rocks those two print different numbers, four inches
 * apart, under near-identical headings. The engine's is the correct one and it
 * is the one the score is built on, so this block is gone and the count is
 * stated once.
 *
 * What is genuinely this panel's own and stays: how many of the lands enter
 * tapped and which ones, the two opening-hand figures, and **colour demand** —
 * how many coloured pips of each colour the deck's own costs ask the mana base
 * to support. That last one is a property of the spells, not of the sources,
 * which is why it is not the thing that was duplicated.
 */

interface LandEnhancerUXProps {
  entries: PowerDeckEntry[];
  power: DeckPower | null;
  /** Commander colour identity, when there is one. */
  identity?: string[];
  /**
   * The decklist, so the lands that enter tapped can be drawn as cards. Omit
   * and they fall back to a list of names.
   */
  rows?: DeckCardRow[];
  /**
   * Sources per colour, from `ManaProfile.sourcesByColour`.
   *
   * THE SHORTFALL LINE NEEDS A SOURCE COUNT AND THIS FILE MUST NOT COUNT ONE.
   * It used to, with a regex over lower-cased oracle text that saw lands only
   * and missed every mana rock, and that count disagreed with the engine's four
   * inches above it on the same tab. The count is now the engine's, handed in,
   * and the shortfall it feeds is the one thing this panel derives from it that
   * `ManaSourcesPanel` does not: how far the sources are from what this deck's
   * own pips ask for.
   *
   * Omit it and the shortfall is not drawn, which is the honest outcome for a
   * caller that has no mana profile. A number invented to fill the gap would
   * put back exactly the disagreement this removed.
   */
  sourcesByColour?: Partial<Record<string, number>>;
  onCardClick?: (row: DeckCardRow) => void;
  /** Card width in px, from the tab's size slider. */
  cardWidth?: number;
  className?: string;
}

const COLOR_NAME: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

interface LandStats {
  landCount: number;
  totalCards: number;
  tappedLands: Array<{ name: string; quantity: number }>;
  pipsByColor: Record<string, number>;
}

function analyseLands(entries: PowerDeckEntry[], identity: string[]): LandStats {
  const pipsByColor: Record<string, number> = {};
  const tapped: Array<{ name: string; quantity: number }> = [];

  let landCount = 0;
  let totalCards = 0;

  for (const color of identity) pipsByColor[color] = 0;

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
  }

  return {
    landCount,
    totalCards,
    tappedLands: tapped.sort((a, b) => b.quantity - a.quantity),
    pipsByColor,
  };
}

export function LandEnhancerUX({
  entries,
  power,
  identity,
  rows,
  sourcesByColour,
  onCardClick,
  cardWidth,
  className,
}: LandEnhancerUXProps) {
  const colors = useMemo(() => {
    if (identity?.length) return identity.filter(c => COLOR_NAME[c]);
    const set = new Set<string>();
    entries.forEach(e => e.card.color_identity?.forEach(c => set.add(c)));
    return Array.from(set).filter(c => COLOR_NAME[c]);
  }, [entries, identity]);

  const stats = useMemo(() => analyseLands(entries, colors), [entries, colors]);

  const rowByName = useMemo(() => {
    const map = new Map<string, DeckCardRow>();
    for (const row of rows ?? []) {
      map.set((row.card?.name || row.card_name).trim().toLowerCase(), row);
    }
    return map;
  }, [rows]);

  if (stats.landCount === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">The lands</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No lands in this list yet, so there is nothing to measure.
          </p>
        </CardContent>
      </Card>
    );
  }

  const tappedCount = stats.tappedLands.reduce((sum, l) => sum + l.quantity, 0);
  const landPct = (stats.landCount / Math.max(1, stats.totalCards)) * 100;
  const cast = power?.castability;

  const maxPips = Math.max(1, ...colors.map(c => stats.pipsByColor[c] ?? 0));

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">The lands</CardTitle>
        <p className="text-sm text-muted-foreground">
          Measured from this decklist, by the same maths the power score uses. How many
          sources of each colour the deck holds is one section up; this is what the lands cost
          you and what your own spells demand of them.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* `on="card"`, because this row sits inside a raised panel. The four
            figures were a local `Tile` at 20px bold on an 11px label — the
            smallest metric treatment in the deck folder, drawn one section
            below a `MetricRow` at 24px. Two sizes for the same kind of fact on
            one tab is the drift the shared tile exists to end. */}
        <MetricRow
          on="card"
          columns={4}
          metrics={[
            {
              id: 'lands',
              /* "in the deck", because the row above this panel prints a
                 different land count on purpose: `ManaProfile.landCount` counts
                 lands that actually make mana and this counts lands. A Maze of
                 Ith is in this figure and not in that one, and a tab that
                 printed two numbers both labelled "Lands" would be the exact
                 defect this panel's header note is about. */
              label: 'Lands in the deck',
              value: String(stats.landCount),
              raw: stats.landCount,
              /* Every tile in this row carries a bar, because two of them are
                 probabilities and `MetricRow` reserves the line for the whole
                 row as soon as one asks. Both of these are real fractions. */
              meter: landPct,
              subtext: `${landPct.toFixed(0)}% of the deck`,
            },
            {
              id: 'tapped',
              label: 'Enter tapped',
              value: String(tappedCount),
              raw: tappedCount,
              meter: (tappedCount / stats.landCount) * 100,
              subtext: `${((tappedCount / stats.landCount) * 100).toFixed(0)}% of the lands`,
            },
            {
              id: 'keepable',
              label: 'Keepable sevens',
              value: cast?.keepable7Pct != null ? `${cast.keepable7Pct.toFixed(0)}%` : '—',
              raw: cast?.keepable7Pct ?? undefined,
              meter: cast?.keepable7Pct ?? undefined,
              subtext: 'two to five lands in the opener',
            },
            {
              id: 'turn-one',
              label: 'Turn-one colour',
              value: cast?.turnOneColourPct != null ? `${cast.turnOneColourPct.toFixed(0)}%` : '—',
              raw: cast?.turnOneColourPct ?? undefined,
              meter: cast?.turnOneColourPct ?? undefined,
              subtext: 'a coloured source in the opener',
            },
          ]}
        />

        {/* COLOUR DEMAND, which is not the source count.
            This counts the coloured pips in the deck's own mana costs. It is a
            fact about the spells; the sources that answer it are counted once,
            by the engine, in the section above. Keeping the two apart is the
            whole reason the duplicate could be removed without losing
            anything. */}
        {colors.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Colour demand
            </h4>
            <p className="text-sm text-muted-foreground">
              Coloured pips this deck’s own costs ask for, counted once per copy. A colour with
              a lot of demand and few sources is where a mana base breaks.
            </p>
            <ul className="space-y-3">
              {colors.map(color => {
                const pips = stats.pipsByColor[color] ?? 0;
                const sources = sourcesByColour?.[color];
                /**
                 * The community rule of thumb for a Commander mana base:
                 * roughly 13 to 14 sources of a colour for a single pip on
                 * curve, scaled by how much this deck actually asks for.
                 * Reported as a shortfall and never as a grade, because the
                 * deck's own pip demand is what decides what "enough" means.
                 */
                const wanted = pips === 0 ? 0 : Math.min(20, 10 + Math.round(pips / 4));
                const short =
                  sources === undefined ? null : Math.max(0, wanted - sources);
                return (
                  <li key={color}>
                    <div className="flex items-center gap-3">
                      <ManaPip symbol={color} size="lg" />
                      <span className="w-24 shrink-0 text-sm text-muted-foreground">
                        {COLOR_NAME[color]}
                      </span>
                      <span className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="absolute inset-y-0 left-0 rounded-full bg-foreground/70"
                          style={{ width: `${(pips / maxPips) * 100}%` }}
                        />
                      </span>
                      <span className="w-24 shrink-0 text-right text-sm tabular-nums">
                        <span className="text-base font-semibold">{pips}</span>
                        <span className="ml-1.5 text-muted-foreground">
                          pip{pips === 1 ? '' : 's'}
                        </span>
                      </span>
                    </div>
                    {short !== null && short > 0 && (
                      <p className="ml-11 mt-1 text-xs text-muted-foreground">
                        {sources} {COLOR_NAME[color].toLowerCase()} source
                        {sources === 1 ? '' : 's'} for that. About {short} more would match what
                        this deck asks for.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {stats.tappedLands.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Lands that cost you a turn
            </h4>
            <p className="text-sm text-muted-foreground">
              These enter tapped. Replacing the ones you play early is the cheapest way to move
              turn-one colour access, which is what the speed and mana scores measure.
            </p>
            {rows ? (
              <CardGrid width={cardWidth ?? 180}>
                {stats.tappedLands.map(land => {
                  const row = rowByName.get(land.name.trim().toLowerCase());
                  return (
                    <DeckCardTile
                      key={land.name}
                      card={{
                        ...(row?.card ?? {}),
                        id: row?.card_id,
                        name: land.name,
                        image_uris: row?.card?.image_uris ?? null,
                      }}
                      width={cardWidth ?? 180}
                      showManaCost={false}
                      onClick={onCardClick && row ? () => onCardClick(row) : undefined}
                      caption={land.quantity > 1 ? `${land.quantity} copies` : undefined}
                    />
                  );
                })}
              </CardGrid>
            ) : (
              <ul className="grid grid-cols-1 gap-x-6 gap-y-0.5 text-sm sm:grid-cols-2">
                {stats.tappedLands.map(land => (
                  <li key={land.name} className="flex justify-between gap-2">
                    <span className="truncate">{land.name}</span>
                    {land.quantity > 1 && (
                      <span className="tabular-nums text-muted-foreground">×{land.quantity}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default LandEnhancerUX;
