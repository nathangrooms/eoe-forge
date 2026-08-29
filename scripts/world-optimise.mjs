/**
 * Hand the generator's own decks straight to the optimiser.
 *
 * Both functions were redeployed at 2026-08-29T22:11:28Z, so the pair has to
 * be re-measured together: what the optimiser says about a deck the generator
 * built this hour is a question about both of them at once, and if they
 * disagree about the same 100 cards one of them is wrong.
 *
 *   node scripts/world-optimise.mjs feather yawgmoth ghalta yuriko-curly teysa
 */
import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
/* The publishable (anon) key, client-visible by design. */
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';
const DIR = path.resolve('.shots/world');
const ATTEMPTS = 4;

const keys = process.argv.slice(2);
const rows = [];

for (const key of keys) {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, `${key}.deck.json`), 'utf8'));
  const deck = j.result.deck;
  const cmdr = j.result.commander;

  const byName = new Map();
  for (const c of deck) {
    const cur = byName.get(c.name);
    if (cur) cur.quantity += c.quantity ?? 1;
    else
      byName.set(c.name, {
        name: c.name,
        type_line: c.type_line ?? null,
        mana_cost: c.mana_cost ?? null,
        cmc: Number(c.cmc) || 0,
        quantity: c.quantity ?? 1,
      });
  }

  const ctx = {
    id: `world-${key}`,
    name: `${cmdr.name} (generated)`,
    format: 'commander',
    commander: {
      name: cmdr.name,
      type_line: cmdr.type_line,
      mana_cost: cmdr.mana_cost,
      cmc: Number(cmdr.cmc) || 0,
      color_identity: cmdr.color_identity,
    },
    cards: [...byName.values()],
    power: null,
  };

  let body = null,
    status = null,
    ms = null;
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
    console.log(`\n### ${cmdr.name} — no answer in ${ATTEMPTS} attempts, last ${status}`);
    rows.push({ key, commander: cmdr.name, answered: false, status });
    continue;
  }

  fs.writeFileSync(path.join(DIR, `${key}.opt.json`), JSON.stringify({ commander: cmdr.name, ms, analysis: body }, null, 2));

  console.log(
    `\n### ${cmdr.name} (${(cmdr.color_identity || []).join('') || 'colourless'})  ${ms} ms  engine ${body.engine?.version}  pool ${body.grounding?.poolRows}  commander wants ${body.grounding?.commanderPlanWants}`
  );
  console.log(`  ${body.summary}`);
  console.log(`  power ${body.currentPowerLevel} -> ${body.projectedPowerLevel} | lands ${body.landCount}/${body.idealLandCount}`);
  console.log(
    `  additions ${body.additions.length} | replacements ${body.replacements.length} | landAdds ${body.landRecommendations.filter(l => l.type === 'add').length} | landSwaps ${body.landReplacements.length}`
  );
  body.replacements.forEach((r, i) => {
    console.log(`  ${i + 1}. OUT ${r.remove} ($${r.removePriceUsd ?? '-'})  ->  IN ${r.add} ($${r.addPriceUsd ?? '-'})  impact ${r.edhImpact}`);
    console.log(`       cut: ${r.removeReason}`);
    console.log(`       add: ${r.addBenefit}`);
  });

  rows.push({
    key,
    commander: cmdr.name,
    answered: true,
    ms,
    engine: body.engine?.version ?? null,
    wants: body.grounding?.commanderPlanWants ?? null,
    current: body.currentPowerLevel,
    projected: body.projectedPowerLevel,
    landCount: body.landCount,
    ideal: body.idealLandCount,
    replacements: body.replacements.map(r => ({
      out: r.remove,
      in: r.add,
      outPrice: r.removePriceUsd ?? null,
      inPrice: r.addPriceUsd ?? null,
      cut: r.removeReason,
      add: r.addBenefit,
    })),
  });
}

fs.writeFileSync(path.join(DIR, 'optimise.json'), JSON.stringify(rows, null, 2));
