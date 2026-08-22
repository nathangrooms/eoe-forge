/**
 * Homepage — the life counter.
 *
 * The owner's note was specific: show it as it looks on a device lying flat in
 * the middle of the table, with the seats rotated. There are four boards here:
 * one at full size and three small ones showing two, three and four seats.
 *
 * The big one was a photograph of `/life` between 19 and 22 Aug 2026 and is a
 * drawing again. See {@link LifeBoards} for why, in one sentence: the real
 * screen colour-shifts Scryfall card art and the picture published it.
 *
 * All four are drawn the same way, which is the thing that keeps them honest:
 *
 *   - Seat rectangles and rotations come from `seatingFor` in `src/lib/game`,
 *     the same function `/life` calls. Nothing here hardcodes a percentage, so
 *     the boards on this page cannot drift away from the boards in the app.
 *   - Panels are positioned by `seatBoxStyle` / `seatContentStyle`, which is why
 *     the left and right seats are laid out with their width and height swapped
 *     *before* being rotated rather than overflowing their box.
 *   - The mats are the real `MatSurface`, drawn from the real `--mana-*` tokens.
 *
 * Their life totals are a depicted game, and a coherent one: seat four is on
 * four life having taken fifteen from a commander, which is why its total is
 * drawn in the destructive tone exactly as `PlayerPanel` draws a total at five
 * or below.
 */

import { Link } from 'react-router-dom';
import { ArrowRight, Crown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
/* `@/lib/game/seating` rather than `@/lib/game`. Seating is standalone
 * geometry with no imports of its own; the barrel beside it is the rules
 * engine. Reaching this section through the barrel put 88 KB of layers,
 * ability compiler and effect rules on the homepage, where no game is being
 * played, purely to draw four seats around a picture of a table. */
import { seatBoxStyle, seatContentStyle, seatingFor, type Seat, type SeatLayout } from '@/lib/game/seating';
import { MatSurface } from '@/components/life/MatSurface';
import type { MatColor } from '@/components/life/mats';

import { Section, SectionHeading } from '@/components/marketing/Section';

/* -------------------------------------------------------------------------- */
/* The pod                                                                    */
/* -------------------------------------------------------------------------- */

interface PodSeat {
  name: string;
  mat: MatColor;
  life: number;
  /** Highest single commander-damage tally against this seat. */
  commander: number;
}

/**
 * Names and colours are the counter's own defaults — `DEFAULT_SEAT_NAMES` and
 * `DEFAULT_MAT_ORDER` hand out exactly Player 1–4 on white, black, blue, red.
 */
const POD: PodSeat[] = [
  { name: 'Player 1', mat: 'W', life: 33, commander: 7 },
  { name: 'Player 2', mat: 'B', life: 40, commander: 0 },
  { name: 'Player 3', mat: 'U', life: 18, commander: 12 },
  { name: 'Player 4', mat: 'R', life: 4, commander: 15 },
];

/* "Undo any tap" said tap, on a page that uses that word in Magic's sense two
   sections above ("counters, tap and zone controls"). It meant a press on the
   screen. `useLifeGame` undoes by snapshot and works after a game has ended,
   which is the case worth advertising: a lethal you did not mean. */
const FEATURES = [
  'Commander damage',
  'Poison',
  'Energy and experience',
  'Undo a wrong total',
  'Screen stays awake',
  'Full screen',
];

/* -------------------------------------------------------------------------- */
/* Panels                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One seat, drawn at the size and rotation the real panel would take.
 *
 * Type scales in container-query units off the seat box, exactly as
 * `PlayerPanel` does — a quarter-screen seat and a half-screen seat are the same
 * component and have to fill both.
 */
function SeatPanel({
  seat,
  player,
  compact = false,
}: {
  seat: Seat;
  player: PodSeat;
  compact?: boolean;
}) {
  const axis = seat.isSideways ? 'cqw' : 'cqh';
  const lifeSize = `clamp(1.1rem, 33${axis}, 7rem)`;
  const nameSize = `clamp(0.5rem, 7${axis}, 0.95rem)`;
  const chipSize = `clamp(0.45rem, 6${axis}, 0.75rem)`;

  return (
    <div style={seatBoxStyle(seat)}>
      <div style={seatContentStyle(seat)}>
        <div className="absolute inset-[3px] overflow-hidden rounded-xl bg-card shadow-[0_1px_2px_hsl(0_0%_0%/0.35)]">
          <MatSurface color={player.mat} tone="seat" />

          {/* Name sits at the outer edge of the panel, where the real one puts it. */}
          {!compact && (
            <span
              className="absolute left-2 top-1.5 font-medium leading-none text-foreground/80"
              style={{ fontSize: nameSize }}
            >
              {player.name}
            </span>
          )}

          <span
            className={cn(
              'absolute inset-0 flex items-center justify-center font-semibold leading-none tabular-nums',
              player.life <= 5 ? 'text-destructive' : 'text-foreground'
            )}
            style={{ fontSize: lifeSize }}
          >
            {player.life}
          </span>

          {!compact && player.commander > 0 && (
            <span
              className="absolute bottom-1.5 right-2 inline-flex items-center gap-1 rounded-full bg-background/75 px-1.5 py-0.5 font-semibold leading-none tabular-nums text-muted-foreground"
              style={{ fontSize: chipSize }}
            >
              <Crown aria-hidden style={{ width: '1.15em', height: '1.15em' }} />
              {player.commander}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The device itself: bezel, screen, and one panel per seat.
 *
 * `containerType: size` comes from `seatBoxStyle`, so the screen must have a
 * real height — hence the explicit aspect ratio rather than letting content
 * decide.
 */
function Device({
  layout,
  aspect,
  compact = false,
  className,
}: {
  layout: SeatLayout;
  aspect: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-[1.6rem] bg-foreground/[0.09] p-[6px] shadow-2xl shadow-black/60',
        className
      )}
    >
      <div
        className="relative w-full overflow-hidden rounded-[1.25rem] bg-background"
        style={{ aspectRatio: aspect }}
      >
        {layout.seats.map(seat => {
          const player = POD[seat.index % POD.length];
          return (
            <SeatPanel key={seat.index} seat={seat} player={player} compact={compact} />
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Boards                                                                     */
/* -------------------------------------------------------------------------- */

/* One aspect across all four boards.

   The three small ones used to be 9/15 portrait while the big one is 4/3
   landscape, which was two different devices claiming to be the same app. They
   are 4/3 now: the same phone, lying on the same table, seating two, three or
   four people. It is also what lets them sit in the text column without
   towering over it. */
const PODS = [
  { layout: seatingFor(2, 'table'), label: 'Two players' },
  { layout: seatingFor(3, 'table'), label: 'Three players' },
  { layout: seatingFor(4, 'quads'), label: 'Four, two by two' },
];

/** The three seating variants. Lives in the copy column, not beside it. */
function PodRow() {
  return (
    <div className="mt-8 grid grid-cols-3 gap-4 sm:gap-5">
      {PODS.map(pod => (
        <div key={pod.label}>
          <Device layout={pod.layout} aspect="4 / 3" compact />
          <p className="mt-3 text-center text-[11px] leading-tight text-muted-foreground">
            {pod.label}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * The hero board: four seats, drawn from the counter's own geometry.
 *
 * A PHOTOGRAPH STOOD HERE AND HAD TO COME OFF ON 22 AUG 2026.
 *
 * `public/screens/life-counter-*.webp` is a picture of `/life` running, and
 * `/life` paints Scryfall's `art_crop` under every seat through `matArtStyle`
 * in `src/components/life/mats.ts`, which applies
 * `saturate(0.68) brightness(0.58) contrast(1.1)` — the values are at lines
 * 253, 261 and 276, applied at 364 — and then washes a colour across the top of
 * it. Scryfall's image guidelines say plainly: do not blur, sharpen, desaturate
 * or colour-shift card images.
 *
 * This is not a judgement call, because the identical breach has already been
 * found and corrected one directory away: `src/components/play/Playmat.tsx`
 * carries a comment quoting that guideline and naming the values it removed,
 * `saturate(0.26) brightness(0.4) contrast(1.06)`. The life counter was missed.
 * Re-taking this screenshot on 22 Aug refreshed the breach onto the homepage
 * rather than fixing it, and a marketing page is the worst place to publish one.
 *
 * `src/components/life/` is not this workflow's to edit, so the only fix
 * available here is also the right one: do not publish it. The photograph comes
 * back the moment `mats.ts` drops `artFilter`, and re-taking it costs one run of
 * `scripts/app-shots.mjs`.
 *
 * What replaces it is what stood here before the photograph did: the same
 * `Device`, drawn from `seatingFor` — the function `/life` itself calls — at
 * four seats and full size. `MatSurface` is passed no art, so a mat is its
 * colour tokens alone and there is no card image on it to treat.
 */
function LifeBoards() {
  return (
    <div>
      {/* The table the device is lying on. */}
      <div className="rounded-[2.25rem] bg-muted/40 p-4 shadow-2xl shadow-black/50 sm:p-9">
        <Device layout={seatingFor(4, 'quads')} aspect="4 / 3" />
      </div>

      {/* No caption. It read "Four players, one to an edge. Every panel is
          turned to face the person sitting at it." — which is the lead beside
          it, describing the picture above it, for the third time. */}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Section                                                                    */
/* -------------------------------------------------------------------------- */

export function HomeLifeCounter() {

  return (
    <Section tint>

      {/* items-start, and the three seating variants moved into the copy
          column below. Before this the right column ran 944px against 405px of
          text, and items-center split the 539px difference into two slabs of
          black, one above the heading and one below the button. */}
      <div className="grid items-start gap-9 sm:gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,620px)]">
        <SectionHeading
          align="left"
          eyebrow="Life counter"
          title="The phone goes in the middle of the table"
          /* One sentence. What went: the consequence of the photograph
             underneath ("so nobody has to read their life total upside down"),
             a manual instruction about tap targets, and a list of six features
             that is the chip row forty pixels below this line. The chips carry
             them in six words each and cannot get out of step with themselves. */
          lead="Every seat gets its own panel, turned to face whoever is sitting there."
        >
          <div className="mt-7 flex flex-wrap gap-2 sm:mt-8">
            {FEATURES.map(f => (
              <span
                key={f}
                className="rounded-full bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground"
              >
                {f}
              </span>
            ))}
          </div>

          <Button asChild size="lg" className="mt-7 sm:mt-8">
            <Link to="/life">
              Start a pod
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>

          {/* THE VIEWPORT GATE IS GONE, AND IT WAS COSTING A LAYOUT SHIFT.
​
              `near && <PodRow />` plus a 16:10 placeholder standing in for a
              4:3 board meant this section grew 180px the moment the reader got
              within 600px of it, and every section below it moved down by that
              much. Measured on a phone against the built site: 706px before the
              gate opened, 886px after.
​
              It bought nothing. There is no request behind either of these and
              there never was: every board here is `seatingFor` arithmetic and
              sixteen tinted divs. The only thing the gate deferred was work
              cheaper than the gate. */}
          <PodRow />
        </SectionHeading>

        <LifeBoards />
      </div>
    </Section>
  );
}

export default HomeLifeCounter;
