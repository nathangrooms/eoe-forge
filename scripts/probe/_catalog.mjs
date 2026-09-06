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
  if (MODE === 'replay') return replaying();
  const live = new Catalog({ url, anonKey, authorization: null });
  if (MODE !== 'record') return live;
  tape = recording(live);
  return tape;
}

/** Write the tape. Call once at the end of a recording run. */
export function saveTape() {
  const raw = wrappedFetch.__save ? wrappedFetch.__save() : 0;
  if (!tape) return { added: raw, total: raw };
  const r = tape.__save();
  return { added: r.added + raw, total: r.total };
}

export const tapeMode = MODE;
