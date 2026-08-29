/**
 * Find jargon and em-dashes in the words a user actually reads.
 *
 * Comments are exempt by the project's own copy rules, and this codebase's
 * comments are long and full of the same vocabulary the rules ban in the
 * interface, so a plain grep is useless: it returns hundreds of hits and every
 * one of them is a comment. This strips comments first, then looks only at
 * JSX text nodes and at string literals in the prop positions that end up on
 * screen.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['src/pages', 'src/components', 'src/features', 'src/lib'];

const BANNED = [
  'portability', 'round trip', 'round-trip', 'subscore', 'taxonomy', 'canonical',
  'pipeline', 'primitive', 'heuristic', 'idempotent', 'schema', 'payload',
  'endpoint', 'serialize', 'serialise', 'deserialize', 'normalize the', 'ingest',
  'artifact', 'invariant', 'orchestrat', 'instrumentation', 'telemetry',
  'AI', 'A.I.', 'artificial intelligence', 'machine learning', 'neural', 'GPT',
  'LLM', 'powered by', 'smart ', 'intelligent', 'algorithm', 'leverage',
  'utilize', 'utilise', 'seamless', 'robust', 'holistic', 'synerg',
  'best-in-class', 'cutting edge', 'cutting-edge', 'state of the art',
  'unlock', 'supercharge', 'turbocharge', 'game-changing', 'revolutionar',
  'delve', 'realm', 'landscape', 'tapestry', 'testament to',
];

/** Words that are legitimate Magic vocabulary or unavoidable. */
const ALLOW = [/\bmodel\b/i];

const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(p);
  }
}
ROOTS.forEach(walk);

function stripComments(src) {
  let out = '';
  let i = 0;
  let mode = 'code';
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (mode === 'code') {
      if (two === '/*') { mode = 'block'; out += '  '; i += 2; continue; }
      if (two === '//' && src[i - 1] !== ':') { mode = 'line'; out += '  '; i += 2; continue; }
      if (src[i] === '{' && src.slice(i, i + 3) === '{/*') { mode = 'jsxc'; out += '   '; i += 3; continue; }
      out += src[i]; i++; continue;
    }
    if (mode === 'block') {
      if (two === '*/') { mode = 'code'; out += '  '; i += 2; continue; }
      out += src[i] === '\n' ? '\n' : ' '; i++; continue;
    }
    if (mode === 'jsxc') {
      if (src.slice(i, i + 3) === '*/}') { mode = 'code'; out += '   '; i += 3; continue; }
      out += src[i] === '\n' ? '\n' : ' '; i++; continue;
    }
    if (mode === 'line') {
      if (src[i] === '\n') { mode = 'code'; out += '\n'; i++; continue; }
      out += ' '; i++; continue;
    }
  }
  return out;
}

/** Pull the fragments a user can read out of a file: JSX text and copy props. */
function userText(src) {
  const bits = [];
  /* JSX text between tags, ignoring anything that is obviously code. */
  for (const m of src.matchAll(/>([^<>{}]{3,400})</g)) {
    const t = m[1].replace(/\s+/g, ' ').trim();
    if (t && /[a-z]{3}/.test(t) && !/^[\w.$[\]()=>,: ]+$/.test(t)) bits.push([t, m.index]);
  }
  /* Copy-bearing props and the toast/description helpers. */
  const props = /(?:title|label|placeholder|description|heading|subtitle|eyebrow|blurb|hint|help|caption|tooltip|aria-label|emptyText|body|message|summary)\s*=\s*(?:"([^"]{3,400})"|'([^']{3,400})'|\{`([^`]{3,400})`\}|\{"([^"]{3,400})"\})/g;
  for (const m of src.matchAll(props)) {
    const t = (m[1] || m[2] || m[3] || m[4]).replace(/\s+/g, ' ').trim();
    if (t) bits.push([t, m.index]);
  }
  /* toast({ title: '…', description: '…' }) and friends. */
  for (const m of src.matchAll(/(?:title|description|message|label|text)\s*:\s*(?:"([^"]{6,400})"|'([^']{6,400})')/g)) {
    const t = (m[1] || m[2]).replace(/\s+/g, ' ').trim();
    if (t && /\s/.test(t)) bits.push([t, m.index]);
  }
  return bits;
}

const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

const jargon = [];
const dashes = [];
for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  const src = stripComments(raw);
  for (const [text, idx] of userText(src)) {
    if (ALLOW.some(r => r.test(text))) continue;
    for (const word of BANNED) {
      const re = word === 'AI'
        ? /\bAI\b/
        : new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      if (re.test(text)) { jargon.push({ file, line: lineOf(src, idx), word, text }); break; }
    }
    if (/[—–]/.test(text)) dashes.push({ file, line: lineOf(src, idx), text });
  }
}

const seen = new Set();
console.log('=== JARGON in user-visible copy ===');
for (const j of jargon) {
  const k = j.file + j.text;
  if (seen.has(k)) continue;
  seen.add(k);
  console.log(`${j.file}:${j.line}  [${j.word}]  ${j.text}`);
}
console.log(`\n=== EM/EN DASHES in user-visible copy (${dashes.length}) ===`);
for (const d of dashes) console.log(`${d.file}:${d.line}  ${d.text}`);
