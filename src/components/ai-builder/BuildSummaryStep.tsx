import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  CheckCircle, 
  Crown, 
  Target, 
  TrendingUp, 
  DollarSign,
  Sparkles,
  Wand2,
  AlertCircle
} from 'lucide-react';
import { ManaSymbols } from '@/components/ui/mana-symbols';

interface BuildSummaryStepProps {
  commander: any;
  archetype: string;
  archetypeLabel: string;
  powerLevel: number;
  maxBudget: number;
  prioritizeSynergy: boolean;
  includeLands: boolean;
  customPrompt: string;
  onBuild: () => void;
  building: boolean;
}

export function BuildSummaryStep({
  commander,
  archetype,
  archetypeLabel,
  powerLevel,
  maxBudget,
  prioritizeSynergy,
  includeLands,
  customPrompt,
  onBuild,
  building
}: BuildSummaryStepProps) {
  const getPowerBand = (power: number) => {
    if (power <= 3) return 'Casual';
    if (power <= 5) return 'Low Power';
    if (power <= 7) return 'Mid Power';
    if (power <= 8) return 'High Power';
    return 'cEDH';
  };

  const getBudgetTier = (budget: number) => {
    if (budget <= 150) return 'Budget';
    if (budget <= 300) return 'Low Budget';
    if (budget <= 600) return 'Mid-Range';
    if (budget <= 1500) return 'High-End';
    return 'Premium';
  };

  const validationChecks = [
    { 
      id: 'commander', 
      label: 'Commander Selected', 
      valid: !!commander,
      detail: commander?.name || 'No commander selected'
    },
    { 
      id: 'archetype', 
      label: 'Archetype Chosen', 
      valid: !!archetype,
      detail: archetypeLabel || 'No archetype selected'
    },
    { 
      id: 'power', 
      label: 'Power Level Set', 
      valid: powerLevel >= 1 && powerLevel <= 10,
      detail: `${powerLevel}/10 (${getPowerBand(powerLevel)})`
    },
    { 
      id: 'budget', 
      label: 'Budget Configured', 
      valid: maxBudget >= 50,
      detail: `$${maxBudget} (${getBudgetTier(maxBudget)})`
    }
  ];

  const allValid = validationChecks.every(c => c.valid);

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-card via-primary/5 to-accent/5">
      <CardHeader className="border-b border-border/50 bg-gradient-to-r from-primary/10 to-accent/10">
        <CardTitle className="flex items-center gap-3 text-xl">
          <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-accent">
            <Wand2 className="h-5 w-5 text-primary-foreground" />
          </div>
          Build Summary
          <Badge variant="secondary" className="ml-2">Final Step</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {/* Commander Preview */}
        {commander && (
          <div className="flex gap-6 p-4 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 rounded-xl border border-yellow-500/30">
            <img 
              src={commander.image_uris?.normal || '/placeholder.svg'} 
              alt={commander.name}
              className="w-24 h-auto rounded-lg shadow-lg"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Crown className="h-5 w-5 text-yellow-500" />
                <h3 className="font-bold text-lg">{commander.name}</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-2">{commander.type_line}</p>
              <ManaSymbols colors={commander.color_identity || []} size="md" />
            </div>
          </div>
        )}

        {/* Build Configuration Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-muted/50 rounded-xl text-center">
            <Target className="h-6 w-6 mx-auto mb-2 text-primary" />
            <p className="text-sm text-muted-foreground">Archetype</p>
            <p className="font-bold">{archetypeLabel || 'Not Selected'}</p>
          </div>
          
          <div className="p-4 bg-muted/50 rounded-xl text-center">
            <TrendingUp className="h-6 w-6 mx-auto mb-2 text-orange-500" />
            <p className="text-sm text-muted-foreground">Power Level</p>
            <p className="font-bold">{powerLevel}/10</p>
            <Badge variant="outline" className="mt-1 text-xs">{getPowerBand(powerLevel)}</Badge>
          </div>
          
          <div className="p-4 bg-muted/50 rounded-xl text-center">
            <DollarSign className="h-6 w-6 mx-auto mb-2 text-green-500" />
            <p className="text-sm text-muted-foreground">Max Budget</p>
            <p className="font-bold">${maxBudget}</p>
            <Badge variant="outline" className="mt-1 text-xs">{getBudgetTier(maxBudget)}</Badge>
          </div>
          
          <div className="p-4 bg-muted/50 rounded-xl text-center">
            <Sparkles className="h-6 w-6 mx-auto mb-2 text-purple-500" />
            <p className="text-sm text-muted-foreground">Options</p>
            <div className="flex flex-wrap justify-center gap-1 mt-1">
              {prioritizeSynergy && <Badge variant="secondary" className="text-xs">Synergy</Badge>}
              {includeLands && <Badge variant="secondary" className="text-xs">Lands</Badge>}
            </div>
          </div>
        </div>

        {/* Custom Instructions */}
        {customPrompt && (
          <div className="p-4 bg-muted/30 rounded-xl">
            <p className="text-sm font-medium mb-2">Custom Instructions:</p>
            <p className="text-sm text-muted-foreground italic">"{customPrompt}"</p>
          </div>
        )}

        {/* Validation Checklist */}
        <div className="space-y-3">
          <h4 className="font-semibold flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Pre-Build Validation
          </h4>
          
          <div className="space-y-2">
            {validationChecks.map((check) => (
              <div 
                key={check.id}
                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {check.valid ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  )}
                  <span className="font-medium">{check.label}</span>
                </div>
                <span className="text-sm text-muted-foreground">{check.detail}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Build Process Info */}
        <div className="p-4 bg-gradient-to-r from-primary/10 to-accent/10 rounded-xl border border-primary/20">
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            What Happens Next
          </h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">1.</span>
              AI analyzes your commander's abilities using Gemini
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">2.</span>
              Fetches optimal cards matching your archetype and budget
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">3.</span>
              Validates color identity against commander
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">4.</span>
              Checks EDH power level and adjusts if needed
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">5.</span>
              Ensures deck fits within your budget
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">6.</span>
              Final optimization using EDH playability scores
            </li>
          </ul>
        </div>

        {/* Build Button */}
        <Button 
          onClick={onBuild}
          disabled={!allValid || building}
          size="lg"
          className="w-full h-14 text-lg bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90"
        >
          {building ? (
            <>
              <Sparkles className="h-5 w-5 mr-2 animate-spin" />
              Building Your Deck...
            </>
          ) : (
            <>
              <Wand2 className="h-5 w-5 mr-2" />
              Build My Deck
            </>
          )}
        </Button>

        {!allValid && (
          <p className="text-sm text-destructive text-center">
            Please complete all required fields before building
          </p>
        )}
      </CardContent>
    </Card>
  );
}
