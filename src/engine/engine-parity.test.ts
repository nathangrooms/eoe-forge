/**
 * The vendored engine must be the engine.
 *
 *   node --test --experimental-strip-types src/lib/deck/recommend/engine-parity.test.ts
 *
 * `supabase/functions/deck-optimizer/_engine/` holds byte-identical copies of
 * the pure ranking modules, because a Deno edge function is bundled from its
 * own directory and cannot import `src/lib/`. A copy is only defensible while
 * something checks it, so this is that check: edit a source module without
 * re-running `vendor-engine.mjs` and this test goes red with the exact file
 * named.
 *
 * It also asserts the vendored tree stays free of imports that reach outside
 * itself, since such an import would deploy fine locally and fail in the
 * bundle.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
// Plain ESM helper, shared with the vendoring script so the file list has one
// definition rather than two that can disagree about what was vendored.
import {
  VENDORED,
  FUNCTION_DIR,
  TAGGER_SOURCE,
  TAGGER_VENDORED,
  renderTaggerShim,
} from './vendor-engine.mjs';
import { TAG_RULES } from '../../cards/tagger.ts';

const ROOT = process.cwd();

describe('vendored engine parity', () => {
  for (const [src, dst] of VENDORED as [string, string][]) {
    const srcPath = path.join(ROOT, src);
    const dstPath = path.join(ROOT, FUNCTION_DIR, dst);

    it(`${dst} is byte-identical to ${src}`, () => {
      assert.ok(fs.existsSync(srcPath), `missing source ${src}`);
      assert.ok(
        fs.existsSync(dstPath),
        `missing vendored copy ${dst} — run: node src/lib/deck/recommend/vendor-engine.mjs`
      );
      const a = fs.readFileSync(srcPath);
      const b = fs.readFileSync(dstPath);
      assert.ok(
        a.equals(b),
        `${dst} has drifted from ${src} — run: node src/lib/deck/recommend/vendor-engine.mjs`
      );
    });
  }

  /**
   * The generated tagger is not compared byte-for-byte against its source —
   * it is a deliberate subset — so it is compared against a fresh render of
   * the live rules instead. That is the same strength of guarantee: a rule
   * added, renamed, or given a new alias in `tagger.ts` changes the render and
   * fails here until `vendor-engine.mjs` is run again.
   */
  it(`${TAGGER_VENDORED} matches a fresh render of ${TAGGER_SOURCE}`, () => {
    const shimPath = path.join(ROOT, FUNCTION_DIR, TAGGER_VENDORED);
    assert.ok(
      fs.existsSync(shimPath),
      `missing ${TAGGER_VENDORED} — run: node --experimental-strip-types src/lib/deck/recommend/vendor-engine.mjs`
    );
    assert.equal(
      fs.readFileSync(shimPath, 'utf8'),
      renderTaggerShim(TAG_RULES),
      `${TAGGER_VENDORED} is stale — run: node --experimental-strip-types src/lib/deck/recommend/vendor-engine.mjs`
    );
  });

  /**
   * What the subset actually has to preserve: the canonical tag names and the
   * alias mapping, because `tag-signal.ts` derives `ALIAS_TAGS` from exactly
   * those and everything the ranker does with tags depends on it.
   */
  it('the generated tagger preserves every tag name and alias', async () => {
    const vendored = await import(
      /* @vite-ignore */ pathToFileURL(
        path.join(ROOT, FUNCTION_DIR, TAGGER_VENDORED)
      ).href
    );
    const shape = (rules: { tag: string; also?: string[] }[]) =>
      rules.map(r => ({ tag: r.tag, also: r.also ?? [] }));

    assert.deepEqual(shape(vendored.TAG_RULES), shape(TAG_RULES));

    // And the thing derived from them, computed the way tag-signal computes it.
    const aliasesOf = (rules: { tag: string; also?: string[] }[]) => {
      const canonical = new Set(rules.map(r => r.tag));
      const aliases = new Set<string>();
      for (const r of rules) for (const a of r.also ?? []) if (!canonical.has(a)) aliases.add(a);
      return [...aliases].sort();
    };
    assert.deepEqual(aliasesOf(vendored.TAG_RULES), aliasesOf(TAG_RULES));
    assert.ok(aliasesOf(TAG_RULES).length > 0, 'expected at least one alias to exist');
  });

  it('the vendored tree imports nothing from outside itself', () => {
    const engineRoot = path.join(ROOT, FUNCTION_DIR, '_engine');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.name.endsWith('.ts')) files.push(p);
      }
    };
    walk(engineRoot);
    assert.ok(files.length > 0, 'no vendored files found');

    // Anchored to the start of a line so it matches real `import`/`export ...
    // from` statements and not the words "from '...'" inside the tagger's
    // oracle-text rules, which are ordinary string and regex literals.
    const MODULE_SPECIFIER = /^\s*(?:import|export)\b[^'"\n]*?\bfrom\s+['"]([^'"]+)['"]/gm;

    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(MODULE_SPECIFIER)) {
        const spec = m[1];
        assert.ok(
          spec.startsWith('.'),
          `${path.relative(ROOT, file)} imports bare specifier "${spec}"; the vendored ` +
            `engine must stay dependency-free`
        );
        const target = path.resolve(path.dirname(file), spec);
        assert.ok(
          target.startsWith(engineRoot),
          `${path.relative(ROOT, file)} imports ${spec}, which escapes _engine/ ` +
            `and would not survive bundling`
        );
        assert.ok(fs.existsSync(target), `${path.relative(ROOT, file)} imports missing ${spec}`);
      }
    }
  });
});
