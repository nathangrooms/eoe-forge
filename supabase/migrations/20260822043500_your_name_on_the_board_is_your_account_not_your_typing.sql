-- Your name on the board is your account, not whatever you typed.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS WRONG, AND HOW IT WAS FOUND
-- ---------------------------------------------------------------------------
-- `start_forum_topic`, `post_forum_reply` and `post_table_message` all took the
-- author's name from the caller:
--
--     v_name := safe_display_name(coalesce(p_display_name, profiles.username))
--
-- The client's value wins that coalesce, and nothing checked it against the
-- account. Measured on 22 Aug 2026: user 85012620 (username "Uhduhhuh") started
-- a topic with p_display_name => 'admin' and the row came back
-- author_name = 'admin', post display_name = 'admin'. The board is readable
-- without an account, so that is public impersonation of another member by any
-- signed-in person, on the one surface in this app that strangers read.
--
-- `user_id` was always right. It is just not what the screen draws.
--
-- ---------------------------------------------------------------------------
-- THE RULE, STATED ONCE
-- ---------------------------------------------------------------------------
--   on the board    you are your ACCOUNT. `profiles.username`, or the local
--                   part of your sign-in address, or "Player". The parameter is
--                   ignored.
--   at a table      you are your SEAT. The name already on the plate, which the
--                   other players at the table can see and chose to sit down
--                   with. So a table's chat can never disagree with the seat it
--                   came from, which was possible before: nothing stopped you
--                   typing in one seat's chat under another seat's name.
--
-- The seat plate itself is still yours to choose, deliberately. People want to
-- be "Nate" at a table rather than their sign-in address, the table is small
-- and transient, and everybody there watched the name arrive. The board is
-- none of those things.
--
-- `p_display_name` stays in every signature. Dropping it would change the shape
-- of three RPCs the client already calls, for no gain: it is simply not read
-- any more, and the comment on each says so where the next person will look.
--
-- ---------------------------------------------------------------------------
-- TALKING COUNTS AS BEING THERE
-- ---------------------------------------------------------------------------
-- `open_game_tables()` deletes any lobby table idle for 30 minutes, and
-- `last_activity_at` was only moved by joining, changing a seat or changing
-- visibility. Sitting at a table talking to somebody moved nothing. Measured
-- the same day: a table with two people at it was deleted out from under the
-- open page, taking the conversation with it, because the last seat change had
-- been 30 minutes earlier. Waiting half an hour for a friend is the ordinary
-- case this feature exists for. Saying something now counts.
--
-- ---------------------------------------------------------------------------
-- LEAVING A TABLE YOU WERE NEVER AT
-- ---------------------------------------------------------------------------
-- `leave_online_table` deleted nothing for a stranger, correctly, and then sent
-- the room a nudge anyway. Every client sitting at that table re-reads on a
-- nudge, so any signed-in account could make every player at any table re-query
-- as fast as it liked, on a table it cannot even read. The nudge now only goes
-- out when something actually changed.
--
-- Its comment also claimed that leaving a running game "only marks them away".
-- Nothing marks anybody away; there is no such column and no such write. The
-- comment now says what the code does.

/* -------------------------------------------------------------------------- */
/* The account's own name                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The name this account posts under. Not a parameter, on purpose.
 *
 * `profiles.username` first, because it is the name the person chose for
 * themselves in this app. Then the local part of the sign-in address, which is
 * what `safe_display_name` cuts at anyway, so an address never reaches a page.
 * Then "Player", so a post always has somebody's name on it.
 */
create or replace function public.forum_account_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.safe_display_name(
    coalesce(
      nullif(btrim((select p.username from public.profiles p where p.id = p_user)), ''),
      (select u.email from auth.users u where u.id = p_user)
    )
  );
$$;

comment on function public.forum_account_name(uuid) is
  'The name an account posts under on the open board. Never taken from the client.';

revoke all on function public.forum_account_name(uuid) from public, anon, authenticated;

/* -------------------------------------------------------------------------- */
/* The three writers                                                          */
/* -------------------------------------------------------------------------- */

create or replace function public.start_forum_topic(
  p_title        text,
  p_body         text,
  p_display_name text default null,
  p_table_code   text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
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

  -- p_display_name is accepted and ignored. On the board you are your account,
  -- because the board is public and permanent and a name there is a claim about
  -- who is speaking. See the note at the top of this migration.
  v_name := public.forum_account_name(v_user);

  insert into public.forum_topics (scope, title, author_id, author_name, table_code)
  values ('board', left(v_title, 120), v_user, v_name, v_code)
  returning * into v_topic;

  insert into public.forum_posts (topic_id, scope, user_id, display_name, body, table_code)
  values (v_topic.id, 'board', v_user, v_name, left(btrim(p_body), 2000), v_code)
  returning * into v_post;

  -- After the insert, so the counters the trigger maintains are the ones that
  -- come back rather than the ones the row was created with.
  select * into v_topic from public.forum_topics where id = v_topic.id;

  perform realtime.send(
    jsonb_build_object('kind', 'topic', 'topicId', v_topic.id),
    'forum',
    'lobby',
    true
  );

  return jsonb_build_object('topic', to_jsonb(v_topic), 'post', to_jsonb(v_post));
end;
$$;

create or replace function public.post_forum_reply(
  p_topic        bigint,
  p_body         text,
  p_display_name text default null,
  p_table_code   text default null
)
returns public.forum_posts
language plpgsql
security definer
set search_path to 'public'
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

  -- This function is SECURITY DEFINER, so the read policies do not apply to it
  -- and the membership check has to be made here by hand. Writing into a table
  -- you are not sitting at would otherwise be possible by guessing an id.
  if v_topic.scope = 'table' and not public.at_game_table(v_topic.table_id) then
    raise exception 'you are not at that table';
  end if;

  -- p_display_name is accepted and ignored. At a table you are the name on your
  -- seat, so the talk cannot disagree with the plate above it; on the board you
  -- are your account.
  if v_topic.scope = 'table' then
    v_name := coalesce(
      (select p.display_name from public.game_participants p
        where p.table_id = v_topic.table_id and p.user_id = v_user),
      public.forum_account_name(v_user)
    );
  else
    v_name := public.forum_account_name(v_user);
  end if;

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
    -- Saying something is being there. See the note at the top.
    update public.game_tables set last_activity_at = now() where id = v_topic.table_id;

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

create or replace function public.post_table_message(
  p_table        uuid,
  p_body         text,
  p_display_name text default null
)
returns public.forum_posts
language plpgsql
security definer
set search_path to 'public'
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

  -- p_display_name is accepted and ignored: you are the name on your seat,
  -- which is the name everybody else at this table is already looking at.
  v_name := coalesce(
    (select p.display_name from public.game_participants p
      where p.table_id = p_table and p.user_id = v_user),
    public.forum_account_name(v_user)
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

  -- Saying something is being there. Without this, `open_game_tables()` deletes
  -- a table two people are talking at, thirty minutes after the last seat
  -- change, and the conversation goes with it.
  update public.game_tables set last_activity_at = now() where id = p_table;

  perform realtime.send(
    jsonb_build_object('kind', 'reply', 'topicId', v_topic.id, 'post', to_jsonb(v_post)),
    'chat',
    'game:' || p_table::text,
    true
  );

  return v_post;
end;
$$;

/* -------------------------------------------------------------------------- */
/* Leaving                                                                    */
/* -------------------------------------------------------------------------- */

create or replace function public.leave_online_table(p_table uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_gone integer := 0;
begin
  -- Leaving a game already in progress does NOTHING to the seat, and that is
  -- the whole of it. The log holds that player's turns and a seat that vanished
  -- mid-game would make the log unfoldable, so the row stays exactly as it was.
  -- There is no "away" mark anywhere in this schema; the comment that used to
  -- be here said there was.
  if exists (select 1 from public.game_tables where id = p_table and status = 'lobby') then
    delete from public.game_participants where table_id = p_table and user_id = v_user;
    get diagnostics v_gone = row_count;

    delete from public.game_seat_secrets where table_id = p_table and user_id = v_user;

    -- An empty lobby is nothing. Tidy it away rather than leaving a code that
    -- looks joinable and is not.
    delete from public.game_tables t
     where t.id = p_table
       and not exists (select 1 from public.game_participants p where p.table_id = t.id);
  end if;

  -- Only when a seat actually went. A nudge makes every client at that table
  -- re-read, so an unguarded one is a query any account can fire at any table,
  -- including tables it cannot read a single row of.
  if v_gone > 0 then
    perform realtime.send(
      jsonb_build_object('kind', 'lobby'),
      'lobby',
      'game:' || p_table::text,
      true
    );
  end if;
end;
$$;
