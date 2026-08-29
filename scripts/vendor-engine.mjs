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

/**
 * Every function that gets a copy. Add a function here, not a new script.
 *
 * `mtg-brain` is Tutor, and it was built beside the engine rather than on it.
 * It read `cards.tags` straight from the column, which gave it the tagger's
 * OUTPUT and nothing else, and then kept its own hand-written list of what
 * those tag names mean. Counted before this line was added: the engine declares
 * 66 tag rules writing 76 names, and Tutor named all 76 in its own tables with
 * nothing checking either list against the other. They happened to agree.
 * Nothing made them agree, and nothing would have said so when they stopped.
 *
 * Tutor takes the facet producer too, and the reason it did not at first was
 * wrong rather than economical. The note here used to say Tutor does not rank a
 * candidate pool so it does not need the producer. Ranking a pool is not what
 * the producer is for. It is what turns oracle text into a record of what a
 * card DOES, and Tutor's whole job is answering that question about a handful
 * of cards at a time. Reading `cards.tags` gave it one word per card while the
 * optimiser sitting beside it read the structure the same compiler produced.
 */
export const CONSUMERS = [
  'supabase/functions/deck-optimizer',
  'supabase/functions/ai-deck-builder-v2',
  'supabase/functions/mtg-brain',
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
 * From `_lib/deck/recommend/` that path lands on the FUNCTION ROOT's
 * `engine/knowledge/`, three levels up rather than two, so
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

/**
 * Where the facet producer lands. BOTH functions that rank a pool need it.
 *
 * This was one path, the generator's, and the optimiser was left out. That was
 * not a deliberate scoping decision, it was the same omission this block's own
 * comment describes being fixed for the generator, applied to only one of the
 * two callers.
 *
 * The cost of leaving it out, measured: `deck-optimizer/index.ts` calls
 * `catalog.poolFor(query)` without `withOracleText`, no file under
 * `deck-optimizer/` calls `facetsForCard`, and `_engine/advise/rank.ts` calls
 * `planFit(profile.commanderPlan, card)` on every candidate. `planFit` is
 * documented as silent for a card with no record, so the commander-fit signal
 * contributed EXACTLY ZERO to every suggestion the optimiser has ever made.
 * The engine was wired in and never fed.
 *
 * It costs 3.68 MB of source in the optimiser's bundle, of which 3.16 MB is
 * `xmage/lowered.generated.ts`. The generator already pays it for the same
 * reason: that table speaks for the cards the oracle-text compiler cannot
 * fully read, and dropping it would take removal staples out of the answer.
 *
 * TUTOR IS THE THIRD, and it is not a pool ranker. It reads a handful of cards
 * per question, which is why the compute cost is nothing like the generator's:
 * the optimiser compiles a 24,000 row pool and Tutor compiles at most the deck
 * plus the card being asked about. It pays the same 3.68 MB of source for the
 * same reason, and dropping the XMage table for it would mean Tutor answering
 * "what does Wrath of God do" from a different record than the optimiser reads
 * when it suggests Wrath of God, which is the drift this whole file prevents.
 */
export const FACET_SUBDIRS = [
  'supabase/functions/ai-deck-builder-v2/_lib',
  'supabase/functions/deck-optimizer/_lib',
  'supabase/functions/mtg-brain/_lib',
];

/**
 * The deck legality rules, mirrored into Tutor only.
 *
 * `src/lib/deck/deckLegality.ts` already answers every legality question that
 * was put to Tutor and refused: the singleton rule, the copy limit with the
 * basic land exception tested first, banned, never legal, restricted with more
 * than one copy, and colour identity against the commander. It has tests. It
 * was not imported by the function that needed it, so Tutor answered "can I run
 * two copies of Sol Ring in Commander" with a card page and no rule at all.
 *
 * Writing a second opinion inside the function is the option this repository
 * has already paid for twice. So it is mirrored on the engine's terms instead:
 * one source, byte-identical copy, `--check` fails on drift.
 *
 * The optimiser and the generator do not take it. They build decks rather than
 * judging them, and mirroring a file into a function that never imports it is
 * how a stale second implementation gets left lying around for somebody to find
 * and use.
 */
const LEGALITY_SOURCES = ['deck/deckLegality.ts', 'magic/formats.ts'];

/** Only Tutor asks whether a deck is legal. */
export const LEGALITY_SUBDIRS = ['supabase/functions/mtg-brain/_lib'];

/** Kept as the generator's path, because other callers name it. */
export const FACET_SUBDIR = FACET_SUBDIRS[0];

/**
 * WHERE THE SHIM GOES, counted rather than assumed.
 *
 * The comment above used to say the import lands on `_lib/engine/knowledge/`.
 * It does not. `deck/recommend/behaviour.ts` imports
 * `../../../engine/knowledge/behaviour.ts`, and relative specifiers resolve
 * from the DIRECTORY OF THE IMPORTING FILE, which vendored is
 * `<fn>/_lib/deck/recommend/`. Three levels up from there is the FUNCTION
 * ROOT, not `_lib`:
 *
 *   ../          <fn>/_lib/deck/
 *   ../../       <fn>/_lib/
 *   ../../../    <fn>/
 *
 * so the file has to be `<fn>/engine/knowledge/behaviour.ts`. Writing it under
 * `_lib/` put it one directory too deep and the specifier pointed at nothing.
 *
 * It went unnoticed because no function carrying `_lib` had ever been deployed:
 * ai-deck-builder-v2 is still serving 6-grounded, which predates the facet
 * mirror entirely. The Supabase CLI found it in a second, as
 *   WARN: failed to read file: open .../deck-optimizer/engine/knowledge/behaviour.ts
 * which is a warning rather than an error, so the deploy would have shipped a
 * function whose facet producer could not resolve its own type import.
 */
const facetShimFor = subdir => ({
  path: `${subdir.replace(/\/_lib$/, '')}/engine/knowledge/behaviour.ts`,
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
export type { Facet } from '../../_engine/knowledge/behaviour.ts';
`,
});

export const FACET_SHIMS = FACET_SUBDIRS.map(facetShimFor);

/** Kept for callers that expect a single shim. */
export const FACET_SHIM = FACET_SHIMS[0];

/**
 * THE ONE SHIM THAT DECLARES A SHAPE RATHER THAN RE-EXPORTING ONE.
 *
 * `deckLegality.ts` names its row type as `import type { DeckCardRow } from
 * './deckCards.ts'`, and `deckCards.ts` cannot be mirrored: it opens the
 * Supabase client through the `@/` alias, which is Vite's and means nothing to
 * Deno. So this file has to stand in for it, and standing in means writing the
 * fields down a second time, which is exactly the drift the rest of this script
 * exists to prevent.
 *
 * TWO THINGS MAKE THAT SAFE, and neither is a promise to remember.
 *
 * 1. It is deliberately NARROWER than the real row. Only the fields
 *    `deckLegality.ts` actually reads are here: the name in both places it can
 *    live, the quantity, and the three card columns the rules test. Every field
 *    left out is one that cannot drift.
 * 2. `src/lib/tutor/mirror-types.test.ts` asserts assignability in both
 *    directions against the real `DeckCardRow` at compile time, so `tsc` fails
 *    if either side changes shape. A runtime test cannot see this, and that is
 *    why the assertion is written as types the compiler has to check rather
 *    than as an expectation a runner reports.
 *
 * `quantity` is `number` here and `number` there. `card` is nullable in both,
 * because a printing missing from the local table is the `no-data` fault
 * `cardFaults` reports rather than a crash.
 */
const legalityRowShimFor = subdir => ({
  path: `${subdir}/deck/deckCards.ts`,
  body: `/**
 * GENERATED FILE — do not edit. Written by scripts/vendor-engine.mjs.
 *
 * \`_lib/deck/deckLegality.ts\` is a byte-identical copy of
 * \`src/lib/deck/deckLegality.ts\`, and that file names its row type as
 * \`./deckCards.ts\`. The real \`deckCards.ts\` reaches the Supabase client
 * through Vite's \`@/\` alias and cannot be mirrored into a Deno function, so
 * this declares the part of the row the legality rules read and nothing else.
 *
 * Narrower on purpose: a field that is not here cannot drift from the field it
 * would have copied. \`src/lib/tutor/mirror-types.test.ts\` asserts this shape
 * against the real one at compile time in both directions.
 */

/** The joined card columns the legality rules read. */
export interface DeckCardDetail {
  name: string;
  legalities: Record<string, string> | null;
  color_identity: string[];
}

export interface DeckCardRow {
  card_name: string;
  quantity: number;
  /** \`null\` when the printing is missing from the local card table. */
  card: DeckCardDetail | null;
}
`,
});

export const LEGALITY_ROW_SHIMS = LEGALITY_SUBDIRS.map(legalityRowShimFor);

/** Every generated stand-in, in one list so the writer and `--check` agree. */
export const GENERATED_SHIMS = [...FACET_SHIMS, ...LEGALITY_ROW_SHIMS];

export const SHARED_FILES = [
  {
    from: 'supabase/functions/deck-optimizer/catalog.ts',
    to: 'supabase/functions/ai-deck-builder-v2/catalog.ts',
  },
  ...FACET_SUBDIRS.flatMap(subdir =>
    FACET_SOURCES.map(rel => ({
      from: `src/lib/${rel}`,
      to: `${subdir}/${rel}`,
    }))
  ),
  ...LEGALITY_SUBDIRS.flatMap(subdir =>
    LEGALITY_SOURCES.map(rel => ({
      from: `src/lib/${rel}`,
      to: `${subdir}/${rel}`,
    }))
  ),
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

  // 5. The generated stand-ins a mirrored file needs to resolve its own
  //    imports: one facet shim per facet target, one row shim per legality
  //    target. See FACET_SHIMS and LEGALITY_ROW_SHIMS.
  for (const shim of GENERATED_SHIMS) {
    const dst = path.join(ROOT, shim.path);
    const before = fs.existsSync(dst) ? fs.readFileSync(dst, 'utf8') : null;
    if (before !== shim.body) {
      if (CHECK_ONLY) stale.push(`${shim.path} (generated shim is stale)`);
      else {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.writeFileSync(dst, shim.body);
        console.log('generated', shim.path);
      }
    } else if (!CHECK_ONLY) {
      console.log('unchanged', shim.path);
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
