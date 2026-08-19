-- `cards_unique` listed its columns one by one, and that went stale within the
-- hour: `cards.produced_mana` was added while this was being built, so a caller
-- that read `cards_unique` for a land's colours got "column does not exist".
--
-- The whole promise of this view is that it is a drop-in replacement for
-- `cards` with the duplicates removed. A hand-maintained column list cannot
-- keep that promise, because keeping it depends on whoever adds the next column
-- knowing this view exists.
--
-- `c.*` does not keep it automatically either: a materialized view freezes its
-- definition at creation, so a new column still needs a rebuild. What it does
-- do is make the rebuild a re-run of this file with nothing to edit, and it
-- makes the drift detectable rather than silent.
--
-- ⚠️ IF YOU ADD A COLUMN TO public.cards, RE-RUN THIS MIGRATION.
--    public.cards_unique_column_drift() returns what is missing; empty is healthy.
--
-- GIN indexes are created with fastupdate = off for the same reason `cards`
-- was changed: a pending-list merge landing on one unlucky write is the failure
-- mode that kept cancelling the catalogue load.

drop materialized view if exists public.cards_unique;

create materialized view public.cards_unique as
select distinct on (c.oracle_id)
  c.*,
  -- The only column `cards` does not have. Additive, so this stays a drop-in
  -- replacement, and it is what a card page needs to decide whether to offer an
  -- "other printings" control at all.
  count(*) over (partition by c.oracle_id)::integer as printings_count
from public.cards c
order by
  c.oracle_id,
  -- The deck optimiser's rule, copied rather than reinvented: cheapest USD
  -- wins, a priced printing beats an unpriced one, ties break on the lowest id.
  -- See deck-optimizer/_engine/deck/recommend/rank.ts `cheaper()`.
  -- Regex-guarded so one malformed price from upstream cannot fail a refresh.
  (case when c.prices->>'usd' ~ '^[0-9]+(\.[0-9]+)?$'
        then (c.prices->>'usd')::numeric end) asc nulls last,
  c.id asc;

comment on materialized view public.cards_unique is
  'One row per oracle_id: the cheapest priced printing, ties broken on lowest id. The default card source for search, commanders, suggestions, candidate pools and MTG Brain. Use public.cards where the individual printing is the subject. Adding a column to public.cards requires rebuilding this view.';

-- Required for REFRESH ... CONCURRENTLY, and the guarantee the design rests on:
-- the database will not let a second row for one oracle_id exist here.
create unique index cards_unique_oracle_id_key on public.cards_unique (oracle_id);

create index cards_unique_id_idx             on public.cards_unique (id);
create index cards_unique_name_idx           on public.cards_unique (name);
create index cards_unique_cmc_idx            on public.cards_unique (cmc);
create index cards_unique_set_code_idx       on public.cards_unique (set_code);
create index cards_unique_rarity_idx         on public.cards_unique (rarity);
create index cards_unique_legendary_idx      on public.cards_unique (is_legendary) where is_legendary = true;
create index cards_unique_edhrec_rank_idx    on public.cards_unique (edhrec_rank) where edhrec_rank is not null;

create index cards_unique_name_trgm_idx        on public.cards_unique using gin (name gin_trgm_ops)        with (fastupdate = off);
create index cards_unique_type_line_trgm_idx   on public.cards_unique using gin (type_line gin_trgm_ops)   with (fastupdate = off);
create index cards_unique_oracle_text_trgm_idx on public.cards_unique using gin (oracle_text gin_trgm_ops) with (fastupdate = off);
create index cards_unique_color_identity_idx   on public.cards_unique using gin (color_identity)           with (fastupdate = off);
create index cards_unique_tags_idx             on public.cards_unique using gin (tags)                     with (fastupdate = off);
-- The search's format filter is `legalities @> {"commander":"legal"}`, which
-- needs the whole-jsonb GIN, not the partial expression indexes below.
create index cards_unique_legalities_idx       on public.cards_unique using gin (legalities)               with (fastupdate = off);

-- The same seven partial legality indexes `cards` carries. The optimiser's
-- candidate pull is driven by exactly this predicate and knows the list by name
-- (INDEXED_FORMATS in the engine's query.ts), so it has to hold here too.
create index cards_unique_legal_commander_idx on public.cards_unique ((legalities->>'commander')) where (legalities->>'commander') = 'legal';
create index cards_unique_legal_legacy_idx    on public.cards_unique ((legalities->>'legacy'))    where (legalities->>'legacy')    = 'legal';
create index cards_unique_legal_modern_idx    on public.cards_unique ((legalities->>'modern'))    where (legalities->>'modern')    = 'legal';
create index cards_unique_legal_pauper_idx    on public.cards_unique ((legalities->>'pauper'))    where (legalities->>'pauper')    = 'legal';
create index cards_unique_legal_pioneer_idx   on public.cards_unique ((legalities->>'pioneer'))   where (legalities->>'pioneer')   = 'legal';
create index cards_unique_legal_standard_idx  on public.cards_unique ((legalities->>'standard'))  where (legalities->>'standard')  = 'legal';
create index cards_unique_legal_vintage_idx   on public.cards_unique ((legalities->>'vintage'))   where (legalities->>'vintage')   = 'legal';

-- Exactly the exposure `cards` already has. Its RLS policy is
-- "Cards are publicly readable" USING (true), so nothing becomes visible here
-- that was not visible before. A materialized view cannot carry RLS, which is
-- why this is safe only because the underlying data is already public. The
-- Supabase advisor flags it as `materialized_view_in_api`; that is expected and
-- revoking it would break search, commanders and every suggestion list.
grant select on public.cards_unique to anon, authenticated, service_role;

/**
 * Which columns `cards` has that `cards_unique` does not.
 *
 * Empty is healthy. Anything else means someone added a column and the view is
 * now missing it, so a caller reading the view for that column fails while the
 * same query against `cards` works.
 */
create or replace function public.cards_unique_column_drift()
returns text[]
language sql
stable
security definer
set search_path = public
as $fn$
  with cols as (
    select c.relname, a.attname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public' and c.relname in ('cards', 'cards_unique')
  )
  select coalesce(array_agg(attname order by attname), '{}')
  from (
    select attname from cols where relname = 'cards'
    except
    select attname from cols where relname = 'cards_unique'
  ) missing;
$fn$;

revoke all on function public.cards_unique_column_drift() from public, anon, authenticated;
grant execute on function public.cards_unique_column_drift() to service_role;
