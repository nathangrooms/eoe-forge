import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Zap, TrendingUp, Shield, Swords, Clock } from 'lucide-react';

interface PowerMetrics {
  overall: number;
  speed: number;
  interaction: number;
  resilience: number;
  comboPotential: number;
}

interface CommanderPowerDisplayProps {
  powerLevel: number;
  metrics?: PowerMetrics;
}

export function CommanderPowerDisplay({ powerLevel, metrics }: CommanderPowerDisplayProps) {
  const getPowerColor = (level: number) => {
    if (level >= 8) return 'text-red-600 dark:text-red-400';
    if (level >= 6) return 'text-orange-600 dark:text-orange-400';
    if (level >= 4) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-green-600 dark:text-green-400';
  };

  const getPowerLabel = (level: number) => {
    if (level >= 9) return 'cEDH';
    if (level >= 8) return 'High Power';
    if (level >= 6) return 'Optimized';
    if (level >= 4) return 'Focused';
    if (level >= 2) return 'Casual';
    return 'Precon';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Zap className="h-5 w-5" />
          Power Level Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Power */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Overall Power</p>
            <div className="flex items-center gap-2">
              <span className={`text-3xl font-bold ${getPowerColor(powerLevel)}`}>
                {powerLevel.toFixed(1)}
              </span>
              <Badge variant="outline" className={getPowerColor(powerLevel)}>
                {getPowerLabel(powerLevel)}
              </Badge>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Scale: 1-10</p>
            <Progress value={powerLevel * 10} className="w-24 h-2 mt-1" />
          </div>
        </div>

        {/* Detailed Metrics */}
        {metrics && (
          <div className="space-y-3 pt-4 border-t">
            <MetricRow 
              icon={Clock}
              label="Speed"
              value={metrics.speed}
              color="text-blue-600 dark:text-blue-400"
            />
            <MetricRow 
              icon={Shield}
              label="Interaction"
              value={metrics.interaction}
              color="text-purple-600 dark:text-purple-400"
            />
            <MetricRow 
              icon={Swords}
              label="Resilience"
              value={metrics.resilience}
              color="text-emerald-600 dark:text-emerald-400"
            />
            <MetricRow 
              icon={TrendingUp}
              label="Combo Potential"
              value={metrics.comboPotential}
              color="text-red-600 dark:text-red-400"
            />
          </div>
        )}

        {/* Power Level Description */}
        <div className="pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            {powerLevel >= 8 && "This deck is highly competitive with fast mana, tutors, and game-winning combos."}
            {powerLevel >= 6 && powerLevel < 8 && "This deck is well-tuned with strong synergies and efficient answers."}
            {powerLevel >= 4 && powerLevel < 6 && "This deck has a clear strategy with some interaction and win conditions."}
            {powerLevel < 4 && "This deck is casual-focused with room for optimization and power upgrades."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricRow({ icon: Icon, label, value, color }: { 
  icon: any; 
  label: string; 
  value: number; 
  color: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-sm">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <Progress value={value * 10} className="w-20 h-1.5" />
        <span className={`text-sm font-medium ${color} w-8 text-right`}>
          {value.toFixed(1)}
        </span>
      </div>
    </div>
  );
}
