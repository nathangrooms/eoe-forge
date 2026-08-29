/**
 * HOW MANY CARDS IN A SEEDED POOL HAVE NO PICTURE, AND DOES `cards_unique` FIX IT.
 *
 * The board has been showing Scryfall's "Localized Image Not Available" plate
 * on real permanents. A previous pass located the cause — `deckSource.ts` reads
 * `public.cards`, which since the sync moved to `unique=prints` holds every
 * printing including localized ones Scryfall has no scan for — and stopped
 * there, because a placeholder is served at 488 x 680 from a normal-looking URL
 * and is undetectable in the browser. That was the right call on the evidence
 * it had.
 *
 * It IS detectable by downloading. A placeholder is a flat graphic and
 * compresses to roughly 60 kB where real art is 140 to 170 kB. Measured on two
 * cards seen on the board:
 *
 *   Timber Wolves  8f435889…  60,893 bytes   the plate, JA
 *   Timber Wolves  d8f84fc8… 142,214 bytes   real art
 *   Wall of Wood   89e6b4c6…  64,111 bytes   the plate, ES
 *   Wall of Wood   1a5054a4… 150,541 bytes   real art
 *
 * So this samples the actual pool query, through PostgREST with the anon key
 * exactly as the app makes it, against `cards` and against `cards_unique`, and
 * counts how many of the pictures are the plate.
 *
 * Scryfall is asked politely: a real User-Agent (it answers 400 without one),
 * a small sample, and a delay between requests.
 */
import { setTimeout as sleep } from 'node:timers/promises';

const URL_BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

/** Under this many bytes a 488px Scryfall jpeg is the plate, not a picture. */
const PLATE_MAX_BYTES = Number(process.env.PLATE || 70_000);
const SAMPLE = Number(process.env.SAMPLE || 90);

const SELECT =
  'id,name,image_url:image_uris->>normal';

async function pool(table, colour) {
  const q =
    `${URL_BASE}/rest/v1/${table}?select=${encodeURIComponent(SELECT)}` +
    `&legalities->>commander=eq.legal` +
    `&color_identity=cs.%7B%7D&color_identity=cd.%7B${colour}%7D` +
    `&type_line=not.ilike.*Land*&cmc=gte.1&cmc=lte.5&image_uris=not.is.null&limit=480`;
  const r = await fetch(q, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  if (!r.ok) throw new Error(`${table}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function audit(table, colour) {
  const rows = await pool(table, colour);
  // Deterministic sample across the whole page rather than the first N.
  const step = Math.max(1, Math.floor(rows.length / SAMPLE));
  const picked = rows.filter((_, i) => i % step === 0).slice(0, SAMPLE);
  let plate = 0, ok = 0, failed = 0;
  const sizes = [];
  for (const row of picked) {
    try {
      const res = await fetch(row.image_url, {
        headers: { 'User-Agent': 'DeckMatrix/1.0 (play-mode image audit)', Accept: 'image/jpeg,image/*' },
      });
      const bytes = (await res.arrayBuffer()).byteLength;
      sizes.push({ name: row.name, bytes, url: row.image_url });
      if (bytes < PLATE_MAX_BYTES) plate++; else ok++;
    } catch { failed++; }
    await sleep(90);
  }
  sizes.sort((a, b) => a.bytes - b.bytes);
  return { table, rows: rows.length, sampled: picked.length, plate, ok, failed,
           smallest: sizes.slice(0, 10), sizes };
}

const colour = process.argv[2] || 'W';
for (const table of ['cards', 'cards_unique']) {
  const r = await audit(table, colour);
  console.log(
    `${r.table.padEnd(13)} pool ${String(r.rows).padStart(4)} rows · sampled ${r.sampled} · ` +
    `PLATE ${r.plate} (${((r.plate / r.sampled) * 100).toFixed(1)}%) · art ${r.ok} · failed ${r.failed}`
  );
  console.log('              ten smallest: ' + r.smallest.map(x => `${x.name} ${x.bytes}`).join(' | '));
  if (process.env.URLS) r.smallest.slice(0, 3).forEach(x => console.log('              ' + x.url));
}
