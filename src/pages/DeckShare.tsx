import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeckSubpageLayout } from '@/components/deck/DeckSubpageLayout';
import { DeckSharePanel } from '@/components/deck-builder/DeckSharePanel';
import { useDeckRecord } from '@/components/deck/useDeckRecord';

/**
 * `/deck/:id/share` — was a 90vh drawer with an `AlertDialog` nested inside it.
 * Sharing is a place you come back to (to check views, regenerate the link, or
 * turn it off), so it gets a URL and a back control.
 */
export default function DeckShare() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { deck, loading, error, reload } = useDeckRecord(id);

  return (
    <DeckSubpageLayout
      title={deck ? `Share “${deck.name}”` : 'Share deck'}
      description="Publish a read-only link to this deck, or turn the link off."
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
        <DeckSharePanel
          deckId={deck.id}
          deckName={deck.name}
          currentSlug={deck.public_slug}
          isPublic={deck.public_enabled}
          onShareToggle={reload}
        />
      )}
    </DeckSubpageLayout>
  );
}
