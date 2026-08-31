-- Everything Magic officially names, so "is the dictionary complete" is a SELECT.
--
-- Applied via the MCP tool; this file records what ran. Two statements: the
-- table, then 885 rows seeded from Scryfall's catalog endpoints
-- (keyword-abilities, keyword-actions, ability-words, creature-types,
-- land-types, artifact-types, enchantment-types, spell-types,
-- planeswalker-types, supertypes, battle-types). The seed itself is not
-- reproduced here because it is Scryfall's data, refetchable at any time by
--
--   REFRESH=1 node --experimental-strip-types scripts/probe/dictionary-gap.mjs
--
-- which writes scratch/scryfall-catalogs/*.json, and those are the exact
-- values inserted.

create table if not exists public.mtg_vocabulary (
  kind        text not null,
  value       text not null,
  facet       text,
  first_seen  timestamptz not null default now(),
  primary key (kind, value)
);

comment on table public.mtg_vocabulary is
  'Every keyword, ability word, type and subtype Magic officially names, from Scryfall''s catalog endpoints. The denominator for dictionary coverage.';

alter table public.mtg_vocabulary enable row level security;

drop policy if exists "vocabulary is public knowledge" on public.mtg_vocabulary;
create policy "vocabulary is public knowledge"
  on public.mtg_vocabulary for select
  to anon, authenticated using (true);

grant select on public.mtg_vocabulary to anon, authenticated, service_role;
revoke insert, update, delete on public.mtg_vocabulary from anon, authenticated;
