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
import { cn } from '@/lib/utils';
import { PowerScore } from '@/components/deck/PowerScore';
import { CommanderPowerDisplay } from '@/components/deck-builder/CommanderPowerDisplay';
import { PowerSliderCoaching } from '@/components/deck-builder/PowerSliderCoaching';
import {
  DECK_BRACKETS,
  bandShortLabel,
  formatPowerScore,
  powerTextClass,
  type DeckPower,
  type PowerDeckEntry,
} from '@/lib/deck/power';
import type { DeckCardRow } from '@/lib/deck/deckCards';
import { DeckCardTile, TileBadge } from './DeckCardTile';
import { useDeckPowerRank } from './useDeckPowerRank';

/**
 * The EDH tab.
 *
 * ## Where this tab already wins, and where it did not
 *
 * The census is blunt about it: *"Neither Moxfield nor Archidekt has anything
 * like this. Moxfield shows a bracket you set by hand. Archidekt has a 'Deck
 * Score' with no methodology attached. This tab is the product's strongest
 * claim to being better than either, and the gaps are presentational."* The
 * gaps it then named are the ones this fixes.
 *
 * **The bracket counts had no names.** `EdhAnalysisPanel` printed
 * `earlyTwoCardCombos: 2` and `gameChangers: 3` as integers. The engine has
 * carried the names the whole time — `PowerResult.gameChangers.list`,
 * `.combos`, `.tutors.list`, every one of them a card out of
 * `src/engine/power/catalogs.ts`, a file that literally lists "Basalt Monolith
 * + Rings of Brighthearth" — and `powerAdapter` reduced all three to counts on
 * the way through. It does not any more, so the tab can draw the cards.
 *
 * **The brackets assumed you knew what they meant.** Moxfield puts the official
 * definitions on screen. `DECK_BRACKETS` has held them, blurb and all, since
 * the power model was written, and the tab printed the number.
 *
 * **A score had no scale.** `user_decks.power_level` is a column on every deck
 * you own and nothing compared them. "6.2, your third strongest of nine" is the
 * same measurement with the only frame of reference a player actually has. One
 * query — see `useDeckPowerRank`.
 *
 * ## And one thing that was drawn twice
 *
 * `PowerScore variant="expanded"` sat above `CommanderPowerDisplay`, and
 * `CommanderPowerDisplay` opened with `PowerScore variant="compact"`. The
 * deck's power was on this tab twice, at two sizes, from one object. The inner
 * one is gone; see the note in that file.
 */

const CARD_MODES: ListingMode[] = [
  { id: 'grid', label: 'Cards', icon: Grid3X3, layout: 'grid' },
];

/** Evidence beside a figure rather than the decklist. Same size as Mana. */
const DEFAULT_CARD_SIZE = 180;

type EvidenceKind = 'changers' | 'combos' | 'tutors';

const EVIDENCE_LABEL: Record<EvidenceKind, string> = {
  changers: 'Game changers',
  combos: 'Two-card combos',
  tutors: 'Tutors',
};

const EVIDENCE_BLURB: Record<EvidenceKind, string> = {
  changers:
    'Cards from the curated catalogue that can end a game on their own, and why each one counts in this deck. The bracket rules cap how many a deck may carry.',
  combos:
    'Pairs this deck holds both halves of, with the mana it takes to assemble them. Whether a combo lands before turn eight is what separates bracket 3 from bracket 4.',
  tutors:
    'What this deck can search with. A deck that cannot find its own pieces plays out differently every game, which is why the engine marks one down for having too few.',
};

export interface DeckEdhPanelProps {
  power: DeckPower | null;
  powerEntries: PowerDeckEntry[];
  /** The decklist, so a card the engine named can be drawn as a card. */
  rows: DeckCardRow[];
  commanderName?: string;
  format: string;
  /** Owner of the deck, for the cross-deck comparison. Omit and it is skipped. */
  userId?: string;
  deckId?: string;
  onCardClick?: (row: DeckCardRow) => void;
  /** The edhpowerlevel.com second opinion, mounted below everything else. */
  secondOpinion?: React.ReactNode;
}

export function DeckEdhPanel({
  power,
  powerEntries,
  rows,
  commanderName,
  format,
  userId,
  deckId,
  onCardClick,
  secondOpinion,
}: DeckEdhPanelProps) {
  const [evidence, setEvidence] = useState<EvidenceKind>('changers');

  const view = useListingView({
    surface: 'deckmatrix.deck.edh.view',
    modes: CARD_MODES,
    defaultSize: DEFAULT_CARD_SIZE,
  });

  const { rank } = useDeckPowerRank(deckId, userId);

  const rowByName = useMemo(() => {
    const map = new Map<string, DeckCardRow>();
    for (const row of rows) map.set((row.card?.name || row.card_name).trim().toLowerCase(), row);
    return map;
  }, [rows]);

  const diagnostics = power?.diagnostics;
  const changers = diagnostics?.gameChangerList ?? [];
  const tutors = diagnostics?.tutorList ?? [];
  const combos = diagnostics?.comboList ?? [];

  /**
   * A combo is two cards, so it is drawn as two cards.
   *
   * `TWO_CARD_COMBOS` names the pair as `"Thassa's Oracle + Demonic
   * Consultation"`, which is a string built for a log line rather than for a
   * grid. Splitting on the separator the catalogue itself uses gets the halves
   * back; a name that does not split is kept whole rather than guessed at.
   */
  const comboCards = useMemo(
    () =>
      combos.flatMap(combo =>
        combo.name
          .split(' + ')
          .map(half => half.trim())
          .filter(Boolean)
          .map(half => ({
            key: `${combo.name}::${half}`,
            name: half,
            combo: combo.name,
            totalMv: combo.totalMv,
          }))
      ),
    [combos]
  );

  const bracket = power ? DECK_BRACKETS[power.bracket] : null;

  /* Which evidence lists have anything in them. A chip for an empty list is a
     control that can only ever show an empty grid. */
  const available = useMemo(() => {
    const out: EvidenceKind[] = [];
    if (changers.length > 0) out.push('changers');
    if (combos.length > 0) out.push('combos');
    if (tutors.length > 0) out.push('tutors');
    return out;
  }, [changers.length, combos.length, tutors.length]);

  const shown = available.includes(evidence) ? evidence : available[0];

  const tileFor = (name: string) => {
    const row = rowByName.get(name.trim().toLowerCase());
    return {
      ...(row?.card ?? {}),
      id: row?.card_id,
      name,
      image_uris: row?.card?.image_uris ?? null,
      mana_cost: row?.card?.mana_cost ?? null,
      row,
    };
  };

  return (
    <div className="space-y-6">
      {/* THE SIX FIGURES THAT DECIDE A COMMANDER GAME.
          Score and bracket were only ever inside `PowerScore`'s own headline;
          tutors and game changers were two 18px tiles inside
          `CommanderPowerDisplay`; combos were a count inside a nested tab of
          the scrape panel; the rank did not exist. One row, at the top, at the
          size every figure in the product is drawn at. */}
      <MetricRow
        columns={6}
        metrics={[
          {
            id: 'score',
            label: 'Power score',
            value: power ? formatPowerScore(power.score) : '—',
            raw: power?.score,
            suffix: '/10',
            subtext: power ? bandShortLabel(power.band) : 'not scored yet',
            /* NO METER, and the rest of this row has none either. `MetricRow`
               reserves the bar's line for every tile as soon as one asks for
               it, and an empty track reads as a full bar: a bracket, a game
               changer count and a rank have no denominator to be a fraction of,
               so five of these six would have been drawing a bar that means
               nothing. The `/10` suffix says the scale. */
          },
          {
            id: 'bracket',
            label: 'Commander bracket',
            value: bracket ? String(bracket.id) : '—',
            raw: bracket?.id,
            subtext: bracket?.name.toLowerCase(),
          },
          {
            id: 'changers',
            label: 'Game changers',
            value: power ? String(diagnostics?.gameChangerCount ?? 0) : '—',
            raw: diagnostics?.gameChangerCount,
            subtext: diagnostics?.noGameChangers
              ? 'too few, so the score is marked down'
              : changers.length > 0
                ? 'named below'
                : 'cards that end a game alone',
          },
          {
            id: 'tutors',
            label: 'Tutors',
            value: power ? String(diagnostics?.tutorCount ?? 0) : '—',
            raw: diagnostics?.tutorCount,
            subtext: diagnostics?.noTutors
              ? 'too few, so the score is marked down'
              : 'ways to find a card',
          },
          {
            id: 'combos',
            label: 'Two-card combos',
            value: power ? String(combos.length) : '—',
            raw: combos.length,
            subtext:
              combos.length > 0
                ? `cheapest assembles for ${Math.min(...combos.map(c => c.totalMv))}`
                : 'both halves in the deck',
          },
          {
            id: 'rank',
            label: 'Among your decks',
            value: rank ? `#${rank.rank}` : '—',
            raw: rank?.rank,
            subtext: rank
              ? rank.tied > 1
                ? `tied with ${rank.tied - 1} of your ${rank.scored}`
                : `of your ${rank.scored} scored decks`
              : 'needs more than one scored deck',
          },
        ]}
      />

      {/* THE BRACKET LADDER, WITH WHAT EACH ONE MEANS.
          Moxfield puts these definitions on screen and this tab assumed you
          knew what bracket 3 meant. `DECK_BRACKETS` has carried the wording
          since the power model was written. */}
      {bracket && (
        <Card>
          <CardContent className="space-y-4 p-5 md:p-6">
            <div>
              <h3 className="text-lg font-semibold">What bracket {bracket.id} means</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                The five Commander brackets, as Wizards defines them. This deck is measured into
                one of them from its own decklist rather than assigned one by hand.
              </p>
            </div>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {Object.values(DECK_BRACKETS).map(entry => {
                const here = entry.id === bracket.id;
                return (
                  <li
                    key={entry.id}
                    className={cn(
                      'rounded-lg p-3',
                      here ? 'bg-primary text-primary-foreground' : 'bg-muted/40'
                    )}
                  >
                    <p className="flex items-baseline gap-2">
                      <span className="text-2xl font-semibold tabular-nums leading-none">
                        {entry.id}
                      </span>
                      <span className="text-sm font-medium">{entry.name}</span>
                    </p>
                    <p
                      className={cn(
                        'mt-1.5 text-xs leading-snug',
                        here ? 'text-primary-foreground/80' : 'text-muted-foreground'
                      )}
                    >
                      {entry.blurb}
                    </p>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* WHICH CARDS. The whole point of this section is that a count is not
          an answer. */}
      {shown && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">The cards behind the numbers</h3>
            <p className="mt-1 text-sm text-muted-foreground">{EVIDENCE_BLURB[shown]}</p>
          </div>

          <FilterBar
            view={view}
            facets={available.map(kind => (
              <FacetChip key={kind} selected={shown === kind} onClick={() => setEvidence(kind)}>
                {EVIDENCE_LABEL[kind]}
                <span className="ml-1 tabular-nums opacity-70">
                  {kind === 'changers'
                    ? changers.length
                    : kind === 'combos'
                      ? combos.length
                      : tutors.length}
                </span>
              </FacetChip>
            ))}
          />

          <CardGrid width={view.size}>
            {shown === 'combos'
              ? comboCards.map(entry => {
                  const card = tileFor(entry.name);
                  return (
                    <DeckCardTile
                      key={entry.key}
                      card={card}
                      width={view.size}
                      onClick={onCardClick && card.row ? () => onCardClick(card.row!) : undefined}
                      badge={<TileBadge align="right">{entry.totalMv}</TileBadge>}
                      caption={entry.combo}
                    />
                  );
                })
              : (shown === 'changers' ? changers : tutors).map(entry => {
                  const card = tileFor(entry.name);
                  return (
                    <DeckCardTile
                      key={entry.name}
                      card={card}
                      width={view.size}
                      onClick={onCardClick && card.row ? () => onCardClick(card.row!) : undefined}
                      caption={entry.why}
                    />
                  );
                })}
          </CardGrid>
        </div>
      )}

      {/* THE SCORE, WITH ITS WORKING. `PowerScore` is the only way a power
          number is ever drawn and it carries the ten subscores and the cards
          each one counted. */}
      <PowerScore power={power} variant="expanded" />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <CommanderPowerDisplay power={power} commanderName={commanderName} />
        <PowerSliderCoaching power={power} entries={powerEntries} format={format} />
      </div>

      {secondOpinion}
    </div>
  );
}

export default DeckEdhPanel;
