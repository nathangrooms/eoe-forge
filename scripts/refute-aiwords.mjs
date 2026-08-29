/**
 * The ban list from CLAUDE.md §10a, checked against JSX text only.
 *
 * "no AI, assistant, smart, intelligent, powered by, neural, GPT, model, bot"
 * — the words the owner says the Magic community reacts badly to. Comments are
 * exempt, so this reads only what renders between tags.
 */
import fs from 'node:fs';
import path from 'node:path';

const SKIP = [
  'src/components/play/', 'src/components/ai-builder/',
  'src/pages/Play', 'src/pages/AIBuilder',
];
const BANNED = [
  /\bassistant\b/i, /\bsmart\b/i, /\bintelligent/i, /powered by/i,
  /\bneural\b/i, /\bGPT\b/, /\bAI\b/, /artificial intelligence/i,
  /\bmodel\b/i,
];

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name).split(path.sep).join('/');
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p);
  }
})('src');

const seen = new Set();
for (const p of files) {
  if (SKIP.some(s => p.startsWith(s))) continue;
  const s = fs.readFileSync(p, 'utf8');
  for (const m of s.matchAll(/>([^<>{}]{4,300})</g)) {
    const t = m[1].replace(/\s+/g, ' ').trim();
    if (!/[a-z]{3}/.test(t)) continue;
    const hit = BANNED.find(r => r.test(t));
    if (!hit) continue;
    const k = p + t;
    if (seen.has(k)) continue;
    seen.add(k);
    const line = s.slice(0, m.index).split('\n').length;
    console.log(`${p}:${line}  [${hit}]  ${t.slice(0, 140)}`);
  }
}
