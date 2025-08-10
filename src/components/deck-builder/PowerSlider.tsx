import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TrendingUp, Info, Zap } from 'lucide-react';

const POWER_LEVELS = {
  1: { label: 'Casual', description: 'Battlecruiser magic, high curve, fun interactions' },
  2: { label: 'Casual+', description: 'Some synergies, basic removal and ramp' },
  3: { label: 'Focused', description: 'Clear gameplan, consistent manabase' },
  4: { label: 'Optimized', description: 'Efficient cards, good interaction suite' },
  5: { label: 'Mid Power', description: 'Tuned strategy, some powerful cards' },
  6: { label: 'High Power', description: 'Fast mana, tutors, efficient wincons' },
  7: { label: 'High Power+', description: 'Combo potential, tight curve' },
  8: { label: 'Competitive', description: 'cEDH viable, optimized everything' },
  9: { label: 'cEDH', description: 'Tournament level, fast wins' },
  10: { label: 'Max Power', description: 'Peak optimization, turn 1-3 wins' }
};

export const PowerSlider = () => {
  const [powerLevel, setPowerLevel] = useState([7]);
  const [showChanges, setShowChanges] = useState(false);

  const currentLevel = POWER_LEVELS[powerLevel[0] as keyof typeof POWER_LEVELS];

  const mockChanges = [
    { type: 'add', card: 'Mana Crypt', reason: 'Fast mana for higher power' },
    { type: 'remove', card: 'Evolving Wilds', reason: 'Too slow for power level 7' },
    { type: 'add', card: 'Fierce Guardianship', reason: 'Free counterspell' },
    { type: 'remove', card: 'Divination', reason: 'Inefficient card draw' }
  ];

  const handlePowerChange = (value: number[]) => {
    setPowerLevel(value);
    setShowChanges(true);
    // Auto-hide changes after 3 seconds
    setTimeout(() => setShowChanges(false), 3000);
  };

  return (
    <div className="flex items-center space-x-4">
      <div className="flex items-center space-x-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Power</span>
      </div>

      <div className="flex items-center space-x-3">
        <div className="w-32">
          <Slider
            value={powerLevel}
            onValueChange={handlePowerChange}
            max={10}
            min={1}
            step={1}
            className="w-full"
          />
        </div>

        <div className="flex items-center space-x-2">
          <Badge variant="default" className="bg-primary">
            {powerLevel[0]}/10
          </Badge>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <Info className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <span className="font-semibold">{currentLevel.label}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {currentLevel.description}
                </p>
                
                {showChanges && (
                  <div className="border-t pt-3">
                    <h4 className="text-sm font-medium mb-2">Suggested Changes:</h4>
                    <div className="space-y-1">
                      {mockChanges.slice(0, 3).map((change, index) => (
                        <div key={index} className="text-xs">
                          <span className={`font-medium ${
                            change.type === 'add' ? 'text-green-500' : 'text-red-500'
                          }`}>
                            {change.type === 'add' ? '+' : '-'}
                          </span>
                          <span className="ml-1">{change.card}</span>
                          <span className="text-muted-foreground ml-1">
                            - {change.reason}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
};