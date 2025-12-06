import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Target, Sparkles, TrendingUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Archetype {
  value: string;
  label: string;
  description: string;
  synergy?: string;
  powerLevel?: number;
}

interface ArchetypeSelectionStepProps {
  archetypes: Archetype[];
  selectedArchetype: string;
  onArchetypeSelect: (archetype: string, powerLevel?: number) => void;
  commanderName?: string;
  isAISuggested: boolean;
  onReanalyze?: () => void;
  analyzing?: boolean;
}

const DEFAULT_ARCHETYPES: Archetype[] = [
  { value: 'midrange', label: 'Midrange Value', description: 'Balanced threats and answers for consistent gameplay' },
  { value: 'aggro', label: 'Aggro', description: 'Fast, aggressive strategy with low-curve threats' },
  { value: 'control', label: 'Control', description: 'Counter threats and control the game state' },
  { value: 'combo', label: 'Combo', description: 'Build towards powerful game-winning combinations' },
  { value: 'tokens', label: 'Tokens', description: 'Create many creature tokens for wide board presence' },
  { value: 'voltron', label: 'Voltron', description: 'Focus on commander damage with equipment and auras' },
  { value: 'tribal', label: 'Tribal', description: 'Creature type synergies and lords' },
  { value: 'aristocrats', label: 'Aristocrats', description: 'Sacrifice creatures for value and damage' }
];

export function ArchetypeSelectionStep({
  archetypes,
  selectedArchetype,
  onArchetypeSelect,
  commanderName,
  isAISuggested,
  onReanalyze,
  analyzing
}: ArchetypeSelectionStepProps) {
  const displayArchetypes = archetypes.length > 0 ? archetypes : DEFAULT_ARCHETYPES;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-card via-primary/5 to-accent/5">
      <CardHeader className="border-b border-border/50 bg-gradient-to-r from-primary/10 to-accent/10">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xl">
            <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-accent">
              <Target className="h-5 w-5 text-primary-foreground" />
            </div>
            {isAISuggested ? 'AI-Recommended Archetypes' : 'Choose Archetype'}
            <Badge variant="secondary" className="ml-2">Step 2</Badge>
          </div>
          {onReanalyze && commanderName && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onReanalyze}
              disabled={analyzing}
            >
              {analyzing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Re-analyze
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {isAISuggested && commanderName && (
          <div className="p-4 bg-gradient-to-r from-primary/10 to-accent/10 rounded-xl border border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-semibold text-primary">AI Analysis Complete</span>
            </div>
            <p className="text-sm text-muted-foreground">
              These archetypes were specifically recommended for <strong>{commanderName}</strong> based on their abilities and color identity.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayArchetypes.map((archetype) => (
            <div
              key={archetype.value}
              className={cn(
                "p-4 rounded-xl border-2 cursor-pointer transition-all duration-300 group",
                selectedArchetype === archetype.value
                  ? "border-primary bg-primary/5 shadow-lg shadow-primary/20"
                  : "border-border hover:border-primary/50 hover:bg-muted/50"
              )}
              onClick={() => onArchetypeSelect(archetype.value, archetype.powerLevel)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "p-1.5 rounded-lg transition-colors",
                    selectedArchetype === archetype.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary"
                  )}>
                    <Target className="h-4 w-4" />
                  </div>
                  <h3 className="font-semibold text-lg">{archetype.label}</h3>
                </div>
                {archetype.powerLevel && (
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "flex items-center gap-1",
                      selectedArchetype === archetype.value && "border-primary text-primary"
                    )}
                  >
                    <TrendingUp className="h-3 w-3" />
                    {archetype.powerLevel}/10
                  </Badge>
                )}
              </div>
              
              <p className="text-sm text-muted-foreground mb-2">
                {archetype.description}
              </p>
              
              {archetype.synergy && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <p className="text-xs text-primary/80 italic flex items-start gap-1">
                    <Sparkles className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span>{archetype.synergy}</span>
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {!isAISuggested && (
          <div className="text-center p-4 bg-muted/30 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 inline mr-1" />
              Select a commander first to get AI-recommended archetypes tailored to your legendary creature
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
