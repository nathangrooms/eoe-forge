import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Shuffle, Play, RotateCcw, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { CardImage } from '@/components/cards/CardImage';
import { getBestCardImage } from '@/lib/scryfall/card-utils';
import { MetricRow } from '@/components/listing';
import { cn } from '@/lib/utils';

interface DeckCard {
  id: string;
  name: string;
  cmc: number;
  type_line: string;
  mana_cost?: string;
  image_uris?: {
    small?: string;
    normal?: string;
    large?: string;
  };
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

  /**
   * The read on the opening hand.
   *
   * ## Two things were broken here and neither was visible in a diff
   *
   * This returned a `color` that was interpolated into a class name —
   * ``bg-${quality.color}/5 border-${quality.color}/20`` — and Tailwind reads
   * source files for literal strings and cannot see a template. None of those
   * eight classes was ever generated, so the panel drew `p-3 rounded-lg border`
   * and nothing else: a bare hairline box, which is the one thing the design
   * law rules out, and the only styling on it was the part that should not have
   * been there.
   *
   * The same value was passed to `Badge variant=`, and two of the four values
   * it can take — `warning` and `success` — are not Badge variants and are not
   * tokens in this palette at all. A good hand and a risky hand both fell
   * through to the default badge, so the two states in the middle were
   * indistinguishable.
   *
   * `tone` is a literal class now, so Tailwind can see it, and it is monochrome
   * apart from `destructive`, which is the one reading that is a real warning.
   */
  const getHandQuality = (
    stats: HandStats
  ): { quality: string; tone: string; badge: 'secondary' | 'destructive'; message: string } => {
    const plain = { tone: 'bg-muted/40', badge: 'secondary' as const };
    const bad = { tone: 'bg-destructive/10', badge: 'destructive' as const };

    if (stats.lands < 2) {
      return { quality: 'Poor', ...bad, message: 'Too few lands, so this is likely a mulligan' };
    }
    if (stats.lands > 5) {
      return { quality: 'Poor', ...bad, message: 'Too many lands, so this is worth a mulligan' };
    }
    if (stats.lands === 2 && stats.avgCmc > 4) {
      return { quality: 'Risky', ...plain, message: 'Two lands under a high curve' };
    }
    if (stats.lands >= 3 && stats.lands <= 4) {
      return { quality: 'Good', ...plain, message: 'A keepable hand' };
    }
    return { quality: 'Average', ...plain, message: 'Borderline, and it depends on the deck' };
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
                    <div className={cn('rounded-lg p-3', quality.tone)}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold">Hand quality</span>
                        <Badge variant={quality.badge}>{quality.quality}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{quality.message}</p>
                    </div>
                  );
                })()}

                {/*
                  What is actually in the seven.

                  Four `text-2xl font-bold` figures on a `p-2 bg-muted` pad with
                  the label underneath — the deck folder's last hand-built metric
                  row, and it is the body of `/deck/:id/testhand`, so it was one
                  of the sub pages that had stopped matching the deck page.
                  `MetricRow` puts the label above the figure and the figure at
                  the weight every other figure in the product uses.

                  "Avg CMC" is "Avg mana value" now: the deck page's own tile
                  has said mana value since the merge, and the same number
                  reading two different names on two screens of the same deck is
                  the drift this pass is about. `on="card"` because this sits in
                  a raised panel.
                */}
                <MetricRow
                  on="card"
                  columns={4}
                  metrics={[
                    { id: 'lands', label: 'Lands', value: String(handStats.lands), raw: handStats.lands },
                    {
                      id: 'creatures',
                      label: 'Creatures',
                      value: String(handStats.creatures),
                      raw: handStats.creatures,
                    },
                    {
                      id: 'spells',
                      label: 'Spells',
                      value: String(handStats.spells),
                      raw: handStats.spells,
                    },
                    {
                      id: 'cmc',
                      label: 'Avg mana value',
                      value: handStats.avgCmc.toFixed(1),
                      raw: handStats.avgCmc,
                    },
                  ]}
                />

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

            {/* Hand Display - Visual Cards */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Cards in Hand ({hand.length})</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
                {hand.map((card, index) => {
                  /* `CardImage` renders the missing-image case itself (card-shaped,
                     card name centred), so the only thing the old hand-rolled
                     fallback block still owns is the mana value and the land
                     marker — kept, but only when there is no art to read them off. */
                  const hasArt = Boolean(getBestCardImage(card));
                  return (
                    <CardImage
                      key={`${card.id}-${index}`}
                      card={card}
                      size="md"
                      fill
                      interactive
                      title={card.name}
                    >
                      {!hasArt && (
                        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex flex-wrap items-center justify-center gap-1">
                          <Badge variant="outline" className="text-[10px]">
                            {card.cmc}
                          </Badge>
                          {isLand(card) && (
                            <Badge variant="secondary" className="text-[10px]">Land</Badge>
                          )}
                        </div>
                      )}
                    </CardImage>
                  );
                })}
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
