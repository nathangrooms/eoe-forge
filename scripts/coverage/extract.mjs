/**
 * scripts/coverage/extract.mjs — pass 1: read the XMage tree.
 *
 *   node scripts/coverage/extract.mjs
 *
 * Emits, into `scripts/coverage/.data/` (gitignored, never committed):
 *   corpus.json  one row per card class: LOC, bespoke-type count, DSL
 *                capabilities needed, and the engine primitives it names
 *   idmap.json   one row per SetCardInfo: (set code, card name, number, class)
 *
 * Prints the corpus-structure census so the LOC cliff can be re-checked rather
 * than trusted from a document.
 *
 * STRUCTURE ONLY. `stripComments` runs before any analysis, so Wizards' oracle
 * text (which lives in XMage's `//` lines and is not XMage's to license) cannot
 * reach an output file. Rules text comes from our own `cards.oracle_text`.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

import {
  xmageRoot,
  xmageCommit,
  PINNED_COMMIT,
  CARDS_DIR,
  SETS_DIR,
  walkJava,
  parseJava,
  primitivesOf,
  capabilitiesNeeded,
  stripComments,
  pct,
  counter,
} from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, '.data');
mkdirSync(DATA, { recursive: true });

const root = xmageRoot();
const commit = xmageCommit(root);
console.log(`XMage root:   ${root}`);
console.log(`XMage commit: ${commit}${commit === PINNED_COMMIT ? ' (pinned)' : ' ** NOT the pinned commit **'}`);

/* ------------------------------------------------------------------ *
 * Cards
 * ------------------------------------------------------------------ */

const cardFiles = walkJava(join(root, CARDS_DIR));
console.log(`\ncard classes: ${cardFiles.length}`);

const rows = [];
const locBuckets = [[0, 45], [45, 60], [60, 80], [80, 120], [120, 200], [200, 1e9]];
const bucketTotal = locBuckets.map(() => 0);
const bucketBespoke = locBuckets.map(() => 0);
const baseTypes = counter();

for (const f of cardFiles) {
  const p = parseJava(f, root);
  const prims = [...primitivesOf(p)].sort();
  const caps = capabilitiesNeeded(p);
  rows.push({
    cls: p.cls,
    path: p.path,
    loc: p.loc,
    bespoke: p.bespoke.length,
    caps,
    prims,
  });
  for (const d of p.bespoke) baseTypes.bump(d.base.split('.').pop());
  for (let i = 0; i < locBuckets.length; i++) {
    const [lo, hi] = locBuckets[i];
    if (p.loc >= lo && p.loc < hi) {
      bucketTotal[i]++;
      if (p.bespoke.length) bucketBespoke[i]++;
    }
  }
}

const n = rows.length;
const pure = rows.filter((r) => !r.bespoke).length;
const clean = rows.filter((r) => !r.caps.length).length;

console.log(`  pure declarative composition: ${pure} (${pct(pure, n)}%)`);
console.log(`  contains hand-written Java:   ${n - pure} (${pct(n - pure, n)}%)`);
console.log(`  CLEAN against the base DSL:   ${clean} (${pct(clean, n)}%)  [UPPER BOUND, ~5% optimistic — see PRIMITIVE-BUILD-ORDER.md §1]`);

console.log('\nbespoke-code rate by LOC bucket (the triage cliff):');
for (let i = 0; i < locBuckets.length; i++) {
  const [lo, hi] = locBuckets[i];
  const label = hi > 1e8 ? `${lo}+` : `${lo}-${hi}`;
  console.log(
    `  LOC ${label.padEnd(8)} n=${String(bucketTotal[i]).padStart(6)}  bespoke=${pct(bucketBespoke[i], bucketTotal[i]).padStart(5)}%`,
  );
}

console.log('\ntop bespoke base types:');
for (const [k, v] of baseTypes.top(10)) console.log(`  ${k.padEnd(38)} ${String(v).padStart(6)}`);

const capCt = counter();
for (const r of rows) for (const c of r.caps) capCt.bump(c);
console.log('\ncards touching each DSL capability gap:');
for (const [k, v] of capCt.top(20)) console.log(`  ${k.padEnd(6)} ${String(v).padStart(6)} (${pct(v, n).padStart(5)}%)`);

const allPrims = new Set();
for (const r of rows) for (const p of r.prims) allPrims.add(p);
console.log(`\ndistinct engine primitives named across all cards: ${allPrims.size}`);
const cleanPrims = new Set();
for (const r of rows) if (!r.caps.length) for (const p of r.prims) cleanPrims.add(p);
console.log(`distinct engine primitives named by CLEAN cards:    ${cleanPrims.size}`);

/* ------------------------------------------------------------------ *
 * Set files → identity map
 * ------------------------------------------------------------------ */

const RE_SUPER = /super\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"([^"]+)"/;
const RE_CARD =
  /new\s+SetCardInfo\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"?([^",]+?)"?\s*,\s*Rarity\.(\w+)\s*,\s*mage\.cards\.\w+\.(\w+)\.class/g;

const idmap = [];
const setFiles = walkJava(join(root, SETS_DIR));
for (const f of setFiles) {
  const src = stripComments(readFileSync(f, 'utf8'));
  const sm = RE_SUPER.exec(src);
  const setName = sm ? sm[1] : null;
  const setCode = sm ? sm[2] : null;
  for (const m of src.matchAll(RE_CARD)) {
    idmap.push({
      set_code: setCode,
      set_name: setName,
      card_name: m[1].replace(/\\"/g, '"'),
      num: m[2].trim(),
      rarity: m[3],
      cls: m[4],
    });
  }
}

const distinctNames = new Set(idmap.map((r) => r.card_name));
console.log(`\nset files: ${setFiles.length}`);
console.log(`  SetCardInfo rows:      ${idmap.length}`);
console.log(`  distinct card names:   ${distinctNames.size}`);
console.log(`  distinct card classes: ${new Set(idmap.map((r) => r.cls)).size}`);
console.log(`  distinct set codes:    ${new Set(idmap.map((r) => r.set_code).filter(Boolean)).size}`);

/* ------------------------------------------------------------------ */

const meta = { commit, pinnedCommit: PINNED_COMMIT, extractedAt: new Date().toISOString(), cards: n };
writeFileSync(join(DATA, 'corpus.json'), JSON.stringify({ meta, rows }));
writeFileSync(join(DATA, 'idmap.json'), JSON.stringify({ meta, rows: idmap }));
console.log(`\nwrote ${join(DATA, 'corpus.json')} and idmap.json`);
