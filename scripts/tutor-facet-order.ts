/**
 * The raw facets behind the phrases, so an order can be chosen rather than
 * inherited from the alphabet.
 *
 *   node --experimental-strip-types scripts/tutor-facet-order.ts
 *
 * `facetsForCard` returns a card's facets sorted, which is right for comparing
 * two cards and wrong for reading one out loud: Wrath of God comes back as
 * "about creatures; destroys; hits everything at once", leading with the filter
 * instead of the verb. This prints the facets themselves next to the phrases so
 * the ordering rule in `answer/behaviour.ts` is chosen against real cards.
 */

import { facetsForCard } from '../src/lib/deck/recommend/behaviour.ts';
import { describeSharedFacets } from '../src/engine/knowledge/behaviour.ts';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const COLUMNS =
  'id,oracle_id,name,type_line,oracle_text,mana_cost,cmc,keywords,power,toughness,layout,faces';

const NAMES = process.argv.slice(2).filter(a => !a.startsWith('--'));
const DEFAULT = [
  'Sol Ring',
  'Wrath of God',
  'Rhystic Study',
  'Smothering Tithe',
  'Doubling Season',
  'Cyclonic Rift',
  'Swords to Plowshares',
  'Craterhoof Behemoth',
  'Esper Sentinel',
  'Krenko, Mob Boss',
  "Atraxa, Praetors' Voice",
  'Blood Artist',
  'Cultivate',
  'Counterspell',
];

for (const name of NAMES.length ? NAMES : DEFAULT) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/cards_unique?select=${COLUMNS}&name=eq.${encodeURIComponent(name)}&limit=1`,
    { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } }
  );
  const rows = (await res.json()) as Record<string, unknown>[];
  if (!rows.length) {
    console.log(`${name}: not in the catalogue\n`);
    continue;
  }
  const r = facetsForCard(rows[0] as never);
  console.log(`${name}  [${r.source}, coverage=${r.coverage}]`);
  console.log(`  facets : ${r.facets.join(' ')}`);
  console.log(`  phrases: ${describeSharedFacets(r.facets, 6).join('; ') || '(none)'}`);
  console.log();
}
