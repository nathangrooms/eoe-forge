/**
 * The optimiser reading the generator's own output.
 *
 * Only three of the five decks in `user_decks` ever answer, which is thirty
 * suggestions to judge, and thirty is a thin base for saying what the thing
 * usually does. The generator wrote ten more decks in `.shots/gen-ten/`, built
 * live against the deployed function, so those are real 100-card lists with
 * real commanders and they cost nothing to reuse.
 *
 * It is also the pairing the owner asked about: the generator hands a deck
 * straight to the optimiser, so what the optimiser says about a deck the
 * generator just built is a question about both of them at once. If the two
 * disagree about the same 100 cards, one of them is wrong.
 *
 *   node scripts/optimiser-generated-decks.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';
const IN = path.resolve('.shots/gen-ten');
const OUT = path.resolve('.shots/opt-user');
const ATTEMPTS = 4;

const FILES = ['adeline', 'ghalta', 'kozilek', 'nivmizzet', 'meren', 'gaaiv', 'yuriko', 'teysa'];

const rows = [];
for (const f of FILES) {
  const p = path.join(IN, `${f}.deck.json`);
  if (!fs.existsSync(p)) {
    console.log(`${f}: no deck file`);
    continue;
  }
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const deck = j.result?.deck;
  const cmdr = j.result?.commander;
  if (!Array.isArray(deck) || !cmdr) {
    console.log(`${f}: no deck or commander in the file`);
    continue;
  }

  // The generator returns one row per card, so identical names collapse here
  // the way a deck list holds them.
  const byName = new Map();
  for (const c of deck) {
    const cur = byName.get(c.name);
    if (cur) cur.quantity++;
    else
      byName.set(c.name, {
        name: c.name,
        type_line: c.type_line ?? null,
        mana_cost: c.mana_cost ?? null,
        cmc: Number(c.cmc) || 0,
        quantity: 1,
      });
  }
  const cards = [...byName.values()];

  const ctx = {
    id: `gen-${f}`,
    name: `${cmdr.name} (generated)`,
    format: 'commander',
    commander: {
      name: cmdr.name,
      type_line: cmdr.type_line,
      mana_cost: cmdr.mana_cost,
      cmc: Number(cmdr.cmc) || 0,
      color_identity: cmdr.color_identity,
    },
    cards,
    power: null,
  };

  let body = null;
  let status = null;
  let ms = null;
  for (let i = 0; i < ATTEMPTS && !body; i++) {
    const t = Date.now();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/deck-optimizer`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ deckContext: ctx, edhAnalysis: null, useCollection: false, collectionCards: [] }),
    });
    status = res.status;
    ms = Date.now() - t;
    const txt = await res.text();
    try {
      const parsed = JSON.parse(txt);
      if (parsed.analysis) body = parsed.analysis;
    } catch {
      /* a 546 body carries nothing to read */
    }
  }

  if (!body) {
    console.log(`\n### ${cmdr.name} (${(cmdr.color_identity || []).join('') || 'colourless'}) — no answer in ${ATTEMPTS} attempts, last ${status}`);
    rows.push({ file: f, commander: cmdr.name, status, answered: false });
    continue;
  }

  fs.writeFileSync(path.join(OUT, `gen-${f}.json`), JSON.stringify({ commander: cmdr.name, ms, analysis: body }, null, 2));

  const cited = body.replacements.filter(r => /Fills a .* gap/.test(r.addBenefit || ''));
  const gaps = cited.map(r => (r.addBenefit.match(/Fills a (\w+) gap \((\d+) of (\d+)\)/) || []).slice(1).join(' '));
  console.log(`\n### ${cmdr.name} (${(cmdr.color_identity || []).join('') || 'colourless'})  ${ms} ms  pool ${body.grounding.poolRows}  wants ${body.grounding.commanderPlanWants}`);
  console.log(`  ${body.summary}`);
  console.log(`  power ${body.currentPowerLevel} -> ${body.projectedPowerLevel}; lands ${body.landCount}/${body.idealLandCount}`);
  console.log(`  additions ${body.additions.length}  removals ${body.removals.length}  replacements ${body.replacements.length}  landAdds ${body.landRecommendations.filter(l => l.type === 'add').length}  landSwaps ${body.landReplacements.length}`);
  console.log(`  role gaps cited: ${gaps.length ? gaps.join(' | ') : 'none'}`);
  body.replacements.forEach((r, i) => {
    console.log(`  ${i + 1}. OUT ${r.remove}  ->  IN ${r.add}  $${r.addPriceUsd} impact ${r.edhImpact}`);
    console.log(`       cut: ${r.removeReason}`);
    console.log(`       add: ${r.addBenefit}`);
  });

  rows.push({
    file: f,
    commander: cmdr.name,
    identity: cmdr.color_identity,
    answered: true,
    ms,
    poolRows: body.grounding.poolRows,
    commanderPlanWants: body.grounding.commanderPlanWants,
    current: body.currentPowerLevel,
    projected: body.projectedPowerLevel,
    landCount: body.landCount,
    idealLandCount: body.idealLandCount,
    additions: body.additions.length,
    landAdds: body.landRecommendations.filter(l => l.type === 'add').length,
    replacements: body.replacements.length,
    adds: body.replacements.map(r => r.add),
    cuts: body.replacements.map(r => r.remove),
    addSpend: Number(body.replacements.reduce((s, r) => s + (r.addPriceUsd ?? 0), 0).toFixed(2)),
    cutValue: Number(body.replacements.reduce((s, r) => s + (r.removePriceUsd ?? 0), 0).toFixed(2)),
  });
}

fs.writeFileSync(path.join(OUT, 'generated.json'), JSON.stringify(rows, null, 2));
