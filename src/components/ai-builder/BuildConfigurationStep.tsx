import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { 
  DollarSign, 
  TrendingUp, 
  Wand2,
  Info
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface BuildConfiguration {
  powerLevel: number;
  maxBudget: number;
  prioritizeSynergy: boolean;
  includeLands: boolean;
  includeBasics: boolean;
  customPrompt: string;
}

interface BuildConfigurationStepProps {
  config: BuildConfiguration;
  onConfigChange: (updates: Partial<BuildConfiguration>) => void;
}

export function BuildConfigurationStep({ config, onConfigChange }: BuildConfigurationStepProps) {
  const getPowerBandLabel = (power: number) => {
    if (power <= 3) return { label: 'Casual', color: 'text-green-500', bg: 'bg-green-500/10' };
    if (power <= 5) return { label: 'Low Power', color: 'text-blue-500', bg: 'bg-blue-500/10' };
    if (power <= 7) return { label: 'Mid Power', color: 'text-yellow-500', bg: 'bg-yellow-500/10' };
    if (power <= 8) return { label: 'High Power', color: 'text-orange-500', bg: 'bg-orange-500/10' };
    return { label: 'cEDH', color: 'text-red-500', bg: 'bg-red-500/10' };
  };

  const getBudgetTier = (budget: number) => {
    if (budget <= 150) return { label: 'Budget', color: 'text-green-500' };
    if (budget <= 300) return { label: 'Low Budget', color: 'text-blue-500' };
    if (budget <= 600) return { label: 'Mid-Range', color: 'text-yellow-500' };
    if (budget <= 1500) return { label: 'High-End', color: 'text-orange-500' };
    return { label: 'Premium', color: 'text-purple-500' };
  };

  const powerBand = getPowerBandLabel(config.powerLevel);
  const budgetTier = getBudgetTier(config.maxBudget);

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-card via-primary/5 to-accent/5">
      <CardHeader className="border-b border-border/50 bg-gradient-to-r from-primary/10 to-accent/10">
        <CardTitle className="flex items-center gap-3 text-xl">
          <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-accent">
            <Wand2 className="h-5 w-5 text-primary-foreground" />
          </div>
          Power Level & Budget
          <Badge variant="secondary" className="ml-2">Step 3</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-8">
        {/* Power Level Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Target Power Level
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Power level determines card selection, mana curve, and interaction density. Higher power = faster, more consistent decks.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <div className="flex items-center gap-2">
              <Badge className={`${powerBand.bg} ${powerBand.color} border-0 text-base px-4 py-1`}>
                {config.powerLevel}/10
              </Badge>
              <Badge variant="outline" className={powerBand.color}>
                {powerBand.label}
              </Badge>
            </div>
          </div>
          
          <Slider
            value={[config.powerLevel]}
            onValueChange={(value) => onConfigChange({ powerLevel: value[0] })}
            min={1}
            max={10}
            step={1}
            className="py-4"
          />
          
          <div className="flex justify-between text-sm">
            <div className="text-center">
              <span className="text-green-500 font-medium">1-3</span>
              <p className="text-xs text-muted-foreground">Casual/Jank</p>
            </div>
            <div className="text-center">
              <span className="text-blue-500 font-medium">4-5</span>
              <p className="text-xs text-muted-foreground">Low Power</p>
            </div>
            <div className="text-center">
              <span className="text-yellow-500 font-medium">6-7</span>
              <p className="text-xs text-muted-foreground">Focused</p>
            </div>
            <div className="text-center">
              <span className="text-orange-500 font-medium">8</span>
              <p className="text-xs text-muted-foreground">High Power</p>
            </div>
            <div className="text-center">
              <span className="text-red-500 font-medium">9-10</span>
              <p className="text-xs text-muted-foreground">cEDH</p>
            </div>
          </div>
          
          <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
            <strong>Note:</strong> The AI will build to this target but may adjust slightly based on card availability. 
            Final deck will be validated against EDHPowerLevel.com standards.
          </div>
        </div>

        {/* Budget Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-lg font-semibold flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              Total Deck Budget
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Maximum total price for the entire 100-card deck. AI will prioritize budget-friendly alternatives while maintaining power.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <div className="flex items-center gap-2">
              <Badge className="bg-green-500/10 text-green-500 border-0 text-base px-4 py-1">
                ${config.maxBudget}
              </Badge>
              <Badge variant="outline" className={budgetTier.color}>
                {budgetTier.label}
              </Badge>
            </div>
          </div>
          
          <Slider
            value={[config.maxBudget]}
            onValueChange={(value) => onConfigChange({ maxBudget: value[0] })}
            min={50}
            max={3000}
            step={50}
            className="py-4"
          />
          
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>$50</span>
            <span>$500</span>
            <span>$1000</span>
            <span>$2000</span>
            <span>$3000+</span>
          </div>
        </div>

        {/* Additional Options */}
        <div className="space-y-4 pt-4 border-t border-border/50">
          <Label className="text-lg font-semibold">Build Options</Label>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start space-x-3 p-3 bg-muted/30 rounded-lg">
              <Checkbox
                id="synergy"
                checked={config.prioritizeSynergy}
                onCheckedChange={(checked) => onConfigChange({ prioritizeSynergy: !!checked })}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="synergy" className="font-medium cursor-pointer">
                  Prioritize Synergy
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Focus on cards that work with your commander over generic staples
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3 p-3 bg-muted/30 rounded-lg">
              <Checkbox
                id="lands"
                checked={config.includeLands}
                onCheckedChange={(checked) => onConfigChange({ includeLands: !!checked })}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="lands" className="font-medium cursor-pointer">
                  Include Full Manabase
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  AI will build an optimized manabase for your colors
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3 p-3 bg-muted/30 rounded-lg">
              <Checkbox
                id="basics"
                checked={config.includeBasics}
                onCheckedChange={(checked) => onConfigChange({ includeBasics: !!checked })}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="basics" className="font-medium cursor-pointer">
                  Include Basic Lands
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Add basic lands for budget-friendly fixing
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Custom Instructions */}
        <div className="space-y-3">
          <Label className="text-lg font-semibold">
            Additional Instructions (Optional)
          </Label>
          <Textarea
            placeholder="e.g., Include more counterspells, avoid creatures over 4 CMC, focus on specific combos, avoid infinite combos..."
            value={config.customPrompt}
            onChange={(e) => onConfigChange({ customPrompt: e.target.value })}
            rows={3}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            Give the AI specific guidance on what to include or avoid
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
