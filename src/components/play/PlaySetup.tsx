/**
 * The lobby.
 *
 * Owner: *"doesnt let you start online game, or bot game etc"* and
 * *"Opponent DECKS must be selectable."*
 *
 * So this is a table you actually sit down at rather than a form with one
 * dropdown. Three modes, and all three are visible whether or not they are
 * finished:
 *
 *   - **Goldfish** — one seat, no opponent. The old default.
 *   - **Versus bots** — one to three opponents, and **each one is a named seat
 *     with its own deck picker**. A pod is three different decks or it is not a
 *     pod; "random seeded commander deck" is one of the choices, not the only
 *     one.
 *   - **Online** — shown, described, and honestly disabled. Hiding an
 *     unfinished mode does not make it finished, it makes the lobby look
 *     broken; what it is actually waiting on is named on the card, so the claim
 *     is checkable.
 *
 * Every seat's picker reads the same deck list, and a deck holding no cards is
 * offered but marked, because this account has nine of them and picking one
 * used to hand you a seeded deck with no explanation.
 */

import { Bot, Check, Dices, Globe, Loader2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ColorIdentity } from '@/components/ui/mana-cost';
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

/** Which kind of table is being set up. */
export type PlayMode = 'goldfish' | 'bots' | 'online';

/**
 * One opponent seat. `deckId` null means "build a seeded commander deck for
 * this seat", which is what an account with no decks gets and what a player who
 * wants a surprise picks on purpose.
 */
export interface OpponentSeatValue {
  deckId: string | null;
}

export interface PlaySetupValue {
  mode: PlayMode;
  deckId: string | null;
  /** One entry per bot. Its length is the opponent count. */
  opponents: OpponentSeatValue[];
  variant: SeatingVariant;
  aggression: 'timid' | 'normal' | 'aggressive';
  seed: number;
}

/** Seats at the table for a given setup, the viewer included. */
export function playerCountFor(value: PlaySetupValue): number {
  return value.mode === 'bots' ? 1 + value.opponents.length : 1;
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

/** Sentinel for "no deck of mine" — Radix Select cannot hold an empty value. */
const SEEDED = '__seeded__';

const OPPONENT_COUNTS = [1, 2, 3];

const AGGRESSION: Array<{ id: PlaySetupValue['aggression']; label: string; hint: string }> = [
  { id: 'timid', label: 'Cautious', hint: 'Only attacks when it wins the exchange outright' },
  { id: 'normal', label: 'Even', hint: 'Trades up and blocks sensibly' },
  { id: 'aggressive', label: 'Aggressive', hint: 'Swings whenever it is not strictly losing' },
];

const MODES: Array<{
  id: PlayMode;
  label: string;
  blurb: string;
  icon: typeof Bot;
  ready: boolean;
}> = [
  {
    id: 'goldfish',
    label: 'Goldfish',
    blurb: 'One seat, no opponent. Draw, curve out, and see how the list actually plays.',
    icon: User,
    ready: true,
  },
  {
    id: 'bots',
    label: 'Versus bots',
    blurb: 'Up to three opponents, each with a deck you choose and a temperament you set.',
    icon: Bot,
    ready: true,
  },
  {
    id: 'online',
    label: 'Online',
    blurb:
      'Not built yet. The rules engine already sends its moves over a transport, but only the local one exists — there is no matchmaking and no shared table to join.',
    icon: Globe,
    ready: false,
  },
];

/** A deck's one-line description inside a picker row. */
function deckHint(deck: DeckSummary): string {
  if ((deck.cardCount ?? 0) === 0) return 'empty';
  return `${deck.cardCount} cards`;
}

function DeckPicker({
  id,
  label,
  decks,
  value,
  onChange,
  seededLabel = 'Random seeded commander deck',
}: {
  id: string;
  label: string;
  decks: DeckSummary[];
  value: string | null;
  onChange: (next: string | null) => void;
  seededLabel?: string;
}) {
  const selected = value ? decks.find(deck => deck.id === value) ?? null : null;

  return (
    <div className="min-w-0 flex-1">
      <label className="text-[11px] font-medium text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      <Select
        value={value ?? SEEDED}
        onValueChange={next => onChange(next === SEEDED ? null : next)}
      >
        <SelectTrigger id={id} className="mt-1 h-10 bg-muted/40">
          <SelectValue placeholder="Choose a deck" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SEEDED}>
            <span className="flex items-center gap-2">
              <Dices className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              {seededLabel}
            </span>
          </SelectItem>
          {decks.map(deck => (
            <SelectItem key={deck.id} value={deck.id}>
              <span className="flex items-center gap-2">
                <ColorIdentity colors={deck.colors} size="xs" />
                <span className="truncate">{deck.name}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {deckHint(deck)}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected && (selected.cardCount ?? 0) === 0 && (
        <p className="mt-1 text-[11px] text-foreground">
          That deck is empty — this seat gets a seeded commander deck instead.
        </p>
      )}
    </div>
  );
}

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

  const playerCount = playerCountFor(value);
  const layout = seatingFor(playerCount, value.variant);
  const variants = seatingVariants(playerCount);

  const setOpponentCount = (count: number) => {
    // Existing choices survive a count change: going 3 -> 1 -> 3 must not wipe
    // the decks that were already picked for seats two and three.
    const opponents: OpponentSeatValue[] = Array.from(
      { length: count },
      (_, index) => value.opponents[index] ?? { deckId: null }
    );
    onChange({
      ...value,
      mode: 'bots',
      opponents,
      variant: defaultSeatingFor(1 + count),
    });
  };

  const setOpponentDeck = (index: number, deckId: string | null) => {
    set(
      'opponents',
      value.opponents.map((seat, i) => (i === index ? { deckId } : seat))
    );
  };

  const chooseMode = (mode: PlayMode) => {
    if (mode === 'online') return;
    if (mode === 'goldfish') {
      onChange({ ...value, mode, variant: defaultSeatingFor(1) });
      return;
    }
    const opponents = value.opponents.length > 0 ? value.opponents : [{ deckId: null }];
    onChange({ ...value, mode, opponents, variant: defaultSeatingFor(1 + opponents.length) });
  };

  const startLabel =
    value.mode === 'goldfish' ? 'Start goldfish' : `Start ${playerCount}-player game`;

  return (
    <div className="space-y-4">
      {/* Mode — three cards, all visible, one honestly unavailable. */}
      <div className="grid gap-3 sm:grid-cols-3">
        {MODES.map(mode => {
          const Icon = mode.icon;
          const active = value.mode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => chooseMode(mode.id)}
              disabled={!mode.ready}
              aria-pressed={active}
              className={cn(
                'rounded-xl p-4 text-left transition-colors',
                mode.ready ? 'cursor-pointer' : 'cursor-not-allowed',
                active
                  ? 'bg-primary/15 shadow-sm'
                  : mode.ready
                    ? 'bg-card shadow-sm hover:bg-muted/50'
                    : 'bg-card/50 shadow-sm'
              )}
            >
              <div className="flex items-center gap-2">
                <Icon
                  className={cn('h-4 w-4', active ? 'text-foreground' : 'text-muted-foreground')}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    'text-sm font-semibold',
                    mode.ready ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {mode.label}
                </span>
                {active && (
                  <Check className="ml-auto h-3.5 w-3.5 text-foreground" aria-hidden="true" />
                )}
                {!mode.ready && (
                  <span className="ml-auto rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Coming soon
                  </span>
                )}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{mode.blurb}</p>
            </button>
          );
        })}
      </div>

      {/* `items-start` so the shorter column stops at its content instead of
          stretching into a third of a screen of empty card. */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* Your seat */}
        <div className="rounded-xl bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Your seat</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {loadingDecks
              ? 'Loading your decks…'
              : decks.length === 0
                ? 'No saved decks found — a seeded commander deck will be built for you.'
                : `${decks.length} deck${decks.length === 1 ? '' : 's'} available.`}
          </p>

          <div className="mt-4">
            <DeckPicker
              id="play-deck"
              label="Deck"
              decks={decks}
              value={value.deckId}
              onChange={next => set('deckId', next)}
              seededLabel="Seeded commander deck (no deck of my own)"
            />
          </div>

          <div className="mt-5">
            <span className="text-[11px] font-medium text-muted-foreground">Shuffle seed</span>
            <div className="mt-1 flex items-center gap-2">
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
              The shuffle is seeded, so the same seed and the same decks deal the same game — which
              is what makes a bad draw reproducible instead of anecdotal.
            </p>
          </div>
        </div>

        {/* Opponents */}
        <div className="rounded-xl bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Opponents</h2>

          {value.mode === 'goldfish' ? (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Goldfishing: nobody sits opposite you, nothing blocks and nothing attacks back. Pick{' '}
              <span className="text-foreground">Versus bots</span> above to choose who does.
            </p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11px] font-medium text-muted-foreground">How many</span>
                {OPPONENT_COUNTS.map(count => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setOpponentCount(count)}
                    aria-pressed={value.opponents.length === count}
                    className={cn(
                      'flex h-8 min-w-8 items-center justify-center rounded-md px-2.5 text-xs font-medium transition-colors',
                      value.opponents.length === count
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                    )}
                  >
                    {count}
                  </button>
                ))}
              </div>

              {/* One row per opponent, each with its own deck. */}
              <div className="mt-3 space-y-2">
                {value.opponents.map((seat, index) => (
                  <div key={index} className="flex items-end gap-3 rounded-lg bg-muted/30 p-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Bot className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <DeckPicker
                      id={`play-opponent-${index}`}
                      label={`Opponent ${index + 1}`}
                      decks={decks}
                      value={seat.deckId}
                      onChange={next => setOpponentDeck(index, next)}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <span className="text-[11px] font-medium text-muted-foreground">Temperament</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
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
            </>
          )}

          {/* Seating, when the pod size offers a choice. */}
          {variants.length > 1 && (
            <div className="mt-4">
              <span className="text-[11px] font-medium text-muted-foreground">Seating</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
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
              <p className="mt-1.5 text-[11px] text-muted-foreground">{layout.description}</p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/15 px-3 py-2 text-xs text-foreground">{error}</p>
      )}

      <Button className="h-11 w-full" onClick={onStart} disabled={starting}>
        {starting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Shuffling up…
          </>
        ) : (
          startLabel
        )}
      </Button>
    </div>
  );
}
