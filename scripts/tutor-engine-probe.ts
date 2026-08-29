/**
 * Run the REPO's answerer, against the live catalogue, with a real deck body.
 *
 *   deno run --allow-net --allow-read --allow-env scripts/tutor-engine-probe.ts
 *   deno run --allow-net --allow-read --allow-env scripts/tutor-engine-probe.ts --q="..." --deck=atraxa
 *
 * WHY THIS AND NOT `tutor-refute-probe.mjs`
 * -----------------------------------------
 * That harness asks the DEPLOYED function, which is the right way to check what
 * a player gets today and useless for work that has not been deployed. Section
 * 10c of CLAUDE.md is the standing warning in the other direction: the repo and
 * the deployment have been different on this exact function twice, and reporting
 * repo behaviour as live behaviour is the mistake it records.
 *
 * So this one is explicit about which side it measures. It imports
 * `answer/index.ts` from the working tree and calls it with the same request
 * shape `src/pages/Tutor.tsx` sends, including the deck body with `power.score`,
 * `economy.priceUSD` and `legality.ok` on it. The catalogue reads are real: the
 * same anon key, the same `cards_unique`, the same RPCs. Nothing here is a
 * fixture except the deck, and the deck is a recording of a real one.
 *
 * Signed out, so "which of your decks play this" answers as signed out. That is
 * a real difference and it is recorded rather than hidden.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { answerFromCatalogue } from '../supabase/functions/mtg-brain/answer/index.ts';
import { normaliseDeckCards } from '../supabase/functions/mtg-brain/deck-context.ts';
import { looksWrong } from '../supabase/functions/mtg-brain/answer/voice.ts';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });

/** The page's own mapping, copied from `generateResponse` in Tutor.tsx. */
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
  none: null,
};

async function ask(message: string, deckKey: keyof typeof DECKS) {
  const deckContext = DECKS[deckKey];
  const deckCards = normaliseDeckCards(deckContext?.cards as never);
  const identity = ((deckContext?.identity ?? deckContext?.colors ?? []) as string[]).filter(c =>
    'WUBRG'.includes(c)
  );
  const started = performance.now();
  const worked = await answerFromCatalogue({
    message,
    deckContext,
    deckCards,
    identity,
    db,
    userDb: null,
  });
  return { worked, ms: Math.round(performance.now() - started) };
}

interface Case {
  q: string;
  deck: keyof typeof DECKS;
  /** Why this question is in the list. Printed so the run explains itself. */
  why: string;
}

/**
 * Every question the review named as refused while we held the answer, plus the
 * three the brief added, plus the ones that must NOT change.
 */
const CASES: Case[] = [
  /* -- the three the brief put in order -- */
  { q: 'What does Sol Ring do?', deck: 'none', why: 'what it does, full reading' },
  { q: 'What does Wrath of God do?', deck: 'none', why: 'what it does, the XMage record speaks' },
  { q: 'What does Craterhoof Behemoth do?', deck: 'none', why: 'what it does, partial reading' },
  { q: 'What does Esper Sentinel do?', deck: 'none', why: 'what it does, no reading at all' },
  { q: 'What does Doubling Season do?', deck: 'none', why: 'full reading, nothing sayable' },
  { q: 'Does Inexorable Tide fit my deck?', deck: 'atraxa', why: 'fit, a card that matches the commander plan' },
  { q: 'Does Blightbelly Rat fit my deck?', deck: 'atraxa', why: 'fit, a match on a card already in the list' },
  { q: 'Does Contentious Plan fit my deck?', deck: 'atraxa', why: 'fit, in the deck and matching nothing the reading found' },
  { q: 'Does Sol Ring fit my deck?', deck: 'ulamog', why: 'fit, a commander whose reading produces no plan at all' },
  { q: 'Does Lightning Bolt fit my deck?', deck: 'atraxa', why: 'fit, outside the commander colours' },
  { q: 'Is Craterhoof Behemoth good in my deck?', deck: 'atraxa', why: 'fit, in colour, partial reading' },
  { q: 'Can I cast Cyclonic Rift in this deck?', deck: 'atraxa', why: 'castability, a real cost' },
  { q: 'Can I cast Sol Ring in this deck?', deck: 'atraxa', why: 'castability, one generic pip' },

  /* -- the request body, refused three times over -- */
  { q: 'Rate this deck out of ten', deck: 'atraxa', why: 'q25, power.score was sent' },
  { q: 'What is this deck worth?', deck: 'atraxa', why: 'q32, economy.priceUSD was sent' },
  { q: 'Is my deck legal for commander?', deck: 'atraxa', why: 'q43, legality.ok was sent' },

  /* -- the eleven copy questions from the singleton section -- */
  { q: 'Can I run two copies of Sol Ring in my commander deck?', deck: 'atraxa', why: 'q47' },
  { q: 'Should I add a second Sol Ring to this deck?', deck: 'atraxa', why: 's1' },
  { q: 'Two copies of Sol Ring, is that allowed here?', deck: 'atraxa', why: 's2' },
  { q: 'I already run Rhystic Study. Should I run more copies of it for consistency?', deck: 'atraxa', why: 's3' },
  { q: 'How many copies of Arcane Signet can I play in commander?', deck: 'atraxa', why: 's4' },
  { q: 'Is running 4 copies of Lightning Bolt fine in my deck?', deck: 'atraxa', why: 's6, red card in a WUBG deck' },
  { q: 'Can I run two Islands in my commander deck?', deck: 'atraxa', why: 's8, the basic land exception' },
  { q: 'Sol Ring, can I run two?', deck: 'atraxa', why: 'c3' },
  { q: 'Sol Ring, how many copies in commander?', deck: 'atraxa', why: 'c4' },
  { q: 'How many copies of Lightning Bolt can I run in modern?', deck: 'none', why: 'a format that is not singleton' },

  /* -- the ones that must NOT have changed -- */
  { q: 'What card should I replace to fit in a second Cyclonic Rift?', deck: 'atraxa', why: 's5 must still hand off to Optimise' },
  { q: 'Is Sol Ring legal in Modern?', deck: 'none', why: 'legality, unchanged' },
  { q: 'How much is Black Lotus worth?', deck: 'none', why: 'price with no dollar figure, unchanged' },
  { q: 'What are the best three mana counterspells?', deck: 'none', why: 'a list, unchanged' },
  { q: 'Which lands can I upgrade?', deck: 'atraxa', why: 'lands, unchanged' },
  { q: 'What are the best ramp cards for my deck?', deck: 'atraxa', why: 'best-of with a deck, unchanged' },
  { q: 'How strong is Sol Ring?', deck: 'none', why: 'must NOT become "attach a deck"' },
  { q: 'Is Rhystic Study worth sixty dollars?', deck: 'none', why: 'price, must not be read as a deck value' },
];

const single = Deno.args.find(a => a.startsWith('--q='));
if (single) {
  const deckArg = Deno.args.find(a => a.startsWith('--deck='));
  const deck = (deckArg ? deckArg.split('=')[1] : 'none') as keyof typeof DECKS;
  const { worked, ms } = await ask(single.slice(4), deck);
  console.log(`[${ms} ms] routing=${JSON.stringify(worked?.routing ?? null)}`);
  console.log(worked?.message ?? '(no answer: the router had no opinion)');
  Deno.exit(0);
}

let answered = 0;
let refused = 0;
let unrouted = 0;
const faults: string[] = [];
const quoted: string[] = [];

for (const c of CASES) {
  const { worked, ms } = await ask(c.q, c.deck);
  console.log('\n' + '='.repeat(78));
  console.log(`Q  ${c.q}`);
  console.log(`   deck=${c.deck}  (${c.why})`);
  if (!worked) {
    unrouted++;
    console.log(`   ROUTED NOWHERE  [${ms} ms]`);
    continue;
  }
  if (worked.standing === 'refused') refused++;
  else answered++;
  console.log(
    `   ask=${worked.routing.ask} subject=${worked.routing.subject ?? 'none'} ` +
      `cue=${worked.routing.cue ?? 'default'} standing=${worked.standing} ` +
      `read=${worked.basis.join(',') || 'nothing'} cards=${worked.cards.length} [${ms} ms]`
  );
  /* `looksWrong` is run on the WHOLE message here, which is a blunter check
     than the one the answerer itself applies. `checkVoice` in `answer/index.ts`
     only checks the blocks Tutor SAID, because a card's own type line carries
     an em dash and altering it would break the fabrication rule to satisfy the
     copy rule. So an em dash found here is reported separately and is usually a
     type line; a banned word or a zero price is ours and is a failure.
     The authority is the answerer's own warning, which prints to the console. */
  for (const fault of looksWrong(worked.message)) {
    if (fault === 'em dash') quoted.push(`${c.q}: em dash, check whether it is a card's own type line`);
    else faults.push(`${c.q}: ${fault}`);
  }
  console.log('---');
  console.log(worked.message);
}

console.log('\n' + '='.repeat(78));
console.log(`${CASES.length} questions: ${answered} answered, ${refused} refused, ${unrouted} routed nowhere`);
console.log(`copy rule faults in words Tutor wrote: ${faults.length}`);
for (const f of faults) console.log('  ' + f);
console.log(`em dashes anywhere in an answer, quoted text included: ${quoted.length}`);
for (const q of quoted) console.log('  ' + q);
