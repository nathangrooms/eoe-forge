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
import { isSubtypeWord } from './grammar.ts';

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
  /**
   * T3. The FRONT face's printed power and toughness boxes, verbatim.
   *
   * Carried because one rule genuinely needs them and can get them nowhere
   * else. "Uurg's power is equal to the number of land cards in your graveyard"
   * defines ONE of the two characteristics, and `Modification` has no member
   * for setting one; the other half of the box is on the card, printed, as `5`.
   *
   * Strings, not numbers, on purpose. `*` and `1+*` are exactly the values that
   * must make that rule refuse, and turning them into numbers here would be the
   * `parseInt` guess `printed.ts`'s own header calls wrong and silent.
   */
  printedPower: string;
  printedToughness: string;
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
/**
 * The ability word at the head of a paragraph, if there is one.
 *
 * `normalizeParagraph` STRIPS these, and that is right: an ability word has no
 * rules meaning at all, so leaving "landfall — " in front of "whenever a land
 * you control enters" would make every landfall card a shape no rule matches.
 *
 * But stripping it and throwing it away cost every one of them. Measured 31 Aug
 * 2026 against Scryfall's own catalog of 69 ability words: the engine emitted a
 * facet for exactly ONE. Landfall is on 193 cards and is one of DeckMatrix's own
 * eighteen archetype shells, and the engine could not see it.
 *
 * An ability word is the single most concentrated archetype signal a card
 * carries. Wizards puts it there precisely to say "this card belongs to that
 * deck": landfall, metalcraft, delirium, threshold, domain, constellation,
 * magecraft. Every one names a deck somebody builds.
 *
 * PATTERN PLUS BLOCKLIST, not a fixed list, so a word from a set released next
 * month is read without anybody updating a file. `NOT_ABILITY_WORDS` is the
 * guard and it is the same one the strip uses, so the two can never disagree
 * about what an ability word is.
 */
export function abilityWordsOf(card: AbilityCard): string[] {
  const found = new Set<string>();
  const texts = [card.oracle_text, ...faceList(card).map((f) => f?.oracle_text)];
  for (const text of texts) {
    if (!text) continue;
    for (const para of String(text).split('\n')) {
      /* The em dash is what makes it an ability word rather than a sentence.
         Normalisation flattens dashes LATER, which is why this reads the raw
         text and why the order in `normalizeParagraph` is load-bearing. */
      const m = para.match(/^([A-Za-z][A-Za-z'’ ]{2,30}) — /);
      if (!m) continue;
      const word = m[1].trim().toLowerCase();
      if (NOT_ABILITY_WORDS.has(word)) continue;
      found.add(word);
    }
  }
  return [...found];
}

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

/**
 * Short names that are also ordinary words. "Will, Scholar of Frost" must not
 * turn every "will" in the catalogue into a self-reference.
 */
const UNSAFE_SHORT_NAMES = new Set([
  'will', 'time', 'fire', 'ice', 'life', 'death', 'gift', 'wish', 'hope',
  'fear', 'rage', 'mask', 'crown', 'blood', 'storm', 'flame', 'light', 'dark',
  'shadow', 'spirit', 'ring', 'sword', 'shield', 'song', 'dream', 'water',
  'earth', 'wind', 'stone', 'iron', 'gold', 'silver', 'plague', 'wall',
  'anger', 'greed', 'brawl', 'growth', 'chaos', 'order',
]);

/**
 * Every spelling of the card's own name, longest first.
 *
 * The important entry is the LAST one. A legendary permanent's oracle text uses
 * the short name — "When Sephiroth enters", not "When Sephiroth, Planet's Heir
 * enters" — so a name set built only from the full printed name replaces
 * nothing and the card's own triggers read as though they were about some other
 * permanent. Sephiroth, Planet's Heir lost its whole enters trigger to exactly
 * that before this existed.
 *
 * The short name is taken only from a comma-separated title, only at four
 * characters or more, and never from `UNSAFE_SHORT_NAMES` — the guard against
 * "Will, Scholar of Frost" rewriting the word "will" across the catalogue.
 */
/*
 * Exported because `roundtrip.ts` normalises a FRAGMENT of oracle text — the part
 * a model claimed to have compiled — and must fold self-names exactly as
 * `normalizeCard` folds them across the whole. A second, near-identical name list
 * over there would be somewhere for the two to disagree, and a disagreement shows
 * up as the round-trip reporting a dropped word that is really the card's name.
 */
export function selfNames(card: AbilityCard): string[] {
  const names = new Set<string>();

  /*
   * A COMMA IS NOT THE ONLY WAY A LEGEND IS NAMED, and assuming it was cost 199
   * commanders their own name.
   *
   * "Ragavan, Nimble Pilferer" splits at the comma and everything works. So do
   * most modern legends. But the older and the licensed ones use a preposition:
   *
   *     Kaalia of the Vast          text says "Kaalia"
   *     Loran of the Third Path     text says "Loran"
   *     Kaervek the Merciless       text says "Kaervek"
   *     Bladewing the Risen         text says "Bladewing"
   *
   * and with no short form in the set, `normalizeParagraph` leaves the proper
   * noun standing. "Whenever Kaalia attacks" then matches no rule at all, and
   * the whole trigger reads as an unknown shape — which is worse than a missing
   * rule, because every work list ranks it as one and a rule for it already
   * exists.
   *
   * Measured over all 3,373 commanders with rules text: 199 carry a word of
   * their own name into the normalised text, and NOT ONE OF THEM IS `full`.
   *
   * GATED ON LEGENDARY, deliberately. The short-form convention is a legendary
   * one, and `normalizeParagraph` replaces by SUBSTRING rather than by word, so
   * a short name is a blunt instrument: shortening "Rite of Replication" to
   * "rite" would rewrite "favorite" and "sprite" across every card that shares
   * the name list. Legendary cards are the ones that benefit, so they are the
   * only ones that take the risk.
   */
  const legendary = /Legendary/i.test(String(card.type_line ?? '')) ||
    faceList(card).some((f) => /Legendary/i.test(String(f?.type_line ?? '')));

  const offer = (short: string): void => {
    if (short.length >= 4 && !UNSAFE_SHORT_NAMES.has(short) && !isSubtypeWord(short)) {
      names.add(short);
    }
  };

  const addWithShortForm = (raw: string): void => {
    const lower = raw.toLowerCase().trim();
    if (!lower) return;
    names.add(lower);

    const comma = lower.indexOf(',');
    if (comma >= 0) {
      offer(lower.slice(0, comma).trim());
      return;
    }
    if (!legendary) return;

    /*
     * THE EARLIEST separator, not the first one in a fixed order. "Kaalia of
     * the Vast" contains both, and checking " the " first gives "kaalia of",
     * which folds nothing and reads as a fix while leaving the card exactly as
     * broken as before. Six of the most played names in the list failed that
     * way on the first attempt.
     */
    let at = -1;
    for (const sep of [' of ', ' the ']) {
      const i = lower.indexOf(sep);
      if (i > 0 && (at < 0 || i < at)) at = i;
    }
    if (at > 0) offer(lower.slice(0, at).trim());
  };

  if (card.name) {
    for (const part of card.name.split(' // ')) addWithShortForm(part);
    addWithShortForm(card.name);
  }
  for (const face of faceList(card)) if (face?.name) addWithShortForm(String(face.name));

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
 * One printed P/T box of the front face, verbatim, or `''` when there is none.
 * Read the same way `frontTypeLine` reads the type line, so a double-faced card
 * reports the face its oracle text came from and not the back one's box.
 */
export function frontPrintedPT(card: AbilityCard, box: 'power' | 'toughness'): string {
  const faces = faceList(card);
  const source = faces.length >= 2 ? faces[0]?.[box] : (card[box] ?? faces[0]?.[box]);
  return String(source ?? '').trim();
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
    printedPower: frontPrintedPT(card, 'power'),
    printedToughness: frontPrintedPT(card, 'toughness'),
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
