import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
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
  Activity,
  Heart,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  PlayCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import { useDashboardSummary, useFavoriteDecks, trackDeckOpen } from '@/features/dashboard/hooks';
import { asUSD, formatTimeAgo } from '@/features/dashboard/value';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

const Dashboard = () => {
  const { user } = useAuth();
  const { data: dashboardData, loading: dashboardLoading, error, refetch } = useDashboardSummary();
  const { favorites, loading: favoritesLoading, toggleFavorite } = useFavoriteDecks();

  const handleDeckClick = (deckId: string, name: string) => {
    trackDeckOpen(deckId, name);
  };

  const handleFavoriteToggle = async (deckId: string, deckName: string) => {
    try {
      await toggleFavorite(deckId);
      showSuccess('Favorite Updated', `${deckName} has been updated`);
    } catch (error) {
      showError('Failed to Update', 'Could not update favorite status');
    }
  };

  const getActivityLink = (activity: any) => {
    switch (activity.type) {
      case 'deck_created':
      case 'deck_updated':
      case 'deck_favorited':
        return `/deck-builder?deck=${activity.entity_id}`;
      case 'card_added':
      case 'collection_import':
        return '/collection';
      case 'wishlist_added':
        return '/wishlist';
      case 'listing_created':
        return '/collection?tab=listings';
      case 'ai_build_run':
        return '/deck-builder?tab=ai-builder';
      default:
        return '/decks';
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

  if (dashboardLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 p-3 md:p-6">
        <div className="max-w-7xl mx-auto space-y-4 md:space-y-8">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-8 md:h-10 w-64 md:w-96" />
              <Skeleton className="h-4 md:h-6 w-48 md:w-64" />
            </div>
            <Skeleton className="h-10 w-10 md:h-12 md:w-12 rounded-full" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {[1, 2, 3, 4].map(i => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-3 w-32 mt-2" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 p-3 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-8">
        {/* Welcome Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl md:text-4xl font-bold bg-gradient-to-r from-primary via-purple-500 to-blue-500 bg-clip-text text-transparent">
              Welcome back, Planeswalker! 🔥
            </h1>
            <p className="text-muted-foreground text-sm md:text-lg">
              Ready to dominate the battlefield? Your MTG command center awaits.
            </p>
          </div>
          <div className="flex items-center space-x-3 md:space-x-4">
            <Button
              variant="outline"
              size="sm"
              onClick={refetch}
              className="hidden md:flex"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Avatar className="h-10 w-10 md:h-12 md:w-12 ring-2 ring-primary/20">
              <AvatarImage src={user?.user_metadata?.avatar_url} />
              <AvatarFallback className="bg-gradient-to-br from-primary to-purple-500 text-white">
                {user?.email?.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20 hover:shadow-lg transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-700 dark:text-green-300">
                Collection Value
              </CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {asUSD(dashboardData?.collection.totalValueUSD)}
              </div>
              <p className="text-xs text-muted-foreground">
                {dashboardData?.collection.uniqueCards} unique cards 🃏
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
                {dashboardData?.collection.totalCards.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                {dashboardData?.collection.uniqueCards} unique cards 🃏
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
                {dashboardData?.decks.count}
              </div>
              <p className="text-xs text-muted-foreground">
                {dashboardData?.decks.favoritesCount} favorites ⭐
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-pink-500/10 to-rose-500/10 border-pink-500/20 hover:shadow-lg transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-pink-700 dark:text-pink-300">
                Wishlist Value
              </CardTitle>
              <Heart className="h-4 w-4 text-pink-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-pink-600">
                {asUSD(dashboardData?.wishlist.valueUSD)}
              </div>
              <p className="text-xs text-muted-foreground">
                {dashboardData?.wishlist.totalItems} items • {dashboardData?.wishlist.totalDesired} desired 💫
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6 flex items-center">
            <Zap className="h-5 w-5 md:h-6 md:w-6 mr-2 text-yellow-500" />
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
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

        {/* New Power Widgets Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {/* Build Queue */}
          <Card className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border-indigo-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center text-lg">
                <PlayCircle className="h-5 w-5 mr-2 text-indigo-500" />
                Build Queue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {dashboardData?.buildQueue.lastBuild ? (
                  <div className="text-sm">
                    <div className="font-medium">Last AI Build: {dashboardData.buildQueue.lastBuild.deckName}</div>
                    <div className="text-muted-foreground">
                      Power {dashboardData.buildQueue.lastBuild.power.toFixed(1)} • {formatTimeAgo(dashboardData.buildQueue.lastBuild.timestamp)}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No recent AI builds</div>
                )}
                <Link to="/deck-builder?tab=ai-builder">
                  <Button size="sm" className="w-full">
                    <Wand2 className="h-4 w-4 mr-2" />
                    Run AI Builder
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Last Opened */}
          <Card className="bg-gradient-to-br from-emerald-500/10 to-green-500/10 border-emerald-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center text-lg">
                <Clock className="h-5 w-5 mr-2 text-emerald-500" />
                Last Opened
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {dashboardData?.lastOpened.slice(0, 3).map((deck, index) => (
                  <div key={index} className="text-sm">
                    <div className="font-medium truncate">{deck.name}</div>
                    <div className="text-muted-foreground">{formatTimeAgo(deck.at)}</div>
                  </div>
                )) || (
                  <div className="text-sm text-muted-foreground">No recent decks</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Health Status */}
          <Card className="bg-gradient-to-br from-amber-500/10 to-yellow-500/10 border-amber-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center text-lg">
                <BarChart3 className="h-5 w-5 mr-2 text-amber-500" />
                Health Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center text-sm">
                  <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                  Database ✅
                </div>
                <div className="flex items-center text-sm">
                  <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                  API ✅
                </div>
                <div className="text-xs text-muted-foreground">
                  Scryfall sync: {dashboardData?.status.scryfallSyncAt ? formatTimeAgo(dashboardData.status.scryfallSyncAt) : 'Never'}
                </div>
                <Link to="/admin">
                  <Button variant="outline" size="sm" className="w-full mt-2">
                    View Details
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8">
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
                {favoritesLoading ? (
                  <div className="grid grid-cols-1 gap-4">
                    {[1, 2, 3, 4].map(i => (
                      <Card key={i} className="bg-muted/30">
                        <CardHeader className="pb-3">
                          <Skeleton className="h-6 w-32" />
                          <Skeleton className="h-4 w-24" />
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                ) : favorites.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4">
                    {favorites.map((deck, index) => (
                      <Card key={index} className="bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer group">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <Link 
                                to={`/deck-builder?deck=${deck.id}`}
                                onClick={() => handleDeckClick(deck.id, deck.name)}
                              >
                                <CardTitle className="text-lg group-hover:text-primary transition-colors">
                                  {deck.name}
                                </CardTitle>
                              </Link>
                              <div className="flex items-center space-x-2 text-sm text-muted-foreground mt-1">
                                <Badge variant="secondary" className="text-xs">
                                  {deck.format?.toUpperCase()}
                                </Badge>
                                <span>•</span>
                                <span>Power {deck.power_level}/10</span>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.preventDefault();
                                handleFavoriteToggle(deck.id, deck.name);
                              }}
                            >
                              <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                            </Button>
                          </div>
                          {deck.commanderArt && (
                            <div className="mt-2">
                              <img 
                                src={deck.commanderArt} 
                                alt="Commander"
                                className="w-full h-24 object-cover rounded"
                              />
                            </div>
                          )}
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
                   {dashboardData?.recent.length ? dashboardData.recent.map((activity, index) => (
                     <Link key={index} to={getActivityLink(activity)}>
                       <div className="flex items-center space-x-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
                         <div className="p-2 rounded-full bg-primary/10">
                           {activity.type === 'deck_created' && <Wand2 className="h-4 w-4 text-primary" />}
                           {activity.type === 'card_added' && <Package className="h-4 w-4 text-green-500" />}
                           {activity.type === 'deck_updated' && <Sparkles className="h-4 w-4 text-blue-500" />}
                           {activity.type === 'deck_favorited' && <Star className="h-4 w-4 text-yellow-500" />}
                           {activity.type === 'wishlist_added' && <Heart className="h-4 w-4 text-pink-500" />}
                           {activity.type === 'listing_created' && <DollarSign className="h-4 w-4 text-green-500" />}
                           {activity.type === 'ai_build_run' && <Zap className="h-4 w-4 text-purple-500" />}
                         </div>
                         <div className="flex-1">
                           <p className="text-sm font-medium">
                             {activity.title}
                           </p>
                           <p className="text-xs text-muted-foreground flex items-center">
                             <Clock className="h-3 w-3 mr-1" />
                             {formatTimeAgo(activity.at)}
                           </p>
                           {activity.subtitle && (
                             <p className="text-xs text-muted-foreground">
                               {activity.subtitle}
                             </p>
                           )}
                         </div>
                       </div>
                     </Link>
                  )) : (
                    <div className="text-center py-4">
                      <Activity className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">No recent activity</p>
                    </div>
                  )}
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
              <div className="text-center p-6 rounded-lg bg-gradient-to-br from-yellow-500/20 to-orange-500/20">
                <Trophy className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
                <div className="text-2xl font-bold text-yellow-600">Deck Master</div>
                <p className="text-sm text-muted-foreground">Built {dashboardData?.decks.count || 0} powerful decks</p>
              </div>
              <div className="text-center p-6 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20">
                <Package className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                <div className="text-2xl font-bold text-blue-600">Collector</div>
                <p className="text-sm text-muted-foreground">{dashboardData?.collection.totalCards || 0} cards collected</p>
              </div>
              <div className="text-center p-6 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20">
                <DollarSign className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <div className="text-2xl font-bold text-green-600">Investor</div>
                <p className="text-sm text-muted-foreground">{asUSD(dashboardData?.collection.totalValueUSD)} portfolio</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;