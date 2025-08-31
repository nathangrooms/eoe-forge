import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ManaSymbols } from '@/components/ui/mana-symbols';
import { 
  Plus, 
  Heart, 
  Star, 
  TrendingUp, 
  BarChart3, 
  DollarSign,
  Eye,
  ExternalLink,
  Copy,
  Share
} from 'lucide-react';
import { showSuccess } from '@/components/ui/toast-helpers';

interface UniversalCardModalProps {
  card: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCardAdd?: (card: any) => void;
  onCardWishlist?: (card: any) => void;
  showAddButton?: boolean;
  showWishlistButton?: boolean;
}

export function UniversalCardModal({
  card,
  open,
  onOpenChange,
  onCardAdd,
  onCardWishlist,
  showAddButton = true,
  showWishlistButton = false
}: UniversalCardModalProps) {
  if (!card) return null;

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'mythic': return 'text-orange-500 border-orange-500';
      case 'rare': return 'text-yellow-500 border-yellow-500';
      case 'uncommon': return 'text-gray-400 border-gray-400';
      case 'common': return 'text-gray-600 border-gray-600';
      default: return 'text-gray-500 border-gray-500';
    }
  };

  const getColorIndicators = (colors: string[]) => {
    if (!colors || colors.length === 0) return null;
    
    const colorMap: Record<string, { bg: string; text: string; name: string }> = {
      W: { bg: 'bg-yellow-100', text: 'text-yellow-800', name: 'White' },
      U: { bg: 'bg-blue-500', text: 'text-white', name: 'Blue' },
      B: { bg: 'bg-gray-800', text: 'text-white', name: 'Black' },
      R: { bg: 'bg-red-500', text: 'text-white', name: 'Red' },
      G: { bg: 'bg-green-500', text: 'text-white', name: 'Green' }
    };
    
    return (
      <div className="flex items-center gap-2">
        {colors.map((color, index) => (
          <div key={index} className="flex items-center gap-1">
            <div className={`w-6 h-6 rounded-full ${colorMap[color]?.bg} ${colorMap[color]?.text} flex items-center justify-center text-xs font-bold`}>
              {color}
            </div>
            <span className="text-sm">{colorMap[color]?.name}</span>
          </div>
        ))}
      </div>
    );
  };

  const handleAddCard = () => {
    onCardAdd?.(card);
    showSuccess("Card Added", `Added ${card.name}`);
  };

  const handleWishlist = () => {
    onCardWishlist?.(card);
    showSuccess("Added to Wishlist", `Added ${card.name} to wishlist`);
  };

  const copyCardName = () => {
    navigator.clipboard.writeText(card.name);
    showSuccess("Copied", "Card name copied to clipboard");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {card.name}
            <Button
              variant="ghost"
              size="sm"
              onClick={copyCardName}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="market">Market</TabsTrigger>
            <TabsTrigger value="prints">Prints</TabsTrigger>
            <TabsTrigger value="synergy">Synergy</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Card Image */}
              <div className="space-y-4">
                <div className="aspect-[5/7] overflow-hidden rounded-lg border">
                  {card.image_uris?.normal ? (
                    <img 
                      src={card.image_uris.normal}
                      alt={card.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <p className="text-muted-foreground">No image available</p>
                    </div>
                  )}
                </div>
                
                {/* Quick Actions */}
                <div className="flex gap-2">
                  {showAddButton && onCardAdd && (
                    <Button onClick={handleAddCard} className="flex-1">
                      <Plus className="h-4 w-4 mr-2" />
                      Add to Collection
                    </Button>
                  )}
                  {showWishlistButton && onCardWishlist && (
                    <Button variant="outline" onClick={handleWishlist}>
                      <Heart className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="outline" asChild>
                    <a href={`https://scryfall.com/card/${card.set}/${card.collector_number}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>

              {/* Card Details */}
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Card Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Type</label>
                        <p className="font-medium">{card.type_line}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Mana Cost</label>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-sm">{card.mana_cost || `{${card.cmc}}`}</span>
                          <span className="text-sm text-muted-foreground">({card.cmc})</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Set</label>
                        <p className="font-medium">{card.set?.toUpperCase()} #{card.collector_number}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Rarity</label>
                        <Badge variant="outline" className={`capitalize ${getRarityColor(card.rarity)}`}>
                          {card.rarity}
                        </Badge>
                      </div>
                      {card.power && card.toughness && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Power/Toughness</label>
                          <p className="font-medium">{card.power}/{card.toughness}</p>
                        </div>
                      )}
                      {card.loyalty && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Loyalty</label>
                          <p className="font-medium">{card.loyalty}</p>
                        </div>
                      )}
                    </div>

                    <Separator />

                    {/* Colors */}
                    {card.colors && card.colors.length > 0 && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Colors</label>
                        <div className="mt-2">
                          {getColorIndicators(card.colors)}
                        </div>
                      </div>
                    )}

                    {/* Oracle Text */}
                    {card.oracle_text && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Oracle Text</label>
                        <p className="text-sm mt-1 whitespace-pre-line">{card.oracle_text}</p>
                      </div>
                    )}

                    {/* Keywords */}
                    {card.keywords && card.keywords.length > 0 && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Keywords</label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {card.keywords.map((keyword: string, index: number) => (
                            <Badge key={index} variant="secondary">{keyword}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Format Legalities */}
                {card.legalities && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Format Legalities</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(card.legalities).map(([format, legality]) => (
                          <div key={format} className="flex items-center justify-between">
                            <span className="text-sm capitalize">{format}</span>
                            <Badge 
                              variant={legality === 'legal' ? 'default' : 'destructive'}
                              className="text-xs"
                            >
                              {legality as string}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="market" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Market Prices
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {card.prices?.usd && (
                    <div className="text-center p-3 border rounded-lg">
                      <p className="text-sm text-muted-foreground">Normal</p>
                      <p className="text-lg font-bold">${card.prices.usd}</p>
                    </div>
                  )}
                  {card.prices?.usd_foil && (
                    <div className="text-center p-3 border rounded-lg">
                      <p className="text-sm text-muted-foreground">Foil</p>
                      <p className="text-lg font-bold">${card.prices.usd_foil}</p>
                    </div>
                  )}
                  {card.prices?.eur && (
                    <div className="text-center p-3 border rounded-lg">
                      <p className="text-sm text-muted-foreground">EUR</p>
                      <p className="text-lg font-bold">€{card.prices.eur}</p>
                    </div>
                  )}
                  {card.prices?.eur_foil && (
                    <div className="text-center p-3 border rounded-lg">
                      <p className="text-sm text-muted-foreground">EUR Foil</p>
                      <p className="text-lg font-bold">€{card.prices.eur_foil}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="prints" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>All Printings</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Loading other printings...</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="synergy" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Synergy Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Synergy analysis coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}