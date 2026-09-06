/*
 * RECORD ONCE, REPLAY FOREVER. Take the database out of the measurement loop.
 *
 * WHY. Every probe builds decks through `Catalog` against live PostgREST, so
 * measurement and the live site share one small instance. That is what took
 * production down four times on 5-6 Sep 2026, and it is why a full measurement
 * pass had become something that needed permission rather than something you
 * just run.
 *
 * A build calls exactly FIVE catalogue methods and every one is a pure read:
 *
 *     poolFor  landPoolFor  cardsByName  poolFacetsByName  combosFor
 *
 * So RECORD wraps a real Catalog, remembers every (method, args) -> result, and
 * writes them to disk. REPLAY serves those answers with no network at all.
 *
 * ⚠️ RECORD/REPLAY, NOT A RECONSTRUCTED SNAPSHOT. CLAUDE.md records
 * `.shots/pool-snapshot.json` being used to measure the generator when it
 * carried no `oracle_text`: every facet computed from it came from nothing and
 * Kaalia was diagnosed as a compiler bug on the strength of it. Recording the
 * METHOD RESULTS cannot drift from what the code actually receives, because it
 * IS what the code received.
 *
 * ⚠️ IT ONLY KNOWS THE COMMANDERS IT RECORDED. A replay asked for anything else
 * THROWS rather than returning an empty pool, because an empty pool builds a
 * deck of basic lands and looks like a catastrophic engine regression.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const FILE = '.pool/catalogue-tape.json';
const METHODS = ['poolFor', 'landPoolFor', 'cardsByName', 'poolFacetsByName', 'combosFor'];

/* A stable key for a call. Sorted where order is not meaningful, so the same
   question recorded once is found again however the caller phrased it. */
function keyFor(method, args) {
  const norm = (v) => {
    if (Array.isArray(v)) return [...v].map(norm).sort();
    if (v && typeof v === 'object') {
      return Object.keys(v).sort().reduce((o, k) => { o[k] = norm(v[k]); return o; }, {});
    }
    return v;
  };
  return method + ':' + JSON.stringify(norm(args));
}

/** Wrap a live Catalog and remember every answer. */
export function recording(real) {
  const tape = new Map();
  const proxy = Object.create(real);
  for (const m of METHODS) {
    proxy[m] = async (...args) => {
      const out = await real[m](...args);
      /* A Map does not survive JSON, so it is tagged and rebuilt on replay. */
      tape.set(keyFor(m, args), out instanceof Map ? { __map: [...out] } : out);
      return out;
    };
  }
  /* MERGE, never replace. Each probe records a different set of commanders, so
     a save that overwrote would leave the tape describing only the last run. */
  proxy.__save = () => {
    mkdirSync('.pool', { recursive: true });
    const prior = existsSync(FILE) ? new Map(JSON.parse(readFileSync(FILE, 'utf8')).calls) : new Map();
    for (const [k, v] of tape) prior.set(k, v);
    writeFileSync(FILE, JSON.stringify({ recordedAt: new Date().toISOString(), calls: [...prior] }));
    return { added: tape.size, total: prior.size };
  };
  return proxy;
}

/** Serve recorded answers with no network. */
export function replaying() {
  if (!existsSync(FILE)) {
    throw new Error(`no catalogue tape. Record one: node --experimental-strip-types scripts/probe/record-catalogue.mjs`);
  }
  const snap = JSON.parse(readFileSync(FILE, 'utf8'));
  const tape = new Map(snap.calls);
  const cat = { recordedAt: snap.recordedAt, size: tape.size };
  for (const m of METHODS) {
    cat[m] = async (...args) => {
      const k = keyFor(m, args);
      if (!tape.has(k)) {
        /* NEVER an empty result. An empty pool builds a deck of basic lands and
           reads as a catastrophic engine regression rather than a missing
           recording. */
        throw new Error(`catalogue tape has no recording for ${k.slice(0, 120)} - re-record with this commander included`);
      }
      const v = tape.get(k);
      return v && v.__map ? new Map(v.__map) : v;
    };
  }
  return cat;
}

/*
 * The probes also read PostgREST directly for their own analysis - a commander
 * list, a card's oracle text. Those are GETs with no side effect, so the same
 * record/replay applies and the URL is the whole key.
 *
 * Install it ONCE per process and every raw fetch in that probe is taped too,
 * which is what makes `replay` mean NO NETWORK rather than merely no catalogue.
 */
export function tapedFetch(mode) {
  if (mode !== 'record' && mode !== 'replay') return globalThis.fetch;
  const real = globalThis.fetch;
  const store = new Map();
  const disk = mode === 'replay' && existsSync(FILE)
    ? new Map(JSON.parse(readFileSync(FILE, 'utf8')).calls)
    : new Map();

  const wrapped = async (url, init) => {
    const key = 'GET:' + String(url);
    if (mode === 'replay') {
      if (!disk.has(key)) throw new Error(`tape has no recording for ${key.slice(0, 140)}`);
      const body = disk.get(key);
      /* A Response, so a caller doing res.json() or res.ok is unchanged. */
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const res = await real(url, init);
    const text = await res.text();
    try { store.set(key, JSON.parse(text)); } catch { /* not json, not taped */ }
    return new Response(text, { status: res.status, headers: res.headers });
  };
  wrapped.__save = () => {
    mkdirSync('.pool', { recursive: true });
    const prior = existsSync(FILE) ? new Map(JSON.parse(readFileSync(FILE, 'utf8')).calls) : new Map();
    for (const [k, v] of store) prior.set(k, v);
    writeFileSync(FILE, JSON.stringify({ recordedAt: new Date().toISOString(), calls: [...prior] }));
    return store.size;
  };
  return wrapped;
}
