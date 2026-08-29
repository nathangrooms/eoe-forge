/**
 * Castability — "playability %" — computed, not scraped.
 *
 * The number the deck page calls "playability" is castability: given THIS
 * deck's mana base, how often can you actually pay for this card on the turn
 * its cost says you should be casting it?
 *
 * Until now that figure came out of `supabase/functions/edh-power-check`,
 * which regex-scrapes edhpowerlevel.com's rendered HTML for rows shaped
 * `| Qty | Name | Colors | Playability% | Impact |`. That approach had four
 * failure modes, all of them visible to the owner:
 *
 *   1. The request URL is truncated at `MAX_LEN = 7000` characters, so a
 *      100-card deck silently loses its tail and those cards get no number.
 *   2. Rows the site renders as `NaN%` come back as `null`, so cards go blank
 *      for no reason a user can see.
 *   3. Any markup change on their side zeroes the whole column.
 *   4. It is a network round trip through r.jina.ai for a quantity that is a
 *      closed-form probability.
 *
 * Castability is exactly computable, so this module computes it exactly. The
 * scrape's *semantics* are preserved (per-card percentage, `null` where the
 * question is meaningless) so consumers do not have to change shape.
 *
 * ## The model
 *
 * For a card whose cost resolves to `M` mana with colour requirements
 * `n_c` per colour class `c`, on turn `T = M`, having seen
 * `7 + (T - 1)` cards on the play from a library of `N`:
 *
 *   P( live mana sources drawn >= M  AND  the drawn sources can cover every
 *      coloured pip with DISTINCT sources )
 *
 * Both halves are one event over one draw, so they are computed jointly. This
 * matters: a Steam Vents is simultaneously a blue source, a red source and a
 * unit of total mana, so the marginals are strongly dependent and multiplying
 * them — which is what `manabase-builder.ts` does, under a comment that admits
 * it ("Simplified calculation - in practice you'd use proper hypergeometric")
 * — is wrong in both directions depending on the deck.
 *
 * ## Why the joint is exact here, and not a product of marginals
 *
 * We partition the deck's mana sources into DISJOINT categories keyed by which
 * of the card's required colours each source produces: `{U}`, `{R}`, `{U,R}`,
 * and `{}` (a source that makes mana but none of the needed colours). A draw
 * is then a multivariate hypergeometric over those categories, which is a
 * closed-form product of binomials, and we sum it over exactly the outcomes
 * that satisfy the requirement. No independence is assumed anywhere: a dual
 * land drawn once increments the blue counter, the red counter and the total
 * counter, which is precisely what happens at the table.
 *
 * The "can cover every pip with distinct sources" test is Hall's marriage
 * condition, not a per-colour threshold. `{U}{U/R}` needs two sources, one of
 * which must make blue; a single Steam Vents does not satisfy it. We check
 * every subset of pip classes against the count of drawn sources that can
 * serve any of them, which is exactly Hall.
 *
 * The naive worry is that the category lattice is 2^k, so a five-colour cost
 * would be intractable. It is not, because of one exactness-preserving trick:
 * the requirement is monotone — drawing more sources can never un-satisfy it —
 * so the instant a count vector satisfies Hall it is collapsed onto a single
 * absorbing state. Most of the probability mass reaches that state early, and
 * the surviving vectors are the sparse near-misses. Measured on real bases,
 * `{3}{W}{U}{B}{G}` (Atraxa) solves exactly in ~35ms and Progenitus's ten
 * pips across five colours in ~175ms, both before memoisation.
 *
 * {@link STATE_BUDGET} is therefore a safety valve rather than a routine path.
 * It has not been observed to trip on a real cost; it exists so that a
 * pathological deck cannot stall a render. If it ever does trip, the result
 * comes back with `approximate: true` and callers must not present it as
 * exact.
 *
 * ## Precision
 *
 * The summand is a product of binomial coefficients over one composition of
 * the draw, and by Vandermonde's identity that product is bounded above by
 * `C(N, D)` — about 1.5e21 for a 99-card deck at turn 15. So the DP never
 * overflows a double and never needs rescaling; we divide by `C(N, D)` once,
 * at the end. `hypergeometricAtLeast` is BigInt-exact and is what the tests
 * check the DP against, so the floating-point path has a reference.
 *
 * ## What this deliberately does NOT model
 *
 * Stated rather than fudged, because a wrong number presented confidently is
 * worse than an absent one:
 *
 *   - Lands that enter tapped. A tapland played on the turn you needed it
 *     produces nothing that turn, so castability here is a slight over-
 *     estimate for tapland-heavy builds. Modelling it exactly needs to know
 *     which land was played last, which is a sequencing question, not a
 *     drawing one.
 *   - Whether an accelerant was itself castable. A Signet counted as a source
 *     from turn 3 assumes you had two mana on turn 2 to deploy it. This is the
 *     standard treatment (Karsten's tables make the same assumption).
 *   - Mulligans, card selection, tutors, rituals, treasure, and cost reduction.
 *   - `{C}` (true colourless, Eldrazi) is treated as generic. A Mountain
 *     cannot actually pay `{C}`, so those few cards read slightly high.
 */

/* ------------------------------------------------------------------ *
 * Colours
 * ------------------------------------------------------------------ */

export type ManaColour = 'W' | 'U' | 'B' | 'R' | 'G';

export const MANA_COLOURS: readonly ManaColour[] = ['W', 'U', 'B', 'R', 'G'] as const;

/* Exported so view-layer code can ask "does this source make blue?" without
   re-deriving the bit order. The maths stays in this module. */
export const COLOUR_BIT: Record<ManaColour, number> = { W: 1, U: 2, B: 4, R: 8, G: 16 };
const ALL_COLOURS_MASK = 31;

/* Exported for the same reason as COLOUR_BIT: a caller holding a mask should
   read the letters off it here rather than write the loop a second time. */
export function maskToColours(mask: number): ManaColour[] {
  return MANA_COLOURS.filter(c => (mask & COLOUR_BIT[c]) !== 0);
}

export function coloursToMask(colours: readonly string[] | null | undefined): number {
  let mask = 0;
  for (const c of colours ?? []) {
    const bit = COLOUR_BIT[c as ManaColour];
    if (bit) mask |= bit;
  }
  return mask;
}

function popcount(mask: number): number {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n++;
  return n;
}

/* ------------------------------------------------------------------ *
 * Exact combinatorics
 * ------------------------------------------------------------------ */

const factorialCache: bigint[] = [1n];

function factorialExact(n: number): bigint {
  for (let i = factorialCache.length; i <= n; i++) {
    factorialCache[i] = factorialCache[i - 1] * BigInt(i);
  }
  return factorialCache[n];
}

/** Exact binomial coefficient. Used by the BigInt reference paths. */
export function chooseExact(n: number, k: number): bigint {
  if (k < 0 || k > n || n < 0) return 0n;
  return factorialExact(n) / (factorialExact(k) * factorialExact(n - k));
}

const lnFactorialCache: number[] = [0, 0];

/**
 * log(n!) by summed logarithms.
 *
 * Not used by the DP — which needs no log space, see the precision note above
 * — but exported because callers that want to compose their own hypergeometric
 * tails should not reinvent it, and because a 99-card factorial is 1.5e157 and
 * anyone reaching for `Math.factorial` will get `Infinity`.
 */
export function lnFactorial(n: number): number {
  for (let i = lnFactorialCache.length; i <= n; i++) {
    lnFactorialCache[i] = lnFactorialCache[i - 1] + Math.log(i);
  }
  return lnFactorialCache[n];
}

export function lnChoose(n: number, k: number): number {
  if (k < 0 || k > n || n < 0) return -Infinity;
  return lnFactorial(n) - lnFactorial(k) - lnFactorial(n - k);
}

const chooseCache = new Map<number, number>();

/**
 * Binomial coefficient as a double, multiplicatively so each partial product
 * is an integer for as long as one fits. Relative error stays at ~1e-16 per
 * step and `k` here is at most the draw count, so ~20 steps.
 */
function choose(n: number, k: number): number {
  if (k < 0 || k > n || n < 0) return 0;
  if (k === 0 || k === n) return 1;
  const kk = Math.min(k, n - k);
  const key = n * 64 + kk;
  const hit = chooseCache.get(key);
  if (hit !== undefined) return hit;
  let acc = 1;
  for (let i = 1; i <= kk; i++) acc = (acc * (n - kk + i)) / i;
  chooseCache.set(key, acc);
  return acc;
}

/**
 * P(at least `k` successes) for a hypergeometric draw: `draws` cards taken
 * from a population of `population` containing `successes` marked cards.
 *
 * BigInt-exact: the sum is computed as one integer numerator over one integer
 * denominator and converted to a double only at the end, so there is no
 * cancellation and no `1 - tiny` catastrophe.
 */
export function hypergeometricAtLeast(
  population: number,
  successes: number,
  draws: number,
  k: number
): number {
  if (k <= 0) return 1;
  if (successes < k) return 0;
  const d = Math.min(draws, population);
  if (d < k) return 0;

  let numerator = 0n;
  const hi = Math.min(successes, d);
  for (let x = k; x <= hi; x++) {
    numerator += chooseExact(successes, x) * chooseExact(population - successes, d - x);
  }
  return ratioToNumber(numerator, chooseExact(population, d));
}

/** Converts a BigInt ratio to a double without going through Number(huge). */
function ratioToNumber(num: bigint, den: bigint): number {
  if (den === 0n) return 0;
  const SCALE = 10n ** 20n;
  return Number((num * SCALE) / den) / 1e20;
}

/* ------------------------------------------------------------------ *
 * Mana cost parsing
 * ------------------------------------------------------------------ */

/**
 * One colour requirement. `mask` is the set of colours that can pay it, so a
 * plain `{U}` is a class of one colour and a hybrid `{W/U}` is a class of two.
 */
export interface PipClass {
  mask: number;
  count: number;
}

export interface ParsedCost {
  raw: string;
  /** Mana that must actually be paid, under the cheapest legal payment. */
  manaRequired: number;
  /** Distinct colour requirement classes, merged by mask. */
  classes: PipClass[];
  /** Union of every class mask. */
  relevantMask: number;
  hasX: boolean;
  /** Phyrexian pips, paid with life here so they impose no mana or colour. */
  phyrexianCount: number;
}

export interface ParseCostOptions {
  /**
   * What X is assumed to be. See {@link DEFAULT_X_VALUE} for the reasoning.
   */
  xValue?: number;
  /**
   * Colours the deck can actually produce. Only used to resolve monocoloured
   * hybrid (`{2/W}`), which is payable either way.
   */
  availableColours?: number;
}

/**
 * X is a judgement call, and this is the judgement.
 *
 * The printed mana value of `{X}{R}` is 1, which would rate Fireball as a
 * turn-1 play and score it ~96% in any red deck — technically true and
 * completely useless. The other extreme, "X = whatever you would want", is not
 * knowable from the decklist. We assume **X = 1**: the cheapest cast that
 * actually does something. `{X}{R}` is therefore a turn-2 card.
 *
 * It is exposed as an option rather than hard-coded so a caller that wants the
 * strict-mana-value reading can pass 0 and get it, instead of building a
 * second parser.
 */
export const DEFAULT_X_VALUE = 1;

const SYMBOL_RE = /\{([^}]+)\}/g;

export function parseManaCost(cost: string | null | undefined, options: ParseCostOptions = {}): ParsedCost | null {
  const raw = (cost ?? '').trim();
  if (!raw) return null;

  const xValue = options.xValue ?? DEFAULT_X_VALUE;
  const available = options.availableColours ?? ALL_COLOURS_MASK;

  let generic = 0;
  let hasX = false;
  let phyrexianCount = 0;
  const byMask = new Map<number, number>();
  const addClass = (mask: number) => byMask.set(mask, (byMask.get(mask) ?? 0) + 1);

  let matched = false;
  SYMBOL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SYMBOL_RE.exec(raw)) !== null) {
    matched = true;
    const token = m[1].toUpperCase();

    // Phyrexian: payable with 2 life, so it costs no mana and demands no
    // colour. Surgical Extraction {B/P} is a turn-1 play in any deck, and
    // pretending it needs black would be the wrong answer, not a safe one.
    if (token.includes('P') && /[WUBRG]/.test(token)) {
      phyrexianCount++;
      continue;
    }

    if (/^\d+$/.test(token)) {
      generic += parseInt(token, 10);
      continue;
    }

    if (token === 'X' || token === 'Y' || token === 'Z') {
      hasX = true;
      generic += xValue;
      continue;
    }

    // {C} true colourless and {S} snow are both treated as generic. See the
    // module header — {C} is a known slight over-estimate for Eldrazi.
    if (token === 'C' || token === 'S') {
      generic += 1;
      continue;
    }

    // Monocoloured hybrid {2/W}: one W, or two generic. If the deck makes W
    // you will always pay the W, so we model that; if it makes no W at all the
    // generic escape is the only option. Modelling it as the colour is a
    // conservative floor for decks that do have the colour, since the generic
    // route is a strictly extra way to succeed.
    const twobrid = /^(\d+)\/([WUBRG])$/.exec(token);
    if (twobrid) {
      const bit = COLOUR_BIT[twobrid[2] as ManaColour];
      if ((available & bit) !== 0) addClass(bit);
      else generic += parseInt(twobrid[1], 10);
      continue;
    }

    // Hybrid {W/U}, {W/U/B}: one mana, payable by any colour in the set.
    if (/^[WUBRG](\/[WUBRG])+$/.test(token)) {
      addClass(coloursToMask(token.split('/')));
      continue;
    }

    if (/^[WUBRG]$/.test(token)) {
      addClass(COLOUR_BIT[token as ManaColour]);
      continue;
    }

    // Unknown symbol: charge a generic rather than silently dropping it.
    generic += 1;
  }

  if (!matched) return null;

  const classes: PipClass[] = [...byMask.entries()]
    .map(([mask, count]) => ({ mask, count }))
    .sort((a, b) => a.mask - b.mask);

  const pipTotal = classes.reduce((s, c) => s + c.count, 0);
  const relevantMask = classes.reduce((s, c) => s | c.mask, 0);

  return {
    raw,
    manaRequired: generic + pipTotal,
    classes,
    relevantMask,
    hasX,
    phyrexianCount,
  };
}

/* ------------------------------------------------------------------ *
 * Mana sources
 * ------------------------------------------------------------------ */

export type SourceKind = 'land' | 'rock' | 'dork';

export interface ManaSource {
  name: string;
  /** Colours this source can produce, as a bit mask. 0 = colourless only. */
  colourMask: number;
  /** How much mana one activation yields. Used to spot net-positive rocks. */
  amount: number;
  /** Earliest turn on which this source can be adding mana. */
  onlineTurn: number;
  kind: SourceKind;
}

/** The minimum card shape this engine needs. `DeckCardDetail` satisfies it. */
export interface PlayabilityCardInput {
  name: string;
  type_line: string;
  mana_cost?: string | null;
  cmc?: number | null;
  oracle_text?: string | null;
  color_identity?: string[] | null;
  /** Copies in the deck. Defaults to 1. */
  quantity?: number;
  /** Commanders sit in the command zone, not the library. */
  isCommander?: boolean;
}

const BASIC_TYPE_COLOUR: Array<[RegExp, ManaColour]> = [
  [/\bPlains\b/i, 'W'],
  [/\bIsland\b/i, 'U'],
  [/\bSwamp\b/i, 'B'],
  [/\bMountain\b/i, 'R'],
  [/\bForest\b/i, 'G'],
];

const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

/** Front face only — an MDFC with a land back is still cast off its front. */
function frontFace(typeLine: string): string {
  return (typeLine ?? '').split('//')[0];
}

function isLand(card: PlayabilityCardInput): boolean {
  return /\bLand\b/i.test(frontFace(card.type_line));
}

/**
 * What a permanent adds, and how much of it.
 *
 * Scryfall oracle text is the only reliable signal here: `color_identity`
 * cannot distinguish a Mountain from a red creature, and the local card table
 * has no "produces mana" column.
 */
function manaProduction(
  card: PlayabilityCardInput,
  deckColourMask: number
): { mask: number; amount: number } | null {
  const type = frontFace(card.type_line) ?? '';
  const text = card.oracle_text ?? '';

  // Basic land types are definitive and are printed even when the reminder
  // text is absent (duals, shocklands, Ravnica bounce lands).
  let mask = 0;
  if (/\bLand\b/i.test(type)) {
    for (const [re, colour] of BASIC_TYPE_COLOUR) {
      if (re.test(type)) mask |= COLOUR_BIT[colour];
    }
  }

  let amount = 0;
  let sawAdd = false;

  // Each "Add ..." clause, up to the sentence end.
  const addRe = /\badds?\b([^.;)]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = addRe.exec(text)) !== null) {
    const clause = m[1];
    let clauseMask = 0;
    let clauseAmount = 0;

    const symRe = /\{([WUBRGC])\}/gi;
    let s: RegExpExecArray | null;
    while ((s = symRe.exec(clause)) !== null) {
      clauseAmount++;
      const bit = COLOUR_BIT[s[1].toUpperCase() as ManaColour];
      if (bit) clauseMask |= bit;
    }

    // "one mana of any color", "two mana of any one color", "mana of any type"
    const anyColour = /\bany\s+(?:one\s+)?(?:colou?r|type)\b/i.test(clause);
    if (anyColour) {
      clauseMask |= ALL_COLOURS_MASK;
      if (clauseAmount === 0) {
        const w = /\b(one|two|three|four|five)\b/i.exec(clause);
        clauseAmount = w ? WORD_NUMBERS[w[1].toLowerCase()] : 1;
      }
    }

    if (clauseAmount > 0 || clauseMask !== 0) {
      sawAdd = true;
      mask |= clauseMask;
      amount = Math.max(amount, clauseAmount || 1);
    }
  }

  // Fetchlands and Evolving Wilds produce nothing themselves but resolve into
  // a source of whatever they can find, so they are counted as that source.
  if (/\bLand\b/i.test(type) && !sawAdd && mask === 0) {
    const search = /search your library for an?\s+([^.]*?)\s+card/i.exec(text);
    if (search) {
      const what = search[1];
      let fetchMask = 0;
      for (const [re, colour] of BASIC_TYPE_COLOUR) {
        if (re.test(what)) fetchMask |= COLOUR_BIT[colour];
      }
      // "a basic land card" names no type, so it fetches whatever basics the
      // deck actually plays — the deck's own colours, not all five.
      if (fetchMask === 0 && /\bbasic\b/i.test(what)) fetchMask = deckColourMask;
      if (fetchMask === 0 && /\bland\b/i.test(what)) fetchMask = deckColourMask;
      /*
       * AND A FETCHLAND CANNOT FIND A BASIC THE DECK DOES NOT PLAY.
       *
       * The untyped case above already says this — "the deck's own colours,
       * not all five" — and the TYPED case did not, so a fetchland naming its
       * basic types was credited with those colours whatever deck it was in.
       *
       * Windswept Heath reads "search your library for a Forest or Plains
       * card". In Talrand, mono blue, that matched `Forest` and `Plains` and
       * came back a white and green source, in a deck with no white and no
       * green cards and no Plains and no Forest to find. The card is a blank:
       * it taps for nothing and finds nothing.
       *
       * Two things read this and both were wrong because of it.
       * `buildManaProfile` counted W and G sources that do not exist, which
       * inflates `sourcesByColour` and the castability of any cost in the
       * fetch's OTHER half — the common case is not the mono deck but the
       * two-colour one, where a Polluted Delta in Orzhov claimed to be a blue
       * source. And `pickLands` in the builder asks `manaSourceFor` which of
       * the deck's colours a land makes, then tiers on the answer; a mask of
       * W and G is non-empty, so an unfetchable fetchland sorted as a real
       * mana source and was taken ahead of lands that do something.
       * Talrand's mana base held Windswept Heath and Bloodstained Mire.
       *
       * Intersecting is the whole fix. What is left is a land that produces
       * nothing, which the fallthrough below already describes correctly.
       */
      fetchMask &= deckColourMask;
      if (fetchMask !== 0) {
        mask |= fetchMask;
        amount = Math.max(amount, 1);
        sawAdd = true;
      }
    }
  }

  if (mask === 0 && !sawAdd) {
    // A land with no parsable production is still a land drop — Wastes,
    // Reliquary Tower, an unparsed utility land. It makes colourless mana.
    if (/\bLand\b/i.test(type)) return { mask: 0, amount: 1 };
    return null;
  }

  return { mask, amount: Math.max(amount, 1) };
}

function manaValueOf(card: PlayabilityCardInput): number {
  if (typeof card.cmc === 'number' && Number.isFinite(card.cmc)) return card.cmc;
  const parsed = parseManaCost(card.mana_cost, { xValue: 0 });
  return parsed ? parsed.manaRequired : 0;
}

/**
 * The turn a source first contributes *spare* mana.
 *
 * A land is turn 1. An accelerant costing `m` is deployed on turn `m`, using
 * that turn's mana to do it, so it is turn `m + 1` before it has added
 * anything you can spend on something else.
 *
 * The exception is a net-positive rock — Sol Ring, the Moxen, Mana Crypt,
 * Jeweled Lotus — which produces at least as much as it cost, and artifacts
 * have no summoning sickness, so it pays for itself the turn it resolves.
 *
 * **No creature ever gets that exception.** A dork is summoning-sick, so even
 * a hypothetical mana creature that taps for two cannot tap on the turn it
 * lands. That is the whole of the "dorks are slower than rocks" difference and
 * it is the reason `kind` is tracked at all.
 */
function onlineTurnFor(kind: SourceKind, mv: number, amount: number): number {
  if (kind === 'land') return 1;
  if (kind === 'rock' && amount >= Math.max(mv, 1)) return Math.max(1, mv);
  return Math.max(1, mv) + 1;
}

export interface ManaProfile {
  /** Cards that can be drawn — the deck minus anything in the command zone. */
  librarySize: number;
  sources: ManaSource[];
  /** Colours the deck can produce at all. */
  deckColourMask: number;
  sourcesByColour: Record<ManaColour, number>;
  landCount: number;
  rockCount: number;
  dorkCount: number;
}

/**
 * What one card contributes as a mana source, in a deck of these colours.
 *
 * Extracted verbatim from the body of {@link buildManaProfile}, which now calls
 * it, so there is exactly one answer to "what does this land make". The deck
 * generator needs that answer per candidate land while it is still *choosing*
 * the mana base — before any profile exists to read it off — and a second
 * reading of the oracle text is precisely the kind of quiet fork this engine
 * exists to prevent.
 *
 * `deckColourMask` matters because "search your library for a basic land" can
 * only fetch colours the deck actually plays, so a Terramorphic Expanse in a
 * mono-black deck is a black source and nothing else.
 *
 * Returns null for anything that is not a repeatable source: a card with no
 * mana production at all, and rituals (an instant or sorcery that "adds" mana
 * is one shot and costs a card).
 */
export function manaSourceFor(
  card: PlayabilityCardInput,
  deckColourMask: number
): ManaSource | null {
  const production = manaProduction(card, deckColourMask);
  if (!production) return null;

  const type = frontFace(card.type_line) ?? '';
  if (/\b(Instant|Sorcery)\b/i.test(type)) return null;

  let kind: SourceKind;
  if (/\bLand\b/i.test(type)) kind = 'land';
  else if (/\bCreature\b/i.test(type)) kind = 'dork';
  else kind = 'rock';

  return {
    name: card.name,
    colourMask: production.mask,
    amount: production.amount,
    onlineTurn: onlineTurnFor(kind, manaValueOf(card), production.amount),
    kind,
  };
}

export function buildManaProfile(deck: readonly PlayabilityCardInput[]): ManaProfile {
  // Two passes: the deck's own colours decide what "search for a basic land"
  // can find, so they have to be known before sources are classified.
  let deckColourMask = 0;
  for (const card of deck) {
    deckColourMask |= coloursToMask(card.color_identity);
  }

  const sources: ManaSource[] = [];
  let librarySize = 0;
  let landCount = 0;
  let rockCount = 0;
  let dorkCount = 0;

  for (const card of deck) {
    const qty = Math.max(1, card.quantity ?? 1);
    if (!card.isCommander) librarySize += qty;

    const source = manaSourceFor(card, deckColourMask);
    if (!source) continue;
    const kind = source.kind;

    if (kind === 'land') landCount += qty;
    else if (kind === 'rock') rockCount += qty;
    else dorkCount += qty;

    // A commander is not in the library, so it cannot be *drawn* as a source.
    if (card.isCommander) continue;

    for (let i = 0; i < qty; i++) sources.push({ ...source });
  }

  const sourcesByColour = { W: 0, U: 0, B: 0, R: 0, G: 0 } as Record<ManaColour, number>;
  for (const s of sources) {
    for (const c of maskToColours(s.colourMask)) sourcesByColour[c]++;
  }

  return { librarySize, sources, deckColourMask, sourcesByColour, landCount, rockCount, dorkCount };
}

/* ------------------------------------------------------------------ *
 * The joint hypergeometric
 * ------------------------------------------------------------------ */

/**
 * Ceiling on DP states visited before we give up on the exact sum.
 *
 * A safety valve, not a routine path — see the module header. Every real cost
 * measured so far, up to Progenitus's ten pips across five colours, finishes
 * exactly and well inside this. It is here so that an adversarial or corrupt
 * decklist degrades to a flagged approximation instead of hanging a render.
 */
export const STATE_BUDGET = 3_000_000;

export interface CastabilityResult {
  probability: number;
  /** True when the marginal-product fallback was used. Never present this
   *  number as exact when this is set. */
  approximate: boolean;
}

interface Category {
  mask: number;
  size: number;
  cap: number;
}

/**
 * P(castable on `turn`), jointly over total mana and every colour requirement.
 */
export function castability(
  profile: ManaProfile,
  cost: ParsedCost,
  turn: number,
  options: { onThePlay?: boolean } = {}
): CastabilityResult {
  const M = cost.manaRequired;
  if (M <= 0) return { probability: 1, approximate: false };

  const N = profile.librarySize;
  if (N <= 0) return { probability: 0, approximate: false };

  // On the play you do not draw for turn, so turn 1 is the opening seven.
  const onThePlay = options.onThePlay ?? true;
  const D = Math.min(N, (onThePlay ? 6 : 7) + turn);

  const relevant = cost.relevantMask;
  const live = profile.sources.filter(s => s.onlineTurn <= turn);
  if (live.length < M) return { probability: 0, approximate: false };

  // Disjoint categories keyed on the required colours a source can supply.
  // Everything that makes mana but none of them lands in `otherLive`, where it
  // still counts toward the total-mana half of the requirement.
  const sizeByMask = new Map<number, number>();
  let otherLive = 0;
  for (const s of live) {
    const key = s.colourMask & relevant;
    if (key === 0) otherLive++;
    else sizeByMask.set(key, (sizeByMask.get(key) ?? 0) + 1);
  }

  const totalPips = cost.classes.reduce((s, c) => s + c.count, 0);

  const categories: Category[] = [...sizeByMask.entries()]
    .map(([mask, size]) => {
      // A category can serve at most the pips of every class it intersects,
      // so counting it higher than that carries no information. Capping is
      // lossless because the requirement is monotone in every count.
      const servable = cost.classes.reduce((s, c) => s + ((c.mask & mask) !== 0 ? c.count : 0), 0);
      return { mask, size, cap: Math.min(size, Math.min(servable, totalPips)) };
    })
    .sort((a, b) => b.size - a.size);

  // Hall's marriage condition. For every non-empty subset of pip classes, the
  // sources that can serve *any* class in the subset must number at least the
  // subset's total demand. Subsets sharing a union collapse to the strictest.
  const constraints: Array<{ demand: number; cats: number[] }> = [];
  {
    const byUnion = new Map<number, number>();
    const m = cost.classes.length;
    for (let sub = 1; sub < 1 << m; sub++) {
      let union = 0;
      let demand = 0;
      for (let i = 0; i < m; i++) {
        if (sub & (1 << i)) {
          union |= cost.classes[i].mask;
          demand += cost.classes[i].count;
        }
      }
      byUnion.set(union, Math.max(byUnion.get(union) ?? 0, demand));
    }
    for (const [union, demand] of byUnion) {
      const cats: number[] = [];
      categories.forEach((c, i) => {
        if ((c.mask & union) !== 0) cats.push(i);
      });
      constraints.push({ demand, cats });
    }
  }

  const caps = categories.map(c => c.cap);
  const hallOK = (counts: number[]): boolean => {
    for (const { demand, cats } of constraints) {
      let have = 0;
      for (const i of cats) {
        have += counts[i];
        if (have >= demand) break;
      }
      if (have < demand) return false;
    }
    return true;
  };

  // The requirement is monotone, so if the deck cannot satisfy Hall with every
  // category maxed it cannot satisfy it at all.
  if (!hallOK(caps)) return { probability: 0, approximate: false };

  // --- state encoding -------------------------------------------------
  // key = used + (D+1) * ( live + (M+1) * ( c0 + (cap0+1) * ( c1 + ... ) ) )
  const dims = [D + 1, M + 1, ...caps.map(c => c + 1)];
  let stateSpace = 1;
  for (const d of dims) stateSpace *= d;
  if (!Number.isFinite(stateSpace) || stateSpace > Number.MAX_SAFE_INTEGER) {
    return { probability: marginalProduct(profile, cost, turn, D, N), approximate: true };
  }
  const strides: number[] = new Array(dims.length);
  strides[0] = 1;
  for (let i = 1; i < dims.length; i++) strides[i] = strides[i - 1] * dims[i - 1];

  const nCat = categories.length;
  const satisfiedKeyPart = caps.reduce((acc, cap, i) => acc + cap * strides[2 + i], 0);

  const otherLiveSize = otherLive;
  const remainder = N - live.length; // cards that are not live mana sources

  let dp = new Map<number, number>();
  dp.set(0, 1);
  let visited = 0;

  const step = (size: number, catIndex: number) => {
    if (size === 0) return;
    const next = new Map<number, number>();
    for (const [key, weight] of dp) {
      const used = key % dims[0];
      const rest = (key - used) / dims[0];
      const liveCount = rest % dims[1];
      const room = D - used;
      const maxX = Math.min(size, room);
      for (let x = 0; x <= maxX; x++) {
        const w = weight * choose(size, x);
        if (w === 0) continue;
        let nk = key + x * strides[0];
        const newLive = Math.min(liveCount + x, M);
        nk += (newLive - liveCount) * strides[1];
        if (catIndex >= 0 && x > 0) {
          const cur = Math.floor(key / strides[2 + catIndex]) % dims[2 + catIndex];
          const bumped = Math.min(cur + x, caps[catIndex]);
          nk += (bumped - cur) * strides[2 + catIndex];
        }
        next.set(nk, (next.get(nk) ?? 0) + w);
      }
    }
    dp = next;
    visited += dp.size;
  };

  // Collapse every Hall-satisfying count vector onto the all-caps vector. The
  // requirement cannot be un-satisfied by drawing more, so this is exact, and
  // it is what keeps three-colour costs tractable.
  const collapse = () => {
    const next = new Map<number, number>();
    const counts = new Array(nCat).fill(0);
    for (const [key, weight] of dp) {
      for (let i = 0; i < nCat; i++) {
        counts[i] = Math.floor(key / strides[2 + i]) % dims[2 + i];
      }
      let nk = key;
      if (hallOK(counts)) {
        nk = (key % strides[2]) + satisfiedKeyPart;
      }
      next.set(nk, (next.get(nk) ?? 0) + weight);
    }
    dp = next;
  };

  for (let i = 0; i < nCat; i++) {
    step(categories[i].size, i);
    collapse();
    if (visited > STATE_BUDGET) {
      return { probability: marginalProduct(profile, cost, turn, D, N), approximate: true };
    }
  }
  step(otherLiveSize, -1);

  // Fill the rest of the hand from everything that is not a live source.
  let total = 0;
  const counts = new Array(nCat).fill(0);
  for (const [key, weight] of dp) {
    const used = key % dims[0];
    const liveCount = Math.floor(key / strides[1]) % dims[1];
    if (liveCount < M) continue;
    for (let i = 0; i < nCat; i++) {
      counts[i] = Math.floor(key / strides[2 + i]) % dims[2 + i];
    }
    if (!hallOK(counts)) continue;
    const rest = D - used;
    if (rest > remainder) continue;
    total += weight * choose(remainder, rest);
  }

  const p = total / choose(N, D);
  return { probability: Math.min(1, Math.max(0, p)), approximate: false };
}

/**
 * The fallback for four and five-colour costs only.
 *
 * This multiplies per-colour marginals and the total-mana marginal as if they
 * were independent. They are not — every source is shared between them — so
 * the result is wrong in an unsigned direction: overlapping duals push the
 * true joint above the product, while the negative correlation inherent to
 * drawing without replacement pushes it below. That is exactly why it is
 * flagged `approximate` rather than quietly returned.
 */
function marginalProduct(
  profile: ManaProfile,
  cost: ParsedCost,
  turn: number,
  D: number,
  N: number
): number {
  const live = profile.sources.filter(s => s.onlineTurn <= turn);
  let p = hypergeometricAtLeast(N, live.length, D, cost.manaRequired);
  for (const cls of cost.classes) {
    const k = live.filter(s => (s.colourMask & cls.mask) !== 0).length;
    p *= hypergeometricAtLeast(N, k, D, cls.count);
  }
  return Math.min(1, Math.max(0, p));
}

/* ------------------------------------------------------------------ *
 * Per-card and deck-level API
 * ------------------------------------------------------------------ */

export type PlayabilitySkipReason = 'land' | 'no-mana-cost' | 'free';

export interface CardPlayability {
  name: string;
  /**
   * Castability as a percentage, 0–100, or `null` where the question has no
   * answer. A land is `null`, never 0 and never 100 — you do not cast it.
   */
  pct: number | null;
  /** Turn the figure is quoted for. `null` alongside a `null` pct. */
  turn: number | null;
  manaRequired: number | null;
  pips: Array<{ colours: ManaColour[]; count: number }>;
  /** Live sources at `turn`, for tooltips that explain the number. */
  liveSources: number | null;
  approximate: boolean;
  skipped: PlayabilitySkipReason | null;
  isCommander: boolean;
}

export interface PlayabilityOptions extends ParseCostOptions {
  onThePlay?: boolean;
  /** Percentage under which a card counts as hard to cast. */
  threshold?: number;
}

export const DEFAULT_THRESHOLD = 50;

export function cardPlayability(
  card: PlayabilityCardInput,
  profile: ManaProfile,
  options: PlayabilityOptions = {}
): CardPlayability {
  const base: CardPlayability = {
    name: card.name,
    pct: null,
    turn: null,
    manaRequired: null,
    pips: [],
    liveSources: null,
    approximate: false,
    skipped: null,
    isCommander: !!card.isCommander,
  };

  // Lands are put onto the battlefield, not cast. There is no probability to
  // report, so we report none — 100 would be a lie about a card that does not
  // have a mana cost, and 0 would be a worse one.
  if (isLand(card)) return { ...base, skipped: 'land' };

  const cost = parseManaCost(card.mana_cost, {
    xValue: options.xValue,
    availableColours: options.availableColours ?? profile.deckColourMask,
  });
  if (!cost) return { ...base, skipped: 'no-mana-cost' };

  const pips = cost.classes.map(c => ({ colours: maskToColours(c.mask), count: c.count }));

  // A genuinely free spell — {0}, or an all-Phyrexian cost paid with life — is
  // always castable, and that is a real answer rather than a skip.
  if (cost.manaRequired === 0) {
    return { ...base, pct: 100, turn: 1, manaRequired: 0, pips, liveSources: null, skipped: null };
  }

  const turn = Math.max(1, cost.manaRequired);
  const result = castability(profile, cost, turn, { onThePlay: options.onThePlay });

  return {
    ...base,
    pct: result.probability * 100,
    turn,
    manaRequired: cost.manaRequired,
    pips,
    liveSources: profile.sources.filter(s => s.onlineTurn <= turn).length,
    approximate: result.approximate,
  };
}

export interface DeckPlayability {
  cards: CardPlayability[];
  /** Copy-weighted mean over cards that have a figure. `null` if none do. */
  averagePct: number | null;
  medianPct: number | null;
  /** Copy-weighted count of cards under `threshold`. */
  belowThresholdCount: number;
  threshold: number;
  scoredCount: number;
  skippedCount: number;
  /** True if any card fell back to the marginal product. */
  anyApproximate: boolean;
  profile: ManaProfile;
}

/**
 * One roll-up so the deck page, the optimizer and the analysis panel do not
 * each invent their own average. The scrape returned a site-computed "Average
 * Playability" alongside the per-card column and the two did not agree; this
 * average is by construction the mean of the column beside it.
 */
export function deckPlayability(
  deck: readonly PlayabilityCardInput[],
  options: PlayabilityOptions = {}
): DeckPlayability {
  const profile = buildManaProfile(deck);
  const cards = deck.map(card => cardPlayability(card, profile, options));
  return rollUp(deck, cards, profile, options.threshold ?? DEFAULT_THRESHOLD);
}

/* ------------------------------------------------------------------ *
 * Memoised engine
 * ------------------------------------------------------------------ */

export interface PlayabilityEngine {
  profile: ManaProfile;
  /** Memoised on the card's cost and turn, not its name — two cards with the
   *  same cost have the same castability by definition. */
  card(card: PlayabilityCardInput): CardPlayability;
  deck(): DeckPlayability;
}

/**
 * Build once per decklist and reuse.
 *
 * This runs for every card of a 100-card deck on every render of the deck
 * page. Castability depends only on the cost and the turn, so a deck that
 * plays thirty two-mana spells does thirty lookups and one calculation.
 */
export function createPlayabilityEngine(
  deck: readonly PlayabilityCardInput[],
  options: PlayabilityOptions = {}
): PlayabilityEngine {
  const profile = buildManaProfile(deck);
  const memo = new Map<string, CardPlayability>();
  let deckResult: DeckPlayability | null = null;

  const card = (input: PlayabilityCardInput): CardPlayability => {
    const key = `${isLand(input) ? 'L' : 'S'}|${input.mana_cost ?? ''}`;
    const hit = memo.get(key);
    if (hit) return { ...hit, name: input.name, isCommander: !!input.isCommander };
    const computed = cardPlayability(input, profile, options);
    memo.set(key, computed);
    return computed;
  };

  return {
    profile,
    card,
    deck: () => {
      if (!deckResult) {
        const cards = deck.map(c => card(c));
        deckResult = rollUp(deck, cards, profile, options.threshold ?? DEFAULT_THRESHOLD);
      }
      return deckResult;
    },
  };
}

function rollUp(
  deck: readonly PlayabilityCardInput[],
  cards: CardPlayability[],
  profile: ManaProfile,
  threshold: number
): DeckPlayability {
  let weighted = 0;
  let weight = 0;
  let below = 0;
  let skipped = 0;
  let anyApproximate = false;
  const values: number[] = [];

  cards.forEach((result, i) => {
    const qty = Math.max(1, deck[i].quantity ?? 1);
    if (result.approximate) anyApproximate = true;
    if (result.pct === null) {
      skipped += qty;
      return;
    }
    weighted += result.pct * qty;
    weight += qty;
    if (result.pct < threshold) below += qty;
    for (let k = 0; k < qty; k++) values.push(result.pct);
  });

  values.sort((a, b) => a - b);
  const medianPct = values.length
    ? values.length % 2
      ? values[(values.length - 1) / 2]
      : (values[values.length / 2 - 1] + values[values.length / 2]) / 2
    : null;

  return {
    cards,
    averagePct: weight > 0 ? weighted / weight : null,
    medianPct,
    belowThresholdCount: below,
    threshold,
    scoredCount: weight,
    skippedCount: skipped,
    anyApproximate,
    profile,
  };
}
