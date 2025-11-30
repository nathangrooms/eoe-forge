import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { 
  Sparkles,
  Package, 
  Search, 
  TrendingUp, 
  Layers,
  DollarSign,
  Heart,
  ArrowRight,
  Star,
  Brain,
  Wand2,
  Eye,
  Crown,
  BarChart3
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import { useDashboardSummary, useFavoriteDecks, trackDeckOpen } from '@/features/dashboard/hooks';
import { asUSD } from '@/features/dashboard/value';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { calculateBadgeProgress, getEarnedBadges, getInProgressBadges } from '@/lib/badges';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { KeyboardShortcutsPanel } from '@/components/dashboard/KeyboardShortcutsPanel';
import { SearchHistory } from '@/components/dashboard/SearchHistory';
import { DashboardErrorBoundary } from '@/components/dashboard/DashboardErrorBoundary';

// Lazy load heavy components for better initial load performance
const AIDeckRecommendations = lazy(() => import('@/components/dashboard/AIDeckRecommendations').then(m => ({ default: m.AIDeckRecommendations })));
const RecentActivity = lazy(() => import('@/components/dashboard/RecentActivity').then(m => ({ default: m.RecentActivity })));
const BadgesSection = lazy(() => import('@/components/dashboard/BadgeDisplay').then(m => ({ default: m.BadgesSection })));

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  useSessionTimeout();
  const { data: dashboardData, loading: dashboardLoading, error, refetch } = useDashboardSummary();
  const { favorites, loading: favoritesLoading, toggleFavorite } = useFavoriteDecks();

  // Calculate badge progress with null safety
  const badgeProgress = calculateBadgeProgress({
    decksCount: dashboardData?.decks?.count || 0,
    uniqueCards: dashboardData?.collection?.uniqueCards || 0,
    collectionValue: dashboardData?.collection?.totalValueUSD || 0,
    totalCards: dashboardData?.collection?.totalCards || 0,
  });
  const earnedBadges = getEarnedBadges(badgeProgress);
  const inProgressBadges = getInProgressBadges(badgeProgress);

  const handleDeckClick = (deckId: string, name: string) => {
    trackDeckOpen(deckId, name);
    navigate(`/deck-builder?deck=${deckId}`);
  };

  const handleFavoriteToggle = async (e: React.MouseEvent, deckId: string, deckName: string) => {
    e.stopPropagation();
    try {
      await toggleFavorite(deckId);
      showSuccess('Favorite Updated', `${deckName} has been updated`);
    } catch (error) {
      showError('Failed to Update', 'Could not update favorite status');
    }
  };

  const getColorIndicator = (colors: string[]) => {
    const colorMap: Record<string, string> = {
      W: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-400',
      U: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-400',
      B: 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-300',
      R: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-400',
      G: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-950 dark:text-green-400'
    };
    
    return (
      <div className="flex gap-1">
        {colors.slice(0, 5).map((color, index) => (
          <div 
            key={index}
            className={`w-3 h-3 rounded-full border ${colorMap[color] || 'bg-gray-200 border-gray-300'}`}
          />
        ))}
      </div>
    );
  };

  if (dashboardLoading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-10 w-96" />
              <Skeleton className="h-6 w-64" />
            </div>
            <Skeleton className="h-12 w-12 rounded-full" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Welcome Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                Welcome back, Planeswalker
              </span>
            </h1>
            <p className="text-muted-foreground">
              Your command center for deck building, collection management, and AI-powered insights
            </p>
          </div>
        </div>

        {/* AI Feature Strip */}
        <Card className="border-spacecraft/30 bg-gradient-to-r from-spacecraft/5 via-celestial/5 to-cosmic/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-cosmic flex items-center justify-center shadow-cosmic-glow">
                  <Brain className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    DeckMatrix AI Super Brain
                    <Badge variant="secondary" className="bg-spacecraft/20 text-spacecraft">
                      <Sparkles className="h-3 w-3 mr-1" />
                      Powered by Gemini
                    </Badge>
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Get expert analysis, deck optimization, and strategic insights powered by advanced AI
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Link to="/brain">
                  <Button variant="outline" className="border-spacecraft/30 hover:bg-spacecraft/10">
                    <Brain className="h-4 w-4 mr-2" />
                    Open AI Brain
                  </Button>
                </Link>
                <Link to="/deck-builder">
                  <Button className="bg-gradient-cosmic hover:opacity-90">
                    <Wand2 className="h-4 w-4 mr-2" />
                    AI Deck Builder
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="relative overflow-hidden hover:shadow-md transition-all group">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-station to-station/50" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Collection Value</CardTitle>
              <div className="p-2 rounded-lg bg-station/10">
                <DollarSign className="h-4 w-4 text-station" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{asUSD(dashboardData?.collection?.totalValueUSD)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {dashboardData?.collection?.uniqueCards || 0} unique cards
              </p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden hover:shadow-md transition-all group">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-spacecraft to-spacecraft/50" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Cards</CardTitle>
              <div className="p-2 rounded-lg bg-spacecraft/10">
                <Package className="h-4 w-4 text-spacecraft" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(dashboardData?.collection?.totalCards || 0).toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Physical collection
              </p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden hover:shadow-md transition-all group">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-warp to-warp/50" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Decks</CardTitle>
              <div className="p-2 rounded-lg bg-warp/10">
                <Layers className="h-4 w-4 text-warp" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboardData?.decks?.count || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {dashboardData?.decks?.favoritesCount || 0} favorites
              </p>
            </CardContent>
          </Card>

          <Link to="/wishlist">
            <Card className="relative overflow-hidden hover:shadow-md transition-all group cursor-pointer">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-void to-void/50" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Wishlist</CardTitle>
                <div className="p-2 rounded-lg bg-void/10">
                  <Heart className="h-4 w-4 text-void" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{asUSD(dashboardData?.wishlist?.valueUSD)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {dashboardData?.wishlist?.totalItems || 0} items desired
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Quick Actions Strip */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Jump into your most common workflows</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Link to="/deck-builder" className="group">
                <div className="relative overflow-hidden rounded-lg border bg-card hover:shadow-md transition-all">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-warp to-warp/50" />
                  <div className="p-4 pt-5 flex flex-col items-center gap-2">
                    <div className="p-3 rounded-lg bg-warp/10 group-hover:bg-warp/20 transition-colors">
                      <Wand2 className="h-5 w-5 text-warp" />
                    </div>
                    <span className="text-sm font-medium">Build Deck</span>
                  </div>
                </div>
              </Link>
              
              <Link to="/cards" className="group">
                <div className="relative overflow-hidden rounded-lg border bg-card hover:shadow-md transition-all">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-spacecraft to-spacecraft/50" />
                  <div className="p-4 pt-5 flex flex-col items-center gap-2">
                    <div className="p-3 rounded-lg bg-spacecraft/10 group-hover:bg-spacecraft/20 transition-colors">
                      <Search className="h-5 w-5 text-spacecraft" />
                    </div>
                    <span className="text-sm font-medium">Search Cards</span>
                  </div>
                </div>
              </Link>
              
              <Link to="/collection" className="group">
                <div className="relative overflow-hidden rounded-lg border bg-card hover:shadow-md transition-all">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-planet to-planet/50" />
                  <div className="p-4 pt-5 flex flex-col items-center gap-2">
                    <div className="p-3 rounded-lg bg-planet/10 group-hover:bg-planet/20 transition-colors">
                      <Package className="h-5 w-5 text-planet" />
                    </div>
                    <span className="text-sm font-medium">Collection</span>
                  </div>
                </div>
              </Link>
              
              <Link to="/brain" className="group">
                <div className="relative overflow-hidden rounded-lg border bg-card hover:shadow-md transition-all">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-cosmic" />
                  <div className="p-4 pt-5 flex flex-col items-center gap-2">
                    <div className="p-3 rounded-lg bg-gradient-cosmic group-hover:shadow-cosmic-glow transition-all">
                      <Brain className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <span className="text-sm font-medium">AI Brain</span>
                  </div>
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Favorite Decks */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-yellow-500" />
                  Favorite Decks
                </CardTitle>
                <CardDescription>Your most loved deck builds ready for battle</CardDescription>
              </div>
              <Link to="/decks">
                <Button variant="ghost" size="sm">
                  View All
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {favoritesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => (
                  <Card key={i} className="h-24">
                    <CardContent className="p-4">
                      <Skeleton className="h-16 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : favorites.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {favorites.slice(0, 8).map((deck) => (
                  <Card 
                    key={deck.id}
                    className="relative overflow-hidden hover:shadow-md transition-all cursor-pointer group"
                    onClick={() => handleDeckClick(deck.id, deck.name)}
                  >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-spacecraft via-warp to-spacecraft" />
                    {deck.commanderArt && (
                      <AspectRatio ratio={63 / 88} className="bg-muted/50 rounded-sm overflow-hidden">
                        <img
                          src={deck.commanderImage || deck.commanderArt}
                          alt={`${deck.name} commander`}
                          className="w-full h-full object-contain"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.src = '/placeholder.svg';
                            e.currentTarget.onerror = null;
                          }}
                        />
                      </AspectRatio>
                    )}
                    <CardContent className="p-4 pt-5">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium truncate text-sm group-hover:text-spacecraft transition-colors">
                            {deck.name}
                          </h4>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs border-spacecraft/30">
                              {deck.format}
                            </Badge>
                            {deck.format === 'commander' && (
                              <Crown className="h-3 w-3 text-station" />
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => handleFavoriteToggle(e, deck.id, deck.name)}
                        >
                          <Heart className="h-4 w-4 text-void fill-current" />
                        </Button>
                      </div>
                      
                      <div className="flex items-center justify-between mt-3">
                        {deck.colors.length > 0 && getColorIndicator(deck.colors)}
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <TrendingUp className="h-3 w-3 text-warp" />
                          Power {deck.power_level}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 border-2 border-dashed rounded-lg">
                <Star className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-medium mb-2">No Favorite Decks</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Star your favorite decks to see them here
                </p>
                <Link to="/decks">
                  <Button>
                    <Layers className="h-4 w-4 mr-2" />
                    Browse Decks
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Badge System */}
        <Suspense fallback={
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        }>
          <BadgesSection earnedBadges={earnedBadges} inProgressBadges={inProgressBadges} />
        </Suspense>

        {/* AI Deck Recommendations */}
        {dashboardData?.decks?.count > 0 && (
          <Suspense fallback={
            <Card>
              <CardContent className="p-6">
                <Skeleton className="h-48 w-full" />
              </CardContent>
            </Card>
          }>
            <AIDeckRecommendations 
              userDecks={favorites.map(d => ({
                id: d.id,
                name: d.name,
                format: d.format,
                colors: d.colors,
                power_level: d.power_level
              }))}
              collectionStats={{
                totalCards: dashboardData?.collection?.totalCards || 0,
                byColor: {}
              }}
            />
          </Suspense>
        )}

        {/* Search History */}
        <SearchHistory />

        {/* Keyboard Shortcuts Panel */}
        <KeyboardShortcutsPanel />

      </div>
    </div>
  );
};

// Wrap Dashboard with specialized error boundary
const DashboardWithErrorBoundary = () => (
  <DashboardErrorBoundary>
    <Dashboard />
  </DashboardErrorBoundary>
);

export default DashboardWithErrorBoundary;
