-- Perceptual hashes of each printing's artwork, for local (in-browser) card
-- recognition.
--
-- Why a table rather than a binary asset committed to the repo:
--   * Freshness. The nightly Scryfall sync adds printings continuously — the
--     catalogue grew from 34,088 to 50,489 rows during the afternoon this was
--     built. A shipped asset is frozen at deploy time, so every card added
--     between deploys would be unrecognisable, silently, and in exactly the way
--     that makes a scanner feel broken.
--   * Incrementality. `source_url` lets a rebuild hash only what actually
--     changed. Scryfall's image URLs carry a cache-busting timestamp, so a
--     changed URL is a reliable signal that the art was re-rendered.
--   * The client still gets a single compact binary blob: it downloads these
--     rows once, packs them locally (36 bytes per printing), and caches the
--     result in IndexedDB keyed on the manifest below.
--
-- Hashes are stored as 16-char hex TEXT, not bigint, on purpose. PostgREST
-- serialises bigint as a JSON number, and a 64-bit hash exceeds JavaScript's
-- 2^53 safe integer range — the top bits would be silently corrupted in the
-- browser before anything got a chance to compare them.
--
-- Rows are per PRINTING, not per card. That is the whole point: the scanner is
-- one of the surfaces that genuinely wants `public.cards` rather than
-- `public.cards_unique`.

create table if not exists public.card_image_hashes (
  card_id       text primary key references public.cards(id) on delete cascade,

  -- 64-bit perceptual hashes of the ART WINDOW of the card, as lowercase hex.
  art_phash     text not null check (art_phash ~ '^[0-9a-f]{16}$'),
  art_dhash     text not null check (art_dhash ~ '^[0-9a-f]{16}$'),

  -- The exact image URL these hashes were computed from. Doubles as the
  -- incremental-rebuild key: if this differs from cards.image_uris->>'small',
  -- the art was re-rendered and the row is stale.
  source_url    text not null,

  -- Bump when the hash algorithm, the art window, or the rectified geometry
  -- changes. Rows below the current version are treated as stale, which makes
  -- an algorithm change a one-line rebuild rather than a manual truncate.
  algo_version  smallint not null default 1,

  hashed_at     timestamptz not null default now()
);

comment on table public.card_image_hashes is
  'Perceptual hashes of card art for offline in-browser recognition. Built by scripts/vision/build-hash-index.mjs. See docs for the storage rationale.';

-- The client pulls deltas ordered by hashed_at, so that ordering must be cheap.
create index if not exists card_image_hashes_hashed_at_idx
  on public.card_image_hashes (hashed_at);

-- Supports the "which rows are stale" join in the incremental build.
create index if not exists card_image_hashes_algo_version_idx
  on public.card_image_hashes (algo_version);

alter table public.card_image_hashes enable row level security;

-- Mirrors the policy on public.cards: the catalogue is public reference data,
-- and these hashes are derived from public card images. Writes are left to the
-- service role only, which is the build script.
create policy "Card image hashes are publicly readable"
  on public.card_image_hashes
  for select
  using (true);
