-- ============================================================================
-- A gate for the facet memo filler.
--
-- WHY THE MEMO MATTERS, measured 2026-08-30
--
-- `public.card_facet_memo` has existed for a while and holds ZERO ROWS. Nothing
-- writes it and nothing reads it. It is a designed optimisation that was never
-- wired up, and its absence is why the deck generator fails:
--
--   Krenko   mono-red    HTTP 500 after 19s   statement timeout on the pool
--   Teysa    2 colours   HTTP 500 after 17s   statement timeout on the pool
--   Atraxa   4 colours   HTTP 200 after 60s
--   Najeela  5 colours   546 resource limit after 114s
--
-- `pipeline.ts` compiles facets from oracle text on every request, capped at
-- 6,000 cards, into a Map that lives on the module and therefore dies with the
-- instance. Every measured run reports `cached: 0`. For a five-colour pool that
-- is roughly 100,000 facets computed from scratch inside an edge function's CPU
-- budget, and the budget loses. It also forces `oracle_text` into the pool
-- query, which is 4.93 MB on a five-colour pool and is most of why the query
-- times out while the nightly sync is saturating the database.
--
-- Facets are a pure function of oracle text and the compiler's rules, so the
-- answer cannot change between requests. Computing them once turns the hot path
-- into an indexed read.
--
-- ---------------------------------------------------------------------------
-- WHY A RUN TOKEN AND NOT A NEW SECRET
-- ---------------------------------------------------------------------------
--
-- Copied deliberately from `llm_compile_runs`, which gates `dsl-compile-batch`
-- for the same reason: every edge function here is reachable with the project's
-- publishable key, so the key alone cannot be the gate.
--
-- A caller must present a token whose run is still `running`, has not expired,
-- and is under its call budget. The blast radius of a leaked token is bounded
-- by that budget, and the worst an attacker can do with it is fill a cache of
-- derived public data with correct values. That is a much smaller risk than the
-- model-spend `llm_compile_runs` protects, which is why this table is simpler.
--
-- The table is admin-only. Creating a run is an elevated act.
-- ============================================================================

create table if not exists public.facet_memo_runs (
  id           uuid primary key default gen_random_uuid(),
  run_token    uuid not null unique default gen_random_uuid(),
  status       text not null default 'running'
               check (status in ('running', 'done', 'cancelled')),
  -- A budget in CALLS, not rows, because a call is the unit an attacker
  -- controls and a row is not.
  max_calls    integer not null default 200 check (max_calls between 1 and 5000),
  calls_made   integer not null default 0,
  -- Where the walk got to, so a run resumes instead of rescanning. The cursor
  -- is an oracle_id because that is what the memo is keyed on.
  cursor       text not null default '',
  written      integer not null default 0,
  scanned      integer not null default 0,
  expires_at   timestamptz not null default now() + interval '12 hours',
  created_at   timestamptz not null default now(),
  note         text
);

comment on table public.facet_memo_runs is
  'Run tokens for facet-memo-fill. Admin-only: creating a run is an elevated act, and the token is the only thing that lets the function write.';

alter table public.facet_memo_runs enable row level security;

-- No policy for anon or authenticated at all, which denies both. The function
-- reads this table with the service role, which bypasses RLS, so the gate is
-- the token's secrecy rather than a policy.
drop policy if exists "admins manage facet memo runs" on public.facet_memo_runs;
create policy "admins manage facet memo runs"
  on public.facet_memo_runs
  for all
  to authenticated
  using (public.is_dev_admin())
  with check (public.is_dev_admin());

-- A table grant is the real gate, not the policy. Without this, an anon caller
-- cannot reach the table whatever any policy says.
revoke all on public.facet_memo_runs from anon, authenticated;
grant select, insert, update on public.facet_memo_runs to authenticated;

-- ---------------------------------------------------------------------------
-- Reading the memo has to be cheap for the ONE caller that matters, the pool
-- query, which asks for facets by oracle_id for tens of thousands of ids.
-- ---------------------------------------------------------------------------
create index if not exists card_facet_memo_version_oracle_idx
  on public.card_facet_memo (compiler_version, oracle_id);
