import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ManaCost } from '@/components/ui/mana-cost';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import type { DeckSummary } from '@/lib/api/deckAPI';
import { Loader2 } from 'lucide-react';

/**
 * The one add-to-destination flow for cards MTG Brain recommends.
 *
 * Replaces brain/CardAddModal.tsx and brain/CardAdditionPanel.tsx, which were
 * both unreferenced, disagreed about which destinations existed, minted
 * incompatible card ids, and reported success even when the insert failed.
 *
 * Rules this one keeps:
 *  - a real Scryfall card id is required (both tables carry an FK to `cards`),
 *  - every statement's `error` is inspected — Supabase query builders resolve
 *    rather than reject, so `Promise.allSettled` can never see a failure,
 *  - the toast reports exactly what was written and what was not.
 */

export interface AddableCard {
  id?: string;
  name: string;
  image_uri?: string;
  mana_cost?: string;
  type_line?: string;
  set?: string;
}

interface AddCardDialogProps {
  card: AddableCard | null;
  decks: DeckSummary[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selects a deck, e.g. the deck currently loaded into Brain. */
  defaultDeckId?: string | null;
}

type Outcome = { label: string; ok: boolean; message?: string };

export function AddCardDialog({
  card,
  decks,
  open,
  onOpenChange,
  defaultDeckId,
}: AddCardDialogProps) {
  const { user } = useAuth();
  const [toDeck, setToDeck] = useState(false);
  const [toCollection, setToCollection] = useState(false);
  const [toWishlist, setToWishlist] = useState(false);
  const [deckId, setDeckId] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setToDeck(Boolean(defaultDeckId));
    setToCollection(false);
    setToWishlist(false);
    setDeckId(defaultDeckId || '');
    setQuantity(1);
  }, [open, defaultDeckId]);

  const hasScryfallId = Boolean(card?.id);
  const canSubmit =
    !saving &&
    hasScryfallId &&
    (toCollection || toWishlist || (toDeck && Boolean(deckId)));

  const addToDeck = async (cardId: string): Promise<Outcome> => {
    const deck = decks.find(d => d.id === deckId);
    const label = deck ? `deck "${deck.name}"` : 'deck';

    const { data: existing, error: readError } = await supabase
      .from('deck_cards')
      .select('id, quantity')
      .eq('deck_id', deckId)
      .eq('card_id', cardId)
      .eq('is_sideboard', false)
      .maybeSingle();

    if (readError) return { label, ok: false, message: readError.message };

    if (existing) {
      const { error } = await supabase
        .from('deck_cards')
        .update({ quantity: existing.quantity + quantity })
        .eq('id', existing.id);
      return error ? { label, ok: false, message: error.message } : { label, ok: true };
    }

    const { error } = await supabase.from('deck_cards').insert({
      deck_id: deckId,
      card_id: cardId,
      card_name: card!.name,
      quantity,
      is_commander: false,
      is_sideboard: false,
    });

    return error ? { label, ok: false, message: error.message } : { label, ok: true };
  };

  const addToCollection = async (cardId: string): Promise<Outcome> => {
    const label = 'collection';

    const { data: existing, error: readError } = await supabase
      .from('user_collections')
      .select('id, quantity')
      .eq('user_id', user!.id)
      .eq('card_id', cardId)
      .maybeSingle();

    if (readError) return { label, ok: false, message: readError.message };

    if (existing) {
      const { error } = await supabase
        .from('user_collections')
        .update({ quantity: existing.quantity + quantity })
        .eq('id', existing.id);
      return error ? { label, ok: false, message: error.message } : { label, ok: true };
    }

    const { error } = await supabase.from('user_collections').insert({
      user_id: user!.id,
      card_id: cardId,
      card_name: card!.name,
      set_code: card!.set || 'unknown',
      quantity,
    });

    return error ? { label, ok: false, message: error.message } : { label, ok: true };
  };

  const addToWishlist = async (cardId: string): Promise<Outcome> => {
    const label = 'wishlist';

    const { data: existing, error: readError } = await supabase
      .from('wishlist')
      .select('id, quantity')
      .eq('user_id', user!.id)
      .eq('card_id', cardId)
      .maybeSingle();

    if (readError) return { label, ok: false, message: readError.message };

    if (existing) {
      const { error } = await supabase
        .from('wishlist')
        .update({ quantity: existing.quantity + quantity })
        .eq('id', existing.id);
      return error ? { label, ok: false, message: error.message } : { label, ok: true };
    }

    const { error } = await supabase.from('wishlist').insert({
      user_id: user!.id,
      card_id: cardId,
      card_name: card!.name,
      quantity,
    });

    return error ? { label, ok: false, message: error.message } : { label, ok: true };
  };

  const handleSubmit = async () => {
    if (!card?.id || !user) return;

    setSaving(true);
    const outcomes: Outcome[] = [];

    try {
      if (toDeck && deckId) outcomes.push(await addToDeck(card.id));
      if (toCollection) outcomes.push(await addToCollection(card.id));
      if (toWishlist) outcomes.push(await addToWishlist(card.id));

      const added = outcomes.filter(o => o.ok);
      const failed = outcomes.filter(o => !o.ok);

      if (added.length > 0) {
        showSuccess(
          `${card.name} added`,
          `Added to ${added.map(o => o.label).join(', ')}.`
        );
      }

      if (failed.length > 0) {
        showError(
          `Could not add to ${failed.map(o => o.label).join(', ')}`,
          failed[0].message?.includes('foreign key')
            ? 'This printing is not in the DeckMatrix card database yet.'
            : failed[0].message
        );
      }

      if (failed.length === 0) onOpenChange(false);
    } catch (error: any) {
      showError('Add failed', error?.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  if (!card) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add {card.name}</DialogTitle>
          <DialogDescription>Choose where this card should go.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="flex items-start gap-3">
            {card.image_uri && (
              <img
                src={card.image_uri}
                alt=""
                className="h-28 w-20 shrink-0 rounded-md border border-border object-cover"
              />
            )}
            <div className="min-w-0 space-y-1">
              <p className="truncate text-sm font-medium text-foreground">{card.name}</p>
              {card.mana_cost && <ManaCost cost={card.mana_cost} size="sm" />}
              {card.type_line && (
                <p className="text-xs text-muted-foreground">{card.type_line}</p>
              )}
            </div>
          </div>

          {!hasScryfallId ? (
            <p className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
              This recommendation arrived without a Scryfall card id, so it cannot be saved. Open
              the card and add it from the card page instead.
            </p>
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="add-deck"
                    checked={toDeck}
                    onCheckedChange={v => setToDeck(v === true)}
                    disabled={decks.length === 0}
                  />
                  <Label htmlFor="add-deck" className="font-normal">
                    {decks.length === 0 ? 'A deck (you have none yet)' : 'A deck'}
                  </Label>
                </div>

                {toDeck && decks.length > 0 && (
                  <div className="pl-7">
                    <Select value={deckId} onValueChange={setDeckId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a deck" />
                      </SelectTrigger>
                      <SelectContent>
                        {decks.map(deck => (
                          <SelectItem key={deck.id} value={deck.id}>
                            {deck.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Checkbox
                    id="add-collection"
                    checked={toCollection}
                    onCheckedChange={v => setToCollection(v === true)}
                  />
                  <Label htmlFor="add-collection" className="font-normal">
                    My collection
                  </Label>
                </div>

                <div className="flex items-center gap-3">
                  <Checkbox
                    id="add-wishlist"
                    checked={toWishlist}
                    onCheckedChange={v => setToWishlist(v === true)}
                  />
                  <Label htmlFor="add-wishlist" className="font-normal">
                    My wishlist
                  </Label>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Label htmlFor="add-quantity" className="text-sm">
                  Quantity
                </Label>
                <Input
                  id="add-quantity"
                  type="number"
                  min={1}
                  max={99}
                  value={quantity}
                  onChange={e => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                  className="w-20"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding…
              </>
            ) : (
              'Add card'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
