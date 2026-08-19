/**
 * scripts/coverage/engine-index.mjs — pass 0: index XMage's ENGINE tree.
 *
 *   node scripts/coverage/engine-index.mjs
 *
 * Emits `.data/engine.json`: every class under `Mage/src/main/java`, with the
 * facts the later passes need — whether it is abstract, its superclass, its
 * in-engine imports, its size, a content hash and the commit that last touched
 * it. Two consumers:
 *
 *   rank.mjs   needs `abstract` to tell FRAMEWORK from BEHAVIOUR (below), and
 *              `imports` to build the dependency graph.
 *   drift.mjs  needs `sha256` + `lastCommit` — this file IS the drift baseline.
 *
 * ## The framework/behaviour distinction, and why it is mechanical
 *
 * The first cut of the ranker treated every imported engine class as a primitive
 * to implement. That put `MageSingleton`, `AbilitiesImpl`, `TargetPointer` and
 * `SplitCard` in the top 40 — XMage's object hierarchy, not Magic's rules. It
 * made the ranking actively worse: the top 100 fell from ~4,979 cards to 799,
 * because a hundred ranks were spent on scaffolding that unlocks nothing.
 *
 * The rule that fixes it must not be a hand-written name list — that is the
 * exact defect the spike's v1/v2 detectors died of. It is instead mechanical and
 * checkable:
 *
 *   An ABSTRACT class or an INTERFACE in XMage's engine is FRAMEWORK.
 *
 * It exists so XMage's concrete classes can share Java plumbing. Our DSL is a
 * tagged union of plain data with no inheritance at all, so there is nothing to
 * port: `OneShotEffect` is not a thing we implement, it is a shape our `Effect`
 * union already has. Only CONCRETE classes carry behaviour that has to be
 * written as one of our verbs.
 *
 * Held honestly: this rule REMOVES work from the list, so it is the direction
 * that can flatter us. The guard is §3 of PRIMITIVE-BUILD-ORDER.md — cards whose
 * only remaining primitives are framework are re-checked for hand-written Java
 * and dropped from the unlockable set if they have any.
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  xmageRoot,
  xmageCommit,
  PINNED_COMMIT,
  ENGINE_DIR,
  walkJava,
  parseJava,
  stripComments,
  isEngineSymbol,
  pct,
} from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, '.data');
mkdirSync(DATA, { recursive: true });

const root = xmageRoot();
const commit = xmageCommit(root);
console.log(`XMage commit: ${commit}${commit === PINNED_COMMIT ? ' (pinned)' : ' ** NOT the pinned commit **'}`);

const withGit = !process.argv.includes('--no-git');
const prefix = join(root, ENGINE_DIR).replace(/\\/g, '/') + '/';
const files = walkJava(join(root, ENGINE_DIR));
console.log(`engine files: ${files.length}`);

/** `abstract class X` / `interface X`, where X is the file's own public type. */
function shapeOf(src, cls) {
  const abs = new RegExp(`\\babstract\\s+class\\s+${cls}\\b`).test(src);
  const iface = new RegExp(`\\binterface\\s+${cls}\\b`).test(src);
  const enm = new RegExp(`\\benum\\s+${cls}\\b`).test(src);
  return { abstract: abs, interface: iface, enum: enm };
}

/**
 * One `git log` per file would be 3,725 subprocesses. This walks the whole tree's
 * history once instead and takes the newest commit touching each path.
 */
function lastCommits() {
  const out = new Map();
  if (!withGit) return out;
  const raw = execFileSync(
    'git',
    ['-C', root, 'log', '--format=%H%x00%ct', '--name-only', '--', ENGINE_DIR],
    { encoding: 'utf8', maxBuffer: 1 << 30 },
  );
  let sha = null;
  let ts = null;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const nul = line.indexOf('\0');
    if (nul > -1) {
      sha = line.slice(0, nul);
      ts = Number(line.slice(nul + 1));
      continue;
    }
    if (!out.has(line)) out.set(line, { sha, ts });
  }
  return out;
}

console.log('reading git history for the engine tree…');
const commits = lastCommits();
console.log(`  paths with history: ${commits.size}`);

const index = {};
let nAbstract = 0;
let nInterface = 0;
let nEnum = 0;

for (const f of files) {
  const rel = f.replace(/\\/g, '/');
  if (!rel.startsWith(prefix)) continue;
  const fqn = rel.slice(prefix.length, -5).replace(/\//g, '.');
  const p = parseJava(f, root);
  const shape = shapeOf(p.src, fqn.split('.').pop());
  if (shape.abstract) nAbstract++;
  if (shape.interface) nInterface++;
  if (shape.enum) nEnum++;

  const gitPath = `${ENGINE_DIR}/${fqn.replace(/\./g, '/')}.java`;
  const hist = commits.get(gitPath);

  index[fqn] = {
    loc: p.loc,
    superclass: p.selfBase,
    ...shape,
    imports: p.imports.filter(isEngineSymbol),
    bespoke: p.bespoke.length,
    // Hash of COMMENT-STRIPPED source. A reformatted licence header or a
    // corrected oracle-text comment must not read as a semantic change, or the
    // drift signal becomes noise nobody looks at.
    sha256: createHash('sha256').update(stripComments(readFileSync(f, 'utf8'))).digest('hex').slice(0, 16),
    lastCommit: hist?.sha ?? null,
    lastCommitTs: hist?.ts ?? null,
  };
}

const n = Object.keys(index).length;
console.log(`  indexed:    ${n}`);
console.log(`  abstract:   ${nAbstract} (${pct(nAbstract, n)}%)  -> FRAMEWORK`);
console.log(`  interfaces: ${nInterface} (${pct(nInterface, n)}%)  -> FRAMEWORK`);
console.log(`  enums:      ${nEnum} (${pct(nEnum, n)}%)  -> parameter data`);
console.log(`  concrete behaviour classes: ${n - nAbstract - nInterface - nEnum}`);

writeFileSync(
  join(DATA, 'engine.json'),
  JSON.stringify({ meta: { commit, pinnedCommit: PINNED_COMMIT, indexedAt: new Date().toISOString(), files: n }, index }),
);
console.log(`\nwrote ${join(DATA, 'engine.json')}`);
