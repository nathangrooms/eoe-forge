/**
 * Ten decks through the DEPLOYED generator, printed in full.
 *
 * This calls the HTTP endpoint, not `pipeline.ts`, because the whole point of
 * section 10c of CLAUDE.md is that the repo and the deployment are different
 * things and only the second one is what a player gets. Every call records the
 * `x-engine-version` response header and wall clock so the reader knows which
 * build produced each list.
 *
 * Output is one JSON file per commander under `.shots/gen-ten/`, plus an index.
 *
 *   node scripts/generator-ten-decks.mjs
 *   node scripts/generator-ten-decks.mjs "Yuriko, the Tiger’s Shadow"   # one off
 */
import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
/* The publishable (anon) key. Client-visible by design, same value as
 * `src/integrations/supabase/client.ts`. */
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const ENDPOINT = `${SUPABASE_URL}/functions/v1/ai-deck-builder-v2`;
const OUT = path.resolve('.shots/gen-ten');

const { ROSTER, YURIKO_CURLY } = await import('./generator-roster.mjs');

async function buildOne(entry) {
  const body = {
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
  };

  const started = Date.now();
  let res, text;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ANON}`,
        apikey: ANON,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    text = await res.text();
  } catch (err) {
    return { entry, ok: false, ms: Date.now() - started, transportError: String(err) };
  }
  const ms = Date.now() - started;

  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* left null on purpose: a non-JSON body is itself the finding */
  }

  return {
    entry,
    ok: res.ok,
    status: res.status,
    engineVersion: res.headers.get('x-engine-version'),
    ms,
    body: json,
    raw: json ? null : text.slice(0, 2000),
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv[2];
  const list = only
    ? [...ROSTER, YURIKO_CURLY].filter(e => e.name === only || e.key === only)
    : [...ROSTER, YURIKO_CURLY];
  if (!list.length) {
    console.error(`No roster entry matches ${only}`);
    process.exit(1);
  }

  const index = [];
  for (const entry of list) {
    process.stderr.write(`building ${entry.name} … `);
    const out = await buildOne(entry);
    fs.writeFileSync(path.join(OUT, `${entry.key}.json`), JSON.stringify(out, null, 2));
    const n = out.body?.result?.deck?.length ?? 0;
    process.stderr.write(
      `${out.ok ? 'ok' : `FAILED ${out.status}`} ${out.ms}ms ${out.engineVersion ?? 'no header'} entries=${n}\n`
    );
    index.push({
      key: entry.key,
      name: entry.name,
      archetype: entry.archetype,
      style: entry.style,
      ok: out.ok,
      status: out.status ?? null,
      engineVersion: out.engineVersion ?? null,
      ms: out.ms,
      error: out.body?.error ?? out.transportError ?? null,
    });
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2));
  console.log(JSON.stringify(index, null, 2));
}

main();
