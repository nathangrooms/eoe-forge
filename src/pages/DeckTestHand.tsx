import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layers, Play, RotateCcw, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/listing';
import { DeckSubpageLayout, useDeckReturn } from '@/components/deck/DeckSubpageLayout';
import { QuickDeckTester, useOpeningHand } from '@/components/deck-builder/QuickDeckTester';
import { useDeckRecord } from '@/components/deck/useDeckRecord';
import { fetchDeckCards, toCardObject, type DeckCardRow } from '@/lib/deck/deckCards';
import { categorizeCard } from '@/lib/deck/cardCategories';

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
 *
 * ## The figures
 *
 * Three, and all three are the deck facts a mulligan is decided on: how big the
 * library is, how much of it is land, and what that comes to as a ratio. They
 * are counted off the rows this page has already loaded, so the strip costs no
 * request. They are the shell's `MetricRow`, which is the same tile the deck
 * page and My Decks draw.
 */
export default function DeckTestHand() {
  const { id } = useParams();
  const navigate = useNavigate();
  /* The deck, on the tab it was open on, when that is where this came from. */
  const backTo = useDeckReturn(id);
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
  const library = useMemo(
    () => rows.filter(row => !row.is_commander && !row.is_sideboard).map(toCardObject),
    [rows]
  );

  /* Copies, not distinct names: a library of 99 with 36 lands draws differently
     from one with 36 distinct lands and 63 spells, and the hand is dealt from
     copies. `categorizeCard` reads the front face only, which is what stops a
     modal double-faced spell with a land on the back being counted as a land. */
  const { librarySize, landCount } = useMemo(() => {
    let total = 0;
    let lands = 0;
    for (const card of library) {
      const copies = card.quantity ?? 1;
      total += copies;
      if (categorizeCard(card.type_line) === 'lands') lands += copies;
    }
    return { librarySize: total, landCount: lands };
  }, [library]);

  /* The hand lives on the page so the page can put Draw and Mulligan in its
     own action row rather than the panel growing a heading to hold them. */
  const opening = useOpeningHand(library as never);

  /*
    Deal the first hand as soon as there is a library to deal from.

    Arriving here used to show a 660px box of charcoal with a button in the
    middle of it, on a page whose entire subject is seven cards, when the seven
    cards were already loaded and one shuffle away. Nobody comes to a test hand
    page not wanting a test hand, and "New hand" in the action row is right
    there for the second one.

    Once per deck: the ref is keyed on the deck id, so opening a different deck
    deals again but a re-render never does. `draw` changes identity on every
    render, which is why the effect cannot be guarded on it alone.
  */
  const dealtFor = useRef<string | null>(null);
  useEffect(() => {
    if (loading || !id || library.length === 0) return;
    if (dealtFor.current === id) return;
    dealtFor.current = id;
    opening.draw();
  }, [loading, id, library.length, opening]);

  return (
    <DeckSubpageLayout
      title={deck ? `Test hands for “${deck.name}”` : 'Test hand'}
      description="Draw an opening hand, mulligan, and see what the seven looked like."
      backTo={backTo}
      backLabel="Back to deck"
      loading={loading}
      error={loading ? null : (error ?? (deck ? null : 'This deck could not be found.'))}
      metrics={[
        { id: 'library', label: 'Cards in library', value: librarySize.toLocaleString(), raw: librarySize },
        { id: 'lands', label: 'Lands', value: landCount.toLocaleString(), raw: landCount },
        {
          id: 'ratio',
          /* A dash rather than 0%, and never a percentage of nothing. */
          label: 'Land ratio',
          value: librarySize > 0 ? `${Math.round((landCount / librarySize) * 100)}%` : '—',
          raw: librarySize > 0 ? (landCount / librarySize) * 100 : undefined,
          subtext: 'of the library',
        },
      ]}
      /*
        Every control on this page lives in this one row.

        Draw and Mulligan used to sit inside the panel below, under a second
        heading reading "Quick Deck Tester" — a title that repeated the page
        title directly above it and existed mainly to have somewhere to hang
        two buttons. So the page had two headings and its controls in two
        places. The panel is the hand now, and the hand needs no title.
      */
      action={
        <div className="flex flex-wrap gap-2">
          {library.length > 0 && (
            <>
              <Button variant="outline" onClick={opening.draw}>
                <Shuffle className="mr-2 h-4 w-4" />
                {opening.drawn ? 'New hand' : 'Draw a hand'}
              </Button>
              {opening.drawn && (
                <Button variant="outline" onClick={opening.mulligan}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Mulligan
                </Button>
              )}
            </>
          )}
          {id && (
            <Button variant="secondary" onClick={() => navigate(`/play?mode=playtest&deck=${id}`)}>
              <Play className="mr-2 h-4 w-4" />
              Play a whole game
            </Button>
          )}
        </div>
      }
    >
      {deck &&
        (library.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="Nothing to draw yet"
            description="This deck has no cards in it, so there is no library to draw an opening hand from."
            action={
              id
                ? { label: 'Add some cards', onClick: () => navigate(`/deck/${id}?tab=add`) }
                : undefined
            }
          />
        ) : !opening.drawn ? (
          /* The shared panel, not a line of grey text in the middle of an
             otherwise empty card. This page's whole first impression was one
             sentence floating in a 660px box. */
          <EmptyState
            icon={Shuffle}
            title="Draw your opening seven"
            description="Shuffle the library and see what you would be keeping or sending back."
            action={{ label: 'Draw a hand', onClick: opening.draw }}
          />
        ) : (
          <QuickDeckTester state={opening} />
        ))}
    </DeckSubpageLayout>
  );
}
