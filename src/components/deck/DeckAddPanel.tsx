import { useCallback, useMemo, useState } from 'react';
import { Grid3X3, Loader2, Plus, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CardGrid } from '@/components/cards';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import {
  FacetChip,
  FilterBar,
  MetricRow,
  type ListingMode,
} from '@/components/listing';
/* `useListingView` from its own module rather than through the folder's
   barrel, and this is not style. `@/components/listing/index.ts` re-exports the
   hook, the hook imports `@/components/cards`, and `CardDetail` in there imports
   the listing barrel back: two barrels in a cycle. Rollup reports it as
   "will end up in different chunks ... will likely lead to broken execution
   order", and this file is a lazily loaded chunk, which is exactly the case it
   is warning about. Everything else still comes from the barrel. */
import { useListingView } from '@/components/listing/useListingView';
import { showError } from '@/components/ui/toast-helpers';
/* The light half, statically: counting what the deck holds against the declared
   targets is drawn on open and needs no scorer. The ranking half arrives with
   the button press. See `@/lib/deck/recommend/profile`. */
import {
  deriveDeckProfile,
  roleTargetsFor,
  ROLES,
  type CandidateCard,
  type Recommendation,
  type Role,
} from '@/lib/deck/recommend/profile';
import type { ManaProfile } from '@/lib/deck/playability';
import type { DeckCardRow } from '@/lib/deck/deckCards';
import type { IncomingCard } from '@/lib/deck/deckMutations';
import { formatLabel } from '@/lib/deck/formats';
import { DeckCardTile, TileBadge } from './DeckCardTile';

/**
 * The Add tab.
 *
 * ## What was here
 *
 * A `Card` saying which deck you were adding to, and `EnhancedUniversalCardSearch`
 * in pick mode. The search is good and it stays exactly as it was: a click on
 * the body adds the card and the page stays put, which is a documented decision
 * with an owner report behind it. Do not "fix" it back to navigation.
 *
 * What it could not do was answer the question a player has when they open it:
 * *what does this deck need*. Archidekt shows how many copies of a result are
 * already in the deck; Moxfield puts adding in a sidebar so you watch the deck
 * fill up. Both are better than a search box in front of a catalogue.
 *
 * ## What is here now
 *
 * **What the deck is short of, per role.** Free, deterministic, no request:
 * `deriveDeckProfile` counts what the deck's own cards do and `roleTargetsFor`
 * declares what a deck of this size in this format is aiming for. The two are
 * kept apart on purpose — "you have 4 ramp" is a fact about the deck and "you
 * want 10" is an opinion this product holds out loud, and the panel says which
 * is which.
 *
 * **Ranked suggestions from the in-house engine.** `src/engine/advise` is a
 * complete, tested recommender whose only importers were its own tests; the
 * census gave it an ultimatum, which was to be wired up or admitted to be dead
 * code. It is wired up here, behind an explicit control, because the pool it
 * ranks is a real download. See `adviseSource` for exactly what is asked for
 * and the one place it deviates from the engine's own contract.
 *
 * Every card it returns is a row that exists, legal in this format, inside the
 * commander's colour identity, and not already in the deck. Every clause of
 * every reason is a number taken from that row or counted off the deck. That is
 * the difference between this and the optimiser's edge function, which makes
 * zero database queries and names cards out of a model's memory.
 */

const SUGGESTION_MODES: ListingMode[] = [
  { id: 'grid', label: 'Cards', icon: Grid3X3, layout: 'grid' },
];

const DEFAULT_CARD_SIZE = 200;

/** How many suggestions come back. Enough to choose from, few enough to read. */
const SUGGESTION_LIMIT = 24;

/**
 * `Record<Role, string>` and not a partial map on purpose: the engine owns
 * `Role`, and when it gains one this file stops compiling rather than quietly
 * drawing a tile with no name on it. `creature` arrived exactly that way.
 */
const ROLE_LABEL: Record<Role, string> = {
  ramp: 'Ramp',
  draw: 'Card draw',
  removal: 'Removal',
  interaction: 'Interaction',
  wincon: 'Win conditions',
  land: 'Lands',
  creature: 'Creatures',
};

export interface DeckAddPanelProps {
  deckName: string;
  format: string;
  /** The ninety-nine plus the commander, for the profile and the owned check. */
  rows: DeckCardRow[];
  commanderName?: string;
  /** The commander's colour identity. The ceiling on every suggestion. */
  identity: string[];
  /** The deck's mana base, so a suggestion it cannot cast is not made. */
  manaProfile?: ManaProfile | null;
  /** Copies owned by lower-cased card name, from `useCollectionOwnership`. */
  ownedByName?: Map<string, number>;
  onAdd: (card: IncomingCard) => void;
  /** Total cards, for the header line. */
  totalCards: number;
}

export function DeckAddPanel({
  deckName,
  format,
  rows,
  commanderName,
  identity,
  manaProfile,
  ownedByName,
  onAdd,
  totalCards,
}: DeckAddPanelProps) {
  const [suggestions, setSuggestions] = useState<Recommendation[] | null>(null);
  /* How deep the pool that was ranked went. Read off the module that did the
     asking rather than imported as a constant: a static import of
     `adviseSource` would put it back in this chunk and undo the split below,
     which the bundler reports as "dynamic import will not move module into
     another chunk". */
  const [pool, setPool] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [roleFilter, setRoleFilter] = useState<Role[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const view = useListingView({
    surface: 'deckmatrix.deck.add.view',
    modes: SUGGESTION_MODES,
    defaultSize: DEFAULT_CARD_SIZE,
  });

  /**
   * The deck as the engine sees it.
   *
   * `oracleId` is the real one now that `CARD_COLUMNS` selects it, which is
   * what stops a card already in the deck being suggested back under a
   * different printing. It falls back to the printing id for a row that has not
   * synced, which is the honest degradation: worst case the engine fails to
   * recognise a card it holds rather than excluding one it does not.
   */
  const profile = useMemo(
    () =>
      deriveDeckProfile({
        format,
        colorIdentity: identity,
        manaProfile: manaProfile ?? null,
        cards: rows
          .filter(row => !row.is_sideboard)
          .map(row => ({
            oracleId: row.card?.oracle_id ?? row.card_id,
            name: row.card?.name || row.card_name,
            typeLine: row.card?.type_line ?? '',
            cmc: row.card?.cmc ?? 0,
            tags: row.card?.tags ?? [],
            quantity: Math.max(1, row.quantity),
          })),
      }),
    [rows, format, identity, manaProfile]
  );

  const targets = useMemo(() => roleTargetsFor(format), [format]);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      /* The scorer, its weights and its tag knowledge arrive here rather than
         in the deck page's first load. Nobody opens this tab to wait for a
         ranking they have not asked for, and the candidate pool behind it is a
         real download in its own right. */
      const [{ recommend }, { supabaseCandidateSource, POOL_CAP: cap }] = await Promise.all([
        import('@/lib/deck/recommend'),
        import('@/lib/deck/adviseSource'),
      ]);
      const picks = await recommend(profile, supabaseCandidateSource, {
        limit: SUGGESTION_LIMIT,
      });
      setSuggestions(picks);
      setPool(cap);
    } catch (error) {
      console.error('Could not rank candidates for this deck:', error);
      showError(
        'Could not work out what to suggest',
        error instanceof Error ? error.message : 'The card catalogue did not answer.'
      );
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  const shown = useMemo(() => {
    if (!suggestions) return [];
    if (roleFilter.length === 0) return suggestions;
    return suggestions.filter(pick => pick.fillsRoles.some(role => roleFilter.includes(role)));
  }, [suggestions, roleFilter]);

  /* Roles the returned suggestions actually fill, so a chip is never a control
     that can only empty the grid. Same rule the decklist's facets follow. */
  const rolesPresent = useMemo(() => {
    const set = new Set<Role>();
    for (const pick of suggestions ?? []) for (const role of pick.fillsRoles) set.add(role);
    return ROLES.filter(role => set.has(role));
  }, [suggestions]);

  const toggleRole = (role: Role) =>
    setRoleFilter(prev => (prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]));

  /**
   * A candidate, shaped for the writer.
   *
   * No second fetch: `CandidateCard` carries everything `IncomingCard` needs
   * except the art, and `DeckCardTile` builds the Scryfall path from the
   * printing id. Adding a card should not cost a round trip to look up the card
   * you are already looking at.
   */
  const toIncoming = (card: CandidateCard): IncomingCard => ({
    id: card.id,
    name: card.name,
    type_line: card.typeLine,
    mana_cost: card.manaCost,
    cmc: card.cmc,
    color_identity: card.colorIdentity,
    legalities: card.legalities,
    tags: card.tags,
    prices: card.usd === null ? null : { usd: String(card.usd) },
  });

  const addPick = (card: CandidateCard) => {
    onAdd(toIncoming(card));
    /* Marked locally rather than removed from the list. The write is optimistic
       and may be refused (colour identity, copy limit), and a card that
       vanished from the suggestions while the toast said it could not go in
       would be the interface disagreeing with itself. */
    setAdded(prev => new Set(prev).add(card.id));
  };

  const ownedOf = (name: string) => ownedByName?.get(name.trim().toLowerCase()) ?? 0;

  return (
    <div className="space-y-6">
      {/* WHAT THIS DECK IS SHORT OF.
          Counted off the deck's own cards against a declared target. No
          request, no model, and the two halves of every figure are labelled so
          nobody mistakes the target for a measurement. */}
      {/* Columns follow how many roles the engine has, not a number typed
          here. `ROLES` was six and is seven — `creature` landed in
          `src/engine/core/types.ts` — and seven tiles in a six-column grid is
          six tiles and then one on a line of its own beside five empty cells.
          `MetricRow` caps at six, so anything past six drops to four and
          wraps evenly. */}
      <MetricRow
        columns={ROLES.length > 6 ? 4 : ROLES.length}
        metrics={ROLES.map(role => {
          const have = profile.roleCounts[role] ?? 0;
          const want = targets[role] ?? 0;
          /* A ROLE THE ENGINE SETS NO TARGET FOR HAS NO TARGET, AND MUST NOT
             BORROW ZERO AS ONE.
             `creature` is declared 0 in `YARDSTICK_WHEN_NO_SHAPE_WAS_DERIVED`
             on purpose: how many creatures a deck wants depends entirely on
             what it is trying to do, so the engine declines to guess. Printed
             through the same branch as the others that read
             "Creatures 100 /0 · 100 past the target", which is three wrong
             claims at once. It says the target is zero, it says a normal
             creature count overshoots it, and the meter fills because
             everything is past zero. A commander deck with 30 creatures is not
             30 past anything.
             So no suffix, no meter and a subtext that says why there is no
             number rather than inventing one. */
          if (want <= 0) {
            return {
              id: role,
              label: ROLE_LABEL[role],
              value: String(have),
              raw: have,
              subtext: 'no target, it depends on the deck',
            };
          }
          return {
            id: role,
            label: ROLE_LABEL[role],
            value: String(have),
            raw: have,
            suffix: `/${want}`,
            meter: Math.min(100, (have / want) * 100),
            /* "At the target" for exactly the target, and the real distance in
               either direction otherwise. A deck running 28 ramp against a
               target of 10 read "at the target", which is the one thing it is
               not, and it is the figure most in need of a word about it. */
            subtext:
              have === want
                ? 'at the target'
                : have > want
                  ? `${have - want} past the target`
                  : `${want - have} short of the target`,
          };
        })}
      />

      <Card>
        <CardContent className="space-y-1 p-4">
          <p className="text-sm font-medium">Adding cards to {deckName}</p>
          <p className="text-xs text-muted-foreground">
            {formatLabel(format)} · {totalCards} cards
            {commanderName ? ` · colour identity of ${commanderName}` : ''}
          </p>
          <p className="text-xs text-muted-foreground">
            The targets above are what we aim for in a deck this size, not a measurement of
            anything. What you have is counted off your own cards.
          </p>
        </CardContent>
      </Card>

      {/* RANKED SUGGESTIONS, FROM THE LOCAL ENGINE.
          Behind a control rather than on tab open, because the candidate pool
          is a real download and most visits to this tab are somebody who
          already knows what they came to add. */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">What this deck is asking for</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {/* WAS "by the in-house engine" and "No model is asked anything".
                  Both words are on the ban list in CLAUDE.md §10a, and the
                  second one names the very thing Magic players do not want to
                  hear about. The point it was making survives as "Nothing is
                  guessed". */}
              Ranked against this deck by DeckMatrix: legal in {formatLabel(format)}, inside your
              colour identity, not already in the list, and castable by this mana base. Every
              reason is a number counted off your deck or read off the card. Nothing is guessed.
            </p>
          </div>
          <Button onClick={fetchSuggestions} disabled={loading} className="shrink-0">
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {suggestions ? 'Rank again' : 'Suggest cards'}
          </Button>
        </div>

        {suggestions && suggestions.length > 0 && (
          <>
            <FilterBar
              view={view}
              activeCount={roleFilter.length}
              onClear={() => setRoleFilter([])}
              facets={rolesPresent.map(role => (
                <FacetChip
                  key={role}
                  selected={roleFilter.includes(role)}
                  onClick={() => toggleRole(role)}
                >
                  {ROLE_LABEL[role]}
                </FacetChip>
              ))}
            />

            <p className="text-sm text-muted-foreground">
              {shown.length} of {suggestions.length} suggestions, ranked from the{' '}
              {(pool ?? 0).toLocaleString()} most-played legal cards in your colours. That cap is
              a popularity pre-filter, and it means a card nobody plays will not be suggested
              even if it fits this deck.
            </p>

            <CardGrid width={view.size}>
              {shown.map(pick => {
                const owned = ownedOf(pick.card.name);
                const isAdded = added.has(pick.card.id);
                return (
                  <DeckCardTile
                    key={pick.card.id}
                    card={{
                      id: pick.card.id,
                      name: pick.card.name,
                      mana_cost: pick.card.manaCost,
                      type_line: pick.card.typeLine,
                    }}
                    width={view.size}
                    badge={
                      owned > 0 ? (
                        <TileBadge>you own {owned}</TileBadge>
                      ) : pick.card.usd !== null ? (
                        <TileBadge align="right">${pick.card.usd.toFixed(2)}</TileBadge>
                      ) : undefined
                    }
                    caption={
                      pick.fillsRoles.length > 0
                        ? pick.fillsRoles.map(role => ROLE_LABEL[role]).join(' · ')
                        : undefined
                    }
                    detail={pick.reason}
                    actions={
                      <Button
                        size="sm"
                        variant={isAdded ? 'secondary' : 'default'}
                        className="h-7 px-2 text-xs"
                        onClick={() => addPick(pick.card)}
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        {isAdded ? 'Added' : 'Add'}
                      </Button>
                    }
                  />
                );
              })}
            </CardGrid>
          </>
        )}

        {suggestions && suggestions.length === 0 && !loading && (
          <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
            Nothing in the pool scored well enough against this deck to suggest. That is a real
            answer for a finished list, and for a nearly empty one it means there is not enough
            deck yet to measure a fit against.
          </p>
        )}
      </div>

      {/*
        PICKING, not browsing. You are here to put cards in a deck. A click that
        navigated to the card page would throw that on the floor. So the card
        body adds the card and the page stays put; the eye on each card opens
        its page. Same rule as the storage picker, written the same way on
        purpose. Do not "fix" it back.
      */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Search the whole catalogue</h3>
        <EnhancedUniversalCardSearch
          mode="pick"
          onCardAdd={card => onAdd(card as IncomingCard)}
          placeholder={`Search cards for ${deckName}`}
          showFilters
          showAddButton
          showWishlistButton={false}
          showViewModes
          /* The bucket the builder's mount has always written its card size
             under, so nobody's chosen size resets. */
          sizeKey="dm.card-size.deck-builder"
        />
      </div>
    </div>
  );
}

export default DeckAddPanel;
