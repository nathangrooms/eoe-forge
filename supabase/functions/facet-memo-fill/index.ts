/**
 * facet-memo-fill — computes every card's behaviour facets once, into Postgres.
 *
 * ## Why this exists
 *
 * `public.card_facet_memo` has existed for a while and held ZERO ROWS.
 * Measured 2026-08-30: nothing wrote it and nothing read it. It is a designed
 * optimisation that was never wired up, and its absence is why the deck
 * generator fails.
 *
 *   Krenko   mono-red    HTTP 500 after  19s   statement timeout on the pool
 *   Teysa    two colours HTTP 500 after  17s   statement timeout on the pool
 *   Atraxa   four        HTTP 200 after  60s
 *   Najeela  five        546 resource limit after 114s
 *
 * `pipeline.ts` compiles facets from oracle text on every request, capped at
 * 6,000 cards, into a `Map` that lives on the module and dies with the
 * instance. Every measured run reports `cached: 0`. A five-colour pool is
 * roughly 100,000 facets computed from scratch inside one CPU budget, and the
 * budget loses. It also forces `oracle_text` into the pool query, which is
 * 4.93 MB on a five-colour pool, and that is most of why the query times out
 * while the nightly sync is saturating the database.
 *
 * Facets are a pure function of oracle text and the compiler's rules, so the
 * answer cannot change between requests. Computing them once turns the hot path
 * into an indexed read.
 *
 * ## Why an edge function and not a script
 *
 * `scripts/fill-facet-memo.mjs` does the same job and needs
 * `SUPABASE_SERVICE_ROLE_KEY`, which is why it was never run: nobody working on
 * this has held that key. An edge function is handed it by the platform, so the
 * work can be started by anyone who can create a run row, and creating a run
 * row is an admin act.
 *
 * ## The gate
 *
 * Same shape as `dsl-compile-batch`: a run token on a row in
 * `facet_memo_runs`, a table under admin-only RLS. Every edge function here is
 * reachable with the publishable key, so the key cannot be the gate. A caller
 * must present a token whose run is `running`, unexpired, and under budget.
 * The budget is charged BEFORE the work, because an uncharged crash is how a
 * budget stops being a budget.
 *
 * The worst a leaked token can do is fill a cache of derived public data with
 * correct values, bounded by `max_calls`. That is why this gate is simpler than
 * the one guarding model spend.
 *
 * ## Resumable, and bounded per call
 *
 * One call walks `cards_unique` by `oracle_id` from the run's cursor, computes
 * what is missing at the current compiler version, writes it, and advances the
 * cursor. Repeated calls converge. Nothing here runs long enough to hit the CPU
 * limit that this function exists to remove from somewhere else, which would be
 * a poor joke.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { facetsForCard } from './_lib/deck/recommend/behaviour.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/**
 * The compiler's version, which is the memo's cache key alongside the oracle id.
 *
 * BUMP THIS whenever the facet compiler's OUTPUT changes for cards it already
 * reads. A rule change that does not alter the output does not need it. Getting
 * this wrong is silent: the memo keeps serving answers from the previous
 * compiler and the generator ranks on stale facets, which looks exactly like
 * the generator being bad at its job.
 */
/*
 * Bumped 1 -> 2 on 30 Aug 2026. Four rules changed the OUTPUT for cards the
 * compiler already read: conditional mana (Command Tower, Arcane Signet),
 * scry and surveil, the subject carried across "A does X and does Y", and
 * "search for up to N". Every one of those alters facets on cards that already
 * had a memo row, which is exactly the case this constant exists for.
 */
/*
 * 2 -> 3, same day. The facet producer now reads what an ability COSTS and not
 * only what it costs in mana, so every sacrifice outlet in the format gained
 * `cost:sacrifice` and every tap ability gained `cost:tap`. That is an output
 * change on cards already read, which is what this constant is for.
 */
/*
 * 3 -> 4 on 31 Aug 2026. Seven rules, every one of which changes the facets of
 * cards that already have a memo row:
 *
 *   the Oxford comma in an object phrase   Farseek (23) and every basic-type fetch
 *   Cultivate's split destination          Cultivate (20), Kodama's Reach (37)
 *   tutors that leave the card on top      Vampiric (12), Enlightened, Mystical,
 *                                          Worldly, Sylvan
 *   additional cast costs                  Village Rites (200), Deadly Dispute,
 *                                          Crop Rotation, Big Score - 26 cards
 *                                          gaining cost:sacrifice / cost:discard
 *   "unless you control N other lands"     20 check lands
 *   "unless you have N opponents"          10 Commander duals
 *   the exile intent rules                 read by the commander plan, not here,
 *                                          but the same refill carries them
 *
 * Nothing here is optional: a reader on 3 and a writer on 4 is SILENT, and a
 * card reads as having no facets, which the ranker cannot tell apart from a
 * card that genuinely does nothing.
 */
/*
 * 4 -> 5, same day, second batch. Three more rules changed the output for cards
 * the compiler already read:
 *
 *   "you may play an additional land"    Exploration (300), Dryad of the
 *                                        Ilysian Grove (301), Oracle of Mul
 *                                        Daya (504), Azusa, Aesi, Gitrog
 *   reanimation written as "put ... from  Reanimate (56) and everything shaped
 *   A graveyard onto the battlefield"     like it
 *   the additional-cost marker            every card carrying one is `partial`
 *                                         now rather than `manual`
 */
/*
 * 5 -> 6, same day, third batch. One rule, and it changes output on cards the
 * compiler already read fully: `eff:extra-land-drop`, derived from the
 * max-lands-per-turn restriction, which is what makes Exploration and Azusa
 * count as ramp. Before it they compiled to `rec:full type:enchantment` and had
 * no role at all.
 */
/*
 * 6 -> 7, same day, fourth batch, and this one is the most consequential of the
 * four. Two facets were doing the work of four, and both splits came out of
 * reading a whole generated Meren deck card by card:
 *
 *   cost:sacrifice-self   "Sacrifice this artifact: draw a card" is not an
 *                         outlet. Vexing Bauble, Soul-Guide Lantern, Stone of
 *                         Erech, Hedron Archive and Sakura-Tribe Elder all
 *                         answered the aristocrats plan's loudest want while
 *                         eating only themselves, once.
 *   cost:cast-sacrifice   Village Rites and Deadly Dispute eat one creature
 *                         once. Ashnod's Altar and Viscera Seer are the engine
 *                         the deck cannot function without. `cost:` was
 *                         introduced to tell those apart and had stopped
 *                         being able to.
 *
 * `cost:sacrifice` now means the card eats something else, on demand, which is
 * what every consumer of the facet was written to mean.
 */
/*
 * 7 -> 8 on 31 Aug 2026. Graveyard hate is read, and it is read as its own
 * thing. "Exile all graveyards" and "exile each opponent's graveyard" had no
 * rule at all - a graveyard is a ZONE and the exile rule reads a phrase
 * describing an OBJECT - so Soul-Guide Lantern, Tormod's Crypt and Relic of
 * Progenitus produced nothing, and the generator put them in graveyard decks
 * because a card with no record cannot be scored as working against the plan
 * any more than for it.
 *
 * `eff:exile-graveyard` rather than `eff:exile`, because `ROLE_FACETS.removal`
 * reads the latter: reading these cards without splitting the verb turned every
 * piece of graveyard hate in the format into an ANSWER, which is worse than not
 * reading them, since it takes a removal slot from something that removes.
 */
/*
 * 13 -> 14, 3 Sep 2026. Counters the card puts on ITSELF are `eff:add-counters
 * -self` / `ctr:+1/+1-self` (Korvold and Animar stop planning as counters
 * decks); `mv:cheap`, `mv:big` and `pt:big` are read off the row; `eff:wheel`
 * is derived from draw + discard + scope:all + hand; an ability word is no
 * longer a subtype the card cares about (Prosper, Tome-Bound was Mystic
 * tribal); and the eight compiler rules from the 2 Sep workflow.
 */
/*
 * 14 -> 15, 3 Sep 2026. Seven shapes from the second workflow round:
 * `eff:bounce-own` (returning your OWN creature is not Cyclonic Rift),
 * `eff:impulse` (exile the top and play it), a pump sized by a creature's
 * power with `cares:power`, protection from a colour chosen on resolution,
 * the wheel read by the compiler rather than only by the Tagger, "unless
 * that player pays", and "cast without paying its mana cost". Plus
 * `trig:cast:targeting` from the previous batch, which the facet layer
 * emitted and the pool never saw.
 */
/*
 * 15 -> 16, same day. `eff:bounce-own` no longer counts a NON-CREATURE
 * returning itself: Rancor, Batterskull and Spine of Ish Sah were taking the
 * slots Chulane's "bounce your own creatures" job wanted.
 */
/*
 * 16 -> 17. A KEYWORD ACTION THAT MAKES A TOKEN IS A TOKEN MAKER.
 *
 * `investigate`, `living weapon`, `amass`, `incubate`, `afterlife`,
 * `fabricate`, `manifest`, `embalm`, `eternalize`, `myriad` and `squad` now
 * emit `eff:create-token`, and the six with a fixed token type also emit it
 * (`tok:clue`, `tok:germ`, `tok:army`, `tok:incubator`, `tok:spirit`,
 * `tok:servo`).
 *
 * Measured 4 Sep 2026: 1,052 cards say "create ... token" in their oracle text
 * and carry no `eff:create-token`, and these keywords account for 275 of them.
 * Tireless Tracker (rank 653) knew only about counters, Batterskull only about
 * equip, Urza's Saga only about searching, and none of the three was a token
 * maker to the engine.
 *
 * READERS STAY ON 16 UNTIL THE `cards_pool` MIGRATION RUNS. The memo holds both
 * versions - the primary key is (oracle_id, compiler_version) - so filling 17
 * cannot disturb anything reading 16. Bump the writer, refill, THEN move the
 * readers, and delete 16 only afterwards.
 */
const COMPILER_VERSION = 18;

/**
 * Cards read per call.
 *
 * CAPPED AT POSTGREST'S OWN LIMIT, and that is not a detail. This project's
 * `db-max-rows` is 1000, measured and recorded at the top of `catalog.ts`, so a
 * request for more silently returns 1000. The first version of this function
 * asked for 1500, got 1000, and concluded from "fewer rows than I asked for"
 * that it had reached the end of the catalogue. It reported `done: true` after
 * writing 1,000 of 33,032 cards and the run was marked finished.
 *
 * A completion test that reads a truncation as an ending is the same class of
 * bug as a count that does not match what is under it: nothing errors, and the
 * wrong answer looks exactly like the right one.
 */
const POSTGREST_MAX_ROWS = 1000;
const DEFAULT_BATCH = POSTGREST_MAX_ROWS;
const MAX_BATCH = POSTGREST_MAX_ROWS;

/** Rows per upsert. PostgREST is happy well above this; the network is not. */
const WRITE_CHUNK = 500;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'function is not configured' }, 500);

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'body must be JSON' }, 400);
  }

  const runToken = String(body.run_token ?? '').trim();
  if (!runToken) return json({ error: 'run_token required' }, 400);
  const batch = Math.min(MAX_BATCH, Math.max(1, Number(body.batch ?? DEFAULT_BATCH)));

  /* ------------------------------------------------------------------ gate */

  const { data: run, error: runErr } = await db
    .from('facet_memo_runs')
    .select('id, status, expires_at, max_calls, calls_made, cursor, written, scanned')
    .eq('run_token', runToken)
    .maybeSingle();

  if (runErr) return json({ error: 'run lookup failed' }, 500);
  if (!run) return json({ error: 'unknown run_token' }, 403);
  if (run.status !== 'running') return json({ error: `run is ${run.status}` }, 403);
  if (new Date(run.expires_at).getTime() < Date.now()) return json({ error: 'run token expired' }, 403);
  if (run.calls_made >= run.max_calls) {
    return json({ error: 'run call budget exhausted', budget: run.max_calls }, 429);
  }

  /* Charge before working, and charge optimistically so two callers cannot
     both take the same slot. */
  const { error: chargeErr, count: charged } = await db
    .from('facet_memo_runs')
    .update({ calls_made: run.calls_made + 1 }, { count: 'exact' })
    .eq('id', run.id)
    .eq('calls_made', run.calls_made);
  if (chargeErr || charged === 0) return json({ error: 'could not charge the run budget' }, 409);

  const startedAt = Date.now();

  /* ------------------------------------------------------------------ read */

  /* Keyset by oracle_id. An OFFSET walk re-reads everything it has already
     passed, and CLAUDE.md section 10d records what an unindexable ORDER BY did
     to the pool query: a sort of 31,829 rows against a statement timeout. */
  /*
   * TWO MODES, and the second one is what makes this schedulable.
   *
   * The walk above reads the catalogue in oracle_id order and skips what is
   * already computed. That is right for a first fill or a version bump, and it
   * is 34 calls whatever the size of the gap — so a nightly top-up for the 300
   * cards of a new set would read 33,032 rows to find them.
   *
   * `only_missing` asks Postgres for the gap directly, through
   * `public.cards_missing_facets`, which is an anti-join against the memo. One
   * call, and it converges because a card the compiler THROWS on is recorded
   * with empty facets rather than skipped (see the catch below); if it were
   * skipped it would be selected again every fifteen minutes forever.
   *
   * The cursor stays at '' in this mode on purpose. Rows leave the result as
   * they are written, so "the first N still missing" is a cursor that advances
   * itself, and one that could get ahead of an unwritable card would loop past
   * it and never converge.
   */
  const onlyMissing = body.only_missing === true;
  const { data: cards, error: readErr } = onlyMissing
    ? await db.rpc('cards_missing_facets', {
        p_version: COMPILER_VERSION,
        p_after: '',
        p_limit: batch,
      })
    : await db
        .from('cards_unique')
        .select(
          'oracle_id, name, type_line, oracle_text, mana_cost, cmc, keywords, colors, color_identity, faces, power, toughness, layout'
        )
        .gt('oracle_id', run.cursor)
        .order('oracle_id', { ascending: true })
        .limit(batch);

  if (readErr) return json({ error: `reading cards failed: ${readErr.message}` }, 500);
  if (!cards || cards.length === 0) {
    await db.from('facet_memo_runs').update({ status: 'done' }).eq('id', run.id);
    return json({
      done: true,
      cursor: run.cursor,
      scanned: run.scanned,
      written: run.written,
      message: 'the walk reached the end of the catalogue',
    });
  }

  const ids = cards.map((c) => c.oracle_id).filter(Boolean) as string[];

  /* What is already computed at THIS version, so a resumed run does not redo
     work and a version bump redoes all of it. */
  const already = new Set<string>();
  for (let i = 0; i < ids.length; i += 1000) {
    const slice = ids.slice(i, i + 1000);
    const { data: have } = await db
      .from('card_facet_memo')
      .select('oracle_id')
      .eq('compiler_version', COMPILER_VERSION)
      /* A row with no coverage recorded has not been through the CURRENT fill,
         so it is as much a gap as no row at all. This is what lets the coverage
         column backfill itself without a version bump: the facets did not
         change, so bumping would be a lie about the compiler and would rewrite
         33,032 rows to add a word. */
      .not('coverage', 'is', null)
      .in('oracle_id', slice);
    for (const row of have ?? []) already.add(row.oracle_id as string);
  }

  /* --------------------------------------------------------------- compile */

  const pending: Array<Record<string, unknown>> = [];
  const census: Record<string, number> = { compiler: 0, xmage: 0, none: 0 };
  let threw = 0;

  for (const card of cards) {
    const oracleId = card.oracle_id as string | null;
    if (!oracleId || already.has(oracleId)) continue;

    let facets: readonly string[] = [];
    let source = 'none';
    /*
     * The compiler's own verdict, kept rather than thrown away.
     *
     * `facetsForCard` has always returned it and this function has always
     * discarded it, so "how much of the catalogue do we read" could only be
     * answered by running a script over a SLICE. The compile has already
     * happened; storing the word costs nothing and turns the question into a
     * SELECT that is current for every card, including the ones printed next
     * week, maintained by the top-up that already runs.
     *
     * 'unknown' when the compiler threw, because that is not the same as
     * 'none': none means it read the card and found nothing, unknown means it
     * could not read it at all.
     */
    let coverage = 'unknown';
    try {
      const result = facetsForCard(card as never);
      facets = result.facets;
      source = result.source;
      coverage = result.coverage;
    } catch (_e) {
      /* A card the compiler throws on is RECORDED as having no facets rather
         than skipped. Skipping means every future run recompiles it and the
         walk never converges, which is a worse failure than an empty record. */
      threw += 1;
      facets = [];
      source = 'none';
    }
    census[source] = (census[source] ?? 0) + 1;

    pending.push({
      oracle_id: oracleId,
      facets,
      source,
      coverage,
      compiler_version: COMPILER_VERSION,
      computed_at: new Date().toISOString(),
    });
  }

  /* ----------------------------------------------------------------- write */

  let written = 0;
  for (let i = 0; i < pending.length; i += WRITE_CHUNK) {
    const chunk = pending.slice(i, i + WRITE_CHUNK);
    const { error: writeErr } = await db
      .from('card_facet_memo')
      /*
       * (card, VERSION), not card alone.
       *
       * With `oracle_id` on its own this upsert destroyed the row the readers
       * were still on, one card at a time, so the documented order — bump the
       * writer, refill, then move the readers — did the opposite of what it
       * claimed: the generator saw a growing hole for the whole 68 second
       * refill, and a card with no facets is indistinguishable from a card that
       * does nothing. The primary key is (oracle_id, compiler_version) now so
       * two versions coexist and the old one is deleted deliberately.
       */
      .upsert(chunk, { onConflict: 'oracle_id,compiler_version' });
    if (writeErr) {
      /* Advance the cursor only as far as what was actually written, so a
         partial failure is retried rather than skipped. */
      const safeCursor = i > 0 ? (pending[i - 1].oracle_id as string) : run.cursor;
      await db
        .from('facet_memo_runs')
        .update({
          cursor: safeCursor,
          written: run.written + written,
          scanned: run.scanned + cards.length,
          note: `write failed: ${writeErr.message}`.slice(0, 300),
        })
        .eq('id', run.id);
      return json({ error: `writing the memo failed: ${writeErr.message}`, written }, 500);
    }
    written += chunk.length;
  }

  /* In `only_missing` mode the cursor must not move: the query is "the first N
     cards still missing", which already advances as rows are written. Moving it
     would step past a card this call failed to write and leave a permanent
     hole that the next call could not see. */
  const cursor = onlyMissing ? run.cursor : (cards[cards.length - 1].oracle_id as string);
  /* Short page means the end of the catalogue, and `batch` can never exceed
     what PostgREST will return, so a short page cannot be a truncation. */
  const finished = cards.length < batch;

  await db
    .from('facet_memo_runs')
    .update({
      cursor,
      written: run.written + written,
      scanned: run.scanned + cards.length,
      status: finished ? 'done' : 'running',
      note: null,
    })
    .eq('id', run.id);

  return json({
    done: finished,
    scanned: cards.length,
    skipped: cards.length - pending.length,
    written,
    threw,
    census,
    cursor,
    totals: { scanned: run.scanned + cards.length, written: run.written + written },
    callsLeft: run.max_calls - (run.calls_made + 1),
    ms: Date.now() - startedAt,
  });
});
