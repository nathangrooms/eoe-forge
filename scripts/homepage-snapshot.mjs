#!/usr/bin/env node
/**
 * The homepage's data, fetched once a night instead of once a visit.
 *
 * ## Why this exists
 *
 * Fifteen components under `src/components/marketing/` used to query Supabase
 * from the browser. Measured on a production build of the homepage, a single
 * anonymous visit made **27 database queries before the visitor scrolled at
 * all**, and 48 by the time the page had been read to the bottom (95 network
 * requests once CORS preflights are counted, because every PostgREST call from
 * a browser is preceded by an OPTIONS).
 *
 * Every one of those queries returns the same rows to every visitor, and those
 * rows change once a night when the card sync runs. So they are fetched once a
 * night, here, and committed as a file.
 *
 * ## The bug that made this urgent
 *
 * `HomeCatalogue` ran `count(*)` over `cards`. Measured with EXPLAIN ANALYZE on
 * 2026-08-19:
 *
 *     Aggregate (cost=13732.80..13732.81)
 *       -> Index Only Scan using idx_cards_rarity on cards
 *          (actual rows=97140) Heap Fetches: 54406
 *     Execution Time: 7586.515 ms
 *
 * The `anon` role carries `statement_timeout=3s`. So that count could not
 * succeed for a logged-out visitor — which is every visitor the homepage has.
 * PostgREST returns a null count for a failed count, the component read it as
 * `?? 0`, and the page told people there were ZERO cards you can search.
 *
 * Here the same count runs as `service_role`, which has no statement timeout,
 * once per night. 7.6 seconds of database work a day, against 7.6 seconds of
 * work per visitor that never even finished.
 *
 * ## What it will not do
 *
 * It does not fetch the catalogue. Every query below is narrowed to the rows
 * the homepage actually draws, and the narrowing that used to happen in the
 * browser (filter, sort, slice) happens here instead, so the file holds the
 * finished exhibit rather than the pool it was chosen from. Presentation
 * grouping — bucketing by card type, the mana curve, which slot a card sits in
 * — stays in the components, because that is rendering, not data.
 *
 * ## Usage
 *
 *   node --experimental-strip-types scripts/homepage-snapshot.mjs
 *   node scripts/homepage-snapshot.mjs --check          (no credentials needed)
 *
 * Environment, for generation only:
 *   SUPABASE_URL               https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  service role key, from GitHub repository secrets
 *
 * `--check` reads the committed file and reports its age. It is wired into
 * `prebuild`, so a stale snapshot cannot ship quietly. See STALENESS below.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const OUT = path.join(REPO, 'src', 'data', 'homepage-snapshot.json');

/* -------------------------------------------------------------------------- */
/* STALENESS                                                                  */
/*                                                                            */
/* Two thresholds, because the cure has to stay smaller than the disease.     */
/*                                                                            */
/* A snapshot a few days old is off by a few hundred cards in ninety-seven     */
/* thousand, which the rounded display already absorbs (see `approx` in        */
/* src/lib/homepage/snapshot.ts). A build that refuses to run blocks every     */
/* deploy including a security fix. So staleness WARNS long before it FAILS:   */
/* the warning is what catches a dead nightly job, and the failure is the      */
/* backstop for when nobody read the warning for a fortnight.                  */
/* -------------------------------------------------------------------------- */
const WARN_AFTER_DAYS = 3;
const FAIL_AFTER_DAYS = 14;

/* -------------------------------------------------------------------------- */
/* Secret hygiene — same rule as scripts/data/pipeline.mjs. Every print goes   */
/* through scrub() first; a key in a public build log is a key to rotate.      */
/* -------------------------------------------------------------------------- */
const URL_BASE = process.env.SUPABASE_URL?.replace(/\/+$/, '');

/**
 * Service role in CI; the publishable key is accepted so this can be run on a
 * laptop without a production secret anywhere near it.
 *
 * The one thing the publishable key cannot do is the exact count over `cards`:
 * `anon` carries `statement_timeout=3s` and that count measures 7.6 s. It is
 * the only figure in the file that needs the service role, nothing displays it
 * today, and a run that cannot get it stores null rather than a guess.
 */
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const PRIVILEGED = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

/*
 * THE ONE NUMBER THE ANON ROLE CANNOT COUNT, supplied directly.
 *
 * `PRIVILEGED` gates exactly one thing: `count(PRINTINGS)`, a `count(*)` over
 * `cards`, which is 98,048 rows and measured 7.6 s against the 3 s cap the anon
 * role carries. Everything else in this file works perfectly with the
 * publishable key.
 *
 * So the service role was never needed for the SNAPSHOT, only for that count,
 * and requiring it made the whole file unrunnable by anyone without repository
 * secrets. That is why `src/data/homepage-snapshot.json` went unrefreshed from
 * 19 Aug 2026 until the staleness guard began failing the build on 2 Sep.
 *
 * `SUPABASE_PRINTINGS_COUNT` lets a caller who can count it another way - the
 * SQL editor, psql, an admin session - hand the number in. It is used ONLY when
 * the service role is absent, so CI is unaffected, and it is validated as a
 * positive integer rather than trusted, because a wrong count here becomes a
 * sentence on the homepage.
 */
const SUPPLIED_PRINTINGS = (() => {
  const raw = process.env.SUPABASE_PRINTINGS_COUNT;
  if (raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    warn(`SUPABASE_PRINTINGS_COUNT is "${raw}", which is not a positive whole number. Ignoring it.`);
    return null;
  }
  return n;
})();

function scrub(text) {
  let out = String(text);
  if (KEY) out = out.split(KEY).join('[service role key redacted]');
  out = out.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[jwt redacted]');
  return out;
}
const say = (...parts) => console.log(scrub(parts.join(' ')));
const warn = (...parts) => console.error(scrub(parts.join(' ')));

/* -------------------------------------------------------------------------- */
/* PostgREST                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One SELECT.
 *
 * `params` is written the way the browser wrote it, so each call below can be
 * read next to the `supabase.from(...)` chain it replaces and checked against
 * it by eye.
 */
async function select(table, params) {
  const url = new URL(`${URL_BASE}/rest/v1/${table}`);
  /* An array value is several filters on one column, ANDed — PostgREST reads a
     repeated parameter that way, which is how `.gte().lte()` chains arrive. */
  for (const [k, v] of Object.entries(params)) {
    for (const one of Array.isArray(v) ? v : [v]) url.searchParams.append(k, one);
  }

  const res = await fetch(url, {
    headers: { apikey: KEY, authorization: `Bearer ${KEY}`, accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`select ${table} failed: HTTP ${res.status} ${scrub(text).slice(0, 300)}`);
  return JSON.parse(text);
}

/**
 * An exact count.
 *
 * `select=id` rather than `*`: on a HEAD count PostgREST still materialises
 * every selected column, and asking for `*` over `cards` (several large jsonb
 * columns) makes the request fail with a 500. The count is identical either
 * way. That note is copied from src/lib/supabase/jsonPath.ts, which learned it
 * the hard way.
 */
async function count(table, params = {}) {
  const url = new URL(`${URL_BASE}/rest/v1/${table}`);
  url.searchParams.append('select', 'id');
  for (const [k, v] of Object.entries(params)) url.searchParams.append(k, v);

  const res = await fetch(url, {
    method: 'HEAD',
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      prefer: 'count=exact',
      range: '0-0',
    },
  });
  if (!res.ok && res.status !== 206) throw new Error(`count ${table} failed: HTTP ${res.status}`);

  /* content-range is "0-0/97140". A count that did not arrive is null, never
     zero — the whole reason this file exists. */
  const total = res.headers.get('content-range')?.split('/')[1];
  if (!total || total === '*') return null;
  const n = Number(total);
  return Number.isFinite(n) ? n : null;
}

async function invokeFunction(name, query) {
  const res = await fetch(`${URL_BASE}/functions/v1/${name}${query}`, {
    method: 'POST',
    headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: '{}',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${name} failed: HTTP ${res.status} ${scrub(text).slice(0, 300)}`);
  return JSON.parse(text);
}

/* -------------------------------------------------------------------------- */
/* Row shaping                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The Scryfall image sizes anything on this page can ask for.
 *
 * `CardImage` picks from {small, normal, large, png} through its resolution
 * table and `getBestCardImage`'s fallback ladder; the set tiles and the precon
 * backdrop use `art_crop` as a texture. `border_crop` is the one key nothing
 * reads, and dropping it takes roughly a sixth off the heaviest field in the
 * file.
 */
const IMAGE_KEYS = ['small', 'normal', 'large', 'png', 'art_crop'];

function trimImages(uris) {
  if (!uris || typeof uris !== 'object') return null;
  const out = {};
  for (const k of IMAGE_KEYS) if (uris[k]) out[k] = uris[k];
  return Object.keys(out).length ? out : null;
}

/**
 * Only the price keys anything prints. `prices` arrives with usd, usd_foil,
 * usd_etched, eur, eur_foil, tix; the homepage reads `usd` and nothing else.
 */
function trimPrices(prices) {
  if (!prices || typeof prices !== 'object') return null;
  return prices.usd ? { usd: prices.usd } : null;
}

/** Drop nulls, trim the two fat jsonb columns. Same row, a fraction of the bytes. */
function shape(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) continue;
    if (k === 'image_uris') { const t = trimImages(v); if (t) out[k] = t; continue; }
    if (k === 'prices') { const t = trimPrices(v); if (t) out[k] = t; continue; }
    out[k] = v;
  }
  return out;
}

const shapeAll = rows => rows.map(shape);

/**
 * A PostgREST `in.(…)` list of card names.
 *
 * Every value is quoted, not just the ones that need it: a card name may
 * contain a comma ("Trostani, Selesnya's Voice"), which would otherwise split
 * the list, and quoting unconditionally means nobody has to remember which
 * names those are.
 */
const inNames = names => `in.(${names.map(n => `"${String(n).replace(/"/g, '\\"')}"`).join(',')})`;

/**
 * Rows to ask for per name when reading `cards_unique`.
 *
 * Not one. A handful of names carry more than one oracle_id — Lightning Bolt
 * and Counterspell both have two — so a limit of exactly `names.length` drops
 * whichever names sort last. That is how Sol Ring and Swords to Plowshares fell
 * out of the import/export panel the first time this ran. Four is far more
 * headroom than any name needs, and unlike the same trick against `cards` it
 * cannot be eaten by a basic land: `cards_unique` holds one row per card.
 */
const ROWS_PER_NAME = 4;

const hasArt = c => Boolean(c?.image_uris?.normal || c?.image_uris?.large);
const usd = c => Number(c?.prices?.usd ?? 0);

/**
 * One row per name, in the order the names were asked for.
 *
 * A name has many printings now and the older rows may carry no imagery, so the
 * first printing WITH art wins rather than the first row full stop. That is the
 * rule `loadCardsByName` already used; it is moved here unchanged.
 */
function oneRowPerName(rows, names) {
  const byName = new Map();
  for (const row of rows) {
    if (!row?.name) continue;
    const key = row.name.trim().toLowerCase();
    const existing = byName.get(key);
    if (!existing || (!hasArt(existing) && hasArt(row))) byName.set(key, row);
  }
  return names.map(n => byName.get(n.trim().toLowerCase())).filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/* What each section asks for                                                 */
/*                                                                            */
/* Read next to the component named above it. Where a component narrowed its   */
/* rows in the browser (filter, sort, slice), that narrowing happens here.     */
/* -------------------------------------------------------------------------- */

/* HomeHero — iconic cards, instantly recognisable to any Commander player. */
const HERO_NAMES = [
  'Sol Ring', 'Cyclonic Rift', 'Rhystic Study', 'Smothering Tithe',
  'Jeweled Lotus', 'Dockside Extortionist', 'Craterhoof Behemoth',
];

/* HomeShowcase — a Secret Lair drop is a real card but not the face of Magic. */
const NOVELTY_SETS = new Set(['sld', 'slu', 'slp', 'slc', 'slx', 'sch', 'pmei']);
const SHOWCASE_SHOWN = 12;

/* HomeAppVisual — the deck the mock builder is holding. */
const APP_VISUAL_SHOWN = 60;

/* HomeStorage. */
const STORAGE_FILED = 12;
/** Candidates kept per colour slot. Six slots, each takes one; four is headroom. */
const PALETTE_PER_PIP = 4;
const PALETTE_PIPS = ['W', 'U', 'B', 'R', 'G', 'C'];

/* HomeScanner — the card held up to the camera. */
const SCAN_TARGET = 'Lightning Bolt';
const SCAN_PINNED_PRINTING = '77c6fa74-5543-42ac-9ead-0e890b188e99';

/* HomeNewSets — names and dates are fixed facts about printed products. */
const FEATURED_SETS = [
  { code: 'hob', name: 'The Hobbit', released: 'Aug 2026' },
  { code: 'msh', name: 'Marvel Super Heroes', released: 'Jun 2026' },
  { code: 'msc', name: 'Marvel Super Heroes Commander', released: 'Jun 2026' },
  { code: 'sos', name: 'Secrets of Strixhaven', released: 'Apr 2026' },
  { code: 'soc', name: 'Secrets of Strixhaven Commander', released: 'Apr 2026' },
  { code: 'tmt', name: 'Teenage Mutant Ninja Turtles', released: 'Mar 2026' },
];

/**
 * HomeFormatPicker — the skeleton of a deck in each format.
 *
 * The ids are an editorial pick of recognisable staples. The claim "legal in
 * this format" is NOT taken from that pick: each query still filters on
 * `legalities->>'<format>' = 'legal'`, so a card that gets banned simply stops
 * appearing here and the row shrinks rather than lying. Running that filter
 * nightly rather than per visit is the only thing that changes.
 */
const FORMAT_PICKS = {
  commander: [
    ['d0d33d52-3d28-4635-b985-51e126289259', 'Commander'],
    ['3d994115-378d-4685-a5dc-e448831da434', 'Ramp'],
    ['0e7ff4dc-af63-4342-9a44-d059e62bd14c', 'Removal'],
    ['6ada256f-2e55-4c1f-b4d3-d7b10b498956', 'Card draw'],
    ['a24b4cb6-cebb-428b-8654-74347a6a8d63', 'Tutor'],
    ['317f1133-7cf8-4b7a-919e-88c45f8c2c3a', 'Finisher'],
  ],
  modern: [
    ['a9738cda-adb1-47fb-9f4c-ecd930228c4d', 'Threat'],
    ['77c6fa74-5543-42ac-9ead-0e890b188e99', 'Removal'],
    ['f3537373-ef54-4578-9d05-6216420ee349', 'Card draw'],
    ['5ea568df-04a1-4012-98ec-ba75e189e0ca', 'Ramp'],
    ['b18fe7e0-8344-40cc-b242-83f01c6be7a6', 'Tutor'],
    ['3aad15a2-8a1b-4460-9b06-e85863081878', 'Land'],
  ],
  pioneer: [
    ['d67be074-cdd4-41d9-ac89-0a0456c4e4b2', 'Threat'],
    ['6e9d8fe4-fd9b-4923-92bf-7dd6b8fa02e7', 'Removal'],
    ['cfa7b456-7e83-4587-a875-9b35fde318c2', 'Card advantage'],
    ['834b27a0-dfd7-4f96-8cde-cacac4b24acc', 'Ramp'],
    ['3aad15a2-8a1b-4460-9b06-e85863081878', 'Land'],
    ['276f5cee-a501-4658-bd4d-7a044bf1ccbc', 'Finisher'],
  ],
  standard: [
    ['64a5d494-efa1-446b-bebe-2ad36e154376', 'Threat'],
    ['73a065e3-b530-4e62-ab3c-4f6f908184ec', 'Planeswalker'],
    ['e20da6b5-1057-4a28-9e85-07de714e262f', 'Card draw'],
    ['6a0b230b-d391-4998-a3f7-7b158a0ec2cd', 'Ramp'],
    ['3aad15a2-8a1b-4460-9b06-e85863081878', 'Land'],
    ['276f5cee-a501-4658-bd4d-7a044bf1ccbc', 'Finisher'],
  ],
  pauper: [
    ['cedd44eb-f381-46e1-bcb0-88416b4ce33d', 'Threat'],
    ['4686b51c-e02b-48c1-bafe-e8d08a5407b9', 'Removal'],
    ['dd29a0e5-c1de-4e8a-8866-715e9f9cde1f', 'Card selection'],
    ['4f616706-ec97-4923-bb1e-11a69fbaa1f8', 'Counterspell'],
    ['6c877da3-68fa-41d0-8a24-8c79fcd8ecc1', 'Fast mana'],
    ['77c6fa74-5543-42ac-9ead-0e890b188e99', 'Burn'],
  ],
  legacy: [
    ['89f612d6-7c59-4a7b-a87d-45f789e88ba5', 'Interaction'],
    ['b5545882-6963-4729-b2c6-fb4bdc75ffcc', 'Card draw'],
    ['20c4aae1-7665-4df7-bd51-a1d95bf8a17d', 'Threat'],
    ['0e7ff4dc-af63-4342-9a44-d059e62bd14c', 'Removal'],
    ['f340cbf7-5bbe-45b9-a4bf-d1caa500ff93', 'Fast mana'],
    ['aaafb9bc-7cea-4624-a227-595544fa42b0', 'Land'],
  ],
};

/**
 * HomePortability — the names in the pasted list, in paste order.
 *
 * `HomePortability` parses the paste itself and looks each line up by name. If
 * somebody edits the paste and forgets this list, the new line resolves to
 * nothing and the section reports it as unresolved, which is that section's own
 * designed behaviour for a line it cannot match. It cannot invent a card.
 */
const PASTE_NAMES = [
  'Lightning Bolt', 'Sol Ring', 'Arcane Signet', 'Swords to Plowshares',
  'Cyclonic Rift', 'Rhystic Study', 'Smothering Tithe', 'Demonic Tutor',
  'Counterspell', 'Beast Within', 'Craterhoof Behemoth', 'Command Tower',
];

/* HomeTutor — a real, frozen, published product. */
const TUTOR_PRECON_ID = 'Draconic Domination (Commander 2017 Precon Decklist)';

/* HomeMarketplace, via loadPriceTracking. */
const TRACKED_COUNT = 5;

/* Column lists, copied from the components verbatim. */
const COL_HERO = 'id,name,image_uris';
const COL_SHOWCASE = 'id,name,mana_cost,cmc,type_line,set_code,layout,faces,image_uris,prices';
const COL_APP_VISUAL = 'id,name,mana_cost,cmc,type_line,rarity,color_identity,image_uris,prices';
const COL_STORAGE = 'id,name,type_line,color_identity,image_uris,faces,layout,prices,set_code';
const COL_PALETTE = 'id,name,type_line,color_identity,image_uris,set_code';
const COL_SCANNER = 'id,name,mana_cost,type_line,set_code,image_uris,prices';
const COL_PRECONS = 'id,name,type_line,mana_cost,layout,faces,image_uris';
const COL_NEW_SET_COMMANDERS = 'id,name,type_line,color_identity,set_code,layout,faces,image_uris';
const COL_FORMAT = 'id,name,mana_cost,cmc,type_line,rarity,color_identity,image_uris,faces,layout,prices';
const COL_PORTABILITY = 'id,name,mana_cost,cmc,type_line,colors,image_uris,faces,layout,prices,set_code,collector_number';
const COL_MARKETING = 'id,name,type_line,mana_cost,cmc,power,toughness,color_identity,image_uris,prices,set_code,rarity';
const COL_TUTOR = 'name,mana_cost,cmc,type_line';

/* -------------------------------------------------------------------------- */
/* The counting relation                                                      */
/*                                                                            */
/* `cards` holds every printing — 97,140 rows over 33,037 distinct cards, so   */
/* Sol Ring is in there thirty-odd times. Counting it under a label that says  */
/* "cards" overstates the catalogue roughly threefold. Anything the homepage   */
/* calls a CARD is therefore counted over `cards_unique`, which holds one row  */
/* per oracle_id; the printing total is kept alongside under its own name.     */
/* Measured 2026-08-19: count over cards_unique 22 ms, over cards 7,586 ms.    */
/* -------------------------------------------------------------------------- */
const UNIQUE = 'cards_unique';
const PRINTINGS = 'cards';

const FORMATS = ['commander', 'modern', 'pioneer', 'standard', 'pauper', 'legacy'];
const COLORS = ['W', 'U', 'B', 'R', 'G'];

/* -------------------------------------------------------------------------- */
/* Generate                                                                   */
/* -------------------------------------------------------------------------- */

async function counts() {
  say('Counting. The printings count is the slow one — 7.6 s, measured.');

  const [cards, printings, legendaryCreatures, mythics] = await Promise.all([
    count(UNIQUE),
    PRIVILEGED ? count(PRINTINGS).catch(() => null) : Promise.resolve(SUPPLIED_PRINTINGS),
    /* `like`, NOT `ilike`. Scryfall CASES its type lines, so `%Creature%`
       matches exactly what `ilike` would, and CLAUDE.md measures the same swap
       on a matview scan at 2,007 ms against 172 ms. This count is over
       `cards_unique`, a materialized view of 33,035 rows, and with `ilike` it
       exceeded the 3 s cap the anon role carries and returned HTTP 500 - which
       is the second reason this file could not be run without a service role
       key, and it is not a reason, it is a bug. */
    count(UNIQUE, { is_legendary: 'eq.true', type_line: 'like.%Creature%' }),
    count(UNIQUE, { rarity: 'eq.mythic' }),
  ]);
  if (printings === null) {
    warn('No printings total: it needs the service role, or SUPABASE_PRINTINGS_COUNT.');
    warn('Stored as null, not guessed.');
  } else if (!PRIVILEGED) {
    say(`Printings total ${printings} supplied by SUPABASE_PRINTINGS_COUNT.`);
  }

  const formatLegal = {};
  for (const f of FORMATS) {
    formatLegal[f] = await count(UNIQUE, { [`legalities->>${f}`]: 'eq.legal' });
  }

  const colorIdentity = {};
  for (const c of COLORS) {
    colorIdentity[c] = await count(UNIQUE, { color_identity: `cs.{${c}}` });
  }

  return { cards, printings, legendaryCreatures, mythics, formatLegal, colorIdentity };
}

async function hero() {
  const rows = await select(UNIQUE, {
    select: COL_HERO,
    name: inNames(HERO_NAMES),
    image_uris: 'not.is.null',
    limit: String(HERO_NAMES.length * ROWS_PER_NAME),
  });
  /* One printing per name, ordered as listed, so the fan is deterministic. */
  return shapeAll(oneRowPerName(rows.filter(r => r?.image_uris?.normal), HERO_NAMES));
}

async function showcase() {
  /**
   * `cards_unique`, so the wall shows twelve different cards.
   *
   * Against `cards` this asked for 400 rows of "mythic or rare with a price"
   * and sorted them by USD, which over a table holding every printing returns
   * the same handful of cards several times each: the top of that sort is not
   * twelve expensive cards, it is a few expensive cards' variant printings.
   *
   * Sorting `cards_unique` by price sorts each card's CHEAPEST printing, which
   * is also the more defensible number to print under a card on a homepage: it
   * is what the card costs, not what its most collectable version costs.
   */
  const rows = await select(UNIQUE, {
    select: COL_SHOWCASE,
    rarity: 'in.(mythic,rare)',
    image_uris: 'not.is.null',
    prices: 'not.is.null',
    limit: '400',
  });
  return shapeAll(
    rows
      .filter(hasArt)
      .filter(c => !NOVELTY_SETS.has(c.set_code))
      .filter(c => usd(c) > 0)
      .sort((a, b) => usd(b) - usd(a))
      .slice(0, SHOWCASE_SHOWN)
  );
}

async function appVisual() {
  /**
   * `cards_unique`. This one is not a preference, it is a rules requirement.
   *
   * The section draws a Commander deck, and Commander is singleton. Read from
   * `cards`, the sixty rows contained the same legend three times over and the
   * same artifact three times under it — a deck that would not be legal, on a
   * panel captioned "This is the builder", in front of players who would spot
   * it instantly. One row per card makes the list a list.
   */
  const rows = await select(UNIQUE, {
    select: COL_APP_VISUAL,
    'legalities->>commander': 'eq.legal',
    rarity: 'in.(mythic,rare)',
    image_uris: 'not.is.null',
    mana_cost: 'not.is.null',
    limit: '150',
  });
  return shapeAll(rows.filter(c => c?.image_uris?.normal).slice(0, APP_VISUAL_SHOWN));
}

async function storage() {
  const drawable = c => !String(c.set_code ?? '').startsWith('sl') && hasArt(c);

  /* Both pools read `cards_unique`: a binder page showing the same commander
     twice, or two colour boxes filed with the same card, is exactly what
     "one row per printing" produces and exactly what a shelf does not look
     like. */
  const [legends, mythics] = await Promise.all([
    select(UNIQUE, {
      select: COL_STORAGE,
      is_legendary: 'eq.true',
      rarity: 'eq.mythic',
      type_line: 'like.%Creature%',
      image_uris: 'not.is.null',
      limit: '150',
    }),
    select(UNIQUE, {
      select: COL_PALETTE,
      rarity: 'eq.mythic',
      image_uris: 'not.is.null',
      color_identity: 'not.is.null',
      limit: '250',
    }),
  ]);

  const filed = legends.filter(drawable).sort((a, b) => usd(b) - usd(a)).slice(0, STORAGE_FILED);
  const used = new Set(filed.map(c => c.id));

  /**
   * The colour boxes take one card per slot out of this pool, preferring a
   * mono-coloured card and falling back to anything in that identity. Only the
   * first few candidates per pip can ever be reached, so the pool is cut to
   * those — IN POOL ORDER, so the component's own picker still lands on exactly
   * the card it would have landed on against all 250 rows.
   */
  const pool = mythics.filter(c => drawable(c) && !used.has(c.id));
  const keep = new Set();
  for (const pip of PALETTE_PIPS) {
    const identity = c => c.color_identity ?? [];
    const mono = pip === 'C'
      ? pool.filter(c => identity(c).length === 0)
      : pool.filter(c => identity(c).length === 1 && identity(c)[0] === pip);
    const any = pip === 'C' ? [] : pool.filter(c => identity(c).includes(pip));
    for (const c of [...mono.slice(0, PALETTE_PER_PIP), ...any.slice(0, PALETTE_PER_PIP)]) keep.add(c.id);
  }

  return {
    filed: shapeAll(filed),
    palette: shapeAll(pool.filter(c => keep.has(c.id))),
  };
}

async function scanner() {
  const rows = await select(PRINTINGS, {
    select: COL_SCANNER,
    name: `eq.${SCAN_TARGET}`,
    image_uris: 'not.is.null',
    limit: '6',
  });
  const withArt = rows.filter(hasArt);
  const pinned = withArt.find(c => c.id === SCAN_PINNED_PRINTING);
  const cheapest = [...withArt].sort(
    (a, b) => Number(a.prices?.usd ?? Infinity) - Number(b.prices?.usd ?? Infinity)
  )[0];
  const card = pinned ?? cheapest ?? null;
  return card ? shape(card) : null;
}

async function precons(ids) {
  const rows = await select(PRINTINGS, { select: COL_PRECONS, id: `in.(${ids.join(',')})` });
  const byId = new Map(rows.map(r => [r.id, r]));
  /* Keyed by the printing id the precon index stores, so the component joins
     the same way it always did. */
  const out = {};
  for (const id of ids) if (byId.has(id)) out[id] = shape(byId.get(id));
  return out;
}

async function newSets() {
  const tiles = [];
  for (const s of FEATURED_SETS) {
    /* Printings, not distinct cards. A set's size is its collector-number range
       and that is the figure Scryfall and Wizards both publish, so `hob` is 321
       rather than the 193 distinct cards inside it. */
    const total = await count(PRINTINGS, { set_code: `eq.${s.code}` });
    const art = await select(PRINTINGS, {
      select: 'name,image_uris,rarity',
      set_code: `eq.${s.code}`,
      rarity: 'in.(mythic,rare)',
      image_uris: 'not.is.null',
      limit: '25',
    });
    const pick = art.find(c => c?.image_uris?.art_crop);
    if (!total) continue; // a set with nothing synced is left off, not shown as zero
    tiles.push({
      ...s,
      count: total,
      art: pick?.image_uris?.art_crop ?? null,
      headline: pick?.name ?? null,
    });
  }

  const rows = await select(PRINTINGS, {
    select: COL_NEW_SET_COMMANDERS,
    set_code: `in.(${FEATURED_SETS.map(s => s.code).join(',')})`,
    is_legendary: 'eq.true',
    type_line: 'like.%Creature%',
    image_uris: 'not.is.null',
    limit: '60',
  });

  /**
   * One commander per featured set, in the order the sets are listed.
   *
   * A straight slice returns six cards from whichever set sorts first — a
   * quarter of these rows come from one Commander set — so the spotlight would
   * show six Marvel cards under a heading about six sets. Round-robin keeps the
   * claim and the picture in agreement. Lifted from `oneCommanderPerSet`.
   */
  const withArt = rows.filter(hasArt);
  const bySet = new Map();
  for (const row of withArt) {
    const bucket = bySet.get(row.set_code);
    if (bucket) bucket.push(row); else bySet.set(row.set_code, [row]);
  }
  const picked = [];
  const seen = new Set();
  for (let round = 0; picked.length < 6 && round < 8; round++) {
    let progressed = false;
    for (const { code } of FEATURED_SETS) {
      if (picked.length >= 6) break;
      const candidate = (bySet.get(code) ?? [])[round];
      if (!candidate || seen.has(candidate.name)) continue;
      seen.add(candidate.name);
      picked.push(candidate);
      progressed = true;
    }
    if (!progressed) break;
  }

  return { tiles, commanders: shapeAll(picked) };
}

async function formatPicker() {
  const out = {};
  for (const [format, picks] of Object.entries(FORMAT_PICKS)) {
    const rows = await select(PRINTINGS, {
      select: COL_FORMAT,
      [`legalities->>${format}`]: 'eq.legal',
      id: `in.(${picks.map(([id]) => id).join(',')})`,
      limit: String(picks.length),
    });
    const byId = new Map(rows.map(r => [r.id, r]));
    /* Authored role order kept; a pick the legality filter did not return is
       dropped, so a banning removes the card rather than mislabelling it. */
    out[format] = picks
      .filter(([id]) => byId.has(id))
      .map(([id, role]) => ({ role, card: shape(byId.get(id)) }));
  }
  return out;
}

async function portability() {
  /**
   * `cards_unique`, and therefore ONE request rather than twelve.
   *
   * The component made twelve, one per name, because a single `.in()` over
   * `cards` cannot work: ten of these twelve are staples with over a hundred
   * printings each and PostgREST applies the limit to the whole result set, so
   * the cap was spent on the first two or three names. Splitting the request
   * was the workaround. Reading the relation that holds one row per card
   * removes the problem instead of routing around it, and a pasted decklist
   * line names a CARD, not a printing, so it is also the right relation by the
   * rule in src/lib/cards/source.ts.
   */
  const rows = await select(UNIQUE, {
    select: COL_PORTABILITY,
    name: inNames(PASTE_NAMES),
    limit: String(PASTE_NAMES.length * ROWS_PER_NAME),
  });

  const out = {};
  for (const row of oneRowPerName(rows, PASTE_NAMES)) out[row.name.trim().toLowerCase()] = shape(row);
  return out;
}

/**
 * `loadCardsByName` in sectionData.ts, run once. Keyed by lower-cased name.
 *
 * Against `cards` this was BROKEN, and had been since the table started holding
 * every printing. It asked for `names.length * 5` rows over an `.in()` — 115
 * for the play table's 23 names — and Forest alone has 792 printings, Swamp
 * 791, Mountain 789, Plains 768, Island 741. PostgREST applies the limit to the
 * whole result set, so the entire cap was spent on basic lands and the lookup
 * came back with 2 of the 23 cards. `HomePlayTable` has been drawing two cards
 * on a board that names twenty-three.
 *
 * `cards_unique` holds one row per card, so twenty-three names is twenty-three
 * rows and there is nothing to starve. It is also the relation the rule in
 * src/lib/cards/source.ts asks for: a card standing on a battlefield is a card,
 * not a particular printing.
 */
async function cardsByName(names) {
  const rows = await select(UNIQUE, {
    select: COL_MARKETING,
    name: inNames(names),
    limit: String(names.length * ROWS_PER_NAME),
  });
  const out = {};
  for (const row of oneRowPerName(rows, names)) out[row.name.trim().toLowerCase()] = shape(row);
  return out;
}

/** `loadCardsById` in sectionData.ts, run once. Rows with no art are dropped. */
async function cardsById(ids) {
  const rows = await select(PRINTINGS, { select: COL_MARKETING, id: `in.(${ids.join(',')})`, limit: String(ids.length) });
  const out = {};
  for (const row of rows.filter(hasArt)) out[row.id] = shape(row);
  return out;
}

/**
 * `loadPriceTracking` in sectionData.ts, run once.
 *
 * Banded to $5–$150 so the section shows cards a Commander player recognises
 * rather than the one four-figure outlier at the top of the table.
 *
 * ## Candidates come from the OLDEST rows, not the newest
 *
 * This asked for the newest snapshot date, took the dearest five cards on it,
 * and then discarded any with fewer than two points. On 19 August 2026 the
 * daily sweep reached the whole catalogue for the first time, so tens of
 * thousands of cards got their FIRST row that night, all five picks had exactly
 * one point, and the function returned null. The homepage's price chart was
 * dark. Measured the same day: 79 distinct snapshot days are stored, 684 cards
 * carry two or more of them, and 641 of those include the newest day. There was
 * plenty to draw; the selection simply could not reach any of it.
 *
 * Sorting the other way fixes it at the root. A card that appears on the oldest
 * stored days is by definition a card with history, so the candidates are the
 * long-tracked ones. Ascending order returns one row per card per day rather
 * than one row per card, so the ids are de-duplicated before slicing; the
 * previous version got that for free by filtering to a single date.
 *
 * The `series.length < 2` guard below stays. It is what stops a card that
 * happens to sort early but holds one point from being charted, and it is the
 * reason this function can still honestly return null.
 */
async function priceTracking() {
  const candidates = await select('card_price_history', {
    select: 'card_id,card_name,price_usd,snapshot_date',
    price_usd: ['not.is.null', 'gte.5', 'lte.150'],
    order: 'snapshot_date.asc,price_usd.desc',
    limit: '200',
  }).catch(() => []);

  if (!candidates.length) return null;

  const ids = [...new Set(candidates.map(r => r.card_id).filter(Boolean))].slice(0, TRACKED_COUNT);
  if (!ids.length) return null;

  const [history, cards] = await Promise.all([
    select('card_price_history', {
      select: 'card_id,price_usd,snapshot_date',
      card_id: `in.(${ids.join(',')})`,
      price_usd: 'not.is.null',
      order: 'snapshot_date.asc',
      limit: '1000',
    }),
    cardsById(ids),
  ]);

  const seriesById = new Map();
  const dates = new Set();
  let from = '', to = '';
  for (const row of history) {
    const price = Number(row.price_usd);
    if (!Number.isFinite(price)) continue;
    const list = seriesById.get(row.card_id) ?? [];
    list.push(price);
    seriesById.set(row.card_id, list);
    dates.add(row.snapshot_date);
    if (!from || row.snapshot_date < from) from = row.snapshot_date;
    if (!to || row.snapshot_date > to) to = row.snapshot_date;
  }

  const tracked = [];
  for (const id of ids) {
    const card = cards[id];
    const series = seriesById.get(id);
    if (!card || !series || series.length < 2) continue;
    const first = series[0];
    const last = series[series.length - 1];
    tracked.push({
      card, series, first, last,
      low: Math.min(...series),
      high: Math.max(...series),
      change: first > 0 ? (last - first) / first : 0,
    });
  }
  if (!tracked.length) return null;

  /* Biggest mover leads — it is the one whose chart is worth the large slot. */
  tracked.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  return { cards: tracked, from, to, snapshots: dates.size };
}

/**
 * HomeTutor — a real 100-card precon with every card resolved.
 *
 * The decklist comes from the `fetch-precons` edge function, the same path the
 * Precons page uses. Every figure the section prints is arithmetic over these
 * entries, so a card the table is missing would quietly shift the answer:
 * rather than ship a number that is 99% right, an incomplete resolution
 * produces no tutor block at all and the section falls to its no-numbers
 * rendering.
 */
async function tutor() {
  const deck = await invokeFunction('fetch-precons', `?action=get&deck=${encodeURIComponent(TUTOR_PRECON_ID)}`);
  const names = Array.from(new Set(deck.cards.map(c => c.card_name)));

  const rows = [];
  for (let i = 0; i < names.length; i += 80) {
    const page = await select(UNIQUE, {
      select: COL_TUTOR,
      name: inNames(names.slice(i, i + 80)),
      limit: String(80 * ROWS_PER_NAME),
    });
    rows.push(...page);
  }

  const byName = new Map();
  for (const row of rows) if (!byName.has(row.name)) byName.set(row.name, row);
  if (names.some(n => !byName.has(n))) {
    warn(`Tutor: ${names.filter(n => !byName.has(n)).length} of ${names.length} cards did not resolve. Section will render without figures.`);
    return null;
  }

  return deck.cards.map(c => {
    const row = byName.get(c.card_name);
    return {
      ...c,
      typeLine: String(row.type_line ?? '').toLowerCase(),
      mv: Number(row.cmc ?? 0),
      manaCost: row.mana_cost ?? null,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Assemble                                                                   */
/* -------------------------------------------------------------------------- */

async function generate() {
  if (!URL_BASE || !KEY) {
    warn('Missing SUPABASE_URL, and/or both SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY.');
    warn('Set them as GitHub repository secrets: Settings, Secrets and variables, Actions.');
    warn('EITHER key works. The service role is needed for ONE number, the printings');
    warn('count, which is a count(*) over 98,048 rows against a 3 s cap on anon. With');
    warn('the publishable key, pass SUPABASE_PRINTINGS_COUNT=<n> to supply it, or leave');
    warn('it out and the snapshot stores null rather than guessing.');
    process.exit(78); // EX_CONFIG
  }

  /* The lists these three sections draw are derived from data files rather
     than typed out, so they are read from the same files the components read.
     One definition, no drift. */
  const { PRECON_INDEX } = await import('../src/data/precon-index.ts');
  const gameChangers = JSON.parse(
    fs.readFileSync(path.join(REPO, 'src/lib/deckbuilder/score/catalog.gamechangers.json'), 'utf8')
  );

  /* HomePrecons: four recent precons, at most two per set, deduplicated on the
     commander printing so "Collector's Edition" reprints drop out. */
  const preconIds = (() => {
    const perSet = new Map();
    const seen = new Set();
    const out = [];
    const newestFirst = [...PRECON_INDEX].sort((a, b) =>
      String(b.released ?? '').localeCompare(String(a.released ?? ''))
    );
    for (const entry of newestFirst) {
      const lead = entry.commanders[0];
      if (!lead?.scryfallId || seen.has(lead.scryfallId)) continue;
      const used = perSet.get(entry.set) ?? 0;
      if (used >= 2) continue;
      perSet.set(entry.set, used + 1);
      seen.add(lead.scryfallId);
      out.push(lead.scryfallId);
      if (out.length === 4) break;
    }
    return out;
  })();

  /* HomeTournaments: candidates spread evenly across the whole precon index. */
  const tournamentIds = (() => {
    const single = PRECON_INDEX.filter(p => p.commanders.length === 1 && p.commanders[0]?.scryfallId);
    const step = Math.max(1, Math.floor(single.length / 24));
    return single.filter((_, i) => i % step === 0).slice(0, 24).map(p => p.commanders[0].scryfallId);
  })();

  /* HomePower: every name the game-changer panels might draw. */
  const powerNames = (() => {
    const combos = (gameChangers.compact_combo ?? []).filter(e => e.requires?.length > 0);
    return Array.from(new Set([
      ...combos.flatMap(e => [e.name, e.requires[0]]),
      ...(gameChangers.finisher_bomb?.cards ?? []),
      ...(gameChangers.inevitability_engine?.cards ?? []),
      ...(gameChangers.massive_swing?.cards ?? []),
    ]));
  })();

  /* HomePlayTable: the board on the table, both players. Read out of the
     component's own layout so the two cannot disagree — these are the names it
     puts on the battlefield. */
  const playTableNames = [
    'Trostani, Selesnya\'s Voice', 'Lazav, Dimir Mastermind', 'Sigarda, Host of Herons',
    'Sun Titan', 'Knight of Autumn', 'Eternal Witness', 'Llanowar Elves',
    'Command Tower', 'Temple Garden', 'Sunpetal Grove', 'Forest', 'Plains',
    'Consecrated Sphinx', 'Snapcaster Mage', 'Gray Merchant of Asphodel',
    'Watery Grave', 'Island', 'Swamp',
    'Swords to Plowshares', 'Beast Within', 'Wrath of God', 'Sol Ring', 'Smothering Tithe',
  ];

  const started = Date.now();
  say('Fetching the homepage. One pass, no catalogue.');

  const snapshot = {
    version: 1,
    generatedAt: new Date().toISOString(),
    counts: await counts(),
    sections: {
      hero: await hero(),
      showcase: await showcase(),
      appVisual: await appVisual(),
      storage: await storage(),
      scanner: await scanner(),
      precons: await precons(preconIds),
      newSets: await newSets(),
      formatPicker: await formatPicker(),
      portability: await portability(),
      playTable: await cardsByName(playTableNames),
      power: await cardsByName(powerNames),
      tournaments: await cardsById(tournamentIds),
      priceTracking: await priceTracking(),
      tutor: await tutor(),
    },
  };

  /* The card sync's own timestamp, so the file can say what it is a snapshot
     OF rather than only when it was taken. */
  const sync = await select('sync_status', { select: 'last_sync', id: 'eq.scryfall_cards', limit: '1' })
    .catch(() => []);
  snapshot.cardsSyncedAt = sync[0]?.last_sync ?? null;

  validate(snapshot);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(snapshot, null, 0)}\n`, 'utf8');

  const bytes = fs.statSync(OUT).size;
  say(`Wrote ${path.relative(REPO, OUT)} — ${(bytes / 1024).toFixed(1)} kB in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
  say(`${snapshot.counts.cards?.toLocaleString()} cards over ${snapshot.counts.printings?.toLocaleString()} printings, synced ${snapshot.cardsSyncedAt ?? 'unknown'}.`);
}

/* -------------------------------------------------------------------------- */
/* Validate                                                                   */
/*                                                                            */
/* A section that came back empty is a broken snapshot, not a homepage with a  */
/* hole in it, so this throws rather than writing the file. The alternative is */
/* committing a file that renders an empty section every visit until somebody  */
/* notices — which is the failure mode this whole exercise exists to remove.   */
/* -------------------------------------------------------------------------- */
function validate(s) {
  const problems = [];

  for (const [key, value] of Object.entries(s.counts)) {
    if (key === 'formatLegal' || key === 'colorIdentity') {
      for (const [k, v] of Object.entries(value)) {
        if (typeof v !== 'number' || v <= 0) problems.push(`counts.${key}.${k} is ${v}`);
      }
      continue;
    }
    /* `printings` is allowed to be null — it is the one count that needs the
       service role, and nothing on the page prints it. Every other count is
       displayed, so a zero or a null there is the bug this file removes. */
    if (key === 'printings' && value === null) continue;
    if (typeof value !== 'number' || value <= 0) problems.push(`counts.${key} is ${value}`);
  }

  /* Sanity, not just non-emptiness: `cards_unique` is one row per card and
     `cards` is one row per printing, so unique can never exceed printings. If
     it does, something has been counted over the wrong relation. */
  if (s.counts.printings !== null && s.counts.cards > s.counts.printings) {
    problems.push(`counts.cards (${s.counts.cards}) exceeds counts.printings (${s.counts.printings})`);
  }

  const expect = {
    hero: 5, showcase: 8, appVisual: 30, scanner: 1,
    'storage.filed': 8, 'storage.palette': 6,
    'newSets.tiles': 3, 'newSets.commanders': 3,
    portability: 12, playTable: 20, power: 20, tournaments: 8, precons: 3,
  };
  const size = v => (v == null ? 0 : Array.isArray(v) ? v.length : typeof v === 'object' ? Object.keys(v).length : 1);
  const at = p => p.split('.').reduce((o, k) => o?.[k], s.sections);

  for (const [p, min] of Object.entries(expect)) {
    const n = size(at(p));
    if (n < min) problems.push(`sections.${p} has ${n}, expected at least ${min}`);
  }

  for (const [format, slots] of Object.entries(s.sections.formatPicker)) {
    if (slots.length < 4) problems.push(`sections.formatPicker.${format} has ${slots.length} slots, expected at least 4`);
  }

  /* priceTracking and tutor are allowed to be null. Price history can be
     genuinely thin, and tutor deliberately returns null rather than shipping
     arithmetic over a deck it could not fully resolve. Both sections have a
     designed no-figures rendering; the others do not. */

  if (problems.length) {
    warn('Refusing to write the snapshot:');
    for (const p of problems) warn(`  ${p}`);
    throw new Error(`${problems.length} section(s) came back empty or wrong`);
  }
}

/* -------------------------------------------------------------------------- */
/* Check — runs on every build, needs no credentials                          */
/* -------------------------------------------------------------------------- */

function check() {
  if (!fs.existsSync(OUT)) {
    warn('');
    warn('  The homepage snapshot is missing.');
    warn(`  Expected: ${path.relative(REPO, OUT)}`);
    warn('  Generate it with: node --experimental-strip-types scripts/homepage-snapshot.mjs');
    warn('');
    process.exit(1);
  }

  let snapshot;
  try {
    snapshot = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  } catch (err) {
    warn(`The homepage snapshot will not parse: ${err.message}`);
    process.exit(1);
  }

  const at = Date.parse(snapshot.generatedAt);
  if (!Number.isFinite(at)) {
    warn('The homepage snapshot has no usable generatedAt. It cannot be aged, so it is treated as stale.');
    process.exit(1);
  }

  const days = (Date.now() - at) / 86_400_000;
  const age = days < 1 ? `${Math.round(days * 24)} hours` : `${days.toFixed(1)} days`;

  if (days >= FAIL_AFTER_DAYS) {
    warn('');
    warn(`  The homepage snapshot is ${age} old and the limit is ${FAIL_AFTER_DAYS} days.`);
    warn('  The homepage would state card counts and show cards from that day as if they were current.');
    warn('  The nightly refresh is the "Homepage snapshot" job in .github/workflows/prices-daily.yml.');
    warn('  Check whether it is still running, then re-run it, or generate locally with:');
    warn('    node --experimental-strip-types scripts/homepage-snapshot.mjs');
    warn('');
    process.exit(1);
  }

  if (days >= WARN_AFTER_DAYS) {
    warn('');
    warn(`  Warning: the homepage snapshot is ${age} old. It refreshes nightly, so something has stopped.`);
    warn(`  The build will start failing at ${FAIL_AFTER_DAYS} days.`);
    warn('');
    return;
  }

  say(`Homepage snapshot is ${age} old. Fine.`);
}

/* -------------------------------------------------------------------------- */

const mode = process.argv.includes('--check') ? 'check' : 'generate';

try {
  if (mode === 'check') check();
  else await generate();
} catch (err) {
  warn(err.stack ?? String(err));
  process.exit(1);
}
