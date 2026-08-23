import { useCallback, useMemo, useState } from 'react';
import { Grid3X3 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  FacetChip,
  FilterBar,
  MetricRow,
  useListingView,
  type ListingMode,
} from '@/components/listing';
import { ManaPip } from '@/components/ui/mana-cost';
import { ManaCurve, type CurveBasis, type CurveBin } from '@/components/deck-builder/ManaCurve';
import { LandEnhancerUX } from '@/components/deck-builder/LandEnhancerUX';
import type { DeckCardRow } from '@/lib/deck/deckCards';
import type { DeckPlayability, ManaProfile } from '@/lib/deck/playability';
import type { DeckPower, PowerDeckEntry } from '@/lib/deck/power';
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

  const landPct =
    profile.librarySize > 0 ? (profile.landCount / profile.librarySize) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* The castability roll-up, at the top, at the size every other figure in
          the product is drawn at. These four were a `MetricRow` inside
          `ManaSourcesPanel`, one section down and one ground in, which meant
          the tab opened on a heading rather than on its numbers. */}
      <MetricRow
        columns={4}
        metrics={[
          {
            id: 'average',
            label: 'Average playability',
            value: playability.averagePct === null ? '—' : `${playability.averagePct.toFixed(1)}%`,
            raw: playability.averagePct ?? undefined,
            meter: playability.averagePct ?? undefined,
            subtext: `across ${playability.scoredCount} scored ${
              playability.scoredCount === 1 ? 'card' : 'cards'
            }`,
          },
          {
            id: 'median',
            label: 'Median',
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
            subtext: 'more often stuck in hand than cast on curve',
          },
          {
            id: 'sources',
            label: 'Mana sources',
            value: String(profile.sources.length),
            raw: profile.sources.length,
            meter: landPct,
            subtext: `${profile.landCount} lands · ${profile.rockCount} rocks · ${profile.dorkCount} dorks`,
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
        onCardClick={onCardClick}
        cardWidth={view.size}
      />
    </div>
  );
}

export default DeckManaPanel;
