-- Online tables: a friend can join a game with a code.
--
-- IN DEVELOPMENT. This is the first pass at networked play and it is labelled
-- as such in the interface. Read src/lib/game/net/ before changing anything
-- here; the shapes in this file are the ones that folder already assumed.
--
-- ---------------------------------------------------------------------------
-- A game is its action log
-- ---------------------------------------------------------------------------
-- The rules reducer is pure and seeded, so a game IS its ordered list of
-- actions. Nothing here stores a GameState on every move. `game_actions` is an
-- append-only list of small rows, and reconnecting, spectating and replaying
-- are all the same read from different offsets.
--
-- `append_online_action` is the sequencer. It assigns `seq` under a per-table
-- advisory lock, it is idempotent on `batch_id` so a retry after a timeout
-- returns the original position instead of taking a second turn, and it fans
-- the batch out over Realtime from inside the same transaction, so the
-- sequence number and the broadcast can never disagree about the order.
--
-- ---------------------------------------------------------------------------
-- The part that matters most: hidden information
-- ---------------------------------------------------------------------------
-- Nothing in `game_actions` is secret. A client never receives another seat's
-- hand or library, because that information is never put on the wire at all.
--
-- Each player shuffles their own deck, exactly as they would at a table. The
-- shared game state holds anonymous slots: everyone can see that a seat has 63
-- cards in its library and that the top one just went to its hand, and nobody
-- can see what it was. The only identities that travel are the ones a real
-- table would also see, and they ride in `game_actions.reveals` on the same
-- batch as the action that made them public.
--
-- `game_seat_secrets` holds the two things that must never leave their owner:
-- the private shuffle seed and the deck list it is shuffled from. Its RLS is
-- `user_id = auth.uid()` on every command, so no other player at the table can
-- read it by any route. It is also what makes a rejoin work: the seed and the
-- deck rebuild the same private knowledge, and the log rebuilds the game.
--
-- `seed_commitment` on `game_participants` is published before the first draw.
-- It is digest(seed | table id), so a seat that stacked its own deck can be
-- caught afterwards by disclosing the seed and re-deriving the shuffle. The
-- disclosure step is NOT built yet. The commitment is recorded now because it
-- has to be recorded before the game, not after.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.game_tables (
  id               uuid primary key default gen_random_uuid(),
  -- Short, spoken-aloud friendly, no characters that look like each other.
  code             text not null unique,
  format           text not null default 'commander',
  status           text not null default 'lobby',
  host_user        uuid not null references auth.users on delete cascade,
  max_seats        smallint not null default 4,
  -- Permutes anonymous slots only, so publishing it reveals nothing.
  public_seed      integer not null default 1,
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz,
  last_activity_at timestamptz not null default now(),
  constraint game_tables_status_check
    check (status in ('lobby', 'playing', 'finished', 'abandoned')),
  constraint game_tables_seats_check check (max_seats between 2 and 4)
);

comment on table public.game_tables is
  'One online game. In development. Joined by code, played by folding game_actions.';

create table if not exists public.game_participants (
  table_id        uuid not null references public.game_tables on delete cascade,
  user_id         uuid not null references auth.users on delete cascade,
  seat            smallint not null,
  -- The seat id inside GameState: p1..p4. Derived from seat, never chosen.
  player_id       text not null,
  display_name    text not null,
  deck_id         uuid,
  deck_name       text,
  deck_size       integer not null default 0,
  -- Public from the first frame, as they are on a real table.
  commanders      jsonb not null default '[]'::jsonb,
  -- digest(secret seed | table id). Published before the deal.
  seed_commitment text,
  ready           boolean not null default false,
  joined_at       timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  primary key (table_id, user_id),
  unique (table_id, seat),
  unique (table_id, player_id),
  constraint game_participants_seat_check check (seat between 0 and 3)
);

comment on column public.game_participants.deck_size is
  'How many cards are in that library. Public. What they are is not.';

-- The two things that must never leave their owner.
create table if not exists public.game_seat_secrets (
  table_id    uuid not null references public.game_tables on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  secret_seed bigint not null,
  -- The seat's own deck, in the order it was handed over. Only this user reads it.
  deck        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (table_id, user_id)
);

-- The game. Append-only: there is deliberately no update and no delete policy.
create table if not exists public.game_actions (
  table_id     uuid not null references public.game_tables on delete cascade,
  seq          bigint not null,
  batch_id     text not null,
  user_id      uuid not null references auth.users on delete cascade,
  player_id    text not null,
  seat         smallint not null,
  base_version integer not null,
  actions      jsonb not null,
  -- Card identities this batch made public. Never anything hidden.
  reveals      jsonb not null default '{}'::jsonb,
  at           bigint not null,
  created_at   timestamptz not null default now(),
  primary key (table_id, seq),
  unique (table_id, batch_id)
);

create index if not exists game_participants_user_idx
  on public.game_participants (user_id);
create index if not exists game_tables_host_idx
  on public.game_tables (host_user, created_at desc);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.game_tables       enable row level security;
alter table public.game_participants enable row level security;
alter table public.game_seat_secrets enable row level security;
alter table public.game_actions      enable row level security;

-- Writes go through the SECURITY DEFINER functions below, so the tables
-- themselves grant no insert or update to a client. A client that could write
-- its own row could pick its own seat, its own sequence number, or somebody
-- else's deck size.
revoke insert, update, delete on public.game_tables       from anon, authenticated;
revoke insert, update, delete on public.game_participants from anon, authenticated;
revoke insert, update, delete on public.game_actions      from anon, authenticated;

drop policy if exists "players read their own table" on public.game_tables;
create policy "players read their own table"
  on public.game_tables for select to authenticated
  using (
    host_user = (select auth.uid())
    or exists (
      select 1 from public.game_participants p
      where p.table_id = game_tables.id and p.user_id = (select auth.uid())
    )
  );

drop policy if exists "players read who else is at their table" on public.game_participants;
create policy "players read who else is at their table"
  on public.game_participants for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.game_participants mine
      where mine.table_id = game_participants.table_id
        and mine.user_id = (select auth.uid())
    )
  );

drop policy if exists "players read the log of their own table" on public.game_actions;
create policy "players read the log of their own table"
  on public.game_actions for select to authenticated
  using (exists (
    select 1 from public.game_participants p
    where p.table_id = game_actions.table_id and p.user_id = (select auth.uid())
  ));

-- Deliberately absent: any update or delete policy on game_actions. Append-only
-- is enforced by the absence of a policy, not by a convention.

-- Your deck and your shuffle seed. Yours alone, on every command. This one
-- policy is the whole hidden-information guarantee at the database.
drop policy if exists "a seat's secrets belong to that seat" on public.game_seat_secrets;
create policy "a seat's secrets belong to that seat"
  on public.game_seat_secrets for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Realtime authorisation
-- ---------------------------------------------------------------------------
-- Private channels are gated by RLS on realtime.messages. Keep these cheap:
-- they run on every channel join, and complex predicates here raise connection
-- latency and lower the join rate.
--
-- Topic is 'game:' || table id. These policies grant access to that topic and
-- to nothing else, so no existing channel changes behaviour.

drop policy if exists "players listen on their own game channel" on realtime.messages;
create policy "players listen on their own game channel"
  on realtime.messages for select to authenticated
  using (exists (
    select 1 from public.game_participants p
    where p.user_id = (select auth.uid())
      and 'game:' || p.table_id::text = (select realtime.topic())
  ));

drop policy if exists "players speak on their own game channel" on realtime.messages;
create policy "players speak on their own game channel"
  on realtime.messages for insert to authenticated
  with check (exists (
    select 1 from public.game_participants p
    where p.user_id = (select auth.uid())
      and 'game:' || p.table_id::text = (select realtime.topic())
  ));

-- ---------------------------------------------------------------------------
-- Codes
-- ---------------------------------------------------------------------------

-- No 0/O, no 1/I/L. A code gets read out loud over a call.
create or replace function public.new_game_table_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_try  int := 0;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.game_tables where code = v_code);
    v_try := v_try + 1;
    if v_try > 40 then
      raise exception 'could not find a free table code';
    end if;
  end loop;
  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sitting down
-- ---------------------------------------------------------------------------

create or replace function public.create_online_table(
  p_display_name    text,
  p_format          text default 'commander',
  p_deck_id         uuid default null,
  p_deck_name       text default null,
  p_deck_size       integer default 0,
  p_commanders      jsonb default '[]'::jsonb,
  p_seed_commitment text default null,
  p_secret_seed     bigint default null,
  p_deck            jsonb default null,
  p_max_seats       smallint default 4
) returns public.game_tables
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_table public.game_tables;
begin
  if v_user is null then
    raise exception 'sign in to open a table';
  end if;

  insert into public.game_tables (code, format, host_user, max_seats)
  values (public.new_game_table_code(), p_format, v_user, greatest(2, least(4, p_max_seats)))
  returning * into v_table;

  insert into public.game_participants (
    table_id, user_id, seat, player_id, display_name,
    deck_id, deck_name, deck_size, commanders, seed_commitment
  )
  values (
    v_table.id, v_user, 0, 'p1', p_display_name,
    p_deck_id, p_deck_name, coalesce(p_deck_size, 0),
    coalesce(p_commanders, '[]'::jsonb), p_seed_commitment
  );

  if p_secret_seed is not null and p_deck is not null then
    insert into public.game_seat_secrets (table_id, user_id, secret_seed, deck)
    values (v_table.id, v_user, p_secret_seed, p_deck);
  end if;

  return v_table;
end;
$$;

create or replace function public.join_online_table(
  p_code            text,
  p_display_name    text,
  p_deck_id         uuid default null,
  p_deck_name       text default null,
  p_deck_size       integer default 0,
  p_commanders      jsonb default '[]'::jsonb,
  p_seed_commitment text default null,
  p_secret_seed     bigint default null,
  p_deck            jsonb default null
) returns public.game_tables
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_table public.game_tables;
  v_seat  smallint;
  v_taken smallint;
begin
  if v_user is null then
    raise exception 'sign in to join a table';
  end if;

  select * into v_table from public.game_tables
   where code = upper(trim(p_code));
  if not found then
    raise exception 'no table with that code';
  end if;

  -- Already sat down. Joining again updates the seat rather than failing, which
  -- is what a reconnect and a deck change both look like from here.
  if exists (select 1 from public.game_participants
              where table_id = v_table.id and user_id = v_user) then
    if v_table.status = 'lobby' then
      update public.game_participants
         set display_name = p_display_name,
             deck_id = p_deck_id,
             deck_name = p_deck_name,
             deck_size = coalesce(p_deck_size, deck_size),
             commanders = coalesce(p_commanders, commanders),
             seed_commitment = coalesce(p_seed_commitment, seed_commitment),
             last_seen_at = now()
       where table_id = v_table.id and user_id = v_user;

      if p_secret_seed is not null and p_deck is not null then
        insert into public.game_seat_secrets (table_id, user_id, secret_seed, deck)
        values (v_table.id, v_user, p_secret_seed, p_deck)
        on conflict (table_id, user_id)
          do update set secret_seed = excluded.secret_seed,
                        deck = excluded.deck,
                        updated_at = now();
      end if;
    else
      update public.game_participants set last_seen_at = now()
       where table_id = v_table.id and user_id = v_user;
    end if;

    return v_table;
  end if;

  if v_table.status <> 'lobby' then
    raise exception 'that game has already started';
  end if;

  -- Lock the table row so two people pressing join at once cannot both take
  -- the same seat.
  perform 1 from public.game_tables where id = v_table.id for update;

  select count(*)::smallint into v_taken
    from public.game_participants where table_id = v_table.id;
  if v_taken >= v_table.max_seats then
    raise exception 'that table is full';
  end if;

  select coalesce(min(s.seat), 0)::smallint into v_seat
    from generate_series(0, v_table.max_seats - 1) as s(seat)
   where not exists (
     select 1 from public.game_participants p
      where p.table_id = v_table.id and p.seat = s.seat
   );

  insert into public.game_participants (
    table_id, user_id, seat, player_id, display_name,
    deck_id, deck_name, deck_size, commanders, seed_commitment
  )
  values (
    v_table.id, v_user, v_seat, 'p' || (v_seat + 1)::text, p_display_name,
    p_deck_id, p_deck_name, coalesce(p_deck_size, 0),
    coalesce(p_commanders, '[]'::jsonb), p_seed_commitment
  );

  if p_secret_seed is not null and p_deck is not null then
    insert into public.game_seat_secrets (table_id, user_id, secret_seed, deck)
    values (v_table.id, v_user, p_secret_seed, p_deck)
    on conflict (table_id, user_id)
      do update set secret_seed = excluded.secret_seed, deck = excluded.deck, updated_at = now();
  end if;

  update public.game_tables set last_activity_at = now() where id = v_table.id;

  return v_table;
end;
$$;

-- Look up a table by its code without being seated at it yet. Returns only
-- what a person typing a code needs to see before they commit to joining.
create or replace function public.peek_online_table(p_code text)
returns table (
  id         uuid,
  code       text,
  format     text,
  status     text,
  max_seats  smallint,
  seats_taken integer,
  host_name  text
)
language sql
security definer
stable
set search_path = public
as $$
  select t.id, t.code, t.format, t.status, t.max_seats,
         (select count(*)::int from public.game_participants p where p.table_id = t.id),
         (select p.display_name from public.game_participants p
           where p.table_id = t.id and p.user_id = t.host_user)
    from public.game_tables t
   where t.code = upper(trim(p_code));
$$;

create or replace function public.set_online_seat(
  p_table           uuid,
  p_display_name    text default null,
  p_deck_id         uuid default null,
  p_deck_name       text default null,
  p_deck_size       integer default null,
  p_commanders      jsonb default null,
  p_seed_commitment text default null,
  p_secret_seed     bigint default null,
  p_deck            jsonb default null,
  p_ready           boolean default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_status text;
begin
  select status into v_status from public.game_tables where id = p_table;
  if v_status is null then
    raise exception 'no such table';
  end if;
  if v_status <> 'lobby' then
    raise exception 'the game has already started';
  end if;

  update public.game_participants
     set display_name    = coalesce(p_display_name, display_name),
         deck_id         = coalesce(p_deck_id, deck_id),
         deck_name       = coalesce(p_deck_name, deck_name),
         deck_size       = coalesce(p_deck_size, deck_size),
         commanders      = coalesce(p_commanders, commanders),
         seed_commitment = coalesce(p_seed_commitment, seed_commitment),
         ready           = coalesce(p_ready, ready),
         last_seen_at    = now()
   where table_id = p_table and user_id = v_user;

  if not found then
    raise exception 'you are not at this table';
  end if;

  if p_secret_seed is not null and p_deck is not null then
    insert into public.game_seat_secrets (table_id, user_id, secret_seed, deck)
    values (p_table, v_user, p_secret_seed, p_deck)
    on conflict (table_id, user_id)
      do update set secret_seed = excluded.secret_seed, deck = excluded.deck, updated_at = now();
  end if;

  update public.game_tables set last_activity_at = now() where id = p_table;

  perform realtime.send(
    jsonb_build_object('kind', 'lobby'),
    'lobby',
    'game:' || p_table::text,
    true
  );
end;
$$;

create or replace function public.leave_online_table(p_table uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  -- Leaving a game in progress does not remove the seat. The log already
  -- contains that player's turns and a seat that vanished mid-game would make
  -- the log unfoldable. It only marks them away.
  if exists (select 1 from public.game_tables where id = p_table and status = 'lobby') then
    delete from public.game_participants where table_id = p_table and user_id = v_user;
    delete from public.game_seat_secrets where table_id = p_table and user_id = v_user;
    -- An empty lobby is nothing. Tidy it away rather than leaving a code that
    -- looks joinable and is not.
    delete from public.game_tables t
     where t.id = p_table
       and not exists (select 1 from public.game_participants p where p.table_id = t.id);
  end if;

  perform realtime.send(
    jsonb_build_object('kind', 'lobby'),
    'lobby',
    'game:' || p_table::text,
    true
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Starting
-- ---------------------------------------------------------------------------

create or replace function public.start_online_table(p_table uuid, p_public_seed integer default 1)
returns public.game_tables
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_table public.game_tables;
  v_seats int;
begin
  select * into v_table from public.game_tables where id = p_table for update;
  if not found then
    raise exception 'no such table';
  end if;
  if v_table.host_user <> v_user then
    raise exception 'only the host can start the game';
  end if;
  if v_table.status <> 'lobby' then
    return v_table;
  end if;

  select count(*) into v_seats from public.game_participants where table_id = p_table;
  if v_seats < 2 then
    raise exception 'a game needs at least two seats';
  end if;
  if exists (select 1 from public.game_participants
              where table_id = p_table and (deck_size <= 0 or seed_commitment is null)) then
    raise exception 'every seat needs a deck before the game can start';
  end if;

  update public.game_tables
     set status = 'playing',
         started_at = now(),
         public_seed = coalesce(p_public_seed, 1),
         last_activity_at = now()
   where id = p_table
  returning * into v_table;

  perform realtime.send(
    jsonb_build_object('kind', 'start', 'tableId', p_table::text),
    'start',
    'game:' || p_table::text,
    true
  );

  return v_table;
end;
$$;

create or replace function public.finish_online_table(p_table uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.game_tables
     set status = 'finished', finished_at = now(), last_activity_at = now()
   where id = p_table
     and host_user = auth.uid()
     and status = 'playing';
end;
$$;

-- ---------------------------------------------------------------------------
-- The sequencer
-- ---------------------------------------------------------------------------
-- Every batch goes through here. It assigns seq, it is idempotent on batch_id,
-- and it broadcasts from inside the same transaction so the order the database
-- recorded and the order the other clients hear can never disagree.

create or replace function public.append_online_action(
  p_table   uuid,
  p_batch   text,
  p_player  text,
  p_seat    smallint,
  p_base    integer,
  p_actions jsonb,
  p_reveals jsonb default '{}'::jsonb,
  p_at      bigint default 0
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_seq  bigint;
begin
  if jsonb_typeof(p_actions) <> 'array' or jsonb_array_length(p_actions) = 0 then
    raise exception 'an empty batch is not a move';
  end if;

  -- Only for your own seat, only at a table you sit at, only while it is live.
  if not exists (
    select 1
      from public.game_participants gp
      join public.game_tables gt on gt.id = gp.table_id
     where gp.table_id = p_table
       and gp.user_id = v_user
       and gp.player_id = p_player
       and gp.seat = p_seat
       and gt.status = 'playing'
  ) then
    raise exception 'not your seat, or the game is not running';
  end if;

  select seq into v_seq from public.game_actions
   where table_id = p_table and batch_id = p_batch;
  if found then
    return v_seq;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_table::text, 0));

  select coalesce(max(seq), 0) + 1 into v_seq
    from public.game_actions where table_id = p_table;

  insert into public.game_actions (
    table_id, seq, batch_id, user_id, player_id, seat, base_version, actions, reveals, at
  )
  values (
    p_table, v_seq, p_batch, v_user, p_player, p_seat, p_base,
    p_actions, coalesce(p_reveals, '{}'::jsonb), p_at
  );

  update public.game_tables set last_activity_at = now() where id = p_table;

  perform realtime.send(
    jsonb_build_object(
      'kind', 'entry',
      'tableId', p_table::text,
      'seq', v_seq,
      'batchId', p_batch,
      'playerId', p_player,
      'seat', p_seat,
      'baseVersion', p_base,
      'actions', p_actions,
      'reveals', coalesce(p_reveals, '{}'::jsonb),
      'at', p_at
    ),
    'entry',
    'game:' || p_table::text,
    true
  );

  return v_seq;
end;
$$;

-- ---------------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------------
-- Deliberately NOT scheduled. Cron jobs on this project have outlived the work
-- that made them before; this one gets a schedule when somebody decides it
-- needs one, and CLAUDE.md records why that rule exists.

create or replace function public.purge_stale_online_tables(p_days integer default 3)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gone integer;
begin
  with removed as (
    delete from public.game_tables
     where last_activity_at < now() - make_interval(days => greatest(1, p_days))
    returning 1
  )
  select count(*)::int into v_gone from removed;
  return v_gone;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.new_game_table_code()        from anon, authenticated;
revoke all on function public.purge_stale_online_tables(integer) from anon, authenticated;

grant execute on function public.create_online_table(text, text, uuid, text, integer, jsonb, text, bigint, jsonb, smallint) to authenticated;
grant execute on function public.join_online_table(text, text, uuid, text, integer, jsonb, text, bigint, jsonb) to authenticated;
grant execute on function public.peek_online_table(text) to authenticated;
grant execute on function public.set_online_seat(uuid, text, uuid, text, integer, jsonb, text, bigint, jsonb, boolean) to authenticated;
grant execute on function public.leave_online_table(uuid) to authenticated;
grant execute on function public.start_online_table(uuid, integer) to authenticated;
grant execute on function public.finish_online_table(uuid) to authenticated;
grant execute on function public.append_online_action(uuid, text, text, smallint, integer, jsonb, jsonb, bigint) to authenticated;
