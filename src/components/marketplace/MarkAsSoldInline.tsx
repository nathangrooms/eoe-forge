import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MarkAsSoldInlineProps {
  listing: { id: string; price_usd?: number | null };
  onCancel: () => void;
  onMarkAsSold: (data: {
    listing_id: string;
    sale_price_usd: number;
    platform: string;
    buyer_info?: string;
    notes?: string;
  }) => Promise<void>;
}

/**
 * "Mark as sold" is a confirmation with two fields attached, not a destination.
 * It expands inside the listing card that is being closed out, so the card, its
 * asking price and its condition stay visible while the sale is recorded.
 */
export function MarkAsSoldInline({ listing, onCancel, onMarkAsSold }: MarkAsSoldInlineProps) {
  const [salePrice, setSalePrice] = useState(listing?.price_usd?.toString() ?? '');
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
      onCancel();
    } catch (error) {
      console.error('Error marking as sold:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
      className="mt-3 space-y-3 rounded-md bg-muted/30 p-3"
    >
      <p className="text-sm font-medium text-foreground">Record this sale</p>

      <div className="space-y-1.5">
        <Label htmlFor={`sale-price-${listing.id}`} className="text-xs">Sale price (USD)</Label>
        <Input
          id={`sale-price-${listing.id}`}
          type="number"
          step="0.01"
          value={salePrice}
          onChange={(e) => setSalePrice(e.target.value)}
          placeholder="0.00"
          className="h-8"
          autoFocus
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`sale-platform-${listing.id}`} className="text-xs">Platform</Label>
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger id={`sale-platform-${listing.id}`} className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="direct">Direct sale</SelectItem>
            <SelectItem value="tcgplayer">TCGPlayer</SelectItem>
            <SelectItem value="cardmarket">Cardmarket</SelectItem>
            <SelectItem value="ebay">eBay</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
            <SelectItem value="local">Local store</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`sale-buyer-${listing.id}`} className="text-xs">Buyer (optional)</Label>
        <Input
          id={`sale-buyer-${listing.id}`}
          value={buyerInfo}
          onChange={(e) => setBuyerInfo(e.target.value)}
          placeholder="Buyer name or details"
          className="h-8"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`sale-notes-${listing.id}`} className="text-xs">Notes (optional)</Label>
        <Textarea
          id={`sale-notes-${listing.id}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Additional notes about the sale"
          rows={2}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? 'Recording...' : 'Confirm sale'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
