import { readFileSync } from 'node:fs';
import { compileWithTrace } from '../src/lib/cards/abilities/compiler.ts';
const cards = readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const filter = process.argv[3];
const hist = new Map<string, number>();
for (const c of cards) {
  const t = compileWithTrace(c);
  const norm = new Map(t.normalized.paragraphs.map(p => [p.raw, p.norm]));
  for (const u of t.result.unparsed) {
    const n = norm.get(u.text) ?? '';
    if (filter && !n.includes(filter)) continue;
    hist.set(n, (hist.get(n) || 0) + 1);
  }
}
[...hist].sort((a,b)=>b[1]-a[1]).slice(0, 40).forEach(([k,v]) => console.log(String(v).padStart(5), k.slice(0,120)));
