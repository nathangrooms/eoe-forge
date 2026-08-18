import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ListingFormData, ListingStatus } from '@/types/listing';
import { showError } from '@/components/ui/toast-helpers';
import { formatPrice } from '@/components/collection/browser/types';
import { CardImage } from '@/components/cards';

interface SellCardFormProps {
  card: any;
  ownedQuantity: number;
  ownedFoil: number;
  defaultPrice?: number;
  onSubmit: (data: ListingFormData) => Promise<void>;
  onCancel: () => void;
}

/** The card_id lives on the collection row or on the card itself. */
const getCardId = (card: any) => card?.card_id || card?.id || '';

const getCardPrice = (card: any, foil = false): number => {
  if (!card) return 0;
  const prices = card?.card?.prices || card?.prices || card?.card?.card?.prices;
  if (!prices) return 0;
  return parseFloat((foil ? prices?.usd_foil : prices?.usd) || '0');
};

/**
 * Was `SellCardModal`. Publishing a listing puts a price on something you own,
 * so it gets a page you can land on, review and back out of — not a 425px
 * dialog. This is the form body; `/marketplace/list/:collectionItemId` owns the
 * page furniture and the write.
 */
export function SellCardForm({
  card,
  ownedQuantity,
  ownedFoil,
  defaultPrice = 0,
  onSubmit,
  onCancel,
}: SellCardFormProps) {
  const [formData, setFormData] = useState<ListingFormData>(() => ({
    card_id: getCardId(card),
    qty: 1,
    foil: false,
    condition: 'NM',
    price_usd: getCardPrice(card, false) || defaultPrice,
    note: '',
    visibility: 'public',
    status: 'draft',
  }));

  const [isSubmitting, setIsSubmitting] = useState(false);

  const maxQuantity = formData.foil ? ownedFoil : ownedQuantity;
  const cardData = card?.card ?? card;

  const submit = async (status: ListingStatus) => {
    if (formData.qty > maxQuantity) {
      showError(
        'Invalid quantity',
        `You only own ${maxQuantity} ${formData.foil ? 'foil' : 'non-foil'} copies`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({ ...formData, card_id: getCardId(card), status });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        submit('active');
      }}
      className="space-y-5"
    >
      <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-3">
        {/* You are about to price this specific printing, so it is shown as a
            card, at the resolution it is drawn at — not a 146px thumbnail. */}
        <CardImage
          card={cardData ?? { name: card?.card_name }}
          width={64}
          hideFlip
          interactive={false}
        />
        <div>
          <h3 className="font-medium">{card?.card_name ?? cardData?.name}</h3>
          <p className="text-sm text-muted-foreground">
            {cardData?.set_name ?? cardData?.set_code?.toUpperCase()}
          </p>
          <Badge variant="secondary" className="mt-1 text-xs">
            Owned: {ownedQuantity} regular, {ownedFoil} foil
          </Badge>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="qty">Quantity</Label>
          <Input
            id="qty"
            type="number"
            min={1}
            max={maxQuantity}
            value={formData.qty}
            onChange={e =>
              setFormData(prev => ({
                ...prev,
                qty: Math.min(maxQuantity, Math.max(1, parseInt(e.target.value) || 1)),
              }))
            }
            className="border-0 bg-muted/40"
          />
          <p className="text-xs text-muted-foreground">
            Max: {maxQuantity} {formData.foil ? 'foil' : 'regular'} copies
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="price_usd">Price (USD)</Label>
          <Input
            id="price_usd"
            type="number"
            step="0.01"
            min={0}
            value={formData.price_usd}
            onChange={e =>
              setFormData(prev => ({
                ...prev,
                price_usd: Math.max(0, parseFloat(e.target.value) || 0),
              }))
            }
            className="border-0 bg-muted/40"
          />
          {getCardPrice(card, formData.foil) > 0 && (
            <p className="text-xs text-muted-foreground">
              Market price: {formatPrice(getCardPrice(card, formData.foil))}
              {formData.foil ? ' (foil)' : ''}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="condition">Condition</Label>
          <Select
            value={formData.condition}
            onValueChange={value => setFormData(prev => ({ ...prev, condition: value }))}
          >
            <SelectTrigger id="condition" className="border-0 bg-muted/40">
              <SelectValue placeholder="Select condition" />
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

        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
          <Label htmlFor="foil">Foil printing</Label>
          <Switch
            id="foil"
            checked={formData.foil}
            onCheckedChange={checked => {
              const newPrice = getCardPrice(card, checked);
              setFormData(prev => ({
                ...prev,
                foil: checked,
                qty: Math.min(checked ? ownedFoil : ownedQuantity, prev.qty) || 1,
                price_usd: newPrice || prev.price_usd,
              }));
            }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">Note (optional)</Label>
        <Textarea
          id="note"
          placeholder="Anything a buyer should know about this copy..."
          value={formData.note}
          onChange={e => setFormData(prev => ({ ...prev, note: e.target.value }))}
          rows={3}
          className="border-0 bg-muted/40"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting} className="min-w-[10rem]">
          {isSubmitting ? 'Creating...' : 'List for sale'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => submit('draft')}
          disabled={isSubmitting}
        >
          Save as draft
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
