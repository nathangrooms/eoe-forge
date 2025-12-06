import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { 
  Heart, 
  Plus, 
  ExternalLink, 
  TrendingUp, 
  BarChart3,
  Crown,
  Zap,
  Shield,
  Users,
  Store
} from 'lucide-react';
import { StoreAvailabilityCheck } from '@/components/marketplace/StoreAvailabilityCheck';
import { CardPrintingComparison } from '@/components/cards/CardPrintingComparison';

interface CardModalProps {
  card: any;
  isOpen: boolean;
  onClose: () => void;
  onAddToCollection?: (card: any) => void;
  onAddToWishlist?: (card: any) => void;
  onAddToDeck?: (card: any) => void;
}

export function UniversalCardModal({ 
  card, 
  isOpen, 
  onClose, 
  onAddToCollection,
  onAddToWishlist,
  onAddToDeck 
}: CardModalProps) {
  const [rulings, setRulings] = useState<any[]>([]);
  const [loadingRulings, setLoadingRulings] = useState(false);

  useEffect(() => {
    if (isOpen && card) {
      loadRulings();
    }
  }, [isOpen, card]);

  const loadRulings = async () => {
    if (!card?.oracle_id) return;
    
    setLoadingRulings(true);
    try {
      // Simulate API call to Scryfall rulings
      setTimeout(() => {
        setRulings([
          {
            published_at: '2023-01-01',
            comment: 'Sample ruling about this card\'s interaction with other cards.'
          },
          {
            published_at: '2022-06-15', 
            comment: 'Additional clarification about timing and priority.'
          }
        ]);
        setLoadingRulings(false);
      }, 500);
    } catch (error) {
      console.error('Error loading rulings:', error);
      setLoadingRulings(false);
    }
  };

  const getPriceDisplay = () => {
    if (!card?.prices) return 'N/A';
    
    const usd = parseFloat(card.prices.usd || '0');
    const foil = parseFloat(card.prices.usd_foil || '0');
    
    if (usd > 0 && foil > 0) {
      return `$${usd.toFixed(2)} / $${foil.toFixed(2)} foil`;
    } else if (usd > 0) {
      return `$${usd.toFixed(2)}`;
    } else if (foil > 0) {
      return `$${foil.toFixed(2)} foil`;
    }
    
    return 'N/A';
  };

  const getColorIcons = (colors: string[]) => {
    if (!colors || colors.length === 0) return null;
    
    return colors.map(color => (
      <div
        key={color}
        className="w-5 h-5 rounded-full border-2 border-white text-xs font-bold flex items-center justify-center shadow-sm"
        style={{
          backgroundColor: {
            W: '#fffbd5',
            U: '#0e68ab',
            B: '#150b00',
            R: '#d3202a', 
            G: '#00733e'
          }[color],
          color: color === 'W' ? '#000' : '#fff'
        }}
      >
        {color}
      </div>
    ));
  };

  const getCardAnalysis = () => {
    if (!card) return null;

    // Get EDHREC rank from Scryfall data if available
    const edhrecRank = card.edhrec_rank;
    const pennyRank = card.penny_rank;
    
    // Calculate approximate scores based on available data
    const getRankScore = (rank: number | undefined, maxRank: number = 30000): number => {
      if (!rank) return 0;
      // Lower rank = better card = higher score
      const score = Math.max(0, 10 - (rank / maxRank) * 10);
      return Math.round(score * 10) / 10;
    };

    const edhPopularity = edhrecRank ? getRankScore(edhrecRank) : null;
    const budgetViability = pennyRank ? getRankScore(pennyRank, 10000) : null;

    // Estimate other metrics from card characteristics
    const hasRemoval = card.oracle_text?.toLowerCase().includes('destroy') || 
                       card.oracle_text?.toLowerCase().includes('exile');
    const hasDraw = card.oracle_text?.toLowerCase().includes('draw');
    const hasRamp = card.oracle_text?.toLowerCase().includes('add') && 
                    card.oracle_text?.toLowerCase().includes('mana');
    const isLegendary = card.type_line?.includes('Legendary');
    
    return (
      <div className="space-y-4">
        <h4 className="font-medium flex items-center">
          <BarChart3 className="h-4 w-4 mr-2" />
          Card Analysis
        </h4>
        
        {edhrecRank && (
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">EDHREC Rank</span>
              <span className="text-lg font-bold">#{edhrecRank.toLocaleString()}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {edhrecRank < 1000 ? 'Top-tier staple' :
               edhrecRank < 5000 ? 'Popular choice' :
               edhrecRank < 15000 ? 'Commonly played' : 'Niche pick'}
            </p>
          </div>
        )}

        <div className="space-y-3">
          {edhPopularity !== null && (
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>Commander Popularity</span>
                <span className="font-medium">{edhPopularity}/10</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${edhPopularity * 10}%` }}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${hasRemoval ? 'bg-red-500' : 'bg-muted'}`} />
              <span className={hasRemoval ? 'text-foreground' : 'text-muted-foreground'}>
                Removal
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${hasDraw ? 'bg-blue-500' : 'bg-muted'}`} />
              <span className={hasDraw ? 'text-foreground' : 'text-muted-foreground'}>
                Card Draw
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${hasRamp ? 'bg-green-500' : 'bg-muted'}`} />
              <span className={hasRamp ? 'text-foreground' : 'text-muted-foreground'}>
                Ramp
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isLegendary ? 'bg-amber-500' : 'bg-muted'}`} />
              <span className={isLegendary ? 'text-foreground' : 'text-muted-foreground'}>
                Commander
              </span>
            </div>
          </div>
        </div>

        {!edhrecRank && (
          <p className="text-sm text-muted-foreground">
            EDHREC rank not available for this card. View on EDHREC for detailed statistics.
          </p>
        )}
      </div>
    );
  };

  if (!card) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <span>{card.name}</span>
            {card.type_line?.includes('Legendary') && (
              <Crown className="h-4 w-4 text-yellow-500" />
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column - Card Image & Basic Info */}
          <div className="space-y-4">
            {/* Card Image */}
            <div className="flex justify-center">
              <div className="w-64 h-auto bg-muted rounded-lg overflow-hidden">
                {card.image_uris?.normal ? (
                  <img 
                    src={card.image_uris.normal}
                    alt={card.name}
                    className="w-full h-auto"
                  />
                ) : (
                  <div className="w-full h-80 flex items-center justify-center bg-muted">
                    <span className="text-muted-foreground">No image available</span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2">
              {onAddToCollection && (
                <Button onClick={() => onAddToCollection(card)} className="flex-1">
                  <Plus className="h-4 w-4 mr-2" />
                  Add to Collection
                </Button>
              )}
              {onAddToDeck && (
                <Button onClick={() => onAddToDeck(card)} variant="outline" className="flex-1">
                  <Plus className="h-4 w-4 mr-2" />
                  Add to Deck
                </Button>
              )}
              {onAddToWishlist && (
                <Button onClick={() => onAddToWishlist(card)} variant="outline">
                  <Heart className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Right Column - Detailed Information */}
          <div className="space-y-4">
            {/* Basic Details */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-lg">{card.cmc || 0}</span>
                    <span className="text-muted-foreground">CMC</span>
                  </div>
                  <div className="flex space-x-1">
                    {getColorIcons(card.colors)}
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Type</span>
                    <span className="text-sm font-medium">{card.type_line}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Set</span>
                    <Badge variant="outline" className="text-xs">
                      {card.set_code?.toUpperCase()} #{card.collector_number}
                    </Badge>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Rarity</span>
                    <Badge 
                      variant="outline" 
                      className={`text-xs capitalize ${
                        card.rarity === 'mythic' ? 'border-orange-500 text-orange-500' :
                        card.rarity === 'rare' ? 'border-yellow-500 text-yellow-500' :
                        card.rarity === 'uncommon' ? 'border-gray-500 text-gray-500' :
                        'border-gray-300 text-gray-600'
                      }`}
                    >
                      {card.rarity}
                    </Badge>
                  </div>

                  {(card.power !== undefined || card.toughness !== undefined) && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">P/T</span>
                      <span className="text-sm font-medium">
                        {card.power || '*'}/{card.toughness || '*'}
                      </span>
                    </div>
                  )}

                  {card.loyalty && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Loyalty</span>
                      <span className="text-sm font-medium">{card.loyalty}</span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Price</span>
                    <span className="text-sm font-medium text-green-600">
                      {getPriceDisplay()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Oracle Text */}
            {card.oracle_text && (
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-medium mb-2">Oracle Text</h4>
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {card.oracle_text}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Tabbed Content */}
            <Tabs defaultValue="rulings" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="rulings">Rulings</TabsTrigger>
                <TabsTrigger value="analysis">Analysis</TabsTrigger>
                <TabsTrigger value="legality">Legality</TabsTrigger>
                <TabsTrigger value="stores">Stores</TabsTrigger>
                <TabsTrigger value="printings">Printings</TabsTrigger>
              </TabsList>

              <TabsContent value="rulings" className="space-y-3">
                {loadingRulings ? (
                  <div className="space-y-2">
                    {[...Array(2)].map((_, i) => (
                      <div key={i} className="animate-pulse">
                        <div className="h-4 bg-muted rounded w-full mb-1" />
                        <div className="h-4 bg-muted rounded w-3/4" />
                      </div>
                    ))}
                  </div>
                ) : rulings.length > 0 ? (
                  rulings.map((ruling, index) => (
                    <div key={index} className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-sm">{ruling.comment}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(ruling.published_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No rulings available for this card.</p>
                )}
              </TabsContent>

              <TabsContent value="analysis">
                {getCardAnalysis()}
              </TabsContent>

              <TabsContent value="legality" className="space-y-3">
                {card.legalities ? (
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(card.legalities).map(([format, legality]) => (
                      <div key={format} className="flex justify-between items-center">
                        <span className="text-sm capitalize">{format}</span>
                        <Badge 
                          variant={
                            legality === 'legal' ? 'default' :
                            legality === 'restricted' ? 'secondary' : 'outline'
                          }
                          className={`text-xs ${
                            legality === 'legal' ? 'bg-green-500/10 text-green-700 border-green-500/30' :
                            legality === 'restricted' ? 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30' :
                            'bg-red-500/10 text-red-700 border-red-500/30'
                          }`}
                        >
                          {legality as string}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Legality information not available.</p>
                )}
              </TabsContent>

              <TabsContent value="stores" className="space-y-3">
                <StoreAvailabilityCheck 
                  cardName={card.name || ''} 
                  cardId={card.id || ''} 
                />
              </TabsContent>

              <TabsContent value="printings" className="space-y-3">
                <CardPrintingComparison 
                  cardName={card.name || ''} 
                  oracleId={card.oracle_id} 
                />
              </TabsContent>
            </Tabs>

            {/* External Links */}
            <div className="flex space-x-2">
              <Button variant="outline" size="sm" asChild>
                <a 
                  href={`https://scryfall.com/card/${card.set_code}/${card.collector_number}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Scryfall
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a 
                  href={`https://edhrec.com/cards/${encodeURIComponent(card.name?.replace(/\s+/g, '-').toLowerCase() || '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  EDHREC
                </a>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}