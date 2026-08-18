import { readFileSync } from 'node:fs';
import { compileWithTrace } from '../src/lib/cards/abilities/compiler.ts';

const cards = readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const byName = new Map<string, any>();
for (const c of cards) if (!byName.has(c.name)) byName.set(c.name, c);

const names = process.argv.slice(3);
for (const n of names) {
  const c = byName.get(n);
  if (!c) { console.log(`## ${n}  -- NOT FOUND`); continue; }
  const t = compileWithTrace(c);
  console.log(`\n## ${n}  [${c.type_line}]  coverage=${t.result.coverage}`);
  console.log('   oracle:', JSON.stringify(String(c.oracle_text ?? '').slice(0, 220)));
  for (const a of t.result.abilities) console.log('   ->', JSON.stringify(a));
  for (const u of t.result.unparsed) console.log('   GAP', u.reason, JSON.stringify(u.text.slice(0, 110)));
}
