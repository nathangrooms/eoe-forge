import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Crown, Loader2, Search, Sword, TrendingUp, Wand2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CardGrid,
  CardGridSkeleton,
  CardImage,
  CardSizeSlider,
  cardSizeForWidth,
  useCardSize,
} from '@/components/cards';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { HistoryNav } from '@/components/navigation/HistoryNav';
import { useCommanderBrowse } from '@/components/ai-builder/useCommanderBrowse';
import { commanderSearchUrl } from '@/components/ai-builder/commander-query';

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

/**
 * Commanders drawn per window.
 *
 * Scryfall answers with 175 a page. Mounting all of them costs several
 * megabytes of art for a screen that shows a dozen, so the wall grows a window
 * at a time and only asks Scryfall for the next page once the reader has caught
 * up with everything already fetched.
 */
const WINDOW_SIZE = 24;

export function NewDeck() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [format, setFormat] = useState<DeckFormat>('commander');
  const [name, setName] = useState('');
  const [commander, setCommander] = useState<any>(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [cardWidth, setCardWidth] = useCardSize('new-deck-commanders', 172);

  // Whether the name box has been typed in. An auto-filled commander name may
  // be overwritten by a later commander choice; a name the user typed may not.
  const nameTouchedRef = useRef(false);

  const wantsCommander = format === 'commander';

  /* ---------------------------------------------------------------- *
   * The commander wall
   *
   * Two independent searches — the EDHREC-ordered default and whatever has
   * been typed — so clearing the search box drops straight back to the wall
   * without re-fetching it, and a slow early keystroke cannot land on top of
   * the results for what the user has actually typed.
   * ---------------------------------------------------------------- */

  const popular = useCommanderBrowse();
  const nameSearch = useCommanderBrowse();

  const { run: runPopular } = popular;
  useEffect(() => {
    if (!wantsCommander) return;
    runPopular(POPULAR_URL);
  }, [runPopular, wantsCommander]);

  const { run: runNameSearch, reset: resetNameSearch } = nameSearch;
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      resetNameSearch();
      return;
    }
    const timer = window.setTimeout(() => {
      runNameSearch(commanderSearchUrl(`${trimmed} is:commander legal:commander`, 'edhrec'));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query, runNameSearch, resetNameSearch]);

  const searching = query.trim().length > 0;
  const browse = searching ? nameSearch : popular;

  const [windowSize, setWindowSize] = useState(WINDOW_SIZE);
  const sentinel = useRef<HTMLDivElement | null>(null);

  // A fresh result set starts the window over. Keyed on `loading` rather than
  // the array: `loadMore` appends, so resetting on the array would stop the
  // list ever growing past one window.
  useEffect(() => {
    setWindowSize(WINDOW_SIZE);
  }, [searching, browse.loading]);

  const shown = useMemo(
    () => browse.cards.slice(0, windowSize),
    [browse.cards, windowSize]
  );
  const moreToReveal = windowSize < browse.cards.length;
  const canExtend = moreToReveal || Boolean(browse.nextPage);

  const extendRef = useRef<() => void>(() => {});
  extendRef.current = () => {
    if (moreToReveal) setWindowSize(n => n + WINDOW_SIZE);
    else if (browse.nextPage && !browse.loadingMore) browse.loadMore();
  };

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !canExtend) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) extendRef.current();
      },
      { rootMargin: '400px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [canExtend, windowSize, browse.cards.length]);

  /**
   * `large` is a 672px scan — four times what a 2× display can resolve at the
   * sizes this grid renders, paid once per commander across a wall of them.
   */
  const imageQuality = cardSizeForWidth(cardWidth) === 'xl' ? undefined : ('normal' as const);

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
        <HistoryNav />
        <Link
          to="/decks"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" />
          Decks
        </Link>
      </div>

      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          New deck
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {wantsCommander
            ? 'Pick a format and a commander — or skip the commander and open the builder empty.'
            : 'Pick a format, name it, and the builder opens on the empty list.'}
        </p>
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
                    Optional — pick one from the wall below.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {wantsCommander && (
        <section className="mt-6 space-y-4">
          {/* Search and sizing, full width and unboxed — the grid below is the
              thing worth looking at, so nothing competes with it for width. */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[16rem] flex-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="new-deck-commander"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search commanders, partners and backgrounds…"
                className="h-11 border-none bg-muted/50 pl-9 pr-9 text-base"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <CardSizeSlider
              storageKey="new-deck-commanders"
              value={cardWidth}
              onValueChange={setCardWidth}
              showValue={false}
              className="hidden lg:flex"
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              {!searching && <TrendingUp className="h-4 w-4 text-muted-foreground" />}
              {searching ? 'Search results' : 'Most played commanders'}
            </h2>
            {!searching && (
              <span className="text-xs text-muted-foreground">in EDHREC play order</span>
            )}
            {browse.total !== null && browse.total > 0 && (
              <span className="text-xs tabular-nums text-muted-foreground">
                Showing {shown.length} of {browse.total.toLocaleString()}
              </span>
            )}
          </div>

          {browse.error && (
            <p className="rounded-lg bg-muted/50 p-4 text-sm text-destructive">{browse.error}</p>
          )}

          {browse.loading ? (
            <CardGridSkeleton width={cardWidth} count={12} />
          ) : browse.cards.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <Search className="h-6 w-6 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {searching
                  ? `No commanders match “${query.trim()}”.`
                  : 'No commanders came back from Scryfall.'}
              </p>
            </div>
          ) : (
            <CardGrid width={cardWidth}>
              {shown.map((card: any, i: number) => {
                const chosen = commander?.id === card.id;
                return (
                  <button
                    key={card.id ?? card.name}
                    type="button"
                    onClick={() => pickCommander(card)}
                    aria-pressed={chosen}
                    title={`Use ${card.name} as commander`}
                    className={cn(
                      'group/pick block w-full rounded-lg text-left transition-shadow',
                      chosen && 'shadow-[0_0_0_3px_hsl(var(--foreground))]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                    )}
                  >
                    <CardImage
                      card={card}
                      width={cardWidth}
                      quality={imageQuality}
                      fill
                      interactive
                      eager={i < 12}
                      hideFlip
                    >
                      {/* Sits on card art, so light-on-dark is correct here. */}
                      <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/90 to-transparent p-2 pt-8 opacity-0 transition-opacity duration-200 group-hover/pick:opacity-100 group-focus-visible/pick:opacity-100">
                        <span className="min-w-0">
                          <span className="block truncate text-[0.7rem] font-semibold text-white">
                            {card.name}
                          </span>
                          {typeof card.edhrec_rank === 'number' && (
                            <span className="block text-[0.65rem] tabular-nums text-white/70">
                              EDHREC #{card.edhrec_rank.toLocaleString()}
                            </span>
                          )}
                        </span>
                        <ColorIdentity colors={card.color_identity} size="xs" />
                      </span>
                    </CardImage>
                  </button>
                );
              })}
            </CardGrid>
          )}

          {!browse.loading && browse.cards.length > 0 && canExtend && (
            // Doubles as the observer target and a real control, so the list
            // still grows where the observer is throttled or never fires.
            <div ref={sentinel} className="flex justify-center pt-2">
              <Button
                variant="secondary"
                onClick={() => extendRef.current()}
                disabled={browse.loadingMore}
              >
                {browse.loadingMore ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
                    Loading…
                  </>
                ) : moreToReveal ? (
                  `Show ${Math.min(WINDOW_SIZE, browse.cards.length - windowSize)} more`
                ) : (
                  'Load more commanders'
                )}
              </Button>
            </div>
          )}
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
                ? 'No commander chosen — you can add one in the builder.'
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
