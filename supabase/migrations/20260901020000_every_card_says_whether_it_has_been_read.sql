-- Which cards have been through per-card assignment, and when.
--
-- Applied via the MCP tool in two steps; this file records the end state. See
-- docs/overhaul/CARD-ASSIGNMENT-PLAN.md for why any of it exists.
--
-- NOTHING HERE TOUCHES `card_facet_memo`. That is the safety property of the
-- whole plan: the compiler's words are correct on the cards it reads, and
-- assignment measured at 93% precision, so assignment may only ever ADD to a
-- card that had nothing. If every row here were wrong,
-- `delete from card_assignments` restores today exactly.
--
-- The marker is `assigned_at`, and it lives HERE rather than as a column on
-- `cards`, because `cards` holds every PRINTING and is rewritten nightly by the
-- sync, while assignment is a fact about the CARD.

create table if not exists public.card_assignments (
  oracle_id     text primary key,
  facets        text[] not null default '{}',
  -- Per word, the sentence it was read from. A wrong `eff:exile` on Ad Nauseam
  -- is an opaque label without this and an auditable claim with it.
  evidence      jsonb not null default '{}'::jsonb,
  pass          smallint not null default 1,
  agreement     text check (agreement in ('agree', 'disagree', 'pass-2-only')),
  assigned_at   timestamptz not null default now(),
  run_id        uuid,
  notes         text
);

comment on table public.card_assignments is
  'Per-card word assignment, kept entirely separate from card_facet_memo. The compiler always wins where it has a word; this only fills cards it could not read. assigned_at is the marker for "has this card been gone through".';

alter table public.card_assignments enable row level security;

drop policy if exists "assignments are readable" on public.card_assignments;
create policy "assignments are readable"
  on public.card_assignments for select
  to anon, authenticated using (true);

grant select on public.card_assignments to anon, authenticated, service_role;
revoke insert, update, delete on public.card_assignments from anon, authenticated;

create index if not exists card_assignments_assigned_at_idx
  on public.card_assignments (assigned_at desc);

-- ------------------------------------------------------------- the alert ---
--
-- Vanilla cards are excluded: an alert that can never reach zero is one nobody
-- reads twice, and 354 cards have no rules text at all. That was the same
-- mistake in its third form, after the coverage bands and the dictionary probe.
--
-- READS `cards_pool`, NOT `cards_unique`. The pool is the narrow 13 MB view;
-- the same query against cards_unique pays to detoast oracle_text and faces on
-- every row, which has cost this project three separate timeouts in two days.

create or replace function public.assignment_status()
returns table (measure text, cards bigint)
language sql
stable
security definer
set search_path = public
as $$
  with needs as (
    select p.oracle_id, m.coverage,
           exists (
             select 1 from unnest(p.facets) f
             where f ~ '^(eff|trig|cost|acost|cares:type|cares:zone|scope|mana):'
           ) as has_judgement
    from public.cards_pool p
    left join public.card_facet_memo m
      on m.oracle_id = p.oracle_id
     and m.compiler_version = public.card_facet_current_version()
  ),
  real as (select * from needs where coverage is distinct from 'none')
  select 'cards in the catalogue'::text, count(*)::bigint from needs
  union all
  select 'nothing to read (vanilla)', count(*)::bigint from needs where coverage = 'none'
  union all
  select 'the compiler already reads', count(*)::bigint from real where has_judgement
  union all
  select 'need a reading', count(*)::bigint from real where not has_judgement
  union all
  select 'read by hand', count(*)::bigint
    from real r join public.card_assignments a on a.oracle_id = r.oracle_id
   where not r.has_judgement
  union all
  select 'STILL TO READ', count(*)::bigint
    from real r left join public.card_assignments a on a.oracle_id = r.oracle_id
   where not r.has_judgement and a.oracle_id is null;
$$;

comment on function public.assignment_status() is
  'How many cards still need a per-card reading. "STILL TO READ" is the admin alert: when a set releases it goes up on its own, because the fifteen-minute facet top-up gives every new card a coverage first.';

grant execute on function public.assignment_status() to anon, authenticated, service_role;
