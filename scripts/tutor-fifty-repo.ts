/**
 * The fifty questions, put to the REPO's answerer, against the live catalogue.
 *
 *   deno run --allow-net --allow-read --allow-env scripts/tutor-fifty-repo.ts
 *   deno run ... scripts/tutor-fifty-repo.ts --json=scratch/fifty-after.json
 *   deno run ... scripts/tutor-fifty-repo.ts --diff=scratch/fifty-before.json
 *
 * WHY A THIRD HARNESS, AND WHAT EACH OF THE THREE IS FOR
 * -----------------------------------------------------
 * `tutor-fifty-run.mjs`  posts to the DEPLOYED function. It is the only one of
 *                        the three that says what a player gets today, and it
 *                        is useless for work that has not been deployed.
 * `tutor-engine-probe.ts` runs the repo's answerer over a hand-picked case list
 *                        chosen to exercise one change.
 * this one               runs the repo's answerer over ALL FIFTY, every time,
 *                        and can diff itself against a previous run.
 *
 * The third exists because of a specific instruction: report routing and
 * standing after every change, so a change that helps one question and breaks
 * another is visible rather than netted out. A total that went from 22 to 24
 * hides a swap. A per-question diff does not.
 *
 * Signed out, so "which of your decks play this" answers as signed out. That
 * changes no routing and is recorded here rather than left to be discovered.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { answerFromCatalogue } from '../supabase/functions/mtg-brain/answer/index.ts';
import { normaliseDeckCards } from '../supabase/functions/mtg-brain/deck-context.ts';
import { looksWrong } from '../supabase/functions/mtg-brain/answer/voice.ts';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });

/** The page's own mapping, `generateResponse` in Tutor.tsx, field for field. */
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

/* `--questions=` so the thirty later questions run through this same harness.
   A second harness asking the same answerer a slightly different way is how two
   scores stop being comparable. */
const askFile =
  Deno.args.find(a => a.startsWith('--questions='))?.slice('--questions='.length) ??
  'scripts/tutor-fifty.json';
const fifty = JSON.parse(await Deno.readTextFile(askFile));

interface Row {
  id: string;
  q: string;
  deck: string | null;
  ask: string | null;
  subject: string | null;
  cue: string | null;
  gap: string | null;
  standing: string;
  basis: string[];
  cards: number;
  ms: number;
  chars: number;
  /** The first line of the answer, so a diff shows what actually moved. */
  head: string;
  faults: string[];
}

const rows: Row[] = [];

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

  /* An answer this harness never produced is not the same as a refusal, and the
     player sees a different thing for each: `null` falls through to
     `nothingToAnswerWith`, which is the stock paragraph the review counted 22
     times. It is recorded as its own standing rather than folded into refused. */
  const faults = worked
    ? looksWrong(worked.message).filter(f => f !== 'em dash')
    : [];

  rows.push({
    id: q.id,
    q: q.q,
    deck: q.deck ?? null,
    ask: worked?.routing.ask ?? null,
    subject: worked?.routing.subject ?? null,
    cue: worked?.routing.cue ?? null,
    gap: worked?.routing.gap ?? null,
    standing: worked ? worked.standing : 'nothing',
    basis: worked?.basis ?? [],
    cards: worked?.cards.length ?? 0,
    ms,
    chars: worked?.message.length ?? 0,
    head: worked ? worked.message.split('\n').find(l => l.trim())?.slice(0, 96) ?? '' : '',
    faults,
  });
}

/* -------------------------------------------------------------------------- *
 * Reporting
 * -------------------------------------------------------------------------- */

const verbose = Deno.args.includes('--verbose');
const pad = (s: string, n: number) => (s + ' '.repeat(n)).slice(0, n);

console.log(
  `${pad('id', 5)} ${pad('deck', 7)} ${pad('ask', 16)} ${pad('subject', 9)} ${pad('standing', 9)} ${pad('ms', 6)} head`
);
for (const r of rows) {
  console.log(
    `${pad(r.id, 5)} ${pad(r.deck ?? '-', 7)} ${pad(r.ask ?? '-', 16)} ${pad(r.subject ?? '-', 9)} ` +
      `${pad(r.standing, 9)} ${pad(String(r.ms), 6)} ${r.head}`
  );
  if (verbose) console.log(`      ${r.q}`);
}

const count = (fn: (r: Row) => boolean) => rows.filter(fn).length;

console.log('\n--- routing ---');
console.log(`reached an ask     ${count(r => r.ask !== null)} / ${rows.length}`);
console.log(`reached nothing    ${count(r => r.ask === null)}`);
console.log(`  of those reached: refused with a named gap ${count(r => r.gap !== null)}`);

console.log('\n--- standing ---');
for (const s of ['full', 'partial', 'refused', 'nothing']) {
  console.log(`${pad(s, 10)} ${count(r => r.standing === s)}`);
}
console.log(
  `answered (full or partial)  ${count(r => r.standing === 'full' || r.standing === 'partial')}`
);

const faulted = rows.filter(r => r.faults.length);
console.log(`\ncopy rule faults in words Tutor wrote: ${faulted.length}`);
for (const r of faulted) console.log(`  ${r.id}: ${r.faults.join(', ')}`);

const times = rows.map(r => r.ms).sort((a, b) => a - b);
console.log(
  `\nlatency  min ${times[0]} ms  median ${times[Math.floor(times.length / 2)]} ms  max ${times[times.length - 1]} ms`
);

/* -------------------------------------------------------------------------- *
 * Writing and diffing
 * -------------------------------------------------------------------------- */

const out = Deno.args.find(a => a.startsWith('--json='));
if (out) {
  await Deno.writeTextFile(out.slice('--json='.length), JSON.stringify(rows, null, 2));
  console.log(`\nwritten to ${out.slice('--json='.length)}`);
}

const before = Deno.args.find(a => a.startsWith('--diff='));
if (before) {
  const prev: Row[] = JSON.parse(await Deno.readTextFile(before.slice('--diff='.length)));
  const byId = new Map(prev.map(r => [r.id, r]));
  const moved: string[] = [];
  /* ROUTING IS NOT THE ONLY WAY AN ANSWER CHANGES, and the one this task cared
     about most did not move at all: "the best black removal spell under one
     dollar" routed to `best-of` before and after, and the list under it went
     from one wrong card to eight right ones. A diff that only watched routing
     would have called that no change. */
  const reworded: string[] = [];
  for (const now of rows) {
    const then = byId.get(now.id);
    if (!then) continue;
    if (then.ask !== now.ask || then.standing !== now.standing || then.subject !== now.subject) {
      moved.push(
        `  ${now.id}  ${then.ask ?? '-'}/${then.standing}  ->  ${now.ask ?? '-'}/${now.standing}   ${now.q}`
      );
    } else if (then.head !== now.head || then.chars !== now.chars) {
      reworded.push(
        `  ${now.id}  ${then.chars} -> ${now.chars} chars\n` +
          `        was: ${then.head || '(nothing)'}\n` +
          `        now: ${now.head || '(nothing)'}`
      );
    }
  }
  console.log(`\n--- against ${before.slice('--diff='.length)}: ${moved.length} question(s) moved ---`);
  for (const m of moved) console.log(m);
  console.log(`--- and ${reworded.length} answered the same ask with different words ---`);
  for (const r of reworded) console.log(r);
}
