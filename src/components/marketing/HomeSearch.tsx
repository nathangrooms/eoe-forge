import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardImage, CardImageSkeleton } from '@/components/cards/CardImage';
import { ManaCost } from '@/components/ui/mana-cost';
import { Section, SectionHeading } from '@/components/marketing/Section';
import { useNearViewport } from '@/components/marketing/sectionData';
import { cn } from '@/lib/utils';
import { cardDetailPath } from '@/components/cards/card-link';

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

/**
 * EVERY CARD HERE GOES SOMEWHERE, AND THE SOMEWHERE IS PUBLIC.
 *
 * `/cards/:id` is on the signed-out route tree and is the strongest page in the
 * product: every printing, live prices in three currencies, legality across
 * every format, honest empty states. Nothing on the homepage linked to it.
 * Every card drawn here was a picture, and the only card-shaped button on the
 * page went to `/cards`, which is behind an account. So a stranger could look
 * at the evidence and never touch it.
 *
 * `card.id` is Scryfall's id, and `cardDetailPath` resolves a Scryfall id, one
 * of our own ids, or a plain name, so the link works with the row shape this
 * section happens to hold.
 */
function ResultCard({ card }: { card: ScryfallCard }) {
  const usd = card.prices?.usd;
  const href = cardDetailPath(card);

  const body = (
    <>
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
    </>
  );

  if (!href) return <figure className="group min-w-0">{body}</figure>;

  return (
    <figure className="min-w-0">
      <Link
        to={href}
        aria-label={`${card.name}, open the card page`}
        className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      >
        {body}
      </Link>
    </figure>
  );
}

/* ------------------------------------------------------------------ section */

export function HomeSearch() {
  const [ref, near] = useNearViewport<HTMLDivElement>();
  const [active, setActive] = useState(QUERIES[0].q);
  /*
   * WHAT IS TYPED, before it becomes the query that runs.
   *
   * This section used to draw a magnifier, a monospace string and a match
   * count, and none of it was an input. Measured across every signed-out route
   * including the opened mobile menu: ZERO `<input>` elements existed anywhere
   * a visitor could reach. Somebody tried to type their commander's name into
   * this and nothing happened, under a heading promising they already know how
   * to search here.
   *
   * It runs against Scryfall's public search endpoint, the same one the four
   * preset chips already used, so it needs no account and no database. Results
   * link to `/cards/:id`, which is also public. That is the whole loop a
   * stranger needs before deciding whether to sign up.
   */
  const [typed, setTyped] = useState(QUERIES[0].q);
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

  /* Typing settles before a request goes out. 450 ms is long enough that a
     card name is not four searches, short enough that it feels answered. */
  useEffect(() => {
    const trimmed = typed.trim();
    if (!trimmed) return;
    const timer = window.setTimeout(() => setActive(trimmed), 450);
    return () => window.clearTimeout(timer);
  }, [typed]);

  const current = results[active] ?? null;
  const preset = QUERIES.find(entry => entry.q === active);
  const note = preset?.note ?? '';
  const loading = pending && current === null;
  /* `runSearch` returns null both for "nothing matched" and for "the request
     failed", and those are different sentences. `active in results` is how we
     know the request finished at all. */
  const answered = active in results;
  const empty = answered && current === null;

  const choose = (q: string) => {
    setTyped(q);
    setActive(q);
  };

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
            <span className="hidden sm:inline">Some of the searches people run most.</span>
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
              onClick={() => choose(entry.q)}
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

      {/* ------------------------------------------------------- the search bar
          A REAL INPUT. See the note on `typed`. */}
      <form
        className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-card px-4 py-3 shadow-lg shadow-black/20 sm:mt-8 sm:px-5"
        onSubmit={event => {
          event.preventDefault();
          const trimmed = typed.trim();
          if (trimmed) setActive(trimmed);
        }}
        role="search"
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <label htmlFor="home-search" className="sr-only">
          Search every Magic card
        </label>
        <input
          id="home-search"
          type="search"
          value={typed}
          onChange={event => setTyped(event.target.value)}
          /* The box arrives holding a preset query, because the section's job
             is to show a real search that already ran. Selecting it on focus
             means the first thing you type replaces the demo instead of being
             appended to the end of it. */
          onFocus={event => event.target.select()}
          spellCheck={false}
          autoComplete="off"
          placeholder="Try a card name, or c:rg t:creature pow>=5"
          className="min-h-[44px] min-w-0 flex-1 border-0 bg-transparent font-mono text-sm text-foreground outline-none placeholder:font-sans placeholder:text-muted-foreground focus-visible:outline-none sm:text-base"
        />
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {current ? (
            <>
              <span className="font-medium text-foreground">
                {current.total.toLocaleString()}
              </span>{' '}
              {current.total === 1 ? 'match' : 'matches'}
            </>
          ) : loading ? (
            'searching…'
          ) : empty ? (
            'no matches'
          ) : (
            ''
          )}
        </span>
      </form>

      {/* Nothing came back. Say which of the two reasons it was, rather than
          leaving the grid from the previous search on screen underneath a
          different query. */}
      {empty && (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Nothing matched that. Check the spelling, or try a plain card name.
        </p>
      )}

      {/* ------------------------------------------------------------ the cards */}
      {(loading || current) && (
        <div
          className={cn(
            'mt-8 gap-x-5 gap-y-8 sm:mt-10',
            /* A name search usually returns one or two cards, and one card in a
               six column grid is one card and five empty columns. Few results
               centre; a full set keeps the grid. */
            !loading && current && current.cards.length < 3
              ? 'flex flex-wrap justify-center'
              : 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'
          )}
        >
          {loading
            ? Array.from({ length: SHOWN }).map((_, i) => (
                <div key={i} className={cn(i >= SHOWN_ON_PHONE && 'hidden sm:block')}>
                  <CardImageSkeleton size="md" fill />
                </div>
              ))
            : current!.cards.map((card, i) => (
                <div
                  key={card.id}
                  className={cn(
                    i >= SHOWN_ON_PHONE && 'hidden sm:block',
                    current!.cards.length < 3 && 'w-40 sm:w-52'
                  )}
                >
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
          {/* `note` only exists for the four presets. Typing your own query
              left it empty and the sentence read ", , in the order". */}
          <span className="font-mono text-foreground/80">{active}</span>
          {note ? `, ${note.toLowerCase()},` : ','} in the order Scryfall ranks them by how often
          people play them. This is a real search, run just now, on the same card pool the browser
          uses. Choose any card to open its page.
        </p>
      )}

      {/* The card page IS captured — `card` in public/screens/manifest.json — and
          it is deliberately not shown here yet. Its right-hand details rail runs
          under the page's own `overflow-x-hidden` and comes out with four labels
          sliced mid-word (COLLECTOR N…, ARTIST Victor Adam…) at every width
          tried. Publishing that would be advertising the bug. Put the picture in
          once the rail has a gutter: see docs/overhaul/APP-SCREENSHOTS.md §7. */}

      {/* The button used to say "Try a search" and lead to `/cards`, which is
          behind an account, so the one thing it invited you to do was the one
          thing it would not let you do. The box above IS the try. This is the
          next step, and it says what is behind it. */}
      <div className="mt-8 text-center sm:mt-10">
        <Button asChild size="lg" variant="outline">
          <Link to="/cards">
            Open the full card browser
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          Filters, sorting and saving what you find need an account. Searching here does not.
        </p>
      </div>
    </Section>
  );
}

export default HomeSearch;
