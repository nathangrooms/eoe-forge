/**
 * Drive `facet-memo-fill` to completion, patiently.
 *
 *   node scripts/facet-fill.mjs "a note saying why"
 *
 * The fifteen-minute cron job does this on its own and needs no help. This is
 * for the case where somebody has just bumped the compiler version or added a
 * column and wants the catalogue current NOW rather than over the next seven
 * hours.
 *
 * WHY IT IS A FILE. This loop has been hand-rolled at the shell four times in
 * one evening and got the same thing wrong every time: a bare `for` loop over
 * curl treats a 502 as a result. CLAUDE.md records what those 502s are — the
 * gateway, not the function, returning in 24 ms where the function takes half a
 * second, and the next attempt usually works. A loop that counts them as
 * failures gives up on a run that was fine.
 *
 * So: retry a gateway error with backoff, never retry a 4xx, and stop on the
 * function's own `done`.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';

const KEY = readFileSync(new URL('../scratch/anon.txt', import.meta.url), 'utf8').trim();
const BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
const NOTE = process.argv[2] ?? 'manual fill';

const rest = async (path, init = {}) => {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
};

/*
 * THE TOKEN IS PASSED IN, because opening a run is an ADMIN ACT and this script
 * holds only the publishable key.
 *
 * `facet_memo_runs` is under admin-only RLS on purpose: every edge function
 * here is reachable with the publishable key, so the key cannot be the gate,
 * and the run token is. A script that could mint its own token would be a
 * script that had defeated the gate. Open one with:
 *
 *   insert into public.facet_memo_runs (max_calls, note)
 *   values (200, 'why') returning run_token;
 */
const RUN_TOKEN = process.env.RUN_TOKEN ?? process.argv[3];
if (!RUN_TOKEN) {
  console.error('Needs a run token. Open one as an admin, then pass it:');
  console.error("  insert into public.facet_memo_runs (max_calls, note) values (200, 'why') returning run_token;");
  console.error('  RUN_TOKEN=<token> node scripts/facet-fill.mjs "note"');
  process.exit(1);
}
const run = { run_token: RUN_TOKEN };
void NOTE;
console.log(`run ${run.run_token}`);

const sleep = ms => new Promise(r => setTimeout(r, ms));

let calls = 0;
let gatewayErrors = 0;
let written = 0;

for (;;) {
  const res = await fetch(`${BASE}/functions/v1/facet-memo-fill`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ run_token: run.run_token, batch: 1000, only_missing: true }),
  });

  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* Not JSON at all, so it never reached the function: an nginx 502 page.
       CLAUDE.md measured these at 24 to 151 ms against the half second the
       function takes, and six consecutive ones on a trivial request. Back off
       and try again rather than treating it as a verdict. */
    gatewayErrors++;
    if (gatewayErrors > 25) throw new Error(`gave up after ${gatewayErrors} gateway errors`);
    const wait = Math.min(8000, 400 * gatewayErrors);
    process.stdout.write(`\r  gateway error ${gatewayErrors}, waiting ${wait}ms   `);
    await sleep(wait);
    continue;
  }

  if (!res.ok) {
    /* The FUNCTION answered, so this is ours and a retry would repeat it. */
    throw new Error(`${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  }

  calls++;
  written = body.totals?.written ?? written;
  process.stdout.write(
    `\r  call ${calls}: written ${written}, scanned ${body.scanned ?? 0}` +
      `${body.census ? `, ${JSON.stringify(body.census)}` : ''}          `
  );

  if (body.done) {
    console.log(`\n  done: ${written} rows over ${calls} calls, ${gatewayErrors} gateway errors survived`);
    break;
  }

  if (calls > 200) throw new Error('200 calls without finishing; something is not converging');
}

const coverage = await rest('rpc/engine_coverage', { method: 'POST', body: '{}' });
console.log('\nHOW MUCH OF THE CATALOGUE THE ENGINE READS, right now:');
for (const row of coverage) {
  console.log(`  ${String(row.measure).padEnd(30)} ${String(row.cards).padStart(6)}  ${row.share ?? ''}`);
}
