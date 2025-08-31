import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ListingFormData, ListingVisibility } from '@/types/listing';
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
    card_id: card?.id || '',
    qty: 1,
    foil: false,
    condition: 'NM',
    price_usd: defaultPrice,
    note: '',
    visibility: 'private' as ListingVisibility,
    status: 'draft'
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

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
                onCheckedChange={(checked) => setFormData(prev => ({ 
                  ...prev, 
                  foil: checked,
                  qty: Math.min(checked ? ownedFoil : ownedQuantity, prev.qty)
                }))}
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
            </div>

            {/* Visibility */}
            <div>
              <Label htmlFor="visibility">Visibility</Label>
              <Select value={formData.visibility} onValueChange={(value: ListingVisibility) => 
                setFormData(prev => ({ ...prev, visibility: value }))
              }>
                <SelectTrigger>
                  <SelectValue placeholder="Select visibility" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                </SelectContent>
              </Select>
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