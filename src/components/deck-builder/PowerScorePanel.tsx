import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info, TrendingUp, TrendingDown, Target } from 'lucide-react';

interface PowerScore {
  power: number;
  score: number;
  band: string;
  subscores: {
    speed: number;
    interaction: number;
    ramp: number;
    cardAdvantage: number;
    tutors: number;
    wincons: number;
    resilience: number;
    mana: number;
    synergy: number;
  };
  drivers: string[];
  drags: string[];
  recommendations: {
    change: string;
    impact: Record<string, number>;
  }[];
}

interface PowerScorePanelProps {
  deck: any[];
  format: string;
  targetPower?: number;
  onOptimizeForPower?: (targetPower: number) => void;
}

export function PowerScorePanel({ deck, format, targetPower = 6, onOptimizeForPower }: PowerScorePanelProps) {
  const [showDetails, setShowDetails] = useState(false);
  
  // Mock power score calculation - replace with actual implementation
  const powerScore: PowerScore = calculatePowerScore(deck, format);
  
  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-red-500';
    if (score >= 6) return 'text-yellow-500';
    if (score >= 4) return 'text-blue-500';
    return 'text-green-500';
  };

  const getScoreBand = (score: number) => {
    if (score >= 9) return { label: 'cEDH', color: 'bg-red-500' };
    if (score >= 8) return { label: 'High Power', color: 'bg-orange-500' };
    if (score >= 6) return { label: 'Focused', color: 'bg-yellow-500' };
    if (score >= 4) return { label: 'Optimized', color: 'bg-blue-500' };
    if (score >= 2) return { label: 'Casual', color: 'bg-green-500' };
    return { label: 'Precon', color: 'bg-gray-500' };
  };

  const band = getScoreBand(powerScore.power);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Power Score</span>
          <div className="flex items-center space-x-2">
            <Badge className={band.color} variant="secondary">
              {band.label}
            </Badge>
            <span className={`text-2xl font-bold ${getScoreColor(powerScore.power)}`}>
              {powerScore.power.toFixed(1)}
            </span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Power Target Comparison */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Target Power Level</span>
            <span>{targetPower}</span>
          </div>
          <div className="relative">
            <Progress value={(powerScore.power / 10) * 100} className="h-2" />
            <div 
              className="absolute top-0 w-0.5 h-2 bg-primary"
              style={{ left: `${(targetPower / 10) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Casual</span>
            <span>Competitive</span>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex justify-between">
            <span>Raw Score:</span>
            <span>{powerScore.score}/100</span>
          </div>
          <div className="flex justify-between">
            <span>Deck Size:</span>
            <span>{deck.length} cards</span>
          </div>
        </div>

        <Separator />

        {/* Subscores */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Component Scores</h4>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
            >
              <Info className="w-4 h-4" />
            </Button>
          </div>
          
          {showDetails && (
            <div className="space-y-2">
              {Object.entries(powerScore.subscores).map(([category, score]) => (
                <div key={category} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="capitalize">{category.replace(/([A-Z])/g, ' $1')}</span>
                    <span>{score}/100</span>
                  </div>
                  <Progress value={score} className="h-1" />
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* Drivers and Drags */}
        <div className="space-y-3">
          {powerScore.drivers.length > 0 && (
            <div>
              <h4 className="font-medium text-sm flex items-center text-green-600 mb-2">
                <TrendingUp className="w-4 h-4 mr-1" />
                Power Drivers
              </h4>
              <div className="flex flex-wrap gap-1">
                {powerScore.drivers.slice(0, 3).map((driver, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {driver}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {powerScore.drags.length > 0 && (
            <div>
              <h4 className="font-medium text-sm flex items-center text-red-600 mb-2">
                <TrendingDown className="w-4 h-4 mr-1" />
                Power Drags
              </h4>
              <div className="flex flex-wrap gap-1">
                {powerScore.drags.slice(0, 3).map((drag, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {drag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Recommendations */}
        {powerScore.recommendations.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Quick Improvements</h4>
              {powerScore.recommendations.slice(0, 2).map((rec, index) => (
                <div key={index} className="text-xs p-2 bg-muted rounded">
                  {rec.change}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Optimize Button */}
        {onOptimizeForPower && Math.abs(powerScore.power - targetPower) > 0.5 && (
          <>
            <Separator />
            <Button 
              onClick={() => onOptimizeForPower(targetPower)}
              size="sm"
              className="w-full"
            >
              <Target className="w-4 h-4 mr-2" />
              Optimize for Power {targetPower}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Mock power score calculation - replace with actual implementation
function calculatePowerScore(deck: any[], format: string): PowerScore {
  // Basic mock calculation
  const deckSize = deck.length;
  const avgCmc = deck.reduce((sum, card) => sum + (card.cmc || 0), 0) / deckSize;
  
  // Mock subscores based on deck composition
  const subscores = {
    speed: Math.max(0, Math.min(100, 80 - (avgCmc - 2) * 20)),
    interaction: Math.min(100, (deck.filter(c => isInteraction(c)).length / deckSize) * 400),
    ramp: Math.min(100, (deck.filter(c => isRamp(c)).length / deckSize) * 300),
    cardAdvantage: Math.min(100, (deck.filter(c => isCardAdvantage(c)).length / deckSize) * 350),
    tutors: Math.min(100, (deck.filter(c => isTutor(c)).length / deckSize) * 500),
    wincons: Math.min(100, (deck.filter(c => isWincon(c)).length / deckSize) * 300),
    resilience: Math.min(100, (deck.filter(c => isProtection(c)).length / deckSize) * 400),
    mana: Math.max(40, Math.min(100, 100 - Math.abs(24 - deck.filter(c => isLand(c)).length) * 5)),
    synergy: Math.min(100, calculateSynergy(deck))
  };

  const rawScore = Object.values(subscores).reduce((sum, score) => sum + score, 0) / 9;
  const power = Math.max(1, Math.min(10, (rawScore / 100) * 10));

  return {
    power,
    score: rawScore,
    band: getScoreBand(power),
    subscores,
    drivers: getDeckDrivers(deck, subscores),
    drags: getDeckDrags(deck, subscores),
    recommendations: generateRecommendations(deck, subscores, format)
  };
}

function isInteraction(card: any): boolean {
  const text = card.oracle_text?.toLowerCase() || '';
  return text.includes('destroy') || text.includes('counter') || text.includes('exile') || text.includes('damage');
}

function isRamp(card: any): boolean {
  const text = card.oracle_text?.toLowerCase() || '';
  const type = card.type_line?.toLowerCase() || '';
  return text.includes('search') && text.includes('land') || 
         text.includes('add') && text.includes('mana') ||
         (type.includes('artifact') && text.includes('mana'));
}

function isCardAdvantage(card: any): boolean {
  const text = card.oracle_text?.toLowerCase() || '';
  return text.includes('draw') || text.includes('scry') || text.includes('surveil');
}

function isTutor(card: any): boolean {
  const text = card.oracle_text?.toLowerCase() || '';
  return text.includes('search your library') && !text.includes('basic land');
}

function isWincon(card: any): boolean {
  const text = card.oracle_text?.toLowerCase() || '';
  const type = card.type_line?.toLowerCase() || '';
  return type.includes('planeswalker') || 
         text.includes('win the game') ||
         (card.power && parseInt(card.power) >= 5);
}

function isProtection(card: any): boolean {
  const text = card.oracle_text?.toLowerCase() || '';
  return text.includes('protection') || text.includes('hexproof') || text.includes('ward');
}

function isLand(card: any): boolean {
  return card.type_line?.toLowerCase().includes('land') || false;
}

function calculateSynergy(deck: any[]): number {
  // Mock synergy calculation based on shared keywords/types
  const keywords = new Map<string, number>();
  const types = new Map<string, number>();
  
  deck.forEach(card => {
    const text = card.oracle_text?.toLowerCase() || '';
    const type = card.type_line?.toLowerCase() || '';
    
    // Count keyword synergies
    ['flying', 'trample', 'lifelink', 'deathtouch', 'vigilance', 'haste'].forEach(keyword => {
      if (text.includes(keyword)) {
        keywords.set(keyword, (keywords.get(keyword) || 0) + 1);
      }
    });
    
    // Count type synergies
    ['human', 'elf', 'goblin', 'dragon', 'artifact', 'enchantment'].forEach(t => {
      if (type.includes(t)) {
        types.set(t, (types.get(t) || 0) + 1);
      }
    });
  });
  
  const keywordSynergy = Math.max(...Array.from(keywords.values()), 0);
  const typeSynergy = Math.max(...Array.from(types.values()), 0);
  
  return Math.min(100, (keywordSynergy + typeSynergy) * 5);
}

function getDeckDrivers(deck: any[], subscores: any): string[] {
  const drivers = [];
  if (subscores.speed >= 70) drivers.push('Fast mana curve');
  if (subscores.interaction >= 70) drivers.push('Strong removal suite');
  if (subscores.tutors >= 50) drivers.push('Consistent tutoring');
  if (subscores.synergy >= 70) drivers.push('High synergy');
  return drivers;
}

function getDeckDrags(deck: any[], subscores: any): string[] {
  const drags = [];
  if (subscores.speed <= 40) drags.push('High mana curve');
  if (subscores.interaction <= 30) drags.push('Limited interaction');
  if (subscores.mana <= 50) drags.push('Mana base issues');
  if (subscores.wincons <= 30) drags.push('Unclear win conditions');
  return drags;
}

function generateRecommendations(deck: any[], subscores: any, format: string): any[] {
  const recs = [];
  
  if (subscores.interaction < 50) {
    recs.push({
      change: 'Add more removal spells (target 8-12 pieces)',
      impact: { interaction: 20, power: 0.5 }
    });
  }
  
  if (subscores.ramp < 40 && format !== 'standard') {
    recs.push({
      change: 'Include more ramp sources (target 8-12 pieces)',
      impact: { ramp: 25, speed: 15, power: 0.4 }
    });
  }
  
  if (subscores.cardAdvantage < 40) {
    recs.push({
      change: 'Add card draw engines for consistency',
      impact: { cardAdvantage: 30, power: 0.3 }
    });
  }
  
  return recs;
}

function getScoreBand(score: number): string {
  if (score >= 9) return 'cEDH';
  if (score >= 8) return 'High Power';
  if (score >= 6) return 'Focused';
  if (score >= 4) return 'Optimized';
  if (score >= 2) return 'Casual';
  return 'Precon';
}