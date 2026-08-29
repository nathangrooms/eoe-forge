/**
 * DeckMatrix — life counter: pre-game setup.
 *
 * Two things this screen has to get right, and they pull against each other.
 *
 * **You must be able to see what you are choosing.** Five swatches of paint
 * tell you nothing about the board you will be staring at for the next two
 * hours, so the hero here is a live miniature of the actual table — real seat
 * geometry from `seating.ts`, real mats, real starting life, each seat rotated
 * exactly as the player sitting there will see it. Change the pod size or a
 * seat's colour and the board changes under your thumb. Every swatch is
 * likewise a real mat rather than a coloured square.
 *
 * **And you must be able to skip all of it.** The table is complete and legal
 * the moment this screen opens — last week's pod size, last week's colours, the
 * right life total for the format — and Start sits in a bar that never scrolls
 * away. One press plays. Everything beside the preview is for the week the
 * regular table has a guest.
 *
 * **This screen is not the game.** It renders inside the app frame like every
 * other page: top bar, rail, Back. It used to blank the entire application to
 * ask how many people were playing, which on a desktop stranded a 32rem column
 * of controls in the middle of a black screen. The table now takes the width it
 * deserves and the controls sit beside it, so the whole setup reads at a glance
 * instead of scrolling past the fold. Immersion starts at Start.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Play, Undo2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import {
  seatBoxStyle,
  seatContentStyle,
  seatingFor,
  startingLifeFor,
  type Format,
} from '@/lib/game';

import { MatSurface } from './MatSurface';
import { MAT_COLORS, matDefinition, type MatColor } from './mats';
import { StepButton } from './Stepper';
import { useMatArt, type MatArtMap } from './useMatArt';
import {
  LIFE_FORMATS,
  MAX_STARTING_LIFE,
  MIN_STARTING_LIFE,
  PLAYER_COUNTS,
  defaultVariantFor,
  resizeSeats,
  seatName,
  type LifeGameConfig,
  type LifeSeatConfig,
} from './session';

const LIFE_PRESETS = [20, 25, 30, 40];

/* -------------------------------------------------------------------------- */
/* Table preview                                                              */
/* -------------------------------------------------------------------------- */

interface TablePreviewProps {
  seats: LifeSeatConfig[];
  startingLife: number;
  art: MatArtMap;
  activeIndex: number;
  onSelect: (index: number) => void;
}

/**
 * The board, in miniature and honest about it.
 *
 * Same `seatingFor` call the game itself makes, same variant, same rotations —
 * so the two-player split, the three-player wedge and the four-player quads all
 * preview as the thing that will actually be on the table. Type scales in
 * container-query units for the same reason it does on the live panel: one seat
 * has to fill a half, a third and a quarter of the same box.
 */
function TablePreview({ seats, startingLife, art, activeIndex, onSelect }: TablePreviewProps) {
  const layout = useMemo(
    () => seatingFor(seats.length, defaultVariantFor(seats.length)),
    [seats.length],
  );

  return (
    // Capped: on a 27" monitor an uncapped 4:3 board is taller than the viewport
    // and the controls beside it fall off the bottom.
    <div className="relative mx-auto aspect-[4/3] w-full max-w-[52rem] overflow-hidden rounded-2xl bg-background shadow-[0_2px_14px_hsl(0_0%_0%/0.5)]">
      {layout.seats.map(seat => {
        const config = seats[seat.index];
        if (!config) return null;

        const def = matDefinition(config.mat);
        const active = seat.index === activeIndex;
        // Same trick as the live panel: the axis that reads as "height" to the
        // player at this seat is the box's width once it has been rotated.
        const h = seat.isSideways ? 'cqw' : 'cqh';

        return (
          <div key={seat.index} style={seatBoxStyle(seat)}>
            <div style={seatContentStyle(seat)}>
              <button
                type="button"
                onClick={() => onSelect(seat.index)}
                aria-pressed={active}
                aria-label={`Seat ${seat.index + 1}, ${seatName(config, seat.index)}, ${def.label}. Choose this seat's colour.`}
                className="absolute inset-[3px] overflow-hidden rounded-xl outline-none"
              >
                <MatSurface color={config.mat} art={art[config.mat]?.art} tone="preview" />

                {/* Selection reads as light falling on the chosen mat — a tint
                    and a lift, never a hairline. */}
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-0 bg-foreground/[0.10] transition-opacity duration-200 motion-reduce:transition-none',
                    active ? 'opacity-100' : 'opacity-0',
                  )}
                />

                <span className="absolute inset-0 flex flex-col items-center justify-center gap-[0.35em] text-white">
                  <span
                    className="font-semibold leading-none tabular-nums drop-shadow-[0_1px_3px_hsl(0_0%_0%/0.85)]"
                    style={{ fontSize: `clamp(1rem, 26${h}, 4rem)`, letterSpacing: '-0.03em' }}
                  >
                    {startingLife}
                  </span>
                  <span
                    className="max-w-[86%] truncate font-medium leading-none text-white/80 drop-shadow-[0_1px_2px_hsl(0_0%_0%/0.9)]"
                    style={{ fontSize: `clamp(0.55rem, 7.5${h}, 1rem)` }}
                  >
                    {seatName(config, seat.index)}
                  </span>
                </span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Mat swatch                                                                 */
/* -------------------------------------------------------------------------- */

interface MatSwatchProps {
  color: MatColor;
  art?: string | null;
  selected: boolean;
  /** True when another seat at this table has already taken this colour. */
  taken: boolean;
  onSelect: () => void;
  label: string;
}

/**
 * One colour, drawn as the mat it will become rather than as a chip of paint.
 *
 * Selection is height, brightness and a tick — the unchosen swatches shrink and
 * dim rather than the chosen one gaining an outline. A colour already in use at
 * this table stays choosable, because two green decks is a real pod, but it is
 * marked: telling seats apart is the entire point of the mats.
 */
function MatSwatch({ color, art, selected, taken, onSelect, label }: MatSwatchProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={selected ? `${label}, chosen` : taken ? `${label}, already used at this table` : label}
      className={cn(
        'relative flex-1 overflow-hidden rounded-xl outline-none',
        'transition-all duration-200 motion-reduce:transition-none',
        selected
          ? 'h-[4.25rem] shadow-[0_3px_12px_hsl(0_0%_0%/0.55)]'
          : 'h-14 self-center opacity-55 hover:opacity-90 focus-visible:opacity-100',
      )}
    >
      <MatSurface color={color} art={art} tone="swatch" />

      <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/45 py-[3px]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/90">
          {color}
        </span>
        {selected && <Check aria-hidden className="h-3 w-3 text-white" strokeWidth={3} />}
      </span>

      {taken && !selected && (
        <span
          aria-hidden
          title="Already used at this table"
          className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-white/70"
        />
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

export interface LifeSetupProps {
  initialConfig: LifeGameConfig;
  /** Present when a game is already running — setup can be backed out of. */
  onCancel?: () => void;
  onStart: (config: LifeGameConfig) => void;
  onExit: () => void;
}

export function LifeSetup({ initialConfig, onCancel, onStart, onExit }: LifeSetupProps) {
  const art = useMatArt();

  const [format, setFormat] = useState<Format>(initialConfig.format);
  const [seats, setSeats] = useState<LifeSeatConfig[]>(initialConfig.seats);
  const [startingLife, setStartingLife] = useState(initialConfig.startingLife);
  /**
   * Once the total is typed by hand, changing format stops overwriting it. A
   * remembered custom total counts as typed — it *was* typed, just last week.
   */
  const [lifeTouched, setLifeTouched] = useState(
    () =>
      initialConfig.startingLife !==
      startingLifeFor(initialConfig.format, initialConfig.seats.length),
  );
  const [activeIndex, setActiveIndex] = useState(0);

  const playerCount = seats.length;
  /* A life counter is normally one device in the middle of the table, so seats
     rotate to face their player. Solo keeps everything upright. */
  const [orientation, setOrientation] = useState<'shared' | 'solo'>(
    initialConfig.orientation ?? 'shared',
  );
  const seatRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (lifeTouched) return;
    setStartingLife(startingLifeFor(format, playerCount));
  }, [format, playerCount, lifeTouched]);

  // Shrinking the pod must not leave the colour picker pointed at a seat that
  // no longer exists.
  useEffect(() => {
    setActiveIndex(current => Math.min(current, playerCount - 1));
  }, [playerCount]);

  const setCount = (count: number) => setSeats(current => resizeSeats(current, count));

  const setMat = (index: number, mat: MatColor) => {
    setSeats(current => current.map((seat, i) => (i === index ? { ...seat, mat } : seat)));
  };

  const focusSeat = (index: number) => {
    setActiveIndex(index);
    seatRefs.current[index]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  const activeSeat = seats[activeIndex];
  const defaultLife = startingLifeFor(format, playerCount);

  const start = () => {
    onStart({
      orientation,
      format,
      startingLife: Math.min(MAX_STARTING_LIFE, Math.max(MIN_STARTING_LIFE, startingLife)),
      seats,
    });
  };

  return (
    <StandardPageLayout
      title="Life counter"
      description={
        onCancel
          ? 'A game is already running. Change the table below, or resume where you left off.'
          : 'Set the table, then start. The game itself takes over the whole screen.'
      }
      action={
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button variant="secondary" className="h-11 px-5" onClick={onCancel}>
              Resume game
            </Button>
          )}
          <Button className="h-11 gap-2 px-5" onClick={start}>
            <Play className="h-4 w-4" />
            Start {playerCount}-player game
          </Button>
        </div>
      }
    >
      <div className="flex w-full flex-col gap-4 pb-2">
        {/*
          One column on a phone, which is where this screen is usually held. From
          `lg` the table takes the left of the full page width and the settings
          that change it sit beside it — the picture is large, and the black
          margins that used to flank a 32rem column are gone. The seats get their
          own full-width row below, one card per seat, so no column ends up twice
          the height of the other.
        */}
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start lg:gap-5 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          {/* The board itself. Everything beside it is an edit to this picture. */}
          <section className="flex flex-col gap-2">
            <TablePreview
              seats={seats}
              startingLife={startingLife}
              art={art}
              activeIndex={activeIndex}
              onSelect={focusSeat}
            />
            {activeSeat && (
              <p className="px-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {seatName(activeSeat, activeIndex)}
                </span>
                {' plays on '}
                {matDefinition(activeSeat.mat).label} · {matDefinition(activeSeat.mat).epithet}
                {art[activeSeat.mat] && (
                  <>
                    {' · art from '}
                    <span className="text-foreground/70">{art[activeSeat.mat]!.cardName}</span>
                  </>
                )}
              </p>
            )}

            {/*
              Under the picture, not at the end of the scroll. The promise of
              this screen is that the defaults are already right, and on a phone
              this is the first thing under the thumb after the table itself.
            */}
            <div className="mt-1 flex items-center gap-2">
              {onCancel ? (
                <Button variant="secondary" className="h-14 px-5" onClick={onCancel}>
                  Resume
                </Button>
              ) : (
                <Button variant="ghost" className="h-14 px-5" onClick={onExit}>
                  Leave
                </Button>
              )}
              <Button className="h-14 flex-1 text-base" onClick={start}>
                <Play className="h-5 w-5" />
                Start {playerCount}-player game
              </Button>
            </div>
          </section>

          {/* The settings that redraw the picture, beside it rather than under. */}
          <div className="grid content-start gap-3 2xl:grid-cols-2">
          {/* Pod size */}
          <section className="flex flex-col gap-2 rounded-2xl bg-card p-3">
            <h2 className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Players
            </h2>
            {/* One column per size, so the row reads as a scale from two to six
                rather than wrapping the last two onto a line of their own. */}
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${PLAYER_COUNTS.length}, minmax(0, 1fr))` }}
            >
              {PLAYER_COUNTS.map(count => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setCount(count)}
                  aria-pressed={playerCount === count}
                  aria-label={`${count} players`}
                  className={cn(
                    'h-16 rounded-xl text-2xl font-semibold transition-colors motion-reduce:transition-none',
                    playerCount === count
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted',
                  )}
                >
                  {count}
                </button>
              ))}
            </div>
          </section>

          {/* How the device is being used. Decides whether seats rotate. */}
          <section className="flex flex-col gap-2 rounded-2xl bg-card p-3">
            <h2 className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              This device
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {([
                {
                  value: 'shared' as const,
                  title: 'On the table',
                  hint: 'Seats face outward, so each player reads their own side',
                },
                {
                  value: 'solo' as const,
                  title: 'Just me',
                  hint: 'Everything stays upright for one reader',
                },
              ]).map(mode => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setOrientation(mode.value)}
                  aria-pressed={orientation === mode.value}
                  className={cn(
                    'rounded-xl px-3 py-2.5 text-left transition-colors motion-reduce:transition-none',
                    orientation === mode.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted',
                  )}
                >
                  <span className="block text-sm font-medium">{mode.title}</span>
                  <span
                    className={cn(
                      'mt-0.5 block text-[11px] leading-snug',
                      orientation === mode.value
                        ? 'text-primary-foreground/75'
                        : 'text-muted-foreground/80',
                    )}
                  >
                    {mode.hint}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* Format */}
          <section className="flex flex-col gap-2 rounded-2xl bg-card p-3">
            <h2 className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Format
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {LIFE_FORMATS.map(option => (
                <button
                  key={option.format}
                  type="button"
                  onClick={() => setFormat(option.format)}
                  aria-pressed={format === option.format}
                  aria-label={`${option.label}. ${option.note}`}
                  className={cn(
                    'rounded-xl px-3 py-2.5 text-left transition-colors motion-reduce:transition-none',
                    format === option.format
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 hover:bg-muted',
                  )}
                >
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span
                    className={cn(
                      'block text-xs',
                      format === option.format
                        ? 'text-primary-foreground/70'
                        : 'text-muted-foreground',
                    )}
                  >
                    {option.note}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* Starting life */}
          <section className="flex flex-col gap-3 rounded-2xl bg-card p-3">
            <div className="flex items-center justify-between gap-2 px-1">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Starting life
              </h2>
              {startingLife !== defaultLife && (
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-muted-foreground"
                  onClick={() => {
                    setLifeTouched(false);
                    setStartingLife(defaultLife);
                  }}
                >
                  <Undo2 aria-hidden className="h-3 w-3" />
                  Back to {defaultLife}
                </button>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <StepButton
                direction={-1}
                label="Lower starting life"
                disabled={startingLife <= MIN_STARTING_LIFE}
                onStep={delta => {
                  setLifeTouched(true);
                  setStartingLife(current => Math.max(MIN_STARTING_LIFE, current + delta));
                }}
              />
              <span className="text-4xl font-semibold tabular-nums">{startingLife}</span>
              <StepButton
                direction={1}
                label="Raise starting life"
                disabled={startingLife >= MAX_STARTING_LIFE}
                onStep={delta => {
                  setLifeTouched(true);
                  setStartingLife(current => Math.min(MAX_STARTING_LIFE, current + delta));
                }}
              />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {LIFE_PRESETS.map(preset => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setLifeTouched(true);
                    setStartingLife(preset);
                  }}
                  className={cn(
                    'h-10 rounded-xl text-sm font-semibold tabular-nums transition-colors motion-reduce:transition-none',
                    startingLife === preset
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted',
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
          </section>
          </div>
        </div>

        {/*
          Seats get the whole page width, one card per seat, laid out in the same
          order the board numbers them. Stacked in a side column this was twice
          the height of everything next to it and pushed the settings off screen;
          across the page it reads as the table it describes.
        */}
        <section className="flex flex-col gap-2 rounded-2xl bg-card p-3">
          <h2 className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Seats &amp; colours
          </h2>

          <div
            className="grid gap-2 sm:grid-cols-2 lg:[grid-template-columns:repeat(var(--seat-cols),minmax(0,1fr))]"
            style={{ ['--seat-cols' as string]: String(playerCount) }}
          >
          {seats.map((seat, index) => (
            <div
              key={index}
              ref={element => {
                seatRefs.current[index] = element;
              }}
              className={cn(
                'flex flex-col gap-2.5 rounded-xl p-2 transition-colors motion-reduce:transition-none',
                index === activeIndex ? 'bg-muted/70' : 'bg-muted/30',
              )}
            >
              <div className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <Input
                  value={seat.name}
                  maxLength={24}
                  aria-label={`Player ${index + 1} name`}
                  placeholder={`Player ${index + 1}`}
                  onFocus={() => setActiveIndex(index)}
                  onChange={event => {
                    const { value } = event.target;
                    setSeats(current =>
                      current.map((s, i) => (i === index ? { ...s, name: value } : s)),
                    );
                  }}
                  className="h-11 border-0 bg-background/60 font-medium"
                />
              </div>

              <div className="flex items-stretch gap-1.5">
                {MAT_COLORS.map(color => (
                  <MatSwatch
                    key={color}
                    color={color}
                    art={art[color]?.art}
                    selected={seat.mat === color}
                    taken={seats.some((other, i) => i !== index && other.mat === color)}
                    label={`${matDefinition(color).label} mat for ${seatName(seat, index)}`}
                    onSelect={() => {
                      setActiveIndex(index);
                      setMat(index, color);
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
          </div>
        </section>

      </div>
    </StandardPageLayout>
  );
}
