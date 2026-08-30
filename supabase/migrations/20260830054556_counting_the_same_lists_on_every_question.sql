/*
 * "How many lands should I run?" still could not finish, and the reason is the
 * one CLAUDE.md section 10d already records about the generator's pool query:
 * a read that is fine on a quiet database is not a read that works.
 *
 * Measured over the endpoint on 2026-08-30, one call after another:
 *
 *     land       3,431 ms   57014 canceling statement due to statement timeout
 *     creature   3,200 ms   57014
 *     ramp       3,104 ms   57014
 *     land         498 ms   answered, because that one was warm now
 *     creature   3,032 ms   57014
 *
 * against a 3 s `statement_timeout`. Nothing is wrong with the query. It reads
 * 8,328 buffers, which is eight times better than the version before it, and it
 * still loses whenever the pages it wants are not already in memory and the
 * disk is busy with something else. A player asking the most common question in
 * the format got "I could not read the deck lists just now".
 *
 * SO IT IS NOT COMPUTED AT QUESTION TIME ANY MORE.
 *
 * The answer is 192 decks by about seventy shapes. That is 13,000 small rows
 * that never change unless new deck lists are ingested, and they were being
 * derived from scratch on every question out of a 77 MB materialized view.
 * `meta_deck_shape_counts` holds them, `meta_deck_shape` reads them, and the
 * whole answer is now one index scan over a table small enough to stay cached.
 *
 * ZEROS ARE STORED, and that is not an oversight. A Commander precon runs no
 * counterspells more often than not, and a median is a median of every deck in
 * scope including the ones that run none. Storing only the non-zero rows would
 * quietly change the denominator, which is the one thing the rest of the
 * `meta_*` work refuses to let happen.
 *
 * A TAG NOTHING RUNS HAS NO ROWS AT ALL, deliberately. The cross product is
 * built from the tags that actually appear on a card in one of these decks, so
 * a shape we hold no evidence about produces no row, the `having` floor refuses
 * to publish, and the caller says it does not hold enough lists. That is the
 * correct answer and it is not a zero.
 *
 * STALENESS IS BOUNDED AND HONEST. A deck ingested after the last rebuild is
 * not counted, and it is also not in `decks_in_scope`, so the denominator the
 * answer prints is always the number of lists the number was actually counted
 * over. Rebuild with `select public.rebuild_meta_deck_shape_counts();` after
 * any `meta_*` ingest, or after a change to how cards are tagged.
 */

create table if not exists public.meta_deck_shape_counts (
  deck_id     uuid    not null references public.meta_decks(id) on delete cascade,
  format      text    not null,
  /* 'land', 'creature' or 'tag'. A tag also carries its name; the other two
     carry the empty string so the primary key works without a nullable part. */
  kind        text    not null,
  tag         text    not null default '',
  n           integer not null,
  computed_at timestamptz not null default now(),
  primary key (deck_id, kind, tag)
);

create index if not exists meta_deck_shape_counts_lookup
  on public.meta_deck_shape_counts (format, kind, tag);

alter table public.meta_deck_shape_counts enable row level security;

drop policy if exists meta_deck_shape_counts_read on public.meta_deck_shape_counts;
create policy meta_deck_shape_counts_read
  on public.meta_deck_shape_counts for select to public using (true);

drop policy if exists meta_deck_shape_counts_write on public.meta_deck_shape_counts;
create policy meta_deck_shape_counts_write
  on public.meta_deck_shape_counts for all to service_role using (true) with check (true);

revoke insert, update, delete, truncate on public.meta_deck_shape_counts from anon, authenticated;

/* -------------------------------------------------------------------------- *
 * Building it
 * -------------------------------------------------------------------------- */

create or replace function public.rebuild_meta_deck_shape_counts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  written integer;
begin
  delete from public.meta_deck_shape_counts;

  with scoped as (
    select d.id, d.format
    from public.meta_decks d
    where d.is_complete and d.total_cards = 100
  ),
  /* Every card of every scoped deck, with what it is, read once. */
  used as (
    select mdc.deck_id, mdc.quantity, c.tags
    from scoped s
    join public.meta_deck_cards mdc
      on mdc.deck_id = s.id and mdc.board = 'main'
    join public.cards_unique c
      on c.oracle_id = mdc.oracle_id
  ),
  /* The shapes worth storing: the two type kinds, plus every tag that actually
     turns up on a card in one of these decks. A tag nothing runs gets no row,
     which is a different answer from a zero and is treated as one. */
  shapes as (
    select 'land'::text as kind, ''::text as tag
    union all
    select 'creature', ''
    union all
    select distinct 'tag', t
    from used, unnest(used.tags) as t
    where t <> 'land'
  )
  insert into public.meta_deck_shape_counts (deck_id, format, kind, tag, n)
  select s.id,
         s.format,
         sh.kind,
         sh.tag,
         coalesce(sum(
           case
             when sh.kind = 'land'     and u.tags @> array['land']::text[] then u.quantity
             when sh.kind = 'creature' and u.tags @> array['creature']::text[]
                                       and not (u.tags @> array['land']::text[]) then u.quantity
             when sh.kind = 'tag'      and u.tags @> array[sh.tag]::text[]
                                       and not (u.tags @> array['land']::text[]) then u.quantity
             else 0
           end
         ), 0)
  from scoped s
  cross join shapes sh
  left join used u on u.deck_id = s.id
  group by s.id, s.format, sh.kind, sh.tag;

  get diagnostics written = row_count;
  return written;
end;
$$;

comment on function public.rebuild_meta_deck_shape_counts() is
  'Recount how many lands, creatures and tagged cards each complete 100 card list runs. Run after any meta_* ingest or any change to card tagging.';

revoke all on function public.rebuild_meta_deck_shape_counts() from public;
grant execute on function public.rebuild_meta_deck_shape_counts() to service_role;

/* -------------------------------------------------------------------------- *
 * Reading it
 * -------------------------------------------------------------------------- */

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
  select count(*)::int,
         percentile_cont(0.1) within group (order by c.n),
         percentile_cont(0.5) within group (order by c.n),
         percentile_cont(0.9) within group (order by c.n),
         min(c.n)::int,
         max(c.n)::int
  from public.meta_deck_shape_counts c
  where c.format = p_format
    and c.kind = p_kind
    and c.tag = case when p_kind = 'tag' then coalesce(p_tag, '\x00') else '' end
  having count(*) >= 30;
$$;

comment on function public.meta_deck_shape(text, text, text) is
  'How many cards of one kind the complete 100 card lists we hold for a format run. p_kind is land, creature or tag; a tag also needs p_tag. Returns no row when fewer than 30 lists are in scope. Reads meta_deck_shape_counts, which is rebuilt by rebuild_meta_deck_shape_counts().';

select public.rebuild_meta_deck_shape_counts();
