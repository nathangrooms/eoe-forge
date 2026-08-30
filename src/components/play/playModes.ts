/**
 * The four doors.
 *
 * Owner: *"we need to redesign the entire play a game UI - leading with
 * online"*, and then, on the reference they gave: four cards across, each
 * carrying a label, a large title, one line saying what the mode IS, a quiet
 * fact bottom left and the way in bottom right.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS DATA AND NOT FOUR COMPONENTS
 * ---------------------------------------------------------------------------
 * Project law: one table, one set of logic. Goldfish, versus bots, playtest
 * and online are four sources of actions feeding one game, not four games.
 * The only thing that genuinely differs between them at this end of the flow
 * is the words on a door and where the actions come from afterwards, so the
 * words live here as a list and one component draws all four. Adding a fifth
 * mode is a row in this array, not a screen.
 *
 * This file imports nothing, so `node --test` reads it and `playModes.test.ts`
 * asserts the copy as whole strings. The copy IS the feature here.
 *
 * ---------------------------------------------------------------------------
 * THE COVER PHOTOGRAPHS ARE GONE
 * ---------------------------------------------------------------------------
 * Owner, 29 Aug 2026: *"those images look awful so probably remove them."*
 *
 * They were four generated fantasy illustrations in the public `art` bucket,
 * and the fault was not only that they were ugly. Measured on the screenshot
 * they came off: all four were a glowing circular table in a purple and teal
 * vault, so the picture at the top of each door said the SAME THING on all
 * four doors, on the one screen whose entire job is telling four things apart.
 * A wall of four identical pictures is worse than no picture, because it
 * spends the reader's first look and returns nothing for it.
 *
 * What replaces them is the difference itself, drawn. `table` below is who is
 * actually at the table in each mode, and `ModeWall` draws it: a surface with
 * a person at your chair and either people, bots or nobody in the others. That
 * is the answer to the question this screen asks in its own subtitle, "who is
 * sitting opposite you", and it is read at a glance rather than in a sentence.
 *
 * It also costs nothing to serve: no bucket, no 404 path, no licence, and it
 * is sharp at any size because it is drawn rather than photographed. Same
 * reasoning as `matStyles.ts`, and it reuses those surfaces.
 *
 * NEVER point a door at Scryfall card art. A cover has to be darkened for type
 * to sit on it, and Scryfall's guidelines forbid modifying card images. A deck
 * tile shows a card WHOLE and unmodified, which is the permitted case, and
 * that is why art is allowed one step later and not here.
 */

export type PlayModeId = 'online' | 'bots' | 'goldfish' | 'playtest';

/**
 * Who is at the table, as a shape that can be drawn.
 *
 * Every number here is real: `filled` is the seats a mode always deals and
 * `max` is what `seatsFor` below will clamp to, so the faint extra chairs on a
 * door are seats that genuinely exist rather than decoration.
 */
export interface ModeTable {
  /** Seats this mode always deals. */
  filled: number;
  /** The most it can seat. Chairs beyond `filled` are drawn faint. */
  max: number;
  /** Whether the near chair is played by the reader. */
  yours: boolean;
  /** What the other chairs hold. */
  others: 'people' | 'bots' | 'none';
}

export interface PlayModeDoor {
  id: PlayModeId;
  /**
   * Who is opposite you, in two or three words. Small caps above the title.
   *
   * This used to be an eyebrow that said OTHER PEOPLE, YOU AGAINST THE RULES,
   * ONE SEAT and HANDS OFF: four moods rather than four answers. The page asks
   * one question at the top and this is the answer to it.
   */
  opposite: string;
  /** The display title. */
  title: string;
  /** One or two lines saying what the mode IS. Not what it is built from. */
  lines: readonly string[];
  /** The quiet fact bottom left. A real one: seats, or what it needs. */
  meta: string;
  /** The action bottom right. */
  action: string;
  /** Who is at the table. Drawn, not described. */
  table: ModeTable;
  /**
   * The weave the door's table is painted with, from `matStyles.ts`.
   *
   * No tint on any of them. The mat tints are the five MTG colours and handing
   * one to a mode would be inventing a meaning the mode does not have, which
   * the design law reserves colour against. Four different weaves in the same
   * charcoal is enough to make four doors four doors.
   */
  surface: string;
}

/**
 * Online leads. That is the owner's instruction and it is the order of this
 * array, which is the order on screen.
 */
export const PLAY_MODES: readonly PlayModeDoor[] = [
  {
    id: 'online',
    opposite: 'Another player',
    title: 'Online',
    lines: [
      'A real person on the other side of the table. Open one and send the link to a friend, or sit down at a table somebody is already waiting at.',
    ],
    meta: '2 to 4 seats. Needs an account and one deck with cards in it.',
    action: 'Enter',
    table: { filled: 2, max: 4, yours: true, others: 'people' },
    surface: 'slate',
  },
  {
    id: 'bots',
    opposite: 'The computer',
    title: 'Versus bots',
    lines: [
      'You play your deck and the computer plays theirs. It blocks, it holds up answers and it swings back, and you choose how hard it pushes.',
    ],
    meta: '2 to 4 seats. One of them is yours.',
    action: 'Enter',
    table: { filled: 2, max: 4, yours: true, others: 'bots' },
    surface: 'leather',
  },
  {
    id: 'goldfish',
    opposite: 'Nobody',
    title: 'Goldfish',
    lines: [
      'Your deck and nobody opposite. Draw, mulligan and curve out, and find out how the list actually plays before you take it anywhere.',
    ],
    meta: '1 seat. Nothing blocks and nothing attacks back.',
    action: 'Enter',
    table: { filled: 1, max: 1, yours: true, others: 'none' },
    surface: 'felt',
  },
  {
    id: 'playtest',
    opposite: 'Your own decks',
    title: 'Playtest',
    lines: [
      'Two to four of your own decks play each other while you watch. Every seat is played for you, at whatever speed you set.',
    ],
    meta: '2 to 4 seats. None of them are yours.',
    action: 'Enter',
    table: { filled: 2, max: 4, yours: false, others: 'bots' },
    surface: 'carbon',
  },
];

const BY_ID = new Map(PLAY_MODES.map(mode => [mode.id, mode]));

/** A stored or hand typed mode must never break the page. */
export function modeOf(id: string | null | undefined): PlayModeDoor {
  return BY_ID.get((id ?? '') as PlayModeId) ?? PLAY_MODES[0];
}

/** True when `id` names one of the four. Used before trusting a URL. */
export function isPlayMode(id: string | null | undefined): id is PlayModeId {
  return BY_ID.has((id ?? '') as PlayModeId);
}

/** How many seats a mode deals, given how many opponents were asked for. */
export function seatsFor(id: PlayModeId, opponents: number): number {
  if (id === 'goldfish') return 1;
  if (id === 'playtest') return Math.max(2, Math.min(4, opponents));
  if (id === 'bots') return 1 + Math.max(1, Math.min(3, opponents));
  return Math.max(2, Math.min(4, opponents));
}
