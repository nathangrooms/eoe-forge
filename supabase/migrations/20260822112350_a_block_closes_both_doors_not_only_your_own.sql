-- ============================================================================
-- A block closes BOTH doors, not only your own.
-- ============================================================================
--
-- `block_player` already carried the right sentence:
--
--     -- Blocking ends the friendship, cancels anything in flight, and takes
--     -- them out of any private channel of yours. A block that leaves a door
--     -- open is not a block.
--
-- and then closed one door:
--
--     delete from public.forum_room_members m
--      using public.forum_topics t
--      where m.topic_id = t.id and t.author_id = v_me and t.private
--        and m.user_id = p_user;
--
-- `t.author_id = v_me` is the whole bug. It takes THEM out of a channel YOU
-- made. It does not take YOU out of a channel THEY made, and `may_read_room`
-- has never looked at `friend_blocks` at all, so membership is the only test.
--
-- ---------------------------------------------------------------------------
-- MEASURED, 22 Aug 2026, against this database
-- ---------------------------------------------------------------------------
-- A made a private channel "Secret table talk" and added B, who was a friend at
-- the time. Then:
--
--   A blocks B     B is removed. `read_chat_room` returns null, posting is
--                  refused with "that room is not there". Correct.
--   B blocks A     B stays a member. B read A's channel in full, INCLUDING the
--                  message A had written in it, and then POSTED into it
--                  (post id 703), which A would then read.
--
-- So the person you blocked keeps putting words in front of you in the one
-- place you share, and you are never told they blocked you. That is the exact
-- harm the friends-only rule on `add_to_chat_room` cites as its own reason:
-- "a private channel is a way to put words in front of a stranger who never
-- agreed to hear them".
--
-- ---------------------------------------------------------------------------
-- TWO CHANGES, BECAUSE ONE OF THEM CANNOT REACH THE ROWS ALREADY THERE
-- ---------------------------------------------------------------------------
-- 1. `block_player` deletes membership in BOTH directions.
-- 2. `may_read_room` refuses a private channel whose AUTHOR is blocked either
--    way. Membership rows written before this migration are already in the
--    table and nothing re-runs the delete for them, so the gate has to hold on
--    its own. It is also the belt to the braces: a future path that adds a
--    member without checking blocks cannot reopen the door.
--
-- The site owner is unaffected: `is_dev_admin()` is answered BEFORE the block
-- test, because a report about a private channel cannot be judged without
-- reading it, and that is already written on the make-a-channel screen.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DOES NOT DO, SAID OUT LOUD
-- ---------------------------------------------------------------------------
-- A private channel with several people in it, where one member blocks another
-- and neither of them made it, is untouched. Both stay, and both keep reading
-- each other. Hiding one member's messages from another inside a shared room is
-- a different feature with its own questions (what happens to the reply written
-- underneath, what the post count means) and guessing at it here would be worse
-- than saying it is not done.
--
-- ---------------------------------------------------------------------------
-- GRANTS
-- ---------------------------------------------------------------------------
-- Both functions already exist, so this is CREATE OR REPLACE and both keep the
-- ACL they were created with. That is the half of the rule CLAUDE.md's
-- successor note records: a replaced function keeps its grants, a NEW one is
-- granted to anon and authenticated by Supabase's default privileges and has to
-- revoke from `public, anon, authenticated` and grant back. Read back after
-- applying to be sure rather than to assume.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The gate
-- ---------------------------------------------------------------------------

create or replace function public.may_read_room(p_topic bigint)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((
    select case
      -- Your own channel is always yours to read.
      when t.author_id = (select auth.uid()) then true
      -- An open channel is open. No function call on the common path.
      when not t.private then true
      -- The site owner reads a private channel to judge a report about it.
      -- Answered before the block test on purpose.
      when public.is_dev_admin() then true
      -- A block in EITHER direction shuts the channel, whoever is still listed
      -- as a member of it. See the header for what this cost.
      when public.either_blocked((select auth.uid()), t.author_id) then false
      when public.in_chat_room(t.id) then true
      else false
    end
      from public.forum_topics t
     where t.id = p_topic
  ), false);
$$;

-- ---------------------------------------------------------------------------
-- 2. The block itself
-- ---------------------------------------------------------------------------

create or replace function public.block_player(p_user uuid, p_reason text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if p_user is null or p_user = v_me then raise exception 'you cannot block yourself'; end if;

  insert into public.friend_blocks (blocker, blocked, reason)
  values (v_me, p_user, nullif(btrim(coalesce(p_reason, '')), ''))
  on conflict (blocker, blocked) do update set reason = excluded.reason;

  -- Blocking ends the friendship and cancels anything in flight.
  delete from public.friend_links l
   where least(l.requester, l.addressee)    = least(v_me, p_user)
     and greatest(l.requester, l.addressee) = greatest(v_me, p_user);

  update public.table_invites
     set state = 'declined', answered_at = now()
   where state = 'open'
     and ((from_user = v_me and to_user = p_user) or (from_user = p_user and to_user = v_me));

  -- And it takes them out of any private channel of yours AND you out of any
  -- private channel of theirs. Only the first half was here, which meant
  -- blocking the person whose channel you were in left you reading it and
  -- posting into it. A block that leaves a door open is not a block, and there
  -- are two doors.
  delete from public.forum_room_members m
   using public.forum_topics t
   where m.topic_id = t.id
     and t.private
     and (
       (t.author_id = v_me    and m.user_id = p_user)
       or
       (t.author_id = p_user  and m.user_id = v_me)
     );

  perform public.tell_a_friend(p_user);
  perform public.tell_a_friend(v_me);
end;
$$;
