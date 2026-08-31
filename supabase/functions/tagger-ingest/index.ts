/**
 * Ingest Scryfall Tagger's oracle tags.
 *
 * Derived from Scryfall, whose bulk endpoint publishes the Tagger project's
 * oracle tags. Tagger is community-maintained; attribution is required and
 * endorsement must not be implied. See docs/overhaul/DATA-SOURCES.md.
 *
 * ## Why an edge function and not a script
 *
 * The tables are `revoke insert` for anon and authenticated, deliberately: a
 * client that could write them could put any card in any category. The platform
 * hands an edge function the service key, which is the same reason
 * `facet-memo-fill` and `daily-price-capture` are functions rather than scripts,
 * and nobody working on this repo holds a service key.
 *
 * ## Why it is worth ingesting at all
 *
 * Measured before it was written: Tagger has tags for 99.9% of the cards our own
 * compiler produces no behavioural word for, at 6.0 tags each.
 *
 *     Ad Nauseam            ours: type:instant
 *                         theirs: burst draw, life for cards
 *     Drannith Magistrate   ours: type:creature sub:human sub:wizard
 *                         theirs: hate-nonhand-cast, prevent cast, hatebear
 *
 * It does NOT replace the compiler and must never be merged into
 * `card_facet_memo`. They answer different questions and only one can be
 * checked: the compiler produces `eff:draw` with a count of 2 from a parsed
 * record, Tagger produces "burst draw" from a person's reading. Separate tables
 * keep the provenance visible.
 *
 * ## The run token
 *
 * Same gate as `facet-memo-fill`: a row in `facet_memo_runs`, which is
 * admin-only under RLS. Every edge function here is reachable with the
 * publishable key, so the key cannot be the gate and the token is.
 *
 * POST { run_token, refresh?: boolean }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/** Rows per upsert. PostgREST is fine far above this; the CPU budget is not. */
const CHUNK = 4000;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  let body: { run_token?: string; refresh?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* an empty body is a caller error, caught by the token check below */
  }

  if (!body.run_token) return json({ error: 'run_token required' }, 401);
  const { data: run } = await db
    .from('facet_memo_runs')
    .select('run_token')
    .eq('run_token', body.run_token)
    .maybeSingle();
  if (!run) return json({ error: 'unknown run_token' }, 403);

  /* ------------------------------------------------------------ download -- */

  const index = await (
    await fetch('https://api.scryfall.com/bulk-data', {
      headers: { 'User-Agent': 'DeckMatrix/1.0', Accept: 'application/json' },
    })
  ).json();
  const entry = (index.data ?? []).find((d: { type: string }) => d.type === 'oracle_tags');
  if (!entry?.jsonl_download_uri) return json({ error: 'no oracle_tags in the bulk index' }, 502);

  const res = await fetch(entry.jsonl_download_uri, {
    headers: { 'User-Agent': 'DeckMatrix/1.0' },
  });
  if (!res.ok || !res.body) return json({ error: `download ${res.status}` }, 502);

  /* The file is gzipped JSONL. Decompressing as a stream keeps a 30 MB text
     blob off the heap all at once, which matters inside a worker. */
  const text = await new Response(
    res.body.pipeThrough(new DecompressionStream('gzip'))
  ).text();

  /* --------------------------------------------------------------- parse -- */

  const tags: Array<Record<string, unknown>> = [];
  const cardTags: Array<{ oracle_id: string; tag_id: string }> = [];

  for (const line of text.split('\n')) {
    if (!line) continue;
    let t: {
      id: string;
      slug: string;
      label?: string;
      description?: string;
      parent_ids?: string[];
      taggings?: Array<{ oracle_id?: string }>;
    };
    try {
      t = JSON.parse(line);
    } catch {
      continue;
    }
    /*
     * KEYED ON THE UUID, NOT THE SLUG. Scryfall's own Tags documentation:
     * "Do not treat tag slugs or labels as permanent identifiers in your
     * application. Use the id field (a stable UUID)." A slug rename would
     * orphan every tagging SILENTLY, which is the failure mode this project
     * keeps paying for.
     */
    tags.push({
      tag_id: t.id,
      slug: t.slug,
      label: t.label ?? t.slug,
      description: t.description ?? null,
      parent_ids: t.parent_ids ?? [],
      card_count: (t.taggings ?? []).length,
      synced_at: new Date().toISOString(),
    });
    for (const g of t.taggings ?? []) {
      if (g.oracle_id) cardTags.push({ oracle_id: g.oracle_id, tag_id: t.id });
    }
  }

  /* --------------------------------------------------------------- write -- */

  let tagRows = 0;
  for (let i = 0; i < tags.length; i += CHUNK) {
    const { error } = await db
      .from('scryfall_tags')
      .upsert(tags.slice(i, i + CHUNK), { onConflict: 'tag_id' });
    if (error) return json({ error: `tags: ${error.message}`, wrote: tagRows }, 500);
    tagRows += Math.min(CHUNK, tags.length - i);
  }

  let linkRows = 0;
  for (let i = 0; i < cardTags.length; i += CHUNK) {
    const { error } = await db
      .from('scryfall_card_tags')
      .upsert(cardTags.slice(i, i + CHUNK), { onConflict: 'oracle_id,tag_id' });
    if (error) return json({ error: `taggings: ${error.message}`, wrote: linkRows }, 500);
    linkRows += Math.min(CHUNK, cardTags.length - i);
  }

  return json({
    ok: true,
    source: entry.jsonl_download_uri,
    tags: tagRows,
    taggings: linkRows,
    cards: new Set(cardTags.map(c => c.oracle_id)).size,
  });
});
