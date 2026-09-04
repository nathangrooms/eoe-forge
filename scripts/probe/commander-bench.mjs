/**
 * Score generated decks for eight commanders against what a well-built version
 * of each actually runs.
 *
 *   node scripts/probe/commander-bench.mjs              the DEPLOYED function
 *   LOCAL=1 node --experimental-strip-types scripts/probe/commander-bench.mjs
 *   ONLY=brago ... ARCHETYPE=1 ...  (pass each commander's own archetype)
 *
 * ## Why groups and not overlap
 *
 * Overlap with a decklist rewards copying and punishes a different-but-correct
 * card. What is scored instead is whether the deck can DO each job: a Meren deck
 * with Grave Pact, Dictate of Erebos and Blood Artist and no sacrifice outlet is
 * a real failure CLAUDE.md records, and it is invisible to any overlap score
 * because every card in it is a fine Meren card.
 *
 * So each commander has groups, each group is a job, and each carries a FLOOR:
 * how many of that job a real deck runs. Finding eight sacrifice outlets is not
 * better than finding three. A group at zero is the failure worth shouting
 * about, and `jobs done` counts groups at or above their floor.
 *
 * ## The lists are typed, not scraped
 *
 * CLAUDE.md rules EDHREC, Moxfield and the rest out as data sources and this
 * makes no network call to any of them. `commander-benchmark.json` was written
 * once from knowledge of the format and is a scoring target only.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';

const K = readFileSync(new URL('../../scratch/anon.txt', import.meta.url), 'utf8').trim();
const BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
const bench = JSON.parse(
  readFileSync(new URL('commander-benchmark.json', import.meta.url), 'utf8')
);

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
const only = process.env.ONLY ? norm(process.env.ONLY) : null;
const useArchetype = process.env.ARCHETYPE === '1';
const LOCAL = process.env.LOCAL === '1';

let build = null;
let catalog = null;
if (LOCAL) {
  const { Catalog } = await import('../../supabase/functions/ai-deck-builder-v2/catalog.ts');
  ({ build } = await import('../../supabase/functions/ai-deck-builder-v2/pipeline.ts'));
  catalog = new Catalog({ url: BASE, anonKey: K, authorization: null });
}

async function deckFor(entry) {
  const request = {
    commander: {
      name: entry.name,
      type_line: 'Legendary Creature',
      color_identity: [...entry.ci],
      colors: [...entry.ci],
    },
    powerLevel: 7,
    includeLands: true,
    useAIPlanning: false,
    ...(useArchetype && entry.archetype ? { archetype: entry.archetype } : {}),
  };
  if (LOCAL) {
    const out = await build({ catalog, request, apiKey: null, startedAt: Date.now() });
    if (out.kind !== 'ok') return null;
    return (out.body.result?.deck ?? []).map(d => d.card ?? d);
  }
  const res = await fetch(`${BASE}/functions/v1/ai-deck-builder-v2`, {
    method: 'POST',
    headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) return null;
  const body = await res.json();
  return (body?.result?.deck ?? []).map(d => d?.card ?? d);
}

/*
 * THE INSTRUMENT CHECKS ITSELF FIRST.
 *
 * A benchmark name that does not resolve against the catalogue can never be
 * found, and it reads exactly like a generator failure. Three did: Bloodline
 * Keeper, Docent of Perfection and Journey to Eternity are all double-faced and
 * the catalogue holds them under their `//` names, so Edgar Markov was being
 * marked down for a card that does not exist by the name asked for.
 *
 * Checked every run, because the catalogue changes and a benchmark that quietly
 * stops resolving is worse than no benchmark at all.
 */
/*
 * WHAT EACH GROUP'S EXAMPLES HAVE IN COMMON, so a job can be scored by
 * CAPABILITY and not only by which of a dozen named cards turned up.
 *
 * This file's own header says it scores "whether the deck can DO each job"
 * rather than overlap, and the implementation checked a NAME LIST, which is
 * overlap at the group level. Measured: Prosper, Tome-Bound was reported
 * "impulse draw 0/8" - a job it cannot do at all - while holding TEN cards
 * carrying `eff:impulse`. Xenagos was reported 0/6 on "huge creatures worth
 * doubling" while holding six creatures with `pt:big`.
 *
 * The conjunction is DERIVED from the group's own example cards rather than
 * typed, which is the same move `planForArchetype` makes for a shell package:
 * the examples are the definition, so what they agree on IS the job.
 */
const exampleFacets = new Map();

/*
 * HOW COMMON EACH FACET IS IN THE POOL, fetched once.
 *
 * The specificity guard used to measure a conjunction's breadth against the
 * DECK, and that punishes success: Muldrotha, the Gravetide holds TWELVE cards
 * carrying `eff:mill` against a job asking for five, and the guard threw the
 * conjunction away for matching a fifth of his spells. A deck built around a
 * job looks exactly like a job that is too broad, from inside the deck.
 *
 * From the POOL the two separate cleanly. `eff:mill` is on about 3% of it and
 * `eff:draw` - which is what the "Curiosity effects on Niv" examples agreed on,
 * and which let that job claim Urza's Command - is on about 20%. That is the
 * same lift-against-a-background idea `planForArchetype` uses, and it is the
 * right axis.
 */
const poolFacetFrequency = new Map();
let poolSize = 0;
{
  const REST = `${BASE}/rest/v1`;
  const H = { apikey: K, Authorization: `Bearer ${K}` };
  let from = 0;
  for (let i = 0; i < 6; i++) {
    const res = await fetch(
      `${REST}/cards_pool?select=facets&commander_legal=eq.legal` +
        `&edhrec_rank=gte.${from}&order=edhrec_rank.asc&limit=1000`,
      { headers: H }
    );
    if (!res.ok) break;
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) break;
    for (const r of rows) {
      poolSize += 1;
      for (const f of new Set(r.facets ?? [])) {
        poolFacetFrequency.set(f, (poolFacetFrequency.get(f) ?? 0) + 1);
      }
    }
    if (rows.length < 1000) break;
    from += 1000;
  }
}

/* Words too common to define a job. `type:creature` is on a third of the pool,
   so "creatures that do X" must be scored on the X. */
const TOO_COMMON = new Set([
  'type:creature', 'type:artifact', 'type:enchantment', 'type:instant',
  'type:sorcery', 'type:legendary', 'cares:type:creature', 'rec:full',
  'rec:partial', 'rec:none', 'mv:cheap',
]);

/**
 * How many cards in the deck do what this group's EXAMPLES agree on.
 *
 * Returns null when the examples agree on nothing specific, in which case the
 * name list stays the only measure - which is right: a job whose examples share
 * no facet is a job this engine cannot express, and pretending otherwise would
 * hide exactly the gap worth knowing about.
 */
function groupCapability(group, deckFacets, spells) {
  const names = group.cards ?? [];
  const sets = names.map(n => exampleFacets.get(n)).filter(Boolean);
  if (sets.length < 3) return null;

  const count = new Map();
  for (const facets of sets) {
    for (const f of new Set(facets)) {
      if (TOO_COMMON.has(f)) continue;
      if (f.startsWith('rec:')) continue;
      /*
       * REFUSED, MEASURED: excluding `sub:` and `cares:sub:` from the
       * conjunction.
       *
       * The reasoning looked sound. "big colourless creatures that cost nothing
       * once Animar is large" is exemplified by eleven cards that all happen to
       * be ELDRAZI, so the derived conjunction is `mv:big pt:big sub:eldrazi`
       * and demands a deck card be an Eldrazi, which the job text never asks
       * for. Tribal jobs are scored by `typeMatch` anyway.
       *
       * It did NOT fix the target - "big colourless creatures" stayed at zero -
       * and it broke Chulane's "cheap creatures that make mana", which went
       * from 1 of 6 to ZERO. Jobs 35 -> 36, groups at zero 9 -> 10, and groups
       * at zero is the number that matters.
       *
       * The over-narrow case is real and still unsolved. It cannot be DETECTED
       * the way the over-broad case can, because an over-narrow conjunction
       * matches nothing and that is indistinguishable from the deck failing.
       */
      count.set(f, (count.get(f) ?? 0) + 1);
    }
  }
  /* Agreed by most of the examples. Two thirds, so one odd card in a list of
     twelve cannot define the job and a genuine shared verb still survives a
     couple of exceptions. */
  /*
   * A MAJORITY, not two thirds. Measured twice, and both times the strict
   * threshold hid a job the deck was doing:
   *
   *   Prosper "impulse draw"    6 of 13 examples carry eff:impulse
   *   Chulane "bounce your own" 6 of 11 examples carry eff:bounce-own
   *
   * In both the missing examples are cards the COMPILER cannot read, not cards
   * that do something else, so the threshold was measuring our reading rather
   * than the group's coherence. Chulane's deck holds FIVE bounce cards - Kogla,
   * Dour Port-Mage, Cid, Whitemane Lion, Jeskai Barricade - and the job scored
   * 1 of 3.
   *
   * The specificity guard below is what keeps this honest: a conjunction
   * matching more than a fifth of the spells is thrown away whatever agreed on
   * it, so a loose majority cannot quietly pass.
   */
  const need = Math.max(2, Math.floor(sets.length * 0.5) + 1);
  let shared = [...count].filter(([, n]) => n >= need).map(([f]) => f);
  if (shared.length === 0) return null;
  /*
   * AT MOST THE TWO RAREST FACETS. A third is nearly always an accident of the
   * example list rather than part of the job.
   *
   * "big colourless creatures that cost nothing once Animar is large" is
   * exemplified by eleven cards that all happen to be ELDRAZI, so every facet
   * they share includes `sub:eldrazi` and the conjunction demanded one.
   * Korvold's "things that come back after being sacrificed" picked up
   * `cares:type:land`, because its examples are mostly lands.
   *
   * Rarest first, because the rare facets are the ones that say what the job
   * IS - `eff:recur-self` is the job and `cares:type:land` is what its
   * exemplars happen to be printed on.
   */
  if (poolSize > 0 && shared.length > 2) {
    shared = shared
      .slice()
      .sort(
        (a, b) =>
          (poolFacetFrequency.get(a) ?? 0) - (poolFacetFrequency.get(b) ?? 0)
      )
      .slice(0, 2);
  }

  const out = [];
  for (const [name, facets] of deckFacets) {
    if (shared.every(f => facets.includes(f))) out.push(name);
  }
  /*
   * A CONJUNCTION THAT MATCHES A QUARTER OF THE DECK IS NOT A JOB.
   *
   * Without this the measure is far too kind: a group of twelve draw spells
   * agrees on `eff:draw` alone, and then every draw spell in the deck counts as
   * doing that specific job. Measured, the unguarded version took jobs done
   * from 19 of 71 to 47 and zero groups from 22 to 14, which is not a product
   * improvement, it is an instrument that stopped discriminating.
   *
   * `planForArchetype` solves the same problem with LIFT against the pool. This
   * is the cheap version of the same idea and it is measured against the DECK,
   * which is the population the answer is about.
   */
  /*
   * Measured against the SPELLS, not the whole deck. With lands in the
   * denominator a job could claim 21 of 92 and still pass at a quarter, which
   * is how "Curiosity effects on Niv" came back with Urza's Command and
   * Archmage of Runes - cards that draw, which is all their examples agreed on.
   *
   * A fifth of the spells, not a quarter: read as a player, the rescues at 25%
   * of the whole deck included "cheap cantrips that target your own creature"
   * claiming Wheel of Fortune.
   */
  /*
   * THE CONJUNCTION MUST NAME SOMETHING RARE. Its breadth is bounded by its
   * RAREST facet, so one facet on a tenth of the pool or less is enough to make
   * the whole conjunction specific.
   *
   * Measured against the DECK this guard punished success - see the note on
   * `poolFacetFrequency`. Against the POOL it separates the two cases it has to:
   * `eff:mill` is on about 3% and `eff:draw` on about 20%, and it was `eff:draw`
   * alone that let "Curiosity effects on Niv" claim Urza's Command and Archmage
   * of Runes.
   *
   * When the pool fetch failed there is no frequency to read, and the guard
   * falls back to the old deck-share test rather than passing everything.
   */
  if (poolSize > 0) {
    const rarest = Math.min(
      ...shared.map(f => (poolFacetFrequency.get(f) ?? 0) / poolSize)
    );
    /*
     * A BROAD FACET MAY STILL BE THE JOB, if NEARLY ALL the examples carry it.
     *
     * The rarity test alone refused "High mana value cards to reveal off the
     * top for a big Yuriko drain": its shared facet is `mv:big`, which is broad
     * by construction, and it is EXACTLY what the job means. Yuriko's deck
     * holds five such cards against a floor of five and scored zero.
     *
     * What separates that from the false positive this guard exists for is how
     * many examples agree. `mv:big` is on ELEVEN OF TWELVE of Yuriko's - it is
     * the definition. `eff:draw`, which let "Curiosity effects on Niv" claim
     * Urza's Command, was on a bare majority of its examples and is incidental
     * to a job about drawing INTO DAMAGE.
     *
     * So: a rare facet passes on a majority, a broad one has to be nearly
     * unanimous. Verified after the change that the Niv job still gets NO
     * capability rescue.
     */
    if (rarest > 0.1) {
      const strongest = Math.max(...shared.map(f => (count.get(f) ?? 0) / sets.length));
      if (strongest < 0.85) return null;
    }
  } else if (out.length > (spells || 1) * 0.2) {
    return null;
  }
  return out;
}

{
  const REST = `${BASE}/rest/v1`;
  const H = { apikey: K, Authorization: `Bearer ${K}` };
  const allNames = [
    ...new Set(bench.commanders.flatMap(c => c.groups.flatMap(g => g.cards ?? []))),
  ];
  const found = new Set();
  let failedChunks = 0;
  for (let i = 0; i < allNames.length; i += 40) {
    const list = allNames.slice(i, i + 40).map(n => `"${n.replace(/"/g, '')}"`).join(',');
    const res = await fetch(
      `${REST}/cards_pool?select=name,facets&name=in.(${encodeURIComponent(list)})`, { headers: H }
    );
    /*
     * A FAILED CHUNK IS NOT SIXTY MISSING CARDS, and the first version of this
     * check said it was: two chunks errored and it reported 120 unresolvable
     * names against a true answer of three. A self-check that invents failures
     * is worse than no self-check, because it teaches you to ignore it.
     */
    if (!res.ok) { failedChunks++; continue; }
    const rows = await res.json();
    if (!Array.isArray(rows)) { failedChunks++; continue; }
    for (const r of rows) {
      found.add(r.name);
      exampleFacets.set(r.name, r.facets ?? []);
    }
  }
  if (failedChunks) {
    console.log(`\n  NOTE: ${failedChunks} name-check request(s) failed, so the check below is incomplete.`);
  } else {
    const missing = allNames.filter(n => !found.has(n));
    if (missing.length) {
      console.log(`\n  WARNING: ${missing.length} benchmark names do not resolve and can never be found:`);
      for (const m of missing) console.log(`    ${m}`);
    }
  }
}

console.log(
  `\nEIGHT COMMANDERS, against what a well-built version of each runs.` +
  `  ${LOCAL ? 'LOCAL build' : 'DEPLOYED function'}${useArchetype ? ', archetype passed' : ', no archetype passed'}\n`
);

let jobsDone = 0;
let jobsTotal = 0;
let rescued = 0;
let zeroes = 0;
const rows = [];

for (const entry of bench.commanders) {
  if (only && !norm(entry.name).includes(only)) continue;
  const deck = await deckFor(entry);
  if (!deck) { console.log(`  ${entry.name.padEnd(30)} BUILD FAILED`); continue; }

  const have = new Set(deck.map(c => norm(c.name ?? '')));
  /* Facets for the built deck, from the POOL. A response card carries none, and
     reading `card.facets ?? []` is how two sibling probes ended up classifying
     by tags instead. */
  const deckFacets = LOCAL && catalog
    ? await catalog.poolFacetsByName(deck.map(c => c.name))
    : new Map();
  const nonland = deck.filter(c => !String(c.type_line ?? '').toLowerCase().includes('land'));
  const ranks = nonland.map(c => c.edhrec_rank).filter(r => typeof r === 'number').sort((a, b) => a - b);

  const parts = [];
  let done = 0;
  for (const g of entry.groups) {
    /*
     * A GROUP MAY BE A TYPE RATHER THAN A LIST, and for a tribal deck it must
     * be. "Play Vampires" has two hundred right answers, so scoring Edgar
     * Markov against nine named ones reported 0/4 while his deck held TWELVE
     * Vampires — Olivia Voldaren, Immersturm Predator, Elenda. The instrument
     * was wrong and the generator was not, which is the third time this session
     * a probe has invented a defect.
     *
     * A name list stays right for a job with a few canonical answers: there are
     * not two hundred sacrifice outlets worth running.
     */
    const named = g.typeMatch
      ? deck.filter(c => new RegExp(g.typeMatch, 'i').test(String(c.type_line ?? ''))).map(c => c.name)
      : g.cards.filter(c => have.has(norm(c)));

    /*
     * CAN THE DECK DO THE JOB, asked of the deck rather than of the list.
     *
     * The facets the group's examples AGREE on are the job. A card in the deck
     * carrying all of them does that job, whether or not anybody typed its
     * name. Only counted when the agreement is specific enough to mean
     * something: at least one facet, and none of them a word most of the pool
     * carries.
     *
     * The two numbers are reported side by side and a job is done if EITHER
     * clears the floor, so this can only turn a false negative into a pass. It
     * has to be checked that it does not turn everything green, which would
     * make the instrument useless in the other direction - see the summary
     * line, which counts both.
     */
    const able = groupCapability(g, deckFacets, nonland.length);
    const hit = able && able.length > named.length ? able : named;

    jobsTotal++;
    if (hit.length >= g.floor) { done++; jobsDone++; }
    if (hit.length === 0) zeroes++;
    if (named.length < g.floor && able && able.length >= g.floor) rescued++;
    parts.push({
      job: g.job,
      hit,
      named,
      able,
      floor: g.floor,
      of: g.typeMatch ? hit.length : g.cards.length,
    });
  }

  rows.push({ name: entry.name, done, of: entry.groups.length, parts,
    median: ranks[Math.floor(ranks.length / 2)] ?? 0,
    deep: ranks.filter(r => r > 15000).length, cards: deck.length });

  console.log(`  ${entry.name}   ${done}/${entry.groups.length} jobs done, ` +
    `${deck.length} cards, median ${ranks[Math.floor(ranks.length / 2)] ?? '-'}, ` +
    `${ranks.filter(r => r > 15000).length} past 15k`);
  for (const p of parts) {
    const mark = p.hit.length === 0 ? 'NONE' : p.hit.length >= p.floor ? ' ok ' : 'thin';
    /* When the two disagree, say so: a job passing on capability while the
       named cards are absent is a different fact from both of them passing. */
    const both =
      p.able && p.able.length !== p.named.length
        ? `  [named ${p.named.length}, able ${p.able.length}]`
        : '';
    console.log(`      [${mark}] ${p.job.padEnd(26)} ${p.hit.length}/${p.floor} needed${both}` +
      (p.hit.length ? `   ${p.hit.slice(0, 5).join(', ')}` : ''));
  }
}

console.log(`\n  ${jobsDone}/${jobsTotal} jobs done across ${rows.length} decks. ` +
  `${zeroes} groups the deck cannot do AT ALL.`);
if (rescued) {
  console.log(
    `  ${rescued} of those jobs are done by CAPABILITY and not by name: the deck holds
` +
      `  enough cards that do what the group's examples agree on, just not those cards.`
  );
}
console.log(`  A group at zero is the failure worth fixing: the deck has no way to do that job.`);
