import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ListingFormData } from '@/types/listing';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

interface SellCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  card: any;
  ownedQuantity: number;
  ownedFoil: number;
  defaultPrice?: number;
  onSubmit: (data: ListingFormData) => Promise<void>;
}

// Get the card_id from either the collection item or the card data
const getCardId = (card: any) => {
  return card?.card_id || card?.id || '';
};

// Get the current market price for the card
const getCardPrice = (card: any, foil: boolean = false): number => {
  if (!card?.card?.prices && !card?.prices) return 0;
  
  const prices = card?.card?.prices || card?.prices;
  
  if (foil) {
    return parseFloat(prices?.usd_foil || '0');
  }
  
  return parseFloat(prices?.usd || '0');
};

export function SellCardModal({
  isOpen,
  onClose,
  card,
  ownedQuantity,
  ownedFoil,
  defaultPrice = 0,
  onSubmit
}: SellCardModalProps) {
  const [formData, setFormData] = useState<ListingFormData>({
    card_id: getCardId(card),
    qty: 1,
    foil: false,
    condition: 'NM',
    price_usd: 0,
    note: '',
    visibility: 'public',
    status: 'draft'
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update price when foil status changes or modal opens
  useEffect(() => {
    if (isOpen && card) {
      const marketPrice = getCardPrice(card, formData.foil);
      setFormData(prev => ({
        ...prev,
        card_id: getCardId(card),
        price_usd: marketPrice || defaultPrice
      }));
    }
  }, [isOpen, card, formData.foil, defaultPrice]);

  const maxQuantity = formData.foil ? ownedFoil : ownedQuantity;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.qty > maxQuantity) {
      showError('Invalid quantity', `You only own ${maxQuantity} ${formData.foil ? 'foil' : 'non-foil'} copies`);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      showSuccess('Listing created', 'Your card has been listed for sale');
      onClose();
    } catch (error) {
      showError('Failed to create listing', 'Please try again');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>List Card for Sale</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Card Info */}
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            {card?.image_uris?.small && (
              <img
                src={card.image_uris.small}
                alt={card.name}
                className="w-12 h-16 object-cover rounded"
              />
            )}
            <div>
              <h3 className="font-medium">{card?.name}</h3>
              <p className="text-sm text-muted-foreground">{card?.set_name}</p>
              <div className="flex gap-2 mt-1">
                <Badge variant="outline" className="text-xs">
                  Owned: {ownedQuantity} regular, {ownedFoil} foil
                </Badge>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Quantity */}
            <div>
              <Label htmlFor="qty">Quantity</Label>
              <Input
                id="qty"
                type="number"
                min={1}
                max={maxQuantity}
                value={formData.qty}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  qty: Math.min(maxQuantity, Math.max(1, parseInt(e.target.value) || 1))
                }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Max: {maxQuantity} {formData.foil ? 'foil' : 'regular'} copies
              </p>
            </div>

            {/* Foil Toggle */}
            <div className="flex items-center justify-between">
              <Label htmlFor="foil">Foil Version</Label>
              <Switch
                id="foil"
                checked={formData.foil}
                onCheckedChange={(checked) => {
                  const newPrice = getCardPrice(card, checked);
                  setFormData(prev => ({ 
                    ...prev, 
                    foil: checked,
                    qty: Math.min(checked ? ownedFoil : ownedQuantity, prev.qty),
                    price_usd: newPrice || prev.price_usd
                  }));
                }}
              />
            </div>

            {/* Condition */}
            <div>
              <Label htmlFor="condition">Condition</Label>
              <Select value={formData.condition} onValueChange={(value) => 
                setFormData(prev => ({ ...prev, condition: value }))
              }>
                <SelectTrigger>
                  <SelectValue placeholder="Select condition" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NM">Near Mint (NM)</SelectItem>
                  <SelectItem value="LP">Lightly Played (LP)</SelectItem>
                  <SelectItem value="MP">Moderately Played (MP)</SelectItem>
                  <SelectItem value="HP">Heavily Played (HP)</SelectItem>
                  <SelectItem value="D">Damaged (D)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Price */}
            <div>
              <Label htmlFor="price_usd">Price (USD)</Label>
              <Input
                id="price_usd"
                type="number"
                step="0.01"
                min={0}
                value={formData.price_usd}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  price_usd: Math.max(0, parseFloat(e.target.value) || 0)
                }))}
              />
              {getCardPrice(card, formData.foil) > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Market price: ${getCardPrice(card, formData.foil).toFixed(2)} {formData.foil ? '(foil)' : ''}
                </p>
              )}
            </div>

            {/* Note */}
            <div>
              <Label htmlFor="note">Note (Optional)</Label>
              <Textarea
                id="note"
                placeholder="Add any additional notes about this listing..."
                value={formData.note}
                onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
                rows={2}
              />
            </div>

            {/* Submit Buttons */}
            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormData(prev => ({ ...prev, status: 'draft' }))}
                disabled={isSubmitting}
                className="flex-1"
              >
                Save as Draft
              </Button>
              <Button
                type="submit"
                onClick={() => setFormData(prev => ({ ...prev, status: 'active' }))}
                disabled={isSubmitting}
                className="flex-1"
              >
                {isSubmitting ? 'Creating...' : 'List for Sale'}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}