/**
 * dsl-compile-batch — the only place in this pipeline that talks to a model.
 *
 * ## What it is, and what it deliberately is not
 *
 * It is a BATCH tool. It exists so a one-time pass over the catalogue can be
 * cached in Postgres forever and re-run only for cards whose oracle text moved.
 * Nothing in the DeckMatrix app calls it, and nothing in the app may ever call
 * it: the scanner's per-request vision model is being removed for cost, and
 * reintroducing a per-request model call through a different door would be the
 * same mistake with a different name.
 *
 * As of 19 Aug 2026 the app does not read `llm_ability_compilations` either —
 * `abilitiesFor()` compiles oracle text and consults no table — so no model
 * output reaches a game today. The preconditions for the first reader are
 * written at the top of `scripts/coverage/llm/compile.ts`.
 *
 * It does NOT validate. It returns exactly what the model said, with the token
 * counts, and the harness decides what survives. Keeping generation and
 * validation in different processes is what stops "the thing that produced the
 * answer" from also being "the thing that graded it".
 *
 * ## Where the prompt lives, and why it is not in this file
 *
 * The system prompt is read from `llm_prompt_versions`, keyed by a label plus a
 * fingerprint of its own text. Two reasons, in order of importance:
 *
 *   1. **Provenance.** Every compiled row records the key, so "which exact words
 *      produced this answer" is a join. A prompt edited without its label being
 *      bumped still lands under a different key, because the key contains the
 *      hash of the text.
 *   2. A prompt kept inside the function can only be improved by redeploying the
 *      function, which quietly makes deploy cost the limit on how well the prompt
 *      is tuned against measured failures.
 *
 * The table is insert-only and enforced so by a trigger. A row that could be
 * edited after the fact would make every compilation referencing it a lie.
 *
 * ## Authorisation, without a password and without a new secret
 *
 * The function is reachable with the project's publishable key like every other
 * function here, so the key alone cannot be the gate. The gate is a run token: a
 * uuid on a row in `llm_compile_runs`, a table under admin-only RLS. A caller
 * must present a token whose run is still `running`, has not expired, and is
 * under its `max_calls` budget. Every call charges the budget BEFORE the model is
 * called, so a leaked token can burn at most the budget its owner chose.
 *
 * A token holder can point a run at any registered prompt version, and that is
 * deliberate: they could already spend the whole budget on cards of their
 * choosing, so the blast radius is unchanged, and it is bounded by `max_calls`.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Batches larger than this stop being "small bulks" and start losing cards silently. */
const MAX_CARDS_PER_CALL = 25;
/** A single card's oracle text is never near this; a body that is, is not oracle text. */
const MAX_ORACLE_CHARS = 4000;

const ALLOWED_MODELS = new Set([
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.5-pro',
]);

interface PromptCard {
  oracle_id: string;
  name?: string;
  type_line?: string;
  mana_cost?: string;
  oracle_text: string;
  power?: string;
  toughness?: string;
  layout?: string;
}

/**
 * The user turn: just the cards, as compact JSON. The grammar lives in the system
 * turn, which is the part that gets cached and versioned.
 */
function buildUserPrompt(cards: readonly PromptCard[]): string {
  const body = cards.map((c) => ({
    oracle_id: c.oracle_id,
    name: c.name,
    type_line: c.type_line,
    mana_cost: c.mana_cost || undefined,
    power: c.power || undefined,
    toughness: c.toughness || undefined,
    layout: c.layout || undefined,
    oracle_text: c.oracle_text,
  }));
  return `Compile these ${cards.length} cards. Return one result per card, in order.\n\n${JSON.stringify(body, null, 1)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return json({ error: 'LOVABLE_API_KEY is not configured' }, 500);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'service credentials not configured' }, 500);
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let body: { run_token?: string; cards?: PromptCard[]; model?: string; prompt_key?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'body must be JSON' }, 400);
  }

  const runToken = String(body.run_token ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(runToken)) return json({ error: 'run_token required' }, 401);

  const cards = Array.isArray(body.cards) ? body.cards : [];
  if (!cards.length) return json({ error: 'cards required' }, 400);
  if (cards.length > MAX_CARDS_PER_CALL) return json({ error: `at most ${MAX_CARDS_PER_CALL} cards per call` }, 400);
  for (const card of cards) {
    if (!card?.oracle_id || typeof card.oracle_text !== 'string') {
      return json({ error: 'every card needs oracle_id and oracle_text' }, 400);
    }
    if (card.oracle_text.length > MAX_ORACLE_CHARS) return json({ error: 'oracle_text too long' }, 400);
  }

  /* ---------------------------------------------------------------- gate */

  const { data: run, error: runErr } = await db
    .from('llm_compile_runs')
    .select('id, status, expires_at, max_calls, calls_made, model, prompt_version')
    .eq('run_token', runToken)
    .maybeSingle();

  if (runErr) return json({ error: 'run lookup failed' }, 500);
  if (!run) return json({ error: 'unknown run_token' }, 403);
  if (run.status !== 'running') return json({ error: `run is ${run.status}` }, 403);
  if (new Date(run.expires_at).getTime() < Date.now()) return json({ error: 'run token expired' }, 403);
  if (run.calls_made >= run.max_calls) return json({ error: 'run call budget exhausted', budget: run.max_calls }, 429);

  const model = String(body.model ?? run.model ?? 'google/gemini-2.5-flash');
  if (!ALLOWED_MODELS.has(model)) return json({ error: `model not allowed: ${model}` }, 400);

  /* -------------------------------------------------------------- prompt */

  const promptKey = String(body.prompt_key ?? run.prompt_version ?? '');
  if (!promptKey) return json({ error: 'prompt_key required' }, 400);
  const { data: prompt, error: promptErr } = await db
    .from('llm_prompt_versions')
    .select('version, system_prompt')
    .eq('version', promptKey)
    .maybeSingle();
  if (promptErr) return json({ error: 'prompt lookup failed' }, 500);
  if (!prompt?.system_prompt) {
    return json({ error: `prompt version not registered: ${promptKey}` }, 400);
  }

  // Charge the budget BEFORE spending it. A crash after the model call would
  // otherwise leave the spend unrecorded, and an unrecorded spend is how a
  // budget stops being a budget.
  const { error: chargeErr } = await db
    .from('llm_compile_runs')
    .update({ calls_made: run.calls_made + 1 })
    .eq('id', run.id)
    .eq('calls_made', run.calls_made); // optimistic: two callers cannot both charge the same slot
  if (chargeErr) return json({ error: 'could not charge run budget' }, 500);

  /* ---------------------------------------------------------------- model */

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: prompt.system_prompt },
          { role: 'user', content: buildUserPrompt(cards) },
        ],
        // Compilation is not a creative task. Any nonzero temperature buys
        // variety in a place where variety is only ever a wrong answer.
        temperature: 0,
        max_tokens: 8000,
        response_format: { type: 'json_object' },
      }),
    });
  } catch (err) {
    return json({ error: `gateway unreachable: ${(err as Error).message}` }, 502);
  }

  if (!res.ok) {
    const detail = await res.text();
    const status = res.status === 429 || res.status === 402 ? res.status : 502;
    return json({ error: `gateway ${res.status}`, detail: detail.slice(0, 500) }, status);
  }

  const ai = await res.json();
  const content: string = ai?.choices?.[0]?.message?.content ?? '';
  const usage = ai?.usage ?? {};
  const promptTokens = Number(usage.prompt_tokens ?? 0);
  const completionTokens = Number(usage.completion_tokens ?? 0);

  // Accumulate token counters. Read-modify-write is fine here because the
  // harness is serial and these are reporting figures; the budget above is the
  // thing that must not race, and it does not.
  const { data: fresh } = await db
    .from('llm_compile_runs')
    .select('prompt_tokens, completion_tokens, cards_requested')
    .eq('id', run.id)
    .maybeSingle();
  if (fresh) {
    await db
      .from('llm_compile_runs')
      .update({
        prompt_tokens: Number(fresh.prompt_tokens ?? 0) + promptTokens,
        completion_tokens: Number(fresh.completion_tokens ?? 0) + completionTokens,
        cards_requested: Number(fresh.cards_requested ?? 0) + cards.length,
      })
      .eq('id', run.id);
  }

  return json({
    model,
    prompt_version: prompt.version,
    raw: content,
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
    latency_ms: Date.now() - started,
    calls_made: run.calls_made + 1,
    max_calls: run.max_calls,
  });
});
