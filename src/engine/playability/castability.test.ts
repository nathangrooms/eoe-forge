/**
 * Tests for the castability engine.
 *
 *   node --test --experimental-strip-types src/engine/playability/castability.test.ts
 *
 * The runner is `node:test`, matching `src/lib/game/*.test.ts`. There is no
 * test runner in `package.json` and none in `node_modules` — the note at the
 * top of `scripts/synergy-selftest.mjs` records that adding one was previously
 * ruled out — so these use the runner the repo already runs.
 *
 * Two kinds of check here, and both matter:
 *
 *   1. **Hand-computed values.** Four hypergeometric figures worked out longhand
 *      below, with the arithmetic shown, so a regression in the combinatorics
 *      fails against numbers that were never produced by this code.
 *   2. **Brute-force joint reference.** `bruteForceJoint` enumerates every
 *      composition of the draw across the source categories in exact BigInt
 *      and applies the requirement directly. It shares no code with the DP, so
 *      it independently confirms that overlapping duals and Hall's condition
 *      are handled rather than approximated.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildManaProfile,
  cardPlayability,
  castability,
  chooseExact,
  createPlayabilityEngine,
  deckPlayability,
  hypergeometricAtLeast,
  manaSourceFor,
  parseManaCost,
  type PlayabilityCardInput,
} from './castability.ts';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const basic = (name: string, type: string, colour: string, symbol: string): PlayabilityCardInput => ({
  name,
  type_line: `Basic Land — ${type}`,
  mana_cost: '',
  cmc: 0,
  oracle_text: `({T}: Add {${symbol}}.)`,
  color_identity: [colour],
});

const MOUNTAIN = basic('Mountain', 'Mountain', 'R', 'R');
const ISLAND = basic('Island', 'Island', 'U', 'U');
const PLAINS = basic('Plains', 'Plains', 'W', 'W');
const SWAMP = basic('Swamp', 'Swamp', 'B', 'B');
const FOREST = basic('Forest', 'Forest', 'G', 'G');

const STEAM_VENTS: PlayabilityCardInput = {
  name: 'Steam Vents',
  type_line: 'Land — Island Mountain',
  mana_cost: '',
  cmc: 0,
  oracle_text: 'As Steam Vents enters, you may pay 2 life. If you don\'t, it enters tapped.',
  color_identity: ['U', 'R'],
};

const COMMAND_TOWER: PlayabilityCardInput = {
  name: 'Command Tower',
  type_line: 'Land',
  mana_cost: '',
  cmc: 0,
  oracle_text: '{T}: Add one mana of any color in your commander\'s color identity.',
  color_identity: [],
};

const spell = (name: string, cost: string, cmc: number, type = 'Instant'): PlayabilityCardInput => ({
  name,
  type_line: type,
  mana_cost: cost,
  cmc,
  oracle_text: '',
  color_identity: [],
});

const FILLER = (n: number, tag: string): PlayabilityCardInput[] =>
  Array.from({ length: n }, (_, i) => spell(`${tag} filler ${i}`, '{2}', 2, 'Sorcery'));

const repeat = (card: PlayabilityCardInput, n: number): PlayabilityCardInput[] =>
  Array.from({ length: n }, () => ({ ...card }));

/* ------------------------------------------------------------------ *
 * 1. The hypergeometric itself, against hand-computed values
 * ------------------------------------------------------------------ */

test('hypergeometric matches a hand-computed value: P(>=1 of 4 in 3 draws from 10)', () => {
  // Complement is easier. The only failing outcome is drawing 3 of the 6
  // non-successes:
  //
  //   C(6,3) = 20,  C(10,3) = 120
  //   P(0) = 20/120 = 1/6
  //   P(>=1) = 5/6 = 0.8333333...
  //
  // Exact, so this is checked as an exact rational too.
  const p = hypergeometricAtLeast(10, 4, 3, 1);
  assert.equal(chooseExact(6, 3), 20n);
  assert.equal(chooseExact(10, 3), 120n);
  assert.ok(Math.abs(p - 5 / 6) < 1e-12, `expected 5/6, got ${p}`);
});

test('hypergeometric matches a hand-computed value: P(>=1 land in 7 from 99 with 36)', () => {
  // C(63,7) = (63·62·61·60·59·58·57)/5040
  //         = 2,788,484,181,840 / 5040
  //         = 553,270,671
  //
  // C(99,7) = (99·98·97·96·95·94·93)/5040
  //         = 75,030,638,981,760 / 5040
  //         = 14,887,031,544
  //
  // P(0)    = 553,270,671 / 14,887,031,544 = 0.03716461...
  // P(>=1)  = 14,333,760,873 / 14,887,031,544 = 0.96283539...
  assert.equal(chooseExact(63, 7), 553270671n);
  assert.equal(chooseExact(99, 7), 14887031544n);

  const p = hypergeometricAtLeast(99, 36, 7, 1);
  assert.ok(Math.abs(p - 0.96283539) < 1e-7, `expected 0.96283539, got ${p}`);
});

test('hypergeometric matches a hand-computed value: P(>=2 of 36 in 8 from 99)', () => {
  // P(<=1) = [C(63,8) + 36·C(63,7)] / C(99,8)
  //
  //   C(63,8) = C(63,7) · 56/8 = 553,270,671 · 7    =  3,872,894,697
  //   36·C(63,7)                                    = 19,917,744,156
  //   numerator                                     = 23,790,638,853
  //   C(99,8) = C(99,7) · 92/8 = 14,887,031,544 · 11.5 = 171,200,862,756
  //
  // P(<=1) = 23,790,638,853 / 171,200,862,756 = 0.13896329...
  // P(>=2) = 0.86103671...
  assert.equal(chooseExact(63, 8), 3872894697n);
  assert.equal(chooseExact(99, 8), 171200862756n);

  const p = hypergeometricAtLeast(99, 36, 8, 2);
  assert.ok(Math.abs(p - 0.86103671) < 1e-7, `expected 0.86103671, got ${p}`);
});

test('hypergeometric matches a hand-computed value: P(>=2 of 7 in 8 from 99)', () => {
  // The thin-blue five-colour case, worked out the same way.
  //
  //   C(92,7) = (92·91·90·89·88·87·86)/5040 = 44,153,192,603,520/5040
  //           = 8,760,554,088
  //   C(92,8) = C(92,7) · 85/8 = 8,760,554,088 · 10.625 = 93,080,887,185
  //   7·C(92,7)                                        = 61,323,878,616
  //   numerator                                        = 154,404,765,801
  //
  // P(<=1) = 154,404,765,801 / 171,200,862,756 = 0.90189253...
  // P(>=2) = 0.09810747...
  assert.equal(chooseExact(92, 7), 8760554088n);
  assert.equal(chooseExact(92, 8), 93080887185n);

  const p = hypergeometricAtLeast(99, 7, 8, 2);
  assert.ok(Math.abs(p - 0.09810747) < 1e-7, `expected 0.09810747, got ${p}`);
});

/* ------------------------------------------------------------------ *
 * 2. Mono-red: Lightning Bolt is near-certain, a six-drop is not
 * ------------------------------------------------------------------ */

const MONO_RED: PlayabilityCardInput[] = [
  ...repeat(MOUNTAIN, 36),
  spell('Lightning Bolt', '{R}', 1),
  spell('Inferno Titan', '{4}{R}{R}', 6, 'Creature — Elemental'),
  ...FILLER(61, 'red'),
];

test('mono-red with 36 Mountains: Lightning Bolt is near-certain on turn 1', () => {
  const profile = buildManaProfile(MONO_RED);
  assert.equal(profile.librarySize, 99);
  assert.equal(profile.landCount, 36);
  assert.equal(profile.sourcesByColour.R, 36);

  const bolt = cardPlayability(MONO_RED[36], profile);
  assert.equal(bolt.turn, 1);
  assert.equal(bolt.manaRequired, 1);

  // One mana, one red pip, and every source is red, so the requirement is
  // exactly "at least one Mountain in the opening seven" — the hand-computed
  // 0.96283539 above.
  assert.ok(Math.abs(bolt.pct! - 96.283539) < 1e-5, `got ${bolt.pct}`);
  assert.ok(bolt.pct! > 96);
});

test('mono-red: a {4}{R}{R} card is materially lower than Lightning Bolt', () => {
  const profile = buildManaProfile(MONO_RED);
  const titan = cardPlayability(MONO_RED[37], profile);

  assert.equal(titan.turn, 6);
  assert.equal(titan.manaRequired, 6);

  // Turn 6 on the play sees 12 cards. Every source is red, so needing two red
  // is implied by needing six sources: the requirement collapses to
  // P(>=6 Mountains in 12 from 99 with 36).
  const reference = hypergeometricAtLeast(99, 36, 12, 6);
  assert.ok(Math.abs(titan.pct! / 100 - reference) < 1e-9, `got ${titan.pct}, ref ${reference * 100}`);

  const bolt = cardPlayability(MONO_RED[36], profile);
  assert.ok(titan.pct! < bolt.pct! - 40, `expected a wide gap, got ${bolt.pct} vs ${titan.pct}`);
});

/* ------------------------------------------------------------------ *
 * 3. {U}{U} is far worse on a five-colour mana base than on a mono-blue one
 * ------------------------------------------------------------------ */

const COUNTERSPELL = spell('Counterspell', '{U}{U}', 2);

const MONO_BLUE: PlayabilityCardInput[] = [...repeat(ISLAND, 36), COUNTERSPELL, ...FILLER(62, 'blue')];

// Same land count, split five ways with no fixing at all. This is the "bad
// mana" case: the deck can technically produce blue but almost never twice by
// turn two.
const FIVE_COLOUR: PlayabilityCardInput[] = [
  ...repeat(PLAINS, 7),
  ...repeat(ISLAND, 7),
  ...repeat(SWAMP, 7),
  ...repeat(MOUNTAIN, 7),
  ...repeat(FOREST, 7),
  COUNTERSPELL,
  ...FILLER(63, 'five'),
];

test('{U}{U} scores far worse on a bad five-colour base than in mono-blue', () => {
  const mono = buildManaProfile(MONO_BLUE);
  const five = buildManaProfile(FIVE_COLOUR);
  assert.equal(mono.librarySize, 99);
  assert.equal(five.librarySize, 99);
  assert.equal(mono.sourcesByColour.U, 36);
  assert.equal(five.sourcesByColour.U, 7);

  const monoResult = cardPlayability(COUNTERSPELL, mono);
  const fiveResult = cardPlayability(COUNTERSPELL, five);

  // Mono-blue: every source is blue, so "two mana, both blue" is exactly
  // P(>=2 Islands in 8) — the hand-computed 0.86103671.
  assert.ok(Math.abs(monoResult.pct! - 86.103671) < 1e-5, `got ${monoResult.pct}`);

  // Five-colour: two blue sources implies two sources, so it collapses to
  // P(>=2 of 7 in 8) — the hand-computed 0.09810747. Note the deck has ONE
  // fewer land, and it barely matters; what matters is the colour split.
  assert.ok(Math.abs(fiveResult.pct! - 9.810747) < 1e-5, `got ${fiveResult.pct}`);

  assert.ok(fiveResult.pct! < monoResult.pct! - 30, 'expected a visible gap');
});

/* ------------------------------------------------------------------ *
 * 4. Lands return null, not 0 and not 100
 * ------------------------------------------------------------------ */

test('a land has no castability at all', () => {
  const profile = buildManaProfile(MONO_RED);

  for (const land of [MOUNTAIN, STEAM_VENTS, COMMAND_TOWER]) {
    const result = cardPlayability(land, profile);
    assert.equal(result.pct, null, `${land.name} should be null`);
    assert.equal(result.turn, null);
    assert.equal(result.skipped, 'land');
    assert.notEqual(result.pct, 0);
    assert.notEqual(result.pct, 100);
  }
});

test('a land is skipped from the deck roll-up rather than dragging it down', () => {
  const summary = deckPlayability(MONO_RED);
  assert.equal(summary.skippedCount, 36);
  assert.equal(summary.scoredCount, 63);
  assert.ok(summary.averagePct !== null && summary.averagePct > 0);
});

/* ------------------------------------------------------------------ *
 * 5. Brute-force reference for the joint distribution
 * ------------------------------------------------------------------ */

/**
 * Exact P(requirement met), by direct enumeration in BigInt.
 *
 * `categories` is a list of [size, colourMask] for every live mana source
 * class, plus the implied remainder of non-sources. Shares nothing with the
 * DP: it enumerates compositions and applies the predicate literally, so it is
 * a genuine independent check on the overlap and Hall handling.
 */
function bruteForceJoint(
  librarySize: number,
  draws: number,
  categories: Array<[number, number]>,
  manaRequired: number,
  pips: Array<[number, number]> // [mask, count]
): number {
  const sizes = categories.map(c => c[0]);
  const masks = categories.map(c => c[1]);
  const remainder = librarySize - sizes.reduce((a, b) => a + b, 0);

  // Hall's condition over every non-empty subset of pip classes.
  const hallOK = (counts: number[]): boolean => {
    for (let sub = 1; sub < 1 << pips.length; sub++) {
      let union = 0;
      let demand = 0;
      for (let i = 0; i < pips.length; i++) {
        if (sub & (1 << i)) {
          union |= pips[i][0];
          demand += pips[i][1];
        }
      }
      let have = 0;
      for (let c = 0; c < counts.length; c++) {
        if ((masks[c] & union) !== 0) have += counts[c];
      }
      if (have < demand) return false;
    }
    return true;
  };

  let numerator = 0n;
  const counts = new Array(sizes.length).fill(0);

  const recurse = (index: number, used: number, weight: bigint) => {
    if (index === sizes.length) {
      const rest = draws - used;
      if (rest < 0 || rest > remainder) return;
      const sources = counts.reduce((a, b) => a + b, 0);
      if (sources < manaRequired) return;
      if (!hallOK(counts)) return;
      numerator += weight * chooseExact(remainder, rest);
      return;
    }
    const maxX = Math.min(sizes[index], draws - used);
    for (let x = 0; x <= maxX; x++) {
      counts[index] = x;
      recurse(index + 1, used + x, weight * chooseExact(sizes[index], x));
    }
    counts[index] = 0;
  };

  recurse(0, 0, 1n);

  const SCALE = 10n ** 20n;
  return Number((numerator * SCALE) / chooseExact(librarySize, draws)) / 1e20;
}

test('joint over overlapping duals matches brute force exactly', () => {
  // Steam Vents is a blue source AND a red source AND a unit of total mana at
  // the same time. Plains are live sources that pay neither pip. Multiplying
  // marginals cannot get this right; enumeration and the DP must agree.
  const deck: PlayabilityCardInput[] = [
    ...repeat(ISLAND, 4),
    ...repeat(MOUNTAIN, 4),
    ...repeat(STEAM_VENTS, 3),
    ...repeat(PLAINS, 5),
    spell('Izzet Charm', '{U}{R}', 2),
    ...FILLER(21, 'izzet'),
  ];

  const profile = buildManaProfile(deck);
  assert.equal(profile.librarySize, 38);
  assert.equal(profile.sourcesByColour.U, 7); // 4 Islands + 3 Steam Vents
  assert.equal(profile.sourcesByColour.R, 7); // 4 Mountains + 3 Steam Vents

  const cost = parseManaCost('{U}{R}')!;
  const engine = castability(profile, cost, 2);
  assert.equal(engine.approximate, false);

  // U = bit 2, R = bit 8.
  const reference = bruteForceJoint(
    38,
    8, // turn 2 on the play: 7 + 1
    [
      [4, 2],  // Islands -> U
      [4, 8],  // Mountains -> R
      [3, 10], // Steam Vents -> U and R
      [5, 0],  // Plains: a live source, but pays neither pip
    ],
    2,
    [
      [2, 1], // one U
      [8, 1], // one R
    ]
  );

  assert.ok(
    Math.abs(engine.probability - reference) < 1e-10,
    `DP ${engine.probability} vs brute force ${reference}`
  );

  // And it is genuinely different from the naive product of marginals, so the
  // test would not pass by accident if the joint were faked.
  const naive =
    hypergeometricAtLeast(38, 16, 8, 2) *
    hypergeometricAtLeast(38, 7, 8, 1) *
    hypergeometricAtLeast(38, 7, 8, 1);
  assert.ok(
    Math.abs(naive - reference) > 1e-3,
    `the marginal product should be visibly wrong here, got ${naive} vs ${reference}`
  );
});

test('three-colour joint matches brute force exactly', () => {
  const deck: PlayabilityCardInput[] = [
    ...repeat(PLAINS, 4),
    ...repeat(ISLAND, 4),
    ...repeat(SWAMP, 4),
    ...repeat(COMMAND_TOWER, 3),
    ...repeat(MOUNTAIN, 3),
    spell('Esper Charm', '{W}{U}{B}', 3),
    ...FILLER(21, 'esper'),
  ];

  const profile = buildManaProfile(deck);
  assert.equal(profile.librarySize, 40);

  const cost = parseManaCost('{W}{U}{B}')!;
  const result = castability(profile, cost, 3);
  assert.equal(result.approximate, false, 'a three-colour cost must stay exact');

  // Command Tower reads "any color", so it is a W, U and B source at once.
  // Mountains are live but pay none of the three pips.
  const reference = bruteForceJoint(
    40,
    9, // turn 3 on the play
    [
      [4, 1], // Plains -> W
      [4, 2], // Islands -> U
      [4, 4], // Swamps -> B
      [3, 7], // Command Tower -> W, U and B
      [3, 0], // Mountains: live, pays nothing relevant
    ],
    3,
    [
      [1, 1],
      [2, 1],
      [4, 1],
    ]
  );

  assert.ok(
    Math.abs(result.probability - reference) < 1e-10,
    `DP ${result.probability} vs brute force ${reference}`
  );
});

test('four-colour joint matches brute force, and stays exact', () => {
  // The case the module header claims does NOT need the approximation. If the
  // monotone collapse in the DP ever breaks, this both drifts from the brute
  // force and flips `approximate`.
  const deck: PlayabilityCardInput[] = [
    ...repeat(PLAINS, 3),
    ...repeat(ISLAND, 3),
    ...repeat(SWAMP, 3),
    ...repeat(FOREST, 3),
    ...repeat(COMMAND_TOWER, 2),
    ...repeat(MOUNTAIN, 2),
    spell('Atraxa, Praetors\' Voice', '{3}{W}{U}{B}{G}', 7, 'Legendary Creature — Phyrexian Angel'),
    ...FILLER(19, 'atraxa'),
  ];

  const profile = buildManaProfile(deck);
  assert.equal(profile.librarySize, 36);

  const cost = parseManaCost('{W}{U}{B}{G}')!;
  const result = castability(profile, cost, 4);
  assert.equal(result.approximate, false, 'a four-colour cost must stay exact');

  const reference = bruteForceJoint(
    36,
    10, // turn 4 on the play
    [
      [3, 1],  // Plains -> W
      [3, 2],  // Islands -> U
      [3, 4],  // Swamps -> B
      [3, 16], // Forests -> G
      [2, 23], // Command Tower -> W, U, B and G (any colour)
      [2, 0],  // Mountains: live, pays none of the four pips
    ],
    4,
    [
      [1, 1],
      [2, 1],
      [4, 1],
      [16, 1],
    ]
  );

  assert.ok(
    Math.abs(result.probability - reference) < 1e-10,
    `DP ${result.probability} vs brute force ${reference}`
  );
});

test("Hall's condition bites: {U}{U} is not satisfied by one dual", () => {
  // Two blue pips need two blue SOURCES. A deck whose only blue source is a
  // single Steam Vents can never cast Counterspell, however many Plains it
  // draws — a per-colour "do I have blue?" check would wrongly say yes.
  const deck: PlayabilityCardInput[] = [
    ...repeat(STEAM_VENTS, 1),
    ...repeat(PLAINS, 30),
    COUNTERSPELL,
    ...FILLER(28, 'hall'),
  ];
  const profile = buildManaProfile(deck);
  assert.equal(profile.sourcesByColour.U, 1);

  const result = cardPlayability(COUNTERSPELL, profile);
  assert.equal(result.pct, 0);
});

/* ------------------------------------------------------------------ *
 * 6. Cost parsing: hybrid, Phyrexian, X, colourless
 * ------------------------------------------------------------------ */

test('multi-colour pips demand one source each', () => {
  const cost = parseManaCost('{1}{U}{U}')!;
  assert.equal(cost.manaRequired, 3);
  assert.deepEqual(cost.classes, [{ mask: 2, count: 2 }]);
});

test('hybrid is one class over two colours, not two requirements', () => {
  const cost = parseManaCost('{W/U}{W/U}')!;
  assert.equal(cost.manaRequired, 2);
  assert.deepEqual(cost.classes, [{ mask: 3, count: 2 }]); // W|U
});

test('Phyrexian pips cost no mana and demand no colour', () => {
  // Surgical Extraction is castable on turn one off no lands, for four life.
  const cost = parseManaCost('{B/P}')!;
  assert.equal(cost.manaRequired, 0);
  assert.equal(cost.phyrexianCount, 1);
  assert.deepEqual(cost.classes, []);

  const profile = buildManaProfile(MONO_RED);
  const result = cardPlayability(spell('Surgical Extraction', '{B/P}', 1), profile);
  assert.equal(result.pct, 100);
  assert.equal(result.turn, 1);
});

test('monocoloured hybrid takes the colour when the deck has it, generic when it does not', () => {
  const withRed = parseManaCost('{2/R}', { availableColours: 8 })!;
  assert.equal(withRed.manaRequired, 1);
  assert.deepEqual(withRed.classes, [{ mask: 8, count: 1 }]);

  const withoutRed = parseManaCost('{2/R}', { availableColours: 2 })!;
  assert.equal(withoutRed.manaRequired, 2);
  assert.deepEqual(withoutRed.classes, []);
});

test('X defaults to 1, and the choice is overridable', () => {
  const fireball = parseManaCost('{X}{R}')!;
  assert.equal(fireball.hasX, true);
  assert.equal(fireball.manaRequired, 2); // X = 1 by default

  const strict = parseManaCost('{X}{R}', { xValue: 0 })!;
  assert.equal(strict.manaRequired, 1);

  const profile = buildManaProfile(MONO_RED);
  assert.equal(cardPlayability(spell('Fireball', '{X}{R}', 1, 'Sorcery'), profile).turn, 2);
});

/* ------------------------------------------------------------------ *
 * 7. Rocks and dorks
 * ------------------------------------------------------------------ */

const SOL_RING: PlayabilityCardInput = {
  name: 'Sol Ring',
  type_line: 'Artifact',
  mana_cost: '{1}',
  cmc: 1,
  oracle_text: '{T}: Add {C}{C}.',
  color_identity: [],
};

const ARCANE_SIGNET: PlayabilityCardInput = {
  name: 'Arcane Signet',
  type_line: 'Artifact',
  mana_cost: '{2}',
  cmc: 2,
  oracle_text: "{T}: Add one mana of any color in your commander's color identity.",
  color_identity: [],
};

const LLANOWAR_ELVES: PlayabilityCardInput = {
  name: 'Llanowar Elves',
  type_line: 'Creature — Elf Druid',
  mana_cost: '{G}',
  cmc: 1,
  oracle_text: '{T}: Add {G}.',
  color_identity: ['G'],
};

test('rocks and dorks are sources, and a dork is the slower of the two', () => {
  const deck: PlayabilityCardInput[] = [
    ...repeat(FOREST, 30),
    SOL_RING,
    ARCANE_SIGNET,
    LLANOWAR_ELVES,
    ...FILLER(66, 'ramp'),
  ];
  const profile = buildManaProfile(deck);
  assert.equal(profile.rockCount, 2);
  assert.equal(profile.dorkCount, 1);

  const byName = (name: string) => profile.sources.find(s => s.name === name)!;

  // Sol Ring costs one and taps for two, so it pays for itself the turn it
  // lands: online turn 1.
  assert.equal(byName('Sol Ring').onlineTurn, 1);

  // Arcane Signet costs two and taps for one. Cast on turn 2 with both lands,
  // it first supplies spare mana on turn 3.
  assert.equal(byName('Arcane Signet').onlineTurn, 3);

  // Llanowar Elves costs one, but is summoning-sick, so it cannot tap until
  // turn 2 — one turn behind a rock of the same cost.
  assert.equal(byName('Llanowar Elves').onlineTurn, 2);
  assert.equal(byName('Llanowar Elves').kind, 'dork');

  // Colour identity follows: the Elves is a green source, the Signet reads
  // "any color".
  assert.equal(byName('Llanowar Elves').colourMask & 16, 16);
  assert.equal(byName('Arcane Signet').colourMask, 31);
  assert.equal(byName('Sol Ring').colourMask, 0); // colourless, but real mana
});

test('a dork is not counted before it can tap', () => {
  const profile = buildManaProfile([
    ...repeat(FOREST, 20),
    ...repeat(LLANOWAR_ELVES, 8),
    ...FILLER(71, 'dork'),
  ]);
  assert.equal(profile.sources.filter(s => s.onlineTurn <= 1).length, 20);
  assert.equal(profile.sources.filter(s => s.onlineTurn <= 2).length, 28);
});

test('rituals are not mana sources', () => {
  const profile = buildManaProfile([
    ...repeat(SWAMP, 30),
    spell('Dark Ritual', '{B}', 1, 'Instant'),
    ...FILLER(68, 'ritual'),
  ]);
  // 30 Swamps and nothing else. A ritual is one-shot and costs a card.
  assert.equal(profile.sources.length, 30);
});

/* ------------------------------------------------------------------ *
 * 8. Commander
 * ------------------------------------------------------------------ */

test('the commander is castable from the command zone and is not in the library', () => {
  const commander: PlayabilityCardInput = {
    name: 'Krenko, Mob Boss',
    type_line: 'Legendary Creature — Goblin Warrior',
    mana_cost: '{2}{R}{R}',
    cmc: 4,
    oracle_text: '',
    color_identity: ['R'],
    isCommander: true,
  };

  const deck = [commander, ...repeat(MOUNTAIN, 36), ...FILLER(63, 'krenko')];
  const profile = buildManaProfile(deck);

  // 100 physical cards, 99 of them drawable.
  assert.equal(profile.librarySize, 99);

  const result = cardPlayability(commander, profile);
  assert.equal(result.isCommander, true);
  assert.equal(result.turn, 4);

  // Every source is red, so needing two red is implied by needing four mana:
  // P(>=4 Mountains in 10 from 99 with 36).
  const reference = hypergeometricAtLeast(99, 36, 10, 4);
  assert.ok(Math.abs(result.pct! / 100 - reference) < 1e-9, `got ${result.pct}`);
});

test('a commander that produces mana is not counted as a drawable source', () => {
  const dorkCommander: PlayabilityCardInput = {
    ...LLANOWAR_ELVES,
    name: 'Marwyn, the Nurturer',
    type_line: 'Legendary Creature — Elf Druid',
    isCommander: true,
  };
  const profile = buildManaProfile([dorkCommander, ...repeat(FOREST, 30), ...FILLER(69, 'marwyn')]);
  assert.equal(profile.dorkCount, 1);
  assert.equal(profile.sources.filter(s => s.name === 'Marwyn, the Nurturer').length, 0);
});

/* ------------------------------------------------------------------ *
 * 9. Roll-up and memoisation
 * ------------------------------------------------------------------ */

test('the deck roll-up reports an average, a median and a below-threshold count', () => {
  const summary = deckPlayability(MONO_RED, { threshold: 50 });

  assert.equal(summary.threshold, 50);
  assert.equal(summary.scoredCount + summary.skippedCount, 99);
  assert.ok(summary.averagePct !== null);
  assert.ok(summary.medianPct !== null);
  assert.equal(summary.anyApproximate, false);

  // The average is the mean of the column beside it, by construction.
  const scored = summary.cards.filter(c => c.pct !== null);
  const mean = scored.reduce((s, c) => s + c.pct!, 0) / scored.length;
  assert.ok(Math.abs(mean - summary.averagePct!) < 1e-9);

  // The one six-drop is under 50%; the two-mana filler and the Bolt are not.
  assert.equal(summary.belowThresholdCount, 1);
});

test('the engine memoises on cost, so a hundred cards do not mean a hundred solves', () => {
  const engine = createPlayabilityEngine(MONO_RED);
  const first = engine.card(MONO_RED[36]);
  const second = engine.card({ ...MONO_RED[36], name: 'Another Bolt' });

  assert.equal(first.pct, second.pct);
  assert.equal(second.name, 'Another Bolt');

  const started = Date.now();
  const summary = engine.deck();
  const elapsed = Date.now() - started;

  assert.equal(summary.cards.length, 99);
  assert.ok(elapsed < 1000, `a 99-card roll-up took ${elapsed}ms`);
});

test('a realistic three-colour deck stays exact and finishes promptly', () => {
  const deck: PlayabilityCardInput[] = [
    ...repeat(PLAINS, 8),
    ...repeat(ISLAND, 8),
    ...repeat(SWAMP, 8),
    ...repeat(COMMAND_TOWER, 5),
    ...repeat(STEAM_VENTS, 3),
    SOL_RING,
    ARCANE_SIGNET,
    spell('Esper Charm', '{W}{U}{B}', 3),
    spell('Sphinx of the Steel Wind', '{5}{W}{U}{B}', 8, 'Creature — Sphinx'),
    ...FILLER(64, 'esper'),
  ];

  const started = Date.now();
  const summary = deckPlayability(deck);
  const elapsed = Date.now() - started;

  assert.equal(summary.anyApproximate, false);
  assert.ok(elapsed < 3000, `three-colour deck took ${elapsed}ms`);

  const charm = summary.cards.find(c => c.name === 'Esper Charm')!;
  const sphinx = summary.cards.find(c => c.name === 'Sphinx of the Steel Wind')!;
  assert.ok(charm.pct! > 0 && charm.pct! < 100);
  assert.ok(sphinx.pct! < charm.pct!, 'an eight-drop cannot beat a three-drop');
});

test('a five-colour cost on a full five-colour base is still exact, and still fast', () => {
  // Progenitus is the worst cost in Magic for this engine: ten pips across all
  // five colours. The module header claims it solves exactly rather than
  // falling back, so that claim gets a test rather than a comment.
  const dual = (name: string, subtypes: string, ci: string[]): PlayabilityCardInput => ({
    name,
    type_line: `Land — ${subtypes}`,
    mana_cost: '',
    cmc: 0,
    oracle_text: '',
    color_identity: ci,
  });

  const deck: PlayabilityCardInput[] = [
    ...repeat(PLAINS, 4),
    ...repeat(ISLAND, 4),
    ...repeat(SWAMP, 4),
    ...repeat(MOUNTAIN, 4),
    ...repeat(FOREST, 4),
    ...repeat(COMMAND_TOWER, 5),
    ...repeat(dual('Hallowed Fountain', 'Plains Island', ['W', 'U']), 2),
    ...repeat(STEAM_VENTS, 2),
    ...repeat(dual('Overgrown Tomb', 'Swamp Forest', ['B', 'G']), 2),
    ...repeat(dual('Zagoth Triome', 'Swamp Forest Island', ['B', 'G', 'U']), 2),
    spell('Progenitus', '{W}{W}{U}{U}{B}{B}{R}{R}{G}{G}', 10, 'Legendary Creature — Hydra Avatar'),
    ...FILLER(64, 'wubrg'),
  ];

  const profile = buildManaProfile(deck);
  const cost = parseManaCost('{W}{W}{U}{U}{B}{B}{R}{R}{G}{G}')!;

  const started = Date.now();
  const result = castability(profile, cost, 10);
  const elapsed = Date.now() - started;

  assert.equal(result.approximate, false, 'Progenitus must not need the fallback');
  assert.ok(result.probability > 0 && result.probability < 1);
  assert.ok(elapsed < 2000, `Progenitus took ${elapsed}ms`);
});

/* ------------------------------------------------------------------ *
 * A fetchland cannot find a basic the deck does not play
 * ------------------------------------------------------------------ */

/*
 * The untyped case ("search your library for a basic land card") was already
 * intersected with the deck's colours. The TYPED case was not, so a fetchland
 * that names its basic types was credited with those colours in every deck.
 *
 * Found by reading a generated Talrand list: mono blue, and the mana base held
 * Windswept Heath, which taps for nothing and finds nothing there. It sorted
 * ahead of real lands because `pickLands` asks this function which of the
 * deck's colours a land makes and got "white and green".
 */

const WINDSWEPT_HEATH: PlayabilityCardInput = {
  name: 'Windswept Heath',
  type_line: 'Land',
  mana_cost: '',
  cmc: 0,
  oracle_text:
    '{T}, Pay 1 life, Sacrifice Windswept Heath: Search your library for a Forest or Plains card, put it onto the battlefield, then shuffle.',
  color_identity: [],
};

const POLLUTED_DELTA: PlayabilityCardInput = {
  name: 'Polluted Delta',
  type_line: 'Land',
  mana_cost: '',
  cmc: 0,
  oracle_text:
    '{T}, Pay 1 life, Sacrifice Polluted Delta: Search your library for an Island or Swamp card, put it onto the battlefield, then shuffle.',
  color_identity: [],
};

const EVOLVING_WILDS: PlayabilityCardInput = {
  name: 'Evolving Wilds',
  type_line: 'Land',
  mana_cost: '',
  cmc: 0,
  oracle_text:
    '{T}, Sacrifice Evolving Wilds: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.',
  color_identity: [],
};

const maskOf = (...colours: string[]) =>
  colours.reduce((m, c) => m | { W: 1, U: 2, B: 4, R: 8, G: 16 }[c]!, 0);

test('a typed fetchland with nothing to find is not a source of the colours it names', () => {
  const source = manaSourceFor(WINDSWEPT_HEATH, maskOf('U'));
  // Still a land, so still a land drop. It just makes no coloured mana.
  assert.equal(source?.kind, 'land');
  assert.equal(source?.colourMask, 0, 'Windswept Heath makes no blue and there is nothing else');
});

test('a typed fetchland keeps only the half the deck can actually find', () => {
  const source = manaSourceFor(POLLUTED_DELTA, maskOf('W', 'B'));
  assert.equal(source?.colourMask, maskOf('B'), 'Orzhov fetches a Swamp, never an Island');
});

test('a typed fetchland in its own colours is unchanged', () => {
  const source = manaSourceFor(POLLUTED_DELTA, maskOf('U', 'B'));
  assert.equal(source?.colourMask, maskOf('U', 'B'));
});

test('an untyped fetchland still reads the deck it is in', () => {
  assert.equal(manaSourceFor(EVOLVING_WILDS, maskOf('R'))?.colourMask, maskOf('R'));
  assert.equal(
    manaSourceFor(EVOLVING_WILDS, maskOf('W', 'U', 'B'))?.colourMask,
    maskOf('W', 'U', 'B')
  );
});

test('the mana profile stops counting sources of colours the deck does not play', () => {
  const deck = [
    ...repeat(ISLAND, 20),
    ...repeat(WINDSWEPT_HEATH, 10),
    ...FILLER(69, 'mono-u'),
  ];
  const profile = buildManaProfile(deck);
  assert.equal(profile.sourcesByColour.W, 0, 'there is no Plains in this deck');
  assert.equal(profile.sourcesByColour.G, 0, 'there is no Forest in this deck');
  assert.equal(profile.sourcesByColour.U, 20);
  // The land count is unchanged: a blank fetchland is still a land drop.
  assert.equal(profile.landCount, 30);
});
