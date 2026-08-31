/**
 * Can the engine READ a commander, or is it guessing from silence?
 *
 * `role-coverage.mjs` asks whether a card can be placed. This asks the other
 * half: does the commander produce a plan the placing can aim at? A deck can
 * only be "built around the commander" if something was read off the commander.
 *
 * Three answers, and the middle one is the interesting one:
 *   READ      an intent rule fired on the commander's own text
 *   INFERRED  no rule fired, so a fallback supplied wants from its stats
 *   SILENT    no wants at all; every card scores zero fit
 *
 *   node --experimental-strip-types scripts/commander-coverage.mjs
 *   TOP=400 node --experimental-strip-types scripts/commander-coverage.mjs
 */
import { planForCommander } from '../src/engine/knowledge/behaviour.ts';
import fs from 'node:fs';

const ANON = fs.readFileSync('scratch/anon.txt', 'utf8').trim();
const BASE = 'https://udnaflcohfyljrsgqggy.supabase.co/rest/v1';
const TOP = Number(process.env.TOP || 300);
const cols = 'name,oracle_text,type_line,color_identity,tags,edhrec_rank';

const rows = [];
for (let off = 0; rows.length < TOP; off += 500) {
  const r = await fetch(
    `${BASE}/cards_unique?select=${cols}&type_line=ilike.*Legendary*Creature*&edhrec_rank=not.is.null` +
    `&order=edhrec_rank.asc&limit=500&offset=${off}`,
    { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  if (!r.ok) { console.error(r.status, (await r.text()).slice(0, 140)); break; }
  const page = await r.json();
  if (!page.length) break;
  rows.push(...page);
}
console.log(`read ${Math.min(TOP, rows.length)} of the most played legendary creatures\n`);

let read = 0, inferred = 0, silent = 0;
const inferredList = [], silentList = [];
for (const c of rows.slice(0, TOP)) {
  const plan = planForCommander({
    name: c.name, oracleText: c.oracle_text, typeLine: c.type_line,
    colorIdentity: c.color_identity, tags: c.tags,
  });
  const wants = plan?.wants ?? [];
  if (!wants.length) { silent++; if (silentList.length < 14) silentList.push(`#${c.edhrec_rank} ${c.name}`); continue; }
  /* The fallbacks say so in their own `because`: they are written as "tells us
     nothing but its stats" and similar. An intent rule names the ability. */
  const guessed = wants.every(w => /tells us nothing|no record|nothing but its stats/i.test(w.because || ''));
  if (guessed) { inferred++; if (inferredList.length < 14) inferredList.push(`#${c.edhrec_rank} ${c.name}`); }
  else read++;
}
const n = Math.min(TOP, rows.length);
const pct = k => `${((k / n) * 100).toFixed(1)}%`;
console.log(`READ      ${String(read).padStart(4)}  ${pct(read)}   an intent rule fired on its own text`);
console.log(`INFERRED  ${String(inferred).padStart(4)}  ${pct(inferred)}   guessed from stats, no rule fired`);
console.log(`SILENT    ${String(silent).padStart(4)}  ${pct(silent)}   no wants at all`);
console.log('\ninferred from silence:');
for (const x of inferredList) console.log('  ' + x);
console.log('\nno wants at all:');
for (const x of silentList) console.log('  ' + x);
