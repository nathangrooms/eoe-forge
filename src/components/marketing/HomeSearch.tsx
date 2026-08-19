import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardImage, CardImageSkeleton } from '@/components/cards/CardImage';
import { ManaCost } from '@/components/ui/mana-cost';
import { Section, SectionHeading } from '@/components/marketing/Section';
import { useNearViewport } from '@/components/marketing/sectionData';
import { cn } from '@/lib/utils';

/**
 * Scryfall syntax — demonstrated, not asserted.
 *
 * The previous version of this section was four monospace strings in four grey
 * rows and a button. It made the page's most checkable claim — "every operator
 * works" — and then showed nothing that could check it: no result, no count, no
 * card. On a page whose whole argument is "we draw real cards properly", it was
 * the one section with no cards on it at all.
 *
 * So the queries now RUN. Each one is sent to
 * `https://api.scryfall.com/cards/search`, which is the exact endpoint the card
 * browser uses (`buildScryfallURL` in `src/lib/scryfall/query-builder.ts`, called
 * from `useAdvancedCardSearch`), with the query text passed through untouched —
 * the same pass-through `buildScryfallQuery` does with the free-text box.
 *
 * Honesty model:
 *   - the number beside the query is Scryfall's own `total_cards` for it, not a
 *     figure anyone typed;
 *   - the cards below are the first rows of the real response, drawn whole at
 *     5:7 through `CardImage`;
 *   - `order=edhrec` is Scryfall's own play-rank, so the first twelve are cards
 *     a Commander player recognises rather than an alphabetical accident. The
 *     ordering is named on screen for the same reason the card browser names it;
 *   - if the request fails the section falls back to the query rows on their own.
 *     Nothing is substituted for a result that did not arrive.
 *
 * Cost: one request, for the query on screen, once the section is near the
 * viewport. Switching tabs fetches that tab once and caches it for the session.
 */

const QUERIES: { q: string; note: string }[] = [
  { q: 'f:commander id<=wubrg o:"draw a card"', note: 'Commander-legal card draw' },
  { q: 't:instant mv<=2 o:"destroy target"', note: 'Cheap removal' },
  { q: 'c:rg t:creature pow>=5 mv<=4', note: 'Efficient beaters' },
  { q: 'is:commander id=bant o:"whenever you"', note: 'Bant triggered commanders' },
];

/**
 * One full row at the widest breakpoint.
 *
 * Was 12, i.e. two rows, which cost this section ~500px to prove a point the
 * first row has already made: the query ran, and these are what came back. The
 * second row is the same evidence a second time.
 *
 * Six instead of twelve at the SAME card size. The count comes down; the cards
 * do not (they stay large by design law).
 */
const SHOWN = 6;

/**
 * How many of those a phone draws.
 *
 * Six is one row at the widest breakpoint and THREE rows at 390px, because the
 * grid is two columns there. A phone reader sees one card at a time whatever
 * the count is, so the third row is 280px spent repeating the evidence of the
 * first. The cards themselves are untouched; the caption underneath counts what
 * is on screen either way, because it reads `current.cards.length`.
 */
const SHOWN_ON_PHONE = 4;

interface ScryfallCard {
  id: string;
  name: string;
  mana_cost?: string;
  type_line?: string;
  set?: string;
  layout?: string;
  card_faces?: unknown;
  image_uris?: Record<string, string>;
  prices?: Record<string, string | null>;
}

interface SearchResult {
  /** Scryfall's own count of every card the query matches. */
  total: number;
  cards: ScryfallCard[];
}

/** One in-flight request per query for the lifetime of the page. */
const cache = new Map<string, Promise<SearchResult | null>>();

function runSearch(q: string): Promise<SearchResult | null> {
  const hit = cache.get(q);
  if (hit) return hit;

  const promise = (async (): Promise<SearchResult | null> => {
    try {
      const url = new URL('https://api.scryfall.com/cards/search');
      url.searchParams.set('q', q);
      url.searchParams.set('unique', 'cards');
      url.searchParams.set('order', 'edhrec');
      url.searchParams.set('dir', 'asc');

      const response = await fetch(url.toString());
      if (!response.ok) return null;

      const json = await response.json();
      const rows = (json?.data ?? []) as ScryfallCard[];
      const drawable = rows
        .filter(card => Boolean(card?.image_uris?.normal || (card as any)?.card_faces?.[0]?.image_uris?.normal))
        .slice(0, SHOWN);

      if (drawable.length === 0) return null;
      return {
        total: Number(json?.total_cards) || drawable.length,
        cards: drawable,
      };
    } catch {
      /* A search that will not run shows no results rather than fake ones. */
      return null;
    }
  })();

  cache.set(q, promise);
  return promise;
}

/* -------------------------------------------------------------------- pieces */

function ResultCard({ card }: { card: ScryfallCard }) {
  const usd = card.prices?.usd;
  return (
    <figure className="group min-w-0">
      <CardImage
        card={card}
        size="md"
        fill
        className="transition-transform duration-500 group-hover:-translate-y-1.5"
      />
      <figcaption className="mt-3">
        <p className="truncate text-sm font-medium leading-snug">{card.name}</p>
        <div className="mt-1.5 flex min-h-[1.125rem] items-center gap-2">
          <ManaCost cost={card.mana_cost ?? null} size="xs" />
          {usd && (
            <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
              ${Number(usd).toFixed(2)}
            </span>
          )}
        </div>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ section */

export function HomeSearch() {
  const [ref, near] = useNearViewport<HTMLDivElement>();
  const [active, setActive] = useState(QUERIES[0].q);
  const [results, setResults] = useState<Record<string, SearchResult | null>>({});
  const [pending, setPending] = useState(true);

  useEffect(() => {
    if (!near) return;
    let alive = true;

    if (active in results) {
      setPending(false);
      return;
    }

    setPending(true);
    runSearch(active).then(result => {
      if (!alive) return;
      setResults(prev => ({ ...prev, [active]: result }));
      setPending(false);
    });

    return () => {
      alive = false;
    };
  }, [near, active, results]);

  const current = results[active] ?? null;
  const note = QUERIES.find(entry => entry.q === active)?.note ?? '';
  const loading = pending && current === null;

  return (
    <Section>
      <div ref={ref} aria-hidden className="h-0" />

      <SectionHeading
        title="Search it the way you search Scryfall"
        lead={
          <>
            If you know how to search on Scryfall, you already know how to search here. The same
            search terms all work: colour identity, mana value, rules text, what is legal where,
            power and toughness.{' '}
            <span className="hidden sm:inline">Pick one below and watch it run.</span>
          </>
        }
      />

      {/* --------------------------------------------------------- the queries */}
      <div className="mt-8 flex flex-wrap justify-center gap-2 sm:mt-12">
        {QUERIES.map(entry => {
          const on = entry.q === active;
          return (
            <button
              key={entry.q}
              type="button"
              onClick={() => setActive(entry.q)}
              aria-pressed={on}
              className={cn(
                /* 44px tall on a phone. Unchanged from `sm` up. */
                'rounded-full px-4 py-3.5 text-xs transition-colors sm:py-2 sm:text-sm',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                on
                  ? 'bg-foreground font-medium text-background'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {entry.note}
            </button>
          );
        })}
      </div>

      {/* ------------------------------------------------------- the search bar */}
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-card px-5 py-4 shadow-lg shadow-black/20 sm:mt-8 sm:px-6">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <code className="min-w-0 flex-1 break-words font-mono text-sm text-foreground sm:text-base">
          {active}
        </code>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {current ? (
            <>
              <span className="font-medium text-foreground">
                {current.total.toLocaleString()}
              </span>{' '}
              matches
            </>
          ) : loading ? (
            'running…'
          ) : (
            ''
          )}
        </span>
      </div>

      {/* ------------------------------------------------------------ the cards */}
      {(loading || current) && (
        <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-8 sm:mt-10 sm:grid-cols-3 lg:grid-cols-6">
          {loading
            ? Array.from({ length: SHOWN }).map((_, i) => (
                <div key={i} className={cn(i >= SHOWN_ON_PHONE && 'hidden sm:block')}>
                  <CardImageSkeleton size="md" fill />
                </div>
              ))
            : current!.cards.map((card, i) => (
                <div key={card.id} className={cn(i >= SHOWN_ON_PHONE && 'hidden sm:block')}>
                  <ResultCard card={card} />
                </div>
              ))}
        </div>
      )}

      {current && (
        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground sm:mt-8">
          {/* Counts what is drawn, not what was asked for, so it is true at both
              counts: the phone hides the last two and says so. */}
          The first{' '}
          <span className="sm:hidden">{Math.min(SHOWN_ON_PHONE, current.cards.length)}</span>
          <span className="hidden sm:inline">{current.cards.length}</span> of{' '}
          {current.total.toLocaleString()} results for{' '}
          <span className="font-mono text-foreground/80">{active}</span>, {note.toLowerCase()}, in the
          order Scryfall ranks them by how often people play them. This ran for real when the page
          loaded, on the same search the card browser uses.
        </p>
      )}

      {/* The card page IS captured — `card` in public/screens/manifest.json — and
          it is deliberately not shown here yet. Its right-hand details rail runs
          under the page's own `overflow-x-hidden` and comes out with four labels
          sliced mid-word (COLLECTOR N…, ARTIST Victor Adam…) at every width
          tried. Publishing that would be advertising the bug. Put the picture in
          once the rail has a gutter: see docs/overhaul/APP-SCREENSHOTS.md §7. */}

      <div className="mt-8 text-center sm:mt-10">
        <Button asChild size="lg" variant="outline">
          <Link to="/cards">
            Try a search
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Section>
  );
}

export default HomeSearch;
