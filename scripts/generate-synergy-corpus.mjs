/**
 * Regenerates `src/data/precon-corpus.ts` — the co-occurrence corpus behind
 * `src/lib/synergy/`.
 *
 *   node scripts/generate-synergy-corpus.mjs
 *
 * WHY THIS EXISTS
 * ---------------
 * The synergy engine needs to answer "how often do cards A and B appear in the
 * same professionally-built deck?" without a network call at query time. The
 * only free, legal, already-wired corpus we have is the 184 Commander precons
 * that `supabase/functions/fetch-precons` reads from the public
 * `Westly/CommanderPrecons` GitHub repo.
 *
 * Those deck JSONs average ~460 kB — 85 MB for the set — so they cannot be
 * fetched at runtime. Precon lists are frozen once printed, so the corpus is
 * baked here exactly as `precon-index.ts` bakes commanders.
 *
 * WHAT IS DELIBERATELY *NOT* STORED
 * ---------------------------------
 * No oracle text, no type lines, no colour identity per card. All of that is
 * already in our own `cards` table (34,088 Scryfall rows) and is passed to the
 * scorer at query time. Duplicating it here would multiply the file size for
 * data that would immediately go stale. The corpus stores co-occurrence and
 * nothing else: a card-name vocabulary plus, per deck, the indices it contains.
 *
 * Basic lands are dropped — they are in every deck and carry no signal.
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const GITHUB_API = 'https://api.github.com/repos/Westly/CommanderPrecons/contents/precon_json';
const HEADERS = { 'User-Agent': 'DeckMatrix-App' };
const CONCURRENCY = 8;
const WUBRG = ['W', 'U', 'B', 'R', 'G'];

/** In every deck by construction, so they carry zero co-occurrence signal. */
const BASIC_LANDS = new Set([
  'Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes',
  'Snow-Covered Plains', 'Snow-Covered Island', 'Snow-Covered Swamp',
  'Snow-Covered Mountain', 'Snow-Covered Forest', 'Snow-Covered Wastes',
]);

const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'src', 'data', 'precon-corpus.ts'
);

/** Same parse the edge function uses, so ids line up with `precon-index`. */
function parseFilename(filename) {
  const match = filename.match(
    /^(.+?)\s*\((.+?)\s*(?:Commander\s*)?(?:Precon\s*)?(?:Decklist)?\)\.json$/i
  );
  if (match) return { name: match[1].trim(), set: match[2].trim() };
  return { name: filename.replace('.json', ''), set: 'Unknown' };
}

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

const entriesOf = board =>
  board && typeof board === 'object' ? Object.values(board) : [];

async function extract(file) {
  const deck = await getJson(file.download_url);
  const { name, set } = parseFilename(file.name);

  const pick = entry => {
    const card = entry?.card;
    if (!card?.name) return null;
    return {
      name: card.name,
      ci: Array.isArray(card.color_identity) ? card.color_identity : [],
    };
  };

  const commanders = entriesOf(deck.commanders).map(pick).filter(Boolean);
  const main = entriesOf(deck.mainboard).map(pick).filter(Boolean);

  const ciSet = new Set(commanders.flatMap(c => c.ci));

  return {
    id: file.name.replace(/\.json$/, ''),
    name,
    set,
    ci: WUBRG.filter(c => ciSet.has(c)).join(''),
    commanders: commanders.map(c => c.name),
    // Deduped: a deck either plays a card or it does not. Quantity is
    // meaningless for co-occurrence outside basics, which are dropped anyway.
    cards: Array.from(
      new Set([...commanders, ...main].map(c => c.name).filter(n => !BASIC_LANDS.has(n)))
    ),
  };
}

async function main() {
  const files = (await getJson(GITHUB_API)).filter(f => f.name.endsWith('.json'));
  console.log(`[synergy-corpus] ${files.length} decks`);

  const results = new Array(files.length);
  let cursor = 0;
  let done = 0;

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (cursor < files.length) {
        const i = cursor++;
        try {
          results[i] = await extract(files[i]);
        } catch (error) {
          console.warn(`[synergy-corpus] skipped ${files[i].name}: ${error.message}`);
          results[i] = null;
        }
        done += 1;
        if (done % 40 === 0) console.log(`[synergy-corpus] ${done}/${files.length}`);
      }
    })
  );

  const decks = results.filter(Boolean).sort((a, b) => a.id.localeCompare(b.id));

  // Build the shared vocabulary, ordered by descending frequency so the most
  // common cards get the smallest indices and the emitted arrays stay short.
  const freq = new Map();
  for (const deck of decks) {
    for (const name of deck.cards) freq.set(name, (freq.get(name) ?? 0) + 1);
  }
  const vocabulary = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
  const indexOf = new Map(vocabulary.map((name, i) => [name, i]));

  const emitted = decks.map(deck => ({
    id: deck.id,
    name: deck.name,
    set: deck.set,
    ci: deck.ci,
    commanders: deck.commanders.map(n => indexOf.get(n)).filter(i => i !== undefined),
    cards: deck.cards.map(n => indexOf.get(n)).sort((a, b) => a - b),
  }));

  const slots = emitted.reduce((sum, d) => sum + d.cards.length, 0);
  const singletons = [...freq.values()].filter(n => n === 1).length;

  const body = `/**
 * Card co-occurrence across every Commander precon — the corpus behind
 * \`src/lib/synergy/\`.
 *
 * Generated by \`scripts/generate-synergy-corpus.mjs\` — do not hand-edit;
 * re-run the script when new precons ship.
 *
 * Source: the public \`Westly/CommanderPrecons\` GitHub repo, the same one
 * \`supabase/functions/fetch-precons\` already reads. Free, legal, and offline
 * once baked.
 *
 * Cards carry no metadata here on purpose — oracle text, type line and colour
 * identity all live in our own \`cards\` table and are passed to the scorer at
 * query time. This file is co-occurrence and nothing else.
 *
 * ⚠️ SAMPLE SIZE — read \`src/lib/synergy/README\` comments before trusting a
 * score. ${decks.length} decks is a small corpus: ${singletons} of the
 * ${vocabulary.length} distinct cards (${((singletons / vocabulary.length) * 100).toFixed(1)}%)
 * appear in exactly one deck and therefore have no co-occurrence signal at all.
 *
 * Generated ${new Date().toISOString().slice(0, 10)} from ${decks.length} decks,
 * ${slots} non-basic card slots.
 */

/** WUBRG letters in canonical order; empty string means colourless. */
export type ColorIdentityKey = string;

export interface PreconCorpusDeck {
  /** Matches the \`id\` from \`fetch-precons?action=list\` and \`PRECON_INDEX\`. */
  id: string;
  name: string;
  set: string;
  /** Union colour identity of the commander(s), WUBRG order, e.g. "WBG". */
  ci: ColorIdentityKey;
  /** Indices into \`PRECON_CORPUS_CARDS\`. */
  commanders: number[];
  /** Indices into \`PRECON_CORPUS_CARDS\`, ascending, basics excluded. */
  cards: number[];
}

/** Card names, ordered most-played first. Index is the card's corpus id. */
export const PRECON_CORPUS_CARDS: readonly string[] = ${JSON.stringify(vocabulary)};

export const PRECON_CORPUS_DECKS: readonly PreconCorpusDeck[] = ${JSON.stringify(emitted)};

/** Provenance, so a caller can show what a score was computed from. */
export const PRECON_CORPUS_META = {
  source: 'github.com/Westly/CommanderPrecons',
  generated: '${new Date().toISOString().slice(0, 10)}',
  deckCount: ${decks.length},
  cardCount: ${vocabulary.length},
  slotCount: ${slots},
  /** Cards appearing in exactly one deck — no co-occurrence signal. */
  singletonCount: ${singletons},
} as const;
`;

  await writeFile(OUT, body, 'utf8');
  console.log(
    `[synergy-corpus] wrote ${OUT}\n` +
    `  ${decks.length} decks, ${vocabulary.length} distinct cards, ${slots} slots, ` +
    `${singletons} singletons (${((singletons / vocabulary.length) * 100).toFixed(1)}%)`
  );
}

main().catch(error => {
  console.error('[synergy-corpus] failed:', error);
  process.exit(1);
});
