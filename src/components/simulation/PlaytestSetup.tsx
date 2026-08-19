/**
 * Playtest setup — who is sitting down.
 *
 * Owner: *"Playtest is supposed to play live infront of you verse bots and you
 * should be able to select your opponents decks."*
 *
 * So the whole screen is the seats. Each one is a full, uncropped commander at
 * a size where you can read it, with its deck's colours and card count beneath;
 * clicking a seat arms it, and clicking a deck in the wall below sits that deck
 * in the armed seat. Two to four seats, and the same deck may be picked twice
 * because a mirror match is a legitimate playtest.
 */

import { Loader2, Plus, Swords, UserRound, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CardImage, CARD_ASPECT } from '@/components/cards';
import { ColorIdentity } from '@/components/ui/mana-cost';

export interface PlaytestDeckOption {
  id: string;
  name: string;
  format: string;
  cardCount: number;
  colors: string[];
  commanderName: string | null;
  /** Row from `cards` for the commander, or the deck's best stand-in. */
  faceCard: unknown | null;
}

/** A seat's deck, or null for "build a seeded commander deck for this seat". */
export type SeatDeckId = string | null;

export interface PlaytestSetupProps {
  decks: PlaytestDeckOption[];
  /** Index 0 is your seat; the rest are opponents. Length 2–4. */
  seats: SeatDeckId[];
  armedSeat: number;
  onArmSeat: (index: number) => void;
  onSeatDeck: (index: number, deckId: SeatDeckId) => void;
  onAddSeat: () => void;
  onRemoveSeat: (index: number) => void;
  aggression: 'timid' | 'normal' | 'aggressive';
  onAggression: (next: PlaytestSetupProps['aggression']) => void;
  onStart: () => void;
  starting: boolean;
  error?: string | null;
}

const MAX_SEATS = 4;

const AGGRESSION: Array<{ id: PlaytestSetupProps['aggression']; label: string; hint: string }> = [
  { id: 'timid', label: 'Cautious', hint: 'Only attacks when it wins the exchange outright' },
  { id: 'normal', label: 'Even', hint: 'Trades up and blocks sensibly' },
  { id: 'aggressive', label: 'Aggressive', hint: 'Swings whenever it is not strictly losing' },
];

function SeatCard({
  index,
  deck,
  armed,
  removable,
  onArm,
  onRemove,
}: {
  index: number;
  deck: PlaytestDeckOption | null;
  armed: boolean;
  removable: boolean;
  onArm: () => void;
  onRemove: () => void;
}) {
  const label = index === 0 ? 'Your deck' : `Opponent ${index}`;

  return (
    <div
      className={cn(
        'relative min-w-0 rounded-xl p-3 transition-colors',
        armed ? 'bg-muted shadow-lg shadow-black/30' : 'bg-muted/20 hover:bg-muted/40'
      )}
    >
      <button type="button" onClick={onArm} className="w-full text-left" aria-pressed={armed}>
        <div className="flex items-center gap-1.5">
          <UserRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </span>
        </div>

        {/* Capped, not stretched: a seat is a quarter of a wide table, and a
            card drawn to that whole width is 600px tall and nothing else fits
            on the screen beside it. */}
        <div className="mt-2 w-full max-w-[184px]">
          {deck?.faceCard ? (
            <CardImage card={deck.faceCard} size="lg" fill eager />
          ) : (
            <div
              className="flex flex-col items-center justify-center gap-1 rounded-lg bg-muted/40 px-2 text-center"
              style={{ aspectRatio: CARD_ASPECT }}
            >
              <Swords className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <span className="text-[0.7rem] leading-tight text-muted-foreground">
                {deck ? 'No commander art' : 'Seeded commander deck'}
              </span>
            </div>
          )}
        </div>

        <p className="mt-2 truncate text-sm font-medium text-foreground">
          {deck?.name ?? 'Random seeded deck'}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {deck ? deck.commanderName ?? 'No commander' : 'Built live from commander-legal cards'}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <ColorIdentity colors={deck?.colors ?? []} size="sm" />
          <span className="text-[0.7rem] text-muted-foreground">
            {deck
              ? deck.cardCount === 0
                ? 'Empty, so a seeded deck will stand in'
                : `${deck.cardCount} cards`
              : '99 cards'}
          </span>
        </div>
      </button>

      {removable && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove opponent ${index}`}
          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-background/70 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function PlaytestSetup({
  decks,
  seats,
  armedSeat,
  onArmSeat,
  onSeatDeck,
  onAddSeat,
  onRemoveSeat,
  aggression,
  onAggression,
  onStart,
  starting,
  error,
}: PlaytestSetupProps) {
  const byId = new Map(decks.map(deck => [deck.id, deck]));

  return (
    <div className="space-y-5">
      {/* The table. */}
      <div className="rounded-xl bg-card p-4 shadow-lg shadow-black/20 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            The table
          </h2>
          <p className="text-xs text-muted-foreground">
            Every seat is played by the bot policy, on the same rules engine as /play. Pick a seat,
            then pick its deck below.
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {seats.map((deckId, index) => (
            <SeatCard
              key={index}
              index={index}
              deck={deckId ? byId.get(deckId) ?? null : null}
              armed={armedSeat === index}
              removable={index > 1}
              onArm={() => onArmSeat(index)}
              onRemove={() => onRemoveSeat(index)}
            />
          ))}

          {seats.length < MAX_SEATS && (
            <button
              type="button"
              onClick={onAddSeat}
              className="flex flex-col items-center justify-center gap-2 rounded-xl bg-muted/10 p-3 text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
              <span className="text-xs font-medium">Add an opponent</span>
            </button>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-medium text-muted-foreground">Bot temperament</span>
          {AGGRESSION.map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => onAggression(option.id)}
              aria-pressed={aggression === option.id}
              title={option.hint}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                aggression === option.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground'
              )}
            >
              {option.label}
            </button>
          ))}
          <span className="ml-1 text-[11px] text-muted-foreground">
            {AGGRESSION.find(option => option.id === aggression)?.hint}
          </span>
        </div>
      </div>

      {/* The deck wall, feeding the armed seat. */}
      <div className="rounded-xl bg-card p-4 shadow-lg shadow-black/20 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {armedSeat === 0 ? 'Deck for your seat' : `Deck for opponent ${armedSeat}`}
          </h2>
          <p className="text-xs text-muted-foreground">
            {decks.length} deck{decks.length === 1 ? '' : 's'} · card counts read from your lists
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          <button
            type="button"
            onClick={() => onSeatDeck(armedSeat, null)}
            aria-pressed={seats[armedSeat] === null}
            className={cn(
              'group rounded-xl p-2 text-left transition-all',
              seats[armedSeat] === null
                ? 'bg-muted shadow-lg shadow-black/30'
                : 'bg-muted/20 hover:bg-muted/50'
            )}
          >
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-lg bg-muted/40 px-2 text-center"
              style={{ aspectRatio: CARD_ASPECT }}
            >
              <Swords className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <span className="text-xs leading-tight text-muted-foreground">
                Build one from the card database
              </span>
            </div>
            <p className="mt-2 truncate text-sm font-medium text-foreground">Seeded commander deck</p>
            <p className="truncate text-xs text-muted-foreground">Random legendary creature</p>
          </button>

          {decks.map((deck, index) => {
            const active = seats[armedSeat] === deck.id;
            return (
              <button
                key={deck.id}
                type="button"
                onClick={() => onSeatDeck(armedSeat, deck.id)}
                aria-pressed={active}
                className={cn(
                  'group rounded-xl p-2 text-left transition-all',
                  active ? 'bg-muted shadow-lg shadow-black/30' : 'bg-muted/20 hover:bg-muted/50'
                )}
              >
                {deck.faceCard ? (
                  <CardImage
                    card={deck.faceCard}
                    size="lg"
                    fill
                    eager={index < 8}
                    imageClassName={cn(!active && 'opacity-80 group-hover:opacity-100')}
                  />
                ) : (
                  <div
                    className="flex items-center justify-center rounded-lg bg-muted/50"
                    style={{ aspectRatio: CARD_ASPECT }}
                  >
                    <Swords className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  </div>
                )}
                <p className="mt-2 truncate text-sm font-medium text-foreground">{deck.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {deck.commanderName ?? 'No commander'}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <ColorIdentity colors={deck.colors} size="sm" />
                  <span className="text-[0.7rem] text-muted-foreground">
                    {deck.cardCount === 0
                      ? 'No cards recorded'
                      : `${deck.cardCount} card${deck.cardCount === 1 ? '' : 's'}`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/15 px-3 py-2 text-xs text-foreground">{error}</p>
      )}

      {/* THE START BUTTON MOVED TO THE PAGE HEADER.

          It was a full width bar at the bottom of a tall setup panel, so the
          only reason to open this page was the last thing you reached. Owner:
          "playtest page - play button should be more prominent at top right".
          It now sits beside the tab strip in the header, matching /play. */}
    </div>
  );
}
