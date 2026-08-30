/**
 * Does the deck understand the commander, and does it play the format's
 * auto-includes? The two questions the friend's verdict raised, measured
 * together, because fixing one at the expense of the other is what tuning the
 * single ranker did twice.
 *
 * Owner relaying a friend on the deployed generator: "lots of the strategies
 * arent right or are limited, what it produces barely synergises with the
 * commander ... there are cards he would absolutely never include". And on the
 * obvious counter-fix: "Rank cannot be the answer, he even said only showing
 * top 15k is a problem as low rank cards can be good still".
 *
 * So this reports four things per deck and none of them alone is the verdict:
 *
 *   KEYED     cards the commander's own plan asks for (planFit > 0). Low means
 *             the deck is generic. This is the friend's main complaint.
 *   STAPLES   how many of the format's auto-includes it found, out of the ones
 *             legal in its colours. Zero means it built a themed pile that no
 *             player would keep.
 *   RANK      median edhrec_rank. Reported, NOT optimised: a deck of rank-100
 *             cards is the "random high edh cards" the owner named. A wide
 *             spread with high KEYED is the shape we want, so a rising median
 *             here is not automatically bad news.
 *   ORPHANS   payoffs whose enabler is not in the deck. The friend's example:
 *             a card drawing on an enchantment cast, in a deck with two
 *             enchantments.
 *
 * LOCAL BUILD, NOT THE DEPLOYED FUNCTION. Same pipeline.ts over the live
 * catalogue, on a machine with no CPU budget. Never quote it as production.
 *
 *   node --experimental-strip-types scripts/generator-synergy-audit.mjs
 *   COMMANDERS=adeline,ghalta node --experimental-strip-types scripts/generator-synergy-audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

import { Catalog } from '../supabase/functions/ai-deck-builder-v2/catalog.ts';
import { build, ENGINE_VERSION } from '../supabase/functions/ai-deck-builder-v2/pipeline.ts';
import { planForCommander, planFit } from '../src/engine/knowledge/behaviour.ts';
import { facetsForCard } from '../src/lib/deck/recommend/behaviour.ts';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

/* The colourless auto-includes plus the cheap per-colour ones. Deliberately
   short and deliberately uncontroversial: every one of these is a card a
   Commander player would notice the ABSENCE of. Each carries the colours it
   needs so a mono-red deck is not marked down for missing a blue card. */
const STAPLES = [
  { name: 'Sol Ring', colors: '' },
  { name: 'Arcane Signet', colors: '' },
  { name: 'Command Tower', colors: '' },
  { name: 'Swiftfoot Boots', colors: '' },
  { name: 'Lightning Greaves', colors: '' },
  { name: 'Skullclamp', colors: '' },
  { name: 'Swords to Plowshares', colors: 'W' },
  { name: 'Path to Exile', colors: 'W' },
  { name: 'Cyclonic Rift', colors: 'U' },
  { name: 'Counterspell', colors: 'U' },
  { name: 'Rhystic Study', colors: 'U' },
  { name: 'Demonic Tutor', colors: 'B' },
  { name: 'Village Rites', colors: 'B' },
  { name: 'Chaos Warp', colors: 'R' },
  { name: 'Cultivate', colors: 'G' },
  { name: 'Rampant Growth', colors: 'G' },
  { name: 'Beast Within', colors: 'G' },
];

/* A payoff and the support it needs. Only patterns where the dependency is
   unambiguous, because a false orphan reads as a bug in a deck that is fine. */
const PAYOFFS = [
  { what: 'enchantment cast', payoff: /whenever you cast an enchantment/i, type: 'Enchantment', floor: 10 },
  { what: 'artifact cast', payoff: /whenever you cast an artifact/i, type: 'Artifact', floor: 10 },
  { what: 'equipment payoff', payoff: /whenever equipped|equipped creature/i, type: 'Equipment', floor: 4 },
];

const KEYS = (process.env.COMMANDERS ?? 'adeline,nivmizzet,meren,teysa,ghalta,kozilek')
  .split(',').map(s => s.trim()).filter(Boolean);

const { ROSTER } = await import('./generator-roster.mjs');
const OUT = path.resolve('.shots/synergy-audit');
fs.mkdirSync(OUT, { recursive: true });

const median = (xs) => {
  const s = xs.filter(n => typeof n === 'number' && n > 0).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

const pad = (n) => ' '.repeat(n);

console.log(`local build against ${ENGINE_VERSION}`);
console.log('');

const rows = [];
for (const key of KEYS) {
  const entry = ROSTER.find(e => e.key === key);
  if (!entry) { console.log(`${key}: not in the roster`); continue; }

  const catalog = new Catalog({ url: SUPABASE_URL, anonKey: ANON, authorization: null });
  const started = Date.now();
  const result = await build({
    catalog,
    request: {
      commander: {
        id: entry.id, name: entry.name, type_line: entry.type_line,
        color_identity: entry.color_identity, colors: entry.colors,
      },
      archetype: entry.archetype, style: entry.style, powerLevel: 7,
      useAIPlanning: false, includeLands: true,
    },
    apiKey: null,
    startedAt: started,
  });
  const ms = Date.now() - started;
  if (result.kind !== 'ok') { console.log(`${entry.name}: REFUSED ${result.error}`); continue; }

  const deck = result.body.result.deck;
  const cardOf = (d) => d.card ?? d;
  const lineOf = (d) => cardOf(d).type_line ?? cardOf(d).typeLine ?? '';
  const textOf = (d) => cardOf(d).oracle_text ?? cardOf(d).oracleText ?? '';
  const nonLand = deck.filter(d => !lineOf(d).toLowerCase().includes('land'));

  /* The commander's own record, read the same way the ranker reads it.
     The roster carries no oracle text, and a plan built from an empty string
     has no wants, so every card scores zero fit and the audit reports 0%
     while the generator is fine. Fetch the real text. */
  /* BY NAME, which is how `pipeline.ts` resolves a commander (`cardsByName`),
     and not by the roster's id.

     `cards_unique` holds ONE printing per oracle_id, the cheapest, so a
     printing id taken from `cards` is usually not in it. The roster's Kozilek
     id was c41554e7 and the representative printing is f06fc6e0, so this fetch
     returned nothing, the plan had no wants, every card scored zero fit, and
     the audit printed "keyed 23%" beside a line saying it could not judge fit
     at all. Two runs were read past that line before anybody noticed it was
     the MEASUREMENT that was broken and not the generator.

     Any lookup of `cards_unique` by printing id has this hazard. Use the name
     or the oracle_id. */
  const cmdRes = await fetch(
    `${SUPABASE_URL}/rest/v1/cards_unique?name=eq.${encodeURIComponent(entry.name)}` +
      `&select=id,name,type_line,oracle_text,colors,color_identity,keywords,faces,tags&limit=1`,
    { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } }
  );
  const cmdRow = (await cmdRes.json())[0];
  if (!cmdRow?.oracle_text && !cmdRow?.faces) {
    /* Loud, because a silent version of this is what cost the two runs above.
       The number printed below would be meaningless. */
    console.log(`!! ${entry.name}: NO RECORD IN cards_unique. The keyed figure below is not a measurement.`);
  } else if (cmdRow.id !== entry.id) {
    console.log(`   roster id for ${entry.name} is stale: ${entry.id} -> ${cmdRow.id}`);
  }
  /* planForCommander reads COMPILED FACETS, not oracle text: `facetsOf` takes
     `commander.facets` or falls back to tags, and never touches the rules text
     itself. Handing it the raw row gives an empty plan and a confident 0%.
     The pipeline dresses the commander before calling it; so must this. */
  const cmdFacets = facetsForCard({
    name: entry.name, type_line: entry.type_line, oracle_text: cmdRow?.oracle_text ?? '',
    colors: cmdRow?.colors, color_identity: cmdRow?.color_identity,
    keywords: cmdRow?.keywords, faces: cmdRow?.faces,
  });
  const plan = planForCommander({
    name: entry.name, typeLine: entry.type_line,
    facets: cmdFacets.facets, tags: cmdRow?.tags,
    oracleText: cmdRow?.oracle_text ?? null,
  });
  if (!plan.wants.length) {
    console.log(`${entry.name}: the compiler produced no wants, so fit cannot be judged`);
  }
  let keyed = 0;
  for (const d of nonLand) {
    const c = cardOf(d);
    /* Deck rows come back without facets, so compile them here. planFit is
       deliberately silent for a card with no record, which would read as
       "nothing keys off the commander" when the truth is "nothing was
       compiled". That is the same mistake as measuring against the pool
       snapshot with no oracle_text. */
    const compiled = facetsForCard({
      name: c.name, type_line: lineOf(d), oracle_text: textOf(d),
      mana_cost: c.mana_cost, cmc: c.cmc, keywords: c.keywords,
      colors: c.colors, color_identity: c.color_identity, faces: c.faces,
      power: c.power, toughness: c.toughness, layout: c.layout,
    });
    const fit = planFit(plan, {
      name: c.name, typeLine: lineOf(d), oracleText: textOf(d),
      facets: compiled.facets, tags: c.tags,
    });
    if ((fit?.fit ?? 0) > 0) keyed++;
  }

  /* SHOW=1 prints the nonland list. A keyed percentage rises whenever the plan
     gains wants, so it can go up while the deck gets no better; the only check
     for that is reading the cards as a player. */
  if (process.env.SHOW) {
    console.log(`\n  --- ${entry.name}: ${nonLand.length} nonland cards`);
    for (const d of nonLand) {
      const c = cardOf(d);
      console.log(`    ${String(c.edhrec_rank ?? c.edhrecRank ?? '').padStart(6)}  ${c.name}`);
    }
    console.log('');
  }

  const names = new Set(deck.map(d => (cardOf(d).name ?? '').toLowerCase()));
  const identity = new Set(entry.color_identity ?? []);
  const eligible = STAPLES.filter(s => !s.colors || [...s.colors].every(ch => identity.has(ch)));
  const found = eligible.filter(s => names.has(s.name.toLowerCase()));

  const ranks = nonLand.map(d => cardOf(d).edhrec_rank ?? cardOf(d).edhrecRank);

  const orphans = [];
  for (const p of PAYOFFS) {
    const payoffs = nonLand.filter(d => p.payoff.test(textOf(d)));
    if (!payoffs.length) continue;
    const supply = nonLand.filter(d => lineOf(d).includes(p.type)).length;
    if (supply < p.floor) {
      orphans.push(`${payoffs.length} x ${p.what}, only ${supply} ${p.type.toLowerCase()}s to trigger it`);
    }
  }

  const row = {
    name: entry.name, ms, entries: deck.length, nonLand: nonLand.length,
    keyed, keyedPct: Math.round((keyed / Math.max(1, nonLand.length)) * 100),
    staples: `${found.length}/${eligible.length}`,
    missing: eligible.filter(s => !names.has(s.name.toLowerCase())).map(s => s.name),
    medianRank: median(ranks),
    past15k: ranks.filter(r => typeof r === 'number' && r > 15000).length,
    orphans,
  };
  rows.push(row);
  fs.writeFileSync(path.join(OUT, `${key}.json`), JSON.stringify({ localRun: true, ...row, deck }, null, 2));

  console.log(
    `${entry.name.padEnd(26)} keyed ${String(row.keyed).padStart(2)}/${row.nonLand} (${String(row.keyedPct).padStart(2)}%)` +
    `   staples ${row.staples}   median rank ${String(row.medianRank).padStart(5)}   past 15k ${String(row.past15k).padStart(2)}   ${ms}ms`
  );
  if (row.missing.length) console.log(`${pad(28)}missing: ${row.missing.join(', ')}`);
  for (const o of row.orphans) console.log(`${pad(28)}ORPHAN: ${o}`);
}

console.log('');
const avgKeyed = Math.round(rows.reduce((a, r) => a + r.keyedPct, 0) / Math.max(1, rows.length));
const totFound = rows.reduce((a, r) => a + Number(r.staples.split('/')[0]), 0);
const totElig = rows.reduce((a, r) => a + Number(r.staples.split('/')[1]), 0);
console.log(
  `across ${rows.length} decks: keyed ${avgKeyed}% average, staples ${totFound}/${totElig}, ` +
  `orphan warnings ${rows.reduce((a, r) => a + r.orphans.length, 0)}`
);
