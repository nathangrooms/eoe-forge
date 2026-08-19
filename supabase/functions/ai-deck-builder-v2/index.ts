/**
 * The Deck Generator — grounded.
 *
 * WHAT WAS WRONG, MEASURED
 * ------------------------
 * The previous version of this file did four things, and three of them were
 * the same class of mistake the deck optimiser had already been fixed for.
 *
 * 1. It asked a language model to RECALL twenty card names from memory, then
 *    string-matched them against the database. Names that matched nothing were
 *    silently dropped, so the planner's contribution was invisible and usually
 *    empty.
 *
 * 2. It fetched the pool with `.limit(8000)` and no `order by`. Measured on the
 *    live catalogue on 2026-08-19: `cards` holds about 56,500 printings; the
 *    same predicate with `limit 8000` returns 6,336 distinct cards, roughly a
 *    fifth of the format, and that fifth contained **no Arcane Signet, no
 *    Command Tower and no Doubling Season**. Two of those three are cards this
 *    file hardcoded as auto-includes and then could not find. The planner's
 *    picks mostly could not be found either, for the same reason.
 *
 * 3. It ranked what was left with a private heuristic: `+4 mythic`, `+2 rare`,
 *    `5 - cmc`, and `+2` for each of five hardcoded keywords appearing in both
 *    the commander's oracle text and the card's. A fourth scoring function, in
 *    a repo whose whole engine effort exists to have one.
 *
 * 4. It never selected `image_uris`. Every generated card reached the browser
 *    with no art, which is why the Grid view drew forty grey boxes.
 *
 * The observable result, reproduced against the deployed function on
 * 2026-08-19 for Atraxa / counters: a deck with zero proliferate cards, none of
 * the three staples the file hardcodes, and Venom, Iron Spider, T'Chaka,
 * Vashta Nerada, Aang, Koh, Abstergo Entertainment and a Nuka-Nuke Launcher in
 * it. Not because crossover cards are illegal, they are legal, but because the
 * pool was an arbitrary fifth of Magic ranked by "cheap and rare".
 *
 * WHAT IT DOES NOW
 * ----------------
 * The same four steps as `deck-optimizer`, in the same order, with the same
 * code doing them:
 *
 *   RETRIEVE  `Catalog.poolFor` — every legal card inside the commander's
 *             colour identity, paged past PostgREST's 1000-row cap, no limit.
 *             `Catalog.landPoolFor` adds oracle text for the land half, which
 *             is the only way to know what a land taps for.
 *   RANK      `_engine/build/generate.ts`, which is `advise/rank.ts` — the same
 *             `scoreCandidate` that ranks the optimiser's additions and orders
 *             its cuts. There is no scoring function left in this file.
 *   GROUND    the model is shown the ranked shortlist and returns oracle IDS
 *             from it. `generateDeck` takes `preferOracleIds`, never names, so
 *             a card a model invented cannot enter the deck through the type.
 *   VALIDATE  the same legality, singleton, identity and count checks as
 *             before, unchanged, and they still refuse rather than warn.
 *
 * The response is strictly additive: every field the client already reads is
 * still returned with the same name and meaning. `result.analysis.power` is now
 * OUR measured score rather than the player's own target slider echoed back,
 * and every card in `result.deck` gains `image_uris`, `oracle_text`, `tags` and
 * the engine's reason for choosing it.
 *
 * WHERE THE CODE IS
 * -----------------
 * This file is the HTTP wrapper and nothing else. The pipeline lives in
 * `pipeline.ts`, which imports nothing from deno.land, because `serve` starts a
 * listener at module scope — so anything importing this file to test the
 * builder would open a socket instead. `scripts/generator-shots.mjs` calls
 * `build()` from that module directly, which means the deck in the screenshots
 * came out of the code that deploys rather than out of a copy of it.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

import { Catalog } from './catalog.ts';
import { build, ENGINE_VERSION, type BuildRequest } from './pipeline.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY are not configured');
    }

    const buildRequest: BuildRequest = await req.json();
    if (!buildRequest?.commander?.name) {
      throw new Error('No commander supplied. Pick a commander and try again.');
    }

    const catalog = new Catalog({
      url: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      authorization: req.headers.get('Authorization'),
    });

    const result = await build({
      catalog,
      request: buildRequest,
      apiKey: Deno.env.get('LOVABLE_API_KEY') ?? null,
      startedAt,
    });

    if (result.kind === 'refused') {
      return json({ error: result.error, validation: result.validation }, 422);
    }
    return json(result.body, 200);
  } catch (error) {
    console.error('Build error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      // So a deploy can be identified from a response without reading a log.
      'X-Engine-Version': ENGINE_VERSION,
    },
  });
}

