import { useEffect, useMemo, useState } from 'react';
import { Loader2, Minus, Plus } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CardImage } from '@/components/cards';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { formatAmount, readPrices } from '@/lib/pricing';
import { useCardLists, type ShoppingEntry } from '@/lib/shopping';

/**
 * Recording a purchase.
 *
 * A right-hand slide-out, per design law: this is an action taken without
 * leaving the list, so the list stays on screen behind it with its scroll
 * position intact.
 *
 * WHAT IS ASKED FOR AND WHY
 * -------------------------
 * How many copies, what was paid for one of them, and when. The price paid is
 * a genuinely different fact from what the card is worth today, and the
 * collection is eventually going to want both: "it cost me £40" and "it is
 * worth £70" are the two halves of the only interesting question about a
 * collection.
 *
 * The price is OPTIONAL and the panel says so. Cards bought in a bundle have no
 * sensible per card price, and forcing a number would mean the player invents
 * one. Unknown and zero are different, so a blank stays blank.
 *
 * Today's market price is shown as a hint, clearly labelled as today's price.
 * It is never pre-filled into the field: a prefilled number is one Save away
 * from becoming a claim about what somebody paid.
 */

export interface MarkBoughtPanelProps {
  entry: ShoppingEntry | null;
  onOpenChange: (open: boolean) => void;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function MarkBoughtPanel({ entry, onOpenChange }: MarkBoughtPanelProps) {
  const markBought = useCardLists(state => state.markBought);
  const add = useCardLists(state => state.add);

  const [copies, setCopies] = useState(1);
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'EUR'>('USD');
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setCopies(entry.quantity);
    setPrice('');
    setDate(todayISO());
  }, [entry]);

  const hints = useMemo(() => {
    if (!entry?.card) return [];
    const reading = readPrices(entry.card);
    return reading.known
      .filter(source => source.finish === entry.finish || source.currency === 'TIX')
      .filter(source => source.currency !== 'TIX')
      .map(source => `${source.marketName} has it at ${formatAmount(source.amount, source.currency)} today`);
  }, [entry]);

  const submit = async () => {
    if (!entry) return;
    const trimmed = price.trim();
    const paid = trimmed === '' ? null : Number(trimmed);
    if (paid != null && (!Number.isFinite(paid) || paid <= 0)) {
      showError('That price does not look right', 'Leave it blank if you do not know what you paid.');
      return;
    }

    setSaving(true);
    try {
      // A card that got onto the list from a deck or the wishlist has no row of
      // its own yet. Buying it is the moment it earns one, because from here on
      // there is a date and a price to hold.
      let itemId = entry.item?.id ?? null;
      if (!itemId) {
        const created = await add({
          kind: 'shopping',
          cardId: entry.cardId,
          cardName: entry.cardName,
          oracleId: entry.card?.oracle_id ?? null,
          quantity: entry.quantity,
          finish: entry.finish,
          source: 'manual',
        });
        // `add` refreshes the store; re-read the row it just wrote.
        itemId =
          useCardLists
            .getState()
            .shopping.find(
              row => row.status === 'want' && row.card_id === entry.cardId && row.finish === entry.finish
            )?.id ?? null;
        if (!itemId) throw new Error('Could not record that purchase. Please try again.');
      }

      await markBought({
        itemId,
        quantity: copies,
        paidUnit: paid,
        paidCurrency: paid == null ? null : currency,
        boughtAt: new Date(`${date}T12:00:00`).toISOString(),
      });

      showSuccess(
        'Marked as bought',
        `${copies} ${copies === 1 ? 'copy' : 'copies'} of ${entry.cardName} are on the way.`
      );
      onOpenChange(false);
    } catch (error: any) {
      showError('Could not save that', error?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const max = entry?.quantity ?? 1;

  return (
    <Sheet open={Boolean(entry)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetTitle className="sr-only">Mark as bought</SheetTitle>
        {entry && (
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <CardImage card={entry.card ?? { name: entry.cardName }} width={84} hideFlip />
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-foreground">{entry.cardName}</h2>
                <p className="text-sm text-muted-foreground">
                  Tell us what you paid so your collection can show it later.
                </p>
              </div>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                How many did you buy
              </Label>
              <div className="mt-1.5 flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setCopies(n => Math.max(1, n - 1))}
                  disabled={copies <= 1}
                  aria-label="One fewer copy"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-10 text-center text-lg font-semibold tabular-nums">{copies}</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setCopies(n => Math.min(max, n + 1))}
                  disabled={copies >= max}
                  aria-label="One more copy"
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">of {max} on the list</span>
              </div>
              {copies < max && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  The other {max - copies} stay on the list to buy.
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="paid-price" className="text-xs uppercase tracking-wide text-muted-foreground">
                What one copy cost you
              </Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  id="paid-price"
                  inputMode="decimal"
                  placeholder="Leave blank if you do not know"
                  value={price}
                  onChange={event => setPrice(event.target.value)}
                  className="flex-1"
                />
                <div className="flex overflow-hidden rounded-md bg-muted/40">
                  {(['USD', 'EUR'] as const).map(code => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setCurrency(code)}
                      className={
                        'px-3 text-sm transition-colors ' +
                        (currency === code
                          ? 'bg-foreground text-background'
                          : 'text-muted-foreground hover:text-foreground')
                      }
                    >
                      {code === 'USD' ? '$' : '€'}
                    </button>
                  ))}
                </div>
              </div>
              {hints.length > 0 && (
                <p className="mt-1.5 text-xs text-muted-foreground">{hints.join('. ')}.</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Blank is fine. We would rather hold nothing than a number nobody paid.
              </p>
            </div>

            <div>
              <Label htmlFor="bought-date" className="text-xs uppercase tracking-wide text-muted-foreground">
                When you bought it
              </Label>
              <Input
                id="bought-date"
                type="date"
                value={date}
                max={todayISO()}
                onChange={event => setDate(event.target.value)}
                className="mt-1.5"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={submit} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Mark as bought
              </Button>
              <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
