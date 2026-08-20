-- Playmats on the account: your surfaces, your uploads, and which one is live.
--
-- Until now the mat was a look kept in localStorage, and `usePlaymatStyle.ts`
-- said in as many words that it was the one place to change when mats moved to
-- the account. This is that move, plus the thing it unlocks: a player's own
-- image behind their own seat.
--
-- ---------------------------------------------------------------------------
-- WHY AN UPLOAD IS ALLOWED HERE WHEN CARD ART IS NOT
-- ---------------------------------------------------------------------------
-- The reasoning against card art is at the top of `src/components/play/
-- matStyles.ts` and it is a licence, not a preference: Scryfall's guidelines
-- forbid blurring, desaturating or colour-shifting card images, which is
-- exactly what a mat has to do to art before cards can be read on top of it.
-- None of that applies to a photograph or a drawing the player owns. So the
-- built-in surfaces stay procedural, and the only bitmaps in the system are
-- ones a person supplied about themselves.
--
-- ---------------------------------------------------------------------------
-- THE PART THAT IS THE WHOLE JOB: WHO CAN SEE THE FILE
-- ---------------------------------------------------------------------------
-- The bucket is private. Nothing here is reachable by a public URL, so getting
-- the read rule wrong does not degrade gracefully into "slightly too visible",
-- it is the difference between a private picture and a public one.
--
-- Two, and only two, kinds of reader:
--
--   1. The owner. Every mat they hold, always.
--   2. Somebody sitting at a live table with them, and only for the ONE mat
--      that seat is actually playing on.
--
-- The second rule is deliberately narrower than "people you play with can see
-- your mats". A co-player is shown a surface, so a co-player needs exactly the
-- surface being shown. The rest of the library is nobody else's business, and
-- an image that was uploaded and never chosen is never readable by anyone but
-- its owner.
--
-- "Live" means the table is in `lobby` or `playing`. A finished game stops
-- granting access, so the reach of an upload ends when the game does rather
-- than lingering until the retention sweep. Signed URLs already handed out
-- keep working for their term, which is what stops a mat vanishing mid-game
-- if the host presses finish.
--
-- Both halves live in one function, `playmat_visible_to_me`, so the storage
-- policy and anything added later cannot drift apart from each other.
--
-- ---------------------------------------------------------------------------
-- SIZE
-- ---------------------------------------------------------------------------
-- A mat is drawn behind up to 120 permanents, so this is a rendering budget
-- before it is a storage one. The widest mat this app has ever measured is
-- 1912 px across (a two-seat table on a 1920 px screen; the figures are in the
-- header of `Playmat.tsx`), so the client downscales every upload to a longest
-- edge of 1920 and re-encodes it. The bucket carries a 2 MB ceiling as the
-- server-side backstop, and eight mats per account as the quota.
--
-- Honest limit: the ceiling the database can enforce is BYTES, not PIXELS. A
-- hand-made request that skipped our downscaler could still put a very large
-- image inside 2 MB. Bounding pixels needs something that decodes the file,
-- which means an edge function or Storage image transformations, and neither
-- is built here. The 2 MB cap is what bounds the damage today.

-- ---------------------------------------------------------------------------
-- The bucket
-- ---------------------------------------------------------------------------
-- Private. `image/webp` is what the client produces; `image/png` is only here
-- because `canvas.toBlob` silently falls back to PNG where WebP encoding is
-- missing, and a hard upload failure on those browsers would be worse than a
-- larger file.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('playmats', 'playmats', false, 2097152, array['image/webp', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.playmats (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  name        text not null,
  -- Object inside the `playmats` bucket. Always '<user id>/<mat id>.<ext>',
  -- which is what the storage policies match the owner on.
  object_path text not null unique,
  mime        text not null,
  width       integer not null,
  height      integer not null,
  bytes       integer not null,
  created_at  timestamptz not null default now(),
  constraint playmats_name_len   check (char_length(name) between 1 and 60),
  constraint playmats_mime_check check (mime in ('image/webp', 'image/png')),
  -- The downscaler's own ceiling, restated where it cannot be skipped.
  constraint playmats_size_check check (
    width between 1 and 1920 and height between 1 and 1920
    and bytes > 0 and bytes <= 2097152
  )
);

comment on table public.playmats is
  'A player''s uploaded playmat. Private bucket; see playmat_visible_to_me for who may read the file.';

create index if not exists playmats_user_idx on public.playmats (user_id, created_at desc);

-- Style, colour and which upload is live. One row per account.
create table if not exists public.playmat_prefs (
  user_id    uuid primary key references auth.users on delete cascade,
  style      text not null default 'cloth',
  tint       text not null default 'deck',
  playmat_id uuid references public.playmats on delete set null,
  updated_at timestamptz not null default now(),
  -- Deliberately NOT an enum and not a list of the ids that exist today.
  -- `matStyleOf()` already coerces an unknown surface back to the default, and
  -- a check constraint here would mean the database rejecting a value the next
  -- release of the client considers valid. Length is the only real guard.
  constraint playmat_prefs_style_len check (char_length(style) between 1 and 32),
  constraint playmat_prefs_tint_len  check (char_length(tint)  between 1 and 32)
);

comment on table public.playmat_prefs is
  'The surface, colour and uploaded mat this account plays on. Reads are owner only; writes go through set_playmat_prefs.';

create index if not exists playmat_prefs_playmat_idx on public.playmat_prefs (playmat_id);

-- ---------------------------------------------------------------------------
-- Who may read a file
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER on purpose. The co-player half has to read `playmats`,
-- `playmat_prefs` and `game_participants`, all of which carry their own RLS,
-- and an inline EXISTS would be filtered by those policies before this one
-- ever got to decide. Definer also keeps it to a single index-driven pass on
-- every storage read.

create or replace function public.playmat_visible_to_me(p_object_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    -- Yours.
    select 1
      from public.playmats m
     where m.object_path = p_object_path
       and m.user_id = (select auth.uid())
  ) or exists (
    -- Live on the seat of somebody you are at a live table with.
    select 1
      from public.playmats m
      join public.playmat_prefs pr    on pr.playmat_id = m.id
      join public.game_participants theirs on theirs.user_id = m.user_id
      join public.game_participants mine   on mine.table_id = theirs.table_id
      join public.game_tables t            on t.id = theirs.table_id
     where m.object_path = p_object_path
       and mine.user_id = (select auth.uid())
       and t.status in ('lobby', 'playing')
  );
$$;

comment on function public.playmat_visible_to_me(text) is
  'The whole read rule for playmat files: the owner, or a player at a live table with them and only for the mat that seat is playing on.';

-- How many objects this account already has in the bucket. Definer so it
-- counts orphans too: an upload that never got a `playmats` row still occupies
-- storage, so it still has to count against the quota.
create or replace function public.playmat_object_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from storage.objects o
   where o.bucket_id = 'playmats'
     and (storage.foldername(o.name))[1] = (select auth.uid())::text;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.playmats      enable row level security;
alter table public.playmat_prefs enable row level security;

-- The rows are owner-only, on every command. A co-player never reads these
-- tables; they get the one path they need from `playmats_at_table` below.
drop policy if exists "your playmats are yours" on public.playmats;
create policy "your playmats are yours"
  on public.playmats for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "your playmat settings are yours" on public.playmat_prefs;
create policy "your playmat settings are yours"
  on public.playmat_prefs for select to authenticated
  using (user_id = (select auth.uid()));

-- Writes go through `set_playmat_prefs`, which is what checks that the mat you
-- are making live is actually one of yours. A direct write could point the
-- column at anybody's row.
revoke insert, update, delete on public.playmat_prefs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage policies
-- ---------------------------------------------------------------------------
-- storage.objects already has RLS on. These policies name the bucket, so no
-- other bucket changes behaviour.

drop policy if exists "playmat files are readable by their owner and their table" on storage.objects;
create policy "playmat files are readable by their owner and their table"
  on storage.objects for select to authenticated
  using (bucket_id = 'playmats' and public.playmat_visible_to_me(name));

-- You may only write inside a folder named with your own user id, and only
-- while you are under the quota. The folder rule is what makes every other
-- policy here able to identify an owner from the path alone.
drop policy if exists "you upload playmats into your own folder" on storage.objects;
create policy "you upload playmats into your own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'playmats'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.playmat_object_count() < 8
  );

drop policy if exists "you replace playmats in your own folder" on storage.objects;
create policy "you replace playmats in your own folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'playmats'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'playmats'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "you delete playmats from your own folder" on storage.objects;
create policy "you delete playmats from your own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'playmats'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- Writing
-- ---------------------------------------------------------------------------

-- Called after the file is in the bucket. It refuses to record a mat whose
-- object is not actually there, which is what stops the library filling with
-- rows pointing at nothing when an upload half fails.
create or replace function public.record_playmat(
  p_object_path text,
  p_name        text,
  p_mime        text,
  p_width       integer,
  p_height      integer,
  p_bytes       integer
) returns public.playmats
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_row  public.playmats;
begin
  if v_user is null then
    raise exception 'sign in to save a playmat';
  end if;

  if p_object_path is null or p_object_path not like v_user::text || '/%' then
    raise exception 'a playmat has to live in your own folder';
  end if;

  if not exists (
    select 1 from storage.objects
     where bucket_id = 'playmats' and name = p_object_path
  ) then
    raise exception 'that file is not in the bucket';
  end if;

  if (select count(*) from public.playmats where user_id = v_user) >= 8 then
    raise exception 'eight playmats is the limit';
  end if;

  insert into public.playmats (user_id, name, object_path, mime, width, height, bytes)
  values (
    v_user,
    left(coalesce(nullif(btrim(p_name), ''), 'Playmat'), 60),
    p_object_path, p_mime, p_width, p_height, p_bytes
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- Style, colour and the live mat, in one upsert. The client applies a choice
-- locally the instant it is made and calls this behind a short delay, so
-- trying the six surfaces is still six repaints and not six writes.
create or replace function public.set_playmat_prefs(
  p_style   text default null,
  p_tint    text default null,
  p_playmat uuid default null,
  -- Distinguishes "leave the mat alone" from "go back to a drawn surface",
  -- which a null p_playmat cannot do on its own.
  p_clear_playmat boolean default false
) returns public.playmat_prefs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_row  public.playmat_prefs;
begin
  if v_user is null then
    raise exception 'sign in to save your playmat';
  end if;

  if p_playmat is not null and not exists (
    select 1 from public.playmats where id = p_playmat and user_id = v_user
  ) then
    raise exception 'that playmat is not yours';
  end if;

  insert into public.playmat_prefs (user_id, style, tint, playmat_id)
  values (
    v_user,
    coalesce(nullif(btrim(p_style), ''), 'cloth'),
    coalesce(nullif(btrim(p_tint),  ''), 'deck'),
    case when p_clear_playmat then null else p_playmat end
  )
  on conflict (user_id) do update
    set style      = coalesce(nullif(btrim(p_style), ''), public.playmat_prefs.style),
        tint       = coalesce(nullif(btrim(p_tint),  ''), public.playmat_prefs.tint),
        playmat_id = case
                       when p_clear_playmat then null
                       when p_playmat is not null then p_playmat
                       else public.playmat_prefs.playmat_id
                     end,
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading somebody else's seat
-- ---------------------------------------------------------------------------
-- The board draws a mat per seat, so it needs the live mat of every player at
-- the table in one call rather than a lookup per seat. Definer, gated on the
-- caller being seated at that table, and it returns nothing but the path and
-- the shape of the image: never the rest of anyone's library.

create or replace function public.playmats_at_table(p_table uuid)
returns table (
  user_id     uuid,
  player_id   text,
  seat        smallint,
  object_path text,
  width       integer,
  height      integer
)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id, p.player_id, p.seat, m.object_path, m.width, m.height
    from public.game_participants p
    join public.playmat_prefs pr on pr.user_id = p.user_id
    join public.playmats m       on m.id = pr.playmat_id
   where p.table_id = p_table
     and exists (
       select 1 from public.game_participants mine
        where mine.table_id = p_table and mine.user_id = (select auth.uid())
     );
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- These two are called from inside the storage policies, and a policy is
-- evaluated as the caller, so `authenticated` genuinely needs EXECUTE on them.
-- Neither discloses anything the policy itself does not: one answers "may I
-- read this exact path", which is the answer the policy is about to give, and
-- the other counts your own folder.
revoke all on function public.playmat_visible_to_me(text) from anon, authenticated;
revoke all on function public.playmat_object_count()      from anon, authenticated;
grant execute on function public.playmat_visible_to_me(text) to authenticated;
grant execute on function public.playmat_object_count()      to authenticated;

revoke all on function public.record_playmat(text, text, text, integer, integer, integer) from anon, authenticated;
revoke all on function public.set_playmat_prefs(text, text, uuid, boolean)                from anon, authenticated;
revoke all on function public.playmats_at_table(uuid)                                     from anon, authenticated;

grant execute on function public.record_playmat(text, text, text, integer, integer, integer) to authenticated;
grant execute on function public.set_playmat_prefs(text, text, uuid, boolean)                to authenticated;
grant execute on function public.playmats_at_table(uuid)                                     to authenticated;

revoke all on public.playmats      from anon;
revoke all on public.playmat_prefs from anon;
