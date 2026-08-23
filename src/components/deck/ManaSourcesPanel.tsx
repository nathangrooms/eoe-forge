import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ManaPip } from '@/components/ui/mana-cost';
import { MetricRow } from '@/components/listing';
import { cn } from '@/lib/utils';
import type { DeckPlayability, ManaProfile } from '@/lib/deck/playability';
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

/**
 * The deck's mana base, read out of the castability engine.
 *
 * Every figure on this panel is computed from the decklist by
 * `src/engine/playability/castability.ts` — source counts are real copies, the average
 * is by construction the mean of the column on the Cards tab, and nothing here
 * is a target, a grade or a recommended land count. There is no "you should
 * run 38 lands" line because that number cannot be derived from this deck, and
 * design law 7 rules out printing one anyway.
 *
 * The "hardest to cast" list is the actionable half: it prints the same
 * explanation the meter's tooltip carries, in full, without needing a hover —
 * "only 6 blue sources for {U}{U} on turn 2" is a to-do, "58%" is trivia.
 */

interface ManaSourcesPanelProps {
  profile: ManaProfile;
  result: DeckPlayability;
  className?: string;
}

export function ManaSourcesPanel({ profile, result, className }: ManaSourcesPanelProps) {
  const colours = colourSourceReadout(profile);
  const worst = hardestToCast(result, 8);
  const worstTotal = hardToCastCount(result);
  const maxSources = Math.max(1, ...colours.map(c => c.sources));

  /* Counted off the rows themselves rather than as `skippedCount - landCount`.
     Those two are weighted differently — `landCount` only counts lands that
     actually make mana, so a Maze of Ith is skipped as a land but never enters
     `landCount`, and the subtraction would report a phantom unsynced card. */
  const unsolved = result.cards.filter(c => c.skipped === 'no-mana-cost').length;

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
            by the turn a card costs — solved from this decklist, not estimated. Lands carry no
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
          {/*
            The four figures were a local `Stat`: `bg-muted/40`, an uppercase
            letterspaced label, and `text-2xl font-bold` where every figure the
            shared row draws is `font-semibold`. It was the Mana tab's own idea
            of a metric, which is the drift `MetricRow` exists to end, and this
            is the tab the audit named as the one that reads least finished.

            Nothing was dropped: `label` is the label, `value` the value, and
            the `hint` line is `subtext`, which is the slot it was already
            imitating. `on="card"` because this sits inside a raised `Card`.
          */}
          <MetricRow
            on="card"
            columns={4}
            metrics={[
              {
                id: 'average',
                label: 'Average',
                value: result.averagePct === null ? '—' : `${result.averagePct.toFixed(1)}%`,
                raw: result.averagePct ?? undefined,
                subtext: `across ${result.scoredCount} scored ${result.scoredCount === 1 ? 'card' : 'cards'}`,
              },
              {
                id: 'median',
                label: 'Median',
                value: result.medianPct === null ? '—' : `${result.medianPct.toFixed(1)}%`,
                raw: result.medianPct ?? undefined,
                /* Not "half the deck": the median is taken over the scored
                   spells only. On a 49-card deck with 32 lands that is 17 cards,
                   and "half the deck is above 99.7%" was simply false. */
                subtext: 'half the scored spells are above this',
              },
              {
                id: 'below',
                label: `Under ${result.threshold}%`,
                value: String(result.belowThresholdCount),
                raw: result.belowThresholdCount,
                subtext: 'more often stuck in hand than cast on curve',
              },
              {
                id: 'sources',
                label: 'Mana sources',
                value: String(profile.sources.length),
                raw: profile.sources.length,
                subtext: `${profile.landCount} lands · ${profile.rockCount} rocks · ${profile.dorkCount} dorks`,
              },
            ]}
          />

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
          </p>
        </CardHeader>
        <CardContent>
          {colours.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This deck produces no coloured mana.
            </p>
          ) : (
            <ul className="space-y-3">
              {colours.map(colour => (
                <li key={colour.colour} className="flex items-center gap-4">
                  <ManaPip symbol={colour.colour} size="lg" />
                  <span className="w-24 shrink-0 text-sm capitalize text-muted-foreground">
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
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Hardest to cast</CardTitle>
          {/* The header used to promise "every spell under 85%" while the list
              silently stopped at eight, so a deck with twenty problem cards was
              told it had eight. Say which of the two it is. */}
          <p className="text-sm text-muted-foreground">
            {worstTotal > worst.length
              ? `The ${worst.length} worst of ${worstTotal} spells under ${HARD_TO_CAST_CEILING}% on curve, and why.`
              : `Every spell that comes in under ${HARD_TO_CAST_CEILING}% on curve, worst first, and why.`}{' '}
            Fixing the reason usually fixes several rows at once.
          </p>
        </CardHeader>
        <CardContent>
          {worst.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {result.scoredCount > 0
                ? `Nothing in this deck falls below ${HARD_TO_CAST_CEILING}% on curve — this mana base serves every spell it has.`
                : 'No card in this deck has a castability figure yet.'}
            </p>
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
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {explanation.cost}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-4">
                        <PlayabilityMeter card={card} profile={profile} size="md" />
                        {band && (
                          <span className="w-20 text-sm text-muted-foreground">{band.label}</span>
                        )}
                      </div>
                    </div>
                    {/* The derivation, printed rather than hidden behind a
                        hover. This list is the one place a player comes to fix
                        their mana base, so making them mouse over eight rows to
                        find out why would be the same mistake as the bare
                        percentage the scrape used to print. */}
                    {explanation && explanation.reasons.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {explanation.reasons.map(reason => (
                          <li key={reason} className="text-sm leading-relaxed text-muted-foreground">
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
