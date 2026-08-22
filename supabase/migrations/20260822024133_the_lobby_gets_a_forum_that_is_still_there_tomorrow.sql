-- ===========================================================================
-- The discussion zone, rebuilt as a forum
-- ===========================================================================
-- Owner: "an open chat/discussion zone like on classic forums".
--
-- That is a deliberate reference and the previous shape did not honour it.
-- `lobby_posts` was one flat stream of at most 60 lines, readable only when
-- signed in, swept every 24 hours. A forum's whole value is the opposite of
-- all three: the conversation has a shape, it is there when you arrive, and
-- arriving is something a person does before they have an account.
--
-- So this migration replaces it with topics and replies. `lobby_posts` held
-- ZERO rows when this ran (checked, not assumed), so nothing is lost.
--
-- ---------------------------------------------------------------------------
-- WHO MAY READ, WHO MAY POST
-- ---------------------------------------------------------------------------
-- Two scopes, one set of tables.
--
--   scope = 'board'   the open discussion. ANYONE MAY READ IT, including a
--                     visitor with no account. A forum nobody can read until
--                     they sign up is a sign-up wall wearing a forum's clothes,
--                     and the stated point of this thing is that a newcomer
--                     finds the conversation already in progress.
--
--   scope = 'table'   one table's own talk. Readable ONLY by the people
--                     sitting at that table, through `at_game_table()`. A
--                     link-only table is private and its conversation is part
--                     of what is private about it.
--
-- POSTING ALWAYS REQUIRES AN ACCOUNT, in every scope, with no exception. It is
-- enforced in two independent places: neither `anon` nor `authenticated` holds
-- INSERT or UPDATE on either table, so the only way a row is written is the
-- SECURITY DEFINER functions below, and every one of them refuses when
-- `auth.uid()` is null.
--
-- That double enforcement is deliberate. A client that could insert directly
-- could post under any name it liked, including somebody else's, and would
-- walk straight past the rate limit on the way.
--
-- ---------------------------------------------------------------------------
-- THE 42P17 TRAP, AVOIDED BY DENORMALISING
-- ---------------------------------------------------------------------------
-- A SELECT policy on `game_participants` that referenced `game_participants`
-- raised 42P17 infinite recursion and killed every authenticated read on this
-- project. The natural way to write the posts policy has exactly that shape:
-- "you may read this post if you may read its topic", which means
-- `forum_posts` consulting `forum_topics` on every row.
--
-- So `scope` and `table_id` are copied onto `forum_posts` and kept there by the
-- insert path. Every policy on this schema decides using the row in front of
-- it plus one SECURITY DEFINER helper, and never by reading another RLS-guarded
-- table. It costs two small columns and removes the whole class of problem.
--
-- ---------------------------------------------------------------------------
-- WHY THE COUNTERS LIVE ON THE TOPIC ROW
-- ---------------------------------------------------------------------------
-- CLAUDE.md records two outages and a disk IO warning from per-row queries, one
-- of them 421 requests for a single page. A board list that asks each topic for
-- its reply count and its latest poster is that mistake with a new name.
--
-- `post_count`, `last_post_at` and `last_post_name` are therefore maintained on
-- the topic by a trigger at write time, when there is exactly one row to
-- touch and one person waiting. The board list is then one index scan over one
-- table with no joins and no subqueries at all.
--
-- ---------------------------------------------------------------------------
-- REMOVAL MEANS THE WORDS ARE GONE
-- ---------------------------------------------------------------------------
-- Removing a post nulls `body` and stamps `removed_at`. The row stays so the
-- thread keeps its shape and the reply somebody wrote underneath still makes
-- sense, but the text itself is deleted from the database rather than hidden
-- behind a policy. A constraint enforces the pair, so "removed but the words
-- are still in the table" cannot exist.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- Topics
-- ---------------------------------------------------------------------------

create table if not exists public.forum_topics (
  id             bigint generated always as identity primary key,
  scope          text not null check (scope in ('board', 'table')),
  -- Set for scope 'table' only. Cascades, so a table that closes takes its
  -- conversation with it: that talk was about a game that no longer exists.
  table_id       uuid references public.game_tables(id) on delete cascade,
  title          text,
  -- The author can go away without taking the thread with them, which is what
  -- `set null` is for. Their posts still cascade, see forum_posts.
  author_id      uuid references auth.users on delete set null,
  author_name    text not null,
  -- Carried up from the opening post so the board can offer the way in without
  -- reading a second table to find it.
  table_code     text,
  created_at     timestamptz not null default now(),
  last_post_at   timestamptz not null default now(),
  last_post_name text,
  post_count     integer not null default 0,
  pinned         boolean not null default false,
  locked         boolean not null default false,
  removed_at     timestamptz,
  removed_by     uuid,

  -- A board topic is a thread with a title. A table's talk is a room and has
  -- no title, because nobody names the conversation they are already in.
  constraint forum_topics_shape check (
    (scope = 'board' and table_id is null
       and char_length(btrim(coalesce(title, ''))) between 3 and 120)
    or
    (scope = 'table' and table_id is not null and title is null)
  )
);

comment on table public.forum_topics is
  'Discussion threads. scope=board is readable by anyone including signed out visitors; scope=table is readable only by the people at that table. Writes only through the forum RPCs.';

-- One conversation per table, created on the first message.
create unique index if not exists forum_topics_one_per_table_idx
  on public.forum_topics (table_id)
  where scope = 'table';

-- The board list, in the order it is drawn. Partial, so it holds only the rows
-- the board can actually show.
create index if not exists forum_topics_board_idx
  on public.forum_topics (pinned desc, last_post_at desc)
  where scope = 'board' and removed_at is null;

-- The rate limit on starting topics reads this.
create index if not exists forum_topics_author_recent_idx
  on public.forum_topics (author_id, created_at desc);


-- ---------------------------------------------------------------------------
-- Posts
-- ---------------------------------------------------------------------------

create table if not exists public.forum_posts (
  id           bigint generated always as identity primary key,
  topic_id     bigint not null references public.forum_topics(id) on delete cascade,
  -- Copied from the topic. See the note about 42P17 at the top of this file.
  scope        text not null check (scope in ('board', 'table')),
  table_id     uuid,
  -- Deleting an account deletes the words that account wrote. The thread
  -- survives it, because a removed post keeps its place in the order.
  user_id      uuid references auth.users on delete cascade,
  display_name text not null,
  body         text,
  table_code   text,
  created_at   timestamptz not null default now(),
  removed_at   timestamptz,
  removed_by   uuid,
  report_count integer not null default 0,

  -- Either it is a post and it has words, or it is removed and it has none.
  -- There is no third state, and in particular there is no removed post whose
  -- text is still sitting in the table waiting to leak.
  constraint forum_posts_body check (
    (removed_at is null and body is not null
       and char_length(btrim(body)) between 1 and 2000)
    or
    (removed_at is not null and body is null)
  )
);

comment on table public.forum_posts is
  'Replies. Reading follows the topic scope. Writing is only ever through post_forum_reply, start_forum_topic or post_table_message, all of which refuse when signed out.';

create index if not exists forum_posts_thread_idx
  on public.forum_posts (topic_id, created_at, id);

-- The rate limit reads this, once per post.
create index if not exists forum_posts_author_recent_idx
  on public.forum_posts (user_id, created_at desc);


-- ---------------------------------------------------------------------------
-- Blocked posters
-- ---------------------------------------------------------------------------
-- "There is no way to delete anything" is not a place to start from. Removing
-- one post is not moderation on its own either, because the person who wrote it
-- is still there and still typing. So there are two controls and they are the
-- two an owner actually reaches for: take the post down, and stop the poster.
--
-- A block stops WRITING, everywhere, including a table's private chat. It does
-- not stop reading and it does not delete an account.

create table if not exists public.forum_bans (
  user_id    uuid primary key references auth.users on delete cascade,
  reason     text,
  blocked_at timestamptz not null default now(),
  blocked_by uuid
);

comment on table public.forum_bans is
  'Accounts that may not post anywhere in the forum. Set by an admin through block_forum_poster.';


-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
-- Without this the owner only learns about a bad post by reading every post,
-- which is not a thing anybody does. One row per person per post, so a report
-- is a signal and not a voting machine. `report_count` is kept on the post so
-- the moderation view costs no extra read.

create table if not exists public.forum_reports (
  id         bigint generated always as identity primary key,
  post_id    bigint not null references public.forum_posts(id) on delete cascade,
  reporter   uuid not null references auth.users on delete cascade,
  reason     text,
  created_at timestamptz not null default now(),
  unique (post_id, reporter)
);


-- ---------------------------------------------------------------------------
-- The counters on the topic row
-- ---------------------------------------------------------------------------

create or replace function public.forum_topic_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.forum_topics t
       set post_count     = t.post_count + 1,
           last_post_at   = greatest(t.last_post_at, new.created_at),
           last_post_name = new.display_name
     where t.id = new.topic_id;
  else
    -- Only a real DELETE gets here, which is an account being deleted. A
    -- moderated removal keeps its place in the thread and its place in the
    -- count, because the reply written underneath it still refers to it.
    update public.forum_topics t
       set post_count = greatest(t.post_count - 1, 0)
     where t.id = old.topic_id;
  end if;
  return null;
end;
$$;

drop trigger if exists forum_posts_touch_topic on public.forum_posts;
create trigger forum_posts_touch_topic
  after insert or delete on public.forum_posts
  for each row execute function public.forum_topic_touch();


-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Reading is decided by policy. Writing is decided by having no write grant at
-- all: there is no INSERT, UPDATE or DELETE policy anywhere in this file, and
-- no INSERT, UPDATE or DELETE grant either, so every write goes through a
-- function that checks who you are and how fast you are going.

alter table public.forum_topics  enable row level security;
alter table public.forum_posts   enable row level security;
alter table public.forum_bans    enable row level security;
alter table public.forum_reports enable row level security;

revoke all on public.forum_topics  from public, anon, authenticated;
revoke all on public.forum_posts   from public, anon, authenticated;
revoke all on public.forum_bans    from public, anon, authenticated;
revoke all on public.forum_reports from public, anon, authenticated;

grant select on public.forum_topics  to anon, authenticated;
grant select on public.forum_posts   to anon, authenticated;
grant select on public.forum_bans    to authenticated;
grant select on public.forum_reports to authenticated;

drop policy if exists "anyone can read the board" on public.forum_topics;
create policy "anyone can read the board"
  on public.forum_topics for select to anon, authenticated
  using (scope = 'board');

drop policy if exists "a table's talk is for the people at it" on public.forum_topics;
create policy "a table's talk is for the people at it"
  on public.forum_topics for select to authenticated
  using (scope = 'table' and public.at_game_table(table_id));

drop policy if exists "anyone can read board posts" on public.forum_posts;
create policy "anyone can read board posts"
  on public.forum_posts for select to anon, authenticated
  using (scope = 'board');

drop policy if exists "table posts are for the people at the table" on public.forum_posts;
create policy "table posts are for the people at the table"
  on public.forum_posts for select to authenticated
  using (scope = 'table' and public.at_game_table(table_id));

-- You are told you are blocked rather than left wondering why nothing sends.
drop policy if exists "you can see that you are blocked" on public.forum_bans;
create policy "you can see that you are blocked"
  on public.forum_bans for select to authenticated
  using (user_id = (select auth.uid()) or public.is_dev_admin());

drop policy if exists "moderators read reports" on public.forum_reports;
create policy "moderators read reports"
  on public.forum_reports for select to authenticated
  using (public.is_dev_admin());


-- ---------------------------------------------------------------------------
-- The write guard: signed in, not blocked, not going too fast
-- ---------------------------------------------------------------------------
-- The rate limit is at the DATABASE, not in the interface, because the
-- interface is a suggestion. A disabled button is not a limit, it is a hint to
-- the one client that happens to be running our JavaScript.
--
-- Four ceilings, in the order a person hits them:
--
--   2 seconds between posts       stops a held key and a runaway loop
--   12 posts a minute             stops a flood while leaving a fast typist alone
--   the same words twice in five  stops the double-send and the copy-paste spam
--   6 new topics an hour          a topic costs more to moderate than a reply,
--                                 and nobody legitimately starts seven an hour
--
-- All of it is ONE index scan on forum_posts_author_recent_idx, bounded to the
-- last hour, plus one on forum_topics_author_recent_idx when a topic is being
-- started. Not one query per rule.

create or replace function public.forum_write_guard(
  p_body     text,
  p_is_topic boolean default false
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
                            and p.body = v_body)
    into v_minute, v_last, v_same
    from public.forum_posts p
   where p.user_id = v_user
     and p.created_at > now() - interval '60 minutes';

  if v_last is not null and v_last > now() - interval '2 seconds' then
    raise exception 'slow down a moment';
  end if;

  if coalesce(v_minute, 0) >= 12 then
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
-- Starting a topic
-- ---------------------------------------------------------------------------

create or replace function public.start_forum_topic(
  p_title        text,
  p_body         text,
  p_display_name text default null,
  p_table_code   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid;
  v_name  text;
  v_title text := btrim(coalesce(p_title, ''));
  v_code  text := nullif(upper(btrim(coalesce(p_table_code, ''))), '');
  v_topic public.forum_topics;
  v_post  public.forum_posts;
begin
  v_user := public.forum_write_guard(p_body, true);

  if char_length(v_title) < 3 then
    raise exception 'give the topic a title so people know what it is about';
  end if;

  v_name := public.safe_display_name(
    coalesce(p_display_name, (select username from public.profiles where id = v_user))
  );

  insert into public.forum_topics (scope, title, author_id, author_name, table_code)
  values ('board', left(v_title, 120), v_user, v_name, v_code)
  returning * into v_topic;

  insert into public.forum_posts (topic_id, scope, user_id, display_name, body, table_code)
  values (v_topic.id, 'board', v_user, v_name, left(btrim(p_body), 2000), v_code)
  returning * into v_post;

  -- One nudge on the lobby topic. The client re-reads the board, which is one
  -- indexed query, rather than trusting a payload that can drift.
  perform realtime.send(
    jsonb_build_object('kind', 'topic', 'topicId', v_topic.id),
    'forum',
    'lobby',
    true
  );

  return jsonb_build_object(
    'topic', to_jsonb(v_topic) || jsonb_build_object('post_count', 1),
    'post',  to_jsonb(v_post)
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- Replying
-- ---------------------------------------------------------------------------

create or replace function public.post_forum_reply(
  p_topic        bigint,
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
  v_topic public.forum_topics;
  v_post  public.forum_posts;
begin
  v_user := public.forum_write_guard(p_body, false);

  select * into v_topic from public.forum_topics where id = p_topic;
  if not found or v_topic.removed_at is not null then
    raise exception 'that discussion is not there any more';
  end if;
  if v_topic.locked then
    raise exception 'that discussion is closed';
  end if;

  -- This function is SECURITY DEFINER, so the read policies above do not apply
  -- to it and the membership check has to be made here by hand. Writing into a
  -- table you are not sitting at would otherwise be possible by guessing an id.
  if v_topic.scope = 'table' and not public.at_game_table(v_topic.table_id) then
    raise exception 'you are not at that table';
  end if;

  v_name := public.safe_display_name(
    coalesce(p_display_name, (select username from public.profiles where id = v_user))
  );

  insert into public.forum_posts (topic_id, scope, table_id, user_id, display_name, body, table_code)
  values (v_topic.id, v_topic.scope, v_topic.table_id, v_user, v_name,
          left(btrim(p_body), 2000), v_code)
  returning * into v_post;

  if v_topic.scope = 'board' then
    perform realtime.send(
      jsonb_build_object('kind', 'reply', 'topicId', v_topic.id, 'post', to_jsonb(v_post)),
      'forum',
      'lobby',
      true
    );
  else
    -- The table's own topic, which `may_use_game_topic` already grants to
    -- exactly the people sitting at it and to nobody else.
    perform realtime.send(
      jsonb_build_object('kind', 'reply', 'topicId', v_topic.id, 'post', to_jsonb(v_post)),
      'chat',
      'game:' || v_topic.table_id::text,
      true
    );
  end if;

  return v_post;
end;
$$;


-- ---------------------------------------------------------------------------
-- A table's own talk
-- ---------------------------------------------------------------------------
-- Get the conversation, making it on first use, and say something in it. One
-- round trip, because "find the topic" then "post to it" is two, and the first
-- one exists only to discover a row the second one could have made itself.

create or replace function public.post_table_message(
  p_table        uuid,
  p_body         text,
  p_display_name text default null
)
returns public.forum_posts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid;
  v_name  text;
  v_topic public.forum_topics;
  v_post  public.forum_posts;
begin
  v_user := public.forum_write_guard(p_body, false);

  if not public.at_game_table(p_table) then
    raise exception 'you are not at that table';
  end if;

  v_name := public.safe_display_name(
    coalesce(p_display_name, (select username from public.profiles where id = v_user))
  );

  select * into v_topic
    from public.forum_topics
   where scope = 'table' and table_id = p_table;

  if not found then
    insert into public.forum_topics (scope, table_id, author_id, author_name)
    values ('table', p_table, v_user, v_name)
    -- Two people saying hello at once both try to make the room. The unique
    -- index decides, and the loser reads what the winner made.
    on conflict (table_id) where scope = 'table' do nothing
    returning * into v_topic;

    if v_topic.id is null then
      select * into v_topic
        from public.forum_topics
       where scope = 'table' and table_id = p_table;
    end if;
  end if;

  insert into public.forum_posts (topic_id, scope, table_id, user_id, display_name, body)
  values (v_topic.id, 'table', p_table, v_user, v_name, left(btrim(p_body), 2000))
  returning * into v_post;

  perform realtime.send(
    jsonb_build_object('kind', 'reply', 'topicId', v_topic.id, 'post', to_jsonb(v_post)),
    'chat',
    'game:' || p_table::text,
    true
  );

  return v_post;
end;
$$;


-- ---------------------------------------------------------------------------
-- Reading a thread
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER on purpose. The two read policies above are the answer to
-- "may I see this", and a definer function here would be a second answer that
-- could disagree with the first. It exists only to return the topic and its
-- posts in ONE round trip rather than two.
--
-- The table's conversation is fetched by table id, so the seat screen does not
-- need to know a topic exists at all.

create or replace function public.read_forum_thread(
  p_topic bigint default null,
  p_table uuid   default null,
  p_limit integer default 200
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with t as (
    select *
      from public.forum_topics
     where (p_topic is not null and id = p_topic)
        or (p_table is not null and scope = 'table' and table_id = p_table)
     limit 1
  ),
  p as (
    select f.*
      from public.forum_posts f
      join t on t.id = f.topic_id
     order by f.created_at, f.id
     limit greatest(least(coalesce(p_limit, 200), 500), 1)
  )
  select case
           when (select count(*) from t) = 0 then null
           else jsonb_build_object(
             'topic', (select to_jsonb(t) from t),
             'posts', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at, p.id) from p), '[]'::jsonb)
           )
         end;
$$;


-- ---------------------------------------------------------------------------
-- Taking a post down
-- ---------------------------------------------------------------------------
-- The author, or an admin. Same function either way, so there is one place
-- that decides what removal means and one place that clears the words.

create or replace function public.remove_forum_post(p_post bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_post public.forum_posts;
begin
  if v_user is null then
    raise exception 'sign in first';
  end if;

  select * into v_post from public.forum_posts where id = p_post;
  if not found then
    return;
  end if;

  if v_post.user_id is distinct from v_user and not public.is_dev_admin() then
    raise exception 'that is not yours to remove';
  end if;

  if v_post.removed_at is not null then
    return;
  end if;

  update public.forum_posts
     set body = null,
         table_code = null,
         removed_at = now(),
         removed_by = v_user
   where id = p_post;

  if v_post.scope = 'board' then
    perform realtime.send(
      jsonb_build_object('kind', 'removed', 'topicId', v_post.topic_id, 'postId', v_post.id),
      'forum', 'lobby', true
    );
  else
    perform realtime.send(
      jsonb_build_object('kind', 'removed', 'topicId', v_post.topic_id, 'postId', v_post.id),
      'chat', 'game:' || v_post.table_id::text, true
    );
  end if;
end;
$$;


-- Taking a whole thread down. The author may do it while it is still theirs
-- alone; once other people have replied it is a moderator's call, because
-- deleting a conversation other people took part in is not one person's to
-- make.
create or replace function public.remove_forum_topic(p_topic bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_admin boolean;
  v_topic public.forum_topics;
begin
  if v_user is null then
    raise exception 'sign in first';
  end if;

  select * into v_topic from public.forum_topics where id = p_topic;
  if not found then
    return;
  end if;

  v_admin := public.is_dev_admin();

  if not v_admin then
    if v_topic.author_id is distinct from v_user then
      raise exception 'that is not yours to remove';
    end if;
    if v_topic.post_count > 1 then
      raise exception 'other people have replied, so this one needs a moderator';
    end if;
  end if;

  update public.forum_posts
     set body = null, table_code = null, removed_at = now(), removed_by = v_user
   where topic_id = p_topic and removed_at is null;

  update public.forum_topics
     set removed_at = now(), removed_by = v_user
   where id = p_topic;

  perform realtime.send(
    jsonb_build_object('kind', 'topicRemoved', 'topicId', p_topic),
    'forum', 'lobby', true
  );
end;
$$;


-- Pin something worth keeping at the top, or close a thread that has finished.
create or replace function public.set_forum_topic_flags(
  p_topic  bigint,
  p_pinned boolean default null,
  p_locked boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_dev_admin() then
    raise exception 'only a moderator can do that';
  end if;

  update public.forum_topics
     set pinned = coalesce(p_pinned, pinned),
         locked = coalesce(p_locked, locked)
   where id = p_topic;

  perform realtime.send(
    jsonb_build_object('kind', 'topic', 'topicId', p_topic),
    'forum', 'lobby', true
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- Stopping a poster
-- ---------------------------------------------------------------------------
-- `p_wipe` clears everything they have written on the open board in one
-- statement, which is what somebody who arrived to post forty of the same
-- thing needs. Their table chat is left alone: it is private to the people who
-- were sitting there and is deleted with the table anyway.

create or replace function public.block_forum_poster(
  p_user   uuid,
  p_reason text default null,
  p_wipe   boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_wiped integer := 0;
begin
  if not public.is_dev_admin() then
    raise exception 'only a moderator can do that';
  end if;
  if p_user is null then
    raise exception 'no account given';
  end if;
  if p_user = v_admin then
    raise exception 'you cannot block yourself';
  end if;

  insert into public.forum_bans (user_id, reason, blocked_by)
  values (p_user, nullif(btrim(coalesce(p_reason, '')), ''), v_admin)
  on conflict (user_id) do update
    set reason = excluded.reason, blocked_at = now(), blocked_by = excluded.blocked_by;

  if p_wipe then
    update public.forum_posts
       set body = null, table_code = null, removed_at = now(), removed_by = v_admin
     where user_id = p_user and scope = 'board' and removed_at is null;
    get diagnostics v_wiped = row_count;

    update public.forum_topics
       set removed_at = now(), removed_by = v_admin
     where author_id = p_user and scope = 'board' and removed_at is null;
  end if;

  perform realtime.send(jsonb_build_object('kind', 'moderated'), 'forum', 'lobby', true);

  return v_wiped;
end;
$$;


create or replace function public.unblock_forum_poster(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_dev_admin() then
    raise exception 'only a moderator can do that';
  end if;
  delete from public.forum_bans where user_id = p_user;
end;
$$;


-- ---------------------------------------------------------------------------
-- Reporting
-- ---------------------------------------------------------------------------

create or replace function public.report_forum_post(
  p_post   bigint,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_new  integer := 0;
  v_post public.forum_posts;
begin
  if v_user is null then
    raise exception 'sign in first';
  end if;

  select * into v_post from public.forum_posts where id = p_post;
  if not found then
    return;
  end if;

  -- This function is SECURITY DEFINER, so the read policies do not filter it.
  -- Without this a person could report, and so learn the existence of, a post
  -- in a private table they were never at.
  if v_post.scope = 'table' and not public.at_game_table(v_post.table_id) then
    raise exception 'that post is not there';
  end if;

  insert into public.forum_reports (post_id, reporter, reason)
  values (p_post, v_user, left(nullif(btrim(coalesce(p_reason, '')), ''), 300))
  on conflict (post_id, reporter) do nothing;

  get diagnostics v_new = row_count;

  -- Kept on the post so the moderation view is the same single read as the
  -- thread itself, not a count per message.
  if v_new > 0 then
    update public.forum_posts set report_count = report_count + 1 where id = p_post;
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- The old flat room goes
-- ---------------------------------------------------------------------------
-- `open_game_tables()` swept `lobby_posts` on its way past. The board is meant
-- to persist, so that half of the sweep is deleted rather than repointed. The
-- idle-table sweep is unchanged, comment and all.

create or replace function public.open_game_tables()
returns table(
  id uuid, code text, format text, visibility text, max_seats smallint,
  seats_taken integer, host_name text, seated boolean,
  created_at timestamptz, last_activity_at timestamptz, seats jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
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

drop function if exists public.post_lobby_message(text, text, text);
drop table if exists public.lobby_posts;


-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Revoking from `authenticated` removes nothing on its own: CREATE FUNCTION
-- grants EXECUTE to PUBLIC, and PUBLIC includes anon. This project has lost
-- FOUR migrations to that now. Revoke from public first, every time.

revoke all on function public.forum_topic_touch()                              from public, anon, authenticated;
revoke all on function public.forum_write_guard(text, boolean)                 from public, anon, authenticated;
revoke all on function public.start_forum_topic(text, text, text, text)        from public, anon, authenticated;
revoke all on function public.post_forum_reply(bigint, text, text, text)       from public, anon, authenticated;
revoke all on function public.post_table_message(uuid, text, text)             from public, anon, authenticated;
revoke all on function public.read_forum_thread(bigint, uuid, integer)         from public, anon, authenticated;
revoke all on function public.remove_forum_post(bigint)                        from public, anon, authenticated;
revoke all on function public.remove_forum_topic(bigint)                       from public, anon, authenticated;
revoke all on function public.set_forum_topic_flags(bigint, boolean, boolean)  from public, anon, authenticated;
revoke all on function public.block_forum_poster(uuid, text, boolean)          from public, anon, authenticated;
revoke all on function public.unblock_forum_poster(uuid)                       from public, anon, authenticated;
revoke all on function public.report_forum_post(bigint, text)                  from public, anon, authenticated;

-- `forum_topic_touch` is a trigger function and is granted to nobody. A trigger
-- fires as the table owner and never consults EXECUTE, so granting it would
-- only create a way to call it by hand.
--
-- `forum_write_guard` is granted to nobody either. It is called from inside the
-- three writers, which are SECURITY DEFINER and therefore run as the owner.
-- Reaching it directly would let a client burn somebody else's rate budget.

grant execute on function public.start_forum_topic(text, text, text, text)       to authenticated;
grant execute on function public.post_forum_reply(bigint, text, text, text)      to authenticated;
grant execute on function public.post_table_message(uuid, text, text)            to authenticated;
grant execute on function public.remove_forum_post(bigint)                       to authenticated;
grant execute on function public.remove_forum_topic(bigint)                      to authenticated;
grant execute on function public.set_forum_topic_flags(bigint, boolean, boolean) to authenticated;
grant execute on function public.block_forum_poster(uuid, text, boolean)         to authenticated;
grant execute on function public.unblock_forum_poster(uuid)                      to authenticated;
grant execute on function public.report_forum_post(bigint, text)                 to authenticated;

-- Reading a thread is the one thing a signed-out visitor may do, and it is the
-- reason this forum is worth having. RLS decides what comes back.
grant execute on function public.read_forum_thread(bigint, uuid, integer)        to anon, authenticated;
