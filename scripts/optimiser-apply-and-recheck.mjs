/**
 * Two checks that need a second request to answer, so nothing here is read off
 * a single response and believed.
 *
 * 1. IS `projectedPowerLevel` A REAL RE-SCORE?
 *    The claim is that it is the deck scored again with every replacement
 *    applied. The only way to test that from outside is to apply the ten
 *    replacements to the decklist, send THAT deck, and compare its
 *    `currentPowerLevel` with the projection the first pass printed. If the two
 *    agree the projection is a measurement; if the projection is the current
 *    score wearing a different name it will not move at all.
 *
 * 2. DOES IT STILL RECOMMEND LANDS A FULL DECK HAS NO ROOM FOR?
 *    Every deck in `user_decks` is exactly 100 cards, which is the case the
 *    bug lived in, so it is tested directly by the main script. The other half
 *    of the same fix is that a SHORT deck should still be told to add lands,
 *    and only as many as it has slots for. So the same deck is sent again with
 *    cards removed, at 88 and at 76, and the land-add count is read against the
 *    empty slots.
 *
 *   node scripts/optimiser-apply-and-recheck.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';
const OUT = path.resolve('.shots/opt-user');
const DECKS = JSON.parse(fs.readFileSync(path.join(OUT, 'decks.json'), 'utf8'));

async function rest(q) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

async function enrich(names) {
  const map = new Map();
  for (let i = 0; i < names.length; i += 40) {
    const ch = names.slice(i, i + 40);
    const rows = await rest(
      `cards_unique?name=in.(${ch.map(n => `"${n.replace(/"/g, '\\"')}"`).join(',')})` +
        `&select=name,type_line,mana_cost,cmc,color_identity&limit=200`
    );
    for (const r of rows) if (!map.has(r.name)) map.set(r.name, r);
  }
  return map;
}

async function optimise(deckContext) {
  const t = Date.now();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/deck-optimizer`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ANON}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ deckContext, edhAnalysis: null, useCollection: false, collectionCards: [] }),
  });
  const txt = await res.text();
  let body = null;
  try {
    body = JSON.parse(txt);
  } catch {
    /* the raw body is the finding */
  }
  return { status: res.status, ms: Date.now() - t, analysis: body?.analysis ?? null, raw: body ? null : txt.slice(0, 200) };
}

/** The client's payload, built from the catalogue like `AIOptimizerPanel` does. */
function context(deck, pairs, map) {
  const c = map.get(deck.commander);
  return {
    id: deck.id,
    name: deck.name,
    format: deck.format,
    commander: c
      ? { name: c.name, type_line: c.type_line, mana_cost: c.mana_cost, cmc: Number(c.cmc) || 0, color_identity: c.color_identity }
      : deck.commander,
    cards: pairs.map(([n, q]) => {
      const r = map.get(n);
      return { name: n, type_line: r?.type_line ?? null, mana_cost: r?.mana_cost ?? null, cmc: Number(r?.cmc) || 0, quantity: q };
    }),
    power: null,
  };
}

/** Take one copy of `remove` out and put one `add` in, the way a player would. */
function applyReplacements(pairs, replacements) {
  const out = pairs.map(p => [...p]);
  let applied = 0;
  for (const r of replacements) {
    const i = out.findIndex(p => p[0] === r.remove);
    if (i === -1) continue;
    if (out[i][1] > 1) out[i][1] -= 1;
    else out.splice(i, 1);
    const j = out.findIndex(p => p[0] === r.add);
    if (j === -1) out.push([r.add, 1]);
    else out[j][1] += 1;
    applied++;
  }
  return { pairs: out, applied };
}

const report = [];

for (const deck of DECKS) {
  const names = [...new Set([...deck.cards.map(c => c[0]), deck.commander])];
  let map = await enrich(names);

  // Up to four attempts, because the function 546s intermittently.
  let first = null;
  for (let i = 0; i < 4 && !first?.analysis; i++) first = await optimise(context(deck, deck.cards, map));
  if (!first?.analysis) {
    report.push({ deck: deck.name, verdict: `no answer in 4 attempts (last ${first.status})` });
    console.log(`\n### ${deck.name}\n  no answer in 4 attempts, last status ${first.status}`);
    continue;
  }

  const a = first.analysis;
  const { pairs, applied } = applyReplacements(deck.cards, a.replacements);
  const total = pairs.reduce((s, p) => s + p[1], 0) + 1;
  map = await enrich([...new Set([...pairs.map(p => p[0]), deck.commander])]);

  let second = null;
  for (let i = 0; i < 4 && !second?.analysis; i++) second = await optimise(context(deck, pairs, map));

  const row = {
    deck: deck.name,
    firstMs: first.ms,
    current: a.currentPowerLevel,
    projected: a.projectedPowerLevel,
    replacements: a.replacements.length,
    applied,
    cardsAfter: total,
    afterCurrent: second?.analysis?.currentPowerLevel ?? null,
    afterStatus: second?.status,
    afterMs: second?.ms,
  };
  row.projectionError =
    row.afterCurrent === null || row.projected === null
      ? null
      : Number((row.afterCurrent - row.projected).toFixed(2));
  report.push(row);
  console.log(`\n### ${deck.name}`);
  console.log(`  first pass: current ${row.current} -> projected ${row.projected} over ${row.replacements} replacements (${first.ms} ms)`);
  console.log(`  applied ${applied}, deck now ${total} cards`);
  console.log(`  second pass current: ${row.afterCurrent} (status ${row.afterStatus}, ${row.afterMs} ms)`);
  console.log(`  projection error: ${row.projectionError}`);

  /* --- the short-deck half of the land fix --- */
  for (const drop of [12, 24]) {
    const spells = pairs.filter(p => {
      const r = map.get(p[0]);
      return r && !/Land/.test(r.type_line ?? '');
    });
    const cut = new Set(spells.slice(0, drop).map(p => p[0]));
    const short = pairs.filter(p => !cut.has(p[0]));
    const count = short.reduce((s, p) => s + p[1], 0) + 1;
    let r = null;
    for (let i = 0; i < 4 && !r?.analysis; i++) r = await optimise(context(deck, short, map));
    if (!r?.analysis) {
      console.log(`  short to ${count}: no answer (${r.status})`);
      continue;
    }
    const s = r.analysis;
    const landAdds = s.landRecommendations.filter(l => l.type === 'add').length;
    console.log(
      `  short to ${count}: ${s.landCount}/${s.idealLandCount} lands, ` +
        `additions ${s.additions.length}, land adds ${landAdds}, ` +
        `fillPlan ${JSON.stringify(s.fillPlan)}, basicFiller ${JSON.stringify(s.basicFiller)}`
    );
  }
}

fs.writeFileSync(path.join(OUT, 'apply-recheck.json'), JSON.stringify(report, null, 2));
