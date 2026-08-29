/**
 * Read the decks the deployed generator returned and print them for review.
 *
 * Everything here comes out of the saved response bodies in `.shots/gen-ten/`,
 * which were fetched from the deployed endpoint by `generator-ten-decks.mjs`
 * and `generator-ten-retry.mjs`. Nothing is recomputed from a snapshot and
 * nothing is estimated.
 *
 * "Keys off the commander" is the engine's own claim, not ours: `reason` on
 * each card is built by the ranker, and a card that matched something in the
 * commander's plan gets a clause that starts with the commander's name. So the
 * count is what the build said about itself, which is the thing worth checking.
 *
 *   node scripts/generator-ten-report.mjs            # shape table + overlap
 *   node scripts/generator-ten-report.mjs --lists    # and the whole list
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('.shots/gen-ten');
const { ROSTER, YURIKO_CURLY } = await import('./generator-roster.mjs');
const ALL = [...ROSTER, YURIKO_CURLY];

/*
 * Deployed first, always. A `.local.json` only appears for a commander the
 * deployed endpoint refused outright, and it is marked LOCAL everywhere it is
 * printed so no number out of it can be read as production behaviour.
 */
const decks = [];
for (const entry of ALL) {
  const deployed = path.join(DIR, `${entry.key}.deck.json`);
  const local = path.join(DIR, `${entry.key}.local.json`);
  if (fs.existsSync(deployed)) {
    decks.push({ entry, body: JSON.parse(fs.readFileSync(deployed, 'utf8')), where: 'deployed' });
  } else if (fs.existsSync(local)) {
    decks.push({ entry, body: JSON.parse(fs.readFileSync(local, 'utf8')), where: 'LOCAL' });
  }
}

const qty = c => Number(c.quantity) || 1;
const t = c => (c.type_line ?? '').toLowerCase();
const isLand = c => t(c).includes('land');

function shape(d) {
  const deck = d.body.result.deck;
  const a = d.body.result.analysis;
  const sum = pred => deck.filter(pred).reduce((s, c) => s + qty(c), 0);
  const nonLand = deck.filter(c => !isLand(c));
  const colourlessNonLand = sum(c => !isLand(c) && (c.color_identity ?? []).length === 0);
  const keys = sum(c => (c.reason ?? '').includes(d.entry.name.split(',')[0]));
  return {
    name: d.entry.name,
    where: d.where,
    total: sum(() => true),
    creatures: a.typeBreakdown.creatures,
    instants: a.typeBreakdown.instants,
    sorceries: a.typeBreakdown.sorceries,
    artifacts: a.typeBreakdown.artifacts,
    enchantments: a.typeBreakdown.enchantments,
    planeswalkers: a.typeBreakdown.planeswalkers,
    lands: a.typeBreakdown.lands,
    colourlessNonLand,
    avgMv: Number(a.avgCmc.toFixed(2)),
    keysOffCommander: keys,
    nonLandCount: nonLand.reduce((s, c) => s + qty(c), 0),
    power: a.power,
    band: a.band,
    bracket: a.bracket,
    castablePct: a.castability?.averagePct ?? null,
  };
}

const rows = decks.map(shape);

const pad = (x, n) => String(x).padEnd(n);
const rpad = (x, n) => String(x).padStart(n);
console.log('SHAPE');
console.log(
  pad('commander', 30),
  rpad('tot', 4),
  rpad('cr', 3),
  rpad('in', 3),
  rpad('so', 3),
  rpad('ar', 3),
  rpad('en', 3),
  rpad('pw', 3),
  rpad('ld', 3),
  rpad('c/less', 7),
  rpad('avgMV', 6),
  rpad('keys', 5),
  rpad('pwr', 4),
  '  source'
);
for (const r of rows) {
  console.log(
    pad(r.name, 30),
    rpad(r.total, 4),
    rpad(r.creatures, 3),
    rpad(r.instants, 3),
    rpad(r.sorceries, 3),
    rpad(r.artifacts, 3),
    rpad(r.enchantments, 3),
    rpad(r.planeswalkers, 3),
    rpad(r.lands, 3),
    rpad(r.colourlessNonLand, 7),
    rpad(r.avgMv, 6),
    rpad(r.keysOffCommander, 5),
    rpad(r.power, 4),
    '  ' + r.where
  );
}

/* ---- pairwise overlap ------------------------------------------------ *
 * Counted on oracle_id so two printings of one card are one card, and with
 * basic lands EXCLUDED and reported separately, because every white deck
 * playing Plains is not two commanders producing the same deck.            */
console.log('\nPAIRWISE OVERLAP (distinct nonbasic cards shared)');
const sets = decks.map(d => ({
  name: d.entry.name,
  ci: d.entry.color_identity,
  all: new Set(d.body.result.deck.filter(c => !c.isBasicLand).map(c => c.oracle_id ?? c.name)),
  spells: new Set(
    d.body.result.deck.filter(c => !isLand(c)).map(c => c.oracle_id ?? c.name)
  ),
}));
const inter = (a, b) => [...a].filter(x => b.has(x)).length;
const shareColour = (a, b) => a.ci.some(c => b.ci.includes(c)) || (!a.ci.length && !b.ci.length);

console.log(pad('', 30), sets.map(s => rpad(s.name.slice(0, 6), 7)).join(''));
for (const a of sets) {
  const line = sets.map(b => (a === b ? rpad('-', 7) : rpad(inter(a.all, b.all), 7))).join('');
  console.log(pad(a.name, 30), line);
}
console.log('\nSPELLS ONLY (lands excluded entirely)');
console.log(pad('', 30), sets.map(s => rpad(s.name.slice(0, 6), 7)).join(''));
for (const a of sets) {
  const line = sets.map(b => (a === b ? rpad('-', 7) : rpad(inter(a.spells, b.spells), 7))).join('');
  console.log(pad(a.name, 30), line);
}

const pairs = [];
for (let i = 0; i < sets.length; i++)
  for (let j = i + 1; j < sets.length; j++)
    pairs.push({
      a: sets[i].name,
      b: sets[j].name,
      all: inter(sets[i].all, sets[j].all),
      spells: inter(sets[i].spells, sets[j].spells),
      colourOverlap: shareColour(sets[i], sets[j]),
    });
pairs.sort((x, y) => y.spells - x.spells);
console.log('\nWORST FIVE PAIRS BY SHARED SPELLS');
for (const p of pairs.slice(0, 5))
  console.log(`  ${p.spells} spells, ${p.all} cards: ${p.a} / ${p.b}`);
const sharing = pairs.filter(p => p.colourOverlap);
const avg = arr => (arr.reduce((s, x) => s + x, 0) / arr.length).toFixed(1);
console.log(
  `\n  ${pairs.length} pairs. Mean shared spells ${avg(pairs.map(p => p.spells))}, ` +
    `and among the ${sharing.length} pairs that share at least one colour, ${avg(sharing.map(p => p.spells))}.`
);

/* ---- the whole list -------------------------------------------------- */
if (process.argv.includes('--lists')) {
  const ORDER = [
    ['Creatures', c => t(c).includes('creature') && !isLand(c)],
    ['Planeswalkers', c => t(c).includes('planeswalker')],
    ['Instants', c => t(c).includes('instant')],
    ['Sorceries', c => t(c).includes('sorcery')],
    ['Artifacts', c => t(c).includes('artifact') && !t(c).includes('creature') && !isLand(c)],
    ['Enchantments', c => t(c).includes('enchantment') && !t(c).includes('artifact') && !t(c).includes('creature')],
    ['Lands', isLand],
  ];
  for (const d of decks) {
    const deck = d.body.result.deck;
    const a = d.body.result.analysis;
    console.log(`\n${'='.repeat(74)}`);
    console.log(
      `${d.entry.name}  —  ${d.entry.archetype}/${d.entry.style}  ` +
        `[${d.where === 'deployed' ? 'from the deployed function' : 'LOCAL RUN, the deployed function refuses this commander'}]`
    );
    console.log(`WHY THIS COMMANDER: ${d.entry.why}`);
    console.log(
      `power ${a.power} (${a.band}, bracket ${a.bracket}), castable ${a.castability?.averagePct}%, ` +
        `avg mana value ${a.avgCmc.toFixed(2)}`
    );
    console.log(`plan wants: ${(a.evidence?.plan?.wants ?? []).map(w => w.facet).join(', ') || 'none'}`);
    const claimed = new Set();
    for (const [label, pred] of ORDER) {
      const group = deck.filter(c => !claimed.has(c) && pred(c));
      for (const c of group) claimed.add(c);
      if (!group.length) continue;
      group.sort((x, y) => (x.cmc ?? 0) - (y.cmc ?? 0) || x.name.localeCompare(y.name));
      const n = group.reduce((s, c) => s + qty(c), 0);
      console.log(`\n  ${label} (${n})`);
      for (const c of group) {
        const usd = c.prices?.usd;
        const price = usd == null || usd === '' ? '' : `$${Number(usd).toFixed(2)}`;
        const rank = c.edhrec_rank == null ? 'unranked' : `#${c.edhrec_rank}`;
        console.log(
          `    ${qty(c)} ${pad(c.name, 32)} ${rpad(c.mana_cost || '', 12)} ${rpad(rank, 9)} ${rpad(price, 8)} ${c.role}`
        );
      }
    }
    const leftover = deck.filter(c => !claimed.has(c));
    if (leftover.length) console.log(`\n  UNGROUPED: ${leftover.map(c => c.name).join(', ')}`);
  }
}
