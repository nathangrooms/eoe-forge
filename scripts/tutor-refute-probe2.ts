/**
 * ADVERSARIAL PROBES against the REPO's answerer, live catalogue.
 *
 *   deno run --allow-net --allow-read --allow-env scripts/tutor-refute-probe2.ts
 *   deno run --allow-net --allow-read --allow-env scripts/tutor-refute-probe2.ts --group=keywords
 *
 * These are not the fifty. They are written to make the answerer state
 * something false: invented cards wrapped around real ones, keyword words
 * hiding inside card names, copies questions phrased six ways, rules questions
 * that must keep refusing, and price questions on cards with no dollar quote.
 *
 * A REFUSAL HERE IS A PASS. The column that matters is not `standing`, it is
 * whether the words assert something a card contradicts.
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
  none: null,
};

async function ask(message: string, deckKey: keyof typeof DECKS) {
  const deckContext = DECKS[deckKey];
  const deckCards = normaliseDeckCards(deckContext?.cards as never);
  const identity = ((deckContext?.identity ?? deckContext?.colors ?? []) as string[]).filter(c =>
    'WUBRG'.includes(c)
  );
  const t = performance.now();
  const worked = await answerFromCatalogue({
    message,
    deckContext,
    deckCards,
    identity,
    db,
    userDb: null,
  });
  return { worked, ms: Math.round(performance.now() - t) };
}

interface Probe {
  group: string;
  q: string;
  deck: keyof typeof DECKS;
  /** What a correct answer must NOT contain, lowercased substrings. */
  mustNot?: string[];
  /** What a correct answer MUST contain, lowercased substrings. */
  must?: string[];
  why: string;
}

const PROBES: Probe[] = [
  /* -- invented cards wrapped around real ones ---------------------------- */
  { group: 'fabrication', q: 'What does Sol Ring of the Gods do?', deck: 'none',
    mustNot: ['adds 2 mana', '{1}', 'rank 1'], why: 'no such card; must not answer about Sol Ring' },
  { group: 'fabrication', q: 'What does Lightning Bolt of Ravnica do?', deck: 'none',
    mustNot: ['3 damage', 'deals 3'], why: 'no such card' },
  { group: 'fabrication', q: 'Explain Rhystic Study of the Coast in plain terms.', deck: 'none',
    mustNot: ['rank 44', 'unless that player pays'], why: 'no such card' },
  { group: 'fabrication', q: 'Is Counterspell of the Deep legal in Modern?', deck: 'none',
    mustNot: ['legal in'], why: 'no such card' },
  { group: 'fabrication', q: 'How much is Black Lotus Prime worth?', deck: 'none',
    mustNot: ['11658', '11,658'], why: 'no such card' },
  { group: 'fabrication', q: 'What does Grizzly Bears of Dominaria do?', deck: 'none',
    mustNot: ['2/2'], why: 'no such card' },

  /* -- keyword words hiding inside real card names ------------------------ */
  { group: 'keyword-trap', q: 'What does Flash of Insight do?', deck: 'none',
    must: ['flash of insight'], why: 'card wins over the keyword inside its name' },
  { group: 'keyword-trap', q: 'What does Trample do?', deck: 'none', why: 'plain keyword' },
  { group: 'keyword-trap', q: 'What does Reach of Shadows do?', deck: 'none',
    must: ['reach of shadows'], why: 'card wins over keyword' },
  { group: 'keyword-trap', q: 'What does Defender of the Order do?', deck: 'none',
    must: ['defender of the order'], why: 'card wins over keyword' },
  { group: 'keyword-trap', q: 'What does zoomancy mean?', deck: 'none',
    mustNot: ['in the words wizards prints'], why: 'not a keyword; must not invent one' },
  { group: 'keyword-trap', q: 'What does the stack mean?', deck: 'none',
    mustNot: ['in the words wizards prints'], why: 'a rules concept we do not hold' },
  { group: 'keyword-trap', q: 'What does state based actions mean?', deck: 'none',
    mustNot: ['in the words wizards prints'], why: 'a rules concept we do not hold' },
  { group: 'keyword-trap', q: 'What does protection mean?', deck: 'none',
    must: ['card to card'], why: 'protection has no single wording; must say so' },
  { group: 'keyword-trap', q: 'What does ward mean?', deck: 'none',
    must: ['card to card'], why: 'ward has no single wording; must say so' },
  { group: 'keyword-trap', q: 'What does banding mean?', deck: 'none', why: 'obscure keyword' },
  { group: 'keyword-trap', q: 'What does flying mean?', deck: 'none',
    must: ["can't be blocked except by creatures with flying or reach"], why: 'majority wording' },
  { group: 'keyword-trap', q: 'What does trample mean?', deck: 'none',
    must: ['excess combat damage'], why: 'must be the current wording, not a retired one' },
  { group: 'keyword-trap', q: 'What does haste mean?', deck: 'none',
    must: ['as soon as it comes under your control'], why: 'majority wording' },
  { group: 'keyword-trap', q: 'What does shroud mean?', deck: 'none',
    must: ["can't be the target of spells or abilities"], why: 'majority wording' },

  /* -- rules that are genuinely not held; these must keep refusing -------- */
  { group: 'must-refuse', q: 'What happens if two triggered abilities go on the stack at the same time?', deck: 'none',
    mustNot: ['active player', 'apnap'], why: 'priority is not held' },
  { group: 'must-refuse', q: 'Do I lose the game when my library is empty?', deck: 'none',
    mustNot: ['you lose'], why: 'not held' },
  { group: 'must-refuse', q: 'How much commander damage kills a player?', deck: 'none',
    mustNot: ['21'], why: 'not held' },
  { group: 'must-refuse', q: 'What is the difference between exile and destroy?', deck: 'none',
    mustNot: ['graveyard instead'], why: 'not held' },
  { group: 'must-refuse', q: 'Can I have two legendary creatures with the same name on the battlefield?', deck: 'none',
    mustNot: ['legend rule', 'you choose one'], why: 'not held' },
  { group: 'must-refuse', q: 'What is the maximum hand size in commander?', deck: 'none',
    mustNot: ['seven', ' 7 '], why: 'not held' },
  { group: 'must-refuse', q: 'How many lands should I run in a commander deck?', deck: 'none',
    mustNot: ['38', '37'], why: 'meta_decks holds it but nothing reads it; must not guess' },

  /* -- copies, the singleton surface ------------------------------------- */
  { group: 'copies', q: 'Can I run two copies of Sol Ring in my commander deck?', deck: 'atraxa',
    must: ['no'], why: 'singleton' },
  { group: 'copies', q: 'Should I add a second Sol Ring to this deck?', deck: 'atraxa', why: 'singleton' },
  { group: 'copies', q: 'Two copies of Sol Ring, is that allowed here?', deck: 'atraxa', why: 'singleton' },
  { group: 'copies', q: 'I already run Rhystic Study. Should I run more copies of it for consistency?', deck: 'atraxa', why: 'singleton' },
  { group: 'copies', q: 'How many copies of Arcane Signet can I play in commander?', deck: 'atraxa', why: 'singleton' },
  { group: 'copies', q: 'Is running 4 copies of Lightning Bolt fine in my deck?', deck: 'atraxa',
    must: ['no'], why: 'singleton AND out of colour identity' },
  { group: 'copies', q: 'Can I run two Islands in my commander deck?', deck: 'atraxa',
    must: ['basic'], why: 'basics are the exception; the answer is yes' },
  { group: 'copies', q: 'Sol Ring, can I run two?', deck: 'atraxa', why: 'singleton' },
  { group: 'copies', q: 'Sol Ring, how many copies in commander?', deck: 'atraxa', why: 'singleton' },
  { group: 'copies', q: 'How many copies of Lightning Bolt can I play in modern?', deck: 'none',
    must: ['4'], why: 'four in a 60 card format' },
  { group: 'copies', q: 'How many copies of Relentless Rats can I play in modern?', deck: 'none', why: 'the named exception' },
  { group: 'copies', q: 'Can I run two copies of Mana Crypt in my commander deck?', deck: 'atraxa',
    must: ['ban'], why: 'banned AND singleton; the ban must be said' },
  { group: 'copies', q: 'How many copies of Sol Ring can I play in vintage?', deck: 'none', why: 'restricted' },
  { group: 'copies', q: 'How many copies of Plains can I run in commander?', deck: 'atraxa',
    must: ['basic'], why: 'basic land exception with no deck count involved' },

  /* -- price, and the zero that must never print -------------------------- */
  { group: 'price', q: 'How much is Rampant Growth worth?', deck: 'none',
    mustNot: ['€0', '$0.00'], why: 'eur is null on our row' },
  { group: 'price', q: 'How much is Black Lotus worth?', deck: 'none',
    mustNot: ['$0.00'], why: 'usd is null on our row' },
  { group: 'price', q: 'How much is Shivan Dragon worth?', deck: 'none', mustNot: ['$0.00'], why: 'null price guard' },
  { group: 'price', q: 'What is the most expensive card in magic?', deck: 'none', why: 'deliberately refused' },

  /* -- legality in a named format ---------------------------------------- */
  { group: 'legality', q: 'Can I play Swords to Plowshares in Modern?', deck: 'none',
    must: ['not legal'], why: 'not_legal in modern' },
  { group: 'legality', q: 'Can I play Lightning Bolt in Historic?', deck: 'none',
    must: ['banned'], why: 'banned in historic' },
  { group: 'legality', q: 'Can I play Sol Ring in Legacy?', deck: 'none', why: 'banned in legacy' },
  { group: 'legality', q: 'Is Cultivate legal in Standard?', deck: 'none',
    must: ['not legal'], why: 'not_legal in standard' },

  /* -- deck body facts ---------------------------------------------------- */
  { group: 'deck', q: 'Rate this deck out of ten and tell me what is holding it back.', deck: 'atraxa',
    must: ['7.3'], why: 'power.score 7.34 is in the body' },
  { group: 'deck', q: 'What is this deck worth?', deck: 'atraxa', must: ['423.02'], why: 'economy in the body' },
  { group: 'deck', q: 'Is my deck legal for commander?', deck: 'atraxa', why: 'deckRules over the body' },
  { group: 'deck', q: 'Is my deck legal for commander?', deck: 'ulamog', why: 'the second deck' },
  { group: 'deck', q: 'What is this deck worth?', deck: 'ulamog', why: 'the second deck' },
  { group: 'deck', q: 'Rate this deck out of ten.', deck: 'ulamog', why: 'the second deck' },
];

const only = Deno.args.find(a => a.startsWith('--group='))?.slice('--group='.length);
const rows = PROBES.filter(p => !only || p.group === only);

let flagged = 0;
for (const p of rows) {
  const { worked, ms } = await ask(p.q, p.deck);
  const text = worked?.message ?? '';
  const lower = text.toLowerCase();
  const bad: string[] = [];
  for (const m of p.mustNot ?? []) if (lower.includes(m)) bad.push(`SAID "${m}"`);
  for (const m of p.must ?? []) if (!lower.includes(m)) bad.push(`did not say "${m}"`);
  const faults = worked ? looksWrong(text) : [];
  if (faults.length) bad.push(`copy: ${faults.join(', ')}`);
  if (/\$0\.00|€0\.00|\$0(?!\.)|\b0 dollars\b/.test(text)) bad.push('ZERO PRICE');
  if (bad.length) flagged++;
  console.log('='.repeat(78));
  console.log(
    `[${p.group}] ${p.q}\n  deck=${p.deck} ask=${worked?.routing.ask ?? '-'} standing=${worked ? worked.standing : 'nothing'} ${ms}ms` +
      (bad.length ? `\n  >>> FLAG: ${bad.join(' | ')}   (${p.why})` : '')
  );
  console.log('-'.repeat(78));
  console.log(text || '(nothing: falls through to the stock paragraph)');
}
console.log('\n'.repeat(1) + `${rows.length} probes, ${flagged} flagged`);
