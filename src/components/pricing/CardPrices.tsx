import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  byMarket,
  buyLinks,
  describeFinishes,
  finishLabelFor,
  formatSource,
  readPrices,
  type PriceSource,
  type PricedPrinting,
} from '@/lib/pricing';

/**
 * Every price we hold for one printing, on screen at once.
 *
 * The owner's report was "if I go marketplace, then click a card, I don't see
 * prices per platform, only tcgplayer?" and they were right. Six price slots
 * are stored per printing and the card body read two of them.
 *
 * Three things this component will not do:
 *
 *  - print 0.00 for a price we do not have. The database's smallest real price
 *    is 0.01, so a rendered zero is always fabricated. Missing prices say so in
 *    words, and where `finishes` proves the card was never made in that finish
 *    they say that instead, which is a different and more useful fact.
 *  - convert dollars into euros or the other way round. There is no exchange
 *    rate source in this project. A converted number placed beside two real
 *    ones is an invented price.
 *  - call a ticket a dollar. Magic Online tickets buy a digital copy and
 *    nothing else, and 0.04 tix beside a dollar sign would read as four cents.
 */

export interface CardPricesProps {
  /**
   * The printing. A `cards` row or a Scryfall object both work. Pass the whole
   * record, not just `prices`, so `finishes`, the name and the set can be read.
   */
  card: PricedPrinting & {
    name?: string | null;
    set_name?: string | null;
    set_code?: string | null;
    purchase_uris?: Record<string, string | undefined> | null;
  };
  /**
   * `card` is a standalone panel. `inset` sits inside one that already has the
   * card surface, so it drops its own shadow and tints one step further in.
   */
  surface?: 'card' | 'inset' | 'bare';
  /** Set false on narrow columns where the buy row would wrap badly. */
  showBuyLinks?: boolean;
  heading?: string;
  className?: string;
}

function PriceCell({
  source,
  cheapest,
  tint,
}: {
  source: PriceSource;
  cheapest: boolean;
  tint: string;
}) {
  const known = source.amount != null;
  /* A cell in a row now, not a panel of its own. The finish label and the amount
     sit on one baseline, so a market's normal and foil read as a pair rather than
     as two stacked boxes. */
  return (
    <div className="flex min-w-0 shrink-0 items-baseline gap-1.5">
      <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
        {finishLabelFor(source)}
      </span>
      <span
        className={cn(
          'tabular-nums',
          known ? 'text-base font-semibold text-foreground' : 'text-xs text-muted-foreground'
        )}
      >
        {formatSource(source)}
      </span>
      {cheapest && known && (
        <span className="rounded-full bg-foreground/10 px-1.5 text-[0.6rem] uppercase tracking-wide text-foreground">
          Best
        </span>
      )}
    </div>
  );
}

export function CardPrices({
  card,
  surface = 'card',
  showBuyLinks = true,
  heading = 'Prices',
  className,
}: CardPricesProps) {
  const reading = readPrices(card);
  const groups = byMarket(reading);
  const links = showBuyLinks
    ? buyLinks(
        {
          name: card?.name,
          setName: card?.set_name,
          setCode: card?.set_code,
          purchaseUris: card?.purchase_uris ?? null,
        },
        reading
      )
    : [];

  const tint = surface === 'inset' ? 'bg-muted/50' : 'bg-muted/30';
  // Explains why a foil row is absent, where the data can prove it.
  const finishNote = describeFinishes(reading);

  return (
    <section
      className={cn(
        'min-w-0 rounded-xl',
        surface === 'card' && 'bg-card p-4 shadow-lg shadow-black/20',
        surface === 'inset' && 'bg-muted/20 p-4',
        className
      )}
      data-testid="card-prices"
    >
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {heading}
      </h2>

      {reading.empty ? (
        <div className={cn('rounded-lg px-4 py-5', tint)}>
          <p className="text-sm text-foreground">We have no price for this printing yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            That is not the same as the card being free. Nobody has quoted this exact version in
            any of the shops we read.
          </p>
        </div>
      ) : (
        /* ONE ROW PER MARKET: its name, its prices, and its buy link.

           This was three separate blocks stacked down the page - a panel per
           market, then a list of buy links repeating the same market names, then
           a paragraph. Measured at 620px for what is at most six numbers and
           three links. The owner: "pricing and buy at could be same row.... so
           much empty space".

           They belong together because they are the same fact. The price at
           TCGplayer and the link to TCGplayer are one thing, and splitting them
           made the reader match names across two lists. */
        <div className="min-w-0 space-y-1">
          {groups.map(group => {
            const link = links.find(l => l.market === group.market);
            return (
              <div
                key={group.market}
                className={cn(
                  'flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg px-2.5 py-1.5',
                  tint
                )}
              >
                <p
                  className="min-w-0 shrink-0 basis-28 truncate text-sm font-medium text-foreground"
                  title={group.note}
                >
                  {group.name}
                </p>

                {group.sources.map(source => (
                  <PriceCell
                    key={source.key}
                    source={source}
                    cheapest={reading.cheapestIn[source.currency] === source.key}
                    tint={tint}
                  />
                ))}

                {/* Pushed to the far end of the same line, so the eye reads
                    price then action without changing row. */}
                {showBuyLinks && link && (
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={link.note}
                    className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Buy
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {finishNote && (
        <p className="mt-3 text-xs text-muted-foreground">{finishNote}</p>
      )}

      {/* The full explanation lives in the title attribute. The point still has
          to be MADE, because showing dollars beside euros without saying why
          looks like a bug, but it does not need three lines every time. */}
      <p
        className="mt-2 text-[0.7rem] text-muted-foreground"
        title={
          'Dollars come from TCGplayer and euros from Cardmarket. Each is shown in its own money ' +
          'because we have no exchange rate to convert them with, and a converted number would be ' +
          'a guess sitting next to two real prices.' +
          (reading.known.some(s => s.currency === 'TIX')
            ? ' Tickets are Magic Online currency and buy a digital copy, not a card you can hold.'
            : '')
        }
      >
        Each shop is shown in its own currency.
      </p>
    </section>
  );
}
