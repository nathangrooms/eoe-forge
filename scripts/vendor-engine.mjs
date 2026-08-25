/**
 * Copy the engine into every edge function that needs it.
 *
 *   node scripts/vendor-engine.mjs
 *
 * WHY A COPY AND NOT AN IMPORT
 * ----------------------------
 * A Deno edge function is deployed as a self-contained bundle: every module it
 * reaches has to sit under `supabase/functions/<name>/`, so it cannot import
 * `src/engine/...` the way the browser build does. There were three ways out:
 *
 *   1. Move the shared logic somewhere both trees can reach. There is no such
 *      place: `supabase/functions/` is the deploy root and `src/` is the Vite
 *      root, and neither can contain the other.
 *   2. Reimplement in SQL or in the function. Then the edge function and the
 *      client answer the same question by two rules that drift apart silently,
 *      which is the entire disease this engine exists to cure. It is also
 *      exactly what `ai-deck-builder-v2/builder-orchestrator.ts` did: 965 lines
 *      of inlined reimplementation under a comment claiming it reused the real
 *      builder.
 *   3. Copy, and make drift a failing test. That is what this does.
 *
 * WHAT CHANGED FROM THE EARLIER VERSION
 * -------------------------------------
 * This script used to vendor seven hand-listed files and *generate* an eighth,
 * a cut-down `tagger.ts` carrying only `.tag` and `.also`. That saved 34 KB of
 * regex in the bundle at the cost of the one guarantee worth having: the
 * vendored tree was not byte-identical to the source, so the parity test had to
 * compare it against a re-render instead of against the file.
 *
 * Now the rule is simple enough to state in one line and check in one line:
 *
 *   **every non-test `.ts` file under `src/engine/` appears under `_engine/`,
 *   byte for byte, and nothing else does.**
 *
 * That is only possible because `src/engine/` is pure: no `@/` aliases, no
 * React, no Supabase client, no JSON imports, no network. Every specifier in it
 * is relative and carries an explicit `.ts`, so mirroring the directory
 * verbatim preserves every path. The import check in `engine-parity.test.ts`
 * is what keeps it that way.
 *
 * The full tagger is now vendored too, which is why the optimiser can derive a
 * card's tags itself instead of trusting whatever the client sent.
 *
 * THE ONE GENERATED FILE
 * ----------------------
 * `src/engine/power/catalogs.ts` is rendered from the four JSON catalogues in
 * `src/lib/deckbuilder/score/`. The JSON stays where it is because
 * `src/components/marketing/HomePower.tsx` imports one of those files directly
 * and that tree belongs to another agent. Rendering to TypeScript means the
 * engine has no JSON imports, which is what lets the whole tree mirror as
 * plain `.ts`, and it means the catalogue is typed rather than `any`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');

/** The one source of truth. Everything under here is the engine. */
export const ENGINE_DIR = 'src/engine';

/** Every function that gets a copy. Add a function here, not a new script. */
export const CONSUMERS = [
  'supabase/functions/deck-optimizer',
  'supabase/functions/ai-deck-builder-v2',
];

/** Where the copy lands inside each consumer. */
export const VENDOR_SUBDIR = '_engine';

/**
 * Files shared between edge functions that are NOT part of the engine.
 *
 * `catalog.ts` talks to PostgREST, so it cannot live under `src/engine/` — the
 * first rule of that tree is that nothing in it opens a socket. But the deck
 * generator and the optimiser have to ask the database for the candidate pool
 * in exactly the same way, or they answer "what cards exist" differently and
 * the shared engine downstream is ranking two different worlds. That is the
 * bug the generator had: it read 8,000 unordered rows while the optimiser read
 * all of them.
 *
 * So it is mirrored on the same terms as the engine: one source, byte-identical
 * copies, and `--check` fails on drift. `deck-optimizer` holds the source
 * because that is where the file was written and where
 * `src/engine/advise/cut-rules.test.ts` already imports it from.
 *
 * A `supabase/functions/_shared/` directory would be the tidier home and is the
 * pattern Supabase documents. It is not used here because this project deploys
 * through Lovable rather than the CLI, and whether that pipeline follows a `../`
 * import out of a function's own root has never been verified in this repo. A
 * sibling copy needs no such assumption.
 */
/**
 * The facet producer, and why it has to be mirrored too.
 *
 * `src/engine/knowledge/behaviour.ts` declares the facet vocabulary and reads
 * facets off a card, but it cannot PRODUCE one: producing a facet means
 * compiling oracle text, and the compiler lives in `src/lib/cards/` where the
 * engine is forbidden to reach. So the producer sits in
 * `src/lib/deck/recommend/behaviour.ts`, outside the engine, and until now the
 * edge function had no copy of it. That is the whole reason
 * `ai-deck-builder-v2` ranked its pool with `facets: null` on every row: the
 * code that turns a card into facets simply was not in the bundle.
 *
 * Mirrored on exactly the terms the engine is: one source, byte-identical
 * copies, `--check` fails on drift, and `engine-parity.test.ts` asserts each
 * pair. The target paths preserve the source tree's shape under `_lib/`, so
 * every relative specifier inside these files resolves unchanged and no file
 * has to be rewritten on the way in.
 *
 * THE ONE EDGE THAT DOES NOT RESOLVE, and the one-line shim that fixes it:
 * `deck/recommend/behaviour.ts` has a single import that points out of
 * `src/lib` — `import type { Facet } from '../../../engine/knowledge/behaviour.ts'`.
 * From `_lib/deck/recommend/` that path lands on `_lib/engine/knowledge/`, so
 * `FACET_SHIM` is written there and re-exports the type from the vendored
 * engine. It is a type-only re-export of `type Facet = string`; it carries no
 * logic and cannot drift into a second opinion about anything.
 *
 * WHAT IT COSTS: 3.68 MB of source, of which 3.16 MB is
 * `xmage/lowered.generated.ts`, the ported XMage record table. That table is
 * what speaks for the 2,201 cards the oracle-text compiler cannot fully read,
 * Wrath of God and Damnation among them, so dropping it to save the bundle
 * would take removal staples out of every generated deck.
 */
/**
 * `deck/archetypeShells.ts` is not a facet producer, and is mirrored with them
 * anyway because it has the same problem for the same reason.
 *
 * It is the catalogue of what each archetype is made of, as card names, and the
 * generator now reads those names to find out what the archetype a player asked
 * for actually wants. It cannot live under `src/engine/`, because the engine may
 * not import outward and this is content rather than logic, edited by whoever is
 * arguing about what Aristocrats is made of. It must not be re-typed into the
 * function either: two lists of card names free to disagree is exactly the drift
 * `--check` exists to catch. It imports nothing, so it mirrors unchanged.
 */
const FACET_SOURCES = [
  'deck/archetypeShells.ts',
  'deck/recommend/behaviour.ts',
  'cards/abilities/clause-rules.ts',
  'cards/abilities/compiler.ts',
  'cards/abilities/dsl.ts',
  'cards/abilities/effect-rules.ts',
  'cards/abilities/grammar.ts',
  'cards/abilities/normalize.ts',
  'cards/xmage/compare.ts',
  'cards/xmage/lowered.generated.ts',
  'cards/xmage/lowered.ts',
  'cards/xmage/record.ts',
  'cards/xmage/roles.ts',
];

/** Where the facet producer lands inside the generator. */
export const FACET_SUBDIR = 'supabase/functions/ai-deck-builder-v2/_lib';

export const FACET_SHIM = {
  path: `${FACET_SUBDIR}/engine/knowledge/behaviour.ts`,
  body: `/**
 * GENERATED FILE — do not edit. Written by scripts/vendor-engine.mjs.
 *
 * \`_lib/deck/recommend/behaviour.ts\` is a byte-identical copy of
 * \`src/lib/deck/recommend/behaviour.ts\`, and that file names the facet type as
 * \`../../../engine/knowledge/behaviour.ts\`. In the source tree that is the
 * engine; under \`_lib/\` it is this path. Re-exporting the type here is what
 * lets the copy stay byte-identical instead of being rewritten on the way in.
 *
 * Type-only. \`Facet\` is \`string\`. There is no logic here to drift.
 */
export type { Facet } from '../../../_engine/knowledge/behaviour.ts';
`,
};

export const SHARED_FILES = [
  {
    from: 'supabase/functions/deck-optimizer/catalog.ts',
    to: 'supabase/functions/ai-deck-builder-v2/catalog.ts',
  },
  ...FACET_SOURCES.map(rel => ({
    from: `src/lib/${rel}`,
    to: `${FACET_SUBDIR}/${rel}`,
  })),
];

/* ------------------------------------------------------------------ *
 * The generated catalogue
 * ------------------------------------------------------------------ */

export const CATALOG_SOURCE_DIR = 'src/lib/deckbuilder/score';
export const CATALOG_TARGET = 'src/engine/power/catalogs.ts';

export const CATALOG_FILES = {
  staples: 'staples.json',
  combos: 'combos.json',
  tutors: 'catalog.tutors.json',
  gameChangers: 'catalog.gamechangers.json',
};

export function readCatalogs(root = ROOT) {
  const read = file =>
    JSON.parse(fs.readFileSync(path.join(root, CATALOG_SOURCE_DIR, file), 'utf8'));
  return {
    staples: read(CATALOG_FILES.staples),
    combos: read(CATALOG_FILES.combos),
    tutors: read(CATALOG_FILES.tutors),
    gameChangers: read(CATALOG_FILES.gameChangers),
  };
}

/** Stable, key-sorted rendering so the output is deterministic. */
function literal(value, indent = 2) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map(v => `${pad}  ${literal(v, indent + 2)}`);
    return `[\n${items.join(',\n')}\n${pad}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    if (keys.length === 0) return '{}';
    const items = keys.map(k => `${pad}  ${JSON.stringify(k)}: ${literal(value[k], indent + 2)}`);
    return `{\n${items.join(',\n')}\n${pad}}`;
  }
  return JSON.stringify(value);
}

export function renderCatalogs(catalogs) {
  const counts = {
    fastMana: Object.values(catalogs.staples.fast_mana).reduce((n, t) => n + t.cards.length, 0),
    tutors: Object.values(catalogs.tutors).reduce((n, t) => n + t.cards.length, 0),
    combos: catalogs.combos.two_card_combos.length,
  };

  return `/**
 * GENERATED FILE — do not edit.
 *
 * Rendered from ${CATALOG_SOURCE_DIR}/{${Object.values(CATALOG_FILES).join(', ')}}
 * by scripts/vendor-engine.mjs, and re-rendered and byte-compared by
 * src/engine/engine-parity.test.ts, so it cannot drift from the JSON without
 * the suite going red.
 *
 * WHY IT EXISTS
 * The engine must be plain TypeScript with relative specifiers and nothing
 * else, because that is what lets the whole tree be mirrored byte for byte
 * into a Deno edge function. A JSON import would break that: Vite, Node's
 * type-stripping loader and Deno each want a different incantation for it.
 * The JSON files stay where they are because a marketing component imports one
 * of them directly.
 *
 * These are CURATED LISTS, not measurements. They are a written-down judgement
 * about which cards are fast mana, tutors, removal and so on, so that the
 * judgement can be argued with. Every number the power score derives from them
 * is traceable to a named card on one of these lists, which is what lets the
 * score explain itself card by card.
 *
 * ${counts.fastMana} fast-mana entries, ${counts.tutors} tutors, ${counts.combos} two-card combos.
 */

export interface WeightedList {
  weight: number;
  cards: string[];
}

export interface TwoCardCombo {
  name: string;
  cards: string[];
  total_mv: number;
  win_type?: string;
  protection_requirement?: string;
  tags?: string[];
}

export interface CompactCombo {
  name: string;
  requires: string[];
}

export interface FinisherConditions {
  min_inst_sorc?: number;
  min_creatures?: number;
  min_ramp?: number;
}

export const STAPLES: Record<string, Record<string, WeightedList>> = ${literal(catalogs.staples)};

export const TUTOR_TIERS: Record<string, WeightedList> = ${literal(catalogs.tutors)};

export const TWO_CARD_COMBOS: TwoCardCombo[] = ${literal(catalogs.combos.two_card_combos)};

export const COMPACT_COMBOS: CompactCombo[] = ${literal(catalogs.gameChangers.compact_combo)};

export const FINISHER_BOMBS: {
  cards: string[];
  conditional: Record<string, FinisherConditions>;
} = ${literal(catalogs.gameChangers.finisher_bomb)};

export const INEVITABILITY_ENGINES: string[] = ${literal(
    catalogs.gameChangers.inevitability_engine.cards
  )};

export const MASSIVE_SWINGS: string[] = ${literal(catalogs.gameChangers.massive_swing.cards)};
`;
}

/* ------------------------------------------------------------------ *
 * The mirror
 * ------------------------------------------------------------------ */

/** Every non-test `.ts` file under `src/engine/`, engine-relative, sorted. */
export function engineFiles(root = ROOT) {
  const base = path.join(root, ENGINE_DIR);
  const out = [];
  const walk = dir => {
    for (const entry of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        out.push(path.relative(base, p).split(path.sep).join('/'));
      }
    }
  };
  walk(base);
  return out.sort();
}

/** Every `.ts` file currently sitting in a consumer's vendored tree. */
export function vendoredFiles(consumer, root = ROOT) {
  const base = path.join(root, consumer, VENDOR_SUBDIR);
  if (!fs.existsSync(base)) return [];
  const out = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.ts')) {
        out.push(path.relative(base, p).split(path.sep).join('/'));
      }
    }
  };
  walk(base);
  return out.sort();
}

export function sourcePath(rel, root = ROOT) {
  return path.join(root, ENGINE_DIR, rel);
}

export function vendorPath(consumer, rel, root = ROOT) {
  return path.join(root, consumer, VENDOR_SUBDIR, rel);
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

/**
 * `--check` reports staleness and writes nothing.
 *
 * The obvious way to stop drift shipping is to re-vendor before every build and
 * every test run. That is worse than it looks: if `pretest` regenerates the
 * tree then `engine-parity.test.ts` can never fail, and the guarantee it exists
 * to provide quietly evaporates while the suite stays green. So the build and
 * the test run VERIFY, and writing stays a deliberate act.
 */
const CHECK_ONLY = process.argv.includes('--check');

if (isMain) {
  // 1. Regenerate the catalogue first: it is part of the engine, so it has to
  //    be current before anything is mirrored.
  const rendered = renderCatalogs(readCatalogs());
  const catalogPath = path.join(ROOT, CATALOG_TARGET);
  fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
  const before = fs.existsSync(catalogPath) ? fs.readFileSync(catalogPath, 'utf8') : null;
  const stale = [];
  if (before !== rendered) {
    if (CHECK_ONLY) stale.push(CATALOG_TARGET);
    else {
      fs.writeFileSync(catalogPath, rendered);
      console.log('generated', `${CATALOG_TARGET} (${rendered.length} bytes)`);
    }
  } else if (!CHECK_ONLY) {
    console.log('unchanged', CATALOG_TARGET);
  }

  // 2. Mirror.
  const files = engineFiles();
  for (const consumer of CONSUMERS) {
    let copied = 0;
    for (const rel of files) {
      const dst = vendorPath(consumer, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      const a = fs.readFileSync(sourcePath(rel));
      const b = fs.existsSync(dst) ? fs.readFileSync(dst) : null;
      if (!b || !a.equals(b)) {
        if (CHECK_ONLY) stale.push(consumer + '/' + VENDOR_SUBDIR + '/' + rel);
        else {
          fs.writeFileSync(dst, a);
          copied++;
        }
      }
    }

    // 3. Remove anything that is no longer part of the engine. A stale file
    //    left behind is a second implementation waiting to be imported.
    const orphans = vendoredFiles(consumer).filter(rel => !files.includes(rel));
    for (const rel of orphans) {
      if (CHECK_ONLY) {
        stale.push(consumer + '/' + VENDOR_SUBDIR + '/' + rel + ' (no longer part of the engine)');
      } else {
        fs.rmSync(vendorPath(consumer, rel));
        console.log('removed  ', `${consumer}/${VENDOR_SUBDIR}/${rel}`);
      }
    }

    if (!CHECK_ONLY) {
      console.log(
        'vendored ',
        `${ENGINE_DIR} -> ${consumer}/${VENDOR_SUBDIR} ` +
          `(${files.length} files, ${copied} written, ${orphans.length} removed)`
      );
    }
  }

  // 4. The shared non-engine files, on the same terms.
  for (const { from, to } of SHARED_FILES) {
    const src = path.join(ROOT, from);
    const dst = path.join(ROOT, to);
    const a = fs.readFileSync(src);
    const b = fs.existsSync(dst) ? fs.readFileSync(dst) : null;
    if (b && a.equals(b)) {
      if (!CHECK_ONLY) console.log('unchanged', to);
      continue;
    }
    if (CHECK_ONLY) stale.push(`${to} (differs from ${from})`);
    else {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, a);
      console.log('shared   ', `${from} -> ${to}`);
    }
  }

  // 5. The one generated file the facet mirror needs. See FACET_SHIM.
  {
    const dst = path.join(ROOT, FACET_SHIM.path);
    const before = fs.existsSync(dst) ? fs.readFileSync(dst, 'utf8') : null;
    if (before !== FACET_SHIM.body) {
      if (CHECK_ONLY) stale.push(`${FACET_SHIM.path} (generated shim is stale)`);
      else {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.writeFileSync(dst, FACET_SHIM.body);
        console.log('generated', FACET_SHIM.path);
      }
    } else if (!CHECK_ONLY) {
      console.log('unchanged', FACET_SHIM.path);
    }
  }

  if (CHECK_ONLY) {
    if (stale.length > 0) {
      console.error(
        'The vendored engine is stale. ' +
          stale.length +
          ' file(s) differ from their source:\n  ' +
          stale.join('\n  ') +
          '\n\nRun: npm run vendor'
      );
      process.exit(1);
    }
    console.log(
      'engine parity ok (' +
        files.length +
        ' files x ' +
        CONSUMERS.length +
        ' consumers, ' +
        SHARED_FILES.length +
        ' shared)'
    );
  } else {
    console.log('\nRun `npm test` to confirm parity.');
  }
}
