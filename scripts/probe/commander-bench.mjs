/**
 * Score generated decks for eight commanders against what a well-built version
 * of each actually runs.
 *
 *   node scripts/probe/commander-bench.mjs              the DEPLOYED function
 *   LOCAL=1 node --experimental-strip-types scripts/probe/commander-bench.mjs
 *   ONLY=brago ... ARCHETYPE=1 ...  (pass each commander's own archetype)
 *
 * ## Why groups and not overlap
 *
 * Overlap with a decklist rewards copying and punishes a different-but-correct
 * card. What is scored instead is whether the deck can DO each job: a Meren deck
 * with Grave Pact, Dictate of Erebos and Blood Artist and no sacrifice outlet is
 * a real failure CLAUDE.md records, and it is invisible to any overlap score
 * because every card in it is a fine Meren card.
 *
 * So each commander has groups, each group is a job, and each carries a FLOOR:
 * how many of that job a real deck runs. Finding eight sacrifice outlets is not
 * better than finding three. A group at zero is the failure worth shouting
 * about, and `jobs done` counts groups at or above their floor.
 *
 * ## The lists are typed, not scraped
 *
 * CLAUDE.md rules EDHREC, Moxfield and the rest out as data sources and this
 * makes no network call to any of them. `commander-benchmark.json` was written
 * once from knowledge of the format and is a scoring target only.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';

const K = readFileSync(new URL('../../scratch/anon.txt', import.meta.url), 'utf8').trim();
const BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
const bench = JSON.parse(
  readFileSync(new URL('commander-benchmark.json', import.meta.url), 'utf8')
);

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
const only = process.env.ONLY ? norm(process.env.ONLY) : null;
const useArchetype = process.env.ARCHETYPE === '1';
const LOCAL = process.env.LOCAL === '1';

let build = null;
let catalog = null;
if (LOCAL) {
  const { Catalog } = await import('../../supabase/functions/ai-deck-builder-v2/catalog.ts');
  ({ build } = await import('../../supabase/functions/ai-deck-builder-v2/pipeline.ts'));
  catalog = new Catalog({ url: BASE, anonKey: K, authorization: null });
}

async function deckFor(entry) {
  const request = {
    commander: {
      name: entry.name,
      type_line: 'Legendary Creature',
      color_identity: [...entry.ci],
      colors: [...entry.ci],
    },
    powerLevel: 7,
    includeLands: true,
    useAIPlanning: false,
    ...(useArchetype && entry.archetype ? { archetype: entry.archetype } : {}),
  };
  if (LOCAL) {
    const out = await build({ catalog, request, apiKey: null, startedAt: Date.now() });
    if (out.kind !== 'ok') return null;
    return (out.body.result?.deck ?? []).map(d => d.card ?? d);
  }
  const res = await fetch(`${BASE}/functions/v1/ai-deck-builder-v2`, {
    method: 'POST',
    headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) return null;
  const body = await res.json();
  return (body?.result?.deck ?? []).map(d => d?.card ?? d);
}

/*
 * THE INSTRUMENT CHECKS ITSELF FIRST.
 *
 * A benchmark name that does not resolve against the catalogue can never be
 * found, and it reads exactly like a generator failure. Three did: Bloodline
 * Keeper, Docent of Perfection and Journey to Eternity are all double-faced and
 * the catalogue holds them under their `//` names, so Edgar Markov was being
 * marked down for a card that does not exist by the name asked for.
 *
 * Checked every run, because the catalogue changes and a benchmark that quietly
 * stops resolving is worse than no benchmark at all.
 */
{
  const REST = `${BASE}/rest/v1`;
  const H = { apikey: K, Authorization: `Bearer ${K}` };
  const allNames = [
    ...new Set(bench.commanders.flatMap(c => c.groups.flatMap(g => g.cards ?? []))),
  ];
  const found = new Set();
  let failedChunks = 0;
  for (let i = 0; i < allNames.length; i += 40) {
    const list = allNames.slice(i, i + 40).map(n => `"${n.replace(/"/g, '')}"`).join(',');
    const res = await fetch(
      `${REST}/cards_pool?select=name&name=in.(${encodeURIComponent(list)})`, { headers: H }
    );
    /*
     * A FAILED CHUNK IS NOT SIXTY MISSING CARDS, and the first version of this
     * check said it was: two chunks errored and it reported 120 unresolvable
     * names against a true answer of three. A self-check that invents failures
     * is worse than no self-check, because it teaches you to ignore it.
     */
    if (!res.ok) { failedChunks++; continue; }
    const rows = await res.json();
    if (!Array.isArray(rows)) { failedChunks++; continue; }
    for (const r of rows) found.add(r.name);
  }
  if (failedChunks) {
    console.log(`\n  NOTE: ${failedChunks} name-check request(s) failed, so the check below is incomplete.`);
  } else {
    const missing = allNames.filter(n => !found.has(n));
    if (missing.length) {
      console.log(`\n  WARNING: ${missing.length} benchmark names do not resolve and can never be found:`);
      for (const m of missing) console.log(`    ${m}`);
    }
  }
}

console.log(
  `\nEIGHT COMMANDERS, against what a well-built version of each runs.` +
  `  ${LOCAL ? 'LOCAL build' : 'DEPLOYED function'}${useArchetype ? ', archetype passed' : ', no archetype passed'}\n`
);

let jobsDone = 0;
let jobsTotal = 0;
let zeroes = 0;
const rows = [];

for (const entry of bench.commanders) {
  if (only && !norm(entry.name).includes(only)) continue;
  const deck = await deckFor(entry);
  if (!deck) { console.log(`  ${entry.name.padEnd(30)} BUILD FAILED`); continue; }

  const have = new Set(deck.map(c => norm(c.name ?? '')));
  const nonland = deck.filter(c => !String(c.type_line ?? '').toLowerCase().includes('land'));
  const ranks = nonland.map(c => c.edhrec_rank).filter(r => typeof r === 'number').sort((a, b) => a - b);

  const parts = [];
  let done = 0;
  for (const g of entry.groups) {
    /*
     * A GROUP MAY BE A TYPE RATHER THAN A LIST, and for a tribal deck it must
     * be. "Play Vampires" has two hundred right answers, so scoring Edgar
     * Markov against nine named ones reported 0/4 while his deck held TWELVE
     * Vampires — Olivia Voldaren, Immersturm Predator, Elenda. The instrument
     * was wrong and the generator was not, which is the third time this session
     * a probe has invented a defect.
     *
     * A name list stays right for a job with a few canonical answers: there are
     * not two hundred sacrifice outlets worth running.
     */
    const hit = g.typeMatch
      ? deck.filter(c => new RegExp(g.typeMatch, 'i').test(String(c.type_line ?? ''))).map(c => c.name)
      : g.cards.filter(c => have.has(norm(c)));
    jobsTotal++;
    if (hit.length >= g.floor) { done++; jobsDone++; }
    if (hit.length === 0) zeroes++;
    parts.push({ job: g.job, hit, floor: g.floor, of: g.typeMatch ? hit.length : g.cards.length });
  }

  rows.push({ name: entry.name, done, of: entry.groups.length, parts,
    median: ranks[Math.floor(ranks.length / 2)] ?? 0,
    deep: ranks.filter(r => r > 15000).length, cards: deck.length });

  console.log(`  ${entry.name}   ${done}/${entry.groups.length} jobs done, ` +
    `${deck.length} cards, median ${ranks[Math.floor(ranks.length / 2)] ?? '-'}, ` +
    `${ranks.filter(r => r > 15000).length} past 15k`);
  for (const p of parts) {
    const mark = p.hit.length === 0 ? 'NONE' : p.hit.length >= p.floor ? ' ok ' : 'thin';
    console.log(`      [${mark}] ${p.job.padEnd(26)} ${p.hit.length}/${p.floor} needed` +
      (p.hit.length ? `   ${p.hit.slice(0, 5).join(', ')}` : ''));
  }
}

console.log(`\n  ${jobsDone}/${jobsTotal} jobs done across ${rows.length} decks. ` +
  `${zeroes} groups the deck cannot do AT ALL.`);
console.log(`  A group at zero is the failure worth fixing: the deck has no way to do that job.`);
