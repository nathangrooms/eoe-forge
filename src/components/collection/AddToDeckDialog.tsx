import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ManaCost } from '@/components/ui/mana-cost';
import { showSuccess } from '@/components/ui/toast-helpers';
import { useDeckManagementStore, type DeckCard } from '@/stores/deckManagementStore';
import type { CollectionCard } from '@/types/collection';

function categoryFor(typeLine: string): DeckCard['category'] {
  const t = typeLine || '';
  if (t.includes('Land')) return 'lands';
  if (t.includes('Creature')) return 'creatures';
  if (t.includes('Instant')) return 'instants';
  if (t.includes('Sorcery')) return 'sorceries';
  if (t.includes('Planeswalker')) return 'planeswalkers';
  if (t.includes('Artifact')) return 'artifacts';
  if (t.includes('Enchantment')) return 'enchantments';
  return 'other';
}

interface AddToDeckDialogProps {
  item: CollectionCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Replaces the old "+" affordance, which fired an "Added to Queue" toast for a
 * queue that did not exist. This writes into a real deck.
 */
export function AddToDeckDialog({ item, open, onOpenChange }: AddToDeckDialogProps) {
  const decks = useDeckManagementStore(state => state.decks);
  const addCardToDeck = useDeckManagementStore(state => state.addCardToDeck);
  const [busy, setBusy] = useState(false);

  const card = item?.card;
  const deckList = useMemo(
    () => [...decks].sort((a, b) => a.name.localeCompare(b.name)),
    [decks]
  );

  const handleAdd = (deckId: string, deckName: string) => {
    if (!item) return;
    setBusy(true);
    addCardToDeck(deckId, {
      id: item.card_id,
      name: item.card_name,
      cmc: card?.cmc ?? 0,
      type_line: card?.type_line ?? '',
      colors: card?.colors ?? [],
      mana_cost: card?.mana_cost,
      quantity: 1,
      category: categoryFor(card?.type_line ?? ''),
      image_uris: card?.image_uris,
      prices: card?.prices as DeckCard['prices'],
    });
    setBusy(false);
    onOpenChange(false);
    showSuccess('Added to deck', `${item.card_name} → ${deckName}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span>{item?.card_name ?? 'Add to deck'}</span>
            <ManaCost cost={card?.mana_cost} size="sm" />
          </DialogTitle>
          <DialogDescription>
            {card?.type_line || 'Choose which deck this card should go into.'}
          </DialogDescription>
        </DialogHeader>

        {deckList.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            You have no decks yet. Create one in the deck builder first.
          </p>
        ) : (
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {deckList.map(deck => (
              <Button
                key={deck.id}
                variant="ghost"
                disabled={busy}
                className="h-auto w-full justify-between px-3 py-2"
                onClick={() => handleAdd(deck.id, deck.name)}
              >
                <span className="truncate">{deck.name}</span>
                <Badge variant="secondary" className="ml-2 shrink-0 capitalize">
                  {deck.format}
                </Badge>
              </Button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
