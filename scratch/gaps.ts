import { readFileSync } from 'node:fs';
import { compileWithTrace } from '../src/lib/cards/abilities/compiler.ts';
import { normalizeCard } from '../src/lib/cards/abilities/normalize.ts';

const cards = readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const want = process.argv[3];
const hist = new Map<string, number>();
for (const c of cards) {
  const t = compileWithTrace(c);
  const norm = new Map(t.normalized.paragraphs.map(p => [p.raw, p.norm]));
  for (const u of t.result.unparsed) {
    if (u.reason !== want) continue;
    const n = norm.get(u.text) ?? u.text.toLowerCase();
    const key = n.split(' ').slice(0, 6).join(' ');
    hist.set(key, (hist.get(key) || 0) + 1);
  }
}
[...hist].sort((a,b)=>b[1]-a[1]).slice(0, 60).forEach(([k,v]) => console.log(String(v).padStart(6), k));
