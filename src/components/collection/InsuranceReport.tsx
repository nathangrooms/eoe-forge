import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ExternalLink, Download, Printer } from 'lucide-react';
import { showSuccess } from '@/components/ui/toast-helpers';
import { conditionLabel, formatPrice, normalizeCondition } from '@/components/collection/browser/types';

export interface InsuranceLineItem {
  name: string;
  setCode?: string;
  /**
   * The number printed on the card itself. A set code alone does not identify a
   * printing: Secret Lair holds thirty different Sol Rings priced from $7.43 to
   * $172.31 and every one of them is 'SLD'. An insurer cannot check a line they
   * cannot identify.
   */
  collectorNumber?: string;
  quantity?: number;
  foil?: number;
  condition?: string;
  /** Computed total value of every copy owned — not a per-single snapshot. */
  value: number;
}

interface InsuranceReportProps {
  collectionValue: number;
  cardCount: number;
  topCards?: InsuranceLineItem[];
  /**
   * Owned cards the catalogue holds no price for, which `collectionValue`
   * therefore leaves out. This document exists to be handed to an insurer, so a
   * figure that quietly omits part of the collection has to say how much it
   * omits, both on screen and in the downloaded copy. A claim settled against a
   * silently short total is a real loss, not a cosmetic one.
   */
  unpricedCards?: number;
  /** The routed copy at /collection/insurance hides its own link to itself. */
  showOpenLink?: boolean;
}

/**
 * A document a user might hand to an insurer, so every number in it comes from
 * the canonical valuation. It previously sorted by computed value and then
 * printed the stale `price_usd` column beside it — usually $0.00.
 */
export function InsuranceReport({
  collectionValue = 0,
  cardCount = 0,
  topCards = [],
  unpricedCards = 0,
  showOpenLink = true,
}: InsuranceReportProps) {
  const items = topCards
    .filter(card => card && card.name)
    .map(card => ({
      ...card,
      value: Number.isFinite(card.value) ? card.value : 0,
      quantity: card.quantity ?? 0,
      foil: card.foil ?? 0,
    }));

  const generateReport = () => {
    const reportDate = new Date().toLocaleDateString();
    const lines: string[] = [
      'MAGIC: THE GATHERING COLLECTION INSURANCE REPORT',
      `Generated: ${reportDate}`,
      '',
      '========================================',
      '',
      'COLLECTION SUMMARY',
      `Total cards: ${cardCount.toLocaleString()}`,
      `Total value: ${formatPrice(collectionValue)}`,
      `Average card value: ${formatPrice(cardCount > 0 ? collectionValue / cardCount : 0)}`,
      ...(unpricedCards > 0
        ? [
            `Cards with no market price on record: ${unpricedCards.toLocaleString()}`,
            'Those cards are not included in the total above, so the real value',
            'of this collection is higher than the figure given.',
          ]
        : []),
      '',
    ];

    if (items.length > 0) {
      lines.push('MOST VALUABLE ENTRIES', '========================================');
      items.forEach((card, i) => {
        const copies = card.quantity + card.foil;
        const detail = [
          card.setCode
            ? `${card.setCode.toUpperCase()}${card.collectorNumber ? ` #${card.collectorNumber}` : ''}`
            : null,
          `${copies} cop${copies === 1 ? 'y' : 'ies'}`,
          card.foil > 0 ? `${card.foil} foil` : null,
          conditionLabel(card.condition),
        ]
          .filter(Boolean)
          .join(' · ');
        /* "x18  $19.62" reads as eighteen cards at $19.62 each. The figure is
           the total for all eighteen, so say which it is. On a valuation
           document that ambiguity is the whole ball game. */
        /* No em-dashes, and this is the one document that leaves the product:
           a plain-text valuation a person sends an insurer. Brackets around
           what identifies the printing, a colon before the money. */
        lines.push(
          `${i + 1}. ${card.name} (${detail}): ${formatPrice(card.value)} total for ${copies}`
        );
      });
      lines.push('');
    }

    lines.push(
      'This report is for insurance documentation.',
      'Values reflect market prices at the time of generation; foil copies are',
      'valued at foil market price.'
    );

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `insurance-report-${reportDate.replace(/\//g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showSuccess('Report downloaded', 'Insurance report saved');
  };

  return (
    <Card className="border-0 shadow-lg shadow-black/20">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-lg">Collection insurance report</CardTitle>
          <CardDescription>
            A plain-text valuation document you can send to an insurer. Foil copies are valued at
            foil market price.
          </CardDescription>
        </div>
        {showOpenLink && (
          <Button asChild variant="secondary" size="sm" className="gap-2">
            <Link to="/collection/insurance">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Open full page
            </Link>
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-4">
          <div>
            <p className="text-sm text-muted-foreground">Total cards</p>
            <p className="text-2xl font-bold tabular-nums">{cardCount.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total value</p>
            <p className="text-2xl font-bold tabular-nums">{formatPrice(collectionValue)}</p>
          </div>
        </div>

        {unpricedCards > 0 && (
          <p className="rounded-lg bg-muted/40 px-4 py-3 text-sm text-foreground">
            {unpricedCards === 1
              ? '1 card has no market price on record and is not counted above.'
              : `${unpricedCards.toLocaleString()} cards have no market price on record and are not counted above.`}{' '}
            Your collection is worth more than this figure.
          </p>
        )}

        {items.length > 0 ? (
          <div>
            <p className="mb-2 text-sm font-medium">Most valuable entries</p>
            {/*
             * NO INNER SCROLL BOX, AND TWO COLUMNS.
             *
             * This was `max-h-[320px] overflow-y-auto`: 25 entries in a 320px
             * window on a 1,240px page, so nine were visible, sixteen were
             * hidden behind a scrollbar nobody sees on a trackpad, and each row
             * used a third of the width it had. Measured by `clip-audit`: 576px
             * of content hidden on the insurance page, 396px on the analytics
             * tab.
             *
             * Columns rather than a wider single list, because a ranked list is
             * read down and CSS columns flow 1-13 then 14-25, which keeps the
             * order a reader expects. `break-inside-avoid` stops a row being
             * split across the fold between them.
             */}
            <div className="sm:columns-2 sm:gap-x-8">
              {items.map((card, i) => {
                const copies = card.quantity + card.foil;
                return (
                  <div
                    key={`${card.name}-${i}`}
                    className="flex break-inside-avoid items-center justify-between gap-3 rounded px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {i + 1}. {card.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      {card.setCode && (
                        <span className="font-mono uppercase">
                          {card.setCode}
                          {card.collectorNumber ? ` #${card.collectorNumber}` : ''}
                        </span>
                      )}
                      <Badge variant="secondary" className="h-5 px-1 text-[10px] font-normal">
                        {normalizeCondition(card.condition)}
                      </Badge>
                    </span>
                    <span className="shrink-0 text-right font-medium tabular-nums">
                      {formatPrice(card.value)}
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        for {copies}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            There is nothing to value yet. Add cards to your collection and this report fills in.
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
            Print
          </Button>
          <Button onClick={generateReport} disabled={cardCount === 0}>
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Download report
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
