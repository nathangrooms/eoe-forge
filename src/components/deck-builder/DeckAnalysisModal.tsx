import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart3, 
  Zap, 
  Shield, 
  TrendingUp, 
  Search, 
  Target, 
  Crown, 
  Repeat,
  Edit
} from 'lucide-react';
import { DeckSummary } from '@/lib/api/deckAPI';

interface DeckAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  deckSummary: DeckSummary;
  onOpenBuilder?: () => void;
}

export function DeckAnalysisModal({ 
  isOpen, 
  onClose, 
  deckSummary,
  onOpenBuilder 
}: DeckAnalysisModalProps) {
  const [activeTab, setActiveTab] = useState('power');

  const powerBandColor = {
    casual: 'bg-green-500/20 text-green-400 border-green-500/30',
    mid: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    cEDH: 'bg-red-500/20 text-red-400 border-red-500/30'
  };

  const curveData = Object.entries(deckSummary.curve.bins).map(([cmc, count]) => ({
    cmc,
    count
  }));

  const maxCurveCount = Math.max(...Object.values(deckSummary.curve.bins).map(v => Number(v)));

  const typeData = [
    { type: 'Lands', count: deckSummary.counts.lands, color: 'bg-amber-500' },
    { type: 'Creatures', count: deckSummary.counts.creatures, color: 'bg-green-500' },
    { type: 'Instants', count: deckSummary.counts.instants, color: 'bg-blue-500' },
    { type: 'Sorceries', count: deckSummary.counts.sorceries, color: 'bg-red-500' },
    { type: 'Artifacts', count: deckSummary.counts.artifacts, color: 'bg-gray-500' },
    { type: 'Enchantments', count: deckSummary.counts.enchantments, color: 'bg-purple-500' },
    { type: 'Planeswalkers', count: deckSummary.counts.planeswalkers, color: 'bg-pink-500' },
  ].filter(item => Number(item.count) > 0);

  const manaSourceData = Object.entries(deckSummary.mana.sources)
    .filter(([_, count]) => Number(count) > 0)
    .map(([color, count]) => ({
      color,
      count: Number(count),
      percentage: (Number(count) / deckSummary.counts.total * 100).toFixed(1)
    }));

  const colorNames = {
    W: 'White',
    U: 'Blue', 
    B: 'Black',
    R: 'Red',
    G: 'Green',
    C: 'Colorless'
  };

  // Mock power subscores - would be computed by the power engine
  const powerSubscores = [
    { name: 'Speed', score: 7.2, icon: Zap, description: 'How quickly the deck wins' },
    { name: 'Interaction', score: 6.8, icon: Shield, description: 'Ability to disrupt opponents' },
    { name: 'Card Advantage', score: 8.1, icon: TrendingUp, description: 'Drawing extra cards' },
    { name: 'Tutors', score: 5.4, icon: Search, description: 'Finding key pieces' },
    { name: 'Wincons', score: 7.9, icon: Target, description: 'Ways to close out games' },
    { name: 'Resilience', score: 6.2, icon: Repeat, description: 'Recovering from setbacks' }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl">{deckSummary.name} Analysis</DialogTitle>
              <div className="flex items-center gap-2 mt-2">
                <Badge className={powerBandColor[deckSummary.power.band]}>
                  {deckSummary.power.band.toUpperCase()}
                </Badge>
                <Badge variant="outline">{deckSummary.format}</Badge>
                <span className="text-sm text-muted-foreground">
                  Power Level: {deckSummary.power.score}/10
                </span>
              </div>
            </div>
            {onOpenBuilder && (
              <Button onClick={onOpenBuilder}>
                <Edit className="h-4 w-4 mr-2" />
                Open in Builder
              </Button>
            )}
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="power">Power Analysis</TabsTrigger>
            <TabsTrigger value="curve">Mana Curve</TabsTrigger>
            <TabsTrigger value="types">Type Distribution</TabsTrigger>
            <TabsTrigger value="mana">Mana Base</TabsTrigger>
          </TabsList>

          <TabsContent value="power" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {powerSubscores.map((subscore) => {
                const IconComponent = subscore.icon;
                return (
                  <Card key={subscore.name}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <IconComponent className="h-5 w-5 text-primary" />
                        <CardTitle className="text-lg">{subscore.name}</CardTitle>
                        <Badge variant="outline" className="ml-auto">
                          {subscore.score}/10
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Progress value={subscore.score * 10} className="mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {subscore.description}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Power Drivers & Drags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-green-400 mb-2">Power Drivers</h4>
                    {deckSummary.power.drivers.length > 0 ? (
                      <ul className="space-y-1">
                        {deckSummary.power.drivers.map((driver, index) => (
                          <li key={index} className="text-sm">• {driver}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Analysis will show cards that increase power level
                      </p>
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium text-red-400 mb-2">Power Drags</h4>
                    {deckSummary.power.drags.length > 0 ? (
                      <ul className="space-y-1">
                        {deckSummary.power.drags.map((drag, index) => (
                          <li key={index} className="text-sm">• {drag}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Analysis will show cards that decrease power level
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="curve" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Mana Curve
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {curveData.map(({ cmc, count }) => (
                    <div key={cmc} className="flex items-center gap-3">
                      <div className="w-12 text-sm font-mono">{cmc}</div>
                      <div className="flex-1 bg-muted rounded-full h-6 relative">
                        <div 
                          className="bg-primary rounded-full h-6 transition-all duration-300 flex items-center justify-end pr-2"
                          style={{ width: `${(Number(count) / Math.max(maxCurveCount, 1)) * 100}%` }}
                        >
                          {Number(count) > 0 && (
                            <span className="text-xs font-medium text-primary-foreground">
                              {count}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 text-sm text-muted-foreground">
                  <p>Total: {deckSummary.counts.total} cards</p>
                  <p>Average CMC: {(Object.entries(deckSummary.curve.bins).reduce((sum, [cmc, count]) => {
                    const cmcValue = cmc === '0-1' ? 0.5 : cmc === '6-7' ? 6.5 : cmc === '8-9' ? 8.5 : cmc === '10+' ? 10 : parseInt(cmc);
                    return sum + (cmcValue * Number(count));
                  }, 0) / deckSummary.counts.total).toFixed(1)}</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="types" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Card Type Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {typeData.map((type) => (
                    <div key={type.type} className="flex items-center gap-3">
                      <div className="w-20 text-sm">{type.type}</div>
                      <div className="flex-1 bg-muted rounded-full h-6 relative">
                        <div 
                          className={`${type.color} rounded-full h-6 transition-all duration-300 flex items-center justify-end pr-2`}
                          style={{ width: `${(type.count / deckSummary.counts.total) * 100}%` }}
                        >
                          <span className="text-xs font-medium text-primary-foreground">
                            {type.count}
                          </span>
                        </div>
                      </div>
                      <div className="w-12 text-xs text-muted-foreground">
                        {((type.count / deckSummary.counts.total) * 100).toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="mana" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Mana Sources</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {manaSourceData.map(({ color, count, percentage }) => (
                      <div key={color} className="flex items-center gap-3">
                        <div className="w-16 text-sm">{colorNames[color as keyof typeof colorNames]}</div>
                        <div className="flex-1 bg-muted rounded-full h-6 relative">
                          <div 
                            className="bg-primary rounded-full h-6 transition-all duration-300 flex items-center justify-end pr-2"
                            style={{ width: `${percentage}%` }}
                          >
                            <span className="text-xs font-medium text-primary-foreground">
                              {count}
                            </span>
                          </div>
                        </div>
                        <div className="w-12 text-xs text-muted-foreground">
                          {percentage}%
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Mana Consistency</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm">Turn 1 Untapped</span>
                      <span className="text-sm font-medium">
                        {deckSummary.mana.untappedPctByTurn.t1}%
                      </span>
                    </div>
                    <Progress value={deckSummary.mana.untappedPctByTurn.t1} />
                    
                    <div className="flex justify-between">
                      <span className="text-sm">Turn 2 Untapped</span>
                      <span className="text-sm font-medium">
                        {deckSummary.mana.untappedPctByTurn.t2}%
                      </span>
                    </div>
                    <Progress value={deckSummary.mana.untappedPctByTurn.t2} />
                    
                    <div className="flex justify-between">
                      <span className="text-sm">Turn 3 Untapped</span>
                      <span className="text-sm font-medium">
                        {deckSummary.mana.untappedPctByTurn.t3}%
                      </span>
                    </div>
                    <Progress value={deckSummary.mana.untappedPctByTurn.t3} />
                  </div>
                  
                  <div className="mt-4 p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">
                      Percentage chance of having untapped mana available on each turn.
                      Higher percentages indicate better mana consistency.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {deckSummary.legality.issues.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-red-400">Legality Issues</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {deckSummary.legality.issues.map((issue, index) => (
                      <li key={index} className="text-sm text-red-400">• {issue}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}