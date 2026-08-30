/**
 * How often does the deployed Tutor endpoint answer at all?
 *
 * WHY THIS EXISTS. Re-running the fifty against the deployed function on
 * 2026-08-30 returned `502 Bad Gateway` for twelve of them, in two runs of
 * consecutive questions (q27 to q32, and q39 to q45). A 502 is worse than any
 * wrong answer in the review, because the player gets nothing and the page
 * prints its own fallback. Nothing in the fifty distinguishes a 502 from a
 * refusal, so this asks one trivial question many times and counts.
 *
 *   node scripts/tutor-502-probe.mjs            20 asks, 1.2 s apart
 *   node scripts/tutor-502-probe.mjs 30 300     30 asks, 300 ms apart
 *
 * The question is deliberately the cheapest one there is: a keyword, which is
 * one indexed read. If that 502s, the fault is not the work the answer does.
 */

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const asks = Number(process.argv[2] ?? 20);
const gap = Number(process.argv[3] ?? 1200);
const question = process.argv[4] ?? 'What does hexproof mean?';

const sleep = ms => new Promise(r => setTimeout(r, ms));

let ok = 0;
let bad = 0;
const codes = new Map();
const times = [];

for (let i = 0; i < asks; i++) {
  const started = Date.now();
  let status = 0;
  let body = '';
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/mtg-brain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
      body: JSON.stringify({
        message: question,
        deckContext: null,
        conversationHistory: [],
        responseStyle: 'concise',
        conversationId: null,
      }),
    });
    status = res.status;
    body = await res.text();
  } catch (error) {
    status = -1;
    body = String(error);
  }
  const ms = Date.now() - started;
  times.push(ms);
  codes.set(status, (codes.get(status) ?? 0) + 1);
  if (status === 200) ok++;
  else bad++;
  process.stdout.write(
    `${String(i + 1).padStart(3)} ${String(status).padStart(4)} ${String(ms).padStart(6)}ms ${
      status === 200 ? '' : body.replace(/\s+/g, ' ').slice(0, 90)
    }\n`
  );
  await sleep(gap);
}

const sorted = [...times].sort((a, b) => a - b);
console.log(`\nanswered ${ok} / ${asks}, failed ${bad}`);
console.log(`status codes: ${[...codes].map(([c, n]) => `${c}x${n}`).join('  ')}`);
console.log(
  `latency min ${sorted[0]} median ${sorted[Math.floor(sorted.length / 2)]} max ${sorted[sorted.length - 1]}`
);
