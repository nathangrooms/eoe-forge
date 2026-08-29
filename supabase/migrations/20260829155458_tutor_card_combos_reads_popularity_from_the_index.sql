-- The first version of tutor_card_combos read every matching row of
-- meta_combos out of the heap just to sort 3,897 of them by popularity and keep
-- five. On the worst card in the catalogue, Ashnod's Altar, that timed out:
-- measured over HTTP with the anon key, 3.2 s against the 3 s statement_timeout
-- that role carries, so the combo answer for the most comboed card we hold was
-- the one answer that could never be given.
--
-- Popularity now comes out of an index that already carries the id, so the
-- sort never touches the heap and only the five rows that survive it are read
-- in full.
--
--   worst case, Ashnod's Altar, 3,897 combos
--     before   Nested Loop over meta_combos_pkey, heap fetches 3,897   9,515 ms cold / 64 ms warm / 3.2 s timeout over HTTP
--     after    Index Only Scan, heap fetches 692                       1,019 ms
--
-- Re-measured over HTTP with the anon key after this migration: 2.74 s cold,
-- 0.13 s warm, against the same 3 s timeout.
--
-- meta_combos holds 61,500 rows, so this index is small and cheap to maintain.
-- The database discipline note in CLAUDE.md is about the 28 indexes on `cards`,
-- a 255 MB table written by a full sync; this is not that.

create index if not exists meta_combos_id_popularity_idx
  on public.meta_combos (id, popularity desc nulls last);

analyze public.meta_combos;

create or replace function public.tutor_card_combos(
  p_oracle_id text,
  p_limit int default 5
)
returns table (
  combo_id text,
  popularity int,
  produces text[],
  mana_needed text,
  card_count int,
  template_count int,
  pieces text[],
  total_combos bigint
)
language sql
stable
parallel safe
set search_path = public
as $$
  with mine as materialized (
    select cc.combo_id
    from meta_combo_cards cc
    where cc.oracle_id = p_oracle_id
  ),
  -- id and popularity only, so this stays inside meta_combos_id_popularity_idx.
  top_ids as (
    select c.id
    from meta_combos c
    where c.id in (select combo_id from mine)
    order by c.popularity desc nulls last, c.id
    limit greatest(1, least(coalesce(p_limit, 5), 20))
  )
  select
    c.id,
    c.popularity,
    c.produces,
    c.mana_needed,
    c.card_count,
    c.template_count,
    (select array_agg(x.card_name order by x.card_name)
       from meta_combo_cards x where x.combo_id = c.id),
    (select count(*) from mine)
  from meta_combos c
  join top_ids t on t.id = c.id
  order by c.popularity desc nulls last, c.id;
$$;

comment on function public.tutor_card_combos(text, int) is
  'Top combos containing one card, ordered by how much the combo is played, with every piece named and the total number of combos that card appears in. Read only.';

revoke all on function public.tutor_card_combos(text, int) from public;
grant execute on function public.tutor_card_combos(text, int) to anon, authenticated, service_role;
