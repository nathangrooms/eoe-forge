import { useEffect, useState } from 'react';
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
import { Loader2, X } from 'lucide-react';

/**
 * The one add-to-destination flow for cards MTG Brain recommends.
 *
 * Used to be a Dialog. It is a choice about a card that is already on screen,
 * so it now expands as a panel in the results column directly above the
 * composer — the conversation it came from stays readable behind nothing.
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

interface AddCardPanelProps {
  card: AddableCard | null;
  decks: DeckSummary[];
  /** Collapses the panel. */
  onClose: () => void;
  /** Pre-selects a deck, e.g. the deck currently loaded into Brain. */
  defaultDeckId?: string | null;
}

type Outcome = { label: string; ok: boolean; message?: string };

export function AddCardPanel({
  card,
  decks,
  onClose,
  defaultDeckId,
}: AddCardPanelProps) {
  const { user } = useAuth();
  const [toDeck, setToDeck] = useState(false);
  const [toCollection, setToCollection] = useState(false);
  const [toWishlist, setToWishlist] = useState(false);
  const [deckId, setDeckId] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [saving, setSaving] = useState(false);

  const cardKey = card?.id ?? card?.name ?? null;

  useEffect(() => {
    if (!cardKey) return;
    setToDeck(Boolean(defaultDeckId));
    setToCollection(false);
    setToWishlist(false);
    setDeckId(defaultDeckId || '');
    setQuantity(1);
  }, [cardKey, defaultDeckId]);

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

      if (failed.length === 0) onClose();
    } catch (error: any) {
      showError('Add failed', error?.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  if (!card) return null;

  return (
    <section
      className="rounded-lg bg-card p-4 shadow-lg shadow-black/20"
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Add {card.name}</h2>
          <p className="text-xs text-muted-foreground">Choose where this card should go.</p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        <div className="flex items-start gap-3">
          {card.image_uri && (
            <img
              src={card.image_uri}
              alt=""
              className="h-28 w-20 shrink-0 rounded-md object-cover"
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
          <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
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

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding…
              </>
            ) : (
              'Add card'
            )}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </section>
  );
}
