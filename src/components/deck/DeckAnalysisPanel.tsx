import { useMemo, useState } from 'react';
import { Grid3X3 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { CardGrid } from '@/components/cards';
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
import { SynergyEngine, type SynergyAnalysis } from '@/lib/magic/synergy';
import type { Card as StoreCard } from '@/stores/deckStore';
import type { DeckCardRow } from '@/lib/deck/deckCards';
import type { DeckPower } from '@/lib/deck/power';
import { ArchetypeDetection } from '@/components/deck-builder/ArchetypeDetection';
import { BrainAnalysis } from '@/components/deck-builder/BrainAnalysis';
import { DeckCardTile, TileBadge } from './DeckCardTile';

/**
 * The Analysis tab.
 *
 * ## What was here
 *
 * The census called this *"the least coherent tab on the page"* and then
 * counted why: three top-level blocks, one of which was itself a tab strip of
 * three, one of whose three was a chat box, sitting above another chat box.
 * `EnhancedDeckAnalysisPanel` carried a nested `TabsList` — a tab strip inside
 * a tab — and each of its sections carried its own one-shot `mtg-brain` call
 * on a button, so one tab had three routes to the same model.
 *
 * It also fed those sections a deck it had rewritten:
 * `legalities: { [format]: 'legal' }` stamped on every card, which is why the
 * validation section could never report a ban and was already turned off here.
 *
 * ## What is here now
 *
 * Three blocks and one chat, in the order the question is asked.
 *
 * 1. **What kind of deck is this**, with the cards that say so and the shell a
 *    well-built version of it is made of. `ArchetypeDetection`, which now also
 *    persists its answer to `user_decks.archetype` instead of recomputing and
 *    discarding it on every visit.
 * 2. **What works with what.** `SynergyEngine` returns `strongestSynergies`
 *    with a `cardA` and a `cardB` and the panel printed their names as two runs
 *    of text. They are cards. Owner: *"visual is always better"*. Both halves
 *    of every pair are drawn, at the size slider's width.
 * 3. **What the deck is built around.** The mechanic clusters, each one a set
 *    of cards rather than a count.
 * 4. **`BrainAnalysis`**, the single chat, briefed with the canonical
 *    `DeckPower` including its subscores, drivers and drags.
 *
 * ## Where the two things that left this tab went
 *
 * Nothing became unreachable. `EnhancedDeckAnalysisPanel`'s Suggestions section
 * held three lists: curve swaps, land-base improvements and synergy
 * improvements. The first two are answers to mana questions and are on the Mana
 * tab, under "What would fix this" — "add two more two-drops" belongs beside
 * the curve, not beside archetype detection. The third is here, below the
 * pairs, because it is a synergy answer.
 *
 * The panel itself is untouched and still mounts with all six sections from
 * `AIGeneratedDeckList`, where every section is the only place those answers
 * exist.
 */

const SYNERGY_MODES: ListingMode[] = [
  { id: 'grid', label: 'Cards', icon: Grid3X3, layout: 'grid' },
];

const DEFAULT_CARD_SIZE = 180;

export interface DeckAnalysisPanelProps {
  /** The ninety-nine, as the analysis engines see them. */
  mainboard: StoreCard[];
  commander?: StoreCard;
  format: string;
  deckId: string;
  deckName: string;
  power: DeckPower;
  /** The decklist, so every card this tab names can be drawn. */
  rows: DeckCardRow[];
  onCardClick?: (row: DeckCardRow) => void;
  /** Persist the detected archetype. Omit for a deck this reader cannot change. */
  onArchetype?: (archetype: string | null) => void;
}

export function DeckAnalysisPanel({
  mainboard,
  commander,
  format,
  deckId,
  deckName,
  power,
  rows,
  onCardClick,
  onArchetype,
}: DeckAnalysisPanelProps) {
  const [openCluster, setOpenCluster] = useState<string | null>(null);

  const view = useListingView({
    surface: 'deckmatrix.deck.analysis.view',
    modes: SYNERGY_MODES,
    defaultSize: DEFAULT_CARD_SIZE,
  });

  /**
   * The synergy read.
   *
   * Called directly rather than through `EnhancedDeckAnalysisPanel`, which is
   * what lets the real `rarity` and the real `legalities` through: that panel
   * builds its own analysis input and stamps `legalities: { [format]: 'legal' }`
   * over every card on the way in. `toAnalyticsCards` has carried both fields
   * honestly since the merge, so the shortest path to a correct answer is not
   * to rewrite them.
   */
  const synergy = useMemo<SynergyAnalysis | null>(() => {
    try {
      return SynergyEngine.analyze(mainboard as never, format);
    } catch (error) {
      console.warn('Could not read synergies for this deck:', error);
      return null;
    }
  }, [mainboard, format]);

  const rowByName = useMemo(() => {
    const map = new Map<string, DeckCardRow>();
    for (const row of rows) map.set((row.card?.name || row.card_name).trim().toLowerCase(), row);
    return map;
  }, [rows]);

  const tileFor = (name: string) => {
    const row = rowByName.get(name.trim().toLowerCase());
    return {
      card: {
        ...(row?.card ?? {}),
        id: row?.card_id,
        name,
        image_uris: row?.card?.image_uris ?? null,
        mana_cost: row?.card?.mana_cost ?? null,
      },
      row,
    };
  };

  const pairs = synergy?.strongestSynergies.slice(0, 8) ?? [];
  const clusters = synergy?.mechanicClusters.slice(0, 8) ?? [];
  const improvements = synergy?.improvementSuggestions.slice(0, 4) ?? [];

  const shownCluster = clusters.find(c => c.mechanic === openCluster) ?? clusters[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Three figures about how the deck behaves, at the top, in the tile
          every other figure in the product uses. This tab opened on a heading
          and a nested tab strip.

          A fourth tile said `Power score  2.0 /10` with the subtext "measured
          on the EDH tab", which is the tile admitting it was a pointer rather
          than a figure. The page header prints that number at 30px on this
          same screen and the EDH tab prints it three more times, so it was the
          second of five. Everything left here is measured on this tab. */}
      <MetricRow
        columns={3}
        metrics={[
          {
            id: 'synergy',
            label: 'Synergy score',
            value: synergy ? String(Math.round(synergy.totalSynergyScore)) : '—',
            raw: synergy?.totalSynergyScore,
            subtext: `over ${pairs.length} strongest ${pairs.length === 1 ? 'pair' : 'pairs'}`,
          },
          {
            id: 'pairs',
            label: 'Card pairs that work',
            value: synergy ? String(synergy.strongestSynergies.length) : '—',
            raw: synergy?.strongestSynergies.length,
            subtext: pairs[0] ? `strongest ${pairs[0].strength} out of 10` : 'none found',
          },
          {
            id: 'clusters',
            label: 'Mechanics it leans on',
            value: synergy ? String(synergy.mechanicClusters.length) : '—',
            raw: synergy?.mechanicClusters.length,
            subtext: clusters[0]
              ? `${clusters[0].mechanic} covers ${Math.round(clusters[0].coverage)}%`
              : 'no mechanic is concentrated',
          },
        ]}
      />

      <ArchetypeDetection
        deckCards={mainboard}
        commander={commander}
        format={format}
        rows={rows}
        onCardClick={onCardClick}
        cardWidth={view.size}
        onDetected={
          onArchetype ? detected => onArchetype(detected ? detected.name : null) : undefined
        }
      />

      {/* THE PAIRS, AS CARDS.
          `SynergyPair` is two card names, a type, a strength out of ten and a
          sentence. The names were printed as text with an arrow between them,
          which is the one thing on this tab a player would want to look at. */}
      {pairs.length > 0 && (
        <Card>
          <CardContent className="space-y-5 p-5 md:p-6">
            <div>
              <h3 className="text-lg font-semibold">What works with what</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Pairs in this deck whose mechanics reinforce each other, strongest first, with
                the reason each one fires. Counted off the cards’ own keywords and types.
              </p>
            </div>

            <ul className="space-y-5">
              {pairs.map(pair => {
                const a = tileFor(pair.cardA);
                const b = tileFor(pair.cardB);
                return (
                  <li key={`${pair.cardA}::${pair.cardB}`} className="space-y-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium capitalize">
                        {pair.synergyType} synergy
                      </p>
                      <p className="text-sm tabular-nums text-muted-foreground">
                        {pair.strength} out of 10
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">{pair.description}</p>
                    {/* CARDS ONLY WHEN BOTH HALVES ARE CARDS.
                        `SynergyEngine` returns two kinds of pair. Most are two
                        card names. Some are two MECHANICS — "affinity
                        synergises with artifact" — and `tileFor` cannot find a
                        row for a keyword, so those drew two empty card frames
                        with a lower-case word under each. Measured on the
                        Analysis tab at 1280: two of the four pairs on the
                        fixture deck were blank boxes. The count above still
                        says four, because four is what the engine found; what
                        changes is that a pair with no cards behind it is drawn
                        as what it is. */}
                    {a.row && b.row ? (
                      <CardGrid width={view.size}>
                        <DeckCardTile
                          card={a.card}
                          width={view.size}
                          onClick={onCardClick ? () => onCardClick(a.row as DeckCardRow) : undefined}
                        />
                        <DeckCardTile
                          card={b.card}
                          width={view.size}
                          onClick={onCardClick ? () => onCardClick(b.row as DeckCardRow) : undefined}
                        />
                      </CardGrid>
                    ) : (
                      <p className="text-sm">
                        <span className="capitalize">{pair.cardA}</span>
                        <span className="px-1.5 text-muted-foreground">with</span>
                        <span className="capitalize">{pair.cardB}</span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* THE CLUSTERS, AS CARDS.
          A mechanic with a coverage percentage is a fact about the deck; which
          cards carry it is the answer a player is after. One open at a time,
          for the same reason the colour sources on the Mana tab are: five
          clusters open at once is the decklist, and the decklist is one tab
          away. */}
      {clusters.length > 0 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">What the deck is built around</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Mechanics enough cards in this deck share to be doing something on purpose, with
              how much of the deck each one covers.
            </p>
          </div>

          <FilterBar
            view={view}
            facets={clusters.map(cluster => (
              <FacetChip
                key={cluster.mechanic}
                selected={shownCluster?.mechanic === cluster.mechanic}
                onClick={() => setOpenCluster(cluster.mechanic)}
              >
                <span className="capitalize">{cluster.mechanic}</span>
                <span className="ml-1 tabular-nums opacity-70">{cluster.cards.length}</span>
              </FacetChip>
            ))}
          />

          {shownCluster && (
            <>
              <p className="text-sm text-muted-foreground">
                <span className="capitalize">{shownCluster.mechanic}</span> is on{' '}
                {shownCluster.cards.length}{' '}
                {shownCluster.cards.length === 1 ? 'card' : 'cards'}, which is{' '}
                {Math.round(shownCluster.coverage)}% of the deck.
              </p>
              <CardGrid width={view.size}>
                {shownCluster.cards.map(name => {
                  const entry = tileFor(name);
                  return (
                    <DeckCardTile
                      key={name}
                      card={entry.card}
                      width={view.size}
                      onClick={
                        onCardClick && entry.row
                          ? () => onCardClick(entry.row as DeckCardRow)
                          : undefined
                      }
                    />
                  );
                })}
              </CardGrid>
            </>
          )}
        </div>
      )}

      {/* The synergy half of what was the Suggestions sub-tab. The curve and
          land-base halves are on the Mana tab, beside the things they are
          about. */}
      {improvements.length > 0 && (
        <Card>
          <CardContent className="space-y-3 p-5 md:p-6">
            <div>
              <h3 className="text-lg font-semibold">What would tighten it</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Derived from the mechanics above rather than asked of a model, and ordered by
                how much difference each one would make.
              </p>
            </div>
            {improvements.map(suggestion => (
              <div key={suggestion.reason} className="rounded-lg bg-muted/40 p-3">
                <p className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{suggestion.reason}</span>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {suggestion.type} · priority {suggestion.priority} of 10
                  </span>
                </p>
                {suggestion.cards.length > 0 && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {suggestion.cards.join(' · ')}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ONE CHAT. This tab drew two boxes against the same edge function and,
          counting the section triggers, four routes to one model. The one that
          survived is the one handed the canonical score. */}
      <BrainAnalysis
        deck={mainboard}
        commander={commander}
        powerScore={power}
        deckId={deckId}
        format={format}
      />
    </div>
  );
}

export default DeckAnalysisPanel;
