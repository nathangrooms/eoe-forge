import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Edit, Loader2 } from 'lucide-react';
import { DeckSubpageLayout } from '@/components/deck/DeckSubpageLayout';
import { DeckAnalysisView } from '@/components/deck-builder/DeckAnalysisView';
import { DeckAPI, type DeckSummary } from '@/lib/api/deckAPI';

/**
 * `/deck/:id/analysis` — the deck's numbers, at their own URL.
 *
 * Previously a `max-w-4xl max-h-[85vh]` dialog launched from the deck list,
 * which meant the analysis of a deck was drawn on top of the deck. A stats view
 * is something you link to and come back to, so it is a route.
 */
export default function DeckAnalysis() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [summary, setSummary] = useState<DeckSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    DeckAPI.getDeckSummary(id)
      .then(result => {
        if (cancelled) return;
        if (!result) setError('This deck could not be found.');
        else setSummary(result);
      })
      .catch(err => {
        console.error('Deck analysis page load failed:', err);
        if (!cancelled) setError('Could not load this deck.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <DeckSubpageLayout
      title={summary ? `${summary.name} — analysis` : 'Deck analysis'}
      description="Power, curve, types and mana base for this deck."
      backTo={id ? `/deck/${id}` : '/decks'}
      backLabel="Back to deck"
      action={
        id ? (
          <Button onClick={() => navigate(`/deck-builder?deck=${id}`)}>
            <Edit className="mr-2 h-4 w-4" />
            Open in builder
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading deck…
        </div>
      ) : error || !summary ? (
        <div className="rounded-xl bg-card p-10 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">{error ?? 'This deck could not be found.'}</p>
          <Button className="mt-4" variant="secondary" onClick={() => navigate('/decks')}>
            Back to decks
          </Button>
        </div>
      ) : (
        <DeckAnalysisView deckSummary={summary} showHeader={false} />
      )}
    </DeckSubpageLayout>
  );
}
