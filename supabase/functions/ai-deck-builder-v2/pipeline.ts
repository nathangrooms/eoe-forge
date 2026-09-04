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
import { loadAdminConfig, AI_PROMPTS } from './admin-config.ts';
import {
  buildCandidateQuery,
  deriveDeckProfile,
  normalizeRow,
  normalizeIdentity,
  type CandidateQuery,
} from './_engine/advise/index.ts';
import { generateDeck, type BuildCard, type GeneratedDeck } from './_engine/build/generate.ts';
import { popularityCoverage } from './_engine/advise/rank.ts';
import {
  planForArchetype,
  planForCommander,
  type ArchetypeExemplar,
  type ArchetypeInput,
  type ArchetypePlan,
} from './_engine/knowledge/behaviour.ts';
import { evaluateDeck } from './_engine/evaluate.ts';
import type { EngineCard } from './_engine/core/card.ts';
import { facetsForCard, type FacetCensus } from './_lib/deck/recommend/behaviour.ts';
import {
  DECK_ARCHETYPES,
  shellCardNames,
  shellForRequestedArchetype,
  type DeckArchetype,
} from './_lib/deck/archetypeShells.ts';

/** Bumped whenever the grounding or the assembly rules change. */
export const ENGINE_VERSION = 'ai-deck-builder-v2/7-behaviour';

/**
 * Every card named by every shell, deduped. About 200 names.
 *
 * Fetched in one round trip when the player named no archetype, so the
 * commander can be scored against all eighteen shells rather than none.
 */
const ALL_SHELL_CARD_NAMES: readonly string[] = [
  ...new Set(DECK_ARCHETYPES.flatMap(shellCardNames)),
];

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
  /**
   * The strategy the player picked, as a name: `aristocrats`, `tokens`, and so on.
   *
   * IT REACHES THE ENGINE NOW. Until this pass it went to the language model's
   * prompt and nowhere else, so the same commander produced the same
   * ninety-nine cards whichever archetype was chosen and the choice showed up
   * only as a different sentence in the planner's instructions. The name is
   * matched against `DECK_ARCHETYPES` by `shellForRequestedArchetype`, the
   * shell's own cards are read into behaviour facets, and the engine folds what
   * they have in common into the commander's plan as a modifier.
   *
   * A name that matches no shell still reaches the planner exactly as before,
   * and the log says which name did not match so the gap can be counted.
   */
  archetype?: string;
  /**
   * The deck style the player picked: `creatures`, `balanced` or `spells`.
   *
   * Separate from `archetype` on purpose, and the two are not the same
   * question. An archetype names a strategy, which is a claim about what the
   * deck is trying to do; a style says how much of the deck should have a body,
   * which is a claim about its composition. Both reach the engine now and they
   * reach it by different doors: an archetype adds WANTS to the commander's
   * plan, a style TILTS the creature share that plan produces.
   *
   * Optional, and absent means `balanced`. An unrecognised name also means
   * `balanced`, decided in `roles.ts` rather than here, and the response says
   * which was used.
   */
  style?: string;
  powerLevel?: number;
  budget?: number;
  customPrompt?: string;
  useAIPlanning?: boolean;
  /* The page has sent these two since the panel was written and this type did
     not declare them, so nothing could read them and nothing did. The toggles
     read "Prioritise synergy" and "Include manabase" and both were inert. */
  prioritizeSynergy?: boolean;
  includeLands?: boolean;
}

/* ------------------------------------------------------------------ *
 * Behaviour facets for the pool
 * ------------------------------------------------------------------ */

/**
 * Compiled facets, kept across invocations of a warm function instance.
 *
 * WHY THE FACETS ARE COMPUTED HERE AND NOT STORED ON THE ROW
 *
 * A `facets text[]` column on `cards` was the other candidate and it is the
 * cheaper one per request. It was not chosen, for three reasons and the first
 * is the one that decides it:
 *
 *   1. Facets are a pure function of `oracle_text` and of the compiler's
 *      current rules, and the compiler is under active development — 7,400 of
 *      31,833 commander-legal cards still produce no record at all. A stored
 *      column is a cache with no invalidation hook, so every improvement to
 *      the compiler would stop short of the generator until a human remembered
 *      to re-run a backfill. That is the same failure this pass is fixing:
 *      something correct, built, and not reaching anyone.
 *   2. `cards_unique` is a materialized view that freezes its column list, so
 *      adding a column to `cards` does not add it to the view, and the view
 *      cannot be refreshed from a PostgREST request at all.
 *   3. It would put the write in `scryfall-sync`, which is a different owner's
 *      file, to serve a reader in this one.
 *
 * WHAT IT COSTS, MEASURED on the 2026-08-19 catalogue snapshot, five colours,
 * all 31,833 commander-legal rows: 4.93 MB of `oracle_text` added to a pool
 * query that already ships those rows, and 3.34 s to compile them. Both are
 * worst-case: a mono-coloured commander's pool is a fraction of that, and this
 * map means a warm instance pays the compile once per card rather than once
 * per request.
 */
const FACET_MEMO = new Map<string, readonly string[]>();

/**
 * Facets for a pool, and an honest census of where they came from.
 *
 * The census is not decoration. A card with no record falls back to tags
 * invisibly, so a caller that does not know how often that happened cannot
 * tell a behaviour-driven deck from a word-matched one. It goes in the log and
 * in the response.
 */
function facetsForPoolRows(
  rows: readonly CatalogRow[],
  /**
   * Did these rows actually carry `oracle_text`?
   *
   * The memo is keyed on `oracle_id` alone, so a caller that read a pool
   * WITHOUT the text column would write "this card was read and does nothing"
   * against ids that were merely never read, and every later request on the
   * same warm instance would trust it. Worse than a slow cache: the compiler
   * reports `rec:full` for a card with no text, and `rec:full` is the facet
   * that turns an absence into a positive answer.
   *
   * Caught by `scratch/reach-measure.mjs`, which built one set of decks from a
   * text-less pool and a second from a full one and got byte-identical decks
   * out of both. The second run never compiled anything; it read the first
   * run's answers.
   *
   * `poolFor({ withOracleText: true })` is the only caller, so this is always
   * true today. It is a parameter rather than an assumption because the day it
   * stops being true the failure is silent and permanent.
   */
  rowsCarryOracleText: boolean
): {
  byOracleId: Map<string, readonly string[]>;
  census: FacetCensus;
  cached: number;
  ms: number;
} {
  const startedAt = Date.now();
  const byOracleId = new Map<string, readonly string[]>();
  const census: FacetCensus = { cards: 0, compiler: 0, xmage: 0, none: 0, facets: 0 };
  let cached = 0;

  for (const row of rows) {
    const id = row.oracle_id;
    if (!id || byOracleId.has(id)) continue;

    /* THE ROW ALREADY CARRIES ITS FACETS, computed once and stored.
       ------------------------------------------------------------
       `poolFor` now selects the `facets` computed column, which reads
       `card_facet_memo` in Postgres. That table held ZERO ROWS until
       2026-08-30 and nothing read it: the memo below was the only cache, it
       is a Map on this module, and it dies with the instance. Every measured
       run reported `cached: 0`.

       Compiling roughly 100,000 facets from oracle text is what put a
       five-colour build over the CPU limit and a four-colour build at sixty
       seconds. Reading them is free, and it lets the pool query drop
       `oracle_text`, which is 4.93 MB on that pool.

       An EMPTY array is a real answer and must not be treated as a miss:
       7,058 of 33,032 cards genuinely compile to no facets, and recompiling
       those every request would put back the cost this removes for exactly
       the cards the compiler cannot read anyway. `null` and `undefined` are
       the miss, which is a card the filler has not reached yet. */
    const stored = (row as { facets?: unknown }).facets;
    if (Array.isArray(stored)) {
      const facets = stored as readonly string[];
      byOracleId.set(id, facets);
      census.cards += 1;
      census.facets += facets.length;
      cached += 1;
      continue;
    }

    const memo = rowsCarryOracleText ? FACET_MEMO.get(id) : undefined;
    if (memo) {
      byOracleId.set(id, memo);
      census.cards += 1;
      census.facets += memo.length;
      // A memo hit cannot say which source spoke, because only the facets were
      // kept. Counted separately rather than guessed at, so the census stays
      // true: `compiler + xmage + none` is the number of cards compiled now.
      cached += 1;
      continue;
    }

    const result = facetsForCard(row);
    if (rowsCarryOracleText) FACET_MEMO.set(id, result.facets);
    byOracleId.set(id, result.facets);
    census.cards += 1;
    census[result.source] += 1;
    census.facets += result.facets.length;
  }

  return { byOracleId, census, cached, ms: Date.now() - startedAt };
}

/* ------------------------------------------------------------------ *
 * The archetype the player asked for, as cards
 * ------------------------------------------------------------------ */

/**
 * Read an archetype shell into the shape the engine takes.
 *
 * The engine is handed FACETS, never an archetype id, and the reason is the
 * same one that keeps the facet producer out of `src/engine/`: a table mapping
 * `aristocrats` to a list of effects would be one person's opinion about what
 * Aristocrats is, frozen where nothing can check it. `DECK_ARCHETYPES` already
 * says what the shell is made of, as real cards, and a real card can be read.
 *
 * Cards the catalogue does not hold are dropped and COUNTED rather than
 * ignored: `named` is what the shell claims and `exemplars.length` is what was
 * found, so `planForArchetype` can report both and a shell that has quietly
 * stopped resolving is visible instead of merely quiet.
 *
 * One row per name. `cardsByName` returns every printing, and twelve names can
 * come back as forty rows; counting a card once per printing would weight the
 * shell by how many times a card has been reprinted.
 */
/**
 * WHICH SHELLS THIS COMMANDER IS, when the player did not say.
 *
 * A player who picks "Blink" gets the Blink shell and its packages. A player
 * who picks nothing used to get no shell at all, so the package machinery — the
 * only thing in the engine that can express "this card does BOTH of these
 * things" — was reachable only by asking for it. That is backwards: the
 * commander already says what it wants, and 3,542 of them cannot each be asked
 * about by hand.
 *
 * So every shell is read, scored against the commander's own plan, and the best
 * TWO are taken. Two rather than one because a commander is often two things at
 * once and the owner said so about the case that drove this: *"syr vondom
 * sunstar ... this commander benefits from 2 strategies together"*. He is paid
 * when your creatures die OR are exiled, which is Aristocrats AND Blink, and a
 * single-shell answer has to throw one of them away.
 *
 * THE SCORE IS AN OVERLAP, deliberately crude: sum over facets the shell and
 * the commander both want, of the two weights multiplied. A shell that wants
 * what the commander wants scores; one that does not scores zero and is not
 * taken. Nothing here invents an affinity that the two plans do not already
 * share, which is the property that keeps it honest for a commander nobody has
 * thought about.
 *
 * A shell scoring nothing is DROPPED rather than ranked last. A commander with
 * no shell above zero gets no packages, which is the old behaviour and the
 * right one: an arbitrary shell would shape the deck toward something the
 * commander never asked for.
 */
function shellsForCommander(
  commanderWants: ReadonlyMap<string, number>,
  candidates: readonly { shell: DeckArchetype; input: ArchetypeInput }[],
  take: number
): { shell: DeckArchetype; input: ArchetypeInput; score: number }[] {
  /*
   * A SHELL MUST SERVE WHAT THE COMMANDER SHOUTS FOR.
   *
   * The cosine ranks shells, and it was being used as if it also admitted
   * them. It cannot: it is a share of the SHELL, so a commander with three
   * faint counters wants at 0.5 scores the Counters shell at 0.68 and Giada,
   * Font of Hope - an Angel whose three loudest wants are all about Angels -
   * was built around Hangarback Walker, Stonecoil Serpent and Endless One.
   * Chulane read as Control + Voltron on 0.49 and 0.36 and got Lightning
   * Greaves and All That Glitters. Measured across the twenty benchmark
   * commanders on 3 Sep 2026: every second shell under 0.5 was wrong, and
   * two above it (Giada's Counters at 0.68, Animar's Lifegain at 0.58) were
   * wrong too, so no floor on the score separates the cases.
   *
   * What does: a shell is admissible only when one of the commander's LOUD
   * wants - weight 0.8 or more, or the three loudest when nothing reaches
   * that - is a facet the shell itself wants. Korvold's `cost:sacrifice` at
   * 0.9 is in Aristocrats; Giada's `sub:angel` is in no shell but the tribe,
   * which is stated as a package separately. A commander whose loud wants no
   * shell serves is built from its own plan, which is honest.
   */
  const loudWants = [...commanderWants].filter(([, w]) => w >= 0.8).map(([f]) => f);
  const loud = new Set(
    loudWants.length > 0
      ? loudWants
      : [...commanderWants].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f]) => f)
  );
  const scored = candidates.map(({ shell, input }) => {
    /* Scored WITHOUT a pool background, deliberately. The background turns a
       share into a lift against this deck's colours, which is right for
       building and wrong for choosing: a shell should be picked for what it
       is, not for how unusual its cards are in one commander's colours. */
    const plan = planForArchetype(input);
    /*
     * A SHARE OF THE SHELL, not a sum of the overlap.
     *
     * Summing `commanderWeight * shellWeight` over shared facets is pure recall:
     * a shell is rewarded for what the commander also wants and pays nothing for
     * what it wants that the commander does not. So the biggest, broadest shell
     * wins, and Brago, King Eternal — whose entire card is "exile any number of
     * target nonland permanents you control, then return those cards" — read as
     * REANIMATOR (1.23) ahead of Blink, because Reanimator also wants
     * `eff:return-from` and its `cares:zone:graveyard` was free. Brago never
     * touches a graveyard.
     *
     * Dividing by the shell's own total weight asks the right question instead:
     * how much of THIS SHELL does the commander actually want. Reanimator is
     * mostly graveyard and Brago wants none of it, so it falls behind a shell he
     * matches nearly all of.
     */
    let overlap = 0;
    let shellMagnitude = 0;
    for (const want of plan.wants) {
      shellMagnitude += want.weight * want.weight;
      const mine = commanderWants.get(want.facet);
      if (mine) overlap += mine * want.weight;
    }
    /* COSINE, not a plain share. Dividing by the shell total was tried and
       over-corrects: it favours whichever shell is narrowest, and Syr Vondam
       went from Aristocrats + Blink, which is what he is, to counters + Tokens.
       The square root is the milder penalty and keeps a broad shell competitive
       when the commander genuinely wants most of it. The commander magnitude is
       the same for every shell, so it is left out. */
    /*
     * MULTIPLYING BY THE COMMANDER'S WEIGHT FOR THE SHELL'S STRONGEST WANT WAS
     * TRIED AND IS TOO HARSH, measured: Talrand flipped from Spellslinger to
     * Tokens and three commanders came out with no shell at all. A shell's
     * top want is often a broad facet the commander expresses differently.
     */
    const score = shellMagnitude > 0 ? overlap / Math.sqrt(shellMagnitude) : 0;
    const serves = plan.wants.some(w => loud.has(w.facet));
    return { shell, input, score, packages: plan.packages.length, serves };
  });
  return scored
    .filter(x => x.serves && x.score > 0 && x.packages > 0)
    .sort((a, b) => b.score - a.score || a.shell.id.localeCompare(b.shell.id))
    .slice(0, take)
    .map(({ shell, input, score }) => ({ shell, input, score }));
}

/**
 * Two shells as ONE archetype input, so the generator reads both.
 *
 * An `ArchetypeInput`, not a plan, because `generateDeck` calls
 * `planForArchetype` itself with the pool as background — that is what turns a
 * raw share into a LIFT, and a merged plan would arrive with the background
 * already skipped.
 *
 * Package names are prefixed with the shell they came from, so "The blinks" and
 * Aristocrats' "Sacrifice outlets" stay distinct jobs with distinct slots
 * rather than colliding on a shared name.
 */
function mergeShellInputs(
  picked: readonly { shell: DeckArchetype; input: ArchetypeInput }[]
): ArchetypeInput | null {
  if (picked.length === 0) return null;
  if (picked.length === 1) return picked[0].input;
  const exemplars: ArchetypeExemplar[] = [];
  const seen = new Set<string>();
  for (const { shell, input } of picked) {
    for (const card of input.exemplars) {
      /* A card in both shells counts once, for the shell that scored higher.
         Counting it twice would weight the overlap rather than the strategies. */
      if (seen.has(card.name)) continue;
      seen.add(card.name);
      exemplars.push({
        ...card,
        pkg: card.pkg ? `${shell.name}: ${card.pkg}` : undefined,
      });
    }
  }
  return {
    id: picked.map(p => p.shell.id).join('+'),
    name: picked.map(p => p.shell.name).join(' + '),
    named: picked.reduce((n, p) => n + p.input.named, 0),
    exemplars,
  };
}

function archetypeFor(
  shell: DeckArchetype,
  rows: readonly CatalogRow[],
  poolFacets: ReadonlyMap<string, string[]>
): ArchetypeInput {
  const names = shellCardNames(shell);
  const wanted = new Map(names.map(name => [normalizeName(name), name]));
  const seen = new Set<string>();
  const exemplars: ArchetypeExemplar[] = [];

  /* Which package each name belongs to, so `planForArchetype` can read the
     shell's packages apart instead of flattening them into one want list.
     First package wins for a name that appears in two, which is rare and does
     not matter: the card is an example of both jobs. */
  const pkgOf = new Map<string, string>();
  for (const pkg of shell.packages) {
    for (const card of pkg.cards) {
      const key = normalizeName(card);
      if (!pkgOf.has(key)) pkgOf.set(key, pkg.name);
    }
  }

  for (const row of rows) {
    const key = normalizeName(row.name ?? '');
    const name = wanted.get(key);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    /*
     * THE POOL'S FACETS, not a fresh local compile.
     *
     * A shell's wants are matched against POOL cards, so they have to be said
     * in the pool's vocabulary. Since the Tagger merge those differ: Animate
     * Dead carries `eff:return-from` in the pool and not from the compiler
     * alone, so Reanimator's reanimation package agreed on nothing and a Meren
     * deck came back with no recursion. `facetsForCard` remains the fallback
     * for a name the pool does not hold.
     */
    exemplars.push({
      name,
      facets: poolFacets.get(row.name ?? '') ?? facetsForCard(row).facets,
      pkg: pkgOf.get(key),
    });
  }

  return { id: shell.id, name: shell.name, named: names.length, exemplars };
}

/*
 * There is deliberately NO `resolveStyle` helper here.
 *
 * `styleFor` in `roles.ts` already decides what an unrecognised style
 * name means, and `generateDeck` already reports the answer on
 * `evidence.styleAsked` / `evidence.styleUsed`. A second copy of that rule in
 * this file would be a second opinion about the same question, free to drift,
 * which is the exact failure `vendor-engine.mjs` exists to prevent. So the raw
 * request value goes straight to the engine and the resolved value is read back
 * off the build.
 */

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
  /**
   * Kept on the input and read by nothing, so a caller that still passes one
   * is not an error. There is no model in this function: see step 4.
   */
  apiKey?: string | null;
  startedAt: number;
}

export type BuildOutcome =
  | { kind: 'ok'; body: Record<string, unknown> }
  | { kind: 'refused'; error: string; validation: BuildValidation };

/**
 * How much of the catalogue a build may look at, by how many colours it can play.
 *
 * MEASURED, on the deployed function, not chosen:
 *
 *   R      Krenko    7,495 pool rows   built
 *   U      Talrand   7,399             built
 *   WUBG   Atraxa   11,620             built
 *   WUBRG  Golos    14,984             Memory limit exceeded
 *                   12,000 after the in-process slice, still exceeded
 *
 * So the wall sits just above where a four colour deck lands, and one flat
 * number cannot be both under it for five colours and generous for one. A mono
 * coloured deck should not have its choices narrowed to pay for a problem only
 * a five colour deck has.
 *
 * `edhrec_rank` is the only evidence we hold about what people actually play,
 * and the ceilings are set so the cards excluded are ones nobody plays: at five
 * colours a deck still chooses from the eight thousand most played cards in
 * Commander, which is more than any deck list has ever needed.
 *
 * These are limits of the runtime rather than of the idea. If the function gets
 * more memory, raise them; nothing else has to change.
 */
/* RAISING THESE WAS TRIED ON 2026-08-30 AND FAILED. Do not try it again
   without reading this.
   ---------------------------------------------------------------------
   They exist for MEMORY: the function ran out of it holding the pool, and a
   five-colour commander's pool is the whole commander-legal catalogue.

   The reasoning for raising them was good and the conclusion was wrong. The
   pool now comes from `cards_pool`, whose rows carry no `oracle_text`,
   `faces`, `image_uris`, `legalities` or `prices`: 13 MB against 105 MB for
   the same 33,032 rows. The facets are read rather than compiled, so the CPU
   cost that shared this budget is gone as well. Eight times less data per row
   ought to mean room for more rows.

   It does not. Measured on the deployed function, five-colour commanders:

     ceiling 12000   Najeela, Golos and Kenrith all 546
     ceiling  8000   Najeela, Golos and Kenrith all 546
     ceiling  5000   all three build, 98 cards, about 4.4 s

   THE ROW WIDTH WAS NEVER THE MEMORY COST. What the function holds is not the
   JSON it received, it is the objects the engine builds from it: a
   `BuildCard` per row, a facet array per row, and the ranker's own working
   set. Those are the same size whether the row arrived with oracle text or
   without it. Narrowing the view made the pool query eighteen times faster
   and moved this limit not at all, and the two are simply different
   resources.

   So a five-colour deck chooses from the five thousand most played cards in
   Commander. Raising that needs a smaller per-card footprint in the engine or
   a function with more memory, not a smaller row. */
function rankCeilingFor(colours: number): number | undefined {
  /* FIVE COLOURS STILL FAILS ON THE EDGE WORKER, and 4,000 was tried and
     measured on 3 Sep 2026: Najeela, the Blade-Blossom returned
     WORKER_RESOURCE_LIMIT at 8.0 s with a 4,000-card pool exactly as she did
     with 5,000, so the pool SIZE is not the binding cost and lowering it only
     narrows the deck. She passed at 5.2 s earlier the same day and stopped
     when compiler 15 and 16 put facets on 1,016 more cards; what got more
     expensive is per-card facet work, not the fetch. Left at 5,000 until
     somebody profiles the worker rather than guessing. The debt below is
     still the real answer: Postgres should be choosing these rows. */
  if (colours >= 5) return 5000;
  if (colours === 4) return 9000;
  if (colours === 3) return 12000;
  /* One and two colour pools are seven thousand rows and fit comfortably, so
     they are not narrowed at all. */
  return undefined;
}

/** How many of those rows are dressed and ranked in memory. */
function poolBudgetFor(colours: number): number {
  if (colours >= 5) return 5000;
  if (colours === 4) return 8000;
  return 12000;
}

/* THE DEBT THIS LEAVES, written down rather than left to be rediscovered.
   ----------------------------------------------------------------------
   These numbers are a runtime limit wearing the clothes of a design decision.
   The right shape is for POSTGRES to choose the candidates: it is the thing
   that is good at filtering and ranking thirty thousand rows, and it has the
   indexes. The edge function currently fetches the pool and ranks it in
   JavaScript, which is why every fix here moves the bottleneck rather than
   removing it: bounding the facet compile uncovered a memory wall, bounding
   memory uncovered a fetch that took 19 seconds.

   Measured on the deployed function while tuning these, so the shape of the
   problem is on record:

     R      Krenko    7,495 rows   built
     WUBG   Atraxa    9,365 rows   built, pool fetch 19,247 ms
     WUBRG  Golos    14,984 rows   Memory limit exceeded
            same,    12,000 sliced  Memory limit exceeded

   Moving selection into a database function would make all of this go away and
   is a day of work, not an afternoon. Until then a five colour deck chooses
   from the five thousand cards Commander plays most, which is more than any
   real decklist draws on, and every colour count builds. */

export async function build(input: BuildInput): Promise<BuildOutcome> {
  const { catalog, request, startedAt } = input;
  const { config, explicit } = loadAdminConfig();

  const format = 'commander';
  const commanderName = request.commander.name;
  const targetBudget = request.budget && request.budget > 0 ? request.budget : null;
  /** Passed to the engine as it arrived. `roles.ts` decides what it means. */
  const style = request.style ?? null;

  /*
   * THE ARCHETYPE IS RESOLVED HERE, BEFORE ANYTHING IS FETCHED.
   *
   * `shellForRequestedArchetype` is deliberately exact rather than fuzzy: a
   * shell decides what the deck is built out of, so guessing at a name would
   * build a strategy the player did not ask for. An unmatched name is logged
   * with the list of shells that do exist, because the gap between what
   * `AIBuilder.tsx` offers and what this catalogue holds is a real one and
   * counting it is how it gets closed.
   */
  const shell = shellForRequestedArchetype(request.archetype ?? '');

  console.log('='.repeat(60));
  console.log(`${ENGINE_VERSION} — ${commanderName}`);
  console.log(
    `archetype=${request.archetype ?? 'none'} budget=${targetBudget ?? 'none'} ` +
      `style=${style ?? 'none'}`
  );
  if (request.archetype && !shell) {
    console.log(
      `  archetype "${request.archetype}" matches no shell in DECK_ARCHETYPES, so it reaches ` +
        `the planner as prompt text and shapes nothing`
    );
  }

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
  /*
   * The commander is read FIRST and read the same way every other card is.
   *
   * `planForCommander` derives the whole build's wants from these facets, so a
   * commander handed in with `facets: null` produces an empty plan no matter
   * how good the rest of the wiring is. `cardsByName` already selects
   * `oracle_text`, so this costs one card's compile.
   */
  const commanderFacets = facetsForCard(commanderRow);
  const commander = toBuildCard(commanderRow, format, commanderFacets.facets);
  // The commander's own row is the authority on colour identity.
  const commanderIdentity = commander.colorIdentity;
  console.log(`  identity: ${commanderIdentity.join('') || 'colourless'}`);
  console.log(
    `  commander read by: ${commanderFacets.source} ` +
      `(${commanderFacets.facets.length} facets, coverage ${commanderFacets.coverage})`
  );

  /* --- 2. Retrieve. The whole pool, never a slice. ------------------ */
  const profileForQuery = deriveDeckProfile({
    format,
    colorIdentity: commanderIdentity,
    cards: [],
  });
  const query: CandidateQuery = buildCandidateQuery(profileForQuery);

  const poolStarted = Date.now();
  const [spellRows, landRows, comboRows, basicRows, shellRows, shellFacets] = await Promise.all([
    // WITH oracle text. The generator compiles it into behaviour facets, and
    // without them every card in the pool reaches the ranker claiming to do
    // nothing. The optimiser's own call is unchanged and still pays nothing.
    /* The ceiling is only applied where it is needed. A mono-coloured pool is
       seven thousand rows and fits comfortably; a five colour pool is the whole
       catalogue and does not. Passing it always would quietly narrow a narrow
       deck's choices for no benefit. */
    /* THE RANK CEILING IS NOT USED, and this is the measurement that decided it.
       `poolFor` accepts `maxRank` and it works as a database query: filtering
       on `edhrec_rank` uses `cards_unique_commander_rank_idx` and returns 4,988
       rows in 3.6 s with no sort. But the pool is read by a KEYSET WALK ordered
       by `id`, so adding a rank filter to each page makes the planner scan the
       id index and discard most of what it reads. Measured on the deployed
       function: Atraxa built in about 4 s without the ceiling and took 11 to 22
       seconds with it, and the five colour commanders it was added for still
       failed. A filter that makes the fast cases slow and does not fix the slow
       ones is not worth carrying.

       The parameter stays because it is correct and the index is built; what is
       missing is a fetch that orders by rank instead of by id, and that belongs
       with moving selection into Postgres rather than bolted onto the walk. */
    /* The pool budget is pushed DOWN into the fetch rather than applied after
       it. The walk is rank-ordered, so its first N rows are the top N by rank -
       exactly what the slice below produces - and a five-colour build stops
       fetching at 5,000 instead of parsing 31,829 and keeping 5,000. */
    catalog.poolFor(query, {
      withOracleText: true,
      limit: poolBudgetFor(commanderIdentity.length),
    }),
    catalog.landPoolFor(query),
    /*
     * The combos these colours could build, most played first.
     *
     * One indexed containment test against `combo_pool`, in the same
     * `Promise.all` as the pool so it costs no extra wall clock. The engine is
     * pure and cannot read a database, which is why this is fetched here and
     * handed over rather than looked up where it is used.
     */
    catalog.combosFor(commanderIdentity),
    catalog.cardsByName([...BASIC_LANDS], format),
    /*
     * The archetype shell's own cards, by name.
     *
     * A separate lookup rather than a filter over the pool, and the reason is
     * that the shell must not be read through the commander's colours. Blood
     * Artist is what Aristocrats means whether or not the deck can play it, so
     * a mono-red Krenko asking for Aristocrats reads the same shell a Golgari
     * commander does and then gets the red half of it, because the POOL is
     * still filtered by identity and the shell only supplies wants.
     *
     * Eleven or twelve names, one round trip, run beside the pool query rather
     * than after it. Nothing when no shell matched.
     */
    /* When the player named a shell, its cards. When they did not, EVERY
       shell's cards, so the commander can be matched against all of them. That
       is roughly 200 names in one round trip beside the pool query, against 12
       for a single shell, and it is what makes package-based building reach a
       commander nobody asked a question about. */
    catalog.cardsByName(
      shell ? shellCardNames(shell) : ALL_SHELL_CARD_NAMES,
      format
    ),
    /* And the facets the POOL holds for those same names, because that is the
       vocabulary the shell's wants are matched in. See `poolFacetsByName`. */
    catalog.poolFacetsByName(shell ? shellCardNames(shell) : ALL_SHELL_CARD_NAMES),
  ]);
  const poolMs = Date.now() - poolStarted;

  const archetype = shell ? archetypeFor(shell, shellRows, shellFacets) : null;
  if (shell && archetype) {
    console.log(
      `  archetype: ${shell.name}, ${archetype.exemplars.length} of ${archetype.named} of its ` +
        `cards found in the card database`
    );
  }

  /*
   * NO SHELL WAS ASKED FOR, so work out which ones this commander IS.
   *
   * `generateDeck` derives the commander's plan itself and this repeats that
   * call, which is cheap and pure — it reads facets already on the row and
   * touches nothing. The alternative is moving shell selection inside the
   * generator, which cannot be done: choosing a shell needs the shells' cards,
   * and fetching them is a database round trip the engine must not make.
   */
  /*
   * NO SHELL WAS ASKED FOR, so work out which ones this commander IS.
   *
   * `generateDeck` derives the commander's plan itself and this repeats that
   * call, which is cheap and pure — it reads facets already on the row and
   * touches nothing. The alternative is choosing the shell inside the
   * generator, which cannot be done: it needs the shells' cards, and fetching
   * them is a database round trip the engine must not make.
   */
  let derived: ArchetypeInput | null = null;
  if (!shell) {
    const commanderPlan = planForCommander(commander);
    const commanderWants = new Map(commanderPlan.wants.map(w => [w.facet as string, w.weight]));
    /* A -1/-1 COMMANDER IS NOT A +1/+1 COMMANDER, and the Counters shell is
       +1/+1 through and through. Yawgmoth's proliferate is loud, so the shell
       was admissible, and its packages handed him Walking Ballista and two
       Rings. No shell holds the -1/-1 packages; his own plan does. */
    const minusOnly =
      commanderFacets.facets.includes('ctr:-1/-1') && !commanderFacets.facets.includes('ctr:+1/+1');
    const candidates = DECK_ARCHETYPES.filter(one => !(minusOnly && one.id === 'counters')).map(one => ({
      shell: one,
      input: archetypeFor(one, shellRows, shellFacets),
    }));
    const scored = shellsForCommander(commanderWants, candidates, 2);
    /*
     * A TRIBE IS A SHELL BEFORE IT IS A SCORE.
     *
     * Giada, Font of Hope is an Angel that makes Angels bigger and cheaper.
     * She read as +1/+1 counters (1.26) and Lifegain (0.95), because the
     * counter she puts on each other Angel is a facet the Counters shell
     * scores and "is an Angel" is not a facet any shell can carry - the tribe
     * is different for every commander, so no shell's cards can name it. The
     * refinement rounds then filled an Angel deck with Hangarback Walker,
     * Stonecoil Serpent and Endless One on the shell's say-so: 4 Angels of 20.
     *
     * So when the plan has a tribe, the Tribal shell is taken first - its
     * packages are the lords, banners and Coat of Arms that work for ANY
     * tribe - and the tribe itself is stated as a package outright, with the
     * wants no exemplar could supply. The cosine still picks the second shell.
     */
    const tribe = commanderPlan.tribe;
    const tribal = tribe ? candidates.find(c => c.shell.id === 'tribal') : undefined;
    const picked = tribal
      ? [{ ...tribal, score: 1 }, ...scored.filter(x => x.shell.id !== 'tribal')].slice(0, 2)
      : scored;
    derived = mergeShellInputs(picked);
    if (derived && tribe) {
      const because = `${commanderName} is a ${tribe} that counts ${tribe}s`;
      derived = {
        ...derived,
        extraPackages: [
          ...(derived.extraPackages ?? []),
          {
            name: `The ${tribe}s`,
            wants: [
              { facet: `sub:${tribe}`, weight: 1, because },
              { facet: 'type:creature', weight: 1, because },
            ],
            read: 0,
            share: 0.34,
          },
        ],
      };
    }
    if (picked.length) {
      console.log(
        `  no archetype asked for; ${commanderName} reads as ` +
          picked.map(x => `${x.shell.name} (${x.score.toFixed(2)})`).join(' and ') +
          (tribe ? `, tribe ${tribe}` : '')
      );
    } else {
      console.log(`  no archetype asked for, and no shell overlaps ${commanderName}'s plan`);
    }
  }
  const archetypeInput = archetype ?? derived;

  // Both halves now carry oracle text, so where a card appears in both either
  // row would do. The land row still wins, because it is the one whose text was
  // fetched for the mana base and keeping that precedence costs nothing.
  const byId = new Map<string, CatalogRow>();
  for (const row of spellRows) byId.set(row.id, row);
  for (const row of landRows) byId.set(row.id, row);

  /* --- 2a. Read what every card in the pool DOES -------------------- */
  /*
   * The step that was missing. Everything downstream — `planFit`, `cardRole`,
   * the creature floor, the commander-fit signal — reads facets, and until now
   * nothing put any on a pool row.
   */
  const poolRows = [...byId.values()].filter(hasPersistableId);

  /* COMPILE WHAT COULD BE CHOSEN, NOT EVERYTHING.
     ---------------------------------------------
     No commander with three or more colours could be built. Measured on the
     live function: Atraxa 546 after 37 s, Kaalia 546 after 17 s, Talrand 200
     in 4 s. 546 is WORKER_RESOURCE_LIMIT and the deployed log ends "CPU Time
     exceeded" on the line after this compile, every time.

       Kozilek   colourless   2,733 pool cards    15,300 facets   built
       Ghalta    G            7,366              40,020 facets   built
       Yuriko    UB          12,606              66,457 facets   CPU exceeded
       Edgar     WBR         18,467             100,737 facets   CPU exceeded

     with `cached: 0` on every one, because FACET_MEMO is a Map on the module
     and instances do not stay warm between one player's requests.

     The compile was never the point though. Facets exist so the ranker can
     tell what a card DOES, and the ranker is going to choose about sixty cards.
     A card sitting sixteen thousandth on EDHREC is not going into a generated
     deck, and compiling its oracle text to discover that is work whose answer
     is never read.

     So the pool is ordered by how much Commander actually plays a card and the
     compile takes the front of that list. Cards past the cap arrive with null
     facets, which is a case every reader already handles: `planFit` is
     deliberately silent for a card with no record, and roughly a quarter of the
     catalogue has no record at all, so this is the existing path rather than a
     new one.

     WHY A COUNT AND NOT A TIME BUDGET. A wall-clock budget would make the same
     request return different decks depending on how busy the machine was, and
     an unreproducible generator cannot be debugged. A count is the same
     everywhere.

     COST. This is the cheapest shape available: it removes work rather than
     moving it. No cache to keep warm, no table to fill, no second service to
     pay for, and the ceiling stops rising as the catalogue grows. A five colour
     pool now compiles the same amount as a mono-coloured one. */
  const FACET_BUDGET = 6000;

  /* AND THE POOL ITSELF, for the same reason one level up.
     Bounding the compile fixed the CPU wall and uncovered a memory one. From
     the deployed log for Golos, five colours:

       pool:   31,829 rows + 1,194 land rows in 2,289 ms
       facets: 35,340 on 6,000 cards in 824 ms      <- the cap working
       Memory limit exceeded

     So the compile is no longer the cost; holding thirty-two thousand dressed
     card rows is. Every one carries oracle text, legalities and image URIs, and
     the five colour pool is the whole commander-legal catalogue.

     A generated deck is about sixty spells. Ranking the twelve thousand cards
     Commander plays most and ignoring the twenty thousand below them changes
     no deck anybody would notice, and it is the difference between a five
     colour commander building and not building at all. Golos and Najeela are
     the two that could not. */
  const POOL_BUDGET = poolBudgetFor(commanderIdentity.length);
  /* Coerced rather than cast. `edhrec_rank` arrives from PostgREST as a JSON
     number or as null, and the row type does not promise which, so reading it
     as a number is a claim worth making explicitly. A card with no rank sorts
     last, which is right: an unranked card is one Commander does not play. */
  const rankOf = (row: { edhrec_rank?: unknown }): number => {
    const n = Number(row.edhrec_rank);
    return Number.isFinite(n) && n > 0 ? n : Number.MAX_SAFE_INTEGER;
  };
  const rankedAll = [...poolRows].sort((a, b) => rankOf(a) - rankOf(b));
  const ranked = rankedAll.slice(0, POOL_BUDGET);
  if (rankedAll.length > POOL_BUDGET) {
    console.log(
      `pool: ranking the top ${POOL_BUDGET} of ${rankedAll.length} by edhrec_rank; ` +
      `${rankedAll.length - POOL_BUDGET} not considered`
    );
  }
  const toCompile = ranked.slice(0, FACET_BUDGET);
  const facets = facetsForPoolRows(toCompile, true);
  if (ranked.length > FACET_BUDGET) {
    console.log(
      `facets: compiled the top ${FACET_BUDGET} of ${ranked.length} by edhrec_rank; ` +
      `${ranked.length - FACET_BUDGET} carry tags only`
    );
  }
  const pool: BuildCard[] = ranked.map(row =>
    toBuildCard(row, format, facets.byOracleId.get(row.oracle_id ?? '') ?? null)
  );

  /*
   * HOW MUCH OF THIS POOL THE POPULARITY PRIOR CAN ACTUALLY SEE.
   *
   * `edhrec_rank` is the only evidence in this schema about which cards people
   * really play, and `rank.ts` leans on it hardest for exactly this caller,
   * because a build that starts from a commander and nothing else has no deck
   * to measure role gaps against. So a pool where the column is largely absent
   * produces a ranking that separates cards on the signals that remain, and
   * nobody finds out.
   *
   * On 2026-08-25 that is not hypothetical. `cards_unique` is a materialized
   * view over `cards`, its `refreshed_at` reads 2026-08-20, and its scheduled
   * rebuild has been skipping every night since: `cards-unique-refresh` fires
   * at 04:40 UTC, the catalogue sync starts at 04:15, and
   * `refresh_cards_unique()` returns 'skipped: catalogue sync in progress'
   * every time. The sync then requests a refresh through PostgREST, gets
   * `authenticator`'s 8 s timeout, and defers to a cron tick that will not come
   * for another 24 hours, by which time the sync is running again. The view is
   * therefore frozen mid-alphabet: `edhrec_rank` is present on 13,183 of 13,758
   * rows whose name begins A-H, on 245 of 868 beginning I, and on 0 of the
   * 19,254 rows beginning J-Z. Sol Ring reads rank 1 in `cards` and NULL here.
   *
   * Measured effect, eight commanders built through this function that day:
   * every nonbasic land in every deck had a name beginning A-I, against pools
   * that are 42-46% A-I, and the decks held a mean 3.3 of the 60 most-played
   * cards in their own colours. The same eight builds with this one column
   * repaired from `cards` came back at 35-49% A-I, matching their pools, and
   * 6.0 of 60.
   *
   * This counts it and says so, in the log and in the player's own change log.
   * It does not refuse the build: a deck ranked on a partial prior is worse
   * than one ranked on a whole prior and far better than none, and the repair
   * is a database operation this function cannot perform. What it must not do
   * is stay silent, which is what let a ranking on the first letter of a card's
   * name ship, and survive three passes of engine work aimed at the symptom.
   */
  const popularity = popularityCoverage(pool);
  console.log(
    `  popularity prior: ${popularity.ranked} of ${pool.length} cards carry edhrec_rank ` +
      `(A-I ${Math.round(popularity.earlyShare * 100)}%, ` +
      `J-Z ${Math.round(popularity.lateShare * 100)}%)` +
      (popularity.skewedByName
        ? '. SKEWED BY NAME: cards_unique is stale, so this build is partly ranked on the ' +
          'first letter of a card name. Run: select public.refresh_cards_unique(true);'
        : '')
  );

  console.log(
    `  pool: ${spellRows.length} rows + ${landRows.length} land rows -> ` +
      `${pool.length} printings in ${poolMs} ms`
  );
  console.log(
    `  facets: ${facets.census.facets} on ${facets.census.cards} cards in ${facets.ms} ms ` +
      `(compiler ${facets.census.compiler}, xmage ${facets.census.xmage}, ` +
      `no record ${facets.census.none}, cached ${facets.cached})`
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

  /*
   * THE LAND COUNT IS NOT SET HERE ANY MORE, and that is the connection.
   *
   * This line used to read `clamp(config.minLandCount ?? 36, 30, 42)`.
   * `minLandCount` has a default of 35 and nothing ever changed it, so every
   * deck this function has ever built ran 35 lands: Krenko's two-drops and a
   * seven-mana reanimator deck, the same number, because the number came from a
   * config file rather than from either deck. `generateDeck` now solves it per
   * commander against the curve that commander's own plan implies, and a
   * `landTarget` passed from here would override that solve.
   *
   * It is still overridable, but only by a human who actually set it: `explicit`
   * holds the keys present in `AI_BUILDER_CONFIG`, so an admin who types a land
   * count still gets it and a default nobody chose no longer speaks.
   */
  const landTarget = explicit.has('minLandCount')
    ? clamp(config.minLandCount, 30, 42)
    : undefined;

  /*
   * THE THREE ROLE MINIMUMS WERE DECLARED AND NEVER READ, so here they are.
   *
   * `minRampCount`, `minDrawCount` and `minRemovalCount` have sat in
   * `AdminConfig` since it was written, with defaults of 10, 10 and 8, and
   * nothing in this function has ever looked at any of them. That is the same
   * pattern as the rest of this work: a setting that exists, appears to be
   * doing something, and is not connected to anything.
   *
   * They are connected now, under the same rule as the land count: only when an
   * admin actually set one. A default nobody chose must not override a floor
   * the commander's own curve produced, and connecting the defaults would put
   * ramp 10 / draw 10 / removal 8 straight back on every deck in the format,
   * which is the table this change exists to delete.
   */
  const roleTargets: Partial<Record<'ramp' | 'draw' | 'removal', number>> = {};
  if (explicit.has('minRampCount')) roleTargets.ramp = Math.max(0, config.minRampCount);
  if (explicit.has('minDrawCount')) roleTargets.draw = Math.max(0, config.minDrawCount);
  if (explicit.has('minRemovalCount')) roleTargets.removal = Math.max(0, config.minRemovalCount);
  const roleOverrides = Object.keys(roleTargets).length > 0 ? roleTargets : undefined;

  /* --- 3. Rank once, so the planner has something real to choose from */
  // A first build with no planner input. Its top entries are the shortlist the
  // model is shown; producing them by actually building means the shortlist IS
  // the ranking, rather than a separate approximation of it.
  /* `ComboRow` is the database's shape and `ComboSpec` is the engine's. The
     translation is here rather than in the catalog because the engine owns the
     name of everything it reads. */
  const combos = comboRows.map(row => ({
    id: row.id,
    oracleIds: row.oracle_ids ?? [],
    cardNames: row.card_names ?? [],
    popularity: row.popularity ?? null,
    produces: row.produces ?? [],
    needsCommander: row.needs_commander === true,
  }));
  console.log(
    `  combos: ${combos.length} in ${commanderIdentity.join('') || 'colourless'} identity` +
      (combos[0] ? `, best is ${combos[0].cardNames.join(' + ')}` : '')
  );

  const buildOptions = {
    /* THE THREE CONTROLS THE PAGE HAS ALWAYS SENT AND NOTHING HAS EVER READ.
       Measured 3 Sep 2026: `prioritizeSynergy` and `includeLands` had zero
       mentions in this whole function, and `powerLevel` reached only the
       language model's prompt - and the gateway is out of credits, so
       production shipped the same deck at every setting of the slider. */
    powerLevel: request.powerLevel ?? null,
    includeLands: request.includeLands ?? null,
    prioritizeSynergy: request.prioritizeSynergy ?? null,
    combos,
  };

  const baseline = generateDeck({
    format,
    commander,
    pool,
    basics,
    slots: DECK_SLOTS,
    landTarget,
    roleTargets: roleOverrides,
    budgetUsd: targetBudget,
    // The style has to be on BOTH builds. This one produces the shortlist the
    // planner chooses from, so a shortlist ranked without it would hand the
    // model a spells-shaped list and then ask the second build for creatures.
    style,
    // And so does the archetype, for the same reason and a second one: the
    // planner is asked to make the archetype's plan work, so a shortlist ranked
    // without it would be a list of cards for a different deck.
    //
    // `archetypeInput`, not `archetype`: this is the BASELINE build, and with
    // `useAIPlanning: false` — which is every request the app makes — the
    // baseline IS the deck. Passing the raw shell here meant the shells derived
    // from the commander reached only the second build, which never runs.
    archetype: archetypeInput,
    ...buildOptions,
  });

  /* --- 4. There is no step 4 any more ------------------------------- *
   *
   * Owner, 3 Sep 2026: *"we dont use AI for any of the app, all the engine so
   * the options shouldnt call llms it should use engine always."*
   *
   * What stood here was a language model re-ranking the engine's own
   * shortlist. It could only return oracle ids the engine had already chosen -
   * an id off the shortlist was dropped and counted in `rejected` - so at its
   * very best it reordered a list the engine produced, and at its worst it
   * spent a network round trip to agree.
   *
   * It had also been dead in production for some time: the gateway is out of
   * credits, so every request already fell through to the baseline deck. The
   * only thing the model still did was make the response non-deterministic and
   * make `powerLevel` and `customPrompt` look wired when they reached nothing
   * else. Both of those are engine inputs now.
   */

  /* --- 5. The deck IS the engine's deck --------------------------- */
  const deck: GeneratedDeck = baseline;

  console.log(
    `  built: ${deck.totalCopies} cards, ${deck.landCopies} lands, ` +
      `provisional power ${deck.evaluation.power.score} (rescored below)`
  );

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
          /*
           * How this deck was actually decided, so "behaviour drove it" is
           * checkable from the response rather than asserted in a comment.
           * `deck.evidence` is the generator's own account: the commander plan
           * it read, how many pool and chosen cards carried a record, and the
           * style it used against the style it was asked for.
           */
          evidence: {
            ...deck.evidence,
            poolFacets: {
              cards: facets.census.cards,
              compiler: facets.census.compiler,
              xmage: facets.census.xmage,
              none: facets.census.none,
              cached: facets.cached,
              ms: facets.ms,
            },
          },
          typeBreakdown,
          manaCurve,
          avgCmc,
          totalValue: deck.totalUsd,
          /* The model used to name the strategy. The archetype does now,
             and it is the shell the engine actually built to. */
          strategy: archetypeInput?.name ?? null,
          edhMetrics: null,
          cardAnalysis: null,
          landAnalysis: null,
        },
        changeLog: [
          `${validation.totalCards}/99 cards (+ commander = ${validation.totalCards + 1})`,
          `Colours: ${commanderIdentity.join('') || 'colourless'}`,
          `Lands: ${typeBreakdown.lands} (${sumBy(c => c.isBasicLand)} basic)`,
          /*
           * This line used to read "all of them ranked", which was true of the
           * engine's own ranking and read as a claim about the data. It was
           * not one: on the day it was replaced, 40% of the pool carried the
           * popularity column at all, and which 40% depended on the first
           * letter of the card's name. A change log that a player reads has to
           * say what the build actually knew.
           */
          `Chosen from ${pool.length} legal cards, ${popularity.ranked} of them with a ` +
            `popularity figure`,
          ...(popularity.skewedByName
            ? [
                'The card database is mid-rebuild, so how often a card is played is known for ' +
                  `${Math.round(popularity.earlyShare * 100)}% of names starting A to I and ` +
                  `${Math.round(popularity.lateShare * 100)}% of the rest. Some well-known ` +
                  'cards will be missing from this deck until it finishes.',
              ]
            : []),
          ...deck.notes,
          /* No planner line: there is no planner. The engine chose every card
             and every note above says which pass chose it and why. */
          ...deck.shortfalls,
          ...(missingBasics.length
            ? [`Basics not in the card database: ${missingBasics.join(', ')}`]
            : []),
          ...validation.issues,
        ],
        validation,
      },
      /* There is no planner, so there is nothing here. Kept as an explicit
         null rather than removed, because the client reads the field and a
         missing key and a null are different things to a consumer. */
      plan: null,
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

function toBuildCard(
  row: CatalogRow,
  format: string,
  facets: readonly string[] | null = null
): BuildCard {
  return {
    ...normalizeRow(row, format),
    oracleText: row.oracle_text ?? null,
    /* Selected only by `cardsByName`, so the pool carries `undefined` here and
       pays nothing. It is the deck's own cards, and above all the COMMANDER,
       that need it: `oracle_text` is NULL on every multi-face layout. */
    faces: row.faces ?? null,
    keywords: row.keywords ?? null,
    /*
     * THE FIELD THIS PASS EXISTS TO FILL.
     *
     * `normalizeRow` has never set it, so every card the generator ranked
     * arrived with `facets: undefined`. `planFit` reads facets and nothing
     * else, so it returned no fit for any card in the pool, and a commander
     * plan that correctly said "Atraxa wants proliferate and counters" was
     * matched against thirty thousand cards that claimed to do nothing at all.
     * The plan was computed, reported in the notes, and then had nothing to
     * work on.
     *
     * Null means what it always meant — no record — and `hasRecord` still
     * separates that from a card that was read and found to do nothing.
     */
    facets: facets ?? null,
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
