import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ManaSymbols, PowerLevelBadge } from "@/components/ui/mana-symbols";
import { cn } from "@/lib/utils";
import { supabase } from '@/integrations/supabase/client';
import { 
  Edit, 
  Trash2, 
  Copy, 
  Eye, 
  Play, 
  Crown, 
  TrendingUp, 
  AlertTriangle,
  DollarSign,
  BarChart3,
  Users
} from "lucide-react";

interface DeckMetrics {
  totalCards: number;
  uniqueCards: number;
  totalValue: number;
  avgCmc: number;
  duplicates: number;
  commanderCard?: {
    name: string;
    image_url?: string;
    colors: string[];
    cmc: number;
  };
  previewCard?: {
    name: string;
    image_url?: string;
  };
  colorDistribution: Record<string, number>;
  typeDistribution: Record<string, number>;
}

interface EnhancedDeckTileProps {
  id: string;
  name: string;
  format: string;
  colors: string[];
  cardCount: number;
  powerLevel: number;
  lastModified?: Date;
  description?: string;
  isLoading?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onView?: () => void;
  onPlay?: () => void;
  className?: string;
}

export function EnhancedDeckTile({
  id,
  name,
  format,
  colors,
  cardCount,
  powerLevel,
  lastModified,
  description,
  isLoading = false,
  onEdit,
  onDelete,
  onDuplicate,
  onView,
  onPlay,
  className
}: EnhancedDeckTileProps) {
  const [metrics, setMetrics] = useState<DeckMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  const formatColors = {
    standard: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    commander: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    modern: 'bg-green-500/20 text-green-400 border-green-500/30',
    legacy: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    custom: 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  };

  // Load deck metrics
  useEffect(() => {
    if (id && !isLoading) {
      loadDeckMetrics();
    }
  }, [id, isLoading]);

  const loadDeckMetrics = async () => {
    setLoadingMetrics(true);
    try {
      // Skip loading metrics for local decks or if no user
      const isLocalDeck = name.includes('(Local)');
      if (isLocalDeck || !supabase) {
        setMetrics({
          totalCards: cardCount,
          uniqueCards: cardCount,
          totalValue: 0,
          avgCmc: 0,
          duplicates: 0,
          colorDistribution: {},
          typeDistribution: {}
        });
        return;
      }

      // Load deck cards without join to avoid foreign key issues  
      const { data: deckCards, error } = await supabase
        .from('deck_cards')
        .select('*')
        .eq('deck_id', id);

      if (error) {
        console.error('Error loading deck cards:', error);
        return;
      }

      if (!deckCards || deckCards.length === 0) {
        setMetrics({
          totalCards: 0,
          uniqueCards: 0,
          totalValue: 0,
          avgCmc: 0,
          duplicates: 0,
          colorDistribution: {},
          typeDistribution: {}
        });
        return;
      }

      // Calculate basic metrics from deck cards
      const totalCards = deckCards.reduce((sum, card) => sum + card.quantity, 0);
      const uniqueCards = deckCards.length;
      const duplicates = deckCards.filter(card => card.quantity > 1).length;

      setMetrics({
        totalCards,
        uniqueCards,
        totalValue: 0, // Would need card price lookup
        avgCmc: 0, // Would need card CMC lookup
        duplicates,
        colorDistribution: {},
        typeDistribution: {}
      });

    } catch (error) {
      console.error('Error calculating deck metrics:', error);
    } finally {
      setLoadingMetrics(false);
    }
  };

  if (isLoading) {
    return (
      <Card className={cn("animate-pulse", className)}>
        <div className="flex">
          <div className="w-24 h-32 bg-muted rounded-l-lg" />
          <div className="flex-1 p-4 space-y-3">
            <div className="h-5 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="space-y-2">
              <div className="h-3 bg-muted rounded w-full" />
              <div className="h-3 bg-muted rounded w-2/3" />
            </div>
          </div>
        </div>
      </Card>
    );
  }

  const commanderOrPreview = metrics?.commanderCard || metrics?.previewCard;
  const hasValidMetrics = metrics && !loadingMetrics;

  return (
    <Card className={cn("group hover:shadow-lg transition-all duration-200 overflow-hidden", className)}>
      <div className="flex">
        {/* Commander/Preview Card Image */}
        <div className="w-24 bg-muted flex-shrink-0 relative">
          {commanderOrPreview?.image_url ? (
            <img 
              src={commanderOrPreview.image_url} 
              alt={commanderOrPreview.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-muted to-muted-foreground/20">
              <Crown className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
          {metrics?.commanderCard && (
            <Badge variant="secondary" className="absolute bottom-1 left-1 text-xs px-1 py-0">
              CMD
            </Badge>
          )}
        </div>

        {/* Deck Info */}
        <div className="flex-1 min-w-0">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-lg font-semibold truncate mb-1">
                  {name}
                </CardTitle>
                <div className="flex items-center gap-2 mb-1">
                  <Badge className={formatColors[format as keyof typeof formatColors] || formatColors.custom}>
                    {format}
                  </Badge>
                  <ManaSymbols colors={colors} size="sm" />
                  <PowerLevelBadge level={powerLevel} />
                </div>
                {description && (
                  <p className="text-xs text-muted-foreground line-clamp-1 mb-1">
                    {description}
                  </p>
                )}
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="pt-0 space-y-3">
            {/* Metrics Grid */}
            {hasValidMetrics && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1">
                  <BarChart3 className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Cards:</span>
                  <span className="font-medium">{metrics.totalCards} ({metrics.uniqueCards} unique)</span>
                </div>
                
                <div className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Value:</span>
                  <span className="font-medium">${metrics.totalValue.toFixed(0)}</span>
                </div>
                
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Avg CMC:</span>
                  <span className="font-medium">{metrics.avgCmc.toFixed(1)}</span>
                </div>
                
                {format === 'commander' && metrics.duplicates > 0 && (
                  <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3" />
                    <span className="text-xs">{metrics.duplicates} duplicates</span>
                  </div>
                )}

                {commanderOrPreview && (
                  <div className="col-span-2 text-xs">
                    <span className="text-muted-foreground">
                      {metrics?.commanderCard ? 'Commander: ' : 'Featured: '}
                    </span>
                    <span className="font-medium">{commanderOrPreview.name}</span>
                  </div>
                )}
              </div>
            )}

            {loadingMetrics && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="animate-spin rounded-full h-3 w-3 border border-muted-foreground border-t-transparent" />
                Loading metrics...
              </div>
            )}

            {/* Last Modified */}
            {lastModified && (
              <p className="text-xs text-muted-foreground">
                Modified {lastModified.toLocaleDateString()}
              </p>
            )}
            
            {/* Action Buttons */}
            <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onView && (
                <Button variant="outline" size="sm" onClick={onView}>
                  <Eye className="h-3 w-3" />
                </Button>
              )}
              {onEdit && (
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <Edit className="h-3 w-3" />
                </Button>
              )}
              {onDuplicate && (
                <Button variant="outline" size="sm" onClick={onDuplicate}>
                  <Copy className="h-3 w-3" />
                </Button>
              )}
              {onPlay && (
                <Button variant="outline" size="sm" onClick={onPlay}>
                  <Play className="h-3 w-3" />
                </Button>
              )}
              {onDelete && (
                <Button variant="outline" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </CardContent>
        </div>
      </div>
    </Card>
  );
}