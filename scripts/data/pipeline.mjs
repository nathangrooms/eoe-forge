#!/usr/bin/env node
/**
 * The data pipeline runner.
 *
 * GitHub Actions is the scheduler; this is what it runs. Everything here talks
 * to Supabase over PostgREST with the service role key, which never appears in
 * output: every line printed goes through scrub() first.
 *
 * Why a script rather than curl in the YAML: these jobs are loops with
 * conditions (call until done, poll until finished, back off when the database
 * is busy), and a loop written in YAML is a loop nobody can run locally to see
 * what it does. This file runs the same way on a laptop as it does in CI.
 *
 * Usage:
 *   node scripts/data/pipeline.mjs price-snapshot [--batch 1000] [--max-ticks 400]
 *   node scripts/data/pipeline.mjs collection-value
 *   node scripts/data/pipeline.mjs cards-supervise [--minutes 90]
 *   node scripts/data/pipeline.mjs health [--json]
 *
 * Environment:
 *   SUPABASE_URL               https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  service role key, from GitHub repository secrets
 */

const URL_BASE = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ---------------------------------------------------------------------------
// Secret hygiene. Every print goes through this. A key that reaches a public
// build log is a key that has to be rotated across a live product.
// ---------------------------------------------------------------------------
function scrub(text) {
  let out = String(text);
  if (KEY) out = out.split(KEY).join('[service role key redacted]');
  // Anything shaped like a JWT, in case a payload echoes one back.
  out = out.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[jwt redacted]');
  return out;
}
const say = (...parts) => console.log(scrub(parts.join(' ')));
const warn = (...parts) => console.error(scrub(parts.join(' ')));

function requireEnv() {
  const missing = [];
  if (!URL_BASE) missing.push('SUPABASE_URL');
  if (!KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length) {
    warn(`Missing ${missing.join(' and ')}.`);
    warn('Set them as GitHub repository secrets: Settings, Secrets and variables, Actions.');
    warn('Never commit either value.');
    process.exit(78); // EX_CONFIG
  }
}

// ---------------------------------------------------------------------------
// PostgREST
// ---------------------------------------------------------------------------
const STATEMENT_TIMEOUT = '57014'; // Postgres: canceling statement due to statement timeout

async function rpc(fn, args = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const err = new Error(`${fn} failed: HTTP ${res.status} ${scrub(text).slice(0, 400)}`);
    err.status = res.status;
    err.code = body?.code;
    throw err;
  }
  return body;
}

async function invokeFunction(name, payload = {}) {
  const res = await fetch(`${URL_BASE}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${name} failed: HTTP ${res.status} ${scrub(text).slice(0, 400)}`);
  try { return JSON.parse(text); } catch { return text; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i === process.argv.length - 1) return fallback;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) ? n : process.argv[i + 1];
}

// ---------------------------------------------------------------------------
// price-snapshot
//
// This is NOT the daily sweep. scripts/prices/daily-sweep.mjs is, and it runs
// first: it streams Scryfall's bulk file and records every printing whose price
// moved. This step is the guarantee that sweep cannot give, because its gate
// treats every card the same: a card somebody owns whose price is flat would
// get no point for up to a month.
//
// So this walks only the cards a user owns, wants, plays or has listed, and
// records today's price for every one of them whether it moved or not. Both
// steps write through apply_price_sweep, so there is one definition of a price
// move and one writer.
//
// Every tick commits, so a run that dies at page 3 of 4 keeps its first 3. A
// tick that hits the database statement timeout rolls back whole and leaves the
// pointer where it was, so retrying with a smaller page is always safe.
// ---------------------------------------------------------------------------
async function priceSnapshot() {
  let batch = Number(arg('--batch', 500));
  const maxTicks = Number(arg('--max-ticks', 400));
  const started = Date.now();

  // --batch arrives from a text box on the Actions page. Say what is wrong here
  // rather than posting NaN and reading the database's exception back.
  if (!Number.isInteger(batch) || batch < 1 || batch > 5000) {
    throw new Error(`--batch must be a whole number from 1 to 5000. Got ${JSON.stringify(arg('--batch', 500))}.`);
  }

  say(`Recording today's price for every card somebody holds. Page size ${batch}.`);

  let ticks = 0;
  let waits = 0;
  let consecutiveTimeouts = 0;

  while (ticks < maxTicks) {
    let out;
    try {
      out = await rpc('price_snapshot_tick', { p_batch: batch });
      consecutiveTimeouts = 0;
    } catch (e) {
      const timedOut = e.code === STATEMENT_TIMEOUT || /statement timeout/i.test(e.message);
      if (!timedOut) throw e;
      consecutiveTimeouts += 1;
      if (batch <= 50 && consecutiveTimeouts >= 4) {
        throw new Error(
          'The database timed out four times in a row even at 50 cards a page. ' +
          'Something else is saturating it. Check for a catalogue sync or a vacuum in flight.'
        );
      }
      batch = Math.max(50, Math.floor(batch / 2));
      warn(`Database timed out on that page. Halving to ${batch} and retrying. The page rolled back, so nothing was half written.`);
      await sleep(3000 * consecutiveTimeouts);
      continue;
    }

    ticks += 1;

    if (out?.skipped) {
      // Someone else is mid write. Wait for them rather than passing quietly:
      // returning here would let the run go green without the guarantee.
      waits += 1;
      if (waits > 20) {
        throw new Error(
          `Still blocked after ${waits} attempts: ${out.skipped}. ` +
          'Check price_sweep_run for a run stuck in the running state.'
        );
      }
      say(`  waiting: ${out.skipped}`);
      ticks -= 1;
      await sleep(15_000);
      continue;
    }

    if (out.already_complete) {
      say(`Today is already covered: ${out.written_total} prices recorded across ${out.ticks} pages. Nothing to redo.`);
    } else {
      say(
        `  page ${String(ticks).padStart(3)}: ` +
        `saw ${out.scanned_this_tick}, recorded ${out.written_this_tick}, ` +
        `${out.written_total} recorded so far`
      );
    }

    if (out.done) {
      const secs = ((Date.now() - started) / 1000).toFixed(0);
      say(`Done in ${secs}s: ${out.scanned_total} cards looked at, ${out.written_total} prices recorded.`);
      break;
    }
  }

  if (ticks >= maxTicks) {
    throw new Error(`Stopped after ${maxTicks} pages without finishing. Raise --max-ticks or look at why pages are small.`);
  }

  // The assert. This is the whole point of the job: a card somebody owns, wants,
  // plays or has listed must have today's price on record.
  const cover = await rpc('price_snapshot_coverage', {});
  const want = cover.tier1_priced;
  const got = cover.tier1_captured_today;
  say('');
  say(`Cards people own, want, play or have listed: ${cover.tier1_ids}`);
  say(`  of those, known to the catalogue: ${cover.tier1_resolvable}`);
  say(`  of those, carrying a price:       ${want}`);
  say(`  captured today:                   ${got}`);
  say(`Prices recorded today, everything:  ${cover.rows_written_today}`);
  if (cover.tier1_ids > cover.tier1_resolvable) {
    say(`Note: ${cover.tier1_ids - cover.tier1_resolvable} references point at a card id the catalogue does not have. They cannot be priced by anything.`);
  }

  if (got < want) {
    throw new Error(
      `${want - got} cards that somebody owns, wants, plays or has listed have no price on record for today. ` +
      'That is the number this product reports back to people, so this run counts as failed. ' +
      'Re-running this job is safe and will finish the day: the tick reopens a run whose coverage has gone short.'
    );
  }

  // No heartbeat here on purpose. price_snapshot_tick already wrote this job's
  // row in pipeline_runs, with the real page count and the real number written.
  // pipeline_heartbeat would write the same row again keyed on the database's
  // current_date, which is a different day from this run's if the job crossed
  // midnight, and it would stamp that day succeeded before it had run. A log
  // that invents a successful day is the one thing this pipeline exists to
  // prevent.

  // Storage figures are commentary. They must not be able to fail a run whose
  // work is already done and asserted: price_history_stats is defined only in
  // the live database and in no migration, so a rebuilt database does not have
  // it. See DATA-PIPELINE.md section 8.
  try {
    const stats = await rpc('price_history_stats', {});
    say('');
    say(`History now: ${stats.points} points across ${stats.cards_with_history} cards ` +
        `of ${stats.catalogue_cards} in the catalogue, ${stats.distinct_days} days from ${stats.first_day} to ${stats.last_day}.`);
    say(`Storage: ${(Number(stats.bytes_total) / 1048576).toFixed(1)} MB, ${stats.bytes_per_point} bytes per point.`);
  } catch (e) {
    warn('');
    warn(`Could not read price_history_stats, so there are no storage figures below. The prices themselves are recorded and checked. ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// collection-value
// ---------------------------------------------------------------------------
async function collectionValue() {
  say('Capturing what every collection is worth today.');
  const out = await invokeFunction('capture-collection-value', {});
  say(`Result: ${scrub(JSON.stringify(out)).slice(0, 500)}`);
  await rpc('pipeline_heartbeat', {
    p_job: 'collection-value',
    p_ok: true,
    p_detail: typeof out === 'object' && out !== null ? out : { raw: String(out).slice(0, 200) },
  });
}

// ---------------------------------------------------------------------------
// cards-supervise
//
// Deliberately not a second trigger. pg_cron already starts the catalogue sync
// and already resumes a stalled one. If this job also fired a fresh sync it
// would start a second pass over a run in flight, and scryfall-sync keeps its
// resume pointer in a single row, so two passes would fight over it.
//
// So this job SUPERVISES: it makes sure a complete pass happened, resumes one
// that stopped, starts one only when nothing is running and nothing ran today,
// and fails loudly if the catalogue is still incomplete when it gives up.
// ---------------------------------------------------------------------------
async function cardsSupervise() {
  const minutes = Number(arg('--minutes', 90));
  const deadline = Date.now() + minutes * 60_000;

  const readStatus = async () => {
    const rows = await fetch(
      `${URL_BASE}/rest/v1/sync_status?id=eq.scryfall_cards&select=*`,
      { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } }
    ).then((r) => r.json());
    return rows?.[0] ?? null;
  };

  let s = await readStatus();
  if (!s) throw new Error('There is no sync_status row for scryfall_cards. The catalogue sync has never been set up.');

  const hasResumePointer = (row) => {
    try { return Boolean(JSON.parse(row.error_message || '{}').next_page_url); }
    catch { return false; }
  };

  const idleMinutes = (row) =>
    row.last_sync ? (Date.now() - new Date(row.last_sync).getTime()) / 60_000 : Infinity;

  const complete = (row) =>
    row.status !== 'running' && !hasResumePointer(row) &&
    row.total_records > 0 && row.records_processed >= row.total_records;

  if (complete(s) && idleMinutes(s) < 24 * 60) {
    say(`The catalogue is complete and was refreshed ${idleMinutes(s).toFixed(0)} minutes ago. Nothing to do.`);
    await rpc('pipeline_heartbeat', {
      p_job: 'scryfall-cards', p_ok: true,
      p_detail: { records: s.records_processed, total: s.total_records, action: 'none needed' },
    });
    return;
  }

  if (s.status === 'running' || hasResumePointer(s)) {
    say(`A pass is already part way through: ${s.records_processed} of ${s.total_records}. Not starting a second one.`);
    if (idleMinutes(s) > 10) {
      say('It has not moved for over ten minutes. Resuming it.');
      await rpc('resume_scryfall_sync_if_stalled', {});
    }
  } else {
    say('No pass has completed today and none is running. Starting one.');
    await rpc('trigger_scryfall_sync', { p_action: 'sync' });
  }

  let last = -1;
  while (Date.now() < deadline) {
    await sleep(60_000);
    s = await readStatus();
    if (!s) break;

    if (s.records_processed !== last) {
      say(`  ${s.records_processed} of ${s.total_records} cards, status ${s.status}`);
      last = s.records_processed;
    }

    if (complete(s)) {
      say(`Catalogue pass finished: ${s.records_processed} of ${s.total_records}.`);
      await rpc('pipeline_heartbeat', {
        p_job: 'scryfall-cards', p_ok: true,
        p_detail: { records: s.records_processed, total: s.total_records },
      });
      return;
    }

    if (idleMinutes(s) > 10) {
      say('  stalled for over ten minutes, resuming');
      await rpc('resume_scryfall_sync_if_stalled', {});
    }
  }

  throw new Error(
    `The catalogue pass did not finish inside ${minutes} minutes. ` +
    `It reached ${s?.records_processed} of ${s?.total_records}. ` +
    'It is resumable, so the next run continues from here, but somebody should look at why it is slow.'
  );
}

// ---------------------------------------------------------------------------
// health
//
// The watchdog. Silence is the failure this whole pipeline exists to prevent,
// so this exits non zero the moment anything is overdue, and the workflow turns
// that into an open issue.
// ---------------------------------------------------------------------------
async function health() {
  const rows = await rpc('pipeline_health', {});
  if (process.argv.includes('--json')) {
    say(JSON.stringify(rows, null, 2));
  } else {
    const pad = (v, n) => String(v ?? '').padEnd(n);
    say(pad('job', 20) + pad('state', 10) + pad('last success', 26) + pad('age', 10) + 'what it says');
    say('-'.repeat(110));
    for (const r of rows) {
      const state = !r.watched ? 'not watched' : r.ok ? 'ok' : 'OVERDUE';
      say(
        pad(r.job, 20) + pad(state, 10) +
        pad(r.last_success ? new Date(r.last_success).toISOString() : 'never', 26) +
        pad(r.age_hours === null ? '-' : `${r.age_hours}h`, 10) + r.detail
      );
    }
  }

  // The price sweep keeps its own log of missed days. Ask it too.
  try {
    const missed = await rpc('price_sweep_health', { p_lookback: 7 });
    if (Array.isArray(missed) && missed.length) {
      say('');
      say('Days in the last week where the price sweep did not land properly:');
      for (const m of missed) say(`  ${m.d}: ${m.case ?? m.reason ?? JSON.stringify(m)}`);
    }
  } catch (e) {
    warn(`Could not read price_sweep_health: ${e.message}`);
  }

  const broken = rows.filter((r) => r.watched && !r.ok);
  if (broken.length) {
    say('');
    warn(`${broken.length} job(s) overdue: ${broken.map((r) => r.job).join(', ')}`);
    process.exit(1);
  }
  say('');
  say('Every watched job is inside its window.');
}

// ---------------------------------------------------------------------------
const COMMANDS = {
  'price-snapshot': priceSnapshot,
  'collection-value': collectionValue,
  'cards-supervise': cardsSupervise,
  health,
};

const cmd = process.argv[2];
if (!cmd || !COMMANDS[cmd]) {
  warn(`Usage: node scripts/data/pipeline.mjs <${Object.keys(COMMANDS).join('|')}>`);
  process.exit(2);
}
requireEnv();
COMMANDS[cmd]().catch((e) => {
  warn(scrub(e.stack || e.message));
  process.exit(1);
});
