import { useParams } from 'react-router-dom';
import { DeckSubpageLayout, useDeckReturn } from '@/components/deck/DeckSubpageLayout';
import { DeckExportPanel } from '@/components/deck/DeckExportPanel';
import { useDeckRecord } from '@/components/deck/useDeckRecord';
import { formatLabel } from '@/lib/deck/formats';

/**
 * `/deck/:id/export` — replaces the export dialog that both the deck list and
 * the deck page used to open. The serialized list gets the full column instead
 * of a `max-w-2xl` box, and the URL survives a reload.
 *
 * The loading panel and the not-found panel are the shell's now. This page had
 * its own copy of both, and so did the four beside it.
 */
export default function DeckExport() {
  const { id } = useParams();
  /* The deck, on the tab it was open on, when that is where this came from. */
  const backTo = useDeckReturn(id);
  const { deck, loading, error } = useDeckRecord(id);

  return (
    <DeckSubpageLayout
      title={deck ? `Export “${deck.name}”` : 'Export deck'}
      description="Choose a format, then copy the list or download it as a file."
      backTo={backTo}
      backLabel="Back to deck"
      loading={loading}
      error={loading ? null : (error ?? (deck ? null : 'This deck could not be found.'))}
      /* Only what `useDeckRecord` has already read. The card count is
         deliberately not here: this page never loads the decklist, and a figure
         worth an extra request is not worth a tile. */
      metrics={[
        /* "Deck format", not "Format". The panel below this row also said
           Format, about the FILE, so one screen carried two different things
           under one word. */
        { id: 'format', label: 'Deck format', value: deck ? formatLabel(deck.format) : null },
        {
          id: 'visibility',
          label: 'Visibility',
          value: deck ? (deck.public_enabled ? 'Public' : 'Private') : null,
          subtext: deck?.public_enabled ? 'anyone with the link' : 'only you',
        },
      ]}
    >
      {deck && <DeckExportPanel deckId={deck.id} deckName={deck.name} />}
    </DeckSubpageLayout>
  );
}
