-- The lobby is a read that was doing a write on every call.
--
-- open_game_tables() lists open tables. Before returning them it swept tables
-- idle for 30 minutes, and every client poll from every signed in player ran
-- that sweep. The guard meant the DELETE only fired when there was something to
-- collect, but that is exactly the moment every concurrent poller fires it at
-- once, and they then queue on the same row locks. Measured over 2,453 calls:
--
--   mean 52 ms, max 3,515 ms
--
-- against a 3 s statement_timeout. So when the lobby had stale tables in it,
-- which is precisely when a player is most likely to be looking, the listing
-- could time out and the player saw no tables at all.
--
-- The sweep is housekeeping. It does not have to happen on this call, it has to
-- happen eventually, and one poller doing it is enough. A transaction level
-- advisory lock says so: whoever gets it sweeps, everybody else goes straight
-- to the read instead of queueing behind them. The lock is released when the
-- transaction ends, so a sweep that fails cannot wedge the lobby shut.
--
-- pg_cron is not installed on this project or the sweep would live there
-- instead and the read path would be clean.

CREATE OR REPLACE FUNCTION public.open_game_tables()
 RETURNS TABLE(id uuid, code text, format text, visibility text, max_seats smallint,
               seats_taken integer, host_name text, seated boolean,
               created_at timestamp with time zone, last_activity_at timestamp with time zone,
               seats jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_idle constant interval := interval '30 minutes';
  v_cut  timestamptz := now() - v_idle;
begin
  if v_user is null then
    raise exception 'sign in to see the lobby';
  end if;

  -- Housekeeping, and only ever one at a time. pg_try_advisory_xact_lock
  -- returns immediately either way, so a poller that loses the race pays
  -- nothing and reads the lobby while somebody else tidies it.
  if pg_try_advisory_xact_lock(hashtext('open_game_tables_sweep')::bigint) then
    if exists (
      select 1 from public.game_tables t
       where t.status = 'lobby' and t.last_activity_at < v_cut
    ) then
      delete from public.game_tables t
       where t.status = 'lobby' and t.last_activity_at < v_cut;
    end if;
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
$function$;
