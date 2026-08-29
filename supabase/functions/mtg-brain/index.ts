/**
 * Tutor.
 *
 * WHY THIS DIRECTORY IS STILL CALLED `mtg-brain`
 * ---------------------------------------------
 * The feature is Tutor everywhere a person can see it. The deployed endpoint is
 * deliberately NOT renamed, and this is the one place in the codebase that
 * carries the old word.
 *
 * A directory name here IS the deployed function id. Renaming it does not move
 * a function, it creates a second one and leaves the first deployed with the old
 * code. Deployment is `git push` -> Lovable, and the static bundle and the
 * function do not go live in the same instant, so any window where the frontend
 * has shipped and the function has not is a window where every question 404s.
 *
 * Seven call sites invoke it, and six of them live in files owned by other
 * agents right now: AIAnalysisPanel, BrainAnalysis, EnhancedDeckAnalysis,
 * ScanInsightsHelper, AITemplateRecommendations and AIBuilder. A rename is
 * therefore a simultaneous seven-file edit across three ownership boundaries,
 * bought for a string no player will ever read.
 *
 * So: the endpoint keeps its id, everything else is Tutor. Do not "tidy" this.
 *
 * Rewritten after the owner's session, which is the specification for this file:
 *
 *   "Which lands can I upgrade?"
 *   -> a pie chart of mana sources, then "please provide a list of the 36 lands
 *      you currently have"
 *
 *   "wasn't very good and kept showing me graphs when not needed and didnt
 *    attach any reference cards, then it told me it didn't know what lands i
 *    even have so where is deck context and do chats continue?"
 *
 * Four separate faults produced that, and each is fixed in a named place:
 *
 *   1. The decklist was gated behind a keyword regex and then truncated to 1200
 *      characters. It is now always sent, in full, compactly. See deck-context.ts.
 *   2. Charts were a reflex: "if no chart exists yet, add the curve", "if fewer
 *      than two exist, add the colour pie". A chart is now drawn only when the
 *      question is about the thing the chart shows. See chartsFor().
 *   3. Referenced cards depended on the model appending a magic section. Names
 *      are now read out of the answer and resolved against the `cards` table.
 *      See resolve-cards.ts.
 *   4. Conversations lived in React state. They are persisted now; this function
 *      accepts and returns a conversation id, and the page writes the turns.
 *
 * And the numbers themselves were wrong: mana sources were bucketed by
 * `card.colors`, which is empty for every land, so a four-colour deck reported
 * 34 colourless sources. Lands are classified by `produced_mana` now, from the
 * database, and when a land cannot be classified the breakdown is withheld
 * rather than guessed.
 *
 * 29 AUG 2026: THE CATALOGUE ANSWERS FIRST
 * ----------------------------------------
 * The owner, on Tutor and the deck coach once the gateway ran out of credits:
 * "they should run automatically through our engine, I dont want to use any LLM
 * we have so much knowledge?"
 *
 * `answer/` is that. It reads the question, decides what is being asked and
 * what it is about, and answers out of the database when it can. A card
 * question is nearly all lookup: what it does, what it costs, what it is legal
 * in, what it is worth, what it combos with and which of your decks run it are
 * six queries with exact answers. Those never leave this project now.
 *
 * Three things follow, and they are the whole design:
 *
 *   1. The catalogue goes FIRST, not as a fallback. When it answers, that is
 *      the answer and nothing else is asked.
 *   2. What we do not hold is refused BY NAME. No rules reference, no field
 *      data, no opinion about whether a card is good. Each was measured and
 *      each refusal says which one it is.
 *   3. A refusal is a 200 with a message, never an error status. The old 402
 *      made the page throw into its own deck-shaped fallback, and both
 *      questions asked after the credits ran out had no deck, so the database
 *      holds the same blank message twice.
 *
 * The gateway is still called, last, for the handful of questions the
 * catalogue cannot settle. It is no longer able to take the feature down with
 * it.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

import {
  normaliseDeckCards,
  renderDecklist,
  measure,
  type NormalisedCard,
} from "./deck-context.ts";
import { gradeLands, upgradeTargets, findLandCandidates, renderCandidates } from "./manabase.ts";
import { extractCardNames, resolveCards } from "./resolve-cards.ts";
import { answerFromCatalogue, nothingToAnswerWith } from "./answer/index.ts";
import { readQuestion } from "./answer/route.ts";

/**
 * A plain answer with nothing attached, shaped exactly like a normal one.
 *
 * `message` and not `error`, on purpose. The page throws on `error` and then
 * prints its own fallback, which is built from the attached deck's counts and
 * renders as an empty box when there is no deck. That happened to both
 * questions asked after the credits ran out, and both empty messages are still
 * in `tutor_messages`.
 */
function saidPlainly(message: string, conversationId: string | null) {
  return {
    message,
    cards: [],
    visualData: null,
    conversationId,
    answeredFrom: 'nothing',
    standing: 'refused',
    success: true,
  };
}

/**
 * The one place this function names a model.
 *
 * It was written inline at the fetch, which is why "what is Tutor running on"
 * needed a grep rather than a look. `TUTOR_MODEL` overrides it without a
 * deploy, so moving off one model is a secret change rather than a code
 * change, and the log line on a refusal can say which model was refused.
 *
 * The gateway is Lovable's, so the id is `provider/model` and the provider
 * has to be one that gateway serves. Changing this to a provider it does not
 * serve fails every request, so verify with one real call before shipping it.
 */
const MODEL = Deno.env.get('TUTOR_MODEL') ?? 'google/gemini-2.5-flash';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/* -------------------------------------------------------------------------- *
 * Charts
 *
 * The old code ran this:
 *
 *   if (curveBins && (visualData.charts.length === 0 || wantCurve))   // always
 *   if (src && (visualData.charts.length < 2 || wantColors))          // always
 *
 * The first fires whenever nothing has been charted yet and the second whenever
 * fewer than two things have, so every deck question got up to two charts no
 * matter what was asked. "Which lands can I upgrade" wants a list of lands.
 * -------------------------------------------------------------------------- */

const ASKS_FOR_A_PICTURE = /\b(chart|graph|plot|pie|histogram|visuali[sz]e|breakdown|distribution)\b/i;
const ASKS_ABOUT_CURVE = /\b(curve|cmc|mana value|top ?heavy|average cost)\b/i;
const ASKS_ABOUT_COLOUR_BALANCE =
  /\b(colou?r (balance|distribution|breakdown|spread)|how many (\w+ )?sources|pip|pips|enough sources|source count)\b/i;

interface Chart {
  type: 'bar' | 'pie' | 'line';
  title: string;
  data: { name: string; value: number }[];
}

/**
 * Charts that answer the question that was asked, and no others.
 *
 * Every number here is read off the deck summary. Nothing is drawn from an
 * estimate, and the colour chart is skipped entirely when the database could not
 * classify one of the lands, because a bar of the wrong height is worse than no
 * bar at all.
 */
function chartsFor(message: string, deckContext: any): Chart[] {
  const charts: Chart[] = [];
  const asked = ASKS_FOR_A_PICTURE.test(message);

  const bins = deckContext?.curve?.bins ?? deckContext?.curve;
  const wantsCurve = ASKS_ABOUT_CURVE.test(message) || (asked && !ASKS_ABOUT_COLOUR_BALANCE.test(message));
  if (bins && typeof bins === 'object' && wantsCurve) {
    charts.push({
      type: 'bar',
      title: 'Cards by mana value',
      data: Object.entries(bins).map(([name, value]) => ({ name: String(name), value: Number(value || 0) })),
    });
  }

  const sources = deckContext?.mana?.sources;
  const wantsColours = ASKS_ABOUT_COLOUR_BALANCE.test(message) || (asked && !ASKS_ABOUT_CURVE.test(message));
  if (sources && wantsColours) {
    const data = ['W', 'U', 'B', 'R', 'G', 'C']
      .filter(k => sources[k] !== undefined)
      .map(k => ({ name: k, value: Number(sources[k] || 0) }))
      .filter(d => d.value > 0);
    if (data.length) charts.push({ type: 'pie', title: 'Lands that make each colour', data });
  }

  return charts;
}

/* -------------------------------------------------------------------------- *
 * Cache
 *
 * Keyed on the thread as well as the question. The old key was deck plus
 * message, so asking the same thing twice in two different conversations
 * returned the first conversation's answer.
 * -------------------------------------------------------------------------- */

const responseCache = new Map<string, { data: any; at: number }>();
const CACHE_TTL = 5 * 60 * 1000;

function hash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return h.toString(36);
}

function cacheKey(deckId: string | undefined, message: string, history: any[]): string {
  const tail = history.slice(-2).map((m: any) => String(m?.content ?? '')).join('|');
  return `${deckId ?? 'no-deck'}:${hash(String(message ?? '').toLowerCase().trim())}:${hash(tail)}`;
}

/* -------------------------------------------------------------------------- *
 * The prompt
 * -------------------------------------------------------------------------- */

const HOUSE_STYLE = `
### How to write

Write for a Commander player who does not know this product and does not know
software. Plain words a player would use at a table.

- Never use an em dash. If a sentence wants one, write two sentences.
- No product jargon. Not "engine", "pipeline", "subscore", "canonical", "taxonomy".
- Name real cards. "Add ramp" is useless. "Add Nature's Lore, Three Visits and Farseek" is an answer.
- Say the price when a card costs more than about twenty dollars.
- If you do not know something, say so. Never invent a card, a price or a number.
- Do not describe what you are about to do. Answer.
- Lead with the answer. The first sentence is the recommendation, not a preamble.
- Never say "AI", "assistant", "model", "smart", "intelligent" or "powered by".
  The Magic community has no patience for that vocabulary and neither does this
  product.
- Never ask the user what is in their deck. You have been given the full list.
  If something genuinely is not in the context above, name what is missing.`;

const CHART_RULE = `
### Charts

Do not call create_chart unless the user asked for a picture, a breakdown or a
distribution. A question about which cards to change wants a list of cards, not
a pie chart. Most answers need no chart at all.`;

function buildSystemPrompt(opts: {
  deckContext: any;
  manaSection: string;
  decklist: string;
}): string {
  const { deckContext, manaSection, decklist } = opts;

  const base = `You are Tutor, the Magic: The Gathering expert inside DeckMatrix. You know the rules, the formats, the card pool and how Commander decks are actually built. Answer the way a good player at the next table would: straight, specific, and without ceremony.

Never describe yourself as software, and never mention how you were built. If you are asked what you are, you are Tutor, the part of DeckMatrix that answers questions about Magic.

${HOUSE_STYLE}
${CHART_RULE}

### Commander baselines (99 cards behind a commander)
Lands 36 to 40. Ramp 10 to 14. Card draw 10 to 15. Spot removal 6 to 10.
Board wipes 2 to 4. Protection 3 to 6. Clear ways to win 3 to 5.
Average mana value: about 3.5 for a casual deck, about 3.0 for a strong one,
about 2.5 for a high power deck.

### Judging a land
A land is good in a deck when it makes a colour that deck needs, and better when
it makes two or more of them without entering tapped. A land that makes no colour
the deck plays is the first thing to look at, unless it does something the deck
genuinely needs. A land's colour comes from what it taps for, never from the
colour printed on the card.`;

  if (!deckContext) {
    return `${base}

### Right now
No deck is attached. Answer general questions about rules, cards, formats and
deck building. If the answer depends on what is in someone's deck, say so and ask
them to attach one from the picker at the top of the page.`;
  }

  const c = deckContext.counts ?? {};
  const identity: string[] = deckContext.identity ?? deckContext.colors ?? [];

  return `${base}

### The deck you are looking at
Name: ${deckContext.name ?? 'Unnamed'}
Format: ${deckContext.format ?? 'unknown'}
Commander: ${deckContext.commander?.name ?? 'none set'}
Colour identity: ${identity.length ? identity.join('') : 'unknown'}
Cards: ${c.total ?? 0} total. Lands ${c.lands ?? 0}, creatures ${c.creatures ?? 0}, instants ${c.instants ?? 0}, sorceries ${c.sorceries ?? 0}, artifacts ${c.artifacts ?? 0}, enchantments ${c.enchantments ?? 0}, planeswalkers ${c.planeswalkers ?? 0}.
Owned from collection: ${Math.round(Number(deckContext.economy?.ownedPct ?? 0))}%. Missing ${deckContext.economy?.missing ?? 0}. Value about $${Math.round(Number(deckContext.economy?.priceUSD ?? 0))}.
${manaSection}

${decklist
    ? `### The full decklist
This is the complete list. You have it. Never ask the user what is in this deck.
Square brackets after a land say what that land taps for.
${decklist}

### Answering about this deck
Name cards from the list above by name. When you suggest a change, say which card
comes out and which goes in, and why, in one line each. Match the power of what
is already there.`
    : `### The decklist did not arrive
The cards in this deck could not be loaded this time. You have the counts above
and nothing else.

Say plainly that you could not read the list right now and ask them to try again.
Do NOT name cards as though they were in the deck, do not guess what a deck with
this commander usually plays, and do not ask the user to type their decklist out.
The app holds it. This is a fault on our side, not a question for them.`}`;
}

/* -------------------------------------------------------------------------- */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      message,
      deckContext,
      conversationHistory = [],
      responseStyle = 'concise',
      conversationId = null,
    } = await req.json();

    console.log('tutor:', JSON.stringify({
      message: String(message ?? '').slice(0, 120),
      deck: deckContext?.name ?? null,
      historyTurns: conversationHistory.length,
      conversationId,
    }));

    const key = cacheKey(deckContext?.id, message, conversationHistory);
    const hit = responseCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL) {
      console.log('cache hit');
      return json({ ...hit.data, cached: true });
    }

    /* Read-only catalogue access. The anon key is enough: `cards` is public and
       this function never writes. */
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { auth: { persistSession: false } }
    );

    /**
     * The same database, read as the person asking.
     *
     * Only ever used to answer "do I already play this", which cannot be
     * answered by the anon client: `user_decks` is owner scoped and correctly
     * returns nothing without a sign in. The page sends the caller's own sign
     * in on the request, so it is passed straight through and the database
     * decides what they may see, exactly as it does everywhere else.
     *
     * Null when signed out, and null is not zero decks. Nothing built on this
     * may say "none of your decks" without having actually looked.
     */
    const callerAuth = req.headers.get('Authorization');
    const asCaller = callerAuth
      ? createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_ANON_KEY')!,
          { auth: { persistSession: false }, global: { headers: { Authorization: callerAuth } } }
        )
      : null;

    // ---------------------------------------------------------------- deck
    const deckCards: NormalisedCard[] = normaliseDeckCards(deckContext?.cards);
    const identity: string[] = (deckContext?.identity ?? deckContext?.colors ?? [])
      .filter((c: string) => 'WUBRG'.includes(c));

    /* Empty string, not a sentence saying it is empty.
       The prompt used to print "No cards were sent with this deck." directly
       under the heading "This is the complete list. You have it. Never ask the
       user what is in this deck." Those two claims together are worse than
       either alone: they assert that an empty list IS the deck. Observed live,
       with the deck attached and the page's own card lookup timed out, so the
       counts said 100 cards and the list said none. `buildSystemPrompt` now
       branches on this instead. */
    let decklist = '';
    if (deckCards.length) {
      decklist = renderDecklist(deckCards);
      const cost = measure(decklist);
      console.log(`decklist: ${deckCards.length} entries, ${cost.chars} chars, about ${cost.approxTokens} tokens`);
    } else {
      /* Only when a deck was actually attached. It used to fire on every
         question with no deck at all, so the warning that means "the deck came
         through empty and something is wrong" was printed on every card
         question, which is how a real warning stops being read. */
      if (deckContext) {
        console.warn('decklist: NO CARDS were sent with this deck; saying so rather than implying an empty deck');
      }
    }

    /* ---------------------------------------------------------------------- *
     * The answer we can work out ourselves, tried first.
     *
     * The owner: "they should run automatically through our engine, I dont want
     * to use any LLM we have so much knowledge?"
     *
     * A card question is nearly all lookup. What a card does, what it costs,
     * what it is legal in, what it is worth, what it combos with and which of
     * your decks already play it are six queries, and every one of them has an
     * exact answer sitting in the database. Asking anything else to recall them
     * is how a Commander deck got told it "could add another copy" of Mystic
     * Remora, which is the singleton rule broken in the format this whole
     * product is built around.
     *
     * So this runs first, and when it answers, that is the answer. It returns
     * null rather than a bad answer when the question is not one it can settle,
     * and null means the request carries on below.
     * ---------------------------------------------------------------------- */
    /* What the request actually carries, used by every refusal below so that
       "attach a deck" is never said to somebody who already has one. */
    const whatWeHave = {
      card: Boolean(readQuestion(String(message ?? '')).card),
      deck: Boolean(deckContext && deckCards.length),
    };

    const worked = await answerFromCatalogue({
      message: String(message ?? ''),
      deckContext,
      deckCards,
      identity,
      db: supabase,
      userDb: asCaller,
    });

    if (worked) {
      console.log(`answered from the catalogue: ask=${worked.routing.ask} subject=${worked.routing.subject ?? 'none'} cue=${worked.routing.cue ?? 'default'} standing=${worked.standing} read=${worked.basis.join(',') || 'nothing'}`);

      /* Charts stay on the same rule they were already on: one is drawn only
         when the question is about the thing the chart shows. */
      const charts = chartsFor(worked.routing.question, deckContext);
      const result = {
        message: worked.message,
        cards: worked.cards,
        visualData: charts.length ? { charts, tables: [] } : null,
        conversationId,
        answeredFrom: 'catalogue',
        routing: worked.routing,
        basis: worked.basis,
        standing: worked.standing,
        success: true,
      };
      responseCache.set(key, { data: result, at: Date.now() });
      return json(result);
    }

    // ------------------------------------------------------------ mana base
    const sources = deckContext?.mana?.sources ?? null;
    const unknownLands: string[] = deckContext?.mana?.unknownLands ?? [];
    const dryLands: string[] = deckContext?.mana?.landsMakingNoManaThemselves ?? [];

    let manaSection: string;
    if (sources) {
      const line = ['W', 'U', 'B', 'R', 'G', 'C']
        .filter(k => sources[k] !== undefined)
        .map(k => `${k}:${sources[k]}`)
        .join(' ');
      manaSection = `Lands that make each colour, counted by what each land taps for: ${line}.`;
      if (dryLands.length) {
        manaSection += `\nLands that make no mana themselves, so they are in none of those counts: ${dryLands.join(', ')}.`;
      }
    } else {
      // Nothing rather than a wrong number.
      manaSection = unknownLands.length
        ? `Mana sources by colour cannot be reported for this deck. ${unknownLands.join(', ')} could not be classified. Do not estimate those numbers and do not state them.`
        : 'Mana sources by colour are not available for this deck. Do not state them.';
    }

    // --------------------------------------------- the in-house land engine
    const asksAboutLands =
      /\b(land|lands|mana ?base|fixing|duals?|fetch|colou?r screw|tapped)\b/i.test(String(message ?? ''));

    let landSection = '';
    if (deckContext && asksAboutLands && deckCards.length) {
      const verdicts = gradeLands(deckCards, identity);
      const targets = upgradeTargets(verdicts);
      const inDeck = deckCards.map(c => c.name);
      const candidates = await findLandCandidates(supabase, identity, inDeck);

      const targetLines = targets.length
        ? targets.map(t => {
            const taps = t.produces === null
              ? 'not classified'
              : t.produces.length === 0
                ? 'makes no mana itself'
                : `taps for ${t.produces.join('')}`;
            return `  ${t.name} [${taps}] - ${t.verdict}`;
          }).join('\n')
        : "  none: every nonbasic land here makes at least two of the deck's colours";

      /* Three different situations, and they have to read differently: a
         shortlist we computed, a shortlist that is genuinely empty, and a lookup
         that failed. The old code collapsed the last two into "print nothing",
         which quietly handed the question back to recall at exactly the moment
         the catalogue was unavailable. */
      const candidateSection =
        candidates === null
          ? `
The catalogue of replacement lands could not be read just now. Do not suggest
specific lands to add. Say that the shortlist is unavailable, and answer only
about the lands listed above, which came from the decklist itself.`
          : candidates.length
            ? `
Lands in the catalogue that make two or more of ${identity.join('')} and are not
already in this deck, ordered by how much Commander plays them. Suggest from this
list. If you suggest anything outside it, say why:
${renderCandidates(candidates, identity)}`
            : `
No land in the catalogue makes two or more of ${identity.join('')} that this deck
does not already run. Say so rather than inventing one.`;

      landSection = `

### Mana base worked out from the list
The weakest land slots in this deck, worst first. Computed from what each land
taps for against the deck's colours, not from memory:
${targetLines}
${candidateSection}

Recommend swaps as "cut X, play Y". Only cut a land the list above marks weak,
and keep the land count roughly where it is: this deck has ${deckContext?.counts?.lands ?? 0}.`;
      console.log(
        `land engine: ${targets.length} weak lands, ` +
        (candidates === null ? 'candidate lookup FAILED' : `${candidates.length} candidates`)
      );
    }

    const systemPrompt = buildSystemPrompt({ deckContext, manaSection, decklist }) + landSection;
    console.log(`system prompt: about ${measure(systemPrompt).approxTokens} tokens`);

    // ------------------------------------------------------------- messages
    /* History is trimmed by size, not by a fixed count. Six turns was a guess
       that threw away the start of every real conversation. */
    const history: { role: string; content: string }[] = [];
    let budget = 24000; // characters
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const m = conversationHistory[i];
      const content = String(m?.content ?? '');
      if (!content) continue;
      if (budget - content.length < 0) break;
      budget -= content.length;
      history.unshift({
        role: m.type === 'user' || m.role === 'user' ? 'user' : 'assistant',
        content,
      });
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: message },
    ];

    const tools = [
      {
        type: 'function',
        function: {
          name: 'create_chart',
          description:
            'Draw a chart. Only call this when the user asked for a picture, a breakdown or a distribution. Do not call it to decorate an answer about which cards to change.',
          parameters: {
            type: 'object',
            properties: {
              chart_type: { type: 'string', enum: ['bar', 'pie', 'line'] },
              title: { type: 'string' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { name: { type: 'string' }, value: { type: 'number' } },
                  required: ['name', 'value'],
                },
              },
            },
            required: ['chart_type', 'title', 'data'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_table',
          description: 'A table comparing cards or listing swaps. Good for "cut this, play that".',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              headers: { type: 'array', items: { type: 'string' } },
              rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
            },
            required: ['title', 'headers', 'rows'],
          },
        },
      },
    ];

    /* The last resort, and it is now genuinely last.
     *
     * Everything above this line is ours. What is left is the handful of
     * questions the catalogue cannot settle, and for those we ask, because half
     * an answer beats none. When the ask fails, for any reason at all, the
     * player gets `nothingToAnswerWith` rather than an error, because an error
     * is what made the page print an empty message twice into the database. */
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.warn('no gateway key configured; answering with what we hold instead');
      return json(saidPlainly(nothingToAnswerWith(whatWeHave), conversationId));
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: responseStyle === 'detailed' ? 0.7 : 0.3,
        // 400 tokens could not fit a list of land swaps, which is part of why
        // the answers read as thin.
        max_tokens: responseStyle === 'detailed' ? 2400 : 1100,
        tools,
      }),
    });

    if (!response.ok) {
      /* LOG EVERY REFUSAL, including the two that are answered rather than
         thrown. These two returned early and silently, so a 402 left the
         function log ending at "system prompt: about N tokens" with nothing
         after it, which reads exactly like a hang. That is how the one real
         report of "I asked about a card and it had no response" came to be
         diagnosed three different ways before anyone read the edge log and
         found a 402 in 194 ms. A refusal that is invisible costs more to
         diagnose than the refusal itself. */
      console.error(`gateway refused: ${response.status} for model ${MODEL}`);
      if (response.status !== 429 && response.status !== 402) {
        console.error('gateway body:', await response.text());
      }

      /* A REFUSAL IS NOT AN ERROR STATUS ANY MORE, AND THIS IS THE POINT.
       *
       * It used to return 402, the page threw, and the page's own catch printed
       * a fallback built out of the attached deck. Both questions asked after
       * the credits ran out had no deck attached, so both fallbacks
       * interpolated nothing and the database holds the same blank message
       * twice. A refusal that renders as an empty box is worse than the refusal.
       *
       * The rate limit case keeps its "try again" because a player CAN act on
       * it. The out of credits case does not, because they cannot, and telling
       * somebody to retry a thing that will fail identically is a small lie. */
      const said = response.status === 429
        ? `That went out too fast. Give it a moment and ask again.\n\n${nothingToAnswerWith(whatWeHave)}`
        : nothingToAnswerWith(whatWeHave);
      return json(saidPlainly(said, conversationId));
    }

    const ai = await response.json();
    let assistantMessage: string = ai.choices?.[0]?.message?.content ?? '';
    const toolCalls = ai.choices?.[0]?.message?.tool_calls;

    // --------------------------------------------------------------- visuals
    const visualData: { charts: Chart[]; tables: any[] } = { charts: [], tables: [] };
    const wantsPicture =
      ASKS_FOR_A_PICTURE.test(String(message ?? '')) ||
      ASKS_ABOUT_CURVE.test(String(message ?? '')) ||
      ASKS_ABOUT_COLOUR_BALANCE.test(String(message ?? ''));

    if (Array.isArray(toolCalls)) {
      for (const call of toolCalls) {
        try {
          const args = JSON.parse(call.function.arguments);
          if (call.function?.name === 'create_chart') {
            if (!wantsPicture) {
              console.log('dropped a chart the question did not ask for:', args.title);
              continue;
            }
            visualData.charts.push({ type: args.chart_type, title: args.title, data: args.data });
          } else if (call.function?.name === 'create_table') {
            visualData.tables.push({ title: args.title, headers: args.headers, rows: args.rows });
          }
        } catch (e) {
          console.log('unreadable tool call, skipped:', e);
        }
      }
    }

    // Charts the question asked for that the model did not draw itself.
    for (const chart of chartsFor(String(message ?? ''), deckContext)) {
      if (!visualData.charts.some(c => c.title === chart.title)) visualData.charts.push(chart);
    }

    if (!assistantMessage) {
      if (visualData.charts.length || visualData.tables.length) {
        assistantMessage = 'Here is what the deck looks like.';
      } else {
        // An empty answer is a refusal wearing a success. Say so.
        console.warn('gateway returned nothing to say');
        return json(saidPlainly(nothingToAnswerWith(whatWeHave), conversationId));
      }
    }

    // ----------------------------------------------------------------- cards
    /* Resolved against our own catalogue, not against whatever the model wrote
       in a "Referenced Cards" line. A name the catalogue does not know is a name
       the model invented, and it is silently dropped. */
    const { names, explicitCount } = extractCardNames(assistantMessage);
    const cards = await resolveCards(supabase, names, explicitCount);
    console.log(`cards: ${names.length} candidate names (${explicitCount} marked up), ${cards.length} resolved`);

    /* The section was only ever a parsing hook. Now that the prose is parsed
       directly it is noise at the end of an answer, so it comes out. */
    assistantMessage = assistantMessage
      .replace(/\n*\**Referenced Cards?:?\**[^\n]*(?:\n(?!\n)[^\n]*)*/i, '')
      .trim();

    const result = {
      message: assistantMessage,
      cards,
      visualData: visualData.charts.length || visualData.tables.length ? visualData : null,
      conversationId,
      answeredFrom: 'gateway',
      success: true,
    };

    responseCache.set(key, { data: result, at: Date.now() });
    if (responseCache.size > 100) {
      const oldest = [...responseCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      responseCache.delete(oldest[0]);
    }

    return json(result);
  } catch (error) {
    /* The fault goes in the log, where it can be fixed, and a sentence goes to
       the player, where it can be read. Returning the exception text as `error`
       made the page throw and print an empty box, and it also put our internal
       wording in front of somebody who cannot act on it. */
    console.error('tutor failed:', error);
    return json({
      message: [
        'Something on our side went wrong reading that. It is not your question and it is not your deck.',
        'Try again in a moment. If it keeps happening, the fault is ours to fix.',
      ].join('\n\n'),
      cards: [],
      visualData: null,
      answeredFrom: 'nothing',
      standing: 'refused',
      success: true,
    });
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
