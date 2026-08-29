/**
 * ADVERSARIAL RE-RUN of the fifty, against the REPO's answerer, capturing the
 * FULL text of every answer.
 *
 *   deno run --allow-net --allow-read --allow-write --allow-env \
 *     scripts/tutor-refute-fifty.ts --json=scratch/refute-fifty.json
 *
 * WHY THIS EXISTS AND NOT `tutor-fifty-repo.ts`
 * --------------------------------------------
 * That harness records the FIRST LINE of each answer. The question this review
 * has to settle is whether anything that used to refuse now states something
 * false, and a first line cannot show that: the wrong fact is in the body. So
 * this one keeps every character, and it also keeps the routing fields so the
 * two harnesses can be compared row for row.
 *
 * It shares the deck fixture and the enrich() mapping with the other harness on
 * purpose. The deck bodies are what `Tutor.tsx` sends and inventing a second
 * shape here would test something the product never does.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { answerFromCatalogue } from '../supabase/functions/mtg-brain/answer/index.ts';
import { normaliseDeckCards } from '../supabase/functions/mtg-brain/deck-context.ts';
import { looksWrong } from '../supabase/functions/mtg-brain/answer/voice.ts';

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
        card_data: dc.card_data
          ? {
              type_line: d.type_line ?? undefined,
              mana_cost: d.mana_cost ?? undefined,
              oracle_text: d.oracle_text ?? undefined,
              cmc: d.cmc ?? undefined,
              produced_mana: d.produced_mana ?? undefined,
              prices: d.prices ?? undefined,
              edhrec_rank: d.edhrec_rank ?? undefined,
            }
          : undefined,
      };
    }),
  };
}

const raw = JSON.parse(await Deno.readTextFile('scratch/tutor-decks.json'));
const DECKS: Record<string, ReturnType<typeof enrich> | null> = {
  atraxa: enrich(raw['0']),
  ulamog: enrich(raw['1']),
};

const fifty = JSON.parse(await Deno.readTextFile('scripts/tutor-fifty.json'));

const rows: Record<string, unknown>[] = [];

for (const q of fifty.questions) {
  const deckContext = q.deck ? DECKS[q.deck] ?? null : null;
  const deckCards = normaliseDeckCards(deckContext?.cards as never);
  const identity = ((deckContext?.identity ?? deckContext?.colors ?? []) as string[]).filter(c =>
    'WUBRG'.includes(c)
  );

  const started = performance.now();
  const worked = await answerFromCatalogue({
    message: q.q,
    deckContext,
    deckCards,
    identity,
    db,
    userDb: null,
  });
  const ms = Math.round(performance.now() - started);

  rows.push({
    id: q.id,
    q: q.q,
    deck: q.deck ?? null,
    ask: worked?.routing.ask ?? null,
    subject: worked?.routing.subject ?? null,
    gap: worked?.routing.gap ?? null,
    standing: worked ? worked.standing : 'nothing',
    basis: worked?.basis ?? [],
    cards: worked?.cards.map((c: Record<string, unknown>) => c.name) ?? [],
    ms,
    chars: worked?.message.length ?? 0,
    faults: worked ? looksWrong(worked.message) : [],
    message: worked?.message ?? null,
  });
  console.log(`${q.id}  ${worked ? worked.standing : 'nothing'}  ${ms} ms`);
}

const out = Deno.args.find(a => a.startsWith('--json='));
if (out) {
  await Deno.writeTextFile(out.slice('--json='.length), JSON.stringify(rows, null, 2));
  console.log(`written to ${out.slice('--json='.length)}`);
}
