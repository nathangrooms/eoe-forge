/**
 * Second adversarial pass: the sentences the review said were fixed, and the
 * phrasings that route AROUND the ask that fixes them.
 *
 *   deno run --allow-net --allow-read --allow-env scripts/tutor-refute-probe3.ts
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { answerFromCatalogue } from '../supabase/functions/mtg-brain/answer/index.ts';
import { normaliseDeckCards } from '../supabase/functions/mtg-brain/deck-context.ts';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });

function enrich(summary: Record<string, unknown>) {
  const cards = (summary.cards ?? []) as Record<string, never>[];
  return {
    ...summary,
    cards: cards.map((dc: Record<string, never>) => {
      const d = (dc.card_data ?? {}) as Record<string, never>;
      return {
        name: dc.card_name,
        quantity: dc.quantity || 1,
        is_commander: dc.is_commander,
        is_sideboard: dc.is_sideboard,
        type_line: d.type_line ?? undefined,
        mana_cost: d.mana_cost ?? undefined,
        cmc: d.cmc ?? undefined,
        oracle_text: d.oracle_text ?? undefined,
        produced_mana: d.produced_mana ?? undefined,
        card_data: dc.card_data ? { ...d } : undefined,
      };
    }),
  };
}

const raw = JSON.parse(await Deno.readTextFile('scratch/tutor-decks.json'));
const DECKS: Record<string, ReturnType<typeof enrich> | null> = {
  atraxa: enrich(raw['0']),
  none: null,
};

const CASES: { q: string; deck: keyof typeof DECKS; why: string }[] = [
  { q: 'Is Sol Ring legal in commander?', deck: 'none', why: 'the "(one copy only)" line' },
  { q: 'Is it ok to have two Sol Rings in my deck?', deck: 'atraxa', why: 'a copies question without the word copies' },
  { q: 'Can I put another Sol Ring in?', deck: 'atraxa', why: 'a copies question with no number' },
  { q: 'Sol Ring x2 in commander, yes or no?', deck: 'atraxa', why: 'shorthand' },
  { q: 'How many Shadowborn Apostles can I run in commander?', deck: 'none', why: 'plural of an any-number card' },
  { q: 'Can I run 30 Shadowborn Apostle in my commander deck?', deck: 'none', why: 'the card says any number' },
  { q: 'How many copies of Nazgul can I play in commander?', deck: 'none', why: 'nine, and the name has no diacritic here' },
  { q: 'Can I play more than one Wastes in commander?', deck: 'none', why: 'Wastes is basic and not in every exception table' },
  { q: 'How many copies of Snow-Covered Island can I run in commander?', deck: 'none', why: 'a basic land with a prefix' },
  { q: 'What is the best black removal spell under one dollar?', deck: 'none', why: 'the best-of budget path, timing' },
  { q: 'What is the best white removal spell under two dollars?', deck: 'none', why: 'the budget path in another colour' },
  { q: 'What are the best 3 mana counterspells in commander?', deck: 'none', why: 'a count that is a count' },
  { q: 'Are there any combos in my deck?', deck: 'atraxa', why: 'the deck-wide combo refusal' },
  { q: 'What is a cheaper alternative to Smothering Tithe?', deck: 'none', why: 'the missing colour filter' },
];

for (const c of CASES) {
  const deckContext = DECKS[c.deck];
  const deckCards = normaliseDeckCards(deckContext?.cards as never);
  const identity = ((deckContext?.identity ?? []) as string[]).filter(x => 'WUBRG'.includes(x));
  const t = performance.now();
  const worked = await answerFromCatalogue({
    message: c.q,
    deckContext,
    deckCards,
    identity,
    db,
    userDb: null,
  });
  const ms = Math.round(performance.now() - t);
  console.log('='.repeat(78));
  console.log(`${c.q}\n  deck=${c.deck} ask=${worked?.routing.ask ?? '-'} standing=${worked ? worked.standing : 'nothing'} ${ms}ms   (${c.why})`);
  console.log('-'.repeat(78));
  console.log(worked?.message ?? '(nothing)');
}
