/**
 * Does the commander fit signal actually fire for Tutor, and how often.
 *
 *   deno run --allow-net --allow-read --allow-env scripts/tutor-fit-probe.ts
 *
 * `planFit` against `planForCommander` is the signal the optimiser ranks its
 * whole candidate pool on, and CLAUDE.md 10e records that it contributed
 * exactly zero to every optimiser suggestion for months because nothing fed it
 * facets. Tutor now reads it for one card at a time, and the same question has
 * to be asked before any claim is made about it: does it fire, and on what
 * fraction of the cards a player would ask about.
 *
 * The plan is built from the commander in the request body, with no database
 * read, exactly as `planForDeck` does it. The cards are read from the live
 * catalogue.
 *
 * WHAT A ZERO MEANS HERE. A card that matches nothing is not a bad card and is
 * not a bug. The plan is read off one card's rules text, so a commander the
 * compiler only half read produces a half plan, and the answer says so. What
 * this prints is the SIZE of that effect rather than an opinion about it.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { planForDeck, readRecord, fitFor } from '../supabase/functions/mtg-brain/answer/behaviour.ts';
import { normaliseDeckCards } from '../supabase/functions/mtg-brain/deck-context.ts';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
const COLUMNS =
  'name,type_line,oracle_text,mana_cost,cmc,keywords,power,toughness,layout,faces,color_identity,edhrec_rank';

const raw = JSON.parse(await Deno.readTextFile('scratch/tutor-decks.json'));

for (const key of ['0', '1']) {
  const summary = raw[key];
  const deckCards = normaliseDeckCards(
    (summary.cards ?? []).map((dc: Record<string, never>) => ({
      card_name: dc.card_name,
      quantity: dc.quantity,
      is_commander: dc.is_commander,
      is_sideboard: dc.is_sideboard,
      card_data: dc.card_data,
    })) as never
  );

  const plan = await planForDeck(deckCards, async name => {
    const { data } = await db.from("cards_unique").select("tags").ilike("name", name).limit(1);
    return data && data[0] ? { tags: (data[0] as { tags: string[] | null }).tags } : null;
  });
  console.log('='.repeat(78));
  console.log(`DECK ${summary.name}`);
  if (!plan) {
    console.log('  no commander in the list, so no plan');
    continue;
  }
  console.log(`  commander        ${plan.commanderName}`);
  console.log(`  reading          ${plan.standing}`);
  console.log(`  tribe            ${plan.plan.tribe ?? 'none'}`);
  console.log(`  wants            ${plan.plan.wants.length}`);
  for (const w of plan.plan.wants) {
    console.log(`    ${w.facet.padEnd(24)} ${w.weight.toFixed(2)}  ${w.because}`);
  }

  /* Every card in the deck itself. This is the question a player asks about a
     card they already run, and it is the honest denominator for "does the
     signal say anything about a real list". */
  let matched = 0;
  let unread = 0;
  const hits: string[] = [];
  for (const card of deckCards) {
    if (card.isCommander) continue;
    const record = await readRecord({
      name: card.name,
      type_line: card.typeLine,
      oracle_text: card.oracleText,
      mana_cost: card.manaCost,
      cmc: card.cmc,
    });
    if (record.standing === 'none' || record.standing === 'unread') unread++;
    const fit = fitFor(plan, record);
    if (fit.matches) {
      matched++;
      hits.push(`${card.name} (${fit.lines.join(' ')})`);
    }
  }
  const total = deckCards.filter(c => !c.isCommander).length;
  console.log(`\n  of ${total} noncommander cards in the list:`);
  console.log(`    ${matched} match at least one want`);
  console.log(`    ${unread} could not be read at all`);
  for (const h of hits.slice(0, 12)) console.log(`      ${h}`);
  if (hits.length > 12) console.log(`      ...and ${hits.length - 12} more`);

  /* And the wider question: over cards the deck could legally play but does
     not, how many would the signal say something about. This is what the
     answer is worth when somebody asks about a card they are considering. */
  const identity = (summary.identity ?? []) as string[];
  const { data, error } = await db
    .from('cards_unique')
    .select(COLUMNS)
    .eq('legalities->>commander', 'legal')
    .not('edhrec_rank', 'is', null)
    .order('edhrec_rank', { ascending: true })
    .limit(600);
  if (error) {
    console.log(`  candidate read failed: ${error.message}`);
    continue;
  }
  const inColour = ((data ?? []) as Record<string, never>[]).filter(r => {
    const ci = (r.color_identity ?? []) as string[];
    return ci.every(c => identity.includes(c));
  });
  let candMatched = 0;
  for (const row of inColour) {
    const record = await readRecord(row as never);
    if (fitFor(plan, record).matches) candMatched++;
  }
  console.log(
    `\n  of the ${inColour.length} most played cards inside ${identity.join('') || 'no colours'}: ` +
      `${candMatched} match at least one want (${((candMatched / Math.max(1, inColour.length)) * 100).toFixed(1)}%)`
  );
}
