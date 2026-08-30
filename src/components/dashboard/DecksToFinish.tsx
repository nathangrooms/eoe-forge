import { CheckCircle2 } from 'lucide-react';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { useCardLookup } from '@/features/dashboard/cardLookup';
import type { DeckSummary } from '@/features/dashboard/hooks';
import { decksNeedingWork } from '@/features/dashboard/deckWork';
import { RailSection, RailEmpty, railTileWidth } from './RailSection';
import { RailTile } from './RailTile';

/**
 * Which of your decks are half-finished, and what is missing from each.
 *
 * This is the widget the old dashboard had no answer to at all. It could tell
 * you that you had nine decks. It could not tell you that two of them were
 * empty, one had no commander and five were short of a hundred cards, which is
 * the actual state of the only account in this database with real decks, and the
 * only version of "you have nine decks" that is worth reading.
 *
 * Every sentence is computed from the deck's own rows by `deckWork`, which is a
 * pure module with tests. Nothing here is estimated. A deck in a format we hold
 * no legal size for is never called short, because we would be making the target
 * up.
 *
 * Decks lead with whatever is cheapest to act on: empty ones first, because they
 * are one decision away from either finished or deleted, then missing
 * commanders, then nearly-complete lists ahead of barely-started ones.
 */

const PER_VIEW = 3;

interface DecksToFinishProps {
  className?: string;
  decks: DeckSummary[];
  loading: boolean;
  error?: string | null;
}

export function DecksToFinish({ className, decks, loading, error }: DecksToFinishProps) {
  const unfinished = decksNeedingWork(decks);

  const lookup = useCardLookup(
    unfinished.map(deck => deck.faceCardId),
    unfinished.map(deck => deck.commanderName)
  );

  return (
    <RailSection
      title="Decks to finish"
      /* "of your N most recent", not "of N". `decks` is a 24-deck window, and
         the rail beside this one prints an exact count of the whole library, so
         "5 of 24" sat next to "30 decks" with the denominator quietly changing
         meaning between them. */
      count={
        unfinished.length > 0
          ? `${unfinished.length} of your ${decks.length} most recent need something`
          : undefined
      }
      perView={PER_VIEW}
      className={className}
      loading={loading}
      error={error}
      isEmpty={unfinished.length === 0}
      empty={
        <RailEmpty
          icon={CheckCircle2}
          headline={decks.length === 0 ? 'No decks yet' : 'Every deck is ready to play'}
          body={
            decks.length === 0
              ? 'Once you have a deck, anything missing from it turns up here.'
              : 'Nothing is short of cards, missing a commander or waiting on a score.'
          }
          actionLabel={decks.length === 0 ? 'Build your first deck' : undefined}
          actionTo={decks.length === 0 ? '/decks/new' : undefined}
        />
      }
    >
      {unfinished.map((deck, index) => {
        const commander = lookup.resolve(deck.faceCardId, deck.commanderName);
        const colors = deck.colors.length > 0 ? deck.colors : (commander?.color_identity ?? []);

        /* An empty deck has no cards to draw, so the tile is honest about that
           rather than borrowing art from somewhere else. */
        const to =
          deck.work.issue === 'empty' || deck.work.issue === 'no-commander'
            ? `/deck/${deck.id}`
            : `/deck/${deck.id}`;

        return (
          <div key={deck.id} className={railTileWidth(PER_VIEW)}>
            <RailTile
              to={to}
              card={commander}
              colors={colors}
              fallbackNote={
                deck.work.issue === 'empty' ? 'No cards in this deck yet' : 'No card art yet'
              }
              eager={index < PER_VIEW}
              title={deck.name}
              subtitle={
                <span className="block truncate font-medium text-foreground">
                  {deck.work.label}
                </span>
              }
              meta={
                <span className="flex items-center gap-2">
                  <ColorIdentity colors={colors} size="xs" />
                  <span className="truncate capitalize">{deck.format}</span>
                </span>
              }
            />
          </div>
        );
      })}
    </RailSection>
  );
}
