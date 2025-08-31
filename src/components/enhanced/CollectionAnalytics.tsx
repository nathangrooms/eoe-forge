import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  Package, 
  Crown,
  Sparkles,
  Target
} from 'lucide-react';

interface CollectionCard {
  id: string;
  name: string;
  setCode: string;
  quantity: number;
  foil: number;
  condition: string;
  priceUsd?: number;
  cmc: number;
  type_line: string;
  colors: string[];
  color_identity: string[];
  rarity: string;
  cards?: {
    prices?: {
      usd?: string;
      usd_foil?: string;
    };
  };
}

interface CollectionAnalyticsProps {
  cards: CollectionCard[];
  loading?: boolean;
}

export function CollectionAnalytics({ cards = [], loading = false }: CollectionAnalyticsProps) {
  const analytics = useMemo(() => {
    if (!cards.length) {
      return {
        totalValue: 0,
        totalCards: 0,
        uniqueCards: 0,
        averageCmc: 0,
        colorDistribution: {},
        typeDistribution: {},
        rarityDistribution: {},
        setDistribution: {},
        topValueCards: [],
        recentlyAdded: []
      };
    }

    const totalCards = cards.reduce((sum, card) => sum + card.quantity + card.foil, 0);
    const uniqueCards = cards.length;
    
    const totalValue = cards.reduce((sum, card) => {
      const regularPrice = parseFloat(card.cards?.prices?.usd || card.priceUsd?.toString() || '0');
      const foilPrice = parseFloat(card.cards?.prices?.usd_foil || '0');
      return sum + (regularPrice * card.quantity) + (foilPrice * card.foil);
    }, 0);

    const totalCmc = cards.reduce((sum, card) => sum + (card.cmc * (card.quantity + card.foil)), 0);
    const averageCmc = totalCards > 0 ? totalCmc / totalCards : 0;

    // Color distribution
    const colorDistribution: Record<string, number> = {};
    cards.forEach(card => {
      if (card.colors.length === 0) {
        colorDistribution['Colorless'] = (colorDistribution['Colorless'] || 0) + card.quantity + card.foil;
      } else {
        card.colors.forEach(color => {
          const colorName = {
            'W': 'White',
            'U': 'Blue', 
            'B': 'Black',
            'R': 'Red',
            'G': 'Green'
          }[color] || color;
          colorDistribution[colorName] = (colorDistribution[colorName] || 0) + card.quantity + card.foil;
        });
      }
    });

    // Type distribution
    const typeDistribution: Record<string, number> = {};
    cards.forEach(card => {
      const primaryType = card.type_line.split(' ')[0] || 'Unknown';
      typeDistribution[primaryType] = (typeDistribution[primaryType] || 0) + card.quantity + card.foil;
    });

    // Rarity distribution
    const rarityDistribution: Record<string, number> = {};
    cards.forEach(card => {
      const rarity = card.rarity || 'common';
      rarityDistribution[rarity] = (rarityDistribution[rarity] || 0) + card.quantity + card.foil;
    });

    // Set distribution
    const setDistribution: Record<string, number> = {};
    cards.forEach(card => {
      setDistribution[card.setCode] = (setDistribution[card.setCode] || 0) + card.quantity + card.foil;
    });

    // Top value cards
    const topValueCards = cards
      .map(card => ({
        ...card,
        totalValue: (parseFloat(card.cards?.prices?.usd || card.priceUsd?.toString() || '0') * card.quantity) +
                   (parseFloat(card.cards?.prices?.usd_foil || '0') * card.foil)
      }))
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 10);

    return {
      totalValue,
      totalCards,
      uniqueCards,
      averageCmc,
      colorDistribution,
      typeDistribution,
      rarityDistribution,
      setDistribution,
      topValueCards,
      recentlyAdded: cards.slice(0, 5)
    };
  }, [cards]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-2">
                  <div className="h-4 bg-muted rounded w-20"></div>
                  <div className="h-8 bg-muted rounded w-16"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const renderDistributionChart = (data: Record<string, number>, title: string, icon: React.ReactNode) => {
    const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxValue = Math.max(...entries.map(([, value]) => value));

    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {entries.map(([key, value]) => (
            <div key={key} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="capitalize">{key}</span>
                <span className="font-medium">{value}</span>
              </div>
              <Progress value={(value / maxValue) * 100} className="h-2" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Value</p>
                <p className="text-2xl font-bold text-green-600">
                  ${analytics.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Cards</p>
                <p className="text-2xl font-bold">{analytics.totalCards.toLocaleString()}</p>
              </div>
              <Package className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Unique Cards</p>
                <p className="text-2xl font-bold">{analytics.uniqueCards.toLocaleString()}</p>
              </div>
              <Sparkles className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg CMC</p>
                <p className="text-2xl font-bold">{analytics.averageCmc.toFixed(1)}</p>
              </div>
              <Target className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Distribution Charts */}
      <Tabs defaultValue="colors" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="colors">Colors</TabsTrigger>
          <TabsTrigger value="types">Types</TabsTrigger>
          <TabsTrigger value="rarity">Rarity</TabsTrigger>
          <TabsTrigger value="sets">Sets</TabsTrigger>
        </TabsList>

        <TabsContent value="colors" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {renderDistributionChart(
              analytics.colorDistribution, 
              'Color Distribution', 
              <div className="w-4 h-4 rounded-full bg-gradient-to-r from-red-500 via-blue-500 to-green-500" />
            )}
            
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Crown className="h-4 w-4" />
                  Top Value Cards
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analytics.topValueCards.map((card, index) => (
                    <div key={card.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="w-6 h-6 rounded-full p-0 flex items-center justify-center text-xs">
                          {index + 1}
                        </Badge>
                        <div>
                          <p className="font-medium text-sm">{card.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {card.quantity + card.foil}x • {card.setCode.toUpperCase()}
                          </p>
                        </div>
                      </div>
                      <span className="font-medium text-green-600">
                        ${card.totalValue.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="types" className="space-y-4">
          {renderDistributionChart(
            analytics.typeDistribution,
            'Type Distribution',
            <BarChart3 className="h-4 w-4" />
          )}
        </TabsContent>

        <TabsContent value="rarity" className="space-y-4">
          {renderDistributionChart(
            analytics.rarityDistribution,
            'Rarity Distribution',
            <TrendingUp className="h-4 w-4" />
          )}
        </TabsContent>

        <TabsContent value="sets" className="space-y-4">
          {renderDistributionChart(
            analytics.setDistribution,
            'Set Distribution',
            <Package className="h-4 w-4" />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}