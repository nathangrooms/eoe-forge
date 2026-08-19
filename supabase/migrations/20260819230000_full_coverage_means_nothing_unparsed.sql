-- Coverage is COMPUTED, never ASSERTED.
--
-- `deriveCoverage(abilities, unparsed)` in src/lib/cards/abilities/dsl.ts returns
-- 'full' only when there is nothing unparsed and nothing manual. The acceptance
-- harness always goes through it, but `llm_ability_compilations.coverage` was a
-- plain text column: any writer holding a run token could have declared 'full'
-- over a row that also carried unparsed clauses, and the one number this whole
-- pipeline exists to keep honest would have been free-text.
--
-- This is the half of the relation the database can check on its own. The
-- dsl-compile-store function refuses the same shape first, so a caller gets a
-- sentence rather than a Postgres error string; this constraint is what makes it
-- true of every writer rather than of the one writer that exists today.
--
-- Verified before applying: 0 of the 93 existing rows violate it.

alter table public.llm_ability_compilations
  add constraint full_coverage_means_nothing_unparsed
  check (coverage is distinct from 'full' or coalesce(jsonb_array_length(unparsed), 0) = 0);
