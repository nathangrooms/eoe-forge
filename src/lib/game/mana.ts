/**
 * DeckMatrix — shared game-state core: paying for a spell.
 *
 * A playtest table that lets you drop a 7-drop on turn one is a card viewer,
 * not a playtest. This module works out whether a cost can actually be paid
 * from the permanents on the battlefield, and which of them to tap.
 *
 * What it models, honestly stated:
 *   - Coloured pips must be produced by a source that makes that colour.
 *   - Generic mana takes any remaining source.
 *   - A land's `colorIdentity` is used as its produced colours. For basics,
 *     duals, shocks, triomes and the overwhelming majority of real mana bases
 *     that is exactly right; it is wrong for filters and for the handful of
 *     lands whose identity exceeds what they tap for.
 *   - A land with an empty identity (Wastes, most utility lands) produces one
 *     colourless mana, which pays generic and {C} but no coloured pip.
 *   - A non-land permanent is a mana source only when its own rules text says
 *     it adds mana. See `producedFromOracle` below for why that replaced the
 *     colour-identity proxy, and what it cost when it did not.
 *   - One mana per source. An untapped Sol Ring is counted as one, not two,
 *     which under-counts a fast start and never over-counts one.
 *
 * What it does not model: filter lands, cost reduction, additional costs,
 * alternative costs, X (treated as 0), and any cost that is not a mana cost.
 *
 * The assignment itself is exact rather than greedy — a maximum bipartite
 * matching between coloured pips and sources. Greedy gets it wrong on a real
 * mana base (a Hallowed Fountain grabbed for {W} when it was the only {U}
 * source left), and a playtest tool that says "you cannot cast this" when you
 * can is worse than no check at all.
 *
 * Pure: no clock, no randomness, no React.
 */

import type {
  CardInstance,
  GameAction,
  GameState,
  InstanceId,
  ManaColor,
  ManaUnit,
  PlayerId,
} from './types.ts';
import { parseManaSymbols } from './abilities/primitives/mana.ts';

export const COLORS: readonly ManaColor[] = ['W', 'U', 'B', 'R', 'G'] as const;

export interface ParsedCost {
  /** Generic component, e.g. 3 in {3}{W}{U}. */
  generic: number;
  /** One entry per coloured pip. Hybrids list every colour they accept. */
  pips: ManaColor[][];
  /** Colourless-specific pips, {C}. Paid only by a colourless-producing source. */
  colorless: number;
  /** True when the cost contains {X}. X is treated as 0. */
  hasX: boolean;
  /** Total mana value of the fixed part. */
  total: number;
}

const EMPTY_COST: ParsedCost = { generic: 0, pips: [], colorless: 0, hasX: false, total: 0 };

/**
 * Split a Scryfall cost string into payable parts.
 * Never render the input string — pass it to `ManaCost` from
 * '@/components/ui/mana-cost'. This function only reads it.
 */
export function parseCost(cost: string | null | undefined): ParsedCost {
  if (!cost) return EMPTY_COST;

  let generic = 0;
  let colorless = 0;
  let hasX = false;
  const pips: ManaColor[][] = [];

  const symbols = Array.from(cost.matchAll(/\{([^}]+)\}/g)).map(match => match[1].toUpperCase());

  for (const symbol of symbols) {
    if (symbol === 'X' || symbol === 'Y' || symbol === 'Z') {
      hasX = true;
      continue;
    }
    if (symbol === 'S') {
      // Snow mana: any source in a real game, generic here.
      generic += 1;
      continue;
    }
    if (symbol === 'C') {
      colorless += 1;
      continue;
    }
    if (/^\d+$/.test(symbol)) {
      generic += Number(symbol);
      continue;
    }
    if (symbol.includes('/')) {
      const parts = symbol.split('/');
      if (parts.includes('P')) {
        // Phyrexian: payable with 2 life, so it never blocks a cast here.
        continue;
      }
      const colorParts = parts.filter((p): p is ManaColor => (COLORS as string[]).includes(p));
      const numeric = parts.find(p => /^\d+$/.test(p));
      if (numeric && colorParts.length > 0) {
        // Monocoloured hybrid {2/W}: take the cheaper coloured half when a
        // source exists, otherwise the generic half. Modelled as a pip with a
        // generic fallback is overkill; the coloured half is the common case.
        pips.push(colorParts);
        continue;
      }
      if (colorParts.length > 0) {
        pips.push(colorParts);
        continue;
      }
      generic += 1;
      continue;
    }
    if ((COLORS as string[]).includes(symbol)) {
      pips.push([symbol as ManaColor]);
      continue;
    }
    // Anything unrecognised is charged as one generic rather than ignored.
    generic += 1;
  }

  return {
    generic,
    pips,
    colorless,
    hasX,
    total: generic + pips.length + colorless,
  };
}

/**
 * Move a cost's GENERIC component by `delta` and give the string back.
 *
 * Cost reduction in Magic reduces the generic part and never a coloured pip
 * (CR 601.2f), so {2}{U}{U} reduced by 3 is {U}{U} and not free. Increases add
 * generic, which is how commander tax and every "costs {1} more" effect work.
 *
 * Done on the SYMBOLS rather than by rebuilding from `ParsedCost`, because
 * `parseCost` folds {S}, hybrids and anything unrecognised into its generic
 * count, and re-emitting from that total would quietly turn a snow pip into a
 * plain {1} and a hybrid into a colour the caster may not be able to make.
 * Only the plain numeric symbols are touched here; every other symbol is
 * carried through exactly as written.
 *
 * `delta` clamps at the numeric generic actually present: a {1}-costing spell
 * with three reducers on the table is free, never negative.
 */
export function adjustGeneric(cost: string | null | undefined, delta: number): string {
  const base = cost ?? '';
  if (delta === 0) return base;

  const symbols = Array.from(base.matchAll(/\{([^}]+)\}/g)).map(m => m[1]);
  const numericTotal = symbols
    .filter(s => /^\d+$/.test(s))
    .reduce((sum, s) => sum + Number(s), 0);

  if (delta > 0) {
    // An increase never has to find room: it rides in front as its own symbol.
    return `{${delta}}${base}`;
  }

  let left = Math.min(-delta, numericTotal);
  if (left === 0) return base;

  const out: string[] = [];
  for (const s of symbols) {
    if (left > 0 && /^\d+$/.test(s)) {
      const value = Number(s);
      const take = Math.min(left, value);
      left -= take;
      const remaining = value - take;
      if (remaining > 0) out.push(`{${remaining}}`);
      continue;
    }
    out.push(`{${s}}`);
  }
  return out.join('');
}

/**
 * The cost string this card is actually charged.
 *
 * Normally that is the printed `manaCost`. It is not always there: Scryfall
 * stores no top-level `mana_cost` for a double-faced card, because the cost
 * belongs to a face, and our own `cards` table holds 802 rows in that shape.
 * `parseCost(undefined)` reads nothing, `planPayment` charges nothing, and the
 * spell is free — which is the owner's report, verbatim: *"just played against
 * an enemy and they placed a 5 mana card on first turn doesnt make any sense."*
 * The bot was not cheating. The engine believed the cost was zero.
 *
 * So when the parsed cost comes to nothing and the card still has a mana value,
 * the mana value is charged as generic. That is not the real cost — it loses
 * the colour requirement, so it is more permissive than the card — but it is
 * the difference between a five-drop costing five and a five-drop costing
 * nothing, which is the whole complaint.
 *
 * A card whose mana value is genuinely zero keeps costing zero. Lands never
 * reach here; `planCastFromHand` refuses them before this is asked.
 */
export function castingCostOf(card: CardInstance | null | undefined): string {
  if (!card) return '';
  const printed = card.manaCost ?? '';
  if (parseCost(printed).total > 0) return printed;
  const value = Math.max(0, Math.round(card.cmc ?? 0));
  if (value === 0) return printed;
  return `{${value}}`;
}

/* -------------------------------------------------------------------------- */
/* The pool (CR 106.4)                                                        */
/* -------------------------------------------------------------------------- */

/**
 * One player's floating mana, oldest first. Never null, never undefined.
 *
 * Read through this rather than off `state.manaPool`: the record is optional so
 * a game saved before pools existed still loads, and an absent record has to
 * read as an empty pool everywhere rather than at each call site.
 */
export function manaPoolOf(state: GameState, playerId: PlayerId): readonly ManaUnit[] {
  return state.manaPool?.[playerId] ?? [];
}

/**
 * Split a cost string into individual mana, for a pool.
 *
 * This is `parseManaSymbols` from `abilities/primitives/mana.ts` and not a
 * second parser. That one was written against the catalogue's 1,092 distinct
 * `mana_cost` values and repaired once after it scored 74.82% on them; a second
 * reader of the same strings here would need the same repairs and would
 * eventually disagree with it.
 *
 * What this adds is the pool's own question, which a cost parser never has to
 * answer: what does one symbol actually PUT in a pool.
 *
 *   - `{G}` is one green. `{C}` is one colourless.
 *   - `{2}` in "Add {2}" is two colourless. That is a real difference from
 *     PAYING, where {2} means "any two". Nothing prints "add {2}" meaning
 *     anything else.
 *   - A hybrid, phyrexian, snow or {X} symbol is a choice or an unknown, and
 *     nothing here picks for the player. It adds no mana and comes back in
 *     `unrecognised`, so the caller can say what it skipped rather than putting
 *     a colour in the pool that the card never made.
 */
export function manaUnitsFrom(
  mana: string | null | undefined,
  extra: { restriction?: string; sourceName?: string } = {}
): { units: ManaUnit[]; unrecognised: string[] } {
  const parsed = parseManaSymbols(mana ?? '');
  const units: ManaUnit[] = [];
  const unrecognised = [...parsed.unrecognised];

  const push = (color: ManaColor) => {
    units.push({
      color,
      ...(extra.restriction ? { restriction: extra.restriction } : {}),
      ...(extra.sourceName ? { sourceName: extra.sourceName } : {}),
    });
  };

  for (const symbol of parsed.symbols) {
    switch (symbol.sym) {
      case 'colored':
        push(symbol.color);
        break;
      case 'generic':
        for (let i = 0; i < symbol.amount; i++) push('C');
        break;
      default:
        // hybrid, monocolor-hybrid, phyrexian, snow, x. See the note above.
        unrecognised.push(symbol.sym);
        break;
    }
  }

  return { units, unrecognised };
}

/* -------------------------------------------------------------------------- */
/* Sources                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Something a cost can be paid from: an untapped permanent, or one mana already
 * floating in the pool.
 *
 * The two are deliberately the SAME shape, so `planPayment`'s exact matching
 * runs once over both instead of twice over each. A separate "spend the pool
 * first, then match the rest" pass would be a second payment algorithm, and the
 * two would disagree the first time a pool held {R} and the only untapped land
 * was the one Mountain a {R}{R} cost needed.
 */
export interface ManaSource {
  instanceId: InstanceId;
  name: string;
  /** Colours this source can produce. Empty means colourless only. */
  produces: ManaColor[];
  isLand: boolean;
  /**
   * Set when this "source" is a mana already in the pool. Spending it removes a
   * unit instead of tapping a permanent, and `instanceId` is a synthetic label
   * that matches no card in the game.
   */
  poolColor?: ManaColor;
}

/**
 * The synthetic `instanceId` a pool unit is offered under, and how to read the
 * index back out. One pair of functions, because a string format invented in
 * one file and parsed in another is a contract nothing checks.
 *
 * `pool:` cannot collide with a real instance id: every one of those is minted
 * by `addCard` or derived from a stack id, and none of them contain a colon
 * followed by a bare integer at position 5.
 */
export function poolSourceId(index: number): InstanceId {
  return `pool:${index}`;
}

/** -1 when this is not a pool source. */
export function poolIndexOf(instanceId: InstanceId): number {
  const match = /^pool:(\d+)$/.exec(instanceId);
  return match ? Number(match[1]) : -1;
}

export function isLand(card: CardInstance | null | undefined): boolean {
  return !!card && (card.typeLine ?? '').toLowerCase().includes('land');
}

export function isCreature(card: CardInstance | null | undefined): boolean {
  return !!card && (card.typeLine ?? '').toLowerCase().includes('creature');
}

/**
 * The type line of the face actually in play, lowercased.
 *
 * A card with two faces carries BOTH in one type line, so `Aquatic Alchemist //
 * Bubble Up` reads "creature - elemental // instant". Every check below asks
 * whether a word appears in the line, and against the whole string those
 * questions get the wrong face's answer.
 *
 * `flipped` is the only face signal on a `CardInstance`, so a card sitting
 * normally is judged on its front face.
 */
export function faceTypeLine(card: CardInstance | null | undefined): string {
  const full = (card?.typeLine ?? '').toLowerCase();
  const faces = full.split('//').map(part => part.trim()).filter(Boolean);
  if (faces.length < 2) return full;
  return card?.flipped ? faces[faces.length - 1] : faces[0];
}

export function isPermanent(card: CardInstance | null | undefined): boolean {
  const line = faceTypeLine(card);
  if (!line) return false;
  return (
    line.includes('creature') ||
    line.includes('land') ||
    line.includes('artifact') ||
    line.includes('enchantment') ||
    line.includes('planeswalker') ||
    line.includes('battle')
  );
}

/**
 * Instants and sorceries resolve to the graveyard rather than the battlefield.
 *
 * THIS IS THE ONE THAT RUNS. `moves.ts` builds the cast action and stamps
 * `resolvesTo` from here, and that value wins over `stack.ts`'s
 * `defaultResolutionZone`, which only answers when nothing set it. The two used
 * to hold separate copies of the same rule, and fixing the one in `stack.ts`
 * changed nothing at all: the playtest harness replayed 120 games and produced
 * a byte-identical 50,170 actions with the same 13 violations. `stack.ts` now
 * delegates here so there is a single answer.
 *
 * Reading the whole type line put every modal double-faced card and every
 * Adventure with a spell on the back into the graveyard on resolution: 13
 * `permanent-card-resolved-into-the-graveyard` violations across 10 of 120
 * games, with no refusal from the engine, because nothing was illegal. Only
 * wrong.
 *
 * NOT HANDLED, rather than half-implemented: an Adventure cast as its Adventure
 * half goes to EXILE under CR 715.3d. Nothing here knows which half was cast,
 * so it answers for the front face. That leaves the Adventure creature in play
 * instead of binned, and the exile route for whoever teaches the stack which
 * half it is resolving.
 */
export function resolvesToGraveyard(card: CardInstance | null | undefined): boolean {
  const line = faceTypeLine(card);
  return line.includes('instant') || line.includes('sorcery');
}

function identityColors(card: CardInstance): ManaColor[] {
  const identity = card.colorIdentity ?? [];
  return identity.filter((c): c is ManaColor => (COLORS as string[]).includes(c));
}

/**
 * What a permanent's own rules text says it adds, or null when it says nothing
 * about mana at all.
 *
 * This replaced "a non-land permanent with a colour identity is a mana rock",
 * which sounds reasonable and is catastrophic in both directions:
 *
 *   - **Every green creature was a Llanowar Elves.** Measured by driving a real
 *     game: on turn ten, holding five Forests and four Grizzly Bears, the bot
 *     reported nine untapped sources and deployed a five-drop it could not
 *     remotely afford. Its whole curve came from bodies that tap for nothing.
 *   - **Every colourless rock produced nothing.** Sol Ring, Arcane Signet, Mind
 *     Stone and Mana Crypt all have an empty colour identity, because colour
 *     identity is about deck legality rather than mana. The most played card in
 *     the format was scenery.
 *
 * Reading the text is the card saying what it does. The same approximation
 * `src/lib/play/deckSource.ts` makes for lands is made here: a conditional
 * source is counted as though its condition is met, because erring towards
 * castable is the right side to err on. A card with no oracle text loaded is
 * not a source, which is the safe answer rather than a guess.
 */
function producedFromOracle(oracle: string | undefined): ManaColor[] | null {
  if (!oracle) return null;

  const produced = new Set<ManaColor>();
  let addsMana = false;

  for (const match of oracle.matchAll(/\badds?\b([^.;\n]*)/gi)) {
    const clause = match[1] ?? '';

    if (/any\s+(?:one\s+)?colou?r|any\s+type|any\s+combination\s+of\s+colou?rs/i.test(clause)) {
      addsMana = true;
      for (const color of COLORS) produced.add(color);
      continue;
    }

    for (const symbol of clause.matchAll(/\{([WUBRGC])\}/g)) {
      addsMana = true;
      // {C} is mana, and it is not a colour. A source that makes only {C} pays
      // generic and {C}, which is exactly an empty `produces` list.
      const code = symbol[1] as ManaColor | 'C';
      if (code !== 'C') produced.add(code as ManaColor);
    }
  }

  if (!addsMana) return null;
  return COLORS.filter(color => produced.has(color));
}

/**
 * Everything a player could pay a cost from right now.
 *
 * FLOATING MANA FIRST, then untapped permanents.
 *
 * Every land, because a land that taps for nothing is rare enough that refusing
 * all of them would be worse. Plus any other permanent whose rules text says it
 * adds mana. Summoning-sick creatures are excluded — a mana dork that just
 * landed cannot tap.
 *
 * ## Why floating mana comes first, and why that is not the engine deciding
 *
 * `planPayment` walks this list in order when it has a free choice, so putting
 * the pool at the front spends mana that is about to evaporate at the end of
 * the step before it taps a permanent that will still be there. The engine was
 * already choosing which lands to tap; this is the same choice with one more
 * kind of source in it, made in the direction that never wastes anything.
 *
 * ## Restricted mana is offered to nothing
 *
 * A unit carrying a `restriction` is left out entirely. `planPayment` is handed
 * a cost string and knows nothing about what is being cast, so it cannot check
 * "only to cast creature spells" and must not pretend to. Leaving the mana
 * unspendable under-delivers Geosurge; letting it through would pay for the
 * wrong spell, and a rules engine that quietly pays a cost the player could not
 * legally pay is worse than one that makes them do it by hand. The mana is
 * still in the pool, still visible, and the log line that added it quotes the
 * restriction, so nothing about it is hidden.
 */
export function manaSourcesFor(state: GameState, playerId: PlayerId): ManaSource[] {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return [];

  const sources: ManaSource[] = [];

  manaPoolOf(state, playerId).forEach((unit, index) => {
    if (unit.restriction) return;
    sources.push({
      // Not an instance id in the game. Nothing taps it; `planPayment` reports
      // it under `spend` and `tapIds` never sees it.
      instanceId: poolSourceId(index),
      name: unit.color === 'C' ? 'colourless mana in your pool' : `{${unit.color}} in your pool`,
      produces: unit.color === 'C' ? [] : [unit.color],
      isLand: false,
      poolColor: unit.color,
    });
  });

  for (const id of player.zones.battlefield) {
    const card = state.cards[id];
    if (!card || card.tapped || card.controllerId !== playerId) continue;

    const line = (card.typeLine ?? '').toLowerCase();
    const land = line.includes('land');

    if (land) {
      /* A land's produced colours are rewritten from its oracle text upstream,
         in `deckSource.playIdentityOf`, because that is where the deck's own
         colour identity is known and Command Tower needs it. Reading the text
         again here would be a second, worse copy of that decision. */
      sources.push({
        instanceId: card.instanceId,
        name: card.name,
        produces: identityColors(card),
        isLand: true,
      });
      continue;
    }

    if (card.summoningSick && line.includes('creature')) continue;

    const produced = producedFromOracle(card.oracleText);
    if (produced === null) continue;

    sources.push({
      instanceId: card.instanceId,
      name: card.name,
      produces: produced,
      isLand: false,
    });
  }
  return sources;
}

/* -------------------------------------------------------------------------- */
/* Payment                                                                    */
/* -------------------------------------------------------------------------- */

export interface PaymentPlan {
  ok: boolean;
  /** Permanents to tap, in order. Empty when the cost is free or unpayable. */
  tapIds: InstanceId[];
  /**
   * Floating mana to take out of the pool, as colours, for a `SPEND_MANA`.
   *
   * Separate from `tapIds` because they are two different actions and merging
   * them would put a synthetic `pool:0` into a `TAP`, which the reducer would
   * quietly ignore — the cost would be charged to nobody and the spell would be
   * free. Every caller that emits taps must also emit this, and the two tests
   * for that are in `mana.test.ts`.
   */
  spend: ManaColor[];
  /** How much mana was needed. */
  required: number;
  /** How much was available. */
  available: number;
  /** Prose for a disabled control's tooltip. Empty when `ok`. */
  reason: string;
}

/**
 * Turn a chosen source list into the two halves of a payment.
 *
 * One place, because the partition is the thing a caller can get wrong: a
 * source's `poolColor` decides which half it lands in, and a caller reading
 * `tapIds` and forgetting `spend` gets a free spell rather than a crash.
 */
function splitChosen(chosen: ManaSource[]): { tapIds: InstanceId[]; spend: ManaColor[] } {
  const tapIds: InstanceId[] = [];
  const spend: ManaColor[] = [];
  for (const source of chosen) {
    if (source.poolColor) spend.push(source.poolColor);
    else tapIds.push(source.instanceId);
  }
  return { tapIds, spend };
}

/**
 * Maximum bipartite matching between coloured pips and sources, via repeated
 * augmenting paths. Small inputs — a Magic cost has a handful of pips and a
 * battlefield a few dozen sources — so the simple algorithm is the right one.
 */
function matchPips(pips: ManaColor[][], sources: ManaSource[]): number[] | null {
  const assignedTo: number[] = new Array(sources.length).fill(-1);

  const augment = (pipIndex: number, seen: boolean[]): boolean => {
    for (let s = 0; s < sources.length; s++) {
      if (seen[s]) continue;
      const source = sources[s];
      const canPay = pips[pipIndex].some(color => source.produces.indexOf(color) !== -1);
      if (!canPay) continue;
      seen[s] = true;
      if (assignedTo[s] === -1 || augment(assignedTo[s], seen)) {
        assignedTo[s] = pipIndex;
        return true;
      }
    }
    return false;
  };

  for (let p = 0; p < pips.length; p++) {
    if (!augment(p, new Array(sources.length).fill(false))) return null;
  }

  // Invert: pip index -> source index.
  const result: number[] = new Array(pips.length).fill(-1);
  for (let s = 0; s < sources.length; s++) {
    if (assignedTo[s] !== -1) result[assignedTo[s]] = s;
  }
  return result;
}

/**
 * Work out whether `cost` can be paid from `sources`, and which to tap.
 *
 * Coloured pips are matched first and exactly; {C} then takes a source with no
 * coloured production; generic takes whatever is left, spending the least
 * flexible sources first so a rainbow land is still there for the next spell.
 */
export function planPayment(
  cost: string | null | undefined,
  sources: ManaSource[]
): PaymentPlan {
  const parsed = parseCost(cost);
  const required = parsed.total;
  const refuse = (reason: string): PaymentPlan => ({
    ok: false,
    tapIds: [],
    spend: [],
    required,
    available: sources.length,
    reason,
  });

  if (required === 0) {
    return { ok: true, tapIds: [], spend: [], required: 0, available: sources.length, reason: '' };
  }

  if (sources.length < required) {
    return refuse(
      `Needs ${required} mana, ${sources.length} untapped source${sources.length === 1 ? '' : 's'} available.`
    );
  }

  const matched = matchPips(parsed.pips, sources);
  if (!matched) return refuse('No untapped source produces the colours this costs.');

  const used = new Set<number>(matched.filter(index => index >= 0));
  // Sources in the order they are spent, permanents and pool mana together.
  // `splitChosen` separates them at the end; nothing before that has to care.
  const chosen: ManaSource[] = matched.map(index => sources[index]);

  // {C}: a source that makes no colour at all.
  let colorlessLeft = parsed.colorless;
  for (let s = 0; s < sources.length && colorlessLeft > 0; s++) {
    if (used.has(s) || sources[s].produces.length > 0) continue;
    used.add(s);
    chosen.push(sources[s]);
    colorlessLeft -= 1;
  }
  if (colorlessLeft > 0) return refuse('No untapped colourless source for the {C} in this cost.');

  /*
   * Generic: floating mana first, then the least flexible permanent, so a
   * rainbow land survives for the next spell.
   *
   * Floating mana goes first because it EVAPORATES at the end of the step and a
   * land does not. Spending it here cannot cost the player a coloured pip: the
   * pips were all matched above, so nothing left in this list is needed for a
   * colour any more.
   */
  const spare: number[] = [];
  for (let s = 0; s < sources.length; s++) if (!used.has(s)) spare.push(s);
  spare.sort((a, b) => {
    const pool = Number(!sources[a].poolColor) - Number(!sources[b].poolColor);
    if (pool !== 0) return pool;
    return sources[a].produces.length - sources[b].produces.length;
  });

  let genericLeft = parsed.generic;
  for (const index of spare) {
    if (genericLeft <= 0) break;
    chosen.push(sources[index]);
    genericLeft -= 1;
  }

  if (genericLeft > 0) {
    return refuse(
      `Needs ${required} mana, ${sources.length} untapped source${sources.length === 1 ? '' : 's'} available.`
    );
  }

  return { ok: true, ...splitChosen(chosen), required, available: sources.length, reason: '' };
}

/** Convenience: can this player cast this card right now, and what does it tap? */
export function planCast(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance
): PaymentPlan {
  return planPayment(castingCostOf(card), manaSourcesFor(state, playerId));
}

/**
 * Mana available to a player, for the HUD.
 *
 * Floating mana counts, because a player looking at this number is asking what
 * they can pay for and floating mana pays for things. It is the same list
 * `planPayment` is handed, so the number and the plan cannot disagree.
 */
export function availableMana(state: GameState, playerId: PlayerId): number {
  return manaSourcesFor(state, playerId).length;
}

/**
 * The actions that spend a plan: taps first, then the pool.
 *
 * Every caller of `planPayment` needs exactly this and there is nothing to
 * choose between them, so it is written once. A caller that built the taps by
 * hand and forgot `spend` would charge nothing for the pool half of the cost.
 */
export function paymentActions(
  plan: PaymentPlan,
  playerId: PlayerId,
  at = 0
): GameAction[] {
  const actions: GameAction[] = plan.tapIds.map(id => ({ type: 'TAP' as const, instanceId: id, at }));
  if (plan.spend.length > 0) {
    actions.push({ type: 'SPEND_MANA', playerId, colors: [...plan.spend], at });
  }
  return actions;
}
