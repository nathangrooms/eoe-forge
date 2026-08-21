-- The lobby: tables people can see, open, share and join.
--
-- The online half of play mode already had a database (20260819233431) and a
-- set of RPCs with, at the time of writing, zero callers. What it did NOT have
-- is any way to FIND a table. Every SELECT policy on `game_tables` is scoped to
-- "a table you already sit at", which is correct for a game and useless for a
-- lobby: a stranger looking for an opponent can read nothing at all. This
-- migration adds the four things a lobby needs and nothing else.
--
--   1. one cheap read that returns every open table with its seats filled in
--   2. one cheap read that returns a single table's room, for the seat screen
--   3. a place to talk while you wait
--   4. a nudge over Realtime when any of the above changes, so nothing polls
--
-- ---------------------------------------------------------------------------
-- WHY A FUNCTION AND NOT A POLICY
-- ---------------------------------------------------------------------------
-- The obvious alternative is to loosen the SELECT policy on `game_tables` to
-- "status = 'lobby'". That would make the lobby readable and would also expose
-- `game_participants` joins to anyone, and it would put the seat counting in
-- the client, which is how this project got a 421-request page. A SECURITY
-- DEFINER function is one round trip, returns exactly the columns a lobby row
-- draws, and cannot be widened by a future `select *`.
--
-- ---------------------------------------------------------------------------
-- ONE QUERY, AND WHAT THAT MEANS HERE
-- ---------------------------------------------------------------------------
-- `open_game_tables()` is a single grouped statement over `game_tables` left
-- joined to `game_participants`. Seats filled, the host's name and the list of
-- who is already sitting all come out of the same aggregate. There is no
-- per-table lookup anywhere in it, and the client never loops.
--
-- ---------------------------------------------------------------------------
-- THE RULE FOR A TABLE NOBODY IS SITTING AT
-- ---------------------------------------------------------------------------
-- Two rules, and they are different because the two situations are different.
--
--   EMPTY  the moment the last person leaves a lobby, the table is deleted.
--          That already happens, inside `leave_online_table`.
--   IDLE   a lobby with people in it but no activity for 30 minutes is gone.
--          Somebody closed the tab. A code that looks joinable and is not is
--          worse than no code.
--
-- The sweep is NOT a cron job. CLAUDE.md records two outages caused by cron
-- jobs that outlived the work that made them, so the sweep runs inside
-- `open_game_tables()` behind an EXISTS guard: the DELETE only happens when
-- there is actually something stale, and once it has happened the guard is
-- false for every other caller. The cost is therefore bounded by the amount of
-- rubbish, not by the number of people looking at the lobby.
--
-- 30 minutes is a judgement, not a measurement. It is longer than a coffee and
-- shorter than an evening.
--
-- ---------------------------------------------------------------------------
-- THE ENTRY RULE IS ENFORCED ON THE SEAT, NOT IN EACH RPC
-- ---------------------------------------------------------------------------
-- Owner: signed in, and holding at least one deck. Signed in is `auth.uid()`.
-- The deck half is a BEFORE INSERT trigger on `game_participants`, so it holds
-- on `create_online_table`, on `join_online_table`, and on anything added
-- later, rather than being copied into three function bodies where the fourth
-- one forgets. `start_online_table` already refuses a seat with no deck size
-- and no commitment; this is the earlier, friendlier half of the same rule.
--
-- A deck with no cards in it does not count. Somebody with nine empty decks
-- has nothing to play, and letting them sit down only moves the refusal to the
-- moment the host presses start.
--
-- ---------------------------------------------------------------------------
-- DISPLAY NAMES ARE NOT USERNAMES
-- ---------------------------------------------------------------------------
-- `profiles.username` is world readable and CLAUDE.md records that two of them
-- are raw email addresses. A lobby list and an open chat are exactly the two
-- surfaces that would publish those to every signed-in account. Every name
-- written by a client goes through `safe_display_name`, which cuts at the '@',
-- strips control characters and caps the length. The client cannot opt out of
-- it because the trigger runs after the client.

-- ---------------------------------------------------------------------------
-- Visibility
-- ---------------------------------------------------------------------------
-- Two ways in, and the host picks. 'public' is listed in the lobby and can also
-- be shared as a link. 'link' is not listed and can only be reached by someone
-- holding the code. Defaulting to 'public' is what makes the lobby have
-- anything in it.

alter table public.game_tables
  add column if not exists visibility text not null default 'public';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'game_tables_visibility_check'
  ) then
    alter table public.game_tables
      add constraint game_tables_visibility_check
      check (visibility in ('public', 'link'));
  end if;
end;
$$;

comment on column public.game_tables.visibility is
  'public: listed in the lobby. link: reachable only with the code. Either can be shared as a link.';

-- The lobby list reads exactly this slice, and the idle sweep reads it too.
create index if not exists game_tables_open_lobby_idx
  on public.game_tables (last_activity_at desc)
  where status = 'lobby';

-- ---------------------------------------------------------------------------
-- Names
-- ---------------------------------------------------------------------------

create or replace function public.safe_display_name(p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(
    nullif(
      left(
        btrim(
          regexp_replace(
            split_part(coalesce(p_name, ''), '@', 1),
            '[[:cntrl:]]', '', 'g'
          )
        ),
        24
      ),
      ''
    ),
    'Player'
  );
$$;

comment on function public.safe_display_name(text) is
  'A name safe to show every signed-in account. Cuts at the @ so a username that is an email address never becomes one on screen.';

-- ---------------------------------------------------------------------------
-- The entry rule, on the seat itself
-- ---------------------------------------------------------------------------

create or replace function public.a_seat_needs_a_deck()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.display_name := public.safe_display_name(new.display_name);

  if not exists (
    select 1
      from public.user_decks d
     where d.user_id = new.user_id
       and exists (
         select 1 from public.deck_cards c
          where c.deck_id = d.id
            and coalesce(c.is_sideboard, false) = false
       )
     limit 1
  ) then
    raise exception 'you need one deck with cards in it before you can sit down'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.a_seat_needs_a_deck() is
  'The owner''s entry rule, in one place: a seat belongs to somebody holding at least one deck that has cards in it.';

drop trigger if exists game_participants_entry_rule on public.game_participants;
create trigger game_participants_entry_rule
  before insert on public.game_participants
  for each row execute function public.a_seat_needs_a_deck();

-- A rename after sitting down goes through the same cleaner. Only the name, so
-- a deck deleted mid-lobby does not throw somebody out of a seat they are
-- already in; the start check covers that case and is the right place for it.
create or replace function public.a_seat_name_is_public()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.display_name := public.safe_display_name(new.display_name);
  return new;
end;
$$;

drop trigger if exists game_participants_clean_name on public.game_participants;
create trigger game_participants_clean_name
  before update of display_name on public.game_participants
  for each row execute function public.a_seat_name_is_public();

-- ---------------------------------------------------------------------------
-- Somewhere to talk
-- ---------------------------------------------------------------------------
-- One room, everybody in it, newest at the bottom. A forum thread, not a chat
-- product: no rooms, no threads, no direct messages, no presence list. The
-- thing it has to do is let somebody say "anyone up for a four player game"
-- and let somebody else answer.
--
-- Posts are kept for 24 hours. A lobby message is about right now, and a
-- permanent public record of them is a moderation obligation this project has
-- not signed up for. The sweep rides along with the table sweep.

create table if not exists public.lobby_posts (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users on delete cascade,
  display_name text not null,
  body         text not null,
  -- Set when the post is about a table, so the message can carry a way in.
  table_code   text,
  created_at   timestamptz not null default now(),
  constraint lobby_posts_body_length
    check (char_length(btrim(body)) between 1 and 500)
);

comment on table public.lobby_posts is
  'The open lobby discussion. Signed-in accounts read all of it; writes go through post_lobby_message. Kept 24 hours.';

create index if not exists lobby_posts_recent_idx
  on public.lobby_posts (created_at desc);
-- The rate limit reads this, once per post.
create index if not exists lobby_posts_author_recent_idx
  on public.lobby_posts (user_id, created_at desc);

alter table public.lobby_posts enable row level security;

-- Writes go through the function, so the table grants none. A client that could
-- insert directly could post under any name it liked, including somebody
-- else's, and skip the rate limit while it was there.
revoke insert, update on public.lobby_posts from anon, authenticated;
revoke truncate on public.lobby_posts from anon, authenticated;
revoke all on public.lobby_posts from anon;
grant select, delete on public.lobby_posts to authenticated;

drop policy if exists "signed in players read the lobby" on public.lobby_posts;
create policy "signed in players read the lobby"
  on public.lobby_posts for select to authenticated
  using (true);

drop policy if exists "you can take back your own post" on public.lobby_posts;
create policy "you can take back your own post"
  on public.lobby_posts for delete to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.post_lobby_message(
  p_body         text,
  p_display_name text default null,
  p_table_code   text default null
) returns public.lobby_posts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_recent integer;
  v_row    public.lobby_posts;
begin
  if v_user is null then
    raise exception 'sign in to post in the lobby';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'write something first';
  end if;

  -- A ceiling, not a throttle. It stops a runaway loop and a flood, and a
  -- person typing will never reach it.
  select count(*) into v_recent
    from public.lobby_posts
   where user_id = v_user
     and created_at > now() - interval '60 seconds';
  if v_recent >= 12 then
    raise exception 'that is a lot of messages in a minute. Give it a moment.';
  end if;

  insert into public.lobby_posts (user_id, display_name, body, table_code)
  values (
    v_user,
    public.safe_display_name(
      coalesce(p_display_name, (select username from public.profiles where id = v_user))
    ),
    left(btrim(p_body), 500),
    nullif(upper(btrim(coalesce(p_table_code, ''))), '')
  )
  returning * into v_row;

  perform realtime.send(
    jsonb_build_object(
      'kind', 'chat',
      'id', v_row.id,
      'userId', v_row.user_id,
      'name', v_row.display_name,
      'body', v_row.body,
      'tableCode', v_row.table_code,
      'createdAt', v_row.created_at
    ),
    'chat',
    'lobby',
    true
  );

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- The lobby channel
-- ---------------------------------------------------------------------------
-- Topic 'lobby'. Every signed-in account may LISTEN. Nobody may SPEAK on it
-- from a client: every message on this topic is sent by one of the SECURITY
-- DEFINER functions below, which run as the owner and are not subject to this
-- policy. That is what stops a client forging "a table opened" or a chat
-- message from somebody else, and it is why there is no INSERT policy here.
--
-- The two existing policies on realtime.messages are scoped by
-- may_use_game_topic(), which is false for 'lobby', so nothing about a game
-- channel changes.

drop policy if exists "signed in players listen to the lobby" on realtime.messages;
create policy "signed in players listen to the lobby"
  on realtime.messages for select to authenticated
  using ((select realtime.topic()) = 'lobby');

-- One nudge, no payload worth trusting. A client that hears it re-reads
-- `open_game_tables()`, which is the only thing that decides what is true. The
-- alternative, putting the changed row in the message, means a client's list
-- can drift from the database and never notice.
create or replace function public.nudge_the_lobby()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.send(
    jsonb_build_object('kind', 'tables'),
    'tables',
    'lobby',
    true
  );
  return null;
end;
$$;

-- Statement level, not row level: one message per statement however many rows
-- it touched. The idle sweep deletes several tables in one DELETE and should
-- cost one nudge, not one per table.
drop trigger if exists game_tables_nudge_insert on public.game_tables;
create trigger game_tables_nudge_insert
  after insert on public.game_tables
  for each statement execute function public.nudge_the_lobby();

drop trigger if exists game_tables_nudge_delete on public.game_tables;
create trigger game_tables_nudge_delete
  after delete on public.game_tables
  for each statement execute function public.nudge_the_lobby();

-- Only these columns. `append_online_action` touches `last_activity_at` on
-- every batch of a live game, and a nudge per action would be a broadcast storm
-- that no lobby needs.
drop trigger if exists game_tables_nudge_update on public.game_tables;
create trigger game_tables_nudge_update
  after update of status, visibility, max_seats on public.game_tables
  for each statement execute function public.nudge_the_lobby();

drop trigger if exists game_participants_nudge_insert on public.game_participants;
create trigger game_participants_nudge_insert
  after insert on public.game_participants
  for each statement execute function public.nudge_the_lobby();

drop trigger if exists game_participants_nudge_delete on public.game_participants;
create trigger game_participants_nudge_delete
  after delete on public.game_participants
  for each statement execute function public.nudge_the_lobby();

-- `join_online_table` bumps only `last_seen_at` on a reconnect, which is not a
-- lobby change and is deliberately not in this list.
drop trigger if exists game_participants_nudge_update on public.game_participants;
create trigger game_participants_nudge_update
  after update of ready, deck_id, deck_name, deck_size, commanders, display_name,
                  seed_commitment
  on public.game_participants
  for each statement execute function public.nudge_the_lobby();

-- ---------------------------------------------------------------------------
-- The list
-- ---------------------------------------------------------------------------

create or replace function public.open_game_tables()
returns table (
  id               uuid,
  code             text,
  format           text,
  visibility       text,
  max_seats        smallint,
  seats_taken      integer,
  host_name        text,
  seated           boolean,
  created_at       timestamptz,
  last_activity_at timestamptz,
  seats            jsonb
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  -- See the note at the top of this file. Not a measurement.
  v_idle constant interval := interval '30 minutes';
  v_cut  timestamptz := now() - v_idle;
begin
  if v_user is null then
    raise exception 'sign in to see the lobby';
  end if;

  -- The sweep. Guarded, so the write only happens when there is something to
  -- write off, and it is served by game_tables_open_lobby_idx.
  if exists (
    select 1 from public.game_tables t
     where t.status = 'lobby' and t.last_activity_at < v_cut
  ) then
    delete from public.game_tables t
     where t.status = 'lobby' and t.last_activity_at < v_cut;
  end if;

  if exists (
    select 1 from public.lobby_posts p
     where p.created_at < now() - interval '24 hours'
  ) then
    delete from public.lobby_posts p
     where p.created_at < now() - interval '24 hours';
  end if;

  return query
    select t.id,
           t.code,
           t.format,
           t.visibility,
           t.max_seats,
           count(p.user_id)::integer,
           max(p.display_name) filter (where p.user_id = t.host_user),
           coalesce(bool_or(p.user_id = v_user), false),
           t.created_at,
           t.last_activity_at,
           coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'seat', p.seat,
                 'name', p.display_name,
                 'deckName', p.deck_name,
                 'deckSize', p.deck_size,
                 'commanders', p.commanders,
                 'ready', p.ready,
                 'isHost', p.user_id = t.host_user
               ) order by p.seat
             ) filter (where p.user_id is not null),
             '[]'::jsonb
           )
      from public.game_tables t
      left join public.game_participants p on p.table_id = t.id
     where t.status = 'lobby'
       and (
         t.visibility = 'public'
         or t.host_user = v_user
         -- A link-only table you are already sitting at still belongs in your
         -- lobby, because that is where you go to rejoin it.
         or exists (
           select 1 from public.game_participants me
            where me.table_id = t.id and me.user_id = v_user
         )
       )
     group by t.id, t.code, t.format, t.visibility, t.max_seats,
              t.created_at, t.last_activity_at, t.host_user
     order by t.last_activity_at desc
     limit 60;
end;
$$;

comment on function public.open_game_tables() is
  'Every open table, in one grouped query, with seats filled and who is in them. Sweeps lobbies idle for 30 minutes on the way past.';

-- ---------------------------------------------------------------------------
-- One table's room
-- ---------------------------------------------------------------------------
-- What the seat screen redraws on every nudge, so it is one statement and
-- returns one row. `at_game_table` is the SECURITY DEFINER membership helper
-- from 20260820003227; asking the question any other way is what caused the
-- 42P17 recursion that migration exists to fix.

create or replace function public.online_table_room(p_table uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', t.id,
    'code', t.code,
    'format', t.format,
    'status', t.status,
    'visibility', t.visibility,
    'maxSeats', t.max_seats,
    'hostUser', t.host_user,
    'publicSeed', t.public_seed,
    'createdAt', t.created_at,
    'startedAt', t.started_at,
    'lastActivityAt', t.last_activity_at,
    'seats', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'userId', p.user_id,
                 'seat', p.seat,
                 'playerId', p.player_id,
                 'name', p.display_name,
                 'deckId', p.deck_id,
                 'deckName', p.deck_name,
                 'deckSize', p.deck_size,
                 'commanders', p.commanders,
                 -- The commitment itself is nobody's business until the
                 -- disclosure step exists. Whether there is one is what the
                 -- room needs to draw a tick.
                 'committed', p.seed_commitment is not null,
                 'ready', p.ready,
                 'joinedAt', p.joined_at,
                 'lastSeenAt', p.last_seen_at
               ) order by p.seat
             )
        from public.game_participants p
       where p.table_id = t.id
    ), '[]'::jsonb)
  )
  from public.game_tables t
  where t.id = p_table
    and (public.at_game_table(t.id) or t.host_user = (select auth.uid()));
$$;

comment on function public.online_table_room(uuid) is
  'One table and its seats, as one row, for the seat screen. Null when you are not at it.';

-- ---------------------------------------------------------------------------
-- The host's switch
-- ---------------------------------------------------------------------------

create or replace function public.set_online_table_visibility(
  p_table      uuid,
  p_visibility text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_visibility not in ('public', 'link') then
    raise exception 'a table is either public or link only';
  end if;

  update public.game_tables
     set visibility = p_visibility,
         last_activity_at = now()
   where id = p_table
     and host_user = auth.uid()
     and status = 'lobby';

  if not found then
    raise exception 'only the host can change that, and only before the game starts';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Revoking from `authenticated` removes nothing on its own: CREATE FUNCTION
-- grants EXECUTE to PUBLIC, and PUBLIC includes anon. This project has lost
-- three migrations to that. Revoke from public, then grant back deliberately.

revoke all on function public.safe_display_name(text)                  from public, anon, authenticated;
revoke all on function public.a_seat_needs_a_deck()                    from public, anon, authenticated;
revoke all on function public.a_seat_name_is_public()                  from public, anon, authenticated;
revoke all on function public.nudge_the_lobby()                        from public, anon, authenticated;
revoke all on function public.open_game_tables()                       from public, anon, authenticated;
revoke all on function public.online_table_room(uuid)                  from public, anon, authenticated;
revoke all on function public.post_lobby_message(text, text, text)     from public, anon, authenticated;
revoke all on function public.set_online_table_visibility(uuid, text)  from public, anon, authenticated;

-- The three trigger functions are deliberately granted to nobody. A trigger
-- fires as the table owner and does not consult EXECUTE, so granting them
-- would only create a way to call them by hand.

grant execute on function public.safe_display_name(text)                 to authenticated;
grant execute on function public.open_game_tables()                      to authenticated;
grant execute on function public.online_table_room(uuid)                 to authenticated;
grant execute on function public.post_lobby_message(text, text, text)    to authenticated;
grant execute on function public.set_online_table_visibility(uuid, text) to authenticated;
