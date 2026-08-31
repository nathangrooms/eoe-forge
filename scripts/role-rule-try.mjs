/**
 * What would this role rule actually claim? Check before adding it, by name.
 *
 * `ROLE_FACETS` in behaviour.ts carries two long comments about rules that were
 * added, measured and REMOVED: `eff:pump` + `scope:all` as a win condition made
 * three pieces of Equipment the win conditions of a Muldrotha deck and still
 * missed Craterhoof Behemoth; `eff:poison` made a two-mana 1/1 Rat one of
 * Kaalia's three ways to end a game. Both were wrong in both directions at
 * once, and both were caught by reading the list of cards the rule claimed.
 *
 * So this prints that list. A candidate rule is given as a small expression
 * over facets, and it reports what it would claim among the most played cards
 * and what it would claim that ALREADY has a role, which is the direction that
 * catches a rule stealing cards from a role that had them right.
 *
 *   node --experimental-strip-types scripts/role-rule-try.mjs protection
 *   node --experimental-strip-types scripts/role-rule-try.mjs bounce
 *   TOP=4000 node --experimental-strip-types scripts/role-rule-try.mjs edict
 *
 * Read the output AS A PLAYER. A rule whose list you would not put in a deck is
 * the wrong rule, however good the reasoning behind it was.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';

import { cardRole } from '../src/engine/advise/roles.ts';
import { ROLES } from '../src/engine/core/types.ts';
import { facetsForCard } from '../src/lib/deck/recommend/behaviour.ts';

const KEY = readFileSync('scratch/anon.txt', 'utf8').trim();
const BASE = 'https://udnaflcohfyljrsgqggy.supabase.co/rest/v1';
const TOP = Number(process.env.TOP || 2000);
const which = process.argv[2] ?? '';

const has = (f, x) => f.includes(x);
const any = (f, ...xs) => xs.some(x => f.includes(x));

/*
 * The candidates. Each is a predicate over the card's facets and type line, and
 * a sentence saying what it is FOR, so the list below it can be judged against
 * an intention rather than against a feeling.
 */
const CANDIDATES = {
  protection: {
    what: 'Cards whose job is keeping your things alive: Boots, Greaves, Heroic Intervention.',
    test: f =>
      any(f, 'kw:hexproof', 'kw:shroud', 'kw:indestructible', 'kw:protection', 'kw:ward') &&
      any(f, 'type:instant', 'type:sorcery', 'sub:equipment', 'sub:aura'),
  },
  bounce: {
    what: 'Returning something to a hand, which is interaction: Cyclonic Rift, Aetherize.',
    test: f => has(f, 'eff:move-zone') && has(f, 'cares:zone:hand') && !has(f, 'cares:zone:graveyard'),
  },
  tokens: {
    what: 'Making creatures without being one, which is a board and a deck job.',
    test: f => has(f, 'eff:create-token') && !has(f, 'type:creature'),
  },
  edict: {
    what: 'Making somebody sacrifice, which is removal that ignores hexproof.',
    test: f => has(f, 'eff:sacrifice') && !has(f, 'cost:sacrifice'),
  },
  recursion: {
    what: 'Buying a card back out of the graveyard, which is card advantage.',
    test: f => has(f, 'eff:return-from') && has(f, 'cares:zone:graveyard'),
  },
  drain: {
    what: 'Draining the table, which is how a lot of Commander decks actually win.',
    test: f => has(f, 'eff:lose-life') && has(f, 'scope:all'),
  },
  anthem: {
    what: 'Making a board of creatures lethal.',
    test: f => has(f, 'eff:pump') && has(f, 'scope:all') && !any(f, 'sub:equipment', 'sub:aura'),
  },
  'anthem-creatures': {
    what: 'The same, but the clause has to NAME creatures, which is what Past in Flames does not.',
    test: f =>
      has(f, 'eff:pump') &&
      has(f, 'scope:all') &&
      has(f, 'cares:type:creature') &&
      !any(f, 'sub:equipment', 'sub:aura'),
  },
};

const chosen = CANDIDATES[which];
if (!chosen) {
  console.log(`usage: role-rule-try.mjs <${Object.keys(CANDIDATES).join('|')}>`);
  process.exit(1);
}

const cols =
  'name,oracle_text,type_line,mana_cost,cmc,colors,color_identity,keywords,tags,edhrec_rank,oracle_id,faces';
const rows = [];
for (let from = 0; rows.length < TOP; from += 1000) {
  const res = await fetch(
    `${BASE}/cards_unique?select=${cols}&edhrec_rank=not.is.null&order=edhrec_rank.asc&limit=1000&offset=${from}`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }
  );
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const page = await res.json();
  if (!page.length) break;
  rows.push(...page);
}

const rescued = [];
const stolen = [];
for (const c of rows.slice(0, TOP)) {
  const f = facetsForCard(c).facets;
  if (!chosen.test(f)) continue;
  const card = { name: c.name, typeLine: c.type_line, tags: c.tags ?? [], facets: f, cmc: Number(c.cmc ?? 0) };
  const already = ROLES.filter(r => cardRole(card, r));
  const entry = { name: c.name, rank: c.edhrec_rank, already, line: c.type_line };
  if (already.length) stolen.push(entry);
  else rescued.push(entry);
}

console.log(`\n${which}: ${chosen.what}`);
console.log(`over the ${TOP} most played cards\n`);

console.log(`CARDS IT WOULD RESCUE — no role at all today: ${rescued.length}`);
for (const e of rescued.sort((a, b) => a.rank - b.rank).slice(0, 40)) {
  console.log(`  #${String(e.rank).padStart(5)}  ${e.name.padEnd(34)}${e.line}`);
}

console.log(`\nCARDS THAT ALREADY HAVE A ROLE — it would compete, not rescue: ${stolen.length}`);
for (const e of stolen.sort((a, b) => a.rank - b.rank).slice(0, 30)) {
  console.log(`  #${String(e.rank).padStart(5)}  ${e.name.padEnd(34)}${e.already.join(',')}`);
}
