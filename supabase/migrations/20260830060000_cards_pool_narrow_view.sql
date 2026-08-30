-- ============================================================================
-- `public.cards_pool` — the candidate pool, and nothing else.
--
-- WHY, measured 2026-08-30
--
-- The deck generator's pool query reads nine narrow columns. It reads them from
-- `cards_unique`, whose rows average 3.2 KB because they also carry
-- `oracle_text`, `faces`, `image_uris`, `legalities` and `prices`:
--
--   cards_unique heap                105 MB
--   the nine columns the pool needs   6.7 MB
--
-- So a scan of the 7,495 mono-red candidates touched 6,441 heap blocks, about
-- one block per row, because one fat row is one block. That is the whole cost:
--
--   mono-red pool, ORDER BY id, after VACUUM   2,923 ms, 6,441 heap blocks
--
-- and it is why one and two colour commanders were the SLOWEST decks to
-- generate, slower than four colour ones, which only escaped by narrowing their
-- pool with a rank ceiling for an unrelated reason.
--
-- A view holding only what the pool reads is sixteen times smaller, so the same
-- scan touches sixteen times fewer blocks.
--
-- ---------------------------------------------------------------------------
-- WHAT IT CARRIES, and what it deliberately does not
-- ---------------------------------------------------------------------------
--
-- The nine ranking columns, plus two projections the query already asked
-- PostgREST to compute per request (`prices->>'usd'` and
-- `legalities->>'commander'`), plus the compiled behaviour FACETS.
--
-- Facets are joined in rather than read through the `public.facets` computed
-- column, because a computed column is a function call per row and the pool is
-- tens of thousands of rows. Storing them costs about 1 MB.
--
-- It carries no oracle text, no images, no prices object and no faces. Anything
-- that needs those is asking about a CARD, not about a candidate, and should
-- read `cards_unique`. That distinction is the whole point of this view and it
-- is worth defending: the moment a wide column is added here, the sixteen times
-- goes away and nothing on screen will say so.
--
-- ---------------------------------------------------------------------------
-- KEEPING IT CURRENT
-- ---------------------------------------------------------------------------
--
-- Refreshed by `refresh_cards_unique`, immediately after `cards_unique`, so the
-- two cannot drift apart by more than the length of one refresh. Both are
-- CONCURRENT, which needs the unique index below and does not block readers.
--
-- IT DEPENDS ON THE FACET COMPILER'S VERSION. `card_facet_memo` is keyed on
-- `(oracle_id, compiler_version)` and this view pins version 1, the same pin as
-- `public.facets`. A compiler bump means: bump COMPILER_VERSION in
-- facet-memo-fill, refill the memo, change the pin here and in that function,
-- and refresh. A reader on one version and a writer on another is silent: every
-- card reads as having no facets, which the ranker cannot tell apart from a
-- card that genuinely does nothing.
-- ============================================================================

drop materialized view if exists public.cards_pool;

create materialized view public.cards_pool as
select
  c.id,
  c.oracle_id,
  c.name,
  c.type_line,
  c.cmc,
  c.color_identity,
  c.tags,
  c.mana_cost,
  c.edhrec_rank,
  -- The two projections the pool query used to ask for per request.
  (c.prices ->> 'usd')            as usd,
  (c.legalities ->> 'commander')  as commander_legal,
  -- Precompiled behaviour. An EMPTY ARRAY IS A REAL ANSWER: 7,058 of 33,032
  -- cards genuinely compile to no facets. NULL means the memo has not reached
  -- that card, which is a different thing and the ranker treats it as unknown.
  m.facets
from public.cards_unique c
left join public.card_facet_memo m
  on m.oracle_id = c.oracle_id
 and m.compiler_version = 1;

-- CONCURRENT refresh needs a unique index, and without it this view could only
-- be rebuilt by taking an ACCESS EXCLUSIVE lock that blocks every read of it.
-- CLAUDE.md's database rules call that out by name.
create unique index cards_pool_id_idx on public.cards_pool (id);

-- The pool query, exactly: commander-legal, filtered by colour identity,
-- ordered by popularity. Partial so the index holds only rows the pool can
-- ever return.
create index cards_pool_identity_rank_id_idx
  on public.cards_pool (color_identity, edhrec_rank, id)
  where commander_legal = 'legal';

-- The rank-ceiling walk, for the three-colour-and-up pools that use one.
create index cards_pool_rank_idx
  on public.cards_pool (edhrec_rank, id)
  where commander_legal = 'legal' and edhrec_rank is not null;

-- Colour identity on its own, for a caller that does not order by rank.
create index cards_pool_identity_idx
  on public.cards_pool using gin (color_identity)
  where commander_legal = 'legal';

comment on materialized view public.cards_pool is
  'The deck generator candidate pool: the nine ranking columns plus usd, commander legality and precompiled facets. 6.7 MB against cards_unique''s 105 MB, because it carries no oracle text, images, prices object or faces. Refreshed by refresh_cards_unique. Pinned to facet compiler_version 1.';

grant select on public.cards_pool to anon, authenticated, service_role;

analyze public.cards_pool;
