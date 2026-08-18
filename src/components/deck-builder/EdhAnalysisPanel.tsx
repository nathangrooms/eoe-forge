import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Zap, 
  Scale, 
  Clock, 
  Crosshair, 
  Target, 
  Gamepad2,
  ExternalLink,
  RefreshCw,
  Loader2,
  Shield,
  Swords,
  AlertTriangle,
  Trophy,
  Mountain,
  Infinity,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Droplets
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

// Power reads on the --power-* scale; it is an MTG measure, so it keeps colour.
const getPowerColor = (level: number) => {
  if (level <= 3) return 'text-power-1';
  if (level <= 6) return 'text-power-4';
  if (level <= 8) return 'text-power-7';
  return 'text-power-10';
};

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
                Analyzing...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Analyze Deck
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
                {metrics?.powerLevel?.toFixed(2) || '--'}
              </div>
              <div className="text-sm text-muted-foreground">/ 10 Power Level</div>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Card className="p-3 bg-muted border-border cursor-help">
                    <div className="flex items-center gap-2 mb-1">
                      <Scale className="h-4 w-4 text-foreground" />
                      <span className="text-xs text-muted-foreground">Tipping Point</span>
                    </div>
                    <div className="text-xl font-bold text-foreground">
                      {metrics?.tippingPoint ?? '--'}
                    </div>
                  </Card>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">The turn when your deck reaches critical mass and starts dominating</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Card className="p-3 bg-muted border-border cursor-help">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-4 w-4 text-foreground" />
                      <span className="text-xs text-muted-foreground">Efficiency</span>
                    </div>
                    <div className="text-xl font-bold text-foreground">
                      {metrics?.efficiency ? `${metrics.efficiency.toFixed(1)}/10` : '--'}
                    </div>
                  </Card>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">How well your deck converts mana into impact</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Card className="p-3 bg-muted border-border cursor-help">
                    <div className="flex items-center gap-2 mb-1">
                      <Crosshair className="h-4 w-4 text-foreground" />
                      <span className="text-xs text-muted-foreground">Impact</span>
                    </div>
                    <div className="text-xl font-bold text-foreground">
                      {metrics?.impact?.toFixed(0) ?? '--'}
                    </div>
                  </Card>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">Total power contribution from all cards</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Card className="p-3 bg-muted border-border cursor-help">
                    <div className="flex items-center gap-2 mb-1">
                      <Target className="h-4 w-4 text-foreground" />
                      <span className="text-xs text-muted-foreground">Score</span>
                    </div>
                    <div className="text-xl font-bold text-foreground">
                      {metrics?.score ? `${metrics.score}/1000` : '--'}
                    </div>
                  </Card>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">Overall competitive score based on card quality</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Card className="p-3 bg-muted border-border cursor-help">
                    <div className="flex items-center gap-2 mb-1">
                      <Gamepad2 className="h-4 w-4 text-foreground" />
                      <span className="text-xs text-muted-foreground">Playability</span>
                    </div>
                    <div className="text-xl font-bold text-foreground">
                      {metrics?.playability ? `${metrics.playability}%` : '--'}
                    </div>
                  </Card>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">Average card usability across typical game states</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
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
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="text-center p-2 rounded bg-muted/30">
                    <Infinity className="h-4 w-4 mx-auto mb-1 text-foreground" />
                    <div className="text-lg font-bold">{bracket.extraTurns}</div>
                    <div className="text-[10px] text-muted-foreground">Extra Turns</div>
                  </div>
                  <div className="text-center p-2 rounded bg-muted/30">
                    <Mountain className="h-4 w-4 mx-auto mb-1 text-destructive" />
                    <div className="text-lg font-bold">{bracket.massLandDenial}</div>
                    <div className="text-[10px] text-muted-foreground">Mass Land Denial</div>
                  </div>
                  <div className="text-center p-2 rounded bg-muted/30">
                    <Swords className="h-4 w-4 mx-auto mb-1 text-foreground" />
                    <div className="text-lg font-bold">{bracket.earlyTwoCardCombos}</div>
                    <div className="text-[10px] text-muted-foreground">Early Combos</div>
                  </div>
                  <div className="text-center p-2 rounded bg-muted/30">
                    <Swords className="h-4 w-4 mx-auto mb-1 text-foreground" />
                    <div className="text-lg font-bold">{bracket.lateTwoCardCombos}</div>
                    <div className="text-[10px] text-muted-foreground">Late Combos</div>
                  </div>
                  <div className="text-center p-2 rounded bg-muted/30">
                    <Trophy className="h-4 w-4 mx-auto mb-1 text-foreground" />
                    <div className="text-lg font-bold">{bracket.gameChangers}</div>
                    <div className="text-[10px] text-muted-foreground">Game Changers</div>
                  </div>
                </div>
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
              {/* Land Count */}
              <Card className="p-4">
                <div className="text-sm font-medium mb-3">Land Distribution</div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 rounded bg-muted/30">
                    <Mountain className="h-5 w-5 mx-auto mb-2 text-foreground" />
                    <div className="text-2xl font-bold">{landAnalysis.landCount}</div>
                    <div className="text-xs text-muted-foreground">Lands</div>
                  </div>
                  <div className="text-center p-3 rounded bg-muted/30">
                    <Sparkles className="h-5 w-5 mx-auto mb-2 text-primary" />
                    <div className="text-2xl font-bold">{landAnalysis.nonLandCount}</div>
                    <div className="text-xs text-muted-foreground">Non-Lands</div>
                  </div>
                </div>
              </Card>

              {/* Probability Stats */}
              <div className="grid grid-cols-3 gap-3">
                <Card className="p-4 bg-destructive/10 border-destructive/40">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="h-4 w-4 text-destructive" />
                    <span className="text-xs text-muted-foreground">Mana Screw</span>
                  </div>
                  <div className="text-2xl font-bold text-destructive">
                    {landAnalysis.manaScrewPct !== null ? `${landAnalysis.manaScrewPct.toFixed(1)}%` : 'N/A'}
                  </div>
                  <Progress 
                    value={landAnalysis.manaScrewPct ?? 0} 
                    className="h-1.5 mt-2"
                  />
                </Card>

                <Card className="p-4 bg-muted border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <Droplets className="h-4 w-4 text-foreground" />
                    <span className="text-xs text-muted-foreground">Mana Flood</span>
                  </div>
                  <div className="text-2xl font-bold text-foreground">
                    {landAnalysis.manaFloodPct !== null ? `${landAnalysis.manaFloodPct.toFixed(1)}%` : 'N/A'}
                  </div>
                  <Progress 
                    value={landAnalysis.manaFloodPct ?? 0} 
                    className="h-1.5 mt-2"
                  />
                </Card>

                <Card className="p-4 bg-muted border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-foreground" />
                    <span className="text-xs text-muted-foreground">Sweet Spot</span>
                  </div>
                  <div className="text-2xl font-bold text-foreground">
                    {landAnalysis.sweetSpotPct !== null ? `${landAnalysis.sweetSpotPct.toFixed(1)}%` : 'N/A'}
                  </div>
                  <Progress 
                    value={landAnalysis.sweetSpotPct ?? 0} 
                    className="h-1.5 mt-2"
                  />
                </Card>
              </div>

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
