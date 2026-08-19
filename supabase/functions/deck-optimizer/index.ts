/**
 * Deck optimiser — grounded.
 *
 * WHAT CHANGED, AND WHY IT MATTERED
 * ---------------------------------
 * This function used to make no database queries at all. Its only outbound call
 * was to an AI gateway, and the sole safeguard against a fabricated suggestion
 * was one line of prompt text asking the model to name real cards. Nothing
 * verified the answer; the client did not check either. So a suggestion could
 * be a card that does not exist, a card banned in the format, or — the one that
 * is illegal on its face — a card outside the commander's colour identity.
 * Meanwhile the database already held 34,088 cards with a real tag taxonomy,
 * prices, legalities and colour identity, and none of it was consulted.
 *
 * Measured against the live catalogue before this change, over eight successful
 * runs on five real decks: 249 suggested card names, of which 2 were outside
 * the deck's colour identity and 6 were duplicate land rows — and 3 of the 8
 * runs shipped at least one card the user could not legally play. A ninth deck
 * (four colours, exactly 100 cards) returned HTTP 500 on all three attempts and
 * produced nothing at all.
 *
 * The order of operations is now:
 *
 *   1. RETRIEVE   Every printing legal in the format whose colour identity is
 *                 within the commander's. No limit — see (2).
 *   2. RANK       Score the whole pool with the in-house engine, then truncate.
 *                 Never the other way round: an earlier bug in this repo took
 *                 `.limit(40)` before ranking, which ranks an arbitrary slice
 *                 of the table very carefully.
 *   3. GROUND     Hand the model that ranked pool and ask it to choose and
 *                 justify from it, rather than to recall names.
 *   4. VALIDATE   Resolve every name the model returned against rows actually
 *                 fetched from `cards`. Drop what fails, and report the count.
 *   5. ATTACH     Real card id, price, image and collection ownership.
 *
 * Step 4 is not made redundant by step 3. Grounding changes how often the model
 * is wrong; validation is what makes being wrong harmless.
 *
 * RESPONSE SHAPE
 * --------------
 * Strictly additive. Every field the previous version returned is still
 * returned, with the same name, type and meaning, because a UI is being built
 * against it. New fields are documented at `buildResponse` below.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

import { Catalog, normalizeName, type CatalogRow } from './catalog.ts';
import {
  CardIndex,
  ValidationLog,
  cutRefusal,
  diagnose,
  isBasicLand,
  isLandCard,
  landRepeatDisposition,
} from './validate.ts';
import {
  evaluateUserDeck,
  toSwapTargets,
  type DeckEvaluation,
  type ResolvedDeckLine,
  type SwapTarget,
} from './deck-brain.ts';
import {
  buildCandidateQuery,
  deriveDeckProfile,
  gapRoles,
  isCommanderFormat,
  normalizeIdentity,
  normalizeRow,
  rankCandidates,
  roleShortfall,
  ROLES,
  type CandidateCard,
  type Color,
  type DeckCard,
  type DeckProfile,
  type Recommendation,
  type Role,
} from './_engine/advise/index.ts';

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

/** Bumped whenever the grounding or validation rules change. */
const ENGINE_VERSION = 'deck-optimizer/5-grounded';

/** How many ranked non-land candidates the model gets to choose from. */
const CANDIDATE_LIMIT = 120;
/** How many ranked land candidates, on top of the basics. */
const LAND_CANDIDATE_LIMIT = 40;
/** Extra candidates surfaced per role the deck is short of. */
const PER_ROLE_LIMIT = 12;
/** How many cut targets to offer the model. */
const SWAP_TARGET_LIMIT = 14;

/**
 * Output budget for the model.
 *
 * The previous value was 6000, and it is the most likely cause of the HTTP 500
 * measured on the four-colour complete deck: a full set of replacements plus
 * land recommendations, behind Gemini's reasoning tokens, exhausts the budget
 * mid-tool-call, the gateway returns no `tool_calls` at all, and the old code
 * threw "No valid response from AI". Truncation is now both less likely and
 * survivable — see `callModel`.
 */
const MAX_OUTPUT_TOKENS = 16000;

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
      apiKey: Deno.env.get('LOVABLE_API_KEY') ?? null,
      startedAt,
    });

    if (result.kind === 'rate_limit') {
      return json(
        { error: 'Rate limits exceeded. Please wait a moment and try again.', type: 'rate_limit' },
        429
      );
    }
    if (result.kind === 'payment_required') {
      return json(
        { error: 'AI credits exhausted. Please add credits to continue.', type: 'payment_required' },
        402
      );
    }
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
  apiKey: string | null;
  startedAt: number;
}

type OptimiseResult =
  | { kind: 'ok'; analysis: Record<string, unknown> }
  | { kind: 'rate_limit' }
  | { kind: 'payment_required' };

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

  const profile = deriveDeckProfile({ format: legalityKey, colorIdentity, cards: profileCards });

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

  /* --- 5. Retrieve, then rank. Never the reverse. ------------------- */
  const query = buildCandidateQuery(profile);
  const poolStarted = Date.now();
  const poolRows = await catalog.poolFor(query);
  const poolMs = Date.now() - poolStarted;

  const poolIndex = new CardIndex(poolRows, legalityKey);
  const pool: CandidateCard[] = poolRows.map(r => normalizeRow(r, legalityKey));

  const rankStarted = Date.now();
  // No limit passed: the full legal pool is scored, and only then sliced.
  const ranked = rankCandidates(pool, profile);
  const rankMs = Date.now() - rankStarted;

  console.log(
    `pool: ${poolRows.length} rows in ${poolMs}ms (legality index=${query.usesIndex}); ` +
      `ranked ${ranked.length} distinct cards in ${rankMs}ms; ` +
      `identity=[${colorIdentity.join('') || '-'}] via ${identitySource}; ` +
      `${unresolved.length} deck names unresolved`
  );

  /* --- 6. Assemble what the model may choose from ------------------- */
  const excluded = new Set(input.excludeSwaps.map(normalizeName));
  const usable = ranked.filter(r => !excluded.has(normalizeName(r.card.name)));

  const nonLand = usable.filter(r => !isLandCard(r.card));
  const landish = usable.filter(r => isLandCard(r.card));

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
  const landCandidates = landish.slice(0, LAND_CANDIDATE_LIMIT);
  const basics = await catalog.basicLands(legalityKey, colorIdentity);

  /* --- 7. The shared brain: one evaluation, score and cuts alike ---- */
  // This is the same `evaluateDeck` the deck page calls, running on a
  // byte-identical copy of the engine. The score below and the cut order below
  // it come out of one computation, so the reason a card is at the top of the
  // cut list IS the reason the score is what it is.
  //
  // `input.edhAnalysis` is still accepted and still forwarded to the prompt as
  // context, but nothing here reads a castability figure out of it. It used to
  // be the only source, and it was a scrape.
  let evaluation: DeckEvaluation | null = null;
  try {
    evaluation = evaluateUserDeck(deckLines, legalityKey);
  } catch (error) {
    // A scoring failure must not take the whole optimisation down. The cut list
    // then comes back empty and the prompt is told so, which is the honest
    // degradation: no evidence is reported as no evidence.
    console.error('deck evaluation failed', error);
  }

  const swapTargets = evaluation
    ? toSwapTargets(
        evaluation.cuts.filter(c => !excluded.has(normalizeName(c.name))),
        SWAP_TARGET_LIMIT
      )
    : [];

  if (evaluation) {
    console.log(
      `evaluation: power ${evaluation.power.score}/10 (${evaluation.power.band}), ` +
        `castability ${evaluation.power.readout.averagePct?.toFixed(1) ?? 'n/a'}%, ` +
        `${evaluation.power.readout.hardToCastCount} card(s) under ` +
        `${evaluation.power.readout.threshold}%, ${evaluation.cuts.length} cut candidates`
    );
  }

  /* --- 8. Ask the model to choose from the pool --------------------- */
  const prompt = buildGroundedPrompt({
    deckContext,
    profile,
    commanderCard,
    colorIdentity,
    totalWithCommander,
    requiredCards,
    missingCards,
    excessCards,
    landCount,
    idealLandCount,
    candidates,
    landCandidates,
    basics: basics.map(b => normalizeRow(b, legalityKey)),
    swapTargets,
    deckEntries,
    gaps,
    useCollection: input.useCollection,
    collectionCards: input.collectionCards,
    edhAnalysis: input.edhAnalysis,
  });

  const model = await callModel(prompt, input.apiKey, legalityKey);
  if (model.kind === 'rate_limit') return { kind: 'rate_limit' };
  if (model.kind === 'payment_required') return { kind: 'payment_required' };

  /* --- 9. Validate everything, then attach real data ---------------- */
  const log = new ValidationLog();
  const raw = model.kind === 'ok' ? model.analysis : null;

  const sections = raw
    ? await validateSections({
        raw,
        catalog,
        poolIndex,
        deckIndex,
        deckEntries,
        legalityKey,
        colorIdentity,
        log,
        missingCards,
        excessCards,
      })
    : engineOnlySections({
        candidates,
        landCandidates,
        swapTargets,
        missingCards,
        excessCards,
      });

  const enriched = await attachRealData({
    catalog,
    sections,
    legalityKey,
    collectionCards: input.collectionCards,
  });

  const summary = log.summary();
  console.log(
    `validation: checked ${summary.checked}, accepted ${summary.accepted}, ` +
      `dropped ${summary.dropped} ${JSON.stringify(summary.byReason)}`
  );

  return {
    kind: 'ok',
    analysis: buildResponse({
      raw,
      enriched,
      profile,
      log,
      landCount,
      idealLandCount,
      swapTargets,
      evaluation,
      colorIdentity,
      identitySource,
      unresolved,
      poolRows: poolRows.length,
      poolCards: ranked.length,
      candidatesOffered: candidates.length + landCandidates.length,
      usesIndex: query.usesIndex,
      aiUsed: model.kind === 'ok',
      aiFailure: model.kind === 'failed' ? model.reason : null,
      elapsedMs: Date.now() - startedAt,
    }),
  };
}

/* ------------------------------------------------------------------ *
 * Validation of each section
 * ------------------------------------------------------------------ */

interface Sections {
  additions: Record<string, unknown>[];
  removals: Record<string, unknown>[];
  replacements: Record<string, unknown>[];
  landRecommendations: Record<string, unknown>[];
  /**
   * `issues[].card` is a card name, rendered verbatim by the UI, so it is a
   * claim about the user's deck and is validated like any other name rather
   * than passed through from the model.
   */
  issues: Record<string, unknown>[];
  /** Every card accepted anywhere, for the one image/price/ownership lookup. */
  touched: Set<string>;
}

interface ValidateArgs {
  raw: Record<string, unknown>;
  catalog: Catalog;
  poolIndex: CardIndex;
  deckIndex: CardIndex;
  deckEntries: DeckEntry[];
  legalityKey: string;
  colorIdentity: Color[];
  log: ValidationLog;
  missingCards: number;
  excessCards: number;
}

async function validateSections(a: ValidateArgs): Promise<Sections> {
  const { raw, poolIndex, deckIndex, log, legalityKey, colorIdentity } = a;

  const inDeck = new Set(a.deckEntries.map(e => normalizeName(e.name)));

  /**
   * The commander is in the deck, and it is the one card in it that may not be
   * cut. `deckEntries` carries it — that is deliberate, because it is a real
   * card the deck plays and the profile, the colour identity and the role
   * counts all have to see it — and `inDeck` is built from `deckEntries`, so
   * "is it in the deck" answered YES for the commander and `resolveCut` had
   * nothing else to ask. A `removals` entry or the remove half of a
   * `replacements` pair naming the commander was therefore accepted, counted
   * as accepted in `validation`, and shipped with a real `cardId` beside it.
   *
   * That is not a cosmetic mistake. The optimiser panel's cut path calls
   * `onRemoveCard(name)` on the deck, so an accepted removal is an edit the
   * user can apply in one click — and applying this one dismantles the deck
   * around the only card the format will not let them replace by drawing it.
   *
   * The prompt already omits the commander from the DECK list, which is why
   * this has stayed latent rather than common. A prompt is a request; this is
   * the check. Kept separate from `inDeck` so that `issues[].card` may still
   * name the commander — "your commander is expensive to cast" is a fair
   * observation about a card, not an instruction to remove it.
   */
  const commanderKeys = new Set(
    a.deckEntries.filter(e => e.isCommander).map(e => normalizeName(e.name))
  );

  /**
   * The deck's own spelling of each card it plays.
   *
   * A cut is applied by NAME against the user's deck, so the name a removal
   * ships has to be the deck's, not the model's recollection of it. The model
   * is told to copy from the DECK list and mostly does, but `inDeck` is keyed
   * on the normalised form — case-folded, apostrophes folded — so a name that
   * differs only in those respects passes validation and then goes out
   * verbatim. Downstream that name is matched against the deck again, and this
   * time by something that has no normaliser, so the cut silently does nothing
   * and the image lookup in `attachRealData` (an exact, case-sensitive
   * `name=in.(...)`) returns no row either.
   */
  const deckNameByKey = new Map<string, string>();
  for (const e of a.deckEntries) {
    const key = normalizeName(e.name);
    if (key && !deckNameByKey.has(key)) deckNameByKey.set(key, e.name);
  }

  const touched = new Set<string>();

  // Collect every name the pool could not resolve, so the diagnostic lookup is
  // one query rather than one per miss.
  const misses = new Set<string>();
  const noteMiss = (name: string) => {
    if (name && !poolIndex.resolve(name)) misses.add(name);
  };
  for (const x of arr(raw.additions)) noteMiss(str(x.name));
  for (const x of arr(raw.replacements)) noteMiss(str(x.add));
  for (const x of arr(raw.landRecommendations)) if (str(x.type) !== 'remove') noteMiss(str(x.name));

  const missRows = misses.size ? await a.catalog.cardsByName([...misses], legalityKey) : [];

  /**
   * Resolve a card the user is being told to ADD.
   *
   * Membership of the pool index IS the legality and colour-identity check: the
   * pool was fetched with exactly those two filters, so a name that resolves
   * here has already passed both. A name that does not resolve is diagnosed
   * only to record *why*, never to let it through.
   *
   * `inDeckExempt` is consulted only AFTER the card has resolved, so the
   * exemption is decided from the real row's type line rather than from the
   * name the model happened to write. Its one caller is the land section, where
   * a basic already in the deck is still addable — see `isBasicLand`.
   */
  const resolveAdd = (
    name: string,
    section: string,
    seen: Set<string>,
    inDeckExempt?: (card: CandidateCard) => boolean
  ): CandidateCard | null => {
    log.check();
    const key = normalizeName(name);
    if (!key) {
      log.drop(section, name, 'empty-name');
      return null;
    }
    const card = poolIndex.resolve(name);
    if (!card) {
      const d = diagnose(name, missRows, legalityKey, colorIdentity);
      log.drop(section, name, d.reason, d.detail);
      return null;
    }
    if (
      !inDeckExempt?.(card) &&
      (inDeck.has(key) || inDeck.has(normalizeName(card.name)))
    ) {
      log.drop(section, name, 'already-in-deck');
      return null;
    }
    if (seen.has(card.oracleId)) {
      log.drop(section, name, 'duplicate');
      return null;
    }
    seen.add(card.oracleId);
    log.accept();
    touched.add(card.name);
    return card;
  };

  /**
   * Resolve a card the user is being told to CUT. It must be in the deck.
   *
   * Returns the deck row when the catalogue knows it, but a card the catalogue
   * cannot resolve is still cuttable: one real deck plays a Stickers card that
   * is not commander legal and therefore not in any pool, and telling the user
   * they may not remove it would be absurd.
   *
   * `deckName` is the deck's own spelling and is what callers must ship, for
   * the reason given on `deckNameByKey`.
   */
  const resolveCut = (
    name: string,
    section: string,
    seen: Set<string>
  ): { ok: boolean; card: CandidateCard | null; deckName: string } => {
    log.check();
    const key = normalizeName(name);
    if (!key) {
      log.drop(section, name, 'empty-name');
      return { ok: false, card: null, deckName: name };
    }
    // 'not-in-deck' before 'is-commander', so the recorded reason is the true
    // one: the commander IS in the deck, and being it is the separate, stronger
    // objection. The order is asserted in `cut-rules.test.ts`.
    const refusal = cutRefusal(key, inDeck, commanderKeys);
    if (refusal) {
      log.drop(section, name, refusal);
      return { ok: false, card: null, deckName: name };
    }
    if (seen.has(key)) {
      log.drop(section, name, 'duplicate');
      return { ok: false, card: null, deckName: name };
    }
    seen.add(key);
    log.accept();
    const deckName = deckNameByKey.get(key) ?? name;
    const card = deckIndex.resolve(name);
    // Every spelling of this card the function holds. `attachRealData` looks
    // the display row up with an exact, case-sensitive `name=in.(...)`, so the
    // catalogue's own spelling is the one that reliably matches; the other two
    // are kept because a card the catalogue does not know still has a name.
    if (card) touched.add(card.name);
    touched.add(deckName);
    touched.add(name);
    return { ok: true, card, deckName };
  };

  /* --- additions --- */
  const seenAdd = new Set<string>();
  const additions: Record<string, unknown>[] = [];
  for (const x of arr(raw.additions)) {
    const card = resolveAdd(str(x.name), 'additions', seenAdd);
    if (!card) continue;
    additions.push({
      name: card.name,
      reason: str(x.reason),
      // The resolved row's type line wins over the model's. `card` is the
      // catalogue row this name resolved to, so `card.typeLine` is the fact
      // and `x.type` is a recollection of it. Taking the model's first meant a
      // verified card could be shipped wearing an invented type — "Legendary
      // Creature" on an artifact — with `verified: true` beside it, which is
      // the one combination the user has no way to doubt.
      type: card.typeLine || str(x.type),
      category: str(x.category) || 'Other',
      priority: priority(x.priority),
      edhImpact: optionalNum(x.edhImpact),
      _card: card,
    });
  }

  /* --- removals --- */
  const seenCut = new Set<string>();
  const removals: Record<string, unknown>[] = [];
  for (const x of arr(raw.removals)) {
    const cut = resolveCut(str(x.name), 'removals', seenCut);
    if (!cut.ok) continue;
    removals.push({
      // The deck's spelling, not the model's — a cut is applied by name.
      name: cut.deckName,
      reason: str(x.reason),
      priority: priority(x.priority),
      edhImpact: optionalNum(x.edhImpact),
      _card: cut.card,
    });
  }

  /* --- replacements --- */
  // Both halves must pass. A swap whose "add" is illegal is not a swap, and a
  // swap whose "remove" is not in the deck is not actionable.
  const seenRepAdd = new Set<string>();
  const seenRepCut = new Set<string>();
  const replacements: Record<string, unknown>[] = [];
  for (const x of arr(raw.replacements)) {
    const cut = resolveCut(str(x.remove), 'replacements.remove', seenRepCut);
    const addCard = resolveAdd(str(x.add), 'replacements.add', seenRepAdd);
    if (!cut.ok || !addCard) continue;
    replacements.push({
      // The deck's spelling, not the model's — a swap removes by name.
      remove: cut.deckName,
      removeReason: str(x.removeReason),
      add: addCard.name,
      addBenefit: str(x.addBenefit),
      // Measured type line first, for the reason given on `additions.type`.
      addType: addCard.typeLine || str(x.addType),
      synergy: str(x.synergy) || null,
      category: str(x.category) || null,
      priority: priority(x.priority),
      edhImpact: optionalNum(x.edhImpact),
      _addCard: addCard,
      _removeCard: cut.card,
    });
  }

  /* --- land recommendations --- */
  // Basic lands are the one place a repeated name is meaningful ("add three
  // Plains"), so repeats collapse into a quantity instead of becoming three
  // identical rows, which is what the previous response did.
  const landAdds = new Map<string, Record<string, unknown>>();
  const seenLandAdd = new Set<string>();
  const seenLandCut = new Set<string>();
  const landRecommendations: Record<string, unknown>[] = [];
  for (const x of arr(raw.landRecommendations)) {
    const name = str(x.name);
    if (str(x.type) === 'remove') {
      const cut = resolveCut(name, 'landRecommendations.remove', seenLandCut);
      if (!cut.ok) continue;
      landRecommendations.push({
        type: 'remove',
        // The deck's spelling, not the model's — a cut is applied by name.
        name: cut.deckName,
        reason: str(x.reason),
        priority: priority(x.priority),
        category: str(x.category) || 'Basic',
        quantity: 1,
        _card: cut.card,
      });
      continue;
    }

    const existing = landAdds.get(normalizeName(name));
    if (existing) {
      // A repeat of an already-accepted land. It is still a name the model
      // produced, so it is counted in the drop rate's denominator — otherwise
      // "add five Plains" would move the measured rate simply by being asked
      // for as five names instead of one.
      log.check();
      // ONLY a basic may repeat. This branch returns before `resolveAdd` is
      // called, so `seenLandAdd` — the oracle-id duplicate guard that stops
      // every other section offering the same card twice — never sees a land
      // at all. Without the test below, a model that listed "Command Tower"
      // twice had the second occurrence silently folded into `quantity: 2`
      // and recorded as ACCEPTED. The response then told a Commander player
      // to add two copies of a singleton card: not a legal deck, produced by
      // the one path in this file that accepted a name without checking it.
      // Quantity is only meaningful for basics, so a repeat of anything else
      // is the model saying the same thing twice — a duplicate, not a copy.
      if (landRepeatDisposition(existing._card as CandidateCard | null) === 'duplicate') {
        log.drop('landRecommendations.add', name, 'duplicate');
        continue;
      }
      log.accept();
      existing.quantity = (Number(existing.quantity) || 1) + 1;
      continue;
    }
    // Basic lands are exempt from "already in the deck": a deck may run any
    // number of them, so a land-short deck that already plays Plains is
    // exactly the deck that should be told to add more. Without this, every
    // basic-land recommendation was dropped as `already-in-deck`, the
    // quantity-collapse above could never fire, and the drop rate this
    // response reports was inflated by suggestions that were never wrong.
    const card = resolveAdd(name, 'landRecommendations.add', seenLandAdd, isBasicLand);
    if (!card) continue;
    if (!isLandCard(card)) {
      log.drop('landRecommendations.add', name, 'not-a-land', `type_line = ${card.typeLine}`);
      continue;
    }
    const row: Record<string, unknown> = {
      type: 'add',
      name: card.name,
      reason: str(x.reason),
      priority: priority(x.priority),
      category: str(x.category) || 'Basic',
      quantity: 1,
      _card: card,
    };
    landAdds.set(normalizeName(name), row);
    landRecommendations.push(row);
  }

  /* --- issues --- */
  // This section used to be the one place a model-authored card name reached
  // the user unchecked: `issues[].card` is rendered verbatim in the optimiser's
  // Issues panel, so an invented name became a confident statement about the
  // user's deck, and it was invisible to the drop rate because nothing counted
  // it. An issue is a claim ABOUT a card the deck contains, so it is held to
  // the same rule as a removal. Commentary that is not about one specific card
  // belongs in summary / strengths / strategy / manabase, which are prose and
  // name nothing.
  const issues: Record<string, unknown>[] = [];
  for (const x of arr(raw.issues)) {
    const name = str(x.card);
    log.check();
    const key = normalizeName(name);
    if (!key) {
      log.drop('issues', name, 'empty-name');
      continue;
    }
    if (!inDeck.has(key)) {
      log.drop('issues', name, 'not-in-deck');
      continue;
    }
    log.accept();
    issues.push({
      card: name,
      reason: str(x.reason),
      severity: ['high', 'medium', 'low'].includes(String(x.severity))
        ? String(x.severity)
        : 'medium',
      category: x.category ?? null,
    });
  }

  return {
    // The pre-existing rule: additions only matter to an incomplete deck, and
    // removals only to an overloaded one.
    additions: a.missingCards > 0 ? additions.slice(0, Math.max(a.missingCards + 5, 15)) : [],
    removals: a.excessCards > 0 ? removals.slice(0, Math.max(a.excessCards + 3, 10)) : [],
    replacements: replacements.slice(0, 15),
    landRecommendations: landRecommendations.slice(0, 12),
    issues,
    touched,
  };
}

/**
 * What to return when the model gave nothing usable.
 *
 * Every card here came out of the ranked pool, so it is real, legal and in
 * identity by construction, and every reason string was assembled from measured
 * signals by the engine. It is a plainer answer than a working model produces,
 * but it is an answer — and on this path the previous version returned HTTP 500.
 */
function engineOnlySections(args: {
  candidates: Recommendation[];
  landCandidates: Recommendation[];
  swapTargets: SwapTarget[];
  missingCards: number;
  excessCards: number;
}): Sections {
  const { candidates, landCandidates, swapTargets, missingCards, excessCards } = args;
  const touched = new Set<string>();

  const additions =
    missingCards > 0
      ? candidates.slice(0, Math.max(missingCards + 5, 15)).map(r => {
          touched.add(r.card.name);
          return {
            name: r.card.name,
            reason: r.reason,
            type: r.card.typeLine,
            category: categoryFor(r),
            priority: r.score >= 3 ? 'high' : r.score >= 1.5 ? 'medium' : 'low',
            edhImpact: null,
            _card: r.card,
          };
        })
      : [];

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

  // A complete deck: pair the weakest cards with the strongest candidates.
  const replacements =
    missingCards === 0 && excessCards === 0
      ? swapTargets.slice(0, Math.min(10, candidates.length)).map((t, i) => {
          const r = candidates[i];
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
        })
      : [];

  const landRecommendations = landCandidates.slice(0, 8).map(r => {
    touched.add(r.card.name);
    return {
      type: 'add',
      name: r.card.name,
      reason: r.reason,
      priority: 'medium',
      category: 'Utility',
      quantity: 1,
      _card: r.card,
    };
  });

  // No issues: the engine ranks and explains cards, but it has no opinion to
  // offer about a specific card being a problem, and an empty list is the
  // honest way to say so.
  return { additions, removals, replacements, landRecommendations, issues: [], touched };
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
  const owned = await catalog.ownedQuantities(names);
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
  for (const r of sections.replacements) {
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
 *   analysis.validation     what was dropped and why. The measurement.
 *   analysis.grounding      pool size, candidates offered, identity, timings
 *   analysis.engine         version, whether the model was used, failure reason
 *   analysis.deck           measured role counts/targets, curve, deck themes
 *   analysis.swapTargets    cut candidates with their castability source
 *   analysis.power          THE score, from the same engine the deck page runs.
 *                           Same decklist in, same number out, and
 *                           src/engine/one-brain.test.ts fails if they differ.
 *   analysis.categoriesSource  'model' | 'measured'
 *   per addition/removal/land: cardId, oracleId, imageUrl, setCode, rarity,
 *                              priceUsd, owned, ownedQuantity,
 *                              ownedQuantitySource, verified,
 *                              and quantity on landRecommendations
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
  raw: Record<string, unknown> | null;
  enriched: Sections;
  profile: DeckProfile;
  log: ValidationLog;
  landCount: number;
  idealLandCount: number;
  swapTargets: SwapTarget[];
  evaluation: DeckEvaluation | null;
  colorIdentity: Color[];
  identitySource: string;
  unresolved: string[];
  poolRows: number;
  poolCards: number;
  candidatesOffered: number;
  usesIndex: boolean;
  aiUsed: boolean;
  aiFailure: string | null;
  elapsedMs: number;
}): Record<string, unknown> {
  const { raw, enriched, profile, log } = args;

  const roleCounts: Record<string, number> = {};
  const roleTargets: Record<string, number> = {};
  for (const role of ROLES) {
    roleCounts[role] = profile.roleCounts[role] ?? 0;
    roleTargets[role] = profile.roleTargets[role] ?? 0;
  }

  const measured = measuredCategories(profile, args.landCount, args.idealLandCount);
  const modelCategories = raw?.categories as Record<string, unknown> | undefined;
  const categories = modelCategories
    ? {
        synergy: clamp(num(modelCategories.synergy, measured.synergy)),
        consistency: clamp(num(modelCategories.consistency, measured.consistency)),
        power: clamp(num(modelCategories.power, measured.power)),
        interaction: clamp(num(modelCategories.interaction, measured.interaction)),
        manabase: clamp(num(modelCategories.manabase, measured.manabase)),
      }
    : measured;

  return {
    summary: raw?.summary ? str(raw.summary) : engineSummary(profile, args),
    categories,
    categoriesSource: modelCategories ? 'model' : 'measured',
    currentPowerLevel: typeof raw?.currentPowerLevel === 'number' ? raw.currentPowerLevel : null,
    projectedPowerLevel:
      typeof raw?.projectedPowerLevel === 'number' ? raw.projectedPowerLevel : null,
    // Already resolved against the deck in `validateSections`. Reading
    // `raw.issues` here instead would put the one unvalidated card name in the
    // response straight back.
    issues: enriched.issues,
    strengths: arr(raw?.strengths).map(textOf),
    strategy: arr(raw?.strategy).map(textOf),
    manabase: raw?.manabase ? arr(raw.manabase).map(textOf) : [{ text: manabaseNote(args) }],

    additions: enriched.additions,
    removals: enriched.removals,
    replacements: enriched.replacements,
    landRecommendations: enriched.landRecommendations,
    landCount: args.landCount,
    idealLandCount: args.idealLandCount,

    /* --- added --- */
    validation: log.summary(),
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
      elapsedMs: args.elapsedMs,
    },
    engine: {
      version: ENGINE_VERSION,
      aiUsed: args.aiUsed,
      aiFailure: args.aiFailure,
      fallbackUsed: !args.aiUsed,
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
  parts.push('These suggestions came from the in-house engine, not a language model.');
  return parts.join(' ');
}

function manabaseNote(args: { landCount: number; idealLandCount: number }): string {
  const d = args.landCount - args.idealLandCount;
  if (d === 0) return `${args.landCount} lands, exactly what this format wants.`;
  return `${args.landCount} lands against ${args.idealLandCount}: ${Math.abs(d)} ${d < 0 ? 'short' : 'over'}.`;
}

/* ------------------------------------------------------------------ *
 * The prompt
 * ------------------------------------------------------------------ */

function candidateLine(r: Recommendation): string {
  const price = r.card.usd === null ? 'n/a' : `$${r.card.usd.toFixed(2)}`;
  const tags = r.card.tags.slice(0, 5).join(',') || '-';
  return `- ${r.card.name} | ${r.card.typeLine} | mv ${r.card.cmc} | ${price} | ${tags} | ${r.reason}`;
}

function buildGroundedPrompt(p: {
  deckContext: Record<string, unknown>;
  profile: DeckProfile;
  commanderCard: CandidateCard | null;
  colorIdentity: Color[];
  totalWithCommander: number;
  requiredCards: number;
  missingCards: number;
  excessCards: number;
  landCount: number;
  idealLandCount: number;
  candidates: Recommendation[];
  landCandidates: Recommendation[];
  basics: CandidateCard[];
  swapTargets: SwapTarget[];
  deckEntries: DeckEntry[];
  gaps: Role[];
  useCollection: boolean;
  collectionCards: string[];
  edhAnalysis: Record<string, unknown> | null;
}): string {
  const {
    profile,
    commanderCard,
    colorIdentity,
    totalWithCommander,
    requiredCards,
    missingCards,
    excessCards,
    landCount,
    idealLandCount,
    candidates,
    landCandidates,
    basics,
    swapTargets,
    deckEntries,
    gaps,
  } = p;

  const status =
    missingCards > 0
      ? `INCOMPLETE — needs ${missingCards} more cards. Priority: ADDITIONS.`
      : excessCards > 0
        ? `OVERLOADED — ${excessCards} too many cards. Priority: REMOVALS.`
        : `COMPLETE. Priority: SWAPS.`;

  const out: string[] = [];
  out.push(`# Deck optimisation`);
  out.push(``);
  out.push(`## The rule that governs this task`);
  out.push(
    `Every card you name in additions, replacements.add, or landRecommendations of ` +
      `type "add" MUST be copied verbatim from the CANDIDATE POOL or LAND CANDIDATES ` +
      `below. Those lists were retrieved from the card database: every entry is a real ` +
      `card, legal in ${profile.format}, and inside this deck's colour identity. Do not ` +
      `name a card from memory. Any name that is not in the list is discarded before the ` +
      `user sees it, so naming one only wastes the slot.`
  );
  out.push(
    `Every card you name in removals, replacements.remove, landRecommendations of ` +
      `type "remove", or issues MUST be copied verbatim from the DECK list. An issue ` +
      `is a problem with a card this deck already plays; for anything broader use the ` +
      `summary, strengths, strategy or mana base notes, which name no cards.`
  );
  out.push(
    `Do not suggest adding a card the DECK list already contains — except basic lands, ` +
      `of which a deck may play any number.`
  );
  out.push(``);
  out.push(`## Deck`);
  out.push(`Name: ${str(p.deckContext.name) || 'Unnamed'}`);
  out.push(`Format: ${profile.format}`);
  if (commanderCard) out.push(`Commander: ${commanderCard.name}`);
  out.push(`Colour identity: ${colorIdentity.join('') || 'colourless'}`);
  out.push(`Cards: ${totalWithCommander}/${requiredCards} — ${status}`);
  out.push(`Lands: ${landCount} (format target ${idealLandCount})`);
  out.push(`Mean mana value of non-lands: ${profile.meanCmc.toFixed(2)}`);
  out.push(
    `Roles held/target: ` +
      ROLES.map(r => `${r} ${profile.roleCounts[r] ?? 0}/${profile.roleTargets[r] ?? 0}`).join(' | ')
  );
  if (gaps.length) out.push(`Short of, worst first: ${gaps.join(', ')}`);
  if (profile.signalTags.length) {
    out.push(`Deck themes, measured from card tags: ${profile.signalTags.slice(0, 14).join(', ')}`);
  }
  out.push(``);

  out.push(`## DECK — the only cards you may name for removal`);
  out.push(
    deckEntries
      .filter(e => !e.isCommander)
      .map(e => `- ${e.name}${e.quantity > 1 ? ` x${e.quantity}` : ''}`)
      .join('\n')
  );
  out.push(``);

  if (swapTargets.length) {
    out.push(`## Cut targets, weakest first`);
    out.push(
      swapTargets
        .map(
          t =>
            `- ${t.name} — ${t.reason}` +
            (t.castability === null ? ' [NO castability figure exists for this card]' : '')
        )
        .join('\n')
    );
    out.push(
      `This order is not an opinion. It comes from the same evaluation that produced ` +
        `the power score above: cards you cannot reliably pay for come first, worst ` +
        `first, then cards that share nothing with the deck and fill no job it is ` +
        `short of. A card with no castability figure is UNMEASURED, not weak, and a ` +
        `missing figure must never be treated as a low one.`
    );
    out.push(``);
  }

  out.push(`## CANDIDATE POOL — additions and replacement adds must come from here`);
  out.push(`Format: name | type | mana value | price | tags | why the engine ranked it`);
  out.push(candidates.map(candidateLine).join('\n'));
  out.push(``);

  out.push(`## LAND CANDIDATES — landRecommendations of type "add" must come from here`);
  out.push(landCandidates.map(candidateLine).join('\n'));
  if (basics.length) {
    out.push(basics.map(b => `- ${b.name} | ${b.typeLine} | mv 0 | basic land`).join('\n'));
    out.push(`To recommend several copies of a basic land, list it once per copy.`);
  }
  out.push(``);

  if (p.useCollection && p.collectionCards.length) {
    out.push(`## The user already owns these — prefer them where they appear in the pool`);
    out.push(p.collectionCards.slice(0, 150).join(', '));
    out.push(``);
  }

  if (p.edhAnalysis) {
    const e = p.edhAnalysis as Record<string, unknown>;
    out.push(`## External EDH metrics (advisory)`);
    out.push(
      `Tipping point: ${str(e.tippingPoint) || 'n/a'} | efficiency: ` +
        `${str(e.efficiency) || 'n/a'} | impact: ${str(e.impact) || 'n/a'}`
    );
    out.push(``);
  }

  out.push(`## What to return`);
  if (missingCards > 0) {
    out.push(
      `Choose ${Math.min(missingCards + 5, 20)} additions from the CANDIDATE POOL, spread ` +
        `across Essential / Ramp / Card Draw / Removal / Creatures / Lands and weighted ` +
        `towards the roles the deck is short of.`
    );
  } else if (excessCards > 0) {
    out.push(`Identify at least ${excessCards + 2} cards from the DECK list to cut.`);
  } else {
    out.push(
      `Propose 10-15 replacements. Each removes a card from the DECK list and adds one ` +
        `from the CANDIDATE POOL.`
    );
  }
  if (Math.abs(landCount - idealLandCount) > 2) {
    out.push(
      landCount < idealLandCount
        ? `Recommend ${idealLandCount - landCount} lands to add, from LAND CANDIDATES.`
        : `Recommend ${landCount - idealLandCount} lands from the DECK list to remove.`
    );
  }
  out.push(
    `Also give category scores 0-100 (synergy, consistency, power, interaction, manabase), ` +
      `a 2-3 sentence summary, 3-5 strengths, 3-5 strategy notes, and mana base ` +
      `observations. Justify every pick from the measured numbers above.`
  );

  return out.join('\n');
}

/* ------------------------------------------------------------------ *
 * The model call
 * ------------------------------------------------------------------ */

type ModelResult =
  | { kind: 'ok'; analysis: Record<string, unknown> }
  | { kind: 'failed'; reason: string }
  | { kind: 'rate_limit' }
  | { kind: 'payment_required' };

const TEXT_LIST = {
  type: 'array',
  items: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
};

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'deck_analysis',
      description: 'Deck analysis, choosing only from the supplied candidate pool and deck list',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: '2-3 sentence executive summary' },
          categories: {
            type: 'object',
            properties: {
              synergy: { type: 'number' },
              consistency: { type: 'number' },
              power: { type: 'number' },
              interaction: { type: 'number' },
              manabase: { type: 'number' },
            },
            required: ['synergy', 'consistency', 'power', 'interaction', 'manabase'],
          },
          currentPowerLevel: { type: 'number' },
          projectedPowerLevel: { type: 'number' },
          issues: {
            type: 'array',
            description:
              'Problems with specific cards the deck already plays. Use summary / ' +
              'strengths / strategy / manabase for anything not about one named card.',
            items: {
              type: 'object',
              properties: {
                card: {
                  type: 'string',
                  description: 'Copied verbatim from the DECK list',
                },
                reason: { type: 'string' },
                severity: { type: 'string', enum: ['low', 'medium', 'high'] },
                category: { type: 'string' },
              },
              required: ['card', 'reason', 'severity'],
            },
          },
          strengths: TEXT_LIST,
          strategy: TEXT_LIST,
          manabase: TEXT_LIST,
          additions: {
            type: 'array',
            description: 'Cards to add. Each name MUST appear verbatim in the CANDIDATE POOL.',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Copied verbatim from the CANDIDATE POOL' },
                reason: { type: 'string' },
                type: { type: 'string' },
                category: { type: 'string' },
                priority: { type: 'string', enum: ['high', 'medium', 'low'] },
                edhImpact: { type: 'number' },
              },
              required: ['name', 'reason', 'priority'],
            },
          },
          removals: {
            type: 'array',
            description: 'Cards to cut. Each name MUST appear verbatim in the DECK list.',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Copied verbatim from the DECK list' },
                reason: { type: 'string' },
                priority: { type: 'string', enum: ['high', 'medium', 'low'] },
                edhImpact: { type: 'number' },
              },
              required: ['name', 'reason', 'priority'],
            },
          },
          replacements: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                remove: { type: 'string', description: 'Verbatim from the DECK list' },
                removeReason: { type: 'string' },
                add: { type: 'string', description: 'Verbatim from the CANDIDATE POOL' },
                addBenefit: { type: 'string' },
                addType: { type: 'string' },
                synergy: { type: 'string' },
                category: { type: 'string' },
                priority: { type: 'string', enum: ['high', 'medium', 'low'] },
                edhImpact: { type: 'number' },
              },
              required: ['remove', 'removeReason', 'add', 'addBenefit', 'priority'],
            },
          },
          landRecommendations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['add', 'remove'] },
                name: {
                  type: 'string',
                  description: 'Verbatim from LAND CANDIDATES (add) or the DECK list (remove)',
                },
                reason: { type: 'string' },
                priority: { type: 'string', enum: ['high', 'medium', 'low'] },
                category: { type: 'string' },
              },
              required: ['type', 'name', 'reason', 'priority'],
            },
          },
        },
        required: ['summary', 'categories', 'issues', 'strengths', 'strategy', 'manabase'],
      },
    },
  },
];

async function callModel(
  prompt: string,
  apiKey: string | null,
  format: string
): Promise<ModelResult> {
  if (!apiKey) return { kind: 'failed', reason: 'LOVABLE_API_KEY is not configured' };

  let response: Response;
  try {
    response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content:
              `You are a Magic: The Gathering deck optimiser working from retrieved data.\n\n` +
              `The user message contains a CANDIDATE POOL fetched from a card database. Every ` +
              `entry in it is a real card, legal in ${format}, and inside the deck's colour ` +
              `identity. Your job is to CHOOSE from that pool and justify the choice — not to ` +
              `recall card names from memory.\n\n` +
              `Hard rules:\n` +
              `1. Copy card names verbatim from the CANDIDATE POOL / LAND CANDIDATES (to add) ` +
              `or from the DECK list (to cut). A name from neither list is discarded before ` +
              `the user sees it.\n` +
              `2. Never suggest adding a card the DECK list already contains, except ` +
              `basic lands — a deck may play any number of those.\n` +
              `2a. An issue names a card from the DECK list. Observations about the deck ` +
              `as a whole go in the summary, strengths, strategy or mana base notes.\n` +
              `3. Justify each pick from the measured numbers supplied: role gaps, mana curve, ` +
              `shared tags, price.\n` +
              `4. A card with no castability figure is unmeasured, not weak.\n` +
              `5. Prefer cards the user already owns when they appear in the pool.`,
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: MAX_OUTPUT_TOKENS,
        tools: TOOLS,
        tool_choice: { type: 'function', function: { name: 'deck_analysis' } },
      }),
    });
  } catch (e) {
    return { kind: 'failed', reason: `gateway unreachable: ${String(e).slice(0, 200)}` };
  }

  if (response.status === 429) return { kind: 'rate_limit' };
  if (response.status === 402) return { kind: 'payment_required' };
  if (!response.ok) {
    console.error('AI Gateway error:', response.status, (await response.text()).slice(0, 500));
    return { kind: 'failed', reason: `gateway ${response.status}` };
  }

  const payload = await response.json();
  const choice = payload.choices?.[0];
  const finish = choice?.finish_reason ?? null;
  const toolCalls = choice?.message?.tool_calls;

  if (toolCalls?.length) {
    try {
      return { kind: 'ok', analysis: JSON.parse(toolCalls[0].function.arguments) };
    } catch (e) {
      // Truncated mid-JSON. This used to become an HTTP 500; the engine now
      // answers instead.
      console.error('tool arguments unparseable, finish_reason =', finish, String(e).slice(0, 200));
      return { kind: 'failed', reason: `tool arguments unparseable (finish_reason=${finish})` };
    }
  }

  const content = choice?.message?.content;
  if (typeof content === 'string' && content.trim()) {
    try {
      return { kind: 'ok', analysis: parseJsonFallback(content) };
    } catch {
      /* fall through to the engine */
    }
  }

  console.error('no usable model output; finish_reason =', finish);
  return { kind: 'failed', reason: `no tool call (finish_reason=${finish ?? 'unknown'})` };
}

function parseJsonFallback(text: string): Record<string, unknown> {
  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const start = clean.indexOf('{');
  if (start === -1) throw new Error('No JSON found');
  let depth = 0;
  for (let i = start; i < clean.length; i++) {
    if (clean[i] === '{') depth++;
    else if (clean[i] === '}' && --depth === 0) return JSON.parse(clean.slice(start, i + 1));
  }
  throw new Error('Incomplete JSON');
}

/* ------------------------------------------------------------------ *
 * Small coercions
 * ------------------------------------------------------------------ */

function arr(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}
function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
/**
 * A number the model actually sent, or nothing.
 *
 * Deliberately separate from `num`. `num` is for fields where the substitute is
 * itself a real answer — a category score falling back to `measuredCategories`,
 * which is computed from the deck. `edhImpact` has no such backing: nothing on
 * this server measures the power change of a swap, so a default turns "the
 * model omitted this field" into a confident badge on the card. The client
 * renders nothing for `null`, but it could never do so while the constant was
 * being minted here — from the client's side 0.2 and a real 0.2 are identical.
 */
function optionalNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function clamp(n: number): number {
  return Math.min(100, Math.max(0, Math.round(Number.isFinite(n) ? n : 0)));
}
function priority(v: unknown): string {
  return ['high', 'medium', 'low'].includes(String(v)) ? String(v) : 'medium';
}
function textOf(s: unknown): { text: string } {
  return { text: typeof s === 'string' ? s : str((s as Record<string, unknown> | null)?.text) };
}
