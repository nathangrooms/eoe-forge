/**
 * DeckMatrix — no events yet.
 *
 * Not a shrug. It says what the tool actually does — DCI tiebreakers,
 * rematch-free Swiss, one-click results, decks registered against seats — and
 * then shows the user their own library as the decks that are ready to be
 * registered, because the fastest way to make a tournament feel real is to show
 * the cards that will be in it.
 *
 * The deck count and the artwork are read from the database. If the library is
 * empty the strip is simply absent; nothing is invented to fill it.
 *
 * ## What changed, 30 Aug 2026
 *
 * The rail used to be `decks.filter(d => d.commanderCard)`, so a deck whose
 * commander has no artwork on file vanished from the strip while still counting
 * towards the sentence above it. That is the bug `deckRailCount` was written
 * for. `DeckRail` draws every deck instead, a commander card where there is one
 * and a card-shaped panel carrying the deck's name where there is not, so the
 * count and the tiles cannot disagree at all.
 *
 * It also sat below three columns of small print and ended 151px above the fold
 * on a 1600x1000 screen. The decks lead now, at a size where a commander is a
 * card rather than a thumbnail, and the small print follows them.
 */

import { Link } from 'react-router-dom';
import { ListOrdered, MousePointerClick, Swords, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeckRail } from '@/components/deck/DeckRail';
import type { DeckOption } from './useEventDecks';

const CAPABILITIES = [
  {
    icon: ListOrdered,
    title: 'Swiss that pairs properly',
    body: 'Seated on record, never repeating a match-up while a legal alternative exists, with a bye that never lands on the same player twice.',
  },
  {
    icon: MousePointerClick,
    title: 'Results in one click',
    body: 'Tap the player who won. Exact game scores and draws are there when a match needs them, and any result can be taken back.',
  },
  {
    icon: Swords,
    title: 'Decks, not just names',
    body: 'Every seat registers a deck from your library, and its commander follows the player through pairings, standings and the podium.',
  },
];

/** Tiles drawn before the rail admits it is holding some back. */
const RAIL_CAP = 12;

export interface EventEmptyStateProps {
  /** Passed down rather than queried again — the manager has already loaded these. */
  decks: DeckOption[];
  loading: boolean;
}

export function EventEmptyState({ decks, loading }: EventEmptyStateProps) {
  const shown = decks.slice(0, RAIL_CAP);

  return (
    <section className="overflow-hidden rounded-2xl bg-card shadow-sm">
      <div className="p-6 sm:p-10">
        {/*
          There is no heading here on purpose.

          The page above this renders `Tournaments` as its H1 with the line
          "Swiss and single-elimination events with real DCI tiebreakers, a
          round clock, and a deck registered to every seat" underneath it. This
          panel used to open with an all-caps `TOURNAMENTS` eyebrow, then an H2
          reading "Run your playgroup's next event", then a paragraph saying
          real DCI tiebreakers, a round clock and a roster holding decks you can
          see.

          So the word Tournaments appeared twice, three headings stacked inside
          60px, and the same three facts were stated twice in different words.
          It read as a marketing page bolted inside the signed-in app rather
          than a screen of it. The page header does the titling on every other
          page in this product and it does it here now too.
        */}
        <Button asChild className="gap-2">
          <Link to="/tournament/new">
            <Trophy className="h-4 w-4" />
            Create your first event
          </Link>
        </Button>

        {/*
          The decks come first because they are the only real thing on this
          screen. Three paragraphs of what the tool can do are worth reading
          second.

          SIDE BY SIDE ON A WIDE SCREEN, and stacked everywhere else. Stacked
          throughout, a library of two decks drew two cards at their 22rem cap
          and left about 500px of empty charcoal to their right, with the small
          print on its own row underneath. Two cards cannot fill 1,250px without
          being absurdly large, so the fix is composition rather than a bigger
          cap. Left to right is still decks then small print, so the reading
          order the note above describes is unchanged.
        */}
        <div className="mt-8 xl:grid xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start xl:gap-8">
        {!loading && shown.length > 0 && (
          <div>
            <DeckRail
              label="Your decks, ready to register"
              decks={shown.map(deck => ({
                id: deck.id,
                name: deck.name,
                card: deck.commanderCard,
                href: `/deck/${deck.id}`,
                note: noteFor(deck),
              }))}
              total={decks.length}
              purpose="ready to register"
            />
          </div>
        )}

        <div className="mt-8 grid gap-5 sm:grid-cols-3 xl:mt-0 xl:grid-cols-1 xl:gap-6">
          {CAPABILITIES.map(item => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="space-y-1.5">
                <Icon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            );
          })}
        </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The line under a deck's name: what format it is and how big it is.
 *
 * `cardCount` is mainboard copies, the same figure the deck page prints, so a
 * player reading "99 cards" here and "99 cards" there is reading one number
 * rather than two that happen to match. A deck with nothing in it says so
 * rather than printing a zero, because "0 cards" reads like a failed load.
 */
function noteFor(deck: DeckOption): string {
  const format = deck.format ? deck.format[0].toUpperCase() + deck.format.slice(1) : 'Deck';
  if (deck.cardCount <= 0) return `${format}, no cards yet`;
  return `${format}, ${deck.cardCount} card${deck.cardCount === 1 ? '' : 's'}`;
}
