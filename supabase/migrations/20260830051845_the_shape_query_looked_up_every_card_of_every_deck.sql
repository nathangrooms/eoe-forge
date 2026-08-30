/*
 * `meta_deck_shape` could not finish on a busy database, and the reason is the
 * one this project keeps re-learning.
 *
 * The first version joined `meta_deck_cards` to `cards_unique` row by row, so
 * it did 15,865 index lookups into a 77 MB materialized view to answer one
 * question. Measured with EXPLAIN ANALYZE:
 *
 *     before   Nested Loop, 15,865 lookups, Buffers: shared hit=70,471
 *     after    Hash Left Join against 1,213 rows, Buffers: shared hit=8,328
 *
 * That is 8.5 times fewer buffers for the same answer. On an idle database the
 * first form ran in 132 ms and looked fine. Under the load this project
 * actually sees it took 3,383 ms against the 3 s `statement_timeout`, and Tutor
 * printed "I could not read the deck lists just now" at a player asking how
 * many lands a Commander deck runs. Buffers are the honest measure here and
 * wall clock is not, because wall clock says whatever the neighbours are doing.
 *
 * TWO CHANGES, AND THE SECOND ONE IS THE WHOLE FIX.
 *
 * One. The kind is read off `tags` rather than off `type_line`. Checked before
 * relying on it: `tags @> '{land}'` and `type_line ilike '%Land%'` select the
 * same 1,213 rows, with zero cards tagged land that are not typed land. `tags`
 * carries a GIN index and a leading-wildcard ILIKE cannot use any index at all,
 * which is the same defect CLAUDE.md records on `findLandCandidates`.
 *
 * Two. `as materialized`. Without it Postgres inlines the CTE into the join and
 * goes straight back to looking up every card of every deck, which is exactly
 * what it did when this was written the obvious way. The keyword is what makes
 * the 1,213 rows get built once and hashed.
 *
 * A NULL TAG MUST NOT PRODUCE A ZERO. `tags @> array[null]` is null, not false,
 * so a tag question that arrived without a tag would have found nothing in
 * every deck and reported a confident median of zero. The guard is in `scoped`
 * rather than in the filter, so the deck count itself comes out empty and the
 * `having` floor refuses to publish anything at all.
 */

create or replace function public.meta_deck_shape(
  p_format text default 'commander',
  p_kind   text default 'tag',
  p_tag    text default null
)
returns table (
  decks_in_scope int,
  p10 numeric,
  median numeric,
  p90 numeric,
  lowest int,
  highest int
)
language sql
stable
security invoker
set search_path = public
as $$
  with scoped as (
    select d.id
    from public.meta_decks d
    where d.format = p_format
      and d.is_complete
      and d.total_cards = 100
      /* Nonsense in gives nothing out, rather than a median of zero. */
      and p_kind in ('land', 'creature', 'tag')
      and (p_kind <> 'tag' or p_tag is not null)
  ),
  counted as materialized (
    select c.oracle_id
    from public.cards_unique c
    where c.tags @> array[
            case p_kind
              when 'land' then 'land'
              when 'creature' then 'creature'
              else p_tag
            end
          ]::text[]
      /* A land that ramps is a land first. Counting it in both answers would
         make the two numbers overlap without either of them saying so. */
      and (p_kind = 'land' or not (c.tags @> array['land']::text[]))
  ),
  per_deck as (
    select s.id,
           coalesce(sum(
             case when x.oracle_id is not null then mdc.quantity else 0 end
           ), 0) as n
    from scoped s
    join public.meta_deck_cards mdc
      on mdc.deck_id = s.id and mdc.board = 'main'
    left join counted x
      on x.oracle_id = mdc.oracle_id
    group by s.id
  )
  select count(*)::int,
         percentile_cont(0.1) within group (order by n),
         percentile_cont(0.5) within group (order by n),
         percentile_cont(0.9) within group (order by n),
         min(n)::int,
         max(n)::int
  from per_deck
  having count(*) >= 30;
$$;
