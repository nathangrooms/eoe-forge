/**
 * mtgjson-deck-sync
 *
 * Drives ingestion of curated decklists from MTGJSON into `meta_decks` / `meta_deck_cards`.
 *
 * LICENCE. MTGJSON is MIT, copyright 2018-present Zach Halpern. The licence grants use, copy,
 * modify, merge, publish, distribute, sublicense and sell without restriction; the only
 * obligation is reproducing the copyright and permission notice, discharged in
 * THIRD-PARTY-NOTICES.md. `mtgjson.com/robots.txt` disallows `/api/v5/*.json` to crawlers,
 * which is aimed at search engines indexing multi-megabyte JSON, not at clients downloading the
 * files the project exists to publish under an explicit grant.
 *
 * WHAT IT REFUSES TO INGEST. MTGJSON labels 3,004 things a "deck" and only 873 of them are
 * decklists. The allowlist lives in `public.meta_deck_type_allowlist`, as data, with a recorded
 * reason for every exclusion. The one worth repeating: `MTGO Redemption` entries are full set
 * redemptions, measured at 383 distinct cards with one copy of each. Ingesting one as a
 * decklist would tell the co-occurrence engine that every card in a set is played alongside
 * every other card in it, at a lift that would look entirely authoritative.
 *
 * THIS FUNCTION DELIBERATELY CONTAINS NO TRANSFORM LOGIC. Normalisation is
 * `public.meta_load_mtgjson_deck`, in SQL, once, shared with the pg_cron path
 * (`public.meta_drain_tick`). Two copies of the rules in two languages is how the wrong thing
 * eventually gets ingested: someone fixes one copy and the other keeps running the old rules.
 *
 * RESUMABILITY. The work queue `meta_fetch_queue` IS the resume pointer, so an interrupted run
 * resumes by definition. The pointer is cleared on the COMPLETION path inside
 * `meta_finish_ingest`, enforced by a trigger the moment the run leaves 'running' — a pointer
 * that never cleared froze this project's Scryfall card sync for months. A FAILED run keeps its
 * pointer on purpose: a failure is not a completion, and the retry should resume.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SOURCE = 'mtgjson';
const INDEX_URL = 'https://mtgjson.com/api/v5/DeckList.json';
const DECK_BASE = 'https://mtgjson.com/api/v5/decks';

/** Static file host, no published rate limit. Politeness toward a free service. */
const DELAY_MS = 150;
const DEFAULT_BUDGET_MS = 50_000;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';

  const auth = req.headers.get('Authorization') ?? '';
  if (!serviceKey || auth !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'service role key required' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const db = createClient(supabaseUrl, serviceKey);
  const url = new URL(req.url);
  const restart = url.searchParams.get('restart') === 'true';
  const budgetMs = Number(url.searchParams.get('budget_ms') ?? DEFAULT_BUDGET_MS);
  const startedAt = Date.now();

  try {
    // One source of truth for how we identify ourselves, shared with the pg_cron path.
    const { data: userAgent } = await db.rpc('meta_user_agent');

    const { error: beginErr } = await db.rpc('meta_begin_ingest', {
      p_source: SOURCE, p_restart: restart,
    });
    if (beginErr) throw beginErr;

    if (restart) {
      const idxRes = await fetch(INDEX_URL, {
        headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      });
      if (!idxRes.ok) throw new Error(`mtgjson index ${idxRes.status}`);
      const idx = await idxRes.json();

      // The allowlist decides what is even worth requesting, so a product manifest is never
      // fetched, let alone parsed. Reading it from the database rather than a constant keeps
      // one copy of the decision.
      const { data: allow } = await db
        .from('meta_deck_type_allowlist')
        .select('deck_type')
        .not('format', 'is', null);
      const allowed = new Set((allow ?? []).map((a: { deck_type: string }) => a.deck_type));

      const targets = (idx?.data ?? [])
        .filter((d: { type?: string }) => allowed.has(String(d?.type ?? '')))
        .map((d: { fileName: string }) => d.fileName)
        .sort((a: string, b: string) => a.localeCompare(b));

      await db.from('meta_fetch_queue').delete().eq('source_id', SOURCE);
      await db.from('meta_fetch_queue').insert(targets.map((fileName: string, i: number) => ({
        source_id: SOURCE, seq: i + 1,
        // encodeURIComponent is not optional: six World Championship deck files are named after
        // players with accented names, and an unencoded request fails before it reaches the wire.
        url: `${DECK_BASE}/${encodeURIComponent(fileName)}.json`,
        ref: fileName,
      })));
    }

    let fetched = 0;

    while (Date.now() - startedAt < budgetMs) {
      // Respect the same backoff window the scheduled path uses, so the two paths cannot
      // retry into a throttle the other one just recorded.
      const { data: pending } = await db
        .from('meta_fetch_queue')
        .select('seq,url,ref')
        .eq('source_id', SOURCE).eq('state', 'pending')
        .or(`not_before.is.null,not_before.lte.${new Date().toISOString()}`)
        .order('seq').limit(1);

      if (!pending || pending.length === 0) break;
      const item = pending[0];

      const res = await fetch(item.url, {
        headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      });

      if (res.status === 429) {
        await db.from('meta_fetch_queue').update({
          not_before: new Date(Date.now() + 60_000).toISOString(),
          error_msg: 'http 429, backing off',
        }).eq('source_id', SOURCE).eq('seq', item.seq);
        break;
      }
      if (res.status >= 500) break; // transient; the row stays pending, nothing is lost
      if (res.status === 404) {
        await db.from('meta_fetch_queue').update({ state: 'skipped', error_msg: 'http 404' })
          .eq('source_id', SOURCE).eq('seq', item.seq);
        continue;
      }
      if (!res.ok) throw new Error(`mtgjson deck ${item.ref} ${res.status}`);

      const body = await res.json();

      // The transform. All of it.
      const { error: loadErr } = await db.rpc('meta_load_mtgjson_deck', {
        p_file_name: item.ref, p_deck: body?.data ?? null,
      });
      if (loadErr) throw loadErr;

      await db.from('meta_fetch_queue')
        .update({ state: 'done', updated_at: new Date().toISOString() })
        .eq('source_id', SOURCE).eq('seq', item.seq);

      fetched += 1;
      await sleep(DELAY_MS);
    }

    // COMPLETION PATH. Finishes only when the queue is genuinely drained and clears the resume
    // pointer in the same call. Aggregates are rebuilt afterwards so the derived numbers can
    // never describe a corpus that no longer exists.
    const { data: fin } = await db.rpc('meta_queue_finish_if_drained', {
      p_source: SOURCE, p_prune: false,
    });
    const finished = Array.isArray(fin) ? fin[0] : fin;

    let inclusion = null;
    let pairRows = null;
    if (finished?.drained) {
      inclusion = (await db.rpc('meta_refresh_inclusion')).data;
      pairRows = (await db.rpc('meta_refresh_pairs')).data;
    }

    return new Response(JSON.stringify({
      done: Boolean(finished?.drained), source: SOURCE, decks_fetched: fetched,
      outstanding: finished?.outstanding ?? null,
      cursor_after: finished?.cursor_after ?? null,
      inclusion, pair_rows: pairRows,
      note: finished?.drained ? 'complete' : 'time budget reached, re-invoke to continue',
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.rpc('meta_fail_ingest', { p_source: SOURCE, p_error: message });
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
