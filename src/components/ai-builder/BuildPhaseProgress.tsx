import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle, 
  Loader2, 
  Circle,
  Brain,
  Target,
  DollarSign,
  Shield,
  Sparkles,
  TrendingUp
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BuildPhase {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'active' | 'complete' | 'error';
  progress?: number;
  result?: string;
}

interface BuildPhaseProgressProps {
  phases: BuildPhase[];
  currentPhase: number;
  totalProgress: number;
}

const PHASE_ICONS: Record<string, any> = {
  'analyze': Brain,
  'fetch': Target,
  'build': Sparkles,
  'validate-color': Shield,
  'validate-power': TrendingUp,
  'validate-budget': DollarSign,
  'optimize': Brain,
  'finalize': CheckCircle
};

export function BuildPhaseProgress({ phases, currentPhase, totalProgress }: BuildPhaseProgressProps) {
  return (
    <Card className="border-primary/20 bg-gradient-to-br from-card via-primary/5 to-accent/5">
      <CardContent className="p-6 space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="h-6 w-6 text-primary animate-pulse" />
            <h3 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Building Your Perfect Deck
            </h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Quality over speed - we're analyzing thousands of cards to match your specifications
          </p>
        </div>

        <Progress value={totalProgress} className="h-3" />
        
        <div className="text-center text-sm text-muted-foreground">
          {Math.round(totalProgress)}% Complete
        </div>

        <div className="space-y-3">
          {phases.map((phase, index) => {
            const Icon = PHASE_ICONS[phase.id] || Circle;
            const isActive = phase.status === 'active';
            const isComplete = phase.status === 'complete';
            const isPending = phase.status === 'pending';
            const isError = phase.status === 'error';

            return (
              <div
                key={phase.id}
                className={cn(
                  "flex items-start gap-4 p-3 rounded-lg transition-all duration-300",
                  isActive && "bg-primary/10 border border-primary/30",
                  isComplete && "bg-green-500/10 border border-green-500/30",
                  isError && "bg-destructive/10 border border-destructive/30",
                  isPending && "opacity-50"
                )}
              >
                <div className={cn(
                  "flex-shrink-0 p-2 rounded-full",
                  isActive && "bg-primary/20",
                  isComplete && "bg-green-500/20",
                  isError && "bg-destructive/20",
                  isPending && "bg-muted"
                )}>
                  {isActive ? (
                    <Loader2 className="h-5 w-5 text-primary animate-spin" />
                  ) : isComplete ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : isError ? (
                    <Circle className="h-5 w-5 text-destructive" />
                  ) : (
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "font-medium",
                      isActive && "text-primary",
                      isComplete && "text-green-500"
                    )}>
                      {phase.name}
                    </span>
                    {isComplete && phase.result && (
                      <Badge variant="secondary" className="text-xs bg-green-500/20 text-green-600">
                        {phase.result}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{phase.description}</p>
                  
                  {isActive && phase.progress !== undefined && (
                    <Progress value={phase.progress} className="h-1 mt-2" />
                  )}
                </div>

                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-xs",
                    isActive && "border-primary text-primary",
                    isComplete && "border-green-500 text-green-500"
                  )}
                >
                  {index + 1}/{phases.length}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
