/*
 * ONE PLACE THE PROBES GET A CATALOGUE, so the database can be taken out of the
 * measurement loop without touching ten scripts.
 *
 *   (default)              live PostgREST, as before
 *   DM_TAPE=record         live, and remember every answer
 *   DM_TAPE=replay         the tape only. NO NETWORK AT ALL.
 *
 * WHY THIS EXISTS. Measurement and the live site shared one small database, so
 * a full measurement pass was something that needed permission rather than
 * something you just ran, and it took production down four times on 5-6 Sep.
 * Replay makes a full 18-shell pass free, instant and incapable of touching
 * production.
 */
import { readFileSync, existsSync } from 'node:fs';
import { Catalog } from '../../supabase/functions/ai-deck-builder-v2/catalog.ts';
import { recording, replaying, tapedFetch } from './offline-catalogue.mjs';

const MODE = process.env.DM_TAPE ?? '';
let tape = null;

/*
 * DM_CURATED=1 applies the hand-review's corrections to every card the
 * catalogue hands back, so the whole measurement suite can be run WITH and
 * WITHOUT them before any of it touches the database.
 *
 * `scratch/card-review.json` is what 253 reviewers returned over the 12,633
 * cards a white-black deck can play, after validation refused anything naming a
 * word the engine lacks, removing a facet the card does not carry, or touching
 * a printed fact. 6,453 cards change: 11,261 words added, 877 deleted.
 *
 * This is a MEASUREMENT HARNESS, not the shipping path. When these land for
 * real they belong in a column of their own beside `compiler_facets` and
 * `tag_facets`, merged in the view - writing a person's reading into
 * `card_facet_memo` would destroy the one property that makes the compiler
 * improvable, which this repo already learned once with the Tagger merge.
 */
/* '1' applies both halves; 'remove' applies only the deletions and 'add' only
   the additions, because the two are separate claims and the measurement below
   showed they do not move a deck the same way. */
const CURATED_MODE = process.env.DM_CURATED ?? '';
const CURATED = CURATED_MODE === '1' || CURATED_MODE === 'remove' || CURATED_MODE === 'add';
const USE_ADD = CURATED_MODE === '1' || CURATED_MODE === 'add';
const USE_REMOVE = CURATED_MODE === '1' || CURATED_MODE === 'remove';
const curation = new Map();
if (CURATED && existsSync('scratch/card-review.json')) {
  for (const c of JSON.parse(readFileSync('scratch/card-review.json', 'utf8')).kept ?? []) {
    curation.set(c.name, {
      add: USE_ADD ? (c.add ?? []) : [],
      remove: new Set(USE_REMOVE ? (c.remove ?? []) : []),
    });
  }
}

function curate(row) {
  if (!CURATED || !row || typeof row !== 'object') return row;
  const fix = curation.get(row.name);
  if (!fix || !Array.isArray(row.facets)) return row;
  const out = row.facets.filter(f => !fix.remove.has(f));
  for (const f of fix.add) if (!out.includes(f)) out.push(f);
  return { ...row, facets: out };
}

/** Wrap a catalogue so every row it returns carries the reviewed facets. */
function withCuration(cat) {
  if (!CURATED) return cat;
  return new Proxy(cat, {
    get(target, prop, recv) {
      const value = Reflect.get(target, prop, recv);
      if (typeof value !== 'function') return value;
      return async (...args) => {
        const result = await value.apply(target, args);
        if (Array.isArray(result)) return result.map(curate);
        /* `poolFacetsByName` answers a Map of name -> facets. */
        if (result instanceof Map) {
          const fixed = new Map();
          for (const [name, facets] of result) {
            const fix = curation.get(name);
            if (!fix || !Array.isArray(facets)) { fixed.set(name, facets); continue; }
            const out = facets.filter(f => !fix.remove.has(f));
            for (const f of fix.add) if (!out.includes(f)) out.push(f);
            fixed.set(name, out);
          }
          return fixed;
        }
        return result;
      };
    },
  });
}

/* Install the taped fetch BEFORE any probe code runs, so a probe's own raw
   PostgREST reads are taped too. In replay that is what makes "no network"
   true rather than merely "no catalogue queries". */
const wrappedFetch = tapedFetch(MODE);
if (MODE === 'record' || MODE === 'replay') globalThis.fetch = wrappedFetch;

export function makeCatalog() {
  const url = process.env.SUPABASE_URL ?? 'https://udnaflcohfyljrsgqggy.supabase.co';
  /* Read the key here rather than trusting each probe to set an env var: a
     missing key is a 401 deep inside a build, which reads as a broken pool. */
  const anonKey = process.env.SUPABASE_ANON_KEY
    ?? (existsSync('scratch/anon.txt') ? readFileSync('scratch/anon.txt', 'utf8').trim() : '');
  if (MODE === 'replay') return withCuration(replaying());
  const live = new Catalog({ url, anonKey, authorization: null });
  if (MODE !== 'record') return withCuration(live);
  tape = recording(live);
  return withCuration(tape);
}

/** Write the tape. Call once at the end of a recording run. */
export function saveTape() {
  const raw = wrappedFetch.__save ? wrappedFetch.__save() : 0;
  if (!tape) return { added: raw, total: raw };
  const r = tape.__save();
  return { added: r.added + raw, total: r.total };
}

export const tapeMode = MODE;
