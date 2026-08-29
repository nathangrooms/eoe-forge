/**
 * Where does the deployed generator stop returning a deck?
 *
 * The ten-deck run found 0 or 1 colour succeeding every time, two colours
 * succeeding about six times in ten, and every three-colour commander failing
 * on all five attempts with 546 WORKER_RESOURCE_LIMIT. The function log says
 * `CPU Time exceeded`, immediately after the line that reports how many facets
 * were compiled over the pool, and the pool grows with colour identity.
 *
 * This widens that to more commanders per colour count, including four and five
 * colours, so the conclusion is about colour identity rather than about the
 * three commanders that happened to be on the roster.
 *
 *   node scripts/generator-colour-cliff.mjs 3
 */
import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';
const ENDPOINT = `${SUPABASE_URL}/functions/v1/ai-deck-builder-v2`;

const PROBES = [
  { name: 'Kozilek, the Great Distortion', ci: [] },
  { name: 'Krenko, Mob Boss', ci: ['R'] },
  { name: 'Talrand, Sky Summoner', ci: ['U'] },
  { name: 'Yuriko, the Tiger’s Shadow', ci: ['U', 'B'] },
  { name: 'Teysa Karlov', ci: ['W', 'B'] },
  { name: 'Edgar Markov', ci: ['W', 'B', 'R'] },
  { name: 'Uril, the Miststalker', ci: ['R', 'G', 'W'] },
  { name: 'Lord Windgrace', ci: ['B', 'R', 'G'] },
  { name: 'Kaalia of the Vast', ci: ['W', 'B', 'R'] },
  { name: 'Atraxa, Praetors’ Voice', ci: ['W', 'U', 'B', 'G'] },
  { name: 'Najeela, the Blade-Blossom', ci: ['W', 'U', 'B', 'R', 'G'] },
  { name: 'Golos, Tireless Pilgrim', ci: ['W', 'U', 'B', 'R', 'G'] },
];

const N = Number(process.argv[2] ?? 3);

async function once(p) {
  const started = Date.now();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ANON}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commander: { name: p.name, color_identity: p.ci, colors: p.ci },
      archetype: 'value',
      style: 'balanced',
      powerLevel: 7,
      useAIPlanning: true,
      includeLands: true,
    }),
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON body is itself the finding */
  }
  return { ok: res.ok, status: res.status, code: body?.code ?? null, error: body?.error ?? null, ms: Date.now() - started };
}

const rows = [];
for (const p of PROBES) {
  let ok = 0;
  const codes = new Set();
  const times = [];
  for (let i = 0; i < N; i++) {
    const r = await once(p);
    if (r.ok) ok++;
    else codes.add(`${r.status} ${r.code ?? r.error ?? ''}`.trim());
    times.push(r.ms);
  }
  rows.push({ name: p.name, colours: p.ci.length, ok, of: N, codes: [...codes], times });
  console.error(`${p.name} (${p.ci.length}) ${ok}/${N}`);
}
fs.mkdirSync(path.resolve('.shots/gen-ten'), { recursive: true });
fs.writeFileSync(path.resolve('.shots/gen-ten/colour-cliff.json'), JSON.stringify(rows, null, 2));
console.log(JSON.stringify(rows, null, 2));
