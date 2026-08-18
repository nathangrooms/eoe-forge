/**
 * Oracle-text mechanic detection.
 *
 * The corpus can only speak about the 2,513 cards it has seen more than once.
 * This module is what lets the engine say something about the other 31,000 —
 * it reads the Scryfall oracle text we already sync and classifies a card into
 * a small vocabulary of Commander-relevant themes.
 *
 * HONESTY NOTE
 * ------------
 * This is pattern matching, not comprehension. It will call
 * "Whenever a creature you control dies" a death-trigger correctly, and it will
 * also match a card that merely says "dies" in flavour-adjacent reminder text.
 * Every score that leans on this component reports a lower `confidence` than
 * one backed by observed co-occurrence, and callers must surface that.
 *
 * Pure functions only — no I/O, no imports beyond types.
 */

import type { Mechanic, SynergyCard } from './types';

/**
 * Detection rules, in a table so they can be read, argued with and tested.
 *
 * Patterns run against oracle text with newlines preserved. They are written
 * against Scryfall's *current* templating; older wordings ("comes into play")
 * are handled where Scryfall has not already normalised them away.
 */
const RULES: ReadonlyArray<{ mechanic: Mechanic; pattern: RegExp }> = [
  { mechanic: 'counters', pattern: /\+1\/\+1 counter/i },
  { mechanic: 'proliferate', pattern: /\bproliferate\b/i },
  { mechanic: 'landfall', pattern: /\blandfall\b|whenever a land enters|whenever one or more lands enter/i },
  { mechanic: 'tokens', pattern: /creates? (?:a|an|one|two|three|X|\d+)[^.]*token|token creature you control/i },
  { mechanic: 'sacrifice', pattern: /\bsacrifices? (?:a|an|another|two|three|X|\d+)\b/i },
  { mechanic: 'death-trigger', pattern: /whenever [^.]*\bdies\b|whenever [^.]*\bdie\b/i },
  { mechanic: 'reanimate', pattern: /return[^.]*creature card[^.]*from (?:your|a) graveyard to the battlefield|put[^.]*creature card[^.]*from (?:your|a) graveyard onto the battlefield/i },
  { mechanic: 'graveyard', pattern: /from your graveyard|in your graveyard|from a graveyard/i },
  { mechanic: 'mill', pattern: /\bmills?\b|puts? the top [^.]*into (?:their|your) graveyard/i },
  { mechanic: 'artifacts', pattern: /\bartifacts? you control\b|whenever an artifact|artifact spell/i },
  { mechanic: 'enchantments', pattern: /\benchantments? you control\b|whenever an enchantment|enchantment spell/i },
  { mechanic: 'equipment', pattern: /\bequip\b|\bequipped creature\b|\bEquipment\b/ },
  { mechanic: 'auras', pattern: /\benchanted creature\b|\bAura\b/ },
  { mechanic: 'treasure', pattern: /\bTreasure\b/ },
  { mechanic: 'lifegain', pattern: /\bgains? \d+ life\b|\bgain that much life\b|whenever you gain life|\blifelink\b/i },
  { mechanic: 'card-draw', pattern: /\bdraws? (?:a card|two|three|X|\d+)|whenever you draw/i },
  { mechanic: 'discard', pattern: /\bdiscards? (?:a card|two|three|X|\d+)|whenever you discard/i },
  { mechanic: 'ramp', pattern: /search your library for (?:a|an|up to)[^.]*land|add \{[WUBRGC0-9X]\}|adds? [^.]*mana/i },
  { mechanic: 'untap', pattern: /\buntap (?:target|another target|all|each)\b|\buntapped\b/i },
  { mechanic: 'blink', pattern: /exile[^.]*(?:then )?return (?:it|them|that card)[^.]*to the battlefield|return (?:it|them) to the battlefield under (?:its|their) owner/i },
  { mechanic: 'etb', pattern: /when(?:ever)? [^.]*enters(?:,| the battlefield)/i },
  { mechanic: 'attack-trigger', pattern: /whenever [^.]*attacks/i },
  { mechanic: 'spellslinger', pattern: /whenever you cast (?:an instant|a sorcery)|instant (?:or|and) sorcery|\bmagecraft\b|\bprowess\b/i },
  { mechanic: 'counterspell', pattern: /counter target [^.]*spell/i },
  { mechanic: 'removal', pattern: /destroy target|exile target (?:creature|permanent|artifact|enchantment|planeswalker)|target creature gets -\d/i },
  { mechanic: 'tutor', pattern: /search your library for (?:a|an|up to)[^.]*card/i },
  { mechanic: 'energy', pattern: /\{E\}|\benergy counter/i },
  { mechanic: 'stax', pattern: /(?:spells?|abilities) cost \{[^}]+\} more|players can't|can't untap|don't untap during/i },
  { mechanic: 'cost-reduction', pattern: /costs? \{[^}]+\} less to cast|spells you cast cost/i },
  { mechanic: 'combat-tricks', pattern: /\bextra combat phase\b|\badditional combat phase\b|gains? double strike|\bmust be blocked\b/i },
  { mechanic: 'clone', pattern: /as a copy of|becomes? a copy of|copy that spell/i },
  { mechanic: 'goad', pattern: /\bgoads?\b|\bgoaded\b/i },
  { mechanic: 'monarch', pattern: /\bthe monarch\b|becomes? the monarch/i },
];

/** Keywords Scryfall already extracts that map cleanly onto a mechanic. */
const KEYWORD_MECHANICS: Readonly<Record<string, Mechanic>> = {
  lifelink: 'lifegain',
  proliferate: 'proliferate',
  landfall: 'landfall',
  equip: 'equipment',
  prowess: 'spellslinger',
  magecraft: 'spellslinger',
  flashback: 'graveyard',
  escape: 'graveyard',
  disturb: 'graveyard',
  unearth: 'graveyard',
  embalm: 'graveyard',
  eternalize: 'graveyard',
  cascade: 'spellslinger',
  convoke: 'tokens',
  afterlife: 'tokens',
  fabricate: 'counters',
  modular: 'counters',
  bloodthirst: 'counters',
  evolve: 'counters',
  adapt: 'counters',
  outlast: 'counters',
  mentor: 'counters',
  exploit: 'sacrifice',
  devour: 'sacrifice',
  blitz: 'sacrifice',
  cycling: 'card-draw',
  madness: 'discard',
  threshold: 'graveyard',
  delirium: 'graveyard',
  delve: 'graveyard',
};

/**
 * Every mechanic a card exhibits.
 *
 * Reads oracle text and Scryfall's `keywords` array together — 17,194 of our
 * 34,088 rows have an empty keywords array, so text is the primary signal and
 * keywords only ever add.
 */
export function detectMechanics(card: SynergyCard): Set<Mechanic> {
  const found = new Set<Mechanic>();
  const text = card.oracle_text ?? '';

  if (text) {
    for (const { mechanic, pattern } of RULES) {
      if (pattern.test(text)) found.add(mechanic);
    }
  }

  for (const keyword of card.keywords ?? []) {
    const mapped = KEYWORD_MECHANICS[keyword.toLowerCase()];
    if (mapped) found.add(mapped);
  }

  // Type line carries mechanics the text does not restate.
  const type = card.type_line ?? '';
  if (/\bEquipment\b/.test(type)) found.add('equipment');
  if (/\bAura\b/.test(type)) found.add('auras');

  // "reanimate" is a strict subset of "graveyard"; keep both so a reanimation
  // pair scores above a generic graveyard pair rather than equal to it.
  if (found.has('reanimate')) found.add('graveyard');

  return found;
}

/**
 * Mechanics that mean little on their own because a large share of the card
 * pool has them. Two cards both drawing a card is not synergy.
 *
 * Shares measured against our own `cards` table, not guessed.
 */
const COMMON_MECHANICS: ReadonlySet<Mechanic> = new Set<Mechanic>([
  'etb',        // 5,829 / 34,088
  'card-draw',
  'removal',
  'ramp',
  'untap',
]);

/** Discriminating mechanics count for more than ubiquitous ones. */
export function mechanicWeight(mechanic: Mechanic): number {
  return COMMON_MECHANICS.has(mechanic) ? 0.35 : 1;
}

/**
 * Overlap between two mechanic sets, 0–1.
 *
 * A weighted Jaccard: shared discriminating mechanics dominate, and the
 * denominator is the union so a card with twenty detected mechanics does not
 * automatically synergise with everything.
 */
export function mechanicOverlap(
  a: ReadonlySet<Mechanic>,
  b: ReadonlySet<Mechanic>
): { score: number; shared: Mechanic[] } {
  const shared: Mechanic[] = [];
  let sharedWeight = 0;
  let unionWeight = 0;

  const union = new Set<Mechanic>([...a, ...b]);
  for (const mechanic of union) {
    const weight = mechanicWeight(mechanic);
    unionWeight += weight;
    if (a.has(mechanic) && b.has(mechanic)) {
      shared.push(mechanic);
      sharedWeight += weight;
    }
  }

  if (unionWeight === 0) return { score: 0, shared: [] };

  shared.sort((x, y) => mechanicWeight(y) - mechanicWeight(x) || x.localeCompare(y));
  return { score: sharedWeight / unionWeight, shared };
}

/* ------------------------------------------------------------------ *
 * Types and tribal
 * ------------------------------------------------------------------ */

/**
 * Subtypes from a type line — the part after the em dash.
 *
 * Scryfall uses a real em dash (—). Split cards carry a `//`, and each half has
 * its own type line, so both halves' subtypes are returned.
 */
export function subtypesOf(typeLine: string | null | undefined): string[] {
  if (!typeLine) return [];
  const out: string[] = [];
  for (const half of typeLine.split('//')) {
    const dash = half.indexOf('—');
    if (dash === -1) continue;
    for (const word of half.slice(dash + 1).trim().split(/\s+/)) {
      const clean = word.trim();
      if (clean) out.push(clean);
    }
  }
  return out;
}

/** True when the type line names the given supertype/type, e.g. "Creature". */
export function isType(typeLine: string | null | undefined, type: string): boolean {
  return new RegExp(`\\b${type}\\b`, 'i').test(typeLine ?? '');
}

/**
 * Shared creature subtypes between two cards.
 *
 * Only meaningful when both are creatures — an Equipment and a creature sharing
 * the subtype "Vehicle" is not tribal synergy.
 */
export function sharedCreatureTypes(a: SynergyCard, b: SynergyCard): string[] {
  if (!isType(a.type_line, 'Creature') || !isType(b.type_line, 'Creature')) return [];
  const bTypes = new Set(subtypesOf(b.type_line));
  return subtypesOf(a.type_line).filter(t => bTypes.has(t));
}

/**
 * Does one card's text explicitly reference the other's subtype or card type?
 *
 * This is the strongest text-only signal there is: a tribal lord naming
 * "Elves" alongside an actual Elf is not a coincidence, whereas two cards both
 * matching /counter/ might be.
 *
 * Magic capitalises type words in rules text ("Elves you control"), so matching
 * case-sensitively removes most false positives from types that are also
 * ordinary English words — Wall, Scout, Horror, Bat.
 */
export function textualReferences(from: SynergyCard, to: SynergyCard): string[] {
  const text = from.oracle_text ?? '';
  if (!text) return [];

  const hits: string[] = [];
  const seen = new Set<string>();

  for (const subtype of subtypesOf(to.type_line)) {
    if (seen.has(subtype)) continue;
    seen.add(subtype);
    // Singular, and the two plural forms Magic actually uses.
    const plural = subtype.endsWith('f')
      ? `${subtype.slice(0, -1)}ves`
      : `${subtype}s`;
    const pattern = new RegExp(`\\b(?:${escape(subtype)}|${escape(plural)})\\b`);
    if (pattern.test(text)) hits.push(subtype);
  }

  return hits;
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ------------------------------------------------------------------ *
 * Colour identity
 * ------------------------------------------------------------------ */

/** Canonical WUBRG-ordered key for a colour identity, "" for colourless. */
export function colorIdentityKey(identity: readonly string[] | null | undefined): string {
  if (!identity || identity.length === 0) return '';
  const set = new Set(identity);
  return ['W', 'U', 'B', 'R', 'G'].filter(c => set.has(c)).join('');
}

/**
 * Re-order an identity string into canonical WUBRG form.
 *
 * Every lookup keyed by identity runs through this. Without it a caller who
 * writes the colours in the order a player would say them — "Simic", "GU" —
 * misses the map entirely and silently gets zero eligible decks, which reads
 * downstream as "no synergy" rather than as an error. The self-test caught
 * exactly that, so normalisation lives at the lookup rather than in a comment
 * asking callers to be careful.
 */
export function canonicalIdentityKey(key: string): string {
  if (!key) return '';
  const set = new Set(key.toUpperCase());
  return ['W', 'U', 'B', 'R', 'G'].filter(c => set.has(c)).join('');
}

/**
 * Can a deck of colour identity `deck` legally play a card of identity `card`?
 *
 * Commander rule 903.4: every mana symbol in a card's identity must appear in
 * the commander's. Colourless cards go anywhere.
 */
export function fitsIdentity(card: string, deck: string): boolean {
  for (const color of card) {
    if (!deck.includes(color)) return false;
  }
  return true;
}
