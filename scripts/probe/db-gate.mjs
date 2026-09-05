/*
 * A REAL GATE. Run it before any measurement pass; it EXITS NON-ZERO when the
 * database cannot afford one, so `node scripts/probe/db-gate.mjs && <probe>`
 * actually stops.
 *
 * THE BUG THIS EXISTS FOR. The gate was an inline `node -e` that printed
 * "GATE FAIL" and exited 0, so every `&&` chain ran the heavy probe anyway. It
 * read like a guard in the transcript and guarded nothing. Production was taken
 * down THREE times on 5 Sep 2026, the third time immediately after a gate that
 * reported a warm median of 24.21 s and then ran an eight-deck probe.
 *
 * Six single-row reads, the first discarded because a cold connection measures
 * the connection rather than the database.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';

const K = readFileSync('scratch/anon.txt', 'utf8').trim();
const BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
const H = { apikey: K, Authorization: `Bearer ${K}` };

/** Warm single-row reads slower than this and a measurement pass is unaffordable. */
const LIMIT_S = Number(process.env.GATE_LIMIT ?? 0.30);

const times = [];
for (let i = 0; i < 6; i++) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}/rest/v1/cards_pool?select=id&limit=1`, { headers: H });
    await res.text();
    if (!res.ok) {
      console.error(`db-gate: HTTP ${res.status} on a single-row read. REFUSING.`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`db-gate: request threw (${String(e).slice(0, 60)}). REFUSING.`);
    process.exit(1);
  }
  times.push((Date.now() - started) / 1000);
}

const warm = times.slice(1).sort((a, b) => a - b);
const median = warm[Math.floor(warm.length / 2)];
const line =
  `db-gate: cold ${times[0].toFixed(2)}s, warm median ${median.toFixed(2)}s ` +
  `(limit ${LIMIT_S.toFixed(2)}s)`;

if (median > LIMIT_S) {
  console.error(`${line}  -> REFUSING. Leave the database alone.`);
  process.exit(1);
}
console.log(`${line}  -> ok, ONE probe`);
