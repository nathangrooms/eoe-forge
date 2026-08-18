/**
 * DeckMatrix — networked play: agreeing on the order without a coordinator.
 *
 * A broadcast channel fans a message out to each subscriber independently. It
 * does not promise that two *different* senders' messages arrive in the same
 * sequence at every receiver, and at four players on four continents they
 * routinely will not. "Apply in arrival order" therefore forks the game.
 *
 * The usual fixes are a server that stamps a sequence number on everything (a
 * round trip on every action, and a machine that has to stay up), or a locked
 * turn where only one player may act (correct for Magic most of the time, wrong
 * exactly when it matters — responses, blocks, instant-speed interaction).
 *
 * This module takes the third option, which the pure reducer makes almost free:
 * **order is computed, not assigned**. Every entry carries an `OrderKey` that
 * sorts the same way on every machine, so the log is a sorted set rather than a
 * queue. Apply optimistically as things arrive; when an entry turns up that
 * belongs *earlier* than something already applied, rewind to that point and
 * re-fold. Re-folding is cheap because the reducer is pure — replaying is the
 * only thing it knows how to do.
 *
 * How often does a rewind actually happen? Magic is the friendly case: the
 * rules already serialise play through a single priority holder, so two players
 * legitimately acting at the same `baseVersion` is a narrow race around a
 * priority handoff, not the steady state. `OrderedLog` reports every rewind so
 * that assumption stays measured rather than assumed.
 */

import { compareOrderKeys, type LogEntry } from './protocol.ts';

/**
 * What happened to the log when an entry was offered.
 *
 *   'appended'  — it sorted after everything held. The common case, and the
 *                 only one where the caller can just fold forward.
 *   'rewound'   — it sorted before entries already applied. The caller must
 *                 discard state from `index` and re-fold from there.
 *   'duplicate' — already held, by `batchId`. Channels redeliver; so does a
 *                 resync overlapping the live feed.
 */
export type InsertOutcome = 'appended' | 'rewound' | 'duplicate';

export interface InsertResult {
  outcome: InsertOutcome;
  /** Position the entry landed at. For 'rewound', the first index now invalid. */
  index: number;
  entry: LogEntry;
}

/**
 * The ordered log for one table.
 *
 * Holds entries only — no game state. Keeping the two apart is what lets the
 * session own the (expensive) folding policy while this stays a sorted array
 * with an idempotency set.
 */
export class OrderedLog {
  private entries: LogEntry[] = [];
  private readonly seen = new Set<string>();
  private rewinds = 0;
  private deepestRewind = 0;

  get length(): number {
    return this.entries.length;
  }

  /** Live view. Treat as read-only; the session slices it to re-fold. */
  all(): readonly LogEntry[] {
    return this.entries;
  }

  at(index: number): LogEntry | undefined {
    return this.entries[index];
  }

  slice(from: number, to?: number): LogEntry[] {
    return this.entries.slice(from, to);
  }

  has(batchId: string): boolean {
    return this.seen.has(batchId);
  }

  /** Rewinds so far, and the largest number of entries ever undone. Telemetry. */
  stats(): { entries: number; rewinds: number; deepestRewind: number } {
    return { entries: this.entries.length, rewinds: this.rewinds, deepestRewind: this.deepestRewind };
  }

  /**
   * Place one entry in sorted position.
   *
   * Fast path is a single comparison against the tail, which is what happens
   * for every entry in a game where nobody raced.
   */
  insert(entry: LogEntry): InsertResult {
    if (this.seen.has(entry.batchId)) {
      const index = this.entries.findIndex(held => held.batchId === entry.batchId);
      return { outcome: 'duplicate', index, entry: this.entries[index] ?? entry };
    }

    this.seen.add(entry.batchId);

    const tail = this.entries[this.entries.length - 1];
    if (!tail || compareOrderKeys(tail.key, entry.key) < 0) {
      this.entries.push(entry);
      return { outcome: 'appended', index: this.entries.length - 1, entry };
    }

    const index = this.insertionIndexFor(entry);
    this.entries.splice(index, 0, entry);
    this.rewinds += 1;
    const undone = this.entries.length - 1 - index;
    if (undone > this.deepestRewind) this.deepestRewind = undone;
    return { outcome: 'rewound', index, entry };
  }

  /**
   * Replace the whole log, as after a resync against the durable store.
   * Returns the first index whose entry changed, so the session knows how far
   * back to re-fold rather than always folding from zero.
   */
  replaceAll(entries: readonly LogEntry[]): number {
    let firstChanged = 0;
    const limit = Math.min(entries.length, this.entries.length);
    while (firstChanged < limit && this.entries[firstChanged].batchId === entries[firstChanged].batchId) {
      firstChanged += 1;
    }

    this.entries = entries.slice();
    this.seen.clear();
    for (const entry of this.entries) this.seen.add(entry.batchId);
    return firstChanged;
  }

  /** Binary search for the first held entry that sorts after `entry`. */
  private insertionIndexFor(entry: LogEntry): number {
    let low = 0;
    let high = this.entries.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (compareOrderKeys(this.entries[mid].key, entry.key) < 0) low = mid + 1;
      else high = mid;
    }
    return low;
  }
}
