/**
 * Runs `src/lib/synergy/selftest.ts` in plain Node.
 *
 *   node scripts/synergy-selftest.mjs
 *
 * The project has no test runner installed and adding one was out of scope for
 * this prototype, so this bundles the pure TypeScript with the esbuild that
 * Vite already depends on and executes the result. No new dependency.
 *
 * Exits non-zero when any check fails, so it can be wired into CI as-is.
 */

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const scratch = await mkdtemp(path.join(tmpdir(), 'synergy-selftest-'));
const outfile = path.join(scratch, 'selftest.mjs');

try {
  await build({
    entryPoints: [path.join(ROOT, 'src', 'lib', 'synergy', 'selftest.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    logLevel: 'warning',
    // Mirrors the `@/*` alias from tsconfig.app.json and vite.config.ts.
    alias: { '@': path.join(ROOT, 'src') },
  });

  const { runSynergySelfTest } = await import(pathToFileURL(outfile).href);
  const results = await runSynergySelfTest();

  const passed = results.filter(r => r.pass);
  const failed = results.filter(r => !r.pass);

  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n        ${r.detail}`);
  }

  console.log(`\n${passed.length}/${results.length} checks passed`);

  if (failed.length > 0) {
    console.error(`\n${failed.length} FAILED:`);
    for (const r of failed) console.error(`  - ${r.name}: ${r.detail}`);
    process.exitCode = 1;
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}
