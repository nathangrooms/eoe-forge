/**
 * Mana base and curve audit for the eleven generated decks.
 *
 * Reads the deck JSON the deployed generator returned (`.shots/gen-ten/*.deck.json`)
 * plus the three `*.local.json` built from repo code because the deployed function
 * refuses three-colour commanders, joins `produced_mana` from the live catalogue
 * (`.shots/gen-ten/card-meta.json`, fetched over PostgREST), and answers one
 * question per deck: can this deck cast its own cards?
 *
 * Requirement side is Frank Karsten's hypergeometric method, re-simulated for
 * 99-card Commander decks by teryror:
 * https://gist.github.com/teryror/881d60e08480a56043895d3bbb83c374
 * section "Adjustments Based on Casting Costs", table "Commander decks (99 cards)".
 * The table is transcribed below so the numbers are auditable without a fetch.
 *
 * Two things this script does that a naive count does not:
 *  - a fetchland is a source only while a target is left in the deck, so the
 *    contribution of the fetch package is capped at the number of fetchable
 *    lands the deck actually holds;
 *  - a land whose coloured mana is gated on a creature type (Cavern of Souls,
 *    Secluded Courtyard, Unclaimed Territory, Plaza of Heroes, Three Tree City)
 *    is counted separately, because in a deck that is not tribal it taps for
 *    colourless and nothing else.
 *
 *   node scripts/mana-and-curve-audit.mjs
 */
import fs from 'node:fs';

const RAW = `
24|15|15 22|13 19 23|11 17 21 24|10 15 19 22 24|9 13 17 20 22 24|8 12 15 18 20 23 24|7 10 13 16 19 21 23 24
25|15|15 23|13 20 24|11 17 22 25|10 15 20 23 25|9 14 17 21 23 25|8 12 16 19 21 24 25|7 11 14 17 20 22 24 25
26|16|16 23|14 20 25|12 18 23 26|11 16 20 24 26|9 14 18 21 24 26|8 13 16 19 22 24 26|7 11 15 18 20 23 25 26
27|16|16 24|14 21 26|12 19 23 27|11 17 21 25 27|10 15 19 22 25 27|9 13 17 20 23 25 27|8 12 15 18 21 24 26 27
28|17|16 25|14 22 27|13 19 24 28|11 17 22 25 28|10 15 19 23 26 28|9 14 17 21 24 26 28|8 12 16 19 22 24 27 28
29|17|17 25|15 22 28|13 20 25 29|12 18 23 26 29|10 16 20 24 27 29|9 14 18 22 25 27 29|8 13 16 20 23 25 28 29
30|18|17 26|15 23 29|14 20 26 30|12 18 23 27 30|11 16 21 25 28 30|9 15 19 22 26 28 30|8 13 17 20 23 26 28 30
31|18|18 27|16 24 30|14 21 27 31|13 19 24 28 31|11 17 21 25 29 31|10 15 19 23 26 29 31|9 13 18 21 24 27 29 31
32|18|18 27|16 24 30|14 22 27 31|13 20 25 29 32|11 17 22 26 30 32|10 15 20 24 27 30 32|9 14 18 22 25 28 30 32
33|19|18 28|16 25 31|15 22 28 32|13 20 25 30 33|12 18 23 27 30 33|10 16 21 25 28 31 33|9 14 19 22 26 29 31 33
34|19|19 29|17 26 32|15 23 29 33|14 21 26 31 34|12 18 23 28 31 34|11 16 21 25 29 32 34|10 15 19 23 27 30 32 34
35|20|19 29|17 26 33|15 23 30 34|14 21 27 31 35|12 19 24 29 32 35|11 17 22 26 30 33 35|10 15 20 24 27 30 33 35
36|20|19 30|17 27 34|16 24 30 35|14 22 28 32 36|13 19 25 29 33 36|11 17 22 27 30 34 36|10 16 20 24 28 31 34 36
37|20|20 30|18 27 35|16 25 31 36|15 22 28 33 37|13 20 25 30 34 37|12 18 23 27 31 35 37|10 16 21 25 29 32 35 37
38|21|20 31|18 28 35|17 25 32 37|15 23 29 34 38|13 20 26 31 35 38|12 18 24 28 32 35 38|11 17 21 26 30 33 36 38
39|21|20 31|18 28 36|17 26 33 38|15 23 30 35 39|14 21 27 32 36 39|12 19 24 29 33 36 39|11 17 22 26 30 34 37 39
40|21|21 32|19 29 37|17 26 33 39|16 24 30 36 40|14 21 27 32 37 40|13 19 25 30 34 37 40|11 17 23 27 31 35 38 40
41|22|21 32|19 29 37|17 27 34 40|16 24 31 36 40|14 22 28 33 37 41|13 20 25 30 35 38 41|12 18 23 28 32 35 39 41
42|22|21 33|19 30 38|18 27 35 40|16 25 32 37 41|15 22 29 34 38 42|13 20 26 31 35 39 42|12 18 24 28 33 36 40 42
43|22|21 33|20 30 39|18 28 35 41|17 25 32 38 42|15 23 29 35 39 43|13 21 26 32 36 40 43|12 19 24 29 33 37 40 43
44|23|22 34|20 31 40|18 28 36 42|17 26 33 39 43|15 23 30 35 40 44|14 21 27 32 37 41 44|12 19 25 30 34 38 41 44
45|23|22 34|20 31 40|19 29 37 43|17 26 33 39 44|16 24 30 36 41 45|14 21 28 33 38 42 45|13 19 25 30 35 39 42 45
`.trim();

const KARSTEN = {};
for (const line of RAW.split('\n')) {
  const parts = line.split('|');
  KARSTEN[Number(parts[0])] = {};
  for (let mv = 1; mv <= parts.length - 1; mv++) {
    KARSTEN[Number(parts[0])][mv] = parts[mv].trim().split(/\s+/).map(Number);
  }
}
const need = (lands, mv, pips) => {
  const L = Math.max(24, Math.min(45, lands));
  const arr = KARSTEN[L][Math.max(1, Math.min(8, mv))];
  return arr ? (arr[Math.min(pips, arr.length) - 1] ?? null) : null;
};

const FETCH_TYPES = {
  'Flooded Strand': ['Plains', 'Island'],
  'Polluted Delta': ['Island', 'Swamp'],
  'Bloodstained Mire': ['Swamp', 'Mountain'],
  'Wooded Foothills': ['Mountain', 'Forest'],
  'Windswept Heath': ['Forest', 'Plains'],
  'Marsh Flats': ['Plains', 'Swamp'],
  'Scalding Tarn': ['Island', 'Mountain'],
  'Verdant Catacombs': ['Swamp', 'Forest'],
  'Arid Mesa': ['Mountain', 'Plains'],
  'Misty Rainforest': ['Forest', 'Island'],
};
/* these can only find a BASIC land */
const BASIC_ONLY_FETCH = new Set([
  'Prismatic Vista', 'Fabled Passage', 'Terramorphic Expanse', 'Evolving Wilds',
  'Escape Tunnel', 'Cabaretti Courtyard', 'Riveteers Overlook',
]);
const TYPE_COLOUR = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' };
const ALL_TYPES = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
/* coloured mana gated on naming a creature type */
const TRIBAL_GATED = new Set([
  'Cavern of Souls', 'Secluded Courtyard', 'Unclaimed Territory',
  'Plaza of Heroes', 'Three Tree City',
]);

const meta = Object.fromEntries(
  JSON.parse(fs.readFileSync('.shots/gen-ten/card-meta.json', 'utf8')).map((c) => [c.id, c]),
);

const pipsOf = (cost) => {
  const out = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  if (!cost) return out;
  for (const sym of cost.match(/\{[^}]+\}/g) ?? []) {
    const s = sym.slice(1, -1);
    if (/^\d+$/.test(s) || s === 'X' || s === 'Y' || s === 'Z') continue;
    if (s.includes('/')) continue; /* hybrid or phyrexian: payable more than one way */
    if (out[s] !== undefined) out[s]++;
  }
  return out;
};

function analyse(file, key, archetype) {
  const raw = JSON.parse(fs.readFileSync(`.shots/gen-ten/${file}`, 'utf8'));
  const r = raw.result;
  const cmd = r.commander;
  const identity = (cmd.color_identity ?? []).slice();

  const cards = [];
  for (const c of r.deck) for (let i = 0; i < (c.quantity ?? 1); i++) cards.push(c);
  const lands = cards.filter((c) => (c.type_line ?? '').includes('Land'));
  const spells = cards.filter((c) => !(c.type_line ?? '').includes('Land'));

  const basics = lands.filter((l) => l.isBasicLand || /^Basic Land/.test(l.type_line ?? ''));
  const basicTypes = {};
  for (const b of basics) for (const t of ALL_TYPES) if ((b.type_line ?? '').includes(t)) basicTypes[t] = (basicTypes[t] ?? 0) + 1;
  const anyTypes = {};
  for (const l of lands) for (const t of ALL_TYPES) if ((l.type_line ?? '').includes(t)) anyTypes[t] = (anyTypes[t] ?? 0) + 1;

  /* ---- classify every land -------------------------------------------- */
  const untappedFull = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };  /* unconditional colour */
  const gated = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };          /* creature-type gated */
  const painNames = [];
  const tribalNames = [];
  const colourlessOnly = [];
  const dead = [];
  const fetchRows = [];

  for (const l of lands) {
    const name = l.name;
    const txt = l.oracle_text ?? '';
    const low = txt.toLowerCase();
    if (FETCH_TYPES[name] || BASIC_ONLY_FETCH.has(name)) {
      const types = FETCH_TYPES[name] ?? ALL_TYPES;
      const basicOnly = BASIC_ONLY_FETCH.has(name);
      const finds = new Set();
      for (const t of types) {
        const pool = basicOnly ? (basicTypes[t] ?? 0) : (anyTypes[t] ?? 0);
        if (pool > 0) finds.add(TYPE_COLOUR[t]);
      }
      fetchRows.push({ name, basicOnly, finds: [...finds].sort().join('') || 'NOTHING' });
      continue;
    }
    let pm = meta[l.id]?.produced_mana ?? [];
    if (low.includes("commander's color identity") || low.includes('commander’s color identity')) {
      pm = identity.slice();
    }
    /* Reflecting Pool taps for any type YOUR lands produce, and colourless is a
     * type; the catalogue's produced_mana omits C, so add it back. */
    if (name === 'Reflecting Pool' && !pm.includes('C')) pm = pm.concat('C');
    const useful = pm.filter((c) => identity.includes(c));
    const makesC = pm.includes('C') || /Add \{C\}/.test(txt);
    if (/deals 1 damage to you|Pay 1 life: Add|deals 2 damage to you/.test(txt)) painNames.push(name);
    if (TRIBAL_GATED.has(name)) {
      tribalNames.push(name);
      for (const c of useful) gated[c]++;
      if (makesC) untappedFull.C++;
      continue;
    }
    if (useful.length === 0) {
      if (makesC) colourlessOnly.push(name);
      else if (pm.length) dead.push({ name, why: `taps only for ${pm.join('')}, which this deck cannot spend on a coloured cost` });
      else dead.push({ name, why: 'taps for no mana at all' });
      if (makesC) untappedFull.C++;
      continue;
    }
    for (const c of useful) untappedFull[c]++;
    if (makesC) untappedFull.C++;
  }

  /* fetch contribution, capped by the number of targets left in the deck */
  const fetchSrc = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const targetsFor = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const basicTargetsFor = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const t of ALL_TYPES) {
    targetsFor[TYPE_COLOUR[t]] += anyTypes[t] ?? 0;
    basicTargetsFor[TYPE_COLOUR[t]] += basicTypes[t] ?? 0;
  }
  const totalTargets = Object.values(anyTypes).reduce((a, b) => a + b, 0);
  const totalBasicTargets = basics.length;
  const fetchCount = fetchRows.length;
  /* fetches able to resolve at all, deck-wide */
  const liveFetches = Math.min(fetchCount, totalTargets);
  const deadFetches = fetchCount - liveFetches;
  for (const c of ['W', 'U', 'B', 'R', 'G']) {
    const able = fetchRows.filter((f) => f.finds.includes(c)).length;
    fetchSrc[c] = Math.min(able, targetsFor[c]);
  }

  /* non-land mana, read from rules text: the catalogue only carries
   * produced_mana for lands */
  /* A mana source is a PERMANENT with a repeatable mana ability. A sorcery that
   * makes a Treasure is a one-shot and is not a source, which is the distinction
   * Karsten's counts rest on. Both are reported, separately. */
  const rocks = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  const rockNames = [];
  const oneShotMana = [];
  const PERMANENT = /Artifact|Creature|Enchantment|Planeswalker|Battle/;
  for (const s of spells) {
    const txt = s.oracle_text ?? '';
    if (!/Add /.test(txt)) continue;
    const hits = new Set();
    if (/mana of any color|mana in any combination of colors/.test(txt)) for (const c of identity) hits.add(c);
    for (const m of txt.match(/Add[^.\n]*/g) ?? []) for (const sym of m.match(/\{[WUBRGC]\}/g) ?? []) hits.add(sym.slice(1, -1));
    if (!hits.size) continue;
    const repeatable = PERMANENT.test(s.type_line ?? '') && /\{T\}[^:\n]*:[^\n]*Add|\{T\},[^:\n]*:[^\n]*Add/.test(txt);
    if (!repeatable) { oneShotMana.push(`${s.name} (mv ${s.cmc}, ${(s.type_line ?? '').split(' ')[0]})`); continue; }
    rockNames.push(`${s.name} (mv ${s.cmc}) -> ${[...hits].join('')}`);
    for (const c of hits) if (rocks[c] !== undefined) rocks[c]++;
  }
  /* land ramp and treasure makers, for the "can it reach its commander" read */
  const basicSearchers = spells.filter((s) => /basic land/i.test(s.oracle_text ?? '') && /[Ss]earch your library/.test(s.oracle_text ?? '')).map((s) => `${s.name} (mv ${s.cmc})`);
  const anyLandSearchers = spells.filter((s) => /[Ss]earch your library for a land card|[Ss]earch your library for a .* land card/.test(s.oracle_text ?? '') && !/basic land/i.test(s.oracle_text ?? '')).map((s) => `${s.name} (mv ${s.cmc})`);
  const rampNames = spells.filter((s) => {
    const t = s.oracle_text ?? '';
    return /Search your library for (a|up to \w+) basic land|Search your library for a land card|[Cc]reate (a|two|three|X) Treasure token/.test(t);
  }).map((s) => `${s.name} (mv ${s.cmc})`);
  const entersTapped = lands.filter((l) => /enters tapped|enters the battlefield tapped/i.test(l.oracle_text ?? '')).map((l) => l.name);
  const creatures = spells.filter((s) => /Creature/.test(s.type_line ?? ''));
  const powerSum = creatures.reduce((a, s) => a + (Number(meta[s.id]?.power ?? NaN) || 0), 0);

  const src = {};
  for (const c of ['W', 'U', 'B', 'R', 'G']) src[c] = untappedFull[c] + fetchSrc[c];
  src.C = untappedFull.C;

  const curve = {};
  for (const s of spells) {
    const b = s.cmc >= 7 ? '7+' : String(s.cmc);
    curve[b] = (curve[b] ?? 0) + 1;
  }
  const avgMv = spells.reduce((a, s) => a + (s.cmc ?? 0), 0) / spells.length;

  const check = (cost, cmc) => {
    const p = pipsOf(cost);
    const colours = ['W', 'U', 'B', 'R', 'G'].filter((x) => p[x] > 0).length;
    const out = [];
    for (const c of ['W', 'U', 'B', 'R', 'G', 'C']) {
      if (!p[c]) continue;
      const req = (need(lands.length, Math.max(1, Math.round(cmc)), p[c]) ?? 0) + (colours > 1 ? 1 : 0);
      const haveLands = src[c] ?? 0;
      const have = haveLands + (rocks[c] ?? 0);
      out.push({ colour: c, pips: p[c], req, haveLands, have, short: req - have, shortLands: req - haveLands });
    }
    return out;
  };

  const rows = spells.map((s) => {
    const worst = check(s.mana_cost, s.cmc);
    return {
      name: s.name, cmc: s.cmc, cost: s.mana_cost, type: s.type_line, role: s.role,
      reason: s.reason, rank: s.edhrec_rank, usd: s.prices?.usd ?? null,
      worst, short: worst.filter((w) => w.short > 0).sort((a, b) => b.short - a.short),
      shortLandsOnly: worst.filter((w) => w.shortLands > 0).sort((a, b) => b.shortLands - a.shortLands),
    };
  });

  const pipTotals = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const s of spells) { const p = pipsOf(s.mana_cost); for (const c of Object.keys(pipTotals)) pipTotals[c] += p[c]; }

  return {
    key, name: cmd.name, cmdCost: cmd.mana_cost, cmdCmc: cmd.cmc, identity, archetype,
    landCount: lands.length, spellCount: spells.length, total: cards.length,
    basics: basics.length, basicTypes, anyTypes,
    untappedFull, gated, tribalNames, painNames, colourlessOnly, dead,
    fetchRows, fetchCount, liveFetches, deadFetches, totalTargets, totalBasicTargets,
    fetchSrc, targetsFor, basicTargetsFor,
    src, rocks, rockNames, oneShotMana, rampNames, basicSearchers, anyLandSearchers,
    entersTapped, creatureCount: creatures.length, powerSum,
    pipTotals, curve, avgMv, rows,
    commanderCheck: check(cmd.mana_cost, cmd.cmc),
    engineCastability: (r.analysis?.subscores ?? []).find((s) => s.key === 'castability') ?? null,
    power: r.analysis?.power ?? null,
    landList: lands.map((l) => l.name),
  };
}

const FILES = [
  ['adeline.deck.json', 'adeline', 'tokens / creatures'],
  ['nivmizzet.deck.json', 'nivmizzet', 'value / spells'],
  ['meren.deck.json', 'meren', 'value / creatures'],
  ['windgrace.local.json', 'windgrace', 'big-mana / balanced (local build)'],
  ['uril.local.json', 'uril', 'aggro / balanced (local build)'],
  ['gaaiv.deck.json', 'gaaiv', 'control / spells'],
  ['teysa.deck.json', 'teysa', 'aristocrats / creatures'],
  ['ghalta.deck.json', 'ghalta', 'big-mana / creatures'],
  ['edgar.local.json', 'edgar', 'aggro / creatures (local build)'],
  ['kozilek.deck.json', 'kozilek', 'big-mana / balanced'],
  ['yuriko-curly.deck.json', 'yuriko', 'aggro / balanced'],
];

const all = FILES.map(([f, k, a]) => analyse(f, k, a));
fs.writeFileSync('.shots/gen-ten/mana-curve-audit.json', JSON.stringify(all, null, 1));

const order = ['0', '1', '2', '3', '4', '5', '6', '7+'];
for (const d of all) {
  console.log('\n' + '='.repeat(80));
  console.log(`${d.name} ${d.cmdCost} [${d.identity.join('') || 'colourless'}]  asked for: ${d.archetype}`);
  console.log(`lands ${d.landCount} | spells ${d.spellCount} | total ${d.total} | basics ${d.basics} ${JSON.stringify(d.basicTypes)} | avgMV ${d.avgMv.toFixed(2)} | power ${d.power}`);
  console.log('curve  ' + order.filter((k) => d.curve[k]).map((k) => `${k}:${d.curve[k]}`).join('  '));
  for (const c of (d.identity.length ? d.identity : ['C'])) {
    console.log(`  ${c}: unconditional lands ${d.untappedFull[c]} + live fetches ${d.fetchSrc[c] ?? 0} = ${d.src[c]} lands; tribal-gated ${d.gated[c] ?? 0}; rocks ${d.rocks[c]}; total ${d.src[c] + d.rocks[c]}. Pips of ${c} in deck: ${d.pipTotals[c]}`);
  }
  console.log(`fetchlands ${d.fetchCount}, fetchable targets in deck ${d.totalTargets} (basics ${d.totalBasicTargets}) -> ${d.deadFetches} fetches can never resolve`);
  console.log(`tribal-gated lands (${d.tribalNames.length}): ${d.tribalNames.join(', ') || 'none'}`);
  console.log(`pay-life / damage lands (${d.painNames.length}): ${d.painNames.join(', ') || 'none'}`);
  if (d.dead.length) console.log('DEAD: ' + d.dead.map((x) => `${x.name} (${x.why})`).join('; '));
  console.log(`commander ${d.cmdCost}: ` + d.commanderCheck.map((w) => `${w.colour}x${w.pips} needs ${w.req}, lands ${w.haveLands} +rocks = ${w.have}${w.short > 0 ? ' SHORT ' + w.short : ' ok'}`).join(' | '));
  const shortRows = d.rows.filter((x) => x.short.length);
  console.log(`spells short of the Karsten requirement: ${shortRows.length} of ${d.rows.length}`);
  for (const x of shortRows.sort((a, b) => b.short[0].short - a.short[0].short).slice(0, 12)) {
    console.log('   ' + x.name + ' ' + x.cost + ` mv${x.cmc}  ` + x.short.map((s) => `${s.colour}x${s.pips} needs ${s.req} has ${s.have} (short ${s.short})`).join(', '));
  }
  console.log(`lands that enter tapped: ${d.entersTapped.length} (${d.entersTapped.join(', ') || 'none'})`);
  console.log(`repeatable mana permanents (${d.rockNames.length}): ${d.rockNames.join(' | ') || 'NONE'}`);
  console.log(`one-shot mana spells, NOT counted as sources (${d.oneShotMana.length}): ${d.oneShotMana.join(', ') || 'none'}`);
  console.log(`searches for a BASIC land (${d.basicSearchers.length}) vs ${d.basics} basics in deck: ${d.basicSearchers.join(', ') || 'none'}`);
  console.log(`searches for any land (${d.anyLandSearchers.length}): ${d.anyLandSearchers.join(', ') || 'none'}`);
  console.log(`creatures ${d.creatureCount}, total printed power ${d.powerSum}`);
  console.log('engine castability claim: ' + (d.engineCastability ? d.engineCastability.measured : 'n/a'));
}
