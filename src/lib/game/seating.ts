/**
 * DeckMatrix — shared game-state core: seat geometry.
 *
 * A phone lying flat in the middle of a table has players on several of its
 * edges. Only one of them is reading the screen the right way up. This module
 * answers two questions for a given player count:
 *
 *   1. which physical side of the device each seat sits on, and
 *   2. how far that seat's panel must be rotated to face the person sitting there.
 *
 * Rotation convention — degrees clockwise, matching CSS `rotate()`:
 *
 *                       top · 180°
 *                 ┌────────────────────┐
 *                 │                    │
 *      left · 90° │                    │ right · 270°
 *                 │                    │
 *                 └────────────────────┘
 *                     bottom · 0°
 *
 * Derivation, so nobody has to re-guess it: a player at the left edge looks
 * across the device, which puts their reading direction down the screen. A
 * clockwise 90° rotation maps screen-right onto screen-down, so 90° is what
 * their panel needs. The right-hand seat is the mirror, 270°.
 *
 * Turn order follows the same ring. In Magic the turn passes to the player on
 * your left, and bottom → left → top → right is clockwise when you are looking
 * down at the table — so seat index order *is* turn order.
 *
 * Rects are normalised (0..1) fractions of the board, so a UI can position them
 * with percentages at any screen size. This module returns geometry only: no
 * colours, no class names, no React.
 */

export type TableSide = 'bottom' | 'left' | 'top' | 'right';

export type SeatRotation = 0 | 90 | 180 | 270;

export const SIDE_ROTATION: Record<TableSide, SeatRotation> = {
  bottom: 0,
  left: 90,
  top: 180,
  right: 270,
};

export const ROTATION_SIDE: Record<SeatRotation, TableSide> = {
  0: 'bottom',
  90: 'left',
  180: 'top',
  270: 'right',
};

export const SIDE_LABEL: Record<TableSide, string> = {
  bottom: 'Bottom',
  left: 'Left',
  top: 'Top',
  right: 'Right',
};

/** Clockwise as seen from above the table. Also Magic's turn order. */
export const CLOCKWISE_SIDES: readonly TableSide[] = ['bottom', 'left', 'top', 'right'] as const;

/** Normalised rectangle: fractions of the board, origin top-left. */
export interface SeatRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Seat {
  /** Matches `Player.seat`. Seat order is turn order. */
  index: number;
  side: TableSide;
  rotation: SeatRotation;
  rect: SeatRect;
  /**
   * True for the 90°/270° seats, whose content box has its width and height
   * swapped relative to the seat rect.
   */
  isSideways: boolean;
}

export type SeatingVariant = 'table' | 'stacked' | 'quads' | 'shared' | 'grid';

export interface SeatLayout {
  playerCount: number;
  variant: SeatingVariant;
  seats: Seat[];
  /** Plain-language note for settings UI, e.g. "one player per edge". */
  description: string;
}

const seat = (index: number, side: TableSide, rect: SeatRect): Seat => ({
  index,
  side,
  rotation: SIDE_ROTATION[side],
  rect,
  isSideways: side === 'left' || side === 'right',
});

/* -------------------------------------------------------------------------- */
/* Layouts                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Hand-tuned layouts for 1–4 players. The first entry of each list is the
 * default: the arrangement that matches people actually sitting around a table
 * with the device in the middle.
 */
const LAYOUTS: Record<number, Partial<Record<SeatingVariant, SeatLayout>>> = {
  1: {
    table: {
      playerCount: 1,
      variant: 'table',
      description: 'Solo. The whole board faces you.',
      seats: [seat(0, 'bottom', { x: 0, y: 0, w: 1, h: 1 })],
    },
  },

  2: {
    // Two players facing each other across the device.
    table: {
      playerCount: 2,
      variant: 'table',
      description: 'Head to head. One player on each long edge.',
      seats: [
        seat(0, 'bottom', { x: 0, y: 0.5, w: 1, h: 0.5 }),
        seat(1, 'top', { x: 0, y: 0, w: 1, h: 0.5 }),
      ],
    },
    // Device held or laid between two players sitting side by side.
    shared: {
      playerCount: 2,
      variant: 'shared',
      description: 'Side by side. The device sits between both players.',
      seats: [
        seat(0, 'left', { x: 0, y: 0, w: 0.5, h: 1 }),
        seat(1, 'right', { x: 0.5, y: 0, w: 0.5, h: 1 }),
      ],
    },
  },

  3: {
    // Three of the four edges occupied: bottom, left, right.
    table: {
      playerCount: 3,
      variant: 'table',
      description: 'Three edges. Bottom, left and right.',
      seats: [
        seat(0, 'bottom', { x: 0, y: 0.5, w: 1, h: 0.5 }),
        seat(1, 'left', { x: 0, y: 0, w: 0.5, h: 0.5 }),
        seat(2, 'right', { x: 0.5, y: 0, w: 0.5, h: 0.5 }),
      ],
    },
    // Two players on the far edge, one on the near edge.
    stacked: {
      playerCount: 3,
      variant: 'stacked',
      description: 'One near and two across. Good for a couch or a narrow table.',
      seats: [
        seat(0, 'bottom', { x: 0, y: 0.5, w: 1, h: 0.5 }),
        seat(1, 'top', { x: 0, y: 0, w: 0.5, h: 0.5 }),
        seat(2, 'top', { x: 0.5, y: 0, w: 0.5, h: 0.5 }),
      ],
    },
  },

  4: {
    // A pinwheel: every player gets their own edge. The true four-player pod.
    table: {
      playerCount: 4,
      variant: 'table',
      description: 'Four edges. One player per side of the device.',
      seats: [
        seat(0, 'bottom', { x: 0, y: 0.75, w: 1, h: 0.25 }),
        seat(1, 'left', { x: 0, y: 0.25, w: 0.5, h: 0.5 }),
        seat(2, 'top', { x: 0, y: 0, w: 1, h: 0.25 }),
        seat(3, 'right', { x: 0.5, y: 0.25, w: 0.5, h: 0.5 }),
      ],
    },
    // Classic 2x2 grid: two players along each long edge. Bigger panels.
    quads: {
      playerCount: 4,
      variant: 'quads',
      description: 'Two by two. Two players along each long edge.',
      seats: [
        seat(0, 'bottom', { x: 0, y: 0.5, w: 0.5, h: 0.5 }),
        seat(1, 'top', { x: 0, y: 0, w: 0.5, h: 0.5 }),
        seat(2, 'top', { x: 0.5, y: 0, w: 0.5, h: 0.5 }),
        seat(3, 'bottom', { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }),
      ],
    },
  },
};

/**
 * Fallback for five- and six-player pods: two facing rows. Not a table
 * arrangement, but a pod that size never fits one player per edge anyway.
 */
function generatedGrid(playerCount: number): SeatLayout {
  const bottomCount = Math.ceil(playerCount / 2);
  const topCount = playerCount - bottomCount;
  const seats: Seat[] = [];

  for (let i = 0; i < bottomCount; i++) {
    seats.push(
      seat(i, 'bottom', { x: i / bottomCount, y: 0.5, w: 1 / bottomCount, h: 0.5 })
    );
  }
  for (let i = 0; i < topCount; i++) {
    // Seat indices continue clockwise, so the far row runs right to left.
    const column = topCount - 1 - i;
    seats.push(
      seat(bottomCount + i, 'top', { x: column / topCount, y: 0, w: 1 / topCount, h: 0.5 })
    );
  }

  return {
    playerCount,
    variant: 'grid',
    description: `${playerCount} players in two facing rows.`,
    seats,
  };
}

export const MAX_SEATS = 6;

/** Player counts with a hand-tuned layout. Larger pods fall back to a grid. */
export const TUNED_SEAT_COUNTS: readonly number[] = [1, 2, 3, 4] as const;

/**
 * Seat geometry for a pod.
 *
 * @param playerCount 1–6. 2, 3 and 4 are hand-tuned to real table positions.
 * @param variant     Alternative arrangement for the same count. Falls back to
 *                    the default layout when the variant does not apply.
 */
export function seatingFor(playerCount: number, variant: SeatingVariant = 'table'): SeatLayout {
  if (!Number.isInteger(playerCount) || playerCount < 1 || playerCount > MAX_SEATS) {
    throw new Error(`seatingFor: unsupported player count ${playerCount} (expected 1–${MAX_SEATS})`);
  }

  const tuned = LAYOUTS[playerCount];
  if (!tuned) return generatedGrid(playerCount);

  return tuned[variant] ?? tuned.table ?? generatedGrid(playerCount);
}

/** Every arrangement available for a player count, default first. */
export function seatingVariants(playerCount: number): SeatLayout[] {
  const tuned = LAYOUTS[playerCount];
  if (!tuned) return [generatedGrid(playerCount)];
  const ordered: SeatLayout[] = [];
  if (tuned.table) ordered.push(tuned.table);
  for (const key of Object.keys(tuned) as SeatingVariant[]) {
    if (key !== 'table' && tuned[key]) ordered.push(tuned[key] as SeatLayout);
  }
  return ordered;
}

/* -------------------------------------------------------------------------- */
/* Lookups                                                                    */
/* -------------------------------------------------------------------------- */

export function seatAt(layout: SeatLayout, index: number): Seat | undefined {
  return layout.seats.find(s => s.index === index);
}

export function rotationForSeat(layout: SeatLayout, index: number): SeatRotation {
  return seatAt(layout, index)?.rotation ?? 0;
}

export function sideForSeat(layout: SeatLayout, index: number): TableSide {
  return seatAt(layout, index)?.side ?? 'bottom';
}

/**
 * Seat indices in turn order starting from `fromIndex` — the player, then the
 * player to their left, and on round the table.
 */
export function turnOrderFrom(layout: SeatLayout, fromIndex = 0): number[] {
  const count = layout.seats.length;
  const start = ((fromIndex % count) + count) % count;
  return Array.from({ length: count }, (_, offset) => (start + offset) % count);
}

/**
 * Re-index a layout so `viewerIndex` sits at the bottom. Used when every player
 * has their own device: each one wants to be the seat facing them, while the
 * relative positions of everyone else stay true to the physical table.
 */
export function layoutFromViewpoint(layout: SeatLayout, viewerIndex: number): SeatLayout {
  const order = turnOrderFrom(layout, viewerIndex);
  const seats = order.map((originalIndex, position) => {
    const source = layout.seats[position];
    return { ...source, index: originalIndex };
  });
  return { ...layout, seats };
}

/* -------------------------------------------------------------------------- */
/* Presentation helpers                                                       */
/* -------------------------------------------------------------------------- */

const pct = (value: number): string => `${Number((value * 100).toFixed(4))}%`;

export interface SeatBoxStyle {
  position: 'absolute';
  left: string;
  top: string;
  width: string;
  height: string;
  /** Required so the content box below can use `cqw`/`cqh` units. */
  containerType: 'size';
}

export interface SeatContentStyle {
  position: 'absolute';
  left: '50%';
  top: '50%';
  width: string;
  height: string;
  transform: string;
}

/** Absolute placement of a seat's region on the board. */
export function seatBoxStyle(seat: Seat): SeatBoxStyle {
  return {
    position: 'absolute',
    left: pct(seat.rect.x),
    top: pct(seat.rect.y),
    width: pct(seat.rect.w),
    height: pct(seat.rect.h),
    containerType: 'size',
  };
}

/**
 * The rotated surface inside a seat box.
 *
 * A CSS rotation does not change an element's layout box, so a sideways seat
 * must be laid out with its width and height swapped *before* it is rotated,
 * or its text overflows. Container query units read the seat box's own size,
 * which is why `seatBoxStyle` sets `container-type: size`.
 */
export function seatContentStyle(seat: Seat): SeatContentStyle {
  return {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: seat.isSideways ? '100cqh' : '100cqw',
    height: seat.isSideways ? '100cqw' : '100cqh',
    transform: `translate(-50%, -50%) rotate(${seat.rotation}deg)`,
  };
}

/**
 * Seat content that keeps its position but not its rotation.
 *
 * For a device one person is reading — solo life counting, or a future
 * one-screen-per-player mode — where rotating a seat only makes it unreadable.
 * The seat still occupies its own rect, so the layout is unchanged.
 */
export function seatContentStyleUpright(seat: Seat): SeatContentStyle {
  return {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: '100cqw',
    height: '100cqh',
    transform: 'translate(-50%, -50%)',
  };
}

/** Just the rotation, for cases that only need to spin a badge or a number. */
export function seatRotationTransform(seat: Seat): string {
  return `rotate(${seat.rotation}deg)`;
}
