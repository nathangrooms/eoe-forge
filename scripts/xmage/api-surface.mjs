/* The number that decides the plan.
 *
 * You do not port 7,931 cards one at a time. You port the API those cards CALL,
 * then translate each body mechanically. So the size of that API surface is the
 * size of the job, and it is a very different number from the number of cards.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.env.XMAGE_ROOT || 'C:/Users/natha/AppData/Local/Temp/claude/xmage-spike/mage';
const CARDS = path.join(ROOT, 'Mage.Sets/src/mage/cards');

const files = [];
for (const d of fs.readdirSync(CARDS)) {
  const dir = path.join(CARDS, d);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.java')) files.push(path.join(dir, f));
}

const hist = new Map();
let bodies = 0;

for (const f of files) {
  const raw = fs.readFileSync(f, 'utf8');
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const cardCls = path.basename(f, '.java');

  const locals = [...src.matchAll(/\bclass\s+(\w+)\s+extends\s+\w+/g)].filter(m => m[1] !== cardCls);
  if (locals.length === 0) continue;
  bodies++;

  for (const m of src.slice(locals[0].index).matchAll(/\.([A-Za-z_]\w*)\s*\(/g)) {
    hist.set(m[1], (hist.get(m[1]) ?? 0) + 1);
  }
}

const sorted = [...hist.entries()].sort((a, b) => b[1] - a[1]);
const totalCalls = sorted.reduce((s, [, n]) => s + n, 0);
let cum = 0;
const need = {};
sorted.forEach(([, n], i) => {
  cum += n;
  for (const m of [50, 80, 90, 95, 99]) {
    if (need[m] === undefined && cum >= (totalCalls * m) / 100) need[m] = i + 1;
  }
});

console.log('card files with a card-local class : ' + bodies);
console.log('total method calls in those bodies : ' + totalCalls.toLocaleString());
console.log('DISTINCT methods called            : ' + sorted.length);
console.log('');
console.log('methods to implement to cover that share of all calls:');
for (const m of [50, 80, 90, 95, 99]) console.log('  ' + String(m).padStart(2) + '% : ' + need[m] + ' methods');
console.log('');
console.log('used exactly once (the true long tail): ' + sorted.filter(([, n]) => n === 1).length);
console.log('');
console.log('top 12:');
for (const [c, n] of sorted.slice(0, 12)) console.log('  ' + String(n).padStart(5) + '  .' + c + '()');
