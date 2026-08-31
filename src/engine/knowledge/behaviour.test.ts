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
  archetypeFit,
  facetBackground,
  planForArchetype,
  withArchetype,
} from './behaviour.ts';
import {
  servesRole,
  cardRole,
  styleFor,
  DECK_STYLES,
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

  /*
   * THIS ASSERTED `[]` UNTIL 31 AUG 2026, AND THE CHANGE IS DELIBERATE.
   *
   * The bug it was written against is the one directly above: every win
   * condition in four decks was Equipment, because `voltron` sat in
   * `ROLE_TAGS.wincon`. "Serves no role at all" was locked in as the
   * consequence, and it went further than the bug.
   *
   * The category error was calling a Bone Saw a WIN CONDITION. It is not one.
   * It is an Equipment, and "auras and equipment that make one creature
   * better" is a real slot in a real deck — for a voltron commander it is most
   * of the deck. While no role named that, the generator could not build one:
   * measured on Uril, the Miststalker, Rancor at rank 827 and planFit 0.585
   * served NO role and stayed out, while On Thin Ice at rank 9424 got in
   * because it happens to exile something.
   *
   * What stops a Bone Saw being CHOSEN is the ranker, not the vocabulary. A
   * role says which slot a card may fill; the ranking says which card fills it,
   * and Bone Saw loses to Rancor on every axis the ranker reads. The two
   * assertions that matter are kept and unchanged: it is not a win condition,
   * and its `voltron` tag gets no vote there.
   */
  it('Bone Saw is an Equipment, and that is the only slot it may fill', () => {
    const served = ROLES.filter(r => cardRole(CARDS.boneSaw, r));
    assert.deepEqual(served, ['enhance']);
    // The point of the original ratchet, still held.
    assert.equal(cardRole(CARDS.boneSaw, 'wincon'), false);
    assert.equal(cardRole(CARDS.boneSaw, 'ramp'), false);
    assert.equal(cardRole(CARDS.boneSaw, 'draw'), false);
    assert.equal(cardRole(CARDS.boneSaw, 'removal'), false);
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

  it('a commander with no record gets the floor, and is marked as having only that', () => {
    /* THIS ASSERTION CHANGED ON 2026-08-30 and the old one is worth recording.
       It used to require `plan.wants` to be EMPTY, on the argument that an
       empty plan is the honest outcome for a card we cannot read.

       That was right until the owner asked for every commander to be covered.
       21 of the 3,411 commanders the deck generator offers print no rules text
       on any face, and an empty plan for Isamaru, Hound of Konda does not
       describe him honestly, it just declines to describe him at all. A 2/2 for
       one white mana with no abilities is played for its body and its commander
       damage, and the deck is equipment and auras. That is the only reading the
       card supports, so saying it is not pretending.

       What must stay true is that the floor is the WEAKEST thing the engine
       says and announces itself, which is what the rest of this test checks. */
    const plan = planForCommander(CARDS.muldrotha);
    assert.equal(plan.fromTagsOnly, true);
    assert.equal(plan.floorOnly, true, 'the floor fired but did not say so');
    assert.ok(plan.wants.length > 0, 'the floor produced nothing');
    for (const want of plan.wants) {
      assert.ok(want.weight <= 0.5, `${want.facet} at ${want.weight} is above the floor`);
      assert.ok(want.because.startsWith(CARDS.muldrotha.name), `free text: ${want.because}`);
    }
  });

  it('a commander we can read is never marked as floor-only', () => {
    for (const key of ['krenko', 'atraxa', 'talrand'] as const) {
      const plan = planForCommander(CARDS[key]);
      assert.notEqual(plan.floorOnly, true, `${key} was given the floor`);
    }
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

describe('a style is a name, and no longer a creature number', () => {
  it('the three styles are the three names', () => {
    assert.deepEqual([...DECK_STYLES], ['creatures', 'balanced', 'spells']);
  });

  it('an unknown style builds a deck and says it was not recognised', () => {
    const r = styleFor('goblins go wide');
    assert.equal(r.matchedStyle, false);
    assert.equal(r.style, 'balanced');
  });

  it('a missing style is the balanced default', () => {
    assert.equal(styleFor(null).style, 'balanced');
    assert.equal(styleFor(undefined).style, 'balanced');
  });

  it('the style name is matched case-insensitively and trimmed', () => {
    assert.equal(styleFor('  Creatures ').style, 'creatures');
  });

  it('the yardstick asks for no creatures at all, and that is the point', () => {
    // There was never a defensible universal creature count. Grading a deck
    // somebody typed in must not claim one is missing.
    assert.equal(roleTargetsFor('commander').creature, 0);
    assert.equal(roleTargetsFor('modern').creature, 0);
  });

  it('the yardstick is only for a deck nobody derived a shape for', () => {
    // It still scales by format, because the decks it grades still do.
    assert.equal(roleTargetsFor('commander').ramp, 10);
    assert.equal(roleTargetsFor('modern').ramp, 6);
    assert.equal(roleTargetsFor('commander', { ramp: 5 }).ramp, 5);
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
    /*
     * Producer output as of 2026-08-28. The three `cares:sub:` facets are new
     * and they are the whole card: the compiler returns only her flying keyword
     * and refuses "you may put an Angel, Demon, or Dragon creature card from
     * your hand onto the battlefield" whole, so the printed read in
     * `lib/deck/recommend/behaviour.ts` is the only thing that reaches them.
     * Before it did, this plan had NO WANTS and the deck the generator built
     * for her against the live database held no Angel, no Demon and no Dragon.
     */
    facets: [
      'cares:sub:angel',
      'cares:sub:demon',
      'cares:sub:dragon',
      'kw:flying',
      'rec:partial',
      'sub:cleric',
      'sub:human',
      'type:creature',
      'type:legendary',
    ],
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

  it('Kaalia wants Angels, Demons and Dragons and is still not a tribal commander', () => {
    /*
     * BOTH HALVES, AND THE SECOND HALF USED TO SWALLOW THE FIRST.
     *
     * Angel, Demon and Dragon are in her text and none of them is on her type
     * line, so a rule that read "any creature type in the text" as a TRIBE would
     * have given her three. That is what the both-places rule in `tribeOf`
     * prevents, and it still does: `tribe` is null here.
     *
     * The assertion that used to sit under it banned every `cares:sub:` facet on
     * her as well, and that was the wrong conclusion drawn from the right rule.
     * It left her plan empty. Measured end to end against the live database on
     * 2026-08-28, her build came back with 28 creatures and no Angel, no Demon
     * and no Dragon in any of them.
     *
     * A want is not a tribe. The wants come through the same branch Sram uses.
     */
    const plan = planForCommander(COMMANDERS.kaalia);
    assert.equal(plan.tribe, null);
    for (const sub of ['angel', 'demon', 'dragon']) {
      assert.ok(
        plan.wants.some(w => w.facet === `sub:${sub}`),
        `no want for sub:${sub}: ${plan.wants.map(w => w.facet).join(' ')}`
      );
    }
    // No `tok:` want, which is what a tribe would have added.
    assert.ok(!plan.wants.some(w => w.facet.startsWith('tok:')), 'Kaalia makes no tokens');
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

/* ------------------------------------------------------------------ *
 * The archetype the player asked for
 * ------------------------------------------------------------------ */

/**
 * Shell cards as the producer printed them, 2026-08-25, off the 2026-08-19
 * catalogue snapshot by `scratch/probe-names.mjs`. Same rule as `CARDS` above:
 * nothing here was written from memory.
 */
const SHELL_CARDS = {
  bloodArtist: {
    name: 'Blood Artist',
    facets: [
      'cares:type:creature',
      'eff:gain-life',
      'eff:lose-life',
      'rec:full',
      'scope:all',
      'sub:vampire',
      'trig:dies',
      'type:creature',
    ],
  },
  zulaportCutthroat: {
    name: 'Zulaport Cutthroat',
    facets: [
      'cares:type:creature',
      'eff:gain-life',
      'eff:lose-life',
      'rec:full',
      'scope:all',
      'sub:ally',
      'sub:human',
      'sub:rogue',
      'trig:dies',
      'type:creature',
    ],
  },
  bitterblossom: {
    name: 'Bitterblossom',
    facets: [
      'cares:sub:faerie',
      'eff:create-token',
      'eff:lose-life',
      'rec:full',
      'sub:faerie',
      'tok:faerie',
      'tok:rogue',
      'trig:step',
      'type:enchantment',
    ],
  },
  cultivate: {
    // The compiler reads nothing on this card: `source: none`, type line only.
    name: 'Cultivate',
    facets: ['type:sorcery'],
  },
};

const ARISTOCRATS = {
  id: 'aristocrats',
  name: 'Aristocrats',
  named: 4,
  exemplars: [
    SHELL_CARDS.bloodArtist,
    SHELL_CARDS.zulaportCutthroat,
    SHELL_CARDS.bitterblossom,
    SHELL_CARDS.cultivate,
  ],
};

/** A pool where every facet is equally common, so lift is decided by the shell. */
function flatBackground(perFacet: number, cards: number, minCards = 1) {
  const count = new Map<string, number>();
  for (const card of ARISTOCRATS.exemplars) for (const f of card.facets) count.set(f, perFacet);
  return { cards, count, minCards };
}

describe('reading an archetype off the cards it is made of', () => {
  it('what recurs across the shell becomes a want', () => {
    const plan = planForArchetype(ARISTOCRATS, flatBackground(10, 1000));
    const facets = plan.wants.map(w => w.facet);
    // Three of the four drain life; two of them trigger on something dying.
    assert.ok(facets.includes('eff:lose-life'), facets.join(' '));
    assert.ok(facets.includes('trig:dies'), facets.join(' '));
  });

  it('a facet on ONE card of the shell is that card, not the shell', () => {
    const plan = planForArchetype(ARISTOCRATS, flatBackground(10, 1000));
    // Only Bitterblossom makes tokens in this four-card shell.
    assert.equal(plan.wants.some(w => w.facet === 'eff:create-token'), false);
  });

  it('a shell may not want a card TYPE, a SUBTYPE or a KEYWORD', () => {
    // Measured reason, in the header of `planForArchetype`: seven of the eleven
    // cards in the Tokens shell are enchantments, so reading `type:` made a
    // Tokens deck want enchantments ahead of tokens.
    const plan = planForArchetype(ARISTOCRATS, flatBackground(10, 1000));
    for (const w of plan.wants) {
      assert.ok(
        w.facet.startsWith('eff:') || w.facet.startsWith('cares:') || w.facet.startsWith('trig:'),
        `${w.facet} is not a behaviour facet`
      );
    }
  });

  it('a facet the whole pool already carries is dropped as common', () => {
    // `cares:type:creature` is on half this shell and on 60% of the pool, so
    // wanting it would rank 60% of the pool rather than any part of the shell.
    const count = new Map<string, number>([['cares:type:creature', 600]]);
    const plan = planForArchetype(ARISTOCRATS, { cards: 1000, count, minCards: 1 });
    assert.equal(plan.wants.some(w => w.facet === 'cares:type:creature'), false);
    assert.ok(plan.dropped.some(d => d.facet === 'cares:type:creature' && d.reason === 'common'));
  });

  it('a facet too rare in the pool to fill a deck is dropped as rare', () => {
    const plan = planForArchetype(ARISTOCRATS, flatBackground(10, 1000, 99));
    assert.deepEqual([...plan.wants], []);
    assert.ok(plan.dropped.length > 0);
    assert.ok(plan.dropped.every(d => d.reason === 'rare'));
  });

  it('with no pool to compare against it falls back to plain recurrence', () => {
    const plan = planForArchetype(ARISTOCRATS);
    assert.ok(plan.wants.length > 0);
    // Three of four cards, so the share is 0.75 rather than a lift.
    const drain = plan.wants.find(w => w.facet === 'eff:lose-life');
    assert.equal(drain?.weight, 0.75);
  });

  it('it counts what it could not read rather than hiding it', () => {
    const plan = planForArchetype(ARISTOCRATS, flatBackground(10, 1000));
    assert.equal(plan.read, 4);
    assert.equal(plan.named, 4);
    // Cultivate compiles to nothing, so its type line is all there is.
    assert.equal(plan.withoutRecord, 1);
  });
});

describe('an archetype modifies the commander, and never replaces it', () => {
  const shell = () => planForArchetype(ARISTOCRATS, flatBackground(10, 1000));

  /**
   * What `rank.ts` actually adds up, and the two halves have to be taken from
   * two different objects.
   *
   * The COMMANDER-only plan scores commander fit and the influence scores
   * archetype fit. Using the merged plan for the first half would count every
   * shell want twice, which is why `generate.ts` hands the ranker
   * `commanderPlan` and `plan.archetype` rather than the merged plan.
   */
  const score = (
    commanderPlan: ReturnType<typeof planForCommander>,
    combined: ReturnType<typeof withArchetype>,
    card: { facets: string[] }
  ) => planFit(commanderPlan, card).fit + archetypeFit(combined.archetype, card).fit;

  it("the shell's loudest want sits below the commander's loudest", () => {
    const krenko = planForCommander(CARDS.krenko);
    const combined = withArchetype(krenko, shell());
    const commanderTop = Math.max(...krenko.wants.map(w => w.weight));
    const shellTop = Math.max(...(combined.archetype?.wants ?? []).map(w => w.weight));
    assert.ok(shellTop < commanderTop, `${shellTop} should be under ${commanderTop}`);
  });

  it('a Goblin still beats a sacrifice outlet that is not one', () => {
    const krenko = planForCommander(CARDS.krenko);
    const combined = withArchetype(krenko, shell());
    const goblin = { facets: ['sub:goblin', 'type:creature', 'rec:full'] };
    const drainer = { facets: ['eff:lose-life', 'trig:dies', 'rec:full'] };
    assert.ok(
      score(krenko, combined, goblin) > score(krenko, combined, drainer),
      `${score(krenko, combined, goblin)} should beat ${score(krenko, combined, drainer)}`
    );
  });

  it('a Goblin that drains beats a Goblin that does not, which is the whole point', () => {
    const krenko = planForCommander(CARDS.krenko);
    const combined = withArchetype(krenko, shell());
    const goblin = { facets: ['sub:goblin', 'type:creature', 'rec:full'] };
    const both = {
      facets: ['sub:goblin', 'type:creature', 'eff:lose-life', 'trig:dies', 'rec:full'],
    };
    assert.ok(
      score(krenko, combined, both) > score(krenko, combined, goblin),
      `${score(krenko, combined, both)} should beat ${score(krenko, combined, goblin)}`
    );
  });

  it('a commander want is never lowered by the shell', () => {
    const krenko = planForCommander(CARDS.krenko);
    const combined = withArchetype(krenko, shell());
    for (const own of krenko.wants) {
      const after = combined.wants.find(w => w.facet === own.facet);
      assert.ok(after && after.weight >= own.weight, `${own.facet} was lowered`);
    }
  });

  it('a commander with no wants of its own lets the shell speak, and says so', () => {
    const combined = withArchetype(planForCommander(CARDS.muldrotha), shell());
    assert.equal(combined.archetype?.alone, true);
    assert.ok(combined.wants.length > 0);
    // Every want in the merged plan came from the shell.
    assert.equal(combined.wants.length, combined.archetype?.wants.length);
  });

  it('no archetype leaves the commander plan exactly as it was', () => {
    const krenko = planForCommander(CARDS.krenko);
    assert.equal(withArchetype(krenko, null), krenko);
    assert.equal(withArchetype(krenko, { ...shell(), wants: [] }), krenko);
  });

  it('archetypeFit is silent when no archetype was asked for', () => {
    assert.deepEqual(archetypeFit(null, SHELL_CARDS.bloodArtist), { fit: 0, matched: [] });
  });
});

describe('facetBackground counts cards, not occurrences', () => {
  it('a card carrying a facet twice counts once', () => {
    const bg = facetBackground(
      [{ facets: ['eff:draw', 'eff:draw'] }, { facets: ['eff:draw'] }, { facets: [] }],
      1
    );
    assert.equal(bg.cards, 3);
    assert.equal(bg.count.get('eff:draw'), 2);
  });
});

/* ------------------------------------------------------------------ *
 * The second reader
 * ------------------------------------------------------------------ *
 *
 * Measured over the 400 most-built commanders on 2026-08-30, 67 (17%) produced
 * no wants, so `commanderFit` contributed nothing to any candidate and the deck
 * was built on roles and popularity alone. Teysa Karlov's entire record is
 * `sub:advisor sub:human type:creature type:legendary`, source `none`.
 *
 * These fix the shape of the fix, not the wording of any one rule: text is read
 * only on silence, and it may never talk over a compiled record.
 */
describe('reading a commander the ability compiler cannot parse', () => {
  const TEYSA_TEXT =
    'If a creature dying causes a triggered ability of a permanent you control to trigger, ' +
    'that ability triggers an additional time.\n' +
    'Creature tokens you control have vigilance and lifelink.';

  it('gives Teysa Karlov a plan from her own words', () => {
    const plan = planForCommander({
      name: 'Teysa Karlov',
      typeLine: 'Legendary Creature — Human Advisor',
      // What the compiler actually produces for her: types and nothing else.
      facets: ['sub:advisor', 'sub:human', 'type:creature', 'type:legendary'],
      oracleText: TEYSA_TEXT,
    });
    assert.ok(plan.wants.length > 0, 'Teysa still has no plan');
    const facets = plan.wants.map(w => w.facet);
    assert.ok(facets.includes('trig:dies'), 'a death-trigger commander does not want death triggers');
    assert.ok(facets.includes('eff:sacrifice'), 'nothing to make the creatures die on demand');
    assert.ok(facets.includes('eff:create-token'), 'nothing to make creatures to sacrifice');
  });

  it('says why in the commander\u2019s own terms, never free text', () => {
    const plan = planForCommander({
      name: 'Teysa Karlov',
      typeLine: 'Legendary Creature \u2014 Human Advisor',
      facets: ['type:creature'],
      oracleText: TEYSA_TEXT,
    });
    for (const want of plan.wants) {
      assert.ok(want.because.startsWith('Teysa Karlov '), `free text: ${want.because}`);
      assert.ok(want.because.length > 0);
    }
  });

  it('lets a compiled record outrank the second reader', () => {
    /* Adeline reads cleanly, and her text contains "number of creatures you
       control", which an intent rule matches. The compiled plan must win: the
       patterns read English and a parsed record does not, so anything the card
       actually told us has to be the last word.

       This used to assert the intent rule produced NOTHING, which is a stronger
       claim than the principle needs and it was wrong on the merits. Adeline
       says "whenever you attack, for each opponent, create a token". She wants
       attack triggers. Excluding the want did not protect the compiled record,
       it just lost a true thing about the card.

       What the principle actually requires is PRECEDENCE, and that is what is
       asserted now: every compiled want outranks every inferred one. The
       inferred weights are scaled by 0.8 when the record already spoke, which
       is what keeps that true rather than a coincidence of these numbers.

       The gate changed on 2026-08-30 because of Meren of Clan Nel Toth, whose
       facets were not silent but said only `ctr:experience`, so the aristocrats
       rule written for her exact sentence never ran and her whole plan was
       "wants proliferate". */
    const withRecord = planForCommander({
      name: 'Adeline, Resplendent Cathar',
      typeLine: 'Legendary Creature \u2014 Human Knight',
      facets: ['cares:sub:human', 'kw:vigilance', 'sub:human', 'sub:knight', 'type:creature'],
      oracleText:
        "Vigilance\nAdeline's power is equal to the number of creatures you control.\n" +
        'Whenever you attack, for each opponent, create a 1/1 white Human creature token.',
    });
    const facets = withRecord.wants.map(w => w.facet);
    assert.ok(facets.includes('cares:sub:human'), 'the compiled want is missing');

    /* Every want read from the RECORD outranks every want inferred from the
       TEXT. That is the whole claim, and it is what stops a pattern talking
       over a card that told us something itself. */
    const compiled = withRecord.wants.filter(w => !w.because.includes('pays you for attacking'));
    const inferred = withRecord.wants.filter(w => w.because.includes('pays you for attacking'));
    assert.ok(inferred.length > 0, 'the second reader did not run at all');
    const weakestCompiled = Math.min(...compiled.map(w => w.weight));
    const strongestInferred = Math.max(...inferred.map(w => w.weight));
    assert.ok(
      strongestInferred < Math.max(...compiled.map(w => w.weight)),
      `an inferred want at ${strongestInferred} outranked the compiled record`
    );
    assert.ok(weakestCompiled >= 0, 'sanity');
  });

  it('reads nothing from the text it was not given, and falls to the floor instead', () => {
    /* Without her oracle text Teysa is, as far as this function can tell, a
       card with no abilities, so the floor is what should answer. What must
       not happen is any of her REAL wants appearing: `trig:dies` and
       `eff:sacrifice` are read out of her words and cannot be inferred from a
       type line, so their presence would mean something was guessed. */
    const blind = planForCommander({
      name: 'Teysa Karlov',
      typeLine: 'Legendary Creature \u2014 Human Advisor',
      facets: ['sub:advisor', 'sub:human', 'type:creature', 'type:legendary'],
    });
    assert.equal(blind.floorOnly, true, 'something other than the floor spoke');
    const facets = blind.wants.map(w => w.facet);
    assert.equal(facets.includes('trig:dies'), false, 'invented a death trigger');
    assert.equal(facets.includes('eff:sacrifice'), false, 'invented a sacrifice theme');
    for (const want of blind.wants) {
      assert.ok(want.weight <= 0.5, `${want.facet} at ${want.weight} is above the floor`);
    }
  });

  it('reads the families it claims to, off real card text', () => {
    const cases: readonly [string, string, string][] = [
      ['Azusa, Lost but Seeking', 'You may play two additional lands on each of your turns.', 'cares:zone:library-land'],
      ['Muldrotha, the Gravetide', 'During each of your turns, you may play a land and cast a permanent spell of each permanent type from your graveyard.', 'cares:zone:graveyard'],
      ['Veyran, Voice of Duality', 'Magecraft \u2014 Whenever you cast or copy an instant or sorcery spell, Veyran gets +1/+1 until end of turn.', 'cares:type:instant'],
      ['Torbran, Thane of Red Fell', 'If a red source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead.', 'eff:damage'],
      ['Karlach, Fury of Avernus', "Whenever you attack, if it's the first combat phase of the turn, untap all attacking creatures.", 'trig:attacks'],
      ['Goreclaw, Terror of Qal Sisma', 'Creature spells you cast with power 4 or greater cost {2} less to cast.', 'type:creature'],
    ];
    for (const [name, text, wanted] of cases) {
      const plan = planForCommander({
        name,
        typeLine: 'Legendary Creature',
        facets: ['type:creature', 'type:legendary'],
        oracleText: text,
      });
      const facets = plan.wants.map(w => w.facet);
      assert.ok(facets.includes(wanted), `${name}: expected ${wanted}, got ${facets.join(' ') || '(nothing)'}`);
    }
  });
});
