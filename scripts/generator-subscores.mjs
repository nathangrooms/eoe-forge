/**
 * Grade the generator's own decks with the engine that grades a player's deck.
 *
 * The synergy audit answers "does this deck understand the commander". This
 * answers the other half, and the one a deck builder is actually judged on:
 * is the RESULT a good Commander deck? The ten subscores in
 * `engine/power/evidence.ts` are the vocabulary the product already uses to
 * tell a player what their deck is short of, so pointing them at our own
 * output costs nothing new and is the same standard.
 *
 * A dimension that is weak on ONE deck is that commander's problem. A
 * dimension weak across every commander is the generator's.
 *
 * WHAT IT FOUND FIRST TIME OUT, over ten commanders:
 *
 *   consistency 94   mana 93   castability 83   card advantage 76   speed 67
 *   interaction 55   resilience 50   SYNERGY 15   stax 8   TUTORS 3
 *
 * The last two are the story. Eight of ten decks contain no tutor at all, and
 * synergy averages 15 with three decks at zero — on the same decks the synergy
 * AUDIT scores at 84% keyed. That is not a contradiction, it is two different
 * definitions: `generator-synergy-audit.mjs` measures FACETS, the compiled
 * behaviour the generator ranks on, and this subscore measures shared TAGS.
 * The generator builds to one and the product grades on the other.
 *
 * LOCAL BUILD, like the synergy audit. Never quote it as production.
 *
 *   node --experimental-strip-types scripts/generator-subscores.mjs
 *   COMMANDERS=uril,edgar node --experimental-strip-types scripts/generator-subscores.mjs
 */
import { Catalog } from '../supabase/functions/ai-deck-builder-v2/catalog.ts';
import { build, ENGINE_VERSION } from '../supabase/functions/ai-deck-builder-v2/pipeline.ts';
import { computeDeckPower, entriesFromStoreCards } from '../src/lib/deck/powerAdapter.ts';
import { SUBSCORE_KEYS } from '../src/engine/power/evidence.ts';
import fs from 'node:fs';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON = fs.readFileSync('scratch/anon.txt', 'utf8').trim();
const KEYS = (process.env.COMMANDERS ?? 'adeline,nivmizzet,meren,teysa,ghalta,kozilek,uril,edgar,windgrace,gaaiv')
  .split(',').map(s => s.trim()).filter(Boolean);
const { ROSTER } = await import('./generator-roster.mjs');

console.log(`local build against ${ENGINE_VERSION}\n`);
const table = [];
for (const key of KEYS) {
  const entry = ROSTER.find(e => e.key === key);
  if (!entry) { console.log(`${key}: not in the roster`); continue; }
  const catalog = new Catalog({ url: SUPABASE_URL, anonKey: ANON, authorization: null });
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
  const store = deck.map(d => {
    const c = d.card ?? d;
    return { ...c, quantity: d.quantity ?? 1 };
  });
  /* THE COMMANDER GOES IN THE SECOND ARGUMENT, NOT AS A FLAG ON A CARD.
     `entriesFromStoreCards` decides `isCommander` from `card.category ===
     'commanders'` and nothing else, and its own comment says what happens
     otherwise: "colour identity and synergy evaluate against no commander at
     all". An earlier version of this file set `is_commander: true` on a card
     and reported synergy 0 for all ten decks, which was this harness and not
     the generator. */
  const cmd = result.body.result.commander?.card ?? result.body.result.commander ?? null;
  let power;
  try { power = computeDeckPower(entriesFromStoreCards(store, cmd), { format: 'commander' }); }
  catch (e) { console.log(`${entry.name}: could not score — ${String(e).slice(0,90)}`); continue; }
  table.push({ name: entry.name, score: power.score, subs: power.subscores });
}

const head = ['deck'.padEnd(26), 'pow'].concat(SUBSCORE_KEYS.map(k => k.slice(0, 5).padStart(6)));
console.log(head.join(' '));
for (const row of table) {
  const cells = SUBSCORE_KEYS.map(k => {
    const v = row.subs?.[k];
    return (typeof v === 'number' ? v.toFixed(0) : '—').padStart(6);
  });
  console.log(row.name.slice(0, 26).padEnd(26), String(row.score).padStart(3), cells.join(' '));
}
console.log('');
for (const k of SUBSCORE_KEYS) {
  const vals = table.map(r => r.subs?.[k]).filter(v => typeof v === 'number');
  if (!vals.length) { console.log(`${k.padEnd(15)} no values`); continue; }
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const bar = '#'.repeat(Math.max(0, Math.round(avg / 5)));
  console.log(`${k.padEnd(15)} avg ${avg.toFixed(2).padStart(5)}  ${bar}`);
}
