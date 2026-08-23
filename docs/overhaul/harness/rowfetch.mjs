/**
 * The shape a review misses: a component that fetches for itself, rendered once
 * per row of a list. Nothing in the parent looks like a query; the loop is
 * `rows.map(r => <Tile row={r} />)` and the request lives a file away.
 *
 * Find every JSX tag written inside a `.map(`, resolve the tag back through the
 * file's imports to a real source file, and report the ones whose component
 * fetches at RENDER time — a `useEffect`/`useQuery` that touches the database —
 * as opposed to in a click handler, which costs nothing until pressed.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'C:/Users/natha/Desktop/Software/Deckmatrix/src';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = walk(ROOT);

/** file -> source */
const src = new Map(files.map(f => [f, fs.readFileSync(f, 'utf8')]));

function resolveImport(fromFile, spec) {
  let base;
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return null;
  for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) {
    const p = base + ext;
    if (src.has(p)) return p;
  }
  return src.has(base) ? base : null;
}

/** Does this file define a component that queries while RENDERING? */
function fetchesOnRender(file) {
  const s = src.get(file) || '';
  const hooks = [...s.matchAll(/use(Effect|Query|LayoutEffect|SWR)\s*\(/g)];
  for (const h of hooks) {
    const window = s.slice(h.index, h.index + 2500);
    if (/supabase\s*\.\s*(from|rpc|auth|functions)/.test(window)) return true;
    // A hook that calls a loader defined in this file.
    for (const call of window.matchAll(/\b([A-Za-z0-9_$]+)\s*\(/g)) {
      const name = call[1];
      const def = new RegExp(
        `(?:const|function)\\s+${name}\\s*[=(][\\s\\S]{0,2500}?supabase\\s*\\.\\s*(?:from|rpc|auth)`
      );
      if (def.test(s)) return true;
    }
  }
  return false;
}

const findings = [];

for (const file of files) {
  if (!file.endsWith('.tsx')) continue;
  const s = src.get(file);

  const imports = new Map();
  for (const m of s.matchAll(/import\s+(?:\{([^}]*)\}|([A-Za-z0-9_$]+))[^'"]*from\s*['"]([^'"]+)['"]/g)) {
    const spec = m[3];
    const names = m[1] ? m[1].split(',').map(x => x.trim().split(/\s+as\s+/).pop().trim()) : [m[2]];
    for (const n of names) if (n) imports.set(n, spec);
  }

  for (const m of s.matchAll(/\.map\s*\(/g)) {
    // The arrow body of the map, roughly.
    const chunk = s.slice(m.index, m.index + 1400);
    for (const tag of chunk.matchAll(/<([A-Z][A-Za-z0-9_$]*)[\s/>]/g)) {
      const name = tag[1];
      const spec = imports.get(name);
      if (!spec) continue;
      const target = resolveImport(file, spec);
      if (!target || target === file) continue;
      if (!fetchesOnRender(target)) continue;
      const line = s.slice(0, m.index).split('\n').length;
      findings.push({
        at: `${file.replace(/\\/g, '/').replace('C:/Users/natha/Desktop/Software/Deckmatrix/', '')}:${line}`,
        tag: name,
        target: target.replace(/\\/g, '/').replace('C:/Users/natha/Desktop/Software/Deckmatrix/', ''),
      });
    }
  }
}

const seen = new Set();
const unique = findings.filter(f => {
  const k = `${f.at}|${f.tag}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

console.log(`${unique.length} components that query while rendering, written inside a .map()\n`);
for (const f of unique) console.log(`${f.at}  <${f.tag}>  ->  ${f.target}`);
