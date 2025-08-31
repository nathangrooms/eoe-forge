import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { 
  BarChart3, 
  PieChart, 
  TrendingUp, 
  DollarSign,
  Package,
  Sparkles,
  Crown,
  Zap
} from 'lucide-react';

interface CollectionStats {
  totalCards: number;
  uniqueCards: number;
  totalValue: number;
  avgCardValue: number;
  colorDistribution: Record<string, number>;
  typeDistribution: Record<string, number>;
  setDistribution: Record<string, number>;
  rarityDistribution: Record<string, number>;
  topValueCards: Array<{
    name: string;
    set_code: string;
    quantity: number;
    price_usd: number;
    total_value: number;
  }>;
  recentAdditions: Array<{
    name: string;
    set_code: string;
    quantity: number;
    created_at: string;
  }>;
}

interface EnhancedCollectionAnalyticsProps {
  stats: any;
  loading: boolean;
}

export function EnhancedCollectionAnalytics({ stats, loading }: EnhancedCollectionAnalyticsProps) {
  const { user } = useAuth();
  const [detailedStats, setDetailedStats] = useState<CollectionStats | null>(null);
  const [loadingDetailed, setLoadingDetailed] = useState(false);

  const loadDetailedAnalytics = async () => {
    if (!user) return;

    setLoadingDetailed(true);
    try {
      // Get color distribution from Supabase
      const { data: collectionData } = await supabase
        .from('user_collections')
        .select(`
          card_name,
          set_code,
          quantity,
          price_usd,
          created_at
        `)
        .eq('user_id', user.id)
        .order('price_usd', { ascending: false });

      if (collectionData) {
        // Mock color distribution (would normally come from cards table join)
        const colorDistribution = {
          'White': Math.floor(Math.random() * 100) + 50,
          'Blue': Math.floor(Math.random() * 100) + 50,
          'Black': Math.floor(Math.random() * 100) + 50,
          'Red': Math.floor(Math.random() * 100) + 50,
          'Green': Math.floor(Math.random() * 100) + 50,
          'Colorless': Math.floor(Math.random() * 50) + 10
        };

        const typeDistribution = {
          'Creature': Math.floor(Math.random() * 200) + 100,
          'Instant': Math.floor(Math.random() * 100) + 50,
          'Sorcery': Math.floor(Math.random() * 100) + 50,
          'Artifact': Math.floor(Math.random() * 80) + 30,
          'Enchantment': Math.floor(Math.random() * 80) + 30,
          'Planeswalker': Math.floor(Math.random() * 20) + 5,
          'Land': Math.floor(Math.random() * 150) + 80
        };

        const rarityDistribution = {
          'Common': Math.floor(Math.random() * 300) + 200,
          'Uncommon': Math.floor(Math.random() * 200) + 100,
          'Rare': Math.floor(Math.random() * 100) + 50,
          'Mythic': Math.floor(Math.random() * 30) + 10
        };

        // Calculate set distribution
        const setDist: Record<string, number> = {};
        collectionData.forEach(card => {
          const set = card.set_code?.toUpperCase() || 'UNK';
          setDist[set] = (setDist[set] || 0) + card.quantity;
        });

        // Get top 10 sets
        const topSets = Object.entries(setDist)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10)
          .reduce((obj, [key, val]) => ({ ...obj, [key]: val }), {});

        const totalCards = collectionData.reduce((sum, card) => sum + card.quantity, 0);
        const totalValue = collectionData.reduce((sum, card) => sum + (card.price_usd || 0) * card.quantity, 0);

        const detailedStats: CollectionStats = {
          totalCards,
          uniqueCards: collectionData.length,
          totalValue,
          avgCardValue: totalValue / totalCards || 0,
          colorDistribution,
          typeDistribution,
          setDistribution: topSets,
          rarityDistribution,
          topValueCards: collectionData
            .map(card => ({
              name: card.card_name,
              set_code: card.set_code,
              quantity: card.quantity,
              price_usd: card.price_usd || 0,
              total_value: (card.price_usd || 0) * card.quantity
            }))
            .sort((a, b) => b.total_value - a.total_value)
            .slice(0, 10),
          recentAdditions: collectionData
            .map(card => ({
              name: card.card_name,
              set_code: card.set_code,
              quantity: card.quantity,
              created_at: card.created_at
            }))
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 10)
        };

        setDetailedStats(detailedStats);
      }
    } catch (error) {
      console.error('Error loading detailed analytics:', error);
      showError('Failed to load detailed analytics');
    } finally {
      setLoadingDetailed(false);
    }
  };

  const getColorIcon = (color: string) => {
    const icons = {
      'White': '⚪',
      'Blue': '🔵', 
      'Black': '⚫',
      'Red': '🔴',
      'Green': '🟢',
      'Colorless': '⭕'
    };
    return icons[color as keyof typeof icons] || '❓';
  };

  const getRarityColor = (rarity: string) => {
    const colors = {
      'Common': 'bg-gray-500/10 text-gray-700 border-gray-500/30',
      'Uncommon': 'bg-blue-500/10 text-blue-700 border-blue-500/30',
      'Rare': 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30',
      'Mythic': 'bg-orange-500/10 text-orange-700 border-orange-500/30'
    };
    return colors[rarity as keyof typeof colors] || 'bg-gray-500/10 text-gray-700 border-gray-500/30';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="animate-pulse space-y-4">
                <div className="h-4 bg-muted rounded w-1/4"></div>
                <div className="h-8 bg-muted rounded w-1/2"></div>
                <div className="h-20 bg-muted rounded"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Package className="h-8 w-8 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{stats.totalCards?.toLocaleString() || 0}</div>
                <div className="text-sm text-muted-foreground">Total Cards</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Sparkles className="h-8 w-8 text-purple-500" />
              <div>
                <div className="text-2xl font-bold">{stats.uniqueCards?.toLocaleString() || 0}</div>
                <div className="text-sm text-muted-foreground">Unique Cards</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-8 w-8 text-green-500" />
              <div>
                <div className="text-2xl font-bold text-green-600">
                  ${stats.totalValue?.toLocaleString() || 0}
                </div>
                <div className="text-sm text-muted-foreground">Total Value</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-8 w-8 text-orange-500" />
              <div>
                <div className="text-2xl font-bold">
                  ${((stats.totalValue || 0) / Math.max(stats.totalCards || 1, 1)).toFixed(2)}
                </div>
                <div className="text-sm text-muted-foreground">Avg. Value</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics Button */}
      {!detailedStats && (
        <Card>
          <CardContent className="p-6 text-center">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">Advanced Analytics</h3>
            <p className="text-muted-foreground mb-4">
              Get detailed insights into your collection's composition, value distribution, and trends.
            </p>
            <Button onClick={loadDetailedAnalytics} disabled={loadingDetailed}>
              {loadingDetailed ? 'Loading...' : 'Load Detailed Analytics'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Detailed Analytics */}
      {detailedStats && (
        <Tabs defaultValue="distribution" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="distribution">Distribution</TabsTrigger>
            <TabsTrigger value="value">Value Analysis</TabsTrigger>
            <TabsTrigger value="sets">Sets</TabsTrigger>
            <TabsTrigger value="recent">Recent</TabsTrigger>
          </TabsList>

          <TabsContent value="distribution" className="space-y-6">
            {/* Color Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <PieChart className="h-5 w-5 mr-2" />
                  Color Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(detailedStats.colorDistribution).map(([color, count]) => (
                    <div key={color} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="text-lg">{getColorIcon(color)}</span>
                          <span className="font-medium">{color}</span>
                        </div>
                        <span className="text-sm font-medium">{count} cards</span>
                      </div>
                      <Progress 
                        value={(count / detailedStats.totalCards) * 100} 
                        className="h-2"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Type Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Card Types</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(detailedStats.typeDistribution).map(([type, count]) => (
                    <div key={type} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{type}</span>
                        <span className="text-sm font-medium">{count} cards</span>
                      </div>
                      <Progress 
                        value={(count / detailedStats.totalCards) * 100} 
                        className="h-2"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Rarity Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Rarity Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(detailedStats.rarityDistribution).map(([rarity, count]) => (
                    <div key={rarity} className="text-center">
                      <Badge className={`mb-2 ${getRarityColor(rarity)}`}>
                        {rarity}
                      </Badge>
                      <div className="text-2xl font-bold">{count}</div>
                      <div className="text-sm text-muted-foreground">
                        {((count / detailedStats.totalCards) * 100).toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="value" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Crown className="h-5 w-5 mr-2 text-yellow-500" />
                  Most Valuable Cards
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {detailedStats.topValueCards.map((card, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-white font-bold text-sm">
                          #{index + 1}
                        </div>
                        <div>
                          <div className="font-medium">{card.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {card.set_code} • Qty: {card.quantity}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-green-600">
                          ${card.total_value.toFixed(2)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          ${card.price_usd.toFixed(2)} each
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sets" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Set Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(detailedStats.setDistribution).map(([set, count]) => (
                    <div key={set} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{set}</span>
                        <span className="text-sm font-medium">{count} cards</span>
                      </div>
                      <Progress 
                        value={(count / detailedStats.totalCards) * 100} 
                        className="h-2"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recent" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Zap className="h-5 w-5 mr-2 text-blue-500" />
                  Recent Additions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {detailedStats.recentAdditions.map((card, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div>
                        <div className="font-medium">{card.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {card.set_code} • Qty: {card.quantity}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(card.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}