-- Two defects found by adversarial review of the online-tables and playmat work.
--
-- ---------------------------------------------------------------------------
-- 1. THE game_participants POLICY RECURSED INTO ITSELF
-- ---------------------------------------------------------------------------
-- The SELECT policy on `game_participants` read `game_participants` inside its
-- own USING clause. Postgres re-applies the policy to that subquery, and stops
-- with SQLSTATE 42P17:
--
--     ERROR: infinite recursion detected in policy for relation "game_participants"
--
-- Measured against real user ids: EVERY authenticated read of the table failed,
-- including a player reading their own row. `game_tables` and `game_actions`
-- both name `game_participants` in their policies, so both failed too. So did
-- the two `realtime.messages` policies, which is the channel join.
--
-- Nothing at an online table could be read by anybody. Not the lobby, not the
-- seats, not the log. This was not a leak, it was the opposite: total failure.
-- It went unnoticed because no client code calls any of these functions yet, so
-- the only thing that ever exercised the policies was a review that tried.
--
-- The fix is the one Supabase documents for this exact trap: a SECURITY DEFINER
-- helper does the membership lookup, so the subquery is not subject to the
-- policy that is asking the question.
--
-- ---------------------------------------------------------------------------
-- 2. object_path DECIDES WHO MAY READ A FILE, AND THE CLIENT COULD WRITE IT
-- ---------------------------------------------------------------------------
-- `playmat_visible_to_me` answers "may I read this file" with, in its first
-- branch, "is there a row in `playmats` with this object_path and my user id".
-- That makes `playmats.object_path` an authorisation column.
--
-- `playmat_prefs` had its writes revoked for exactly this reasoning, written
-- into the migration: "A direct write could point the column at anybody's row."
-- `playmats` did not. `authenticated` kept INSERT, UPDATE and DELETE.
--
-- Measured: a signed-in user inserted a `playmats` row naming ANOTHER user's
-- storage path and immediately gained SELECT on that object in
-- `storage.objects`. The only thing standing between that and every mat in the
-- bucket is the UNIQUE constraint on `object_path`, which blocks paths that are
-- already recorded and does nothing for a path that is not. An upload whose
-- `record_playmat` call never landed is exactly that path.
--
-- Also measured: the eight-mat limit lives only inside `record_playmat`, so a
-- direct INSERT walked straight past it. 30 rows, one statement.
--
-- DELETE is kept. It is scoped by RLS to your own rows, deleting your own mat is
-- what the client actually does, and a row you deleted cannot authorise anything.
-- INSERT and UPDATE go, and the blanket FOR ALL policy is replaced by explicit
-- SELECT and DELETE policies so a future GRANT cannot quietly re-open the hole.
--
-- ---------------------------------------------------------------------------
-- 3. TWO NARROWER THINGS, FOUND ON THE WAY
-- ---------------------------------------------------------------------------
-- `playmat_visible_to_me` joined `playmat_prefs` to `playmats` on the mat id
-- alone, never checking the preference row and the mat belong to the same
-- person. Nothing can produce that state today because `set_playmat_prefs`
-- refuses a mat that is not yours, but the read rule should not depend on a
-- write rule somewhere else to be correct.
--
-- `playmats_at_table` had no status check, so it kept handing out every seat's
-- object path after the game finished. The storage policy stops the actual
-- read, so no picture leaked. What leaked is the path, and the path is the one
-- string defect 2 needs. It now ends when the game ends, like everything else.

-- ---------------------------------------------------------------------------
-- 1. Membership, asked once, without recursion
-- ---------------------------------------------------------------------------

create or replace function public.at_game_table(p_table uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.game_participants p
    where p.table_id = p_table and p.user_id = (select auth.uid())
  );
$$;

comment on function public.at_game_table(uuid) is
  'Am I seated at this table. SECURITY DEFINER so a policy on game_participants can ask it without re-entering its own policy.';

-- Same question, phrased for a Realtime topic, so a channel join is one
-- index lookup and not a policy evaluation per participant row.
create or replace function public.may_use_game_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.game_participants p
    where p.user_id = (select auth.uid())
      and 'game:' || p.table_id::text = p_topic
  );
$$;

comment on function public.may_use_game_topic(text) is
  'May I join this Realtime topic. Grants game:<table id> to that table''s players and nothing else.';

revoke all on function public.at_game_table(uuid)      from public, anon, authenticated;
revoke all on function public.may_use_game_topic(text) from public, anon, authenticated;
grant execute on function public.at_game_table(uuid)      to authenticated;
grant execute on function public.may_use_game_topic(text) to authenticated;

drop policy if exists "players read who else is at their table" on public.game_participants;
create policy "players read who else is at their table"
  on public.game_participants for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.at_game_table(table_id)
  );

drop policy if exists "players read their own table" on public.game_tables;
create policy "players read their own table"
  on public.game_tables for select to authenticated
  using (
    host_user = (select auth.uid())
    or public.at_game_table(id)
  );

drop policy if exists "players read the log of their own table" on public.game_actions;
create policy "players read the log of their own table"
  on public.game_actions for select to authenticated
  using (public.at_game_table(table_id));

drop policy if exists "players listen on their own game channel" on realtime.messages;
create policy "players listen on their own game channel"
  on realtime.messages for select to authenticated
  using (public.may_use_game_topic((select realtime.topic())));

drop policy if exists "players speak on their own game channel" on realtime.messages;
create policy "players speak on their own game channel"
  on realtime.messages for insert to authenticated
  with check (public.may_use_game_topic((select realtime.topic())));

-- ---------------------------------------------------------------------------
-- 2. A mat row is written by record_playmat or by nobody
-- ---------------------------------------------------------------------------

revoke insert, update on public.playmats from anon, authenticated;

drop policy if exists "your playmats are yours" on public.playmats;

create policy "you read your own playmats"
  on public.playmats for select to authenticated
  using (user_id = (select auth.uid()));

create policy "you delete your own playmats"
  on public.playmats for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. The two narrower ones
-- ---------------------------------------------------------------------------

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
      join public.playmat_prefs pr         on pr.playmat_id = m.id
                                          and pr.user_id = m.user_id
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
    join public.game_tables t    on t.id = p.table_id
   where p.table_id = p_table
     and t.status in ('lobby', 'playing')
     and exists (
       select 1 from public.game_participants mine
        where mine.table_id = p_table and mine.user_id = (select auth.uid())
     );
$$;

comment on function public.playmats_at_table(uuid) is
  'Every seat''s live mat at one live table, for a caller seated at it. Paths only, and only while the game is live, because the path is what the storage rule matches on.';

-- Re-granting after CREATE OR REPLACE: replacing a function keeps its ACL, but
-- revoking PUBLIC is stated again because this project has now lost three
-- migrations to the assumption that it does not need to be.
revoke all on function public.playmat_visible_to_me(text) from public, anon, authenticated;
revoke all on function public.playmats_at_table(uuid)     from public, anon, authenticated;
grant execute on function public.playmat_visible_to_me(text) to authenticated;
grant execute on function public.playmats_at_table(uuid)     to authenticated;

revoke truncate on public.playmats from anon, authenticated;
revoke all on public.playmats from anon;
