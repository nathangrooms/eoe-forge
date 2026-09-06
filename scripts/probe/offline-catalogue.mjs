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

  /*
   * NAME LOOKUPS ARE SERVED FROM THE ROWS ALREADY RECORDED, not from an exact
   * key match, and that is what makes the tape useful for testing a CHANGE.
   *
   * `cardsByName` and `poolFacetsByName` are called with THE FINISHED DECK'S
   * names, so any change that moves one card changes the arguments and no
   * exact recording can exist. The cards themselves are in the recorded pools
   * regardless, because that is where the deck drew them from - so the answer
   * is reconstructed rather than replayed, from rows the tape genuinely holds.
   *
   * A name in NO recorded pool still throws. Never an empty row: a missing
   * card silently dropped from a deck is a fault that reads as the generator's.
   */
  const byName = new Map();
  const facetsByName = new Map();
  for (const [k, v] of tape) {
    if (k.startsWith('poolFor:') || k.startsWith('landPoolFor:') || k.startsWith('cardsByName:')) {
      for (const row of Array.isArray(v) ? v : []) if (row?.name && !byName.has(row.name)) byName.set(row.name, row);
    } else if (k.startsWith('poolFacetsByName:') && v?.__map) {
      for (const [n, f] of v.__map) if (!facetsByName.has(n)) facetsByName.set(n, f);
    }
  }

  const reconstruct = (method, args) => {
    if (method === 'cardsByName') {
      const names = args[0] ?? [];
      const rows = [], missing = [];
      for (const n of names) (byName.has(n) ? rows : missing).push(byName.get(n) ?? n);
      if (missing.length) return { missing };
      return { value: rows };
    }
    if (method === 'poolFacetsByName') {
      const names = args[0] ?? [];
      const out = new Map();
      const missing = [];
      for (const n of names) {
        /* THE POOL ROW IS THE FALLBACK, and leaving it out made the tape LOSSY
           in exactly the direction that hides a change. A recorded
           `poolFacetsByName` map only covers the names some earlier call asked
           for; a card the generator newly put in a deck was absent, so the
           probe saw it as carrying NO facets.
           Measured: Syr Konrad's deck came back missing facets for three cards
           and ALL THREE were removal - Opposition Agent, Zero Point Ballad,
           Finale of Eternity - so an "answers" count read 3 where the deck held
           6, and three separate engine changes measured as no-ops that were
           not. The rows are in the tape either way, from `poolFor`. */
        if (facetsByName.has(n)) out.set(n, facetsByName.get(n));
        else if (byName.has(n)) out.set(n, byName.get(n).facets ?? []);
        else missing.push(n);
      }
      if (missing.length) {
        throw new Error(`tape has no facets and no row for ${missing.length} card(s), first: ${missing[0]} - re-record`);
      }
      return { value: out };
    }
    return null;
  };

  for (const m of METHODS) {
    cat[m] = async (...args) => {
      const k = keyFor(m, args);
      if (!tape.has(k)) {
        const rebuilt = reconstruct(m, args);
        if (rebuilt?.value) return rebuilt.value;
        if (rebuilt?.missing) {
          throw new Error(`tape holds no row for ${rebuilt.missing.length} card(s), first: ${rebuilt.missing[0]} - re-record`);
        }
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
