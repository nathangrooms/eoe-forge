import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeckSubpageLayout } from '@/components/deck/DeckSubpageLayout';
import { QuickDeckTester } from '@/components/deck-builder/QuickDeckTester';
import { useDeckRecord } from '@/components/deck/useDeckRecord';
import { fetchDeckCards, toCardObject, type DeckCardRow } from '@/lib/deck/deckCards';

/**
 * `/deck/:id/testhand` — opening hands, mulligans and what they looked like.
 *
 * It was a tab on the builder called Playtest, which is not what it is: the
 * playtest is the whole game, at `/play?mode=playtest`, and this draws seven
 * cards and counts the lands. Two different things wearing one word is how a
 * player ends up not finding either, so this one is named for what it does and
 * the real playtest keeps its own name in the same menu.
 *
 * The cards go through whole rather than being remapped to five scalar fields —
 * the mapping the builder used to do dropped `image_uris`, so every card in the
 * test hand rendered as a grey name box.
 */
export default function DeckTestHand() {
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
      .catch(err => console.error('Test hand load failed:', err))
      .finally(() => {
        if (!cancelled) setCardsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const loading = deckLoading || cardsLoading;
  /* The library you actually draw from: the ninety-nine. The commander starts
     in the command zone and a sideboard card is not in the deck. */
  const library = rows
    .filter(row => !row.is_commander && !row.is_sideboard)
    .map(toCardObject);

  return (
    <DeckSubpageLayout
      title={deck ? `Test hands for “${deck.name}”` : 'Test hand'}
      description="Draw an opening hand, mulligan, and see what the seven looked like."
      backTo={id ? `/deck/${id}` : '/decks'}
      backLabel="Back to deck"
      action={
        id ? (
          <Button variant="secondary" onClick={() => navigate(`/play?mode=playtest&deck=${id}`)}>
            <Play className="mr-2 h-4 w-4" />
            Play a whole game
          </Button>
        ) : undefined
      }
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
      ) : library.length === 0 ? (
        <div className="rounded-xl bg-card p-10 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">
            This deck has no cards yet, so there is nothing to draw.
          </p>
        </div>
      ) : (
        <QuickDeckTester deck={library as never} />
      )}
    </DeckSubpageLayout>
  );
}
