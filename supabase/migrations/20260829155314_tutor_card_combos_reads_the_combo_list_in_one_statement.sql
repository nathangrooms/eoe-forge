-- Tutor answers a card question from the catalogue, and one part of that answer
-- is "what does this card combo with". The combo list is two tables and the
-- join has to be ordered by how much the combo is played, which PostgREST
-- cannot do across a join.
--
-- Doing it from the function instead means reading every combo id the card
-- appears in and then asking about those ids. That breaks on the cards that
-- matter most: PostgREST caps a response at 1,000 rows, and Ashnod's Altar is
-- in 3,897 combos, so the function would silently see a quarter of them and
-- then claim the top three. A truncated list presented as the most played is a
-- fabricated answer, which is the one thing this work exists to stop.
--
-- So the join lives here, in one statement, the way the rest of the meta work
-- already does. Measured on the worst case in the catalogue (Ashnod's Altar,
-- 3,897 combos): 64 ms warm, 9.5 s on a completely cold cache, against the 8 s
-- statement_timeout the edge role carries. The caller treats a timeout as "the
-- combo list could not be read" and says so, rather than as "no combos".
--
-- Read only. It touches meta_combos and meta_combo_cards, which anon already
-- holds SELECT on, so it is deliberately NOT security definer: it grants
-- nothing the caller did not already have.
--
-- NOTE: this version was superseded the same day by
-- 20260829155458_tutor_card_combos_reads_popularity_from_the_index.sql, which
-- keeps the same signature and makes the sort index only. Both files are kept
-- because both were applied, in this order, and the version numbers here are
-- the ones the database recorded.

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
  top as (
    select c.id, c.popularity, c.produces, c.mana_needed, c.card_count, c.template_count
    from meta_combos c
    where c.id in (select combo_id from mine)
    order by c.popularity desc nulls last, c.id
    limit greatest(1, least(coalesce(p_limit, 5), 20))
  )
  select
    t.id,
    t.popularity,
    t.produces,
    t.mana_needed,
    t.card_count,
    t.template_count,
    (select array_agg(x.card_name order by x.card_name)
       from meta_combo_cards x where x.combo_id = t.id),
    (select count(*) from mine)
  from top t;
$$;

comment on function public.tutor_card_combos(text, int) is
  'Top combos containing one card, ordered by how much the combo is played, with every piece named and the total number of combos that card appears in. Read only.';

revoke all on function public.tutor_card_combos(text, int) from public;
grant execute on function public.tutor_card_combos(text, int) to anon, authenticated, service_role;
