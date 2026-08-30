/**
 * Unit tests for the role tagger.
 *
 *   node --test --experimental-strip-types src/engine/knowledge/tagger.test.ts
 *
 * Oracle text below is copied verbatim from our own `cards` rows, including the
 * post-2024 templating ("When this creature enters", not "When CARDNAME enters
 * the battlefield") — testing against remembered wordings would validate a
 * tagger against a catalogue we do not have.
 *
 * Each case asserts both what MUST be present and what MUST NOT be. The
 * negative half is the point: the previous tagger's failure mode was over-
 * tagging, and a test that only checks for presence cannot catch that.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveCardTags, normalizeOracleText, assertPortablePatterns, TAG_RULES, ALL_TAGS } from './tagger.ts';

interface Case {
  name: string;
  type_line: string;
  oracle_text?: string;
  keywords?: string[];
  mana_cost?: string;
  cmc?: number;
  faces?: { name?: string; type_line?: string; oracle_text?: string }[];
  has: string[];
  hasNot?: string[];
}

const CASES: Case[] = [
  {
    name: 'Sol Ring',
    type_line: 'Artifact',
    oracle_text: '{T}: Add {C}{C}.',
    mana_cost: '{1}',
    cmc: 1,
    has: ['artifact', 'mana-rock', 'ramp', 'fast-mana'],
    hasNot: ['mana-dork', 'card-draw', 'creature'],
  },
  {
    name: 'Llanowar Elves',
    type_line: 'Creature — Elf Druid',
    oracle_text: '{T}: Add {G}.',
    mana_cost: '{G}',
    cmc: 1,
    has: ['creature', 'mana-dork', 'ramp'],
    // One mana in, one mana out is not fast mana.
    hasNot: ['mana-rock', 'fast-mana'],
  },
  {
    name: 'Arcane Signet',
    type_line: 'Artifact',
    oracle_text: '{T}: Add one mana of any color in your commander’s identity.',
    cmc: 2,
    has: ['mana-rock', 'ramp'],
    hasNot: ['fast-mana'],
  },
  {
    name: "Ashnod's Altar",
    type_line: 'Artifact',
    oracle_text: 'Sacrifice a creature: Add {C}{C}.',
    cmc: 3,
    has: ['sacrifice-outlet', 'sac-outlet', 'ramp'],
    // The mana ability's cost is a sacrifice, so this is an outlet, not a rock.
    hasNot: ['mana-rock'],
  },
  {
    // A fetchland sacrifices only itself. Tagging it a sacrifice outlet put
    // Flooded Strand, Scalding Tarn and Evolving Wilds at the top of Ashnod's
    // Altar's "works well with", where they are useless: an outlet is a
    // repeatable way to convert your OTHER permanents into value.
    name: 'Bloodstained Mire',
    type_line: 'Land',
    oracle_text:
      '{T}, Pay 1 life, Sacrifice Bloodstained Mire: Search your library for a Swamp or Mountain card, put it onto the battlefield, then shuffle.',
    cmc: 0,
    // Not `ramp` either: it fetches "a Swamp or Mountain card", and the ramp
    // rule wants the literal word "land". That is the existing rule's call, not
    // this one's.
    has: ['land'],
    hasNot: ['sacrifice-outlet', 'sac-outlet', 'sacrifice'],
  },
  {
    name: 'Nihil Spellbomb',
    type_line: 'Artifact',
    oracle_text:
      "{T}, Sacrifice this artifact: Exile target player's graveyard.\n{B}, Sacrifice this artifact: Draw a card.",
    cmc: 1,
    has: ['artifact', 'graveyard-hate'],
    hasNot: ['sacrifice-outlet', 'sac-outlet'],
  },
  {
    name: 'Basal Thrull',
    type_line: 'Creature — Thrull',
    oracle_text: '{T}, Sacrifice this creature: Add {B}{B}.',
    cmc: 4,
    has: ['creature'],
    hasNot: ['sacrifice-outlet', 'sac-outlet', 'mana-dork'],
  },
  {
    // Sacrifices itself AND others, so it is a real outlet even though the
    // object is not adjacent to the verb.
    name: "Emrakul's Evangel",
    type_line: 'Creature — Human Wizard',
    oracle_text:
      '{T}, Sacrifice this creature and any number of other non-Eldrazi creatures: Create a 3/2 colorless Eldrazi Horror creature token for each creature sacrificed this way.',
    cmc: 4,
    has: ['sacrifice-outlet', 'sac-outlet', 'token-maker'],
  },
  {
    name: 'Carrion Feeder',
    type_line: 'Creature — Zombie',
    oracle_text:
      "This creature can't block.\nSacrifice another creature: Put a +1/+1 counter on this creature.",
    cmc: 1,
    has: ['sacrifice-outlet', 'sac-outlet', 'counters'],
  },
  {
    name: 'Rhystic Study',
    type_line: 'Enchantment',
    oracle_text: 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.',
    cmc: 3,
    has: ['card-draw', 'draw', 'enchantment', 'stax'],
    hasNot: ['counterspell', 'group-hug'],
  },
  {
    name: 'Cyclonic Rift',
    type_line: 'Instant',
    oracle_text:
      "Return target nonland permanent you don't control to its owner's hand.\nOverload {6}{U} (You may cast this spell for its overload cost. If you do, change \"target\" in its text to \"each.\")",
    cmc: 2,
    has: ['board-wipe', 'bounce', 'removal', 'removal-sweeper', 'instant'],
  },
  {
    name: 'Blasphemous Act',
    type_line: 'Sorcery',
    oracle_text:
      'This spell costs {1} less to cast for each creature on the battlefield.\nBlasphemous Act deals 13 damage to each creature.',
    cmc: 9,
    has: ['board-wipe', 'removal', 'removal-sweeper'],
    // "This spell costs {1} less" discounts itself; it does not reduce anything else.
    hasNot: ['cost-reduction', 'targeted-removal'],
  },
  {
    name: 'Demonic Tutor',
    type_line: 'Sorcery',
    oracle_text: 'Search your library for a card, put that card into your hand, then shuffle.',
    cmc: 2,
    has: ['tutor', 'tutor-broad'],
    hasNot: ['tutor-narrow', 'ramp'],
  },
  {
    name: 'Cultivate',
    type_line: 'Sorcery',
    oracle_text:
      'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.',
    cmc: 3,
    has: ['ramp'],
    // A basic-land fetch is ramp, not tutoring.
    hasNot: ['tutor', 'tutor-broad', 'tutor-narrow'],
  },
  {
    name: 'Craterhoof Behemoth',
    type_line: 'Creature — Beast',
    oracle_text:
      'Haste\nWhen this creature enters, creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control.',
    keywords: ['Haste', 'Trample'],
    cmc: 8,
    has: ['creature', 'finisher', 'mass-pump', 'etb'],
    // It HAS haste; it does not GRANT haste. Granting is what haste-enabler means.
    hasNot: ['haste-enabler'],
  },
  {
    name: 'Swords to Plowshares',
    type_line: 'Instant',
    oracle_text: 'Exile target creature. Its controller gains life equal to its power.',
    cmc: 1,
    has: ['targeted-removal', 'removal', 'removal-spot'],
    // The OPPONENT gains the life. This is not a lifegain card.
    hasNot: ['lifegain'],
  },
  {
    name: 'Ephemerate',
    type_line: 'Instant',
    oracle_text:
      "Exile target creature you control, then return it to the battlefield under its owner's control.\nRebound",
    keywords: ['Rebound'],
    cmc: 1,
    has: ['blink'],
    // Exiling your own creature is a blink, not removal.
    hasNot: ['targeted-removal', 'removal', 'removal-spot'],
  },
  {
    name: 'Smothering Tithe',
    type_line: 'Enchantment',
    oracle_text:
      'Whenever an opponent draws a card, that player may pay {2}. If the player doesn’t, you create a Treasure token. (It’s an artifact with "{T}, Sacrifice this token: Add one mana of any color.")',
    cmc: 4,
    has: ['treasure', 'token-maker', 'ramp'],
    // The Treasure reminder text names a sacrifice-for-mana ability. Reminder
    // text is stripped, so it must not leak in as a role.
    hasNot: ['sacrifice-outlet', 'mana-rock', 'card-draw'],
  },
  {
    name: 'Basalt Monolith',
    type_line: 'Artifact',
    oracle_text:
      "This artifact doesn't untap during your untap step.\n{T}: Add {C}{C}{C}.\n{3}: Untap this artifact.",
    cmc: 3,
    has: ['mana-rock', 'ramp'],
    // Its own untap drawback is not a stax effect.
    hasNot: ['stax'],
  },
  {
    name: 'Reliquary Tower',
    type_line: 'Land',
    oracle_text: 'You have no maximum hand size.\n{T}: Add {C}.',
    cmc: 0,
    has: ['land'],
    // "No maximum hand size" is a benefit, the opposite of a stax tax.
    hasNot: ['stax', 'ramp', 'mana-rock'],
  },
  {
    name: 'Blood Artist',
    type_line: 'Creature — Vampire',
    oracle_text:
      'Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life.',
    cmc: 2,
    has: ['aristocrats', 'lifegain', 'creature'],
  },
  {
    name: 'Eternal Witness',
    type_line: 'Creature — Human Shaman',
    oracle_text: 'When this creature enters, return target card from your graveyard to your hand.',
    cmc: 3,
    has: ['graveyard-recursion', 'recursion', 'etb'],
  },
  {
    name: 'Forest',
    type_line: 'Basic Land — Forest',
    oracle_text: '({T}: Add {G}.)',
    cmc: 0,
    has: ['land', 'basic-land'],
    // The single most important negative in the suite: a basic land is not ramp.
    hasNot: ['ramp', 'mana-rock', 'mana-dork'],
  },
  {
    name: 'Ancient Tomb',
    type_line: 'Land',
    oracle_text: '{T}: Add {C}{C}. Ancient Tomb deals 2 damage to you.',
    cmc: 0,
    has: ['land', 'ramp'],
    hasNot: ['mana-rock'],
  },
  {
    name: 'Counterspell',
    type_line: 'Instant',
    oracle_text: 'Counter target spell.',
    cmc: 2,
    has: ['counterspell', 'instant'],
  },
  {
    name: 'Wrath of God',
    type_line: 'Sorcery',
    oracle_text: "Destroy all creatures. They can't be regenerated.",
    cmc: 4,
    has: ['board-wipe', 'removal', 'removal-sweeper'],
    hasNot: ['targeted-removal'],
  },
  {
    name: 'Time Warp',
    type_line: 'Sorcery',
    oracle_text: 'Target player takes an extra turn after this one.',
    cmc: 5,
    has: ['extra-turn'],
  },
  {
    name: 'Delver of Secrets // Insectile Aberration',
    type_line: 'Creature — Human Wizard',
    // A transform card: our row has null oracle_text and everything on `faces`.
    keywords: ['Transform', 'Flying'],
    cmc: 1,
    faces: [
      {
        name: 'Delver of Secrets',
        type_line: 'Creature — Human Wizard',
        oracle_text:
          'At the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform Delver of Secrets.',
      },
      { name: 'Insectile Aberration', type_line: 'Creature — Human Insect', oracle_text: 'Flying' },
    ],
    has: ['creature', 'evasion'],
  },
];

for (const c of CASES) {
  test(`tags ${c.name}`, () => {
    const tags = deriveCardTags(c);
    for (const want of c.has) {
      assert.ok(tags.includes(want), `${c.name}: expected tag "${want}", got [${tags.join(', ')}]`);
    }
    for (const nope of c.hasNot ?? []) {
      assert.ok(!tags.includes(nope), `${c.name}: unexpected tag "${nope}", got [${tags.join(', ')}]`);
    }
  });
}

test('patterns are portable to Postgres', () => {
  assertPortablePatterns();
});

test('normalisation strips reminder text and the card name', () => {
  const s = normalizeOracleText({
    name: 'Smothering Tithe',
    oracle_text: 'Smothering Tithe is here. (Reminder text with sacrifice a creature: add mana.)',
  });
  assert.ok(!s.includes('smothering tithe'), 'card name should be replaced');
  assert.ok(!s.includes('reminder text'), 'reminder text should be stripped');
});

test('output is sorted, unique and deterministic', () => {
  const card = { name: 'Sol Ring', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.', cmc: 1 };
  const a = deriveCardTags(card);
  const b = deriveCardTags(card);
  assert.deepEqual(a, b);
  assert.deepEqual(a, [...a].sort());
  assert.equal(new Set(a).size, a.length);
});

test('a card with no text at all yields no roles', () => {
  const tags = deriveCardTags({ name: 'Nothing', type_line: 'Artifact' });
  assert.deepEqual(tags, ['artifact']);
});

test('every rule declares a tag that appears in ALL_TAGS', () => {
  for (const rule of TAG_RULES) {
    assert.ok(ALL_TAGS.includes(rule.tag), `${rule.tag} missing from ALL_TAGS`);
  }
});

/**
 * Ramp is acceleration, and a fetch land does not accelerate.
 *
 * The land-search clause carried no land exclusion, which contradicted the
 * rule's own note. Evolving Wilds sacrifices itself to find a basic and puts it
 * in tapped: you spent your land drop and end the turn on the same mana. It
 * fixes colours.
 *
 * It reached the player, which is why this test exists rather than a comment.
 * `ArchetypeDetection` fires Ramp/Big Mana at twelve ramp cards, so an ordinary
 * Commander mana base cleared the floor by itself, and a white-black COUNTERS
 * deck was reported as "Ramp/Big Mana, PRIMARY, 100 past the floor" with
 * Evolving Wilds and Fabled Passage named as the evidence.
 *
 * Both directions are asserted. Dropping the tag is easy; dropping it from the
 * two lands that fetch TWO, and therefore net one after sacrificing themselves,
 * would be the same bug pointed the other way.
 */
const land = (name: string, oracle_text: string) => ({ name, type_line: 'Land', oracle_text });

test('a land that fetches one land is fixing, not ramp', () => {
  for (const card of [
    land('Evolving Wilds', '{T}, Sacrifice Evolving Wilds: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.'),
    land('Terramorphic Expanse', '{T}, Sacrifice Terramorphic Expanse: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.'),
    land('Bant Panorama', '{T}: Add {C}. {1}, {T}, Sacrifice Bant Panorama: Search your library for a basic Forest, Plains, or Island card, put it onto the battlefield tapped, then shuffle.'),
  ]) {
    assert.ok(!deriveCardTags(card).includes('ramp'), `${card.name} should not be ramp`);
  }
});

test('a land that fetches two lands nets one, so it is ramp', () => {
  for (const card of [
    land('Myriad Landscape', '{T}: Add {C}. {2}, {T}, Sacrifice Myriad Landscape: Search your library for up to two basic land cards that share a land type, put them onto the battlefield tapped, then shuffle.'),
    land('Blighted Woodland', '{T}: Add {C}. {3}{G}, {T}, Sacrifice Blighted Woodland: Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.'),
  ]) {
    assert.ok(deriveCardTags(card).includes('ramp'), `${card.name} should be ramp`);
  }
});

test('a spell that fetches a land is still ramp, and a land that makes two mana is too', () => {
  assert.ok(deriveCardTags({
    name: 'Rampant Growth',
    type_line: 'Sorcery',
    oracle_text: 'Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.',
  }).includes('ramp'));
  assert.ok(deriveCardTags(land('Ancient Tomb', '{T}: Add {C}{C}. Ancient Tomb deals 2 damage to you.')).includes('ramp'));
  assert.ok(!deriveCardTags({ name: 'Forest', type_line: 'Basic Land — Forest' }).includes('ramp'));
});

/**
 * An anthem is not a finisher.
 *
 * The rule used to accept any `creatures you control ... get +N/+N`, which is
 * Craterhoof Behemoth and is also Heraldic Banner. Measured against the
 * catalogue on 30 Aug 2026, 328 of the 715 ranked cards carrying `finisher`
 * were static anthems, and the deck page duly offered three mana rocks as win
 * conditions to a deck short of win conditions.
 *
 * The test is MAGNITUDE: variable, or two or more.
 */
test('a scaling pump is a finisher and a +1/+1 anthem is not', () => {
  const craterhoof = deriveCardTags({
    name: 'Craterhoof Behemoth',
    type_line: 'Creature — Beast',
    oracle_text:
      'Trample, haste\nWhen Craterhoof Behemoth enters, creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control.',
  });
  assert.ok(craterhoof.includes('finisher'), 'Craterhoof is a finisher');
  assert.ok(craterhoof.includes('wincon'));

  const banner = deriveCardTags({
    name: 'Heraldic Banner',
    type_line: 'Artifact',
    oracle_text:
      'As Heraldic Banner enters, choose a color.\nCreatures you control of the chosen color get +1/+0.\n{T}: Add one mana of the chosen color.',
  });
  assert.ok(!banner.includes('finisher'), 'a +1/+0 anthem is not a finisher');
  assert.ok(!banner.includes('wincon'));
  assert.ok(banner.includes('mass-pump'), 'it is still mass pump');
});

test('a fixed pump of two or more is still a finisher', () => {
  const overrun = deriveCardTags({
    name: 'Overrun',
    type_line: 'Sorcery',
    oracle_text: 'Creatures you control get +3/+3 and gain trample until end of turn.',
  });
  assert.ok(overrun.includes('finisher'), '+3/+3 is a finisher');

  const glorious = deriveCardTags({
    name: 'Glorious Anthem',
    type_line: 'Enchantment',
    oracle_text: 'Creatures you control get +1/+1.',
  });
  assert.ok(!glorious.includes('finisher'), '+1/+1 is an anthem');
  assert.ok(glorious.includes('mass-pump'));
});

test('an alternate win is a finisher whatever its pump says', () => {
  const labman = deriveCardTags({
    name: 'Laboratory Maniac',
    type_line: 'Creature — Human Wizard',
    oracle_text:
      'If you would draw a card while your library has no cards in it, you win the game instead.',
  });
  assert.ok(labman.includes('finisher'));
  assert.ok(labman.includes('wincon'));
});
