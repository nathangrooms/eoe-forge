import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DeckSubpageLayout, useDeckReturn } from '@/components/deck/DeckSubpageLayout';
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
 *
 * ## Why this one passes no figures to the shell
 *
 * The numbers that matter on a print job are the selection, the sheet count and
 * the dpi, and every one of them moves as you tick a card or change the paper.
 * They belong to the generator, which is what recomputes them, so it draws them
 * — on `MetricRow`, the same tile as everywhere else. A second strip up in the
 * header would be a copy that lags the one below it.
 */
export default function DeckProxies() {
  const { id } = useParams();
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
      backTo={backTo}
      backLabel="Back to deck"
      loading={loading}
      error={loading ? null : (error ?? (deck ? null : 'This deck could not be found.'))}
    >
      {deck && (
        <DeckProxyGenerator
          deckCards={deckCards}
          deckName={deck.name}
          commander={commander ? toCardObject(commander) : undefined}
        />
      )}
    </DeckSubpageLayout>
  );
}
