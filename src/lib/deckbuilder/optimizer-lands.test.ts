/**
 * The land ranker: reading a land, ranking it, and counting the basics.
 *
 *   node --test --experimental-strip-types src/lib/deckbuilder/optimizer-lands.test.ts
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The optimiser's lands tab was recommending Plains. Two things were wrong and
 * both are pinned here.
 *
 * The first was that lands were ranked by the SPELL ranker, whose four signals
 * are identical or absent for every land — same role tag, same mana value 0, no
 * castability figure — leaving tag synergy as the only term that moved. A dual
 * land's whole job is not a tag, so the ordering collapsed onto "which land has
 * the most gimmick tags". Measured against the live catalogue on 2026-08-20 for
 * a real four-colour deck, Command Tower ranked 438th of 883 and none of the
 * fixing reached the model at all.
 *
 * The second was that basic lands were handed to the model as candidates, with
 * an explicit instruction to list one once per copy. On a land-short deck four
 * of the twelve rows came back Forest, Island, Plains and Swamp.
 *
 * EVERY ORACLE TEXT BELOW IS REAL, copied from `cards_unique` on 2026-08-20.
 * That matters more here than anywhere else in the optimiser: this file is a
 * parser, and a parser tested against invented text is tested against nothing.
 * The awkward cases are the point — a shockland and a tapland both contain the
 * words "enters tapped", and Evolving Wilds and Demolition Field both contain
 * "search your library for a basic land card".
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { deriveDeckProfile } from '../../engine/advise/profile.ts';
import { buildManaProfile } from '../../engine/playability/castability.ts';
import {
  alwaysEntersTapped,
  basicColourOf,
  basicFiller,
  pairLandSwaps,
  playableAsLand,
  rankLands,
  readLand,
  scoreLand,
  type LandCandidate,
} from '../../../supabase/functions/deck-optimizer/lands.ts';

/* ------------------------------------------------------------------ *
 * Fixtures — real rows
 * ------------------------------------------------------------------ */

let nextId = 0;
function land(
  name: string,
  typeLine: string,
  oracleText: string | null,
  extra: Partial<LandCandidate> = {}
): LandCandidate {
  nextId += 1;
  return {
    id: `id-${nextId}`,
    oracleId: `oracle-${name}`,
    name,
    typeLine,
    cmc: 0,
    colorIdentity: [],
    tags: ['land'],
    manaCost: null,
    usd: null,
    legalities: { commander: 'legal' },
    edhrecRank: null,
    oracleText,
    ...extra,
  };
}

const COMMAND_TOWER = land(
  'Command Tower',
  'Land',
  "{T}: Add one mana of any color in your commander's color identity."
);
const EXOTIC_ORCHARD = land(
  'Exotic Orchard',
  'Land',
  '{T}: Add one mana of any color that a land an opponent controls could produce.'
);
const REFLECTING_POOL = land(
  'Reflecting Pool',
  'Land',
  '{T}: Add one mana of any type that a land you control could produce.'
);
const MANA_CONFLUENCE = land(
  'Mana Confluence',
  'Land',
  '{T}, Pay 1 life: Add one mana of any color.'
);
const HEAP_GATE = land(
  'Heap Gate',
  'Land — Gate',
  '{T}: Add {C}.\n{1}, {T}: Add one mana of any color.\n{1}, {T}, Tap an untapped Gate you control: Create a Treasure token.'
);
const CASTLE_DOOM = land(
  'Castle Doom',
  'Land',
  '{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast an artifact spell.'
);
const PLAZA_OF_HARMONY = land(
  'Plaza of Harmony',
  'Land',
  'When this land enters, if you control two or more Gates, you gain 3 life.\n{T}: Add {C}.\n{T}: Add one mana of any type that a Gate you control could produce.'
);
const SPRINGJACK_PASTURE = land(
  'Springjack Pasture',
  'Land',
  '{T}: Add {C}.\n{4}, {T}: Create a 0/1 white Goat creature token.\n{T}, Sacrifice X Goats: Add X mana of any one color. You gain X life.'
);
const BREEDING_POOL = land(
  'Breeding Pool',
  'Land — Forest Island',
  "({T}: Add {G} or {U}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped."
);
const INDATHA_TRIOME = land(
  'Indatha Triome',
  'Land — Plains Swamp Forest',
  '({T}: Add {W}, {B}, or {G}.)\nThis land enters tapped.\nCycling {3} ({3}, Discard this card: Draw a card.)'
);
const EVOLVING_WILDS = land(
  'Evolving Wilds',
  'Land',
  '{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.'
);
const FLOODED_STRAND = land(
  'Flooded Strand',
  'Land',
  '{T}, Pay 1 life, Sacrifice this land: Search your library for a Plains or Island card, put it onto the battlefield, then shuffle.'
);
const DEMOLITION_FIELD = land(
  'Demolition Field',
  'Land',
  "{T}: Add {C}.\n{2}, {T}, Sacrifice this land: Destroy target nonbasic land an opponent controls. That land's controller may search their library for a basic land card, put it onto the battlefield, then shuffle. You may search your library for a basic land card, put it onto the battlefield, then shuffle."
);
const BLIGHTED_WOODLAND = land(
  'Blighted Woodland',
  'Land',
  '{T}: Add {C}.\n{3}{G}, {T}, Sacrifice this land: Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.'
);
const GHOST_QUARTER = land(
  'Ghost Quarter',
  'Land',
  '{T}: Add {C}.\n{T}, Sacrifice this land: Destroy target land. Its controller may search their library for a basic land card, put it onto the battlefield, then shuffle.'
);
const RELIQUARY_TOWER = land(
  'Reliquary Tower',
  'Land',
  'You have no maximum hand size.\n{T}: Add {C}.'
);
const PLAINS = land('Plains', 'Basic Land — Plains', '({T}: Add {W}.)', {
  tags: ['basic-land', 'land'],
});

const WUBG = ['W', 'U', 'B', 'G'] as const;

/* ------------------------------------------------------------------ *
 * readLand
 * ------------------------------------------------------------------ */

describe('readLand — free colours', () => {
  it('reads Command Tower as every colour the deck plays', () => {
    assert.deepEqual(readLand(COMMAND_TOWER, WUBG).free, ['W', 'U', 'B', 'G']);
  });

  it('reads a dual off its printed basic land types, with no ability text needed', () => {
    // The reminder text is in parentheses and may not be there at all; the
    // type line always is.
    const noText = land('Breeding Pool', 'Land — Forest Island', null);
    assert.deepEqual(readLand(noText, WUBG).free, ['U', 'G']);
  });

  it('keeps only colours in the deck identity', () => {
    // A five-colour land in a two-colour deck makes two colours you can use.
    assert.deepEqual(readLand(COMMAND_TOWER, ['W', 'U'] as const).free, ['W', 'U']);
  });

  it('counts "pay 1 life" as free — Mana Confluence is a premium fixer', () => {
    assert.deepEqual(readLand(MANA_CONFLUENCE, WUBG).free, ['W', 'U', 'B', 'G']);
  });

  it('counts "any type that a land you control could produce" as free', () => {
    assert.deepEqual(readLand(REFLECTING_POOL, WUBG).free, ['W', 'U', 'B', 'G']);
    assert.deepEqual(readLand(EXOTIC_ORCHARD, WUBG).free, ['W', 'U', 'B', 'G']);
  });

  it('gives a land with no production nothing', () => {
    const r = readLand(RELIQUARY_TOWER, WUBG);
    assert.deepEqual(r.free, []);
    assert.deepEqual(r.fetched, []);
  });
});

describe('readLand — gated colours are not fixing', () => {
  // Every one of these ranked ABOVE Command Tower before the distinction
  // existed, because the castability engine's reader counts a source as a
  // source however much it costs to use.
  it('a colour you pay {1} for is gated, not free', () => {
    const r = readLand(HEAP_GATE, WUBG);
    assert.deepEqual(r.free, []);
    assert.deepEqual(r.gated, ['W', 'U', 'B', 'G']);
  });

  it('a colour you may only spend on artifacts is gated', () => {
    assert.deepEqual(readLand(CASTLE_DOOM, WUBG).free, []);
  });

  it('a colour that depends on controlling Gates is gated', () => {
    assert.deepEqual(readLand(PLAZA_OF_HARMONY, WUBG).free, []);
  });

  it('a colour that costs a sacrifice is gated', () => {
    // The `\bsacrific\b` this replaced matched nothing at all, because
    // "Sacrifice" ends in a word character. Springjack Pasture ranked FIRST of
    // 883 lands.
    assert.deepEqual(readLand(SPRINGJACK_PASTURE, WUBG).free, []);
  });

  it('never lists a colour as both free and gated', () => {
    const r = readLand(BREEDING_POOL, WUBG);
    assert.deepEqual(r.free, ['U', 'G']);
    assert.equal(
      r.gated.some(c => r.free.includes(c)),
      false
    );
  });
});

describe('readLand — fetching', () => {
  it('reads "a basic land card" as every colour the deck plays', () => {
    const r = readLand(EVOLVING_WILDS, WUBG);
    assert.equal(r.fetches, true);
    assert.deepEqual(r.fetched, ['W', 'U', 'B', 'G']);
  });

  it('reads a named-type fetch as exactly those colours', () => {
    // "a Plains or Island card" contains no word "land". Testing for that word
    // is what put Flooded Strand 225th and Misty Rainforest 473rd.
    const r = readLand(FLOODED_STRAND, WUBG);
    assert.equal(r.fetches, true);
    assert.deepEqual(r.fetched, ['W', 'U']);
  });

  it('does not count a fetch that costs extra mana', () => {
    // Demolition Field does search your own library, for {2} plus a sacrifice,
    // after blowing up an opponent's land. It ranked 9th of 883.
    assert.equal(readLand(DEMOLITION_FIELD, WUBG).fetches, false);
    assert.equal(readLand(BLIGHTED_WOODLAND, WUBG).fetches, false);
  });

  it('does not count a search of somebody else’s library', () => {
    assert.equal(readLand(GHOST_QUARTER, WUBG).fetches, false);
  });
});

/* ------------------------------------------------------------------ *
 * alwaysEntersTapped
 * ------------------------------------------------------------------ */

describe('alwaysEntersTapped', () => {
  it('is true for a tapland', () => {
    assert.equal(alwaysEntersTapped('Temple of Enlightenment enters tapped.'), true);
    assert.equal(alwaysEntersTapped(INDATHA_TRIOME.oracleText), true);
  });

  it('is false for a shockland', () => {
    assert.equal(alwaysEntersTapped(BREEDING_POOL.oracleText), false);
  });

  it('is false for a check land', () => {
    assert.equal(
      alwaysEntersTapped(
        'Sunpetal Grove enters tapped unless you control a Forest or a Plains.'
      ),
      false
    );
  });

  it('is false when there is no text at all', () => {
    assert.equal(alwaysEntersTapped(null), false);
  });
});

/* ------------------------------------------------------------------ *
 * basicColourOf
 * ------------------------------------------------------------------ */

describe('basicColourOf', () => {
  it('reads the five basics and Wastes off the type line', () => {
    assert.equal(basicColourOf('Basic Land — Plains'), 'W');
    assert.equal(basicColourOf('Basic Land — Island'), 'U');
    assert.equal(basicColourOf('Basic Land — Swamp'), 'B');
    assert.equal(basicColourOf('Basic Land — Mountain'), 'R');
    assert.equal(basicColourOf('Basic Snow Land — Forest'), 'G');
    assert.equal(basicColourOf('Basic Land — Wastes'), 'C');
  });

  it('is null for a dual, which shares the type but is not basic', () => {
    assert.equal(basicColourOf('Land — Forest Island'), null);
  });
});

/* ------------------------------------------------------------------ *
 * Ranking
 * ------------------------------------------------------------------ */

const deckCards = [
  { oracleId: 'c1', name: 'Atraxa', typeLine: 'Legendary Creature', cmc: 4, tags: [], quantity: 1 },
  { oracleId: 'c2', name: 'Counterspell', typeLine: 'Instant', cmc: 2, tags: ['counterspell'], quantity: 1 },
  { oracleId: 'c3', name: 'Cultivate', typeLine: 'Sorcery', cmc: 3, tags: ['ramp'], quantity: 1 },
  { oracleId: 'oracle-Reliquary Tower', name: 'Reliquary Tower', typeLine: 'Land', cmc: 0, tags: ['land'], quantity: 1 },
];

const profile = deriveDeckProfile({
  format: 'commander',
  colorIdentity: [...WUBG],
  cards: deckCards,
});

const pool = [
  COMMAND_TOWER,
  EXOTIC_ORCHARD,
  HEAP_GATE,
  CASTLE_DOOM,
  BREEDING_POOL,
  INDATHA_TRIOME,
  EVOLVING_WILDS,
  PLAINS,
  RELIQUARY_TOWER,
];

const norm = (n: string) => n.trim().toLowerCase();

describe('rankLands', () => {
  const ranked = rankLands({
    pool,
    profile,
    manaProfile: null,
    identity: [...WUBG],
    owned: new Map(),
    normalizeName: norm,
  });
  const names = ranked.map(r => r.card.name);

  it('never offers a basic land', () => {
    // This is the owner's complaint, at the source. Basics are filler and are
    // counted by `basicFiller`, not recommended.
    assert.equal(names.includes('Plains'), false);
  });

  it('never offers a land the deck already plays', () => {
    assert.equal(names.includes('Reliquary Tower'), false);
  });

  it('puts a land that taps for four colours above one that charges for them', () => {
    assert.ok(
      names.indexOf('Command Tower') < names.indexOf('Heap Gate'),
      `Command Tower should outrank Heap Gate, got ${names.join(', ')}`
    );
    assert.ok(names.indexOf('Command Tower') < names.indexOf('Castle Doom'));
  });

  it('puts a four-colour land above a two-colour one in a four-colour deck', () => {
    assert.ok(names.indexOf('Command Tower') < names.indexOf('Breeding Pool'));
  });

  it('taxes a land that always enters tapped', () => {
    const untapped = scoreLand({
      land: land('Untapped Triome', 'Land — Plains Swamp Forest', '({T}: Add {W}, {B}, or {G}.)'),
      profile,
      manaProfile: null,
      identity: [...WUBG],
      ownedQuantity: 0,
    });
    const tapped = scoreLand({
      land: INDATHA_TRIOME,
      profile,
      manaProfile: null,
      identity: [...WUBG],
      ownedQuantity: 0,
    });
    assert.ok(tapped.score < untapped.score);
  });

  it('applies the limit only after everything is scored', () => {
    const top = rankLands({
      pool,
      profile,
      manaProfile: null,
      identity: [...WUBG],
      owned: new Map(),
      normalizeName: norm,
      limit: 1,
    });
    assert.equal(top.length, 1);
    assert.equal(top[0].card.name, names[0]);
  });
});

describe('scoreLand — cost and ownership', () => {
  const priced = (usd: number | null) =>
    scoreLand({
      land: { ...COMMAND_TOWER, usd },
      profile,
      manaProfile: null,
      identity: [...WUBG],
      ownedQuantity: 0,
    });

  it('prefers the cheaper of two lands that do the same job', () => {
    assert.ok(priced(0.25).score > priced(40).score);
  });

  it('treats an unpriced land as unknown, not as free', () => {
    // An unpriced land must not beat a 25c one by having no price at all.
    assert.ok(priced(null).score > priced(40).score);
    assert.ok(priced(null).score >= priced(0.25).score);
  });

  it('charges nothing for a land the user already owns', () => {
    const owned = scoreLand({
      land: { ...COMMAND_TOWER, usd: 40 },
      profile,
      manaProfile: null,
      identity: [...WUBG],
      ownedQuantity: 1,
    });
    assert.ok(owned.score > priced(40).score);
    assert.equal(
      owned.signals.some(s => s.kind === 'cost'),
      false
    );
    assert.equal(owned.grounds.ownedQuantity, 1);
  });
});

describe('scoreLand — colour scarcity', () => {
  it('is measured from the deck’s own sources, and absent when there are none to measure', () => {
    const manaProfile = buildManaProfile([
      { name: 'Island', type_line: 'Basic Land — Island', oracle_text: '({T}: Add {U}.)' },
      { name: 'Island', type_line: 'Basic Land — Island', oracle_text: '({T}: Add {U}.)' },
    ]);
    const withProfile = scoreLand({
      land: COMMAND_TOWER,
      profile,
      manaProfile,
      identity: [...WUBG],
      ownedQuantity: 0,
    });
    const without = scoreLand({
      land: COMMAND_TOWER,
      profile,
      manaProfile: null,
      identity: [...WUBG],
      ownedQuantity: 0,
    });
    assert.ok(withProfile.signals.some(s => s.kind === 'scarcity'));
    assert.equal(
      without.signals.some(s => s.kind === 'scarcity'),
      false,
      'an unmeasured mana base must produce no signal rather than a zero'
    );
    assert.ok(withProfile.score > without.score);
  });
});

describe('scoreLand — a mono-colour deck has nothing to fix', () => {
  it('gives no fixing signal when the deck plays one colour', () => {
    const mono = deriveDeckProfile({
      format: 'commander',
      colorIdentity: ['U'],
      cards: deckCards,
    });
    const r = scoreLand({
      land: COMMAND_TOWER,
      profile: mono,
      manaProfile: null,
      identity: ['U'],
      ownedQuantity: 0,
    });
    assert.equal(
      r.signals.some(s => s.kind === 'fixing'),
      false
    );
  });
});

/* ------------------------------------------------------------------ *
 * pairLandSwaps
 * ------------------------------------------------------------------ */

const FOREST = land('Forest', 'Basic Land — Forest', '({T}: Add {G}.)', {
  tags: ['basic-land', 'land'],
});
const ISLAND = land('Island', 'Basic Land — Island', '({T}: Add {U}.)', {
  tags: ['basic-land', 'land'],
});
const SULFUR_FALLS = land(
  'Sulfur Falls',
  'Land',
  "This land enters tapped unless you control an Island or a Mountain.\n{T}: Add {U} or {R}."
);
const YAVIMAYA_CRADLE = land(
  'Yavimaya, Cradle of Growth',
  'Legendary Land',
  'Each land is a Forest in addition to its other land types.'
);
const URBORG = land(
  'Urborg, Tomb of Yawgmoth',
  'Legendary Land',
  'Each land is a Swamp in addition to its other land types.'
);

/** The candidates, ranked once, exactly as the handler ranks them. */
function candidatesFrom(pool: LandCandidate[], deckLandNames: string[]) {
  const withDeck = deriveDeckProfile({
    format: 'commander',
    colorIdentity: [...WUBG],
    cards: [
      ...deckCards,
      ...deckLandNames.map(name => ({
        oracleId: `oracle-${name}`,
        name,
        typeLine: 'Land',
        cmc: 0,
        tags: ['land'],
        quantity: 1,
      })),
    ],
  });
  return {
    profile: withDeck,
    ranked: rankLands({
      pool,
      profile: withDeck,
      manaProfile: null,
      identity: [...WUBG],
      owned: new Map(),
      normalizeName: norm,
    }),
  };
}

describe('playableAsLand', () => {
  it('reads the front face, so a transforming Equipment is not a land', () => {
    // Dowsing Dagger // Lost Vale is `Artifact — Equipment // Land`, and it was
    // recommended as one of eight lands to a mono-white deck counted ten lands
    // short on 2026-08-20. It costs {2} to cast and only becomes a land after
    // the creature holding it connects, so adding it fills no land slot.
    assert.equal(playableAsLand('Artifact — Equipment // Land'), false);
    assert.equal(playableAsLand('Sorcery // Land'), false);
  });

  it('keeps every ordinary land, including the two-typed and legendary ones', () => {
    for (const t of [
      'Land',
      'Legendary Land',
      'Land — Gate',
      'Snow Land — Forest Island',
      'Artifact Land',
      'Land Creature — Forest Dryad',
      'Land — Town // Sorcery — Adventure',
    ]) {
      assert.equal(playableAsLand(t), true, t);
    }
  });
});

describe('pairLandSwaps', () => {
  const swapPool = [COMMAND_TOWER, EXOTIC_ORCHARD, BREEDING_POOL, INDATHA_TRIOME, HEAP_GATE];

  /** One copy each, which is the only shape a swap may name. */
  const one = (lands: LandCandidate[]) => lands.map(land => ({ land, quantity: 1 }));

  function pair(lands: LandCandidate[], overrides: Record<string, unknown> = {}) {
    const { profile: p, ranked } = candidatesFrom(
      swapPool,
      lands.map(l => l.name)
    );
    return pairLandSwaps({
      deckLands: one(lands),
      candidates: ranked,
      profile: p,
      manaProfile: null,
      identity: [...WUBG],
      owned: new Map(),
      normalizeName: norm,
      allowBasicCuts: true,
      ...overrides,
    });
  }

  it('trades a basic for a land that taps for every colour the deck plays', () => {
    const swaps = pair([FOREST]);
    assert.equal(swaps.length, 1);
    assert.equal(swaps[0].out.card.name, 'Forest');
    assert.equal(swaps[0].in.card.name, 'Command Tower');
  });

  it('never trades a coloured source for a land that only fetches one', () => {
    // Measured on the real precons on 2026-08-20: Karoo -> Escape Tunnel in a
    // mono-white deck, Dormant Volcano -> Escape Tunnel in a mono-red one, and
    // Port of Karfell -> Escape Tunnel in a BRU one. Escape Tunnel has no mana
    // ability at all; its only ability sacrifices itself for a tapped basic.
    // All three passed because `coverageOf` folds fetching in with tapping, so
    // the pair read as "same colours, and it comes in untapped".
    const karoo = land(
      'Karoo',
      'Land',
      [
        'This land enters tapped.',
        'When this land enters, sacrifice it unless you return an untapped Plains you control to its owner’s hand.',
        '{T}: Add {C}{W}.',
      ].join('\n')
    );
    const escapeTunnel = land(
      'Escape Tunnel',
      'Land',
      '{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.'
    );
    const swaps = pairLandSwaps({
      deckLands: one([karoo]),
      candidates: candidatesFrom([escapeTunnel], ['Karoo']).ranked,
      profile,
      manaProfile: null,
      identity: [...WUBG],
      owned: new Map(),
      normalizeName: norm,
      allowBasicCuts: true,
    });
    assert.deepEqual(swaps, [], 'a fetch does not stand in for a source already on the battlefield');
  });

  it('does not offer a swap whose only difference is which turn it is live', () => {
    // Myriad Landscape -> Heap Gate, measured in a mono-white deck on
    // 2026-08-20 at fit +0.94. Both read `produces: []`: neither taps for a
    // colour the deck plays, so "it comes in untapped" is the whole of the
    // claim, and nothing in this file has an opinion on which of two
    // colourless utility lands is the better card.
    const myriad = land(
      'Myriad Landscape',
      'Land',
      [
        'This land enters tapped.',
        '{T}: Add {C}.',
        '{2}, {T}, Sacrifice this land: Search your library for up to two basic land cards that share a land type, put them onto the battlefield tapped, then shuffle.',
      ].join('\n')
    );
    const swaps = pairLandSwaps({
      deckLands: one([myriad]),
      candidates: candidatesFrom([HEAP_GATE], ['Myriad Landscape']).ranked,
      profile,
      manaProfile: null,
      identity: [...WUBG],
      owned: new Map(),
      normalizeName: norm,
      allowBasicCuts: true,
    });
    assert.deepEqual(swaps, []);
  });

  it('still trades a tapland for an untapped land that makes the same colours', () => {
    // The two rules above must not swallow the case they exist to allow. Both
    // of these tap for every colour this deck plays. One costs a turn and the
    // other does not, and that is a gain a reader can check.
    const pathOfAncestry = land(
      'Path of Ancestry',
      'Land',
      [
        'This land enters tapped.',
        "{T}: Add one mana of any color in your commander's color identity.",
      ].join('\n')
    );
    const swaps = pairLandSwaps({
      deckLands: one([pathOfAncestry]),
      candidates: candidatesFrom([COMMAND_TOWER], ['Path of Ancestry']).ranked,
      profile,
      manaProfile: null,
      identity: [...WUBG],
      owned: new Map(),
      normalizeName: norm,
      allowBasicCuts: true,
      minGain: 0,
    });
    assert.equal(swaps.length, 1);
    assert.equal(swaps[0].in.card.name, 'Command Tower');
    assert.match(swaps[0].gainNote, /untapped/);
  });

  it('withholds basic cuts while the deck is still short of lands', () => {
    // There is an empty land slot, so cutting a Forest to play Command Tower
    // is a worse version of simply adding Command Tower.
    assert.deepEqual(pair([FOREST], { allowBasicCuts: false }), []);
  });

  it('never trades away the last source of a colour', () => {
    // Breeding Pool is the only land offered that makes green. Sulfur Falls
    // makes blue and red, and red is not in this deck, so the pair would take
    // green off the table. The rule refuses it whatever the totals say.
    const swaps = pairLandSwaps({
      deckLands: one([BREEDING_POOL]),
      candidates: candidatesFrom([SULFUR_FALLS], ['Breeding Pool']).ranked,
      profile,
      manaProfile: null,
      identity: [...WUBG],
      owned: new Map(),
      normalizeName: norm,
      allowBasicCuts: true,
    });
    assert.deepEqual(swaps, []);
  });

  it('never cuts a land the deck runs more than one of', () => {
    // A swap leaves here as a pair of NAMES, and a name cannot say "one of the
    // three Forests". One of the three screens that apply a swap replaces the
    // whole row and carries its quantity, which would put three Command Towers
    // in a Commander deck. See the header on `pairLandSwaps`.
    const { profile: p, ranked } = candidatesFrom(swapPool, ['Forest']);
    const swaps = pairLandSwaps({
      deckLands: [{ land: FOREST, quantity: 3 }],
      candidates: ranked,
      profile: p,
      manaProfile: null,
      identity: [...WUBG],
      owned: new Map(),
      normalizeName: norm,
      allowBasicCuts: true,
    });
    assert.deepEqual(swaps, []);
  });

  it('offers each land in the deck at most once, however it was listed', () => {
    // A repeated single-copy entry is the same card twice, not two cards.
    const swaps = pair([FOREST, FOREST, FOREST]);
    assert.equal(swaps.length, 1);
  });

  it('offers each land in the deck at most once across different candidates', () => {
    const swaps = pair([FOREST, ISLAND]);
    assert.equal(swaps.length, 2);
    assert.deepEqual(
      swaps.map(s => s.out.card.name).sort(),
      ['Forest', 'Island']
    );
    // Two different lands coming in, never the same card twice.
    assert.equal(new Set(swaps.map(s => s.in.card.name)).size, 2);
  });

  it('leaves out a candidate already recommended as a plain add', () => {
    const swaps = pair([FOREST], { skipIn: new Set(['command tower']) });
    assert.equal(swaps.length, 1);
    assert.notEqual(swaps[0].in.card.name, 'Command Tower');
  });

  it('leaves out a deck land already recommended for removal', () => {
    assert.deepEqual(pair([FOREST], { skipOut: new Set(['forest']) }), []);
  });

  it('never cuts a land that changes what the deck’s other lands tap for', () => {
    // Yavimaya has no mana ability of its own, so the reader sees a land that
    // taps for nothing and the fit score puts it at the bottom of the deck.
    // Measured on the live catalogue on 2026-08-20 it sat at fit 0.00 and was
    // offered against Forbidden Orchard. It is unmeasured, not weak.
    assert.deepEqual(pair([YAVIMAYA_CRADLE]), []);
    assert.deepEqual(pair([URBORG]), []);
  });

  it('still cuts a colourless land that has no such text', () => {
    // The guard above must be about the type-granting text and nothing else.
    // Reliquary Tower taps for {C} and says nothing about other lands.
    const swaps = pair([RELIQUARY_TOWER]);
    assert.equal(swaps.length, 1);
    assert.equal(swaps[0].out.card.name, 'Reliquary Tower');
  });

  it('says which colours the trade adds, and never claims one it does not', () => {
    const swaps = pair([FOREST]);
    // Forest covers green; Command Tower covers all four. Green is kept, so
    // it is not "added" and must not be listed as though it were.
    assert.match(swaps[0].gainNote, /white, blue and black/);
    assert.equal(/green/.test(swaps[0].gainNote), false);
  });

  it('states the cost when the incoming land enters tapped', () => {
    // Only the triome is offered, so the pair either says it enters tapped or
    // it hides it.
    const { profile: p, ranked } = candidatesFrom([INDATHA_TRIOME], ['Forest']);
    const swaps = pairLandSwaps({
      deckLands: one([FOREST]),
      candidates: ranked,
      profile: p,
      manaProfile: null,
      identity: [...WUBG],
      owned: new Map(),
      normalizeName: norm,
      allowBasicCuts: true,
    });
    assert.equal(swaps.length, 1);
    assert.match(swaps[0].gainNote, /always enters tapped/);
  });

  it('reads the outgoing land from its own text, not from the incoming one', () => {
    const swaps = pair([FOREST]);
    assert.match(swaps[0].outReason, /^Forest taps for green\.$/);
  });

  it('compares both sides without the price and ownership signals', () => {
    // A $40 Command Tower and a free one PLAY identically, so the gain over
    // the Forest they replace is identical. Price and ownership still decide
    // which candidate gets offered first, which is why this fixes the pool to
    // one card: the question here is only whether the comparison itself is
    // contaminated by what the card costs to obtain.
    const gainWith = (usd: number | null, ownedQuantity: number) => {
      const tower = { ...COMMAND_TOWER, usd };
      const { profile: p, ranked } = candidatesFrom([tower], ['Forest']);
      const swaps = pairLandSwaps({
        deckLands: one([FOREST]),
        candidates: ranked,
        profile: p,
        manaProfile: null,
        identity: [...WUBG],
        owned: new Map([[norm('Command Tower'), ownedQuantity]]),
        normalizeName: norm,
        allowBasicCuts: true,
      });
      assert.equal(swaps.length, 1);
      assert.equal(swaps[0].in.card.name, 'Command Tower');
      return swaps[0].gain;
    };
    assert.equal(gainWith(40, 0), gainWith(null, 0));
    assert.equal(gainWith(null, 4), gainWith(null, 0));
  });

  it('honours the limit', () => {
    const swaps = pair([FOREST, ISLAND], { limit: 1 });
    assert.equal(swaps.length, 1);
  });
});

/* ------------------------------------------------------------------ *
 * basicFiller
 * ------------------------------------------------------------------ */

const BASIC_NAMES = new Map<'W' | 'U' | 'B' | 'R' | 'G' | 'C', string>([
  ['W', 'Plains'],
  ['U', 'Island'],
  ['B', 'Swamp'],
  ['G', 'Forest'],
]);

const noPips = { W: 0, U: 0, B: 0, R: 0, G: 0 };

describe('basicFiller', () => {
  it('is null when the deck is not short, so nothing renders', () => {
    assert.equal(
      basicFiller({
        landCount: 37,
        idealLandCount: 37,
        recommendedLands: 0,
        emptyLandSlots: 0,
        identity: [...WUBG],
        pips: noPips,
        manaProfile: null,
        basicNames: BASIC_NAMES,
      }),
      null
    );
  });

  it('counts the lands already recommended against the shortfall', () => {
    const f = basicFiller({
      landCount: 30,
      idealLandCount: 37,
      recommendedLands: 4,
      emptyLandSlots: 7,
      identity: [...WUBG],
      pips: noPips,
      manaProfile: null,
      basicNames: BASIC_NAMES,
    });
    assert.equal(f?.shortfall, 3);
  });

  it('splits by what the deck’s spells actually cost', () => {
    const f = basicFiller({
      landCount: 27,
      idealLandCount: 37,
      recommendedLands: 0,
      emptyLandSlots: 10,
      identity: [...WUBG],
      pips: { W: 1, U: 1, B: 8, R: 0, G: 0 },
      // Every colour already at ten sources, so colour repair takes nothing
      // and the whole ten are split on pips.
      manaProfile: {
        librarySize: 99,
        sources: [],
        deckColourMask: 0,
        sourcesByColour: { W: 10, U: 10, B: 10, R: 10, G: 10 },
        landCount: 27,
        rockCount: 0,
        dorkCount: 0,
      },
      basicNames: BASIC_NAMES,
    });
    const swamps = f?.byColour.find(b => b.name === 'Swamp');
    assert.equal(swamps?.quantity, 8);
    assert.equal(
      f?.byColour.reduce((n, b) => n + b.quantity, 0),
      10,
      'the split must be exact, not rounded into a different total'
    );
  });

  it('repairs a colour the deck cannot produce before anything else', () => {
    const f = basicFiller({
      landCount: 30,
      idealLandCount: 37,
      recommendedLands: 0,
      emptyLandSlots: 7,
      identity: [...WUBG],
      // The spells are overwhelmingly black, but white has three sources.
      pips: { W: 1, U: 0, B: 20, R: 0, G: 0 },
      manaProfile: {
        librarySize: 99,
        sources: [],
        deckColourMask: 0,
        sourcesByColour: { W: 3, U: 10, B: 10, R: 10, G: 10 },
        landCount: 30,
        rockCount: 0,
        dorkCount: 0,
      },
      basicNames: BASIC_NAMES,
    });
    const plains = f?.byColour.find(b => b.name === 'Plains');
    assert.equal(plains?.quantity, 7, 'the whole shortfall goes to repairing white');
  });

  it('never counts more basics than the deck has empty slots', () => {
    // Ahoy Mateys (LCC) as measured on 2026-08-20: 89 cards, so 11 empty
    // slots, but 12 lands under target. Eight lands were recommended. Before
    // the slot cap this returned 4, and 8 + 4 is 12 cards into 11 slots.
    const f = basicFiller({
      landCount: 25,
      idealLandCount: 37,
      recommendedLands: 8,
      emptyLandSlots: 11,
      identity: [...WUBG],
      pips: { W: 2, U: 2, B: 2, R: 0, G: 2 },
      manaProfile: null,
      basicNames: BASIC_NAMES,
    });
    assert.equal(f?.shortfall, 3, 'eleven slots, eight of them already spoken for');
    assert.equal(
      f?.byColour.reduce((n, b) => n + b.quantity, 0),
      3
    );
  });

  it('is null for a deck at its size, however far under its land target', () => {
    // The real Atraxa deck: 100 cards and 32 lands against a target of 37.
    // There is no empty slot to put a basic in, so the answer is not "add
    // five Plains", it is a trade — which the land swaps answer.
    assert.equal(
      basicFiller({
        landCount: 32,
        idealLandCount: 37,
        recommendedLands: 0,
        emptyLandSlots: 0,
        identity: [...WUBG],
        pips: { W: 2, U: 2, B: 2, R: 0, G: 2 },
        manaProfile: null,
        basicNames: BASIC_NAMES,
      }),
      null
    );
  });

  it('says it in one line', () => {
    const f = basicFiller({
      landCount: 29,
      idealLandCount: 37,
      recommendedLands: 0,
      emptyLandSlots: 8,
      identity: [...WUBG],
      pips: { W: 2, U: 2, B: 2, R: 0, G: 2 },
      manaProfile: null,
      basicNames: BASIC_NAMES,
    });
    assert.ok(f);
    assert.equal(f.note.includes('\n'), false);
    assert.match(f.note, /8 slots/);
  });
});
