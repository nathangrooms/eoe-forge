import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { cn } from '@/lib/utils';
import { CardImage } from './CardImage';
import { canBeCommander } from '@/lib/scryfall/card-utils';
import { Loader2, Minus, Plus } from 'lucide-react';

/**
 * Add-to-deck as a right-hand slide-out.
 *
 * Design law item 3: a choice made *without leaving the current context* is a
 * right-hand panel, never a centred dialog. The card page stays exactly where
 * it was — same scroll position, same printing selected — while the player
 * picks a deck.
 *
 * `deck_cards.card_id` carries a foreign key to `cards.id`, so this needs an id
 * that exists in our table rather than whichever Scryfall printing happens to
 * be on screen. The page resolves that and hands it down; when it cannot, the
 * panel says so instead of failing on submit.
 */

interface DeckRow {
  id: string;
  name: string;
  format: string | null;
  colors: string[] | null;
  /** Copies of this card already in the deck. */
  have: number;
}

export interface CardAddToDeckPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The card being displayed, for the panel's own header. */
  card: any;
  /** An id that exists in `cards` — required by the foreign key. */
  dbCardId: string | null;
}

export function CardAddToDeckPanel({
  open,
  onOpenChange,
  card,
  dbCardId,
}: CardAddToDeckPanelProps) {
  const { user } = useAuth();
  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [sideboard, setSideboard] = useState(false);
  const [asCommander, setAsCommander] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const commanderEligible = canBeCommander(card);

  const load = useCallback(async () => {
    if (!user) {
      setDecks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: deckRows, error } = await supabase
        .from('user_decks')
        .select('id, name, format, colors')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      let counts = new Map<string, number>();
      if (dbCardId && deckRows?.length) {
        const { data: existing } = await supabase
          .from('deck_cards')
          .select('deck_id, quantity')
          .eq('card_id', dbCardId)
          .in(
            'deck_id',
            deckRows.map(d => d.id)
          );
        counts = new Map((existing ?? []).map(r => [r.deck_id, r.quantity ?? 0]));
      }

      setDecks(
        (deckRows ?? []).map(d => ({
          id: d.id,
          name: d.name,
          format: d.format,
          colors: d.colors,
          have: counts.get(d.id) ?? 0,
        }))
      );
    } catch (err) {
      console.error('Could not load decks:', err);
      setDecks([]);
    } finally {
      setLoading(false);
    }
  }, [user, dbCardId]);

  useEffect(() => {
    if (!open) return;
    setQuantity(1);
    setSideboard(false);
    setAsCommander(false);
    void load();
  }, [open, load]);

  const addTo = async (deck: DeckRow) => {
    if (!dbCardId || !card?.name) return;
    setSavingId(deck.id);
    try {
      const { data: existing, error: readError } = await supabase
        .from('deck_cards')
        .select('id, quantity')
        .eq('deck_id', deck.id)
        .eq('card_id', dbCardId)
        .maybeSingle();

      if (readError) throw readError;

      if (existing) {
        const { error } = await supabase
          .from('deck_cards')
          .update({ quantity: (existing.quantity ?? 0) + quantity })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('deck_cards').insert({
          deck_id: deck.id,
          card_id: dbCardId,
          card_name: card.name,
          quantity,
          is_commander: asCommander,
          is_sideboard: sideboard,
        });
        if (error) throw error;
      }

      showSuccess(
        `${card.name} added`,
        `${quantity} cop${quantity === 1 ? 'y' : 'ies'} into "${deck.name}"${
          sideboard ? ' (sideboard)' : ''
        }.`
      );
      await load();
    } catch (err: any) {
      const message: string = err?.message ?? 'Could not add the card.';
      showError(
        'Add to deck failed',
        message.includes('foreign key')
          ? 'This printing is not in the DeckMatrix card database yet.'
          : message
      );
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        // The panel's own copy is the description; without this Radix logs a
        // missing-`aria-describedby` warning on every open.
        aria-describedby={undefined}
        className="flex w-full flex-col gap-0 border-0 bg-card p-0 shadow-2xl shadow-black/50 sm:max-w-md"
      >
        {/* pr-12 clears the Sheet's own absolutely-placed close button. */}
        <div className="py-3 pl-4 pr-12">
          <SheetTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Add to a deck
          </SheetTitle>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-6">
          <div className="flex items-start gap-3">
            <CardImage card={card} width={72} hideFlip />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{card?.name}</p>
              <p className="truncate text-xs text-muted-foreground">{card?.type_line}</p>
            </div>
          </div>

          {!user ? (
            <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
              Sign in to add cards to your decks.
            </p>
          ) : !dbCardId ? (
            <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
              This card is not in the DeckMatrix card table yet, and deck entries reference it by
              id. Card sync has to catch up before it can be added.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Copies</span>
                  <div className="flex items-center gap-1 rounded-lg bg-muted/40 p-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label="One fewer copy"
                      onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="w-6 text-center text-sm tabular-nums text-foreground">
                      {quantity}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label="One more copy"
                      onClick={() => setQuantity(q => Math.min(99, q + 1))}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="add-sideboard"
                    checked={sideboard}
                    onCheckedChange={v => setSideboard(v === true)}
                  />
                  <Label htmlFor="add-sideboard" className="font-normal">
                    Sideboard
                  </Label>
                </div>

                {commanderEligible && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="add-commander"
                      checked={asCommander}
                      onCheckedChange={v => setAsCommander(v === true)}
                    />
                    <Label htmlFor="add-commander" className="font-normal">
                      As commander
                    </Label>
                  </div>
                )}
              </div>

              {loading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="h-14 animate-pulse rounded-lg bg-muted/40 motion-reduce:animate-none"
                    />
                  ))}
                </div>
              ) : decks.length === 0 ? (
                <div className="rounded-lg bg-muted/30 p-4">
                  <p className="text-sm text-foreground">You have no decks yet.</p>
                  <Button asChild variant="secondary" size="sm" className="mt-3">
                    <Link to="/deck-builder">Start a new deck</Link>
                  </Button>
                </div>
              ) : (
                <ul className="space-y-2">
                  {decks.map(deck => (
                    <li key={deck.id}>
                      <button
                        type="button"
                        disabled={savingId !== null}
                        onClick={() => addTo(deck)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg bg-muted/30 px-3 py-2.5 text-left transition-colors',
                          'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          'disabled:cursor-not-allowed disabled:opacity-60'
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {deck.name}
                          </p>
                          <p className="flex items-center gap-2 text-xs capitalize text-muted-foreground">
                            {deck.format ?? 'no format'}
                            {deck.have > 0 && (
                              <span className="tabular-nums text-foreground/80">
                                · {deck.have} already in
                              </span>
                            )}
                          </p>
                        </div>
                        <ColorIdentity colors={deck.colors ?? []} size="xs" />
                        {savingId === deck.id ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                        ) : (
                          <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <p className="text-xs text-muted-foreground">
                Decks are listed most recently updated first. Click one to add.
              </p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default CardAddToDeckPanel;
