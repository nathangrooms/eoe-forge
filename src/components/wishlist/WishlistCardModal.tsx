import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ShoppingCart, Plus, Minus } from 'lucide-react';
import { ManaSymbols } from '@/components/ui/mana-symbols';

interface WishlistItem {
  id: string;
  card_id: string;
  card_name: string;
  quantity: number;
  priority: string;
  note?: string;
  created_at: string;
  card?: {
    id?: string;
    name: string;
    set_code: string;
    type_line: string;
    colors: string[];
    color_identity?: string[];
    rarity: string;
    cmc?: number;
    mana_cost?: string;
    oracle_text?: string;
    power?: string;
    toughness?: string;
    keywords?: string[];
    prices?: {
      usd?: string;
      usd_foil?: string;
    };
    image_uris?: {
      small?: string;
      normal?: string;
    };
  };
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
  const [collectionQuantity, setCollectionQuantity] = useState(1);

  if (!item || !item.card) return null;

  const handleAddToCollection = () => {
    // Create a modified item with the selected quantity
    const modifiedItem = {
      ...item,
      quantity: collectionQuantity
    };
    onAddToCollection(modifiedItem);
    onClose();
  };

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'mythic': return 'text-orange-500 border-orange-500';
      case 'rare': return 'text-yellow-500 border-yellow-500';
      case 'uncommon': return 'text-gray-400 border-gray-400';
      case 'common': return 'text-gray-600 border-gray-600';
      default: return 'text-gray-500 border-gray-500';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item.card.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Card Image and Basic Info */}
          <div className="flex gap-6">
            <div className="w-48 h-64 bg-muted rounded-lg overflow-hidden flex-shrink-0">
              {item.card.image_uris?.normal ? (
                <img
                  src={item.card.image_uris.normal}
                  alt={item.card.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  No Image
                </div>
              )}
            </div>

            <div className="flex-1 space-y-4">
              {/* Mana Cost and CMC */}
              <div className="flex items-center gap-3">
                {item.card.mana_cost && (
                  <div className="flex items-center gap-1">
                    <span className="px-2 py-1 bg-muted rounded text-sm font-mono">
                      {item.card.mana_cost}
                    </span>
                  </div>
                )}
                <span className="text-lg font-medium">CMC {item.card.cmc || 0}</span>
              </div>

              {/* Type Line */}
              <div>
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-1">
                  Type
                </h3>
                <p className="text-lg">{item.card.type_line}</p>
              </div>

              {/* Card Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-1">
                    Set
                  </h3>
                  <Badge variant="outline">{item.card.set_code?.toUpperCase()}</Badge>
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-1">
                    Rarity
                  </h3>
                  <Badge variant="outline" className={`capitalize ${getRarityColor(item.card.rarity)}`}>
                    {item.card.rarity}
                  </Badge>
                </div>
              </div>

              {/* Power/Toughness */}
              {item.card.power && item.card.toughness && (
                <div>
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-1">
                    Power / Toughness
                  </h3>
                  <p className="text-lg font-mono">{item.card.power} / {item.card.toughness}</p>
                </div>
              )}

              {/* Price */}
              {item.card.prices?.usd && (
                <div>
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-1">
                    Price
                  </h3>
                  <div className="flex items-center gap-4">
                    <span className="text-lg font-bold text-green-600">
                      ${item.card.prices.usd}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      Total: ${(parseFloat(item.card.prices.usd) * collectionQuantity).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Oracle Text */}
          {item.card.oracle_text && (
            <div>
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">
                Card Text
              </h3>
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="whitespace-pre-wrap leading-relaxed">{item.card.oracle_text}</p>
              </div>
            </div>
          )}

          {/* Keywords */}
          {item.card.keywords && item.card.keywords.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">
                Keywords
              </h3>
              <div className="flex flex-wrap gap-2">
                {item.card.keywords.map((keyword, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {keyword}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Quantity Controls and Add to Collection Button */}
          <div className="space-y-4">
            {/* Quantity Control */}
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCollectionQuantity(Math.max(1, collectionQuantity - 1))}
                disabled={collectionQuantity <= 1}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-12 text-center font-medium">{collectionQuantity}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCollectionQuantity(Math.min(99, collectionQuantity + 1))}
                disabled={collectionQuantity >= 99}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Add to Collection Button */}
            <Button onClick={handleAddToCollection} className="w-full" size="lg">
              <ShoppingCart className="h-4 w-4 mr-2" />
              Add to Collection
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}