import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { CardGrid } from '@/components/cards';
import { MetricRow } from '@/components/listing';
import { cn } from '@/lib/utils';
import type { DeckCardRow } from '@/lib/deck/deckCards';
import { DeckCardTile, TileBadge } from '@/components/deck/DeckCardTile';

/**
 * A budget, and where this deck stands against it.
 *
 * ## COPIES COUNT
 *
 * Every figure in this panel used to be built from `parseFloat(card.prices.usd)`
 * summed once per *distinct* card, with no `quantity` anywhere in the file. For
 * a singleton Commander deck the only error was basic lands, which are cheap, so
 * it had been almost right for the format the product is mostly used for and
 * badly wrong for anything with four-ofs. The error was inherited by the top
 * five, the percentage used, the remaining figure, the over-budget test and the
 * rarity roll-up.
 *
 * It also meant the Value tab's total and the deck value tile at the top of the
 * same page were two different numbers for one deck. They agree now.
 *
 * ## What this stopped drawing by hand
 *
 * Three hand-rolled treatments went, all three of them one of the six the
 * consistency audit counted:
 *
 * - The budget figure and the remaining figure were a 30px number beside a 24px
 *   one, with a separate `Progress` under them and a third line spelling the
 *   percentage out in words. Three renderings of one fact. `MetricRow` draws
 *   the figure and its bar together — that is what `Metric.meter` is for — and
 *   the percentage is the bar rather than a sentence about it.
 * - The rarity roll-up was a `grid-cols-2` of 18px bold figures on `bg-muted/30`.
 *   Same row, same tile, at the size every figure gets.
 * - The top five were rows of text with a rarity badge. They are cards, so they
 *   are drawn as cards when the caller can supply the rows to draw them from.
 *
 * The colour went with them. `getBudgetColor` returned `text-foreground` for two
 * of its three cases, so all it ever did was paint the value red past 100%,
 * which the "Over budget" label already says in words that do not depend on
 * being able to tell two greys apart.
 */

interface BudgetCard {
  name?: string;
  quantity?: number;
  rarity?: string;
  prices?: { usd?: string | number | null } | null;
}

interface DeckBudgetTrackerProps {
  /** Every non-sideboard card, with its quantity. */
  deckCards: BudgetCard[];
  targetBudget?: number;
  /**
   * The decklist, so the five most expensive stacks can be drawn as cards.
   * Omit and they fall back to a list of names, which is what a generated deck
   * with no rows behind it gets.
   */
  rows?: DeckCardRow[];
  onCardClick?: (row: DeckCardRow) => void;
  cardWidth?: number;
  className?: string;
}

function copiesOf(card: BudgetCard): number {
  return Math.max(1, Math.floor(card.quantity ?? 1));
}

function unitPrice(card: BudgetCard): number {
  const raw = card.prices?.usd;
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''));
  return Number.isFinite(n) ? n : 0;
}

export function DeckBudgetTracker({
  deckCards,
  targetBudget = 100,
  rows,
  onCardClick,
  cardWidth,
  className,
}: DeckBudgetTrackerProps) {
  const [budgetLimit, setBudgetLimit] = useState(targetBudget);

  const analysis = useMemo(() => {
    const totalValue = deckCards.reduce(
      (sum, card) => sum + unitPrice(card) * copiesOf(card),
      0
    );

    // The most expensive STACKS. A playset of a $12 card outranks one $30 card
    // in what it costs to assemble, which is the question this is asking.
    const stacks = deckCards
      .map(card => ({
        name: card.name ?? '',
        copies: copiesOf(card),
        unitPrice: unitPrice(card),
        price: unitPrice(card) * copiesOf(card),
        rarity: card.rarity ?? 'unknown',
      }))
      .filter(c => c.price > 0)
      .sort((a, b) => b.price - a.price);

    const top5 = stacks.slice(0, 5);
    const top5Value = top5.reduce((sum, c) => sum + c.price, 0);

    const byRarity: Record<string, number> = {};
    for (const card of deckCards) {
      const rarity = card.rarity || 'unknown';
      byRarity[rarity] = (byRarity[rarity] ?? 0) + unitPrice(card) * copiesOf(card);
    }

    return {
      totalValue,
      percentUsed: budgetLimit > 0 ? (totalValue / budgetLimit) * 100 : 0,
      remaining: budgetLimit - totalValue,
      isOverBudget: totalValue > budgetLimit,
      top5,
      top5Value,
      top5Percent: totalValue > 0 ? (top5Value / totalValue) * 100 : 0,
      byRarity,
    };
  }, [deckCards, budgetLimit]);

  const rowByName = useMemo(() => {
    const map = new Map<string, DeckCardRow>();
    for (const row of rows ?? []) {
      map.set((row.card?.name || row.card_name).trim().toLowerCase(), row);
    }
    return map;
  }, [rows]);

  /* Rarity order rather than alphabetical, so the roll-up reads common →
     mythic. Sorting by value put "special" between "rare" and "mythic" on one
     deck and somewhere else on the next. */
  const RARITY_ORDER = ['mythic', 'rare', 'uncommon', 'common', 'special', 'bonus', 'unknown'];
  const rarities = Object.entries(analysis.byRarity)
    .filter(([, value]) => value > 0)
    .sort(
      ([a], [b]) =>
        (RARITY_ORDER.indexOf(a) === -1 ? 99 : RARITY_ORDER.indexOf(a)) -
        (RARITY_ORDER.indexOf(b) === -1 ? 99 : RARITY_ORDER.indexOf(b))
    );

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Against a budget</CardTitle>
        <p className="text-sm text-muted-foreground">
          Set what you are willing to spend and see where the list sits. Every figure counts
          copies, so a playset of a $12 card is $48.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium">Budget</span>
            <span className="text-sm tabular-nums text-muted-foreground">
              ${budgetLimit.toFixed(0)}
            </span>
          </div>
          <Slider
            value={[budgetLimit]}
            onValueChange={value => setBudgetLimit(value[0])}
            min={50}
            max={5000}
            step={50}
            aria-label="Budget for this deck"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>$50</span>
            <span>$5,000</span>
          </div>
        </div>

        <MetricRow
          on="card"
          columns={3}
          metrics={[
            {
              id: 'value',
              label: 'Deck value',
              value: `$${analysis.totalValue.toFixed(2)}`,
              raw: analysis.totalValue,
              meter: Math.min(analysis.percentUsed, 100),
              subtext: `${analysis.percentUsed.toFixed(0)}% of the budget`,
            },
            {
              id: 'remaining',
              label: analysis.isOverBudget ? 'Over budget' : 'Left to spend',
              value: `${analysis.isOverBudget ? '−' : ''}$${Math.abs(analysis.remaining).toFixed(2)}`,
              raw: analysis.remaining,
              emphasis: analysis.isOverBudget,
              subtext: analysis.isOverBudget ? 'more than the budget' : 'still within it',
            },
            {
              id: 'top5',
              label: 'Top five stacks',
              value: `$${analysis.top5Value.toFixed(2)}`,
              raw: analysis.top5Value,
              meter: analysis.top5Percent,
              subtext: `${analysis.top5Percent.toFixed(0)}% of the deck’s value`,
            },
          ]}
        />

        {analysis.top5.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              What most of the money is in
            </h4>
            {rows ? (
              <CardGrid width={cardWidth ?? 180}>
                {analysis.top5.map(card => {
                  const row = rowByName.get(card.name.trim().toLowerCase());
                  return (
                    <DeckCardTile
                      key={card.name}
                      card={{
                        ...(row?.card ?? {}),
                        id: row?.card_id,
                        name: card.name,
                        image_uris: row?.card?.image_uris ?? null,
                        mana_cost: row?.card?.mana_cost ?? null,
                      }}
                      width={cardWidth ?? 180}
                      onClick={onCardClick && row ? () => onCardClick(row) : undefined}
                      badge={<TileBadge align="right">${card.price.toFixed(0)}</TileBadge>}
                      caption={
                        card.copies > 1
                          ? `${card.copies} × $${card.unitPrice.toFixed(2)}`
                          : `$${card.unitPrice.toFixed(2)}`
                      }
                    />
                  );
                })}
              </CardGrid>
            ) : (
              <ul className="space-y-1.5">
                {analysis.top5.map(card => (
                  <li
                    key={card.name}
                    className="flex items-baseline justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {card.copies > 1 ? `${card.copies}× ` : ''}
                      {card.name}
                    </span>
                    <span className="shrink-0 tabular-nums">${card.price.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {rarities.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Where the value sits by rarity
            </h4>
            <MetricRow
              on="card"
              columns={Math.min(6, rarities.length)}
              metrics={rarities.map(([rarity, value]) => ({
                id: rarity,
                label: rarity.charAt(0).toUpperCase() + rarity.slice(1),
                value: `$${value.toFixed(2)}`,
                raw: value,
                subtext:
                  analysis.totalValue > 0
                    ? `${((value / analysis.totalValue) * 100).toFixed(0)}% of the deck`
                    : undefined,
              }))}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default DeckBudgetTracker;
