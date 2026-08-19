/**
 * spellbook-combo-sync
 *
 * Drives ingestion of the Commander Spellbook combo corpus into `meta_combos` /
 * `meta_combo_cards`.
 *
 * LICENCE. Commander Spellbook's backend is MIT licensed (Space Cow Media). They publish an
 * OpenAPI schema and an official generated npm client for third parties, and their developer
 * docs state read endpoints are public. No term restricts commercial or automated use.
 * Attribution is recorded in THIRD-PARTY-NOTICES.md and must be shown wherever a combo appears.
 * Their API host serves `robots.txt: Disallow: /`, a search-crawler directive on a JSON host
 * rather than a restriction on documented API clients; it is recorded in
 * `meta_sources.terms_note` rather than hidden.
 *
 * THIS FUNCTION DELIBERATELY CONTAINS NO TRANSFORM LOGIC.
 *
 * Normalisation lives in `public.meta_load_spellbook_page`, in SQL, once. Two copies of the
 * rules in two languages is how a corpus quietly ends up containing something it should never
 * have contained: someone fixes one copy and the other keeps running the old rules. So this is
 * a fetch loop and nothing more, and the same is true of the pg_cron path
 * (`public.meta_drain_tick`), which shares the identical loader.
 *
 * RESUMABILITY. The work queue `meta_fetch_queue` IS the resume pointer: a row's state is
 * durable, so an interrupted run resumes by definition rather than by remembering an offset.
 * The corpus is ~104,000 variants and the API caps page size at 100 whatever `limit` asks for,
 * so a sweep is ~1,042 requests and cannot finish in one invocation. Re-invoke until
 * `done: true`.
 *
 * THE RESUME POINTER IS CLEARED ON THE COMPLETION PATH, inside `meta_finish_ingest`, which a
 * database trigger enforces the moment the run leaves 'running'. A pointer that never cleared
 * froze this project's Scryfall card sync for months, so completion and clearing are one call
 * and cannot be separated by a later edit. A FAILED run deliberately keeps its pointer, because
 * a failure is not a completion and the retry should resume rather than start over.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SOURCE = 'commander_spellbook';
const API = 'https://backend.commanderspellbook.com/variants/';

/** The server caps page size at 100. Asking for more is silently ignored. */
const PAGE_SIZE = 100;

/** Politeness toward a small volunteer project. There is no published rate limit to hide behind. */
const DELAY_MS = 250;

/** Leave headroom under the edge wall clock so the queue state is always consistent. */
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

  // A sweep is ~1,042 outbound requests against a volunteer-run API and rewrites a shared
  // reference table. Service role only. Deployed with verify_jwt = false so a scheduler can
  // reach it, which means the gate has to live here.
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

    const { data: begun, error: beginErr } = await db.rpc('meta_begin_ingest', {
      p_source: SOURCE, p_restart: restart,
    });
    if (beginErr) throw beginErr;
    const runId: number = (Array.isArray(begun) ? begun[0] : begun)?.run_id ?? 0;

    // Seed the queue on a fresh sweep. Page count is derived from the corpus size rather than
    // guessed; an over-long queue simply returns empty pages and drains.
    if (restart) {
      await db.from('meta_fetch_queue').delete().eq('source_id', SOURCE);
      const pages = Array.from({ length: 1100 }, (_, i) => ({
        source_id: SOURCE, seq: i,
        url: `${API}?limit=${PAGE_SIZE}&offset=${i * PAGE_SIZE}`,
        ref: String(i * PAGE_SIZE),
      }));
      const { error } = await db.from('meta_fetch_queue').insert(pages);
      if (error) throw error;
    }

    let fetched = 0;
    let emptyPage = false;

    while (Date.now() - startedAt < budgetMs) {
      // Respect the same backoff window the scheduled path uses. Without the not_before filter
      // this function would happily re-request a page the upstream just answered with a 429,
      // which is how the throttle was tripped in the first place.
      const { data: pending } = await db
        .from('meta_fetch_queue')
        .select('seq,url')
        .eq('source_id', SOURCE).eq('state', 'pending')
        .or(`not_before.is.null,not_before.lte.${new Date().toISOString()}`)
        .order('seq').limit(1);

      if (!pending || pending.length === 0) break;
      const item = pending[0];

      const res = await fetch(item.url, {
        headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      });

      // Commander Spellbook enforces a rate limit it does not publish, and answers a burst with
      // 429, no Retry-After and an empty body. Record the backoff so neither path retries into
      // it, then stop this invocation rather than working through the rest of the queue.
      if (res.status === 429) {
        await db.from('meta_fetch_queue').update({
          not_before: new Date(Date.now() + 60_000).toISOString(),
          error_msg: 'http 429, backing off',
        }).eq('source_id', SOURCE).eq('seq', item.seq);
        break;
      }
      if (res.status >= 500) break; // transient; the row stays pending, nothing is lost
      if (!res.ok) throw new Error(`spellbook ${res.status} at ${item.url}`);

      const page = await res.json();

      // The transform. All of it.
      const { error: loadErr } = await db.rpc('meta_load_spellbook_page', {
        p_page: page, p_run: runId,
      });
      if (loadErr) throw loadErr;

      await db.from('meta_fetch_queue')
        .update({ state: 'done', updated_at: new Date().toISOString() })
        .eq('source_id', SOURCE).eq('seq', item.seq);

      fetched += 1;

      // Past the end of the corpus: mark the rest of the queue skipped so the run can finish
      // rather than walking thousands of empty pages.
      if ((page?.results ?? []).length === 0) {
        await db.from('meta_fetch_queue')
          .update({ state: 'skipped' })
          .eq('source_id', SOURCE).eq('state', 'pending');
        emptyPage = true;
        break;
      }

      await sleep(DELAY_MS);
    }

    // COMPLETION PATH. Finishes only when the queue is genuinely drained, prunes combos this
    // sweep never saw (deleted upstream), and clears the resume pointer in the same call.
    const { data: fin } = await db.rpc('meta_queue_finish_if_drained', {
      p_source: SOURCE, p_prune: true,
    });
    const finished = Array.isArray(fin) ? fin[0] : fin;

    return new Response(JSON.stringify({
      done: Boolean(finished?.drained), source: SOURCE, pages_fetched: fetched,
      outstanding: finished?.outstanding ?? null, reached_end_of_corpus: emptyPage,
      cursor_after: finished?.cursor_after ?? null,
      note: finished?.drained ? 'complete' : 'time budget reached, re-invoke to continue',
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Leaves status 'error' with the queue intact, so the next run resumes rather than restarts.
    await db.rpc('meta_fail_ingest', { p_source: SOURCE, p_error: message });
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
