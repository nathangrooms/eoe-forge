/**
 * Why is THIS card not in the deck the generator built for THIS commander?
 *
 * The audit says which staples are missing. It cannot say why, and the answer
 * has been different every time: a facet the compiler never produced, a role
 * quota already full, a colour cap, a rank the pool never reached. Guessing
 * between those has cost more time than any of the fixes.
 *
 * So this asks the engine directly, for one card at a time, and prints every
 * gate it passed or failed in the order the builder applies them.
 *
 *   node --experimental-strip-types scripts/why-not-in-deck.mjs meren "Village Rites" "Swiftfoot Boots"
 *
 * Reads the live catalogue. Writes nothing.
 */
import process from 'node:process';

import { Catalog } from '../supabase/functions/ai-deck-builder-v2/catalog.ts';
import { planForCommander, planFit } from '../src/engine/knowledge/behaviour.ts';
import { cardRole, ROLES } from '../src/engine/index.ts';
import { facetsForCard } from '../src/lib/deck/recommend/behaviour.ts';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const { ROSTER } = await import('./generator-roster.mjs');

const key = process.argv[2];
const wanted = process.argv.slice(3);
if (!key || !wanted.length) {
  console.log('usage: why-not-in-deck.mjs <roster-key> "Card Name" ["Another Card"]');
  process.exit(1);
}

const entry = ROSTER.find(e => e.key === key);
if (!entry) {
  console.log(`${key} is not in the roster. Keys: ${ROSTER.map(e => e.key).join(', ')}`);
  process.exit(1);
}

const rest = async (path) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
};

/* BY NAME, never by the roster's printing id. `cards_unique` holds ONE printing
   per card, the cheapest, so a printing id taken from `cards` is usually not in
   it — and a commander that fetches nothing gets an empty plan, every card
   scores zero fit, and the probe reports the engine as broken when the lookup
   was. CLAUDE.md records this costing a day. */
const [cmdRow] = await rest(
  `cards_unique?select=*&name=eq.${encodeURIComponent(entry.name)}&limit=1`
);
if (!cmdRow) throw new Error(`${entry.name} is not in cards_unique`);

const cmdFacets = facetsForCard(cmdRow);
const plan = planForCommander({
  name: cmdRow.name,
  typeLine: cmdRow.type_line,
  facets: cmdFacets.facets,
  tags: cmdRow.tags,
  oracleText: cmdRow.oracle_text,
  faces: cmdRow.faces,
});

console.log(`\n${cmdRow.name}`);
console.log(`  colour identity  ${(cmdRow.color_identity ?? []).join('') || 'colourless'}`);
console.log(`  the plan wants   ${plan.wants.length} things:`);
for (const w of plan.wants) console.log(`      ${w.weight.toFixed(2)}  ${w.facet}`);

for (const name of wanted) {
  const [row] = await rest(`cards_pool?select=*&name=eq.${encodeURIComponent(name)}&limit=1`);
  console.log(`\n--- ${name}`);
  if (!row) {
    console.log('  NOT IN cards_pool AT ALL. Either the name is wrong or the card is not commander legal.');
    continue;
  }

  const identity = row.color_identity ?? [];
  const cmdIdentity = new Set(cmdRow.color_identity ?? []);
  const castable = identity.every(c => cmdIdentity.has(c));

  console.log(`  rank             ${row.edhrec_rank ?? 'none'}`);
  console.log(`  colour identity  ${identity.join('') || 'colourless'}   ${castable ? 'legal in this deck' : 'ILLEGAL in this deck'}`);
  console.log(`  commander legal  ${row.commander_legal}`);
  console.log(`  facets           ${(row.facets ?? []).join(' ') || 'NONE — the ranker reads this as a card that does nothing'}`);
  console.log(`  tags             ${(row.tags ?? []).join(' ')}`);

  /* The shape `cardRole` and `planFit` expect: camelCase, and `facets` from the
     pool rather than recompiled, so this measures what the generator sees. */
  const card = {
    id: row.id,
    oracleId: row.oracle_id,
    name: row.name,
    typeLine: row.type_line,
    cmc: Number(row.cmc ?? 0),
    colorIdentity: identity,
    tags: row.tags ?? [],
    facets: row.facets ?? [],
    edhrecRank: row.edhrec_rank ?? null,
    manaCost: row.mana_cost ?? null,
    usd: row.usd ? Number(row.usd) : null,
  };

  const roles = ROLES.filter(r => cardRole(card, r));
  console.log(`  roles it serves  ${roles.join(', ') || 'NONE — only the reserved commander slots can reach it'}`);

  const fit = planFit(plan, card);
  console.log(`  commander fit    ${fit.fit.toFixed(3)}${fit.fit >= 0.45 ? '  (above the reserved-slot floor of 0.45)' : '  (BELOW the reserved-slot floor of 0.45)'}`);
  for (const m of fit.matched ?? []) console.log(`      matched ${m.facet ?? ''} ${m.because ?? ''}`);
}

void Catalog;
