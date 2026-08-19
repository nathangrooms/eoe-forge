-- ============================================================================
-- Lean price history: every card, every day, stored only when it moves.
-- ============================================================================
--
-- WHY THIS EXISTS
--
-- Measured on this database on 2026-08-19, before this migration:
--
--   card_price_history           34,510 rows
--   cards with any history        3,528 of 56,504  (6.2%)
--   distinct snapshot days           79, from 2025-12-06
--   size                          21 MB  =  636.7 bytes/row
--     heap                                 178.0 bytes/row
--     indexes                              457.4 bytes/row   <- 72% of the table
--
-- The indexes were the problem, not the columns. `card_id` and `oracle_id` were
-- `text` holding 36-character UUIDs, so every index entry carried 37 bytes where
-- 4 would do, and a `uuid` primary key indexed 34,510 rows on a value nothing
-- ever looks up. `card_name` was duplicated from `cards` on every row.
--
-- Extrapolated to the 110,000-printing catalogue at one row per card per day,
-- that schema costs 25.6 GB a year. The schema below costs 3.39 GB for the same
-- coverage, and 839 MB once rows are only written when a price actually moves.
-- The schema fix alone is worth 22 GB a year and it is this one file.
--
-- Full working: docs/overhaul/PRICE-HISTORY.md
--
-- ----------------------------------------------------------------------------
-- WHAT CHANGES
--
--   card_price_key     new. int4 surrogate key per Scryfall printing id.
--   card_price_point   new. the history itself. (card_key, d) primary key which
--                      is ALSO the covering index for the chart query.
--   card_price_last    new. one row per card, the last point stored. This is
--                      what the change gate compares against, and what "what is
--                      this worth now" reads.
--   price_sweep_run    new. one row per day: run log, resume pointer, watchdog.
--   price_sweep_stage  new, unlogged. the daily bulk file lands here.
--   card_price_history becomes a VIEW over the above, same column names, so the
--                      four components and one edge function that read it keep
--                      working with no edit.
--
-- ----------------------------------------------------------------------------
-- THE CARRY-FORWARD RULE, WHICH IS THE WHOLE RISK OF STORE-ON-CHANGE
--
-- A card with no row for a day was UNCHANGED. It was not worth nothing. A chart
-- that draws the raw rows will show a hole and a reader will see a crash that
-- never happened, which is inventing a price just as surely as interpolating
-- one. So:
--
--   * the read path is public.card_price_series(), which carries the last
--     observed value forward across gaps,
--   * every point it returns says whether it was OBSERVED or CARRIED,
--   * and a card that has genuinely never been priced returns null, not zero.
--
-- Enforced by src/lib/prices/history.test.ts.
--
-- A second guard: the heartbeat. If a card has not had a row written for
-- p_heartbeat_days, the sweep writes one even though nothing moved. That bounds
-- how far any value is ever carried, and it is the difference between "this
-- price did not change for 30 days" and "we stopped looking 30 days ago".
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Surrogate keys
-- ---------------------------------------------------------------------------
-- Deliberately NOT a column on `cards`. Adding a column to `cards` silently
-- desynchronises the `cards_unique` materialized view (see CLAUDE.md section
-- 6.3) and this table has to be able to hold a key for a printing that the
-- catalogue sync has not reached yet. The history clock starts the day the
-- sweep ships; waiting for `cards` to catch up would throw away real days.

create table if not exists public.card_price_key (
  card_key int  generated always as identity primary key,
  card_id  text not null unique
);

comment on table public.card_price_key is
  'Scryfall printing id to a 4-byte key. Exists so price history does not carry '
  'a 36-character uuid on every row and in every index. Keys are permanent: a '
  'printing leaving the catalogue must not orphan or renumber its history.';


-- ---------------------------------------------------------------------------
-- 2. The history
-- ---------------------------------------------------------------------------
-- Prices are stored in hundredths as int4. Six numerics become six int4s. int4
-- tops out at $21,474,836 which is comfortably above the most expensive card
-- ever sold.

create table if not exists public.card_price_point (
  card_key   int      not null references public.card_price_key(card_key) on delete cascade,
  d          date     not null,
  usd        int,
  usd_foil   int,
  usd_etched int,
  eur        int,
  eur_foil   int,
  tix        int,
  src        smallint not null default 1
);

comment on table public.card_price_point is
  'One row per card per day ONLY when a price moved, or when the heartbeat is '
  'due. A missing day means unchanged. Read through public.card_price_series(), '
  'never raw, or gaps read as drops to zero.';

comment on column public.card_price_point.src is
  'Where the observation came from. 1 Scryfall daily bulk file, 2 Scryfall via '
  'the cards table (backstop path), 3 the pre-2026-08-19 per-card capture, '
  '10 MTGJSON cardmarket seed, 11 MTGJSON tcgplayer seed. Seeded rows are a '
  'different measurement from observed rows and the chart says so.';

-- The primary key and the covering index are the same index. A unique index
-- with INCLUDE columns can back a PRIMARY KEY constraint (verified on this
-- database, Postgres 17), which is why there is one index here and not two.
--
-- Key order is (card_key, d), never (d, card_key). Every SEO card page asks for
-- one card across all dates; a date-leading index cannot serve that.
--
-- Measured on a probe table with 1,000 days per card:
--   Index Only Scan  rows=1000  Heap Fetches: 0  Buffers: shared hit=10  0.354 ms
-- against the old table's 82 buffers for 79 rows. A hundredfold less I/O on the
-- query that runs on every visit from search.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'card_price_point_pkey') then
    create unique index card_price_point_pkey
      on public.card_price_point (card_key, d)
      include (usd, usd_foil, usd_etched, eur, eur_foil, tix, src);
    alter table public.card_price_point add primary key using index card_price_point_pkey;
  end if;
end $$;

-- Date-range readers (7-day movers, "most valuable today") scan recent dates
-- across all cards. Rows are appended date-major so `d` is almost perfectly
-- correlated with physical order, which is the case BRIN is built for: this
-- index is a few kilobytes rather than the ~20 bytes/row a btree would cost.
create index if not exists card_price_point_d_brin
  on public.card_price_point using brin (d) with (pages_per_range = 32);

-- Index-only scans need a current visibility map. A daily append of ~20,000
-- rows is the easy case for autovacuum, but the defaults are proportional to
-- table size and this table gets large, so pin them low.
alter table public.card_price_point set (
  autovacuum_vacuum_scale_factor        = 0.01,
  autovacuum_analyze_scale_factor       = 0.01,
  autovacuum_vacuum_insert_scale_factor = 0.005
);


-- ---------------------------------------------------------------------------
-- 3. Last known price
-- ---------------------------------------------------------------------------
-- Two jobs. It is what the change gate compares today's price against, which
-- keeps the gate O(cards) instead of scanning the whole history. And it is the
-- honest answer to "what is this worth now", carrying `seen_d` so a reader can
-- tell a price we confirmed today from one we last confirmed in March.

create table if not exists public.card_price_last (
  card_key   int      primary key references public.card_price_key(card_key) on delete cascade,
  d          date     not null,
  usd        int,
  usd_foil   int,
  usd_etched int,
  eur        int,
  eur_foil   int,
  tix        int,
  seen_d     date     not null,
  src        smallint not null default 1
);

comment on column public.card_price_last.d is
  'Date of the last point STORED for this card.';
comment on column public.card_price_last.seen_d is
  'Date the sweep last read this card, whether or not it wrote a row. '
  'seen_d > d means the price was checked and had not moved.';


-- ---------------------------------------------------------------------------
-- 4. Run log, resume pointer, watchdog basis
-- ---------------------------------------------------------------------------
-- A sync that stopped silently already cost this project months. One row per
-- day, so "did we run" is a lookup and not an inference from whether any rows
-- happen to exist.

create table if not exists public.price_sweep_run (
  d                date primary key,
  status           text not null default 'running'
                     check (status in ('running','done','failed')),
  source           text not null default 'scryfall_bulk',
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  bulk_updated_at  timestamptz,
  cards_seen       int  not null default 0,
  rows_written     int  not null default 0,
  bytes_written    bigint,
  cursor_line      int,
  error            text
);

comment on column public.price_sweep_run.cursor_line is
  'Resume pointer: lines of the bulk file already staged. CLEARED TO NULL on the '
  'completion path. A non-null cursor on a done run would mean the completion '
  'path never ran.';

create table if not exists public.price_sweep_stage (
  card_id    text primary key,
  usd        int,
  usd_foil   int,
  usd_etched int,
  eur        int,
  eur_foil   int,
  tix        int
);
-- Unlogged: this is a scratch handoff rebuilt from the bulk file every run, so
-- writing it to WAL twice a day is pure cost. Losing it to a crash costs one
-- re-download.
do $$
begin
  if (select relpersistence from pg_class where oid = 'public.price_sweep_stage'::regclass) <> 'u' then
    alter table public.price_sweep_stage set unlogged;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 5. The change gate
-- ---------------------------------------------------------------------------
-- Written once, here, in SQL. The sweep script does not reimplement it, because
-- two implementations of a threshold drift apart and then the chart disagrees
-- with itself.
--
-- Measured on 26,910 consecutive day pairs of our own Scryfall-sourced history:
--   any field differs at all                     51.97% of card-days
--   any field moves by >= 1% AND >= $0.05        14.92% of card-days
-- The gate is worth 3.5x. It is compared against the LAST STORED value, not
-- yesterday's, so a card drifting 0.9% a day crosses the threshold on day two
-- rather than never.

create or replace function public.price_moved(
  prev     int,
  cur      int,
  min_pct  numeric,
  min_cents int
) returns boolean
language sql immutable parallel safe as $$
  select case
    when prev is null and cur is null then false
    -- Gaining or losing a price is always a real event, never noise.
    when prev is null or cur is null then true
    when abs(cur - prev) < min_cents then false
    when prev = 0 then true
    else abs(cur - prev)::numeric / prev >= min_pct
  end;
$$;

comment on function public.price_moved is
  'True when a price change is worth a row. Guards against writing a row every '
  'night for a $0.02 common that ticks by a cent.';


-- ---------------------------------------------------------------------------
-- 6. Key allocation
-- ---------------------------------------------------------------------------

create or replace function public.allocate_card_price_keys()
returns int
language sql security definer set search_path = public as $$
  with ins as (
    insert into public.card_price_key (card_id)
    select s.card_id
    from public.price_sweep_stage s
    on conflict (card_id) do nothing
    returning 1
  )
  select count(*)::int from ins;
$$;


-- ---------------------------------------------------------------------------
-- 7. Apply a sweep
-- ---------------------------------------------------------------------------
-- Set based. Everything staged, gated and written in one statement each, no
-- per-card round trip. This is the whole reason the old daily-price-capture
-- died: it fetched Scryfall one card at a time behind a 125 ms sleep and ran
-- out of wall clock after ~400 cards, every night, for months.

create or replace function public.apply_price_sweep(
  p_date           date     default current_date,
  p_src            smallint default 1,
  p_min_pct        numeric  default 0.01,
  p_min_cents      int      default 5,
  p_heartbeat_days int      default 30
) returns table (rows_written int, cards_seen int, keys_added int)
language plpgsql security definer set search_path = public as $$
declare
  v_keys int;
  v_seen int;
  v_rows int;
begin
  v_keys := public.allocate_card_price_keys();

  select count(*) into v_seen from public.price_sweep_stage;

  with staged as (
    select k.card_key, s.usd, s.usd_foil, s.usd_etched, s.eur, s.eur_foil, s.tix
    from public.price_sweep_stage s
    join public.card_price_key k on k.card_id = s.card_id
  ),
  gated as (
    select st.*
    from staged st
    left join public.card_price_last l on l.card_key = st.card_key
    where l.card_key is null                                    -- never recorded
       or l.d <= p_date - p_heartbeat_days                      -- heartbeat due
       or public.price_moved(l.usd,        st.usd,        p_min_pct, p_min_cents)
       or public.price_moved(l.usd_foil,   st.usd_foil,   p_min_pct, p_min_cents)
       or public.price_moved(l.usd_etched, st.usd_etched, p_min_pct, p_min_cents)
       or public.price_moved(l.eur,        st.eur,        p_min_pct, p_min_cents)
       or public.price_moved(l.eur_foil,   st.eur_foil,   p_min_pct, p_min_cents)
       or public.price_moved(l.tix,        st.tix,        p_min_pct, p_min_cents)
  ),
  written as (
    insert into public.card_price_point
      (card_key, d, usd, usd_foil, usd_etched, eur, eur_foil, tix, src)
    select g.card_key, p_date, g.usd, g.usd_foil, g.usd_etched, g.eur, g.eur_foil, g.tix, p_src
    from gated g
    -- A card with no price at all anywhere is not an observation, it is an
    -- absence. Writing six nulls would claim we measured something.
    where g.usd is not null or g.usd_foil is not null or g.usd_etched is not null
       or g.eur is not null or g.eur_foil is not null or g.tix is not null
    on conflict (card_key, d) do update set
      usd = excluded.usd, usd_foil = excluded.usd_foil, usd_etched = excluded.usd_etched,
      eur = excluded.eur, eur_foil = excluded.eur_foil, tix = excluded.tix, src = excluded.src
    returning 1
  )
  select count(*)::int into v_rows from written;

  -- card_price_last tracks the last row STORED (d) and the last time the card
  -- was looked at (seen_d). Only rows that were actually written move `d`.
  insert into public.card_price_last as l
    (card_key, d, usd, usd_foil, usd_etched, eur, eur_foil, tix, seen_d, src)
  select p.card_key, p.d, p.usd, p.usd_foil, p.usd_etched, p.eur, p.eur_foil, p.tix, p_date, p.src
  from public.card_price_point p
  where p.d = p_date
  on conflict (card_key) do update set
    d = excluded.d, usd = excluded.usd, usd_foil = excluded.usd_foil,
    usd_etched = excluded.usd_etched, eur = excluded.eur, eur_foil = excluded.eur_foil,
    tix = excluded.tix, seen_d = excluded.seen_d, src = excluded.src
  where excluded.d >= l.d;

  -- Everything staged was looked at, whether or not it earned a row.
  update public.card_price_last l
     set seen_d = p_date
    from public.price_sweep_stage s
    join public.card_price_key k on k.card_id = s.card_id
   where l.card_key = k.card_key and l.seen_d < p_date;

  rows_written := v_rows;
  cards_seen   := v_seen;
  keys_added   := v_keys;
  return next;
end $$;


-- ---------------------------------------------------------------------------
-- 8. Backstop path: sweep from cards.prices, no network at all
-- ---------------------------------------------------------------------------
-- scryfall-sync already refreshes cards.prices nightly, so a snapshot can be
-- taken with zero outbound traffic. This is the belt to the GitHub Actions
-- braces: if the runner is down, pg_cron still records the day. Rows land with
-- src = 2 so it is always visible which route a point came in by.

create or replace function public.capture_prices_from_cards(
  p_date           date     default current_date,
  p_min_pct        numeric  default 0.01,
  p_min_cents      int      default 5,
  p_heartbeat_days int      default 30
) returns table (rows_written int, cards_seen int, keys_added int)
language plpgsql security definer set search_path = public as $$
declare
  v record;
begin
  truncate public.price_sweep_stage;

  insert into public.price_sweep_stage
    (card_id, usd, usd_foil, usd_etched, eur, eur_foil, tix)
  select c.id,
         round((c.prices->>'usd')::numeric        * 100)::int,
         round((c.prices->>'usd_foil')::numeric   * 100)::int,
         round((c.prices->>'usd_etched')::numeric * 100)::int,
         round((c.prices->>'eur')::numeric        * 100)::int,
         round((c.prices->>'eur_foil')::numeric   * 100)::int,
         round((c.prices->>'tix')::numeric        * 100)::int
  from public.cards c
  where c.prices is not null
  on conflict (card_id) do nothing;

  select * into v from public.apply_price_sweep(p_date, 2::smallint, p_min_pct, p_min_cents, p_heartbeat_days);

  insert into public.price_sweep_run (d, status, source, finished_at, cards_seen, rows_written, cursor_line)
  values (p_date, 'done', 'cards_table', now(), v.cards_seen, v.rows_written, null)
  on conflict (d) do update set
    status = 'done', finished_at = now(),
    cards_seen   = public.price_sweep_run.cards_seen   + excluded.cards_seen,
    rows_written = public.price_sweep_run.rows_written + excluded.rows_written,
    cursor_line  = null;

  truncate public.price_sweep_stage;

  rows_written := v.rows_written;
  cards_seen   := v.cards_seen;
  keys_added   := v.keys_added;
  return next;
end $$;

-- Cron job 1 calls capture_daily_prices('relevant', 5). Keep the signature so
-- the schedule keeps working, and drop the scope argument on the floor: the
-- coverage decision has changed. Every card is now tracked, because every card
-- page is an SEO landing page and a page with no chart is a thin page.
drop function if exists public.capture_daily_prices(text, numeric, date);
create function public.capture_daily_prices(
  p_scope   text    default 'all',
  p_min_usd numeric default 0,
  p_date    date    default current_date
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v record;
begin
  select * into v from public.capture_prices_from_cards(p_date);
  return jsonb_build_object(
    'snapshot_date', p_date,
    'cards_seen',    v.cards_seen,
    'rows_written',  v.rows_written,
    'keys_added',    v.keys_added,
    'source',        'cards_table',
    'note',          'p_scope and p_min_usd are ignored; every card is tracked now'
  );
end $$;

comment on function public.capture_daily_prices is
  'Kept for the existing cron schedule and the daily-price-capture wrapper. '
  'p_scope and p_min_usd are ignored: coverage is now the whole catalogue.';


-- ---------------------------------------------------------------------------
-- 9. The read path, with carry-forward
-- ---------------------------------------------------------------------------
-- This is the function every chart must go through. It returns a dense daily
-- series and flags each point.
--
--   observed = true   we read this price on this date
--   observed = false  nothing was recorded, so the last observed value is
--                     carried. The price did not move. It did not drop.
--
-- Before the first observation it returns nothing at all, rather than zeros
-- stretching back to the start of the window. A card we have never priced has
-- no line, and the interface says when the record starts.

create or replace function public.card_price_series(
  p_card_id text,
  p_from    date default null,
  p_to      date default current_date
) returns table (
  d          date,
  usd        int,
  usd_foil   int,
  usd_etched int,
  eur        int,
  eur_foil   int,
  tix        int,
  src        smallint,
  observed   boolean
)
language sql stable security definer set search_path = public as $$
  with k as (
    select card_key from public.card_price_key where card_id = p_card_id
  ),
  bounds as (
    select greatest(
             coalesce(p_from, (select min(p.d) from public.card_price_point p join k on k.card_key = p.card_key)),
             (select min(p.d) from public.card_price_point p join k on k.card_key = p.card_key)
           ) as lo,
           p_to as hi
  ),
  -- The last point at or before the window start, so a window opening on a
  -- quiet stretch still starts from a real number instead of empty.
  anchor as (
    select p.*
    from public.card_price_point p join k on k.card_key = p.card_key, bounds b
    where p.d <= b.lo
    order by p.d desc
    limit 1
  ),
  inside as (
    select p.* from public.card_price_point p join k on k.card_key = p.card_key, bounds b
    where p.d > b.lo and p.d <= b.hi
  ),
  obs as (
    select * from anchor union all select * from inside
  ),
  days as (
    select gs::date as d from bounds b, generate_series(b.lo, b.hi, interval '1 day') gs
    where b.lo is not null
  )
  select days.d,
         f.usd, f.usd_foil, f.usd_etched, f.eur, f.eur_foil, f.tix, f.src,
         (f.d = days.d) as observed
  from days
  cross join lateral (
    select o.* from obs o where o.d <= days.d order by o.d desc limit 1
  ) f
  order by days.d;
$$;

comment on function public.card_price_series is
  'Dense daily price series for one printing, gaps carried forward from the last '
  'real observation and every point flagged observed or carried. Charts read '
  'this. Reading card_price_point raw draws a gap as a fall to zero, which '
  'invents a price the card never had.';


-- ---------------------------------------------------------------------------
-- 10. Watchdog
-- ---------------------------------------------------------------------------
-- Fails loudly when a day is missed. Returns a row per problem; an empty result
-- is a healthy record.

create or replace function public.price_sweep_health(p_lookback int default 14)
returns table (d date, problem text)
language sql stable security definer set search_path = public as $$
  with want as (
    select gs::date as d
    from generate_series(current_date - p_lookback, current_date - 1, interval '1 day') gs
  )
  select w.d,
         case
           when r.d is null        then 'no sweep recorded'
           when r.status = 'failed' then 'sweep failed: ' || coalesce(r.error, 'no reason recorded')
           when r.status = 'running' then 'sweep never finished, started ' || r.started_at::text
           when r.cursor_line is not null then 'sweep marked done but left a resume pointer at line '
                                              || r.cursor_line || ', so the completion path did not run'
           when r.cards_seen = 0   then 'sweep saw no cards'
         end as problem
  from want w
  left join public.price_sweep_run r on r.d = w.d
  where r.d is null
     or r.status <> 'done'
     or r.cursor_line is not null
     or r.cards_seen = 0;
$$;


-- ---------------------------------------------------------------------------
-- 11. Age-based rollup
-- ---------------------------------------------------------------------------
-- Daily for two years, then monthly. The weekly tier the brief proposed is
-- skipped on measurement, not taste: once the change gate is in, gated daily
-- writes FEWER rows (16,412/day) than a weekly full sweep would (15,714/day
-- equivalent), so collapsing to weekly saves 4.5% and destroys six sevenths of
-- the resolution. Monthly saves 78%, which is worth having.
--
-- Keeps the LAST point in each month, which is the value that carried into the
-- next month, so carry-forward reads identically before and after a rollup.
-- Also always keeps a card's very first point, which is where its record starts.

create or replace function public.rollup_price_history(p_older_than interval default '2 years')
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_cut date := (current_date - p_older_than)::date;
  v_deleted int;
begin
  with keep as (
    select distinct on (card_key, date_trunc('month', d)) card_key, d
    from public.card_price_point
    where d < v_cut
    order by card_key, date_trunc('month', d), d desc
  ),
  first_ever as (
    select distinct on (card_key) card_key, d
    from public.card_price_point
    order by card_key, d
  ),
  doomed as (
    delete from public.card_price_point p
    where p.d < v_cut
      and not exists (select 1 from keep      k where k.card_key = p.card_key and k.d = p.d)
      and not exists (select 1 from first_ever f where f.card_key = p.card_key and f.d = p.d)
    returning 1
  )
  select count(*)::int into v_deleted from doomed;
  return v_deleted;
end $$;


-- ---------------------------------------------------------------------------
-- 12. Migrate the 34,510 existing rows, then replace the table with a view
-- ---------------------------------------------------------------------------
-- These are real Scryfall observations and they are kept. The dedupe applied is
-- LOSSLESS: a row is dropped only when every field equals the previous row for
-- that card, which carry-forward reconstructs exactly. The 1% / $0.05 gate is
-- NOT applied retroactively, because that would discard small moves we actually
-- observed and no reader could get them back.

insert into public.card_price_key (card_id)
select distinct card_id from public.card_price_history
on conflict (card_id) do nothing;

insert into public.card_price_point (card_key, d, usd, usd_foil, usd_etched, eur, eur_foil, tix, src)
select card_key, d, usd, usd_foil, null::int, eur, eur_foil, null::int, 3::smallint
from (
  select k.card_key,
         h.snapshot_date as d,
         round(h.price_usd      * 100)::int as usd,
         round(h.price_usd_foil * 100)::int as usd_foil,
         round(h.price_eur      * 100)::int as eur,
         round(h.price_eur_foil * 100)::int as eur_foil,
         lag(round(h.price_usd      * 100)::int) over w as p_usd,
         lag(round(h.price_usd_foil * 100)::int) over w as p_usd_foil,
         lag(round(h.price_eur      * 100)::int) over w as p_eur,
         lag(round(h.price_eur_foil * 100)::int) over w as p_eur_foil,
         row_number() over w as rn
  from public.card_price_history h
  join public.card_price_key k on k.card_id = h.card_id
  window w as (partition by h.card_id order by h.snapshot_date)
) t
where rn = 1
   or usd      is distinct from p_usd
   or usd_foil is distinct from p_usd_foil
   or eur      is distinct from p_eur
   or eur_foil is distinct from p_eur_foil
on conflict (card_key, d) do nothing;

insert into public.card_price_last
  (card_key, d, usd, usd_foil, usd_etched, eur, eur_foil, tix, seen_d, src)
select distinct on (p.card_key)
  p.card_key, p.d, p.usd, p.usd_foil, p.usd_etched, p.eur, p.eur_foil, p.tix, p.d, p.src
from public.card_price_point p
order by p.card_key, p.d desc
on conflict (card_key) do nothing;

-- Reconstruct the run log for the days we know were captured, so the watchdog
-- does not report the whole of the past as missing.
insert into public.price_sweep_run (d, status, source, started_at, finished_at, cards_seen, rows_written, cursor_line)
select h.snapshot_date, 'done', 'legacy_capture',
       h.snapshot_date::timestamptz, h.snapshot_date::timestamptz,
       count(*)::int, count(*)::int, null
from public.card_price_history h
group by h.snapshot_date
on conflict (d) do nothing;

drop table public.card_price_history;

-- Same column names as the table it replaces, so the four components and the
-- edge function that read it need no edit. Prices come back as numeric dollars.
--
-- NOTE FOR ANY READER OF THIS VIEW: these are the real observations only. There
-- is deliberately no carry-forward here, because a view cannot say which points
-- were carried and an unlabelled carried point is a fabricated one. Charts must
-- use public.card_price_series().
create view public.card_price_history
with (security_invoker = true)
as
select k.card_id,
       coalesce(c.oracle_id, '') as oracle_id,
       coalesce(c.name, '')      as card_name,
       p.d                       as snapshot_date,
       (p.usd        / 100.0)::numeric as price_usd,
       (p.usd_foil   / 100.0)::numeric as price_usd_foil,
       (p.usd_etched / 100.0)::numeric as price_usd_etched,
       (p.eur        / 100.0)::numeric as price_eur,
       (p.eur_foil   / 100.0)::numeric as price_eur_foil,
       (p.tix        / 100.0)::numeric as price_tix,
       p.src,
       p.d::timestamptz          as created_at
from public.card_price_point p
join public.card_price_key k on k.card_key = p.card_key
left join public.cards c on c.id = k.card_id;

comment on view public.card_price_history is
  'Compatibility view over card_price_point. Real observations only, no '
  'carry-forward. New code should call public.card_price_series().';


-- ---------------------------------------------------------------------------
-- 13. Access
-- ---------------------------------------------------------------------------
-- Price history is public data on public card pages, so anon reads it. Nothing
-- but service_role writes it.

alter table public.card_price_key   enable row level security;
alter table public.card_price_point enable row level security;
alter table public.card_price_last  enable row level security;
alter table public.price_sweep_run  enable row level security;
alter table public.price_sweep_stage enable row level security;

drop policy if exists "price keys are public" on public.card_price_key;
create policy "price keys are public" on public.card_price_key for select to public using (true);

drop policy if exists "price history is public" on public.card_price_point;
create policy "price history is public" on public.card_price_point for select to public using (true);

drop policy if exists "latest prices are public" on public.card_price_last;
create policy "latest prices are public" on public.card_price_last for select to public using (true);

drop policy if exists "sweep log is public" on public.price_sweep_run;
create policy "sweep log is public" on public.price_sweep_run for select to public using (true);

do $$
declare t text;
begin
  foreach t in array array['card_price_key','card_price_point','card_price_last','price_sweep_run','price_sweep_stage']
  loop
    execute format('drop policy if exists "service role writes %1$s" on public.%1$I', t);
    execute format('create policy "service role writes %1$s" on public.%1$I for all to service_role using (true) with check (true)', t);
  end loop;
end $$;

grant select on public.card_price_key, public.card_price_point,
                public.card_price_last, public.price_sweep_run,
                public.card_price_history to anon, authenticated;
grant all    on public.card_price_key, public.card_price_point,
                public.card_price_last, public.price_sweep_run,
                public.price_sweep_stage to service_role;

revoke execute on function public.apply_price_sweep(date, smallint, numeric, int, int)  from public, anon, authenticated;
revoke execute on function public.capture_prices_from_cards(date, numeric, int, int)     from public, anon, authenticated;
revoke execute on function public.capture_daily_prices(text, numeric, date)              from public, anon, authenticated;
revoke execute on function public.allocate_card_price_keys()                             from public, anon, authenticated;
revoke execute on function public.rollup_price_history(interval)                         from public, anon, authenticated;

grant  execute on function public.apply_price_sweep(date, smallint, numeric, int, int)   to service_role;
grant  execute on function public.capture_prices_from_cards(date, numeric, int, int)     to service_role;
grant  execute on function public.capture_daily_prices(text, numeric, date)              to service_role;
grant  execute on function public.allocate_card_price_keys()                             to service_role;
grant  execute on function public.rollup_price_history(interval)                         to service_role;

-- The chart and the watchdog are read-only and the card page is public.
grant execute on function public.card_price_series(text, date, date) to anon, authenticated, service_role;
grant execute on function public.price_sweep_health(int)             to anon, authenticated, service_role;
