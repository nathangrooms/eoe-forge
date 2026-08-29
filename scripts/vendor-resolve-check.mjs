import path from 'node:path';
import fs from 'node:fs';
let bad = 0;
for (const fn of ['ai-deck-builder-v2', 'deck-optimizer']) {
  const importer = `supabase/functions/${fn}/_lib/deck/recommend/behaviour.ts`;
  const target = path.normalize(path.join(path.dirname(importer), '../../../engine/knowledge/behaviour.ts'));
  const shim = `supabase/functions/${fn}/engine/knowledge/behaviour.ts`;
  const inner = path.normalize(path.join(path.dirname(shim), '../../_engine/knowledge/behaviour.ts'));
  for (const [label, f] of [['producer -> shim', target], ['shim -> engine', inner]]) {
    const ok = fs.existsSync(f);
    if (!ok) bad++;
    console.log(`${fn.padEnd(20)} ${label.padEnd(18)} ${ok ? 'OK' : 'MISSING'}  ${f.split(path.sep).join('/')}`);
  }
}
console.log(bad ? `\n${bad} unresolved` : '\nevery specifier resolves');
process.exit(bad ? 1 : 0);
