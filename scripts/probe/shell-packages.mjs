/**
 * What does each package of each archetype shell actually ask for?
 *
 *   node --experimental-strip-types scripts/probe/shell-packages.mjs
 *   ARCH=blink node --experimental-strip-types scripts/probe/shell-packages.mjs
 *
 * A shell is three or four PACKAGES with names — "The blinks", "Things worth
 * blinking", "Doubling the arrival" — and `planForArchetype` flattened them
 * into one want list, which throws away the only structure the shell carries.
 *
 * Flattened, Blink asks for `trig:enters` and `eff:exile-own` as two wants
 * among many, and a card carrying either scores. Kept apart, "The blinks" asks
 * for exile-own AND return-from together and "Things worth blinking" asks for
 * trig:enters AND a value effect together, which is the difference between
 * Mulldrifter and any creature that happens to enter.
 *
 * This prints the per-package wants so a signature can be read before anything
 * is built on it. A package whose wants are empty or absurd is a package whose
 * example cards need fixing in `archetypeShells.ts`, not a reason to distrust
 * the mechanism.
 */
import process from 'node:process';

import { Catalog } from '../../supabase/functions/ai-deck-builder-v2/catalog.ts';
import { DECK_ARCHETYPES, shellCardNames } from '../../src/lib/deck/archetypeShells.ts';
import { planForArchetype } from '../../src/engine/knowledge/behaviour.ts';
import { facetsForCard } from '../../src/lib/deck/recommend/behaviour.ts';

const ANON = (await import('node:fs')).readFileSync(
  new URL('../../scratch/anon.txt', import.meta.url), 'utf8').trim();
const catalog = new Catalog({
  url: 'https://udnaflcohfyljrsgqggy.supabase.co', anonKey: ANON, authorization: null,
});

/* NOT `SHELL`: that is a standard environment variable set by the OS to the
   path of your shell, so the filter matched nothing and the probe silently
   reported zero packages across zero shells. */
const only = process.env.ARCH;
const shells = only ? DECK_ARCHETYPES.filter(s => s.id === only) : DECK_ARCHETYPES;

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

let totalPkgs = 0;
let emptyPkgs = 0;
let unresolved = 0;

for (const shell of shells) {
  const names = shellCardNames(shell);
  const rows = await catalog.cardsByName(names, 'commander');
  /* POOL facets, the vocabulary the shell's wants are matched in. Compiling
     locally measures a different engine than the one that builds the deck. */
  const poolFacets = await catalog.poolFacetsByName(names);

  const pkgOf = new Map();
  for (const pkg of shell.packages) {
    for (const c of pkg.cards) if (!pkgOf.has(norm(c))) pkgOf.set(norm(c), pkg.name);
  }

  const seen = new Set();
  const exemplars = [];
  for (const row of rows) {
    const k = norm(row.name ?? '');
    if (!pkgOf.has(k) || seen.has(k)) continue;
    seen.add(k);
    exemplars.push({ name: row.name, facets: poolFacets.get(row.name) ?? facetsForCard(row).facets, pkg: pkgOf.get(k) });
  }
  const missing = names.filter(n => !seen.has(norm(n)));
  unresolved += missing.length;

  const plan = planForArchetype({
    id: shell.id, name: shell.name, named: names.length, exemplars,
  });

  console.log(`\n=== ${shell.name}  (${exemplars.length}/${names.length} cards resolved)`);
  if (missing.length) console.log(`    UNRESOLVED: ${missing.join(', ')}`);

  for (const pkg of shell.packages) {
    const p = (plan.packages ?? []).find(x => x.name === pkg.name);
    totalPkgs++;
    if (!p) {
      emptyPkgs++;
      console.log(`  ${pkg.name.padEnd(26)} NO SHARED FACET — its cards agree on nothing`);
      console.log(`      ${pkg.cards.join(', ')}`);
      continue;
    }
    const sig = p.wants.map(w => `${w.facet}@${w.weight.toFixed(2)}`).join(' ');
    console.log(`  ${pkg.name.padEnd(26)} ${(p.share * 100).toFixed(0)}% of shell, ${p.read} cards`);
    console.log(`      ${sig}`);
  }
}

console.log(`\n${totalPkgs} packages across ${shells.length} shells. ` +
  `${emptyPkgs} produced no signature. ${unresolved} card names did not resolve.`);
console.log(`A package with no signature cannot be filled and its example cards need fixing.`);
