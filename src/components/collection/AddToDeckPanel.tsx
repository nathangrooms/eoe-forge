import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
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

interface AddToDeckPanelProps {
  item: CollectionCard;
  onClose: () => void;
}

/**
 * Choosing a destination deck for a card that is already on screen is not a
 * destination of its own, so this is an expanding region in the collection
 * layout rather than a dialog over it. It scrolls itself into view on mount
 * because the action that opens it can be triggered from far down the grid.
 */
export function AddToDeckPanel({ item, onClose }: AddToDeckPanelProps) {
  const decks = useDeckManagementStore(state => state.decks);
  const addCardToDeck = useDeckManagementStore(state => state.addCardToDeck);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLElement | null>(null);

  const card = item.card;
  const deckList = useMemo(() => [...decks].sort((a, b) => a.name.localeCompare(b.name)), [decks]);

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [item.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleAdd = (deckId: string, deckName: string) => {
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
    onClose();
    showSuccess('Added to deck', `${item.card_name} → ${deckName}`);
  };

  return (
    <section
      ref={ref}
      aria-label={`Add ${item.card_name} to a deck`}
      className="rounded-xl bg-card p-4 shadow-lg shadow-black/20"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-card-foreground">
              {item.card_name}
            </h3>
            <ManaCost cost={card?.mana_cost} size="sm" />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {card?.type_line || 'Choose which deck this card should go into.'}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close"
          className="h-8 w-8 shrink-0"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {deckList.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          You have no decks yet. Create one in the deck builder first.
        </p>
      ) : (
        <div className="grid max-h-72 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
          {deckList.map(deck => (
            <Button
              key={deck.id}
              variant="ghost"
              disabled={busy}
              className="h-auto w-full justify-between bg-muted/30 px-3 py-2 hover:bg-accent"
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
    </section>
  );
}
