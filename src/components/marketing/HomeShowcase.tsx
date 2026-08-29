import { Link } from 'react-router-dom';
import { cardDetailPath } from '@/components/cards/card-link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight } from 'lucide-react';
import { ManaCost } from '@/components/ui/mana-cost';
import { CardImage, CardImageSkeleton } from '@/components/cards/CardImage';
import { showcaseCards } from '@/lib/homepage/snapshot';
import { Section, SectionInner, SectionHeading } from '@/components/marketing/Section';
import { cn } from '@/lib/utils';

/**
 * Product showcase — the proof strip.
 *
 * Everything here renders REAL rows from the synced card table: real names,
 * real mana costs, real art, real prices. Nothing is mocked, so the homepage
 * cannot drift out of sync with the product, and there is no temptation to
 * invent numbers to fill a layout.
 *
 * Two rules this section exists to obey:
 *
 * 1. A card is drawn WHOLE, at 5:7, through `CardImage`. Never an `art_crop`
 *    stretched into a banner — a crop is a piece of art, not a card.
 * 2. Secret Lair drops are excluded. Sorting the catalogue by USD floats
 *    crossover novelties (My Little Pony ponies, at the time of writing) to the
 *    top, and the first thing a player sees on a Magic homepage has to be Magic.
 */

/** Secret Lair and promo sets — real Magic cards, but not the face of the game. */
const NOVELTY_SETS = new Set(['sld', 'slu', 'slp', 'slc', 'slx', 'sch', 'pmei']);

/**
 * Catalogue rows drawn on a phone.
 *
 * Four rows is four rows at any width, and each is a 68px card beside two lines
 * of type. Three of them make the point (real name, real printing, real price,
 * none of it retyped) at 390px; the fourth is the same evidence again.
 */
const ROWS_ON_PHONE = 3;

interface ShowcaseCard {
  id: string;
  name: string;
  mana_cost: string | null;
  cmc: number;
  type_line: string;
  set_code: string;
  layout: string | null;
  faces: unknown;
  image_uris: Record<string, string> | null;
  prices: Record<string, string> | null;
}

/* ------------------------------------------------------------- card marquee */

function CardMarquee({ cards }: { cards: ShowcaseCard[] }) {
  if (cards.length === 0) return null;
  // Duplicated once so the CSS translate loop is seamless. The duplicates share
  // a src with the originals, so they cost no extra requests.
  const row = [...cards, ...cards];

  return (
    <div
      className="relative overflow-hidden py-2"
      style={{
        maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
      }}
    >
      {/*
        THE CARDS GO SOMEWHERE NOW.

        This section is the page's headline evidence, 28 real cards drawn whole,
        and every one of them was a picture. `/cards/:id` is public and is the
        best page in the product, so a stranger looking at the proof could not
        touch it.

        The track pauses while a pointer is over it or a card in it has keyboard
        focus, because a link that slides out from under the cursor is not a
        link. `group-focus-within` covers the keyboard case: tabbing into a
        moving strip is otherwise impossible.
      */}
      <div className="group flex w-max gap-4 animate-marquee [animation-play-state:running] hover:[animation-play-state:paused] focus-within:[animation-play-state:paused] motion-reduce:animate-none">
        {row.map((c, i) => {
          const href = cardDetailPath(c);
          /* size="md" asks Scryfall for `large` without the blur-up second
             request that `lg`/`xl` add — twelve cards, twelve requests. */
          const art = <CardImage card={c} size="md" fill hideFlip />;
          return (
            <div key={`${c.id}-${i}`} className="w-40 shrink-0 sm:w-52 lg:w-60">
              {href ? (
                <Link
                  to={href}
                  /* The strip repeats each card, so only the first copy is in
                     the tab order. A reader should not meet Sol Ring twice. */
                  tabIndex={i < row.length / 2 ? 0 : -1}
                  aria-hidden={i < row.length / 2 ? undefined : true}
                  aria-label={`${c.name}, open the card page`}
                  className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
                >
                  {art}
                </Link>
              ) : (
                art
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- mana curve */

function ManaCurve({ cards }: { cards: ShowcaseCard[] }) {
  const buckets = [0, 1, 2, 3, 4, 5, 6];
  const counts = buckets.map(
    b => cards.filter(c => (b === 6 ? c.cmc >= 6 : Math.floor(c.cmc) === b)).length
  );
  const max = Math.max(1, ...counts);
  const averageMv = cards.length
    ? cards.reduce((sum, c) => sum + (Number(c.cmc) || 0), 0) / cards.length
    : 0;

  return (
    /* Centred rather than stretched: letting the bars grow to fill the panel
       turns the chart into a slab of solid white next to a text panel. A capped
       height with the space split above and below reads as deliberate. */
    <div className="flex h-full flex-col justify-center">
      {/* Each column is h-full with justify-end, so the bar's percentage height
          resolves against a definite box. Without that the columns size to their
          content and every bar collapses to zero. */}
      <div className="flex h-52 max-h-full items-stretch gap-2">
        {counts.map((n, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className="text-[11px] leading-none tabular-nums text-muted-foreground">
              {n || ''}
            </span>
            <div
              className="w-full rounded-t bg-foreground/85 transition-all"
              style={{ height: `${(Math.max(n, 0) / max) * 100}%`, minHeight: n > 0 ? 6 : 2 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {buckets.map(b => (
          <span
            key={b}
            className="flex-1 text-center text-[11px] tabular-nums text-muted-foreground"
          >
            {b === 6 ? '6+' : b}
          </span>
        ))}
      </div>

      {/* Both figures computed from the same rows the bars are drawn from. */}
      <p className="mt-5 text-xs text-muted-foreground">
        <span className="tabular-nums text-foreground">{cards.length}</span> cards ·{' '}
        <span className="tabular-nums text-foreground">{averageMv.toFixed(1)}</span> average mana
        value
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------- row */

function CatalogueRow({ card }: { card: ShowcaseCard }) {
  const usd = card.prices?.usd;
  return (
    /* Two lines rather than four columns. Laid out as columns, the name gets
       squeezed between the mana pips and the price and truncates to "Rang…" on a
       phone; stacking the cost and type under the name gives it the whole row. */
    <Link
      to={cardDetailPath(card) ?? '#'}
      aria-label={`${card.name}, open the card page`}
      className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors odd:bg-foreground/[0.04] hover:bg-foreground/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-4 sm:px-3"
    >
      {/* A whole card, never a crop — 48px is small, but it is still a card. */}
      <div className="w-12 shrink-0">
        <CardImage card={card} size="xs" fill hideFlip />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{card.name}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <ManaCost cost={card.mana_cost} size="xs" className="shrink-0" />
          <span className="min-w-0 truncate text-xs text-muted-foreground">{card.type_line}</span>
        </div>
      </div>

      <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground sm:block">
        {card.set_code}
      </span>
      <span className="w-16 shrink-0 text-right text-sm tabular-nums">
        {usd ? `$${Number(usd).toFixed(2)}` : <span className="text-muted-foreground">No price</span>}
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------------- panels */

function Panel({
  title,
  body,
  className,
  children,
}: {
  title: string;
  body: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl bg-card p-6 shadow-lg shadow-black/20',
        className
      )}
    >
      <h3 className="font-medium">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-5 flex flex-1 flex-col">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ section */

export function HomeShowcase() {
  /* Mythics and rares with real market value, the cards players recognise on
     sight. The pool of 400 rows this used to pull down on every visit, and the
     filter-and-sort that cut it to twelve, both moved into
     scripts/homepage-snapshot.mjs, novelty-set exclusion included. */
  const cards = showcaseCards() as ShowcaseCard[] | null;

  const loading = cards === null;
  const list = cards ?? [];

  return (
    <Section bleed>
      <SectionInner>
        <SectionHeading
          title="Real cards. Real costs. Real prices."
          lead={
            <>
              Every card below is a real row out of the card table, refreshed with the catalogue
              every night.{' '}
              <span className="hidden sm:inline">
                It is the same card data the deck builder, your collection and the marketplace all
                run on.
              </span>
            </>
          }
        />
      </SectionInner>

      {/* full-bleed marquee of WHOLE cards */}
      <div className="mt-8 sm:mt-14">
        {loading ? (
          <SectionInner containerClassName="flex gap-4 overflow-hidden">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="w-40 shrink-0 sm:w-52 lg:w-60">
                <CardImageSkeleton size="md" fill />
              </div>
            ))}
          </SectionInner>
        ) : (
          <CardMarquee cards={list} />
        )}
      </div>

      <SectionInner className="mt-9 sm:mt-16">
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel
            className="lg:col-span-2"
            title="Every detail, straight off the card"
            body="Name, type, printing, mana cost and what it sells for."
          >
            {/* Four rows, not six.

                These two panels sit side by side. Six rows made the left one
                ~560px tall against a ~300px chart, so the right-hand panel
                carried 250px of empty card underneath its own content. Four
                rows is the same evidence (real names, real printings, real
                prices, none of it retyped) at a height the chart can meet. */}
            <div className="rounded-xl bg-muted/30 p-1.5">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        'flex items-center gap-4 px-3 py-2',
                        i >= ROWS_ON_PHONE && 'hidden sm:flex'
                      )}
                    >
                      <Skeleton className="h-[4.2rem] w-12 shrink-0 rounded" />
                      <Skeleton className="h-4 flex-1" />
                    </div>
                  ))
                : list.slice(0, 4).map((c, i) => (
                    <div key={c.id} className={cn(i >= ROWS_ON_PHONE && 'hidden sm:block')}>
                      <CatalogueRow card={c} />
                    </div>
                  ))}
            </div>
          </Panel>

          {/* Desktop only, and this is the one place on the page a whole
              figure is dropped on a phone rather than shrunk.

              It is the third curve on the page: this one, the one in the deck
              builder photograph two sections below, and Tutor's. Beside the
              catalogue rows on a desktop it costs nothing, because it fills a
              column that would otherwise be empty. Stacked at 390px it is a
              ~370px block whose whole content is "twelve cards, average mana
              value 3.4" about twelve cards that are not a deck. The sentence it
              is making, that the builder does this sum on your own list, is
              made properly by the builder photograph directly underneath. */}
          <Panel
            className="max-sm:hidden"
            title="See the curve"
            body="The curve of the cards above. Your own decks get the same breakdown."
          >
            {loading ? (
              <Skeleton className="min-h-[10rem] w-full flex-1" />
            ) : (
              <ManaCurve cards={list} />
            )}
          </Panel>
        </div>

        <div className="mt-8 text-center sm:mt-10">
          <Button asChild size="lg">
            <Link to="/register">
              Start building
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </SectionInner>
    </Section>
  );
}

export default HomeShowcase;
