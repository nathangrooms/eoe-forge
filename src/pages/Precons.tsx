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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { CardGrid } from '@/components/cards';
import { PreconTile, PreconTileSkeleton } from '@/components/precons/PreconTile';
import { PreconDeckView } from '@/components/precons/PreconDeckView';
import {
  PreconFilterBar,
  type PreconSort,
} from '@/components/precons/PreconFilterBar';
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

const TILE_WIDTH = 300;

/**
 * Tiles rendered per page. Each one carries two images (the art band and the
 * commander's card), so mounting all 184 at once queues ~370 requests on first
 * paint — `loading="lazy"` alone does not save you when the whole grid is in
 * the document. The next page loads as the end of the list comes into view, or
 * on a click.
 */
const PAGE_SIZE = 36;

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

  const [query, setQuery] = useState('');
  const [colors, setColors] = useState<string[]>([]);
  const [set, setSet] = useState('all');
  const [sort, setSort] = useState<PreconSort>('newest');

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

  const openPrecon = useCallback(
    (precon: PreconSummary) => {
      browseScroll.current = window.scrollY;
      setSearchParams({ deck: precon.id });
      window.scrollTo({ top: 0, behavior: 'auto' });
    },
    [setSearchParams]
  );

  const closePrecon = useCallback(() => {
    pendingScroll.current = browseScroll.current;
    setSearchParams({});
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

    const sorted = [...matches];
    switch (sort) {
      case 'newest':
        sorted.sort((a, b) => byDate(a, b, 1));
        break;
      case 'oldest':
        sorted.sort((a, b) => byDate(a, b, -1));
        break;
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'set':
        sorted.sort((a, b) => a.set.localeCompare(b.set) || a.name.localeCompare(b.name));
        break;
    }
    return sorted;
  }, [summaries, query, colors, set, sort]);

  const activeFilters = (query ? 1 : 0) + colors.length + (set !== 'all' ? 1 : 0);

  const toggleColor = useCallback((color: string) => {
    setColors(current =>
      current.includes(color) ? current.filter(c => c !== color) : [...current, color]
    );
  }, []);

  const resetFilters = useCallback(() => {
    setQuery('');
    setColors([]);
    setSet('all');
  }, []);

  /* -------------------------------------------------- paging ---------- */

  const [limit, setLimit] = useState(PAGE_SIZE);
  const sentinel = useRef<HTMLDivElement | null>(null);

  // Any change to the result set starts the page count over, or a narrow
  // search would inherit a limit large enough to render everything anyway.
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [query, colors, set, sort]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || limit >= visible.length) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setLimit(current => current + PAGE_SIZE);
        }
      },
      { rootMargin: '600px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [limit, visible.length]);

  const page = useMemo(() => visible.slice(0, limit), [visible, limit]);

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
      <div className="space-y-5">
        <PreconFilterBar
          query={query}
          onQueryChange={setQuery}
          colors={colors}
          onToggleColor={toggleColor}
          set={set}
          sets={sets}
          onSetChange={setSet}
          sort={sort}
          onSortChange={setSort}
          activeCount={activeFilters}
          onReset={resetFilters}
        />

        <p className="text-sm text-muted-foreground">
          {loadingList ? (
            'Loading the precon catalogue…'
          ) : (
            <>
              <span className="font-medium tabular-nums text-foreground">{visible.length}</span>{' '}
              {visible.length === 1 ? 'precon' : 'precons'}
              {activeFilters > 0 && summaries.length > 0 ? (
                <span className="tabular-nums"> of {summaries.length}</span>
              ) : (
                // Only meaningful unfiltered — with a filter on it counts sets
                // in the catalogue, not sets in the result.
                sets.length > 0 && (
                  <span className="tabular-nums"> across {sets.length} sets</span>
                )
              )}
            </>
          )}
        </p>

        {listError ? (
          <div className="rounded-xl bg-card p-10 text-center shadow-lg shadow-black/20">
            <p className="font-medium">{listError}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The precon catalogue is fetched live from a public repository. Try again shortly.
            </p>
          </div>
        ) : loadingList ? (
          <CardGrid width={TILE_WIDTH}>
            {Array.from({ length: 12 }, (_, i) => (
              <PreconTileSkeleton key={i} />
            ))}
          </CardGrid>
        ) : visible.length === 0 ? (
          <div className="rounded-xl bg-card p-12 text-center shadow-lg shadow-black/20">
            <p className="font-medium">No precons match those filters</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different colour combination or clear the search.
            </p>
            {activeFilters > 0 && (
              <Button variant="secondary" size="sm" onClick={resetFilters} className="mt-4">
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            <CardGrid width={TILE_WIDTH}>
              {page.map((precon, index) => (
                <PreconTile
                  key={precon.id}
                  precon={precon}
                  cards={commanderCards}
                  onSelect={openPrecon}
                  eager={index < 6}
                />
              ))}
            </CardGrid>

            {limit < visible.length && (
              // Doubles as the observer target and a real control. The next
              // page is already in memory — this is a render limit, not a
              // fetch — so a click expands instantly, and the button covers
              // the cases where the observer is throttled or never fires.
              <div ref={sentinel} className="flex justify-center pt-2">
                <Button
                  variant="secondary"
                  onClick={() => setLimit(current => current + PAGE_SIZE)}
                >
                  Show {Math.min(PAGE_SIZE, visible.length - limit)} more
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </StandardPageLayout>
  );
}
