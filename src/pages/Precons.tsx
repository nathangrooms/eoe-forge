import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Boxes } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { CardGrid } from '@/components/cards';
import { ManaPip } from '@/components/ui/mana-cost';
import {
  FIELD,
  FacetChip,
  FilterBar,
  ListingFrame,
  ListingSearch,
  SURFACE,
  SortControl,
  matchedLabel,
  resultSentence,
  totalActiveFilters,
  useListingView,
  useSearchText,
} from '@/components/listing';
import { usePagedItems } from '@/hooks/usePagination';
import { cn } from '@/lib/utils';
import { PreconTile, PreconTileSkeleton } from '@/components/precons/PreconTile';
import { PreconDeckView } from '@/components/precons/PreconDeckView';
import {
  PRECON_MODES,
  PRECON_SORT_OPTIONS,
  PRECON_VIEW_SURFACE,
  TILE_WIDTH,
  WUBRG,
  type PreconDensity,
  type PreconSortKey,
} from '@/components/precons/precon-view';
import { preconIndexEntry } from '@/data/precon-index';
import type { DeckCardRow } from '@/lib/deck/deckCards';
import {
  fetchCommanderCards,
  fetchPreconDeck,
  fetchPreconList,
  resolvePreconRows,
  summarizePrecons,
  type CommanderCardMap,
  type PreconDeck,
  type PreconSummary,
} from '@/lib/precons/precon-api';

/**
 * The precon browser.
 *
 * This used to be a text list: a collapsible tree of set names on the left and
 * a decklist on the right, with no commander, no colour identity and no art
 * until something was already selected — for a product line people pick almost
 * entirely on "who's the commander and what colours is it". Every precon now
 * leads with its commander's art and card, and opening one is a full page
 * rather than a panel.
 *
 * The commander is not in the edge function's list response, so it comes from
 * the generated `precon-index` (see `scripts/generate-precon-index.mjs`) —
 * resolving it live would mean downloading 85 MB of decklists to paint a grid.
 */

/**
 * ## Paging: numbered pages, and why the infinite scroll went
 *
 * This page grew its results by an `IntersectionObserver` with a 600px root
 * margin, plus a "Show 24 more" button as a fallback. It was one of two
 * surfaces in the product that paged that way, and the audit named the cost:
 * design law 4 requires back and forward to work everywhere, and a scroll
 * position is not somewhere you can go back to. You could not link the third
 * screenful of precons, a reload put you at the top, and Back left the
 * catalogue entirely.
 *
 * The limit was never a fetch, only a render limit over an array already in
 * memory, so `Pager` is a straight swap: same reason for not mounting all 184
 * tiles at once (each carries two images, so the whole catalogue is ~370
 * requests on first paint), and now the page is in the address bar, the
 * rows-per-page is a real choice, and turning a page starts you at the top of
 * it. That last part is the one thing infinite scroll got right for free, and
 * `ListingFrame` does it on purpose.
 */

/** A precon opened by deep link, before the catalogue has answered. */
function summaryFromIndex(id: string): PreconSummary | null {
  const entry = preconIndexEntry(id);
  if (!entry) return null;
  return {
    id: entry.id,
    name: entry.name,
    set: entry.set,
    filename: `${entry.id}.json`,
    total: entry.total,
    ci: entry.ci,
    released: entry.released,
    commanders: entry.commanders,
  };
}

export default function Precons() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedId = searchParams.get('deck');

  const [summaries, setSummaries] = useState<PreconSummary[]>([]);
  const [commanderCards, setCommanderCards] = useState<CommanderCardMap | undefined>();
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  /* The search text is in the URL now, with the shared 250ms debounce. This
     page had neither, so it re-filtered 184 rows on every keystroke and a
     narrowed catalogue was not something you could send anybody. */
  const [query, commitQuery] = useSearchText('q');
  const [colors, setColors] = useState<string[]>([]);
  const [set, setSet] = useState('all');

  /* Density, sort axis and direction under the key the density has always been
     written to. It held the bare word `large` or `compact`, which
     `readListingView` reads, so nobody's choice resets. */
  const view = useListingView({
    surface: PRECON_VIEW_SURFACE,
    modes: PRECON_MODES,
    defaultMode: 'large',
    defaultSortKey: 'released',
    defaultSortDir: 'desc',
  });
  const density = view.mode as PreconDensity;
  const sortKey = view.sortKey as PreconSortKey;

  const [deck, setDeck] = useState<PreconDeck | null>(null);
  const [rows, setRows] = useState<DeckCardRow[]>([]);
  const [loadingDeck, setLoadingDeck] = useState(false);
  const [saving, setSaving] = useState(false);

  const browseScroll = useRef(0);
  const pendingScroll = useRef<number | null>(null);

  /* -------------------------------------------------- catalogue ------- */

  useEffect(() => {
    let cancelled = false;

    // The commander art comes from the `cards` table and the catalogue from the
    // edge function; neither blocks the other.
    fetchCommanderCards()
      .then(map => {
        if (!cancelled) setCommanderCards(map);
      })
      .catch(error => {
        // Not fatal — `commanderCard` falls back to Scryfall's image paths.
        console.error('[precons] commander lookup failed', error);
        if (!cancelled) setCommanderCards(new Map());
      });

    fetchPreconList()
      .then(items => {
        if (!cancelled) setSummaries(summarizePrecons(items));
      })
      .catch(error => {
        console.error('[precons] catalogue failed', error);
        if (!cancelled) setListError('Could not load the precon catalogue.');
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /* -------------------------------------------------- selection ------- */

  const selected = useMemo<PreconSummary | null>(() => {
    if (!selectedId) return null;
    return summaries.find(p => p.id === selectedId) ?? summaryFromIndex(selectedId);
  }, [selectedId, summaries]);

  useEffect(() => {
    if (!selectedId) return;

    let cancelled = false;
    setLoadingDeck(true);
    setDeck(null);
    setRows([]);

    fetchPreconDeck(selectedId)
      .then(async result => {
        if (cancelled) return;
        setDeck(result);
        const resolved = await resolvePreconRows(result.cards ?? []);
        if (!cancelled) setRows(resolved);
      })
      .catch(error => {
        console.error('[precons] deck failed', error);
        if (!cancelled) toast.error('Failed to load that precon');
      })
      .finally(() => {
        if (!cancelled) setLoadingDeck(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  /*
   * Opening and closing a precon touches `deck` and nothing else.
   *
   * These used to replace the whole query string, which was harmless while the
   * only thing in it was `deck`. The search text and the page number are in
   * there now, so wiping it would drop somebody back at page one of an
   * unfiltered catalogue after they looked at one deck out of page six.
   */
  const openPrecon = useCallback(
    (precon: PreconSummary) => {
      browseScroll.current = window.scrollY;
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('deck', precon.id);
        return next;
      });
      window.scrollTo({ top: 0, behavior: 'auto' });
    },
    [setSearchParams]
  );

  const closePrecon = useCallback(() => {
    pendingScroll.current = browseScroll.current;
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('deck');
      return next;
    });
  }, [setSearchParams]);

  /* -------------------------------------------------- filtering ------- */

  const sets = useMemo(() => {
    const counts = new Map<string, { count: number; newest: string }>();
    for (const precon of summaries) {
      const entry = counts.get(precon.set);
      const released = precon.released ?? '';
      if (entry) {
        entry.count += 1;
        if (released > entry.newest) entry.newest = released;
      } else {
        counts.set(precon.set, { count: 1, newest: released });
      }
    }
    return Array.from(counts.entries())
      .map(([name, value]) => ({ name, count: value.count, newest: value.newest }))
      .sort((a, b) => b.newest.localeCompare(a.newest) || a.name.localeCompare(b.name));
  }, [summaries]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const matches = summaries.filter(precon => {
      if (set !== 'all' && precon.set !== set) return false;
      if (colors.length > 0 && !colors.every(color => precon.ci.includes(color))) return false;
      if (needle) {
        const haystack = `${precon.name} ${precon.set} ${precon.commanders
          .map(c => c.name)
          .join(' ')}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });

    // Undated precons sort last in both directions rather than pretending to be
    // the oldest thing in the catalogue.
    const byDate = (a: PreconSummary, b: PreconSummary, dir: 1 | -1) => {
      if (!a.released && !b.released) return a.name.localeCompare(b.name);
      if (!a.released) return 1;
      if (!b.released) return -1;
      return dir * b.released.localeCompare(a.released) || a.name.localeCompare(b.name);
    };

    /* Three axes with a direction, where there used to be four fixed
       orderings. Descending on a date is "newest first", which is what the old
       enum called it; ascending is "oldest first". Name and set gain a reverse
       that had no control before. Undated precons still sort last in both
       directions rather than pretending to be the oldest thing here, which is
       why `byDate` takes the direction rather than the caller reversing the
       array. */
    const sorted = [...matches];
    const descending = view.sortDir === 'desc';
    switch (sortKey) {
      case 'name':
        sorted.sort((a, b) => (descending ? -1 : 1) * a.name.localeCompare(b.name));
        break;
      case 'set':
        sorted.sort(
          (a, b) =>
            (descending ? -1 : 1) * a.set.localeCompare(b.set) || a.name.localeCompare(b.name)
        );
        break;
      case 'released':
      default:
        sorted.sort((a, b) => byDate(a, b, descending ? 1 : -1));
        break;
    }
    return sorted;
  }, [summaries, query, colors, set, sortKey, view.sortDir]);

  const activeFilters = totalActiveFilters(
    query ? 1 : 0,
    colors.length,
    set !== 'all' ? 1 : 0
  );

  const toggleColor = useCallback((color: string) => {
    setColors(current =>
      current.includes(color) ? current.filter(c => c !== color) : [...current, color]
    );
  }, []);

  const resetFilters = useCallback(() => {
    commitQuery(undefined);
    setColors([]);
    setSet('all');
  }, [commitQuery]);

  /* -------------------------------------------------- paging ---------- */

  /* Any change to the result set starts the page count over, or a narrowing
     search leaves the reader on page 6 of a two-page catalogue. */
  const resetKey = useMemo(
    () => JSON.stringify([query, colors, set, sortKey, view.sortDir, density]),
    [query, colors, set, sortKey, view.sortDir, density]
  );

  const paged = usePagedItems(visible, {
    pageSize: view.pageSize,
    resetKey,
    key: 'page',
  });
  const page = paged.pageItems;

  /* -------------------------------------------------- shelves --------- */

  /**
   * The page, cut into shelves.
   *
   * 184 products in one uninterrupted grid is a wall — you scroll it, you do
   * not browse it, and nothing tells you where in the catalogue you have got
   * to. Cutting it on the axis it is already sorted by turns the same tiles
   * into a shop: run of 2024 decks, run of 2023, run of *Bloomburrow*. The
   * partition is consecutive rather than a regroup, so the sort order is
   * untouched and the section a precon lands in is always the one its
   * neighbours are in.
   */
  const shelves = useMemo(() => {
    const shelfOf = (precon: PreconSummary): { key: string; label: string } => {
      switch (sortKey) {
        case 'set':
          return { key: precon.set, label: precon.set };
        case 'name': {
          const first = (precon.name.trim()[0] ?? '#').toUpperCase();
          const key = first >= 'A' && first <= 'Z' ? first : '#';
          return { key, label: key };
        }
        default: {
          const year = precon.released ? precon.released.slice(0, 4) : null;
          return year ? { key: year, label: year } : { key: '—', label: 'Undated' };
        }
      }
    };

    const out: { key: string; label: string; items: PreconSummary[]; offset: number }[] = [];
    for (const precon of page) {
      const { key, label } = shelfOf(precon);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(precon);
      else out.push({ key, label, items: [precon], offset: 0 });
    }
    // Running index across shelves, so "the first six tiles load eagerly"
    // still means the first six on the page and not the first six of every
    // section.
    let seen = 0;
    for (const shelf of out) {
      shelf.offset = seen;
      seen += shelf.items.length;
    }
    return out;
  }, [page, sortKey]);

  /**
   * Put the reader back where they were when they opened a precon.
   *
   * `useLayoutEffect`, not `useEffect` + `requestAnimationFrame`: the grid is in
   * the DOM and laid out by the time this runs, so the document is already tall
   * enough to honour the offset — where a plain effect scrolls against a
   * document that is still only as tall as the detail view it just replaced and
   * gets clamped to 0. A single deferred repeat covers anything that settles a
   * tick later.
   */
  useLayoutEffect(() => {
    if (selectedId || pendingScroll.current == null) return;

    const target = pendingScroll.current;
    pendingScroll.current = null;
    window.scrollTo({ top: target, behavior: 'auto' });

    const retry = window.setTimeout(
      () => window.scrollTo({ top: target, behavior: 'auto' }),
      0
    );
    return () => window.clearTimeout(retry);
  }, [selectedId]);

  /* -------------------------------------------------- saving ---------- */

  const savePrecon = useCallback(async () => {
    if (!selected || !user) return;
    const resolvedRows = rows.filter(row => row.card);
    if (resolvedRows.length === 0) {
      toast.error('No cards could be matched to the card database yet.');
      return;
    }

    setSaving(true);
    try {
      const identity = Array.from(
        new Set(
          rows.filter(row => row.is_commander).flatMap(row => row.card?.color_identity ?? [])
        )
      );

      const { data: created, error: deckError } = await supabase
        .from('user_decks')
        .insert({
          user_id: user.id,
          name: `${deck?.name ?? selected.name} (Precon)`,
          format: 'commander',
          colors: identity.length > 0 ? identity : selected.ci,
          // power_level is written only by `persistDeckPower` from the
          // canonical score. A literal 5 here made every imported precon read
          // "Power 5/10" for the rest of its life.
          description: `Official precon deck from ${selected.set}`,
        })
        .select()
        .single();

      if (deckError) throw deckError;

      // `resolvePreconRows` has already swapped in the local card id for any
      // printing the table does not carry, so every row here is insertable.
      const { error: cardsError } = await supabase.from('deck_cards').insert(
        resolvedRows.map(row => ({
          deck_id: created.id,
          card_id: row.card_id,
          card_name: row.card_name,
          quantity: row.quantity,
          is_commander: row.is_commander,
          is_sideboard: false,
        }))
      );
      if (cardsError) throw cardsError;

      const missing = rows.length - resolvedRows.length;
      if (missing > 0) {
        toast.warning(
          `${missing} card${missing === 1 ? ' is' : 's are'} not in the local card database and were skipped.`
        );
      }
      toast.success(`Loaded "${selected.name}" with ${resolvedRows.length} cards`);
      navigate(`/deck-builder?deck=${created.id}`);
    } catch (error) {
      console.error('[precons] save failed', error);
      toast.error('Failed to load that list into your decks');
    } finally {
      setSaving(false);
    }
  }, [selected, user, rows, deck, navigate]);

  /* -------------------------------------------------- render ---------- */

  // One header for both modes. The open precon states its own name in the hero
  // at display size, so repeating it in the section header just prints the deck
  // name twice, six lines apart.
  if (selectedId) {
    return (
      <StandardPageLayout title="Precons" breadcrumbs={false}>
        {selected ? (
          <PreconDeckView
            precon={selected}
            deck={deck}
            rows={rows}
            loading={loadingDeck}
            saving={saving}
            canSave={Boolean(user)}
            onBack={closePrecon}
            onSave={savePrecon}
          />
        ) : (
          <div className="rounded-xl bg-card p-10 text-center shadow-lg shadow-black/20">
            <p className="text-muted-foreground">Loading precon…</p>
            <Button variant="ghost" size="sm" onClick={closePrecon} className="mt-3">
              Back to all precons
            </Button>
          </div>
        )}
      </StandardPageLayout>
    );
  }

  return (
    <StandardPageLayout
      title="Precons"
      description="Every official Commander preconstructed deck, led by its commander."
    >
      <div className="space-y-4">
        <FilterBar
          view={view}
          activeCount={activeFilters}
          onClear={resetFilters}
          search={
            <ListingSearch
              value={query}
              onCommit={commitQuery}
              placeholder="Search precons, commanders or sets"
              label="Search precons"
            />
          }
          presets={
            <Select value={set} onValueChange={setSet}>
              <SelectTrigger
                className={cn(FIELD, 'h-9 w-full min-w-[9rem] lg:w-44')}
                aria-label="Filter by set"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={SURFACE}>
                <SelectItem value="all">All sets</SelectItem>
                {sets.map(s => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.name} ({s.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
          sort={
            <SortControl
              options={PRECON_SORT_OPTIONS}
              value={sortKey}
              onValueChange={view.setSortKey}
              dir={view.sortDir}
              onToggleDir={view.toggleSortDir}
              label="Sort precons by"
            />
          }
          facets={
            /* Colour identity, as real mana pips. The page's own facet: no
               other listing here asks a question about a commander's colours,
               and it is the first thing a Commander player narrows on. */
            <>
              <span className="mr-1 text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
                Colours
              </span>
              {WUBRG.map(color => (
                <FacetChip
                  key={color}
                  selected={colors.includes(color)}
                  onClick={() => toggleColor(color)}
                  title={`Commanders whose identity includes ${color}`}
                >
                  <ManaPip symbol={color} size="xs" />
                </FacetChip>
              ))}
              {colors.length > 0 && (
                <span className="ml-1 text-xs text-muted-foreground">
                  {colors.length === 1
                    ? 'Commander identity includes this colour'
                    : 'Commander identity includes all of these'}
                </span>
              )}
            </>
          }
        />

        <ListingFrame
          view={view}
          count={page.length}
          loading={loadingList}
          summary={
            listError
              ? undefined
              : resultSentence([
                  matchedLabel(visible.length, summaries.length, 'precon'),
                  /* Only meaningful unfiltered: with a filter on it counts sets
                     in the catalogue, not sets in the result. */
                  activeFilters === 0 &&
                    sets.length > 0 && {
                      value: `across ${sets.length.toLocaleString()}`,
                      label: sets.length === 1 ? 'set' : 'sets',
                    },
                ])
          }
          skeleton={
            <CardGrid width={TILE_WIDTH[density]}>
              {Array.from({ length: density === 'compact' ? 16 : 12 }, (_, i) => (
                <PreconTileSkeleton key={i} compact={density === 'compact'} />
              ))}
            </CardGrid>
          }
          beforeResults={
            listError ? (
              <div className="rounded-xl bg-card p-10 text-center shadow-lg shadow-black/20">
                <p className="font-medium">{listError}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The precon catalogue is fetched live from a public repository. Try again shortly.
                </p>
              </div>
            ) : null
          }
          pager={{
            page: paged.page,
            pageCount: paged.pageCount,
            onPageChange: paged.setPage,
            total: paged.total,
            shown: page.length,
            noun: 'precon',
            label: 'Precon pages',
          }}
          empty={{
            title: listError ? 'Nothing to show' : 'No precons match those filters',
            description: listError
              ? undefined
              : 'Try a different colour combination, or clear the search.',
            icon: Boxes,
            onClearFilters: activeFilters > 0 ? resetFilters : undefined,
          }}
        >
          {/* Both modes are `rows`, so the frame hands the body straight
              through and the shelves keep their own grids. */}
          <div className="space-y-8">
            {shelves.map(shelf => (
              <section key={shelf.key} aria-label={shelf.label}>
                {/* Sticky under the 64px fixed top bar, so the shelf you are
                    looking at names itself the whole way down. */}
                <h2 className="sticky top-16 z-20 -mx-1 mb-3 flex items-baseline gap-3 bg-background/90 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/70">
                  <span className="text-xl font-bold tracking-tight tabular-nums">
                    {shelf.label}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {shelf.items.length} {shelf.items.length === 1 ? 'deck' : 'decks'}
                  </span>
                </h2>

                <CardGrid width={TILE_WIDTH[density]}>
                  {shelf.items.map((precon, index) => (
                    <PreconTile
                      key={precon.id}
                      precon={precon}
                      cards={commanderCards}
                      onSelect={openPrecon}
                      compact={density === 'compact'}
                      eager={shelf.offset + index < (density === 'compact' ? 8 : 6)}
                    />
                  ))}
                </CardGrid>
              </section>
            ))}
          </div>
        </ListingFrame>
      </div>
    </StandardPageLayout>
  );
}
