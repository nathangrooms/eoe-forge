import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  TrendingUp, 
  TrendingDown, 
  ArrowRight, 
  Zap, 
  Shield, 
  Search, 
  Target,
  Sparkles,
  Eye
} from 'lucide-react';

interface PowerChange {
  type: 'add' | 'remove' | 'swap';
  from?: string;
  to?: string;
  reason: string;
  impact: string;
}

interface PowerPreview {
  currentPower: number;
  targetPower: number;
  changes: PowerChange[];
  subscoreChanges: Record<string, { from: number; to: number }>;
}

interface PowerSliderCoachingProps {
  currentPower: number;
  onPowerChange: (power: number, preview?: boolean) => void;
  onApplyChanges: (power: number) => void;
}

export const PowerSliderCoaching = ({ currentPower, onPowerChange, onApplyChanges }: PowerSliderCoachingProps) => {
  const [targetPower, setTargetPower] = useState(currentPower);
  const [showPreview, setShowPreview] = useState(false);

  // Mock preview data - in real app this would come from the builder
  const generatePreview = (target: number): PowerPreview => {
    const diff = target - currentPower;
    const changes: PowerChange[] = [];
    const subscoreChanges: Record<string, { from: number; to: number }> = {};

    if (diff > 0) {
      // Escalating
      if (diff >= 1) {
        changes.push({
          type: 'add',
          to: 'Lightning Bolt',
          reason: 'Adding efficient removal',
          impact: '+0.3 interaction'
        });
        changes.push({
          type: 'swap',
          from: 'Cancel',
          to: 'Counterspell',
          reason: 'More efficient counter',
          impact: '+0.2 interaction'
        });
        subscoreChanges.interaction = { from: 6.2, to: 6.7 };
      }
      if (diff >= 2) {
        changes.push({
          type: 'add',
          to: 'Vampiric Tutor',
          reason: 'Adding premium tutor',
          impact: '+0.4 tutors'
        });
        changes.push({
          type: 'swap',
          from: 'Temple of Silence',
          to: 'Godless Shrine',
          reason: 'Faster manabase',
          impact: '+0.3 mana'
        });
        subscoreChanges.tutors = { from: 4.1, to: 4.5 };
        subscoreChanges.mana = { from: 7.2, to: 7.5 };
      }
    } else if (diff < 0) {
      // De-escalating
      if (diff <= -1) {
        changes.push({
          type: 'remove',
          from: 'Mana Crypt',
          reason: 'Removing fast mana',
          impact: '-0.4 mana'
        });
        changes.push({
          type: 'swap',
          from: 'Force of Will',
          to: 'Negate',
          reason: 'Less powerful counter',
          impact: '-0.3 interaction'
        });
        subscoreChanges.mana = { from: 7.8, to: 7.4 };
        subscoreChanges.interaction = { from: 7.1, to: 6.8 };
      }
    }

    return {
      currentPower,
      targetPower: target,
      changes,
      subscoreChanges
    };
  };

  const handleSliderChange = (value: number[]) => {
    const newPower = value[0];
    setTargetPower(newPower);
    onPowerChange(newPower, true);
  };

  const previewChanges = () => {
    setShowPreview(true);
  };

  const applyChanges = () => {
    onApplyChanges(targetPower);
    setShowPreview(false);
  };

  const preview = generatePreview(targetPower);
  const powerDiff = targetPower - currentPower;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <TrendingUp className="h-5 w-5 mr-2" />
          Power Level Tuning
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current vs Target */}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-muted-foreground">{currentPower.toFixed(1)}</div>
            <div className="text-sm text-muted-foreground">Current</div>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold ${targetPower > currentPower ? 'text-green-500' : targetPower < currentPower ? 'text-red-500' : 'text-primary'}`}>
              {targetPower.toFixed(1)}
            </div>
            <div className="text-sm text-muted-foreground">Target</div>
          </div>
        </div>

        {/* Power Slider */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Power Level</span>
            <Badge variant={powerDiff === 0 ? 'outline' : powerDiff > 0 ? 'default' : 'secondary'}>
              {powerDiff > 0 ? '+' : ''}{powerDiff.toFixed(1)}
            </Badge>
          </div>
          <Slider
            value={[targetPower]}
            onValueChange={handleSliderChange}
            min={1}
            max={10}
            step={0.1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Casual (1-3)</span>
            <span>Focused (4-6)</span>
            <span>Optimized (7-8)</span>
            <span>cEDH (9-10)</span>
          </div>
        </div>

        {/* Preview Button */}
        {powerDiff !== 0 && (
          <div className="flex gap-2">
            <Button onClick={previewChanges} variant="outline" className="flex-1">
              <Eye className="h-4 w-4 mr-2" />
              Preview Changes
            </Button>
            {showPreview && (
              <Button onClick={applyChanges} className="flex-1">
                <Sparkles className="h-4 w-4 mr-2" />
                Apply Changes
              </Button>
            )}
          </div>
        )}

        {/* Change Preview */}
        {showPreview && powerDiff !== 0 && (
          <Alert>
            <Sparkles className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-3">
                <div className="font-medium">
                  {powerDiff > 0 ? 'Escalating' : 'De-escalating'} by {Math.abs(powerDiff).toFixed(1)} power level
                </div>
                
                {/* Proposed Changes */}
                <div className="space-y-2">
                  {preview.changes.map((change, index) => (
                    <div key={index} className="flex items-center justify-between text-sm bg-muted/30 p-2 rounded">
                      <div className="flex items-center space-x-2">
                        {change.type === 'add' ? (
                          <TrendingUp className="h-3 w-3 text-green-500" />
                        ) : change.type === 'remove' ? (
                          <TrendingDown className="h-3 w-3 text-red-500" />
                        ) : (
                          <ArrowRight className="h-3 w-3 text-blue-500" />
                        )}
                        <span>
                          {change.type === 'add' && `Add ${change.to}`}
                          {change.type === 'remove' && `Remove ${change.from}`}
                          {change.type === 'swap' && `${change.from} → ${change.to}`}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {change.impact}
                      </Badge>
                    </div>
                  ))}
                </div>

                {/* Subscore Changes */}
                {Object.keys(preview.subscoreChanges).length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Subscore Impact:</div>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(preview.subscoreChanges).map(([subscore, { from, to }]) => (
                        <div key={subscore} className="flex items-center justify-between text-xs bg-muted/20 p-2 rounded">
                          <span className="capitalize">{subscore}</span>
                          <div className="flex items-center space-x-1">
                            <span className="text-muted-foreground">{from.toFixed(1)}</span>
                            <ArrowRight className="h-3 w-3" />
                            <span className={to > from ? 'text-green-500' : 'text-red-500'}>
                              {to.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Power Level Description */}
        <div className="text-sm text-muted-foreground">
          {targetPower >= 8 ? (
            <div className="flex items-center space-x-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              <span>Highly optimized with premium cards and tight synergies</span>
            </div>
          ) : targetPower >= 6 ? (
            <div className="flex items-center space-x-2">
              <Target className="h-4 w-4 text-blue-500" />
              <span>Focused strategy with good card quality and consistency</span>
            </div>
          ) : targetPower >= 4 ? (
            <div className="flex items-center space-x-2">
              <Shield className="h-4 w-4 text-green-500" />
              <span>Casual competitive with clear game plan</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4 text-gray-500" />
              <span>Casual deck focusing on fun interactions</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};