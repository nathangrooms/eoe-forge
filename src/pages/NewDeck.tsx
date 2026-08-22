import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Crown, Loader2, Sword, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CardImage } from '@/components/cards';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { useCommanderBrowse } from '@/components/ai-builder/useCommanderBrowse';
import {
  EMPTY_COMMANDER_FILTERS,
  buildCommanderQuery,
  commanderSearchUrl,
  countActiveFilters,
  type CommanderFilters,
} from '@/components/ai-builder/commander-query';
import { CommanderWall } from '@/components/ai-builder/CommanderWall';

/**
 * The "New Deck" flow, as a real page at `/decks/new`.
 *
 * This used to be a dialog owned by the nav shell, which meant the flow had no
 * URL, no browser Back, and covered the deck list it was launched from. It is a
 * destination — you go there, you fill it in, you leave — so it is a route.
 *
 * The rail's builder entry cannot simply link to `/deck-builder`: that route
 * bounces to `/decks` whenever there is no `?deck=` parameter, so a control
 * labelled "Deck Builder" reliably landed the user on the deck *list*. A deck
 * has to exist before the builder has anything to open, so this page creates
 * one and then navigates to `/deck-builder?deck=<id>`.
 *
 * Layout: this is the first thing anyone does in the product, and it used to be
 * a 1024px ribbon down the middle of the screen whose right-hand half stayed
 * empty until you typed something — a format row, a name box, and 500px of
 * nothing. It now runs the full width, and the commander wall loads up front in
 * EDHREC play order, so the page opens on a screen of card art rather than on a
 * blank box. Design law 5: card art wherever a card is referenced.
 */

type DeckFormat = 'commander' | 'standard' | 'custom';

const FORMATS: ReadonlyArray<{
  id: DeckFormat;
  label: string;
  hint: string;
  icon: typeof Crown;
}> = [
  { id: 'commander', label: 'Commander', hint: '100 cards, singleton', icon: Crown },
  { id: 'standard', label: 'Standard', hint: '60 cards, 4 copies', icon: Sword },
  { id: 'custom', label: 'Custom', hint: 'No restrictions', icon: Wand2 },
];

const FALLBACK_NAME = 'Untitled deck';

/** The default wall: every legal commander, most played first. */
const POPULAR_URL = commanderSearchUrl('is:commander legal:commander', 'edhrec');

export function NewDeck() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [format, setFormat] = useState<DeckFormat>('commander');
  const [name, setName] = useState('');
  const [commander, setCommander] = useState<any>(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  // Whether the name box has been typed in. An auto-filled commander name may
  // be overwritten by a later commander choice; a name the user typed may not.
  const nameTouchedRef = useRef(false);

  const wantsCommander = format === 'commander';

  /* ---------------------------------------------------------------- *
   * The commander wall
   *
   * One query at a time: the EDHREC-ordered wall until something is typed, the
   * name search after that. Two hooks used to run side by side so that clearing
   * the box did not re-fetch the wall; the page cache in `useScryfallPage` does
   * that job now, and it does it for every page the reader has already seen
   * rather than only the first.
   * ---------------------------------------------------------------- */

  /* The typed query, already settled.
     `ListingSearch` inside the wall holds the draft and commits on the shared
     250ms, so the local 350ms timer that used to sit here has nothing left to
     wait out. The audit counted 250, 300, 350, 400 and 220ms across the
     product, with no reason recorded for any of them. */
  const committedQuery = query.trim();

  /* The same finder the deck generator uses, and now the same wall underneath
     it rather than a second one styled to match. Owner: "Maybe new deck uses
     the same header style for searching too?" Both pages are answering the same
     question, so they ask it with the same component. */
  const [filters, setFilters] = useState<CommanderFilters>(EMPTY_COMMANDER_FILTERS);
  const [sortOrder, setSortOrder] = useState('edhrec');
  const activeFilters = countActiveFilters(filters);

  const searching = committedQuery.length > 0 || activeFilters > 0;

  const browseUrl = useMemo(() => {
    if (!wantsCommander) return null;
    if (!searching) return POPULAR_URL;
    /* Filters and typed text are both narrowing the same list, so they are one
       query. `buildCommanderQuery` already emits `is:commander`, which is why
       it is not added again when filters are on. */
    const parts = [
      activeFilters > 0 ? buildCommanderQuery(filters) : 'is:commander legal:commander',
      committedQuery,
    ].filter(Boolean);
    return commanderSearchUrl(parts.join(' '), sortOrder);
  }, [wantsCommander, searching, committedQuery, filters, activeFilters, sortOrder]);

  const browse = useCommanderBrowse({
    url: browseUrl,
    sizeKey: 'new-deck-commanders',
  });

  /* A page turn starting at the top of the wall, and the image quality ladder
     that keeps a wall of commanders from fetching 672px scans, both moved into
     `CommanderWall` and `ListingFrame`. They were written out twice. */

  const pickCommander = useCallback((card: any) => {
    setCommander(card);
    setQuery('');
    if (!nameTouchedRef.current) setName(card.name);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!user) {
      showError('Sign in required', 'Sign in before creating a deck.');
      return;
    }

    const deckName = name.trim() || commander?.name || FALLBACK_NAME;
    const identity: string[] = wantsCommander
      ? commander?.color_identity ?? commander?.colors ?? []
      : [];

    setCreating(true);
    try {
      const { data: newDeck, error } = await supabase
        .from('user_decks')
        .insert({
          user_id: user.id,
          name: deckName,
          format,
          // power_level mirrors the canonical EDH score and is written only by
          // persistDeckPower once the deck has cards to score. Seeding it with
          // a literal 5 is what made every new deck read "Power 5/10".
          colors: identity,
          description: '',
        })
        .select()
        .single();

      if (error) throw error;
      if (!newDeck) throw new Error('No deck returned');

      if (wantsCommander && commander) {
        const { error: commanderError } = await supabase.from('deck_cards').insert({
          deck_id: newDeck.id,
          card_id: commander.id,
          card_name: commander.name,
          quantity: 1,
          is_commander: true,
          is_sideboard: false,
        });
        // The deck itself exists either way — losing the commander row is worth
        // a log, not worth throwing away a deck the user just made.
        if (commanderError) console.error('Error seeding commander:', commanderError);
      }

      showSuccess('Deck created', `"${deckName}" is ready to build`);
      // `replace`: Back from the builder should return to the deck list, not to
      // a half-filled form for a deck that already exists.
      navigate(`/deck-builder?deck=${newDeck.id}`, { replace: true });
    } catch (error) {
      console.error('Error creating deck:', error);
      showError('Could not create deck', 'Something went wrong. Please try again.');
      setCreating(false);
    }
  }, [user, name, commander, wantsCommander, format, navigate]);

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 pb-28 pt-2 md:px-6 md:pt-4">
      {/* Back / forward, plus a labelled destination so the control does not
          depend on browser chrome that PWA and mobile do not show. */}
      <div className="mb-3 flex items-center gap-2">
        <Link
          to="/decks"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" />
          Decks
        </Link>
      </div>

      {/* The primary action lives HERE as well as at the foot.

          The owner: "selecting a commander doesnt let you actually progress,
          nothing happens and no continue button at top to create?". The button
          did exist, in a sticky bar at the bottom, and it was measured sitting at
          y=1555 in a 900px viewport. `overflow-x-hidden` on the app's main
          element forces `overflow-y` to compute as `auto`, which makes it a
          scroll container, and a `position: sticky` descendant then anchors to
          THAT container rather than the viewport. So the action was 655px below
          the fold on a page whose whole job is to be scrolled.

          Rather than depend on sticky behaving, the action is simply where
          someone looks for it: beside the title, at the top, visible the moment
          the page loads. The bottom bar stays for when you have scrolled the
          commander wall. */}
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            New deck
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {wantsCommander
              ? 'Pick a format and a commander, or skip the commander and open the builder empty.'
              : 'Pick a format, name it, and the builder opens on the empty list.'}
          </p>
        </div>
        <Button onClick={handleCreate} disabled={creating} size="lg" className="shrink-0">
          {creating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              Creating
            </>
          ) : (
            <>
              Create deck
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </header>

      {/* Setup bar: format and name side by side across the full width, with
          the chosen commander in the same row rather than in a second column
          that stays empty until something is chosen. */}
      <div className="rounded-xl bg-card p-4 shadow-lg shadow-black/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <fieldset className="min-w-0 shrink-0">
            <legend className="pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Format
            </legend>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map(option => {
                const selected = format === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setFormat(option.id)}
                    aria-pressed={selected}
                    className={cn(
                      'flex min-w-[8.5rem] flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selected
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-black/20'
                        : 'bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <option.icon className="h-4 w-4 shrink-0" />
                      {option.label}
                    </span>
                    <span
                      className={cn(
                        'text-[11px] leading-tight',
                        selected ? 'text-primary-foreground/70' : 'text-muted-foreground'
                      )}
                    >
                      {option.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="min-w-0 flex-1 space-y-2">
            <Label
              htmlFor="new-deck-name"
              className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              Deck name
            </Label>
            <Input
              id="new-deck-name"
              value={name}
              onChange={event => {
                nameTouchedRef.current = true;
                setName(event.target.value);
              }}
              placeholder={wantsCommander ? 'e.g. Atraxa Superfriends' : 'e.g. Mono Red Aggro'}
              autoFocus
              onKeyDown={event => {
                if (event.key === 'Enter' && !creating) handleCreate();
              }}
              // `ui/input` ships a hairline border; this surface uses a tint instead.
              className="h-11 border-none bg-muted/40 text-base"
            />
          </div>

          {wantsCommander && (
            <div className="min-w-0 lg:w-[22rem] lg:shrink-0">
              <p className="pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Commander
              </p>
              {commander ? (
                <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-2">
                  <CardImage card={commander} width={64} hideFlip />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{commander.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{commander.type_line}</p>
                    <ColorIdentity
                      colors={commander.color_identity ?? []}
                      size="sm"
                      className="mt-1"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCommander(null)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div className="flex h-11 items-center rounded-lg bg-muted/40 px-3">
                  <p className="truncate text-sm text-muted-foreground">
                    Optional. Pick one from the wall below.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {wantsCommander && (
        <section className="mt-6">
          {/*
            The same wall the deck generator's first step draws.

            It was written out twice: the finder, the search box, the size
            slider, the heading, the grid of picks and the pager all existed
            here and again in `CommanderStage`, and the two copies had already
            drifted on card width, slider breakpoint and debounce. One
            component, two callers, and the only thing this page asks for that
            the generator does not is the ring on the commander you chose,
            because this page keeps you here afterwards.
          */}
          <CommanderWall
            cards={browse.cards}
            loading={browse.loading}
            error={browse.error}
            total={browse.total}
            page={browse.page}
            pageCount={browse.pageCount}
            onPageChange={browse.setPage}
            pageSize={browse.pageSize}
            onPageSizeChange={browse.setPageSize}
            searchValue={query}
            onSearchChange={setQuery}
            filters={filters}
            onFiltersChange={setFilters}
            sortOrder={sortOrder}
            onSortOrderChange={setSortOrder}
            onRunFinder={() => setQuery(query.trim())}
            onClearFinder={() => setFilters(EMPTY_COMMANDER_FILTERS)}
            finderSearching={browse.loading}
            finderResultCount={searching ? browse.total : null}
            sizeKey="new-deck-commanders"
            defaultSize={172}
            heading={searching ? 'Search results' : 'Most played commanders'}
            headingHint={searching ? undefined : 'in EDHREC play order'}
            selectedId={commander?.id ?? null}
            onSelect={pickCommander}
            selectVerb="Use"
          />
        </section>
      )}

      {/* Sticky action row: the commander wall is tall, and the primary action
          must not scroll off the bottom of it. Full width, like the page. */}
      <div className="sticky bottom-0 z-10 -mx-3 mt-6 bg-background/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-6 md:px-6">
        <div className="flex w-full items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm text-muted-foreground">
            {wantsCommander && commander
              ? `Commander: ${commander.name}`
              : wantsCommander
                ? 'No commander chosen. You can add one in the builder.'
                : `${FORMATS.find(f => f.id === format)?.label} deck`}
          </p>
          <div className="flex shrink-0 gap-2">
            {/* A real button, not `asChild` around a Link: `disabled` does
                nothing to an anchor, and Cancel must not fire mid-create. */}
            <Button variant="ghost" onClick={() => navigate('/decks')} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                  Creating
                </>
              ) : (
                'Create deck'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NewDeck;
