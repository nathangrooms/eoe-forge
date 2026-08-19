/**
 * The Deck Generator's pipeline: retrieve, rank, ground, validate.
 *
 * Split out of `index.ts` so it can be RUN outside Deno. `index.ts` imports
 * `serve` from deno.land at module scope, which means importing it at all
 * starts an HTTP listener — so nothing could ever exercise this code except a
 * deployed function and a live request. The verification harness in
 * `scripts/generator-shots.mjs` imports this module and calls `build()`, which
 * is the same function the edge function calls, rather than a re-implementation
 * of it that could quietly disagree.
 *
 * Everything about WHY this pipeline looks like this is documented in
 * `index.ts`. Read that first.
 */

import { Catalog, normalizeName, type CatalogRow } from './catalog.ts';
import { getAdminConfig, AI_PROMPTS } from './admin-config.ts';
import {
  buildCandidateQuery,
  deriveDeckProfile,
  normalizeRow,
  normalizeIdentity,
  type CandidateQuery,
} from './_engine/advise/index.ts';
import { generateDeck, type BuildCard, type GeneratedDeck } from './_engine/build/generate.ts';
import { evaluateDeck } from './_engine/evaluate.ts';
import type { EngineCard } from './_engine/core/card.ts';

/** Bumped whenever the grounding or the assembly rules change. */
export const ENGINE_VERSION = 'ai-deck-builder-v2/6-grounded';

/** A Commander deck is the commander plus this many. A rule, not a policy. */
const DECK_SLOTS = 99;

/** The only cards exempt from singleton, and the only ones we supply ourselves. */
const BASIC_LANDS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'] as const;
const COLOR_TO_BASIC: Record<string, string> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
  C: 'Wastes',
};

/** How many ranked candidates the planner is allowed to choose between. */
const PLANNER_SHORTLIST = 140;

/** Output budget for the planner. It returns a short list of ids and a sentence. */
const MAX_OUTPUT_TOKENS = 4000;

export interface BuildRequest {
  commander: {
    id?: string;
    name: string;
    oracle_text?: string;
    type_line?: string;
    color_identity?: string[];
    colors?: string[];
  };
  archetype?: string;
  powerLevel?: number;
  budget?: number;
  customPrompt?: string;
  useAIPlanning?: boolean;
}

const countCopies = (deck: { quantity?: number }[]): number =>
  deck.reduce((sum, c) => sum + (Number(c?.quantity) || 1), 0);

/** A card id we can actually write to `deck_cards.card_id`. */
const hasPersistableId = (c: { id?: unknown }): boolean =>
  typeof c?.id === 'string' &&
  c.id.length > 0 &&
  !c.id.startsWith('missing-') &&
  !c.id.includes('pad-');

/* ------------------------------------------------------------------ *
 * The pipeline
 * ------------------------------------------------------------------ */

export interface BuildInput {
  catalog: Catalog;
  request: BuildRequest;
  apiKey: string | null;
  startedAt: number;
}

export type BuildOutcome =
  | { kind: 'ok'; body: Record<string, unknown> }
  | { kind: 'refused'; error: string; validation: BuildValidation };

export async function build(input: BuildInput): Promise<BuildOutcome> {
  const { catalog, request, startedAt } = input;
  const config = getAdminConfig();

  const format = 'commander';
  const commanderName = request.commander.name;
  const targetBudget = request.budget && request.budget > 0 ? request.budget : null;

  console.log('='.repeat(60));
  console.log(`${ENGINE_VERSION} — ${commanderName}`);
  console.log(`archetype=${request.archetype ?? 'none'} budget=${targetBudget ?? 'none'}`);

  /* --- 1. Resolve the commander against OUR catalogue --------------- */
  // Not against what the client sent. The client's commander comes from the
  // Scryfall API, a different table from ours; if the printing it named is not
  // synced locally the deck cannot be saved, and it is better to find that out
  // here than after a hundred cards have been chosen.
  const commanderRows = await catalog.cardsByName([commanderName], format);
  const commanderRow = commanderRows.find(
    r => normalizeName(r.name) === normalizeName(commanderName)
  );
  if (!commanderRow) {
    throw new Error(
      `"${commanderName}" is not in the card database, so a deck cannot be built around it. ` +
        `Run a card sync, or pick another commander.`
    );
  }
  const commander = toBuildCard(commanderRow, format);
  // The commander's own row is the authority on colour identity.
  const commanderIdentity = commander.colorIdentity;
  console.log(`  identity: ${commanderIdentity.join('') || 'colourless'}`);

  /* --- 2. Retrieve. The whole pool, never a slice. ------------------ */
  const profileForQuery = deriveDeckProfile({
    format,
    colorIdentity: commanderIdentity,
    cards: [],
  });
  const query: CandidateQuery = buildCandidateQuery(profileForQuery);

  const poolStarted = Date.now();
  const [spellRows, landRows, basicRows] = await Promise.all([
    catalog.poolFor(query),
    catalog.landPoolFor(query),
    catalog.cardsByName([...BASIC_LANDS], format),
  ]);
  const poolMs = Date.now() - poolStarted;

  // The land rows carry oracle text and the pool rows do not, so where a card
  // appears in both the land row wins. That is the only difference between
  // them, and it is the difference the mana base is chosen on.
  const byId = new Map<string, CatalogRow>();
  for (const row of spellRows) byId.set(row.id, row);
  for (const row of landRows) byId.set(row.id, row);

  const pool: BuildCard[] = [...byId.values()]
    .filter(hasPersistableId)
    .map(row => toBuildCard(row, format));

  console.log(
    `  pool: ${spellRows.length} rows + ${landRows.length} land rows -> ` +
      `${pool.length} printings in ${poolMs} ms`
  );

  const basics = resolveBasics(basicRows, commanderIdentity, format);
  const missingBasics = wantedBasics(commanderIdentity).filter(
    name => !Object.values(basics).some(c => c?.name === name)
  );
  if (missingBasics.length) {
    console.warn(`  basics missing from the card database: ${missingBasics.join(', ')}`);
  }

  if (pool.length < DECK_SLOTS && Object.keys(basics).length === 0) {
    throw new Error(
      `The card database holds only ${pool.length} legal cards for ${commanderName} and no ` +
        `basic lands. Run a card sync before building.`
    );
  }

  const landTarget = clamp(config.minLandCount ?? 36, 30, 42);

  /* --- 3. Rank once, so the planner has something real to choose from */
  // A first build with no planner input. Its top entries are the shortlist the
  // model is shown; producing them by actually building means the shortlist IS
  // the ranking, rather than a separate approximation of it.
  const baseline = generateDeck({
    format,
    commander,
    pool,
    basics,
    slots: DECK_SLOTS,
    landTarget,
    budgetUsd: targetBudget,
  });

  /* --- 4. Ground the model in that shortlist ------------------------ */
  let plan: DeckPlan | null = null;
  if (request.useAIPlanning !== false && input.apiKey) {
    plan = await planFromShortlist({
      apiKey: input.apiKey,
      model: config.aiValidationModel,
      commander: commanderRow,
      archetype: request.archetype ?? '',
      powerLevel: request.powerLevel ?? 6,
      customPrompt: request.customPrompt ?? '',
      shortlist: shortlistFor(baseline, pool, PLANNER_SHORTLIST),
    });
  }

  /* --- 5. Build again, with the planner's choices as a prior -------- */
  const deck: GeneratedDeck =
    plan && (plan.preferOracleIds.length > 0 || plan.avoidOracleIds.length > 0)
      ? generateDeck({
          format,
          commander,
          pool,
          basics,
          slots: DECK_SLOTS,
          landTarget,
          budgetUsd: targetBudget,
          preferOracleIds: plan.preferOracleIds,
          avoidOracleIds: plan.avoidOracleIds,
        })
      : baseline;

  console.log(
    `  built: ${deck.totalCopies} cards, ${deck.landCopies} lands, ` +
      `provisional power ${deck.evaluation.power.score} (rescored below)`
  );
  if (plan) {
    console.log(
      `  planner: ${plan.preferOracleIds.length} picks accepted, ` +
        `${plan.rejected.length} rejected (not on the shortlist)`
    );
  }

  /* --- 6. Dress the chosen cards. THIS IS THE ART. ------------------ */
  /*
   * The pool is fetched WITHOUT `image_uris`, deliberately: a 25,000-row pool
   * carrying six URLs and a prices object per row is tens of megabytes to rank
   * a list of ninety-nine. So the ninety-nine get a second, tiny query once
   * they are chosen, and that query is where the art comes from.
   *
   * This is precisely the bug this whole task is about, one layer up. The old
   * builder never selected `image_uris` anywhere, so the Grid view drew grey
   * boxes with names on them. Fetching the wide columns for the pool would be
   * the wrong cure; fetching them for the picks is the right one, and it costs
   * one round trip for about ninety names.
   */
  const dressed = await catalog.cardsByName(
    deck.entries.map(e => e.card.name),
    format
  );
  for (const row of dressed) {
    // Keyed by id, so a name that resolves to several rows attaches to the
    // printing the deck actually chose rather than to an arbitrary sibling.
    const existing = byId.get(row.id);
    byId.set(row.id, existing ? { ...existing, ...row } : row);
  }

  /* --- 7. Score the deck ONCE MORE, now that it can be read properly */
  /*
   * The build's own evaluation is computed inside `generateDeck`, from pool
   * rows — and the pool deliberately carries `oracle_text` for LANDS ONLY,
   * because fetching it for 25,000 rows to rank ninety-nine is the wrong trade.
   * That is fine for choosing: the mana base is chosen from lands, and the
   * comment in `generate.ts` says the missing rocks make the estimate
   * conservative rather than optimistic.
   *
   * It is NOT fine for reporting. `buildManaProfile` reads oracle text to
   * recognise a mana source, so without it a Sol Ring is an artifact that makes
   * nothing. Measured on this Atraxa build: the pool-row evaluation put average
   * castability at 88.2% and the score at 6.9, while the same deck read with
   * its oracle text is 97% and 6.1. Two numbers for one deck, from one engine,
   * because one of them was reading half the card.
   *
   * The dressed rows have the text, so the deck is evaluated again on them and
   * THAT is what is reported. It is a hundred cards, not a catalogue, so it
   * costs nothing. Now the number in the response and the number the deck page
   * computes for itself are the same computation over the same fields.
   */
  const evaluation = evaluateDeck(
    [
      { card: toEngineCard(commander, commanderRow), quantity: 1, isCommander: true },
      ...deck.entries.map(entry => ({
        card: toEngineCard(entry.card, byId.get(entry.card.id) ?? null),
        quantity: entry.quantity,
      })),
    ],
    { format, commander: toEngineCard(commander, commanderRow) }
  );

  const playability = evaluation.playability;
  console.log(
    `  scored: power ${evaluation.power.score}, castable ` +
      `${playability.averagePct === null ? 'n/a' : Math.round(playability.averagePct) + '%'}` +
      ` (from the dressed rows, with oracle text)`
  );

  /* --- 8. Validate. Refuse rather than hand back something unsaveable */
  const cards = deck.entries.map(entry => toResponseCard(entry, byId));
  const withArt = cards.filter(c => c.image_uris && c.image_uris.normal).length;
  console.log(`  art: ${withArt}/${cards.length} entries carry image_uris`);
  const validation = validateDeck(cards, commanderRow, targetBudget);
  if (validation.blocking.length > 0) {
    return {
      kind: 'refused',
      error: `Could not build a legal 100-card deck for ${commanderName}: ${validation.blocking.join('; ')}`,
      validation,
    };
  }

  /* --- 9. Respond -------------------------------------------------- */
  const qty = (c: ResponseCard) => Number(c.quantity) || 1;
  const typeOf = (c: ResponseCard) => (c.type_line ?? '').toLowerCase();
  const sumBy = (pred: (c: ResponseCard) => boolean) =>
    cards.filter(pred).reduce((s, c) => s + qty(c), 0);

  const typeBreakdown = {
    creatures: sumBy(c => typeOf(c).includes('creature')),
    lands: sumBy(c => typeOf(c).includes('land')),
    instants: sumBy(c => typeOf(c).includes('instant')),
    sorceries: sumBy(c => typeOf(c).includes('sorcery')),
    artifacts: sumBy(c => typeOf(c).includes('artifact') && !typeOf(c).includes('creature')),
    enchantments: sumBy(c => typeOf(c).includes('enchantment')),
    planeswalkers: sumBy(c => typeOf(c).includes('planeswalker')),
  };

  const nonLands = cards.filter(c => !typeOf(c).includes('land'));
  const nonLandCopies = nonLands.reduce((s, c) => s + qty(c), 0);
  const manaCurve: Record<string, number> = {};
  for (const c of nonLands) {
    const mv = Math.floor(Number(c.cmc) || 0);
    const key = mv >= 7 ? '7+' : String(mv);
    manaCurve[key] = (manaCurve[key] ?? 0) + qty(c);
  }
  const avgCmc =
    nonLandCopies > 0
      ? nonLands.reduce((s, c) => s + (Number(c.cmc) || 0) * qty(c), 0) / nonLandCopies
      : 0;

  let decklistParam = `1x+${encodeURIComponent(commanderRow.name)}~`;
  for (const c of cards) decklistParam += `${qty(c)}x+${encodeURIComponent(c.name)}~`;
  const edhUrl = `https://edhpowerlevel.com/?d=${decklistParam.slice(0, -1)}`;

  const power = evaluation.power;

  return {
    kind: 'ok',
    body: {
      status: 'complete',
      engineVersion: ENGINE_VERSION,
      result: {
        deck: cards,
        /*
         * The commander AS OUR CATALOGUE HOLDS IT, art included.
         *
         * New, and worth the bytes. The client's commander comes from the
         * Scryfall API and carries a printing id that may not exist in our
         * `cards` table. This is the row the deck was actually built around, so
         * the result screen draws the commander from the same source as the
         * other 99, and the save path cannot end up writing a different
         * printing than the build reasoned about.
         */
        commander: commanderResponseCard(commander, commanderRow),
        totals: {
          deckCards: validation.totalCards,
          withCommander: validation.totalCards + 1,
          entries: cards.length,
          lands: typeBreakdown.lands,
        },
        analysis: {
          /*
           * OUR score, computed from the deck that was just built, by the same
           * engine the deck page and the optimiser use. This field used to
           * carry `targetPower` — the slider the player moved, echoed back as
           * if it were a measurement of the result.
           */
          power: power.score,
          band: power.band,
          bracket: power.bracket,
          subscores: power.subscores,
          unreliable: power.unreliable,
          castability: {
            averagePct: playability.averagePct,
            medianPct: playability.medianPct,
            belowThresholdCount: playability.belowThresholdCount,
            threshold: playability.threshold,
            landCount: playability.profile.landCount,
            rockCount: playability.profile.rockCount,
            dorkCount: playability.profile.dorkCount,
            sourcesByColour: playability.profile.sourcesByColour,
          },
          /** This deck's own cards, worst first, from that same evaluation. */
          cuts: evaluation.cuts.slice(0, 12).map(cut => ({
            name: cut.name,
            reason: cut.reason,
            castabilityPct: cut.castabilityPct,
            fitScore: cut.fitScore,
          })),
          roleFill: deck.roleFill,
          typeBreakdown,
          manaCurve,
          avgCmc,
          totalValue: deck.totalUsd,
          strategy: plan?.strategy ?? null,
          edhMetrics: null,
          cardAnalysis: null,
          landAnalysis: null,
        },
        changeLog: [
          `${validation.totalCards}/99 cards (+ commander = ${validation.totalCards + 1})`,
          `Colours: ${commanderIdentity.join('') || 'colourless'}`,
          `Lands: ${typeBreakdown.lands} (${sumBy(c => c.isBasicLand)} basic)`,
          `Chosen from ${pool.length} legal printings, all of them ranked`,
          ...deck.notes,
          ...(plan
            ? [
                `The planner chose ${plan.preferOracleIds.length} of ${PLANNER_SHORTLIST} shortlisted cards` +
                  (plan.rejected.length
                    ? `, and ${plan.rejected.length} of its answers were not on the shortlist and were dropped`
                    : ''),
              ]
            : ['Built without a planner: the ranking alone chose every card']),
          ...deck.shortfalls,
          ...(missingBasics.length
            ? [`Basics not in the card database: ${missingBasics.join(', ')}`]
            : []),
          ...validation.issues,
        ],
        validation,
      },
      plan: plan
        ? {
            strategy: plan.strategy,
            winConditions: plan.winConditions,
            warnings: plan.warnings,
            rejected: plan.rejected,
          }
        : null,
      /** Never scraped here. The client cross-references separately. */
      edhPowerLevel: null,
      edhPowerUrl: edhUrl,
      edhAnalysis: null,
      elapsedMs: Date.now() - startedAt,
    },
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/* ------------------------------------------------------------------ *
 * Card shapes
 * ------------------------------------------------------------------ */

function toBuildCard(row: CatalogRow, format: string): BuildCard {
  return {
    ...normalizeRow(row, format),
    oracleText: row.oracle_text ?? null,
    keywords: row.keywords ?? null,
  };
}

/**
 * A chosen card in the engine's own shape, read as completely as possible.
 *
 * `row` is the dressed catalogue row when there is one. It matters because the
 * pool rows carry no `oracle_text` for anything but lands, and the score reads
 * oracle text for half of what it counts — mana rocks, interaction, removal.
 * Preferring the row and falling back to the build card means the same function
 * works before and after the dressing query, and says which it had.
 */
function toEngineCard(card: BuildCard, row: CatalogRow | null): EngineCard {
  return {
    name: card.name,
    type_line: card.typeLine,
    mana_cost: card.manaCost,
    cmc: card.cmc,
    oracle_text: row?.oracle_text ?? card.oracleText ?? null,
    color_identity: card.colorIdentity,
    keywords: row?.keywords ?? (card.keywords as string[] | null) ?? null,
    legalities: card.legalities,
    oracle_id: card.oracleId,
    usd: card.usd,
    tags: card.tags,
  };
}

interface ResponseCard {
  id: string;
  oracle_id: string | null;
  name: string;
  type_line: string;
  cmc: number;
  mana_cost: string | null;
  color_identity: string[];
  oracle_text: string | null;
  keywords: string[] | null;
  tags: string[];
  /** The whole object. Its absence is what produced forty grey boxes. */
  image_uris: Record<string, string> | null;
  prices: { usd?: string | number | null } | null;
  rarity: string | null;
  set_code: string | null;
  edhrec_rank: number | null;
  quantity: number;
  isBasicLand: boolean;
  /** Why the engine put it here. Measured numbers, never model text. */
  reason: string;
  role: string;
}

/**
 * The card as the client receives it.
 *
 * Everything the deck list, the grid, the playtest hand and the optimiser
 * handoff need, taken from the row that was actually fetched. The previous
 * version emitted whatever the `select` happened to have asked for, which is
 * how `image_uris` went missing without anything noticing.
 */
/** The commander in the same shape as the other 99, so one renderer draws all 100. */
function commanderResponseCard(card: BuildCard, row: CatalogRow): ResponseCard {
  return toResponseCard(
    { card, quantity: 1, reason: 'Your commander.', score: 0, bucket: 'flex', preferred: false },
    new Map([[card.id, row]])
  );
}

function toResponseCard(
  entry: GeneratedDeck['entries'][number],
  byId: Map<string, CatalogRow>
): ResponseCard {
  const card = entry.card;
  const row = byId.get(card.id) ?? null;
  return {
    id: card.id,
    oracle_id: card.oracleId,
    name: card.name,
    type_line: card.typeLine,
    cmc: card.cmc,
    mana_cost: card.manaCost,
    color_identity: card.colorIdentity,
    oracle_text: card.oracleText ?? row?.oracle_text ?? null,
    keywords: (card.keywords as string[] | null) ?? row?.keywords ?? null,
    tags: card.tags,
    image_uris: row?.image_uris ?? null,
    prices: row?.prices ?? (card.usd === null ? null : { usd: String(card.usd) }),
    rarity: row?.rarity ?? null,
    set_code: row?.set_code ?? null,
    edhrec_rank: card.edhrecRank,
    quantity: entry.quantity,
    isBasicLand: entry.bucket === 'basic',
    reason: entry.reason,
    role: entry.bucket,
  };
}

/* ------------------------------------------------------------------ *
 * Basic lands
 * ------------------------------------------------------------------ */

function wantedBasics(identity: readonly string[]): string[] {
  const colours = identity.length ? identity : ['C'];
  return colours.map(c => COLOR_TO_BASIC[c]).filter(Boolean);
}

/**
 * One real, persistable row per basic land the deck may run.
 *
 * `cardsByName` returns every printing, so this keeps one per name and prefers
 * a row whose type line really says Basic Land. The old code fetched basics
 * with `.limit(5)` against a table holding dozens of printings of each, which
 * returned five Forests and left Plains, Swamp and Mountain permanently
 * unresolvable. Every short deck this builder ever produced started there.
 */
function resolveBasics(
  rows: CatalogRow[],
  identity: readonly string[],
  format: string
): Record<string, BuildCard> {
  const out: Record<string, BuildCard> = {};
  const colours = identity.length ? identity : ['C'];
  for (const colour of colours) {
    const name = COLOR_TO_BASIC[colour];
    if (!name) continue;
    const matches = rows.filter(r => r.name === name && hasPersistableId(r));
    if (!matches.length) continue;
    const chosen = matches.find(r => (r.type_line ?? '').startsWith('Basic Land')) ?? matches[0];
    out[colour] = toBuildCard(chosen, format);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Validation — the same rules, applied to the new output
 * ------------------------------------------------------------------ */

export interface BuildValidation {
  isValid: boolean;
  /** Problems that make the deck impossible to save. Non-empty means never a 200. */
  blocking: string[];
  issues: string[];
  totalCards: number;
  totalCost: number;
  landCount: number;
}

/**
 * Validates the way Commander actually works: by physical card count.
 *
 * Behaviour kept verbatim from the previous version, because these checks were
 * correct and they are the reason the client can trust the count it saves.
 */
function validateDeck(
  deck: ResponseCard[],
  commander: CatalogRow,
  targetBudget: number | null
): BuildValidation {
  const blocking: string[] = [];
  const advisory: string[] = [];
  const qty = (c: ResponseCard) => Number(c.quantity) || 1;

  const totalCards = countCopies(deck);
  if (totalCards !== DECK_SLOTS) {
    blocking.push(`${totalCards} cards in the 99 (needs exactly ${DECK_SLOTS})`);
  }

  const unsaveable = deck.filter(c => !hasPersistableId(c));
  if (unsaveable.length) {
    blocking.push(
      `${unsaveable.length} card(s) have no database id: ` +
        unsaveable.slice(0, 3).map(c => c.name).join(', ')
    );
  }

  const copiesByName = new Map<string, number>();
  for (const c of deck) {
    if ((BASIC_LANDS as readonly string[]).includes(c.name)) continue;
    copiesByName.set(c.name, (copiesByName.get(c.name) ?? 0) + qty(c));
  }
  const duplicates = [...copiesByName.entries()].filter(([, n]) => n > 1).map(([n]) => n);
  if (duplicates.length > 0) {
    blocking.push(`Singleton broken: ${duplicates.slice(0, 3).join(', ')}`);
  }

  if (deck.some(c => c.name === commander.name)) {
    blocking.push(`The commander (${commander.name}) also appears in the 99`);
  }

  const commanderColors = new Set(commander.color_identity ?? []);
  const violations = deck.filter(c => (c.color_identity ?? []).some(x => !commanderColors.has(x)));
  if (violations.length > 0) {
    blocking.push(
      `${violations.length} card(s) outside colour identity: ` +
        violations.slice(0, 3).map(c => c.name).join(', ')
    );
  }

  const landCount = deck
    .filter(c => (c.type_line ?? '').toLowerCase().includes('land'))
    .reduce((s, c) => s + qty(c), 0);
  if (landCount < 30) advisory.push(`Only ${landCount} lands`);

  const totalCost = deck.reduce((s, c) => s + (Number(c.prices?.usd) || 0) * qty(c), 0);
  if (targetBudget && totalCost > targetBudget * 1.3) {
    advisory.push(`$${totalCost.toFixed(0)} over the $${targetBudget} budget`);
  }

  return {
    isValid: blocking.length === 0 && advisory.length === 0,
    blocking,
    issues: [...blocking, ...advisory],
    totalCards,
    totalCost,
    landCount,
  };
}

/* ------------------------------------------------------------------ *
 * The planner — grounded, optional, and never load-bearing
 * ------------------------------------------------------------------ */

interface ShortlistEntry {
  oracleId: string;
  name: string;
  typeLine: string;
  cmc: number;
  manaCost: string | null;
  tags: string[];
  usd: number | null;
  reason: string;
}

interface DeckPlan {
  strategy: string | null;
  winConditions: string[];
  warnings: string[];
  preferOracleIds: string[];
  avoidOracleIds: string[];
  /** Ids the model returned that were not on the shortlist. Counted, not used. */
  rejected: string[];
}

/**
 * The ranked shortlist the planner is allowed to choose between.
 *
 * The baseline build's own picks first, then the pool behind them, so the model
 * sees both what the engine chose and the near misses it might legitimately
 * prefer for this archetype. Lands are excluded: the mana base is a maths
 * question, not a taste question, and it is already settled by the time this
 * runs.
 */
function shortlistFor(
  baseline: GeneratedDeck,
  pool: readonly BuildCard[],
  limit: number
): ShortlistEntry[] {
  const out: ShortlistEntry[] = [];
  const seen = new Set<string>();
  const push = (card: BuildCard, reason: string) => {
    if (out.length >= limit) return;
    if (seen.has(card.oracleId)) return;
    if (/\bland\b/i.test((card.typeLine ?? '').split('//')[0])) return;
    seen.add(card.oracleId);
    out.push({
      oracleId: card.oracleId,
      name: card.name,
      typeLine: card.typeLine,
      cmc: card.cmc,
      manaCost: card.manaCost,
      tags: card.tags.slice(0, 6),
      usd: card.usd,
      reason,
    });
  };
  for (const entry of baseline.entries) {
    if (entry.bucket === 'basic' || entry.bucket === 'land') continue;
    push(entry.card, entry.reason);
  }
  for (const card of pool) push(card, 'Not picked by the ranking; offered as an alternative.');
  return out;
}

interface PlanInput {
  apiKey: string;
  model: string;
  commander: CatalogRow;
  archetype: string;
  powerLevel: number;
  customPrompt: string;
  shortlist: ShortlistEntry[];
}

/**
 * Ask the model which of these cards belong in this deck.
 *
 * Note what it CANNOT do. It returns ids, and an id that is not on the
 * shortlist is dropped here and counted in `rejected`. It cannot name a card,
 * cannot award a score, and cannot reach a card the ranking excluded — so a
 * hallucination costs a slot in its own answer and nothing else. Its entire
 * influence is choosing between cards the engine already rates as eligible.
 *
 * The build never depends on it. A missing key, an unreachable gateway, a
 * refusal or unparseable output all leave the baseline deck standing, and the
 * change log says which of the two the player is looking at.
 */
async function planFromShortlist(input: PlanInput): Promise<DeckPlan | null> {
  const prompt = AI_PROMPTS.groundedPlan(
    input.commander,
    input.archetype,
    input.powerLevel,
    input.customPrompt,
    input.shortlist
  );

  let response: Response;
  try {
    response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.model,
        messages: [
          { role: 'system', content: AI_PROMPTS.plannerSystem },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
    });
  } catch (e) {
    console.warn('planner gateway unreachable, building without it:', String(e).slice(0, 200));
    return null;
  }

  if (!response.ok) {
    console.warn(`planner returned ${response.status}, building without it`);
    return null;
  }

  let parsed: Record<string, unknown>;
  try {
    const payload = await response.json();
    const text = String(payload.choices?.[0]?.message?.content ?? '');
    parsed = parseJson(text);
  } catch (e) {
    console.warn('planner output unparseable, building without it:', String(e).slice(0, 200));
    return null;
  }

  const allowed = new Set(input.shortlist.map(c => c.oracleId));
  const rejected: string[] = [];
  const take = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    const out: string[] = [];
    for (const raw of value) {
      const id = String(raw ?? '').trim();
      if (!id) continue;
      if (allowed.has(id)) out.push(id);
      else rejected.push(id);
    }
    return out;
  };

  return {
    strategy: typeof parsed.strategy === 'string' ? parsed.strategy : null,
    winConditions: Array.isArray(parsed.winConditions)
      ? parsed.winConditions.map(String).slice(0, 5)
      : [],
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String).slice(0, 5) : [],
    preferOracleIds: take(parsed.include),
    avoidOracleIds: take(parsed.exclude),
    rejected,
  };
}

function parseJson(text: string): Record<string, unknown> {
  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const start = clean.indexOf('{');
  if (start === -1) throw new Error('no JSON in planner output');
  let depth = 0;
  for (let i = start; i < clean.length; i++) {
    if (clean[i] === '{') depth++;
    else if (clean[i] === '}') {
      depth--;
      if (depth === 0) return JSON.parse(clean.slice(start, i + 1));
    }
  }
  throw new Error('unbalanced JSON in planner output');
}
