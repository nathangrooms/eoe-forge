/**
 * Does every relative import inside a vendored tree point at a file that exists?
 *
 * WHY THIS IS SEPARATE FROM `vendor-engine.mjs --check`
 * ----------------------------------------------------
 * That script compares bytes. This one follows specifiers. They catch different
 * faults, and the fault this one exists for shipped once already: the facet shim
 * was written one directory too deep, so `_lib/deck/recommend/behaviour.ts`
 * named a type import that resolved to nothing. Bytes were identical to the
 * source, because the source's specifier was copied verbatim, which is the whole
 * point of a byte-identical mirror. Only resolution was broken.
 *
 * The Supabase CLI reports that as
 *   WARN: failed to read file: open .../engine/knowledge/behaviour.ts
 * which is a WARNING, not an error, so the deploy succeeds and ships a function
 * whose producer cannot resolve its own import.
 *
 * WHAT CHANGED: THE LIST IS DERIVED, NOT TYPED
 * --------------------------------------------
 * This used to hardcode `['ai-deck-builder-v2', 'deck-optimizer']` and check one
 * specifier in each. Adding Tutor to the facet mirror left it silently checking
 * two of three, which is the same class of omission as `FACET_SUBDIR` being one
 * path when two functions needed it. So the targets come from the vendoring
 * script's own exports now, and every generated stand-in is checked rather than
 * the one that was known to be broken at the time.
 *
 * It walks every relative specifier in every mirrored tree, so a NEW broken edge
 * is caught rather than only the one already known about.
 */
import path from 'node:path';
import fs from 'node:fs';
import { ROOT, FACET_SUBDIRS, GENERATED_SHIMS, SHARED_FILES } from './vendor-engine.mjs';

const rel = f => path.relative(ROOT, f).split(path.sep).join('/');

/** `import ... from '<spec>'`, `export ... from '<spec>'`, `import('<spec>')`. */
const MODULE_SPECIFIER = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

const problems = [];
let checked = 0;

/**
 * Every specifier in every file of a mirrored tree.
 *
 * A bare specifier is left alone: Deno resolves `https://` and `npm:` itself and
 * nothing mirrored here carries one, but a future mirrored file might and that
 * is not this check's business.
 */
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(p);
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    const text = fs.readFileSync(p, 'utf8');
    for (const m of text.matchAll(MODULE_SPECIFIER)) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue;
      checked++;
      const target = path.resolve(path.dirname(p), spec);
      if (!fs.existsSync(target)) {
        problems.push(`${rel(p)} imports ${spec}, which resolves to nothing (${rel(target)})`);
      }
    }
  }
}

/* The mirrored trees themselves. `_engine` is covered by the engine's own
   purity test, which asserts every specifier under `src/engine/` resolves and
   never escapes; mirroring preserves that. `_lib` is not, because its files
   come from `src/lib/`, where escaping is normal and is what the shims fix. */
const roots = new Set([
  ...FACET_SUBDIRS.map(s => path.join(ROOT, s)),
  ...SHARED_FILES.map(f => path.join(ROOT, path.dirname(f.to))),
]);
for (const dir of roots) walk(dir);

/* Every generated stand-in must exist and must itself resolve. A shim that was
   never written is the failure this file was created for. */
for (const shim of GENERATED_SHIMS) {
  const p = path.join(ROOT, shim.path);
  if (!fs.existsSync(p)) {
    problems.push(`${shim.path} was never written (run: npm run vendor)`);
    continue;
  }
  walk(path.dirname(p));
}

console.log(`${checked} relative specifiers checked across ${roots.size} mirrored directories`);
if (problems.length) {
  for (const p of problems) console.error('  ' + p);
  console.error(`\n${problems.length} unresolved`);
  process.exit(1);
}
console.log('every specifier resolves');
