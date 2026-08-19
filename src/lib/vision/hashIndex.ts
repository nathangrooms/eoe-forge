/**
 * The searchable hash index: a flat scan over every printing we hold.
 *
 * No tree, no LSH, no approximate nearest neighbour. A top-5 scan over the real
 * 50,269-entry index measured 0.50 ms in Node, because the inner loop is two
 * XORs and two popcounts over typed arrays with no allocation. Any index
 * structure would add build complexity, staleness and code to be wrong in, to
 * optimise something already far below one video frame — and far below the
 * ~65 ms the card detector spends before the search is even reached.
 *
 * Storage layout is four parallel `Uint32Array`s rather than a `BigUint64Array`
 * or an array of objects: measured at 0.40 ms versus 61.2 ms for the same scan.
 * Reproduce both with `scripts/vision/bench-match.mjs`.
 */

import { hamming64, type Hash64 } from './hash.ts';

/** One printing's row in the index. */
export interface IndexRow {
  /** `cards.id` — the printing, not the card. */
  cardId: string;
  /** Dense group id shared by every printing of the same card (same `oracle_id`). */
  oracleGroup: number;
  artPHash: Hash64;
  artDHash: Hash64;
}

/** A scored index hit. */
export interface HashCandidate {
  cardId: string;
  oracleGroup: number;
  /** Hamming distance on the art pHash, 0..64. Lower is better. */
  pDistance: number;
  /** Hamming distance on the art dHash, 0..64. */
  dDistance: number;
  /** Combined score used for ranking. See {@link combinedDistance}. */
  distance: number;
}

/**
 * Rank on pHash, with dHash as a tie-break only.
 *
 * pHash and dHash are not equally reliable, so averaging them would drag the
 * stronger signal toward the weaker one. But ties on pHash are common — it only
 * has 64 bits and near-identical art produces identical hashes — and when two
 * printings tie, dHash is the only thing that can separate them. Weighting it
 * at 1/64 makes it a pure tie-break that can never reorder a genuine pHash
 * difference.
 */
export function combinedDistance(pDistance: number, dDistance: number): number {
  return pDistance + dDistance / 64;
}

export const INDEX_MAGIC = 0x484d4456; // "DMVH" little-endian
export const INDEX_VERSION = 1;

/**
 * An immutable, searchable set of printing hashes.
 *
 * Built either from rows (in Node, at index build time) or from the packed
 * binary blob (in the browser, from cache).
 */
export class CardHashIndex {
  readonly size: number;
  private readonly pHi: Uint32Array;
  private readonly pLo: Uint32Array;
  private readonly dHi: Uint32Array;
  private readonly dLo: Uint32Array;
  private readonly oracleGroup: Uint32Array;
  private readonly cardIds: string[];

  private constructor(
    size: number,
    pHi: Uint32Array,
    pLo: Uint32Array,
    dHi: Uint32Array,
    dLo: Uint32Array,
    oracleGroup: Uint32Array,
    cardIds: string[],
  ) {
    this.size = size;
    this.pHi = pHi;
    this.pLo = pLo;
    this.dHi = dHi;
    this.dLo = dLo;
    this.oracleGroup = oracleGroup;
    this.cardIds = cardIds;
  }

  static fromRows(rows: readonly IndexRow[]): CardHashIndex {
    const n = rows.length;
    const pHi = new Uint32Array(n);
    const pLo = new Uint32Array(n);
    const dHi = new Uint32Array(n);
    const dLo = new Uint32Array(n);
    const grp = new Uint32Array(n);
    const ids: string[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const r = rows[i];
      pHi[i] = r.artPHash.hi >>> 0;
      pLo[i] = r.artPHash.lo >>> 0;
      dHi[i] = r.artDHash.hi >>> 0;
      dLo[i] = r.artDHash.lo >>> 0;
      grp[i] = r.oracleGroup >>> 0;
      ids[i] = r.cardId;
    }
    return new CardHashIndex(n, pHi, pLo, dHi, dLo, grp, ids);
  }

  /** The printing id at a row position. */
  cardIdAt(i: number): string {
    return this.cardIds[i];
  }

  /**
   * The full row at a position, hashes included.
   *
   * Exists so tooling can derive a smaller index from a larger one (see
   * `scripts/vision/make-fixtures.mjs`) without reaching into the packed byte
   * layout, which would duplicate format knowledge that only this class should
   * own.
   */
  rowAt(i: number): IndexRow {
    if (i < 0 || i >= this.size) throw new RangeError(`row ${i} out of range 0..${this.size - 1}`);
    return {
      cardId: this.cardIds[i],
      oracleGroup: this.oracleGroup[i],
      artPHash: { hi: this.pHi[i], lo: this.pLo[i] },
      artDHash: { hi: this.dHi[i], lo: this.dLo[i] },
    };
  }

  private groupMap: Map<number, string[]> | null = null;
  private idMap: Map<string, number> | null = null;

  /**
   * Row position of a printing id, or -1.
   *
   * Backed by a lazily-built map rather than a scan. This is not a
   * micro-optimisation: {@link distanceTo} is called once per sibling by the
   * printing-resolution layer, so a linear scan made that layer quadratic in
   * catalogue size. Measured over a 54k-row index, `indexOf` cost 2.3-3.8 ms per
   * call, so a card with 12 printings spent ~28 ms here against 0.74 ms for the
   * whole top-10 search — and it was the multi-printing cards, the ones this
   * feature exists to disambiguate, that paid it.
   */
  private rowOf(cardId: string): number {
    if (!this.idMap) {
      const m = new Map<string, number>();
      // Reverse order so that, if an id somehow appears twice, the map keeps the
      // first occurrence — matching the `indexOf` behaviour this replaced.
      for (let i = this.size - 1; i >= 0; i--) m.set(this.cardIds[i], i);
      this.idMap = m;
    }
    return this.idMap.get(cardId) ?? -1;
  }

  /**
   * Every printing we hold of the same card, by group id.
   *
   * This is what lets printing resolution happen entirely offline: once the
   * hash names a printing, its siblings are already in memory, so deciding
   * "is there anything else this could be?" costs no network call. Built lazily
   * and cached, because most scans never need it — 96% of cards in the
   * catalogue have exactly one printing.
   */
  printingsInGroup(group: number): string[] {
    if (!this.groupMap) {
      const m = new Map<number, string[]>();
      for (let i = 0; i < this.size; i++) {
        const g = this.oracleGroup[i];
        const arr = m.get(g);
        if (arr) arr.push(this.cardIds[i]);
        else m.set(g, [this.cardIds[i]]);
      }
      this.groupMap = m;
    }
    return this.groupMap.get(group) ?? [];
  }

  /**
   * The k nearest printings to a query hash pair.
   *
   * Maintains a small sorted top-k inline rather than scoring everything and
   * sorting afterwards: at k=10 over 34k rows the insertion branch is taken a
   * few dozen times, so this avoids allocating a 34k-element score array on
   * every video frame.
   */
  search(queryP: Hash64, queryD: Hash64, k = 10): HashCandidate[] {
    const qpHi = queryP.hi >>> 0;
    const qpLo = queryP.lo >>> 0;
    const qdHi = queryD.hi >>> 0;
    const qdLo = queryD.lo >>> 0;

    const bestScore = new Float64Array(k).fill(Infinity);
    const bestIdx = new Int32Array(k).fill(-1);

    const { pHi, pLo, dHi, dLo, size } = this;

    for (let i = 0; i < size; i++) {
      const pd = popcnt((pHi[i] ^ qpHi) >>> 0) + popcnt((pLo[i] ^ qpLo) >>> 0);
      // Cheap gate: dHash only ever adds at most 1.0 to the score, so anything
      // more than one full pHash bit worse than the current worst survivor
      // cannot make the list. Skips the second popcount pair for most rows.
      if (pd > bestScore[k - 1]) continue;
      const dd = popcnt((dHi[i] ^ qdHi) >>> 0) + popcnt((dLo[i] ^ qdLo) >>> 0);
      const score = pd + dd / 64;
      if (score < bestScore[k - 1]) {
        let j = k - 1;
        while (j > 0 && bestScore[j - 1] > score) {
          bestScore[j] = bestScore[j - 1];
          bestIdx[j] = bestIdx[j - 1];
          j--;
        }
        bestScore[j] = score;
        bestIdx[j] = i;
      }
    }

    const out: HashCandidate[] = [];
    for (let j = 0; j < k; j++) {
      const i = bestIdx[j];
      if (i < 0) continue;
      const pd = popcnt((pHi[i] ^ qpHi) >>> 0) + popcnt((pLo[i] ^ qpLo) >>> 0);
      const dd = popcnt((dHi[i] ^ qdHi) >>> 0) + popcnt((dLo[i] ^ qdLo) >>> 0);
      out.push({
        cardId: this.cardIds[i],
        oracleGroup: this.oracleGroup[i],
        pDistance: pd,
        dDistance: dd,
        distance: combinedDistance(pd, dd),
      });
    }
    return out;
  }

  /** Distance from a query to one specific printing, or null if absent. */
  distanceTo(cardId: string, queryP: Hash64, queryD: Hash64): HashCandidate | null {
    const i = this.rowOf(cardId);
    if (i < 0) return null;
    const pd = hamming64({ hi: this.pHi[i], lo: this.pLo[i] }, queryP);
    const dd = hamming64({ hi: this.dHi[i], lo: this.dLo[i] }, queryD);
    return {
      cardId,
      oracleGroup: this.oracleGroup[i],
      pDistance: pd,
      dDistance: dd,
      distance: combinedDistance(pd, dd),
    };
  }

  /**
   * Serialise to a compact binary blob for caching.
   *
   * Card ids are packed as raw 16-byte UUIDs where they are canonical UUIDs,
   * which most are. Anything else (the handful of hand-seeded rows) goes into a
   * trailing string table. Storing all ids as text would cost 36 bytes each
   * instead of 16 — about 680 KB more across the catalogue, on a payload a phone
   * has to download.
   */
  toBytes(): Uint8Array {
    const n = this.size;
    const irregular: Array<[number, string]> = [];
    const uuidBytes = new Uint8Array(n * 16);
    for (let i = 0; i < n; i++) {
      const packed = packUuid(this.cardIds[i]);
      if (packed) uuidBytes.set(packed, i * 16);
      else irregular.push([i, this.cardIds[i]]);
    }

    const strTable = new TextEncoder().encode(
      irregular.map(([i, s]) => `${i}:${s}`).join('\n'),
    );

    const headerBytes = 24;
    const total = headerBytes + n * (16 + 4 + 16) + strTable.byteLength;
    const buf = new ArrayBuffer(total);
    const view = new DataView(buf);
    const bytes = new Uint8Array(buf);

    view.setUint32(0, INDEX_MAGIC, true);
    view.setUint32(4, INDEX_VERSION, true);
    view.setUint32(8, n, true);
    view.setUint32(12, strTable.byteLength, true);
    view.setUint32(16, irregular.length, true);
    view.setUint32(20, 0, true); // reserved

    let off = headerBytes;
    bytes.set(uuidBytes, off);
    off += n * 16;
    for (let i = 0; i < n; i++, off += 4) view.setUint32(off, this.oracleGroup[i], true);
    for (let i = 0; i < n; i++, off += 4) view.setUint32(off, this.pHi[i], true);
    for (let i = 0; i < n; i++, off += 4) view.setUint32(off, this.pLo[i], true);
    for (let i = 0; i < n; i++, off += 4) view.setUint32(off, this.dHi[i], true);
    for (let i = 0; i < n; i++, off += 4) view.setUint32(off, this.dLo[i], true);
    bytes.set(strTable, off);

    return bytes;
  }

  /** Inverse of {@link toBytes}. */
  static fromBytes(bytes: Uint8Array): CardHashIndex {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== INDEX_MAGIC) throw new Error('hash index: bad magic');
    const version = view.getUint32(4, true);
    if (version !== INDEX_VERSION) throw new Error(`hash index: unsupported version ${version}`);
    const n = view.getUint32(8, true);
    const strLen = view.getUint32(12, true);

    let off = 24;
    const ids: string[] = new Array(n);
    for (let i = 0; i < n; i++) ids[i] = unpackUuid(bytes, off + i * 16);
    off += n * 16;
    const grp = new Uint32Array(n);
    for (let i = 0; i < n; i++, off += 4) grp[i] = view.getUint32(off, true);
    const pHi = new Uint32Array(n);
    for (let i = 0; i < n; i++, off += 4) pHi[i] = view.getUint32(off, true);
    const pLo = new Uint32Array(n);
    for (let i = 0; i < n; i++, off += 4) pLo[i] = view.getUint32(off, true);
    const dHi = new Uint32Array(n);
    for (let i = 0; i < n; i++, off += 4) dHi[i] = view.getUint32(off, true);
    const dLo = new Uint32Array(n);
    for (let i = 0; i < n; i++, off += 4) dLo[i] = view.getUint32(off, true);

    if (strLen > 0) {
      const table = new TextDecoder().decode(bytes.subarray(off, off + strLen));
      for (const line of table.split('\n')) {
        const sep = line.indexOf(':');
        if (sep > 0) ids[Number(line.slice(0, sep))] = line.slice(sep + 1);
      }
    }

    return new CardHashIndex(n, pHi, pLo, dHi, dLo, grp, ids);
  }
}

function popcnt(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return (Math.imul(x, 0x01010101) >>> 24) & 0xff;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function packUuid(id: string): Uint8Array | null {
  if (!UUID_RE.test(id)) return null;
  const hex = id.replace(/-/g, '');
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function unpackUuid(bytes: Uint8Array, off: number): string {
  let hex = '';
  for (let i = 0; i < 16; i++) hex += bytes[off + i].toString(16).padStart(2, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
