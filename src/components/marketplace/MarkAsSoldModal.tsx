import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MarkAsSoldModalProps {
  isOpen: boolean;
  onClose: () => void;
  listing: any;
  onMarkAsSold: (data: {
    listing_id: string;
    sale_price_usd: number;
    platform: string;
    buyer_info?: string;
    notes?: string;
  }) => Promise<void>;
}

export function MarkAsSoldModal({ isOpen, onClose, listing, onMarkAsSold }: MarkAsSoldModalProps) {
  const [salePrice, setSalePrice] = useState(listing?.price_usd?.toString() || '');
  const [platform, setPlatform] = useState('direct');
  const [buyerInfo, setBuyerInfo] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salePrice || isNaN(parseFloat(salePrice))) return;

    setIsSubmitting(true);
    try {
      await onMarkAsSold({
        listing_id: listing.id,
        sale_price_usd: parseFloat(salePrice),
        platform,
        buyer_info: buyerInfo || undefined,
        notes: notes || undefined,
      });
      onClose();
    } catch (error) {
      console.error('Error marking as sold:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mark as Sold</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="salePrice">Sale Price (USD)</Label>
            <Input
              id="salePrice"
              type="number"
              step="0.01"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <Label htmlFor="platform">Platform</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="direct">Direct Sale</SelectItem>
                <SelectItem value="tcgplayer">TCGPlayer</SelectItem>
                <SelectItem value="cardmarket">Cardmarket</SelectItem>
                <SelectItem value="ebay">eBay</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="local">Local Store</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="buyerInfo">Buyer Info (Optional)</Label>
            <Input
              id="buyerInfo"
              value={buyerInfo}
              onChange={(e) => setBuyerInfo(e.target.value)}
              placeholder="Buyer name or details"
            />
          </div>

          <div>
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes about the sale"
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Processing...' : 'Mark as Sold'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}