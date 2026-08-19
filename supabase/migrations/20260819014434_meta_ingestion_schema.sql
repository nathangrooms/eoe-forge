-- Meta ingestion schema: third-party decklists, combos, and the aggregates derived from them.
-- Only two external sources are ingested, both MIT licensed with no restriction on commercial
-- or automated use: mtgjson and commander_spellbook.
-- Sources deliberately NOT ingested: EDHREC, MTGGoldfish (terms forbid commercial/competitive/
-- automated use), MTGTop8 (no published terms), Archidekt and Moxfield (written terms say
-- "personal, noncommercial"; awaiting written permission), Topdeck.gg (no API key obtained),
-- Westly/CommanderPrecons (no licence, itself a Moxfield scrape).
-- See docs/overhaul/DECKLIST-DATA.md for the clause each verdict rests on.
--
-- Cards are keyed by oracle_id, never by name and never by printing id. public.cards is
-- expanding to carry every printing, so oracle_id is not unique there and no FK can point at
-- it. oracle_id is stored as bare text so ingestion cannot fail because card sync lags.

create table if not exists public.meta_sources (
  id             text primary key,
  name           text not null,
  url            text not null,
  licence        text not null,
  attribution    text not null,
  terms_note     text,
  last_ingest_at timestamptz,
  created_at     timestamptz not null default now()
);

comment on table public.meta_sources is
  'External data sources we are permitted to ingest. A row here asserts the licence column was read and permits commercial, automated use. Do not add a row without quoting the clause in docs/overhaul/DECKLIST-DATA.md and THIRD-PARTY-NOTICES.md.';

create table if not exists public.meta_decks (
  id                   uuid primary key default gen_random_uuid(),
  source_id            text not null references public.meta_sources(id) on delete cascade,
  source_deck_id       text not null,
  name                 text not null,
  deck_type            text not null,
  format               text not null,
  set_code             text,
  released_at          date,
  source_url           text,
  commander_oracle_ids text[] not null default '{}',
  total_cards          integer not null default 0,
  distinct_cards       integer not null default 0,
  is_complete          boolean not null default false,
  ingested_at          timestamptz not null default now(),
  unique (source_id, source_deck_id)
);

comment on column public.meta_decks.format is
  'commander | brawl | constructed | multiplayer. Aggregates MUST filter on this. A 60-card World Championship deck tells you nothing about Commander inclusion rates.';
comment on column public.meta_decks.is_complete is
  'A deck only counts toward an aggregate if it is a legal-size list. Computed at ingest from format rules, not asserted by the source. An unfinished list is noise in any corpus.';
comment on column public.meta_decks.commander_oracle_ids is
  'Empty for non-commander formats. Populated from the source commander field, not guessed from the main board.';

create index if not exists idx_meta_decks_format on public.meta_decks (format) where is_complete;
create index if not exists idx_meta_decks_commanders on public.meta_decks using gin (commander_oracle_ids);

create table if not exists public.meta_deck_cards (
  deck_id   uuid not null references public.meta_decks(id) on delete cascade,
  oracle_id text not null,
  board     text not null default 'main',
  quantity  integer not null default 1,
  card_name text not null,
  primary key (deck_id, oracle_id, board),
  constraint meta_deck_cards_board_ck check (board in ('main', 'side', 'commander')),
  constraint meta_deck_cards_qty_ck check (quantity > 0)
);

comment on table public.meta_deck_cards is
  'One row per deck per oracle_id per board. The primary key collapses printings: MTGJSON lists four different printings of the same basic land as four entries, which is one card played four times, not four different cards. Ingest sums quantity on conflict.';

create index if not exists idx_meta_deck_cards_oracle on public.meta_deck_cards (oracle_id);

create table if not exists public.meta_combos (
  id                    text primary key,
  source_id             text not null references public.meta_sources(id) on delete cascade,
  status                text,
  identity              text,
  bracket_tag           text,
  popularity            integer,
  produces              text[] not null default '{}',
  mana_needed           text,
  mana_value_needed     integer,
  easy_prerequisites    text,
  notable_prerequisites text,
  description           text,
  legalities            jsonb,
  prices                jsonb,
  spoiler               boolean not null default false,
  card_count            integer not null default 0,
  template_count        integer not null default 0,
  template_requirements jsonb,
  last_seen_run         bigint,
  updated_at            timestamptz not null default now()
);

comment on column public.meta_combos.popularity is
  'Commander Spellbook''s own count of decks containing this combo, taken verbatim from their API. It is THEIR aggregate over THEIR corpus, not ours, and must be labelled as such wherever it is shown. Never merge it into a DeckMatrix-computed inclusion rate.';
comment on column public.meta_combos.template_requirements is
  'Combo pieces expressed as a Scryfall query rather than a specific card. Stored as jsonb and NOT as rows in meta_combo_cards, because they are not cards and would fabricate combo membership if treated as such.';
comment on column public.meta_combos.last_seen_run is
  'Run counter from meta_ingest_runs. Rows not touched by a completed full sweep are combos deleted upstream, and are pruned on the completion path.';

create index if not exists idx_meta_combos_identity on public.meta_combos (identity);
create index if not exists idx_meta_combos_popularity on public.meta_combos (popularity desc nulls last);

create table if not exists public.meta_combo_cards (
  combo_id          text not null references public.meta_combos(id) on delete cascade,
  oracle_id         text not null,
  card_name         text not null,
  quantity          integer not null default 1,
  must_be_commander boolean not null default false,
  zone_locations    text[],
  primary key (combo_id, oracle_id)
);

create index if not exists idx_meta_combo_cards_oracle on public.meta_combo_cards (oracle_id);

create table if not exists public.meta_ingest_runs (
  source_id      text primary key references public.meta_sources(id) on delete cascade,
  status         text not null default 'idle',
  cursor         text,
  processed      integer not null default 0,
  total          integer,
  run_id         bigint not null default 0,
  started_at     timestamptz,
  finished_at    timestamptz,
  error_message  text,
  updated_at     timestamptz not null default now(),
  constraint meta_ingest_runs_status_ck check (status in ('idle', 'running', 'done', 'error'))
);

comment on table public.meta_ingest_runs is
  'Resume pointer, one row per source. THE CURSOR MUST BE CLEARED ON THE COMPLETION PATH. A pointer that never cleared froze this project''s Scryfall card sync for months. Call meta_finish_ingest() rather than writing status by hand, so completion and clearing cannot be separated.';
comment on column public.meta_ingest_runs.cursor is
  'Opaque per-source resume token. NULL whenever status is not ''running''. Enforced by trigger.';

create or replace function public.meta_ingest_runs_clear_cursor()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.status <> 'running' then
    new.cursor := null;
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists trg_meta_ingest_runs_clear_cursor on public.meta_ingest_runs;
create trigger trg_meta_ingest_runs_clear_cursor
  before insert or update on public.meta_ingest_runs
  for each row execute function public.meta_ingest_runs_clear_cursor();

create table if not exists public.meta_card_inclusion (
  scope_kind       text not null,
  scope_key        text not null,
  oracle_id        text not null,
  decks_containing integer not null,
  decks_in_scope   integer not null,
  inclusion_rate   numeric(7,6) not null,
  avg_quantity     numeric(7,3) not null,
  computed_at      timestamptz not null default now(),
  primary key (scope_kind, scope_key, oracle_id),
  constraint meta_card_inclusion_scope_ck check (scope_kind in ('format', 'commander')),
  constraint meta_card_inclusion_sample_ck check (decks_in_scope > 0 and decks_containing <= decks_in_scope)
);

comment on table public.meta_card_inclusion is
  'Real counts over ingested complete decks. NOTHING HERE IS ESTIMATED, MODELLED OR SMOOTHED. decks_containing and decks_in_scope are stored beside the rate precisely so no caller can display a percentage without being able to display the sample it came from. A rate over 3 decks and a rate over 300 decks are not the same claim and must not look the same.';
comment on column public.meta_card_inclusion.decks_in_scope is
  'Denominator. Rows are only written for scopes at or above meta_min_scope_decks(); small scopes are omitted entirely rather than published with a caveat.';

create index if not exists idx_meta_card_inclusion_oracle on public.meta_card_inclusion (oracle_id);

create table if not exists public.meta_card_pairs (
  scope_kind            text not null,
  scope_key             text not null,
  oracle_id_a           text not null,
  oracle_id_b           text not null,
  decks_containing_both integer not null,
  decks_containing_a    integer not null,
  decks_containing_b    integer not null,
  decks_in_scope        integer not null,
  lift                  numeric(10,4),
  computed_at           timestamptz not null default now(),
  primary key (scope_kind, scope_key, oracle_id_a, oracle_id_b),
  constraint meta_card_pairs_order_ck check (oracle_id_a < oracle_id_b)
);

comment on table public.meta_card_pairs is
  'Card-pair co-occurrence over complete ingested decks. oracle_id_a < oracle_id_b so each unordered pair is stored once. lift is observed co-occurrence divided by what independence would predict: above 1 means the pair is played together more than chance. It is computed from the four counts stored alongside it and can be rederived by hand.';

create index if not exists idx_meta_card_pairs_a on public.meta_card_pairs (scope_kind, scope_key, oracle_id_a, decks_containing_both desc);
create index if not exists idx_meta_card_pairs_b on public.meta_card_pairs (scope_kind, scope_key, oracle_id_b, decks_containing_both desc);

alter table public.meta_sources        enable row level security;
alter table public.meta_decks          enable row level security;
alter table public.meta_deck_cards     enable row level security;
alter table public.meta_combos         enable row level security;
alter table public.meta_combo_cards    enable row level security;
alter table public.meta_ingest_runs    enable row level security;
alter table public.meta_card_inclusion enable row level security;
alter table public.meta_card_pairs     enable row level security;

do $do$
declare t text;
begin
  foreach t in array array[
    'meta_sources','meta_decks','meta_deck_cards','meta_combos',
    'meta_combo_cards','meta_ingest_runs','meta_card_inclusion','meta_card_pairs'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to public using (true)', t || '_read', t);
    -- TO service_role, not TO public. A "service role can manage" policy created TO public is
    -- an open door for anyone holding the anon key; that exact bug was found on three tables
    -- in this database on 2026-08-18.
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to service_role using (true) with check (true)', t || '_write', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
  end loop;
end;
$do$;

insert into public.meta_sources (id, name, url, licence, attribution, terms_note) values
  ('mtgjson', 'MTGJSON', 'https://mtgjson.com/', 'MIT',
   'Deck data from MTGJSON (https://mtgjson.com/), MIT licensed, copyright 2018-present Zach Halpern.',
   'MIT grants use, copy, modify, merge, publish, distribute, sublicense and sell without restriction. Only obligation is reproducing the copyright and permission notice, discharged in THIRD-PARTY-NOTICES.md.'),
  ('commander_spellbook', 'Commander Spellbook', 'https://commanderspellbook.com/', 'MIT',
   'Combo data from Commander Spellbook (https://commanderspellbook.com/), MIT licensed, Space Cow Media.',
   'Backend is MIT licensed and an official OpenAPI client is published to npm for third-party use. Read endpoints are documented as public. robots.txt on the API host is Disallow: / , which is a crawler directive on a JSON host rather than a restriction on documented API clients; recorded rather than hidden.')
on conflict (id) do update
  set name = excluded.name, url = excluded.url, licence = excluded.licence,
      attribution = excluded.attribution, terms_note = excluded.terms_note;

insert into public.meta_ingest_runs (source_id, status) values
  ('mtgjson', 'idle'), ('commander_spellbook', 'idle')
on conflict (source_id) do nothing;;