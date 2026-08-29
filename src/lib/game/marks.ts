/**
 * DeckMatrix — shared game-state core: marks a PLAYER put on a permanent.
 *
 * Owner: *"everything like tokens ... should be large for their power,
 * toughness, dice markers etc."*, and, on what by-hand control is for at all:
 * *"Also makes it feel more like playing magic, as you control the cards and
 * actions."*
 *
 * At a table you reach for whatever is nearest when the rules run out. A d20 on
 * a creature to remember the number an effect chose. A glass bead for a counter
 * this engine has never heard of. A scrap of paper that says *sac at end*. None
 * of that is a rules object the engine can compute with, and all of it is part
 * of playing the game.
 *
 * ---------------------------------------------------------------------------
 * A MARK IS A COUNTER, AND THAT IS NOT A SHORTCUT
 * ---------------------------------------------------------------------------
 * CR 122.1 lets a permanent carry a counter of ANY kind, so "a counter the
 * engine does not know about" is the correct model rather than a way of
 * avoiding a new action. Storing marks in `CardInstance.counters` means every
 * one of them goes down the path this project already trusts: `CARD_COUNTER` is
 * validated, reduced, logged, undoable and broadcast to a networked table. A
 * die a player rolled and a `+1/+1` counter an ability placed are the same kind
 * of object downstream, which is what stops a hand-placed mark from being a
 * second, quieter system that the log and the undo stack do not know about.
 *
 * ---------------------------------------------------------------------------
 * SO WHY A PREFIX
 * ---------------------------------------------------------------------------
 * Because the engine must never mistake one for a rules counter. Nothing today
 * walks every kind of counter on a permanent — `printed.ts` and `sba.ts` read
 * `+1/+1` and `-1/-1` by name and nothing else — but proliferate is not
 * implemented yet and proliferate is exactly the effect that adds one of every
 * kind. A die that grew by one every time somebody proliferated would be a
 * silent, unattributable wrong number, which is the worst kind this codebase
 * has.
 *
 * The prefix is therefore a fence, and `isPlayerMark` is the only place that
 * knows about it. The label a player typed never appears with the prefix on it:
 * `rules.ts` reads the log line through `markLabel`, because a prefix leaking
 * onto the table would be this project's `~` bug for the second time
 * (`manual.ts`, `readableClause`).
 *
 * Pure and leaf: imports nothing, so `rules.ts`, `manual.ts` and the components
 * can all read the convention from one place without a cycle.
 */

/**
 * The fence. Deliberately ugly and deliberately not a character a player can
 * type into the label box, so `mark:` cannot be produced by accident and a
 * rules counter can never be read as a mark.
 */
export const MARK_PREFIX = 'mark:';

/** How a die is labelled. `d20`, `d6`. */
export const DIE_LABEL = (sides: number) => `d${sides}`;

/**
 * The dice a Magic player actually reaches for.
 *
 * Twenty first, because it is the one on the table: a d20 is the standard life
 * counter and the standard "remember this number" die in every playgroup. Six
 * is the second. The rest are there because a card that says *roll a d4* exists
 * and a player with no d4 has a stuck game, which is the whole reason this
 * module is here.
 */
export const DICE: readonly number[] = [20, 6, 4, 8, 10, 12];

/** The longest label kept. Long enough for *sac at end*, short enough to draw. */
export const MARK_LABEL_MAX = 18;

/**
 * States a table tracks and this engine does not model.
 *
 * GOAD is the one that made this list necessary. It is on hundreds of cards,
 * it is in nearly every multiplayer Commander game, and there is no `goaded`
 * anywhere in `src/lib/game` — not a field, not a keyword, not an action. A
 * player who goaded a creature had nothing to press, and the nearest thing was
 * typing the word into the free marker box six keystrokes at a time.
 *
 * They are MARKS rather than engine state on purpose, and the distinction is
 * the honest one: the engine cannot make a goaded creature attack, so a control
 * that claimed to goad would be a promise it does not keep. A mark says what is
 * true — the table has agreed this creature is goaded — draws it on the card,
 * puts it in the log, and undoes with everything else. When the engine learns
 * to enforce one of these it becomes real state and this preset goes away.
 *
 * Turned face down and turned over are NOT here: those are real engine state
 * now (`SET_FACE`), and duplicating them as a note would give a player two
 * controls that disagree.
 */
export const TABLE_STATE_MARKS: readonly string[] = [
  'Goaded',
  'Phased out',
  "Can't block",
  'Attacks if able',
  "Doesn't untap",
];

/**
 * Fold a label a player typed into the key it is stored under.
 *
 * Trimmed and length-capped here rather than at each caller, so a mark made
 * from the panel, from a die and from a future long-press menu can never end up
 * under three different keys that draw as the same word.
 */
export function markKey(label: string): string {
  return `${MARK_PREFIX}${label.trim().slice(0, MARK_LABEL_MAX)}`;
}

/** True when this counter key is something a player put there, not the rules. */
export function isPlayerMark(counterKey: string): boolean {
  return counterKey.startsWith(MARK_PREFIX);
}

/** The words a player typed, or null when this is an ordinary rules counter. */
export function markLabel(counterKey: string): string | null {
  return isPlayerMark(counterKey) ? counterKey.slice(MARK_PREFIX.length) : null;
}

/** True when the label names a die: `d4` through `d100`. */
export function isDieLabel(label: string): boolean {
  return /^d\d{1,3}$/.test(label);
}

export interface PlayerMark {
  /** The words on it. Never carries the prefix. */
  label: string;
  value: number;
  /** The key it is stored under, for building the action that changes it. */
  key: string;
  /** A die shows its face; everything else is a tally or a reminder. */
  die: boolean;
}

/**
 * Every mark a player has put on this permanent, in the order they were made.
 *
 * `Object.entries` preserves insertion order for string keys, and counters are
 * only ever added by `bumpCounter`, so the first mark made stays first. That
 * matters on the mat: the marks rail is drawn left to right and the leftmost
 * survives an overlapped row, so a stable order is the difference between a
 * mark staying where the player left it and it moving every time another one
 * is added.
 *
 * Zero-valued marks are dropped, exactly as zero-valued counters are, so
 * taking the last one off a card removes it rather than leaving a `0`.
 */
export function playerMarksOn(counters: Readonly<Record<string, number>>): PlayerMark[] {
  const out: PlayerMark[] = [];
  for (const [key, value] of Object.entries(counters)) {
    if (!isPlayerMark(key) || value === 0) continue;
    const label = markLabel(key) ?? '';
    out.push({ label, value, key, die: isDieLabel(label) });
  }
  return out;
}

/** The rules counters on a permanent: everything that is not a player mark. */
export function rulesCountersOn(
  counters: Readonly<Record<string, number>>
): Array<{ key: string; value: number }> {
  return Object.entries(counters)
    .filter(([key, value]) => value !== 0 && !isPlayerMark(key))
    .map(([key, value]) => ({ key, value }));
}

/**
 * How a mark reads on the card.
 *
 * A die shows its face and nothing else, because a d20 lying on a permanent
 * showing 17 does not also say "17 of them". A mark standing at one is a
 * REMINDER and shows only its words, because *sac at end 1* is not a sentence
 * anybody wrote. Anything else is a tally and shows both.
 */
export function markText(mark: PlayerMark): string {
  if (mark.die) return String(mark.value);
  if (mark.value === 1) return mark.label;
  return `${mark.label} ${mark.value}`;
}

/** What the mark is, in words, for a tooltip and for a screen reader. */
export function markDescription(mark: PlayerMark): string {
  if (mark.die) return `${mark.label} showing ${mark.value}. You put this here.`;
  if (mark.value === 1) return `${mark.label}. A reminder you put on this card.`;
  return `${mark.label}: ${mark.value}. You put this here.`;
}
