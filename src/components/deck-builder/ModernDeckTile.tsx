import { useState } from 'react';
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
  Crown,
  Target,
  Package,
  Calendar,
  Plus,
  Share2,
  Layers,
  AlertCircle,
  CheckCircle2,
  MoreVertical,
  Download,
  Play,
  Swords,
  TrendingUp,
  Eye
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
import { MiniManaCurve } from './MiniManaCurve';
import { LegalityBadge } from './LegalityBadge';
import { useNavigate } from 'react-router-dom';

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

const powerBandConfig: Record<string, { bg: string; text: string; label: string }> = {
  casual: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Casual' },
  mid: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Mid' },
  high: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'High' },
  cEDH: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'cEDH' }
};

const formatConfig: Record<string, { bg: string; text: string; label: string }> = {
  standard: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'Standard' },
  commander: { bg: 'bg-purple-500/15', text: 'text-purple-400', label: 'Commander' },
  modern: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Modern' },
  legacy: { bg: 'bg-yellow-500/15', text: 'text-yellow-400', label: 'Legacy' },
  vintage: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Vintage' },
  pioneer: { bg: 'bg-teal-500/15', text: 'text-teal-400', label: 'Pioneer' },
  pauper: { bg: 'bg-slate-500/15', text: 'text-slate-400', label: 'Pauper' },
  custom: { bg: 'bg-gray-500/15', text: 'text-gray-400', label: 'Custom' }
};

const colorMap: Record<string, string> = {
  W: 'bg-amber-100 border-amber-300',
  U: 'bg-blue-600',
  B: 'bg-gray-900',
  R: 'bg-red-600',
  G: 'bg-green-600'
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
  const navigate = useNavigate();

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

  const handlePlaytest = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    navigate(`/deck-simulation?deck=${deckSummary.id}`);
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
  const missingCount = deckSummary.economy?.missing || 0;
  const isComplete = missingCount === 0;

  // Get power band styling
  const powerBand = deckSummary.power?.band || 'casual';
  const powerStyle = powerBandConfig[powerBand] || powerBandConfig.casual;
  
  // Format styling
  const formatStyle = formatConfig[deckSummary.format] || formatConfig.custom;

  // Commander image
  const commanderImage = deckSummary.commander
    ? ((deckSummary.commander as any)?.image_uris?.normal || 
       (deckSummary.commander as any)?.image_uris?.large || 
       deckSummary.commander.image)
    : null;

  // Calculate average CMC
  const avgCmc = (Object.entries(curveData).reduce((sum, [cmc, count]) => {
    const cmcValue = cmc === '0-1' ? 0.5 : cmc === '6-7' ? 6.5 : cmc === '8-9' ? 8.5 : cmc === '10+' ? 10 : parseInt(cmc) || 0;
    return sum + (cmcValue * Number(count));
  }, 0) / Math.max(deckSummary.counts.total - (deckSummary.counts.lands || 0), 1)).toFixed(2);

  // Type composition for visual bar
  const typeBreakdown = [
    { type: 'Creatures', count: deckSummary.counts.creatures || 0, color: 'bg-green-500' },
    { type: 'Instants', count: deckSummary.counts.instants || 0, color: 'bg-blue-400' },
    { type: 'Sorceries', count: deckSummary.counts.sorceries || 0, color: 'bg-blue-600' },
    { type: 'Artifacts', count: deckSummary.counts.artifacts || 0, color: 'bg-gray-400' },
    { type: 'Enchantments', count: deckSummary.counts.enchantments || 0, color: 'bg-purple-500' },
    { type: 'Planeswalkers', count: deckSummary.counts.planeswalkers || 0, color: 'bg-orange-500' },
    { type: 'Lands', count: deckSummary.counts.lands || 0, color: 'bg-amber-600' },
  ].filter(t => t.count > 0);

  const totalNonLand = deckSummary.counts.total - (deckSummary.counts.lands || 0);

  return (
    <Card className={cn(
      "group relative overflow-hidden border border-border/60 hover:border-primary/40 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5",
      className
    )}>
      <CardContent className="p-0">
        <div className="flex flex-col lg:flex-row" style={{ minHeight: '320px' }}>
          {/* Left: Commander/Deck Visual - Fixed to match card ratio */}
          <div className="lg:w-56 xl:w-64 flex-shrink-0 relative bg-gradient-to-br from-muted/40 to-muted/20 p-3 flex flex-col">
            {/* Edit Button - Top Right - Prominent */}
            {onEdit && (
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="absolute top-2 right-2 z-10 h-9 px-4 bg-primary hover:bg-primary/90 text-primary-foreground shadow-xl border border-primary-foreground/20 font-semibold"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit Deck
              </Button>
            )}

            {deckSummary.commander ? (
              <div className="flex-1 flex flex-col">
                {/* Commander Image - Uses full available height */}
                <div className="relative flex-1 rounded-lg overflow-hidden bg-muted/50 shadow-md" style={{ minHeight: '200px' }}>
                  <img 
                    src={commanderImage || '/placeholder.svg'} 
                    alt={deckSummary.commander.name}
                    className="absolute inset-0 w-full h-full object-cover object-top"
                    onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
                  />
                  
                  {/* Gradient overlay for text readability */}
                  <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 to-transparent" />
                  
                  {/* Commander Name on image */}
                  <div className="absolute bottom-0 inset-x-0 p-3">
                    <div className="flex items-center gap-1 mb-0.5">
                      <Crown className="h-3 w-3 text-amber-400" />
                      <span className="text-[10px] text-amber-400/80 uppercase tracking-wider font-medium">Commander</span>
                    </div>
                    <h4 className="text-white font-semibold text-sm leading-tight line-clamp-2 drop-shadow-lg">
                      {deckSummary.commander.name}
                    </h4>
                  </div>

                  {/* Favorite button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleFavoriteToggle}
                    disabled={favoriteLoading}
                    className="absolute top-2 left-2 h-8 w-8 bg-black/50 hover:bg-black/70 text-white backdrop-blur-sm"
                  >
                    {favoriteLoading ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : isFavorite ? (
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ) : (
                      <StarOff className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {/* Color Identity Bar */}
                {deckSummary.colors && deckSummary.colors.length > 0 && (
                  <div className="flex justify-center gap-1.5 mt-2">
                    {deckSummary.colors.map(color => (
                      <div 
                        key={color}
                        className={cn("w-6 h-6 rounded-full border-2 border-white/20 shadow-sm", colorMap[color])}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center rounded-lg bg-muted/30 border-2 border-dashed border-muted-foreground/20">
                <Crown className="h-12 w-12 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground font-medium">No Commander</p>
                <p className="text-xs text-muted-foreground/60">Set in deck builder</p>
                
                {/* Favorite for non-commander decks */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleFavoriteToggle}
                  disabled={favoriteLoading}
                  className="mt-3"
                >
                  {isFavorite ? (
                    <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                  ) : (
                    <StarOff className="h-4 w-4" />
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Right: Deck Info & Stats */}
          <div className="flex-1 p-4 flex flex-col min-w-0">
            {/* Header Row */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0 flex-1">
                <h3 
                  className="font-bold text-lg lg:text-xl truncate hover:text-primary transition-colors cursor-pointer"
                  onClick={onEdit}
                >
                  {deckSummary.name}
                </h3>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <Badge variant="outline" className={cn("text-[10px] uppercase font-semibold", formatStyle.bg, formatStyle.text)}>
                    {formatStyle.label}
                  </Badge>
                  <Badge variant="outline" className={cn("text-[10px] font-semibold", powerStyle.bg, powerStyle.text)}>
                    <Target className="h-2.5 w-2.5 mr-1" />
                    {deckSummary.power?.score || 0}/10 {powerStyle.label}
                  </Badge>
                  <LegalityBadge 
                    isLegal={deckSummary.legality?.ok ?? true}
                    issues={deckSummary.legality?.issues || []}
                    format={deckSummary.format}
                  />
                </div>
              </div>

              {/* More Actions Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={onEdit}>
                    <Edit className="h-4 w-4 mr-2" /> Edit Deck
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handlePlaytest}>
                    <Play className="h-4 w-4 mr-2" /> Playtest
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onAnalysis}>
                    <BarChart3 className="h-4 w-4 mr-2" /> Full Analysis
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onMissingCards}>
                    <Package className="h-4 w-4 mr-2" /> Missing Cards
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onShare}>
                    <Share2 className="h-4 w-4 mr-2" /> Share Deck
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onDuplicate}>
                    <Copy className="h-4 w-4 mr-2" /> Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onExport}>
                    <Download className="h-4 w-4 mr-2" /> Export
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Stats Grid - Key metrics */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="p-2 rounded-lg bg-muted/30 text-center hover:bg-muted/50 transition-colors cursor-pointer" onClick={onAnalysis}>
                      <div className="text-lg font-bold">{deckSummary.counts.total}</div>
                      <div className="text-[10px] text-muted-foreground">Cards</div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>{deckSummary.counts.unique} unique cards</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="p-2 rounded-lg bg-muted/30 text-center">
                      <div className="text-lg font-bold text-green-500">${Math.round(deckSummary.economy?.priceUSD || 0)}</div>
                      <div className="text-[10px] text-muted-foreground">Value</div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>TCGPlayer Market Price</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="p-2 rounded-lg bg-muted/30 text-center">
                      <div className="text-lg font-bold">{avgCmc}</div>
                      <div className="text-[10px] text-muted-foreground">Avg CMC</div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Average mana value (excluding lands)</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div 
                      className={cn(
                        "p-2 rounded-lg text-center cursor-pointer transition-colors",
                        isComplete ? "bg-green-500/10 hover:bg-green-500/20" : "bg-red-500/10 hover:bg-red-500/20"
                      )}
                      onClick={onMissingCards}
                    >
                      <div className={cn("text-lg font-bold", isComplete ? "text-green-500" : "text-red-500")}>
                        {isComplete ? <CheckCircle2 className="h-5 w-5 mx-auto" /> : missingCount}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{isComplete ? 'Complete' : 'Missing'}</div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isComplete ? 'You own all cards!' : `${missingCount} cards needed to complete`}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Ownership Progress Bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Collection Progress</span>
                <span className="text-xs font-medium">{ownershipPct}%</span>
              </div>
              <Progress value={ownershipPct} className="h-2" />
            </div>

            {/* Mana Curve & Type Distribution */}
            <div className="grid grid-cols-2 gap-3 mb-3 flex-1">
              {/* Mana Curve */}
              <div className="p-2.5 rounded-lg bg-muted/20 border border-border/40">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Mana Curve</span>
                </div>
                <MiniManaCurve curveData={curveData} className="h-12" />
              </div>

              {/* Type Breakdown */}
              <div className="p-2.5 rounded-lg bg-muted/20 border border-border/40">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Composition</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {typeBreakdown.slice(0, 5).map(({ type, count, color }) => (
                    <TooltipProvider key={type}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 gap-1 cursor-default">
                            <div className={cn("w-1.5 h-1.5 rounded-full", color)} />
                            {count}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>{type}: {count}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Actions Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-border/40 mt-auto">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{new Date(deckSummary.updatedAt).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  <span>{deckSummary.counts.lands} lands</span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {missingCount > 0 && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleAddMissingToWishlist}
                    disabled={addingToWishlist}
                    className="h-7 text-xs px-2"
                  >
                    {addingToWishlist ? (
                      <div className="animate-spin rounded-full h-3 w-3 border border-current border-t-transparent" />
                    ) : (
                      <>
                        <Plus className="h-3 w-3 mr-1" />
                        Wishlist
                      </>
                    )}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={handlePlaytest} className="h-7 text-xs px-2">
                  <Play className="h-3 w-3 mr-1" />
                  Test
                </Button>
                <Button variant="ghost" size="sm" onClick={onAnalysis} className="h-7 text-xs px-2">
                  <BarChart3 className="h-3 w-3 mr-1" />
                  Stats
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
