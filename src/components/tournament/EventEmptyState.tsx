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
 */

import { Link } from 'react-router-dom';
import { ListOrdered, MousePointerClick, Swords, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardImage } from '@/components/cards';
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

export interface EventEmptyStateProps {
  /** Passed down rather than queried again — the manager has already loaded these. */
  decks: DeckOption[];
  loading: boolean;
}

export function EventEmptyState({ decks, loading }: EventEmptyStateProps) {
  const withArt = decks.filter(d => d.commanderCard).slice(0, 7);

  return (
    <section className="overflow-hidden rounded-2xl bg-card shadow-sm">
      <div className="p-6 sm:p-10">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            <Trophy aria-hidden="true" className="h-3.5 w-3.5" />
            Tournaments
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl">
            Run your playgroup&apos;s next event
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Swiss rounds or a straight bracket, real DCI tiebreakers, a round clock, and a roster
            where every player is holding a deck you can see. Built for a kitchen table or a
            shop floor.
          </p>

          <Button asChild className="mt-5 gap-2">
            <Link to="/tournament/new">
              <Trophy className="h-4 w-4" />
              Create your first event
            </Link>
          </Button>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-3">
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

      {!loading && withArt.length > 0 && (
        <div className="bg-muted/30 px-6 py-5 sm:px-10">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {decks.length} deck{decks.length === 1 ? '' : 's'} in your library, ready to register
          </p>
          <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1">
            {withArt.map(deck => (
              <div key={deck.id} className="w-[84px] shrink-0">
                <CardImage card={deck.commanderCard} size="sm" fill />
                <p className="mt-1.5 truncate text-[0.65rem] text-muted-foreground">{deck.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
