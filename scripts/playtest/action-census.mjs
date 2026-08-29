/**
 * Which engine actions can a PERSON build, and which only happen when a card
 * resolves.
 *
 * `reachability.test.ts` already asks a version of this and its own header
 * admits the hole: it seeds from any engine export whose NAME appears anywhere
 * outside `src/lib/game`, so a name mentioned in a comment, a dead module
 * nothing imports, or an identically-named export in an unrelated file all
 * vouch for a live engine function. It also follows engine-to-engine CALLS
 * from that seed, which is right, but the seed is the weak end.
 *
 * This walks the real import graph instead:
 *
 *   1. Parse every `import` in `src`, resolving `@/` to `src/`, into edges.
 *   2. Find the set of modules reachable from the app's real entry points
 *      (`src/main.tsx` and the dev harnesses), so a module nothing imports is
 *      visibly dead rather than silently vouching.
 *   3. For each action, find the files whose text constructs `type: 'X'`, and
 *      classify each producer file as RESOLUTION (an effect, a trigger, the
 *      stack, a compiled ability, state-based actions) or MOVE (a builder a
 *      control calls: `manual.ts`, `moves.ts`, `activate.ts`, ...).
 *   4. For a MOVE producer, ask whether the SPECIFIC EXPORT that builds the
 *      action is imported, transitively through real import edges, by a live
 *      component outside the engine. Not mentioned. Imported.
 *
 * The output is three lists. The middle one is the interesting one: actions
 * the engine builds while resolving a card and no player can ever initiate.
 *
 *   node scripts/playtest/action-census.mjs
 *   node scripts/playtest/action-census.mjs --json
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';

export function census() {
const ROOT = process.cwd();
const SRC = 'src';
const ENGINE = join('src', 'lib', 'game');

const norm = p => p.split(sep).join('/');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.tsx?$/.test(path)) out.push(path);
  }
  return out;
}

const ALL = walk(SRC);
const CODE = ALL.filter(f => !/\.test\.tsx?$/.test(f));
const TEXT = new Map(CODE.map(f => [norm(f), readFileSync(f, 'utf8')]));

/* -------------------------------------------------------------------------- */
/* 1. The import graph                                                        */
/* -------------------------------------------------------------------------- */

/** Resolve a specifier written in `from` to a file in the map, or null. */
function resolveSpec(from, spec) {
  let base;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else return null; // node_modules
  const rel = norm(relative(ROOT, resolve(base)));
  const tries = [rel, `${rel}.ts`, `${rel}.tsx`, `${rel}/index.ts`, `${rel}/index.tsx`];
  for (const t of tries) {
    const stripped = t.replace(/\.(ts|tsx)\.(ts|tsx)$/, '.$2');
    if (TEXT.has(t)) return t;
    if (TEXT.has(stripped)) return stripped;
  }
  // `./foo.ts` written with the extension already present
  const noExt = rel.replace(/\.tsx?$/, '');
  for (const t of [`${noExt}.ts`, `${noExt}.tsx`]) if (TEXT.has(t)) return t;
  return null;
}

const IMPORT_RE =
  /import\s+(?:type\s+)?(?:([\s\S]*?)\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** file -> Map(importedFile -> Set(names imported, '*' for namespace/side-effect)) */
const EDGES = new Map();
for (const [file, text] of TEXT) {
  const map = new Map();
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[2] ?? m[3];
    const clause = m[1] ?? '';
    const target = resolveSpec(file, spec);
    if (!target) continue;
    const names = map.get(target) ?? new Set();
    const braces = clause.match(/\{([\s\S]*?)\}/);
    if (braces) {
      for (const raw of braces[1].split(',')) {
        const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
        if (name) names.add(name);
      }
    }
    const defaultOrStar = clause.replace(/\{[\s\S]*?\}/, '').trim().replace(/^,|,$/g, '').trim();
    if (defaultOrStar) names.add('*');
    if (!clause) names.add('*');
    map.set(target, names);
  }
  EDGES.set(file, map);
}

/* Re-export edges: `export { x } from './y'` and `export * from './y'`. */
for (const [file, text] of TEXT) {
  const map = EDGES.get(file);
  for (const m of text.matchAll(/export\s+(?:type\s+)?(?:\*|\{([\s\S]*?)\})\s+from\s+['"]([^'"]+)['"]/g)) {
    const target = resolveSpec(file, m[2]);
    if (!target) continue;
    const names = map.get(target) ?? new Set();
    if (m[1]) for (const raw of m[1].split(',')) {
      const n = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
      if (n) names.add(n);
    } else names.add('*');
    map.set(target, names);
  }
}

/* -------------------------------------------------------------------------- */
/* 2. What the app actually loads                                             */
/* -------------------------------------------------------------------------- */

const closureFrom = entries => {
  const seen = new Set();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const target of EDGES.get(file)?.keys() ?? []) queue.push(target);
  }
  return seen;
};

const ENTRIES = CODE.filter(f => {
  const n = norm(f);
  return n === 'src/main.tsx' || n.startsWith('src/dev/');
}).map(norm);

const LIVE = closureFrom(ENTRIES);

/**
 * The play surface specifically.
 *
 * "Reachable" and "reachable AT THE TABLE" are different claims, and conflating
 * them is how `LIFE_CHANGE` came to look wired: the phone-on-the-table life
 * counter at `/life` builds one, so a whole-app census reports the action as
 * offered while no control in play mode could change a life total. So this
 * closure starts at the play page and the watched table and nowhere else.
 */
const PLAY_ENTRIES = ['src/pages/Play.tsx', 'src/components/play/WatchedTable.tsx'].filter(f =>
  TEXT.has(f)
);
const PLAY = closureFrom(PLAY_ENTRIES);

/* -------------------------------------------------------------------------- */
/* 3. Who builds each action                                                  */
/* -------------------------------------------------------------------------- */

function declaredActions() {
  const types = readFileSync(join(ENGINE, 'types.ts'), 'utf8');
  const union = types.slice(types.indexOf('export type GameAction'));
  const names = new Set();
  for (const m of union.matchAll(/type: '([A-Z_]+)'/g)) names.add(m[1]);
  return [...names].sort();
}

/** Engine files whose job is resolving what a card says. */
const RESOLUTION = [
  'src/lib/game/effects.ts',
  'src/lib/game/stack.ts',
  'src/lib/game/triggers.ts',
  'src/lib/game/sba.ts',
  'src/lib/game/replacement.ts',
  'src/lib/game/layers.ts',
  'src/lib/game/combat.ts',
  'src/lib/game/intrinsic.ts',
];
const isResolution = f =>
  RESOLUTION.includes(f) || f.startsWith('src/lib/game/abilities/') || f.startsWith('src/lib/game/xmage/');

/** Split an engine module into exported declarations: name and body. */
function exportedChunks(file) {
  const text = TEXT.get(file) ?? '';
  const out = [];
  const parts = text.split(/\nexport /);
  for (const part of parts.slice(1)) {
    const m = part.match(/^(?:declare\s+)?(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z0-9_$]+)/);
    if (m) out.push({ file, name: m[1], body: part });
  }
  return out;
}

const ENGINE_FILES = CODE.map(norm).filter(f => f.startsWith(ENGINE.split(sep).join('/')));
const ENGINE_CHUNKS = ENGINE_FILES.filter(f => f !== 'src/lib/game/rules.ts').flatMap(exportedChunks);

/**
 * Engine exports genuinely reached from a LIVE module outside the engine,
 * following real import edges and then engine-to-engine calls.
 */
const reachedWithin = scope => {
  const reached = new Set(); // "file#name"
  const key = c => `${c.file}#${c.name}`;

  // Seed: an outside module in scope imports the name from an engine module
  // (directly or via `src/lib/game/index.ts`, whose re-exports are edges).
  const seedNames = new Map(); // engineFile -> Set(names)
  for (const [file, map] of EDGES) {
    if (file.startsWith('src/lib/game/')) continue;
    if (!scope.has(file)) continue;
    for (const [target, names] of map) {
      if (!target.startsWith('src/lib/game/')) continue;
      const set = seedNames.get(target) ?? new Set();
      for (const n of names) set.add(n);
      seedNames.set(target, set);
    }
  }
  // Follow re-export barrels: a name imported from index.ts resolves to the
  // engine module index.ts re-exports it from.
  const expand = (file, names, depth = 0) => {
    if (depth > 4) return;
    for (const chunk of ENGINE_CHUNKS.filter(c => c.file === file)) {
      if (names.has('*') || names.has(chunk.name)) reached.add(key(chunk));
    }
    for (const [target, edgeNames] of EDGES.get(file) ?? []) {
      if (!target.startsWith('src/lib/game/')) continue;
      const text = TEXT.get(file) ?? '';
      const isReexport = new RegExp(`export[\\s\\S]{0,400}from\\s+['"][^'"]*${target.split('/').pop().replace(/\.tsx?$/, '')}`).test(text);
      if (!isReexport) continue;
      const pass = new Set();
      for (const n of edgeNames) if (names.has('*') || names.has(n) || n === '*') pass.add(n === '*' ? '*' : n);
      if (names.has('*')) pass.add('*');
      if (pass.size) expand(target, pass, depth + 1);
    }
  };
  for (const [file, names] of seedNames) expand(file, names);

  // Closure over engine-to-engine calls.
  for (let pass = 0; pass < 12; pass++) {
    let grew = false;
    for (const chunk of ENGINE_CHUNKS) {
      if (!reached.has(key(chunk))) continue;
      const importsHere = EDGES.get(chunk.file) ?? new Map();
      for (const other of ENGINE_CHUNKS) {
        if (reached.has(key(other))) continue;
        const sameFile = other.file === chunk.file;
        const imported = [...(importsHere.get(other.file) ?? [])].some(n => n === '*' || n === other.name);
        if (!sameFile && !imported) continue;
        if (new RegExp(String.raw`\b${other.name}\s*\(`).test(chunk.body)) {
          reached.add(key(other));
          grew = true;
        }
      }
    }
    if (!grew) break;
  }
  return reached;
};

const REACHED = reachedWithin(LIVE);
const REACHED_IN_PLAY = reachedWithin(PLAY);

const rows = [];
for (const action of declaredActions()) {
  const needle = `type: '${action}'`;
  const producers = CODE.map(norm).filter(
    f => f !== 'src/lib/game/types.ts' && f !== 'src/lib/game/rules.ts' && (TEXT.get(f) ?? '').includes(needle)
  );
  const ui = producers.filter(f => !f.startsWith('src/lib/game/'));
  const liveUi = ui.filter(f => LIVE.has(f));
  const resolution = producers.filter(f => f.startsWith('src/lib/game/') && isResolution(f));
  const moves = producers.filter(f => f.startsWith('src/lib/game/') && !isResolution(f));

  // Which named engine exports build it, and are any of them genuinely reached?
  const buildingChunks = ENGINE_CHUNKS.filter(c => c.body.includes(needle));
  const short = c => `${c.file.replace('src/lib/game/', '')}:${c.name}`;
  const reachedFromMove = buildingChunks
    .filter(c => !isResolution(c.file) && REACHED.has(`${c.file}#${c.name}`))
    .map(short);
  const reachedInPlay = buildingChunks
    .filter(c => !isResolution(c.file) && REACHED_IN_PLAY.has(`${c.file}#${c.name}`))
    .map(short);
  const playUi = ui.filter(f => PLAY.has(f));

  rows.push({
    action,
    liveUi,
    playUi,
    deadUi: ui.filter(f => !LIVE.has(f)),
    resolution,
    moves,
    reachedFromMove,
    reachedInPlay,
    anywhere: liveUi.length > 0 || reachedFromMove.length > 0,
    atTheTable: playUi.length > 0 || reachedInPlay.length > 0,
  });
}

  return {
    rows,
    counts: {
      modules: CODE.length,
      live: LIVE.size,
      play: PLAY.size,
      engineExports: ENGINE_CHUNKS.length,
      reached: REACHED.size,
      reachedInPlay: REACHED_IN_PLAY.size,
    },
  };
}

/* The CLI half. Only when run directly, so `reachability.test.ts` can import
   `census()` without a wall of output landing in the test run. */
if (process.argv[1] && process.argv[1].split(String.fromCharCode(92)).join('/').endsWith('action-census.mjs')) {
const { rows, counts } = census();
const atTable = rows.filter(r => r.atTheTable);
const elsewhereOnly = rows.filter(r => r.anywhere && !r.atTheTable);
const engineOnly = rows.filter(r => !r.anywhere && (r.resolution.length || r.moves.length));
const nobody = rows.filter(r => !r.anywhere && !r.resolution.length && !r.moves.length);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ atTable, elsewhereOnly, engineOnly, nobody }, null, 2));
} else {
  console.log(`modules in src: ${counts.modules}, loaded by the app: ${counts.live}, loaded by play mode: ${counts.play}`);
  console.log(`engine exports: ${counts.engineExports}; imported from a live module: ${counts.reached}; imported from play mode: ${counts.reachedInPlay}\n`);

  const how = r =>
    (r.playUi.length ? `UI: ${r.playUi.map(f => f.split('/').pop()).join(', ')}` : '') +
    (r.playUi.length && r.reachedInPlay.length ? ' + ' : '') +
    (r.reachedInPlay.length ? r.reachedInPlay.join(', ') : '');

  console.log(`=== A PLAYER AT THE TABLE CAN BUILD (${atTable.length}) ===`);
  for (const r of atTable) console.log(`  ${r.action.padEnd(24)} ${how(r)}`);

  console.log(`\n=== BUILT SOMEWHERE IN THE APP, BUT NOT FROM PLAY MODE (${elsewhereOnly.length}) ===`);
  for (const r of elsewhereOnly) {
    const where = r.liveUi.length ? r.liveUi.join(', ') : r.reachedFromMove.join(', ');
    console.log(`  ${r.action.padEnd(24)} only ${where}`);
  }

  console.log(`\n=== ONLY THE ENGINE EVER BUILDS, NEVER A PLAYER (${engineOnly.length}) ===`);
  for (const r of engineOnly) {
    const where = [...r.resolution, ...r.moves].map(f => f.replace('src/lib/game/', '')).join(', ');
    console.log(`  ${r.action.padEnd(24)} ${where}`);
  }

  console.log(`\n=== NOTHING BUILDS AT ALL (${nobody.length}) ===`);
  for (const r of nobody) console.log(`  ${r.action}`);

  const dead = rows.filter(r => r.deadUi.length);
  if (dead.length) {
    console.log(`\n=== a producer outside the engine that NOTHING IMPORTS (dead code vouching) ===`);
    for (const r of dead) console.log(`  ${r.action.padEnd(24)} ${r.deadUi.join(', ')}`);
  }
}
}
