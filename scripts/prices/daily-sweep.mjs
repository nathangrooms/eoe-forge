#!/usr/bin/env node
/**
 * The daily price sweep, from Scryfall's one bulk file.
 *
 *   node scripts/prices/daily-sweep.mjs
 *   node scripts/prices/daily-sweep.mjs --dry-run          # no writes, full report
 *   node scripts/prices/daily-sweep.mjs --date 2026-08-19  # a specific day
 *   node scripts/prices/daily-sweep.mjs --force            # redo a finished day
 *   node scripts/prices/daily-sweep.mjs --chunk 500        # smaller writes on a busy database
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment. The key
 * is read once, sent as a header, and never printed, never written to a file
 * and never put in a URL. --dry-run needs neither.
 *
 * ---------------------------------------------------------------------------
 * WHERE THIS SITS
 *
 * It is the first step of .github/workflows/prices-daily.yml, ahead of the
 * price-snapshot page runner. Three parts, one pipeline:
 *
 *   this script            today's price for EVERY PRINTING, from the bulk file
 *   price_snapshot_run     the tier 1 guarantee and anything the file missed,
 *                          paged out of cards.prices
 *   apply_price_sweep      the single writer of card_price_point, and the one
 *                          definition of "the price moved"
 *
 * The bulk file is first because it is the only place today's price exists for
 * printings the catalogue sync has not reached. Measured 2026-08-19: 101,587
 * priced paper printings in the file against 56,504 rows in `cards`. Waiting
 * for the catalogue would throw those days away and the clock only runs
 * forwards.
 *
 * ---------------------------------------------------------------------------
 * WHY BULK, AND WHY A SCRIPT
 *
 * Scryfall's rate limit page: "If you need to rapidly look up card names,
 * prices, or resolve a large number of card images, you must use the bulk data
 * files." 107,000 printings at their 10 requests a second ceiling is three
 * hours of traffic against a limit that exists to stop exactly that.
 *
 * And a script rather than only an edge function, because that was measured
 * too. Deployed as supabase/functions/price-bulk-sync and run against the real
 * file, the edge runtime reached 30,000 lines in 27 s and was killed with
 * WORKER_RESOURCE_LIMIT: 256 MB of memory and 150 s of wall clock against a
 * 74 MB gzipped file that expands to about half a gigabyte. A GitHub runner has
 * neither limit, keeps the key in a secret rather than accepting it over HTTP,
 * and leaves a log a person can read. The edge function survives as the path
 * that needs nothing outside Supabase, working in slices.
 *
 * ---------------------------------------------------------------------------
 * THE 8 SECOND CEILING
 *
 * PostgREST connects as `authenticator`, which carries statement_timeout = 8s,
 * and service_role inherits it. That cannot be widened from inside a function:
 * the timer is armed when the calling statement starts, so a SET inside the
 * function never re-arms it. So chunks are small, and every write retries with
 * backoff, because a timeout on a busy database is a wait, not a failure.
 */

import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import { setTimeout as sleep } from 'node:timers/promises';
import { stagedPriceFrom, PRICE_KEYS } from '../../src/lib/prices/scryfall.ts';

const BULK_MANIFEST = 'https://api.scryfall.com/bulk-data';
const BULK_TYPE = 'default_cards';
const USER_AGENT = 'DeckMatrix/1.0 (+https://deckmatrix.com)';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const value = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : null;
};

const DRY = flag('dry-run');
const FORCE = flag('force');
const DATE = value('date') ?? new Date().toISOString().slice(0, 10);
const CHUNK = Number(value('chunk') ?? 1000) || 1000;

const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!DRY && (!SUPABASE_URL || !SERVICE_KEY)) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (or pass --dry-run).');
  process.exit(2);
}

const log = (...m) => console.log(`[prices ${new Date().toISOString().slice(11, 19)}]`, ...m);

/* -------------------------------------------------------------------------- */
/* PostgREST by hand. No client library, so nothing changes under CI.          */
/* -------------------------------------------------------------------------- */

/** Postgres says "come back later" in these. They are waits, not failures. */
const TRANSIENT = ['57014', '55P03', '40001', '40P01', 'PGRST002', '502', '503', '504'];

async function db(path, init = {}, attempt = 1) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch (networkError) {
    if (attempt >= 6) throw networkError;
    await sleep(backoff(attempt));
    return db(path, init, attempt + 1);
  }

  if (res.ok) {
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  // The key is in the headers we just sent. Report the body only, never the request.
  const body = await res.text();
  const transient = TRANSIENT.some((c) => body.includes(c) || String(res.status) === c);
  if (transient && attempt < 6) {
    log(`database busy (${res.status}), retry ${attempt} of 5`);
    await sleep(backoff(attempt));
    return db(path, init, attempt + 1);
  }
  throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]} -> ${res.status} ${body}`);
}

const backoff = (n) => Math.min(20_000, 1000 * 2 ** n) + Math.random() * 500;

const rpc = (name, body) => db(`rpc/${name}`, { method: 'POST', body: JSON.stringify(body ?? {}) });

async function setRun(patch, { insert = false } = {}) {
  if (DRY) return;
  // Explicit insert or update, never PostgREST upsert: upsert resets every
  // column the payload omits back to its default, and one of those columns is
  // the resume pointer.
  if (insert) {
    await db('price_sweep_run', { method: 'POST', body: JSON.stringify({ d: DATE, ...patch }) });
  } else {
    await db(`price_sweep_run?d=eq.${DATE}`, { method: 'PATCH', body: JSON.stringify(patch) });
  }
}

/** Tell the shared watchdog. Registered as job 'price-bulk'. */
async function heartbeat(ok, detail) {
  if (DRY) return;
  try {
    await rpc('pipeline_heartbeat', { p_job: 'price-bulk', p_ok: ok, p_detail: detail });
  } catch (e) {
    log('could not record a heartbeat:', e.message);
  }
}

/* -------------------------------------------------------------------------- */

async function main() {
  const t0 = Date.now();

  let existing = null;
  if (!DRY) {
    const rows = await db(`price_sweep_run?d=eq.${DATE}&select=*`);
    existing = rows?.[0] ?? null;
    if (existing?.status === 'done' && existing.source === 'scryfall_bulk' && !FORCE) {
      log(`${DATE} already swept from the bulk file: ${existing.rows_written} rows written.`);
      log('Pass --force to run it again.');
      await heartbeat(true, { date: DATE, skipped: 'already done', rows_written: existing.rows_written });
      return;
    }
  }
  const resumeFrom = FORCE ? 0 : (existing?.cursor_line ?? 0);
  if (resumeFrom) log(`resuming: ${resumeFrom.toLocaleString()} lines already staged`);

  const manifest = await getJson(BULK_MANIFEST);
  const entry = manifest.data.find((b) => b.type === BULK_TYPE);
  if (!entry?.jsonl_download_uri) throw new Error(`Scryfall has no ${BULK_TYPE} bulk file`);
  log(
    `${BULK_TYPE} built ${entry.updated_at}, ${(entry.compressed_size / 1048576).toFixed(1)} MB gzipped`,
  );

  await setRun(
    {
      status: 'running',
      source: 'scryfall_bulk',
      started_at: new Date().toISOString(),
      finished_at: null,
      bulk_updated_at: entry.updated_at,
      cursor_line: resumeFrom || null,
      error: null,
    },
    { insert: !existing },
  );

  const res = await fetch(entry.jsonl_download_uri, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok || !res.body) throw new Error(`bulk download failed: ${res.status}`);

  const rl = createInterface({
    input: Readable.fromWeb(res.body).pipe(createGunzip()),
    crlfDelay: Infinity,
  });

  let line = 0;
  let staged = 0;
  let notPaper = 0;
  let batch = [];
  const held = Object.create(null);

  const flush = async () => {
    if (batch.length === 0) return;
    if (!DRY) await rpc('stage_bulk_prices', { p_rows: batch });
    staged += batch.length;
    batch = [];
    if (!DRY) await setRun({ cursor_line: line });
    if (staged % 20000 < CHUNK) log(`staged ${staged.toLocaleString()} of about 101,000`);
  };

  for await (const raw of rl) {
    line++;
    if (line <= resumeFrom) continue;
    const s = raw.trim().replace(/,$/, '');
    if (!s || s === '[' || s === ']') continue;
    let card;
    try {
      card = JSON.parse(s);
    } catch {
      continue; // one malformed line is not worth failing a sweep over
    }
    const row = stagedPriceFrom(card);
    if (!row) {
      notPaper++;
      continue;
    }
    for (const k of PRICE_KEYS) if (row[k] !== null) held[k] = (held[k] ?? 0) + 1;
    batch.push(row);
    if (batch.length >= CHUNK) await flush();
  }
  await flush();

  log(`read ${line.toLocaleString()} lines in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  log(`staged ${staged.toLocaleString()} paper printings with a price, skipped ${notPaper.toLocaleString()}`);
  log('printings carrying each price:', JSON.stringify(held));

  if (DRY) {
    log('dry run: nothing written');
    return;
  }

  const before = await bytes();
  const applied = await rpc('apply_bulk_price_sweep', { p_date: DATE });
  const r = Array.isArray(applied) ? applied[0] : applied;
  const after = await bytes();

  /* COMPLETION PATH. cursor_line is cleared here and only here. A done run that
     still holds a cursor is reported by price_sweep_health as a fault, because
     it means this line never ran. */
  const added = after !== null && before !== null ? after - before : null;
  await setRun({
    status: 'done',
    finished_at: new Date().toISOString(),
    cards_seen: staged,
    rows_written: r.rows_written,
    bytes_written: added,
    cursor_line: null,
    error: null,
  });

  // apply_bulk_price_sweep clears the bulk stage in the same call that applies it.

  const ms = Date.now() - t0;
  const moved = ((r.rows_written / Math.max(staged, 1)) * 100).toFixed(2);
  log('--------------------------------------------------------------');
  log(`date            ${DATE}`);
  log(`cards seen      ${staged.toLocaleString()}`);
  log(`rows written    ${r.rows_written.toLocaleString()}  (${moved}% of cards earned a row)`);
  log(`new cards       ${r.keys_added.toLocaleString()}`);
  if (added !== null) {
    log(`bytes added     ${added.toLocaleString()}  (${(added / Math.max(r.rows_written, 1)).toFixed(1)} per row)`);
    log(`projected year  ${((added * 365) / 1073741824).toFixed(2)} GB at this rate`);
  }
  log(`duration        ${(ms / 1000).toFixed(1)}s`);
  log('--------------------------------------------------------------');

  await heartbeat(true, {
    date: DATE,
    source: 'scryfall_bulk',
    bulk_updated_at: entry.updated_at,
    cards_seen: staged,
    rows_written: r.rows_written,
    keys_added: r.keys_added,
    bytes_added: added,
    seconds: Math.round(ms / 1000),
  });
}

async function bytes() {
  try {
    const r = await rpc('price_history_bytes', {});
    return typeof r === 'number' ? r : null;
  } catch {
    return null;
  }
}

async function getJson(u) {
  const r = await fetch(u, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${u} returned ${r.status}`);
  return r.json();
}

main().catch(async (e) => {
  const message = e instanceof Error ? e.message : String(e);
  console.error('[prices] FAILED:', message);
  // Record it in both places. A sweep that stops silently already cost this
  // project six months. The cursor is deliberately left where it is.
  try {
    await setRun({ status: 'failed', finished_at: new Date().toISOString(), error: message.slice(0, 500) });
  } catch {
    /* already on stderr, and the exit code is non-zero */
  }
  await heartbeat(false, { date: DATE, error: message.slice(0, 500) });
  process.exit(1);
});
