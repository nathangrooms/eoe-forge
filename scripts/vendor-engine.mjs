/**
 * Copy the pure recommendation engine into the deck-optimizer edge function.
 *
 *   node --experimental-strip-types src/lib/deck/recommend/vendor-engine.mjs
 *
 * WHY A COPY AND NOT AN IMPORT
 * ----------------------------
 * A Deno edge function is deployed as a self-contained bundle: every module it
 * reaches has to sit under `supabase/functions/<name>/`, so it cannot import
 * `src/lib/...` the way the browser build does. There were three ways out:
 *
 *   1. Move the shared logic to a directory both trees can reach. This is the
 *      tidiest, and it is the one NOT taken: it means deleting files from
 *      `src/lib/` and rewriting imports in modules other agents are editing in
 *      this same working tree right now. A move that collides is worse than a
 *      copy that is checked.
 *   2. Reimplement the ranking in SQL. Then the edge function and the client
 *      would rank by two rules that drift apart silently, which is the same
 *      class of problem this whole change exists to remove.
 *   3. Copy, and make drift a failing test. That is what this does.
 *
 * Most files are copied BYTE-IDENTICALLY — no import rewriting — which is only
 * possible because the sources already use explicit `.ts` specifiers and the
 * layout below preserves every relative path (`../../cards/tag-signal.ts`
 * resolves inside `_engine/` exactly as it does inside `src/lib/`).
 *
 * THE ONE EXCEPTION: tagger.ts
 * ----------------------------
 * `src/lib/cards/tagger.ts` is 815 lines, and all but a handful of them are the
 * oracle-text regexes that assign tags during a card import. The edge function
 * never tags a card — the tags are already columns on the rows it reads. It
 * imports `tagger.ts` for exactly one reason: `tag-signal.ts` reads `.tag` and
 * `.also` off `TAG_RULES` to work out which tag names are legacy aliases of
 * which, so ranking does not score one idea three times.
 *
 * So the vendored `tagger.ts` is generated: the same rules, carrying only those
 * two fields. `engine-parity.test.ts` re-renders it from the live `TAG_RULES`
 * and compares bytes, so this is not a hand-maintained duplicate — a new rule
 * or a new alias in the real tagger turns the suite red until it is regenerated.
 *
 * That drops 34 KB of unreachable regex out of the deployed bundle, and, more
 * to the point, means the function cannot silently ship a *stale* copy of the
 * rules that matter.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');

export const FUNCTION_DIR = 'supabase/functions/deck-optimizer';

/** Copied byte for byte. source (repo-relative) -> path inside the function. */
export const VENDORED = [
  ['src/lib/cards/tag-signal.ts', '_engine/cards/tag-signal.ts'],
  ['src/lib/deck/recommend/types.ts', '_engine/deck/recommend/types.ts'],
  ['src/lib/deck/recommend/roles.ts', '_engine/deck/recommend/roles.ts'],
  ['src/lib/deck/recommend/profile.ts', '_engine/deck/recommend/profile.ts'],
  ['src/lib/deck/recommend/query.ts', '_engine/deck/recommend/query.ts'],
  ['src/lib/deck/recommend/rank.ts', '_engine/deck/recommend/rank.ts'],
  ['src/lib/deck/recommend/index.ts', '_engine/deck/recommend/index.ts'],
];

/** Generated rather than copied. */
export const TAGGER_SOURCE = 'src/lib/cards/tagger.ts';
export const TAGGER_VENDORED = '_engine/cards/tagger.ts';

/**
 * Render the vendored tagger from the real rules.
 *
 * Deterministic: same rules in, same bytes out, so the parity test can compare
 * against it directly. Rules keep their source order because `ALIAS_TAGS` is
 * order-independent but a stable render makes diffs readable.
 */
export function renderTaggerShim(rules) {
  const body = rules
    .map(r => {
      const also = r.also?.length ? `, also: [${r.also.map(a => `'${a}'`).join(', ')}]` : '';
      return `  { tag: '${r.tag}'${also} },`;
    })
    .join('\n');

  return `/**
 * GENERATED FILE — do not edit.
 *
 * Rendered from ${TAGGER_SOURCE} by
 * src/lib/deck/recommend/vendor-engine.mjs, and re-rendered and byte-compared
 * by src/lib/deck/recommend/engine-parity.test.ts, so it cannot drift from the
 * real rules without the test suite going red.
 *
 * WHY IT IS A SUBSET
 * The real \`TAG_RULES\` carries a \`when\` condition per rule: the oracle-text
 * and type-line matchers that assign tags when a card is imported. The edge
 * function never tags a card — \`cards.tags\` is already populated — and the only
 * consumer here, \`tag-signal.ts\`, reads exactly two fields:
 *
 *     TAG_RULES.map(r => r.tag)      // the canonical tag names
 *     rule.also                      // their legacy aliases
 *
 * from which it derives \`ALIAS_TAGS\` so that ranking counts one idea once. Every
 * rule below is present with both of those fields intact, so \`ALIAS_TAGS\` and
 * the canonical set are identical to the ones the browser build computes.
 * Carrying the matchers as well would ship 34 KB of regex that nothing in this
 * function can reach.
 *
 * ${rules.length} rules, ${rules.filter(r => r.also?.length).length} of them carrying aliases.
 */

export interface TagRule {
  /** Canonical tag. */
  tag: string;
  /** Legacy tag names emitted alongside the canonical one. */
  also?: string[];
}

export const TAG_RULES: TagRule[] = [
${body}
];
`;
}

export function vendoredPairs(root = ROOT) {
  return VENDORED.map(([src, dst]) => ({
    src: path.join(root, src),
    dst: path.join(root, FUNCTION_DIR, dst),
    label: `${src} -> ${FUNCTION_DIR}/${dst}`,
  }));
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  for (const { src, dst, label } of vendoredPairs()) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    console.log('copied   ', label);
  }

  // A bare Windows path is not a valid ESM specifier ("protocol 'c:'").
  const { TAG_RULES } = await import(pathToFileURL(path.join(ROOT, TAGGER_SOURCE)).href);
  const shim = renderTaggerShim(TAG_RULES);
  const shimPath = path.join(ROOT, FUNCTION_DIR, TAGGER_VENDORED);
  fs.mkdirSync(path.dirname(shimPath), { recursive: true });
  fs.writeFileSync(shimPath, shim);
  console.log(
    'generated',
    `${TAGGER_SOURCE} -> ${FUNCTION_DIR}/${TAGGER_VENDORED} ` +
      `(${TAG_RULES.length} rules, ${shim.length} bytes)`
  );

  console.log(`\n${VENDORED.length + 1} files vendored. Run \`npm test\` to confirm parity.`);
}
