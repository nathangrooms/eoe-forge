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
  Users
} from 'lucide-react';

interface WishlistItem {
  id: string;
  card_id: string;
  card_name: string;
  quantity: number;
  priority: string;
  note?: string;
  created_at: string;
  card?: any;
}

interface WishlistCardModalProps {
  item: WishlistItem | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateItem: (id: string, quantity: number, priority: string, note: string) => void;
  onAddToCollection: (item: WishlistItem) => void;
}

export function WishlistCardModal({
  item,
  isOpen,
  onClose,
  onUpdateItem,
  onAddToCollection
}: WishlistCardModalProps) {
  const [rulings, setRulings] = useState<any[]>([]);
  const [loadingRulings, setLoadingRulings] = useState(false);

  useEffect(() => {
    if (isOpen && item?.card) {
      loadRulings();
    }
  }, [isOpen, item]);

  const loadRulings = async () => {
    if (!item?.card?.oracle_id) return;
    
    setLoadingRulings(true);
    try {
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

  if (!item?.card) return null;

  const card = item.card;

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

  const getRarityDisplay = () => {
    switch (card.rarity) {
      case 'mythic': return { text: 'Mythic', color: 'text-orange-500' };
      case 'rare': return { text: 'Rare', color: 'text-yellow-500' };
      case 'uncommon': return { text: 'Uncommon', color: 'text-gray-400' };
      case 'common': return { text: 'Common', color: 'text-gray-600' };
      default: return { text: card.rarity || 'Unknown', color: 'text-gray-500' };
    }
  };

  const rarity = getRarityDisplay();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-background">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {card.name}
            <Crown className="h-5 w-5 text-yellow-500" />
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Card Image */}
          <div className="space-y-4">
            <div className="aspect-[5/7] w-full max-w-sm mx-auto bg-muted rounded-lg overflow-hidden">
              {card.image_uris?.normal ? (
                <img
                  src={card.image_uris.normal}
                  alt={card.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  No Image Available
                </div>
              )}
            </div>
            
            <Button 
              className="w-full" 
              size="lg"
              onClick={() => onAddToCollection(item)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add to Collection
            </Button>
            
            <Button variant="outline" size="sm" className="w-full">
              <Heart className="h-4 w-4 mr-2" />
              Add to Wishlist
            </Button>
          </div>

          {/* Right Column - Card Details */}
          <div className="space-y-6">
            {/* Header Info */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold text-muted-foreground">
                  {card.cmc || 0}
                </div>
                <div className="text-sm text-muted-foreground">CMC</div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Type</span>
                  <span className="font-medium">{card.type_line}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Set</span>
                  <span className="font-medium">#{card.collector_number || '79'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Rarity</span>
                  <Badge variant="outline" className={rarity.color}>
                    {rarity.text}
                  </Badge>
                </div>
                {card.loyalty && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Loyalty</span>
                    <span className="font-medium">{card.loyalty}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Price</span>
                  <span className="font-bold text-green-600">{getPriceDisplay()}</span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Oracle Text */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Oracle Text</h3>
              <div className="bg-muted/30 p-4 rounded-lg">
                <p className="whitespace-pre-wrap leading-relaxed">
                  {card.oracle_text || 'No oracle text available.'}
                </p>
              </div>
            </div>

            {/* Tabs for additional info */}
            <Tabs defaultValue="rulings" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="rulings">Rulings</TabsTrigger>
                <TabsTrigger value="analysis">Analysis</TabsTrigger>
                <TabsTrigger value="legality">Legality</TabsTrigger>
              </TabsList>
              
              <TabsContent value="rulings" className="space-y-4">
                {loadingRulings ? (
                  <div className="text-center py-4">Loading rulings...</div>
                ) : (
                  <div className="space-y-3">
                    {rulings.map((ruling, index) => (
                      <div key={index} className="p-3 bg-muted/20 rounded">
                        <p className="text-sm mb-2">{ruling.comment}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(ruling.published_at).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="analysis" className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Card analysis and statistics would go here.
                </div>
              </TabsContent>
              
              <TabsContent value="legality" className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span>Standard:</span>
                    <Badge variant="outline">Legal</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Pioneer:</span>
                    <Badge variant="outline">Legal</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Modern:</span>
                    <Badge variant="outline">Legal</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Commander:</span>
                    <Badge variant="outline">Legal</Badge>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* External Links */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1">
                <ExternalLink className="h-4 w-4 mr-2" />
                Scryfall
              </Button>
              <Button variant="outline" size="sm" className="flex-1">
                <ExternalLink className="h-4 w-4 mr-2" />
                EDHREC
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}