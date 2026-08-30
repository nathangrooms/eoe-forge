import { useCallback, useMemo, useState } from 'react';
import { Grid3X3 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
import { ManaPip } from '@/components/ui/mana-cost';
import { ManaCurve, type CurveBasis, type CurveBin } from '@/components/deck-builder/ManaCurve';
import { LandEnhancerUX } from '@/components/deck-builder/LandEnhancerUX';
import type { DeckCardRow } from '@/lib/deck/deckCards';
import type { DeckPlayability, ManaProfile } from '@/lib/deck/playability';
import type { DeckPower, PowerDeckEntry } from '@/lib/deck/power';
import { ManaCurveAnalyzer } from '@/lib/magic/mana-curve';
import { LandBaseCalculator } from '@/lib/magic/land-base';
import { ManaSourcesPanel } from './ManaSourcesPanel';

/**
 * The Mana tab.
 *
 * ## What was here
 *
 * Three read-only blocks stacked with nothing between them. The census counted
 * the controls: `ManaCurve` 0 buttons and 0 inputs, `ManaSourcesPanel` 0 and 0,
 * `LandEnhancerUX` 0 and 0. **Zero controls on the whole tab.** The deck page
 * audit had already flagged this as the leading candidate for "doesn't feel
 * complete" and the census confirmed it by counting.
 *
 * It also carried a figure computed twice. Two blocks headed "Sources by
 * colour" and "Sources per colour", four inches apart, from two different
 * rules — see the note in `LandEnhancerUX`, which is where the wrong one was.
 *
 * ## What is here now
 *
 * One band of controls, one metric row, and then the analysis, in the order the
 * question is asked: what does the deck cost, what can it produce, what do the
 * lands cost you.
 *
 * The two controls are the ones Moxfield and Archidekt both have and this did
 * not: **copies against distinct cards**, and **narrowing to a colour**. They
 * are the page's own, so they go in `FilterBar`'s slots rather than into the
 * component — `children` for the basis pair, `facets` for the colour chips.
 *
 * ## The curve is a control now
 *
 * Clicking the 4-drop bar lands on the Cards tab filtered to mana value 4. Both
 * halves of that already existed: `DeckCardFilterState.manaValues` takes
 * exactly the bin ids the curve plots, and the facet chips on the Cards tab
 * already carry their counts. Nothing joined them, so the tab that names a
 * problem and the tab that lets you fix it were two clicks and a re-derivation
 * apart. `onSelectManaValue` is optional: the public deck page has no editable
 * decklist to send anybody to, so it passes nothing and the bars stay bars.
 */

const MANA_MODES: ListingMode[] = [
  { id: 'grid', label: 'Cards', icon: Grid3X3, layout: 'grid' },
];

/**
 * Card width on a first visit.
 *
 * 180, not the decklist's 230. The cards on this tab are evidence beside a
 * figure — the twelve lands behind "12 blue sources", the eight spells the mana
 * base struggles with — rather than the decklist itself, and at 230 eight of
 * them fill the fold on their own. The slider is right there and the choice is
 * remembered under this tab's own key.
 */
const DEFAULT_CARD_SIZE = 180;

const COLOUR_NAME: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

/** The shape the curve reads. `toAnalyticsCards` produces it. */
interface CurveCard {
  cmc?: number;
  quantity?: number;
  type_line?: string | null;
  colors?: string[] | null;
}

export interface DeckManaPanelProps {
  /** The ninety-nine, as the analysis panels see them. Drives the curve. */
  curveCards: CurveCard[];
  /** The deck's format, which is what the curve and land ideals are read against. */
  format: string;
  /** The decklist rows, so every figure on this tab can show its cards. */
  rows: DeckCardRow[];
  profile: ManaProfile;
  playability: DeckPlayability;
  /** For the land readout. Both come off the page's one power computation. */
  powerEntries: PowerDeckEntry[];
  power: DeckPower | null;
  identity?: string[];
  onCardClick?: (row: DeckCardRow) => void;
  /** Offered on a hard-to-cast card. Omit for a deck nobody can change. */
  onReplace?: (row: DeckCardRow) => void;
  /**
   * Send the reader to the decklist, narrowed to one mana value. Omit on a page
   * with no decklist to narrow and the curve draws as a plain chart.
   */
  onSelectManaValue?: (bin: CurveBin) => void;
}

export function DeckManaPanel({
  curveCards,
  format,
  rows,
  profile,
  playability,
  powerEntries,
  power,
  identity,
  onCardClick,
  onReplace,
  onSelectManaValue,
}: DeckManaPanelProps) {
  const [basis, setBasis] = useState<CurveBasis>('copies');
  const [colours, setColours] = useState<string[]>([]);

  const view = useListingView({
    surface: 'deckmatrix.deck.mana.view',
    modes: MANA_MODES,
    defaultSize: DEFAULT_CARD_SIZE,
  });

  /* Only the colours this deck actually plays get a chip. A mono-red deck
     offered a White chip is a control that can only ever empty the chart, which
     is the same rule the decklist's facets follow. */
  const deckColours = useMemo(() => {
    const set = new Set<string>();
    for (const card of curveCards) for (const c of card.colors ?? []) set.add(c);
    return (['W', 'U', 'B', 'R', 'G'] as const).filter(c => set.has(c));
  }, [curveCards]);

  const toggleColour = (colour: string) =>
    setColours(prev =>
      prev.includes(colour) ? prev.filter(c => c !== colour) : [...prev, colour]
    );

  const clearEverything = useCallback(() => {
    setBasis('copies');
    setColours([]);
  }, []);

  const sourceShare =
    profile.librarySize > 0 ? (profile.sources.length / profile.librarySize) * 100 : 0;

  /**
   * The deterministic fixes, from the two libraries that already compute them.
   *
   * Both were reachable only through `EnhancedDeckAnalysisPanel`'s Suggestions
   * sub-tab on the Analysis tab, which is a strange place for "add two more
   * two-drops" to live. Neither call is expensive and neither is a model: the
   * curve is compared against `ManaCurveAnalyzer`'s ideal for the format and
   * the mana base against what this deck's own costs demand.
   *
   * `format` is not asked for by either of them in a way that changes what is
   * SAID here — both fall back to the standard ideal for an unknown one — but
   * it is passed because it changes the numbers, and passing the wrong one
   * silently would be worse than not passing it at all.
   */
  const fixes = useMemo(() => {
    const cards = curveCards as unknown as Parameters<typeof ManaCurveAnalyzer.analyze>[0];
    try {
      const curve = ManaCurveAnalyzer.analyze(cards, format);
      /* The page's ONE mana profile decides how many sources this deck has.
         Without it `LandBaseCalculator` counts from the rows handed in and
         found zero, so the advice read "Add 15 more W sources" directly below
         a Sources by colour panel, fed by this same `profile`, that read
         "White 16". Same screen, same question, two answers. */
      const lands = LandBaseCalculator.calculate(cards, format, 'optimal', profile.sourcesByColour);
      const swaps = ManaCurveAnalyzer.generateOptimizationSuggestions(curve);
      return {
        curve: [
          ...curve.optimality.suggestions,
          /* No em-dash: the copy rules forbid one and this string is read by a
             player, not by another developer. */
          ...swaps.swapSuggestions.map(
            s =>
              `${s.reason}. Take out ${s.remove.count} at ${s.remove.cmc} mana and put in ${s.add.count} at ${s.add.cmc}.`
          ),
        ].slice(0, 4),
        /* THE LAND-COUNT LINES ARE DROPPED, THE COLOUR-SOURCE LINES ARE KEPT.
           `LandBaseCalculator` builds its "Add N more lands" line from the
           sum of the quantities in its own SUGGESTION list, not from a land
           target — `src/lib/magic/land-base.ts:490`. On the fixture deck that
           sum is 82, so the line read "Add 78 more lands" for a deck that is
           already 100 cards, while the Add tab, reading the engine's real
           target through `roleTargetsFor`, said "Lands 4/36 · 32 short of the
           target" one tab away. Two tabs, one question, two answers, and the
           one that cannot be acted on is this one. The colour-source lines
           beside it are counted off this deck's own pips and stand.

           The fix belongs in `land-base.ts`, which is not this directory's to
           edit; until it lands the tab draws no figure it cannot defend. */
        lands: lands.improvements.filter(line => !/^(Add|Remove) \d+ (more )?lands?$/.test(line)).slice(0, 4),
      };
    } catch (error) {
      // A library that cannot read this deck says nothing rather than throwing
      // the tab away. The figures above it are computed elsewhere and stand.
      console.warn('Could not derive mana fixes for this deck:', error);
      return { curve: [] as string[], lands: [] as string[] };
    }
  }, [curveCards, format, profile.sourcesByColour]);

  return (
    <div className="space-y-6">
      {/* The castability roll-up, at the top, at the size every other figure in
          the product is drawn at. These were a `MetricRow` inside
          `ManaSourcesPanel`, one section down and one ground in, which meant
          the tab opened on a heading rather than on its numbers.

          THERE IS NO `Average playability` TILE HERE, and that is deliberate.
          The page header draws that exact figure at 30px under that exact
          label about three hundred pixels above this row — measured at 1280
          and at 1920, `5.0%` twice on one screen — and the header block is on
          every tab, so this tab is the one that has to give way. The header
          keeps the average and its denominator; this row keeps the three
          figures the header does not print at figure size. */}
      <MetricRow
        columns={3}
        metrics={[
          {
            id: 'median',
            label: 'Median playability',
            value: playability.medianPct === null ? '—' : `${playability.medianPct.toFixed(1)}%`,
            raw: playability.medianPct ?? undefined,
            meter: playability.medianPct ?? undefined,
            /* Not "half the deck": the median is over the scored spells only.
               On a 49-card deck with 32 lands that is 17 cards, and "half the
               deck is above 99.7%" was simply false. */
            subtext: 'half the scored spells are above this',
          },
          {
            id: 'below',
            label: `Under ${playability.threshold}%`,
            value: String(playability.belowThresholdCount),
            raw: playability.belowThresholdCount,
            /* EVERY TILE IN THIS ROW CARRIES A METER OR NONE OF THEM DOES.
               `MetricRow` reserves the bar's line for the whole row as soon as
               one tile asks for it, and an empty track on a raised tile reads
               as a bar at a hundred per cent. So this is a real fraction of a
               real denominator: how much of what could be scored comes in under
               the threshold. */
            meter:
              playability.scoredCount > 0
                ? (playability.belowThresholdCount / playability.scoredCount) * 100
                : 0,
            subtext: 'more often stuck in hand than cast on curve',
          },
          {
            id: 'sources',
            label: 'Mana sources',
            value: String(profile.sources.length),
            raw: profile.sources.length,
            /* Share of the library that makes mana, which is what the figure is
               a count of. It was the LAND share, which is a different fraction
               of a different thing sitting under a source count. */
            meter: sourceShare,
            /* "that make mana", said out loud. `ManaProfile.landCount` counts
               lands that actually produce, so a Maze of Ith is a land on the
               panel below and is not one here. Two questions, and the labels
               have to say which is which or the tab prints two land counts. */
            subtext: `${profile.landCount} lands · ${profile.rockCount} rocks · ${profile.dorkCount} dorks that make mana`,
          },
        ]}
      />

      {/* The tab's own controls, in the band every other listing puts its
          controls in. No search box: there is nothing on this tab to search,
          and `FilterBar` draws nothing for a slot nobody filled. */}
      <FilterBar
        view={view}
        activeCount={colours.length + (basis === 'copies' ? 0 : 1)}
        onClear={clearEverything}
        facets={
          deckColours.length > 1
            ? deckColours.map(colour => (
                <FacetChip
                  key={colour}
                  selected={colours.includes(colour)}
                  onClick={() => toggleColour(colour)}
                  title={`Only ${COLOUR_NAME[colour].toLowerCase()} cards in the curve`}
                >
                  <ManaPip symbol={colour} size="sm" />
                  {COLOUR_NAME[colour]}
                </FacetChip>
              ))
            : undefined
        }
      >
        {/* Copies against distinct cards. Two chips rather than a select: it is
            a two-way choice and a select for two options is a menu you have to
            open to find out what is in it. */}
        <span className="text-xs text-muted-foreground">Curve counts</span>
        <FacetChip selected={basis === 'copies'} onClick={() => setBasis('copies')}>
          Copies
        </FacetChip>
        <FacetChip selected={basis === 'cards'} onClick={() => setBasis('cards')}>
          Distinct cards
        </FacetChip>
      </FilterBar>

      <Card>
        <CardContent className="space-y-3 p-5 md:p-6">
          <ManaCurve
            cards={curveCards}
            height={220}
            basis={basis}
            colours={colours}
            onSelectBin={onSelectManaValue}
          />
          {onSelectManaValue && (
            <p className="text-sm text-muted-foreground">
              Press a bar to see those cards in the decklist.
            </p>
          )}
        </CardContent>
      </Card>

      <ManaSourcesPanel
        profile={profile}
        result={playability}
        rows={rows}
        onCardClick={onCardClick}
        onReplace={onReplace}
        cardWidth={view.size}
      />

      <LandEnhancerUX
        entries={powerEntries}
        power={power}
        identity={identity}
        rows={rows}
        /* The engine's count, so the shortfall line under each colour is
           measured against the same number the section above prints. That panel
           used to count its own, from a regex over oracle text that saw lands
           and missed rocks, and the two disagreed on the same tab. */
        sourcesByColour={profile.sourcesByColour}
        onCardClick={onCardClick}
        cardWidth={view.size}
      />

      {/* WHAT WOULD FIX IT.
          These two lists were on the Analysis tab, inside a nested tab strip,
          under a heading called Suggestions — where "add two more two-drops"
          and "you are three blue sources short" sat next to archetype
          detection. They are answers to mana questions, so they are on the
          mana tab. Both are deterministic: `ManaCurveAnalyzer` compares this
          curve against the format's ideal and `LandBaseCalculator` compares the
          land count and colour sources against what the costs demand. Neither
          asks a model anything. */}
      {(fixes.curve.length > 0 || fixes.lands.length > 0) && (
        <Card>
          <CardContent className="space-y-4 p-5 md:p-6">
            <div>
              <h3 className="text-lg font-semibold">What would fix this</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Counted off this decklist against what a deck of this size in this format
                usually runs. Nothing here is guessed.
              </p>
            </div>

            {fixes.curve.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  The curve
                </h4>
                {fixes.curve.map(line => (
                  <p key={line} className="rounded-lg bg-muted/40 p-3 text-sm">
                    {line}
                  </p>
                ))}
              </div>
            )}

            {fixes.lands.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  The mana base
                </h4>
                {fixes.lands.map(line => (
                  <p key={line} className="rounded-lg bg-muted/40 p-3 text-sm">
                    {line}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default DeckManaPanel;
