import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeckSubpageLayout } from '@/components/deck/DeckSubpageLayout';
import { DeckProxyGenerator } from '@/components/deck-builder/DeckProxyGenerator';
import { useDeckRecord } from '@/components/deck/useDeckRecord';
import { fetchDeckCards, toCardObject, type DeckCardRow } from '@/lib/deck/deckCards';

/**
 * `/deck/:id/proxies` — printing this deck.
 *
 * It was a tab on the builder, which meant a print job with paper size, image
 * quality, cut guides and a PDF export could only be reached by opening the
 * deck for *editing* and then finding the seventh tab. It is a destination you
 * link to and come back to, and it wants the width and the URL, so it is a
 * route beside export and share.
 *
 * The cards come from `fetchDeckCards`, the one loader that joins the `cards`
 * table, rather than from a store: a proxy sheet is about art, and art is the
 * first thing a metadata-free query loses.
 */
export default function DeckProxies() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { deck, loading: deckLoading, error } = useDeckRecord(id);

  const [rows, setRows] = useState<DeckCardRow[]>([]);
  const [cardsLoading, setCardsLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setCardsLoading(true);
    fetchDeckCards(id)
      .then(result => {
        if (!cancelled) setRows(result);
      })
      .catch(err => console.error('Proxy load failed:', err))
      .finally(() => {
        if (!cancelled) setCardsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const loading = deckLoading || cardsLoading;
  const commander = rows.find(row => row.is_commander);
  const deckCards = rows
    .filter(row => !row.is_commander && !row.is_sideboard)
    .map(toCardObject);

  return (
    <DeckSubpageLayout
      title={deck ? `Proxies for “${deck.name}”` : 'Deck proxies'}
      description="Pick the cards, the paper and the guides, then print or save a PDF."
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
        <DeckProxyGenerator
          deckCards={deckCards}
          deckName={deck.name}
          commander={commander ? toCardObject(commander) : undefined}
        />
      )}
    </DeckSubpageLayout>
  );
}
