import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Shuffle, RotateCcw, TrendingUp, Target } from 'lucide-react';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

interface SimulationCard {
  name: string;
  cmc: number;
  type_line: string;
  image_url?: string;
}

interface HandSimulatorProps {
  deckCards: SimulationCard[];
  commanderName?: string;
}

export function HandSimulator({ deckCards, commanderName }: HandSimulatorProps) {
  const [hand, setHand] = useState<SimulationCard[]>([]);
  const [library, setLibrary] = useState<SimulationCard[]>([]);
  const [mulligans, setMulligans] = useState(0);
  const [keepPercentage, setKeepPercentage] = useState(0);
  const [simulations, setSimulations] = useState(0);

  useEffect(() => {
    if (deckCards.length > 0) {
      drawOpeningHand();
    }
  }, [deckCards]);

  const shuffleDeck = (cards: SimulationCard[]): SimulationCard[] => {
    const shuffled = [...cards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const drawOpeningHand = () => {
    const shuffled = shuffleDeck([...deckCards]);
    const drawnHand = shuffled.slice(0, 7);
    const remainingLibrary = shuffled.slice(7);
    
    setHand(drawnHand);
    setLibrary(remainingLibrary);
    setSimulations(prev => prev + 1);
  };

  const mulligan = () => {
    if (hand.length <= 1) {
      showError('Cannot Mulligan', 'Already at minimum hand size');
      return;
    }

    const newHandSize = hand.length - 1;
    const shuffled = shuffleDeck([...deckCards]);
    const drawnHand = shuffled.slice(0, newHandSize);
    const remainingLibrary = shuffled.slice(newHandSize);
    
    setHand(drawnHand);
    setLibrary(remainingLibrary);
    setMulligans(prev => prev + 1);
    setSimulations(prev => prev + 1);
  };

  const keepHand = () => {
    const keptHands = simulations - mulligans + 1;
    setKeepPercentage((keptHands / simulations) * 100);
    showSuccess('Hand Kept', `${hand.length} cards - mulligan count: ${mulligans}`);
  };

  const analyzeHand = () => {
    const lands = hand.filter(c => c.type_line.toLowerCase().includes('land')).length;
    const avgCMC = hand.reduce((sum, c) => sum + (c.cmc || 0), 0) / hand.length;
    
    let rating = 'Good';
    let color = 'text-emerald-600 dark:text-emerald-400';
    
    if (lands < 2 || lands > 5) {
      rating = 'Risky';
      color = 'text-yellow-600 dark:text-yellow-400';
    }
    if (lands < 1 || lands > 6) {
      rating = 'Bad';
      color = 'text-red-600 dark:text-red-400';
    }
    if (avgCMC > 4) {
      rating = lands >= 4 ? 'Slow' : 'Risky';
      color = 'text-yellow-600 dark:text-yellow-400';
    }

    return { rating, color, lands, avgCMC };
  };

  const analysis = analyzeHand();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Opening Hand Simulator
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={mulligan}
              disabled={hand.length <= 1}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Mulligan ({hand.length - 1})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={drawOpeningHand}
            >
              <Shuffle className="h-4 w-4 mr-2" />
              New Hand
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Statistics */}
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 rounded-lg border bg-card">
            <div className="text-2xl font-bold">{hand.length}</div>
            <div className="text-xs text-muted-foreground">Cards</div>
          </div>
          <div className="p-3 rounded-lg border bg-card">
            <div className="text-2xl font-bold">{analysis.lands}</div>
            <div className="text-xs text-muted-foreground">Lands</div>
          </div>
          <div className="p-3 rounded-lg border bg-card">
            <div className="text-2xl font-bold">{analysis.avgCMC.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground">Avg CMC</div>
          </div>
          <div className="p-3 rounded-lg border bg-card">
            <div className={`text-2xl font-bold ${analysis.color}`}>
              {analysis.rating}
            </div>
            <div className="text-xs text-muted-foreground">Rating</div>
          </div>
        </div>

        {/* Commander */}
        {commanderName && (
          <div className="p-3 rounded-lg border bg-primary/5 border-primary/20">
            <div className="flex items-center gap-2">
              <Badge className="bg-primary">Commander</Badge>
              <span className="font-medium">{commanderName}</span>
            </div>
          </div>
        )}

        {/* Hand Display */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <Label className="text-sm font-medium">Opening Hand</Label>
            <Button
              variant="default"
              size="sm"
              onClick={keepHand}
            >
              Keep Hand
            </Button>
          </div>
          
          {hand.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shuffle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Click "New Hand" to draw opening hand</p>
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {hand.map((card, index) => (
                <div
                  key={index}
                  className="aspect-[2.5/3.5] rounded border bg-card p-2 hover:shadow-lg transition-shadow"
                >
                  <div className="h-full flex flex-col justify-between text-xs">
                    <div>
                      <div className="font-medium line-clamp-2 mb-1">{card.name}</div>
                      {card.type_line.toLowerCase().includes('land') && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                          Land
                        </Badge>
                      )}
                    </div>
                    {card.cmc > 0 && (
                      <div className="text-right">
                        <Badge variant="outline" className="text-[10px] px-1 py-0">
                          {card.cmc}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Analysis */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Hand Quality Analysis</Label>
          
          <div className="p-3 rounded-lg border bg-card space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Land Ratio</span>
              <span className={analysis.lands >= 2 && analysis.lands <= 4 ? 'text-emerald-600 dark:text-emerald-400' : 'text-yellow-600 dark:text-yellow-400'}>
                {analysis.lands}/{hand.length} ({((analysis.lands / hand.length) * 100).toFixed(0)}%)
              </span>
            </div>
            <Progress 
              value={(analysis.lands / hand.length) * 100} 
              className="h-1.5"
            />
          </div>

          <div className="p-3 rounded-lg border bg-card space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Curve Smoothness</span>
              <span className={analysis.avgCMC <= 3 ? 'text-emerald-600 dark:text-emerald-400' : 'text-yellow-600 dark:text-yellow-400'}>
                {analysis.avgCMC.toFixed(1)} avg
              </span>
            </div>
            <Progress 
              value={Math.min(100, (5 - analysis.avgCMC) * 25)} 
              className="h-1.5"
            />
          </div>
        </div>

        {/* Simulation Stats */}
        {simulations > 0 && (
          <div className="p-3 rounded-lg border bg-muted/50 text-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total Hands Drawn:</span>
              <span className="font-medium">{simulations}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Mulligans This Game:</span>
              <span className="font-medium">{mulligans}</span>
            </div>
            {keepPercentage > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Keep Rate:</span>
                <span className="font-medium">{keepPercentage.toFixed(0)}%</span>
              </div>
            )}
          </div>
        )}

        {/* Tips */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong>Mulligan Guide:</strong></p>
          <ul className="list-disc list-inside space-y-0.5 ml-2">
            <li>Keep hands with 2-4 lands for most decks</li>
            <li>Consider your deck's average CMC</li>
            <li>Look for early game plays</li>
            <li>Mulligan aggressively in competitive games</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
