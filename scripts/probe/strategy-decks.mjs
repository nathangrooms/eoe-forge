/**
 * Build a deck in EVERY strategy and read what came back.
 *
 *   node --experimental-strip-types scripts/probe/strategy-decks.mjs
 *   ONLY=blink node --experimental-strip-types scripts/probe/strategy-decks.mjs
 *
 * Owner: *"Actually build decks in all the different strategies and audit
 * them"* and *"Make sure that decks generated follow the decks advantages and
 * strengths - this is so important."*
 *
 * Every other instrument builds from the commander alone and lets the engine
 * derive a shell. This one asks for each of the eighteen shells BY NAME, on a
 * commander that genuinely earns it, and then checks the deck it got back
 * against what that shell is for. A shell that cannot produce a deck, or
 * produces one that ignores it, is a strategy the app offers and cannot honour.
 *
 * WHAT IT CHECKS, and each is a different way of being wrong:
 *
 *   named       how many of the shell's own example cards the deck holds. The
 *               shell names about a dozen; a deck holding none of them was
 *               built to a different plan whatever its score says.
 *   packages    the shell's jobs, filled or not. `2/2` means the job was done.
 *   keyed       nonland cards the commander's plan actually wanted, which is
 *               the theme reaching the deck rather than the shell alone.
 *   ramp        the owner: *"decks need way to make mana (ramp) - this is
 *               really important as game unplayable otherwise."* Reported for
 *               every deck against what real decks hold, because a strategy
 *               that starves its own mana is unplayable however on-theme.
 */
import process from 'node:process';
import { readFileSync } from 'node:fs';

import { Catalog } from '../../supabase/functions/ai-deck-builder-v2/catalog.ts';
import { build } from '../../supabase/functions/ai-deck-builder-v2/pipeline.ts';
import { DECK_ARCHETYPES, shellCardNames } from '../../src/lib/deck/archetypeShells.ts';
import { strategiesFor } from '../../src/lib/deck/commanderStrategies.ts';
import { planForCommander, planFit } from '../../src/engine/knowledge/behaviour.ts';
import { facetsForCard } from '../../src/lib/deck/recommend/behaviour.ts';
import { cardRole } from '../../src/engine/index.ts';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON = readFileSync('scratch/anon.txt', 'utf8').trim();
const catalog = new Catalog({ url: SUPABASE_URL, anonKey: ANON, authorization: null });

const REAL_RAMP = { p10: 11, p50: 16, p90: 21 };
const only = process.env.ONLY;
const shells = DECK_ARCHETYPES.filter(s => !only || s.id === only);

/* A commander that genuinely earns each shell, so the build is a fair test of
   the shell rather than of forcing it onto a commander who wants none of it.
   Read from `cards_pool` and chosen by how played the commander is, so these
   are commanders people actually build. */
const URL = `${SUPABASE_URL}/rest/v1`;
const H = { apikey: ANON, Authorization: `Bearer ${ANON}` };
async function page(path, from = 0, size = 1000, acc = []) {
  const res = await fetch(`${URL}/${path}&limit=${size}&offset=${from}`, { headers: H });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  acc.push(...rows);
  return rows.length < size ? acc : page(path, from + size, size, acc);
}

console.log('finding a commander that earns each strategy ...');
const commanders = (
  await page(
    'cards_pool?select=name,type_line,mana_cost,cmc,tags,facets,edhrec_rank,color_identity' +
      /* NO RANK FILTER IN THE QUERY. Adding `edhrec_rank=lte.3000` alongside
         the leading-wildcard type match changed the plan and page two came
         back 57014, a statement timeout - the same trap CLAUDE.md records for
         `role-coverage`. The type match already costs a scan; narrowing it
         afterwards in JS costs nothing. */
      '&commander_legal=eq.legal&type_line=like.*Legendary*Creature*'
  )
)
  .filter(c => typeof c.edhrec_rank === 'number' && c.edhrec_rank <= 3000)
  .sort((a, b) => (a.edhrec_rank ?? 1e9) - (b.edhrec_rank ?? 1e9));

/*
 * THE COMMANDER WHO WANTS THIS SHELL MOST, not the most played one who wants
 * it at all. The first version took the highest-ranked commander earning each
 * shell and handed Blink to Ragavan, Nimble Pilferer and Superfriends to
 * Braids, Arisen Nightmare - both of whom earn those shells for a real but
 * faint reason, and neither of whom is what the shell is for. That tests the
 * probe's choice rather than the shell.
 *
 * Rank still breaks ties, so between two commanders who want a shell equally
 * the audit uses the one people actually build.
 */
const championOf = new Map();
for (const c of commanders) {
  for (const offer of strategiesFor(c)) {
    if (offer.score <= 0) continue;
    const held = championOf.get(offer.value);
    if (!held || offer.score > held.score) championOf.set(offer.value, { card: c, score: offer.score });
  }
}

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
const rows = [];

for (const shell of shells) {
  const champ = championOf.get(shell.id)?.card;
  if (!champ) {
    rows.push(`${shell.name.padEnd(18)} NO COMMANDER in the top 3,000 earns this strategy`);
    continue;
  }

  const started = Date.now();
  const result = await build({
    catalog,
    request: {
      commander: { name: champ.name },
      archetype: shell.id,
      powerLevel: 7,
      includeLands: true,
    },
    apiKey: null,
    startedAt: started,
  });
  if (result.kind !== 'ok') {
    rows.push(`${shell.name.padEnd(18)} ${champ.name}: BUILD REFUSED ${String(result.error).slice(0, 60)}`);
    continue;
  }

  const deck = result.body.result.deck;
  const log = result.body.result.changeLog ?? [];

  /*
   * OUT OF THE SHELL CARDS THIS COMMANDER MAY LEGALLY PLAY, which is the only
   * fair denominator: reporting "0 of 12" against a list two thirds of which
   * are illegal says the deck ignored the shell when the deck had no choice.
   *
   * AND A ZERO DENOMINATOR IS NOT A FAULT. Measured 3 Sep 2026, the shells'
   * example cards are strongly coloured - Reanimator is ten of twelve black,
   * Aggro seven of seven red - so a mono-red commander can play none of
   * Reanimator's and the count comes out 0/0. That looked like the panel
   * offering a strategy nobody could build, and it is not: a shell's cards
   * exist to DERIVE ITS WANTS, which are colour-agnostic facets, and the pool
   * is filtered by identity separately. A mono-red Reanimator deck is
   * Underworld Breach and Faithless Looting, and it is a real deck. The gate
   * that was nearly added here - refuse a shell whose colours the commander
   * does not share - would have refused it.
   */
  const identity = new Set(champ.color_identity ?? []);
  const shellRows = await catalog.cardsByName(shellCardNames(shell), 'commander');
  const legalNames = shellRows.filter(r =>
    (r.color_identity ?? []).every(col => identity.has(col))
  );
  const wanted = new Set(legalNames.map(r => norm(r.name)));
  const named = deck.filter(c => wanted.has(norm(c.name))).length;

  const pkgLine = log.find(l => /packages filled/.test(l)) ?? '';
  const pkgs = [...pkgLine.matchAll(/(\d+)\/(\d+)/g)];
  const filled = pkgs.reduce((n, m) => n + Number(m[1]), 0);
  const asked = pkgs.reduce((n, m) => n + Number(m[2]), 0);

  const plan = planForCommander({
    ...champ,
    typeLine: champ.type_line,
    facets: champ.facets ?? [],
    tags: champ.tags ?? [],
  });
  const nonland = deck.filter(c => !/\bLand\b/i.test(String(c.type_line ?? '')));
  /*
   * FACETS FROM THE POOL, because the response does not carry them.
   *
   * A response card holds id, name, type_line, cmc, tags, rank and the reason
   * it was picked - no `facets` and no `oracle_text`. This read
   * `c.facets ?? facetsForCard(c)`, and with neither present `facetsForCard`
   * had nothing to compile, so almost every card scored a fit of zero. It
   * reported the Aristocrats deck at "keyed 20%" - a deck holding eight
   * sacrifice outlets, Blood Artist, Zulaport Cutthroat, Ayara and the
   * Meathook Massacre for a commander paid when creatures die. The deck was
   * right and the instrument was reading an empty card.
   */
  const poolFacets = await catalog.poolFacetsByName(nonland.map(c => c.name));
  const keyed = nonland.filter(
    c => planFit(plan, { facets: poolFacets.get(c.name) ?? [] }).fit >= 0.45
  ).length;

  const ramp = deck.filter(c =>
    cardRole(
      { name: c.name, typeLine: c.type_line, type_line: c.type_line, cmc: c.cmc, facets: c.facets ?? [], tags: c.tags ?? [] },
      'ramp'
    )
  ).reduce((n, c) => n + Math.max(1, Number(c.quantity) || 1), 0);
  const rampFlag = ramp < REAL_RAMP.p10 ? ' RAMP TOO LOW' : ramp > REAL_RAMP.p90 ? ' ramp high' : '';

  const combo = (log.find(l => /go in together/.test(l)) ?? '').split(' go in together')[0];

  rows.push(
    `${shell.name.padEnd(18)} ${champ.name.slice(0, 24).padEnd(25)} ` +
      (wanted.size === 0
        ? 'named   -  '
        : `named ${String(named).padStart(2)}/${String(wanted.size).padStart(2)}  `) +
      `pkgs ${String(filled).padStart(2)}/${String(asked).padStart(2)}  ` +
      `keyed ${String(Math.round((100 * keyed) / Math.max(1, nonland.length))).padStart(3)}%  ` +
      `ramp ${String(ramp).padStart(2)}${rampFlag}` +
      (combo ? `\n${' '.repeat(20)}combo: ${combo}` : '')
  );
  console.log(rows[rows.length - 1]);
}

console.log('\n' + '='.repeat(100));
console.log('named = the shell\'s own example cards the deck holds; pkgs = the shell\'s jobs filled;');
console.log(`keyed = nonland cards the commander wanted; ramp against real decks ${REAL_RAMP.p10}-${REAL_RAMP.p90}.`);
