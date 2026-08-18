import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

/**
 * /marketplace/listing/:id/edit — editing a listing you are asking money for is
 * a destination, not an overlay. It has a URL, a back control, and Back leaves
 * without silently discarding the page behind it.
 */
export default function ListingEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [cardName, setCardName] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [condition, setCondition] = useState('NM');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('active');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!id) return;
      setLoading(true);
      const { data, error } = await supabase
        .from('listings')
        .select('*, cards(name, set_code)')
        .eq('id', id)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const listing = data as any;
      setCardName(listing.cards?.name || listing.card_id);
      setPrice(listing.price_usd?.toString() ?? '');
      setQuantity(listing.qty?.toString() ?? '1');
      setCondition(listing.condition || 'NM');
      setNote(listing.note || '');
      setStatus(listing.status || 'active');
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    if (!price || isNaN(parseFloat(price)) || !quantity || isNaN(parseInt(quantity))) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('listings')
        .update({
          price_usd: parseFloat(price),
          qty: parseInt(quantity),
          condition,
          note: note || null,
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      showSuccess('Listing updated', 'Your changes have been saved');
      navigate('/marketplace', { replace: true });
    } catch (error) {
      console.error('Error updating listing:', error);
      showError('Error', 'Failed to update listing');
    } finally {
      setIsSubmitting(false);
    }
  };

  const backControl = (
    <Button variant="ghost" onClick={() => navigate('/marketplace')} className="gap-2">
      <ArrowLeft className="h-4 w-4" />
      Marketplace
    </Button>
  );

  if (loading) {
    return (
      <StandardPageLayout title="Edit listing" action={backControl}>
        <div className="max-w-xl space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </StandardPageLayout>
    );
  }

  if (notFound) {
    return (
      <StandardPageLayout title="Edit listing" action={backControl}>
        <div className="max-w-xl rounded-lg bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">
            That listing no longer exists.
          </p>
          <Button className="mt-4" onClick={() => navigate('/marketplace')}>
            Back to marketplace
          </Button>
        </div>
      </StandardPageLayout>
    );
  }

  return (
    <StandardPageLayout
      title="Edit listing"
      description={cardName}
      action={backControl}
    >
      <form onSubmit={handleSubmit} className="max-w-xl space-y-4 rounded-lg bg-card p-4 shadow-sm md:p-6">
        <div className="space-y-1.5">
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

        <div className="space-y-1.5">
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

        <div className="space-y-1.5">
          <Label htmlFor="condition">Condition</Label>
          <Select value={condition} onValueChange={setCondition}>
            <SelectTrigger id="condition">
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

        <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="note">Notes (optional)</Label>
          <Textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Additional details about the card"
            rows={2}
          />
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save changes'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => navigate('/marketplace')}>
            Cancel
          </Button>
        </div>
      </form>
    </StandardPageLayout>
  );
}
