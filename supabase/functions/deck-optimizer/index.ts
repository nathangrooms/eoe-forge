/**
 * Deck optimiser.
 *
 * THERE IS NO LANGUAGE MODEL IN THIS FUNCTION ANY MORE
 * ----------------------------------------------------
 * The owner, asked what this should run on once the gateway stopped answering:
 * *"they should run automatically through our engine, I dont want to use any
 * LLM we have so much knowledge?"*
 *
 * That was already nearly true and nobody had finished it. The engine ranked
 * every candidate itself, wrote its own sentence under each one, chose the cuts,
 * scored the deck and paired the land trades. The gateway was handed that
 * finished work and asked to pick from it. Measured over the 39 leaf fields the
 * old `deck_analysis` tool returned, 29 were fields this file computed before it
 * asked, 9 were derivable from data already in hand, and 1 was judgement.
 *
 * So the ranked list, its roles and its reasons ARE the answer now.
 *
 * The order of operations:
 *
 *   1. EVALUATE   Score the deck and choose its cuts, from the decklist alone.
 *                 First, not seventh, because the mana base it measures is an
 *                 input to the ranking — see (3).
 *   2. RETRIEVE   Every printing legal in the format whose colour identity is
 *                 within the commander's. No limit — see (3).
 *   3. RANK       Score the whole pool with the in-house engine, then truncate.
 *                 Never the other way round: an earlier bug in this repo took
 *                 `.limit(40)` before ranking, which ranks an arbitrary slice
 *                 of the table very carefully.
 *   4. CHOOSE     Pick from the ranked list one card at a time, crediting each
 *                 pick to the deck before choosing the next. See `chooseCards`.
 *   5. MEASURE    Re-score the deck with each change applied, so the power
 *                 delta beside a swap is a measurement rather than an opinion.
 *   6. ATTACH     Real card id, price, image and collection ownership.
 *
 * Nothing needs validating any more, because nothing is taken from anywhere it
 * could be wrong. Every card named here came out of the ranked pool or the
 * user's own decklist, so it exists, it is legal in the format, it is inside the
 * commander's colour identity and it is not already in the deck — all four by
 * construction rather than by checking afterwards.
 *
 * WHAT THIS FUNCTION WILL NOT SAY
 * -------------------------------
 * `strategy` comes back empty. How to pilot a deck and where its decision points
 * are is judgement, and there is no measurement here that produces it. An empty
 * list is the honest way to say so; a sentence assembled to fill the space would
 * be the one invented thing in a response that is otherwise all measurement.
 *
 * LANDS ARE RANKED SEPARATELY, AND THIS IS WHY
 * --------------------------------------------
 * Step 2 used to rank lands with the same scorer as spells and hand the top
 * forty to the model. That scorer has four signals, and three of them are the
 * same number for every land in existence: they all carry the `land` role tag,
 * they are all mana value 0, and none has a mana cost so none has a castability
 * figure. Only tag synergy moved — and producing two colours is not a tag.
 *
 * Measured on the live catalogue on 2026-08-20, for the real four-colour Atraxa
 * deck `e0909132-5a48-4416-924c-dd2374d3d34d` (883 ranked lands in identity):
 *
 *                        before   after
 *   Command Tower          #438      #1
 *   Exotic Orchard         #478      #2
 *   City of Brass          #487      #7
 *   Mana Confluence        #660     #30
 *   Path of Ancestry       #700     #36
 *   The Gold Saucer          #4    #198
 *   Fountainport             #1    #159
 *
 * The best land in Commander was 438th of 883 in a four-colour deck, and the
 * forty that reached the answer contained no mana fixing at all. The owner's
 * report was "Lands was suggesting just basic lands too, nothing special about
 * them" — correct, and the basics were the visible half of it. `lands.ts` holds
 * the replacement and the reasoning behind every weight in it.
 *
 * Basics are never offered as candidates: `ineligibility` refuses the
 * `basic-land` tag outright. What a deck still needs is COUNTED, in
 * `basicFiller`, from its own coloured pip demand — one line instead of four
 * card tiles.
 *
 * LAND SWAPS, AND WHY LANDS GO FIRST
 * ----------------------------------
 * `landReplacements` pairs the weakest land in the deck with the best land it
 * could play instead. It does not go near the model: every term in the
 * comparison is measured, both sides are scored by the same function, and a
 * pair is only offered when it can be said in plain words what improves. See
 * `pairLandSwaps`.
 *
 * `fillPlan` counts how many of a short deck's empty slots are lands. A deck
 * twelve cards short and nine lands short has three spell slots, not twelve,
 * and that split is now stated once, here, rather than left for the reader to
 * work out from two numbers on two different tabs.
 *
 * IT IS ALSO THE BUDGET FOR THE LAND ADD LIST. A deck already at a hundred
 * cards has nowhere to put a land, so being four lands short is a reason to
 * TRADE a land, not to add one. That list used to run to eight regardless, and
 * a full deck was told to add eight lands it had no room for.
 *
 * RESPONSE SHAPE
 * --------------
 * Every field the previous version returned is still returned, with the same
 * name, type and meaning, because a UI is built against it. Three of them have
 * stopped being null: `currentPowerLevel`, `projectedPowerLevel` and
 * `edhImpact` are measured now. `strategy` is the one that is deliberately
 * empty. New fields are documented at `buildResponse` below.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

import { Catalog, normalizeName, type CatalogRow } from './catalog.ts';
import { CardIndex, isBasicLand, isLandCard } from './validate.ts';
import {
  evaluateUserDeck,
  toSwapTargets,
  type DeckEvaluation,
  type ResolvedDeckLine,
  type SwapTarget,
} from './deck-brain.ts';
import {
  buildCandidateQuery,
  buildReason,
  isLegalIn,
  withinIdentity,
  cardRole,
  deriveDeckProfile,
  gapRoles,
  isCommanderFormat,
  normalizeIdentity,
  normalizeRow,
  popularityCoverage,
  rankCandidates,
  roleShortfall,
  ROLES,
  scoreCandidate,
  type CandidateCard,
  type Color,
  type DeckCard,
  type DeckProfile,
  type Recommendation,
  type Role,
} from './_engine/advise/index.ts';
import { pipDemand } from './_engine/build/generate.ts';
import { planForCommander, type CommanderPlan } from './_engine/knowledge/behaviour.ts';
import { facetsForCard } from './_lib/deck/recommend/behaviour.ts';
import type { ManaColour, ManaProfile } from './_engine/playability/castability.ts';
import {
  basicColourOf,
  basicFiller,
  pairLandSwaps,
  rankLands,
  type BasicFiller,
  type DeckLand,
  type LandCandidate,
  type LandSwap,
  type RankedLand,
  MIN_SOURCES_PER_COLOUR,
} from './lands.ts';

/**
 * One line of the user's deck, resolved against the catalogue.
 *
 * Declared here now that `swap-targets.ts` is gone. `card` is null when the
 * name did not resolve, and every downstream reader has to handle that rather
 * than assume the client sent real card names.
 */
interface DeckEntry {
  name: string;
  card: CandidateCard | null;
  quantity: number;
  isCommander: boolean;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Bumped whenever the way an answer is chosen changes. */
const ENGINE_VERSION = 'deck-optimizer/6-engine-only';

/** How many ranked non-land candidates `chooseCards` picks from. */
const CANDIDATE_LIMIT = 120;
/** How many ranked land candidates the land sections pick from. */
const LAND_CANDIDATE_LIMIT = 40;
/**
 * The most lands ever named as additions.
 *
 * A deck can be twenty-nine lands short, and naming twenty-nine lands is what
 * produced "Forest x3, Island x3, Plains x3, Swamp x3" on a real deck. Past
 * about eight there is nothing left to say that is not "and then basics", and
 * that is said once, as a count, by `basicFiller`.
 *
 * It is a CEILING on top of `fillPlan.landSlots`, never a target. A deck with
 * no empty slots gets no land additions at all, however far under the land
 * target it is, because there is nowhere to put one.
 */
const LAND_ADD_ASK_LIMIT = 8;
/**
 * How many land-for-land trades to offer.
 *
 * These are not asked of the model at all: every term in the comparison is
 * measured, so `pairLandSwaps` builds them. Six because a swap is two cards to
 * read and a mana base to think about, and a list longer than that stops being
 * read at all.
 */
const LAND_SWAP_LIMIT = 6;
/** Extra candidates surfaced per role the deck is short of. */
const PER_ROLE_LIMIT = 12;
/** How many cut targets to rank. */
const SWAP_TARGET_LIMIT = 14;

/**
 * How many suggestions carry a measured power delta.
 *
 * `edhImpact` is the deck's score with that one change applied, minus its score
 * now, and each one costs a whole re-evaluation. Measured on the four real
 * decks below, one evaluation of a hundred-card deck runs in single-digit
 * milliseconds, so twenty is affordable and a hundred would not be. Rows past
 * this keep `edhImpact: null`, which the client already renders as nothing.
 */
const IMPACT_BUDGET = 20;

/**
 * The smallest power delta worth printing.
 *
 * The score has one decimal, so anything under half of that rounds to +0.0 and
 * the badge would read as a claim where there is none. `PowerImpactBadge`
 * already hides deltas below 0.05; this makes the wire agree with the screen
 * rather than leaving the two to drift.
 */
const IMPACT_FLOOR = 0.05;


/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  try {
    const body = await req.json();
    const {
      deckContext,
      edhAnalysis = null,
      useCollection = false,
      collectionCards = [],
      excludeSwaps = [],
    } = body ?? {};

    if (!deckContext) throw new Error('deckContext is required');

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY are not configured');
    }

    const catalog = new Catalog({
      url: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      authorization: req.headers.get('Authorization'),
    });

    const result = await optimise({
      catalog,
      deckContext,
      edhAnalysis,
      useCollection: Boolean(useCollection),
      collectionCards: Array.isArray(collectionCards) ? collectionCards.map(String) : [],
      excludeSwaps: Array.isArray(excludeSwaps) ? excludeSwaps.map(String) : [],
      startedAt,
    });

    /*
     * There is no 402 or 429 branch here any more, and there cannot be one.
     *
     * Those two statuses only ever came from one place: an HTTP response from
     * the gateway, read in `callModel`. Nothing in this function makes an
     * outbound request other than to our own database, so neither status has a
     * source. They were also the reason this endpoint was useless the day the
     * workspace ran out of credits: `optimise` returned early on
     * `payment_required`, the engine sections were never reached, and a player
     * got "AI credits exhausted" instead of the ranked pool, the cut list, the
     * land trades and the power score the server had already worked out.
     */
    return json({ analysis: result.analysis }, 200);
  } catch (error) {
    console.error('Deck optimizer error:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Unknown error', type: 'error' },
      500
    );
  }
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/* ------------------------------------------------------------------ *
 * The pipeline
 * ------------------------------------------------------------------ */

interface OptimiseInput {
  catalog: Catalog;
  deckContext: Record<string, unknown>;
  edhAnalysis: Record<string, unknown> | null;
  useCollection: boolean;
  collectionCards: string[];
  excludeSwaps: string[];
  startedAt: number;
}

/**
 * One shape, because there is one outcome.
 *
 * It stays a tagged union rather than collapsing to the record, so a future
 * failure that genuinely cannot produce an answer has somewhere to go without
 * reintroducing the pattern where a caller reads an error as an analysis.
 */
type OptimiseResult = { kind: 'ok'; analysis: Record<string, unknown> };

async function optimise(input: OptimiseInput): Promise<OptimiseResult> {
  const { catalog, deckContext, startedAt } = input;

  const format = String(deckContext.format ?? 'commander').toLowerCase();
  // The client sends `edh` for Commander; the catalogue's legality key is
  // `commander`, and asking for `legalities->>'edh'` would match nothing.
  const legalityKey = format === 'edh' ? 'commander' : format;
  const commanderish = isCommanderFormat(legalityKey);

  const rawCards = Array.isArray(deckContext.cards)
    ? (deckContext.cards as Record<string, unknown>[])
    : [];
  // `commander` is forwarded from the client verbatim, and the only shape this
  // read used to accept was `{ name }`. A bare string — the other shape a deck
  // store plausibly holds — made `.name` undefined, which is indistinguishable
  // here from "this deck has no commander". That is not a loud failure: colour
  // identity then falls through to the deck-union branch, which is a SUPERSET
  // of the commander's identity, so the SQL pool widens to include cards the
  // deck may not legally play and every downstream check passes them, because
  // every downstream check measures against this widened identity. It degrades
  // into wrong answers rather than into no answer, so it is read defensively.
  const commanderRaw = deckContext.commander;
  const commanderName = String(
    typeof commanderRaw === 'string'
      ? commanderRaw
      : ((commanderRaw as { name?: unknown } | null)?.name ?? '')
  ).trim();

  /**
   * Cards the caller has already dealt with, by normalised name.
   *
   * Declared here rather than beside the ranking because the cut list is chosen
   * in step 3b now and has to honour it too. The panel sends this when a player
   * asks for a fresh set of swaps: a suggestion they already saw and passed on
   * must not come straight back.
   */
  const excludedNames = new Set(input.excludeSwaps.map(normalizeName));

  /* --- 1. Resolve the deck against the catalogue --------------------- */
  // Every downstream measurement (tags, roles, curve, colour identity) comes
  // from these rows, not from what the client claimed.
  const deckNames = rawCards.map(c => String(c.name ?? '')).filter(Boolean);
  const lookupNames = commanderName ? [...deckNames, commanderName] : deckNames;
  const deckRows = await catalog.cardsByName(lookupNames, legalityKey);
  const deckIndex = new CardIndex(deckRows, legalityKey);

  const commanderCard = commanderName ? deckIndex.resolve(commanderName) : null;

  /* --- 2. Colour identity, measured -------------------------------- */
  // The commander's own row is the authority. With no commander row, the union
  // of the deck's resolved identities is the honest fallback: it is measured
  // from real cards, and it can only be a superset of what the deck already
  // plays, so it never excludes a card the deck legally contains.
  let colorIdentity: Color[];
  let identitySource: string;
  if (commanderCard) {
    colorIdentity = commanderCard.colorIdentity;
    identitySource = 'commander';
  } else {
    const union = new Set<string>();
    for (const name of deckNames) {
      for (const col of deckIndex.resolve(name)?.colorIdentity ?? []) union.add(col);
    }
    colorIdentity = normalizeIdentity([...union]);
    identitySource = commanderName ? 'deck-union (commander not in catalogue)' : 'deck-union';
  }

  /* --- 3. Profile the deck ----------------------------------------- */
  // Two views of the same lines. `deckEntries` carries the normalised card the
  // ranker and the validator read; `deckLines` carries the raw catalogue row,
  // because the castability engine needs `oracle_text` and `normalizeRow` does
  // not keep it.
  const rowByName = new Map<string, CatalogRow>();
  for (const row of deckRows) {
    const key = normalizeName(row.name);
    if (!rowByName.has(key)) rowByName.set(key, row);
  }

  const deckEntries: DeckEntry[] = rawCards.map(c => {
    const name = String(c.name ?? '');
    return {
      name,
      card: deckIndex.resolve(name),
      quantity: Math.max(1, Math.trunc(Number(c.quantity) || 1)),
      isCommander: false,
    };
  });
  if (commanderCard) {
    deckEntries.push({
      name: commanderCard.name,
      card: commanderCard,
      quantity: 1,
      isCommander: true,
    });
  }

  const deckLines: ResolvedDeckLine[] = deckEntries.map(e => ({
    name: e.name,
    row: rowByName.get(normalizeName(e.name)) ?? null,
    quantity: e.quantity,
    isCommander: e.isCommander,
  }));

  const unresolved = deckEntries.filter(e => !e.card).map(e => e.name);

  const profileCards: DeckCard[] = deckEntries
    .filter(e => e.card)
    .map(e => ({
      oracleId: e.card!.oracleId,
      name: e.card!.name,
      typeLine: e.card!.typeLine,
      cmc: e.card!.cmc,
      tags: e.card!.tags,
      quantity: e.quantity,
    }));

  /* --- 3b. The shared brain, FIRST. Score and cuts alike ------------ */
  // This is the same `evaluateDeck` the deck page calls, running on a
  // byte-identical copy of the engine. The score below and the cut order below
  // it come out of one computation, so the reason a card is at the top of the
  // cut list IS the reason the score is what it is.
  //
  // IT RUNS BEFORE THE RANKING NOW, and that is the point of moving it. The
  // mana base it measures is an input the ranker was never given: `castability`
  // carries the second-largest weight of the eight scoring signals (2.5 of
  // 12.5) and `scoreCandidate` is deliberately silent when the profile has no
  // mana profile to measure against, so it contributed nothing to any
  // suggestion this function has ever made. Same rule as everywhere else in the
  // engine: unknown produces no signal rather than a zero. The consequence was
  // simply that nobody had supplied the knowledge.
  //
  // `input.edhAnalysis` is still accepted and ignored for this purpose; nothing
  // here reads a castability figure out of it. It used to be the only source,
  // and it was a scrape.
  let evaluation: DeckEvaluation | null = null;
  const evalStarted = Date.now();
  try {
    evaluation = evaluateUserDeck(deckLines, legalityKey);
  } catch (error) {
    // A scoring failure must not take the whole optimisation down. The cut list
    // then comes back empty and the response says so, which is the honest
    // degradation: no evidence is reported as no evidence.
    console.error('deck evaluation failed', error);
  }
  const evalMs = Date.now() - evalStarted;

  const manaProfile: ManaProfile | null = evaluation?.playability.profile ?? null;

  /* --- 3c. What the commander wants --------------------------------- */
  /*
   * The OTHER signal the ranker was never given, and the larger of the two.
   *
   * `scoreCandidate` scores commander fit with `planFit(profile.commanderPlan,
   * card)`. Section 10e of CLAUDE.md records feeding it the card half of that
   * comparison — facets compiled from the pool's oracle text — and reports the
   * signal as repaired. It was half repaired. `commanderPlan` was never set on
   * this profile, and `planFit` returns NO_FIT for a null plan before it looks
   * at a single facet, so the facets went on being computed for every row in a
   * twenty-four thousand card pool and thrown away.
   *
   * Between them, commander fit (2.2) and castability (2.5) are 4.7 of the
   * 12.5 total signal weight. Every suggestion this function made was ranked on
   * the remaining 7.8, which is why role gap at 3.0 dominated so completely
   * that ten suggestions in a row could all chase one three-card gap.
   *
   * The plan is read off the commander's own ability record, so it is silent
   * for a commander the compiler cannot read rather than guessed at.
   */
  const commanderRow = commanderCard ? rowByName.get(normalizeName(commanderCard.name)) : undefined;
  const commanderPlan: CommanderPlan | null = commanderRow
    ? planForCommander({
        name: commanderRow.name,
        typeLine: commanderRow.type_line ?? null,
        facets: facetsForCard(commanderRow).facets,
        tags: commanderRow.tags ?? null,
      })
    : null;

  const profile = deriveDeckProfile({
    format: legalityKey,
    colorIdentity,
    cards: profileCards,
    // Both of these were missing. See the two notes above.
    manaProfile,
    commanderPlan,
  });

  const swapTargets = evaluation
    ? toSwapTargets(
        evaluation.cuts.filter(c => !excludedNames.has(normalizeName(c.name))),
        SWAP_TARGET_LIMIT
      )
    : [];

  if (evaluation) {
    console.log(
      `evaluation: power ${evaluation.power.score}/10 (${evaluation.power.band}) in ${evalMs}ms, ` +
        `castability ${evaluation.power.readout.averagePct?.toFixed(1) ?? 'n/a'}%, ` +
        `${evaluation.power.readout.hardToCastCount} card(s) under ` +
        `${evaluation.power.readout.threshold}%, ${evaluation.cuts.length} cut candidates; ` +
        `commander plan: ${commanderPlan ? `${commanderPlan.wants.length} wants` : 'none'}`
    );
  }

  /* --- 4. The counts this response has always reported -------------- */
  const requiredCards = commanderish ? 100 : 60;
  const totalCards = deckEntries.filter(e => !e.isCommander).reduce((s, e) => s + e.quantity, 0);
  const totalWithCommander = totalCards + (commanderCard ? 1 : 0);
  const missingCards = Math.max(0, requiredCards - totalWithCommander);
  const excessCards = Math.max(0, totalWithCommander - requiredCards);

  const landCount = deckEntries
    .filter(e => !e.isCommander && e.card && isLandCard(e.card))
    .reduce((s, e) => s + e.quantity, 0);
  const idealLandCount = commanderish ? 37 : 24;

  /* --- 4b. Which empty slots are lands ------------------------------ */
  // Counted here, once, and reported. Everything downstream that has an
  // opinion about the order to work in reads THIS rather than deriving its own
  // split, so the number in the prompt, the number on the tab strip and the
  // number on the additions header cannot disagree.
  const plan = buildFillPlan({ missingCards, landCount, idealLandCount });

  /* --- 5. Retrieve, then rank. Never the reverse. ------------------- */
  const query = buildCandidateQuery(profile);
  const poolStarted = Date.now();
  // Two reads, in parallel, because they answer different questions.
  //
  // `poolFor` NOW ASKS FOR `oracle_text`. It used to omit it, on the grounds
  // that the spell ranker never read it, and that stopped being true when
  // `planFit` was added to `rank.ts`: facets are compiled from that text and
  // the commander-fit signal is silent without them.
  // `landPoolFor` is the same query with
  // a `type_line ilike '%Land%'` filter and the text put back, and the text is
  // the only thing that says what a land taps for: Command Tower and Reliquary
  // Tower have the same empty colour identity and the same `land` tag, and
  // only the rules text separates a five-colour source from a colourless one.
  //
  // That method already existed and nothing called it. Ranking lands without
  // it is what put Command Tower 438th — see `lands.ts`.
  //
  // Affordable: measured 2026-08-20, `cards_unique` holds 1,194 commander-legal
  // lands in total, before any colour-identity filter narrows it further.
  const [poolRows, landRows, collectionOwned] = await Promise.all([
    catalog.poolFor(query, { withOracleText: true }),
    catalog.landPoolFor(query),
    catalog.ownedCollection(),
  ]);
  const poolMs = Date.now() - poolStarted;

  /* Behaviour facets, and why the ranker was blind without them.
     -----------------------------------------------------------
     `rank.ts` scores every candidate with `planFit(profile.commanderPlan,
     card)`, which reads `card.facets` and is deliberately SILENT for a card
     with no record rather than scoring it zero. Nothing here ever set that
     field, and `poolFor` was called without `withOracleText`, so there was
     nothing to set it from. The result was not a weak commander-fit signal, it
     was no commander-fit signal at all: every suggestion this function has made
     was ranked without reference to what the commander actually does.

     This is the same omission the generator had, fixed there and not here. The
     comment above `poolFor` still said the pool text was never read, which was
     true when it was written and stopped being true when `planFit` was added.

     The memo is per warm instance and keyed on oracle id, which is safe only
     because the rows now always carry the text. See the longer note on the
     generator's `facetsForPoolRows`, which explains what goes wrong when a
     text-less pool writes into the same memo. */
  const facetStarted = Date.now();
  const facetMemo = new Map<string, readonly string[]>();
  for (const row of poolRows) {
    const id = row.oracle_id;
    if (!id || facetMemo.has(id)) continue;
    facetMemo.set(id, facetsForCard(row).facets);
  }
  const facetMs = Date.now() - facetStarted;

  const pool: CandidateCard[] = poolRows.map(r => ({
    ...normalizeRow(r, legalityKey),
    facets: facetMemo.get(r.oracle_id ?? '') ?? null,
  }));

  const rankStarted = Date.now();
  // No limit passed: the full legal pool is scored, and only then sliced.
  const ranked = rankCandidates(pool, profile);
  const rankMs = Date.now() - rankStarted;

  console.log(
    `pool: ${poolRows.length} rows in ${poolMs}ms (legality index=${query.usesIndex}); ` +
      `facets for ${facetMemo.size} distinct cards in ${facetMs}ms; ` +
      `ranked ${ranked.length} distinct cards in ${rankMs}ms; ` +
      `identity=[${colorIdentity.join('') || '-'}] via ${identitySource}; ` +
      `${unresolved.length} deck names unresolved`
  );

  /* --- 6. Assemble what the answer is chosen from ------------------- */
  const usable = ranked.filter(r => !excludedNames.has(normalizeName(r.card.name)));

  const nonLand = usable.filter(r => !isLandCard(r.card));

  const gaps = gapRoles(profile);
  const offered = new Map<string, Recommendation>();
  for (const r of nonLand.slice(0, CANDIDATE_LIMIT)) offered.set(r.card.oracleId, r);
  // Make sure every role the deck is short of is actually represented, rather
  // than trusting one global slice to have covered it.
  for (const role of gaps) {
    let taken = 0;
    for (const r of nonLand) {
      if (taken >= PER_ROLE_LIMIT) break;
      if (!r.fillsRoles.includes(role)) continue;
      offered.set(r.card.oracleId, r);
      taken++;
    }
  }
  const candidates = [...offered.values()].sort(
    (a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name)
  );
  const basics = await catalog.basicLands(legalityKey, colorIdentity);

  /* --- 7b. Rank the lands as lands ---------------------------------- */
  // The strongest land signal is "which colour is this deck short of sources
  // for", and that comes from the mana base the evaluation measured in step 3b.
  // Reusing that one measurement is what stops a second profile disagreeing
  // with the score on the same screen.

  const landPool: LandCandidate[] = landRows.map(row => ({
    ...normalizeRow(row, legalityKey),
    oracleText: row.oracle_text ?? null,
  }));

  const landRankStarted = Date.now();
  const landCandidates = rankLands({
    pool: landPool.filter(l => !excludedNames.has(normalizeName(l.name))),
    profile,
    manaProfile,
    identity: colorIdentity,
    owned: collectionOwned,
    normalizeName,
    limit: LAND_CANDIDATE_LIMIT,
  });
  /*
   * The deck's OWN lands, with their rules text, for the swap pairing.
   *
   * Taken out of `landPool` rather than out of `deckEntries`, because the deck
   * rows were resolved against `poolFor`, which deliberately does not select
   * `oracle_text` — and the text is the only thing that says what a land taps
   * for. `landPoolFor` is the same query with the text put back and no "not in
   * the deck" filter on it, so every land the deck plays that is legal and in
   * identity is already in hand. One that is not (an off-identity land, or one
   * the catalogue does not know) is left out rather than guessed at: a land
   * whose text cannot be read cannot be compared with one whose text can.
   */
  const landByKey = new Map(landPool.map(l => [normalizeName(l.name), l]));
  const deckLandNames = new Map<string, string>();
  const deckLands: DeckLand[] = [];
  for (const entry of deckEntries) {
    if (entry.isCommander || !entry.card || !isLandCard(entry.card)) continue;
    const key = normalizeName(entry.name);
    const withText = landByKey.get(key);
    if (!withText || deckLandNames.has(key)) continue;
    // The deck's own spelling, kept because a cut is applied by name and the
    // catalogue's spelling need not match the deck's exactly.
    deckLandNames.set(key, entry.name);
    // The copy count travels with it. A swap names one card, so a land the
    // deck runs several of is never offered as the card to cut.
    deckLands.push({ land: withText, quantity: entry.quantity });
  }
  console.log(
    `lands: ${landPool.length} in identity, ${landCandidates.length} offered in ` +
      `${Date.now() - landRankStarted}ms; top: ` +
      landCandidates
        .slice(0, 5)
        .map(l => `${l.card.name} ${l.score.toFixed(2)}`)
        .join(', ')
  );

  /** Basic land names available to this identity, by colour. */
  const basicNames = new Map<ManaColour | 'C', string>();
  for (const row of basics) {
    const colour = basicColourOf(row.type_line ?? '');
    if (colour && !basicNames.has(colour)) basicNames.set(colour, row.name);
  }

  /**
   * Coloured pips the deck's own spells demand.
   *
   * `pipDemand` is the deck generator's function, called rather than copied so
   * "what does this deck cost" has one answer. It reads `card.manaCost` and
   * `quantity` and nothing else; the other four fields of `GeneratedEntry` are
   * filled to satisfy the type and are never read.
   */
  const pips = pipDemand(
    deckEntries
      .filter(e => e.card && !isLandCard(e.card))
      .map(e => ({
        card: e.card!,
        quantity: e.quantity,
        reason: '',
        score: 0,
        bucket: 'flex' as const,
        preferred: false,
      }))
  );

  /* --- 8. Choose the answer ----------------------------------------- */
  const sections = buildSections({
    candidates,
    landCandidates,
    swapTargets,
    deckEntries,
    profile,
    commanderish,
    legalityKey,
    identity: colorIdentity,
    threshold: evaluation?.power.readout.threshold ?? null,
    missingCards,
    excessCards,
    fillPlan: plan,
  });
  console.log(
    `chose: ${sections.additions.length} additions, ${sections.removals.length} removals, ` +
      `${sections.replacements.length} replacements, ${sections.landRecommendations.length} ` +
      `land adds (${plan ? plan.landSlots : 0} land slots), ${sections.issues.length} issues`
  );

  /* --- 9a. Land for land, measured -------------------------------- */
  // Built after the sections, for one reason: a land the response has already
  // told the user to ADD must not turn up again as the incoming half of a
  // trade, and a land it has told them to CUT must not turn up as the outgoing
  // half. Both of those lists only exist once `buildSections` has chosen, so
  // the pairing waits for them.
  //
  // `pairLandSwaps` compares two lands on the same measured signals and refuses
  // any pair that cannot be explained in plain words.
  const landSwaps = pairLandSwaps({
    deckLands,
    candidates: landCandidates,
    profile,
    manaProfile,
    identity: colorIdentity,
    owned: collectionOwned,
    normalizeName,
    /*
     * A basic may be traded away unless an empty slot is already earmarked
     * for a land.
     *
     * `plan.landSlots` is exactly that count. When it is above zero there is
     * somewhere to put a better land without cutting anything, and trading a
     * Forest for Command Tower would spend a swap to finish one land shorter
     * than it started. When it is zero — a full deck, or one whose empty slots
     * are all spell slots — a trade is the only way to play a better land, and
     * trading a basic for a dual is the best land upgrade there is.
     */
    allowBasicCuts: !plan || plan.landSlots === 0,
    // Everything the response already asks the user to add. Offering the same
    // land as both "add this" and "trade for this" is two answers to one
    // question, and applying both would put two copies of a singleton card in
    // a Commander deck.
    skipIn: new Set([
      ...sections.landRecommendations
        .filter(l => l.type === 'add')
        .map(l => normalizeName(String(l.name))),
      ...sections.additions.map(a => normalizeName(String(a.name))),
      ...sections.replacements.map(r => normalizeName(String(r.add))),
    ]),
    // Everything the response already asks the user to cut. A card offered as
    // a cut twice in one response is a card that gets removed twice if they
    // take both, and for a land they run one copy of, the second removal has
    // nothing to remove.
    skipOut: new Set([
      ...sections.landRecommendations
        .filter(l => l.type === 'remove')
        .map(l => normalizeName(String(l.name))),
      ...sections.removals.map(r => normalizeName(String(r.name))),
      ...sections.replacements.map(r => normalizeName(String(r.remove))),
    ]),
    limit: LAND_SWAP_LIMIT,
  });
  sections.landReplacements = landSwaps.map(swap => toLandReplacement(swap, deckLandNames, sections));
  console.log(
    `land swaps: ${landSwaps.length} of ${deckLands.length} deck lands, ` +
      `basic cuts ${!plan || plan.landSlots === 0 ? 'allowed' : 'withheld'}; ` +
      landSwaps.map(s => `${s.out.card.name}->${s.in.card.name} +${s.gain.toFixed(2)}`).join(', ')
  );

  const enriched = await attachRealData({
    catalog,
    sections,
    legalityKey,
    collectionCards: input.collectionCards,
    collectionOwned,
  });

  /* --- 9b. The basics, counted rather than recommended --------------- */
  // Measured from the deck's own pip demand and its own source counts.
  const filler = basicFiller({
    landCount,
    idealLandCount,
    recommendedLands: enriched.landRecommendations.filter(l => l.type === 'add').length,
    // The slots the deck HAS, not the distance to its land target. `plan` is
    // null for a deck that is not short of cards, and that deck has no slot to
    // fill: it needs a trade, which the land swaps answer. See `basicFiller`.
    emptyLandSlots: plan ? plan.landSlots : 0,
    identity: colorIdentity,
    pips,
    manaProfile,
    basicNames,
  });

  /* --- 9c. What each change is worth, MEASURED ---------------------- */
  // The one thing in this response that used to be an opinion. `edhImpact` was
  // whatever number came back beside a card name, and `projectedPowerLevel` was
  // the same. Both are now the deck re-scored with that change applied, by the
  // same evaluator that produced the score on the card above them, so a reader
  // can check them by applying the swap and running the pass again.
  //
  // The rows come from the pool that was already fetched, so measuring costs no
  // extra request. `poolFor` is asked for `oracle_text` and `landPoolFor`
  // always carries it, which matters here for the same reason it matters in
  // `toEngineCard`: without the text the castability engine cannot see that a
  // Signet makes mana, and the projected score would be measured against a deck
  // whose mana base had vanished.
  const addable = new Map<string, CatalogRow>();
  for (const row of [...poolRows, ...landRows]) {
    const key = normalizeName(row.name);
    if (key && !addable.has(key)) addable.set(key, row);
  }

  const impact = measureImpact({
    deckLines,
    addable,
    legalityKey,
    sections: enriched,
    current: evaluation?.power.score ?? null,
  });

  /*
   * How trustworthy the popularity prior was on this pool.
   *
   * `popularityCoverage` has existed in the ranker since the day a broken
   * `cards_unique` rebuild left every card whose name begins J-Z with no
   * `edhrec_rank`, which put eight generated decks entirely in the first half
   * of the alphabet. It was written to make sure that could never be silent
   * again, and nothing in this function called it. Measured on the live view on
   * 2026-08-29 the halves are 99.9% and 99.7%, so it reports healthy today; the
   * point is that it will say so when it stops being.
   */
  const popularity = popularityCoverage(pool);
  if (popularity.skewedByName) {
    console.error(
      `popularity prior is skewed by name: A-I ${(popularity.earlyShare * 100).toFixed(1)}% ` +
        `ranked against J-Z ${(popularity.lateShare * 100).toFixed(1)}%. ` +
        `Suggestions on this pool are ordered on a broken column.`
    );
  }

  return {
    kind: 'ok',
    analysis: buildResponse({
      enriched,
      profile,
      landCount,
      idealLandCount,
      basicFiller: filler,
      fillPlan: plan,
      swapTargets,
      evaluation,
      projectedPowerLevel: impact.projected,
      impactsMeasured: impact.measured,
      colorIdentity,
      identitySource,
      unresolved,
      poolRows: poolRows.length,
      poolCards: ranked.length,
      candidatesOffered: candidates.length + landCandidates.length,
      usesIndex: query.usesIndex,
      commanderPlanWants: commanderPlan ? commanderPlan.wants.length : null,
      popularity,
      elapsedMs: Date.now() - startedAt,
    }),
  };
}

/* ------------------------------------------------------------------ *
 * The answer
 * ------------------------------------------------------------------ */

interface Sections {
  additions: Record<string, unknown>[];
  removals: Record<string, unknown>[];
  replacements: Record<string, unknown>[];
  landRecommendations: Record<string, unknown>[];
  /**
   * Land-for-land trades, in the SAME row shape as `replacements`.
   *
   * Same shape on purpose. The client builds a swap from a replacement row and
   * renders it with one component; giving lands a different shape would mean a
   * second builder and a second renderer, and those are what drift. Filled in
   * by the handler once `buildSections` has chosen, so a land is never both
   * added and traded for in one answer.
   */
  landReplacements: Record<string, unknown>[];
  /**
   * Problems with cards the deck already plays.
   *
   * Every one is a claim about a specific card the user owns, so every one has
   * to come from a column: a legality, a colour identity, a copy count or a
   * castability percentage. See `deckIssues`.
   */
  issues: Record<string, unknown>[];
  /** Every card accepted anywhere, for the one image/price/ownership lookup. */
  touched: Set<string>;
}

/**
 * Pick from the ranked list one card at a time, crediting each pick as it goes.
 *
 * THE DEFECT THIS EXISTS TO FIX, measured on four real decks on 2026-08-29.
 *
 * The previous code took `candidates.slice(0, n)`, and `candidates` is sorted
 * by a score whose largest term is `WEIGHTS.roleGap * shortfall`. A deck short
 * of three wincons therefore had every top candidate credited with the SAME
 * three-card gap, so all ten suggestions were wincons and every one of them
 * said "fills a wincon gap (0 of 3)" — including the tenth, by which point the
 * deck would have held seven. Ten answers to one question, nine of them
 * unusable, each carrying a sentence that had stopped being true.
 *
 * Choosing one at a time and adding it to the counts is all it takes. The
 * second pick is scored against a deck that already contains the first, so the
 * gap closes as it fills, the list spreads across the roles the deck is
 * actually short of, and the reason under each card is the reason it was
 * chosen at the moment it was chosen.
 *
 * This is also the job the language model was doing: "choose fifteen from a
 * ranked two hundred". It was doing it on judgement nobody could inspect. This
 * does it on the engine's own scores, and every step is re-derivable.
 *
 * The working profile is MUTATED rather than rebuilt each round on purpose.
 * `scoreCandidate` memoises castability on the profile object it is handed, and
 * a fresh object every round would throw that away and solve the same
 * hypergeometric twelve hundred times over. Nothing the memo depends on — a
 * card's mana cost, the deck's mana profile — is what changes here.
 */
function chooseCards(
  candidates: readonly Recommendation[],
  profile: DeckProfile,
  count: number
): Recommendation[] {
  if (count <= 0 || candidates.length === 0) return [];

  // A copy of the counts, so the caller's profile is not changed under it.
  const roleCounts = { ...profile.roleCounts } as Record<Role, number>;
  const working: DeckProfile = { ...profile, roleCounts };

  const order = new Map<string, number>();
  candidates.forEach((c, i) => order.set(c.card.oracleId, i));

  const taken = new Set<string>();
  const picks: Recommendation[] = [];

  for (let n = 0; n < count && picks.length < candidates.length; n++) {
    let best: Recommendation | null = null;
    let bestScore = -Infinity;

    for (const candidate of candidates) {
      if (taken.has(candidate.card.oracleId)) continue;
      const { score, signals, fillsRoles, shared } = scoreCandidate(candidate.card, working);
      // Ties fall back to the engine's own total order, which is where they
      // were already resolved. Re-deciding them here would be a second opinion
      // about the same two cards.
      const better =
        best === null ||
        score > bestScore ||
        (score === bestScore &&
          (order.get(candidate.card.oracleId) ?? 0) < (order.get(best.card.oracleId) ?? 0));
      if (!better) continue;
      bestScore = score;
      best = {
        card: candidate.card,
        score,
        signals,
        // Rebuilt, so the sentence is the one that was true when this card was
        // chosen rather than the one that was true before any of them were.
        reason: buildReason(signals),
        fillsRoles,
        sharedTags: shared,
      };
    }

    if (!best) break;
    taken.add(best.card.oracleId);
    picks.push(best);

    // The deck now holds it. Credit every role it serves, not only the one it
    // was scored on: `scoreCandidate` credits a card with its worst open gap
    // because a card fills one slot, but the card that fills that slot counts
    // against every role it actually serves.
    for (const role of ROLES) {
      if (cardRole(best.card, role)) roleCounts[role] = (roleCounts[role] ?? 0) + 1;
    }
  }

  return picks;
}

/**
 * Problems with cards the deck already plays.
 *
 * Every row here is a claim about one of the user's own cards, rendered
 * verbatim beside that card, so every row has to come out of a column rather
 * than out of a sentence. Four do:
 *
 *   legality        `legalities->>format` is not 'legal'
 *   colour identity the card's identity is not inside the commander's
 *   copy count      more than one copy of a nonbasic in a singleton format
 *   castability     the measured percentage, under the measured threshold
 *
 * The third is the one that has bitten this product. Stored verbatim in
 * `tutor_messages`, on a deck whose `format` column reads `commander`: "This is
 * already in your deck, but you only have one copy. You could add another copy
 * if you want more card draw." The optimiser has never made that mistake,
 * because it never suggests a card the deck holds, and it never CAUGHT it
 * either. Now it does, from `deck_cards.quantity`, which is the column that
 * settles it.
 *
 * An empty list is a real answer and it is the common one. A legal, singleton,
 * in-identity, castable deck has no issues of this kind, and saying so beats
 * manufacturing three.
 */
function deckIssues(args: {
  deckEntries: readonly DeckEntry[];
  swapTargets: readonly SwapTarget[];
  commanderish: boolean;
  legalityKey: string;
  identity: readonly Color[];
  /** Percentage under which the evaluator counted a card as hard to cast. */
  threshold: number | null;
}): Record<string, unknown>[] {
  const { deckEntries, swapTargets, commanderish, legalityKey, identity, threshold } = args;
  const issues: Record<string, unknown>[] = [];
  const named = new Set<string>();

  const add = (name: string, reason: string, severity: string, category: string) => {
    const key = normalizeName(name);
    if (!key || named.has(key)) return;
    named.add(key);
    issues.push({ card: name, reason, severity, category });
  };

  const formatName = legalityKey.charAt(0).toUpperCase() + legalityKey.slice(1);

  for (const entry of deckEntries) {
    const card = entry.card;
    if (!card) continue;

    if (!isLegalIn(card.legalities, legalityKey)) {
      add(entry.name, `Not legal in ${formatName}.`, 'high', 'Legality');
      continue;
    }
    if (!withinIdentity(card.colorIdentity, identity)) {
      add(
        entry.name,
        `Outside your commander's colours, so this deck cannot play it.`,
        'high',
        'Colour identity'
      );
      continue;
    }
    if (commanderish && entry.quantity > 1 && !entry.isCommander && !isBasicLand(card)) {
      add(
        entry.name,
        `${entry.quantity} copies. ${formatName} allows one of any card except basic lands.`,
        'high',
        'Deck rules'
      );
    }
  }

  // Castability, from the evaluation that produced the score on the same
  // screen. Only the cards it measured and found short: `source` reads
  // 'engine-castability' exactly when a real percentage came in under the
  // threshold, and a card with no figure is unmeasured rather than weak.
  for (const target of swapTargets) {
    if (target.source !== 'engine-castability' || target.castability === null) continue;
    if (threshold === null) continue;
    // Severity from the distance under the bar, not from a guess. Half the
    // threshold is the point at which a card is closer to uncastable than to
    // castable, and that is the only line in here with an argument behind it.
    const severity = target.castability < threshold / 2 ? 'high' : 'medium';
    add(target.name, target.reason, severity, 'Castability');
  }

  return issues;
}

/**
 * The whole answer, chosen from what the engine ranked.
 *
 * There is one of these now. It used to be the fallback beside
 * `validateSections`, reached only when the gateway failed — and never reached
 * on the failure we actually had, because a 402 returned before it.
 *
 * Every card named here came out of `rankCandidates`, `rankLands` or the user's
 * own decklist, so it exists, it is legal in the format, it is inside the
 * commander's colour identity and it is not already in the deck. All four hold
 * by construction: `ineligibility` refuses each one before a card is ever
 * scored. That is what makes the validation pass this file used to run
 * unnecessary rather than merely absent.
 */
function buildSections(args: {
  candidates: Recommendation[];
  landCandidates: RankedLand[];
  swapTargets: SwapTarget[];
  deckEntries: readonly DeckEntry[];
  profile: DeckProfile;
  commanderish: boolean;
  legalityKey: string;
  identity: readonly Color[];
  threshold: number | null;
  missingCards: number;
  excessCards: number;
  fillPlan: FillPlan | null;
}): Sections {
  const { candidates, landCandidates, swapTargets, missingCards, excessCards } = args;
  const touched = new Set<string>();

  /*
   * How many spell ideas to offer.
   *
   * `fillPlan.spellSlots` rather than `missingCards`, because a deck twelve
   * cards short and nine lands short has three spell slots. Offering it twelve
   * spells is offering nine it has no room for, and the fill plan already
   * counted that split for exactly this reason. The five extra are deliberate
   * headroom: a player picking three from eight is choosing, a player handed
   * three is being told.
   */
  const spellSlots = args.fillPlan ? args.fillPlan.spellSlots : missingCards;
  const spellAsk = spellSlots > 0 ? Math.max(spellSlots + 5, 15) : 0;

  const additions = chooseCards(candidates, args.profile, spellAsk).map(r => {
    touched.add(r.card.name);
    return {
      name: r.card.name,
      reason: r.reason,
      type: r.card.typeLine,
      category: categoryFor(r),
      priority: r.score >= 3 ? 'high' : r.score >= 1.5 ? 'medium' : 'low',
      /** Filled by `measureImpact` once every section is settled. */
      edhImpact: null,
      _card: r.card,
    };
  });

  const removals =
    excessCards > 0
      ? swapTargets.slice(0, Math.max(excessCards + 3, 10)).map(t => {
          touched.add(t.name);
          return {
            name: t.name,
            reason: t.reason,
            priority: 'medium',
            edhImpact: null,
            _card: null,
          };
        })
      : [];

  /*
   * A complete deck: pair the weakest cards with the strongest candidates.
   *
   * The incoming half goes through `chooseCards` for the same reason the
   * additions do. Before it did, the ten cards paired against the ten weakest
   * in the real Atraxa deck were Familiar Beeble Mascot, Swinging Ship, Sticky
   * Kavu Daredevil, Paladin Class, Luck Bobblehead, Patchwork Banner, Endurance
   * Bobblehead and Flusterstorm, and eight of the ten were credited with the
   * same three-card wincon gap.
   */
  const pairCount =
    missingCards === 0 && excessCards === 0 ? Math.min(10, swapTargets.length) : 0;
  const incoming = chooseCards(candidates, args.profile, pairCount);
  const replacements = incoming.map((r, i) => {
    const t = swapTargets[i];
    touched.add(t.name);
    touched.add(r.card.name);
    return {
      remove: t.name,
      removeReason: t.reason,
      add: r.card.name,
      addBenefit: r.reason,
      addType: r.card.typeLine,
      synergy: r.sharedTags.length ? `Shares ${r.sharedTags.slice(0, 3).join(', ')}.` : null,
      category: categoryFor(r),
      priority: r.score >= 3 ? 'high' : 'medium',
      edhImpact: null,
      _addCard: r.card,
      _removeCard: null,
    };
  });

  /*
   * LAND ADDITIONS ARE BOUNDED BY EMPTY SLOTS, NOT BY THE SHORTFALL.
   *
   * This list used to run to eight whatever the deck looked like. Measured on
   * 2026-08-29: the real Atraxa deck is exactly a hundred cards with 33 lands
   * against a target of 37, and it was told to add Command Tower, Exotic
   * Orchard, Mirrex, Horizon of Progress, Forbidden Orchard, Spire of Industry,
   * Evolving Wilds and Terramorphic Expanse. All eight are good lands. There
   * was nowhere to put any of them, and taking the advice would have left a
   * 108-card Commander deck.
   *
   * Being short of lands with no slot free is a reason to TRADE a land, and
   * `landReplacements` is that answer. It is filled in whether this list is
   * empty or not.
   */
  const landSlots = args.fillPlan ? args.fillPlan.landSlots : 0;
  const landRecommendations = landCandidates
    .slice(0, Math.min(landSlots, LAND_ADD_ASK_LIMIT))
    .map(l => {
      touched.add(l.card.name);
      return {
        type: 'add',
        name: l.card.name,
        reason: l.reason,
        priority: l.grounds.produces.length > 1 ? 'high' : 'medium',
        category: l.grounds.produces.length > 1 ? 'Mana fixing' : 'Utility',
        quantity: 1,
        grounds: l.grounds,
        _card: l.card,
      };
    });

  const issues = deckIssues({
    deckEntries: args.deckEntries,
    swapTargets,
    commanderish: args.commanderish,
    legalityKey: args.legalityKey,
    identity: args.identity,
    threshold: args.threshold,
  });
  for (const issue of issues) touched.add(String(issue.card));

  return {
    additions,
    removals,
    replacements,
    landRecommendations,
    // The handler fills these from `pairLandSwaps`, once it knows what the
    // lists above already name.
    landReplacements: [],
    issues,
    touched,
  };
}

/**
 * One measured land trade, in the row shape `replacements` uses.
 *
 * `remove` is the DECK's own spelling, for the same reason every other cut in
 * this file is: the swap is applied by name against the user's list, and the
 * catalogue's spelling of a card need not match theirs exactly.
 *
 * `removeReason`, `addBenefit` and `synergy` are all assembled from signals
 * that fired. `addBenefit` is the ranker's own sentence for the incoming land,
 * so the words under a land in a trade are the same words that would appear
 * under it in the add list.
 *
 * `edhImpact` is null and stays null. It is the model's power-delta estimate,
 * and no model saw this pair; a number here would be one this function made up.
 */
function toLandReplacement(
  swap: LandSwap,
  deckNames: ReadonlyMap<string, string>,
  sections: Sections
): Record<string, unknown> {
  const removeName = deckNames.get(normalizeName(swap.out.card.name)) ?? swap.out.card.name;
  sections.touched.add(removeName);
  sections.touched.add(swap.out.card.name);
  sections.touched.add(swap.in.card.name);
  return {
    remove: removeName,
    removeReason: swap.outReason,
    add: swap.in.card.name,
    addBenefit: swap.in.reason,
    addType: swap.in.card.typeLine,
    synergy: swap.gainNote,
    category: swap.in.grounds.produces.length > 1 ? 'Mana fixing' : 'Land upgrade',
    priority: swap.priority,
    edhImpact: null,
    /** The measured facts for each side, the same shape the land tiles read. */
    addGrounds: swap.in.grounds,
    removeGrounds: swap.out.grounds,
    /** Fit gained, so a reader can check the ordering rather than trust it. */
    fitGain: Number(swap.gain.toFixed(2)),
    _addCard: swap.in.card,
    _removeCard: swap.out.card,
  };
}

/**
 * How many of the empty slots are lands.
 *
 * The owner's rule, and it is the right one: "a spell you cannot cast is worth
 * less than the land that casts it." A deck that is twelve cards short and
 * nine lands short does not have twelve spell slots to fill, it has three. So
 * the split is counted here and reported, rather than left for a reader to
 * work out from two numbers on different tabs.
 *
 * Null when the deck is not short of cards. There is no fill order to state
 * when there is nothing to fill, and a plan of zeroes would render as one.
 */
interface FillPlan {
  /** Cards needed to reach the format's deck size. */
  emptySlots: number;
  /** How far under the land target the deck is, before any slots are shared. */
  landShortfall: number;
  /** Empty slots that should become lands. Never more than there are slots. */
  landSlots: number;
  /** What is left for spells. */
  spellSlots: number;
  /** One sentence, for the user. Composed here so nothing restates it. */
  note: string;
}

function buildFillPlan(args: {
  missingCards: number;
  landCount: number;
  idealLandCount: number;
}): FillPlan | null {
  const { missingCards, landCount, idealLandCount } = args;
  if (missingCards <= 0) return null;

  const landShortfall = Math.max(0, idealLandCount - landCount);
  const landSlots = Math.min(missingCards, landShortfall);
  const spellSlots = missingCards - landSlots;
  const cards = `${missingCards} card${missingCards === 1 ? '' : 's'}`;

  const note =
    landSlots === 0
      ? `This deck is ${cards} short and its land count is where it should be, so all ` +
        `${missingCards} empty slot${missingCards === 1 ? '' : 's'} can go to spells.`
      : `This deck is ${cards} short and ${landShortfall} land${
          landShortfall === 1 ? '' : 's'
        } short, so the mana base comes first: ${landSlots} of the ${missingCards} empty ` +
        `slots are lands, which leaves ${spellSlots} for spells. A spell you cannot cast ` +
        `is worth less than the land that casts it.`;

  return { emptySlots: missingCards, landShortfall, landSlots, spellSlots, note };
}

function categoryFor(r: Recommendation): string {
  switch (r.fillsRoles[0]) {
    case 'ramp':
      return 'Ramp';
    case 'draw':
      return 'Card Draw';
    case 'removal':
    case 'interaction':
      return 'Removal';
    case 'wincon':
      return 'Essential';
    case 'land':
      return 'Lands';
    default:
      return /creature/i.test(r.card.typeLine) ? 'Creatures' : 'Other';
  }
}

/* ------------------------------------------------------------------ *
 * Attaching real data
 * ------------------------------------------------------------------ */

/**
 * Give every surviving suggestion its card id, image, price and ownership.
 *
 * The pool was fetched without `image_uris` deliberately — it is up to 25,000
 * rows — so art is fetched once, here, for the handful of names that survived.
 */
async function attachRealData(args: {
  catalog: Catalog;
  sections: Sections;
  legalityKey: string;
  collectionCards: string[];
  /**
   * The caller's collection, already read once for the land ranker.
   *
   * Passed in rather than fetched again. It used to be read here by name, in
   * chunks of eighty, which was a second trip to `user_collections` for data
   * the pipeline was already holding.
   */
  collectionOwned: ReadonlyMap<string, number>;
}): Promise<Sections> {
  const { catalog, sections, legalityKey } = args;
  const names = [...sections.touched];

  const display = new Map<string, CatalogRow>();
  if (names.length) {
    for (const row of await catalog.cardsByName(names, legalityKey)) {
      const key = normalizeName(row.name);
      const prev = display.get(key);
      const price = row.usd == null ? Infinity : Number(row.usd);
      const prevPrice = prev?.usd == null ? Infinity : Number(prev.usd);
      // Prefer a printing that actually has art; among those, the cheaper one.
      if (!prev || (!prev.image_url && row.image_url) || (Boolean(prev.image_url) === Boolean(row.image_url) && price < prevPrice)) {
        display.set(key, row);
      }
    }
  }

  // Ownership: the caller's own collection under RLS, unioned with whatever
  // names the client already passed in.
  //
  // These two sources are NOT the same strength of claim, and the response now
  // says which one a number came from. `user_collections` carries a real
  // `quantity` column, so a figure from there is counted. `collectionCards` is
  // a bare list of names the client posted, with no quantities in it at all —
  // the 1 below is a floor meaning "at least one", invented here because the
  // field is numeric and something had to go in it. Emitting that 1 unlabelled
  // put a fabricated count next to a measured one in the same field, where no
  // reader could tell them apart. `ownedQuantity` keeps its type and meaning;
  // `ownedQuantitySource` is new, and is what makes the 1 honest.
  const owned = new Map(args.collectionOwned);
  const countedNames = new Set(owned.keys());
  const claimedNames = new Set<string>();
  for (const n of args.collectionCards) {
    const key = normalizeName(n);
    if (!key) continue;
    claimedNames.add(key);
    if (!owned.has(key)) owned.set(key, 1);
  }

  const facts = (name: string, card: CandidateCard | null) => {
    const key = normalizeName(name);
    // `display` is keyed on the spelling the catalogue returned, and `name` is
    // the spelling the response ships — the user's own deck for a cut. Those
    // agree case-insensitively by construction but need not agree exactly, and
    // `cardsByName` matches `name=in.(...)` exactly, so a deck that stores
    // "sol ring" finds no row on the first lookup. Falling back to the resolved
    // card's catalogue name recovers the image, set code, rarity and price that
    // would otherwise all come back null on a card the function had in hand.
    const row = display.get(key) ?? (card ? display.get(normalizeName(card.name)) : undefined);
    const qty = owned.get(key) ?? 0;
    return {
      cardId: row?.id ?? card?.id ?? null,
      oracleId: row?.oracle_id ?? card?.oracleId ?? null,
      imageUrl: row?.image_url ?? null,
      setCode: row?.set_code ?? null,
      rarity: row?.rarity ?? null,
      priceUsd: row?.usd != null ? Number(row.usd) : (card?.usd ?? null),
      owned: qty > 0,
      ownedQuantity: qty,
      /**
       * Where `ownedQuantity` came from.
       *   'collection'  counted from `user_collections.quantity`
       *   'client-list' the client named this card but sent no quantity; the
       *                 figure is a floor of 1, not a count
       *   'none'        nothing claims ownership; the quantity is 0
       */
      ownedQuantitySource: countedNames.has(key)
        ? 'collection'
        : claimedNames.has(key)
          ? 'client-list'
          : 'none',
      verified: Boolean(row || card),
    };
  };

  for (const a of sections.additions) {
    Object.assign(a, facts(String(a.name), (a._card as CandidateCard | null) ?? null));
    delete a._card;
  }
  for (const r of sections.removals) {
    Object.assign(r, facts(String(r.name), (r._card as CandidateCard | null) ?? null));
    delete r._card;
  }
  for (const l of sections.landRecommendations) {
    Object.assign(l, facts(String(l.name), (l._card as CandidateCard | null) ?? null));
    delete l._card;
  }
  // Spell swaps and land swaps carry the same fields because they are the same
  // row, and one loop over both is what keeps them that way.
  for (const r of [...sections.replacements, ...sections.landReplacements]) {
    const add = facts(String(r.add), (r._addCard as CandidateCard | null) ?? null);
    const cut = facts(String(r.remove), (r._removeCard as CandidateCard | null) ?? null);
    Object.assign(r, {
      addCardId: add.cardId,
      addOracleId: add.oracleId,
      addImageUrl: add.imageUrl,
      addPriceUsd: add.priceUsd,
      addOwned: add.owned,
      addOwnedQuantity: add.ownedQuantity,
      addOwnedQuantitySource: add.ownedQuantitySource,
      removeCardId: cut.cardId,
      removeOracleId: cut.oracleId,
      removeImageUrl: cut.imageUrl,
      removePriceUsd: cut.priceUsd,
      verified: add.verified,
    });
    delete r._addCard;
    delete r._removeCard;
  }

  return sections;
}

/* ------------------------------------------------------------------ *
 * What each change is worth
 * ------------------------------------------------------------------ */

/**
 * Re-score the deck with each suggested change applied, one at a time.
 *
 * `edhImpact` and `projectedPowerLevel` were the two numbers in this response
 * that nothing measured. They came back beside a card name from a language
 * model, and `optionalNum` existed solely to stop a missing one being minted as
 * a zero — its own comment said "nothing on this server measures the power
 * change of a swap". Something does now, and it is the same `evaluateUserDeck`
 * that produced the score the delta is a delta OF, so the two agree by
 * construction.
 *
 * WHAT A DELTA MEANS HERE. It is this deck's score with that one card swapped,
 * minus its score as it stands. Not an opinion about the card in the abstract:
 * a Force of Will is worth more to a deck that can pay for it, and the
 * evaluator knows which deck it is looking at.
 *
 * WHAT IS DELIBERATELY NOT REPORTED. Anything under `IMPACT_FLOOR` stays null
 * rather than shipping as 0.0, because the score carries one decimal and a
 * rounded zero would render as a claim that a swap changes nothing when what
 * was measured is that it changes less than the score can express. Rows past
 * `IMPACT_BUDGET` stay null too, and null already renders as nothing.
 *
 * A LAND TRADE GETS NO NUMBER, and that is not an oversight. `landReplacements`
 * is built by `pairLandSwaps` from a mana-base comparison whose whole argument
 * is `fitGain`, which is already on the row and already explained in words. A
 * second figure from a different scale beside it would invite the two to be
 * read as the same thing.
 */
function measureImpact(args: {
  deckLines: readonly ResolvedDeckLine[];
  /** Rows for anything the answer proposes adding, by normalised name. */
  addable: ReadonlyMap<string, CatalogRow>;
  legalityKey: string;
  sections: Sections;
  /** The score as it stands. Null when the evaluation threw. */
  current: number | null;
}): { projected: number | null; measured: number } {
  const { deckLines, addable, legalityKey, sections, current } = args;
  if (current === null) return { projected: null, measured: 0 };

  const started = Date.now();
  let measured = 0;

  /** The deck with one card out, one card in, or both. */
  const withChange = (removeName: string | null, addName: string | null): number | null => {
    const removeKey = removeName ? normalizeName(removeName) : null;
    const addRow = addName ? addable.get(normalizeName(addName)) : null;
    if (addName && !addRow) return null;

    const lines: ResolvedDeckLine[] = [];
    let removedOne = false;
    for (const line of deckLines) {
      if (removeKey && !removedOne && normalizeName(line.name) === removeKey && !line.isCommander) {
        removedOne = true;
        // A card the deck runs several of loses one copy, not the row.
        if (line.quantity > 1) lines.push({ ...line, quantity: line.quantity - 1 });
        continue;
      }
      lines.push(line);
    }
    // Naming a cut that is not in the deck would silently measure a deck that
    // is one card larger, so the whole comparison is refused instead.
    if (removeKey && !removedOne) return null;
    if (addRow) lines.push({ name: addRow.name, row: addRow, quantity: 1, isCommander: false });

    try {
      return evaluateUserDeck(lines, legalityKey).power.score;
    } catch {
      // Unmeasurable is null, the same rule every other figure here follows.
      return null;
    }
  };

  const stamp = (row: Record<string, unknown>, removeName: string | null, addName: string | null) => {
    if (measured >= IMPACT_BUDGET) return;
    measured++;
    const after = withChange(removeName, addName);
    if (after === null) return;
    const delta = after - current;
    row.edhImpact = Math.abs(delta) < IMPACT_FLOOR ? null : Number(delta.toFixed(1));
  };

  for (const r of sections.replacements) stamp(r, String(r.remove), String(r.add));
  for (const a of sections.additions) stamp(a, null, String(a.name));
  for (const r of sections.removals) stamp(r, String(r.name), null);

  /*
   * The whole answer applied at once.
   *
   * Every replacement, because those are the changes a player takes together
   * from one screen. Additions are left out on purpose: a deck that is short of
   * cards is being finished rather than improved, and scoring it as though the
   * suggestions were already in it would report a number for a deck that does
   * not exist yet.
   */
  let projected: number | null = null;
  if (sections.replacements.length > 0) {
    const lines: ResolvedDeckLine[] = deckLines.map(l => ({ ...l }));
    let applied = 0;
    for (const r of sections.replacements) {
      const removeKey = normalizeName(String(r.remove));
      const addRow = addable.get(normalizeName(String(r.add)));
      if (!addRow) continue;
      const i = lines.findIndex(l => !l.isCommander && normalizeName(l.name) === removeKey);
      if (i === -1) continue;
      if (lines[i].quantity > 1) lines[i] = { ...lines[i], quantity: lines[i].quantity - 1 };
      else lines.splice(i, 1);
      lines.push({ name: addRow.name, row: addRow, quantity: 1, isCommander: false });
      applied++;
    }
    if (applied > 0) {
      try {
        projected = evaluateUserDeck(lines, legalityKey).power.score;
      } catch (error) {
        console.error('projected evaluation failed', error);
      }
    }
  }

  console.log(
    `impact: ${measured} change(s) re-scored in ${Date.now() - started}ms; ` +
      `now ${current}, all replacements applied ${projected ?? 'not measured'}`
  );

  return { projected, measured };
}

/* ------------------------------------------------------------------ *
 * The response
 * ------------------------------------------------------------------ */

/**
 * Assemble the response.
 *
 * PRE-EXISTING FIELDS, unchanged in name, type and meaning:
 *   summary, categories{synergy,consistency,power,interaction,manabase},
 *   currentPowerLevel, projectedPowerLevel, issues[], strengths[], strategy[],
 *   manabase[], additions[], removals[], replacements[], landRecommendations[],
 *   landCount, idealLandCount
 *
 * ADDED — all optional for a reader that ignores them:
 *   analysis.grounding      pool size, candidates offered, identity, timings,
 *                           how many wants the commander's plan carries, and
 *                           whether the popularity prior is fit to rank with
 *   analysis.engine         version, and how many changes carry a measured delta
 *   analysis.deck           measured role counts/targets, curve, deck themes
 *   analysis.swapTargets    cut candidates with their castability source
 *   analysis.power          THE score, from the same engine the deck page runs.
 *                           Same decklist in, same number out, and
 *                           src/engine/one-brain.test.ts fails if they differ.
 *   analysis.categoriesSource  always 'measured'. The field survives because a
 *                           client reads it; there is no other source now.
 *   analysis.basicFiller    how many basics the deck still needs and of which
 *                           colours, or null when it needs none
 *   analysis.landReplacements  land-for-land trades, in the same row shape as
 *                           replacements[], plus addGrounds, removeGrounds and
 *                           fitGain. Measured, never from the model.
 *   analysis.fillPlan       how many of the empty slots are lands and how many
 *                           are spells, with the sentence that says why lands
 *                           come first. Null when the deck is not short.
 *   per addition/removal/land: cardId, oracleId, imageUrl, setCode, rarity,
 *                              priceUsd, owned, ownedQuantity,
 *                              ownedQuantitySource, verified,
 *                              and quantity + grounds on landRecommendations
 *   per replacement:        addCardId, addOracleId, addImageUrl, addPriceUsd,
 *                           addOwned, addOwnedQuantity,
 *                           addOwnedQuantitySource, removeCardId,
 *                           removeOracleId, removeImageUrl, removePriceUsd,
 *                           verified
 *
 * `ownedQuantitySource` is 'collection' | 'client-list' | 'none' and says
 * whether `ownedQuantity` was counted from `user_collections.quantity` or is
 * the floor of 1 stamped on a name the client listed without a quantity.
 * Reading the number without it treats an invented 1 as a measured one.
 *
 * `cardId` is the printing id, which is what `/cards/:id` routes on.
 */
function buildResponse(args: {
  enriched: Sections;
  profile: DeckProfile;
  landCount: number;
  idealLandCount: number;
  basicFiller: BasicFiller | null;
  fillPlan: FillPlan | null;
  swapTargets: SwapTarget[];
  evaluation: DeckEvaluation | null;
  /** The score with every replacement applied, or null when none was measured. */
  projectedPowerLevel: number | null;
  /** How many suggestions carry a measured power delta. */
  impactsMeasured: number;
  colorIdentity: Color[];
  identitySource: string;
  unresolved: string[];
  poolRows: number;
  poolCards: number;
  candidatesOffered: number;
  usesIndex: boolean;
  commanderPlanWants: number | null;
  popularity: { ranked: number; earlyShare: number; lateShare: number; skewedByName: boolean };
  elapsedMs: number;
}): Record<string, unknown> {
  const { enriched, profile } = args;

  const roleCounts: Record<string, number> = {};
  const roleTargets: Record<string, number> = {};
  for (const role of ROLES) {
    roleCounts[role] = profile.roleCounts[role] ?? 0;
    roleTargets[role] = profile.roleTargets[role] ?? 0;
  }

  const categories = measuredCategories(profile, args.landCount, args.idealLandCount);

  return {
    summary: engineSummary(profile, args),
    categories,
    /*
     * There is one source now, and the field stays anyway.
     *
     * A client reads it to label a derived set of scores differently from a
     * judged one. Dropping it would make that client read `undefined` and stop
     * labelling them at all, which is the opposite of what it is for.
     */
    categoriesSource: 'measured',
    /*
     * The SAME number as `power.score` below, not a second opinion about it.
     *
     * This field used to hold whatever figure came back beside the analysis,
     * unchecked, in a response that already carried the canonical score. That is
     * the five-competing-power-fields problem from the design law, alive in one
     * field. It is now the canonical score or nothing.
     */
    currentPowerLevel: args.evaluation ? args.evaluation.power.score : null,
    projectedPowerLevel: args.projectedPowerLevel,
    issues: enriched.issues,
    strengths: deckStrengths(profile, args.evaluation),
    /*
     * EMPTY, ON PURPOSE.
     *
     * How to pilot a deck and where its decision points are is the one thing in
     * this response that was genuinely judgement rather than restated
     * measurement, and nothing here measures it. A sentence assembled to fill
     * the space would be the only invented thing in an answer that is otherwise
     * all counting.
     */
    strategy: [],
    manabase: manabaseNotes(args),

    additions: enriched.additions,
    removals: enriched.removals,
    replacements: enriched.replacements,
    landRecommendations: enriched.landRecommendations,
    /**
     * Land-for-land trades, measured. Same row shape as `replacements`.
     *
     * An empty array means no pair could be justified in plain words, which is
     * a real answer rather than a missing one.
     */
    landReplacements: enriched.landReplacements,
    landCount: args.landCount,
    idealLandCount: args.idealLandCount,
    /**
     * Which of the empty slots are lands, and why that order.
     *
     * `null` when the deck is not short of cards. The note is composed once,
     * server-side, so the tab strip, the additions header and the lands tab
     * cannot each phrase the same split differently.
     */
    fillPlan: args.fillPlan,

    /**
     * The basics this deck still needs, as a count.
     *
     * `null` when it needs none, and null must render as nothing rather than
     * as a zero. This is the field that replaces basic-land tiles: the split
     * is measured from the deck's own coloured pip demand and its own source
     * counts, so it is a fact about this deck, and it is one line.
     */
    basicFiller: args.basicFiller,

    /* --- added --- */
    grounding: {
      source: 'cards',
      format: profile.format,
      colorIdentity: args.colorIdentity,
      colorIdentitySource: args.identitySource,
      poolRows: args.poolRows,
      poolCards: args.poolCards,
      candidatesOffered: args.candidatesOffered,
      legalityIndexUsed: args.usesIndex,
      unresolvedDeckNames: args.unresolved,
      /**
       * How many wants the commander's own ability record produced.
       *
       * Zero or null means the commander-fit signal was silent for this deck,
       * which is a fact about how well the compiler reads that card and not a
       * judgement about the card. It is reported because the signal spent
       * months silent for EVERY deck with nothing saying so.
       */
      commanderPlanWants: args.commanderPlanWants,
      /**
       * Whether the popularity prior was fit to rank this pool with.
       *
       * `skewedByName` true means `edhrec_rank` is present for one half of the
       * alphabet and largely absent for the other, which has happened here
       * before and put eight generated decks entirely in the first half. The
       * suggestions above are still the best available ordering; this says how
       * much to trust the part of it that came from popularity.
       */
      popularity: {
        ranked: args.popularity.ranked,
        earlyShare: Number(args.popularity.earlyShare.toFixed(3)),
        lateShare: Number(args.popularity.lateShare.toFixed(3)),
        skewedByName: args.popularity.skewedByName,
      },
      elapsedMs: args.elapsedMs,
    },
    engine: {
      version: ENGINE_VERSION,
      /**
       * How many suggestions carry a measured power delta.
       *
       * `aiUsed`, `aiFailure` and `fallbackUsed` used to sit here and they have
       * been removed rather than pinned to constants. They answered "did the
       * gateway reply", and with no gateway to reply the honest values would
       * have been false, null and true on every single response forever, which
       * is a field that has stopped carrying information while still looking
       * like it does. A reader that wants to know where an answer came from has
       * `version`, and it says so.
       */
      impactsMeasured: args.impactsMeasured,
    },
    deck: {
      deckSize: profile.deckSize,
      spellCount: profile.spellCount,
      meanCmc: Number(profile.meanCmc.toFixed(2)),
      roleCounts,
      roleTargets,
      signalTags: profile.signalTags.slice(0, 20),
    },
    swapTargets: args.swapTargets.map(t => ({
      name: t.name,
      castability: t.castability,
      castabilitySource: t.source,
      reason: t.reason,
    })),

    /**
     * The score, computed here rather than accepted from the caller.
     *
     * This is the field that makes the cut list checkable. `castability.average`
     * is the mean the `castability` subscore IS, and every name in
     * `swapTargets` with `castabilitySource: 'engine-castability'` is one of the
     * cards dragging that mean down. A client can display the score beside the
     * cuts and the two will always agree, because they came from one call.
     *
     * Null only when evaluation threw, and null means "not measured" rather
     * than zero, the same rule the castability figures follow.
     */
    power: args.evaluation
      ? {
          score: args.evaluation.power.score,
          band: args.evaluation.power.band,
          bracket: args.evaluation.power.bracket,
          raw: args.evaluation.power.raw,
          unreliable: args.evaluation.power.unreliable,
          subscores: args.evaluation.power.subscores.map(sub => ({
            key: sub.key,
            value: sub.value,
            weight: sub.weight,
            applicable: sub.applicable,
            measured: sub.measured,
            from: sub.from,
            holdingBack: sub.holdingBack,
            note: sub.note,
          })),
          castability: {
            average: args.evaluation.power.readout.averagePct,
            median: args.evaluation.power.readout.medianPct,
            threshold: args.evaluation.power.readout.threshold,
            hardToCastCount: args.evaluation.power.readout.hardToCastCount,
            hardest: args.evaluation.power.readout.hardest,
          },
        }
      : null,
  };
}

/**
 * Category scores computed from the deck's own numbers.
 *
 * Used when the model did not supply them. Each is a stated function of a
 * measured ratio — how close the deck is to the declared role targets in
 * `roles.ts`, and how close its land count is to the format's — rather than an
 * opinion. `power` is the mean of the rest because this function has no
 * independent way to measure power, and saying so is better than inventing one.
 */
function measuredCategories(profile: DeckProfile, landCount: number, idealLandCount: number) {
  const fill = (role: Role) => clamp(Math.round(100 * (1 - roleShortfall(profile, role))));

  const synergy = clamp(Math.round(100 * Math.min(1, profile.signalTags.length / 12)));
  const consistency = fill('draw');
  const interaction = Math.round((fill('removal') + fill('interaction')) / 2);
  const manabase = clamp(100 - Math.abs(landCount - idealLandCount) * 8);
  const power = Math.round((synergy + consistency + interaction + manabase) / 4);

  return { synergy, consistency, power, interaction, manabase };
}

/**
 * The two or three sentences at the top, counted off the deck.
 *
 * The last line used to read "These suggestions came from the in-house engine,
 * not a language model." It is gone, for two reasons and only one of them is
 * that it stopped being a distinction worth drawing. The other is that it broke
 * the copy rules twice in nine words: "engine" is the kind of word the rules
 * exist to keep out of an interface, and the last two are on the ban list
 * outright. A player reading their own deck should be told about their deck.
 */
function engineSummary(
  profile: DeckProfile,
  args: { landCount: number; idealLandCount: number }
): string {
  const short = ROLES.filter(r => roleShortfall(profile, r) > 0)
    .map(r => `${r} ${profile.roleCounts[r] ?? 0}/${profile.roleTargets[r] ?? 0}`)
    .slice(0, 4);
  const parts = [
    `${profile.deckSize} cards counted, mean mana value ${profile.meanCmc.toFixed(2)}.`,
    `${args.landCount} lands against ${args.idealLandCount} for the format.`,
  ];
  if (short.length) parts.push(`Short of: ${short.join(', ')}.`);
  return parts.join(' ');
}

/**
 * What the deck is doing well, from the score's own evidence.
 *
 * `drivers` is the three highest applicable subscores, already sorted, and each
 * one carries a `measured` sentence saying what was counted to reach it. So
 * this is the score explaining itself rather than a second opinion about the
 * same deck, and the two cannot disagree.
 *
 * The roles at or above target are added because a subscore is a percentage and
 * "you have enough removal" is the sentence a player recognises. Both halves are
 * counts off the decklist.
 *
 * Empty when the evaluation threw, which is the honest reading: with no score
 * there is no evidence, and a strength with no evidence under it is flattery.
 */
function deckStrengths(
  profile: DeckProfile,
  evaluation: DeckEvaluation | null
): Array<{ text: string }> {
  const out: Array<{ text: string }> = [];
  if (!evaluation) return out;

  for (const sub of evaluation.power.drivers) {
    if (!sub.applicable || sub.value === null) continue;
    // A "driver" is only the best of what is here. Calling the best of a weak
    // set a strength is how a report ends up congratulating a deck on nothing.
    if (sub.value < 50) continue;
    out.push({ text: `${sub.measured} (${Math.round(sub.value)} of 100).` });
  }

  const met = ROLES.filter(r => (profile.roleTargets[r] ?? 0) > 0 && roleShortfall(profile, r) <= 0);
  if (met.length) {
    out.push({
      text: `At or above target for ${met
        .slice(0, 5)
        .map(r => `${r} (${profile.roleCounts[r] ?? 0} of ${profile.roleTargets[r] ?? 0})`)
        .join(', ')}.`,
    });
  }

  return out;
}

/**
 * The mana base, in counted sentences.
 *
 * The first line is the land count against the format's, which is what this
 * function has always said. The second is the colour sources the castability
 * engine actually found, which is a fact the response has carried since the
 * score was wired in and has never printed anywhere a player could read it.
 *
 * `MIN_SOURCES_PER_COLOUR` is the same floor the land ranker uses to decide a
 * deck is short of a colour, so the sentence here and the reason under a land
 * on the Lands tab are the same judgement rather than two.
 */
function manabaseNotes(args: {
  landCount: number;
  idealLandCount: number;
  evaluation: DeckEvaluation | null;
  colorIdentity: Color[];
}): Array<{ text: string }> {
  const notes: Array<{ text: string }> = [{ text: manabaseNote(args) }];

  const profile = args.evaluation?.playability.profile ?? null;
  if (profile && args.colorIdentity.length > 0) {
    const counts = args.colorIdentity.map(colour => ({
      colour,
      sources: profile.sourcesByColour[colour as ManaColour] ?? 0,
    }));
    notes.push({
      text: `Sources: ${counts.map(c => `${COLOUR_WORDS[c.colour] ?? c.colour} ${c.sources}`).join(', ')}.`,
    });
    const thin = counts.filter(c => c.sources < MIN_SOURCES_PER_COLOUR);
    if (thin.length) {
      notes.push({
        text: `Under ${MIN_SOURCES_PER_COLOUR} sources for ${thin
          .map(c => COLOUR_WORDS[c.colour] ?? c.colour)
          .join(' and ')}, which is where a colour starts costing you turns.`,
      });
    }
  }

  return notes;
}

/** Colour letters as a player says them. */
const COLOUR_WORDS: Readonly<Record<string, string>> = {
  W: 'white',
  U: 'blue',
  B: 'black',
  R: 'red',
  G: 'green',
  C: 'colourless',
};

function manabaseNote(args: { landCount: number; idealLandCount: number }): string {
  const d = args.landCount - args.idealLandCount;
  if (d === 0) return `${args.landCount} lands, exactly what this format wants.`;
  return `${args.landCount} lands against ${args.idealLandCount}: ${Math.abs(d)} ${d < 0 ? 'short' : 'over'}.`;
}

/* ------------------------------------------------------------------ *
 * Small coercions
 * ------------------------------------------------------------------ */

/**
 * The last one standing.
 *
 * `arr`, `str`, `num`, `optionalNum`, `priority` and `textOf` lived here to
 * make an untyped answer from somewhere else safe to read. Nothing untyped
 * arrives any more, so they are gone rather than kept for a caller that no
 * longer exists.
 */
function clamp(n: number): number {
  return Math.min(100, Math.max(0, Math.round(Number.isFinite(n) ? n : 0)));
}
