/**
 * DeckMatrix — networked play.
 *
 *   import { GameSession, dealTable, PeerAuthority } from '@/lib/game/net';
 *
 * The multiplayer seam, built on the one property `src/lib/game` already has:
 * `applyAction` is pure, seeded and deterministic, so a game *is* its ordered
 * action log and any client folding that log reaches identical state. Nothing
 * here modifies the reducer; this layer only decides what travels, in what
 * order, and who is allowed to send it.
 *
 *   - `protocol.ts`    the wire vocabulary and the deterministic order key
 *   - `ordering.ts`    a sorted log that reports when it had to rewind
 *   - `session.ts`     apply locally, coalesce, broadcast, refold on a rewind
 *   - `realtime.ts`    the Supabase Realtime transport, with the channel
 *                      injected so this folder still imports no Supabase
 *   - `authority.ts`   who may send what, and an honest list of what that
 *                      cannot prevent
 *   - `secrets.ts`     hidden information — the part a replayable seeded log
 *                      does *not* give you for free
 *   - `digest.ts`      cheap convergence checking, so a fork is noticed
 *   - `persistence.ts` the append-only log, its RLS, and the retention that
 *                      keeps storage finite
 *   - `cost.ts`        the arithmetic at 100 / 1,000 / 10,000 concurrent games
 *
 * The shape of it, in one paragraph. A client applies its own action
 * immediately and broadcasts it coalesced into a batch. Every batch carries a
 * key — `(baseVersion, seat, batchId)` — that sorts identically on every
 * machine, so clients agree on the order without a coordinator; a batch that
 * arrives late and sorts early triggers a rewind and a refold, which is cheap
 * because the reducer never mutates. Every client re-validates every batch, so
 * a lone tampered client is outvoted rather than trusted. Card identities are
 * never in `GameState` at all: libraries and hands are anonymous slots, and a
 * dealer assigns identity only when a card stops being hidden. Which means the
 * state stays byte-identical everywhere and the integrity hash can cover all
 * of it.
 */

export * from './protocol.ts';
export * from './ordering.ts';
export * from './realtime.ts';
export * from './digest.ts';
export * from './authority.ts';
export * from './secrets.ts';
export * from './session.ts';
export * from './persistence.ts';
export * from './cost.ts';
