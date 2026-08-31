/**
 * Print the whole non-land list of a generated deck, grouped, so a person can
 * READ it. Not a score: the owner's point is that the scores do not settle it
 * and each commander is unique, so the only test that counts is a Magic player
 * looking at the ninety-nine.
 *
 *   node --experimental-strip-types scripts/generator-read-decks.mjs
 *   COMMANDERS=uril node --experimental-strip-types scripts/generator-read-decks.mjs
 */
import { Catalog } from '../supabase/functions/ai-deck-builder-v2/catalog.ts';
import { build } from '../supabase/functions/ai-deck-builder-v2/pipeline.ts';
import fs from 'node:fs';

const ANON = fs.readFileSync('scratch/anon.txt', 'utf8').trim();
const KEYS = (process.env.COMMANDERS ?? 'uril,nivmizzet,meren').split(',').map(s => s.trim());
const { ROSTER } = await import('./generator-roster.mjs');

for (const key of KEYS) {
  const entry = ROSTER.find(e => e.key === key);
  if (!entry) { console.log(`${key}: not in the roster`); continue; }
  const catalog = new Catalog({ url: 'https://udnaflcohfyljrsgqggy.supabase.co', anonKey: ANON, authorization: null });
  const result = await build({
    catalog,
    request: {
      commander: { id: entry.id, name: entry.name, type_line: entry.type_line,
        color_identity: entry.color_identity, colors: entry.colors },
      archetype: entry.archetype, style: entry.style, powerLevel: 7,
      useAIPlanning: false, includeLands: true,
    },
    apiKey: null, startedAt: Date.now(),
  });
  if (result.kind !== 'ok') { console.log(`${entry.name}: REFUSED ${result.error}`); continue; }
  const deck = result.body.result.deck;
  const nonland = deck.filter(c => !/land/i.test(c.type_line || ''));
  const lands = deck.length - nonland.length;
  console.log(`\n${'='.repeat(74)}\n${entry.name}  (${entry.archetype}/${entry.style})  ${nonland.length} spells + ${lands} lands`);
  console.log(`${'='.repeat(74)}`);
  const byRole = {};
  for (const c of nonland) (byRole[c.role || 'flex'] ??= []).push(c);
  for (const [role, cards] of Object.entries(byRole).sort((a,b)=>b[1].length-a[1].length)) {
    console.log(`\n-- ${role} (${cards.length})`);
    for (const c of cards.sort((a,b)=>(a.cmc??0)-(b.cmc??0))) {
      console.log(`   ${String(c.cmc ?? 0).padStart(2)}  ${(c.name||'').padEnd(30)} ${(c.type_line||'').split('—')[0].trim().slice(0,22).padEnd(23)} #${c.edhrec_rank ?? '-'}`);
    }
  }
}
