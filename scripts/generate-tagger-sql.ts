/**
 * Compiles `src/lib/cards/tagger.ts` into the Postgres migration that classifies
 * the `cards` table.
 *
 * There are necessarily two runtimes for the same rules — the browser needs to
 * tag a card it just pulled from Scryfall, the database needs to tag 34,000 rows
 * without shipping them to a client — and two hand-written copies of 60 regex
 * rules would drift within a week. So the TypeScript rule tree is the only
 * source of truth and the SQL is generated from it.
 *
 * Usage (Node 22.6+, type stripping):
 *   node --experimental-strip-types scripts/generate-tagger-sql.ts > out.sql
 *
 * Regenerate whenever TAG_RULES changes, then apply the migration and re-run
 * `public.retag_cards_batch` until it reports zero remaining.
 */

import {
  TAG_RULES,
  assertPortablePatterns,
  type TagCondition,
} from '../src/lib/cards/tagger.ts';

assertPortablePatterns();

/** Single-quote escaping for a SQL string literal. */
const lit = (s: string): string => `'${s.replace(/'/g, "''")}'`;

/**
 * Collapses `a ~ p1 or a ~ p2 or a ~ p3` into `a ~ '(?:p1|p2|p3)'`.
 *
 * Postgres keeps at most 32 compiled regexes in its cache (RE_CACHE_SIZE).
 * Emitted verbatim these rules use ~120 distinct patterns, so every row evicts
 * and recompiles nearly all of them: the first measurement was 24 ms per card,
 * 14 minutes to classify the catalogue. Merging each rule's alternatives into
 * one pattern per field brings the working set down far enough to stay cached.
 *
 * The rewrite is semantics-preserving: `x` matches `(?:a|b)` exactly when it
 * matches `a` or matches `b`. Each alternative is wrapped in a non-capturing
 * group because alternation binds loosest — without the wrap, `^a|b` would
 * anchor only the first branch. Both Postgres ARE and JavaScript support
 * `(?:...)`.
 */
function mergeAlternations(cond: TagCondition): TagCondition {
  if (cond.kind === 'not') return { kind: 'not', of: mergeAlternations(cond.of) };
  if (cond.kind === 'all') return { kind: 'all', of: cond.of.map(mergeAlternations) };
  if (cond.kind !== 'any') return cond;

  const children = cond.of.map(mergeAlternations);
  const byField = new Map<string, string[]>();
  const rest: TagCondition[] = [];

  for (const child of children) {
    if (child.kind === 'text' || child.kind === 'type' || child.kind === 'mana') {
      const bucket = byField.get(child.kind) ?? [];
      bucket.push(child.re);
      byField.set(child.kind, bucket);
    } else {
      rest.push(child);
    }
  }

  const merged: TagCondition[] = [];
  for (const [kind, patterns] of byField) {
    const re = patterns.length === 1 ? patterns[0] : `(?:${patterns.map((p) => `(?:${p})`).join('|')})`;
    merged.push({ kind, re } as TagCondition);
  }

  const of = [...merged, ...rest];
  return of.length === 1 ? of[0] : { kind: 'any', of };
}

function emit(cond: TagCondition): string {
  switch (cond.kind) {
    case 'text':
      return `v_text ~ ${lit(cond.re)}`;
    case 'type':
      return `v_type ~ ${lit(cond.re)}`;
    case 'mana':
      return `v_mana ~ ${lit(cond.re)}`;
    case 'kw':
      return `v_kw && array[${cond.of.map(lit).join(', ')}]::text[]`;
    case 'cmcLte':
      return `v_cmc <= ${cond.n}`;
    case 'cmcGte':
      return `v_cmc >= ${cond.n}`;
    case 'not':
      return `not (${emit(cond.of)})`;
    case 'any':
      return `(${cond.of.map(emit).join('\n         or ')})`;
    case 'all':
      return `(${cond.of.map(emit).join('\n        and ')})`;
  }
}

const ruleBlocks = TAG_RULES.map((rule) => {
  const tags = [rule.tag, ...(rule.also ?? [])];
  const note = rule.note ? `  -- ${rule.note.replace(/\s+/g, ' ').trim()}\n` : '';
  return `${note}  if ${emit(mergeAlternations(rule.when))}\n  then v_tags := v_tags || array[${tags.map(lit).join(', ')}]::text[]; end if;`;
}).join('\n\n');

// Reported on stderr so it does not land in the migration.
const patternCount = new Set<string>();
const walk = (c: TagCondition): void => {
  if (c.kind === 'text' || c.kind === 'type' || c.kind === 'mana') patternCount.add(`${c.kind}:${c.re}`);
  else if (c.kind === 'not') walk(c.of);
  else if (c.kind === 'any' || c.kind === 'all') c.of.forEach(walk);
};
TAG_RULES.forEach((r) => walk(mergeAlternations(r.when)));
process.stderr.write(`distinct compiled patterns after merge: ${patternCount.size} (Postgres caches 32)\n`);

process.stdout.write(`-- ============================================================================
-- Card role tagging.
--
-- GENERATED FROM src/lib/cards/tagger.ts BY scripts/generate-tagger-sql.ts.
-- Do not edit the derive_card_tags body by hand — edit TAG_RULES and regenerate,
-- or the browser tagger and the database tagger will disagree about what a card
-- does.
--
-- Before this migration \`cards.tags\` was mostly card TYPES: creature 18824,
-- removal 5536, sacrifice 66, recursion 23, and no role at all on Sol Ring. The
-- deck builder's role quotas and the "works well with" panel had nothing to read.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The classifier. Pure: same inputs, same output, no table access, so it is
-- IMMUTABLE and can be used in an index or a generated column later.
-- ---------------------------------------------------------------------------
create or replace function public.derive_card_tags(
  p_name       text,
  p_type_line  text,
  p_oracle_text text,
  p_keywords   text[],
  p_mana_cost  text,
  p_cmc        numeric,
  p_faces      jsonb
) returns text[]
language plpgsql
immutable
parallel safe
as $fn$
declare
  v_text  text;
  v_type  text;
  v_kw    text[];
  v_mana  text;
  v_cmc   numeric := coalesce(p_cmc, 0);
  v_tags  text[] := '{}'::text[];
  v_names text[];
  v_name  text;
begin
  -- ---- oracle text -------------------------------------------------------
  -- 802 rows carry a null oracle_text and a populated \`faces\`: every transform,
  -- modal DFC, split and adventure card. Reading only the top level would
  -- classify all of them as blank.
  v_text := lower(coalesce(p_oracle_text, ''));

  if p_faces is not null and jsonb_typeof(p_faces) = 'array' then
    v_text := v_text || E'\\n' || coalesce((
      select string_agg(lower(coalesce(f.value ->> 'oracle_text', '')), E'\\n' order by f.ordinality)
      from jsonb_array_elements(p_faces) with ordinality as f(value, ordinality)
    ), '');
  end if;

  -- Oracle text refers to the card by name ("Blasphemous Act deals 13 damage to
  -- each creature") and names contain trigger words, so every name form is
  -- replaced with a placeholder. Longest first, so a face name that is a prefix
  -- of the full name cannot shadow it.
  v_names := array(
    select n from (
      select lower(p_name) as n
      union all
      select trim(both from x) from unnest(string_to_array(lower(coalesce(p_name, '')), ' // ')) as x
      union all
      select lower(f.value ->> 'name')
      from jsonb_array_elements(case when jsonb_typeof(p_faces) = 'array' then p_faces else '[]'::jsonb end) as f(value)
    ) s
    where n is not null and length(n) >= 3
    group by n
    order by length(n) desc
  );

  foreach v_name in array coalesce(v_names, '{}'::text[]) loop
    v_text := replace(v_text, v_name, '~');
  end loop;

  -- Reminder text is not rules the card imposes on the game — Smothering
  -- Tithe's Treasure reminder would otherwise make every Treasure producer a
  -- sacrifice outlet and a mana rock.
  v_text := regexp_replace(v_text, '\\([^)]*\\)', ' ', 'g');
  -- Oracle text mixes U+2019 and ASCII apostrophes by vintage; dropping both
  -- lets one pattern match "can't", "cant" and "can’t".
  v_text := regexp_replace(v_text, '[’''\`]', '', 'g');
  v_text := regexp_replace(v_text, '[ \\t]+', ' ', 'g');

  -- ---- type line ---------------------------------------------------------
  v_type := lower(coalesce(p_type_line, ''));
  if p_faces is not null and jsonb_typeof(p_faces) = 'array' then
    v_type := v_type || coalesce((
      select string_agg(' // ' || lower(coalesce(f.value ->> 'type_line', '')), '' order by f.ordinality)
      from jsonb_array_elements(p_faces) with ordinality as f(value, ordinality)
    ), '');
  end if;
  v_type := translate(v_type, '—–', '--');

  -- ---- keywords / mana ---------------------------------------------------
  v_kw := coalesce(array(select lower(k) from unnest(coalesce(p_keywords, '{}'::text[])) as k), '{}'::text[]);
  v_mana := lower(coalesce(p_mana_cost, ''));

  -- ---- rules -------------------------------------------------------------
${ruleBlocks}

  -- Sorted with the C collation so the array is byte-for-byte identical to what
  -- the TypeScript tagger's Array.sort() produces, which is what the parity
  -- check compares.
  return coalesce((select array_agg(tg order by tg collate "C") from (select distinct unnest(v_tags) as tg) d), '{}'::text[]);
end;
$fn$;

comment on function public.derive_card_tags(text, text, text, text[], text, numeric, jsonb) is
  'Deterministic MTG role classifier. Generated from src/lib/cards/tagger.ts by scripts/generate-tagger-sql.ts — do not hand-edit.';

-- ---------------------------------------------------------------------------
-- Keep tags correct on write, so a newly synced card is tagged on arrival
-- whatever wrote it. Recomputation is skipped when nothing the classifier reads
-- has changed, which keeps a price-only upsert cheap and makes the bulk retag
-- below a single pass rather than a double one.
-- ---------------------------------------------------------------------------
create or replace function public.cards_apply_role_tags()
returns trigger
language plpgsql
as $trg$
begin
  if tg_op = 'INSERT'
     or new.tags is null
     or new.name        is distinct from old.name
     or new.type_line   is distinct from old.type_line
     or new.oracle_text is distinct from old.oracle_text
     or new.keywords    is distinct from old.keywords
     or new.mana_cost   is distinct from old.mana_cost
     or new.cmc         is distinct from old.cmc
     or new.faces       is distinct from old.faces
  then
    new.tags := public.derive_card_tags(
      new.name, new.type_line, new.oracle_text, new.keywords, new.mana_cost, new.cmc, new.faces
    );
  end if;
  return new;
end;
$trg$;

drop trigger if exists cards_apply_role_tags on public.cards;
create trigger cards_apply_role_tags
  before insert or update on public.cards
  for each row execute function public.cards_apply_role_tags();

-- ---------------------------------------------------------------------------
-- Re-runnable bulk retag, keyset-paginated on id so it never re-reads a page and
-- never runs long enough to hit a statement timeout. Call until \`remaining\` is
-- false.
-- ---------------------------------------------------------------------------
create or replace function public.retag_cards_batch(
  p_limit integer default 2000,
  p_after text default ''
) returns table(scanned integer, changed integer, last_id text, remaining boolean)
language plpgsql
as $fn$
declare
  v_scanned integer := 0;
  v_changed integer := 0;
  v_last    text := p_after;
begin
  with page as (
    select c.id, c.name, c.type_line, c.oracle_text, c.keywords, c.mana_cost, c.cmc, c.faces, c.tags
    from public.cards c
    where c.id > p_after
    order by c.id
    limit p_limit
  ), computed as (
    select p.id,
           public.derive_card_tags(p.name, p.type_line, p.oracle_text, p.keywords, p.mana_cost, p.cmc, p.faces) as new_tags
    from page p
  ), written as (
    update public.cards c
       set tags = k.new_tags
      from computed k
     where c.id = k.id
       and c.tags is distinct from k.new_tags
    returning c.id
  )
  select (select count(*) from page), (select count(*) from written), (select max(id) from page)
    into v_scanned, v_changed, v_last;

  return query select v_scanned, v_changed, coalesce(v_last, p_after), v_scanned = p_limit;
end;
$fn$;

-- Retag an explicit set of ids. scryfall-sync calls this for exactly the rows it
-- just upserted, so tagging on arrival is visible in the sync code rather than
-- being an invisible side effect of a trigger.
create or replace function public.retag_cards(p_ids text[])
returns integer
language plpgsql
as $fn$
declare v_changed integer := 0;
begin
  with computed as (
    select c.id,
           public.derive_card_tags(c.name, c.type_line, c.oracle_text, c.keywords, c.mana_cost, c.cmc, c.faces) as new_tags
    from public.cards c
    where c.id = any(p_ids)
  ), written as (
    update public.cards c
       set tags = k.new_tags
      from computed k
     where c.id = k.id
       and c.tags is distinct from k.new_tags
    returning c.id
  )
  select count(*) into v_changed from written;
  return v_changed;
end;
$fn$;

grant execute on function public.derive_card_tags(text, text, text, text[], text, numeric, jsonb) to authenticated, anon, service_role;
grant execute on function public.retag_cards_batch(integer, text) to service_role;
grant execute on function public.retag_cards(text[]) to service_role;
`);
