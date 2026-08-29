/**
 * WHY the optimiser refuses some decks, isolated to one variable.
 *
 * Three of the five decks in `user_decks` never answer: they come back 546
 * WORKER_RESOURCE_LIMIT. The obvious suspect is the candidate pool, because the
 * pool is every card legal in the format inside the commander's colour identity
 * and that count grows steeply with colour count. But "the three that fail are
 * the wide ones" is a correlation, and the failing decks also differ in their
 * contents.
 *
 * So this sends ONE decklist, unchanged, with nothing varying except the
 * commander named on it. Same 99 cards, same request, five colour counts. If
 * the pool is the cause, the failure follows the commander and not the deck.
 *
 * Cards outside the named commander's identity are reported as issues and that
 * is fine: the pool query is still built from the commander's identity, which
 * is the thing being measured.
 *
 *   node scripts/optimiser-colour-cliff.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';
const OUT = path.resolve('.shots/opt-user');
const DECKS = JSON.parse(fs.readFileSync(path.join(OUT, 'decks.json'), 'utf8'));
const BASE = DECKS.find(d => d.id === '60fe72c2-3bab-43cc-a7a8-6d2d5f3c762a');

/** One commander per colour count, all real and all commander-legal. */
const COMMANDERS = [
  ['Ulamog, the Ceaseless Hunger', 0],
  ['Krenko, Mob Boss', 1],
  ['Syr Vondam, Sunstar Exemplar', 2],
  ['Kaalia of the Vast', 3],
  ["Atraxa, Praetors' Voice", 4],
  ['Golos, Tireless Pilgrim', 5],
];
const ATTEMPTS = 3;

async function rest(q) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

const names = [...new Set([...BASE.cards.map(c => c[0]), ...COMMANDERS.map(c => c[0])])];
const map = new Map();
for (let i = 0; i < names.length; i += 40) {
  const rows = await rest(
    `cards_unique?name=in.(${names.slice(i, i + 40).map(n => `"${n.replace(/"/g, '\\"')}"`).join(',')})` +
      `&select=name,type_line,mana_cost,cmc,color_identity&limit=200`
  );
  for (const r of rows) if (!map.has(r.name)) map.set(r.name, r);
}

const cards = BASE.cards.map(([n, q]) => {
  const r = map.get(n);
  return { name: n, type_line: r?.type_line ?? null, mana_cost: r?.mana_cost ?? null, cmc: Number(r?.cmc) || 0, quantity: q };
});

const rows = [];
for (const [cmdrName, colours] of COMMANDERS) {
  const c = map.get(cmdrName);
  if (!c) {
    console.log(`${cmdrName}: not in the catalogue, skipped`);
    continue;
  }
  const ctx = {
    id: BASE.id,
    name: `${BASE.name} (as ${cmdrName})`,
    format: 'commander',
    commander: { name: c.name, type_line: c.type_line, mana_cost: c.mana_cost, cmc: Number(c.cmc) || 0, color_identity: c.color_identity },
    cards,
    power: null,
  };
  const results = [];
  for (let i = 0; i < ATTEMPTS; i++) {
    const t = Date.now();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/deck-optimizer`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ deckContext: ctx, edhAnalysis: null, useCollection: false, collectionCards: [] }),
    });
    const txt = await res.text();
    let pool = null;
    try {
      pool = JSON.parse(txt)?.analysis?.grounding?.poolRows ?? null;
    } catch {
      /* a 546 body is not JSON we care about */
    }
    results.push({ status: res.status, ms: Date.now() - t, pool });
  }
  const ok = results.filter(r => r.status === 200);
  const row = {
    commander: cmdrName,
    colours,
    identity: (c.color_identity ?? []).join('') || '(colourless)',
    ok: `${ok.length}/${ATTEMPTS}`,
    poolRows: ok[0]?.pool ?? null,
    ms: results.map(r => r.ms).join('/'),
    statuses: results.map(r => r.status).join('/'),
  };
  rows.push(row);
  console.log(
    `${String(colours)} colours  ${cmdrName.padEnd(30)} identity ${row.identity.padEnd(6)} ` +
      `ok ${row.ok}  pool ${row.poolRows ?? '-'}  ${row.statuses}  ${row.ms} ms`
  );
}

fs.writeFileSync(path.join(OUT, 'colour-cliff.json'), JSON.stringify(rows, null, 2));
