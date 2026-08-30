import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ManaPip } from '@/components/ui/mana-cost';
import { CardGrid } from '@/components/cards';
import { cn } from '@/lib/utils';
import type { DeckCardRow } from '@/lib/deck/deckCards';
import type { DeckPlayability, ManaProfile } from '@/lib/deck/playability';
import { COLOUR_BIT, type ManaColour } from '@/lib/deck/playability';
import {
  colourSourceReadout,
  describePlayability,
  hardestToCast,
  hardToCastCount,
  HARD_TO_CAST_CEILING,
  playabilityBand,
} from '@/lib/deck/playabilityView';
import { PlayabilityMeter } from './PlayabilityMeter';
import { PlayabilityLegend } from './DeckCardFilters';
import { DeckCardTile } from './DeckCardTile';

/**
 * The deck's mana base, read out of the castability engine.
 *
 * Every figure on this panel is computed from the decklist by
 * `src/engine/playability/castability.ts` — source counts are real copies, the
 * average is by construction the mean of the column on the Cards tab, and
 * nothing here is a target, a grade or a recommended land count. There is no
 * "you should run 38 lands" line because that number cannot be derived from
 * this deck, and design law 7 rules out printing one anyway.
 *
 * ## Two things changed when the Mana tab was rebuilt
 *
 * **The four castability figures moved up to the tab.** They were a `MetricRow`
 * here, which was right, and then `LandEnhancerUX` drew four more figures below
 * them in its own 20px tile treatment, so one tab carried two metric rows in
 * two sizes. One row per tab, at the top, is the rhythm My Decks and My
 * Collection both keep. Nothing was dropped: the average, the median, the count
 * under the threshold and the source count are all in the row `DeckManaPanel`
 * draws, at the size every other figure in the product gets.
 *
 * **Both lists draw cards now.** "Hardest to cast" is the one list on this page
 * a player works through card by card, and it printed eight names. The sources
 * behind a colour count were not shown at all — the panel said "12 blue
 * sources" and anybody wanting to know which twelve had to go back to the
 * decklist and work it out. Owner: *"visual is always better"*. `rows` is
 * optional, so the public deck page, which holds the same profile and the same
 * result, gets the same panel and the same cards.
 */

interface ManaSourcesPanelProps {
  profile: ManaProfile;
  result: DeckPlayability;
  /**
   * The decklist, so a source or a hard-to-cast card can be drawn as a card.
   * Omit and both lists fall back to names, which is what this drew before.
   */
  rows?: DeckCardRow[];
  onCardClick?: (row: DeckCardRow) => void;
  /** Offered on a hard-to-cast card. Omit for a deck nobody can change. */
  onReplace?: (row: DeckCardRow) => void;
  /** Card width in px, from the tab's size slider. */
  cardWidth?: number;
  className?: string;
}

export function ManaSourcesPanel({
  profile,
  result,
  rows,
  onCardClick,
  onReplace,
  cardWidth,
  className,
}: ManaSourcesPanelProps) {
  const colours = colourSourceReadout(profile);
  const worst = hardestToCast(result, 8);
  const worstTotal = hardToCastCount(result);
  const maxSources = Math.max(1, ...colours.map(c => c.sources));

  /* Which colour's sources are open. One at a time, deliberately: five colours
     of lands open at once is the decklist again, and the decklist is one tab
     away and better at being itself. */
  const [openColour, setOpenColour] = useState<ManaColour | null>(null);

  /* Counted off the rows themselves rather than as `skippedCount - landCount`.
     Those two are weighted differently — `landCount` only counts lands that
     actually make mana, so a Maze of Ith is skipped as a land but never enters
     `landCount`, and the subtraction would report a phantom unsynced card. */
  const unsolved = result.cards.filter(c => c.skipped === 'no-mana-cost').length;

  /**
   * Deck rows by lower-cased name, so a card the engine named can be drawn.
   *
   * The engine works on `PlayabilityCardInput`, which carries a name and a cost
   * and no image, because it is pure and has never needed one. Matching back by
   * name is the join, and it is the same key `useCollectionOwnership` uses for
   * the same reason. A name that does not match draws the tile with no art
   * rather than drawing the wrong card.
   */
  const rowByName = useMemo(() => {
    const map = new Map<string, DeckCardRow>();
    for (const row of rows ?? []) {
      map.set((row.card?.name || row.card_name).trim().toLowerCase(), row);
    }
    return map;
  }, [rows]);

  const lookup = (name: string) => rowByName.get(name.trim().toLowerCase());

  /** The sources that make one colour, folded to one entry per card name. */
  const sourcesFor = (colour: ManaColour) => {
    const bit = COLOUR_BIT[colour];
    const counts = new Map<string, number>();
    for (const source of profile.sources) {
      if ((source.colourMask & bit) === 0) continue;
      counts.set(source.name, (counts.get(source.name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, copies]) => ({ name, copies, row: lookup(name) }))
      .sort((a, b) => b.copies - a.copies || a.name.localeCompare(b.name));
  };

  return (
    <div className={cn('space-y-6', className)}>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Can you cast it?</CardTitle>
          {/* This used to open "solved exactly for every card in this deck",
              which two things below it contradict: lands carry no figure at
              all, and a row whose printing has not synced has no mana cost to
              solve. Claiming completeness the panel does not have is the same
              defect as printing a number it cannot derive. */}
          <p className="text-sm text-muted-foreground">
            The joint probability that, on the play, you have drawn enough of the right sources
            by the turn a card costs. Solved from this decklist, not estimated. Lands carry no
            figure: you do not cast them.
            {unsolved > 0 && (
              <>
                {' '}
                {unsolved} further {unsolved === 1 ? 'card has' : 'cards have'} no mana cost on
                record and could not be solved.
              </>
            )}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <PlayabilityLegend />

          {result.anyApproximate && (
            <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              At least one cost was too large to solve exactly and fell back to an approximation.
              Those figures are marked with ≈.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Sources by colour</CardTitle>
          <p className="text-sm text-muted-foreground">
            Copies in the {profile.librarySize}-card library that can produce each colour. A dual
            land counts once for every colour it makes, which is what happens at the table.
            {rows ? ' Open a colour to see which cards they are.' : ''}
          </p>
        </CardHeader>
        <CardContent>
          {colours.length === 0 ? (
            <p className="text-sm text-muted-foreground">This deck produces no coloured mana.</p>
          ) : (
            <ul className="space-y-3">
              {colours.map(colour => {
                const open = openColour === colour.colour;
                const bar = (
                  <>
                    <ManaPip symbol={colour.colour} size="lg" />
                    <span className="w-24 shrink-0 text-left text-sm capitalize text-muted-foreground">
                      {colour.name}
                    </span>
                    <span className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-foreground/70"
                        style={{ width: `${(colour.sources / maxSources) * 100}%` }}
                      />
                    </span>
                    <span className="w-32 shrink-0 text-right text-sm tabular-nums">
                      <span className="text-base font-semibold">{colour.sources}</span>
                      <span className="ml-1.5 text-muted-foreground">
                        {(colour.share * 100).toFixed(0)}%
                      </span>
                    </span>
                  </>
                );

                return (
                  <li key={colour.colour}>
                    {rows ? (
                      <button
                        type="button"
                        onClick={() => setOpenColour(open ? null : colour.colour)}
                        aria-expanded={open}
                        className="flex w-full items-center gap-4 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                      >
                        {open ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        {bar}
                      </button>
                    ) : (
                      <div className="flex items-center gap-4">{bar}</div>
                    )}

                    {rows && open && (
                      <div className="mt-3">
                        <CardGrid width={cardWidth ?? 180}>
                          {sourcesFor(colour.colour).map(source => (
                            <DeckCardTile
                              key={source.name}
                              card={{
                                ...(source.row?.card ?? {}),
                                id: source.row?.card_id,
                                name: source.name,
                                image_uris: source.row?.card?.image_uris ?? null,
                                mana_cost: source.row?.card?.mana_cost ?? null,
                              }}
                              width={cardWidth ?? 180}
                              onClick={
                                onCardClick && source.row
                                  ? () => onCardClick(source.row as DeckCardRow)
                                  : undefined
                              }
                              caption={
                                source.copies > 1
                                  ? `${source.copies} copies · makes ${colour.name.toLowerCase()}`
                                  : `makes ${colour.name.toLowerCase()}`
                              }
                            />
                          ))}
                        </CardGrid>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          {/* ON CURVE, IN THE TITLE.
              Owner: "it said a 2 mana [card] was hard to cast with 40 mana
              [sources], makes no sense". The number was right and the words
              were not. Every figure in this panel is the chance of casting a
              card ON THE TURN IT COSTS, so Counterspell is measured on turn
              two, where a 99-card four-colour deck holds 13 blue sources that
              are untapped by then and it needs two of them. That is 28%, and
              it is true, and "hard to cast" is not what it means.

              The bands already said "on curve" in their blurbs and nowhere a
              player actually reads. It is in the title and on every tile now.
              This is the same correction `PowerScore` already made once, when
              a tile read "Hard to cast 94" and the Mana tab read "Under 50%"
              about the identical count. */}
          <CardTitle className="text-lg">Hardest to cast on curve</CardTitle>
          {/* The header used to promise "every spell under 85%" while the list
              silently stopped at eight, so a deck with twenty problem cards was
              told it had eight. Say which of the two it is. */}
          <p className="text-sm text-muted-foreground">
            {worstTotal > worst.length
              ? `The ${worst.length} worst of ${worstTotal} spells under ${HARD_TO_CAST_CEILING}% on curve, and why.`
              : `Every spell that comes in under ${HARD_TO_CAST_CEILING}% on curve, worst first, and why.`}{' '}
            Fixing the reason usually fixes several rows at once.
          </p>
          <p className="text-sm text-muted-foreground">
            On curve means on the turn the card costs, so a two-mana spell is
            measured on turn two. A cheap card you are happy to hold until later
            is not a problem; a card you can never cast when you want it is.
          </p>
        </CardHeader>
        <CardContent>
          {worst.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {result.scoredCount > 0
                ? `Nothing in this deck falls below ${HARD_TO_CAST_CEILING}% on curve. This mana base serves every spell it has.`
                : 'No card in this deck has a castability figure yet.'}
            </p>
          ) : rows ? (
            /* THE CARDS, LARGE.
               This was eight rows of a name and its derivation. It is the one
               list on the page a player works through card by card, and it was
               the one list on the page that did not show a card. The
               derivation is still printed rather than hidden behind a hover,
               for the reason it always was: making somebody mouse over eight
               rows to find out why is the same mistake as the bare percentage
               the scrape used to print. */
            <CardGrid width={cardWidth ?? 200}>
              {worst.map(card => {
                const explanation = describePlayability(card, profile);
                const band = card.pct === null ? null : playabilityBand(card.pct);
                const row = lookup(card.name);
                return (
                  <DeckCardTile
                    key={`${card.name}-${card.turn}`}
                    card={{
                      ...(row?.card ?? {}),
                      id: row?.card_id,
                      name: card.name,
                      image_uris: row?.card?.image_uris ?? null,
                      mana_cost: row?.card?.mana_cost ?? null,
                    }}
                    width={cardWidth ?? 200}
                    onClick={onCardClick && row ? () => onCardClick(row) : undefined}
                    caption={
                      <span className="flex items-center gap-2">
                        <PlayabilityMeter card={card} profile={profile} />
                        {band && <span>{band.label} on curve</span>}
                      </span>
                    }
                    detail={
                      explanation && explanation.reasons.length > 0 ? (
                        <ul className="space-y-0.5">
                          {explanation.reasons.map(reason => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      ) : (
                        explanation?.cost
                      )
                    }
                    /* Not on the commander. It can appear in this list —
                       Atraxa is a four-colour four-drop and comes in at 27% —
                       but swapping it is not a card swap: it changes the
                       deck's colour identity and what every other card in the
                       list is allowed to be. The header's own Change control
                       is the door for that. */
                    actions={
                      onReplace && row && !row.is_commander ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => onReplace(row)}
                        >
                          Replace
                        </Button>
                      ) : undefined
                    }
                  />
                );
              })}
            </CardGrid>
          ) : (
            <ul className="space-y-2">
              {worst.map(card => {
                const explanation = describePlayability(card, profile);
                const band = card.pct === null ? null : playabilityBand(card.pct);
                return (
                  <li key={`${card.name}-${card.turn}`} className="rounded-lg bg-muted/40 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-medium">{card.name}</p>
                        {explanation && (
                          <p className="mt-0.5 text-sm text-muted-foreground">{explanation.cost}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-4">
                        <PlayabilityMeter card={card} profile={profile} size="md" />
                        {band && (
                          <span className="w-20 text-sm text-muted-foreground">{band.label}</span>
                        )}
                      </div>
                    </div>
                    {explanation && explanation.reasons.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {explanation.reasons.map(reason => (
                          <li
                            key={reason}
                            className="text-sm leading-relaxed text-muted-foreground"
                          >
                            {reason}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ManaSourcesPanel;
