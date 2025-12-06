import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  AlertCircle,
  CheckCircle2,
  MoreHorizontal,
  ExternalLink
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { DeckSummary, DeckAPI } from '@/lib/api/deckAPI';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { supabase } from '@/integrations/supabase/client';

interface ImprovedDeckTileProps {
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

const formatConfig: Record<string, { label: string; className: string }> = {
  standard: { label: 'Standard', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  commander: { label: 'Commander', className: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  modern: { label: 'Modern', className: 'bg-green-500/15 text-green-400 border-green-500/30' },
  legacy: { label: 'Legacy', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  vintage: { label: 'Vintage', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  pioneer: { label: 'Pioneer', className: 'bg-teal-500/15 text-teal-400 border-teal-500/30' },
  pauper: { label: 'Pauper', className: 'bg-gray-500/15 text-gray-400 border-gray-500/30' },
  custom: { label: 'Custom', className: 'bg-slate-500/15 text-slate-400 border-slate-500/30' }
};

const colorMap: Record<string, string> = {
  W: 'bg-[#FFFBD5] border-amber-300',
  U: 'bg-[#0E68AB]',
  B: 'bg-[#150B00]',
  R: 'bg-[#D3202A]',
  G: 'bg-[#00733E]'
};

export function ImprovedDeckTile({
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
}: ImprovedDeckTileProps) {
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

  const handleAddMissingToWishlist = async () => {
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
        .upsert(wishlistItems, { onConflict: 'user_id,card_id', ignoreDuplicates: false });

      if (insertError) throw insertError;
      showSuccess("Added to Wishlist", `Added ${actualMissingCards.length} missing cards to your wishlist`);
    } catch (error) {
      console.error('Error adding missing cards to wishlist:', error);
      showError("Error", "Failed to add missing cards to wishlist");
    } finally {
      setAddingToWishlist(false);
    }
  };

  // Calculate derived values
  const ownedCount = deckSummary.counts.total - (deckSummary.economy?.missing || 0);
  const ownershipPct = deckSummary.counts.total > 0 
    ? Math.round((ownedCount / deckSummary.counts.total) * 100) 
    : 0;
  const missingCount = deckSummary.economy?.missing || 0;
  const isComplete = missingCount === 0;
  const formatInfo = formatConfig[deckSummary.format] || formatConfig.custom;

  // Get commander image
  const commanderImage = deckSummary.commander
    ? ((deckSummary.commander as any)?.image_uris?.art_crop || 
       (deckSummary.commander as any)?.image_uris?.normal || 
       deckSummary.commander.image)
    : null;

  // Mana curve data
  const curveData = deckSummary.curve?.bins || deckSummary.curve || {};
  const curveValues = Object.entries(curveData).map(([cmc, count]) => ({
    cmc: cmc === '0-1' ? '0' : cmc === '6-7' ? '6' : cmc === '8-9' ? '8' : cmc === '10+' ? '10' : cmc,
    count: Number(count)
  })).slice(0, 7);
  const maxCurve = Math.max(...curveValues.map(v => v.count), 1);

  return (
    <Card 
      className={cn(
        "group relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 border-border/50 hover:border-primary/30",
        className
      )}
    >
      {/* Background gradient from commander art */}
      {commanderImage && (
        <div 
          className="absolute inset-0 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity duration-500"
          style={{
            backgroundImage: `url(${commanderImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        />
      )}

      <div className="relative flex flex-col sm:flex-row">
        {/* Left: Commander Image */}
        <div className="sm:w-44 lg:w-52 flex-shrink-0 p-3">
          <div className="relative aspect-[4/3] sm:aspect-[3/4] rounded-lg overflow-hidden bg-muted/50">
            {commanderImage ? (
              <img 
                src={commanderImage} 
                alt={deckSummary.commander?.name || 'Deck'}
                className="w-full h-full object-cover object-top"
                onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                <Crown className="h-10 w-10 text-muted-foreground/30" />
              </div>
            )}
            
            {/* Favorite button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleFavoriteToggle}
              disabled={favoriteLoading}
              className="absolute top-2 right-2 h-7 w-7 bg-black/60 hover:bg-black/80 text-white rounded-full"
            >
              {favoriteLoading ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : isFavorite ? (
                <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
              ) : (
                <StarOff className="h-3.5 w-3.5" />
              )}
            </Button>

            {/* Color identity */}
            {deckSummary.colors && deckSummary.colors.length > 0 && (
              <div className="absolute bottom-2 left-2 flex gap-1">
                {deckSummary.colors.map(color => (
                  <div 
                    key={color}
                    className={cn("w-5 h-5 rounded-full border border-white/30 shadow-sm", colorMap[color])}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Info */}
        <div className="flex-1 p-4 sm:pl-0 space-y-3 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 
                  className="font-bold text-lg truncate cursor-pointer hover:text-primary transition-colors"
                  onClick={onEdit}
                >
                  {deckSummary.name}
                </h3>
                <Badge variant="outline" className={cn("text-[10px] uppercase font-medium", formatInfo.className)}>
                  {formatInfo.label}
                </Badge>
              </div>
              
              {deckSummary.commander && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Crown className="h-3 w-3 text-amber-500" />
                  <span className="truncate">{deckSummary.commander.name}</span>
                </p>
              )}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={onEdit}>
                  <Edit className="h-4 w-4 mr-2" /> Edit Deck
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onAnalysis}>
                  <BarChart3 className="h-4 w-4 mr-2" /> Analysis
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onMissingCards}>
                  <Package className="h-4 w-4 mr-2" /> Missing Cards
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onShare}>
                  <Share2 className="h-4 w-4 mr-2" /> Share
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDuplicate}>
                  <Copy className="h-4 w-4 mr-2" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExport}>
                  <ExternalLink className="h-4 w-4 mr-2" /> Export
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Stats Row */}
          <div className="flex items-center gap-4 flex-wrap text-sm">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 cursor-pointer" onClick={onAnalysis}>
                    <Target className="h-3.5 w-3.5 text-orange-500" />
                    <span className="font-semibold">{deckSummary.power?.score || 0}</span>
                    <span className="text-xs text-muted-foreground">/10</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Power Level</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-green-500" />
              <span className="font-semibold">${Math.round(deckSummary.economy?.priceUSD || 0)}</span>
            </div>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div 
                    className={cn(
                      "flex items-center gap-1.5 cursor-pointer",
                      isComplete ? "text-green-500" : "text-muted-foreground"
                    )}
                    onClick={onMissingCards}
                  >
                    {isComplete ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                    )}
                    <span className={cn("font-semibold", !isComplete && "text-red-500")}>
                      {ownershipPct}%
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {isComplete ? 'Complete - You own all cards!' : `${missingCount} cards missing`}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span className="text-xs">{new Date(deckSummary.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Mini Mana Curve */}
          <div className="flex items-end gap-0.5 h-8">
            {curveValues.map(({ cmc, count }) => (
              <TooltipProvider key={cmc}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex-1 flex flex-col items-center gap-0.5">
                      <div 
                        className="w-full bg-primary/70 rounded-t transition-all hover:bg-primary"
                        style={{ height: `${(count / maxCurve) * 100}%`, minHeight: count > 0 ? 2 : 0 }}
                      />
                      <span className="text-[9px] text-muted-foreground">{cmc}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    CMC {cmc}: {count} cards
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>

          {/* Card Counts & Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{deckSummary.counts.total} cards</span>
              <span>•</span>
              <span>{deckSummary.counts.creatures || 0} creatures</span>
              <span>•</span>
              <span>{deckSummary.counts.lands || 0} lands</span>
            </div>

            <div className="flex items-center gap-1">
              {missingCount > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleAddMissingToWishlist}
                  disabled={addingToWishlist}
                  className="text-xs h-7 px-2"
                >
                  {addingToWishlist ? (
                    <div className="animate-spin rounded-full h-3 w-3 border border-current border-t-transparent mr-1" />
                  ) : (
                    <Plus className="h-3 w-3 mr-1" />
                  )}
                  Wishlist
                </Button>
              )}
              <Button variant="default" size="sm" onClick={onEdit} className="h-7 px-3 text-xs">
                <Edit className="h-3 w-3 mr-1" />
                Edit
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
