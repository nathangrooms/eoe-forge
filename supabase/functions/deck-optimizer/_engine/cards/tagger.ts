/**
 * GENERATED FILE — do not edit.
 *
 * Rendered from src/lib/cards/tagger.ts by
 * src/lib/deck/recommend/vendor-engine.mjs, and re-rendered and byte-compared
 * by src/lib/deck/recommend/engine-parity.test.ts, so it cannot drift from the
 * real rules without the test suite going red.
 *
 * WHY IT IS A SUBSET
 * The real `TAG_RULES` carries a `when` condition per rule: the oracle-text
 * and type-line matchers that assign tags when a card is imported. The edge
 * function never tags a card — `cards.tags` is already populated — and the only
 * consumer here, `tag-signal.ts`, reads exactly two fields:
 *
 *     TAG_RULES.map(r => r.tag)      // the canonical tag names
 *     rule.also                      // their legacy aliases
 *
 * from which it derives `ALIAS_TAGS` so that ranking counts one idea once. Every
 * rule below is present with both of those fields intact, so `ALIAS_TAGS` and
 * the canonical set are identical to the ones the browser build computes.
 * Carrying the matchers as well would ship 34 KB of regex that nothing in this
 * function can reach.
 *
 * 66 rules, 9 of them carrying aliases.
 */

export interface TagRule {
  /** Canonical tag. */
  tag: string;
  /** Legacy tag names emitted alongside the canonical one. */
  also?: string[];
}

export const TAG_RULES: TagRule[] = [
  { tag: 'creature' },
  { tag: 'instant' },
  { tag: 'sorcery' },
  { tag: 'artifact' },
  { tag: 'enchantment' },
  { tag: 'planeswalker' },
  { tag: 'land' },
  { tag: 'battle' },
  { tag: 'basic-land' },
  { tag: 'equipment' },
  { tag: 'aura', also: ['auras'] },
  { tag: 'vehicle' },
  { tag: 'ramp' },
  { tag: 'mana-rock' },
  { tag: 'mana-dork' },
  { tag: 'fast-mana' },
  { tag: 'treasure' },
  { tag: 'cost-reduction' },
  { tag: 'card-draw', also: ['draw'] },
  { tag: 'tutor' },
  { tag: 'tutor-broad' },
  { tag: 'tutor-narrow' },
  { tag: 'group-hug' },
  { tag: 'mill' },
  { tag: 'self-mill' },
  { tag: 'discard' },
  { tag: 'discard-outlet' },
  { tag: 'targeted-removal', also: ['removal', 'removal-spot'] },
  { tag: 'board-wipe', also: ['removal', 'removal-sweeper'] },
  { tag: 'bounce' },
  { tag: 'counterspell' },
  { tag: 'land-destruction' },
  { tag: 'graveyard-hate' },
  { tag: 'stax' },
  { tag: 'protection' },
  { tag: 'graveyard-recursion', also: ['recursion'] },
  { tag: 'reanimator' },
  { tag: 'sacrifice-outlet', also: ['sac-outlet', 'sacrifice'] },
  { tag: 'aristocrats' },
  { tag: 'token-maker', also: ['tokens'] },
  { tag: 'counters' },
  { tag: 'proliferate' },
  { tag: 'infect' },
  { tag: 'haste-enabler' },
  { tag: 'extra-turn' },
  { tag: 'extra-combat' },
  { tag: 'untapper' },
  { tag: 'blink' },
  { tag: 'clone' },
  { tag: 'flash' },
  { tag: 'cascade' },
  { tag: 'evasion' },
  { tag: 'finisher', also: ['wincon'] },
  { tag: 'mass-pump' },
  { tag: 'lifegain' },
  { tag: 'voltron' },
  { tag: 'landfall', also: ['lands-matter'] },
  { tag: 'lands-matter' },
  { tag: 'artifacts-matter' },
  { tag: 'enchantments-matter' },
  { tag: 'spellslinger' },
  { tag: 'prowess' },
  { tag: 'storm' },
  { tag: 'tribal-payoff' },
  { tag: 'etb' },
  { tag: 'x-spell' },
];
