import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface EditListingModalProps {
  isOpen: boolean;
  onClose: () => void;
  listing: any;
  onSave: (data: {
    id: string;
    price_usd: number;
    qty: number;
    condition: string;
    note?: string;
    status: string;
  }) => Promise<void>;
}

export function EditListingModal({ isOpen, onClose, listing, onSave }: EditListingModalProps) {
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [condition, setCondition] = useState('NM');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('active');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (listing) {
      setPrice(listing.price_usd?.toString() || '');
      setQuantity(listing.qty?.toString() || '1');
      setCondition(listing.condition || 'NM');
      setNote(listing.note || '');
      setStatus(listing.status || 'active');
    }
  }, [listing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!price || isNaN(parseFloat(price)) || !quantity || isNaN(parseInt(quantity))) return;

    setIsSubmitting(true);
    try {
      await onSave({
        id: listing.id,
        price_usd: parseFloat(price),
        qty: parseInt(quantity),
        condition,
        note: note || undefined,
        status,
      });
      onClose();
    } catch (error) {
      console.error('Error updating listing:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Listing</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="price">Price (USD)</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="1"
              required
            />
          </div>

          <div>
            <Label htmlFor="condition">Condition</Label>
            <Select value={condition} onValueChange={setCondition}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NM">Near Mint (NM)</SelectItem>
                <SelectItem value="LP">Lightly Played (LP)</SelectItem>
                <SelectItem value="MP">Moderately Played (MP)</SelectItem>
                <SelectItem value="HP">Heavily Played (HP)</SelectItem>
                <SelectItem value="DMG">Damaged (DMG)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="note">Notes (Optional)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Additional details about the card"
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
