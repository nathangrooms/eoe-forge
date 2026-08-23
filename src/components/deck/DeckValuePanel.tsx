import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MetricRow } from '@/components/listing';
import { fetchPrintingSpreads } from '@/lib/cards/printings';
import type { PrintingSpread } from '@/lib/pricing/printings';
import type { DeckCardRow } from '@/lib/deck/deckCards';
import {
  deckValueLines,
  summariseDeckValue,
  DEFAULT_PROXY_THRESHOLD,
  type DeckValueLine,
} from '@/lib/deck/deckValue';
import { DeckBudgetTracker } from '@/components/deck-builder/DeckBudgetTracker';
import { MissingCardsPanel } from '@/components/deck-builder/MissingCardsPanel';
import { DeckValueHistory } from './DeckValueHistory';

/**
 * The Value tab.
 *
 * ## What it printed, and what a player is actually deciding
 *
 * One figure: the market value of the whole list. The census called this *"the
 * tab with the biggest gap between what is on screen and what is in the
 * database"*, and the gap is not that the figure is wrong. It is that standing
 * on this tab nobody is asking "what is this worth". They are asking one of
 * four things, and the data for all four was already on the page or one query
 * away.
 *
 * | Question | What answers it | Where the data was |
 * |---|---|---|
 * | What do I still have to buy? | Owned against needed, priced | `useCollectionOwnership` already ran on page load |
 * | Could it be cheaper? | The cheapest printing of every card | `oracle_id` came down with the deck; `card_printing_spread` holds the range |
 * | What has it been doing? | Deck value over time | `card_price_history`, a table this app writes nightly and already charts |
 * | What if I proxy the dear half? | Value of the copies over a threshold | The proxy pipeline was already on this tab, per card |
 *
 * Plus the one fact that changes a buying decision and was sitting unread in
 * the catalogue: `cards.is_reserved`. A reserved-list card is not going to be
 * reprinted, so it is the part of the bill that will not come down.
 *
 * ## Requests
 *
 * One, and it is optional. The prices, the quantities, the ownership map and
 * `oracle_id` are all already in hand when this tab opens; the only thing that
 * is not is what the OTHER printings of each card cost, which is
 * `fetchPrintingSpreads` — one chunked read of a view keyed on `oracle_id`.
 * `DeckValueHistory` makes its own for the price record. `MissingCardsPanel`
 * used to make two of its own and now makes none.
 */

export interface DeckValuePanelProps {
  /** Every non-sideboard row, the commander included. */
  rows: DeckCardRow[];
  /** Copies owned by lower-cased card name, from `useCollectionOwnership`. */
  ownedByName?: Map<string, number>;
  /** True while that map is still loading, so figures wait rather than lie. */
  ownershipLoading?: boolean;
  deckId: string;
  deckName: string;
  onCardClick?: (row: DeckCardRow) => void;
  /** Re-read ownership after Mark as Owned writes. */
  onOwnershipChanged?: () => void;
  /** Analytics shape for the budget panel, which predates the row shape. */
  analyticsCards: Array<{
    name?: string;
    quantity?: number;
    rarity?: string;
    prices?: { usd?: string | number | null } | null;
  }>;
}

export function DeckValuePanel({
  rows,
  ownedByName,
  ownershipLoading = false,
  deckId,
  deckName,
  onCardClick,
  onOwnershipChanged,
  analyticsCards,
}: DeckValuePanelProps) {
  const [spreads, setSpreads] = useState<Map<string, PrintingSpread> | null>(null);

  /* Keyed on the oracle ids alone: what the other printings of a card cost does
     not change when a quantity does, so editing the deck must not re-query. */
  const oracleKey = useMemo(
    () =>
      [
        ...new Set(
          rows
            .filter(row => !row.is_sideboard)
            .map(row => row.card?.oracle_id)
            .filter((id): id is string => Boolean(id))
        ),
      ]
        .sort()
        .join(','),
    [rows]
  );

  useEffect(() => {
    if (!oracleKey) {
      setSpreads(null);
      return;
    }
    let cancelled = false;
    void fetchPrintingSpreads(oracleKey.split(',')).then(result => {
      if (!cancelled) setSpreads(result);
    });
    return () => {
      cancelled = true;
    };
  }, [oracleKey]);

  const lines = useMemo<DeckValueLine[]>(
    () => deckValueLines({ rows, ownedByName, spreads: spreads ?? undefined }),
    [rows, ownedByName, spreads]
  );

  const summary = useMemo(
    () => summariseDeckValue(lines, { proxyThreshold: DEFAULT_PROXY_THRESHOLD }),
    [lines]
  );

  /* Ownership figures wait for ownership rather than reporting a deck you own
     none of. `MetricRow` holds the tile and draws a bar for a `null` value,
     which is the whole reason it takes one. */
  const ownershipKnown = Boolean(ownedByName) && !ownershipLoading;

  /**
   * "Still reading" and "read, and there is nothing" are different facts.
   *
   * `spreads` is null until the query answers and a Map afterwards, empty or
   * not. Testing only `cheapestTotal === null` folded the two together, so a
   * deck whose cards have no printing spread on record drew `MetricRow`'s
   * loading bar for ever under a caption saying it was reading. A tile that is
   * permanently loading is a worse answer than a dash.
   */
  const spreadsRead = spreads !== null;

  return (
    <div className="space-y-6">
      <MetricRow
        columns={6}
        metrics={[
          {
            id: 'value',
            label: 'Deck value',
            value: `$${summary.total.toFixed(2)}`,
            raw: summary.total,
            subtext:
              summary.unpricedRows > 0
                ? `${summary.unpricedRows} card${summary.unpricedRows === 1 ? '' : 's'} unpriced`
                : 'every card priced',
          },
          {
            id: 'owned',
            label: 'You already own',
            value: ownershipKnown ? `$${summary.ownedValue.toFixed(2)}` : null,
            raw: summary.ownedValue,
            /* No meter, and no tile in this row has one. `MetricRow` reserves
               the bar's line for every tile as soon as one asks, and an empty
               track reads as a full bar. A deck value, a cheapest-printing
               total and a reserved-list total have no denominator between them,
               so the fraction is said in words instead. */
            subtext: ownershipKnown
              ? `${summary.ownedCopies} of ${summary.ownedCopies + summary.neededCopies} copies, ${
                  summary.total > 0
                    ? Math.round((summary.ownedValue / summary.total) * 100)
                    : 0
                }% of the value`
              : 'checking your collection',
          },
          {
            id: 'finish',
            label: 'Still to buy',
            value: ownershipKnown ? `$${summary.toFinish.toFixed(2)}` : null,
            raw: summary.toFinish,
            emphasis: false,
            subtext: ownershipKnown
              ? summary.toFinishUnpricedRows > 0
                ? `${summary.neededCopies} copies · ${summary.toFinishUnpricedRows} unpriced`
                : `${summary.neededCopies} ${summary.neededCopies === 1 ? 'copy' : 'copies'}`
              : 'checking your collection',
          },
          {
            id: 'cheapest',
            label: 'At the cheapest printing',
            value:
              summary.cheapestTotal !== null
                ? `$${summary.cheapestTotal.toFixed(2)}`
                : spreadsRead
                  ? '—'
                  : null,
            raw: summary.cheapestTotal ?? undefined,
            subtext:
              summary.cheapestTotal === null
                ? spreadsRead
                  ? 'no other printings on record'
                  : 'reading the other printings'
                : summary.savingAtCheapest && summary.savingAtCheapest > 0
                  ? `saves $${summary.savingAtCheapest.toFixed(2)}`
                  : 'already the cheapest',
          },
          {
            id: 'proxy',
            label: `Proxy over $${DEFAULT_PROXY_THRESHOLD}`,
            value: ownershipKnown ? `$${summary.proxySaving.toFixed(2)}` : null,
            raw: summary.proxySaving,
            subtext: ownershipKnown
              ? summary.proxyCards === 0
                ? 'nothing you need is that dear'
                : `${summary.proxyCards} ${summary.proxyCards === 1 ? 'copy' : 'copies'} you have yet to buy`
              : 'checking your collection',
          },
          {
            id: 'reserved',
            label: 'Reserved list',
            value: `$${summary.reservedValue.toFixed(2)}`,
            raw: summary.reservedValue,
            subtext:
              summary.reservedRows === 0
                ? 'nothing here is on it'
                : `${summary.reservedRows} card${summary.reservedRows === 1 ? '' : 's'} that will not be reprinted`,
          },
        ]}
      />

      {/* Two caveats that have to be visible rather than hovered, because both
          of them mean a figure above is a floor rather than an answer. */}
      {(summary.unpricedRows > 0 || summary.spreadUnknownRows > 0) && (
        <Card>
          <CardContent className="space-y-1 p-4 text-sm text-muted-foreground">
            {summary.unpricedRows > 0 && (
              <p>
                {summary.unpricedRows} {summary.unpricedRows === 1 ? 'card has' : 'cards have'} no
                price on record ({summary.unpricedCopies}{' '}
                {summary.unpricedCopies === 1 ? 'copy' : 'copies'}), so every total here is a
                floor rather than the real number.
              </p>
            )}
            {summary.spreadUnknownRows > 0 && (
              <p>
                {summary.spreadUnknownRows}{' '}
                {summary.spreadUnknownRows === 1 ? 'card is' : 'cards are'} counted at the
                printing in the deck in the cheapest-printing figure, because we could not read
                what their other printings cost.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* THE PRICE RECORD. A table this product writes every night, charts on
          the card page, and had never once read from a deck. */}
      <DeckValueHistory rows={rows} />

      <DeckBudgetTracker
        deckCards={analyticsCards}
        targetBudget={200}
        rows={rows}
        onCardClick={onCardClick}
      />

      <MissingCardsPanel
        lines={lines}
        deckId={deckId}
        deckName={deckName}
        onCardClick={onCardClick}
        onOwnershipChanged={onOwnershipChanged}
      />
    </div>
  );
}

export default DeckValuePanel;
