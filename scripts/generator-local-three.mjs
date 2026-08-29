/**
 * The three decks the deployed generator will not build, built locally.
 *
 * READ THIS BEFORE QUOTING ANY NUMBER OUT OF THIS SCRIPT.
 *
 * This is NOT a measurement of the deployed function and must never be
 * presented as one. Lord Windgrace, Uril and Edgar Markov each came back 546
 * WORKER_RESOURCE_LIMIT on every attempt against the live endpoint, and the
 * function log says `CPU Time exceeded`, so as far as a player is concerned
 * those three decks do not exist. That failure is the finding.
 *
 * What this does is import `pipeline.ts` and call `build()` against the LIVE
 * catalogue over PostgREST, which is the same code path the deployed function
 * runs, on a machine with no CPU budget. It answers a different and still
 * useful question: if the compute limit were lifted, would the deck be any
 * good? A deck that is bad here is bad in production too.
 *
 * `index.ts` calls `serve()` at module scope, so importing it would start a
 * listener rather than run a build. That is why the pipeline is a separate
 * module and why this imports the pipeline.
 *
 *   node --experimental-strip-types scripts/generator-local-three.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

import { Catalog } from '../supabase/functions/ai-deck-builder-v2/catalog.ts';
import { build, ENGINE_VERSION } from '../supabase/functions/ai-deck-builder-v2/pipeline.ts';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const { ROSTER } = await import('./generator-roster.mjs');
const WANTED = new Set(['windgrace', 'uril', 'edgar']);
const OUT = path.resolve('.shots/gen-ten');

console.error(`local build against ${ENGINE_VERSION}`);
for (const entry of ROSTER.filter(e => WANTED.has(e.key))) {
  const catalog = new Catalog({ url: SUPABASE_URL, anonKey: ANON, authorization: null });
  const started = Date.now();
  const result = await build({
    catalog,
    request: {
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
      useAIPlanning: false,
      includeLands: true,
    },
    apiKey: null,
    startedAt: started,
  });
  const ms = Date.now() - started;
  if (result.kind !== 'ok') {
    console.error(`${entry.name}: REFUSED ${result.error}`);
    continue;
  }
  fs.writeFileSync(
    path.join(OUT, `${entry.key}.local.json`),
    JSON.stringify({ localRun: true, notDeployed: true, engineVersion: ENGINE_VERSION, ms, ...result.body }, null, 2)
  );
  console.error(`${entry.name}: ok ${ms}ms, ${result.body.result.deck.length} entries`);
}
