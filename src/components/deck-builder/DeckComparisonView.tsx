import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface DeckComparisonProps {
  deck1: {
    id: string;
    name: string;
    cards: Array<{ card_name: string; quantity: number }>;
    power_level: number;
    format: string;
  };
  deck2: {
    id: string;
    name: string;
    cards: Array<{ card_name: string; quantity: number }>;
    power_level: number;
    format: string;
  };
}

export const DeckComparisonView = ({ deck1, deck2 }: DeckComparisonProps) => {
  const [activeTab, setActiveTab] = useState('overview');

  // Calculate shared and unique cards
  const deck1CardNames = new Set(deck1.cards.map(c => c.card_name));
  const deck2CardNames = new Set(deck2.cards.map(c => c.card_name));
  
  const sharedCards = deck1.cards.filter(c => deck2CardNames.has(c.card_name));
  const uniqueToDeck1 = deck1.cards.filter(c => !deck2CardNames.has(c.card_name));
  const uniqueToDeck2 = deck2.cards.filter(c => !deck1CardNames.has(c.card_name));
  
  const totalCards1 = deck1.cards.reduce((sum, c) => sum + c.quantity, 0);
  const totalCards2 = deck2.cards.reduce((sum, c) => sum + c.quantity, 0);
  const sharedCount = sharedCards.reduce((sum, c) => sum + c.quantity, 0);
  const similarityPct = ((sharedCount / Math.max(totalCards1, totalCards2)) * 100).toFixed(1);

  const powerDiff = deck2.power_level - deck1.power_level;

  return (
    <div className="space-y-6">
      {/* Header Comparison */}
      <div className="grid grid-cols-3 gap-4 items-center">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{deck1.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Format:</span>
                <Badge variant="outline">{deck1.format}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cards:</span>
                <span className="font-medium">{totalCards1}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Power:</span>
                <span className="font-medium">{deck1.power_level}/10</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col items-center gap-2">
          <ArrowRight className="h-6 w-6 text-muted-foreground" />
          <div className="text-center">
            <div className="text-2xl font-bold">{similarityPct}%</div>
            <div className="text-xs text-muted-foreground">Similar</div>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{deck2.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Format:</span>
                <Badge variant="outline">{deck2.format}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cards:</span>
                <span className="font-medium">{totalCards2}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Power:</span>
                <div className="flex items-center gap-1">
                  <span className="font-medium">{deck2.power_level}/10</span>
                  {powerDiff > 0 && <TrendingUp className="h-3 w-3 text-green-500" />}
                  {powerDiff < 0 && <TrendingDown className="h-3 w-3 text-red-500" />}
                  {powerDiff === 0 && <Minus className="h-3 w-3 text-muted-foreground" />}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Comparison Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="shared">Shared ({sharedCards.length})</TabsTrigger>
          <TabsTrigger value="differences">Differences</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Shared Cards</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{sharedCards.length}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {sharedCount} total copies
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Unique to {deck1.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{uniqueToDeck1.length}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {uniqueToDeck1.reduce((sum, c) => sum + c.quantity, 0)} copies
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Unique to {deck2.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{uniqueToDeck2.length}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {uniqueToDeck2.reduce((sum, c) => sum + c.quantity, 0)} copies
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Power Level Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              {powerDiff === 0 && (
                <p className="text-sm">Both decks have the same power level.</p>
              )}
              {powerDiff > 0 && (
                <p className="text-sm">
                  <span className="font-medium">{deck2.name}</span> is approximately{' '}
                  <span className="font-bold text-green-500">{Math.abs(powerDiff)} points stronger</span>{' '}
                  than {deck1.name}.
                </p>
              )}
              {powerDiff < 0 && (
                <p className="text-sm">
                  <span className="font-medium">{deck1.name}</span> is approximately{' '}
                  <span className="font-bold text-green-500">{Math.abs(powerDiff)} points stronger</span>{' '}
                  than {deck2.name}.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shared" className="space-y-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Cards in Both Decks</CardTitle>
            </CardHeader>
            <CardContent>
              {sharedCards.length === 0 ? (
                <p className="text-sm text-muted-foreground">No shared cards</p>
              ) : (
                <div className="space-y-1 max-h-96 overflow-y-auto">
                  {sharedCards.map((card, idx) => {
                    const deck2Card = deck2.cards.find(c => c.card_name === card.card_name);
                    return (
                      <div key={idx} className="flex justify-between items-center py-2 border-b last:border-0">
                        <span className="text-sm">{card.card_name}</span>
                        <div className="flex gap-2 text-xs text-muted-foreground">
                          <span>{card.quantity}x</span>
                          <ArrowRight className="h-3 w-3" />
                          <span>{deck2Card?.quantity}x</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="differences" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Only in {deck1.name}</CardTitle>
              </CardHeader>
              <CardContent>
                {uniqueToDeck1.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No unique cards</p>
                ) : (
                  <div className="space-y-1 max-h-96 overflow-y-auto">
                    {uniqueToDeck1.map((card, idx) => (
                      <div key={idx} className="flex justify-between py-2 border-b last:border-0">
                        <span className="text-sm">{card.card_name}</span>
                        <span className="text-xs text-muted-foreground">{card.quantity}x</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Only in {deck2.name}</CardTitle>
              </CardHeader>
              <CardContent>
                {uniqueToDeck2.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No unique cards</p>
                ) : (
                  <div className="space-y-1 max-h-96 overflow-y-auto">
                    {uniqueToDeck2.map((card, idx) => (
                      <div key={idx} className="flex justify-between py-2 border-b last:border-0">
                        <span className="text-sm">{card.card_name}</span>
                        <span className="text-xs text-muted-foreground">{card.quantity}x</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
