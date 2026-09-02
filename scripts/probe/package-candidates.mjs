/**
 * Which cards does a package actually consider, and in what order?
 *
 *   node --experimental-strip-types scripts/probe/package-candidates.mjs \
 *     "Meren of Clan Nel Toth" BG reanimator "Getting it there"
 *
 * The deck-level probes say a package filled 2/2 and name what it took. They
 * cannot say what it PASSED OVER, which is the question when a rank-115 card
 * that carries the package's own facets is missing from the deck.
 *
 * This reproduces the package pass exactly — same signature, same fit formula,
 * same ordering — over the live pool, and prints the top of the list with each
 * card's score broken out. A card absent from this list was never a candidate;
 * a card low on it lost on a number that can then be argued with.
 */
import process from 'node:process';

import { Catalog } from '../../supabase/functions/ai-deck-builder-v2/catalog.ts';
import { DECK_ARCHETYPES, shellCardNames } from '../../src/lib/deck/archetypeShells.ts';
import { planForArchetype } from '../../src/engine/knowledge/behaviour.ts';
import { facetsForCard } from '../../src/lib/deck/recommend/behaviour.ts';

const [, , NAME, CI = 'BG', SHELL_ID = 'aristocrats', PKG] = process.argv;
if (!NAME) {
  console.error('usage: package-candidates.mjs "<commander>" <CI> <shell-id> ["<package>"]');
  process.exit(1);
}

const ANON = (await import('node:fs')).readFileSync(
  new URL('../../scratch/anon.txt', import.meta.url), 'utf8').trim();
const catalog = new Catalog({
  url: 'https://udnaflcohfyljrsgqggy.supabase.co', anonKey: ANON, authorization: null,
});

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
const shell = DECK_ARCHETYPES.find(s => s.id === SHELL_ID);
if (!shell) { console.error(`no shell "${SHELL_ID}"`); process.exit(1); }

/* The shell's own plan, packages and all. */
const names = shellCardNames(shell);
const rows = await catalog.cardsByName(names, 'commander');
const poolFacets = await catalog.poolFacetsByName(names);
const pkgOf = new Map();
for (const p of shell.packages) for (const c of p.cards) if (!pkgOf.has(norm(c))) pkgOf.set(norm(c), p.name);
const seen = new Set();
const exemplars = [];
for (const r of rows) {
  const k = norm(r.name ?? '');
  if (!pkgOf.has(k) || seen.has(k)) continue;
  seen.add(k);
  exemplars.push({ name: r.name, facets: poolFacets.get(r.name) ?? facetsForCard(r).facets, pkg: pkgOf.get(k) });
}
const plan = planForArchetype({ id: shell.id, name: shell.name, named: names.length, exemplars });

const wanted = PKG ? plan.packages.filter(p => p.name === PKG) : plan.packages;
if (!wanted.length) {
  console.error(`no package "${PKG}". Have: ${plan.packages.map(p => p.name).join(' | ')}`);
  process.exit(1);
}

/* The pool, the way the generator sees it: commander-legal, in identity, ranked. */
const ci = [...CI];
const pool = await catalog.poolFor({
  format: 'commander', identity: ci, budget: null, limit: 6000,
}).catch(async () => {
  /* Older catalogs expose a different name; fall back to a direct query. */
  const K = ANON;
  const B = 'https://udnaflcohfyljrsgqggy.supabase.co/rest/v1';
  const H = { apikey: K, Authorization: `Bearer ${K}` };
  const q = `${B}/cards_pool?commander_legal=eq.legal&color_identity=cd.{${ci.join(',')}}` +
    `&edhrec_rank=not.is.null&select=name,edhrec_rank,facets&order=edhrec_rank.asc&limit=6000`;
  return (await (await fetch(q, { headers: H })).json());
});

const cards = (Array.isArray(pool) ? pool : []).map(c => ({
  name: c.name, rank: c.edhrec_rank ?? c.edhrecRank ?? null,
  facets: c.facets ?? [],
}));
console.log(`\n${NAME}  [${CI}]  shell ${shell.name}  —  pool ${cards.length} cards\n`);

const PACKAGE_MATCH = 0.6;
for (const pkg of wanted) {
  const total = pkg.wants.reduce((n, w) => n + w.weight, 0);
  console.log(`=== ${pkg.name}`);
  console.log(`    signature: ${pkg.wants.map(w => `${w.facet}@${w.weight.toFixed(2)}`).join(' ')}`);
  const scored = cards
    .map(c => {
      const has = new Set(c.facets);
      let hit = 0;
      const matched = [];
      for (const w of pkg.wants) if (has.has(w.facet)) { hit += w.weight; matched.push(w.facet); }
      return { ...c, fit: total > 0 ? hit / total : 0, matched };
    })
    .filter(c => c.fit >= PACKAGE_MATCH)
    .sort((a, b) => b.fit - a.fit || (a.rank ?? 1e9) - (b.rank ?? 1e9));
  console.log(`    ${scored.length} cards clear the ${PACKAGE_MATCH} floor. Top 12:`);
  for (const c of scored.slice(0, 12)) {
    console.log(`      ${c.fit.toFixed(2)}  ${String(c.rank ?? '-').padStart(6)}  ${c.name.padEnd(30)} ${c.matched.join(' ')}`);
  }
  console.log();
}
