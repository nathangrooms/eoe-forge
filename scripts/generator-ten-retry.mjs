/**
 * How often does the deployed generator actually return a deck?
 *
 * `generator-ten-decks.mjs` found seven of eleven commanders coming back 546
 * WORKER_RESOURCE_LIMIT, and the logs say `CPU Time exceeded` immediately after
 * the facet compile. A second run then succeeded for three of those seven, so
 * the budget is marginal rather than blown: the same request can succeed or
 * fail, which is worse than failing every time because it hides.
 *
 * This runs each commander N times and records the success rate, the wall clock
 * and the engine version, and keeps the FIRST successful body so the deck can
 * be reviewed.
 *
 *   node scripts/generator-ten-retry.mjs 5
 */
import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';
const ENDPOINT = `${SUPABASE_URL}/functions/v1/ai-deck-builder-v2`;
const OUT = path.resolve('.shots/gen-ten');

const { ROSTER, YURIKO_CURLY } = await import('./generator-roster.mjs');

const ATTEMPTS = Number(process.argv[2] ?? 5);

async function once(entry) {
  const started = Date.now();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ANON}`,
      apikey: ANON,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      commander: {
        id: entry.id,
        name: entry.name,
        type_line: entry.type_line,
        color_identity: entry.color_identity,
        colors: entry.colors,
      },
      archetype: entry.archetype,
      style: entry.style,
      powerLevel: 7,
      useAIPlanning: true,
      includeLands: true,
    }),
  });
  const text = await res.text();
  const ms = Date.now() - started;
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON is itself the finding */
  }
  return {
    ok: res.ok,
    status: res.status,
    ms,
    engineVersion: res.headers.get('x-engine-version'),
    code: body?.code ?? null,
    error: body?.error ?? null,
    body: res.ok ? body : null,
  };
}

fs.mkdirSync(OUT, { recursive: true });
const summary = [];
for (const entry of [...ROSTER, YURIKO_CURLY]) {
  const attempts = [];
  let kept = null;
  for (let i = 0; i < ATTEMPTS; i++) {
    const r = await once(entry);
    attempts.push({ ok: r.ok, status: r.status, ms: r.ms, code: r.code, engineVersion: r.engineVersion });
    if (r.ok && !kept) kept = r.body;
    process.stderr.write(`${entry.key} #${i + 1} ${r.ok ? 'ok' : `FAIL ${r.status} ${r.code ?? ''}`} ${r.ms}ms\n`);
  }
  if (kept) fs.writeFileSync(path.join(OUT, `${entry.key}.deck.json`), JSON.stringify(kept, null, 2));
  const okCount = attempts.filter(a => a.ok).length;
  summary.push({
    key: entry.key,
    name: entry.name,
    colours: entry.color_identity.length,
    archetype: entry.archetype,
    style: entry.style,
    ok: okCount,
    of: ATTEMPTS,
    engineVersion: attempts.find(a => a.engineVersion)?.engineVersion ?? null,
    msOk: attempts.filter(a => a.ok).map(a => a.ms),
    msFail: attempts.filter(a => !a.ok).map(a => a.ms),
    failCodes: [...new Set(attempts.filter(a => !a.ok).map(a => `${a.status} ${a.code ?? ''}`.trim()))],
    haveDeck: Boolean(kept),
  });
}
fs.writeFileSync(path.join(OUT, 'retry-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
