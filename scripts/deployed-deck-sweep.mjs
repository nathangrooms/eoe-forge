/**
 * Build a deck for many commanders against the DEPLOYED generator and report
 * the four things that have gone wrong before.
 *
 *   node scripts/deployed-deck-sweep.mjs
 *   SHOW=meren node scripts/deployed-deck-sweep.mjs
 *
 * `generator-synergy-audit.mjs` builds LOCALLY from the same pipeline, which is
 * right for iterating on a rule and wrong for answering "is the product good".
 * CLAUDE.md records the generator sitting on an old deployed version for days
 * while the repo was fixed, twice, on two different functions. This asks the
 * function a player asks.
 *
 * It is also a WIDER net than the six-commander roster: a rule tuned until six
 * decks look right is a rule tuned to six decks. Colours, archetypes and pool
 * sizes are spread deliberately, including the two shapes that used to fail
 * outright — mono-coloured, where the pool is small, and five-colour, where it
 * is the whole catalogue.
 *
 * WHAT IT CHECKS, and every one of these has been wrong in production:
 *
 *   legal      99 cards plus the commander. An 88-card deck is not a deck.
 *   deep       cards past EDHREC rank 15,000, which is where "he would never
 *              include that" lives.
 *   staples    the format's auto-includes, counted only where the colours allow.
 *   graveyard  hate for a graveyard the deck is using. Anti-synergy is not
 *              modelled anywhere, so it is at least reported here.
 *
 * Read-only. Nothing is written.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';

const KEY = readFileSync(new URL('../scratch/anon.txt', import.meta.url), 'utf8').trim();
const FN = 'https://udnaflcohfyljrsgqggy.supabase.co/functions/v1/ai-deck-builder-v2';
const ONLY = (process.env.SHOW ?? '').toLowerCase();

const COMMANDERS = [
  { name: 'Krenko, Mob Boss', ci: 'R' },
  { name: 'Talrand, Sky Summoner', ci: 'U' },
  { name: 'Isamaru, Hound of Konda', ci: 'W' },
  { name: 'Azusa, Lost but Seeking', ci: 'G' },
  { name: 'Sheoldred, Whispering One', ci: 'B' },
  { name: 'Meren of Clan Nel Toth', ci: 'BG' },
  { name: 'Teysa Karlov', ci: 'WB' },
  { name: 'Brago, King Eternal', ci: 'WU' },
  { name: 'Niv-Mizzet, Parun', ci: 'UR' },
  { name: 'Uril, the Miststalker', ci: 'RGW' },
  { name: 'Atraxa, Praetors’ Voice', ci: 'WUBG' },
  { name: 'Najeela, the Blade-Blossom', ci: 'WUBRG' },
  { name: 'Syr Vondam, Sunstar Exemplar', ci: 'W' },
  { name: 'Sythis, Harvest’s Hand', ci: 'GW' },
];

/* Deliberately short and uncontroversial: a Commander player notices the
   ABSENCE of every one of these. Each carries the colours it needs, so a
   mono-red deck is not marked down for missing a blue card. */
const STAPLES = [
  ['Sol Ring', ''],
  ['Arcane Signet', ''],
  ['Command Tower', ''],
  ['Swiftfoot Boots', ''],
  ['Lightning Greaves', ''],
  ['Swords to Plowshares', 'W'],
  ['Counterspell', 'U'],
  ['Demonic Tutor', 'B'],
  ['Cultivate', 'G'],
];

/* Cards whose whole job is to empty a graveyard, and the facets that say a deck
   is USING one. Both halves matter: a deck with no graveyard plan is entitled
   to run hate, and one with a plan is not. */
const GRAVE_HATE = /exile (all|target) (card|cards|creature card)s? from|graveyards? (are|is) exiled|exile .{0,30}graveyard|whenever a card would be put into a graveyard/i;
const GRAVE_PLAN = /from your graveyard|in your graveyard|return .{0,40}graveyard/i;

const build = async (name, ci) => {
  const identity = [...ci];
  const res = await fetch(FN, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commander: { name, color_identity: identity, colors: identity, type_line: 'Legendary Creature' },
      powerLevel: 7,
      includeLands: true,
      useAIPlanning: false,
    }),
  });
  const text = await res.text();
  try {
    return { ok: res.ok, body: JSON.parse(text) };
  } catch {
    return { ok: false, body: { raw: text.slice(0, 200) } };
  }
};

let legalFail = 0;
let totalDeep = 0;
let totalStaples = 0;
let eligibleStaples = 0;

for (const { name, ci } of COMMANDERS) {
  const started = Date.now();
  const { ok, body } = await build(name, ci);
  const ms = Date.now() - started;

  if (!ok || !body?.result) {
    console.log(`${name.padEnd(30)} FAILED  ${JSON.stringify(body).slice(0, 140)}`);
    legalFail++;
    continue;
  }

  const deck = body.result.deck.map(d => d.card ?? d);
  const total = body.result.totals.deckCards;
  const nonLand = deck.filter(c => !(c.type_line ?? '').toLowerCase().includes('land'));
  const ranks = nonLand.map(c => c.edhrec_rank).filter(r => typeof r === 'number').sort((a, b) => a - b);
  const median = ranks[Math.floor(ranks.length / 2)] ?? 0;
  const deep = ranks.filter(r => r > 15000).length;

  const names = new Set(deck.map(c => (c.name ?? '').toLowerCase()));
  const identity = new Set([...ci]);
  const eligible = STAPLES.filter(([, cols]) => [...cols].every(c => identity.has(c)));
  const found = eligible.filter(([n]) => names.has(n.toLowerCase()));

  const text = c => `${c.oracle_text ?? ''}`;
  const usesGraveyard = nonLand.filter(c => GRAVE_PLAN.test(text(c))).length;
  const hate = nonLand.filter(c => GRAVE_HATE.test(text(c)) && !GRAVE_PLAN.test(text(c)));

  legalFail += total === 99 ? 0 : 1;
  totalDeep += deep;
  totalStaples += found.length;
  eligibleStaples += eligible.length;

  const flags = [];
  if (total !== 99) flags.push(`ONLY ${total}+1 CARDS`);
  /* The plan has to WANT the graveyard. Brago runs eight cards that mention
     one (blink decks recur) and no graveyard hate is wrong in his deck. */
  const wantsGraveyard = (body.result.changeLog ?? []).some(l => /wants .*(cares:zone:graveyard|eff:return-from.*graveyard)/.test(l));
  if (usesGraveyard >= 8 && wantsGraveyard && hate.length) {
    flags.push(`graveyard hate in a graveyard deck: ${hate.map(c => c.name).join(', ')}`);
  }

  console.log(
    `${name.padEnd(30)} ${String(total).padStart(3)}+1  median ${String(median).padStart(5)}  ` +
      `past15k ${String(deep).padStart(2)}  staples ${found.length}/${eligible.length}  ` +
      `power ${String(body.result.analysis.power).padEnd(4)} ${String(ms).padStart(5)}ms`
  );
  for (const f of flags) console.log(`    !! ${f}`);
  if (ONLY && name.toLowerCase().includes(ONLY)) {
    for (const c of nonLand.slice().sort((a, b) => (a.edhrec_rank ?? 1e9) - (b.edhrec_rank ?? 1e9))) {
      console.log(`      ${String(c.edhrec_rank ?? '-').padStart(6)}  ${c.name}`);
    }
  }
}

console.log(
  `\nacross ${COMMANDERS.length} decks: ${legalFail} not 100 cards, ` +
    `${totalStaples}/${eligibleStaples} staples, ${totalDeep} cards past rank 15,000`
);
