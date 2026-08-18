/**
 * DeckMatrix — the finish.
 *
 * A completed event used to render as one line of text in a box. This is the
 * screen somebody photographs at the end of the night, so it is built around
 * the three decks that finished on top: whole commander cards, the winner's
 * largest and centre, with the champion's own artwork carrying the atmosphere
 * behind them.
 *
 * The art backdrop is `art_crop` — the one place a crop is correct, because it
 * is being used as texture rather than as a card. Every card on top of it is
 * whole. The scrim over it is flat, not a gradient.
 */

import { Crown, Medal, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CommanderPortrait } from './PlayerIdentity';
import { viewFor, type PlayerView } from './playerViews';
import type { Standing } from './scoring';

export interface PodiumProps {
  standings: Standing[];
  views: Map<string, PlayerView>;
  eventName: string;
  gameFormat: string;
  rounds: number;
}

const PLACE_LABEL = ['Champion', 'Runner-up', 'Third place'];

export function Podium({ standings, views, eventName, gameFormat, rounds }: PodiumProps) {
  const ranked = standings.filter(s => !s.dropped).slice(0, 3);
  if (ranked.length === 0) return null;

  const champion = viewFor(views, ranked[0].player);
  const backdrop = champion.card?.image_uris?.art_crop;

  // Podium order: second, first, third — the winner in the middle and raised.
  const order = [1, 0, 2].filter(i => i < ranked.length);

  return (
    <section className="relative overflow-hidden rounded-2xl bg-card shadow-sm">
      {/* Texture, not decoration: desaturated and held right down so the three
          cards on top of it stay the only things with colour, and so nothing
          here competes with the type. */}
      {backdrop && (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center opacity-[0.14] grayscale"
          style={{ backgroundImage: `url(${backdrop})` }}
        />
      )}

      <div className="relative p-5 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              <Trophy aria-hidden="true" className="h-3.5 w-3.5" />
              Event complete
            </p>
            <h2 className="mt-1 truncate text-2xl font-semibold text-foreground sm:text-3xl">
              {champion.name}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              wins {eventName} — {gameFormat}, {rounds} round{rounds === 1 ? '' : 's'}
            </p>
          </div>

          <div className="rounded-xl bg-muted/50 px-4 py-2.5 text-right">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Final record
            </p>
            <p className="text-lg font-semibold tabular-nums text-foreground">
              {ranked[0].wins}–{ranked[0].losses}–{ranked[0].draws}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {ranked[0].points} match points
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-center gap-4 sm:gap-6">
          {order.map(index => {
            const standing = ranked[index];
            const view = viewFor(views, standing.player);
            const first = index === 0;

            return (
              <div
                key={standing.player}
                className={cn(
                  'flex min-w-0 flex-col items-center gap-2.5',
                  first ? 'w-[46%] max-w-[220px]' : 'w-[30%] max-w-[150px]'
                )}
              >
                <div className="w-full">
                  <CommanderPortrait view={view} size={first ? 'lg' : 'md'} eager={first} />
                </div>

                <div className="flex w-full flex-col items-center gap-1 text-center">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-wider',
                      first ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {first ? <Crown className="h-3 w-3" /> : <Medal className="h-3 w-3" />}
                    {PLACE_LABEL[index]}
                  </span>
                  <p
                    className={cn(
                      'w-full truncate font-semibold text-foreground',
                      first ? 'text-base' : 'text-sm'
                    )}
                  >
                    {standing.player}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {standing.wins}–{standing.losses}–{standing.draws} · {standing.points} pts
                  </p>
                  {/* Always rendered so every column's caption block is the same
                      height and the three cards line up along their bottoms. */}
                  <p className="w-full truncate text-xs text-muted-foreground/80">
                    {view.deck ? view.deck.deckName : ' '}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
