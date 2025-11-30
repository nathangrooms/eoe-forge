import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, AlertTriangle, Info } from 'lucide-react';

interface PowerLevelConsistencyProps {
  deckCards: any[];
  commander?: any;
  format: string;
}

export function PowerLevelConsistency({ deckCards, commander, format }: PowerLevelConsistencyProps) {
  const [analysis, setAnalysis] = useState({
    overallPower: 0,
    consistency: 0,
    speed: 0,
    interaction: 0,
    resilience: 0,
    issues: [] as string[],
    strengths: [] as string[],
  });

  useEffect(() => {
    analyzePowerLevel();
  }, [deckCards, commander, format]);

  const analyzePowerLevel = () => {
    const issues: string[] = [];
    const strengths: string[] = [];
    
    // Count card categories
    const cardTypes = {
      ramp: deckCards.filter(c => c.tags?.includes('ramp')).length,
      removal: deckCards.filter(c => c.tags?.includes('removal-spot') || c.tags?.includes('removal-sweeper')).length,
      draw: deckCards.filter(c => c.tags?.includes('draw')).length,
      tutors: deckCards.filter(c => c.tags?.includes('tutor-broad') || c.tags?.includes('tutor-narrow')).length,
      protection: deckCards.filter(c => c.tags?.includes('protection')).length,
      wincons: deckCards.filter(c => c.tags?.includes('wincon')).length,
      lands: deckCards.filter(c => c.type_line?.toLowerCase().includes('land')).length,
    };

    // Calculate mana curve
    const curve = deckCards.reduce((acc, card) => {
      const cmc = card.cmc || 0;
      acc[cmc] = (acc[cmc] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    const avgCMC = deckCards.reduce((sum, c) => sum + (c.cmc || 0), 0) / Math.max(deckCards.length, 1);

    // Speed analysis (0-100)
    let speed = 50;
    if (cardTypes.ramp >= 10) speed += 20;
    else if (cardTypes.ramp >= 7) speed += 10;
    else if (cardTypes.ramp < 5) speed -= 15;
    
    if (avgCMC < 3) speed += 15;
    else if (avgCMC > 4) speed -= 10;

    if (cardTypes.tutors >= 5) speed += 15;

    // Interaction analysis (0-100)
    let interaction = 50;
    const totalInteraction = cardTypes.removal + cardTypes.protection;
    if (totalInteraction >= 15) interaction += 25;
    else if (totalInteraction >= 10) interaction += 15;
    else if (totalInteraction < 7) interaction -= 20;

    // Consistency analysis (0-100)
    let consistency = 50;
    if (cardTypes.draw >= 10) consistency += 20;
    else if (cardTypes.draw < 7) consistency -= 15;

    if (cardTypes.tutors >= 5) consistency += 15;
    else if (cardTypes.tutors >= 3) consistency += 10;

    // Resilience analysis (0-100)
    let resilience = 50;
    if (cardTypes.protection >= 5) resilience += 20;
    else if (cardTypes.protection < 3) resilience -= 10;

    // Overall power (weighted average)
    const overallPower = Math.round(
      (speed * 0.25 + interaction * 0.25 + consistency * 0.3 + resilience * 0.2)
    );

    // Identify issues
    if (cardTypes.ramp < 8) issues.push('Low ramp count - deck may be too slow');
    if (cardTypes.removal < 8) issues.push('Insufficient removal - vulnerable to threats');
    if (cardTypes.draw < 8) issues.push('Low card draw - may run out of resources');
    if (cardTypes.wincons < 3) issues.push('Few win conditions - unclear path to victory');
    if (avgCMC > 3.5) issues.push('High average CMC - may be too slow');
    if (cardTypes.lands < 33 && format === 'commander') issues.push('Low land count for Commander format');

    // Identify strengths
    if (cardTypes.ramp >= 10) strengths.push('Strong ramp package');
    if (cardTypes.removal >= 12) strengths.push('Excellent removal suite');
    if (cardTypes.draw >= 10) strengths.push('Strong card advantage');
    if (cardTypes.tutors >= 5) strengths.push('High consistency through tutors');
    if (avgCMC < 3) strengths.push('Efficient mana curve');

    setAnalysis({
      overallPower: Math.min(100, Math.max(0, overallPower)),
      consistency: Math.min(100, Math.max(0, consistency)),
      speed: Math.min(100, Math.max(0, speed)),
      interaction: Math.min(100, Math.max(0, interaction)),
      resilience: Math.min(100, Math.max(0, resilience)),
      issues,
      strengths,
    });
  };

  const getPowerColor = (power: number) => {
    if (power >= 80) return 'text-red-500';
    if (power >= 60) return 'text-orange-500';
    if (power >= 40) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getPowerLabel = (power: number) => {
    if (power >= 80) return 'cEDH / Competitive';
    if (power >= 60) return 'High Power';
    if (power >= 40) return 'Mid Power';
    if (power >= 20) return 'Casual / Focused';
    return 'Precon / Beginner';
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Power Level Analysis</span>
            <Badge className={getPowerColor(analysis.overallPower)}>
              {analysis.overallPower}/100
            </Badge>
          </CardTitle>
          <CardDescription>
            {getPowerLabel(analysis.overallPower)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Speed</span>
                <span className="font-medium">{analysis.speed}/100</span>
              </div>
              <Progress value={analysis.speed} className="h-2" />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Interaction</span>
                <span className="font-medium">{analysis.interaction}/100</span>
              </div>
              <Progress value={analysis.interaction} className="h-2" />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Consistency</span>
                <span className="font-medium">{analysis.consistency}/100</span>
              </div>
              <Progress value={analysis.consistency} className="h-2" />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Resilience</span>
                <span className="font-medium">{analysis.resilience}/100</span>
              </div>
              <Progress value={analysis.resilience} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>

      {analysis.strengths.length > 0 && (
        <Alert className="border-emerald-500/20 bg-emerald-500/10">
          <CheckCircle className="h-4 w-4 text-emerald-500" />
          <AlertDescription className="text-sm">
            <div className="font-medium mb-2">Strengths:</div>
            <ul className="list-disc list-inside space-y-1">
              {analysis.strengths.map((strength, idx) => (
                <li key={idx}>{strength}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {analysis.issues.length > 0 && (
        <Alert className="border-yellow-500/20 bg-yellow-500/10">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <AlertDescription className="text-sm">
            <div className="font-medium mb-2">Areas to Improve:</div>
            <ul className="list-disc list-inside space-y-1">
              {analysis.issues.map((issue, idx) => (
                <li key={idx}>{issue}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs text-muted-foreground">
          Power level is calculated using multiple factors: speed, interaction, consistency, and resilience.
          This provides a more accurate assessment than simple card counting.
        </AlertDescription>
      </Alert>
    </div>
  );
}
