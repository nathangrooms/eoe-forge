import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { 
  Layers, 
  DollarSign, 
  TrendingUp, 
  Target, 
  Crown,
  Swords,
  Shield,
  Sparkles,
  Mountain,
  Users,
  Scroll,
  Gem,
  Zap,
  Scale,
  Clock,
  Crosshair,
  Gamepad2,
  ExternalLink,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface EdhMetrics {
  tippingPoint: number | null;
  efficiency: number | null;
  impact: number | null;
  score: number | null;
  playability: number | null;
}

interface DeckQuickStatsProps {
  totalCards: number;
  creatures: number;
  lands: number;
  instants: number;
  sorceries: number;
  artifacts: number;
  enchantments: number;
  planeswalkers: number;
  avgCmc: number;
  totalValue: number;
  powerLevel: number;
  edhPowerLevel?: number | null;
  edhMetrics?: EdhMetrics | null;
  edhPowerUrl?: string | null;
  loadingEdhPower?: boolean;
  onCheckEdhPower?: () => void;
  format: string;
  commanderName?: string;
  colors: string[];
  missingCards?: number;
  ownedPct?: number;
}

const colorMap: Record<string, string> = {
  W: 'bg-amber-100 border-amber-300 dark:bg-amber-200',
  U: 'bg-blue-500',
  B: 'bg-gray-800',
  R: 'bg-red-500',
  G: 'bg-green-500'
};

const powerBandConfig: Record<string, { color: string; label: string }> = {
  casual: { color: 'text-green-500', label: 'Casual' },
  mid: { color: 'text-blue-500', label: 'Mid' },
  high: { color: 'text-orange-500', label: 'High' },
  cEDH: { color: 'text-red-500', label: 'cEDH' }
};

export function DeckQuickStats({
  totalCards,
  creatures,
  lands,
  instants,
  sorceries,
  artifacts,
  enchantments,
  planeswalkers,
  avgCmc,
  totalValue,
  powerLevel,
  edhPowerLevel,
  edhMetrics,
  edhPowerUrl,
  loadingEdhPower,
  onCheckEdhPower,
  format,
  commanderName,
  colors,
  missingCards = 0,
  ownedPct = 100
}: DeckQuickStatsProps) {
  const getPowerBand = (level: number) => {
    if (level <= 3) return 'casual';
    if (level <= 6) return 'mid';
    if (level <= 8) return 'high';
    return 'cEDH';
  };

  const displayPower = edhPowerLevel ?? powerLevel;
  const powerBand = getPowerBand(displayPower);
  const powerStyle = powerBandConfig[powerBand];

  const targetCards = format === 'commander' ? 100 : 60;
  const completionPct = Math.min((totalCards / targetCards) * 100, 100);

  const isCommander = format === 'commander';

  return (
    <div className="space-y-4">
      {/* Main Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {/* Total Cards */}
        <Card className="p-4 bg-gradient-to-br from-muted/50 to-muted/20 border-border/60">
          <div className="flex items-center justify-between mb-2">
            <Layers className="h-5 w-5 text-primary" />
            <Badge variant="outline" className="text-[10px]">{format}</Badge>
          </div>
          <div className="text-2xl font-bold">{totalCards}</div>
          <div className="text-xs text-muted-foreground">/ {targetCards} cards</div>
          <Progress value={completionPct} className="h-1.5 mt-2" />
        </Card>

        {/* Power Level - EDH Live */}
        <Card className="p-4 bg-gradient-to-br from-muted/50 to-muted/20 border-border/60">
          <div className="flex items-center justify-between mb-2">
            <Zap className="h-5 w-5 text-amber-500" />
            {isCommander && onCheckEdhPower && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onCheckEdhPower}
                disabled={loadingEdhPower}
              >
                {loadingEdhPower ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
              </Button>
            )}
          </div>
          <div className={cn("text-2xl font-bold", powerStyle.color)}>
            {edhPowerLevel !== null && edhPowerLevel !== undefined ? edhPowerLevel.toFixed(2) : powerLevel}/10
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            Power Level
            {edhPowerUrl && (
              <a href={edhPowerUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <Badge variant="outline" className={cn("text-[10px] mt-1", powerStyle.color)}>
            {powerStyle.label}
          </Badge>
        </Card>

        {/* Deck Value */}
        <Card className="p-4 bg-gradient-to-br from-muted/50 to-muted/20 border-border/60">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="h-5 w-5 text-green-500" />
          </div>
          <div className="text-2xl font-bold text-green-500">${totalValue.toFixed(0)}</div>
          <div className="text-xs text-muted-foreground">Est. Value</div>
        </Card>

        {/* Average CMC */}
        <Card className="p-4 bg-gradient-to-br from-muted/50 to-muted/20 border-border/60">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div className="text-2xl font-bold">{avgCmc.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground">Avg. CMC</div>
        </Card>

        {/* Collection Ownership */}
        <Card className="p-4 bg-gradient-to-br from-muted/50 to-muted/20 border-border/60">
          <div className="flex items-center justify-between mb-2">
            <Shield className="h-5 w-5 text-primary" />
            {missingCards > 0 && (
              <Badge variant="outline" className="text-[10px] text-orange-500">{missingCards} missing</Badge>
            )}
          </div>
          <div className="text-2xl font-bold">{ownedPct.toFixed(0)}%</div>
          <div className="text-xs text-muted-foreground">Owned</div>
          <Progress value={ownedPct} className="h-1.5 mt-2" />
        </Card>

        {/* Color Identity */}
        <Card className="p-4 bg-gradient-to-br from-muted/50 to-muted/20 border-border/60">
          <div className="flex items-center justify-between mb-2">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="flex gap-1.5 mb-1">
            {colors.length > 0 ? colors.map(color => (
              <div 
                key={color}
                className={cn("w-6 h-6 rounded-full border-2 border-white/30 shadow-sm", colorMap[color])}
              />
            )) : (
              <span className="text-muted-foreground text-sm">Colorless</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">Color Identity</div>
        </Card>
      </div>

      {/* EDH Metrics Row - Only show for Commander format when metrics are available */}
      {isCommander && edhMetrics && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {/* Tipping Point */}
          <Card className="p-3 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Scale className="h-4 w-4 text-blue-400" />
              <span className="text-xs text-muted-foreground">Tipping Point</span>
            </div>
            <div className="text-xl font-bold text-blue-400">
              {edhMetrics.tippingPoint !== null ? edhMetrics.tippingPoint : '--'}
            </div>
          </Card>

          {/* Efficiency */}
          <Card className="p-3 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-green-400" />
              <span className="text-xs text-muted-foreground">Efficiency</span>
            </div>
            <div className="text-xl font-bold text-green-400">
              {edhMetrics.efficiency !== null ? `${edhMetrics.efficiency.toFixed(1)}/10` : '--'}
            </div>
          </Card>

          {/* Impact */}
          <Card className="p-3 bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Crosshair className="h-4 w-4 text-orange-400" />
              <span className="text-xs text-muted-foreground">Impact</span>
            </div>
            <div className="text-xl font-bold text-orange-400">
              {edhMetrics.impact !== null ? edhMetrics.impact.toFixed(0) : '--'}
            </div>
          </Card>

          {/* Score */}
          <Card className="p-3 bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-purple-400" />
              <span className="text-xs text-muted-foreground">Score</span>
            </div>
            <div className="text-xl font-bold text-purple-400">
              {edhMetrics.score !== null ? `${edhMetrics.score}/1000` : '--'}
            </div>
          </Card>

          {/* Playability */}
          <Card className="p-3 bg-gradient-to-br from-pink-500/10 to-pink-500/5 border-pink-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Gamepad2 className="h-4 w-4 text-pink-400" />
              <span className="text-xs text-muted-foreground">Playability</span>
            </div>
            <div className="text-xl font-bold text-pink-400">
              {edhMetrics.playability !== null ? `${edhMetrics.playability}%` : '--'}
            </div>
          </Card>
        </div>
      )}

      {/* Type Breakdown - Full Width */}
      <Card className="p-4 bg-gradient-to-br from-muted/50 to-muted/20 border-border/60">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Type Breakdown</span>
        </div>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <Users className="h-4 w-4 mx-auto mb-1 text-green-500" />
            <div className="text-lg font-bold">{creatures}</div>
            <div className="text-[10px] text-muted-foreground">Creatures</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <Mountain className="h-4 w-4 mx-auto mb-1 text-amber-600" />
            <div className="text-lg font-bold">{lands}</div>
            <div className="text-[10px] text-muted-foreground">Lands</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <Sparkles className="h-4 w-4 mx-auto mb-1 text-blue-400" />
            <div className="text-lg font-bold">{instants}</div>
            <div className="text-[10px] text-muted-foreground">Instants</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <Scroll className="h-4 w-4 mx-auto mb-1 text-blue-600" />
            <div className="text-lg font-bold">{sorceries}</div>
            <div className="text-[10px] text-muted-foreground">Sorceries</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <Shield className="h-4 w-4 mx-auto mb-1 text-gray-400" />
            <div className="text-lg font-bold">{artifacts}</div>
            <div className="text-[10px] text-muted-foreground">Artifacts</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <Gem className="h-4 w-4 mx-auto mb-1 text-purple-500" />
            <div className="text-lg font-bold">{enchantments}</div>
            <div className="text-[10px] text-muted-foreground">Enchant.</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <Swords className="h-4 w-4 mx-auto mb-1 text-orange-500" />
            <div className="text-lg font-bold">{planeswalkers}</div>
            <div className="text-[10px] text-muted-foreground">PWs</div>
          </div>
          {commanderName && (
            <div className="text-center p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Crown className="h-4 w-4 mx-auto mb-1 text-amber-400" />
              <div className="text-xs font-medium truncate">{commanderName.split(',')[0]}</div>
              <div className="text-[10px] text-muted-foreground">Commander</div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
