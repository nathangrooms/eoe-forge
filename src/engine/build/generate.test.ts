/**
 * The deck generator, tested on the properties that were actually broken.
 *
 *   node --test --experimental-strip-types src/engine/build/generate.test.ts
 *
 * The rows marked "verbatim" below are real `public.cards` rows read off the
 * live catalogue on 2026-08-19, tags and `edhrec_rank` included, so a test that
 * passes here describes what the generator will do against the real table.
 * The filler pool is synthetic and says so: it exists only so a 99-card deck
 * can be completed, and no assertion depends on what is in it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateDeck, allocateBasics, pipDemand, type BuildCard } from './generate.ts';
import { normalizeRow, type RawCardRow } from '../advise/query.ts';

const COMMANDER_LEGAL = { commander: 'legal' };

function card(over: Partial<RawCardRow> & { id: string; name: string }, oracleText?: string): BuildCard {
  const row: RawCardRow = {
    oracle_id: over.oracle_id ?? over.id,
    type_line: 'Sorcery',
    cmc: '3',
    color_identity: [],
    tags: [],
    mana_cost: null,
    prices: null,
    legalities: COMMANDER_LEGAL,
    ...over,
  } as RawCardRow;
  return { ...normalizeRow(row, 'commander'), oracleText: oracleText ?? null };
}

/* ------------------------------------------------------------------ *
 * Verbatim rows
 * ------------------------------------------------------------------ */

const ATRAXA = card({
  id: 'atraxa-1',
  oracle_id: 'atraxa-oracle',
  name: "Atraxa, Praetors' Voice",
  type_line: 'Legendary Creature — Phyrexian Angel Horror',
  cmc: '4',
  mana_cost: '{G}{W}{U}{B}',
  color_identity: ['B', 'G', 'U', 'W'],
  tags: ['creature', 'evasion', 'lifegain', 'proliferate'],
  edhrec_rank: 2469,
});

const COMMAND_TOWER = card(
  {
    id: 'ct-1',
    oracle_id: 'ct-oracle',
    name: 'Command Tower',
    type_line: 'Land',
    cmc: '0',
    color_identity: [],
    tags: ['land'],
    edhrec_rank: 2,
  },
  '{T}: Add one mana of any color in your commander’s color identity.'
);

const BREEDING_POOL = card(
  {
    id: 'bp-1',
    oracle_id: 'bp-oracle',
    name: 'Breeding Pool',
    type_line: 'Land — Forest Island',
    cmc: '0',
    color_identity: ['G', 'U'],
    tags: ['land'],
    edhrec_rank: 60,
    prices: { usd: '11.50' },
  },
  '({T}: Add {G} or {U}.)\nAs Breeding Pool enters, you may pay 2 life. If you don’t, it enters tapped.'
);

/** A famous land that fixes nothing. It must lose to lands that do. */
const RELIQUARY_TOWER = card(
  {
    id: 'rt-1',
    oracle_id: 'rt-oracle',
    name: 'Reliquary Tower',
    type_line: 'Land',
    cmc: '0',
    color_identity: [],
    tags: ['land'],
    edhrec_rank: 1,
  },
  'You have no maximum hand size.\n{T}: Add {C}.'
);

const INEXORABLE_TIDE = card({
  id: 'tide-1',
  oracle_id: 'tide-oracle',
  name: 'Inexorable Tide',
  type_line: 'Enchantment',
  cmc: '5',
  mana_cost: '{3}{U}{U}',
  color_identity: ['U'],
  tags: ['enchantment', 'proliferate'],
});

/** Cheap draw that also proliferates. Verbatim. */
const CONTENTIOUS_PLAN = card({
  id: 'plan-1',
  oracle_id: 'plan-oracle',
  name: 'Contentious Plan',
  type_line: 'Sorcery',
  cmc: '2',
  mana_cost: '{1}{U}',
  color_identity: ['U'],
  tags: ['card-draw', 'draw', 'proliferate', 'sorcery'],
  edhrec_rank: 2240,
  prices: { usd: '0.40' },
});

const CULTIVATE = card({
  id: 'cult-1',
  oracle_id: 'cult-oracle',
  name: 'Cultivate',
  type_line: 'Sorcery',
  cmc: '3',
  mana_cost: '{2}{G}',
  color_identity: ['G'],
  tags: ['ramp', 'sorcery'],
  edhrec_rank: 20,
});

const SWORDS = card({
  id: 'stp-1',
  oracle_id: 'stp-oracle',
  name: 'Swords to Plowshares',
  type_line: 'Instant',
  cmc: '1',
  mana_cost: '{W}',
  color_identity: ['W'],
  tags: ['instant', 'removal', 'removal-spot', 'targeted-removal'],
});

/** Out of identity. It must never appear, however good it looks. */
const LIGHTNING_BOLT = card({
  id: 'bolt-1',
  oracle_id: 'bolt-oracle',
  name: 'Lightning Bolt',
  type_line: 'Instant',
  cmc: '1',
  mana_cost: '{R}',
  color_identity: ['R'],
  tags: ['instant', 'removal', 'targeted-removal'],
  edhrec_rank: 5,
});

const BASICS: Record<string, BuildCard> = {
  W: card({ id: 'plains-1', oracle_id: 'plains', name: 'Plains', type_line: 'Basic Land — Plains', cmc: '0', color_identity: ['W'], tags: ['basic-land', 'land'] }, '({T}: Add {W}.)'),
  U: card({ id: 'island-1', oracle_id: 'island', name: 'Island', type_line: 'Basic Land — Island', cmc: '0', color_identity: ['U'], tags: ['basic-land', 'land'] }, '({T}: Add {U}.)'),
  B: card({ id: 'swamp-1', oracle_id: 'swamp', name: 'Swamp', type_line: 'Basic Land — Swamp', cmc: '0', color_identity: ['B'], tags: ['basic-land', 'land'] }, '({T}: Add {B}.)'),
  G: card({ id: 'forest-1', oracle_id: 'forest', name: 'Forest', type_line: 'Basic Land — Forest', cmc: '0', color_identity: ['G'], tags: ['basic-land', 'land'] }, '({T}: Add {G}.)'),
};

/* ------------------------------------------------------------------ *
 * Synthetic filler — declared as such, and nothing asserts on it
 * ------------------------------------------------------------------ */

const IDENTITY = ['W', 'U', 'B', 'G'];
const ROLE_TAG_CYCLE = [
  ['ramp'],
  ['card-draw'],
  ['targeted-removal'],
  ['counterspell'],
  ['finisher'],
  ['creature'],
];

function fillerPool(count: number): BuildCard[] {
  const out: BuildCard[] = [];
  for (let i = 0; i < count; i++) {
    const colour = IDENTITY[i % IDENTITY.length];
    const cmc = 1 + (i % 5);
    out.push(
      card({
        id: `filler-${i}`,
        oracle_id: `filler-${i}`,
        name: `Filler ${String(i).padStart(3, '0')}`,
        type_line: i % 3 === 0 ? 'Creature — Human' : 'Instant',
        cmc: String(cmc),
        mana_cost: `{${cmc - 1}}{${colour}}`,
        color_identity: [colour],
        tags: ROLE_TAG_CYCLE[i % ROLE_TAG_CYCLE.length],
        prices: { usd: '0.25' },
      })
    );
  }
  return out;
}

/**
 * Filler lands.
 *
 * `dual` decides whether each one taps for two colours or one, and that
 * distinction is load-bearing rather than decoration: a four-colour deck whose
 * only lands make one colour each genuinely cannot support `{3}{U}{U}`, and
 * two tests below depend on the generator agreeing.
 */
function fillerLands(count: number, dual: boolean): BuildCard[] {
  const out: BuildCard[] = [];
  for (let i = 0; i < count; i++) {
    const a = IDENTITY[i % IDENTITY.length];
    const b = IDENTITY[(i + 1) % IDENTITY.length];
    const colours = dual ? [a, b] : [a];
    out.push(
      card(
        {
          id: `land-${dual ? 'd' : 'm'}-${i}`,
          oracle_id: `land-${dual ? 'd' : 'm'}-${i}`,
          name: `Filler Land ${String(i).padStart(3, '0')}`,
          type_line: 'Land',
          cmc: '0',
          color_identity: colours,
          tags: ['land'],
          prices: { usd: '0.25' },
        },
        `{T}: Add ${colours.map(c => `{${c}}`).join(' or ')}.`
      )
    );
  }
  return out;
}

const POOL: BuildCard[] = [
  COMMAND_TOWER,
  BREEDING_POOL,
  RELIQUARY_TOWER,
  INEXORABLE_TIDE,
  CONTENTIOUS_PLAN,
  CULTIVATE,
  SWORDS,
  LIGHTNING_BOLT,
  ...fillerLands(60, true),
  ...fillerPool(400),
];

function build(over: Partial<Parameters<typeof generateDeck>[0]> = {}) {
  return generateDeck({
    format: 'commander',
    commander: ATRAXA,
    pool: POOL,
    basics: BASICS,
    ...over,
  });
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

test('the deck is exactly 99 cards, counted in copies', () => {
  const deck = build();
  assert.equal(deck.totalCopies, 99);
  // Entries are fewer than copies, because basics stack. If these were equal
  // the generator would be counting rows, which is the bug that shipped 79-card
  // "Commander decks".
  assert.ok(deck.entries.length < 99, `${deck.entries.length} entries`);
});

test('every card is inside the commander colour identity', () => {
  const deck = build();
  const allowed = new Set(ATRAXA.colorIdentity);
  for (const entry of deck.entries) {
    for (const colour of entry.card.colorIdentity) {
      assert.ok(allowed.has(colour), `${entry.card.name} is outside the identity`);
    }
  }
  assert.equal(deck.entries.some(e => e.card.name === 'Lightning Bolt'), false);
});

test('the commander is never also in the 99', () => {
  const deck = build();
  assert.equal(deck.entries.some(e => e.card.oracleId === ATRAXA.oracleId), false);
});

test('singleton holds for everything except basic lands', () => {
  const deck = build();
  for (const entry of deck.entries) {
    if (entry.bucket === 'basic') continue;
    assert.equal(entry.quantity, 1, `${entry.card.name} appears ${entry.quantity} times`);
  }
  const ids = deck.entries.map(e => e.card.oracleId);
  assert.equal(new Set(ids).size, ids.length, 'a card was added twice');
});

test('the mana base is chosen for fixing, not for fame', () => {
  const deck = build();
  const names = deck.entries.map(e => e.card.name);
  // Command Tower makes every colour in the identity and Breeding Pool makes
  // two; Reliquary Tower is ranked first by popularity and makes none.
  assert.ok(names.includes('Command Tower'));
  assert.ok(names.includes('Breeding Pool'));
  const fixingCount = deck.entries.filter(
    e => e.bucket === 'land' && e.card.colorIdentity.length > 0
  ).length;
  assert.ok(fixingCount > 0, 'no coloured land was chosen');
});

test('every colour of the identity has sources in the finished deck', () => {
  const deck = build();
  for (const colour of ['W', 'U', 'B', 'G'] as const) {
    assert.ok(
      deck.manaProfile.sourcesByColour[colour] > 0,
      `${colour} has ${deck.manaProfile.sourcesByColour[colour]} sources`
    );
  }
});

/**
 * The commander is the theme, and the theme is a real signal.
 *
 * Contentious Plan and the filler draw spells all serve the `draw` role, so
 * the role-gap signal cannot separate them. What separates them is that
 * Contentious Plan shares `proliferate` with Atraxa, and `tag-signal.ts` prices
 * that tag by how rare it is (101 cards in the catalogue) rather than counting
 * it as one match among many. The old builder's substitute for this was
 * `+2 if the commander's oracle text and the card's oracle text share the
 * string "counter"`.
 */
test('the commander seeds synergy, so a card sharing its theme wins its slot', () => {
  const deck = build();
  const plan = deck.entries.find(e => e.card.name === 'Contentious Plan');
  assert.ok(plan, 'Contentious Plan was not picked for a proliferate commander');
  assert.match(plan!.reason, /proliferate/);
  assert.equal(plan!.bucket, 'draw');
});

/**
 * The headline product decision, as a test.
 *
 * Inexorable Tide is the single best thematic fit in the pool for a
 * proliferate commander. Give the deck a mana base that cannot reliably
 * produce `{U}{U}` by turn five and it must not be picked anyway — not ranked
 * lower, not picked. That is `cannot-cast` in `rank.ts`, and it is the whole
 * difference between castability driving the build and decorating it.
 */
test('a card the mana base cannot support is not picked, however well it fits', () => {
  const thin = generateDeck({
    format: 'commander',
    commander: ATRAXA,
    // Every land makes exactly one colour, so a four-colour deck has about
    // nine blue sources and double blue on turn five is out of reach.
    pool: [INEXORABLE_TIDE, ...fillerLands(60, false), ...fillerPool(400)],
    basics: BASICS,
  });
  assert.equal(thin.entries.some(e => e.card.name === 'Inexorable Tide'), false);
  assert.equal(thin.totalCopies, 99, 'the gate changed the deck size');
});

test('the reason on every card is the engine speaking, never free text', () => {
  const deck = build();
  for (const entry of deck.entries) {
    assert.ok(entry.reason.length > 0, `${entry.card.name} has no reason`);
  }
  // A role pick names the role it filled and the count it filled it to.
  const rolePick = deck.entries.find(e => e.bucket === 'ramp');
  if (rolePick) assert.match(rolePick.reason, /fills a ramp gap \(\d+ of \d+\)/i);
});

test('a planner may only reorder cards already in the pool', () => {
  const withPlan = build({ preferOracleIds: [CULTIVATE.oracleId, SWORDS.oracleId] });
  const names = withPlan.entries.map(e => e.card.name);
  assert.ok(names.includes('Cultivate'));
  assert.ok(names.includes('Swords to Plowshares'));

  // An id that is not in the pool changes nothing and cannot add a card.
  const withGhost = build({ preferOracleIds: ['a-card-a-model-made-up'] });
  assert.equal(withGhost.totalCopies, 99);
  for (const entry of withGhost.entries) {
    assert.ok(
      POOL.some(c => c.oracleId === entry.card.oracleId) ||
        Object.values(BASICS).some(c => c.oracleId === entry.card.oracleId),
      `${entry.card.name} came from nowhere`
    );
  }
});

test('avoided cards do not appear', () => {
  const deck = build({ avoidOracleIds: [CULTIVATE.oracleId, INEXORABLE_TIDE.oracleId] });
  const names = deck.entries.map(e => e.card.name);
  assert.equal(names.includes('Cultivate'), false);
  assert.equal(names.includes('Inexorable Tide'), false);
});

test('the score and the castability come from one evaluation, not two', () => {
  const deck = build();
  const castability = deck.evaluation.power.subscores.find(s => s.key === 'castability');
  assert.ok(castability, 'no castability subscore');
  assert.equal(
    Math.round(castability!.value * 10) / 10,
    Math.round((deck.evaluation.playability.averagePct ?? 0) * 10) / 10
  );
  // The mana profile the deck reports IS the one the score was computed on.
  assert.equal(deck.manaProfile, deck.evaluation.playability.profile);
});

test('a pool too small to fill the quotas says so rather than padding', () => {
  const deck = generateDeck({
    format: 'commander',
    commander: ATRAXA,
    pool: [COMMAND_TOWER, BREEDING_POOL, CULTIVATE, SWORDS],
    basics: BASICS,
  });
  assert.ok(deck.shortfalls.length > 0, 'a starved pool reported no shortfall');
  assert.ok(deck.shortfalls.some(s => /spell slots could not be filled/.test(s)));
  // What it CAN fill, it fills: the basics still complete the mana base.
  assert.ok(deck.landCopies > 0);
});

test('a budget swaps cards down instead of deleting them', () => {
  const expensive = card({
    id: 'exp-1',
    oracle_id: 'exp-oracle',
    name: 'Expensive Thing',
    type_line: 'Artifact',
    cmc: '2',
    mana_cost: '{2}',
    color_identity: [],
    tags: ['ramp', 'mana-rock'],
    edhrec_rank: 1,
    prices: { usd: '400.00' },
  });
  const tight = generateDeck({
    format: 'commander',
    commander: ATRAXA,
    pool: [expensive, ...POOL],
    basics: BASICS,
    budgetUsd: 60,
  });
  assert.equal(tight.totalCopies, 99, 'the budget pass changed the deck size');
  assert.equal(tight.entries.some(e => e.card.name === 'Expensive Thing'), false);
});

/* ------------------------------------------------------------------ *
 * The two exported helpers
 * ------------------------------------------------------------------ */

test('basics are allocated by the pips the deck actually asks for', () => {
  const entries = allocateBasics({
    identity: ['U', 'B'],
    basics: BASICS,
    slots: 12,
    // Three times as many black pips as blue.
    pips: { W: 0, U: 3, B: 9, R: 0, G: 0 },
    // Both colours already well supplied, so rule 1 does nothing and rule 2
    // decides the whole split.
    sourcesByColour: { W: 0, U: 12, B: 12, R: 0, G: 0 },
  });
  const byName = Object.fromEntries(entries.map(e => [e.card.name, e.quantity]));
  assert.equal(byName.Swamp + byName.Island, 12);
  assert.ok(byName.Swamp > byName.Island, `${byName.Swamp} swamps vs ${byName.Island} islands`);
});

test('a colour the lands left short is repaired before pips are considered', () => {
  const entries = allocateBasics({
    identity: ['U', 'B'],
    basics: BASICS,
    slots: 12,
    // Every pip is black, so pip weight alone would run zero Islands.
    pips: { W: 0, U: 0, B: 20, R: 0, G: 0 },
    sourcesByColour: { W: 0, U: 1, B: 14, R: 0, G: 0 },
  });
  const byName = Object.fromEntries(entries.map(e => [e.card.name, e.quantity]));
  assert.ok(byName.Island >= 9, `only ${byName.Island} islands for a deck with 1 blue source`);
});

test('a hybrid pip is split between the colours that can pay it', () => {
  const demand = pipDemand([
    {
      card: card({
        id: 'hy-1',
        name: 'Hybrid Thing',
        mana_cost: '{W/U}{W/U}',
        color_identity: ['W', 'U'],
      }),
      quantity: 1,
      reason: '',
      score: 0,
      bucket: 'flex',
      preferred: false,
    },
  ]);
  assert.equal(demand.W, 1);
  assert.equal(demand.U, 1);
});

/* ------------------------------------------------------------------ *
 * The colour floor and the mana base, added 2026-08-23
 * ------------------------------------------------------------------ *
 *
 * Both come out of `scratch/refute-eight.mjs` and `scratch/refute-colour.mjs`,
 * which built decks for eight commanders the earlier tuning never saw.
 */

/** Colourless artifacts that are castable by every deck and do nothing else. */
function colourlessFiller(count: number): BuildCard[] {
  const out: BuildCard[] = [];
  for (let i = 0; i < count; i++) {
    out.push(
      card({
        id: `rock-${i}`,
        oracle_id: `rock-${i}`,
        name: `Colourless Filler ${String(i).padStart(3, '0')}`,
        type_line: i % 4 === 0 ? 'Artifact Creature — Construct' : 'Artifact',
        cmc: String(i % 2),
        mana_cost: `{${i % 2}}`,
        color_identity: [],
        tags: ROLE_TAG_CYCLE[i % ROLE_TAG_CYCLE.length],
        prices: { usd: '0.25' },
      })
    );
  }
  return out;
}

test('the deck plays the commander colours, not just what is cheapest to cast', () => {
  /*
   * A zero-mana colourless artifact is castable by every deck by construction,
   * so it collects the full `WEIGHTS.playability` for free while a real card in
   * two colours collects less. Measured by `scratch/refute-colour.mjs` on the
   * 2026-08-19 snapshot before this floor existed: six of eight decks came back
   * one and a half to three times more colourless than the pool they were drawn
   * from, and Urza, Lord High Artificer's mono-blue 99 contained two blue
   * spells out of sixty-four.
   *
   * The pool here is stacked the same way on purpose: 500 colourless artifacts
   * against 120 coloured cards.
   */
  const stacked = [
    COMMAND_TOWER,
    ...fillerLands(60, true),
    ...colourlessFiller(500),
    ...fillerPool(120),
  ];
  const deck = build({ pool: stacked });
  const spells = deck.entries.filter(e => e.bucket !== 'land' && e.bucket !== 'basic');
  const coloured = spells.filter(e => (e.card.colorIdentity ?? []).length > 0).length;
  assert.ok(
    coloured >= Math.floor(spells.length * 0.5),
    `${coloured} of ${spells.length} spells are in the commander's colours`
  );
});

test('a colourless commander is not asked to play colours it does not have', () => {
  const karn = card({
    id: 'karn-1',
    oracle_id: 'karn-oracle',
    name: 'Karn, Silver Golem',
    type_line: 'Legendary Artifact Creature — Golem',
    cmc: '5',
    mana_cost: '{5}',
    color_identity: [],
    tags: ['artifact', 'creature'],
  });
  const deck = generateDeck({
    format: 'commander',
    commander: karn,
    pool: [...fillerLands(60, true), ...colourlessFiller(500)],
    basics: BASICS,
  });
  // The floor is zero for an empty identity, so this must not report a
  // shortfall it could never fill.
  for (const note of deck.notes) assert.ok(!note.includes("commander's colours"), note);
});

test('a land that taps for nothing is picked last', () => {
  /*
   * `pickLands` used to take any remaining land in rank order, and every land
   * scores identically, so it was reading the tie-break. While that tie-break
   * was alphabetical the result looked fine; with an unbiased one the Edgar
   * Markov mana base came back holding Dark Depths, which taps for no mana at
   * all, over a basic land.
   */
  const deadLand = card(
    {
      id: 'dead-land',
      oracle_id: 'dead-land',
      name: 'Aaa Dead Land',
      type_line: 'Land',
      cmc: '0',
      color_identity: [],
      tags: ['land'],
      edhrec_rank: 1,
      prices: { usd: '0.25' },
    },
    'Aaa Dead Land enters tapped. {T}, Sacrifice this land: Draw a card.'
  );
  const deck = generateDeck({
    format: 'commander',
    commander: ATRAXA,
    // Exactly enough real lands to fill the nonbasic room, plus one that makes
    // no mana and every advantage the ranker can give it.
    pool: [deadLand, ...fillerLands(60, true), ...fillerPool(400)],
    basics: BASICS,
  });
  const names = deck.entries
    .filter(e => e.bucket === 'land' || e.bucket === 'basic')
    .map(e => e.card.name);
  assert.ok(!names.includes('Aaa Dead Land'), names.join(', '));
});

test('the notes say how much of the deck the score could not decide', () => {
  const deck = build();
  const line = deck.notes.find(n => n.includes('the score could not separate'));
  assert.ok(line, deck.notes.join('\n'));
  assert.match(line as string, /^\d+ of \d+ spells/);
});

/* ------------------------------------------------------------------ *
 * The archetype the player asked for reaches the deck
 * ------------------------------------------------------------------ */

/**
 * Cards that do an archetype's job, and nothing else in this pool does.
 *
 * `fillerPool` carries no facets at all, so a card that carries `trig:dies` and
 * `eff:lose-life` is doing something no other card in the pool does. That is
 * what makes the assertion below about the archetype rather than about luck.
 *
 * There have to be more of them than the deck has slots. `planForArchetype`
 * drops a want that fewer pool cards than that can satisfy, on the argument
 * that such a want cannot shape a deck, and a synthetic pool is the one place
 * that bound is easy to trip by accident.
 */
function drainPool(count: number): BuildCard[] {
  const out: BuildCard[] = [];
  for (let i = 0; i < count; i++) {
    const colour = IDENTITY[i % IDENTITY.length];
    out.push({
      ...card({
        id: `drain-${i}`,
        oracle_id: `drain-${i}`,
        name: `Drainer ${String(i).padStart(3, '0')}`,
        type_line: 'Creature — Vampire',
        cmc: '2',
        mana_cost: `{1}{${colour}}`,
        color_identity: [colour],
        tags: ['creature'],
        prices: { usd: '0.25' },
      }),
      facets: ['eff:lose-life', 'trig:dies', 'rec:full', 'type:creature'],
    });
  }
  return out;
}

/** A shell made of cards that drain, the way `pipeline.ts` builds one. */
const DRAIN_SHELL = {
  id: 'aristocrats',
  name: 'Aristocrats',
  named: 3,
  exemplars: [
    { name: 'Blood Artist', facets: ['eff:lose-life', 'trig:dies', 'rec:full', 'type:creature'] },
    { name: 'Zulaport Cutthroat', facets: ['eff:lose-life', 'trig:dies', 'rec:full', 'type:creature'] },
    { name: 'Bastion of Remembrance', facets: ['eff:lose-life', 'rec:full', 'type:enchantment'] },
  ],
};

test('the archetype the player asked for changes which cards are taken', () => {
  const pool = [...POOL, ...drainPool(120)];
  const drainers = (deck: ReturnType<typeof generateDeck>) =>
    deck.entries.filter(e => e.card.name.startsWith('Drainer')).length;

  const without = generateDeck({
    format: 'commander',
    commander: ATRAXA,
    pool,
    basics: BASICS,
  });
  const with_ = generateDeck({
    format: 'commander',
    commander: ATRAXA,
    pool,
    basics: BASICS,
    archetype: DRAIN_SHELL,
  });

  assert.ok(
    drainers(with_) > drainers(without),
    `asking for Aristocrats took ${drainers(with_)} drainers, not asking took ${drainers(without)}`
  );
  assert.equal(with_.totalCopies, 99, 'the archetype changed the deck size');
});

test('an archetype whose cards say nothing changes nothing, and says so', () => {
  const pool = [...POOL, ...drainPool(120)];
  const silent = generateDeck({
    format: 'commander',
    commander: ATRAXA,
    pool,
    basics: BASICS,
    // Three cards that share no behaviour facet with each other.
    archetype: {
      id: 'nothing',
      name: 'Nothing',
      named: 3,
      exemplars: [
        { name: 'A', facets: ['type:artifact', 'rec:full'] },
        { name: 'B', facets: ['type:instant', 'rec:full'] },
        { name: 'C', facets: ['type:land'] },
      ],
    },
  });
  const plain = generateDeck({ format: 'commander', commander: ATRAXA, pool, basics: BASICS });

  assert.deepEqual(
    silent.entries.map(e => e.card.name),
    plain.entries.map(e => e.card.name)
  );
  assert.equal(silent.evidence.archetype?.wants.length, 0);
  assert.ok(silent.notes.some(n => n.includes('Nothing changed nothing')), silent.notes.join('\n'));
});

test('no archetype asked for is reported as none, not as an empty one', () => {
  const deck = build();
  assert.equal(deck.evidence.archetype, null);
  assert.equal(
    deck.notes.some(n => /shell|archetype/i.test(n)),
    false,
    'a build with no archetype talked about one'
  );
});

/* ------------------------------------------------------------------ *
 * The budget pass may not pay for itself out of the mana base
 * ------------------------------------------------------------------ */

test('a cheaper land has to be a land the deck can actually use', () => {
  /*
   * `trimToBudget` replaced an expensive card with the first cheap enough row
   * of the same kind, and "same kind" meant `isLandCandidate`. Nothing asked
   * whether the cheaper land made mana.
   *
   * Measured on the live catalogue on 2026-08-28, Grand Arbiter Augustin IV in
   * Azorius on a $400 budget, four of the swaps it made:
   *
   *   Misty Rainforest $35.59 -> Wooded Foothills  $17.05
   *   Scalding Tarn    $37.64 -> Bloodstained Mire $17.34
   *   Arid Mesa        $31.19 -> Yavimaya          $15.53
   *   Mana Confluence  $35.25 -> Verdant Catacombs $28.76
   *
   * Every card on the left makes or finds white or blue; not one on the right
   * does. The deck came in under budget by trading four working lands for four
   * blanks. Fifteen such lands were in ten decks built that day, and none
   * survives this rule.
   */
  const pricyDual = card(
    {
      id: 'pricy-dual',
      oracle_id: 'pricy-dual',
      name: 'Pricy Dual',
      type_line: 'Land',
      cmc: '0',
      color_identity: [],
      tags: ['land'],
      edhrec_rank: 1,
      prices: { usd: '400.00' },
    },
    '{T}: Add {W} or {U}.'
  );
  // Cheap, highly ranked, and unable to find anything ATRAXA plays: its
  // identity is W/U/B/G, so a Mountain is not in this deck.
  const offColourFetch = card(
    {
      id: 'off-fetch',
      oracle_id: 'off-fetch',
      name: 'Aaa Off Colour Fetch',
      type_line: 'Land',
      cmc: '0',
      color_identity: [],
      tags: ['land'],
      edhrec_rank: 1,
      prices: { usd: '0.10' },
    },
    '{T}, Pay 1 life, Sacrifice this land: Search your library for a Mountain card, put it onto the battlefield, then shuffle.'
  );

  const deck = generateDeck({
    format: 'commander',
    commander: ATRAXA,
    pool: [pricyDual, offColourFetch, ...fillerLands(60, true), ...fillerPool(400)],
    basics: BASICS,
    budgetUsd: 60,
  });

  const landNames = deck.entries
    .filter(e => e.bucket === 'land' || e.bucket === 'basic')
    .map(e => e.card.name);
  assert.equal(
    landNames.includes('Aaa Off Colour Fetch'),
    false,
    `a fetchland that finds nothing this deck plays is not a mana base: ${landNames.join(', ')}`
  );
  assert.equal(deck.totalCopies, 99, 'the budget pass changed the deck size');
});

test('a land that makes no mana is never taken, and the slot becomes a basic', () => {
  /*
   * Stronger than "picked last", which is what the tier order gave. A tier the
   * ranking cannot reject always fills, because `nonBasicRoom` asks for
   * `landTarget` minus two basics per colour whether or not that many lands
   * are worth playing. A basic is free, untapped, makes the colour and can be
   * fetched, so a land that makes nothing is strictly worse than the card that
   * would otherwise fill the slot.
   */
  const deadLand = card(
    {
      id: 'dead-land-2',
      oracle_id: 'dead-land-2',
      name: 'Aaa Blank Land',
      type_line: 'Land',
      cmc: '0',
      color_identity: [],
      tags: ['land'],
      edhrec_rank: 1,
      prices: { usd: '0.25' },
    },
    'Each land is a Forest in addition to its other land types.'
  );
  const deck = generateDeck({
    format: 'commander',
    commander: ATRAXA,
    // Deliberately fewer real lands than the nonbasic room, so the blank would
    // be taken by anything that merely sorts it last.
    pool: [deadLand, ...fillerLands(8, true), ...fillerPool(400)],
    basics: BASICS,
  });
  const lands = deck.entries.filter(e => e.bucket === 'land' || e.bucket === 'basic');
  assert.equal(
    lands.some(e => e.card.name === 'Aaa Blank Land'),
    false,
    lands.map(e => e.card.name).join(', ')
  );
  const basics = lands
    .filter(e => e.bucket === 'basic')
    .reduce((n, e) => n + e.quantity, 0);
  assert.ok(basics > 0, 'the refused slot has to come back as a basic, not vanish');
  assert.equal(deck.totalCopies, 99);
});
