#!/usr/bin/env node
/**
 * Prove the XMage prune moved nothing.
 *
 *   node --experimental-strip-types scripts/xmage/prune-verify.mjs snapshot
 *   node --experimental-strip-types scripts/xmage/prune-lowered.mjs
 *   node --experimental-strip-types scripts/xmage/prune-verify.mjs compare
 *
 * ONLY A CARD THAT HAS A RECORD CAN BE AFFECTED by dropping records, so the
 * cards carrying one are the whole population rather than a sample. The snapshot
 * is taken with XMage ON, which is how the app reads, so this compares the
 * answer the product actually gets.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const REPO = process.cwd();
const SNAP = path.join(REPO, '.xmage', 'facets-before.json');
const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON = readFileSync(path.join(REPO, 'scratch', 'anon.txt'), 'utf8').trim();
const H = { apikey: ANON, Authorization: `Bearer ${ANON}` };
const mode = process.argv[2];
if (mode !== 'snapshot' && mode !== 'compare') {
  console.error('usage: prune-verify.mjs snapshot|compare');
  process.exit(2);
}

const { XMAGE_LOWERED } = await import('../../src/lib/cards/xmage/lowered.generated.ts');
const { facetsForCard } = await import('../../src/lib/deck/recommend/behaviour.ts');

/* The ids to check come from the SNAPSHOT once one exists, because the pruned
   table no longer holds the dropped ones and those are exactly the cards whose
   answer is in question. */
const ids =
  mode === 'compare' && existsSync(SNAP)
    ? Object.keys(JSON.parse(readFileSync(SNAP, 'utf8')))
    : Object.keys(XMAGE_LOWERED);

async function cardsFor(oracleIds) {
  const found = new Map();
  for (let i = 0; i < oracleIds.length; i += 150) {
    const chunk = oracleIds.slice(i, i + 150);
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/cards_unique` +
        `?select=oracle_id,name,type_line,oracle_text,mana_cost,cmc,keywords,power,toughness,layout,faces` +
        `&oracle_id=in.(${chunk.join(',')})`,
      { headers: H }
    );
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
    for (const row of await res.json()) found.set(row.oracle_id, row);
  }
  return found;
}

const cards = await cardsFor(ids);
const now = {};
for (const id of ids) {
  const row = cards.get(id);
  if (!row) continue;
  now[id] = facetsForCard(row).facets.join(' ');
}

if (mode === 'snapshot') {
  mkdirSync(path.dirname(SNAP), { recursive: true });
  writeFileSync(SNAP, JSON.stringify(now), 'utf8');
  console.log(`snapshot: ${Object.keys(now).length} cards recorded`);
  process.exit(0);
}

const before = JSON.parse(readFileSync(SNAP, 'utf8'));
const moved = [];
for (const [id, facets] of Object.entries(before)) {
  if (now[id] !== undefined && now[id] !== facets) moved.push(id);
}
console.log(`compared ${Object.keys(before).length} cards`);
if (moved.length === 0) {
  console.log('NOTHING MOVED. Every dropped record was unreachable.');
  process.exit(0);
}
console.log(`${moved.length} CARDS MOVED. The prune is not safe as written.`);
for (const id of moved.slice(0, 10)) {
  console.log(`  ${cards.get(id)?.name ?? id}\n    before ${before[id]}\n    after  ${now[id]}`);
}
process.exit(1);
