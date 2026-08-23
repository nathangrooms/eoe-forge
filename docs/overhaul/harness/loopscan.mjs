/**
 * Find per-row query loops by TRANSITIVE reachability, not by looking for the
 * word `supabase` next to the word `for`.
 *
 * The 1,100 request button was invisible to a text search: the loop body said
 * `CollectionAPI.addCardByName(...)`, and nothing about that name looks like a
 * query. So:
 *
 *   1. Mark every function that touches `supabase.` / `.rpc(` / `fetch(` as a
 *      QUERY function.
 *   2. Propagate: a function that calls a QUERY function is itself a QUERY
 *      function. Repeat to a fixed point.
 *   3. Report every loop (`for`, `for..of`, `while`, `.map`, `.forEach`,
 *      `Promise.all`) whose body calls anything in that set.
 *
 * Crude on purpose: braces and regexes, no TypeScript AST. It over-reports, and
 * over-reporting is the right failure for a hunt.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || 'C:/Users/natha/Desktop/Software/Deckmatrix/src';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(ROOT);

/** name -> { file, line, body, calls:Set, isQuery:boolean } */
const fns = new Map();
const DECL =
  /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)|(?:static\s+)?(?:async\s+)?([A-Za-z0-9_$]+)\s*(?:=\s*(?:async\s*)?\([^)]*\)\s*(?::[^=]*)?=>|\([^)]*\)\s*(?::\s*[^{]*)?\{)/g;

function bodyFrom(src, braceAt) {
  let depth = 0;
  for (let i = braceAt; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(braceAt, i + 1);
    }
  }
  return src.slice(braceAt);
}

const DIRECT = /supabase\s*\.\s*(from|rpc|auth|functions|storage)\b|\bfetch\s*\(/;

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  DECL.lastIndex = 0;
  let m;
  while ((m = DECL.exec(src))) {
    const name = m[1] || m[2];
    if (!name || ['if', 'for', 'while', 'switch', 'catch', 'return'].includes(name)) continue;
    const brace = src.indexOf('{', m.index + m[0].length - 1);
    if (brace === -1) continue;
    const body = bodyFrom(src, brace);
    if (body.length > 60000) continue;
    const line = src.slice(0, m.index).split('\n').length;
    const key = `${name}`;
    const calls = new Set([...body.matchAll(/([A-Za-z0-9_$]+)\s*\(/g)].map(c => c[1]));
    const prev = fns.get(key);
    const entry = { name, file, line, body, calls, isQuery: DIRECT.test(body) };
    if (!prev || entry.body.length > prev.body.length) fns.set(key, entry);
  }
}

// Fixed point.
for (let pass = 0; pass < 8; pass += 1) {
  let changed = false;
  for (const fn of fns.values()) {
    if (fn.isQuery) continue;
    for (const c of fn.calls) {
      const target = fns.get(c);
      if (target && target.isQuery) {
        fn.isQuery = true;
        changed = true;
        break;
      }
    }
  }
  if (!changed) break;
}

const queryNames = new Set([...fns.values()].filter(f => f.isQuery).map(f => f.name));

/* Loops. */
const LOOP = /\b(for\s*\(|while\s*\(|\.map\s*\(|\.forEach\s*\(|Promise\.all\s*\(|Promise\.allSettled\s*\()/g;
const findings = [];

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  LOOP.lastIndex = 0;
  let m;
  while ((m = LOOP.exec(src))) {
    const open = src.indexOf('{', m.index);
    const arrow = src.indexOf('=>', m.index);
    let body = null;
    if (open !== -1 && (arrow === -1 || open < arrow + 4)) body = bodyFrom(src, open);
    else if (arrow !== -1 && arrow - m.index < 120) {
      const b2 = src.indexOf('{', arrow);
      body = b2 !== -1 && b2 - arrow < 4 ? bodyFrom(src, b2) : src.slice(arrow, arrow + 400);
    }
    if (!body || body.length > 20000) continue;

    const hits = new Set();
    if (DIRECT.test(body)) hits.add('supabase directly');
    for (const c of body.matchAll(/([A-Za-z0-9_$]+)\s*\(/g)) {
      if (queryNames.has(c[1]) && c[1] !== 'map' && c[1] !== 'forEach') hits.add(c[1]);
    }
    if (hits.size === 0) continue;
    if (!/\bawait\b|Promise\.all/.test(body)) continue;

    const line = src.slice(0, m.index).split('\n').length;
    findings.push({
      file: file.replace(/\\/g, '/').replace('C:/Users/natha/Desktop/Software/Deckmatrix/', ''),
      line,
      kind: m[1].trim(),
      hits: [...hits].slice(0, 4).join(', '),
    });
  }
}

findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
console.log(`${findings.length} loops whose body reaches the database\n`);
for (const f of findings) console.log(`${f.file}:${f.line}  ${f.kind.padEnd(14)} ${f.hits}`);
