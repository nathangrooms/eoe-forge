/**
 * How much of a REAL deck's card list do we build for the same commander?
 *
 *   node --experimental-strip-types scripts/probe/real-deck-overlap.mjs [count]
 *
 * `meta_decks` holds 187 complete Commander decks with a single named
 * commander (MTGJSON, MIT, ingested 19 Aug). Every other instrument in this
 * repo scores a deck against something WE wrote - role floors we chose, job
 * lists typed from knowledge, or the two Syr Vondam decks. This is the only
 * one that asks, across many commanders, whether we reach for the same cards a
 * real deck did.
 *
 * READ IT AS A FLOOR, NOT A TARGET. Two warnings, both already recorded in
 * CLAUDE.md and both true here:
 *
 *   1. These are PRECONS. Matching them says our decks are shaped like real
 *      decks, not that they are good ones. A precon is a weak deck and beating
 *      it is allowed.
 *   2. Overlap rewards copying and punishes a different-but-correct card. A
 *      low number on one commander is a QUESTION, not a fault.
 *
 * CALIBRATED, so the absolute number is not misread. Measured 5 Sep 2026 over
 * all 11,650 nonland cards in these decks:
 *
 *     median EDHREC rank of a card in a real deck   3,547
 *     past rank 12,000                              14.7%
 *     past rank 15,000                               8.3%
 *
 * Our decks run about 1% past rank 15,000. So roughly a seventh of every real
 * list is cards nobody plays - set filler a precon carries because it was
 * printed in that set - and that fraction is UNREACHABLE for us by design. An
 * overlap in the teens is the expected shape of this comparison, not a
 * failure. The worked example is Prossh, Skyraider of Kher at 3%: the cards
 * the real deck has and we do not are Vile Requiem (22,024), Deepfire
 * Elemental (27,909), Quagmire Druid (24,049) and Jar of Eyeballs (19,038).
 * Declining those is correct.
 *
 * SO THE NUMBER IS COMPARATIVE, NEVER ABSOLUTE. It is worth reading across
 * commanders, and across time for the same commander. It is not worth
 * maximising, and a change that raises it by taking unplayed cards has made
 * the deck worse.
 *
 * What it is genuinely good for is the outlier read AS A PLAYER: a commander
 * where the cards we are missing are GOOD ones is a systematic gap, and that
 * is a different finding from missing a precon's filler.
 *
 * Lands are excluded on both sides. A mana base is solved separately and
 * counting 38 lands would drown the signal.
 */
import { readFileSync } from 'node:fs';
import { Catalog } from '../../supabase/functions/ai-deck-builder-v2/catalog.ts';
import { build } from '../../supabase/functions/ai-deck-builder-v2/pipeline.ts';

const K = readFileSync('scratch/anon.txt', 'utf8').trim();
const BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
const H = { apikey: K, Authorization: `Bearer ${K}` };
const WANT = Number(process.argv[2] ?? 12);

const catalog = new Catalog({ url: BASE, anonKey: K, authorization: null });

const decks = await (await fetch(
  `${BASE}/rest/v1/meta_decks?select=id,name,commander_oracle_ids,total_cards` +
    `&format=eq.commander&is_complete=is.true&order=name.asc&limit=200`,
  { headers: H }
)).json();

const single = decks.filter(d => (d.commander_oracle_ids ?? []).length === 1);
/* Spread across the alphabet rather than the first N, so one set's precons do
   not stand in for the format. */
const step = Math.max(1, Math.floor(single.length / WANT));
const sample = single.filter((_, i) => i % step === 0).slice(0, WANT);

const rows = [];
for (const d of sample) {
  const oid = d.commander_oracle_ids[0];
  const cmd = await (await fetch(
    `${BASE}/rest/v1/cards_unique?select=name&oracle_id=eq.${oid}&limit=1`, { headers: H }
  )).json();
  if (!cmd[0]) continue;
  const commanderName = cmd[0].name;

  const theirs = await (await fetch(
    `${BASE}/rest/v1/meta_deck_cards?select=card_name&deck_id=eq.${d.id}&board=eq.main&limit=200`,
    { headers: H }
  )).json();

  let out;
  try {
    out = await build({
      catalog,
      request: { commander: { name: commanderName }, powerLevel: 7, includeLands: true, useAIPlanning: false },
      apiKey: null, startedAt: Date.now(),
    });
  } catch (err) {
    rows.push(`${commanderName.slice(0, 26).padEnd(27)} BUILD FAILED ${String(err).slice(0, 40)}`);
    continue;
  }
  const deck = out.body.result?.deck ?? [];
  const isLand = t => /Land/.test(t ?? '');
  const ourNames = new Set(
    deck.filter(x => !isLand((x.card ?? x).typeLine ?? (x.card ?? x).type_line)).map(x => (x.card ?? x).name)
  );
  const theirNonland = [];
  const chunk = theirs.map(t => t.card_name).filter(Boolean);
  const typed = await catalog.cardsByName(chunk, 'commander');
  const typeByName = new Map(typed.map(r => [r.name, r.type_line ?? '']));
  for (const n of chunk) {
    if (n === commanderName) continue;
    if (isLand(typeByName.get(n))) continue;
    theirNonland.push(n);
  }
  const shared = theirNonland.filter(n => ourNames.has(n));
  const pct = theirNonland.length ? Math.round((100 * shared.length) / theirNonland.length) : 0;
  rows.push(
    `${commanderName.slice(0, 26).padEnd(27)} ${String(shared.length).padStart(3)}/${String(theirNonland.length).padEnd(3)} ${String(pct).padStart(3)}%   ${shared.slice(0, 6).join(', ')}`
  );
}

console.log('\ncommander                    held  of theirs   examples of what we both play');
console.log(rows.join('\n'));
const pcts = rows.map(r => Number((r.match(/ (\d+)%/) ?? [])[1])).filter(n => Number.isFinite(n));
if (pcts.length) {
  pcts.sort((a, b) => a - b);
  console.log(
    `\n${pcts.length} decks. median ${pcts[Math.floor(pcts.length / 2)]}%, worst ${pcts[0]}%, best ${pcts[pcts.length - 1]}%`
  );
  console.log('A LOW number is a question, not a fault: these are precons and overlap punishes');
  console.log('a different-but-correct card. Read the outliers as a player.');
}
