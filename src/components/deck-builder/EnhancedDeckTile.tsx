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
  Users,
  Zap,
  Target,
  Calendar,
  Hash,
  Layers
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
  creatureCount: number;
  landCount: number;
  spellCount: number;
  artifactCount: number;
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
      const isLocalDeck = name.includes('(Local)');
      
      if (isLocalDeck) {
        // For local decks, get commander info from the store
        const deckManagementStore = (window as any).__deckManagementStore?.getState?.();
        const localDeckId = id;
        const localDeckData = deckManagementStore?.decks?.find((d: any) => d.id === localDeckId);
        
        let commanderCard = null;
        if (localDeckData?.commander) {
          commanderCard = {
            name: localDeckData.commander.name,
            image_url: localDeckData.commander.image_uris?.normal || localDeckData.commander.image_uris?.large,
            colors: localDeckData.commander.colors || [],
            cmc: localDeckData.commander.cmc || 0
          };
        }

        // Calculate type distribution from local deck cards
        const cards = localDeckData?.cards || [];
        const creatureCount = cards.filter((c: any) => c.type_line?.toLowerCase().includes('creature')).length;
        const landCount = cards.filter((c: any) => c.type_line?.toLowerCase().includes('land')).length;
        const spellCount = cards.filter((c: any) => 
          c.type_line?.toLowerCase().includes('instant') || 
          c.type_line?.toLowerCase().includes('sorcery')
        ).length;
        const artifactCount = cards.filter((c: any) => c.type_line?.toLowerCase().includes('artifact')).length;
        
        setMetrics({
          totalCards: cardCount,
          uniqueCards: cards.length,
          totalValue: 0,
          avgCmc: cards.reduce((sum: number, c: any) => sum + (c.cmc || 0), 0) / Math.max(cards.length, 1),
          duplicates: 0,
          commanderCard: commanderCard,
          colorDistribution: {},
          typeDistribution: {},
          creatureCount,
          landCount,
          spellCount,
          artifactCount
        });
        return;
      }

      if (!supabase) {
        setMetrics({
          totalCards: cardCount,
          uniqueCards: cardCount,
          totalValue: 0,
          avgCmc: 0,
          duplicates: 0,
          colorDistribution: {},
          typeDistribution: {},
          creatureCount: 0,
          landCount: 0,
          spellCount: 0,
          artifactCount: 0
        });
        return;
      }

      // Load deck cards and commander
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
          typeDistribution: {},
          creatureCount: 0,
          landCount: 0,
          spellCount: 0,
          artifactCount: 0
        });
        return;
      }

      // Find commander or get a preview card
      const commanderCard = deckCards.find(card => card.is_commander);
      const previewCard = !commanderCard ? deckCards[0] : null;

      // Get card image from Scryfall
      let cardWithImage = null;
      const targetCard = commanderCard || previewCard;
      
      if (targetCard) {
        try {
          const response = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(targetCard.card_name)}`);
          if (response.ok) {
            const cardData = await response.json();
            cardWithImage = {
              name: cardData.name,
              image_url: cardData.image_uris?.normal || cardData.image_uris?.large,
              colors: cardData.colors || [],
              cmc: cardData.cmc || 0
            };
          }
        } catch (error) {
          console.error('Error fetching card image:', error);
        }
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
        commanderCard: commanderCard && cardWithImage ? cardWithImage : undefined,
        previewCard: !commanderCard && cardWithImage ? cardWithImage : undefined,
        colorDistribution: {},
        typeDistribution: {},
        creatureCount: 0,
        landCount: 0,
        spellCount: 0,
        artifactCount: 0
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
        <div className="aspect-[3/2] bg-muted rounded-t-lg" />
        <CardContent className="p-4 space-y-3">
          <div className="h-5 bg-muted rounded w-3/4" />
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="space-y-2">
            <div className="h-3 bg-muted rounded w-full" />
            <div className="h-3 bg-muted rounded w-2/3" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const commanderOrPreview = metrics?.commanderCard || metrics?.previewCard;
  const hasValidMetrics = metrics && !loadingMetrics;

  return (
    <Card className={cn("group hover:shadow-lg transition-all duration-300 overflow-hidden animate-fade-in w-full mb-4", className)}>
      <div className="flex w-full h-40">
        {/* Left - Card Image */}
        <div className="w-32 h-40 flex-shrink-0 relative bg-background">
          {commanderOrPreview?.image_url ? (
            <img 
              src={commanderOrPreview.image_url} 
              alt={commanderOrPreview.name}
              className="w-full h-full object-cover rounded-l-lg"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted rounded-l-lg">
              <Crown className="h-12 w-12 text-muted-foreground" />
            </div>
          )}
          
          {/* Commander Badge */}
          {metrics?.commanderCard && (
            <Badge variant="secondary" className="absolute top-2 left-2 text-xs">
              <Crown className="h-3 w-3 mr-1" />
              CMD
            </Badge>
          )}
        </div>

        {/* Middle - Main Info */}
        <div className="flex-1 p-4">
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <Badge className={cn("text-xs", formatColors[format as keyof typeof formatColors] || formatColors.custom)}>
              {format.toUpperCase()}
            </Badge>
            <PowerLevelBadge level={powerLevel} />
            <ManaSymbols colors={colors} size="sm" />
          </div>
          
          <h3 className="font-bold text-xl mb-2 group-hover:text-primary transition-colors">
            {name}
          </h3>
          
          {description && (
            <p className="text-sm text-muted-foreground line-clamp-1 mb-3">
              {description}
            </p>
          )}

          {/* Stats */}
          <div className="flex gap-6 text-sm">
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Cards</div>
              <div className="font-bold text-primary">{hasValidMetrics ? metrics.totalCards : cardCount}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">CMC</div>
              <div className="font-bold text-primary">{hasValidMetrics ? metrics.avgCmc.toFixed(1) : '0.0'}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Creatures</div>
              <div className="font-bold">{hasValidMetrics ? metrics.creatureCount : 0}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Lands</div>
              <div className="font-bold">{hasValidMetrics ? metrics.landCount : 0}</div>
            </div>
          </div>

          {/* Commander Info */}
          {commanderOrPreview && (
            <div className="mt-3">
              <div className="text-xs text-muted-foreground mb-1">
                {metrics?.commanderCard ? 'Commander' : 'Featured Card'}
              </div>
              <div className="text-sm font-medium">{commanderOrPreview.name}</div>
            </div>
          )}
        </div>

        {/* Right - Actions */}
        <div className="w-40 flex flex-col justify-center p-4 border-l bg-card/50">
          <div className="space-y-2">
            {onView && (
              <Button variant="outline" size="sm" onClick={onView} className="w-full text-xs">
                <Eye className="h-3 w-3 mr-1" />
                View
              </Button>
            )}
            {onEdit && (
              <Button size="sm" onClick={onEdit} className="w-full text-xs">
                <Edit className="h-3 w-3 mr-1" />
                Edit
              </Button>
            )}
            <div className="flex gap-1">
              {onDuplicate && (
                <Button variant="outline" size="sm" onClick={onDuplicate} className="flex-1 p-1">
                  <Copy className="h-3 w-3" />
                </Button>
              )}
              {onDelete && (
                <Button variant="outline" size="sm" onClick={onDelete} className="flex-1 p-1 text-destructive hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
          
          {lastModified && (
            <div className="text-xs text-muted-foreground mt-3 text-center">
              {lastModified instanceof Date ? lastModified.toLocaleDateString() : new Date(lastModified).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}