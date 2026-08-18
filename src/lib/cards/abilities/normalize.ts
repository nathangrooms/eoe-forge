/**
 * Oracle text -> the string the ability compiler actually reads.
 *
 * Same three lessons the role tagger paid for, applied again because the
 * compiler is far less forgiving than a tagger: a tagger that reads reminder
 * text emits a spurious tag, a compiler that reads reminder text emits a
 * spurious ABILITY, and a spurious ability silently corrupts a game.
 *
 *   1. **Reminder text is stripped.** Smothering Tithe's Treasure reminder is
 *      "{T}, Sacrifice this token: Add one mana of any color". Compiled, that
 *      would give Smothering Tithe a mana ability it does not have.
 *   2. **The card's own name becomes `~`.** Oracle text still says "Blasphemous
 *      Act deals 13 damage to each creature", and card names contain the very
 *      words the rules match on.
 *   3. **802 rows carry a null `oracle_text` with everything on `faces`.**
 *      Reading only the top level compiles all of them to nothing.
 *
 * Plus two the tagger did not need:
 *
 *   4. **Post-2024 self-reference.** Current templating writes "this creature",
 *      "this land", "this Equipment" where old text wrote the card's name. Both
 *      spellings collapse to `~` so one pattern matches either. The list of
 *      self-reference phrases is explicit and closed — "this turn", "this way"
 *      and "this game" are not self-references and must survive untouched.
 *   5. **Ability words are stripped.** "Landfall — Whenever a land enters..."
 *      is, per CR 207.2c, flavour with no rules meaning. Leaving it in front of
 *      the trigger costs ~700 cards for nothing. The `choose` family is
 *      blocklisted because "Choose one —" uses the same dash and is *not*
 *      flavour.
 *
 * ## Faces
 * Only the FRONT face is compiled. Folding a transform card's back face into
 * the front face's ability list would grant the card abilities it does not
 * have while it is front-side up, which is the silent-corruption failure mode
 * this whole design exists to prevent. Back faces are recorded as gaps, so they
 * show up in the coverage report rather than disappearing.
 *
 * ## Spans
 * Normalisation happens PARAGRAPH BY PARAGRAPH, and paragraphs are split from
 * the raw text before anything is rewritten. That keeps a verbatim `raw` beside
 * every `norm` — the DSL promises `Ability.text` is verbatim oracle, never
 * invented — and it means reminder-text removal can never silently swallow a
 * paragraph boundary.
 */

import type { GapReason } from './dsl.ts';

/* ------------------------------------------------------------------ *
 * Card shape — structurally satisfied by a `cards` row, and by a live
 * Scryfall object (which spells `faces` as `card_faces`).
 * ------------------------------------------------------------------ */

export interface AbilityCardFace {
  name?: string | null;
  type_line?: string | null;
  oracle_text?: string | null;
  power?: string | null;
  toughness?: string | null;
}

export interface AbilityCard {
  id?: string | null;
  oracle_id?: string | null;
  name?: string | null;
  type_line?: string | null;
  oracle_text?: string | null;
  keywords?: string[] | null;
  mana_cost?: string | null;
  cmc?: number | string | null;
  power?: string | null;
  toughness?: string | null;
  layout?: string | null;
  faces?: AbilityCardFace[] | null;
  card_faces?: AbilityCardFace[] | null;
}

/* ------------------------------------------------------------------ *
 * Paragraphs
 * ------------------------------------------------------------------ */

export interface Paragraph {
  /** Verbatim source line, untouched. This is what `Ability.text` carries. */
  raw: string;
  /** Lowercased, reminder-free, `~`-for-self text the rules match against. */
  norm: string;
  /** `[start, end)` into `NormalizedOracle.text`. */
  span: [number, number];
  /** 0 = front face. Anything else is a declared gap. */
  face: number;
}

export interface NormalizedOracle {
  /** Every paragraph's `norm`, joined with `\n`. Spans index into this. */
  text: string;
  paragraphs: Paragraph[];
  /** Reason to attach to paragraphs whose `face > 0`. */
  backFaceReason: GapReason;
  /** Lowercased, em-dash-flattened type line of the FRONT face only. */
  typeLine: string;
  /** FNV-1a over `text`. Detects Scryfall errata moving under an authored entry. */
  hash: string;
}

/* ------------------------------------------------------------------ *
 * Self-reference. Closed and explicit: a bare `this ([a-z]+)` rewrite
 * would eat "this turn", "this way", "this game" and "this combat".
 * ------------------------------------------------------------------ */

const SELF_NOUNS = [
  'creature card',
  'creature',
  'land',
  'artifact creature',
  'artifact',
  'enchantment',
  'planeswalker',
  'permanent',
  'vehicle',
  'equipment',
  'aura',
  'battle',
  'saga',
  'class',
  'room',
  'siege',
  'case',
  'token',
  'spell',
  'card',
] as const;

/** Longest first, so "this creature card" is not eaten by "this creature". */
const SELF_PHRASES: string[] = [...SELF_NOUNS]
  .sort((a, b) => b.length - a.length)
  .map((n) => `this ${n}`);

/**
 * Prefixes that look like an ability word but are not. "Choose one —" is real
 * rules text; "Landfall —" is flavour. Getting this backwards would delete the
 * modal marker from every modal spell.
 */
const NOT_ABILITY_WORDS = new Set([
  'choose one',
  'choose two',
  'choose three',
  'choose one or both',
  'choose one or more',
  'choose two or more',
  'choose any number',
  'choose odd or even',
]);

/* ------------------------------------------------------------------ *
 * Normalisation
 * ------------------------------------------------------------------ */

function faceList(card: AbilityCard): AbilityCardFace[] {
  const faces = card.faces ?? card.card_faces;
  return Array.isArray(faces) ? faces : [];
}

/** Every spelling of the card's own name, longest first. */
function selfNames(card: AbilityCard): string[] {
  const names = new Set<string>();
  if (card.name) {
    const lower = card.name.toLowerCase();
    names.add(lower);
    for (const part of lower.split(' // ')) names.add(part.trim());
  }
  for (const face of faceList(card)) if (face?.name) names.add(String(face.name).toLowerCase());
  return Array.from(names)
    .filter((n) => n.length >= 3)
    .sort((a, b) => b.length - a.length);
}

/**
 * One paragraph, raw -> matchable. Order matters and is load-bearing:
 * reminder text goes before name replacement (a reminder can contain the name),
 * apostrophes go before self-reference (so "this creature's" is one phrase),
 * and the ability word is stripped before dashes are flattened (the strip keys
 * on the em dash).
 */
export function normalizeParagraph(raw: string, names: readonly string[]): string {
  let s = raw.toLowerCase();

  // 1. Reminder text. Non-greedy per parenthesis pair; nested parens do not
  //    occur in oracle text.
  s = s.replace(/\([^)]*\)/g, ' ');

  // 2. The card's own name.
  for (const n of names) s = s.split(n).join('~');

  // 3. Apostrophes: oracle text mixes U+2019 with ASCII by vintage.
  s = s.replace(/[’'`]/g, '');

  // 4. Post-2024 self-reference.
  for (const phrase of SELF_PHRASES) s = s.split(phrase).join('~');

  // 5. Ability word (CR 207.2c flavour), but never the modal marker.
  const abilityWord = s.match(/^([a-z][a-z ]{2,30}) — /);
  if (abilityWord && !NOT_ABILITY_WORDS.has(abilityWord[1].trim())) {
    s = s.slice(abilityWord[0].length);
  }

  // 6. Dashes: em, en and the U+2212 MINUS SIGN that loyalty costs use.
  s = s.replace(/[—–−]/g, '-');

  // 7. Whitespace.
  return s.replace(/[ \t]+/g, ' ').trim();
}

/** FNV-1a, two accumulators, 16 hex characters. Deterministic and dependency-free. */
export function oracleHash(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ (c + i), 0x85ebca6b) >>> 0;
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

/** Type line of the front face only, lowercased, em dashes flattened. */
export function frontTypeLine(card: AbilityCard): string {
  const faces = faceList(card);
  const source = faces.length >= 2 ? faces[0]?.type_line : (card.type_line ?? faces[0]?.type_line);
  return String(source ?? '').toLowerCase().replace(/[—–]/g, '-');
}

/**
 * Layouts whose second half is a separate spell you cast in a separate way —
 * that is the declared `alt-cast` gap, not a face-tracking gap. Everything else
 * multi-faced (transform, modal DFC, meld, flip) is `multi-face`.
 */
const ALT_CAST_LAYOUTS = new Set(['split', 'adventure', 'aftermath']);

/**
 * The compiler's view of a card: front-face paragraphs it may compile, back-face
 * paragraphs it may not, spans that cover every non-blank character of both.
 */
export function normalizeCard(card: AbilityCard): NormalizedOracle {
  const faces = faceList(card);
  const names = selfNames(card);

  /** [rawText, faceIndex] for every face, front first. */
  const sources: Array<[string, number]> = [];
  if (faces.length >= 2) {
    faces.forEach((f, i) => sources.push([String(f?.oracle_text ?? ''), i]));
  } else {
    sources.push([String(card.oracle_text ?? faces[0]?.oracle_text ?? ''), 0]);
  }

  const paragraphs: Paragraph[] = [];
  const normParts: string[] = [];
  let cursor = 0;

  for (const [rawFace, faceIndex] of sources) {
    for (const rawLine of rawFace.split('\n')) {
      const raw = rawLine.trim();
      if (!raw) continue;
      const norm = normalizeParagraph(raw, names);
      if (!norm) continue; // a paragraph that was nothing but reminder text
      const start = cursor;
      normParts.push(norm);
      cursor += norm.length + 1; // +1 for the joining '\n'
      paragraphs.push({ raw, norm, span: [start, start + norm.length], face: faceIndex });
    }
  }

  const text = normParts.join('\n');
  const layout = String(card.layout ?? '').toLowerCase();

  return {
    text,
    paragraphs,
    backFaceReason: ALT_CAST_LAYOUTS.has(layout) ? 'alt-cast' : 'multi-face',
    typeLine: frontTypeLine(card),
    hash: oracleHash(text),
  };
}

/**
 * The identity the ability record is authored against. `oracle_id` is stable
 * across printings, which is why the DSL keys on it; `id` is the fallback for a
 * row that predates the column, and the name is the last resort so a hand-built
 * test fixture still gets a key.
 */
export function abilityKey(card: AbilityCard): string {
  return String(card.oracle_id ?? card.id ?? card.name ?? '');
}
