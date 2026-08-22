-- ===========================================================================
-- The discussion gets a room people talk in
-- ===========================================================================
-- Owner: "conversation lobby should be more like chat box".
--
-- The zone was built as a forum because an earlier message asked for one in as
-- many words. The owner has now looked at the forum and asked for a chat box,
-- and those are different things: a chat box is newest at the bottom, one
-- scrolling column, type at the bottom, press enter, and messages arriving
-- without a refresh. No title, no thread, no ceremony to say one sentence.
--
-- ---------------------------------------------------------------------------
-- THIS ADDS NO SECOND MESSAGES TABLE, AND THAT IS THE POINT
-- ---------------------------------------------------------------------------
-- The instruction was to extend `lobby_posts` rather than build beside it.
-- `lobby_posts` no longer exists: the forum migration of 22 Aug 2026 replaced
-- it with `forum_topics` and `forum_posts` and dropped it, having first checked
-- it held zero rows. `forum_posts` IS the messages table now, so extending it
-- is what the instruction means today.
--
-- So a chat room is a TOPIC with `kind = 'room'`. Its messages are ordinary
-- `forum_posts` rows. Everything that already exists keeps working on it with
-- no second copy of anything:
--
--   removal        `remove_forum_post` nulls the words and stamps the row
--   blocking       `forum_bans` stops a poster everywhere at once
--   reporting      `forum_reports`, one per person per post
--   reading        the same two SELECT policies, by scope
--   pushing        the same `lobby` Realtime topic and the same event shape
--   the counters   the same trigger keeps post_count and last_post_at
--
-- A room differs from a thread in exactly two ways: it has a slug so a link can
-- name it, and it is read newest-last with a window rather than from the start.
--
-- ---------------------------------------------------------------------------
-- THE RATE LIMIT IS AT THE DATABASE, AND A CHAT NEEDS A DIFFERENT ONE
-- ---------------------------------------------------------------------------
-- It was already at the database, which is where it belongs: a disabled button
-- is not a limit, it is a hint to the one client that happens to be running our
-- JavaScript. But the forum's ceilings are wrong for a room.
--
-- "The same words twice in five minutes" is a good rule for a forum and a
-- hostile one for a chat, where "gg", "yes", "mine" and "lol" are normal and
-- get said by the same person twice in an evening. And twelve posts a minute is
-- a fast typist in a busy room rather than a flood.
--
-- So the guard takes a third argument. In a room:
--
--   1 second between messages      still stops a held key and a runaway loop
--   20 messages a minute           a real conversation, not a flood
--   duplicates only over 40 chars  a repeated paragraph is spam, "gg" is not
--
-- Everything else is unchanged, and the forum's own ceilings are untouched.
--
-- ---------------------------------------------------------------------------
-- WHAT A STRANGER'S TEXT IS ALLOWED TO DO
-- ---------------------------------------------------------------------------
-- Nothing new. The body is stored as text and drawn by `PostBody`, which turns
-- it into React children and never into markup. There is no
-- `dangerouslySetInnerHTML` anywhere in that path and this migration does not
-- add a way to get one.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- A topic can be a room
-- ---------------------------------------------------------------------------

alter table public.forum_topics
  add column if not exists kind text not null default 'thread';

alter table public.forum_topics
  drop constraint if exists forum_topics_kind;
alter table public.forum_topics
  add constraint forum_topics_kind check (kind in ('thread', 'room'));

alter table public.forum_topics
  add column if not exists slug text;

-- A room is named by its slug, and only a room has one. A table's own talk is
-- already a room in every way that matters and is found by its table id, so it
-- stays `kind = 'thread'` and keeps no slug.
alter table public.forum_topics
  drop constraint if exists forum_topics_room_shape;
alter table public.forum_topics
  add constraint forum_topics_room_shape check (
    (kind = 'room' and scope = 'board' and slug is not null
       and slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$')
    or
    (kind = 'thread' and slug is null)
  );

create unique index if not exists forum_topics_room_slug_idx
  on public.forum_topics (slug)
  where kind = 'room';

-- The board list is threads. A room is not a conversation somebody started, it
-- is a place, so it does not belong in a list sorted by who spoke last.
drop index if exists public.forum_topics_board_idx;
create index if not exists forum_topics_board_idx
  on public.forum_topics (pinned desc, last_post_at desc)
  where scope = 'board' and kind = 'thread' and removed_at is null;

-- Reading the tail of a room is the query this whole feature makes.
-- `forum_posts_thread_idx` is (topic_id, created_at, id), which serves it in
-- reverse without a second index.

comment on column public.forum_topics.kind is
  'thread = a conversation with a title. room = a chat channel read newest-last, named by slug.';


-- ---------------------------------------------------------------------------
-- The rooms themselves
-- ---------------------------------------------------------------------------
-- Three, and no more, because an empty channel list is worse than a short one.
-- A room nobody is in reads as a dead product; three rooms that all have
-- something in them reads as a place. Custom channels are a later piece of work
-- and they add rows here, not tables.

insert into public.forum_topics (scope, kind, slug, title, author_id, author_name)
values
  ('board', 'room', 'general',           'General',           null, 'DeckMatrix'),
  ('board', 'room', 'looking-for-a-game', 'Looking for a game', null, 'DeckMatrix'),
  ('board', 'room', 'deck-help',         'Deck help',         null, 'DeckMatrix')
on conflict do nothing;


-- ---------------------------------------------------------------------------
-- The write guard, taught the difference between a post and a message
-- ---------------------------------------------------------------------------
-- Dropped and recreated rather than overloaded. Two functions differing only by
-- a defaulted trailing argument are ambiguous to every existing two-argument
-- caller, and `start_forum_topic`, `post_forum_reply` and `post_table_message`
-- are all two-argument callers. They resolve to this one through its default
-- and need no change.

drop function if exists public.forum_write_guard(text, boolean);

create or replace function public.forum_write_guard(
  p_body     text,
  p_is_topic boolean default false,
  p_is_room  boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_minute integer;
  v_last   timestamptz;
  v_same   integer;
  v_topics integer;
  v_body   text := btrim(coalesce(p_body, ''));
  -- A chat line is short and quick. A forum post is neither.
  v_gap    interval := case when p_is_room then interval '1 second' else interval '2 seconds' end;
  v_cap    integer  := case when p_is_room then 20 else 12 end;
  -- In a room, a repeat only counts as a repeat once it is long enough to be
  -- something somebody pasted rather than something somebody said.
  v_dupe   integer  := case when p_is_room then 40 else 1 end;
begin
  if v_user is null then
    raise exception 'sign in to post';
  end if;

  if char_length(v_body) = 0 then
    raise exception 'write something first';
  end if;

  if char_length(v_body) > 2000 then
    raise exception 'that is longer than a post can be. Trim it down a bit.';
  end if;

  if exists (select 1 from public.forum_bans b where b.user_id = v_user) then
    raise exception 'your account cannot post in the discussion';
  end if;

  select count(*) filter (where p.created_at > now() - interval '60 seconds'),
         max(p.created_at),
         count(*) filter (where p.created_at > now() - interval '5 minutes'
                            and p.body = v_body
                            and char_length(v_body) >= v_dupe)
    into v_minute, v_last, v_same
    from public.forum_posts p
   where p.user_id = v_user
     and p.created_at > now() - interval '60 minutes';

  if v_last is not null and v_last > now() - v_gap then
    raise exception 'slow down a moment';
  end if;

  if coalesce(v_minute, 0) >= v_cap then
    raise exception 'that is a lot of messages in a minute. Give it a moment.';
  end if;

  if coalesce(v_same, 0) > 0 then
    raise exception 'you already said that';
  end if;

  if p_is_topic then
    select count(*) into v_topics
      from public.forum_topics t
     where t.author_id = v_user
       and t.created_at > now() - interval '60 minutes';

    if coalesce(v_topics, 0) >= 6 then
      raise exception 'that is enough new topics for one hour. Reply to one instead.';
    end if;
  end if;

  return v_user;
end;
$$;


-- ---------------------------------------------------------------------------
-- Saying something in a room
-- ---------------------------------------------------------------------------
-- By SLUG, not by id, so the client holds the name of the room it is in rather
-- than a number it had to look up first. One round trip, and the room has to
-- already exist: a typo in a slug is a refusal, not a new empty channel.

create or replace function public.post_chat_message(
  p_slug         text,
  p_body         text,
  p_display_name text default null,
  p_table_code   text default null
)
returns public.forum_posts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid;
  v_name  text;
  v_code  text := nullif(upper(btrim(coalesce(p_table_code, ''))), '');
  v_room  public.forum_topics;
  v_post  public.forum_posts;
begin
  v_user := public.forum_write_guard(p_body, false, true);

  select * into v_room
    from public.forum_topics
   where kind = 'room' and slug = lower(btrim(coalesce(p_slug, '')));

  if not found or v_room.removed_at is not null then
    raise exception 'that room is not there';
  end if;
  if v_room.locked then
    raise exception 'that room is closed';
  end if;

  v_name := public.safe_display_name(
    coalesce(p_display_name, (select username from public.profiles where id = v_user))
  );

  insert into public.forum_posts (topic_id, scope, user_id, display_name, body, table_code)
  values (v_room.id, 'board', v_user, v_name, left(btrim(p_body), 2000), v_code)
  returning * into v_post;

  -- The same event, on the same topic, in the same shape the board already
  -- uses, so `useThread` appends it with no read and nothing new to learn.
  perform realtime.send(
    jsonb_build_object('kind', 'reply', 'topicId', v_room.id, 'post', to_jsonb(v_post)),
    'forum',
    'lobby',
    true
  );

  return v_post;
end;
$$;


-- ---------------------------------------------------------------------------
-- Reading a room
-- ---------------------------------------------------------------------------
-- The LAST `p_limit` messages, handed back oldest first, because that is the
-- order they are drawn in. `read_forum_thread` reads from the START of a
-- conversation, which is right for a thread somebody opened on purpose and
-- wrong for a room, where the first thing you want is what was just said.
--
-- `p_before` walks backwards for "load earlier", so a room can be read for as
-- far back as somebody cares to scroll without ever fetching all of it.
--
-- SECURITY INVOKER, exactly as `read_forum_thread` is, and for the reason
-- written there: the SELECT policies are already the whole answer to "may I see
-- this", and a definer function here would be a second answer that could come
-- to disagree with the first.

create or replace function public.read_chat_room(
  p_slug   text,
  p_limit  integer default 60,
  p_before bigint  default null
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with r as (
    select *
      from public.forum_topics
     where kind = 'room'
       and slug = lower(btrim(coalesce(p_slug, '')))
     limit 1
  ),
  tail as (
    select f.*
      from public.forum_posts f
      join r on r.id = f.topic_id
     where p_before is null or f.id < p_before
     order by f.created_at desc, f.id desc
     limit greatest(least(coalesce(p_limit, 60), 200), 1)
  )
  select case
           when (select count(*) from r) = 0 then null
           else jsonb_build_object(
             'topic', (select to_jsonb(r) from r),
             'posts', coalesce(
               (select jsonb_agg(to_jsonb(tail) order by tail.created_at, tail.id) from tail),
               '[]'::jsonb
             )
           )
         end;
$$;


-- ---------------------------------------------------------------------------
-- The list of rooms
-- ---------------------------------------------------------------------------
-- One query, no joins, no per-room anything. `post_count` and `last_post_at`
-- are already kept on the row by the trigger, so the channel list costs one
-- index scan whether there are three rooms or thirty. CLAUDE.md records two
-- outages from asking a question per row.
--
-- BY ID, not by created_at. The three rooms above are made in one statement, so
-- they all carry the same transaction timestamp and `order by created_at` is
-- not an order at all — it came back General last on one read and first on the
-- next. The client opens the first room in this list when the URL does not name
-- one, so an unstable order is a page that opens somewhere different each time.

create or replace function public.list_chat_rooms()
returns setof public.forum_topics
language sql
stable
set search_path = public
as $$
  select *
    from public.forum_topics
   where kind = 'room'
     and removed_at is null
   order by id;
$$;


-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- REVOKE FROM PUBLIC, not from anon. A function is granted to PUBLIC the moment
-- it is created, so revoking from `anon` and `authenticated` removes nothing at
-- all and leaves the function callable by everybody. That has bitten this
-- project four times and there is a migration named after it.

revoke all on function public.forum_write_guard(text, boolean, boolean)  from public, anon, authenticated;
revoke all on function public.post_chat_message(text, text, text, text)  from public, anon, authenticated;
revoke all on function public.read_chat_room(text, integer, bigint)      from public, anon, authenticated;
revoke all on function public.list_chat_rooms()                          from public, anon, authenticated;

-- The guard is called only from inside the writers, which are definers. Nobody
-- outside needs it and nobody outside gets it.
grant execute on function public.post_chat_message(text, text, text, text) to authenticated;

-- Reading is for everybody, including a visitor with no account, because the
-- board is. Posting is not, and the guard refuses when `auth.uid()` is null.
grant execute on function public.read_chat_room(text, integer, bigint) to anon, authenticated;
grant execute on function public.list_chat_rooms()                     to anon, authenticated;
