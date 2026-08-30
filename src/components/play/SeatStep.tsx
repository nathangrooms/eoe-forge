/**
 * Step three, for the three modes that deal their own table.
 *
 * Owner: *"Opponent DECKS must be selectable."* So the whole screen is the
 * seats: each one a full, uncropped commander at a size you can read, its
 * colours and card count beneath, and one shared deck wall below that fills
 * whichever seat is armed.
 *
 * ---------------------------------------------------------------------------
 * ONE SCREEN, THREE MODES, AND THE DIFFERENCE IS WHO PRESSES THE BUTTONS
 * ---------------------------------------------------------------------------
 * `bots` and `playtest` are the same table with the same seats. The only thing
 * that separates them is whether seat one is played by you or played for you,
 * and that is a flag on the seat when the table is built, not a second screen.
 * `PlaytestSetup` used to be that second screen, with its own seat card, its own
 * deck wall and its own temperament row, and the drift it caused is exactly what
 * the project law exists to stop. It is gone; this is what replaced it.
 *
 * Goldfish never reaches this screen: it seats one chair and has nothing to
 * fill, so `stepsFor` gives it two steps and this is not one of them. The
 * goldfish branches below are kept because a URL can still name this screen and
 * a screen that throws on a hand typed address is worse than a quiet one.
 *
 * ---------------------------------------------------------------------------
 * THE PLAYMAT CATALOGUE IS NOT ON THE CRITICAL PATH ANY MORE
 * ---------------------------------------------------------------------------
 * Measured 30 Aug 2026, versus bots, at 1600 x 1000: this screen ran 1,645px in
 * a 1,000px window and 750px of it was the playmat picker. Fourteen texture
 * tiles, eight colour buttons and an upload link, stacked between the seats and
 * the game. At 390px it ran 3,216px in an 844px window with the playmat
 * starting at y=1,751.
 *
 * A playmat lasts for every game you ever play here. It is not a decision about
 * THIS game. It moved into `TableSettingsPanel`, the right-hand slide-out, with
 * the shuffle seed, and what is left on the page is a LIVE PREVIEW of the mat
 * you will actually get with the way to change it beside it. Owner:
 * *"I dont see the themed playmats?"* They are still on screen and still one
 * press from being changed, in the in game menu and on `/play/mats` as well.
 */

import { Bot, Loader2, Plus, UserRound, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CardImage, CARD_ASPECT } from '@/components/cards';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { Playmat } from './Playmat';
import { matStyleOf } from './matStyles';
import { usePlaymatPrefs } from './usePlaymatStyle';
import { DeckWall } from './DeckWall';
import { cardCountLine } from './playDeckView';
import type { PlayDeckOption } from './usePlayDecks';
import type { PlayModeId } from './playModes';
import { seatingFor, seatingVariants, type SeatingVariant } from '@/lib/game';

export type Aggression = 'timid' | 'normal' | 'aggressive';

const MAX_SEATS = 4;

const AGGRESSION: Array<{ id: Aggression; label: string; hint: string }> = [
  { id: 'timid', label: 'Cautious', hint: 'Only attacks when it wins the exchange outright' },
  { id: 'normal', label: 'Even', hint: 'Trades up and blocks sensibly' },
  { id: 'aggressive', label: 'Aggressive', hint: 'Swings whenever it is not strictly losing' },
];

export interface SeatStepProps {
  mode: PlayModeId;
  decks: PlayDeckOption[];
  loadingDecks: boolean;
  /** Seat one, chosen at step two. `null` means a seeded deck. */
  deckId: string | null;
  /** Changing seat one from here. It is the same choice step two made. */
  onDeckId: (next: string | null) => void;
  /** Seats two and up. One entry per opponent. */
  opponents: Array<{ deckId: string | null }>;
  onOpponents: (next: Array<{ deckId: string | null }>) => void;
  armedSeat: number;
  onArmSeat: (index: number) => void;
  aggression: Aggression;
  onAggression: (next: Aggression) => void;
  variant: SeatingVariant;
  onVariant: (next: SeatingVariant) => void;
  seed: number;
  /** Opens the right-hand slide-out holding the playmat and the shuffle seed. */
  onOpenSettings: () => void;
  error?: string | null;
}

/** One chair. Not a deck tile: it can be empty, it can be removed, and it arms. */
function Seat({
  label,
  deck,
  seeded,
  armed,
  removable,
  onArm,
  onRemove,
  className,
}: {
  label: string;
  deck: PlayDeckOption | null;
  seeded: boolean;
  armed: boolean;
  removable: boolean;
  onArm: () => void;
  onRemove: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative min-w-0 rounded-xl p-3 transition-colors',
        armed ? 'bg-muted shadow-lg shadow-black/30' : 'bg-muted/20 hover:bg-muted/40',
        className
      )}
    >
      <button type="button" onClick={onArm} className="w-full text-left" aria-pressed={armed}>
        <div className="flex items-center gap-1.5">
          {label === 'Your seat' ? (
            <UserRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          ) : (
            <Bot className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </span>
        </div>

        {/* Capped rather than stretched: a seat is a quarter of a wide table,
            and a card drawn to that whole width is 600px tall with nothing else
            able to fit beside it. */}
        <div className="mt-2 w-full max-w-[190px]">
          {deck?.faceCard ? (
            <CardImage card={deck.faceCard} size="lg" fill eager />
          ) : (
            <div
              className="flex flex-col items-center justify-center gap-1 rounded-lg bg-muted/40 px-2 text-center"
              style={{ aspectRatio: CARD_ASPECT }}
            >
              <span className="text-[0.7rem] leading-tight text-muted-foreground">
                {seeded ? 'Seeded commander deck' : 'No commander art'}
              </span>
            </div>
          )}
        </div>

        <p className="mt-2 truncate text-sm font-medium text-foreground">
          {deck?.name ?? 'Seeded commander deck'}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {deck ? deck.commanderName ?? 'No commander set' : 'Built live from the card database'}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <ColorIdentity colors={deck?.colors ?? []} size="sm" />
          <span className="truncate text-[0.7rem] text-muted-foreground">
            {deck ? cardCountLine(deck) : '99 cards'}
          </span>
        </div>
      </button>

      {removable && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-background/70 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function SeatStep({
  mode,
  decks,
  loadingDecks,
  deckId,
  onDeckId,
  opponents,
  onOpponents,
  armedSeat,
  onArmSeat,
  aggression,
  onAggression,
  variant,
  onVariant,
  seed,
  onOpenSettings,
  error,
}: SeatStepProps) {
  /* The mat the reader will actually sit down on, read from the same account
     preference the board reads. The preview below is that mat, not a swatch. */
  const mats = usePlaymatPrefs();
  const byId = new Map(decks.map(deck => [deck.id, deck]));
  const deckFor = (id: string | null) => (id ? byId.get(id) ?? null : null);

  /* Every seat at this table, seat one first. Bots and playtest hold the same
     list; only the label on seat one and the `isBot` flag when it is dealt
     tell them apart. */
  const seatDecks: Array<string | null> = [deckId, ...opponents.map(seat => seat.deckId)];
  const seatCount = mode === 'goldfish' ? 1 : seatDecks.length;
  const layout = seatingFor(seatCount, variant);
  const variants = seatingVariants(seatCount);

  const setOpponentCount = (count: number) => {
    // Existing choices survive a count change: 3 to 1 and back to 3 must not
    // wipe the decks already chosen for seats two and three.
    onOpponents(Array.from({ length: count }, (_, i) => opponents[i] ?? { deckId: null }));
  };

  const removeSeat = (index: number) => {
    if (opponents.length <= 1) return;
    onOpponents(opponents.filter((_, i) => i !== index));
    if (armedSeat > index) onArmSeat(armedSeat - 1);
  };

  const setSeatDeck = (index: number, id: string | null) => {
    /* Seat one is the deck chosen at step two. It is the SAME choice, so it is
       written back to the same place rather than kept twice: two copies of "my
       deck" is how a table ends up dealing the one you did not pick. */
    if (index === 0) {
      onDeckId(id);
      return;
    }
    onOpponents(opponents.map((seat, i) => (i === index - 1 ? { deckId: id } : seat)));
  };

  /* Goldfish has one chair, so the wall below always fills seat one whatever
     the armed index happens to be from a previous mode. Without this, arriving
     from versus bots left seat two armed, and choosing a deck on a screen with
     one seat on it silently set an opponent nobody was going to play. */
  const activeSeat = mode === 'goldfish' ? 0 : Math.min(armedSeat, seatCount - 1);
  const armedIsYours = activeSeat === 0;

  return (
    <div className="w-full space-y-4">
      {/* The table. */}
      <section className="w-full rounded-xl bg-card p-4 shadow-sm md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            The table
          </h2>
          <p className="text-xs text-muted-foreground">
            {mode === 'goldfish'
              ? 'One seat. Nothing blocks and nothing attacks back.'
              : mode === 'playtest'
                ? 'Every seat is played by the bot policy, on the same rules engine as a game you play yourself.'
                : 'Seat one is yours. Pick a seat, then pick its deck below.'}
          </p>
        </div>

        {/*
          THE SEATS AND THE TABLE SETTINGS SIT SIDE BY SIDE.

          Measured on 29 Aug 2026 at 1600 x 1000, versus bots, two seats: the
          seats used the left 720px of a 1592px row and the temperament and
          seating controls were stacked UNDERNEATH them in a column about 480px
          wide. So 870px of this section was empty for its whole height while
          the page ran to 1394px and scrolled 394px past the window.

          Height was the scarce thing and width was the abundant thing, and the
          layout was spending the scarce one. The settings move into the room
          that was already beside the seats. They are the right things to put
          there: how hard the bots push and where everybody sits are both facts
          ABOUT this table, so they belong in the same box as the chairs.
        */}
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        {/* Wrapping row rather than a four column grid. Two seats in a
            four column grid left half a screen of empty card, and a table with
            two people at it should look like a table with two people at it. */}
        <div className="flex min-w-0 flex-1 flex-wrap gap-3">
          {seatDecks.slice(0, seatCount).map((id, index) => (
            <Seat
              key={index}
              className="w-full min-w-0 flex-none sm:w-[15rem]"
              label={
                mode === 'playtest'
                  ? `Seat ${index + 1}`
                  : index === 0
                    ? 'Your seat'
                    : `Opponent ${index}`
              }
              deck={deckFor(id)}
              seeded={id === null}
              armed={activeSeat === index}
              removable={index > 1}
              onArm={() => onArmSeat(index)}
              onRemove={() => removeSeat(index - 1)}
            />
          ))}

          {mode !== 'goldfish' && seatCount < MAX_SEATS && (
            <button
              type="button"
              onClick={() => setOpponentCount(opponents.length + 1)}
              className="motion-press flex w-full flex-none flex-col items-center justify-center gap-2 rounded-xl bg-muted/10 p-3 text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground sm:w-[15rem]"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
              <span className="text-xs font-medium">
                {mode === 'playtest' ? 'Add a seat' : 'Add an opponent'}
              </span>
            </button>
          )}
        </div>

        {/* The settings column. It only exists when there is something to put
            in it, so goldfish (one seat, no bots, no seating choice) keeps the
            chairs across the full row rather than holding an empty gutter. */}
        {(mode !== 'goldfish' || variants.length > 1) && (
        <div className="flex w-full shrink-0 flex-col gap-5 lg:w-[19rem]">
        {mode !== 'goldfish' && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-full text-[11px] font-medium text-muted-foreground">
              Bot temperament
            </span>
            {AGGRESSION.map(option => (
              <button
                key={option.id}
                type="button"
                onClick={() => onAggression(option.id)}
                aria-pressed={aggression === option.id}
                title={option.hint}
                className={cn(
                  'motion-press rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  aggression === option.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                )}
              >
                {option.label}
              </button>
            ))}
            <span className="w-full text-[11px] leading-snug text-muted-foreground">
              {AGGRESSION.find(option => option.id === aggression)?.hint}
            </span>
          </div>
        )}

        {variants.length > 1 && (
          <div>
            <span className="text-[11px] font-medium text-muted-foreground">Seating</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {variants.map(option => (
                <button
                  key={option.variant}
                  type="button"
                  onClick={() => onVariant(option.variant)}
                  aria-pressed={variant === option.variant}
                  title={option.description}
                  className={cn(
                    'motion-press rounded-md px-2.5 py-1.5 text-xs font-medium capitalize transition-colors',
                    variant === option.variant
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                  )}
                >
                  {option.variant}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
              {layout.description}
            </p>
          </div>
        )}
        </div>
        )}
        </div>

        {/* The surface, as ONE ROW rather than a catalogue.

            It is the mat this seat is about to get, painted by the same
            component the board paints it with, at the chosen deck's colours. It
            says which one it is, and it opens the picker. 90px instead of 750,
            and the playmat is still the first thing you see when you look for
            it. */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Playmat
            className="h-14 w-28 shrink-0"
            rounded="rounded-lg"
            tone="active"
            colors={deckFor(deckId)?.colors}
          />
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground">Your playmat</p>
            <p className="truncate text-sm text-foreground">
              {matStyleOf(mats.style).name}
              {mats.matUrl ? ' over your own picture' : ''}
            </p>
          </div>
          <Button variant="secondary" size="sm" className="h-8 text-xs" onClick={onOpenSettings}>
            Playmat and shuffle
          </Button>
          <span className="text-[11px] text-muted-foreground">Seed {seed}</span>
        </div>
      </section>

      {/* The wall that fills the armed seat, the full width of the page.

          It shared a row with the playmat catalogue until 29 Aug 2026, which
          halved it: at 1280 the wall was five 145px cards in an 800px column.
          The catalogue is in the slide-out now and the decks get the room. */}
      <section className="w-full min-w-0 rounded-xl bg-card p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {mode === 'goldfish'
              ? 'Change your deck'
              : armedIsYours
                ? mode === 'playtest'
                  ? 'Deck for seat 1'
                  : 'Deck for your seat'
                : mode === 'playtest'
                  ? `Deck for seat ${activeSeat + 1}`
                  : `Deck for opponent ${activeSeat}`}
          </h2>
          {armedIsYours && mode !== 'goldfish' && (
            <p className="text-xs text-muted-foreground">
              Seat one was chosen at step two. Choosing here changes it.
            </p>
          )}
        </div>

        {loadingDecks ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        ) : (
          <DeckWall
            className="mt-4"
            decks={decks}
            mode={mode}
            value={seatDecks[activeSeat] ?? null}
            onChoose={id => setSeatDeck(activeSeat, id)}
            seeded={{
              label: 'Seeded commander deck',
              hint: 'No deck of my own for this seat',
              chosen: seatDecks[activeSeat] === null,
              onChoose: () => setSeatDeck(activeSeat, null),
            }}
          />
        )}
      </section>

      {error && (
        <p className="rounded-lg bg-destructive/15 px-3 py-2 text-xs text-foreground">{error}</p>
      )}
    </div>
  );
}
