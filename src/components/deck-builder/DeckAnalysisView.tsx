import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Edit, Loader2 } from 'lucide-react';
import { DeckSummary } from '@/lib/api/deckAPI';
import { fetchDeckCards, type DeckCardRow } from '@/lib/deck/deckCards';
import { PowerScore, PowerScoreBadge } from '@/components/deck/PowerScore';
import { PowerSliderCoaching } from '@/components/deck-builder/PowerSliderCoaching';
import { LandEnhancerUX } from '@/components/deck-builder/LandEnhancerUX';
import {
  computeDeckPower,
  entriesFromDeckRows,
  persistDeckPower,
  type DeckPower,
} from '@/lib/deck/power';
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

  /**
   * One number, computed once.
   *
   * This view used to print two: `deckSummary.power.score` in the header strip
   * (an edhpowerlevel.com scrape, or the legacy integer column when no scrape
   * existed) and a separate `EDHPowerCalculator` result in the body, about
   * 200px apart and both labelled "/10". For an unscored deck that read
   * "Power 5/10 · mid" above "6.6 /10 HIGH". Both now come from the same
   * `DeckPower`.
   */
  const entries = useMemo(() => entriesFromDeckRows(rows), [rows]);

  const power = useMemo<DeckPower | null>(
    () => computeDeckPower(entries, { format: deckSummary.format }),
    [entries, deckSummary.format]
  );

  // Scoring here is the deck list's chance to catch up: persist it so the tile,
  // the dashboard and the builder all show this same number next time.
  useEffect(() => {
    if (power && deckSummary?.id) void persistDeckPower(deckSummary.id, power);
  }, [power, deckSummary?.id]);

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
              {showPower && <PowerScoreBadge power={power ?? deckSummary.power} />}
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
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="power">Power</TabsTrigger>
          <TabsTrigger value="coaching">Coaching</TabsTrigger>
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
          ) : !showPower ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Power level is a Commander concept — {formatLabel(deckSummary.format)} decks are not
              scored on it.
            </p>
          ) : (
            <PowerScore power={power} variant="expanded" />
          )}
        </TabsContent>

        <TabsContent value="coaching" className="space-y-4">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading decklist…
            </div>
          ) : !power ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Add cards to this deck to get coaching on it.
            </p>
          ) : (
            <>
              <PowerSliderCoaching
                power={power}
                entries={entries}
                format={deckSummary.format}
              />
              <LandEnhancerUX
                entries={entries}
                power={power}
                identity={deckSummary.identity ?? deckSummary.colors}
              />
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
