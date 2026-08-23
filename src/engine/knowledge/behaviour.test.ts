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

  /*
   * REVERSED ON 2026-08-23. This used to assert that Blighted Agent IS a win
   * condition, read straight off `eff:poison` with no tag needed, and it was
   * cited as the rule working. Eight fresh commanders said otherwise.
   *
   * `scratch/refute-eight.mjs` built decks for eight commanders the tuning had
   * never seen. Blightbelly Rat, a two-mana 1/1 with toxic 1, took a win
   * condition slot in the Meren, Kaalia and Yuriko decks, and Ichorclaw Myr and
   * Core Prowler took most of the remaining twelve. One poison counter is not a
   * win, and nothing in this vocabulary carries the magnitude that would tell a
   * Blightsteel Colossus from a 1/1 Rat.
   *
   * TWO DOORS HAD TO CLOSE, and closing one closed neither. The producer prints
   * Ichorclaw Myr as `rec:full` with `eff:poison`, so it came in through
   * `ROLE_FACETS`; it prints Blightbelly Rat as `rec:partial` with no
   * `eff:poison` at all and the tag `infect`, so it came in through the tag
   * fallback in `ROLE_TAGS`. Both lists lost their poison entry.
   *
   * WHAT IT COSTS, stated rather than buried: Blightsteel Colossus is
   * `rec:partial` and its only tags are `artifact`, `creature` and `infect`, so
   * it no longer reaches this role by any door. That is a real loss on a real
   * win condition, taken because the same word was putting a 1/1 Rat into three
   * decks out of eight.
   */
  it('Blighted Agent is NOT a win condition, because one poison counter is not a win', () => {
    assert.equal(CARDS.blightedAgent.facets.includes('eff:poison'), true);
    assert.equal(cardRole(CARDS.blightedAgent, 'wincon'), false);
  });

  it('Blightbelly Rat is not a win condition through the infect TAG either', () => {
    // Facets exactly as the producer printed them: the compiler reads the dies
    // trigger, refuses toxic, and emits no poison facet at all. Only the tag
    // ever knew, which is why removing the facet on its own changed nothing.
    const blightbellyRat = {
      name: 'Blightbelly Rat',
      typeLine: 'Creature — Phyrexian Rat',
      tags: ['creature', 'infect', 'proliferate'],
      facets: [
        'eff:proliferate',
        'kw:toxic',
        'rec:partial',
        'sub:phyrexian',
        'sub:rat',
        'trig:dies',
        'type:creature',
      ],
    };
    assert.equal(blightbellyRat.facets.includes('eff:poison'), false);
    assert.equal(blightbellyRat.facets.includes('rec:partial'), true);
    assert.equal(cardRole(blightbellyRat, 'wincon'), false);
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

describe('voltron and infect are gone from the win condition tags', () => {
  it('and nothing else was lost with them', () => {
    // Pinned so neither tag can come back without this failing. `storm` stays:
    // a storm card ends a game on its own. `infect` went on 2026-08-23 for the
    // Blightbelly Rat measurement above, one day after `voltron` went for the
    // Basilisk Collar one, and they are the same mistake in different words.
    const wincon = ['finisher', 'wincon', 'extra-turn', 'extra-combat', 'storm'];
    for (const tag of wincon) assert.equal(servesRole([tag], 'wincon'), true, tag);
    assert.equal(servesRole(['voltron'], 'wincon'), false);
    assert.equal(servesRole(['equipment'], 'wincon'), false);
    assert.equal(servesRole(['infect'], 'wincon'), false);
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
    assert.deepEqual(describeSharedFacets(['kw:haste', 'type:creature']), ['has haste']);
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

/* ------------------------------------------------------------------ *
 * The tribe, on eight commanders the tuning never saw
 * ------------------------------------------------------------------ */

/*
 * `CommanderPlan.tribe` needs the subtype on the type line AND inside an
 * ability. The second half was only ever answerable by the compiler, and the
 * compiler refuses exactly the clauses that make a tribal commander tribal, so
 * `scratch/refute-eight.mjs` found Edgar Markov, Lathril and Yuriko all coming
 * back `tribe: null` and building decks of cheap colourless artifacts.
 *
 * `readOwnTypeInRules` in `src/lib/deck/recommend/behaviour.ts` now asks the
 * printed text the same question and emits `cares:sub:` when it says yes. These
 * facet lists are that producer's real output over the 2026-08-19 snapshot,
 * printed by `scratch/refute-probe-facets.mjs` on 2026-08-23. What is pinned
 * here is the engine's half of the contract: given these facets, these tribes.
 */
const COMMANDERS = {
  edgarMarkov: {
    name: 'Edgar Markov',
    typeLine: 'Legendary Creature — Vampire Knight',
    tags: ['counters', 'creature', 'token-maker', 'tokens'],
    facets: [
      'cares:sub:vampire',
      'kw:first strike',
      'kw:haste',
      'rec:partial',
      'sub:knight',
      'sub:vampire',
      'type:creature',
      'type:legendary',
    ],
  },
  talrand: {
    name: 'Talrand, Sky Summoner',
    typeLine: 'Legendary Creature — Merfolk Wizard',
    tags: ['creature', 'spellslinger', 'token-maker', 'tokens'],
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
  kaalia: {
    name: 'Kaalia of the Vast',
    typeLine: 'Legendary Creature — Human Cleric',
    tags: ['creature', 'evasion'],
    facets: ['kw:flying', 'rec:partial', 'sub:cleric', 'sub:human', 'type:creature', 'type:legendary'],
  },
  yuriko: {
    name: "Yuriko, the Tiger's Shadow",
    typeLine: 'Legendary Creature — Human Ninja',
    tags: ['creature'],
    facets: [
      'cares:sub:ninja',
      'rec:partial',
      'sub:human',
      'sub:ninja',
      'trig:deals-damage',
      'type:creature',
      'type:legendary',
    ],
  },
};

describe('the tribe rule, on commanders the tuning never saw', () => {
  it('Edgar Markov is a Vampire deck, from a record the compiler only half read', () => {
    const plan = planForCommander(COMMANDERS.edgarMarkov);
    assert.equal(plan.tribe, 'vampire');
    assert.ok(plan.wants.some(w => w.facet === 'sub:vampire'));
    assert.ok(plan.wants.some(w => w.facet === 'tok:vampire'));
    // The record admits it is incomplete, which is the case this exists for.
    assert.equal(COMMANDERS.edgarMarkov.facets.includes('rec:partial'), true);
  });

  it('Yuriko is a Ninja deck and Lathril is an Elf deck', () => {
    assert.equal(planForCommander(COMMANDERS.yuriko).tribe, 'ninja');
    const lathril = planForCommander({
      name: 'Lathril, Blade of the Elves',
      typeLine: 'Legendary Creature — Elf Noble',
      tags: ['creature', 'evasion', 'lifegain', 'token-maker', 'tokens'],
      facets: [
        'acost:0',
        'cares:sub:elf',
        'eff:gain-life',
        'eff:lose-life',
        'kw:menace',
        'rec:partial',
        'sub:elf',
        'sub:noble',
        'trig:deals-damage',
        'type:creature',
        'type:legendary',
      ],
    });
    assert.equal(lathril.tribe, 'elf');
  });

  it('Talrand is still NOT a Merfolk deck, which is the rule this must not break', () => {
    // The whole point of the both-places rule. Talrand's text names instants,
    // sorceries and Drakes; it never names Merfolk or Wizard, so the printed
    // read adds nothing and the tribe stays null.
    const plan = planForCommander(COMMANDERS.talrand);
    assert.equal(plan.tribe, null);
    assert.equal(COMMANDERS.talrand.facets.includes('cares:sub:merfolk'), false);
    assert.ok(plan.wants.some(w => w.facet === 'type:instant'));
  });

  it('Kaalia gets no tribe, because the types she names are not her own', () => {
    // Angel, Demon and Dragon are in her text and none of them is on her type
    // line, so a rule that read "any creature type in the text" would have
    // given her three tribes. She is not a tribal commander and gets none.
    const plan = planForCommander(COMMANDERS.kaalia);
    assert.equal(plan.tribe, null);
    for (const f of COMMANDERS.kaalia.facets) assert.ok(!f.startsWith('cares:sub:'), f);
  });
});

/* ------------------------------------------------------------------ *
 * Same verb, different object
 * ------------------------------------------------------------------ */

describe('behaviourSimilarity separates what the verb was done to', () => {
  /* Producer output, 2026-08-23, via `scratch/refute-probe-facets.mjs`. */
  const wrath = {
    name: 'Wrath of God',
    facets: ['cares:type:creature', 'eff:destroy', 'rec:full', 'scope:all', 'type:sorcery'],
  };
  const dayOfJudgment = {
    name: 'Day of Judgment',
    facets: ['cares:type:creature', 'eff:destroy', 'rec:full', 'scope:all', 'type:sorcery'],
  };
  const rout = {
    name: 'Rout',
    facets: ['acost:2', 'cares:type:creature', 'eff:destroy', 'rec:full', 'scope:all', 'type:sorcery'],
  };
  const armageddon = {
    name: 'Armageddon',
    facets: ['cares:type:land', 'eff:destroy', 'rec:full', 'scope:all', 'type:sorcery'],
  };
  const cleansingMeditation = {
    name: 'Cleansing Meditation',
    facets: ['cares:type:enchantment', 'eff:destroy', 'rec:partial', 'scope:all', 'type:sorcery'],
  };

  it('Rout beats Armageddon, which is the case the live page got wrong', () => {
    /*
     * Measured live on 2026-08-23 by `scratch/refute-related.mjs`: Wrath of
     * God's fourteen held Ravages of War at 7, Armageddon at 8, Cleansing
     * Meditation at 9 and Cleanfall at 14, all above Rout at 10. Armageddon and
     * Ravages of War read "Destroy all lands"; Cleansing Meditation and
     * Cleanfall read "Destroy all enchantments". Rout destroys all creatures
     * and lost only because its flash clause is an extra unshared facet, so a
     * plain Jaccard counted doing MORE against it harder than doing something
     * ELSE.
     */
    const vsRout = behaviourSimilarity(wrath, rout).score;
    const vsArmageddon = behaviourSimilarity(wrath, armageddon).score;
    const vsMeditation = behaviourSimilarity(wrath, cleansingMeditation).score;
    assert.ok(vsRout > vsArmageddon, `Rout ${vsRout} vs Armageddon ${vsArmageddon}`);
    assert.ok(vsRout > vsMeditation, `Rout ${vsRout} vs Cleansing Meditation ${vsMeditation}`);
  });

  it('the functional reprint still wins outright', () => {
    const twin = behaviourSimilarity(wrath, dayOfJudgment).score;
    assert.equal(twin, 1);
    assert.ok(twin > behaviourSimilarity(wrath, rout).score);
  });

  it('silence is an absence and not a disagreement', () => {
    // A record that never named an object must not be punished as if it had
    // named a different one, or a partial record becomes a wrong record.
    const saysNothing = {
      name: 'unread',
      facets: ['eff:destroy', 'rec:partial', 'scope:all', 'type:sorcery'],
    };
    const silent = behaviourSimilarity(wrath, saysNothing).score;
    const contradicts = behaviourSimilarity(wrath, armageddon).score;
    assert.ok(silent > contradicts, `silent ${silent} vs contradicting ${contradicts}`);
  });

  it('is still symmetric with the factor applied', () => {
    assert.equal(
      behaviourSimilarity(wrath, armageddon).score,
      behaviourSimilarity(armageddon, wrath).score
    );
  });
});
