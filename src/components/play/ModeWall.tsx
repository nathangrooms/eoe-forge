/**
 * Four doors.
 *
 * Owner's reference: four cards across, each carrying a label in small caps, a
 * large display title, a line saying what the mode IS, a quiet fact and the way
 * in. Nothing has an outline. It should read as four doors, not four form
 * controls.
 *
 * ---------------------------------------------------------------------------
 * THE PHOTOGRAPHS ARE GONE, AND THE TABLE IS DRAWN INSTEAD
 * ---------------------------------------------------------------------------
 * Owner, 29 Aug 2026: *"those images look awful so probably remove them."*
 *
 * They were four generated illustrations, and the measurable fault was worse
 * than taste. On the screenshot they came off, all four were a glowing circular
 * table in the same purple and teal vault: the picture at the top of each door
 * said the same thing on all four doors, on the one screen whose entire job is
 * telling four things apart. And they were expensive to be told nothing by. At
 * 390px the wall ran 2,333px in an 844px window with the fourth door starting
 * at y=1,711, two full screens down, because each cover was a 209px band.
 *
 * What is in that space now is the difference itself. `mode.table` says who is
 * at the table in that mode and this draws it: a surface with a chair at each
 * seat, YOUR chair marked, and the other chairs holding either people or bots
 * or nobody. The seats a mode can add but does not always deal are drawn faint,
 * so "2 to 4 seats" is a picture as well as a sentence.
 *
 * Three things it buys, all of them measured rather than argued:
 *
 *   - the four doors no longer look alike, and what tells them apart is the
 *     thing the reader is choosing between;
 *   - no bucket, no 404, no licence, no bytes over the wire, and it is sharp at
 *     any size because it is drawn. Same reasoning as `matStyles.ts`, whose
 *     weaves it paints the table with;
 *   - the wall is short enough to read on a phone.
 *
 * The table is painted by `Playmat` at each mode's own weave with NO tint. The
 * mat tints are the five MTG colours and handing one to a mode would invent a
 * meaning the mode does not have, which the design law reserves colour against.
 *
 * NEVER put card art here. A door has to be darkened for type to sit on it and
 * Scryfall's guidelines forbid modifying card images. A deck tile shows a card
 * WHOLE and unmodified, which is the permitted case, and that is why art is
 * allowed at step two and not at step one.
 */

import { ArrowRight, Bot, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Playmat } from './Playmat';
import type { MatStyleId } from './matStyles';
import { PLAY_MODES, type ModeTable, type PlayModeId } from './playModes';

/**
 * Where a chair sits around the table, in the order seats are dealt.
 *
 * Seat one is nearest the reader, which is where their own seat is on the real
 * board too. Two is opposite, then the two flanks, so a two-player table reads
 * as head to head and a four-player one as a pod.
 */
const CHAIRS = [
  'bottom-[9%] left-1/2 -translate-x-1/2',
  'top-[9%] left-1/2 -translate-x-1/2',
  'left-[8%] top-1/2 -translate-y-1/2',
  'right-[8%] top-1/2 -translate-y-1/2',
] as const;

/** One chair. Solid means you, muted means somebody, faint means a spare seat. */
function Chair({
  at,
  kind,
  spare,
}: {
  at: string;
  kind: 'you' | 'person' | 'bot';
  spare: boolean;
}) {
  const Icon = kind === 'bot' ? Bot : UserRound;
  return (
    <span
      className={cn(
        'absolute flex h-8 w-8 items-center justify-center rounded-xl sm:h-9 sm:w-9',
        at,
        spare
          ? 'bg-muted/30 text-muted-foreground/40'
          : kind === 'you'
            ? 'bg-foreground text-background shadow-[0_6px_16px_rgba(0,0,0,0.45)]'
            : 'bg-muted text-foreground/70'
      )}
    >
      <Icon className="h-4 w-4 sm:h-[1.1rem] sm:w-[1.1rem]" aria-hidden="true" />
    </span>
  );
}

/**
 * The table, drawn.
 *
 * Decorative in the accessibility tree: every fact it carries is written in
 * words on the door beneath it, so a screen reader that skips it loses nothing.
 */
function ModeTableArt({ table, surface }: { table: ModeTable; surface: string }) {
  const seats = Array.from({ length: table.max }, (_, index) => index);

  return (
    <span aria-hidden="true" className="absolute inset-0 block">
      {/* The mat itself, at the size a table takes on a board: wide, low, and
          well inside the door so the chairs have somewhere to sit. */}
      {/* `board` rather than `active` or `seat`. Both of those are lit tones,
          meant to say whose turn it is from across a room, and at this size
          their weave read as static rather than as cloth. The board tone is the
          quiet one: darker than the ground it sits on, so the mat reads as the
          dark playmat it is and the chairs are the brightest thing on the
          door after the one that is you. */}
      <Playmat
        className="absolute left-1/2 top-1/2 h-[46%] w-[56%] -translate-x-1/2 -translate-y-1/2"
        rounded="rounded-[2rem]"
        tone="board"
        style={surface as MatStyleId}
        tintOverride="none"
        image={null}
        colors={null}
      />

      {seats.map(index => (
        <Chair
          key={index}
          at={CHAIRS[index]}
          kind={index === 0 && table.yours ? 'you' : table.others === 'people' ? 'person' : 'bot'}
          spare={index >= table.filled}
        />
      ))}
    </span>
  );
}

export interface ModeWallProps {
  /** The mode currently chosen, if the reader has been here before. */
  value: PlayModeId | null;
  onChoose: (mode: PlayModeId) => void;
  /**
   * A live fact per mode, printed above the static one. Online uses it for the
   * number of tables actually waiting, which is the thing that makes the lead
   * door worth leading with and the thing that says so when it is not.
   */
  live?: Partial<Record<PlayModeId, string>>;
}

export function ModeWall({ value, onChoose, live }: ModeWallProps) {
  /* ONE ROW, not a 2x2. Owner: "all modes one line not 2 they are massive." */
  return (
    <div className="grid w-full items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {PLAY_MODES.map(mode => {
        const active = value === mode.id;
        const liveLine = live?.[mode.id] ?? null;

        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => onChoose(mode.id)}
            aria-pressed={active}
            className={cn(
              'motion-press group relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-2xl bg-card text-left transition-shadow duration-200',
              active
                ? 'shadow-[0_18px_46px_rgba(0,0,0,0.55)]'
                : 'shadow-[0_10px_30px_rgba(0,0,0,0.35)] hover:shadow-[0_18px_46px_rgba(0,0,0,0.5)]'
            )}
          >
            {/* WHO IS AT THE TABLE. A fixed band rather than an aspect ratio:
                a ratio makes the picture grow with the column, which is how
                four doors became 209px of illustration each on a desktop and
                two screens of scrolling on a phone. */}
            <span className="relative block h-[136px] w-full shrink-0 bg-muted/40 sm:h-[168px] xl:h-[196px]">
              <ModeTableArt table={mode.table} surface={mode.surface} />

              {/* Hover and selection are light on the surface, never an
                  outline, and they sit up here rather than under the words so
                  the copy's contrast never moves. */}
              <span
                className={cn(
                  'pointer-events-none absolute inset-0 transition-opacity duration-200',
                  active
                    ? 'bg-white/[0.06] opacity-100'
                    : 'bg-white/[0.05] opacity-0 group-hover:opacity-100'
                )}
              />
            </span>

            <span className="relative flex min-w-0 flex-1 flex-col gap-2 p-5">
              {/* The answer to the question the page asks at the top: who is
                  sitting opposite you. It used to be a mood (OTHER PEOPLE,
                  HANDS OFF) and four moods do not tell four modes apart. */}
              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                {mode.opposite}
              </span>

              <span className="text-2xl font-bold uppercase leading-none tracking-tight text-foreground">
                {mode.title}
              </span>

              <span className="mt-1 space-y-1">
                {mode.lines.map(line => (
                  <span
                    key={line}
                    className="block text-[0.8rem] leading-snug text-muted-foreground"
                  >
                    {line}
                  </span>
                ))}
              </span>

              {/* The fact and the way in are STACKED, not set beside each
                  other. Side by side they collided on the two doors whose fact
                  is longest. A door is 374px wide and a sentence plus a button
                  does not fit on one line of it. */}
              <span className="mt-auto flex flex-col gap-2 pt-4">
                <span className="min-w-0 text-[0.7rem] leading-snug text-muted-foreground/70">
                  {liveLine ? (
                    <>
                      <span className="block font-medium text-foreground/80">{liveLine}</span>
                      <span className="block">{mode.meta}</span>
                    </>
                  ) : (
                    mode.meta
                  )}
                </span>

                <span className="flex items-center gap-1.5 self-end text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-foreground">
                  {mode.action}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
