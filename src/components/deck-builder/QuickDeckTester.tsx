import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Shuffle, Play, RotateCcw, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

interface DeckCard {
  id: string;
  name: string;
  cmc: number;
  type_line: string;
  mana_cost?: string;
}

interface QuickDeckTesterProps {
  deck: DeckCard[];
}

interface HandStats {
  avgCmc: number;
  lands: number;
  creatures: number;
  spells: number;
  manaCurve: Record<number, number>;
}

export function QuickDeckTester({ deck }: QuickDeckTesterProps) {
  const [hand, setHand] = useState<DeckCard[]>([]);
  const [mulliganCount, setMulliganCount] = useState(0);
  const [handStats, setHandStats] = useState<HandStats | null>(null);

  const isLand = (card: DeckCard) => {
    return card.type_line.toLowerCase().includes('land');
  };

  const calculateHandStats = (cards: DeckCard[]): HandStats => {
    const lands = cards.filter(isLand).length;
    const nonLands = cards.filter(c => !isLand(c));
    const creatures = nonLands.filter(c => c.type_line.toLowerCase().includes('creature')).length;
    const spells = nonLands.length - creatures;
    
    const avgCmc = nonLands.length > 0
      ? nonLands.reduce((sum, c) => sum + c.cmc, 0) / nonLands.length
      : 0;

    const manaCurve: Record<number, number> = {};
    cards.forEach(card => {
      const cmc = Math.min(card.cmc, 7); // Cap at 7+
      manaCurve[cmc] = (manaCurve[cmc] || 0) + 1;
    });

    return { avgCmc, lands, creatures, spells, manaCurve };
  };

  const drawHand = (mulligan: boolean = false) => {
    if (deck.length < 7) {
      toast.error('Deck must have at least 7 cards to test');
      return;
    }

    // Shuffle deck
    const shuffled = [...deck].sort(() => Math.random() - 0.5);
    
    // Draw 7 cards (or 6 for mulligan)
    const handSize = mulligan ? Math.max(7 - mulliganCount - 1, 1) : 7;
    const newHand = shuffled.slice(0, handSize);
    
    setHand(newHand);
    setHandStats(calculateHandStats(newHand));
    
    if (mulligan) {
      setMulliganCount(prev => prev + 1);
      toast.info(`Mulligan ${mulliganCount + 1} - Drew ${handSize} cards`);
    } else {
      setMulliganCount(0);
      toast.success('Opening hand drawn!');
    }
  };

  const getHandQuality = (stats: HandStats): { quality: string; color: string; message: string } => {
    if (stats.lands < 2) {
      return { quality: 'Poor', color: 'destructive', message: 'Too few lands - likely mulligan' };
    }
    if (stats.lands > 5) {
      return { quality: 'Poor', color: 'destructive', message: 'Too many lands - consider mulligan' };
    }
    if (stats.lands === 2 && stats.avgCmc > 4) {
      return { quality: 'Risky', color: 'warning', message: 'Low lands with high curve' };
    }
    if (stats.lands >= 3 && stats.lands <= 4) {
      return { quality: 'Good', color: 'success', message: 'Keepable hand!' };
    }
    return { quality: 'Average', color: 'secondary', message: 'Borderline - consider your deck strategy' };
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Quick Deck Tester
          </CardTitle>
          <div className="flex gap-2">
            <Button
              onClick={() => drawHand(false)}
              size="sm"
              variant="outline"
            >
              <Shuffle className="h-4 w-4 mr-2" />
              Draw Hand
            </Button>
            {hand.length > 0 && (
              <Button
                onClick={() => drawHand(true)}
                size="sm"
                variant="secondary"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Mulligan
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {hand.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Click "Draw Hand" to test your opening hand</p>
          </div>
        ) : (
          <>
            {/* Hand Quality */}
            {handStats && (
              <div className="space-y-2">
                {(() => {
                  const quality = getHandQuality(handStats);
                  return (
                    <div className={`p-3 rounded-lg border bg-${quality.color}/5 border-${quality.color}/20`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold">Hand Quality</span>
                        <Badge variant={quality.color as any}>{quality.quality}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{quality.message}</p>
                    </div>
                  );
                })()}

                {/* Stats Grid */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="text-center p-2 bg-muted rounded">
                    <p className="text-2xl font-bold">{handStats.lands}</p>
                    <p className="text-xs text-muted-foreground">Lands</p>
                  </div>
                  <div className="text-center p-2 bg-muted rounded">
                    <p className="text-2xl font-bold">{handStats.creatures}</p>
                    <p className="text-xs text-muted-foreground">Creatures</p>
                  </div>
                  <div className="text-center p-2 bg-muted rounded">
                    <p className="text-2xl font-bold">{handStats.spells}</p>
                    <p className="text-xs text-muted-foreground">Spells</p>
                  </div>
                  <div className="text-center p-2 bg-muted rounded">
                    <p className="text-2xl font-bold">{handStats.avgCmc.toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground">Avg CMC</p>
                  </div>
                </div>

                {/* Mana Curve in Hand */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Mana Curve in Hand</p>
                  {[0, 1, 2, 3, 4, 5, 6, 7].map(cmc => (
                    <div key={cmc} className="flex items-center gap-2">
                      <span className="text-xs w-8">{cmc}{cmc === 7 ? '+' : ''}</span>
                      <Progress 
                        value={(handStats.manaCurve[cmc] || 0) * 14.28} 
                        className="flex-1 h-2"
                      />
                      <span className="text-xs w-4">{handStats.manaCurve[cmc] || 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hand Display */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Cards in Hand ({hand.length})</p>
              <div className="grid grid-cols-1 gap-1">
                {hand.map((card, index) => (
                  <div 
                    key={`${card.id}-${index}`}
                    className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm"
                  >
                    <span className="truncate flex-1">{card.name}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {card.cmc}
                      </Badge>
                      {isLand(card) && (
                        <Badge variant="secondary" className="text-xs">Land</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {mulliganCount > 0 && (
              <p className="text-sm text-muted-foreground text-center">
                Mulligans: {mulliganCount}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
