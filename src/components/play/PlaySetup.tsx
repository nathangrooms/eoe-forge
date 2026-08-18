/**
 * The lobby.
 *
 * Two decisions matter and everything else is a default: which of your decks is
 * sitting down, and how many seats are at the table. Player count is a row of
 * buttons rather than a dropdown because it is also a preview — 2, 3 and 4 are
 * genuinely different boards, and the seating description under each says so.
 *
 * An account with no decks still gets a game. The opponents are always seeded
 * from commander-legal cards, and if the user has nothing of their own they get
 * a seeded deck too, labelled as one.
 */

import { Loader2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { seatingFor, seatingVariants, type SeatingVariant } from '@/lib/game';
import { defaultSeatingFor } from './seatingDefaults';
import type { DeckSummary } from '@/lib/play/deckSource';

export interface PlaySetupValue {
  deckId: string | null;
  playerCount: number;
  variant: SeatingVariant;
  aggression: 'timid' | 'normal' | 'aggressive';
  seed: number;
}

export interface PlaySetupProps {
  decks: DeckSummary[];
  loadingDecks: boolean;
  starting: boolean;
  error?: string | null;
  value: PlaySetupValue;
  onChange: (value: PlaySetupValue) => void;
  onStart: () => void;
}

const PLAYER_COUNTS = [1, 2, 3, 4];

const AGGRESSION: Array<{ id: PlaySetupValue['aggression']; label: string; hint: string }> = [
  { id: 'timid', label: 'Cautious', hint: 'Only attacks when it wins the exchange outright' },
  { id: 'normal', label: 'Even', hint: 'Trades up and blocks sensibly' },
  { id: 'aggressive', label: 'Aggressive', hint: 'Swings whenever it is not strictly losing' },
];

export function PlaySetup({
  decks,
  loadingDecks,
  starting,
  error,
  value,
  onChange,
  onStart,
}: PlaySetupProps) {
  const set = <K extends keyof PlaySetupValue>(key: K, next: PlaySetupValue[K]) =>
    onChange({ ...value, [key]: next });

  const layout = seatingFor(value.playerCount, value.variant);
  const variants = seatingVariants(value.playerCount);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-xl bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Sit down</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Goldfish a list, or play a pod against bots. Everything runs through the same rules
          engine that will drive online tables.
        </p>

        {/* Deck */}
        <div className="mt-5">
          <label className="text-xs font-medium text-foreground" htmlFor="play-deck">
            Your deck
          </label>
          <Select
            value={value.deckId ?? 'seeded'}
            onValueChange={next => set('deckId', next === 'seeded' ? null : next)}
          >
            <SelectTrigger id="play-deck" className="mt-1.5 h-10">
              <SelectValue placeholder="Choose a deck" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="seeded">Seeded commander deck (no deck of my own)</SelectItem>
              {decks.map(deck => (
                <SelectItem key={deck.id} value={deck.id}>
                  {deck.name} · {deck.format}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {loadingDecks
              ? 'Loading your decks…'
              : decks.length === 0
                ? 'No saved decks found — a seeded commander deck will be built for you.'
                : `${decks.length} deck${decks.length === 1 ? '' : 's'} available.`}
          </p>
        </div>

        {/* Seats */}
        <div className="mt-5">
          <span className="text-xs font-medium text-foreground">Players</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {PLAYER_COUNTS.map(count => (
              <button
                key={count}
                type="button"
                onClick={() => {
                  // Changing the count changes which arrangements exist, so the
                  // variant resets to whatever that pod size should open in —
                  // which on a desktop screen means a four-player pod opens in
                  // quads, not the pinwheel.
                  onChange({
                    ...value,
                    playerCount: count,
                    variant: defaultSeatingFor(count),
                  });
                }}
                aria-pressed={value.playerCount === count}
                className={cn(
                  'flex h-10 min-w-[4.5rem] items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors',
                  value.playerCount === count
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                )}
              >
                <Users className="h-3.5 w-3.5" />
                {count === 1 ? 'Solo' : count}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">{layout.description}</p>
        </div>

        {/* Seating arrangement, when there is a choice */}
        {variants.length > 1 && (
          <div className="mt-5">
            <span className="text-xs font-medium text-foreground">Seating</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {variants.map(option => (
                <button
                  key={option.variant}
                  type="button"
                  onClick={() => set('variant', option.variant)}
                  aria-pressed={value.variant === option.variant}
                  title={option.description}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-xs font-medium capitalize transition-colors',
                    value.variant === option.variant
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                  )}
                >
                  {option.variant}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bot temperament */}
        {value.playerCount > 1 && (
          <div className="mt-5">
            <span className="text-xs font-medium text-foreground">Opponents</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {AGGRESSION.map(option => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => set('aggression', option.id)}
                  aria-pressed={value.aggression === option.id}
                  title={option.hint}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                    value.aggression === option.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {AGGRESSION.find(option => option.id === value.aggression)?.hint}
            </p>
          </div>
        )}

        {/* Seed */}
        <div className="mt-5">
          <span className="text-xs font-medium text-foreground">Shuffle seed</span>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs text-foreground">
              {value.seed}
            </span>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 text-xs"
              onClick={() => set('seed', Math.floor(Math.random() * 100000) + 1)}
            >
              New seed
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            The shuffle is seeded, so the same seed and the same decks deal the same game —
            which is what makes a bad draw reproducible instead of anecdotal.
          </p>
        </div>

        {error && (
          <p className="mt-5 rounded-lg bg-destructive/15 px-3 py-2 text-xs text-foreground">{error}</p>
        )}

        <Button className="mt-6 h-11 w-full" onClick={onStart} disabled={starting}>
          {starting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Shuffling up…
            </>
          ) : (
            `Start ${value.playerCount === 1 ? 'goldfish' : `${value.playerCount}-player game`}`
          )}
        </Button>
      </div>
    </div>
  );
}
