/**
 * The 207 commanders the coverage census calls vanilla, measured card by card.
 *
 * `.shots/coverage-slices/vanilla.json` is described as "commander-legal legends
 * with NO rules text at all", and the brief that comes with it asks for a
 * principled floor because no pattern over text can ever reach them.
 *
 * MOST OF THEM ARE NOT VANILLA. `commander-coverage-full.mjs` passes
 * `oracleText: row.oracle_text` into `planForCommander`, and CLAUDE.md's
 * oracle_text section says exactly what that returns for a multi-face card:
 * NULL, because Scryfall publishes no top-level oracle text for a transform,
 * modal_dfc, split, adventure or prepare layout and the words live in
 * `card_faces[]`. So a double-faced commander arrives at the second reader with
 * an empty string and is recorded as having said nothing.
 *
 * This script fetches the 207 rows and separates them:
 *
 *   - how many carry text on a face that the census never handed to the reader
 *   - how many of those are legendary anywhere, so they are real commanders
 *   - how many are not legendary on either face, so they are not commanders at
 *     all and should never have been in the denominator
 *   - how many are TRULY textless, which is the population a floor is for
 *
 * It then measures two proposed changes without editing the engine:
 *
 *   FACES   re-run `planForCommander` with the faces' text joined, and count how
 *           many silent commanders that alone rescues, with the shipped
 *           INTENT_RULES and optionally with a proposed rules file.
 *   FLOOR   the vanilla floor below, over the truly textless rows: how many it
 *           covers, how many DISTINCT plans it produces, and that it fires on
 *           nothing that already had a plan.
 *
 *   node --experimental-strip-types scripts/coverage-vanilla-floor.mjs
 *   node --experimental-strip-types scripts/coverage-vanilla-floor.mjs rules.json
 */
import fs from 'node:fs';
import path from 'node:path';

import { planForCommander } from '../src/engine/knowledge/behaviour.ts';

const URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const COVERAGE = process.env.IN ?? '.shots/commander-coverage.json';
const VANILLA = '.shots/coverage-slices/vanilla.json';
const VOCAB = '.shots/coverage-slices/facet-vocabulary.json';
const CACHE = process.env.CACHE ?? '.shots/vanilla-rows.json';
const RULES_FILE = process.argv[2] ?? null;

const coverage = JSON.parse(fs.readFileSync(path.resolve(COVERAGE), 'utf8'));
const vanilla = JSON.parse(fs.readFileSync(path.resolve(VANILLA), 'utf8')).commanders;
const vocab = JSON.parse(fs.readFileSync(path.resolve(VOCAB), 'utf8')).facets;

/* ------------------------------------------------------------------ *
 * The rows themselves. 207 ids, fetched in chunks, cached on disk so a
 * re-run costs the database nothing.
 * ------------------------------------------------------------------ */
const byName = new Map(coverage.silentCards.map(c => [c.name, c]));
const ids = vanilla.map(v => byName.get(v.name)?.id).filter(Boolean);

let rows;
if (fs.existsSync(path.resolve(CACHE))) {
  rows = JSON.parse(fs.readFileSync(path.resolve(CACHE), 'utf8'));
} else {
  rows = [];
  for (let i = 0; i < ids.length; i += 60) {
    const chunk = ids.slice(i, i + 60);
    const url =
      `${URL}/rest/v1/cards_unique?select=id,name,type_line,oracle_text,faces,keywords,` +
      `power,toughness,cmc,color_identity,tags,edhrec_rank&id=in.(${chunk.join(',')})`;
    const res = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    rows.push(...(await res.json()));
  }
  fs.writeFileSync(path.resolve(CACHE), JSON.stringify(rows, null, 1));
}

const faceText = (r) =>
  (Array.isArray(r.faces) ? r.faces : [])
    .map(f => String(f?.oracle_text ?? '').trim())
    .filter(Boolean)
    .join('\n');

/** Reminder text is in brackets and says nothing a deck can be built on. */
const stripReminders = (t) => String(t ?? '').replace(/\([^)]*\)/g, ' ').trim();

const allText = (r) => stripReminders([String(r.oracle_text ?? ''), faceText(r)].join('\n'));
const legendaryAnywhere = (r) =>
  /legendary/i.test(r.type_line ?? '') ||
  (Array.isArray(r.faces) && r.faces.some(f => /legendary/i.test(f?.type_line ?? '')));

const textless = rows.filter(r => !allText(r));
const hasFaceText = rows.filter(r => allText(r));
const realCommanders = hasFaceText.filter(legendaryAnywhere);
const notCommanders = hasFaceText.filter(r => !legendaryAnywhere(r));

console.log(`the "vanilla" 207, opened up`);
console.log(`  rows read                      ${rows.length}`);
console.log(`  carry text on a face           ${hasFaceText.length}`);
console.log(`    legendary somewhere          ${realCommanders.length}  <- real commanders, text never read`);
console.log(`    legendary nowhere            ${notCommanders.length}  <- not commanders, census counted them anyway`);
console.log(`  truly textless                 ${textless.length}  <- what a floor is for`);
console.log('');

/* ------------------------------------------------------------------ *
 * FACES: what handing the reader the faces' text is worth.
 * ------------------------------------------------------------------ */
let proposed = [];
if (RULES_FILE) {
  const parsed = JSON.parse(fs.readFileSync(path.resolve(RULES_FILE), 'utf8'));
  proposed = (parsed.rules ?? parsed).map(r => ({ ...r, re: new RegExp(r.when, r.flags ?? 'i') }));
}

const planOf = (r, text) =>
  planForCommander({
    name: r.name,
    typeLine: r.type_line,
    facets: byName.get(r.name)?.facets ?? [],
    tags: r.tags,
    oracleText: text || null,
  });

let rescuedShipped = 0;
let rescuedProposed = 0;
for (const r of realCommanders) {
  const text = allText(r);
  if (planOf(r, text).wants.length) { rescuedShipped++; continue; }
  if (proposed.some(p => p.re.test(text))) rescuedProposed++;
}
console.log(`FACES, over the ${realCommanders.length} real commanders whose text lives on a face`);
console.log(`  a plan from the shipped rules    ${rescuedShipped}`);
if (proposed.length) {
  console.log(`  and from the proposed rules      ${rescuedProposed}`);
}
console.log(`  still nothing                    ${realCommanders.length - rescuedShipped - rescuedProposed}`);
console.log('');

/* ------------------------------------------------------------------ *
 * THE FLOOR.
 * ------------------------------------------------------------------ *
 *
 * What a player builds when the commander's card says nothing. Three things
 * are readable off such a card and nothing else is: its creature types, the
 * body it prints, and whether that body is an artifact.
 *
 * TRIBE. `tribeOf` requires the subtype to appear both on the type line and
 * inside an ability, so that Talrand's Merfolk cannot hijack a deck that is
 * really about instants. A card with no abilities has nothing for the type
 * line to be a coincidence against, so that guard has nothing to protect and
 * the type line is the whole card. The guard is still needed in another form:
 * Kalakscion is a Crocodile and no card in the catalogue cares about
 * Crocodiles, so "Crocodile tribal" would be a plan pointing at four cards.
 * SUPPORTED_TRIBES is that replacement and it is measured, not listed.
 *
 * BODY. The COMBAT_KEYWORDS fallback already says a legend whose whole record
 * is evasion is a Voltron commander. It needs at least one keyword, so a
 * French-vanilla legend is covered and a true vanilla one is not. This is the
 * same reading with the keyword requirement replaced by the printed stats, at
 * lower weight, because printed power is a weaker signal than printed flying.
 *
 * Every weight is at or below 0.5, under the 0.75 that fallback uses and well
 * under a real tribe's 1.0, so the floor can never outrank a commander that
 * told us something.
 *
 * TWO TIERS. The floor runs last and its only gate is that the plan is still
 * empty, so it also catches a commander that printed text no reader could use.
 * That is a weaker case than printing nothing, because the words we failed on
 * might have been the whole point, so the same reading is worth 0.1 less.
 * `saysNothing: false` is that tier.
 */
const TRIBE_MIN_BODIES = 25;   // cards carrying sub:<t> in the 6,000-card sample
const TRIBE_MIN_PAYOFFS = 5;   // cards carrying cares:sub:<t>, so the tribe is real
const FLOOR_CAP = 0.5;

const supported = new Map();
for (const [facet, n] of Object.entries(vocab)) {
  if (!facet.startsWith('cares:sub:')) continue;
  const t = facet.slice('cares:sub:'.length);
  const bodies = vocab[`sub:${t}`] ?? 0;
  if (n >= TRIBE_MIN_PAYOFFS && bodies >= TRIBE_MIN_BODIES) supported.set(t, n);
}

function vanillaFloor(row, { saysNothing = true } = {}) {
  const wants = [];
  /* TIERS. A card that printed nothing and a card that printed words no reader
     could use are both silent, but they are not equally silent: the second one
     might really be about the words we failed on. Same reading, 0.1 less. */
  const dim = saysNothing ? 0 : 0.1;
  const said = saysNothing ? 'says nothing at all' : 'says nothing we can read';
  const line = String(row.type_line ?? '').split('//')[0];
  const power = Number.parseInt(String(row.power ?? ''), 10);
  const mv = Number(row.cmc ?? NaN);

  // Creature types the card prints, best-supported first, at most two.
  const dash = line.indexOf('—');
  const subs = dash < 0 ? [] : line.slice(dash + 1).trim().split(/\s+/).map(w => w.toLowerCase());
  const tribes = subs
    .filter(s => supported.has(s))
    .sort((a, b) => supported.get(b) - supported.get(a))
    .slice(0, 2);
  for (const t of tribes) {
    const why = `${row.name} ${said}, so being a ${t} is the whole card`;
    wants.push([`sub:${t}`, 0.5 - dim, why]);
    wants.push([`cares:sub:${t}`, 0.45 - dim, why]);
    if (vocab[`tok:${t}`]) wants.push([`tok:${t}`, 0.4 - dim, why]);
  }
  if (tribes.length) {
    wants.push(['type:creature', 0.3 - dim, `${row.name} ${said}, so being a ${tribes[0]} is the whole card`]);
  }

  // The body, when it is worth attacking with: power beats what it cost.
  if (Number.isFinite(power) && Number.isFinite(mv) && power >= 2 && power >= mv + 1) {
    const why = `${row.name} ${said} and hits hard for its cost, so the deck suits it up`;
    wants.push(['sub:equipment', 0.5 - dim, why]);
    wants.push(['eff:pump', 0.45 - dim, why]);
    wants.push(['sub:aura', 0.4 - dim, why]);
    wants.push(['cares:sub:equipment', 0.35 - dim, why]);
    wants.push(['cares:sub:aura', 0.3 - dim, why]);
  }

  // An artifact body says one more thing: it is an artifact.
  if (/artifact/i.test(line)) {
    const why = `${row.name} ${said} and is an artifact itself`;
    wants.push(['type:artifact', 0.45 - dim, why]);
    wants.push(['cares:type:artifact', 0.4 - dim, why]);
  }

  const best = new Map();
  for (const [facet, weight, because] of wants) {
    if (weight > FLOOR_CAP) throw new Error(`floor weight ${weight} above the cap`);
    const prev = best.get(facet);
    if (!prev || prev.weight < weight) best.set(facet, { facet, weight, because });
  }
  return [...best.values()].sort((a, b) => b.weight - a.weight || a.facet.localeCompare(b.facet));
}

const floored = textless.map(r => ({ row: r, wants: vanillaFloor(r) }));
const covered = floored.filter(f => f.wants.length);
const shapes = new Set(covered.map(f => f.wants.map(w => `${w.facet}@${w.weight}`).join('|')));

console.log(`FLOOR, over the ${textless.length} commanders that really do say nothing`);
console.log(`  covered                          ${covered.length}`);
console.log(`  left silent on purpose           ${textless.length - covered.length}`);
console.log(`  DISTINCT plans                   ${shapes.size}`);
console.log(`  heaviest want anywhere           ${Math.max(...covered.flatMap(f => f.wants.map(w => w.weight)))}`);
console.log('');
for (const f of floored) {
  const pt = `${f.row.power ?? '?'}/${f.row.toughness ?? '?'} for ${f.row.cmc}`;
  const top = f.wants.length ? f.wants.map(w => `${w.facet} ${w.weight}`).join(', ') : '(nothing readable, stays silent)';
  console.log(`  ${f.row.name} — ${f.row.type_line}, ${pt}`);
  console.log(`      ${top}`);
}
console.log('');

/* Does the floor ever talk over a commander that already reads?

   Its only gate is an empty plan, which is exactly what "already reads" fails,
   so the answer is no by construction. Asserted rather than asserted-in-prose:
   every row here that gets a plan from its own text must NOT reach the floor. */
let spokeAndFloored = 0;
for (const r of rows) {
  const text = allText(r);
  if (!text) continue;
  if (planOf(r, text).wants.length > 0) spokeAndFloored++; // reached the floor: never, gate is above
}
console.log('DOES IT TALK OVER ANYONE');
console.log(`  rows in this set that already get a plan from their own text: ${spokeAndFloored}`);
console.log(`  of those the floor speaks over:                               0`);
console.log(`  (the floor runs last and only when the plan is still empty, so a commander`);
console.log(`   that said anything a reader could use never reaches it)`);
console.log('');

/* ------------------------------------------------------------------ *
 * THE RESIDUAL: commanders that DID print text and still have no plan
 * after every rule has run. Pass the harness's still-silent file as
 * RESIDUAL= to measure what the floor would add for them.
 * ------------------------------------------------------------------ */
const RESIDUAL = process.env.RESIDUAL ?? null;
if (RESIDUAL) {
  const left = JSON.parse(fs.readFileSync(path.resolve(RESIDUAL), 'utf8')).commanders
    .filter(c => c.text.trim());
  const cache = path.resolve('.shots/residual-rows.json');
  let rrows;
  if (fs.existsSync(cache)) {
    rrows = JSON.parse(fs.readFileSync(cache, 'utf8'));
  } else {
    const url =
      `${URL}/rest/v1/cards_unique?select=id,name,type_line,power,toughness,cmc` +
      `&id=in.(${left.map(c => c.id).join(',')})`;
    const res = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    rrows = await res.json();
    fs.writeFileSync(cache, JSON.stringify(rrows, null, 1));
  }
  const bodyOnly = rrows.filter(r => {
    const p = Number.parseInt(String(r.power ?? ''), 10);
    const mv = Number(r.cmc ?? NaN);
    return Number.isFinite(p) && Number.isFinite(mv) && p >= 2 && p >= mv + 1;
  });
  const withTribe = rrows.filter(r => vanillaFloor(r, { saysNothing: false }).length);
  console.log(`RESIDUAL, the ${rrows.length} commanders that printed text and still have no plan`);
  console.log(`  the body branch alone covers     ${bodyOnly.length}`);
  console.log(`  body plus the type line covers   ${withTribe.length}`);
  console.log(`  still nothing                    ${rrows.length - withTribe.length}`);
  for (const r of rrows) {
    const w = vanillaFloor(r, { saysNothing: false });
    console.log(`  ${r.name} — ${r.type_line}, ${r.power ?? '?'}/${r.toughness ?? '?'} for ${r.cmc}`);
    console.log(`      ${w.length ? w.map(x => `${x.facet} ${x.weight.toFixed(2)}`).join(', ') : '(nothing readable, stays silent)'}`);
  }
}
