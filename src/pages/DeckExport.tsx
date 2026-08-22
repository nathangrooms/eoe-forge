import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeckSubpageLayout, useDeckReturn } from '@/components/deck/DeckSubpageLayout';
import { DeckExportPanel } from '@/components/deck/DeckExportPanel';
import { useDeckRecord } from '@/components/deck/useDeckRecord';

/**
 * `/deck/:id/export` — replaces the export dialog that both the deck list and
 * the deck page used to open. The serialized list gets the full column instead
 * of a `max-w-2xl` box, and the URL survives a reload.
 */
export default function DeckExport() {
  const { id } = useParams();
  const navigate = useNavigate();
  /* The deck, on the tab it was open on, when that is where this came from. */
  const backTo = useDeckReturn(id);
  const { deck, loading, error } = useDeckRecord(id);

  return (
    <DeckSubpageLayout
      title={deck ? `Export “${deck.name}”` : 'Export deck'}
      description="Choose a format, then copy the list or download it as a file."
      backTo={backTo}
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
        <DeckExportPanel deckId={deck.id} deckName={deck.name} />
      )}
    </DeckSubpageLayout>
  );
}
