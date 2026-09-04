#!/usr/bin/env node
/**
 * Drop every XMage record the precedence rule can never consult.
 *
 *   node --experimental-strip-types scripts/xmage/prune-lowered.mjs *
 * ## Why
 *
 * `lowered.generated.ts` is 3,157 KB and is TWO THIRDS of every vendored edge
 * function. Measured 4 Sep 2026 all four were against the platform's 5 MB
 * deploy ceiling, and `deck-optimizer` was over it and could not be deployed at
 * all:
 *
 *     mtg-brain           4,965 KB      deck-optimizer      4,753 KB (HTTP 413)
 *     ai-deck-builder-v2  4,689 KB      facet-memo-fill     4,557 KB
 *
 * ## What is safe to drop, and why it is exactly safe
 *
 * `xmageSwapFor` opens with one line:
 *
 *     if (compiled.compilerCoverage === 'full') return { refused: ... }
 *
 * So a record for a card the ORACLE-TEXT COMPILER already reads completely can
 * never be returned, whatever else is true. It is not "rarely used" or "usually
 * redundant"; it is unreachable. `src/lib/deck/recommend/behaviour.ts` says the
 * same thing from the other side: the table speaks for about 1,541 cards of
 * 31,833 while holding 7,392 records.
 *
 * The compiler's own verdict is read with `DM_XMAGE_OFF=1`, which is the switch
 * `lowered.ts` already carries. With the table off, `rec:full` in a card's
 * facets IS `compilerCoverage === 'full'`, so this asks the same question the
 * rule asks rather than a lookalike.
 *
 * A record whose card cannot be found in the catalogue is KEPT. Absence is not
 * evidence that the compiler reads it, and a wrong drop is silent.
 *
 * ## The check that makes this a refactor rather than a change
 *
 * `prune-verify.mjs` records every affected card's facets BEFORE the prune and
 * compares AFTER. Only a card that HAS a record can be affected by dropping
 * records, so checking exactly those 7,392 is sufficient rather than a sample.
 * Dropping an unreachable record must move nothing at all; if one card moves,
 * the reasoning above is wrong and the prune must not ship.
 *
 * ## Re-running it
 *
 * `emit-lowered.mjs` rebuilds the FULL table from the XMage clone, so run this
 * afterwards. It is idempotent: a second run finds nothing left to drop.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const REPO = process.cwd();
const OUT = path.join(REPO, 'src', 'lib', 'cards', 'xmage', 'lowered.generated.ts');
const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON = readFileSync(path.join(REPO, 'scratch', 'anon.txt'), 'utf8').trim();
const H = { apikey: ANON, Authorization: `Bearer ${ANON}` };

/* The compiler is imported AFTER the flag is set, because `lowered.ts` reads
   DM_XMAGE_OFF once at module load. Setting it later would be read as on. */
process.env.DM_XMAGE_OFF = '1';
const { XMAGE_LOWERED } = await import('../../src/lib/cards/xmage/lowered.generated.ts');
const { facetsForCard } = await import('../../src/lib/deck/recommend/behaviour.ts');

const ids = Object.keys(XMAGE_LOWERED);
console.log(`${ids.length} records in the table`);

/* Fetched by oracle_id in chunks, because an `in.()` list is a URL segment and
   a URL has a length. 150 is the size `collectionBatch.ts` settled on. */
async function cardsFor(oracleIds) {
  const found = new Map();
  for (let i = 0; i < oracleIds.length; i += 150) {
    const chunk = oracleIds.slice(i, i + 150);
    const url =
      `${SUPABASE_URL}/rest/v1/cards_unique` +
      `?select=oracle_id,name,type_line,oracle_text,mana_cost,cmc,keywords,power,toughness,layout,faces` +
      `&oracle_id=in.(${chunk.join(',')})`;
    const res = await fetch(url, { headers: H });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
    for (const row of await res.json()) found.set(row.oracle_id, row);
    if (i % 1500 === 0) process.stdout.write(`\r  fetched ${found.size}/${oracleIds.length}`);
  }
  process.stdout.write('\r');
  return found;
}

const cards = await cardsFor(ids);
console.log(`  resolved ${cards.size} of ${ids.length} against the catalogue`);

const keep = [];
let dropped = 0;
let unresolved = 0;
for (const id of ids) {
  const row = cards.get(id);
  if (!row) {
    /* KEPT. Absence is not evidence that the compiler reads the card, and a
       wrong drop is silent. */
    keep.push(id);
    unresolved += 1;
    continue;
  }
  const { facets } = facetsForCard(row);
  if (facets.includes('rec:full')) dropped += 1;
  else keep.push(id);
}

console.log(
  `  compiler reads ${dropped} of them completely, so those records are ` +
    `unreachable\n  keeping ${keep.length} (${unresolved} because the card ` +
    `is not in the catalogue)`
);

/*
 * THE TAIL IS KEPT. The file declares `XMAGE_LOWERED_STATS` after the table,
 * and the first version of this script sliced from the start of the file to the
 * table and threw everything after it away. It failed loudly at import, but
 * only because something happened to import that export. Rebuilding a generated
 * file means replacing ONE statement in it, not keeping the part you were
 * thinking about.
 */
const source = readFileSync(OUT, 'utf8');
const marker = 'export const XMAGE_LOWERED:';
const at = source.indexOf(marker);
if (at < 0) throw new Error(`${OUT} no longer declares ${marker}`);
const endOfLine = source.indexOf('\n', at);
if (endOfLine < 0) throw new Error('the table declaration has no line ending');
const kept = Object.fromEntries(keep.map(id => [id, XMAGE_LOWERED[id]]));
const next =
  source.slice(0, at) +
  `${marker} Readonly<Record<string, readonly Ability[]>> = ${JSON.stringify(kept)};` +
  source.slice(endOfLine);

writeFileSync(OUT, next, 'utf8');
console.log(
  `\nwrote ${path.relative(REPO, OUT)}  ` +
    `${(source.length / 1024).toFixed(0)} KB -> ${(next.length / 1024).toFixed(0)} KB`
);
