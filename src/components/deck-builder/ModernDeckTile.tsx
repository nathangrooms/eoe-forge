import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Star, 
  StarOff, 
  Edit, 
  Trash2, 
  Copy, 
  BarChart3, 
  DollarSign, 
  Crown,
  Target,
  Package,
  Calendar,
  Plus,
  Share2,
  ExternalLink,
  Percent,
  Layers,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DeckSummary, DeckAPI } from '@/lib/api/deckAPI';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { supabase } from '@/integrations/supabase/client';
import { MiniManaCurve } from './MiniManaCurve';
import { ManaSourcesIndicator } from './ManaSourcesIndicator';
import { LegalityBadge } from './LegalityBadge';

interface ModernDeckTileProps {
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

const powerBandConfig = {
  casual: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' },
  mid: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  high: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
  cEDH: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' }
};

const formatConfig: Record<string, { bg: string; text: string }> = {
  standard: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  commander: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  modern: { bg: 'bg-green-500/20', text: 'text-green-400' },
  legacy: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  custom: { bg: 'bg-gray-500/20', text: 'text-gray-400' }
};

export function ModernDeckTile({
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
}: ModernDeckTileProps) {
  const [isFavorite, setIsFavorite] = useState(deckSummary.favorite);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [addingToWishlist, setAddingToWishlist] = useState(false);

  const handleFavoriteToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (favoriteLoading) return;
    
    setFavoriteLoading(true);
    try {
      const result = await DeckAPI.toggleFavorite(deckSummary.id);
      setIsFavorite(result.favorited);
      onFavoriteChange?.();
    } catch (error) {
      console.error('Error toggling favorite:', error);
    } finally {
      setFavoriteLoading(false);
    }
  };

  const handleAddMissingToWishlist = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setAddingToWishlist(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        showError("Authentication Required", "Please log in to add cards to wishlist");
        return;
      }

      const { data: allDeckCards, error: deckError } = await supabase
        .from('deck_cards')
        .select('card_id, card_name, quantity')
        .eq('deck_id', deckSummary.id);

      if (deckError) throw deckError;
      if (!allDeckCards || allDeckCards.length === 0) {
        showError("No Cards Found", "This deck appears to be empty");
        return;
      }

      const cardIds = allDeckCards.map(c => c.card_id);
      const { data: ownedCards } = await supabase
        .from('user_collections')
        .select('card_id')
        .eq('user_id', user.user.id)
        .in('card_id', cardIds);

      const ownedCardIds = new Set(ownedCards?.map(c => c.card_id) || []);
      const actualMissingCards = allDeckCards.filter(card => !ownedCardIds.has(card.card_id));

      if (actualMissingCards.length === 0) {
        showSuccess("Complete Collection", "You already own all cards in this deck!");
        return;
      }

      const wishlistItems = actualMissingCards.map(card => ({
        user_id: user.user.id,
        card_id: card.card_id,
        card_name: card.card_name,
        quantity: card.quantity,
        priority: 'medium' as const
      }));

      const { error: insertError } = await supabase
        .from('wishlist')
        .upsert(wishlistItems, { 
          onConflict: 'user_id,card_id',
          ignoreDuplicates: false
        });

      if (insertError) throw insertError;

      showSuccess("Added to Wishlist", `Added ${actualMissingCards.length} missing cards to your wishlist`);
    } catch (error) {
      console.error('Error adding missing cards to wishlist:', error);
      showError("Error", "Failed to add missing cards to wishlist");
    } finally {
      setAddingToWishlist(false);
    }
  };

  // Safely extract curve data
  const curveData = deckSummary.curve?.bins || deckSummary.curve || {};
  
  // Safely extract mana sources
  const manaSources = deckSummary.mana?.sources || {};
  
  // Calculate ownership percentage
  const ownedCount = deckSummary.counts.total - (deckSummary.economy?.missing || 0);
  const ownershipPct = deckSummary.counts.total > 0 
    ? Math.round((ownedCount / deckSummary.counts.total) * 100) 
    : 0;

  // Get power band styling
  const powerBand = deckSummary.power?.band || 'casual';
  const powerStyle = powerBandConfig[powerBand] || powerBandConfig.casual;
  
  // Format styling
  const formatStyle = formatConfig[deckSummary.format] || formatConfig.custom;

  // Type composition data
  const typeData = [
    { label: 'Creatures', count: deckSummary.counts.creatures || 0, color: 'bg-green-500' },
    { label: 'Spells', count: (deckSummary.counts.instants || 0) + (deckSummary.counts.sorceries || 0), color: 'bg-blue-500' },
    { label: 'Artifacts', count: deckSummary.counts.artifacts || 0, color: 'bg-gray-500' },
    { label: 'Enchant', count: deckSummary.counts.enchantments || 0, color: 'bg-purple-500' },
    { label: 'Lands', count: deckSummary.counts.lands || 0, color: 'bg-amber-500' },
  ].filter(t => t.count > 0);

  return (
    <Card className={cn(
      "group hover:shadow-xl transition-all duration-300 overflow-hidden border hover:border-primary/40",
      className
    )}>
      <CardContent className="p-0">
        <div className="flex flex-col lg:flex-row">
          {/* Left: Commander/Deck Visual */}
          <div className="lg:w-72 xl:w-80 flex-shrink-0 p-4 bg-gradient-to-br from-muted/30 to-muted/10">
            {deckSummary.commander ? (
              <div className="space-y-3">
                {/* Commander Image */}
                <div className="relative rounded-xl overflow-hidden shadow-lg bg-muted" style={{ aspectRatio: '0.71' }}>
                  <img 
                    src={(deckSummary.commander as any)?.image_uris?.normal || 
                         (deckSummary.commander as any)?.image_uris?.large || 
                         deckSummary.commander.image || 
                         '/placeholder.svg'} 
                    alt={deckSummary.commander.name}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      e.currentTarget.src = '/placeholder.svg';
                    }}
                  />
                  
                  {/* Favorite button overlay */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleFavoriteToggle}
                    disabled={favoriteLoading}
                    className="absolute top-2 right-2 h-8 w-8 bg-black/50 hover:bg-black/70 text-white"
                  >
                    {favoriteLoading ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : isFavorite ? (
                      <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                    ) : (
                      <StarOff className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                
                {/* Commander Info */}
                <div className="p-3 rounded-lg bg-gradient-to-r from-purple-500/10 to-amber-500/10 border border-primary/20">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <Crown className="h-3 w-3 text-amber-500" />
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Commander</span>
                    <Crown className="h-3 w-3 text-amber-500" />
                  </div>
                  <h4 className="text-center font-semibold text-sm leading-tight">
                    {deckSummary.commander.name}
                  </h4>
                </div>
              </div>
            ) : (
              <div className="aspect-[3/4] rounded-xl bg-muted/50 border-2 border-dashed border-muted-foreground/20 flex items-center justify-center">
                <div className="text-center text-muted-foreground p-4">
                  <Crown className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm font-medium">No Commander</p>
                  <p className="text-xs mt-1">Set in Builder</p>
                </div>
              </div>
            )}
          </div>

          {/* Right: Deck Info & Stats */}
          <div className="flex-1 p-4 space-y-4 min-w-0">
            {/* Header */}
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-xl truncate group-hover:text-primary transition-colors">
                    {deckSummary.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge className={cn("text-xs", formatStyle.bg, formatStyle.text)}>
                      {deckSummary.format}
                    </Badge>
                    <Badge className={cn("text-xs font-bold", powerStyle.bg, powerStyle.text)}>
                      Power {deckSummary.power?.score || 0}/10
                    </Badge>
                    <LegalityBadge 
                      isLegal={deckSummary.legality?.ok ?? true}
                      issues={deckSummary.legality?.issues || []}
                      format={deckSummary.format}
                    />
                  </div>
                </div>
              </div>
              
              {/* Meta info */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(deckSummary.updatedAt).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  {deckSummary.counts.total} cards ({deckSummary.counts.unique} unique)
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div 
                className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={onAnalysis}
              >
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <Target className="h-3 w-3 text-primary" />
                  <span className="text-xs">Power</span>
                </div>
                <div className="text-lg font-bold">{deckSummary.power?.score || 0}/10</div>
                <div className="text-[10px] text-muted-foreground capitalize">{powerBand}</div>
              </div>

              <div 
                className={cn(
                  "p-3 rounded-lg transition-colors cursor-pointer",
                  ownershipPct === 100 ? "bg-green-500/10 hover:bg-green-500/20" : "bg-muted/30 hover:bg-muted/50"
                )}
                onClick={onMissingCards}
              >
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <Package className="h-3 w-3 text-blue-500" />
                  <span className="text-xs">Owned</span>
                </div>
                <div className="text-lg font-bold">{ownershipPct}%</div>
                <div className="text-[10px] text-muted-foreground">
                  {ownedCount}/{deckSummary.counts.total} cards
                </div>
              </div>

              <div className="p-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <DollarSign className="h-3 w-3 text-green-500" />
                  <span className="text-xs">Value</span>
                </div>
                <div className="text-lg font-bold">${Math.round(deckSummary.economy?.priceUSD || 0)}</div>
                <div className="text-[10px] text-muted-foreground">TCGPlayer</div>
              </div>

              <div 
                className={cn(
                  "p-3 rounded-lg transition-colors",
                  (deckSummary.economy?.missing || 0) > 0 
                    ? "bg-red-500/10 cursor-pointer hover:bg-red-500/20" 
                    : "bg-green-500/10"
                )}
                onClick={(deckSummary.economy?.missing || 0) > 0 ? onMissingCards : undefined}
              >
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  {(deckSummary.economy?.missing || 0) > 0 ? (
                    <AlertCircle className="h-3 w-3 text-red-500" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  )}
                  <span className="text-xs">Missing</span>
                </div>
                <div className={cn(
                  "text-lg font-bold",
                  (deckSummary.economy?.missing || 0) > 0 ? "text-red-500" : "text-green-500"
                )}>
                  {deckSummary.economy?.missing || 0}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {(deckSummary.economy?.missing || 0) > 0 ? 'cards needed' : 'complete!'}
                </div>
              </div>
            </div>

            {/* Analytics Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Mana Curve */}
              <div className="p-3 rounded-lg bg-muted/20 border border-border/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">Mana Curve</span>
                  <span className="text-[10px] text-muted-foreground">
                    Avg: {(Object.entries(curveData).reduce((sum, [cmc, count]) => {
                      const cmcValue = cmc === '0-1' ? 0.5 : cmc === '6-7' ? 6.5 : cmc === '8-9' ? 8.5 : cmc === '10+' ? 10 : parseInt(cmc) || 0;
                      return sum + (cmcValue * Number(count));
                    }, 0) / Math.max(deckSummary.counts.total - (deckSummary.counts.lands || 0), 1)).toFixed(1)} CMC
                  </span>
                </div>
                <MiniManaCurve curveData={curveData} className="h-14" />
              </div>

              {/* Type Distribution */}
              <div className="p-3 rounded-lg bg-muted/20 border border-border/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">Composition</span>
                  <ManaSourcesIndicator sources={manaSources} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {typeData.map(({ label, count, color }) => (
                    <Badge key={label} variant="outline" className="text-[10px] gap-1 px-1.5 py-0.5">
                      <div className={cn("w-2 h-2 rounded-full", color)} />
                      {label}: {count}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between pt-3 border-t border-border/50">
              <div className="flex items-center gap-2">
                {(deckSummary.economy?.missing || 0) > 0 && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleAddMissingToWishlist}
                    disabled={addingToWishlist}
                    className="text-xs h-8"
                  >
                    {addingToWishlist ? (
                      <div className="animate-spin rounded-full h-3 w-3 border border-current border-t-transparent mr-1" />
                    ) : (
                      <Plus className="h-3 w-3 mr-1" />
                    )}
                    Add {deckSummary.economy?.missing || 0} to Wishlist
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-1">
                {onAnalysis && (
                  <Button variant="ghost" size="icon" onClick={onAnalysis} className="h-8 w-8">
                    <BarChart3 className="h-4 w-4" />
                  </Button>
                )}
                {onShare && (
                  <Button variant="ghost" size="icon" onClick={onShare} className="h-8 w-8">
                    <Share2 className="h-4 w-4" />
                  </Button>
                )}
                {onDuplicate && (
                  <Button variant="ghost" size="icon" onClick={onDuplicate} className="h-8 w-8">
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
                {onDelete && (
                  <Button variant="ghost" size="icon" onClick={onDelete} className="h-8 w-8 text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                {onEdit && (
                  <Button size="sm" onClick={onEdit} className="h-8 ml-1">
                    <Edit className="h-4 w-4 mr-1" />
                    Edit Deck
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