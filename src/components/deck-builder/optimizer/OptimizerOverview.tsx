/**
 * The overview tab.
 *
 * Two things were removed here rather than restyled, both because they were
 * invented:
 *
 * 1. **The big /100 score ring.** It averaged the model's five category guesses
 *    into a sixth number that exists nowhere else in the product, drawn as the
 *    largest element on the page — directly against the rule that the EDH power
 *    score is *the* number for a deck. The categories themselves are still
 *    shown, but as what they are: the optimiser's read, not a measurement.
 * 2. **The category fallbacks.** `analysis.categories || {synergy: 70, …}` meant
 *    a response with no categories rendered five confident bars of pure
 *    fiction. If the field is absent the section is absent.
 *
 * What replaces them is measured: the castability roll-up from
 * `playability.ts`, computed from the actual decklist, with the cards it names
 * shown as cards.
 */

import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, CheckCircle, Lightbulb, Droplets } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { CardImage } from '@/components/cards';
import { playabilityBand } from '@/lib/deck/playabilityView';
import type { DeckPlayability } from '@/lib/deck/playability';

interface AnalysisIssue {
  card: string;
  reason: string;
  severity: 'high' | 'medium' | 'low';
  category?: string;
}

interface AnalysisResult {
  summary: string;
  issues: AnalysisIssue[];
  strengths: Array<{ text: string }>;
  strategy: Array<{ text: string }>;
  manabase: Array<{ text: string }>;
  categories?: {
    synergy: number;
    consistency: number;
    power: number;
    interaction: number;
    manabase: number;
  } | null;
  /**
   * Where those five numbers came from. The edge function computes a fallback
   * set from role counts and the land count when the model sends none, so
   * "categories are present" no longer implies "the model scored this deck".
   * The two have to be labelled differently or the derived set reads as an
   * opinion the optimiser formed, which it did not.
   */
  categoriesSource?: 'model' | 'measured' | null;
}

/** A card the panel can draw art for, paired with its measured castability. */
export interface HardToCastCard {
  name: string;
  card: any;
  pct: number;
  turn: number | null;
}

interface OptimizerOverviewProps {
  analysis: AnalysisResult;
  replacementCount: number;
  additionCount: number;
  removalCount: number;
  /** Measured from the decklist. `null` if it could not be computed. */
  playability: DeckPlayability | null;
  hardToCast: HardToCastCard[];
}

const CATEGORY_LABEL: Record<string, string> = {
  synergy: 'Synergy',
  consistency: 'Consistency',
  power: 'Power',
  interaction: 'Interaction',
  manabase: 'Mana base',
};

export function OptimizerOverview({
  analysis,
  replacementCount,
  additionCount,
  removalCount,
  playability,
  hardToCast,
}: OptimizerOverviewProps) {
  const criticalIssues = analysis.issues.filter(i => i.severity === 'high').length;
  const categories = analysis.categories ?? null;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="shadow-lg">
          <CardContent className="p-6 sm:p-8">
            <h3 className="text-2xl font-bold">What the optimiser found</h3>
            {analysis.summary && (
              <p className="mt-3 max-w-4xl text-lg leading-relaxed text-muted-foreground">
                {analysis.summary}
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2.5">
              {replacementCount > 0 && <Stat>{replacementCount} swaps suggested</Stat>}
              {additionCount > 0 && <Stat>{additionCount} cards to add</Stat>}
              {removalCount > 0 && <Stat>{removalCount} cards to cut</Stat>}
              {criticalIssues > 0 && (
                <Stat tone="danger">
                  {criticalIssues} critical issue{criticalIssues === 1 ? '' : 's'}
                </Stat>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Measured castability. Every figure here is computed from the decklist
          by playability.ts — nothing on this card came from the model. */}
      {playability && playability.averagePct !== null && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <Card className="shadow-lg">
            <CardContent className="p-6 sm:p-8">
              <div className="flex items-center gap-2.5">
                <Droplets className="h-5 w-5 text-muted-foreground" />
                <h4 className="text-xl font-bold">Castability</h4>
                <span className="text-sm text-muted-foreground">
                  measured from your decklist
                </span>
              </div>

              <div className="mt-5 grid gap-6 sm:grid-cols-3">
                <Measure
                  label="Average castability"
                  value={`${playability.averagePct.toFixed(1)}%`}
                  hint={`across ${playability.scoredCount} spells`}
                />
                {playability.medianPct !== null && (
                  <Measure
                    label="Median"
                    value={`${playability.medianPct.toFixed(1)}%`}
                    /* Not "half the deck". The roll-up scores spells and skips
                       lands, so this is the median over `scoredCount` — on a
                       Commander list, roughly two thirds of the ninety-nine.
                       The average beside it already says "across N spells";
                       these two describe the same population. */
                    hint="half the scored spells are above this"
                  />
                )}
                <Measure
                  label={`Below ${playability.threshold}%`}
                  value={String(playability.belowThresholdCount)}
                  hint="cards you often cannot cast on curve"
                  tone={playability.belowThresholdCount > 0 ? 'danger' : 'default'}
                />
              </div>

              {hardToCast.length > 0 && (
                <div className="mt-8">
                  <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Hardest to cast
                  </p>
                  <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(210px,100%),1fr))]">
                    {hardToCast.map(card => (
                      <div key={card.name}>
                        <CardImage card={card.card} size="lg" fill />
                        <p className="mt-2 truncate text-sm font-medium" title={card.name}>
                          {card.name}
                        </p>
                        <p className={cn('text-sm tabular-nums', playabilityBand(card.pct).textClass)}>
                          {card.pct.toFixed(0)}%
                          {card.turn !== null && (
                            <span className="text-muted-foreground"> on turn {card.turn}</span>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Category scores, labelled by where they came from. Either way they are
          not the EDH power score, and the heading says so — the `power` entry
          in particular is an opinion (model) or the mean of the other four
          (measured), never a power measurement. */}
      {categories && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="shadow-lg">
            <CardContent className="p-6 sm:p-8">
              <h4 className="text-xl font-bold">The optimiser&rsquo;s read</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                {analysis.categoriesSource === 'measured'
                  ? 'Derived from this deck’s role counts and land count, not scored by the model. Not the deck’s EDH power score.'
                  : 'Qualitative scores from the analysis, not the deck’s EDH power score.'}
              </p>
              <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
                {Object.entries(categories).map(([key, value]) => (
                  <div key={key}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-base font-medium">
                        {CATEGORY_LABEL[key] ?? key}
                      </span>
                      <span className="text-lg font-bold tabular-nums">{value}</span>
                    </div>
                    {/* A plain tone bar — no border, no gradient. */}
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-foreground/70"
                        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Issues */}
      {analysis.issues.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card className="shadow-lg">
            <CardContent className="p-6 sm:p-8">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                <h4 className="text-xl font-bold">Issues · {analysis.issues.length}</h4>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {analysis.issues.map((issue, i) => (
                  <div
                    key={`${issue.card}-${i}`}
                    className={cn(
                      'rounded-xl p-4',
                      issue.severity === 'high' ? 'bg-destructive/10' : 'bg-muted/60'
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span
                        className={cn(
                          'text-base font-semibold',
                          issue.severity === 'high' && 'text-destructive'
                        )}
                      >
                        {issue.card}
                      </span>
                      {issue.category && (
                        <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
                          {issue.category}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {issue.reason}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Strengths and strategy */}
      <div className="grid gap-6 lg:grid-cols-2">
        {analysis.strengths.length > 0 && (
          <NoteList
            icon={<CheckCircle className="h-5 w-5 text-muted-foreground" />}
            title="Strengths"
            items={analysis.strengths}
            delay={0.2}
          />
        )}
        {analysis.strategy.length > 0 && (
          <NoteList
            icon={<Lightbulb className="h-5 w-5 text-muted-foreground" />}
            title="How to pilot it"
            items={analysis.strategy}
            delay={0.25}
          />
        )}
      </div>

      {analysis.manabase.length > 0 && (
        <NoteList
          icon={<Droplets className="h-5 w-5 text-muted-foreground" />}
          title="Mana base notes"
          items={analysis.manabase}
          delay={0.3}
        />
      )}
    </div>
  );
}

function Stat({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: 'default' | 'danger';
}) {
  return (
    <span
      className={cn(
        'rounded-lg px-3.5 py-2 text-sm font-medium',
        tone === 'danger' ? 'bg-destructive/15 text-destructive' : 'bg-muted'
      )}
    >
      {children}
    </span>
  );
}

function Measure({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-3xl font-bold tabular-nums',
          tone === 'danger' && 'text-destructive'
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function NoteList({
  icon,
  title,
  items,
  delay,
}: {
  icon: React.ReactNode;
  title: string;
  items: Array<{ text: string }>;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <Card className="h-full shadow-lg">
        <CardContent className="p-6 sm:p-8">
          <div className="flex items-center gap-2.5">
            {icon}
            <h4 className="text-xl font-bold">{title}</h4>
          </div>
          <ul className="mt-5 space-y-3">
            {items.map((item, i) => (
              <li key={i} className="text-base leading-relaxed text-muted-foreground">
                {item.text}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </motion.div>
  );
}
