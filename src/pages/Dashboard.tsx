import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Wand2, 
  Package, 
  Search, 
  TrendingUp, 
  Crown, 
  Sparkles, 
  Zap, 
  Target,
  BarChart3,
  DollarSign,
  Layers,
  Trophy,
  Clock,
  Plus,
  ArrowRight,
  Star,
  Activity
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useCollectionStore } from '@/stores/collectionStore';
import { useDeckStore } from '@/stores/deckStore';

interface DashboardStats {
  collectionValue: number;
  totalCards: number;
  totalDecks: number;
  favoriteDecks: any[];
  recentActivity: any[];
  weeklyProgress: number;
}

const Dashboard = () => {
  const { user } = useAuth();
  const { calculateCollectionValue, totalCards, getTopValueCards } = useCollectionStore();
  const { name: currentDeckName, totalCards: deckCards } = useDeckStore();
  
  const [stats, setStats] = useState<DashboardStats>({
    collectionValue: 0,
    totalCards: 0,
    totalDecks: 0,
    favoriteDecks: [],
    recentActivity: [],
    weeklyProgress: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, [user]);

  const loadDashboardData = async () => {
    if (!user) return;
    
    try {
      // Load collection stats
      const collectionValue = calculateCollectionValue();
      const collectionCards = totalCards;
      
      // Load user decks
      const { data: userDecks } = await supabase
        .from('user_decks')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      // Load favorite decks
      const { data: favorites } = await supabase
        .from('favorite_decks')
        .select(`
          deck_id,
          user_decks (
            id,
            name,
            format,
            colors,
            power_level,
            updated_at
          )
        `)
        .eq('user_id', user.id)
        .limit(6);

      // Calculate weekly progress (mock data for now)
      const weeklyProgress = Math.floor(Math.random() * 40) + 20;

      setStats({
        collectionValue,
        totalCards: collectionCards,
        totalDecks: userDecks?.length || 0,
        favoriteDecks: favorites?.map(f => f.user_decks).filter(Boolean) || [],
        recentActivity: [
          { type: 'deck_created', name: 'Simic Ramp', time: '2 hours ago' },
          { type: 'cards_added', count: 12, time: '1 day ago' },
          { type: 'deck_updated', name: 'Aggro Red', time: '3 days ago' }
        ],
        weeklyProgress
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const quickActions = [
    {
      title: 'AI Deck Builder',
      description: 'Build optimized decks with AI',
      icon: Wand2,
      color: 'from-purple-500 to-indigo-500',
      link: '/deck-builder',
      badge: 'Smart'
    },
    {
      title: 'Card Search',
      description: 'Find any Magic card',
      icon: Search,
      color: 'from-blue-500 to-cyan-500',
      link: '/cards',
      badge: 'Fast'
    },
    {
      title: 'Collection',
      description: 'Manage your cards',
      icon: Package,
      color: 'from-green-500 to-emerald-500',
      link: '/collection',
      badge: 'Organize'
    },
    {
      title: 'My Decks',
      description: 'View all your decks',
      icon: Layers,
      color: 'from-orange-500 to-red-500',
      link: '/decks',
      badge: 'Compete'
    }
  ];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const getColorIndicator = (colors: string[]) => {
    if (!colors || colors.length === 0) return '⚪';
    return colors.map(color => {
      switch (color) {
        case 'W': return '⚪';
        case 'U': return '🔵';
        case 'B': return '⚫';
        case 'R': return '🔴';
        case 'G': return '🟢';
        default: return '⚪';
      }
    }).join('');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Welcome Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-500 to-blue-500 bg-clip-text text-transparent">
              Welcome back, Planeswalker! 🔥
            </h1>
            <p className="text-muted-foreground text-lg">
              Ready to dominate the battlefield? Your MTG command center awaits.
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <Avatar className="h-12 w-12 ring-2 ring-primary/20">
              <AvatarImage src={user?.user_metadata?.avatar_url} />
              <AvatarFallback className="bg-gradient-to-br from-primary to-purple-500 text-white">
                {user?.email?.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20 hover:shadow-lg transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-700 dark:text-green-300">
                Collection Value
              </CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(stats.collectionValue)}
              </div>
              <p className="text-xs text-muted-foreground">
                +12% from last month 📈
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20 hover:shadow-lg transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-300">
                Total Cards
              </CardTitle>
              <Package className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {stats.totalCards.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                Across {stats.totalDecks} decks 🃏
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/10 to-indigo-500/10 border-purple-500/20 hover:shadow-lg transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-purple-700 dark:text-purple-300">
                Active Decks
              </CardTitle>
              <Layers className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                {stats.totalDecks}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats.favoriteDecks.length} favorites ⭐
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-500/10 to-red-500/10 border-orange-500/20 hover:shadow-lg transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-300">
                Weekly Progress
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {stats.weeklyProgress}%
              </div>
              <Progress value={stats.weeklyProgress} className="mt-2" />
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-2xl font-bold mb-6 flex items-center">
            <Zap className="h-6 w-6 mr-2 text-yellow-500" />
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {quickActions.map((action, index) => (
              <Link key={index} to={action.link}>
                <Card className="group hover:shadow-xl transition-all duration-300 hover:scale-105 cursor-pointer overflow-hidden">
                  <div className={`h-2 bg-gradient-to-r ${action.color}`} />
                  <CardHeader className="text-center">
                    <div className="flex justify-center mb-4">
                      <div className={`p-3 rounded-full bg-gradient-to-r ${action.color} shadow-lg`}>
                        <action.icon className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    <CardTitle className="text-lg group-hover:text-primary transition-colors">
                      {action.title}
                    </CardTitle>
                    <CardDescription className="text-sm">
                      {action.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-center">
                    <Badge variant="secondary" className="text-xs">
                      {action.badge}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Favorite Decks */}
          <div className="lg:col-span-2">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center text-xl">
                  <Star className="h-5 w-5 mr-2 text-yellow-500" />
                  Favorite Decks
                </CardTitle>
                <CardDescription>
                  Your most loved deck builds ready for battle
                </CardDescription>
              </CardHeader>
              <CardContent>
                {stats.favoriteDecks.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {stats.favoriteDecks.map((deck, index) => (
                      <Card key={index} className="bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg">
                              {deck.name}
                            </CardTitle>
                            <Badge variant="outline">
                              {getColorIndicator(deck.colors)}
                            </Badge>
                          </div>
                          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                            <Badge variant="secondary" className="text-xs">
                              {deck.format?.toUpperCase()}
                            </Badge>
                            <span>•</span>
                            <span>Power {deck.power_level}/10</span>
                          </div>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Crown className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">
                      No favorite decks yet. Start building some epic decks!
                    </p>
                    <Link to="/deck-builder">
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Build Your First Deck
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <div>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center text-xl">
                  <Activity className="h-5 w-5 mr-2 text-blue-500" />
                  Recent Activity
                </CardTitle>
                <CardDescription>
                  Your latest MTG achievements
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stats.recentActivity.map((activity, index) => (
                    <div key={index} className="flex items-center space-x-3 p-3 rounded-lg bg-muted/30">
                      <div className="p-2 rounded-full bg-primary/10">
                        {activity.type === 'deck_created' && <Wand2 className="h-4 w-4 text-primary" />}
                        {activity.type === 'cards_added' && <Package className="h-4 w-4 text-green-500" />}
                        {activity.type === 'deck_updated' && <Sparkles className="h-4 w-4 text-blue-500" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {activity.type === 'deck_created' && `Created "${activity.name}"`}
                          {activity.type === 'cards_added' && `Added ${activity.count} cards`}
                          {activity.type === 'deck_updated' && `Updated "${activity.name}"`}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center">
                          <Clock className="h-3 w-3 mr-1" />
                          {activity.time}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-4 border-t">
                  <Link to="/decks">
                    <Button variant="outline" className="w-full">
                      View All Activity
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Gaming Achievement Section */}
        <Card className="bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-green-500/10 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center text-2xl">
              <Trophy className="h-6 w-6 mr-2 text-yellow-500" />
              Planeswalker Status
            </CardTitle>
            <CardDescription className="text-lg">
              Level up your MTG mastery with every deck you build! 🎮
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-6 rounded-lg bg-gradient-to-br from-yellow-500/20 to-orange-500/20">
                <Trophy className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
                <div className="text-2xl font-bold text-yellow-600">Deck Master</div>
                <p className="text-sm text-muted-foreground">Built {stats.totalDecks} powerful decks</p>
              </div>
              <div className="text-center p-6 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20">
                <Package className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                <div className="text-2xl font-bold text-blue-600">Collector</div>
                <p className="text-sm text-muted-foreground">{stats.totalCards} cards collected</p>
              </div>
              <div className="text-center p-6 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20">
                <DollarSign className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <div className="text-2xl font-bold text-green-600">Investor</div>
                <p className="text-sm text-muted-foreground">{formatCurrency(stats.collectionValue)} portfolio</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;