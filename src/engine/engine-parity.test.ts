/**
 * There is one engine, and the vendored copy of it is byte-identical.
 *
 *   node --test --experimental-strip-types src/engine/engine-parity.test.ts
 *
 * A Deno edge function is bundled from its own directory and cannot import
 * `src/engine/`, so `supabase/functions/deck-optimizer/_engine/` holds a copy.
 * A copy is only defensible while something checks it. This is that check, and
 * it is deliberately stricter than the version it replaces, which vendored
 * seven hand-listed files and compared an eighth against a re-render.
 *
 * Four properties, in the order they would fail:
 *
 *   1. every non-test file under `src/engine/` has a vendored twin, byte for
 *      byte;
 *   2. the vendored tree contains nothing else, so a deleted engine module
 *      cannot survive as a second implementation nobody is looking at;
 *   3. `power/catalogs.ts` still matches a fresh render of the JSON it is
 *      generated from;
 *   4. nothing under `_engine/` imports outside `_engine/`, and nothing under
 *      `src/engine/` imports outside `src/engine/` — which is what makes 1
 *      possible at all, and is the rule that keeps the engine pure.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// Plain ESM helper, shared with the vendoring script so the file list has one
// definition rather than two that can disagree about what was vendored.
import {
  CONSUMERS,
  SHARED_FILES,
  ENGINE_DIR,
  VENDOR_SUBDIR,
  CATALOG_TARGET,
  engineFiles,
  vendoredFiles,
  sourcePath,
  vendorPath,
  readCatalogs,
  renderCatalogs,
} from '../../scripts/vendor-engine.mjs';

const ROOT = process.cwd();
const REGENERATE = 'run: node scripts/vendor-engine.mjs';

/**
 * Anchored to the start of a line so it matches real `import`/`export ... from`
 * statements and not the words "from '...'" inside the tagger's oracle-text
 * rules, which are ordinary string and regex literals.
 */
const MODULE_SPECIFIER = /^\s*(?:import|export)\b[^'"\n]*?\bfrom\s+['"]([^'"]+)['"]/gm;

function walkTs(dir: string): string[] {
  const out: string[] = [];
  const go = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) go(p);
      else if (entry.name.endsWith('.ts')) out.push(p);
    }
  };
  go(dir);
  return out;
}

describe('one engine', () => {
  const files = engineFiles(ROOT) as string[];

  it('the engine is not empty', () => {
    assert.ok(files.length > 5, `expected the engine to have modules, found ${files.length}`);
  });

  for (const consumer of CONSUMERS as string[]) {
    it(`${consumer}/${VENDOR_SUBDIR} holds exactly the engine, no more and no less`, () => {
      assert.deepEqual(
        vendoredFiles(consumer, ROOT),
        files,
        `the vendored tree does not match ${ENGINE_DIR} — ${REGENERATE}`
      );
    });

    for (const rel of files) {
      it(`${consumer}/${VENDOR_SUBDIR}/${rel} is byte-identical to ${ENGINE_DIR}/${rel}`, () => {
        const src = sourcePath(rel, ROOT);
        const dst = vendorPath(consumer, rel, ROOT);
        assert.ok(fs.existsSync(dst), `missing vendored copy ${rel} — ${REGENERATE}`);
        assert.ok(
          fs.readFileSync(src).equals(fs.readFileSync(dst)),
          `${rel} has drifted from its source — ${REGENERATE}`
        );
      });
    }
  }

  /**
   * The one file that is generated rather than authored. It is compared against
   * a fresh render of the JSON, which is the same strength of guarantee as a
   * byte comparison against a source file: change the catalogue and this goes
   * red until the generator is run again.
   */
  it(`${CATALOG_TARGET} matches a fresh render of the card catalogues`, () => {
    const catalogPath = path.join(ROOT, CATALOG_TARGET);
    assert.ok(fs.existsSync(catalogPath), `missing ${CATALOG_TARGET} — ${REGENERATE}`);
    assert.equal(
      fs.readFileSync(catalogPath, 'utf8'),
      renderCatalogs(readCatalogs(ROOT)),
      `${CATALOG_TARGET} is stale — ${REGENERATE}`
    );
  });

  /**
   * The shared non-engine files, on the same terms.
   *
   * `catalog.ts` cannot live in the engine because it opens a socket, but the
   * generator and the optimiser have to ask the database for the candidate
   * pool identically, or the shared ranking downstream is ranking two
   * different worlds. That was the generator's actual bug: it read 8,000
   * unordered rows while the optimiser read every one.
   */
  for (const { from, to } of SHARED_FILES as Array<{ from: string; to: string }>) {
    it(`${to} is byte-identical to ${from}`, () => {
      const src = path.join(ROOT, from);
      const dst = path.join(ROOT, to);
      assert.ok(fs.existsSync(dst), `missing shared copy ${to} — ${REGENERATE}`);
      assert.ok(
        fs.readFileSync(src).equals(fs.readFileSync(dst)),
        `${to} has drifted from ${from} — ${REGENERATE}`
      );
    });
  }
});

describe('the engine is pure', () => {
  /**
   * This is the property everything else rests on. The moment one engine module
   * imports `@/integrations/supabase/client` or `react`, the tree stops being
   * mirrorable and the edge function starts needing its own reimplementation,
   * which is the disease.
   */
  it(`nothing under ${ENGINE_DIR} imports outside itself`, () => {
    const engineRoot = path.join(ROOT, ENGINE_DIR);
    const offenders: string[] = [];

    for (const file of walkTs(engineRoot)) {
      const text = fs.readFileSync(file, 'utf8');
      const isTest = file.endsWith('.test.ts');
      for (const m of text.matchAll(MODULE_SPECIFIER)) {
        const spec = m[1];
        if (!spec.startsWith('.')) {
          // A test may import node:test and node:assert. Nothing else may
          // import a bare specifier at all.
          if (isTest && spec.startsWith('node:')) continue;
          offenders.push(`${path.relative(ROOT, file)} imports bare "${spec}"`);
          continue;
        }
        const target = path.resolve(path.dirname(file), spec);
        // Tests are allowed to reach out — `engine-parity.test.ts` has to read
        // the vendoring script, and the optimiser's rule tests import the
        // function they are testing. Shipped modules are not.
        if (!isTest && !target.startsWith(engineRoot)) {
          offenders.push(`${path.relative(ROOT, file)} imports ${spec}, which escapes the engine`);
          continue;
        }
        if (!isTest) {
          assert.ok(
            fs.existsSync(target),
            `${path.relative(ROOT, file)} imports missing ${spec}`
          );
        }
      }
    }

    assert.deepEqual(offenders, [], offenders.join('\n'));
  });

  for (const consumer of CONSUMERS as string[]) {
    it(`nothing under ${consumer}/${VENDOR_SUBDIR} imports outside itself`, () => {
      const engineRoot = path.join(ROOT, consumer, VENDOR_SUBDIR);
      for (const file of walkTs(engineRoot)) {
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
            `${path.relative(ROOT, file)} imports ${spec}, which escapes ${VENDOR_SUBDIR}/ ` +
              `and would not survive bundling`
          );
          assert.ok(fs.existsSync(target), `${path.relative(ROOT, file)} imports missing ${spec}`);
        }
      }
    });
  }
});
