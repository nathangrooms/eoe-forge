/*
 * "How many lands should I run in a commander deck?"
 *
 * Tutor refused that, and every question shaped like it, with the paragraph it
 * prints when it has no route at all. The number was in the building. We hold
 * 192 complete 100-card Commander lists in `meta_decks`, every card of every
 * one of them in `meta_deck_cards`, and the type line and role tags of every
 * card in `cards_unique`. Joining those three answers the question in 132 ms
 * on a warm cache, measured with EXPLAIN ANALYZE on 2026-08-30.
 *
 * WHY A FUNCTION AND NOT A QUERY IN THE EDGE FUNCTION
 * --------------------------------------------------
 * PostgREST cannot express a per-deck aggregate followed by a percentile over
 * the aggregates. Doing it in TypeScript means pulling 15,865 deck rows across
 * the wire on every question, which is exactly the shape of work that has
 * twice made this database unusable. One function, one plan, six numbers back.
 *
 * THE DENOMINATOR IS RETURNED, ALWAYS, AND A SMALL SCOPE RETURNS NOTHING
 * ---------------------------------------------------------------------
 * `decks_in_scope` is on every row so the caller can say what the number was
 * counted over, which is the rule the rest of the `meta_*` work already
 * follows. And `having count(*) >= 30` means a format we hold barely any lists
 * for produces NO ROW rather than a median of four decks dressed up as a
 * convention. Thirty is `meta_min_scope_decks()`, the same floor the inclusion
 * tables use.
 *
 * WHAT THE LISTS ACTUALLY ARE, so nobody reads more into the number than is
 * there: they are preconstructed decks and published lists, not tournament
 * results. That is a real and useful answer to "how many lands do published
 * Commander decks run". It is not a claim about what wins. The caller has to
 * say which one it is, and Tutor does.
 *
 * QUANTITY IS HONOURED AND THAT IS THE TRAP. `meta_deck_cards` holds one row
 * per distinct card with a `quantity`, so 30 basic Forests are ONE row. Summing
 * rows instead of quantities gives a land median of 22, which is wrong and
 * looks plausible. Every branch below sums `quantity`.
 *
 * LANDS ARE EXCLUDED FROM EVERY TAG COUNT. A land that ramps carries the
 * `ramp` tag, so counting it in both the land answer and the ramp answer would
 * have the two numbers overlap without saying so. "Nine ramp cards" here means
 * nine that are not lands, and the caller says that out loud.
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
  ),
  per_deck as (
    select s.id,
           coalesce(sum(
             case when (
                  (p_kind = 'land'
                   and c.type_line ilike '%Land%')
               or (p_kind = 'creature'
                   and c.type_line ilike '%Creature%'
                   and c.type_line not ilike '%Land%')
               or (p_kind = 'tag'
                   and p_tag is not null
                   and c.tags @> array[p_tag]::text[]
                   and c.type_line not ilike '%Land%')
             ) then mdc.quantity else 0 end
           ), 0) as n
    from scoped s
    join public.meta_deck_cards mdc
      on mdc.deck_id = s.id and mdc.board = 'main'
    join public.cards_unique c
      on c.oracle_id = mdc.oracle_id
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

comment on function public.meta_deck_shape(text, text, text) is
  'How many cards of one kind the complete 100-card lists we hold for a format run. p_kind is land, creature or tag; a tag also needs p_tag. Returns no row when fewer than 30 lists are in scope.';

revoke all on function public.meta_deck_shape(text, text, text) from public;
grant execute on function public.meta_deck_shape(text, text, text) to anon, authenticated, service_role;
