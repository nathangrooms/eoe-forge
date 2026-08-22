/**
 * The four doors.
 *
 * Owner: *"we need to redesign the entire play a game UI - leading with
 * online"*, and then, on the reference they gave: four cards across, each
 * full bleed, each carrying an eyebrow label, a large title, one or two lines
 * saying what the mode IS, a quiet fact bottom left and the way in bottom
 * right.
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
 * asserts the copy as whole strings. The copy IS the feature here: an eyebrow
 * that says nothing and a description that describes a machine rather than a
 * game are the two failures this screen is replacing.
 *
 * ---------------------------------------------------------------------------
 * THE COVERS DO NOT EXIST YET, AND THE PAGE SHIPS WITHOUT THEM
 * ---------------------------------------------------------------------------
 * `cover` is one asset per mode at a fixed path and a fixed shape:
 *
 *     public/covers/play/<id>.webp        3 : 4 portrait, 1200 x 1600
 *
 * Nothing is committed there yet. Every door falls back to the procedural
 * playmat surface, which is CSS gradients (`matStyles.ts`), draws at any size,
 * downloads nothing and carries no licence. `fallback` gives each mode its own
 * surface and its own colour so four doors with no artwork are still four
 * different doors rather than four identical rectangles.
 *
 * NEVER point `cover` at Scryfall card art. A cover has to be darkened for
 * type to sit on it, and Scryfall's guidelines forbid modifying card images.
 * That rule has caught this project twice; `Playmat.tsx` records the second
 * time. A deck tile shows a card WHOLE and unmodified, which is the permitted
 * case, and that is why art is allowed one step later and not here.
 */

export type PlayModeId = 'online' | 'bots' | 'goldfish' | 'playtest';

export interface PlayModeDoor {
  id: PlayModeId;
  /** Small caps above the title. What kind of game this is, in two words. */
  eyebrow: string;
  /** The display title. */
  title: string;
  /** One or two lines saying what the mode IS. Not what it is built from. */
  lines: readonly string[];
  /** The quiet fact bottom left. A real one: seats, or what it needs. */
  meta: string;
  /** The action bottom right. */
  action: string;
  /** Where a cover image goes when there is one. See the note above. */
  cover: string;
  /** The procedural surface drawn until then. */
  fallback: { style: string; tint: string };
  /**
   * What is not finished, in plain words, or null when everything on the door
   * works. Shown on the door itself, because a dropped game should be
   * disappointing rather than surprising.
   */
  developing: string | null;
}

/** The shape every cover is cut to. Width over height. */
export const COVER_ASPECT = '3 / 4';

/** Where the owner drops artwork. One file per mode, this exact name. */
export function coverPathFor(id: PlayModeId): string {
  return `/covers/play/${id}.webp`;
}

/**
 * Online leads. That is the owner's instruction and it is the order of this
 * array, which is the order on screen.
 */
export const PLAY_MODES: readonly PlayModeDoor[] = [
  {
    id: 'online',
    eyebrow: 'Other people',
    title: 'Online',
    lines: [
      'A real person on the other side of the table.',
      'Open a table and send the link to a friend, or sit down at one somebody is already waiting at.',
    ],
    meta: '2 to 4 seats. Needs an account and one deck with cards in it.',
    action: 'Enter',
    cover: coverPathFor('online'),
    fallback: { style: 'slate', tint: 'U' },
    developing:
      'You can open a table, take a seat, agree on decks and talk. Playing the game across the connection is the piece still being built.',
  },
  {
    id: 'bots',
    eyebrow: 'You against the rules',
    title: 'Versus bots',
    lines: [
      'You play your deck. The rules engine plays theirs.',
      'It blocks, it holds up answers and it swings back, and you choose how hard it pushes.',
    ],
    meta: '2 to 4 seats. One of them is yours.',
    action: 'Enter',
    cover: coverPathFor('bots'),
    fallback: { style: 'leather', tint: 'R' },
    developing: null,
  },
  {
    id: 'goldfish',
    eyebrow: 'One seat',
    title: 'Goldfish',
    lines: [
      'Your deck and nobody opposite.',
      'Draw, mulligan, curve out, and find out how the list actually plays before you take it anywhere.',
    ],
    meta: '1 seat. Nothing blocks and nothing attacks back.',
    action: 'Enter',
    cover: coverPathFor('goldfish'),
    fallback: { style: 'felt', tint: 'G' },
    developing: null,
  },
  {
    id: 'playtest',
    eyebrow: 'Hands off',
    title: 'Playtest',
    lines: [
      'Two to four of your own decks play each other while you watch.',
      'Every seat is played for you, on the same rules engine, at whatever speed you set.',
    ],
    meta: '2 to 4 seats. None of them are yours.',
    action: 'Enter',
    cover: coverPathFor('playtest'),
    fallback: { style: 'carbon', tint: 'B' },
    developing: null,
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
