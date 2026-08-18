import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Edit, Loader2 } from 'lucide-react';
import { DeckSummary } from '@/lib/api/deckAPI';
import { fetchDeckCards, toEngineCards, type DeckCardRow } from '@/lib/deck/deckCards';
import {
  EDHPowerCalculator,
  type EDHPowerScore,
} from '@/lib/deckbuilder/score/edh-power-calculator';
import { CATEGORY_BG_CLASS, CATEGORY_LABEL, type DeckCategory } from '@/lib/deck/cardCategories';
import { averageManaValue, normalizeCurve } from '@/lib/deck/curve';
import { formatLabel, usesPowerLevel } from '@/lib/deck/formats';
import { ManaPip } from '@/components/ui/mana-cost';

interface DeckAnalysisViewProps {
  deckSummary: DeckSummary;
  onOpenBuilder?: () => void;
  /** Hide the deck name / format strip when the host page already prints it. */
  showHeader?: boolean;
}

const SUBSCORE_LABELS: Record<keyof EDHPowerScore['subscores'], string> = {
  speed: 'Speed',
  interaction: 'Interaction',
  tutors: 'Tutors',
  resilience: 'Resilience',
  card_advantage: 'Card advantage',
  mana: 'Mana base',
  consistency: 'Consistency',
  stax_pressure: 'Stax pressure',
  synergy: 'Synergy',
};

const TYPE_ROWS: Array<{ category: DeckCategory; key: keyof DeckSummary['counts'] }> = [
  { category: 'lands', key: 'lands' },
  { category: 'creatures', key: 'creatures' },
  { category: 'instants', key: 'instants' },
  { category: 'sorceries', key: 'sorceries' },
  { category: 'artifacts', key: 'artifacts' },
  { category: 'enchantments', key: 'enchantments' },
  { category: 'planeswalkers', key: 'planeswalkers' },
  { category: 'battles', key: 'battles' },
];

const COLOR_NAMES: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
  C: 'Colourless',
};

/**
 * Deck analysis, in the page rather than over it.
 *
 * This used to be `DeckAnalysisModal` — a `max-w-4xl max-h-[85vh]` dialog that
 * covered the deck it was describing. It is now a plain section: `/deck/:id/analysis`
 * renders it full width, and the deck page can drop it straight into a tab.
 * Nothing here dims the page or traps focus.
 */
export function DeckAnalysisView({
  deckSummary,
  onOpenBuilder,
  showHeader = true,
}: DeckAnalysisViewProps) {
  const [activeTab, setActiveTab] = useState('power');
  const [rows, setRows] = useState<DeckCardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!deckSummary?.id) return;
    let cancelled = false;

    setLoading(true);
    setLoadError(null);
    fetchDeckCards(deckSummary.id)
      .then(result => {
        if (!cancelled) setRows(result);
      })
      .catch(error => {
        console.error('Deck analysis load failed:', error);
        if (!cancelled) setLoadError('Could not load this decklist.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [deckSummary?.id]);

  const powerScore = useMemo<EDHPowerScore | null>(() => {
    if (rows.length === 0) return null;
    // toEngineCards drops the sideboard, so index against the same subset.
    const mainRows = rows.filter(row => !row.is_sideboard);
    const engineCards = toEngineCards(rows);
    if (engineCards.length === 0) return null;
    const commanderIndex = mainRows.findIndex(row => row.is_commander);
    const commander = commanderIndex >= 0 ? engineCards[commanderIndex] : undefined;
    try {
      return EDHPowerCalculator.calculatePower(
        engineCards,
        deckSummary.format,
        42,
        commander
      );
    } catch (error) {
      console.error('Power calculation failed:', error);
      return null;
    }
  }, [rows, deckSummary.format]);

  const curve = normalizeCurve(deckSummary.curve?.bins);
  const maxCurveCount = Math.max(...curve.map(entry => entry.count), 1);
  const avgMv = averageManaValue(deckSummary.curve?.bins, deckSummary.counts.lands ?? 0);
  const total = Math.max(deckSummary.counts.total, 1);
  const showPower = usesPowerLevel(deckSummary.format);

  const typeRows = TYPE_ROWS.map(row => ({
    ...row,
    count: Number(deckSummary.counts[row.key] ?? 0),
  })).filter(row => row.count > 0);

  const manaSources = Object.entries(deckSummary.mana?.sources ?? {})
    .filter(([, count]) => Number(count) > 0)
    .map(([color, count]) => ({
      color,
      count: Number(count),
      percentage: (Number(count) / total) * 100,
    }));

  return (
    <div className="space-y-4">
      {showHeader && (
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl bg-card p-4 shadow-sm">
          <div>
            <h2 className="text-2xl font-semibold">{deckSummary.name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{formatLabel(deckSummary.format)}</Badge>
              {showPower && (
                <Badge variant="secondary">
                  Power {deckSummary.power?.score ?? 0}/10 · {deckSummary.power?.band}
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">
                {deckSummary.counts.total} cards · avg MV {avgMv.toFixed(2)}
              </span>
            </div>
          </div>
          {onOpenBuilder && (
            <Button onClick={onOpenBuilder}>
              <Edit className="mr-2 h-4 w-4" />
              Open in builder
            </Button>
          )}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="power">Power</TabsTrigger>
          <TabsTrigger value="curve">Mana curve</TabsTrigger>
          <TabsTrigger value="types">Types</TabsTrigger>
          <TabsTrigger value="mana">Mana base</TabsTrigger>
        </TabsList>

        <TabsContent value="power" className="space-y-4">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Scoring decklist…
            </div>
          ) : loadError ? (
            <p className="py-10 text-center text-sm text-destructive">{loadError}</p>
          ) : !powerScore ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              This deck has no cards to score yet.
            </p>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-baseline gap-2 text-lg">
                    <span className="text-3xl font-bold tabular-nums">
                      {powerScore.power.toFixed(1)}
                    </span>
                    <span className="text-muted-foreground">/10</span>
                    <Badge variant="secondary" className="ml-2 uppercase">
                      {powerScore.band}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Computed from this decklist by the EDH power engine.
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {(
                  Object.keys(SUBSCORE_LABELS) as Array<keyof EDHPowerScore['subscores']>
                ).map(key => {
                  const raw = powerScore.subscores[key];
                  const outOfTen = Math.round((raw / 10) * 10) / 10;
                  return (
                    <Card key={key}>
                      <CardContent className="p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-medium">{SUBSCORE_LABELS[key]}</span>
                          <span className="text-sm tabular-nums text-muted-foreground">
                            {outOfTen.toFixed(1)}/10
                          </span>
                        </div>
                        <Progress value={Math.min(Math.max(raw, 0), 100)} />
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Power drivers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {powerScore.drivers.length > 0 ? (
                      <ul className="space-y-1 text-sm">
                        {powerScore.drivers.map((driver, i) => (
                          <li key={i}>• {driver}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Nothing in this list stands out as a power driver.
                      </p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Power drags</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {powerScore.drags.length > 0 ? (
                      <ul className="space-y-1 text-sm">
                        {powerScore.drags.map((drag, i) => (
                          <li key={i}>• {drag}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No significant weaknesses detected.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="curve" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5" />
                Mana curve
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {curve.map(({ bin, count }) => (
                  <div key={bin} className="flex items-center gap-3">
                    <div className="w-12 font-mono text-sm">{bin}</div>
                    <div className="relative h-6 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="flex h-6 items-center justify-end rounded-full bg-primary pr-2"
                        style={{ width: `${(count / maxCurveCount) * 100}%` }}
                      >
                        {count > 0 && (
                          <span className="text-xs font-medium text-primary-foreground">
                            {count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                {deckSummary.counts.total} cards · average mana value {avgMv.toFixed(2)} (lands
                excluded)
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="types" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Card types</CardTitle>
            </CardHeader>
            <CardContent>
              {typeRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No card type data yet.</p>
              ) : (
                <div className="space-y-3">
                  {typeRows.map(row => (
                    <div key={row.category} className="flex items-center gap-3">
                      <div className="w-28 text-sm">{CATEGORY_LABEL[row.category]}</div>
                      <div className="relative h-6 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-6 rounded-full ${CATEGORY_BG_CLASS[row.category]}`}
                          style={{ width: `${(row.count / total) * 100}%` }}
                        />
                      </div>
                      <div className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                        {row.count} · {((row.count / total) * 100).toFixed(0)}%
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mana" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Mana sources</CardTitle>
            </CardHeader>
            <CardContent>
              {manaSources.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No lands or mana sources recorded for this deck.
                </p>
              ) : (
                <div className="space-y-3">
                  {manaSources.map(({ color, count, percentage }) => (
                    <div key={color} className="flex items-center gap-3">
                      <ManaPip symbol={color} size="sm" />
                      <div className="w-20 text-sm">{COLOR_NAMES[color] ?? color}</div>
                      <div className="relative h-6 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-6 rounded-full bg-primary"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                        {count} · {percentage.toFixed(0)}%
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {(deckSummary.legality?.issues?.length ?? 0) > 0 && (
            <Card className="bg-destructive/10">
              <CardHeader>
                <CardTitle className="text-base text-destructive">Legality issues</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm text-destructive">
                  {deckSummary.legality.issues.map((issue, index) => (
                    <li key={index}>• {issue}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default DeckAnalysisView;
