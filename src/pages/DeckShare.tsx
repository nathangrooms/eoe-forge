import { useParams } from 'react-router-dom';
import { DeckSubpageLayout, useDeckReturn } from '@/components/deck/DeckSubpageLayout';
import { DeckSharePanel } from '@/components/deck-builder/DeckSharePanel';
import { useDeckRecord } from '@/components/deck/useDeckRecord';
import { DeckIdentityHero } from '@/components/deck/DeckIdentityHero';

/**
 * `/deck/:id/share` — was a 90vh drawer with an `AlertDialog` nested inside it.
 * Sharing is a place you come back to (to check views, regenerate the link, or
 * turn it off), so it gets a URL and a back control.
 *
 * ## Why this one passes no figures
 *
 * The shell takes a `metrics` row and this page hands it nothing, on purpose.
 * The two facts it holds are the format and whether the link is on, and the
 * second is the subject of the switch directly below: a tile restating the
 * state of a control eight pixels above it is not a figure, it is a caption
 * that can go out of date. The figures worth a tile here are the views and the
 * copies, and `DeckSharePanel` holds those and draws them on the shared tile
 * itself.
 */
export default function DeckShare() {
  const { id } = useParams();
  /* The deck, on the tab it was open on, when that is where this came from. */
  const backTo = useDeckReturn(id);
  /* WITH the commander, which the other five sub-routes do not ask for.
     This page publishes a deck, so it has to be able to show which one: it
     measured 422 of 1,000 pixels empty below the fold and named the deck
     three times in prose without ever drawing it. */
  const { deck, loading, error, reload } = useDeckRecord(id, { withCommander: true });

  return (
    <DeckSubpageLayout
      title={deck ? `Share “${deck.name}”` : 'Share deck'}
      description="Publish a read-only link to this deck, or turn the link off."
      backTo={backTo}
      backLabel="Back to deck"
      loading={loading}
      error={loading ? null : (error ?? (deck ? null : 'This deck could not be found.'))}
    >
      {deck && (
        <DeckIdentityHero
          className="mb-4"
          eyebrow="What people will see"
          name={deck.name}
          format={deck.format}
          commanderCard={deck.commanderCard}
          commanderName={deck.commanderName}
          cardCount={deck.cardCount}
          colors={deck.colors}
        />
      )}

      {deck && (
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
