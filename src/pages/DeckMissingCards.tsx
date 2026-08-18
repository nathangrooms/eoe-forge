import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeckSubpageLayout } from '@/components/deck/DeckSubpageLayout';
import { MissingCardsPanel } from '@/components/deck-builder/MissingCardsPanel';
import { useDeckRecord } from '@/components/deck/useDeckRecord';

/**
 * `/deck/:id/missing` — the cards this deck needs that the collection does not
 * have. It was an 80vh drawer; it is a shopping list, so it gets a page.
 */
export default function DeckMissingCards() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { deck, loading, error } = useDeckRecord(id);

  return (
    <DeckSubpageLayout
      title={deck ? `Missing from “${deck.name}”` : 'Missing cards'}
      description="Cards this deck needs that are not in your collection yet."
      backTo={id ? `/deck/${id}` : '/decks'}
      backLabel="Back to deck"
    >
      {loading ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading deck…
        </div>
      ) : error || !deck ? (
        <div className="rounded-xl bg-card p-10 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">{error ?? 'This deck could not be found.'}</p>
          <Button className="mt-4" variant="secondary" onClick={() => navigate('/decks')}>
            Back to decks
          </Button>
        </div>
      ) : (
        <MissingCardsPanel deckId={deck.id} deckName={deck.name} />
      )}
    </DeckSubpageLayout>
  );
}
