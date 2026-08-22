-- ============================================================================
-- The topic row was the half the gate did not cover.
-- ============================================================================
--
-- The migration before this one made `may_read_room` refuse a private channel
-- whose author you have blocked, or who has blocked you, so that a membership
-- row written before the fix could not still be used as a key.
--
-- Then it was tested against exactly that case and only half of it held.
--
-- ---------------------------------------------------------------------------
-- MEASURED, 22 Aug 2026, immediately after applying that migration
-- ---------------------------------------------------------------------------
-- A membership row was written straight into `forum_room_members` — the shape
-- the old `block_player` left behind — for B in A's private channel, with B
-- blocking A. Then, as B:
--
--   post_chat_message   REFUSED, "that room is not there".        Correct.
--   read_chat_room      OK -> {"posts": [], "topic": {"id": 73, "kind": "room",
--                       "slug": "secret-table-talk", "title": "Secret table
--                       talk", ... }}
--
-- The messages were gone and the ROOM was not. Its id, its slug, its title, who
-- made it and how many messages are in it all came back, because
-- `read_chat_room` is SECURITY INVOKER and reads `forum_topics` through its own
-- policy — and that policy asks `in_chat_room(id)`, which is a membership test
-- and nothing else.
--
-- A title is not nothing. "Secret table talk" is a fact about the person who
-- blocked you, handed to the person they blocked, along with the fact that they
-- are still talking in there. `post_chat_message` deliberately answers "that
-- room is not there" rather than "no" so that a private channel never confirms
-- its own existence to somebody outside it. This confirmed it.
--
-- ---------------------------------------------------------------------------
-- ONE GATE, ASKED EVERYWHERE
-- ---------------------------------------------------------------------------
-- `may_read_room` already encodes all of it: your own channel, an open one, the
-- site owner, a block either way, then membership. The two policies that were
-- deciding for themselves now ask it.
--
--   forum_topics        the private branch becomes may_read_room(id) outright.
--                       It already filters `private`, and may_read_room's
--                       "not private" case cannot fire under that filter.
--
--   forum_room_members  in_chat_room AND may_read_room, not may_read_room
--                       alone. `create_chat_room` makes the maker a member of
--                       OPEN channels too, and may_read_room says yes to an
--                       open channel for everybody — so swapping it in would
--                       hand every signed-in account the member list of every
--                       open channel. That is a widening, not a fix. The
--                       membership test stays and the block test is added to
--                       it.
--
-- No grants change: both are policies, and `in_chat_room` / `may_read_room` are
-- already granted to `authenticated` and to nobody else.
-- ============================================================================

drop policy if exists "a private channel is for its members" on public.forum_topics;
create policy "a private channel is for its members" on public.forum_topics
  for select to authenticated
  using (scope = 'board' and private and public.may_read_room(id));

drop policy if exists "you see who is in a channel you are in" on public.forum_room_members;
create policy "you see who is in a channel you are in" on public.forum_room_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_dev_admin()
    or (public.in_chat_room(topic_id) and public.may_read_room(topic_id))
  );
