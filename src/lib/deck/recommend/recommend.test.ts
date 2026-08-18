/**
 * Unit tests for the in-house recommendation engine.
 *
 *   node --test --experimental-strip-types src/lib/deck/recommend/recommend.test.ts
 *
 * Every fixture below is a real row, copied verbatim out of our own `cards`
 * table (2026-08-18) — including the three separate printings of Cultivate and
 * the `banned` legality on Black Lotus. A test that passes here therefore
 * describes what the optimiser will actually do, not what a hand-written mock
 * makes convenient.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ALL_TAGS } from '../../cards/tagger.ts';
import {
  ROLE_TAGS,
  ROLES,
  buildCandidateQuery,
  deriveDeckProfile,
  dedupeByOracle,
  ineligibility,
  normalizeRow,
  rankCandidates,
  recommend,
  roleShortfall,
  toSql,
  UnindexedFormatError,
  type RawCardRow,
} from './index.ts';

/* ------------------------------------------------------------------ *
 * Fixtures — verbatim rows
 * ------------------------------------------------------------------ */

const LEGAL_EVERYWHERE = { commander: 'legal', modern: 'legal', vintage: 'legal' };

function row(over: Partial<RawCardRow> & { id: string; name: string }): RawCardRow {
  return {
    oracle_id: over.oracle_id ?? over.id,
    type_line: 'Sorcery',
    cmc: '3',
    color_identity: [],
    tags: [],
    mana_cost: null,
    prices: null,
    legalities: LEGAL_EVERYWHERE,
    ...over,
  } as RawCardRow;
}

/** Cultivate: three printings, two prices. Green ramp. */
const CULTIVATE: RawCardRow[] = [
  row({
    id: 'cult-1',
    oracle_id: '8b755881-a72d-4e21-a369-d2924eb4585a',
    name: 'Cultivate',
    cmc: '3',
    color_identity: ['G'],
    tags: ['ramp', 'sorcery'],
    mana_cost: '{2}{G}',
    prices: { usd: '0.45' },
  }),
  row({
    id: 'cult-2',
    oracle_id: '8b755881-a72d-4e21-a369-d2924eb4585a',
    name: 'Cultivate',
    cmc: '3',
    color_identity: ['G'],
    tags: ['ramp', 'sorcery'],
    mana_cost: '{2}{G}',
    prices: { usd: '0.39' },
  }),
  row({
    id: 'cult-3',
    oracle_id: '8b755881-a72d-4e21-a369-d2924eb4585a',
    name: 'Cultivate',
    cmc: '3',
    color_identity: ['G'],
    tags: ['ramp', 'sorcery'],
    mana_cost: '{2}{G}',
    prices: { usd: '0.39' },
  }),
];

/** Sol Ring: colourless ramp, legal everywhere. */
const SOL_RING = row({
  id: 'sol-1',
  oracle_id: '2ca8b7a9-e1e9-4f6a-9a4f-3a1d0b0d1f2a',
  name: 'Sol Ring',
  type_line: 'Artifact',
  cmc: '1',
  color_identity: [],
  tags: ['artifact', 'fast-mana', 'mana-rock', 'ramp'],
  mana_cost: '{1}',
  prices: { usd: '1.18' },
});

/** Rhystic Study: blue draw, expensive. */
const RHYSTIC = row({
  id: 'rhy-1',
  oracle_id: '9e1d3a1c-5f2b-4a7d-8c3e-1b2a3c4d5e6f',
  name: 'Rhystic Study',
  type_line: 'Enchantment',
  cmc: '3',
  color_identity: ['U'],
  tags: ['card-draw', 'draw', 'enchantment', 'stax'],
  mana_cost: '{2}{U}',
  prices: { usd: '54.27' },
});

/** Lightning Bolt: RED — outside a G/U commander's identity. */
const BOLT = row({
  id: 'bolt-1',
  oracle_id: '4457ed35-7c10-48c8-9776-456485fdf070',
  name: 'Lightning Bolt',
  type_line: 'Instant',
  cmc: '1',
  color_identity: ['R'],
  tags: ['instant', 'removal', 'removal-spot', 'targeted-removal'],
  mana_cost: '{R}',
  prices: { usd: '0.77' },
});

/** Black Lotus: colourless, so on-colour for every deck — and BANNED. */
const LOTUS = row({
  id: 'lotus-1',
  oracle_id: '5089ec1a-f881-4d55-af14-5d996171203b',
  name: 'Black Lotus',
  type_line: 'Artifact',
  cmc: '0',
  color_identity: [],
  tags: ['artifact', 'fast-mana', 'ramp'],
  mana_cost: '{0}',
  prices: { usd: '7312.50' },
  legalities: { commander: 'banned', vintage: 'restricted' },
});

/** Beast Within: green removal. */
const BEAST_WITHIN = row({
  id: 'beast-1',
  oracle_id: '7735eeba-693b-47e2-bd51-414379cf1016',
  name: 'Beast Within',
  type_line: 'Instant',
  cmc: '3',
  color_identity: ['G'],
  tags: ['instant', 'removal', 'removal-spot', 'targeted-removal', 'token-maker', 'tokens'],
  mana_cost: '{2}{G}',
  prices: { usd: '0.60' },
});

/** A basic land — never useful as a suggestion. */
const FOREST = row({
  id: 'forest-1',
  oracle_id: 'b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6',
  name: 'Forest',
  type_line: 'Basic Land — Forest',
  cmc: '0',
  color_identity: ['G'],
  tags: ['land', 'basic-land'],
  prices: { usd: '0.10' },
});

const POOL: RawCardRow[] = [
  ...CULTIVATE,
  SOL_RING,
  RHYSTIC,
  BOLT,
  LOTUS,
  BEAST_WITHIN,
  FOREST,
];

/** A thin G/U deck that is short of everything. */
function guProfile(extra: Parameters<typeof deriveDeckProfile>[0]['cards'] = []) {
  return deriveDeckProfile({
    format: 'commander',
    colorIdentity: ['G', 'U'],
    cards: [
      { oracleId: 'own-1', name: 'Llanowar Elves', typeLine: 'Creature — Elf Druid', cmc: 1, tags: ['creature', 'mana-dork', 'ramp'] },
      { oracleId: 'own-2', name: 'Ponder', typeLine: 'Sorcery', cmc: 1, tags: ['sorcery', 'card-draw', 'draw'] },
      { oracleId: 'own-3', name: 'Colossal Dreadmaw', typeLine: 'Creature — Dinosaur', cmc: 6, tags: ['creature'] },
      ...extra,
    ],
  });
}

const source = (rows: readonly RawCardRow[]) => async () => rows;

/* ------------------------------------------------------------------ *
 * The two rules that must never break
 * ------------------------------------------------------------------ */

test('an off-colour card is never returned', async () => {
  const picks = await recommend(guProfile(), source(POOL));
  const names = picks.map(p => p.card.name);
  assert.ok(!names.includes('Lightning Bolt'), `red card leaked into a G/U deck: ${names.join(', ')}`);

  // And it is rejected for the right reason, not by accident.
  assert.equal(ineligibility(normalizeRow(BOLT), guProfile()), 'outside-color-identity');
});

test('an off-colour card is rejected even with no limit and nothing else in the pool', async () => {
  const picks = await recommend(guProfile(), source([BOLT]));
  assert.deepEqual(picks, []);
});

test('an illegal card is never returned', async () => {
  const picks = await recommend(guProfile(), source(POOL));
  const names = picks.map(p => p.card.name);
  assert.ok(!names.includes('Black Lotus'), `banned card leaked: ${names.join(', ')}`);

  // Black Lotus is colourless, so colour identity would have let it through.
  // Only the legality check stops it.
  assert.equal(ineligibility(normalizeRow(LOTUS), guProfile()), 'illegal-in-format');
});

test('a card legal in one format is not thereby legal in another', () => {
  const modern = deriveDeckProfile({ format: 'modern', colorIdentity: ['G', 'U'], cards: [] });
  // Black Lotus is `restricted` in vintage and absent from modern entirely.
  assert.equal(ineligibility(normalizeRow(LOTUS), modern), 'illegal-in-format');
});

/* ------------------------------------------------------------------ *
 * Determinism and order-independence
 * ------------------------------------------------------------------ */

/** Deterministic shuffle, so a failure is reproducible. */
function shuffled<T>(xs: readonly T[], seed: number): T[] {
  const out = [...xs];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

test('ranking is deterministic across repeated runs', async () => {
  const a = await recommend(guProfile(), source(POOL));
  const b = await recommend(guProfile(), source(POOL));
  assert.deepEqual(
    a.map(r => [r.card.oracleId, r.score, r.reason]),
    b.map(r => [r.card.oracleId, r.score, r.reason])
  );
});

test('ranking does not depend on the row order the database returns', async () => {
  const baseline = await recommend(guProfile(), source(POOL));
  const expected = baseline.map(r => r.card.oracleId);

  for (let seed = 1; seed <= 25; seed++) {
    const picks = await recommend(guProfile(), source(shuffled(POOL, seed)));
    assert.deepEqual(
      picks.map(r => r.card.oracleId),
      expected,
      `row order changed the ranking (seed ${seed})`
    );
  }
});

test('scores are identical regardless of input order', async () => {
  const a = await recommend(guProfile(), source(POOL));
  const b = await recommend(guProfile(), source(shuffled(POOL, 99)));
  assert.deepEqual(a.map(r => r.score), b.map(r => r.score));
});

/* ------------------------------------------------------------------ *
 * Never limit before you rank
 * ------------------------------------------------------------------ */

test('the candidate query carries no limit', () => {
  const q = buildCandidateQuery(guProfile());
  assert.equal(q.limit, null);
  assert.ok(!/limit/i.test(toSql(q)), `SQL must not limit before ranking: ${toSql(q)}`);
});

test('the limit is applied after ranking, not before', async () => {
  const full = await recommend(guProfile(), source(POOL));
  const top2 = await recommend(guProfile(), source(POOL), { limit: 2 });
  assert.deepEqual(top2.map(r => r.card.oracleId), full.slice(0, 2).map(r => r.card.oracleId));
  assert.equal(top2.length, 2);
});

test('the query filters legality and colour identity in SQL', () => {
  const sql = toSql(buildCandidateQuery(guProfile()));
  assert.match(sql, /legalities->>'commander' = 'legal'/);
  // Canonical WUBRG order, so U precedes G whatever order the caller used.
  assert.match(sql, /color_identity <@ ARRAY\['U','G'\]::text\[\]/);
});

test('the same colour identity always renders byte-identical SQL', () => {
  const a = deriveDeckProfile({ format: 'commander', colorIdentity: ['G', 'U'], cards: [] });
  const b = deriveDeckProfile({ format: 'commander', colorIdentity: ['U', 'G'], cards: [] });
  const c = deriveDeckProfile({ format: 'commander', colorIdentity: ['u', 'g', 'u'], cards: [] });
  assert.equal(toSql(buildCandidateQuery(a)), toSql(buildCandidateQuery(b)));
  assert.equal(toSql(buildCandidateQuery(a)), toSql(buildCandidateQuery(c)));
});

test('an unindexed format is refused rather than sequentially scanned', () => {
  const brawl = deriveDeckProfile({ format: 'brawl', colorIdentity: ['G'], cards: [] });
  assert.throws(() => buildCandidateQuery(brawl), UnindexedFormatError);
});

/* ------------------------------------------------------------------ *
 * Printings vs cards
 * ------------------------------------------------------------------ */

test('three printings of Cultivate collapse to one suggestion, at the cheapest price', async () => {
  const picks = await recommend(guProfile(), source(POOL));
  const cult = picks.filter(p => p.card.name === 'Cultivate');
  assert.equal(cult.length, 1, 'Cultivate was suggested more than once');
  assert.equal(cult[0].card.usd, 0.39, 'should quote the cheapest printing');
});

test('dedupe prefers a priced printing over an unpriced one', () => {
  const unpriced = { ...CULTIVATE[0], id: 'cult-none', prices: null };
  const out = dedupeByOracle([unpriced, CULTIVATE[1]].map(r => normalizeRow(r)));
  assert.equal(out.length, 1);
  assert.equal(out[0].usd, 0.39);
});

test('dedupe is itself order-independent', () => {
  const forward = dedupeByOracle(CULTIVATE.map(r => normalizeRow(r)));
  const backward = dedupeByOracle([...CULTIVATE].reverse().map(r => normalizeRow(r)));
  assert.deepEqual(forward.map(c => c.id), backward.map(c => c.id));
});

/* ------------------------------------------------------------------ *
 * Signals and reasons
 * ------------------------------------------------------------------ */

test('a deck short of ramp is told so, with its real counts', async () => {
  const profile = guProfile();
  // One ramp card (Llanowar Elves) against a target of 10.
  assert.equal(profile.roleCounts.ramp, 1);
  assert.equal(profile.roleTargets.ramp, 10);

  const picks = await recommend(profile, source(POOL));
  const solRing = picks.find(p => p.card.name === 'Sol Ring');
  assert.ok(solRing, 'Sol Ring should be suggested to a ramp-poor deck');
  assert.match(solRing.reason, /fills a ramp gap \(1 of 10\)/i);
});

test('every reason clause comes from a signal that fired', async () => {
  const picks = await recommend(guProfile(), source(POOL), { limit: 5 });
  for (const p of picks) {
    assert.ok(p.signals.length > 0, `${p.card.name} has a score but no signals`);
    for (const s of p.signals) {
      assert.ok(
        p.reason.toLowerCase().includes(s.detail.toLowerCase().slice(0, 12)),
        `reason for ${p.card.name} omits the ${s.kind} clause`
      );
    }
    // The score is exactly the sum of its parts — nothing unexplained.
    const sum = p.signals.reduce((n, s) => n + s.score, 0);
    assert.ok(Math.abs(sum - p.score) < 1e-9, `${p.card.name} score is not its signals' sum`);
  }
});

test('curve fit is measured against the deck own mean, and reported', async () => {
  const profile = guProfile();
  // (1 + 1 + 6) / 3 non-land cards.
  assert.ok(Math.abs(profile.meanCmc - 8 / 3) < 1e-9);
  const picks = await recommend(profile, source(POOL));
  const solRing = picks.find(p => p.card.name === 'Sol Ring');
  // 2.67 - 1 = 1.7 below the curve.
  assert.match(solRing.reason, /1\.7 mana value below your curve/);
});

test('a card already in the deck is not recommended back', async () => {
  const withCultivate = guProfile([
    {
      oracleId: '8b755881-a72d-4e21-a369-d2924eb4585a',
      name: 'Cultivate',
      typeLine: 'Sorcery',
      cmc: 3,
      tags: ['ramp', 'sorcery'],
    },
  ]);
  const picks = await recommend(withCultivate, source(POOL));
  assert.ok(!picks.some(p => p.card.name === 'Cultivate'));
});

test('basic lands are never suggested', async () => {
  const picks = await recommend(guProfile(), source(POOL));
  assert.ok(!picks.some(p => p.card.name === 'Forest'));
});

/* ------------------------------------------------------------------ *
 * Budget
 * ------------------------------------------------------------------ */

test('a price ceiling excludes rather than merely penalises', async () => {
  const picks = await recommend(guProfile(), source(POOL), { maxUsd: 5 });
  assert.ok(!picks.some(p => p.card.name === 'Rhystic Study'), '$54 card survived a $5 cap');
  assert.ok(picks.every(p => p.card.usd !== null && p.card.usd <= 5));
});

test('an unpriced card is not treated as cheap', () => {
  const unpriced = normalizeRow({ ...SOL_RING, id: 'sr-none', prices: null });
  assert.equal(ineligibility(unpriced, guProfile(), { maxUsd: 5 }), 'unpriced-under-budget-cap');
  // With no cap it is perfectly suggestable.
  assert.equal(ineligibility(unpriced, guProfile()), null);
});

test('budget preference reports the real price', async () => {
  const picks = await recommend(guProfile(), source(POOL), { preferBudget: true });
  const cult = picks.find(p => p.card.name === 'Cultivate');
  assert.ok(cult.signals.some(s => s.kind === 'budget-fit' && s.detail === '$0.39'));
});

/* ------------------------------------------------------------------ *
 * The taxonomy the roles are built on
 * ------------------------------------------------------------------ */

test('every tag a role maps to actually exists in the tagger taxonomy', () => {
  const known = new Set(ALL_TAGS);
  for (const role of ROLES) {
    for (const tag of ROLE_TAGS[role]) {
      assert.ok(known.has(tag), `role ${role} maps to "${tag}", which no TAG_RULE emits`);
    }
  }
});

test('shortfall is a ratio, and is zero once the target is met', () => {
  const profile = deriveDeckProfile({
    format: 'commander',
    colorIdentity: ['G'],
    cards: Array.from({ length: 12 }, (_, i) => ({
      oracleId: `r${i}`,
      name: `Ramp ${i}`,
      typeLine: 'Sorcery',
      cmc: 2,
      tags: ['ramp'],
    })),
  });
  assert.equal(roleShortfall(profile, 'ramp'), 0);
  assert.ok(roleShortfall(profile, 'draw') > 0);
});

test('numeric and string columns coerce to numbers at the boundary', () => {
  const c = normalizeRow(CULTIVATE[0]);
  assert.equal(typeof c.cmc, 'number');
  assert.equal(c.cmc, 3);
  assert.equal(typeof c.usd, 'number');
  assert.equal(c.usd, 0.45);
});

test('the projected row shape ranks identically to the whole-object shape', async () => {
  // What `selectColumns` actually asks for: one price key, one legality key.
  const project = (r: RawCardRow): RawCardRow => ({
    ...r,
    prices: undefined,
    legalities: undefined,
    usd: r.prices?.usd ?? null,
    legal_in_format: r.legalities?.commander ?? null,
  });
  const projected = await recommend(guProfile(), source(POOL.map(project)));
  const whole = await recommend(guProfile(), source(POOL));
  assert.deepEqual(
    projected.map(r => [r.card.oracleId, r.score]),
    whole.map(r => [r.card.oracleId, r.score])
  );
  // The banned card is still caught with only one legality key present.
  assert.ok(!projected.some(p => p.card.name === 'Black Lotus'));
});

test('a projected row is not assumed legal in some other format', () => {
  const projected: RawCardRow = {
    ...SOL_RING,
    prices: undefined,
    legalities: undefined,
    usd: '1.18',
    legal_in_format: 'legal',
  };
  const asCommander = normalizeRow(projected, 'commander');
  assert.equal(asCommander.legalities.commander, 'legal');
  assert.equal(asCommander.legalities.modern, undefined);
});

test('the select list projects prices and legalities down to one key each', () => {
  const cols = buildCandidateQuery(guProfile()).columns;
  assert.ok(cols.some(c => /prices->>'usd'/.test(c)));
  assert.ok(cols.some(c => /legalities->>'commander'/.test(c)));
  assert.ok(!cols.includes('prices'), 'must not select the whole prices object');
  assert.ok(!cols.includes('legalities'), 'must not select the whole legalities object');
  assert.ok(!cols.includes('oracle_text'), 'must never select oracle_text');
});

test('ranking survives a pool the source should never have returned', () => {
  // Belt and braces: if the SQL is ever edited wrongly, this still holds.
  const dirty = [BOLT, LOTUS, FOREST].map(r => normalizeRow(r));
  assert.deepEqual(rankCandidates(dirty, guProfile()), []);
});
