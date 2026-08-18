/**
 * DeckMatrix — networked play: the durable log.
 *
 * A game is its action log, so persisting a game means persisting a list of
 * small immutable rows and nothing else. No serialised `GameState` on every
 * move, no diffing, no "save game" — reconnect, spectate, replay and dispute
 * resolution are all the same operation read from different offsets.
 *
 * ---------------------------------------------------------------------------
 * Two write policies, one interface
 * ---------------------------------------------------------------------------
 * CASUAL (default). Clients broadcast peer-to-peer; one participant flushes
 * batches to the store every few seconds. Order is settled client-side by the
 * deterministic key in `protocol.ts`, so the store is a backup, not a
 * bottleneck. A player who reloads refetches the log and refolds. Cost: a write
 * every few seconds per game instead of one per action, which is the difference
 * between ~7,500 inserts/second and ~150 at ten thousand concurrent games.
 *
 * RANKED. Every batch goes through `append_action()`, which validates, assigns
 * the sequence number and broadcasts from a trigger. The database is the
 * sequencer, so there is a single true order and a rejected action never enters
 * the log. Cost: a round trip per batch (~50-150ms, hidden by optimistic local
 * application) and one write per batch.
 *
 * The session cannot tell which it has. That is the point of putting them
 * behind one interface.
 *
 * ---------------------------------------------------------------------------
 * The thing that will actually hurt: storage
 * ---------------------------------------------------------------------------
 * A Commander game is on the order of 1,500-2,500 actions. Even compacted into
 * batches that is a few hundred rows and a couple of hundred KB per game. Ten
 * thousand concurrent games is roughly 320,000 games a day, which is terabytes
 * a month if every finished game is kept as rows forever. See `cost.ts` for the
 * arithmetic; the mitigations are in `RETENTION` below and they are not
 * optional at that scale.
 */

import type { LogEntry } from './protocol.ts';

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

export interface AppendResult {
  /** Position assigned. Monotonic and gapless per table. */
  seq: number;
  /** True when this batch was already present — replayed, not re-appended. */
  duplicate: boolean;
}

export interface ActionLogStore {
  /**
   * Append one batch. Must be idempotent on `batchId`: a client that retries
   * after a timeout has to get the original sequence number back, not a second
   * copy of its turn.
   */
  append(entry: LogEntry): Promise<AppendResult>;
  /** Everything at or after `fromSeq`, in order. The reconnect and spectate path. */
  read(tableId: string, fromSeq?: number): Promise<LogEntry[]>;
  /** Newest snapshot at or before `atEntry`, so a long game need not refold from zero. */
  loadAnchor(tableId: string, atEntry?: number): Promise<{ entries: number; state: unknown } | null>;
  saveAnchor(tableId: string, entries: number, state: unknown, digest: string): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* In-memory implementation                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Reference implementation. Backs the tests and local play, and pins down the
 * contract the Postgres one has to meet — particularly idempotency, which is
 * the part that is easy to get wrong and impossible to notice until a player
 * takes two turns.
 */
export class MemoryActionLogStore implements ActionLogStore {
  private readonly logs = new Map<string, LogEntry[]>();
  private readonly byBatch = new Map<string, number>();
  private readonly anchors = new Map<string, Array<{ entries: number; state: unknown; digest: string }>>();

  async append(entry: LogEntry): Promise<AppendResult> {
    const key = `${entry.tableId}/${entry.batchId}`;
    const existing = this.byBatch.get(key);
    if (existing !== undefined) return { seq: existing, duplicate: true };

    const log = this.logs.get(entry.tableId) ?? [];
    const seq = log.length + 1;
    log.push({ ...entry, seq });
    this.logs.set(entry.tableId, log);
    this.byBatch.set(key, seq);
    return { seq, duplicate: false };
  }

  async read(tableId: string, fromSeq = 1): Promise<LogEntry[]> {
    return (this.logs.get(tableId) ?? []).filter(entry => (entry.seq ?? 0) >= fromSeq);
  }

  async loadAnchor(tableId: string, atEntry = Number.MAX_SAFE_INTEGER) {
    const list = this.anchors.get(tableId) ?? [];
    let best: { entries: number; state: unknown } | null = null;
    for (const anchor of list) {
      if (anchor.entries <= atEntry && (!best || anchor.entries > best.entries)) best = anchor;
    }
    return best;
  }

  async saveAnchor(tableId: string, entries: number, state: unknown, digest: string): Promise<void> {
    const list = this.anchors.get(tableId) ?? [];
    list.push({ entries, state, digest });
    this.anchors.set(tableId, list);
  }
}

/* -------------------------------------------------------------------------- */
/* Retention                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * What keeps the storage bill finite. Numbers are starting points, not physics.
 */
export const RETENTION = {
  /** Snapshot every N entries so a reconnect folds tens of entries, not thousands. */
  anchorEveryEntries: 200,
  /** Live games keep every row. Nothing else is safe against a mid-game dispute. */
  liveKeepsFullLog: true,
  /**
   * On completion, collapse to: final anchor + the dealer's disclosed seed +
   * a gzipped blob of the entries in object storage. Rows are then dropped.
   * A 250 KB log compresses to roughly 25 KB of highly repetitive JSON.
   */
  onCompleteCompactToBlob: true,
  /** Unflagged, uncompacted finished games age out. Flagged ones never do. */
  purgeFinishedAfterDays: 7,
} as const;

/* -------------------------------------------------------------------------- */
/* Schema sketch                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The tables this design needs, written out so the shape and the RLS are
 * reviewable before anything is created. **Not executed anywhere.** No
 * migration is added by this work and no table exists yet.
 *
 * Three things in here are load-bearing and easy to get wrong:
 *
 *  1. `game_actions` has no UPDATE and no DELETE policy at all. Append-only is
 *     enforced by the absence of a policy, not by a convention. A log that can
 *     be edited is not evidence of anything.
 *
 *  2. `game_secrets` has RLS enabled and **zero policies**, which under RLS
 *     means no client can read it by any route. Only `service_role`, which
 *     bypasses RLS, can — and that key never reaches a browser. This is the
 *     whole hidden-information guarantee, and it is one line of SQL.
 *
 *  3. `seq` is assigned inside `append_action`, never by the client. A client
 *     that picks its own sequence number can rewrite the order of the game.
 */
export const SCHEMA_SKETCH = `
-- ── tables ────────────────────────────────────────────────────────────────
create table game_tables (
  id             uuid primary key default gen_random_uuid(),
  format         text not null,
  status         text not null default 'lobby',   -- lobby | playing | complete
  -- digest(secret_seed || id), published before the first draw. The seed is
  -- released on completion so any player can re-derive and audit the deal.
  seed_commitment text not null,
  public_seed    integer not null,                -- permutes anonymous slots only
  host_user      uuid not null references auth.users on delete cascade,
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);

create table game_participants (
  table_id   uuid not null references game_tables on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  player_id  text not null,          -- seat id inside GameState ('p1'..)
  seat       smallint not null,      -- part of the order key; must match everywhere
  joined_at  timestamptz not null default now(),
  primary key (table_id, user_id)
);

-- The game. Append-only.
create table game_actions (
  table_id     uuid not null references game_tables on delete cascade,
  seq          bigint not null,              -- assigned by append_action(), never by a client
  batch_id     text not null,                -- idempotency key
  user_id      uuid not null references auth.users,
  player_id    text not null,
  base_version integer not null,
  seat         smallint not null,
  actions      jsonb not null,               -- GameAction[]
  at           bigint not null,              -- sender clock; display only
  created_at   timestamptz not null default now(),
  primary key (table_id, seq),
  unique (table_id, batch_id)
);

-- Refold anchors, so a reconnect at turn 30 folds ~200 entries and not 2,000.
create table game_anchors (
  table_id uuid not null references game_tables on delete cascade,
  entries  integer not null,
  state    jsonb not null,
  digest   text not null,
  primary key (table_id, entries)
);

-- The deal. Never leaves the server.
create table game_secrets (
  table_id    uuid primary key references game_tables on delete cascade,
  secret_seed bigint not null,
  identities  jsonb not null,   -- instanceId -> card
  revealed_at timestamptz
);

-- ── row level security ────────────────────────────────────────────────────
alter table game_tables       enable row level security;
alter table game_participants enable row level security;
alter table game_actions      enable row level security;
alter table game_anchors      enable row level security;
alter table game_secrets      enable row level security;

-- No policies on game_secrets. Under RLS that means: nobody, ever, except
-- service_role. Deliberate, and the single line the hidden-information design
-- rests on.

create policy "participants read their table"
  on game_tables for select to authenticated
  using (exists (
    select 1 from game_participants p
    where p.table_id = game_tables.id and p.user_id = (select auth.uid())
  ));

create policy "participants read the log"
  on game_actions for select to authenticated
  using (exists (
    select 1 from game_participants p
    where p.table_id = game_actions.table_id and p.user_id = (select auth.uid())
  ));

-- Insert only as yourself, only into a table you sit at, only on your own seat.
-- Note what this canNOT check: that seq is the next one. That is why the RPC
-- below exists and why clients should not be granted insert in ranked play.
create policy "participants append their own actions"
  on game_actions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from game_participants p
      where p.table_id = game_actions.table_id
        and p.user_id  = (select auth.uid())
        and p.player_id = game_actions.player_id
    )
  );

-- Deliberately absent: any update or delete policy on game_actions.

-- ── the sequencer ─────────────────────────────────────────────────────────
-- Ranked play routes every batch through this. It assigns seq under a
-- per-table advisory lock, so two simultaneous callers cannot both claim the
-- same position, and it is idempotent on batch_id so a retry after a timeout
-- returns the original position rather than duplicating a turn.
create or replace function append_action(
  p_table  uuid,
  p_batch  text,
  p_player text,
  p_seat   smallint,
  p_base   integer,
  p_actions jsonb,
  p_at     bigint
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq bigint;
begin
  if not exists (
    select 1 from game_participants
    where table_id = p_table and user_id = auth.uid() and player_id = p_player
  ) then
    raise exception 'not your seat';
  end if;

  select seq into v_seq from game_actions
  where table_id = p_table and batch_id = p_batch;
  if found then return v_seq; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_table::text, 0));

  select coalesce(max(seq), 0) + 1 into v_seq
  from game_actions where table_id = p_table;

  insert into game_actions (table_id, seq, batch_id, user_id, player_id,
                            base_version, seat, actions, at)
  values (p_table, v_seq, p_batch, auth.uid(), p_player,
          p_base, p_seat, p_actions, p_at);

  -- Fan out from the database, so the sequence number and the broadcast can
  -- never disagree about the order.
  perform realtime.send(
    jsonb_build_object('seq', v_seq, 'batchId', p_batch, 'playerId', p_player,
                       'seat', p_seat, 'baseVersion', p_base,
                       'actions', p_actions, 'at', p_at),
    'batch',
    'table:' || p_table::text,
    true
  );

  return v_seq;
end;
$$;

-- ── realtime authorization ────────────────────────────────────────────────
-- Private channels are gated by RLS on realtime.messages. Keep this policy
-- cheap: it runs on every channel join and Supabase warns that complex RLS
-- here raises connection latency and lowers the join rate.
create policy "participants use their table channel"
  on realtime.messages for select to authenticated
  using (exists (
    select 1 from game_participants p
    where p.user_id = (select auth.uid())
      and 'table:' || p.table_id::text = (select realtime.topic())
      and realtime.messages.extension in ('broadcast', 'presence')
  ));
`;
