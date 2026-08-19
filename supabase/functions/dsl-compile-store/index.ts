/**
 * dsl-compile-store — writes VALIDATED results, and moves the run pointer.
 *
 * ## Why this is a second function and not a second branch of the first
 *
 * `dsl-compile-batch` calls the model. This one writes to the database. They are
 * deliberately separate deployments so that the thing which produces an answer
 * has no way to store one: every row in `llm_ability_compilations` had to pass
 * through the harness's five validation gates on the way here, and a single
 * function holding both capabilities is one refactor away from a shortcut that
 * skips them.
 *
 * It holds no API key and can spend nothing. Its only power is writing rows for
 * a run whose token the caller already has.
 *
 * ## The pointer
 *
 * `cursor` is the resume pointer: the oracle_id of the LAST row actually
 * written. `complete: true` is the completion path, and it sets `cursor` to NULL
 * unconditionally — never conditionally, never "if the caller passed one".
 *
 * That is the third of three defences against the bug that froze this project's
 * card sync for months. The other two are
 * `llm_compile_runs.completion_clears_the_cursor`, a CHECK constraint the
 * database will not let this function violate, and the test named "THE
 * COMPLETION PATH CLEARS THE POINTER" in `src/lib/cards/abilities/llm-validation.test.ts`.
 *
 * ## What this function does NOT prove, stated because the comment above is
 * ## easy to misread as a guarantee
 *
 * "Every row had to pass through the harness's five gates" describes the ONE
 * writer that exists today. It is not enforced here: `abilities` arrives as
 * opaque JSON and this function has no copy of the DSL validator. What IS
 * enforced is the set of invariants that can be checked without one, and they
 * are the ones the honesty guarantee rests on:
 *
 *   - a rejected row carries no abilities (and an accepted row must carry some);
 *   - `coverage` is not free-text; and
 *   - `coverage = 'full'` is refused when `unparsed` is non-empty, so "fully
 *     covered" can never be ASSERTED over text the writer admitted it dropped.
 *     `deriveCoverage()` computes exactly that relation, and both this check and
 *     the table's `full_coverage_means_nothing_unparsed` CHECK exist so a second
 *     writer cannot skip it.
 *
 * ANY future reader of `llm_ability_compilations` must still run
 * `validateAbilities()` from `src/lib/cards/abilities/validate.ts` over the
 * `abilities` column before handing it to the engine. Nothing in the app reads
 * this table today; the day something does, that call is the precondition.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const MAX_ROWS_PER_CALL = 200;

const STAGES = new Set(['accepted', 'transport', 'schema', 'verbatim', 'roundtrip', 'behaviour']);
const COVERAGES = new Set(['full', 'partial', 'manual', 'none']);

interface IncomingRow {
  oracle_id?: unknown;
  oracle_hash?: unknown;
  name?: unknown;
  model?: unknown;
  prompt_version?: unknown;
  raw?: unknown;
  abilities?: unknown;
  unparsed?: unknown;
  needs?: unknown;
  coverage?: unknown;
  accepted?: unknown;
  stage?: unknown;
  stage_detail?: unknown;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'service credentials not configured' }, 500);
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let body: {
    run_token?: string;
    rows?: IncomingRow[];
    cursor?: string | null;
    complete?: boolean;
    failed?: boolean;
    totals?: unknown;
    register_prompt?: { version?: string; label?: string; fingerprint?: string; system_prompt?: string };
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'body must be JSON' }, 400);
  }

  const runToken = String(body.run_token ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(runToken)) return json({ error: 'run_token required' }, 401);

  const { data: run, error: runErr } = await db
    .from('llm_compile_runs')
    .select('id, status, expires_at')
    .eq('run_token', runToken)
    .maybeSingle();
  if (runErr) return json({ error: 'run lookup failed' }, 500);
  if (!run) return json({ error: 'unknown run_token' }, 403);
  if (run.status !== 'running') return json({ error: `run is ${run.status}` }, 403);
  if (new Date(run.expires_at).getTime() < Date.now()) return json({ error: 'run token expired' }, 403);

  /* --------------------------------------------------- register a prompt */

  // Insert-only, and never an upsert. A prompt version that could be rewritten
  // would make every compilation row referencing it a false record of what was
  // actually asked. `on conflict do nothing` means re-registering an identical
  // version is a harmless no-op, which is what a resumed run does every time.
  if (body.register_prompt) {
    const p = body.register_prompt;
    const version = String(p.version ?? '');
    const systemPrompt = String(p.system_prompt ?? '');
    if (!version || !systemPrompt) return json({ error: 'register_prompt needs version and system_prompt' }, 400);
    if (systemPrompt.length > 200_000) return json({ error: 'system_prompt too long' }, 400);
    const { error } = await db
      .from('llm_prompt_versions')
      .upsert(
        {
          version,
          label: String(p.label ?? version),
          fingerprint: String(p.fingerprint ?? ''),
          system_prompt: systemPrompt,
        },
        { onConflict: 'version', ignoreDuplicates: true },
      );
    if (error) return json({ error: `prompt registration failed: ${error.message}` }, 500);
    return json({ registered: version });
  }

  /* ------------------------------------------------------------- rows */

  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length > MAX_ROWS_PER_CALL) return json({ error: `at most ${MAX_ROWS_PER_CALL} rows per call` }, 400);

  let written = 0;
  if (rows.length) {
    const prepared = [];
    for (const row of rows) {
      const oracleId = String(row.oracle_id ?? '');
      const stage = String(row.stage ?? '');
      if (!oracleId) return json({ error: 'every row needs an oracle_id' }, 400);
      if (!STAGES.has(stage)) return json({ error: `bad stage "${stage}" on ${oracleId}` }, 400);
      const accepted = row.accepted === true;
      // The same invariant the table's CHECK constraints hold, refused here as
      // well so the caller gets a message instead of a Postgres error string.
      if (accepted !== (stage === 'accepted')) {
        return json({ error: `accepted and stage disagree on ${oracleId}` }, 400);
      }
      if (accepted && !Array.isArray(row.abilities)) {
        return json({ error: `accepted row ${oracleId} carries no abilities` }, 400);
      }
      if (!accepted && row.abilities != null) {
        return json({ error: `rejected row ${oracleId} must not carry abilities` }, 400);
      }
      const coverage = row.coverage == null ? null : String(row.coverage);
      if (coverage !== null && !COVERAGES.has(coverage)) {
        return json({ error: `bad coverage "${coverage}" on ${oracleId}` }, 400);
      }
      // COVERAGE IS COMPUTED, NEVER ASSERTED.
      //
      // `deriveCoverage()` returns 'full' only when nothing is unparsed and
      // nothing is manual. This function cannot re-run it (it has no DSL
      // validator), but it can enforce the half of the relation that decides
      // whether a card may ever be called fully covered: a row claiming 'full'
      // while admitting unparsed text is a row asserting coverage it does not
      // have, and that is precisely the dishonesty this pipeline exists to
      // prevent. Refused here so the caller gets a sentence, and refused again
      // by `full_coverage_means_nothing_unparsed` on the table so a caller that
      // never reaches this line cannot get past Postgres either.
      const unparsedRows = Array.isArray(row.unparsed) ? row.unparsed : [];
      if (coverage === 'full' && unparsedRows.length > 0) {
        return json(
          { error: `coverage 'full' with ${unparsedRows.length} unparsed clause(s) on ${oracleId} — coverage is derived, not declared` },
          400,
        );
      }

      prepared.push({
        oracle_id: oracleId,
        oracle_hash: String(row.oracle_hash ?? ''),
        name: row.name == null ? null : String(row.name),
        run_id: run.id,
        model: String(row.model ?? 'unknown'),
        prompt_version: String(row.prompt_version ?? 'unknown'),
        raw: row.raw ?? null,
        abilities: accepted ? row.abilities : null,
        unparsed: unparsedRows,
        needs: Array.isArray(row.needs) ? row.needs : [],
        coverage,
        accepted,
        stage,
        stage_detail: row.stage_detail ?? {},
        updated_at: new Date().toISOString(),
      });
    }

    const { error: upsertErr } = await db
      .from('llm_ability_compilations')
      .upsert(prepared, { onConflict: 'oracle_id' });
    if (upsertErr) return json({ error: `write failed: ${upsertErr.message}` }, 500);
    written = prepared.length;
  }

  /* ---------------------------------------------------------- pointer */

  if (body.complete === true) {
    // THE COMPLETION PATH. `cursor: null` is unconditional.
    const { error } = await db
      .from('llm_compile_runs')
      .update({
        status: 'complete',
        cursor: null,
        finished_at: new Date().toISOString(),
        totals: body.totals ?? null,
      })
      .eq('id', run.id);
    if (error) return json({ error: `completion failed: ${error.message}` }, 500);
    return json({ written, run: 'complete', cursor: null });
  }

  if (body.failed === true) {
    // A failed run KEEPS its pointer. That is the difference, and it is what
    // makes the run resumable rather than restarted from zero.
    const { error } = await db
      .from('llm_compile_runs')
      .update({ status: 'failed', finished_at: new Date().toISOString(), totals: body.totals ?? null })
      .eq('id', run.id);
    if (error) return json({ error: `failure record failed: ${error.message}` }, 500);
    return json({ written, run: 'failed' });
  }

  if (typeof body.cursor === 'string' && body.cursor) {
    const { error } = await db.from('llm_compile_runs').update({ cursor: body.cursor }).eq('id', run.id);
    if (error) return json({ error: `cursor update failed: ${error.message}` }, 500);
  }

  return json({ written, cursor: body.cursor ?? null });
});
