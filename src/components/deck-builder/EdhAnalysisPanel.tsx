import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
/* Eleven icon imports went with the two metric rows this panel used to build
   by hand. `MetricRow` has no `icon` prop, which is the owner's ruling about
   metric tiles kept by construction rather than by memory. */
import {
  Zap,
  ExternalLink,
  RefreshCw,
  Loader2,
  Shield,
  AlertTriangle,
  Trophy,
  Mountain,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { bandForScore, powerTextClass } from '@/lib/deck/power';
import { MetricRow } from '@/components/listing';

export interface EdhMetrics {
  powerLevel: number | null;
  tippingPoint: number | null;
  efficiency: number | null;
  impact: number | null;
  score: number | null;
  playability: number | null;
}

export interface BracketData {
  recommended: number | null;
  minimum: number | null;
  extraTurns: number;
  massLandDenial: number;
  earlyTwoCardCombos: number;
  lateTwoCardCombos: number;
  gameChangers: number;
}

export interface CardAnalysis {
  name: string;
  isCommander: boolean;
  color: string;
  playability: number | null;
  impact: number;
  isGameChanger: boolean;
}

export interface LandAnalysis {
  landCount: number;
  nonLandCount: number;
  manaScrewPct: number | null;
  manaFloodPct: number | null;
  sweetSpotPct: number | null;
}

export interface EdhAnalysisData {
  metrics: EdhMetrics;
  bracket: BracketData | null;
  cardAnalysis: CardAnalysis[];
  landAnalysis: LandAnalysis | null;
  url: string | null;
}

interface EdhAnalysisPanelProps {
  data: EdhAnalysisData | null;
  isLoading: boolean;
  needsRefresh?: boolean;
  onRefresh: () => void;
}

const bracketDescriptions: Record<number, { name: string; description: string; color: string }> = {
  1: { name: 'Exhibition', description: 'No Extra Turns, No MLD, No 2-Card Combos, No Game Changers', color: 'text-power-1' },
  2: { name: 'Core', description: 'No Chaining Extra Turns, No MLD, No 2-Card Combos, No Game Changers', color: 'text-power-4' },
  3: { name: 'Upgraded', description: 'No Chaining Extra Turns, No MLD, Late-Game Combos Only, 3 Game Changers Max', color: 'text-power-7' },
  4: { name: 'Optimized', description: 'No Restrictions', color: 'text-power-10' },
  5: { name: 'cEDH', description: 'Competitive - No Restrictions', color: 'text-power-10' },
};

/**
 * Power reads on the --power-* scale; it is an MTG measure, so it keeps colour.
 * The cuts come from the one threshold table, not from a fourth private copy.
 */
const getPowerColor = (level: number) => powerTextClass(bandForScore(level));

export function EdhAnalysisPanel({ data, isLoading, needsRefresh, onRefresh }: EdhAnalysisPanelProps) {
  if (!data && !isLoading) {
    return (
      <Card className="p-6">
        <div className="text-center py-8">
          <Zap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">EDH Power Analysis</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Get detailed deck analysis from edhpowerlevel.com
          </p>
          <Button onClick={onRefresh} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Working…
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Analyse deck
              </>
            )}
          </Button>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Fetching analysis from edhpowerlevel.com...</span>
        </div>
      </Card>
    );
  }

  const metrics = data?.metrics;
  const bracket = data?.bracket;
  const cardAnalysis = data?.cardAnalysis || [];
  const landAnalysis = data?.landAnalysis;

  return (
    <Card className={cn(
      "",
      needsRefresh && "ring-2 ring-border"
    )}>
      <div className="p-4 border-b border-border/50">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Zap className="h-5 w-5 text-foreground flex-shrink-0" />
            <h3 className="font-semibold text-sm sm:text-base">EDH Power Analysis</h3>
            <Badge variant="outline" className="text-[10px] sm:text-xs">edhpowerlevel.com</Badge>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {needsRefresh && (
              <Badge variant="outline" className="text-[10px] sm:text-xs text-foreground border-border">
                Cards Changed
              </Badge>
            )}
            {data?.url && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
                <a href={data.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Details
                </a>
              </Button>
            )}
            <Button variant={needsRefresh ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={onRefresh} disabled={isLoading}>
              <RefreshCw className={cn("h-3 w-3 mr-1", isLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <div className="overflow-x-auto scrollbar-none">
          <TabsList className="w-max min-w-full justify-start rounded-none border-b bg-transparent p-0 h-auto">
            <TabsTrigger 
              value="overview" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2 whitespace-nowrap"
            >
              <Zap className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger 
              value="bracket"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2 whitespace-nowrap"
            >
              <Shield className="h-4 w-4 mr-2" />
              Bracket
            </TabsTrigger>
            <TabsTrigger 
              value="cards"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2 whitespace-nowrap"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Card Analysis
            </TabsTrigger>
            <TabsTrigger 
              value="lands"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2 whitespace-nowrap"
            >
              <Mountain className="h-4 w-4 mr-2" />
              Mana Base
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Overview Tab */}
        <TabsContent value="overview" className="p-4 space-y-4">
          {/* Main Power Level */}
          <div className="flex items-center justify-center py-4">
            <div className="text-center">
              <div className={cn("text-5xl font-bold", getPowerColor(metrics?.powerLevel || 0))}>
                {metrics?.powerLevel?.toFixed(1) || '--'}
              </div>
              {/* Named for its source. This used to render at two decimals as
                  "Power Level", which made it look like a more precise version
                  of the deck's own score rather than a different opinion from a
                  different site. */}
              <div className="text-sm text-muted-foreground">/ 10 · edhpowerlevel.com</div>
            </div>
          </div>

          {/*
            The five headline figures.

            Each was a `Card p-3 bg-muted border-border` with an icon, an 20px
            bold value and a Radix tooltip wrapped round the whole tile — five
            `TooltipProvider`s, one per tile, for five one-line explanations.
            The explanations were the only part worth keeping and they are the
            `title` on each metric, which is the slot `MetricRow` has for
            exactly this. The hairline and the icons go, and the figures come up
            to the size every other figure in the product is drawn at.

            `value: null` while `metrics` has not been worked out, which draws
            the tile's bar rather than a `--`: a row that is still computing
            looks like one, and the row holds its height either way.
          */}
          <MetricRow
            columns={5}
            metrics={[
              {
                id: 'tipping-point',
                label: 'Tipping point',
                value: metrics ? String(metrics.tippingPoint ?? '—') : null,
                raw: metrics?.tippingPoint,
                subtext: 'turn',
                title: 'The turn this deck reaches critical mass',
              },
              {
                id: 'efficiency',
                label: 'Efficiency',
                value: metrics ? (metrics.efficiency ? metrics.efficiency.toFixed(1) : '—') : null,
                raw: metrics?.efficiency,
                suffix: metrics?.efficiency ? '/10' : undefined,
                title: 'How well this deck converts mana into impact',
              },
              {
                id: 'impact',
                label: 'Impact',
                value: metrics ? (metrics.impact?.toFixed(0) ?? '—') : null,
                raw: metrics?.impact,
                title: 'Total power contribution from all cards',
              },
              {
                id: 'score',
                label: 'Score',
                value: metrics ? (metrics.score ? String(metrics.score) : '—') : null,
                raw: metrics?.score,
                suffix: metrics?.score ? '/1000' : undefined,
                title: 'Overall competitive score, from card quality',
              },
              {
                id: 'playability',
                label: 'Playability',
                value: metrics ? (metrics.playability ? `${metrics.playability}%` : '—') : null,
                raw: metrics?.playability,
                title: 'Average card usability across typical game states',
              },
            ]}
          />
        </TabsContent>

        {/* Bracket Tab */}
        <TabsContent value="bracket" className="p-4 space-y-4">
          {bracket ? (
            <>
              {/* Bracket Display */}
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4 bg-primary/10 border-primary/20">
                  <div className="text-sm text-muted-foreground mb-1">Recommended Bracket</div>
                  <div className={cn("text-4xl font-bold", bracket.recommended ? bracketDescriptions[bracket.recommended]?.color : '')}>
                    {bracket.recommended ?? '--'}
                  </div>
                  <div className="text-sm mt-1">
                    {bracket.recommended && bracketDescriptions[bracket.recommended]?.name}
                  </div>
                </Card>
                <Card className="p-4 bg-muted/30">
                  <div className="text-sm text-muted-foreground mb-1">Minimum Bracket</div>
                  <div className={cn("text-4xl font-bold", bracket.minimum ? bracketDescriptions[bracket.minimum]?.color : '')}>
                    {bracket.minimum ?? '--'}
                  </div>
                  <div className="text-sm mt-1">
                    {bracket.minimum && bracketDescriptions[bracket.minimum]?.name}
                  </div>
                </Card>
              </div>

              {/* Bracket Scale */}
              <Card className="p-4">
                <div className="text-sm font-medium mb-3">Bracket Scale</div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((b) => (
                    <div 
                      key={b}
                      className={cn(
                        "flex-1 h-8 rounded flex items-center justify-center text-sm font-medium transition-all",
                        bracket.recommended === b 
                          ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                          : "",
                        "bg-muted",
                        bracketDescriptions[b]?.color
                      )}
                    >
                      {b}
                    </div>
                  ))}
                </div>
              </Card>

              {/* Requirement Tracker */}
              <Card className="p-4">
                <div className="text-sm font-medium mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Bracket Requirement Tracker
                </div>
                {/*
                  Five bracket counts. They were 18px bold figures under a
                  centred icon on a `p-2` pad, at 10px labels — the smallest
                  metric treatment anywhere in the deck folder, for the numbers
                  that decide which bracket a Commander deck is legal in. The
                  shared tile, at the size every other figure gets.
                */}
                <MetricRow
                  on="card"
                  columns={5}
                  metrics={[
                    {
                      id: 'extra-turns',
                      label: 'Extra turns',
                      value: String(bracket.extraTurns),
                      raw: bracket.extraTurns,
                    },
                    {
                      id: 'land-denial',
                      label: 'Mass land denial',
                      value: String(bracket.massLandDenial),
                      raw: bracket.massLandDenial,
                    },
                    {
                      id: 'early-combos',
                      label: 'Early combos',
                      value: String(bracket.earlyTwoCardCombos),
                      raw: bracket.earlyTwoCardCombos,
                      subtext: 'two-card, before turn 8',
                    },
                    {
                      id: 'late-combos',
                      label: 'Late combos',
                      value: String(bracket.lateTwoCardCombos),
                      raw: bracket.lateTwoCardCombos,
                      subtext: 'two-card, turn 8 or later',
                    },
                    {
                      id: 'game-changers',
                      label: 'Game changers',
                      value: String(bracket.gameChangers),
                      raw: bracket.gameChangers,
                    },
                  ]}
                />
              </Card>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Bracket data not available</p>
              <p className="text-sm">Click refresh to fetch latest analysis</p>
            </div>
          )}
        </TabsContent>

        {/* Card Analysis Tab */}
        <TabsContent value="cards" className="p-0">
          {cardAnalysis.length > 0 ? (
            <ScrollArea className="h-[400px]">
              <div className="p-4">
                <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground font-medium mb-2 px-2">
                  <div className="col-span-5">Card</div>
                  <div className="col-span-2 text-center">Color</div>
                  <div className="col-span-2 text-center">Playability</div>
                  <div className="col-span-2 text-center">Impact</div>
                  <div className="col-span-1 text-center">GC</div>
                </div>
                <div className="space-y-1">
                  {cardAnalysis
                    .sort((a, b) => b.impact - a.impact)
                    .map((card, idx) => (
                      <div 
                        key={idx}
                        className={cn(
                          "grid grid-cols-12 gap-2 items-center p-2 rounded text-sm",
                          card.isCommander ? "bg-muted border border-border" : "bg-muted/20 hover:bg-muted/40"
                        )}
                      >
                        <div className="col-span-5 flex items-center gap-2 truncate">
                          {card.isCommander && <Badge variant="outline" className="text-[10px] shrink-0">👑</Badge>}
                          <span className="truncate">{card.name}</span>
                        </div>
                        <div className="col-span-2 text-center">
                          <Badge variant="outline" className="text-[10px]">{card.color || '—'}</Badge>
                        </div>
                        <div className="col-span-2 text-center">
                          {card.playability !== null ? (
                            <span className={cn(
                              card.playability >= 50 ? 'text-foreground' : 
                              card.playability >= 25 ? 'text-foreground' : 'text-destructive'
                            )}>
                              {card.playability.toFixed(1)}%
                            </span>
                          ) : '—'}
                        </div>
                        <div className="col-span-2 text-center font-medium">
                          {card.impact.toFixed(1)}
                        </div>
                        <div className="col-span-1 text-center">
                          {card.isGameChanger && <Trophy className="h-4 w-4 text-foreground mx-auto" />}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground p-4">
              <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Card analysis not available</p>
              <p className="text-sm">Click refresh to fetch latest analysis</p>
            </div>
          )}
        </TabsContent>

        {/* Land Analysis Tab */}
        <TabsContent value="lands" className="p-4 space-y-4">
          {landAnalysis ? (
            <>
              {/*
                Land count and the three opening-hand probabilities, on the
                shared tile.

                Three things went with the hand-built version. The tiles carried
                `border-destructive/40` and `border-border`, which are hairlines
                the design law rules out. Each figure had an icon over it, which
                is the treatment the owner ruled out on metric tiles. And an
                unknown probability printed `N/A`, which is an abbreviation for
                a reader who did not ask a question — a dash says the same thing
                and is what every other figure in the product prints.

                The three bars are `Metric.meter`, which is the same hairline
                drawn once. It is legitimate here because each of these really
                is a percentage of a whole, which is the only thing `meter` is
                for.
              */}
              <MetricRow
                columns={5}
                metrics={[
                  /* Every tile in this row carries a bar or none of them does.
                     `MetricRow` reserves the bar's line for the whole row as
                     soon as one tile asks for it, and an empty track on a
                     raised tile reads as a bar at a hundred per cent — so these
                     two were drawing "100%" beside three real probabilities.
                     Both are a real share of the same real total. */
                  {
                    id: 'lands',
                    label: 'Lands',
                    value: String(landAnalysis.landCount),
                    raw: landAnalysis.landCount,
                    meter:
                      landAnalysis.landCount + landAnalysis.nonLandCount > 0
                        ? (landAnalysis.landCount /
                            (landAnalysis.landCount + landAnalysis.nonLandCount)) *
                          100
                        : 0,
                    subtext: 'of the deck',
                  },
                  {
                    id: 'nonlands',
                    label: 'Non-lands',
                    value: String(landAnalysis.nonLandCount),
                    raw: landAnalysis.nonLandCount,
                    meter:
                      landAnalysis.landCount + landAnalysis.nonLandCount > 0
                        ? (landAnalysis.nonLandCount /
                            (landAnalysis.landCount + landAnalysis.nonLandCount)) *
                          100
                        : 0,
                    subtext: 'of the deck',
                  },
                  {
                    id: 'screw',
                    label: 'Mana screw',
                    value:
                      landAnalysis.manaScrewPct !== null
                        ? `${landAnalysis.manaScrewPct.toFixed(1)}%`
                        : '—',
                    raw: landAnalysis.manaScrewPct ?? undefined,
                    meter: landAnalysis.manaScrewPct ?? 0,
                    subtext: 'of opening hands',
                  },
                  {
                    id: 'flood',
                    label: 'Mana flood',
                    value:
                      landAnalysis.manaFloodPct !== null
                        ? `${landAnalysis.manaFloodPct.toFixed(1)}%`
                        : '—',
                    raw: landAnalysis.manaFloodPct ?? undefined,
                    meter: landAnalysis.manaFloodPct ?? 0,
                    subtext: 'of opening hands',
                  },
                  {
                    id: 'sweet',
                    label: 'Sweet spot',
                    value:
                      landAnalysis.sweetSpotPct !== null
                        ? `${landAnalysis.sweetSpotPct.toFixed(1)}%`
                        : '—',
                    raw: landAnalysis.sweetSpotPct ?? undefined,
                    meter: landAnalysis.sweetSpotPct ?? 0,
                    subtext: 'of opening hands',
                  },
                ]}
              />

              <p className="text-xs text-muted-foreground text-center">
                Probabilities based on standard 7-card opening hand + mulligans
              </p>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Mountain className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Land analysis not available</p>
              <p className="text-sm">Click refresh to fetch latest analysis</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </Card>
  );
}
