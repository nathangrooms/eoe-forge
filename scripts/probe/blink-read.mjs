/**
 * Does the compiler read a blink card as blink?
 *
 *   node --experimental-strip-types scripts/probe/blink-read.mjs
 *
 * `eff:exile-own` is the facet that means "one of your own permanents was
 * exiled", which is what a blink spell does and what Syr Vondam is paid for.
 * Our own tagger calls 197 cards `blink`; the facet layer reads 69 of them that
 * way. This prints the difference card by card with the clause the compiler
 * could not take, so the gap is a work list rather than a number.
 *
 * Reads the live catalogue. Writes nothing.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';

const K = readFileSync(new URL('../../scratch/anon.txt', import.meta.url), 'utf8').trim();
const B = 'https://udnaflcohfyljrsgqggy.supabase.co/rest/v1';
const H = { apikey: K, Authorization: `Bearer ${K}` };

const { facetsForCard } = await import(
  new URL('../../src/lib/deck/recommend/behaviour.ts', import.meta.url).href
);
const { compileWithTrace } = await import(
  new URL('../../src/lib/cards/abilities/compiler.ts', import.meta.url).href
);

const LIMIT = Number(process.env.LIMIT ?? 60);

/* Cards OUR tagger calls blink, most played first. */
const rows = await (
  await fetch(
    `${B}/cards_pool?tags=cs.{blink}&edhrec_rank=not.is.null&select=id,name,edhrec_rank` +
      `&order=edhrec_rank.asc&limit=${LIMIT}`,
    { headers: H }
  )
).json();

const ids = rows.map(r => r.id);
const full = [];
for (let i = 0; i < ids.length; i += 40) {
  const page = await (
    await fetch(`${B}/cards_unique?id=in.(${ids.slice(i, i + 40).join(',')})&select=*`, { headers: H })
  ).json();
  full.push(...page);
}
const byId = new Map(full.map(c => [c.id, c]));

let read = 0;
const missed = [];

for (const r of rows) {
  const raw = byId.get(r.id);
  if (!raw) continue;
  const card = {
    ...raw,
    oracleText: raw.oracle_text ?? null,
    typeLine: raw.type_line ?? null,
    faces: raw.faces ?? null,
    keywords: raw.keywords ?? null,
  };
  let facets = [];
  try {
    facets = facetsForCard(card)?.facets ?? [];
  } catch {
    /* a card the compiler throws on is a miss like any other */
  }
  if (facets.includes('eff:exile-own')) { read++; continue; }

  /* The clause it could not take, so the miss names its own shape. */
  let clause = '';
  try {
    const trace = compileWithTrace(card);
    const un = trace?.result?.unparsed ?? [];
    clause = String(un[0]?.text ?? '').slice(0, 90);
  } catch {
    /* leave it blank */
  }
  missed.push({ name: raw.name, rank: r.edhrec_rank, clause,
    text: String(raw.oracle_text ?? '').replace(/\n/g, ' | ').slice(0, 100) });
}

const total = read + missed.length;
console.log(`\nCARDS OUR TAGGER CALLS BLINK, top ${total} by play rate\n`);
console.log(`  the compiler reads as blink   ${read}  (${((read / total) * 100).toFixed(0)}%)`);
console.log(`  it does not                   ${missed.length}\n`);
for (const m of missed) {
  console.log(`  ${String(m.rank).padStart(6)}  ${m.name}`);
  console.log(`          ${m.text}`);
  if (m.clause) console.log(`          unparsed: ${m.clause}`);
}
