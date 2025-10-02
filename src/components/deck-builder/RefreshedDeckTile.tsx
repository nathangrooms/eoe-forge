import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Star, 
  StarOff, 
  Edit, 
  Trash2, 
  Copy, 
  BarChart3, 
  DollarSign, 
  TrendingUp,
  Crown,
  Target,
  Package,
  AlertTriangle,
  Box,
  Download,
  Calendar,
  Plus,
  ShoppingCart,
  Share2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DeckSummary, DeckAPI } from '@/lib/api/deckAPI';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { supabase } from '@/integrations/supabase/client';

interface RefreshedDeckTileProps {
  deckSummary: DeckSummary;
  onEdit?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onAnalysis?: () => void;
  onMissingCards?: () => void;
  onExport?: () => void;
  onDeckbox?: () => void;
  onFavoriteChange?: () => void;
  onShare?: () => void;
  className?: string;
}

export function RefreshedDeckTile({
  deckSummary,
  onEdit,
  onDelete,
  onDuplicate,
  onAnalysis,
  onMissingCards,
  onExport,
  onDeckbox,
  onFavoriteChange,
  onShare,
  className
}: RefreshedDeckTileProps) {
  const [isFavorite, setIsFavorite] = useState(deckSummary.favorite);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [wishlistCount, setWishlistCount] = useState<number | null>(null);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [addingToWishlist, setAddingToWishlist] = useState(false);

  // Lazy load wishlist count only when needed
  const loadWishlistCount = async () => {
    if (wishlistCount !== null || wishlistLoading) return; // Already loaded or loading
    
    setWishlistLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_deck_wishlist_count', {
        deck_id_param: deckSummary.id
      });
      
      if (!error && typeof data === 'number') {
        setWishlistCount(data);
      }
    } catch (error) {
      console.error('Error loading wishlist count:', error);
    } finally {
      setWishlistLoading(false);
    }
  };

  const formatColors = {
    standard: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    commander: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    modern: 'bg-green-500/20 text-green-400 border-green-500/30',
    legacy: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    custom: 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  };

  const powerBandColors = {
    casual: 'bg-green-500/20 text-green-400',
    mid: 'bg-blue-500/20 text-blue-400',
    high: 'bg-orange-500/20 text-orange-400',
    cEDH: 'bg-red-500/20 text-red-400'
  };

  const handleFavoriteToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (favoriteLoading) return;
    
    setFavoriteLoading(true);
    try {
      // Check if this is a local deck
      const isLocalDeck = deckSummary.name.includes('(Local)');
      
      if (isLocalDeck) {
        // For local decks, use the store
        const { useDeckManagementStore } = await import('@/stores/deckManagementStore');
        const toggleFavorite = useDeckManagementStore.getState().toggleFavorite;
        toggleFavorite(deckSummary.id);
        setIsFavorite(!isFavorite);
      } else {
        // For database decks, use the API
        const result = await DeckAPI.toggleFavorite(deckSummary.id);
        setIsFavorite(result.favorited);
      }
      onFavoriteChange?.();
    } catch (error) {
      console.error('Error toggling favorite:', error);
    } finally {
      setFavoriteLoading(false);
    }
  };

  const handleAddMissingToWishlist = async () => {
    // Load count first if not already loaded
    await loadWishlistCount();
    
    setAddingToWishlist(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        showError("Authentication Required", "Please log in to add cards to wishlist");
        return;
      }

      console.log('Starting add missing to wishlist for deck:', deckSummary.id);

      // Get all deck cards
      const { data: allDeckCards, error: deckError } = await supabase
        .from('deck_cards')
        .select('card_id, card_name, quantity')
        .eq('deck_id', deckSummary.id);

      if (deckError) {
        console.error('Error getting deck cards:', deckError);
        throw deckError;
      }

      if (!allDeckCards || allDeckCards.length === 0) {
        showError("No Cards Found", "This deck appears to be empty");
        return;
      }

      console.log('Deck cards found:', allDeckCards.length);

      // Check which cards are missing from collection
      const cardIds = allDeckCards.map(c => c.card_id);
      const { data: ownedCards, error: ownedError } = await supabase
        .from('user_collections')
        .select('card_id')
        .eq('user_id', user.user.id)
        .in('card_id', cardIds);

      if (ownedError) {
        console.error('Error checking owned cards:', ownedError);
        // Continue anyway, worst case we add some cards already owned
      }

      const ownedCardIds = new Set(ownedCards?.map(c => c.card_id) || []);
      const actualMissingCards = allDeckCards.filter(card => !ownedCardIds.has(card.card_id));

      console.log('Missing cards found:', actualMissingCards.length);

      if (actualMissingCards.length === 0) {
        showSuccess("Complete Collection", "You already own all cards in this deck!");
        return;
      }

      // Add missing cards to wishlist
      const wishlistItems = actualMissingCards.map(card => ({
        user_id: user.user.id,
        card_id: card.card_id,
        card_name: card.card_name,
        quantity: card.quantity,
        priority: 'medium' as const
      }));

      console.log('Adding to wishlist:', wishlistItems.length, 'items');

      const { error: insertError } = await supabase
        .from('wishlist')
        .upsert(wishlistItems, { 
          onConflict: 'user_id,card_id',
          ignoreDuplicates: false
        });

      if (insertError) {
        console.error('Error inserting to wishlist:', insertError);
        throw insertError;
      }

      console.log('Successfully added to wishlist');
      showSuccess("Added to Wishlist", `Added ${actualMissingCards.length} missing cards to your wishlist`);

      // Refresh wishlist count
      const { data: newCount, error: countError } = await supabase.rpc('get_deck_wishlist_count', {
        deck_id_param: deckSummary.id
      });
      
      if (!countError && typeof newCount === 'number') {
        setWishlistCount(newCount);
      }

    } catch (error) {
      console.error('Error adding missing cards to wishlist:', error);
      showError("Error", "Failed to add missing cards to wishlist. Please try again.");
    } finally {
      setAddingToWishlist(false);
    }
  };

  const getColorIndicator = (colors: string[]) => {
    const colorMap: Record<string, string> = {
      W: 'bg-yellow-100 border-yellow-300',
      U: 'bg-blue-100 border-blue-300',
      B: 'bg-gray-800 border-gray-600',
      R: 'bg-red-100 border-red-300',
      G: 'bg-green-100 border-green-300'
    };
    
    return colors.slice(0, 5).map(color => (
      <div
        key={color}
        className={`w-4 h-4 rounded-full border-2 ${colorMap[color] || 'bg-gray-200 border-gray-300'}`}
      />
    ));
  };

  // Mini curve chart data - handle both data structures
  const curveSource = deckSummary.curve?.bins || deckSummary.curve || {};
  const curveData = Object.entries(curveSource).map(([cmc, count]) => ({
    cmc,
    count: Number(count)
  }));
  const maxCurveCount = Math.max(...curveData.map(d => d.count), 1);

  // Type distribution data
  const typeData = [
    { type: 'Creatures', count: deckSummary.counts.creatures, color: 'bg-green-500' },
    { type: 'Lands', count: deckSummary.counts.lands, color: 'bg-amber-500' },
    { type: 'Instants', count: deckSummary.counts.instants, color: 'bg-blue-500' },
    { type: 'Sorceries', count: deckSummary.counts.sorceries, color: 'bg-red-500' },
    { type: 'Artifacts', count: deckSummary.counts.artifacts, color: 'bg-gray-500' },
    { type: 'Enchantments', count: deckSummary.counts.enchantments, color: 'bg-purple-500' },
    { type: 'Planeswalkers', count: deckSummary.counts.planeswalkers, color: 'bg-pink-500' }
  ].filter(item => item.count > 0);

  return (
    <Card className={cn("group hover:shadow-xl transition-all duration-300 overflow-hidden border-2 hover:border-primary/30", className)}>
      <CardContent className="p-0">
        <div className="flex h-[220px]">
          {/* Left: Commander Preview - Reduced Width */}
          <div className="w-48 flex-shrink-0 relative overflow-hidden">
            {deckSummary.commander ? (
              <div className="h-full relative">
                <img 
                  src={(deckSummary.commander as any)?.image_uris?.normal || 
                       (deckSummary.commander as any)?.image_uris?.large || 
                       deckSummary.commander.image || 
                       '/placeholder.svg'} 
                  alt={deckSummary.commander.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = '/placeholder.svg';
                  }}
                />
                {/* Commander badge overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-2">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Crown className="h-3 w-3 text-yellow-500" />
                    <span className="text-[10px] font-medium text-white uppercase tracking-wide">Commander</span>
                  </div>
                  <h4 className="text-center font-semibold text-xs leading-tight text-white line-clamp-2">{deckSummary.commander.name}</h4>
                </div>
              </div>
            ) : (
              <div className="h-full bg-gradient-to-b from-muted to-muted/50 flex items-center justify-center border-r border-dashed border-muted-foreground/20">
                <div className="text-center text-muted-foreground p-2">
                  <Crown className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <div className="text-[10px] font-medium">No Commander</div>
                </div>
              </div>
            )}
          </div>

          {/* Right: Compact Stats Section */}
          <div className="flex-1 p-3 space-y-2">
            {/* Header Row */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className={cn("text-[10px] font-bold px-1.5 py-0", powerBandColors[deckSummary.power.band])}>
                    {deckSummary.power.score}/10
                  </Badge>
                  <Badge variant="outline" className={cn("text-[10px] capitalize px-1.5 py-0", formatColors[deckSummary.format as keyof typeof formatColors])}>
                    {deckSummary.format}
                  </Badge>
                  <div className="flex gap-0.5">
                    {getColorIndicator(deckSummary.colors)}
                  </div>
                </div>
                
                <h3 className="font-bold text-base mb-0.5 group-hover:text-primary transition-colors truncate">
                  {deckSummary.name}
                </h3>
                
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{new Date(deckSummary.updatedAt).toLocaleDateString()}</span>
                  <span>•</span>
                  <span>{deckSummary.counts.total} total ({deckSummary.counts.unique} unique)</span>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleFavoriteToggle}
                disabled={favoriteLoading}
                className="text-yellow-500 hover:text-yellow-600 h-6 w-6 p-0 shrink-0"
              >
                {favoriteLoading ? (
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : isFavorite ? (
                  <Star className="h-3 w-3 fill-current" />
                ) : (
                  <StarOff className="h-3 w-3" />
                )}
              </Button>
            </div>

            {/* Compact Metrics Grid */}
            <div className="grid grid-cols-5 gap-1.5">
              <div className="text-center p-1.5 rounded bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors" onClick={onMissingCards}>
                <Package className="h-3 w-3 text-blue-500 mx-auto mb-0.5" />
                <div className="text-xs font-bold">{deckSummary.counts.total - deckSummary.economy.missing}/{deckSummary.counts.total}</div>
                <div className="text-[9px] text-muted-foreground leading-none">Own</div>
              </div>

              <div className="text-center p-1.5 rounded bg-muted/30">
                <DollarSign className="h-3 w-3 text-green-500 mx-auto mb-0.5" />
                <div className="text-xs font-bold">${Math.round(deckSummary.economy.priceUSD)}</div>
                <div className="text-[9px] text-muted-foreground leading-none">Value</div>
              </div>

              <div className="text-center p-1.5 rounded bg-muted/30">
                <BarChart3 className="h-3 w-3 text-purple-500 mx-auto mb-0.5" />
                <div className="text-xs font-bold">{Math.round(curveData.reduce((sum, d) => sum + (parseInt(d.cmc.split('-')[0]) || 0) * d.count, 0) / Math.max(deckSummary.counts.total - deckSummary.counts.lands, 1) * 10) / 10}</div>
                <div className="text-[9px] text-muted-foreground leading-none">CMC</div>
              </div>

              <div className="text-center p-1.5 rounded bg-muted/30">
                <TrendingUp className="h-3 w-3 text-orange-500 mx-auto mb-0.5" />
                <div className="text-xs font-bold">{deckSummary.counts.lands}</div>
                <div className="text-[9px] text-muted-foreground leading-none">Lands</div>
              </div>
              
              <div className="text-center p-1.5 rounded bg-muted/30">
                <Target className="h-3 w-3 text-primary mx-auto mb-0.5" />
                <div className="text-xs font-bold">{deckSummary.counts.creatures}</div>
                <div className="text-[9px] text-muted-foreground leading-none">Creat</div>
              </div>
            </div>

            {/* Mana Curve Chart */}
            <div className="relative overflow-hidden p-2 rounded bg-muted/20">
              <div className="flex items-center gap-1.5 mb-1.5">
                <BarChart3 className="h-3 w-3 text-spacecraft" />
                <span className="text-[10px] font-medium">Mana Curve</span>
              </div>
              <div className="flex items-end gap-0.5 h-10">
                {curveData.length > 0 ? curveData.map(({ cmc, count }) => {
                  const height = maxCurveCount > 0 ? Math.max((count / maxCurveCount) * 100, count > 0 ? 10 : 0) : 0;
                  const cmcLabel = cmc.includes('+') ? cmc.replace('+', '') + '+' : cmc;
                  return (
                    <div key={cmc} className="flex-1 flex flex-col items-center justify-end group/bar" title={`${cmcLabel} CMC: ${count} cards`}>
                      <div 
                        className="bg-gradient-to-t from-spacecraft/70 to-spacecraft/30 w-full rounded-t transition-all hover:from-spacecraft/90 hover:to-spacecraft/50"
                        style={{ height: `${height}%`, minHeight: count > 0 ? '4px' : '0' }}
                      />
                      <div className="text-[9px] text-muted-foreground mt-0.5 leading-none">{cmcLabel}</div>
                    </div>
                  );
                }) : (
                  <div className="flex-1 text-center text-[10px] text-muted-foreground py-2">No curve data</div>
                )}
              </div>
              <div className="text-[9px] text-muted-foreground text-center mt-1">
                Avg: {(curveData.length > 0 ? curveData.reduce((sum, d) => sum + (parseInt(d.cmc.split('-')[0]) || 0) * d.count, 0) / Math.max(deckSummary.counts.total - deckSummary.counts.lands, 1) : 0).toFixed(1)} CMC
              </div>
            </div>

            {/* Format and Power Band Badges */}
            <div className="flex items-center justify-between pt-2 border-t border-muted">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge 
                  variant={deckSummary.legality.ok ? "default" : "destructive"}
                  className="text-xs cursor-pointer hover:opacity-80"
                  onClick={onAnalysis}
                >
                  {deckSummary.legality.ok ? '✓ Legal' : `⚠ ${deckSummary.legality.issues.length} Issues`}
                </Badge>

                {deckSummary.economy.missing > 0 && (
                  <Badge variant="outline" className="text-xs text-red-500 cursor-pointer hover:opacity-80" onClick={onMissingCards}>
                    {deckSummary.economy.missing} Missing
                  </Badge>
                )}

                {wishlistCount > 0 && (
                  <Badge variant="outline" className="text-xs text-primary cursor-pointer hover:opacity-80">
                    <ShoppingCart className="h-3 w-3 mr-1" />
                    {wishlistCount} Wishlisted
                  </Badge>
                )}

                <Badge className={cn("text-xs", powerBandColors[deckSummary.power.band])}>
                  {deckSummary.power.band.toUpperCase()}
                </Badge>

                {deckSummary.tags.slice(0, 1).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>

              <div className="flex items-center gap-1">
                {onAnalysis && (
                  <Button variant="ghost" size="sm" onClick={onAnalysis} title="Analysis">
                    <BarChart3 className="h-3 w-3" />
                  </Button>
                )}
                {onExport && (
                  <Button variant="ghost" size="sm" onClick={onExport} title="Export">
                    <Download className="h-3 w-3" />
                  </Button>
                )}
                {onShare && (
                  <Button variant="ghost" size="sm" onClick={onShare} title="Share">
                    <Share2 className="h-3 w-3" />
                  </Button>
                )}
                {onEdit && (
                  <Button variant="default" size="sm" onClick={onEdit}>
                    <Edit className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                )}
                <div className="flex gap-1">
                  {onDuplicate && (
                    <Button variant="outline" size="sm" onClick={onDuplicate} title="Duplicate">
                      <Copy className="h-3 w-3" />
                    </Button>
                  )}
                  {onDelete && (
                    <Button variant="outline" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive" title="Delete">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                
                {deckSummary.economy.missing > 0 && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleAddMissingToWishlist}
                    disabled={addingToWishlist}
                    className="ml-2 flex items-center gap-2"
                  >
                    <Plus className="h-3 w-3" />
                    Add Missing to Wishlist
                    {addingToWishlist && <div className="animate-spin rounded-full h-3 w-3 border border-current border-t-transparent" />}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}