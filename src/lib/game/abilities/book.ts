/**
 * DeckMatrix — the card-ability DSL: the hand-written book.
 *
 * Entries here take precedence over the compiler. Two reasons a card earns one:
 * the compiler gets it wrong, or the compiler cannot express it at all and a
 * human can.
 *
 * ## Why hand-authoring is cheap here
 *
 * Because an ability is a literal, an entry is diffable in code review and
 * testable without booting a game — `assert.deepEqual` against the expected
 * `Ability[]`, then `runEffects` against the expected `GameAction[]`. XMage
 * cards are Java classes, which means they cannot be reviewed as data, cannot
 * be serialised, and cannot be shipped to a browser; those are the three things
 * we need most.
 *
 * ## Deliberately partial entries are allowed and are the point
 *
 * An entry may implement two of a card's three clauses and list the third in
 * `unparsed`, or leave it as a `{do:'manual'}` inside an otherwise-automated
 * ability. Honest partial authoring is expressible, so nobody has to choose
 * between "do all of it" and "do none of it" — the choice that produces
 * abandoned cards.
 *
 * ## Staleness
 *
 * `authoredAgainst` is the exact oracle text the entry was written for. The
 * registry hashes it and compares against the card row at load. If Scryfall
 * issues an erratum the entry stops matching and is downgraded to manual
 * instead of running against text it no longer describes.
 */

import type { CardAbilities } from './dsl.ts';

/**
 * A book entry. `oracleHash` is NOT stored: the registry derives it from
 * `authoredAgainst`, so there is no hand-maintained magic constant to fall out
 * of step with the text beside it.
 */
export interface BookEntry extends Omit<CardAbilities, 'coverage' | 'oracleHash'> {
  /** Verbatim oracle text this entry was written against. */
  authoredAgainst: string;
}

/**
 * Keyed by Scryfall `oracle_id` where we have one, else the lower-cased card
 * name. The registry looks up both, name last, so adding oracle ids later is a
 * pure improvement rather than a migration.
 */
export const ABILITY_BOOK: Record<string, BookEntry> = {
  /* ---------------------------------------------------------------------- */
  /* Conditional statics — the compiler models no "as long as" clause        */
  /* ---------------------------------------------------------------------- */

  'serra ascendant': {
    oracleId: 'serra ascendant',
    name: 'Serra Ascendant',
    authoredAgainst:
      'Lifelink\nSerra Ascendant gets +5/+5 and has flying as long as you have 30 or more life.',
    source: 'book',
    abilities: [
      { kind: 'keyword', id: 'a0', text: 'Lifelink', confidence: 'exact', keyword: 'lifelink' },
      {
        kind: 'static',
        id: 'a1',
        text: '~ gets +5/+5 and has flying as long as you have 30 or more life.',
        confidence: 'exact',
        affects: { sel: 'self' },
        condition: { if: 'value', a: { v: 'life', of: { who: 'you' } }, cmp: 'gte', b: 30 },
        modifications: [
          { layer: 'pt-modify', power: 5, toughness: 5 },
          { layer: 'ability', grant: ['flying'] },
        ],
      },
    ],
    unparsed: [],
  },

  /* ---------------------------------------------------------------------- */
  /* Replacement effects — not something the compiler attempts               */
  /* ---------------------------------------------------------------------- */

  'doubling season': {
    oracleId: 'doubling season',
    name: 'Doubling Season',
    authoredAgainst:
      'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.',
    source: 'book',
    abilities: [
      {
        kind: 'replacement',
        id: 'a0',
        text: 'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.',
        confidence: 'exact',
        event: { on: 'token-created', whose: { who: 'you' } },
        result: { do: 'multiply', factor: 2 },
      },
      {
        kind: 'replacement',
        id: 'a1',
        text: 'If an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.',
        confidence: 'exact',
        event: {
          on: 'counter-placed',
          target: { sel: 'all', where: { is: 'any' }, controller: { who: 'you' } },
          counter: 'any',
        },
        result: { do: 'multiply', factor: 2 },
      },
    ],
    unparsed: [],
  },

  /* ---------------------------------------------------------------------- */
  /* A deliberately PARTIAL entry — the shape that keeps cards honest        */
  /* ---------------------------------------------------------------------- */

  'wrath of god': {
    oracleId: 'wrath of god',
    name: 'Wrath of God',
    authoredAgainst: "Destroy all creatures. They can't be regenerated.",
    source: 'book-partial',
    abilities: [
      {
        kind: 'spell',
        id: 'a0',
        text: 'Destroy all creatures.',
        confidence: 'exact',
        effects: [{ do: 'destroy', what: { sel: 'all', where: { is: 'type', value: 'creature' } } }],
      },
    ],
    // Regeneration is not modelled at all, so the clause is listed rather than
    // quietly assumed to be irrelevant. Coverage therefore reads 'partial'.
    unparsed: [
      { text: "They can't be regenerated.", reason: 'unmodelled', span: [23, 51] },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* A lord, to prove layer 6 and layer 7c compose                           */
  /* ---------------------------------------------------------------------- */

  'goblin king': {
    oracleId: 'goblin king',
    name: 'Goblin King',
    authoredAgainst:
      'Other Goblins get +1/+1 and have mountainwalk.',
    source: 'book',
    abilities: [
      {
        kind: 'static',
        id: 'a0',
        text: 'Other Goblins get +1/+1 and have mountainwalk.',
        confidence: 'exact',
        affects: {
          sel: 'all',
          where: { is: 'and', of: [{ is: 'subtype', value: 'goblin' }, { is: 'other' }] },
        },
        modifications: [
          { layer: 'pt-modify', power: 1, toughness: 1 },
          { layer: 'ability', grant: ['mountainwalk'] },
        ],
      },
    ],
    unparsed: [],
  },
};
