/**
 * DeckMatrix playtest harness — what the game state looked like, from outside.
 *
 * THE POINT OF DOING THIS FROM OUTSIDE
 * ------------------------------------
 * The harness is not allowed to add a hook to the engine, and it would not want
 * one. An engine that reports its own success can report success it did not
 * have; that is the exact failure this whole exercise exists to catch. The
 * reducer is pure, so the state before an action and the state after it are two
 * plain values, and everything the action did is the difference between them.
 * Nothing inside the engine has to cooperate, or even know it is being watched.
 *
 * Two things live here:
 *
 *   `fingerprint(state)` — a canonical string over every field that can change.
 *     Two identical fingerprints mean the game is in exactly the same position,
 *     which is how a stalled game is detected and how a no-op action is caught.
 *
 *   `diffState(before, after)` — the same comparison, kept as structured data.
 *     This is the primary signal in list form: a card resolved and the only
 *     difference in the entire game state was that it moved zones, so it did
 *     nothing, and nobody was told.
 *
 * WHAT IS DELIBERATELY EXCLUDED, AND WHY
 * --------------------------------------
 *   `log`       — an action that appends a log line and changes nothing else is
 *                 precisely the silent no-op being hunted. Including the log
 *                 would make every no-op look like progress.
 *   `version`   — bumped on every applied action by definition.
 *   `updatedAt` — a stamp the caller supplied, not a game fact.
 *
 * Everything else is included by walking the state, so a field added to the
 * engine tomorrow is watched from the moment it exists. Static per-card
 * printing data (oracle text, image, printed stats) is dropped because it never
 * changes; the card's NAME is kept, so a token appearing is still visible.
 */

import { createHash } from 'node:crypto';
import type { GameState } from '../../src/lib/game/types.ts';

/** Top-level fields that change on every action for reasons that are not the game. */
const SKIP_TOP = new Set(['log', 'version', 'updatedAt']);

/**
 * Per-card fields copied from the printing at setup and never written again.
 * Dropping them keeps the fingerprint small enough to take on every action of
 * every game without the hashing becoming the slow part of the harness.
 */
const STATIC_CARD_FIELDS = new Set([
  'cardId',
  'manaCost',
  'cmc',
  'typeLine',
  'power',
  'toughness',
  'loyalty',
  'colorIdentity',
  'imageUrl',
  'keywords',
  'oracleText',
  'oracleId',
]);

function write(out: string[], value: unknown, cardScope: boolean): void {
  if (value === null || value === undefined) {
    out.push('~');
    return;
  }
  const kind = typeof value;
  if (kind === 'number' || kind === 'boolean') {
    out.push(String(value));
    return;
  }
  if (kind === 'string') {
    out.push(JSON.stringify(value));
    return;
  }
  if (Array.isArray(value)) {
    out.push('[');
    for (const item of value) {
      write(out, item, cardScope);
      out.push(',');
    }
    out.push(']');
    return;
  }
  if (kind === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    out.push('{');
    for (const key of keys) {
      if (cardScope && STATIC_CARD_FIELDS.has(key)) continue;
      const item = record[key];
      if (item === undefined) continue;
      out.push(key, ':');
      write(out, item, cardScope);
      out.push(',');
    }
    out.push('}');
    return;
  }
  out.push('?');
}

/** The canonical string. Deterministic across Node versions: keys are sorted. */
export function fingerprint(state: GameState): string {
  const out: string[] = [];
  const keys = Object.keys(state).sort();
  for (const key of keys) {
    if (SKIP_TOP.has(key)) continue;
    const value = (state as unknown as Record<string, unknown>)[key];
    if (value === undefined) continue;
    out.push(key, ':');
    write(out, value, key === 'cards');
    out.push(';');
  }
  return out.join('');
}

/** Short stable hash of a fingerprint string. */
export function hashFingerprint(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 16);
}

/**
 * Short stable hash of the state, for the replay log and loop detection.
 *
 * The runner takes `fingerprint` and `hashFingerprint` separately so it hashes
 * each state once rather than three times; this convenience wrapper is for the
 * replay path, where clarity is worth more than the microseconds.
 */
export function hashState(state: GameState): string {
  return hashFingerprint(fingerprint(state));
}

/* -------------------------------------------------------------------------- */
/* The differ                                                                 */
/* -------------------------------------------------------------------------- */

export interface StateDelta {
  /** 'p1.life', 'cards.p1-c7.zone', 'step' — dotted path into the state. */
  path: string;
  before: unknown;
  after: unknown;
}

export interface StateDiff {
  changes: StateDelta[];
  /** Instance ids that did not exist before. Tokens, and anything spawned. */
  added: string[];
  /** Instance ids that no longer exist. Should normally be empty. */
  removed: string[];
  /** Cards that moved, as instanceId -> from/to. The commonest change by far. */
  zoneMoves: Array<{ instanceId: string; name: string; from: string; to: string }>;
}

const MAX_CHANGES = 400;

function walk(
  before: unknown,
  after: unknown,
  path: string,
  out: StateDelta[],
  cardScope: boolean
): void {
  if (out.length >= MAX_CHANGES) return;
  if (before === after) return;

  const bothObjects =
    before !== null &&
    after !== null &&
    typeof before === 'object' &&
    typeof after === 'object' &&
    Array.isArray(before) === Array.isArray(after);

  if (!bothObjects) {
    out.push({ path, before, after });
    return;
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    // Zone lists and stacks are ordered, so compare as a whole when the shape
    // moves and element-wise when it does not. Either way the report reads as
    // "this list changed", which is what a reviewer wants.
    if (before.length !== after.length) {
      out.push({ path, before, after });
      return;
    }
    for (let i = 0; i < before.length; i++) {
      walk(before[i], after[i], `${path}[${i}]`, out, cardScope);
    }
    return;
  }

  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  for (const key of [...keys].sort()) {
    if (cardScope && STATIC_CARD_FIELDS.has(key)) continue;
    walk(b[key], a[key], path ? `${path}.${key}` : key, out, cardScope);
  }
}

/**
 * Everything one action changed, as data.
 *
 * `zoneMoves` is pulled out separately because "moved zones and nothing else"
 * is the shape of a silent card, and a caller should not have to string-match
 * paths to recognise it.
 */
export function diffState(before: GameState, after: GameState): StateDiff {
  const changes: StateDelta[] = [];

  for (const key of Object.keys({ ...before, ...after }).sort()) {
    if (SKIP_TOP.has(key)) continue;
    if (key === 'players') continue;
    if (key === 'cards') continue;
    walk(
      (before as unknown as Record<string, unknown>)[key],
      (after as unknown as Record<string, unknown>)[key],
      key,
      changes,
      false
    );
  }

  // Players are keyed by seat order in both states, so index is stable.
  for (let i = 0; i < Math.max(before.players.length, after.players.length); i++) {
    const b = before.players[i];
    const a = after.players[i];
    walk(b, a, `players.${a?.id ?? b?.id ?? i}`, changes, false);
  }

  const added: string[] = [];
  const removed: string[] = [];
  const zoneMoves: StateDiff['zoneMoves'] = [];

  const ids = new Set([...Object.keys(before.cards), ...Object.keys(after.cards)]);
  for (const id of [...ids].sort()) {
    const b = before.cards[id];
    const a = after.cards[id];
    if (!b && a) {
      added.push(id);
      continue;
    }
    if (b && !a) {
      removed.push(id);
      continue;
    }
    if (!b || !a || b === a) continue;
    if (b.zone !== a.zone) {
      zoneMoves.push({ instanceId: id, name: a.name, from: b.zone, to: a.zone });
    }
    walk(b, a, `cards.${id}`, changes, true);
  }

  return { changes, added, removed, zoneMoves };
}

/**
 * Card fields the engine writes as a mechanical consequence of a card changing
 * zone, whatever the card is.
 *
 * A creature entering the battlefield is summoning sick and its marked damage
 * is wiped whether it is Grizzly Bears or Griselbrand, so none of these is
 * evidence that a card DID anything. `tapped` and `counters` are deliberately
 * NOT in this list: a land that enters tapped and a planeswalker that enters
 * with loyalty are both a card's own text taking effect, which is exactly what
 * the caller is looking for.
 */
const ZONE_MECHANICS = new Set([
  'zone',
  'zoneChangeCounter',
  'summoningSick',
  'damage',
  'damagedByDeathtouch',
  'manualResolved',
]);

/**
 * True when the only thing that happened was a card relocating.
 *
 * A resolving spell always moves at least itself, so this is the test for "the
 * card resolved and did nothing". Callers pair it with the card's oracle text:
 * text that promises an effect, plus a move-only difference, is the finding —
 * the card was silent and nobody was told.
 *
 * This is deliberately a coarse first pass. It says the state did not change
 * beyond relocation; it does not say the card was SUPPOSED to change something,
 * which needs the oracle text and is somebody else's judgement. A caller
 * wanting stricter or looser rules should walk `diff.changes` itself rather
 * than have this function grow options.
 *
 * TWO WAYS THIS IS RIGHT AND STILL NOT A BUG, both of which matter before
 * anybody quotes the count as a defect total:
 *
 *   A vanilla creature entering the battlefield SHOULD change nothing else.
 *   Grizzly Bears has no ability and its arrival is the whole event.
 *
 *   A static ability changes nothing in state by design. `layers.ts` computes
 *   continuous effects on read rather than writing them down, so an anthem that
 *   is working perfectly produces a move-only difference. Reading this flag as
 *   "the anthem is broken" would be exactly wrong.
 *
 * So the honest description of the number is: cards worth looking at. Turning
 * it into a finding means reading the card's text and deciding whether the text
 * described something that should have left a mark.
 */
export function movedOnly(diff: StateDiff): boolean {
  if (diff.added.length > 0 || diff.removed.length > 0) return false;
  return diff.changes.every(change => {
    if (/^players\.[^.]+\.zones\./.test(change.path)) return true;
    const field = change.path.slice(change.path.lastIndexOf('.') + 1);
    return change.path.startsWith('cards.') && ZONE_MECHANICS.has(field);
  });
}
