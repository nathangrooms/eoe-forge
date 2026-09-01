/**
 * Which ROLE did every card in a generated deck fill, and did it also serve the
 * commander's plan?
 *
 *   node --experimental-strip-types scripts/probe/vondam-slots.mjs
 *   COMMANDER="Meren of Clan Nel Toth" CI=BG node --experimental-strip-types ...
 *
 * The deck audit says which staples are missing and `why-not-in-deck` says why
 * one card is absent. Neither answers the question the owner's complaint
 * actually raises, which is "what did the deck spend its slots ON".
 *
 * That matters because the role floors sum to 48 of 57 nonland slots. If those
 * 48 are filled by cards that happen to serve the commander too, the deck is
 * themed and the floors cost nothing. If they are filled by generically good
 * cards, the theme only ever gets the 8 reserved slots and the deck reads as
 * "good cards in these colours" — which is exactly the complaint.
 *
 * Builds LOCALLY, which is right for iterating on the ranker and wrong for
 * judging the product. Use `vondam-score.mjs` against the deployed function for
 * that.
 */
import process from 'node:process';

import { Catalog } from '../../supabase/functions/ai-deck-builder-v2/catalog.ts';
import { build } from '../../supabase/functions/ai-deck-builder-v2/pipeline.ts';
import { planForCommander, planFit } from '../../src/engine/knowledge/behaviour.ts';
import { cardRole, ROLES } from '../../src/engine/index.ts';
import { facetsForCard } from '../../src/lib/deck/recommend/behaviour.ts';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON = (await import('node:fs')).readFileSync(
  new URL('../../scratch/anon.txt', import.meta.url), 'utf8').trim();

const NAME = process.env.COMMANDER ?? 'Syr Vondam, Sunstar Exemplar';
const CI = (process.env.CI ?? 'WB').split('');

const catalog = new Catalog({ url: SUPABASE_URL, anonKey: ANON, authorization: null });

/* BY NAME, never by a hardcoded printing id. `cards_unique` holds the CHEAPEST
   printing, so an id copied from `cards` is usually not in it — the mistake
   that made an audit report "keyed 23%" for a commander who is at 79%. */
const rows = await catalog.cardsByName([NAME], 'commander');
const raw = rows?.[0] ?? rows?.get?.(NAME);
if (!raw) {
  console.error(`commander not found: ${NAME}`);
  process.exit(1);
}
/* planForCommander reads oracleText, camelCase; PostgREST returns oracle_text. */
const commander = { ...raw, oracleText: raw.oracle_text ?? raw.oracleText ?? null,
  typeLine: raw.type_line ?? raw.typeLine ?? null };

const plan = planForCommander(commander);
const wants = (plan?.wants ?? []).map(w => ({ facet: String(w.facet), weight: w.weight }));

console.log(`\n${NAME}`);
console.log(`wants: ${wants.slice(0, 8).map(w => `${w.facet}@${w.weight}`).join('  ')}\n`);

const started = Date.now();
const out = await build({
  catalog,
  request: {
    commander: { name: NAME, type_line: 'Legendary Creature',
                 color_identity: CI, colors: CI },
    powerLevel: 7, useAIPlanning: false, includeLands: true,
  },
  apiKey: null,
  startedAt: started,
});
if (out.kind !== 'ok') { console.error('REFUSED: ' + out.error); process.exit(1); }
const res = out.body.result;

for (const l of (res?.changeLog ?? [])) console.log('  LOG  ' + l);
console.log();
const entries = res?.deck ?? [];
const deck = entries.map(d => d.card ?? d);
const bucketOf = new Map(entries.map(d => [(d.card ?? d).name, d.bucket ?? '?']));
console.log('RESERVED (bucket=commander):');
for (const e of entries.filter(d => d.bucket === 'commander'))
  console.log('    ' + ((e.card ?? e).name));
console.log();
const nonland = deck.filter(c => !String(c.type_line ?? c.typeLine ?? '').toLowerCase().includes('land'));

const FIT_FLOOR = 0.45;
let onTheme = 0;
const byRole = new Map();

for (const c of nonland) {
  const card = { ...c, oracleText: c.oracle_text ?? c.oracleText ?? null,
    typeLine: c.type_line ?? c.typeLine ?? null };
  const f = card.facets ?? facetsForCard(card)?.facets ?? [];
  const withFacets = { ...card, facets: f };
  const roles = ROLES.filter(r => cardRole(withFacets, r));
  const hit = planFit(plan, withFacets);
  const fit = typeof hit === 'number' ? hit : (hit?.fit ?? 0);
  const themed = fit >= FIT_FLOOR;
  if (themed) onTheme++;
  const key = roles.length ? roles.join('+') : '(no role)';
  if (!byRole.has(key)) byRole.set(key, []);
  byRole.get(key).push({ name: card.name, rank: card.edhrec_rank ?? null, fit, themed });
}

console.log(`${nonland.length} nonland cards. ${onTheme} serve the commander at fit >= ${FIT_FLOOR} ` +
  `(${((onTheme / nonland.length) * 100).toFixed(0)}%)\n`);

const rows2 = [...byRole.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [role, cards] of rows2) {
  const themed = cards.filter(c => c.themed).length;
  console.log(`  ${role.padEnd(24)} ${String(cards.length).padStart(2)} cards, ${themed} on theme`);
  for (const c of cards.sort((a, b) => b.fit - a.fit)) {
    console.log(`      ${c.themed ? '*' : ' '} ${c.fit.toFixed(3)}  ${String(c.rank ?? '-').padStart(6)}  ${c.name}`);
  }
}

/* The question behind the complaint: of the slots the FLOORS claimed, how many
   went to a card that also serves the commander? */
const floorRoles = ['ramp', 'draw', 'removal', 'interaction', 'tutor', 'enhance', 'protection', 'wincon'];
let floorSlots = 0, floorThemed = 0;
for (const [role, cards] of byRole) {
  if (role === '(no role)') continue;
  if (!floorRoles.some(r => role.includes(r))) continue;
  floorSlots += cards.length;
  floorThemed += cards.filter(c => c.themed).length;
}
console.log(`\n  THE FLOORS: ${floorSlots} slots, ${floorThemed} of them on theme ` +
  `(${floorSlots ? ((floorThemed / floorSlots) * 100).toFixed(0) : 0}%)`);
console.log(`  If that percentage is low, the deck is generic BECAUSE the floors`);
console.log(`  were filled without preferring the cards that also fit.`);
