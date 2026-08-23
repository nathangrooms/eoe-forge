/**
 * The behaviour layer, tested on the cards it was written to get right.
 *
 *   node --test --experimental-strip-types src/engine/knowledge/behaviour.test.ts
 *
 * Every facet list below was PRINTED BY THE PRODUCER, not written from memory:
 * `scratch/probe-wincon.mjs` and `scratch/probe-two.mjs` ran
 * `src/lib/deck/recommend/behaviour.ts` over the 2026-08-19 catalogue snapshot
 * on 2026-08-23 and the output was pasted in. The engine cannot import that
 * producer — `engine-parity.test.ts` forbids it — so this suite pins the
 * CONTRACT between the two: given these facets, the engine must reach these
 * conclusions. If the producer's output shape ever changes, these lists are the
 * record of what it used to say.
 *
 * The named cards are not examples. Each one is a bug that shipped.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  cardServesRole,
  planForCommander,
  planFit,
  hasRecord,
  facetCoverage,
  behaviourSimilarity,
  describeSharedFacets,
} from './behaviour.ts';
import {
  servesRole,
  cardRole,
  CREATURE_TARGETS,
  creatureTargetFor,
  roleTargetsFor,
} from '../advise/roles.ts';
import { ROLES } from '../core/types.ts';

/* Facet lists as the producer printed them, 2026-08-23. */
const CARDS = {
  solRing: {
    name: 'Sol Ring',
    typeLine: 'Artifact',
    tags: ['artifact', 'fast-mana', 'mana-rock', 'ramp'],
    facets: ['eff:add-mana', 'mana:2', 'rec:full', 'type:artifact'],
  },
  boneSaw: {
    name: 'Bone Saw',
    typeLine: 'Artifact — Equipment',
    tags: ['artifact', 'equipment', 'voltron'],
    facets: ['cares:type:creature', 'eff:attach', 'eff:pump', 'sub:equipment', 'type:artifact', 'rec:full'],
  },
  adventuringGear: {
    name: 'Adventuring Gear',
    typeLine: 'Artifact — Equipment',
    tags: ['artifact', 'equipment', 'landfall', 'lands-matter', 'voltron'],
    facets: [
      'cares:type:creature',
      'cares:type:land',
      'eff:attach',
      'eff:pump',
      'rec:full',
      'scope:all',
      'sub:equipment',
      'trig:enters',
      'type:artifact',
    ],
  },
  craterhoof: {
    name: 'Craterhoof Behemoth',
    typeLine: 'Creature — Beast',
    tags: ['creature', 'etb', 'finisher', 'mass-pump', 'wincon'],
    facets: ['kw:haste', 'rec:partial', 'sub:beast', 'trig:enters', 'type:creature'],
  },
  blightedAgent: {
    name: 'Blighted Agent',
    typeLine: 'Creature — Phyrexian Human Rogue',
    tags: ['creature', 'evasion', 'infect'],
    facets: ['eff:poison', 'kw:infect', 'rec:full', 'sub:human', 'sub:phyrexian', 'sub:rogue', 'type:creature'],
  },
  muldrotha: {
    name: 'Muldrotha, the Gravetide',
    typeLine: 'Legendary Creature — Elemental Avatar',
    tags: ['creature'],
    facets: ['sub:avatar', 'sub:elemental', 'type:creature', 'type:legendary'],
  },
  krenko: {
    name: 'Krenko, Mob Boss',
    typeLine: 'Legendary Creature — Goblin Warrior',
    tags: ['creature', 'token-maker', 'tokens'],
    facets: ['eff:create-token', 'rec:full', 'sub:goblin', 'sub:warrior', 'tok:goblin', 'type:creature', 'type:legendary'],
  },
  talrand: {
    name: 'Talrand, Sky Summoner',
    typeLine: 'Legendary Creature — Merfolk Wizard',
    tags: ['creature', 'token-maker'],
    facets: [
      'cares:type:instant',
      'cares:type:sorcery',
      'cares:zone:stack',
      'eff:create-token',
      'rec:full',
      'scope:all',
      'sub:merfolk',
      'sub:wizard',
      'tok:drake',
      'trig:cast',
      'type:creature',
      'type:legendary',
    ],
  },
  atraxa: {
    name: "Atraxa, Praetors' Voice",
    typeLine: 'Legendary Creature — Phyrexian Angel Horror',
    tags: ['creature', 'proliferate'],
    facets: [
      'eff:proliferate',
      'kw:deathtouch',
      'kw:flying',
      'kw:lifelink',
      'kw:vigilance',
      'rec:partial',
      'sub:angel',
      'sub:horror',
      'sub:phyrexian',
      'trig:step',
      'type:creature',
      'type:legendary',
    ],
  },
};

describe('a record beats a word', () => {
  it('Sol Ring is ramp because its record adds mana', () => {
    assert.equal(cardRole(CARDS.solRing, 'ramp'), true);
  });

  it('Bone Saw is not a win condition, and its voltron tag does not get a vote', () => {
    // This is the bug. All twelve win-condition slots across the four measured
    // decks were Equipment, because `voltron` was in `ROLE_TAGS.wincon`.
    assert.equal(cardRole(CARDS.boneSaw, 'wincon'), false);
    assert.equal(CARDS.boneSaw.tags.includes('voltron'), true);
  });

  it('Bone Saw serves no role at all, so it never enters a quota pass', () => {
    const served = ROLES.filter(r => cardRole(CARDS.boneSaw, r));
    assert.deepEqual(served, []);
  });

  it('Adventuring Gear is not a win condition either, mass pump selector or not', () => {
    // Its "equipped creature gets +2/+2" compiles to a pump whose selector is
    // `all`. A wincon rule reading `eff:pump` plus `scope:all` admitted it.
    assert.equal(CARDS.adventuringGear.facets.includes('eff:pump'), true);
    assert.equal(CARDS.adventuringGear.facets.includes('scope:all'), true);
    assert.equal(cardRole(CARDS.adventuringGear, 'wincon'), false);
  });

  it('Craterhoof Behemoth IS a win condition, through the tag fallback', () => {
    // The compiler refused "creatures you control get +X/+X", which is the
    // whole card, so its record is `rec:partial` and the tags still speak.
    assert.equal(CARDS.craterhoof.facets.includes('rec:partial'), true);
    assert.equal(cardRole(CARDS.craterhoof, 'wincon'), true);
  });

  it('Blighted Agent is a win condition from the record, with no tag needed', () => {
    assert.equal(CARDS.blightedAgent.tags.some(t => t === 'wincon' || t === 'finisher'), false);
    assert.equal(cardRole(CARDS.blightedAgent, 'wincon'), true);
  });

  it('a complete record that says nothing is a NO, not a shrug', () => {
    // The property the whole precedence rule rests on.
    const readCompletely = { typeLine: 'Artifact', tags: ['wincon'], facets: ['rec:full', 'type:artifact'] };
    const notRead = { typeLine: 'Artifact', tags: ['wincon'], facets: ['type:artifact'] };
    assert.equal(cardServesRole(readCompletely, 'wincon', servesRole), false);
    assert.equal(cardServesRole(notRead, 'wincon', servesRole), true);
  });
});

describe('a creature is a creature because the type line says so', () => {
  it('reads the front face and nothing else', () => {
    assert.equal(cardRole({ typeLine: 'Creature — Beast', tags: [] }, 'creature'), true);
    assert.equal(cardRole({ typeLine: 'Artifact Creature — Construct', tags: [] }, 'creature'), true);
    assert.equal(cardRole({ typeLine: 'Artifact', tags: ['creature'] }, 'creature'), false);
  });

  it('a creature land is a land, not a creature', () => {
    // Dryad Arbor. Counting it as a creature would let the creature floor be
    // filled out of the mana base.
    assert.equal(cardRole({ typeLine: 'Land Creature — Forest Dryad', tags: [] }, 'creature'), false);
    assert.equal(cardRole({ typeLine: 'Land Creature — Forest Dryad', tags: [] }, 'land'), true);
  });

  it('a card with no record is still correctly a creature', () => {
    assert.equal(hasRecord(CARDS.muldrotha), false);
    assert.equal(cardRole(CARDS.muldrotha, 'creature'), true);
  });
});

describe('what has a record, and what only has a type line', () => {
  it('type and subtype facets are not a record', () => {
    // Muldrotha carries four facets and no ability record. Counting those as
    // evidence reported 100% record coverage on a deck picked from tags.
    assert.equal(CARDS.muldrotha.facets.length, 4);
    assert.equal(hasRecord(CARDS.muldrotha), false);
  });

  it('coverage counts records, not facets', () => {
    const c = facetCoverage([CARDS.solRing, CARDS.craterhoof, CARDS.muldrotha]);
    assert.deepEqual({ withRecord: c.withRecord, total: c.total }, { withRecord: 2, total: 3 });
  });
});

describe('reading the commander', () => {
  it('Atraxa wants proliferate and counters', () => {
    const plan = planForCommander(CARDS.atraxa);
    assert.equal(plan.fromTagsOnly, false);
    assert.ok(plan.wants.some(w => w.facet === 'eff:proliferate'));
    assert.ok(plan.wants.some(w => w.facet === 'eff:add-counters'));
  });

  it("Atraxa's evasion keywords are not wants", () => {
    // Without the ignore list, Atraxa's first printed line would make the deck
    // want every flier in four colours.
    const plan = planForCommander(CARDS.atraxa);
    assert.equal(plan.wants.some(w => w.facet.startsWith('kw:')), false);
  });

  it('Krenko has a tribe and it is goblin', () => {
    const plan = planForCommander(CARDS.krenko);
    assert.equal(plan.tribe, 'goblin');
    assert.ok(plan.wants.some(w => w.facet === 'sub:goblin'));
  });

  it('Talrand has NO tribe, because a Talrand deck is not about Merfolk', () => {
    // The subtype has to be on the type line AND inside an ability. Merfolk is
    // only on the type line; Drake is only in the ability.
    const plan = planForCommander(CARDS.talrand);
    assert.equal(plan.tribe, null);
  });

  it('Talrand wants instants and sorceries, from its own trigger filter', () => {
    const plan = planForCommander(CARDS.talrand);
    assert.ok(plan.wants.some(w => w.facet === 'type:instant'));
    assert.ok(plan.wants.some(w => w.facet === 'type:sorcery'));
  });

  it('a commander with no record says so rather than pretending', () => {
    const plan = planForCommander(CARDS.muldrotha);
    assert.equal(plan.fromTagsOnly, true);
    // Muldrotha's only tag is `creature`, which maps to nothing, so the plan is
    // genuinely empty and the deck it builds is not about anything. That is the
    // honest outcome and the measurement in ENGINE-PICKS.md reports it.
    assert.deepEqual([...plan.wants], []);
  });

  it('two different commanders produce two different plans', () => {
    // The property the four-deck overlap measurement tests, asserted directly.
    const a = new Set(planForCommander(CARDS.atraxa).wants.map(w => w.facet));
    const k = new Set(planForCommander(CARDS.krenko).wants.map(w => w.facet));
    const shared = [...a].filter(f => k.has(f));
    assert.deepEqual(shared, []);
  });
});

describe('scoring a card against the plan', () => {
  it('a card that does the commander job scores, one that does not is silent', () => {
    const plan = planForCommander(CARDS.atraxa);
    const proliferator = { facets: ['eff:proliferate', 'rec:full', 'type:artifact'] };
    assert.ok(planFit(plan, proliferator).fit > 0);
    assert.equal(planFit(plan, CARDS.boneSaw).fit, 0);
  });

  it('the best want dominates rather than the count of wants', () => {
    const plan = planForCommander(CARDS.atraxa);
    const one = planFit(plan, { facets: ['eff:proliferate'] });
    const three = planFit(plan, {
      facets: ['eff:add-counters', 'eff:player-counter'],
    });
    // One card doing the deck's whole plan beats one brushing two lesser wants.
    assert.ok(one.fit > three.fit, `${one.fit} should beat ${three.fit}`);
  });

  it('no plan means no fit, never a zero that reads as a verdict', () => {
    assert.deepEqual(planFit(null, CARDS.solRing), { fit: 0, matched: [] });
    assert.deepEqual(planFit(planForCommander(CARDS.muldrotha), CARDS.solRing), { fit: 0, matched: [] });
  });
});

describe('the creature floor is a declared number, and the style picks it', () => {
  it('the three styles are the three numbers', () => {
    assert.deepEqual(CREATURE_TARGETS, { creatures: 32, balanced: 24, spells: 12 });
  });

  it('creature mode asks for more creatures than balanced, which asks for more than spells', () => {
    assert.ok(CREATURE_TARGETS.creatures > CREATURE_TARGETS.balanced);
    assert.ok(CREATURE_TARGETS.balanced > CREATURE_TARGETS.spells);
  });

  it('an unknown style builds a deck and says it was not recognised', () => {
    const r = creatureTargetFor('goblins go wide');
    assert.equal(r.matchedStyle, false);
    assert.equal(r.style, 'balanced');
    assert.equal(r.target, CREATURE_TARGETS.balanced);
  });

  it('a missing style is the balanced default', () => {
    assert.equal(creatureTargetFor(null).target, CREATURE_TARGETS.balanced);
    assert.equal(creatureTargetFor(undefined).target, CREATURE_TARGETS.balanced);
  });

  it('the style name is matched case-insensitively and trimmed', () => {
    assert.equal(creatureTargetFor('  Creatures ').target, CREATURE_TARGETS.creatures);
  });

  it('the style scales with the format, like every other target', () => {
    // 32 of 99 and 32 of 60 are different decks. The floor goes through
    // `roleTargetsFor` so it scales with the rest rather than beside it.
    assert.equal(roleTargetsFor('commander', undefined, 'creatures').creature, 32);
    assert.equal(roleTargetsFor('modern', undefined, 'creatures').creature, 19);
    assert.equal(roleTargetsFor('modern', undefined, 'spells').creature, 7);
  });

  it('an explicit override still beats the style', () => {
    assert.equal(roleTargetsFor('commander', { creature: 5 }, 'creatures').creature, 5);
  });

  it('no style leaves the balanced default in place', () => {
    assert.equal(roleTargetsFor('commander').creature, CREATURE_TARGETS.balanced);
  });
});

describe('voltron is gone from the win condition tags', () => {
  it('and nothing else was lost with it', () => {
    // Pinned so the tag cannot come back without this failing. `storm` and
    // `infect` stay: each names a card that ends a game on its own.
    const wincon = ['finisher', 'wincon', 'extra-turn', 'extra-combat', 'infect', 'storm'];
    for (const tag of wincon) assert.equal(servesRole([tag], 'wincon'), true, tag);
    assert.equal(servesRole(['voltron'], 'wincon'), false);
    assert.equal(servesRole(['equipment'], 'wincon'), false);
  });
});

/* ------------------------------------------------------------------ *
 * Card against card
 * ------------------------------------------------------------------ *
 *
 * Every facet list below was PRINTED by `scratch/facet-probe.mjs` running
 * `src/lib/deck/recommend/behaviour.ts` against the live catalogue on
 * 2026-08-23, and pasted in. None is written from memory.
 *
 * Each named pair is a list entry the card page actually produced.
 */

const PAIRS = {
  solRing: { facets: ['acost:0', 'eff:add-mana', 'mana:2', 'rec:full', 'type:artifact'] },
  manaCrypt: {
    facets: ['acost:0', 'eff:add-mana', 'mana:2', 'rec:partial', 'trig:step', 'type:artifact'],
  },
  manaVault: {
    facets: ['acost:0', 'eff:add-mana', 'mana:3', 'rec:partial', 'trig:step', 'type:artifact'],
  },
  dimirSignet: { facets: ['acost:1', 'eff:add-mana', 'mana:2', 'rec:full', 'type:artifact'] },
  arcaneSignet: { facets: ['type:artifact'] },
  counterspell: { facets: ['eff:counter', 'rec:full', 'type:instant'] },
  manaDrain: { facets: ['eff:counter', 'rec:partial', 'type:instant'] },
  frostTitan: {
    facets: ['eff:tap', 'rec:partial', 'sub:giant', 'trig:attacks', 'trig:enters', 'type:creature'],
  },
  declarationOfNaught: { facets: ['type:enchantment'] },
  wrathOfGod: {
    facets: ['cares:type:creature', 'eff:destroy', 'rec:full', 'scope:all', 'type:sorcery'],
  },
  armageddon: {
    facets: ['cares:type:land', 'eff:destroy', 'rec:full', 'scope:all', 'type:sorcery'],
  },
} as const;

describe('behaviourSimilarity: same effect, similar arguments', () => {
  it('Wrath of God and Armageddon are not the same card, and only the argument says so', () => {
    // The whole reason the re-extraction kept constructor arguments. Both are
    // `destroy` + `scope:all` + a sorcery; they differ on `cares:type:` alone.
    const m = behaviourSimilarity(PAIRS.wrathOfGod, PAIRS.armageddon);
    assert.ok(m.score < 1, `expected a gap, got ${m.score}`);
    assert.ok(!m.shared.includes('cares:type:creature'));
    assert.ok(m.shared.includes('eff:destroy'));
    // And a self comparison is the ceiling, so the gap above is real.
    assert.equal(behaviourSimilarity(PAIRS.wrathOfGod, PAIRS.wrathOfGod).score, 1);
  });

  it('Frost Titan is not a Counterspell, and the tag said it was', () => {
    // Both carry the `counterspell` tag. Under `sharedTagScore` they were
    // identical at 6.32 and Frost Titan was shown on the Counterspell page.
    assert.equal(behaviourSimilarity(PAIRS.counterspell, PAIRS.frostTitan).score, 0);
    assert.equal(behaviourSimilarity(PAIRS.counterspell, PAIRS.declarationOfNaught).score, 0);
  });

  it('Mana Drain is a Counterspell', () => {
    const m = behaviourSimilarity(PAIRS.counterspell, PAIRS.manaDrain);
    assert.equal(m.score, 1);
    // One record is short, so the caller must not read a low score as a verdict.
    assert.equal(m.basis, 'partial');
  });

  it('a Signet is separated from Sol Ring by its activation cost and nothing else', () => {
    /*
     * Identical on every other facet. Without `acost:` the two scored exactly
     * 1.000 and a Sol Ring page returned ten Signets, measured 2026-08-23.
     *
     * This is all the FACETS can say, and deliberately not the whole answer. A
     * Signet still scores 0.878 here, ahead of Mana Crypt's 0.860, because Mana
     * Crypt's upkeep coin flip is a `trig:step` Sol Ring does not have and
     * Jaccard charges for it. What puts Mana Crypt above a Signet on the page
     * is mana value, which lives with the rest of the ranking in
     * `src/lib/deck/recommend/similar.ts`. Pinned here so the split is visible
     * rather than discovered.
     */
    const signet = behaviourSimilarity(PAIRS.solRing, PAIRS.dimirSignet);
    assert.ok(signet.score < 1, `expected the cost to cost something, got ${signet.score}`);
    assert.ok(!signet.shared.includes('acost:0'));
    assert.ok(signet.shared.includes('mana:2'));
  });

  it('adding three mana is closer to adding two than to adding none', () => {
    // `mana:` is a magnitude, so it is compared by distance. Set equality
    // dropped Mana Vault off Sol Ring's list entirely.
    const vault = behaviourSimilarity(PAIRS.solRing, PAIRS.manaVault);
    assert.ok(vault.score > 0.5, `Mana Vault scored ${vault.score}`);
    // `mana:3` against `mana:2` is a near miss, so it is not reported as shared.
    assert.ok(!vault.shared.includes('mana:2'));
    assert.ok(vault.shared.includes('eff:add-mana'));
  });

  it('a card with no record answers `none`, so the caller can fall back and say so', () => {
    const m = behaviourSimilarity(PAIRS.solRing, PAIRS.arcaneSignet);
    assert.equal(m.basis, 'none');
  });

  it('is symmetric, because a similar-cards list has to agree with itself', () => {
    const forward = behaviourSimilarity(PAIRS.solRing, PAIRS.manaCrypt).score;
    const back = behaviourSimilarity(PAIRS.manaCrypt, PAIRS.solRing).score;
    assert.equal(forward, back);
  });

  it('a card with no facets at all scores nothing rather than throwing', () => {
    assert.equal(behaviourSimilarity(null, PAIRS.solRing).score, 0);
    assert.equal(behaviourSimilarity(PAIRS.solRing, { facets: [] }).score, 0);
  });
});

describe('describeSharedFacets', () => {
  it('builds the clause from the facet and refuses what it has no phrase for', () => {
    assert.deepEqual(describeSharedFacets(['eff:counter', 'type:instant']), ['counters a spell']);
    assert.deepEqual(describeSharedFacets(['eff:add-mana', 'acost:0', 'mana:2']), [
      'adds mana',
      'costs nothing to use',
      '2 mana at a time',
    ]);
  });

  it('never prints a raw facet at a player', () => {
    for (const phrase of describeSharedFacets(['cares:zone:library-land', 'rec:full', 'sub:goblin'])) {
      assert.ok(!phrase.includes(':'), phrase);
    }
  });
});
