import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ShoppingCart, Plus, Minus, Heart, Edit2 } from 'lucide-react';
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
  const [quantity, setQuantity] = useState(1);
  const [priority, setPriority] = useState('medium');
  const [note, setNote] = useState('');

  // Update local state when item changes
  React.useEffect(() => {
    if (item) {
      setQuantity(item.quantity);
      setPriority(item.priority);
      setNote(item.note || '');
    }
  }, [item]);

  if (!item || !item.card) return null;

  const handleSave = () => {
    onUpdateItem(item.id, quantity, priority, note);
    onClose();
  };

  const handleAddToCollection = () => {
    onAddToCollection(item);
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

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high': return '🔥';
      case 'medium': return '⭐';
      case 'low': return '💭';
      default: return '';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-red-500" />
            Wishlist Card Details
          </DialogTitle>
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
              {/* Card Name and Mana Cost */}
              <div>
                <h2 className="text-2xl font-bold mb-2">{item.card.name}</h2>
                <div className="flex items-center gap-3 mb-3">
                  {item.card.mana_cost && (
                    <div className="flex items-center gap-1">
                      {/* Show mana cost as text for now - ManaSymbols component is different */}
                      <span className="px-2 py-1 bg-muted rounded text-sm font-mono">
                        {item.card.mana_cost}
                      </span>
                    </div>
                  )}
                  <span className="text-lg font-medium">CMC {item.card.cmc || 0}</span>
                </div>
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
                      Total: ${(parseFloat(item.card.prices.usd) * quantity).toFixed(2)}
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

          {/* Wishlist Controls */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Edit2 className="h-5 w-5" />
              Wishlist Settings
            </h3>

            {/* Quantity Control */}
            <div>
              <Label htmlFor="quantity" className="text-sm font-medium">
                Quantity Wanted
              </Label>
              <div className="flex items-center gap-3 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  max="99"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  className="w-20 text-center"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQuantity(Math.min(99, quantity + 1))}
                  disabled={quantity >= 99}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Priority */}
            <div>
              <Label htmlFor="priority" className="text-sm font-medium">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">💭 Low Priority</SelectItem>
                  <SelectItem value="medium">⭐ Medium Priority</SelectItem>
                  <SelectItem value="high">🔥 High Priority</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Note */}
            <div>
              <Label htmlFor="note" className="text-sm font-medium">Personal Notes</Label>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note about why you want this card..."
                rows={3}
                className="mt-2"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button onClick={handleAddToCollection} className="flex-1">
              <ShoppingCart className="h-4 w-4 mr-2" />
              Add to Collection
            </Button>
            <Button onClick={handleSave} variant="outline" className="flex-1">
              <Edit2 className="h-4 w-4 mr-2" />
              Update Wishlist
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}