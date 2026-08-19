/**
 * price-bulk-sync: one download, every card, once a day.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT REPLACES
 *
 * `capture-card-price` takes a single card id, makes one Scryfall API call and
 * writes one row. Nothing ever swept the catalogue with it, so on 2026-08-19
 * the record was 34,510 rows covering 3,528 of 56,504 printings (6.2%), and
 * 81.5% of those had exactly one snapshot. Price trends had never worked.
 *
 * `daily-price-capture` did try to sweep, one card at a time behind a 125 ms
 * sleep, and died on the wall clock after about 400 cards every night, always
 * restarting at the same first 400.
 *
 * ---------------------------------------------------------------------------
 * WHY BULK
 *
 * Scryfall's rate limit page is not ambiguous:
 *
 *   "If you need to rapidly look up card names, prices, or resolve a large
 *    number of card images, you must use the bulk data files."
 *
 * 107,000 printings at their 10 requests a second ceiling is three hours of
 * traffic against a limit that exists to stop exactly that. One 74 MB gzipped
 * JSONL file replaces all of it and is not rate limited.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS RUNS IN SLICES
 *
 * Measured, not guessed. Deployed on 2026-08-19 and run against the real file,
 * this function reached 30,000 lines in 27 s and was then killed with
 * WORKER_RESOURCE_LIMIT. The file is 116,712 lines and about half a gigabyte
 * expanded, against 256 MB of memory and 150 s of wall clock.
 *
 * So the daily job is scripts/prices/daily-sweep.mjs on a GitHub runner, which
 * has neither limit and keeps the service role key in a secret rather than
 * accepting it over HTTP. This function is the path that needs nothing outside
 * Supabase, and it earns that by working in slices: each invocation stages at
 * most `lines` lines, writes its position after every batch, and returns
 * done:false. Call it until done is true.
 *
 * ---------------------------------------------------------------------------
 * HOW IT IS SAFE TO RUN
 *
 *   Idempotent   the day's rows key on (card_key, d) and upsert, so running it
 *                twice writes the same values and changes nothing.
 *   Resumable    price_sweep_run.cursor_line is written after EVERY staging
 *                batch, not only on a clean exit, so a hard kill still leaves a
 *                position to resume from.
 *   Cleared      the cursor is set back to null ON THE COMPLETION PATH and
 *                nowhere else. A done run still holding a cursor is itself a
 *                fault, and price_sweep_health reports it as one.
 *   Locked       one run per day. A day already finished is not redone.
 *
 * Deployed with verify_jwt = false so pg_cron can reach it through pg_net
 * without a key being written into a cron command. The only thing an anonymous
 * caller can make it do is fetch public Scryfall data and write today's correct
 * prices, once. Anything that could be misused, a different date or forcing a
 * finished day, requires the service role key. That key is read from the
 * environment Supabase injects and is never logged, never returned and never
 * written to a table.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { PRICE_KEYS, stagedPriceFrom, type StagedPrice } from './scryfall.ts';

const BULK_MANIFEST = 'https://api.scryfall.com/bulk-data';
const BULK_TYPE = 'default_cards';
const USER_AGENT = 'DeckMatrix/1.0 (+https://deckmatrix.com)';

/** Rows per staging round trip. */
const STAGE_CHUNK = 5000;
/** Lines per invocation. Below the measured 30,000 the runtime dies at. */
const DEFAULT_LINES = 20_000;
/** Hard stop well inside the wall clock. */
const TIME_BUDGET_MS = 100_000;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = new URL(req.url);
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey, {
    auth: { persistSession: false },
  });

  // Presenting the service role key unlocks the arguments that could be abused.
  // Compared, never echoed.
  const presented = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const privileged = serviceKey.length > 0 && presented === serviceKey;

  const mode = url.searchParams.get('mode') ?? 'sweep';

  try {
    if (mode === 'status') return json(await status(supabase));

    if (mode === 'health') {
      const { data, error } = await supabase.rpc('price_sweep_health', { p_lookback: 14 });
      if (error) throw error;
      const problems = data ?? [];
      return json({ healthy: problems.length === 0, problems }, problems.length === 0 ? 200 : 503);
    }

    // The backstop. No network at all: cards.prices is already refreshed nightly
    // by scryfall-sync, so a snapshot is a set based insert over a table we hold.
    // This is what keeps the record unbroken if everything else is unavailable.
    if (mode === 'from-cards') {
      const started = Date.now();
      const { data, error } = await supabase.rpc('capture_prices_from_cards', {});
      if (error) throw error;
      const r = Array.isArray(data) ? data[0] : data;
      return json({ mode, source: 'cards_table', ms: Date.now() - started, ...r });
    }

    if (mode !== 'sweep') return json({ error: `unknown mode "${mode}"` }, 400);

    const day = url.searchParams.get('date');
    if (day && !privileged) {
      return json({ error: 'writing a date other than today needs the service role key' }, 403);
    }
    const force = url.searchParams.get('force') === '1';
    if (force && !privileged) {
      return json({ error: 'force needs the service role key' }, 403);
    }
    const lines = Number(url.searchParams.get('lines') ?? DEFAULT_LINES) || DEFAULT_LINES;

    return json(await sweep(supabase, { day, force, lines: Math.min(lines, 40_000) }));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Record the failure so the watchdog sees a fault rather than a silent gap.
    await supabase
      .from('price_sweep_run')
      .upsert(
        {
          d: today(),
          status: 'failed',
          error: message.slice(0, 500),
          finished_at: new Date().toISOString(),
        },
        { onConflict: 'd' },
      );
    return json({ error: message }, 500);
  }
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function status(supabase: ReturnType<typeof createClient>) {
  const { data: runs } = await supabase
    .from('price_sweep_run')
    .select('*')
    .order('d', { ascending: false })
    .limit(7);
  const { data: stats } = await supabase.rpc('price_history_stats');
  return { stats, recent_runs: runs ?? [] };
}

interface SweepArgs {
  day: string | null;
  force: boolean;
  lines: number;
}

async function sweep(supabase: ReturnType<typeof createClient>, args: SweepArgs) {
  const startedAt = Date.now();
  const d = args.day ?? today();

  const { data: existing } = await supabase
    .from('price_sweep_run')
    .select('*')
    .eq('d', d)
    .maybeSingle();

  if (existing?.status === 'done' && !args.force) {
    return { done: true, skipped: 'already recorded for this day', run: existing };
  }

  const resumeFrom = args.force ? 0 : ((existing?.cursor_line as number | null) ?? 0);

  // Which file, and when Scryfall built it. Recording bulk_updated_at means we
  // can always say which day's prices a row actually holds.
  const manifest = await fetchJson(BULK_MANIFEST);
  const entry = (manifest.data ?? []).find((b: { type: string }) => b.type === BULK_TYPE);
  if (!entry?.jsonl_download_uri) throw new Error(`Scryfall has no ${BULK_TYPE} bulk file`);

  await supabase.from('price_sweep_run').upsert(
    {
      d,
      status: 'running',
      source: 'scryfall_bulk',
      started_at: existing?.started_at ?? new Date().toISOString(),
      finished_at: null,
      bulk_updated_at: entry.updated_at,
      cursor_line: resumeFrom || null,
      error: null,
    },
    { onConflict: 'd' },
  );

  const res = await fetch(entry.jsonl_download_uri, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok || !res.body) throw new Error(`bulk download failed: ${res.status}`);

  // Stream. The uncompressed file is around half a gigabyte and must never be
  // held in memory whole.
  const stream = res.body
    .pipeThrough(new DecompressionStream('gzip'))
    .pipeThrough(new TextDecoderStream());

  const stopAt = resumeFrom + args.lines;
  let line = 0;
  let staged = 0;
  let skipped = 0;
  let batch: StagedPrice[] = [];
  let buffer = '';
  let stop = false;

  const flush = async () => {
    if (batch.length === 0) return;
    const { error } = await supabase
      .from('price_sweep_stage')
      .upsert(batch, { onConflict: 'card_id' });
    if (error) throw error;
    staged += batch.length;
    batch = [];
    // Position written after EVERY batch. A hard kill from the runtime does not
    // announce itself, so the cursor cannot wait for a clean exit.
    await supabase.from('price_sweep_run').update({ cursor_line: line }).eq('d', d);
  };

  const take = async (raw: string) => {
    line++;
    if (line <= resumeFrom) return;
    let card: Record<string, unknown>;
    try {
      card = JSON.parse(raw);
    } catch {
      return; // one malformed line is not worth failing a whole sweep over
    }
    const row = stagedPriceFrom(card as Parameters<typeof stagedPriceFrom>[0]);
    if (!row) {
      skipped++;
      return;
    }
    batch.push(row);
    if (batch.length >= STAGE_CHUNK) await flush();
    if (line >= stopAt || Date.now() - startedAt > TIME_BUDGET_MS) stop = true;
  };

  reader: for await (const chunk of stream) {
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const raw = buffer.slice(0, nl).trim().replace(/,$/, '');
      buffer = buffer.slice(nl + 1);
      if (raw && raw !== '[' && raw !== ']') await take(raw);
      if (stop) break reader;
    }
  }
  const reachedEnd = !stop;
  if (reachedEnd && buffer.trim()) {
    const raw = buffer.trim().replace(/,$/, '');
    if (raw && raw !== ']') await take(raw);
  }
  await flush();

  if (!reachedEnd) {
    // Deliberately leaves the cursor set. This run did not complete.
    return {
      done: false,
      date: d,
      resume_from_line: line,
      staged_this_slice: staged,
      ms: Date.now() - startedAt,
      note: 'slice finished, call again to continue',
    };
  }

  // Gate and write. One statement, in the database, using the single definition
  // of "the price moved" that exists.
  const { data: applied, error: applyError } = await supabase.rpc('apply_price_sweep', {
    p_date: d,
    p_src: 1,
  });
  if (applyError) throw applyError;
  const result = (Array.isArray(applied) ? applied[0] : applied) ?? {};

  // COMPLETION PATH. The cursor is cleared here and only here.
  const { count } = await supabase
    .from('price_sweep_stage')
    .select('*', { count: 'exact', head: true });

  await supabase
    .from('price_sweep_run')
    .update({
      status: 'done',
      finished_at: new Date().toISOString(),
      cards_seen: count ?? staged,
      rows_written: result.rows_written ?? 0,
      cursor_line: null,
      error: null,
    })
    .eq('d', d);

  await supabase.from('price_sweep_stage').delete().neq('card_id', '');

  return {
    done: true,
    date: d,
    bulk_updated_at: entry.updated_at,
    lines_read: line,
    cards_staged: count ?? staged,
    skipped_not_paper: skipped,
    rows_written: result.rows_written ?? 0,
    keys_added: result.keys_added ?? 0,
    price_keys: PRICE_KEYS,
    ms: Date.now() - startedAt,
  };
}

async function fetchJson(u: string) {
  const r = await fetch(u, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${u} returned ${r.status}`);
  return await r.json();
}
