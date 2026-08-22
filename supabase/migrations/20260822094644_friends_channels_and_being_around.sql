-- ============================================================================
-- Friends, private channels, and being around.
-- ============================================================================
--
-- The owner: "dont see any friends list in the play a game section", and
-- earlier: "if you add friends, you can see their decks and collection and
-- invite them for games, on the friends page could be open and custom channels
-- too for chatting".
--
-- ---------------------------------------------------------------------------
-- WHAT A FRIEND CAN SEE, AND WHAT IS OFF UNTIL YOU SAY SO
-- ---------------------------------------------------------------------------
--   decks       ON by default.  A deck is a thing you built to show people, and
--               a game is better when you can see what the other side plays.
--   collection  OFF by default. A collection is a list of what somebody owns
--               and roughly what it is worth. That is closer to a statement of
--               assets than to a deck list, and nobody should publish one by
--               accepting a friend request. It is one switch away, deliberately.
--   activity    ON by default.  A friends list where nobody is ever shown as
--               around is a list of grey dots, which is the feature not working.
--               It says "around" and "at table ABC123" and nothing finer.
--
-- Those three live in `friend_sharing`, and `my_friends()` applies them. A
-- friend who does not share their decks reports zero decks and no commander,
-- not a hidden button.
--
-- ---------------------------------------------------------------------------
-- WHERE THE GATE IS, AND WHY IT IS NOT A POLICY ON `user_decks`
-- ---------------------------------------------------------------------------
-- The friend reads (`friend_decks`, `friend_collection`) are SECURITY DEFINER
-- and their FIRST statement is `may_see_friend(owner, what)`, which refuses
-- anybody who is not an accepted friend or whose friend has that switch off.
-- The base tables stay owner-only. That is deliberate and it was measured:
-- `src/lib/api/storageAPI.ts` reads `user_collections` with no `user_id` filter
-- at all and relies on the policy to scope it, and `src/components/AdminPanel.tsx`
-- counts `user_decks` with `head: true` and no filter. Widening either SELECT
-- policy to include friends would silently change what those two return, which
-- is a bug in somebody's collection total rather than a privacy improvement.
--
-- So the gate is in the database, in one function, and there is no second route
-- to a friend's decks. It is not in React.
--
-- ---------------------------------------------------------------------------
-- REFUSING AND BLOCKING
-- ---------------------------------------------------------------------------
-- This is the first place in the product where one person's action lands in
-- another person's account, so it has both from the start. Declining is a state
-- on the link and it stops the asking for a week. Blocking is its own table,
-- because a block has to outlive the friendship, is one-directional, and must
-- keep working when there was never a friendship at all. A blocked person is
-- never told they are blocked; the request simply cannot be sent.
--
-- ---------------------------------------------------------------------------
-- CHANNELS: WHO MAY READ ONE
-- ---------------------------------------------------------------------------
--   open     anybody may read, signed out included; an account may post.
--            Same rule as the three community rooms, because a community
--            channel that needs a sign-up to read is not a community.
--   private  only its members may read a word of it or post in it. Its maker
--            adds people, and may only add people who are already their friends.
--            A signed-out visitor cannot see that it exists.
--
-- The site owner can read and remove anything, private channels included. That
-- is stated on the screen where a channel is made, because a report about a
-- private channel cannot be judged without reading it and pretending otherwise
-- would be a lie about what private means here.
--
-- A channel is a `forum_topics` row with `kind = 'room'`, exactly as the three
-- community rooms already are. There is no second messages table.
--
-- ---------------------------------------------------------------------------
-- TWO TRAPS THIS PROJECT HAS PAID FOR
-- ---------------------------------------------------------------------------
-- 1. A policy that reads its own table raises 42P17 infinite recursion and
--    killed every authenticated read once already. Every predicate below that
--    has to look at another row is SECURITY DEFINER, like `at_game_table`.
-- 2. Revoking EXECUTE from `anon` removes nothing, because functions are
--    granted to PUBLIC at creation. Every revoke below is FROM PUBLIC.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. The tables
-- ---------------------------------------------------------------------------

create table if not exists public.friend_links (
  id          bigint generated always as identity primary key,
  requester   uuid not null references auth.users (id) on delete cascade,
  addressee   uuid not null references auth.users (id) on delete cascade,
  state       text not null default 'pending'
                check (state in ('pending', 'accepted', 'declined')),
  created_at  timestamptz not null default now(),
  answered_at timestamptz,
  constraint friend_links_not_yourself check (requester <> addressee)
);

-- One row per PAIR, whichever way round it was asked. Without this, two people
-- asking each other at the same moment become two friendships that can
-- disagree about their own state.
create unique index if not exists friend_links_pair_idx
  on public.friend_links (least(requester, addressee), greatest(requester, addressee));
create index if not exists friend_links_addressee_idx
  on public.friend_links (addressee, state);
create index if not exists friend_links_requester_idx
  on public.friend_links (requester, state);

create table if not exists public.friend_blocks (
  blocker    uuid not null references auth.users (id) on delete cascade,
  blocked    uuid not null references auth.users (id) on delete cascade,
  reason     text,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  constraint friend_blocks_not_yourself check (blocker <> blocked)
);
create index if not exists friend_blocks_blocked_idx on public.friend_blocks (blocked);

create table if not exists public.friend_sharing (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  share_decks      boolean not null default true,
  share_collection boolean not null default false,
  share_activity   boolean not null default true,
  updated_at       timestamptz not null default now()
);

-- Being around. One row per account, overwritten, never appended to, so this
-- can never become a table that grows with traffic.
create table if not exists public.friend_presence (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  seen_at    timestamptz not null default now(),
  doing      text,
  table_code text
);
create index if not exists friend_presence_seen_idx on public.friend_presence (seen_at desc);

create table if not exists public.table_invites (
  id          bigint generated always as identity primary key,
  table_id    uuid not null references public.game_tables (id) on delete cascade,
  table_code  text not null,
  from_user   uuid not null references auth.users (id) on delete cascade,
  to_user     uuid not null references auth.users (id) on delete cascade,
  state       text not null default 'open' check (state in ('open', 'declined')),
  created_at  timestamptz not null default now(),
  answered_at timestamptz,
  constraint table_invites_not_yourself check (from_user <> to_user)
);
-- One open invitation to one table per person. Asking twice is not two rows.
create unique index if not exists table_invites_one_open_idx
  on public.table_invites (table_id, to_user) where state = 'open';
create index if not exists table_invites_inbox_idx
  on public.table_invites (to_user, state, created_at desc);

create table if not exists public.forum_room_members (
  topic_id bigint not null references public.forum_topics (id) on delete cascade,
  user_id  uuid   not null references auth.users (id) on delete cascade,
  added_by uuid   references auth.users (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (topic_id, user_id)
);
create index if not exists forum_room_members_user_idx on public.forum_room_members (user_id);

alter table public.friend_links       enable row level security;
alter table public.friend_blocks      enable row level security;
alter table public.friend_sharing     enable row level security;
alter table public.friend_presence    enable row level security;
alter table public.table_invites      enable row level security;
alter table public.forum_room_members enable row level security;


-- ---------------------------------------------------------------------------
-- 2. A channel can be private
-- ---------------------------------------------------------------------------

alter table public.forum_topics add column if not exists private boolean not null default false;
alter table public.forum_posts  add column if not exists private boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'forum_topics_private_is_a_room'
  ) then
    alter table public.forum_topics
      add constraint forum_topics_private_is_a_room check (not private or kind = 'room');
  end if;
end
$$;

-- `private` is COPIED onto the post for the same reason `scope` and `table_id`
-- already are: so the policy on `forum_posts` decides using the row in front of
-- it rather than reading `forum_topics`, which is the exact shape that raised
-- 42P17 on `game_participants`. The copy cannot drift, because it is written by
-- a trigger on insert and re-synced by a trigger when a channel's privacy flips.
create or replace function public.forum_post_inherits_privacy()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  new.private := coalesce((select t.private from public.forum_topics t where t.id = new.topic_id), false);
  return new;
end;
$$;

drop trigger if exists forum_posts_inherit_privacy on public.forum_posts;
create trigger forum_posts_inherit_privacy
  before insert on public.forum_posts
  for each row execute function public.forum_post_inherits_privacy();

create or replace function public.forum_room_privacy_follows()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.private is distinct from old.private then
    update public.forum_posts set private = new.private where topic_id = new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists forum_topics_privacy_follows on public.forum_topics;
create trigger forum_topics_privacy_follows
  after update of private on public.forum_topics
  for each row execute function public.forum_room_privacy_follows();

create index if not exists forum_posts_private_topic_idx
  on public.forum_posts (topic_id) where private;


-- ---------------------------------------------------------------------------
-- 3. The predicates. Every one SECURITY DEFINER, so no policy reads its own table.
-- ---------------------------------------------------------------------------

create or replace function public.are_friends(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.friend_links l
     where l.state = 'accepted'
       and least(l.requester, l.addressee)    = least(p_a, p_b)
       and greatest(l.requester, l.addressee) = greatest(p_a, p_b)
  );
$$;

create or replace function public.either_blocked(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.friend_blocks b
     where (b.blocker = p_a and b.blocked = p_b)
        or (b.blocker = p_b and b.blocked = p_a)
  );
$$;

-- The one gate on somebody else's decks or collection.
--   p_what is 'decks' or 'collection'.
create or replace function public.may_see_friend(p_owner uuid, p_what text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case
    when p_owner is null or (select auth.uid()) is null then false
    when p_owner = (select auth.uid()) then true
    when not public.are_friends((select auth.uid()), p_owner) then false
    when public.either_blocked((select auth.uid()), p_owner) then false
    when p_what = 'decks' then
      coalesce((select s.share_decks from public.friend_sharing s where s.user_id = p_owner), true)
    when p_what = 'collection' then
      coalesce((select s.share_collection from public.friend_sharing s where s.user_id = p_owner), false)
    when p_what = 'activity' then
      coalesce((select s.share_activity from public.friend_sharing s where s.user_id = p_owner), true)
    else false
  end;
$$;

-- One nudge on one person's own topic. It carries NOTHING but "something about
-- your friends changed", so a client's list can never drift from the database
-- and not notice. The list is one query, so re-reading it is one query.
create or replace function public.tell_a_friend(p_user uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if p_user is null then return; end if;
  perform realtime.send(
    jsonb_build_object('kind', 'friends'),
    'friends',
    'user:' || p_user::text,
    true
  );
end;
$$;

create or replace function public.in_chat_room(p_topic bigint)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.forum_room_members m
     where m.topic_id = p_topic and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.may_read_room(p_topic bigint)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((
    select (not t.private)
        or t.author_id = (select auth.uid())
        or public.in_chat_room(t.id)
        or public.is_dev_admin()
      from public.forum_topics t
     where t.id = p_topic
  ), false);
$$;

-- Who may listen on `room:<id>`. Only a private channel uses its own Realtime
-- topic; an open one rides the shared `lobby` topic like everything else.
create or replace function public.may_use_room_topic(p_topic text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case
    when p_topic ~ '^room:[0-9]+$'
      then public.may_read_room(substring(p_topic from 6)::bigint)
    else false
  end;
$$;


-- ---------------------------------------------------------------------------
-- 4. Policies
-- ---------------------------------------------------------------------------

-- A private channel must not be readable by the board's open policy, so both
-- SELECT policies are re-cut around it. The open path stays a plain column test
-- with no function call, which is what the whole board and every community room
-- goes through.
drop policy if exists "anyone can read the board" on public.forum_topics;
drop policy if exists "anyone can read the open board" on public.forum_topics;
create policy "anyone can read the open board" on public.forum_topics
  for select to anon, authenticated
  using (scope = 'board' and not private);

drop policy if exists "a private channel is for its members" on public.forum_topics;
create policy "a private channel is for its members" on public.forum_topics
  for select to authenticated
  using (
    scope = 'board' and private
    and (author_id = (select auth.uid()) or public.in_chat_room(id) or public.is_dev_admin())
  );

drop policy if exists "anyone can read board posts" on public.forum_posts;
drop policy if exists "anyone can read open board posts" on public.forum_posts;
create policy "anyone can read open board posts" on public.forum_posts
  for select to anon, authenticated
  using (scope = 'board' and not private);

drop policy if exists "private channel posts are for its members" on public.forum_posts;
create policy "private channel posts are for its members" on public.forum_posts
  for select to authenticated
  using (scope = 'board' and private and public.may_read_room(topic_id));

drop policy if exists "you see who is in a channel you are in" on public.forum_room_members;
create policy "you see who is in a channel you are in" on public.forum_room_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.in_chat_room(topic_id) or public.is_dev_admin());

-- Friends. Reading a link is reading a fact about yourself, so both sides see it.
drop policy if exists "you see your own friendships" on public.friend_links;
create policy "you see your own friendships" on public.friend_links
  for select to authenticated
  using (requester = (select auth.uid()) or addressee = (select auth.uid()));

-- Only the person who blocked can see the block. Being told you were blocked is
-- an invitation to make another account.
drop policy if exists "you see who you blocked" on public.friend_blocks;
create policy "you see who you blocked" on public.friend_blocks
  for select to authenticated
  using (blocker = (select auth.uid()));

drop policy if exists "your sharing choices are yours" on public.friend_sharing;
create policy "your sharing choices are yours" on public.friend_sharing
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Nobody reads this table directly. `my_friends()` applies the activity switch
-- and hands back "around" and a table code, never a history of when you were on.
drop policy if exists "your own presence only" on public.friend_presence;
create policy "your own presence only" on public.friend_presence
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "you see invitations you sent or were sent" on public.table_invites;
create policy "you see invitations you sent or were sent" on public.table_invites
  for select to authenticated
  using (to_user = (select auth.uid()) or from_user = (select auth.uid()));


-- ---------------------------------------------------------------------------
-- 5. Finding somebody, and asking
-- ---------------------------------------------------------------------------

create or replace function public.find_players(p_query text)
returns table (user_id uuid, name text, avatar_url text, state text)
language sql stable security definer set search_path to 'public' as $$
  with me as (select (select auth.uid()) as id),
  hit as (
    select p.id, public.forum_account_name(p.id) as name, p.avatar_url
      from public.profiles p, me
     where me.id is not null
       and p.id <> me.id
       and char_length(btrim(coalesce(p_query, ''))) >= 2
       and public.forum_account_name(p.id) ilike '%' || btrim(p_query) || '%'
       and not public.either_blocked(me.id, p.id)
     order by public.forum_account_name(p.id)
     limit 12
  )
  select hit.id,
         hit.name,
         hit.avatar_url,
         coalesce((
           select case
                    when l.state = 'accepted' then 'friend'
                    when l.state = 'declined' then 'none'
                    when l.addressee = (select id from me) then 'they_asked'
                    else 'you_asked'
                  end
             from public.friend_links l
            where least(l.requester, l.addressee)    = least(hit.id, (select id from me))
              and greatest(l.requester, l.addressee) = greatest(hit.id, (select id from me))
         ), 'none')
    from hit
   order by lower(hit.name);
$$;

create or replace function public.ask_to_be_friends(p_user uuid)
returns text language plpgsql security definer set search_path to 'public' as $$
declare
  v_me   uuid := auth.uid();
  v_link public.friend_links;
  v_open integer;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if p_user is null or p_user = v_me then raise exception 'pick somebody else'; end if;

  if not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'that account is not there';
  end if;

  -- Neutral on purpose. A blocked person is not told they are blocked.
  if public.either_blocked(v_me, p_user) then
    raise exception 'that request could not be sent';
  end if;

  -- The rate limit is here rather than on the button, for the same reason the
  -- posting one is: a disabled button is a hint to the one client running our
  -- JavaScript.
  select count(*) into v_open
    from public.friend_links l
   where l.requester = v_me and l.state = 'pending';
  if coalesce(v_open, 0) >= 25 then
    raise exception 'that is a lot of requests waiting for an answer. Give them a moment.';
  end if;

  select * into v_link from public.friend_links l
   where least(l.requester, l.addressee)    = least(v_me, p_user)
     and greatest(l.requester, l.addressee) = greatest(v_me, p_user);

  if found then
    if v_link.state = 'accepted' then
      return 'friend';
    end if;

    if v_link.state = 'pending' then
      -- They already asked you. Asking back IS saying yes.
      if v_link.addressee = v_me then
        update public.friend_links
           set state = 'accepted', answered_at = now()
         where id = v_link.id;
        perform public.tell_a_friend(v_link.requester);
        perform public.tell_a_friend(v_me);
        return 'friend';
      end if;
      return 'you_asked';
    end if;

    -- Declined. Asking again is allowed once the refusal has had a week to
    -- mean something, and not before, so a refusal is not a doorbell.
    if v_link.answered_at is not null and v_link.answered_at > now() - interval '7 days' then
      raise exception 'that request could not be sent';
    end if;

    update public.friend_links
       set requester = v_me, addressee = p_user, state = 'pending',
           created_at = now(), answered_at = null
     where id = v_link.id;
    perform public.tell_a_friend(p_user);
    return 'you_asked';
  end if;

  insert into public.friend_links (requester, addressee) values (v_me, p_user);
  perform public.tell_a_friend(p_user);
  return 'you_asked';
end;
$$;

create or replace function public.answer_friend_request(p_user uuid, p_accept boolean)
returns text language plpgsql security definer set search_path to 'public' as $$
declare
  v_me   uuid := auth.uid();
  v_link public.friend_links;
begin
  if v_me is null then raise exception 'sign in first'; end if;

  select * into v_link from public.friend_links l
   where least(l.requester, l.addressee)    = least(v_me, p_user)
     and greatest(l.requester, l.addressee) = greatest(v_me, p_user)
     and l.state = 'pending';

  if not found then
    raise exception 'there is no request to answer';
  end if;
  if v_link.addressee <> v_me then
    raise exception 'that request is yours, so it is not yours to answer';
  end if;

  update public.friend_links
     set state = case when p_accept then 'accepted' else 'declined' end,
         answered_at = now()
   where id = v_link.id;

  perform public.tell_a_friend(v_link.requester);
  perform public.tell_a_friend(v_me);
  return case when p_accept then 'friend' else 'none' end;
end;
$$;

create or replace function public.remove_friend(p_user uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'sign in first'; end if;

  delete from public.friend_links l
   where least(l.requester, l.addressee)    = least(v_me, p_user)
     and greatest(l.requester, l.addressee) = greatest(v_me, p_user);

  update public.table_invites
     set state = 'declined', answered_at = now()
   where state = 'open'
     and ((from_user = v_me and to_user = p_user) or (from_user = p_user and to_user = v_me));

  perform public.tell_a_friend(p_user);
  perform public.tell_a_friend(v_me);
end;
$$;

create or replace function public.block_player(p_user uuid, p_reason text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if p_user is null or p_user = v_me then raise exception 'you cannot block yourself'; end if;

  insert into public.friend_blocks (blocker, blocked, reason)
  values (v_me, p_user, nullif(btrim(coalesce(p_reason, '')), ''))
  on conflict (blocker, blocked) do update set reason = excluded.reason;

  -- Blocking ends the friendship, cancels anything in flight, and takes them
  -- out of any private channel of yours. A block that leaves a door open is not
  -- a block.
  delete from public.friend_links l
   where least(l.requester, l.addressee)    = least(v_me, p_user)
     and greatest(l.requester, l.addressee) = greatest(v_me, p_user);

  update public.table_invites
     set state = 'declined', answered_at = now()
   where state = 'open'
     and ((from_user = v_me and to_user = p_user) or (from_user = p_user and to_user = v_me));

  delete from public.forum_room_members m
   using public.forum_topics t
   where m.topic_id = t.id and t.author_id = v_me and t.private and m.user_id = p_user;

  perform public.tell_a_friend(p_user);
  perform public.tell_a_friend(v_me);
end;
$$;

create or replace function public.unblock_player(p_user uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'sign in first'; end if;
  delete from public.friend_blocks where blocker = v_me and blocked = p_user;
  perform public.tell_a_friend(v_me);
end;
$$;

create or replace function public.list_blocked_players()
returns table (user_id uuid, name text, since timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select b.blocked, public.forum_account_name(b.blocked), b.created_at
    from public.friend_blocks b
   where b.blocker = (select auth.uid())
   order by b.created_at desc;
$$;


-- ---------------------------------------------------------------------------
-- 6. What you share, and being around
-- ---------------------------------------------------------------------------

create or replace function public.my_sharing()
returns public.friend_sharing
language plpgsql stable security definer set search_path to 'public' as $$
declare v_row public.friend_sharing;
begin
  select * into v_row from public.friend_sharing where user_id = auth.uid();
  if found then return v_row; end if;
  -- No row yet means nobody has touched the switches, so the answer is the
  -- defaults rather than nothing. Writing a row on first read would make every
  -- visit to the play page a write.
  v_row.user_id := auth.uid();
  v_row.share_decks := true;
  v_row.share_collection := false;
  v_row.share_activity := true;
  v_row.updated_at := now();
  return v_row;
end;
$$;

create or replace function public.set_friend_sharing(
  p_decks boolean, p_collection boolean, p_activity boolean
) returns public.friend_sharing
language plpgsql security definer set search_path to 'public' as $$
declare
  v_me  uuid := auth.uid();
  v_row public.friend_sharing;
begin
  if v_me is null then raise exception 'sign in first'; end if;

  insert into public.friend_sharing (user_id, share_decks, share_collection, share_activity, updated_at)
  values (v_me, coalesce(p_decks, true), coalesce(p_collection, false), coalesce(p_activity, true), now())
  on conflict (user_id) do update
     set share_decks      = excluded.share_decks,
         share_collection = excluded.share_collection,
         share_activity   = excluded.share_activity,
         updated_at       = now()
  returning * into v_row;

  -- Turning activity off should stop showing you as around straight away,
  -- rather than at the next heartbeat that never comes.
  if not v_row.share_activity then
    delete from public.friend_presence where user_id = v_me;
  end if;

  return v_row;
end;
$$;

-- One row, overwritten. Called on a heartbeat from the play section while the
-- tab is VISIBLE, and only then. It writes nothing when you have activity off,
-- so the switch costs the database as well as the interface.
create or replace function public.touch_presence(p_doing text default null, p_table_code text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then return; end if;
  if not coalesce((select s.share_activity from public.friend_sharing s where s.user_id = v_me), true) then
    return;
  end if;

  insert into public.friend_presence (user_id, seen_at, doing, table_code)
  values (v_me, now(),
          nullif(left(btrim(coalesce(p_doing, '')), 24), ''),
          nullif(upper(left(btrim(coalesce(p_table_code, '')), 12)), ''))
  on conflict (user_id) do update
     set seen_at = now(), doing = excluded.doing, table_code = excluded.table_code;
end;
$$;

-- How recently somebody has to have been seen to count as around. Longer than
-- the heartbeat by enough that one missed beat is not an absence.
create or replace function public.presence_window()
returns interval language sql immutable as $$ select interval '3 minutes' $$;


-- ---------------------------------------------------------------------------
-- 7. The friends list. ONE query, whatever the friend count.
-- ---------------------------------------------------------------------------
--
-- Everything the panel draws comes out of this: who they are, whether they are
-- around, what they are doing, how many decks they will show you, the commander
-- of the one they touched last, and whether they have an open invitation
-- waiting for you. Nothing here loops and nothing is followed by a lookup per
-- friend. CLAUDE.md records two outages from exactly that, one of them 421
-- requests on a single page.
--
create or replace function public.my_friends()
returns table (
  user_id          uuid,
  name             text,
  avatar_url       text,
  state            text,
  since            timestamptz,
  shares_decks     boolean,
  shares_collection boolean,
  around           boolean,
  seen_at          timestamptz,
  doing            text,
  table_code       text,
  deck_count       integer,
  top_deck         text,
  commander_name   text,
  commander_image  text,
  invite_id        bigint,
  invite_code      text
)
language sql stable security definer set search_path to 'public' as $$
  with me as (select (select auth.uid()) as id),
  linked as (
    select l.id,
           case when l.requester = me.id then l.addressee else l.requester end as other,
           case when l.state = 'accepted' then 'friend'
                when l.addressee = me.id  then 'they_asked'
                else 'you_asked' end as state,
           coalesce(l.answered_at, l.created_at) as since
      from public.friend_links l, me
     where me.id is not null
       and l.state in ('pending', 'accepted')
       and (l.requester = me.id or l.addressee = me.id)
  ),
  visible as (
    select k.* from linked k, me
     where not public.either_blocked(me.id, k.other)
  ),
  built as (
    select
      k.other as user_id,
      public.forum_account_name(k.other) as name,
      p.avatar_url,
      k.state,
      k.since,
      coalesce(s.share_decks, true)       as shares_decks,
      coalesce(s.share_collection, false) as shares_collection,
      (k.state = 'friend'
        and coalesce(s.share_activity, true)
        and pr.seen_at > now() - public.presence_window()) as around,
      case when k.state = 'friend' and coalesce(s.share_activity, true)
           then pr.seen_at end as seen_at,
      case when k.state = 'friend' and coalesce(s.share_activity, true)
                and pr.seen_at > now() - public.presence_window()
           then pr.doing end as doing,
      case when k.state = 'friend' and coalesce(s.share_activity, true)
                and pr.seen_at > now() - public.presence_window()
           then pr.table_code end as table_code,
      case when k.state = 'friend' and coalesce(s.share_decks, true)
           then coalesce(d.deck_count, 0) else 0 end as deck_count,
      case when k.state = 'friend' and coalesce(s.share_decks, true)
           then d.top_deck end as top_deck,
      case when k.state = 'friend' and coalesce(s.share_decks, true)
           then d.commander_name end as commander_name,
      case when k.state = 'friend' and coalesce(s.share_decks, true)
           then d.commander_image end as commander_image,
      inv.id as invite_id,
      inv.table_code as invite_code
    from visible k
    left join public.profiles p        on p.id = k.other
    left join public.friend_sharing s  on s.user_id = k.other
    left join public.friend_presence pr on pr.user_id = k.other
    left join lateral (
      select count(*)::int as deck_count,
             (array_agg(x.name           order by x.updated_at desc))[1] as top_deck,
             (array_agg(x.commander_name order by x.updated_at desc))[1] as commander_name,
             (array_agg(x.commander_image order by x.updated_at desc))[1] as commander_image
        from (
          select ud.name, ud.updated_at, c.name as commander_name,
                 c.image_uris ->> 'normal' as commander_image
            from public.user_decks ud
            left join lateral (
              select dc.card_id from public.deck_cards dc
               where dc.deck_id = ud.id and dc.is_commander and dc.card_id is not null
               limit 1
            ) cm on true
            left join public.cards c on c.id = cm.card_id
           where ud.user_id = k.other
        ) x
    ) d on true
    left join lateral (
      select i.id, i.table_code
        from public.table_invites i, me
       where i.to_user = me.id and i.from_user = k.other and i.state = 'open'
       order by i.created_at desc
       limit 1
    ) inv on true
  )
  select * from built
   order by case built.state when 'they_asked' then 0 when 'friend' then 1 else 2 end,
            built.around desc nulls last,
            lower(built.name);
$$;


-- ---------------------------------------------------------------------------
-- 8. A friend's decks, and a friend's collection
-- ---------------------------------------------------------------------------

create or replace function public.friend_decks(p_user uuid)
returns table (
  deck_id         uuid,
  name            text,
  format          text,
  colors          text[],
  card_count      integer,
  commander_name  text,
  commander_image text,
  updated_at      timestamptz
)
language sql stable security definer set search_path to 'public' as $$
  select ud.id, ud.name, ud.format, ud.colors,
         coalesce(n.card_count, 0),
         c.name,
         c.image_uris ->> 'normal',
         ud.updated_at
    from public.user_decks ud
    left join lateral (
      select sum(dc.quantity)::int as card_count
        from public.deck_cards dc
       where dc.deck_id = ud.id and not dc.is_sideboard
    ) n on true
    left join lateral (
      select dc.card_id from public.deck_cards dc
       where dc.deck_id = ud.id and dc.is_commander and dc.card_id is not null
       limit 1
    ) cm on true
    left join public.cards c on c.id = cm.card_id
   where public.may_see_friend(p_user, 'decks')
     and ud.user_id = p_user
   order by ud.updated_at desc
   limit 60;
$$;

-- What a collection view says, and what it refuses to say. A card with no USD
-- price is counted as unpriced and left out of the total rather than counted as
-- zero: CLAUDE.md records a card with no quote rendering as $0.00 while being
-- worth two thousand euros.
create or replace function public.friend_collection(p_user uuid, p_limit integer default 24)
returns jsonb
language sql stable security definer set search_path to 'public' as $$
  with allowed as (select public.may_see_friend(p_user, 'collection') as ok),
  rows as (
    select uc.card_id, uc.card_name, uc.set_code, uc.quantity, uc.foil,
           nullif(c.prices ->> 'usd', '')::numeric as usd,
           c.image_uris ->> 'normal' as image
      from public.user_collections uc
      left join public.cards c on c.id = uc.card_id
     where (select ok from allowed) and uc.user_id = p_user
  )
  select case when not (select ok from allowed) then null else jsonb_build_object(
    'cards',    (select count(*) from rows),
    'copies',   (select coalesce(sum(quantity), 0) from rows),
    'priced',   (select count(*) from rows where usd is not null),
    'unpriced', (select count(*) from rows where usd is null),
    'valueUsd', (select case when count(*) filter (where usd is not null) = 0
                             then null
                             else round(sum(usd * quantity) filter (where usd is not null), 2) end
                   from rows),
    'top', coalesce((
      select jsonb_agg(t)
        from (
          select card_id as "cardId", card_name as name, set_code as "setCode",
                 quantity, foil, usd, image
            from rows
           where usd is not null
           order by usd * quantity desc, card_name
           limit greatest(least(coalesce(p_limit, 24), 60), 1)
        ) t
    ), '[]'::jsonb)
  ) end;
$$;


-- ---------------------------------------------------------------------------
-- 9. Inviting a friend to a table you are already at
-- ---------------------------------------------------------------------------

create or replace function public.invite_friend_to_table(p_user uuid, p_table uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_me    uuid := auth.uid();
  v_table public.game_tables;
  v_id    bigint;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if not public.are_friends(v_me, p_user) then
    raise exception 'you can only invite a friend';
  end if;
  if public.either_blocked(v_me, p_user) then
    raise exception 'that invitation could not be sent';
  end if;

  select * into v_table from public.game_tables where id = p_table;
  if not found then raise exception 'that table is not there'; end if;
  if not public.at_game_table(p_table) then
    raise exception 'you can only invite people to a table you are sitting at';
  end if;
  if v_table.status <> 'lobby' then
    raise exception 'that game has already started';
  end if;

  insert into public.table_invites (table_id, table_code, from_user, to_user)
  values (p_table, v_table.code, v_me, p_user)
  on conflict (table_id, to_user) where state = 'open'
    do update set created_at = now()
  returning id into v_id;

  perform public.tell_a_friend(p_user);
  return jsonb_build_object('id', v_id, 'code', v_table.code);
end;
$$;

create or replace function public.decline_table_invite(p_invite bigint)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'sign in first'; end if;
  update public.table_invites
     set state = 'declined', answered_at = now()
   where id = p_invite and to_user = v_me and state = 'open';
  perform public.tell_a_friend(v_me);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Channels: making one, joining one, and who may read it
-- ---------------------------------------------------------------------------

create or replace function public.chat_room_slug(p_title text)
returns text language sql immutable set search_path to 'public' as $$
  select left(
    btrim(
      regexp_replace(
        regexp_replace(lower(btrim(coalesce(p_title, ''))), '[^a-z0-9]+', '-', 'g'),
        '(^-+|-+$)', '', 'g'
      ),
      '-'
    ), 40);
$$;

create or replace function public.create_chat_room(p_title text, p_private boolean default false)
returns public.forum_topics
language plpgsql security definer set search_path to 'public' as $$
declare
  v_me    uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_slug  text;
  v_made  integer;
  v_room  public.forum_topics;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if exists (select 1 from public.forum_bans b where b.user_id = v_me) then
    raise exception 'your account cannot post in the discussion';
  end if;
  if char_length(v_title) < 2 then
    raise exception 'give the channel a name so people know what it is for';
  end if;

  v_slug := public.chat_room_slug(v_title);
  if char_length(v_slug) < 2 then
    raise exception 'that name has no letters or numbers in it';
  end if;

  select count(*) into v_made
    from public.forum_topics t
   where t.kind = 'room' and t.author_id = v_me and t.created_at > now() - interval '24 hours';
  if coalesce(v_made, 0) >= 5 then
    raise exception 'that is enough new channels for one day. Use one of the ones you made.';
  end if;

  if exists (select 1 from public.forum_topics t where t.kind = 'room' and t.slug = v_slug) then
    raise exception 'there is already a channel called that';
  end if;

  insert into public.forum_topics (scope, kind, slug, title, author_id, author_name, private)
  values ('board', 'room', v_slug, left(v_title, 60), v_me,
          public.forum_account_name(v_me), coalesce(p_private, false))
  returning * into v_room;

  -- The maker is a member of their own channel whether it is private or not, so
  -- "my channels" is one list rather than two rules.
  insert into public.forum_room_members (topic_id, user_id, added_by)
  values (v_room.id, v_me, v_me)
  on conflict do nothing;

  perform realtime.send(jsonb_build_object('kind', 'topic', 'topicId', v_room.id), 'forum', 'lobby', true);
  return v_room;
end;
$$;

create or replace function public.add_to_chat_room(p_topic bigint, p_user uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_me   uuid := auth.uid();
  v_room public.forum_topics;
begin
  if v_me is null then raise exception 'sign in first'; end if;

  select * into v_room from public.forum_topics where id = p_topic and kind = 'room';
  if not found or v_room.removed_at is not null then raise exception 'that channel is not there'; end if;
  if v_room.author_id is distinct from v_me and not public.is_dev_admin() then
    raise exception 'only the person who made the channel can add people to it';
  end if;
  -- You may only pull in somebody you already know. Otherwise a private channel
  -- is a way to put words in front of a stranger who never agreed to hear them.
  if not public.are_friends(v_me, p_user) then
    raise exception 'you can only add a friend to a channel';
  end if;

  insert into public.forum_room_members (topic_id, user_id, added_by)
  values (p_topic, p_user, v_me)
  on conflict do nothing;

  perform public.tell_a_friend(p_user);
end;
$$;

create or replace function public.remove_from_chat_room(p_topic bigint, p_user uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_me   uuid := auth.uid();
  v_room public.forum_topics;
begin
  if v_me is null then raise exception 'sign in first'; end if;

  select * into v_room from public.forum_topics where id = p_topic and kind = 'room';
  if not found then return; end if;

  -- Yourself, always. Anybody else only if you made the channel.
  if p_user <> v_me
     and v_room.author_id is distinct from v_me
     and not public.is_dev_admin() then
    raise exception 'that is not yours to do';
  end if;
  if p_user = v_room.author_id and p_user <> v_me then
    raise exception 'the person who made the channel cannot be removed from it';
  end if;

  delete from public.forum_room_members where topic_id = p_topic and user_id = p_user;
  perform public.tell_a_friend(p_user);
end;
$$;

create or replace function public.join_chat_room(p_slug text)
returns public.forum_topics
language plpgsql security definer set search_path to 'public' as $$
declare
  v_me   uuid := auth.uid();
  v_room public.forum_topics;
begin
  if v_me is null then raise exception 'sign in first'; end if;

  select * into v_room from public.forum_topics
   where kind = 'room' and slug = lower(btrim(coalesce(p_slug, '')));
  if not found or v_room.removed_at is not null then
    raise exception 'that channel is not there';
  end if;
  -- An open channel is joined by opening it. A private one is joined by being
  -- added, which is somebody else's decision and not this call's.
  if v_room.private and not public.may_read_room(v_room.id) then
    raise exception 'that channel is not there';
  end if;

  insert into public.forum_room_members (topic_id, user_id, added_by)
  values (v_room.id, v_me, v_me)
  on conflict do nothing;

  return v_room;
end;
$$;

-- Who is in a channel, for the person running it. One query.
create or replace function public.chat_room_members(p_topic bigint)
returns table (user_id uuid, name text, avatar_url text, added_at timestamptz, is_owner boolean)
language sql stable security definer set search_path to 'public' as $$
  select m.user_id,
         public.forum_account_name(m.user_id),
         p.avatar_url,
         m.added_at,
         (t.author_id = m.user_id)
    from public.forum_room_members m
    join public.forum_topics t on t.id = m.topic_id
    left join public.profiles p on p.id = m.user_id
   where m.topic_id = p_topic
     and public.may_read_room(p_topic)
   order by (t.author_id = m.user_id) desc, m.added_at;
$$;

-- The channel list. RLS is the whole answer to which rooms come back, so this
-- stays SECURITY INVOKER: a private channel you are not in is filtered by the
-- policy rather than by a second rule here that could come to disagree with it.
-- The three community rooms have no author and sort first, so the front door is
-- always the front door however many channels people make.
create or replace function public.list_chat_rooms()
returns setof public.forum_topics
language sql stable set search_path to 'public' as $$
  select *
    from public.forum_topics
   where kind = 'room'
     and removed_at is null
   order by (author_id is not null), id
   limit 60;
$$;


-- ---------------------------------------------------------------------------
-- 11. Saying something in a channel
-- ---------------------------------------------------------------------------
--
-- The only change from the version this replaces: a private channel refuses a
-- non-member, and its push goes out on its OWN Realtime topic. The `lobby`
-- topic is granted to every signed-in account, so putting a private message on
-- it would hand it to everybody with the door still locked.
--
create or replace function public.post_chat_message(
  p_slug text, p_body text, p_display_name text default null, p_table_code text default null
) returns public.forum_posts
language plpgsql security definer set search_path to 'public' as $$
declare
  v_user uuid;
  v_name text;
  v_code text := nullif(upper(btrim(coalesce(p_table_code, ''))), '');
  v_room public.forum_topics;
  v_post public.forum_posts;
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
  if v_room.private and not public.may_read_room(v_room.id) then
    -- Same answer as "not there". A private channel does not confirm its own
    -- existence to somebody who is not in it.
    raise exception 'that room is not there';
  end if;

  v_name := public.safe_display_name(
    coalesce(p_display_name, (select username from public.profiles where id = v_user))
  );

  insert into public.forum_posts (topic_id, scope, user_id, display_name, body, table_code)
  values (v_room.id, 'board', v_user, v_name, left(btrim(p_body), 2000), v_code)
  returning * into v_post;

  perform realtime.send(
    jsonb_build_object('kind', 'reply', 'topicId', v_room.id, 'post', to_jsonb(v_post)),
    case when v_room.private then 'chat' else 'forum' end,
    case when v_room.private then 'room:' || v_room.id::text else 'lobby' end,
    true
  );

  return v_post;
end;
$$;

-- Removing a message. Yours, the site owner's decision, or the decision of
-- whoever runs the channel it was said in. A channel nobody can tidy is a
-- channel nobody will keep open.
create or replace function public.remove_forum_post(p_post bigint)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_user  uuid := auth.uid();
  v_post  public.forum_posts;
  v_topic public.forum_topics;
begin
  if v_user is null then
    raise exception 'sign in first';
  end if;

  select * into v_post from public.forum_posts where id = p_post;
  if not found then
    return;
  end if;

  select * into v_topic from public.forum_topics where id = v_post.topic_id;

  if v_post.user_id is distinct from v_user
     and not public.is_dev_admin()
     and not (v_topic.kind = 'room' and v_topic.author_id = v_user) then
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
      case when v_post.private then 'chat' else 'forum' end,
      case when v_post.private then 'room:' || v_post.topic_id::text else 'lobby' end,
      true
    );
  else
    perform realtime.send(
      jsonb_build_object('kind', 'removed', 'topicId', v_post.topic_id, 'postId', v_post.id),
      'chat', 'game:' || v_post.table_id::text, true
    );
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- 12. Realtime: two more topics, both narrow
-- ---------------------------------------------------------------------------

drop policy if exists "you listen on your own account topic" on realtime.messages;
create policy "you listen on your own account topic" on realtime.messages
  for select to authenticated
  using ((select realtime.topic()) = 'user:' || (select auth.uid())::text);

drop policy if exists "members listen on their private channel" on realtime.messages;
create policy "members listen on their private channel" on realtime.messages
  for select to authenticated
  using (public.may_use_room_topic((select realtime.topic())));

-- Deliberately NO insert policy for either topic. Every message on both is
-- written by a SECURITY DEFINER function inside the transaction that made the
-- change, so a client that could speak on them could only forge.


-- ---------------------------------------------------------------------------
-- 13. Grants
-- ---------------------------------------------------------------------------
--
-- No INSERT, UPDATE or DELETE grant on any table here, to anybody. Every write
-- goes through a function that checks who you are, whether you are blocked and
-- how fast you are going. A client that could insert into `friend_links` could
-- make itself somebody's friend.
--
-- Every revoke is FROM PUBLIC. Revoking from `anon` removes nothing, because
-- functions are granted to PUBLIC at creation. That has bitten this project
-- four times.

revoke all on public.friend_links       from anon, authenticated;
revoke all on public.friend_blocks      from anon, authenticated;
revoke all on public.friend_sharing     from anon, authenticated;
revoke all on public.friend_presence    from anon, authenticated;
revoke all on public.table_invites      from anon, authenticated;
revoke all on public.forum_room_members from anon, authenticated;

grant select on public.friend_links       to authenticated;
grant select on public.friend_blocks      to authenticated;
grant select on public.friend_sharing     to authenticated;
grant select on public.friend_presence    to authenticated;
grant select on public.table_invites      to authenticated;
grant select on public.forum_room_members to authenticated;

-- The predicates are the database's own plumbing. Nothing calls them over HTTP.
revoke all on function public.are_friends(uuid, uuid) from public;
revoke all on function public.either_blocked(uuid, uuid) from public;
revoke all on function public.may_see_friend(uuid, text) from public;
revoke all on function public.in_chat_room(bigint) from public;
revoke all on function public.may_read_room(bigint) from public;
revoke all on function public.may_use_room_topic(text) from public;
-- These three are named by a POLICY, so the role the policy runs for has to be
-- able to execute them. `at_game_table` and `may_use_game_topic` carry the same
-- grant for the same reason.
grant execute on function public.in_chat_room(bigint) to authenticated;
grant execute on function public.may_read_room(bigint) to authenticated;
grant execute on function public.may_use_room_topic(text) to authenticated;
revoke all on function public.tell_a_friend(uuid) from public;
revoke all on function public.forum_post_inherits_privacy() from public;
revoke all on function public.forum_room_privacy_follows() from public;
revoke all on function public.presence_window() from public;
revoke all on function public.chat_room_slug(text) from public;

-- Signed in only. Every one of these is about YOUR account.
revoke all on function public.find_players(text) from public;
revoke all on function public.ask_to_be_friends(uuid) from public;
revoke all on function public.answer_friend_request(uuid, boolean) from public;
revoke all on function public.remove_friend(uuid) from public;
revoke all on function public.block_player(uuid, text) from public;
revoke all on function public.unblock_player(uuid) from public;
revoke all on function public.list_blocked_players() from public;
revoke all on function public.my_sharing() from public;
revoke all on function public.set_friend_sharing(boolean, boolean, boolean) from public;
revoke all on function public.touch_presence(text, text) from public;
revoke all on function public.my_friends() from public;
revoke all on function public.friend_decks(uuid) from public;
revoke all on function public.friend_collection(uuid, integer) from public;
revoke all on function public.invite_friend_to_table(uuid, uuid) from public;
revoke all on function public.decline_table_invite(bigint) from public;
revoke all on function public.create_chat_room(text, boolean) from public;
revoke all on function public.add_to_chat_room(bigint, uuid) from public;
revoke all on function public.remove_from_chat_room(bigint, uuid) from public;
revoke all on function public.join_chat_room(text) from public;
revoke all on function public.chat_room_members(bigint) from public;

grant execute on function public.find_players(text) to authenticated;
grant execute on function public.ask_to_be_friends(uuid) to authenticated;
grant execute on function public.answer_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.block_player(uuid, text) to authenticated;
grant execute on function public.unblock_player(uuid) to authenticated;
grant execute on function public.list_blocked_players() to authenticated;
grant execute on function public.my_sharing() to authenticated;
grant execute on function public.set_friend_sharing(boolean, boolean, boolean) to authenticated;
grant execute on function public.touch_presence(text, text) to authenticated;
grant execute on function public.my_friends() to authenticated;
grant execute on function public.friend_decks(uuid) to authenticated;
grant execute on function public.friend_collection(uuid, integer) to authenticated;
grant execute on function public.invite_friend_to_table(uuid, uuid) to authenticated;
grant execute on function public.decline_table_invite(bigint) to authenticated;
grant execute on function public.create_chat_room(text, boolean) to authenticated;
grant execute on function public.add_to_chat_room(bigint, uuid) to authenticated;
grant execute on function public.remove_from_chat_room(bigint, uuid) to authenticated;
grant execute on function public.join_chat_room(text) to authenticated;
grant execute on function public.chat_room_members(bigint) to authenticated;

-- Unchanged in shape: the room list stays readable signed out, because the
-- community rooms are the front door and a front door behind a sign-up is a
-- wall. RLS decides which rooms a given reader gets.
revoke all on function public.list_chat_rooms() from public;
grant execute on function public.list_chat_rooms() to anon, authenticated;

revoke all on function public.post_chat_message(text, text, text, text) from public;
grant execute on function public.post_chat_message(text, text, text, text) to authenticated;

revoke all on function public.remove_forum_post(bigint) from public;
grant execute on function public.remove_forum_post(bigint) to authenticated;
