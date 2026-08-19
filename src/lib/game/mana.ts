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

import type { CardInstance, GameState, InstanceId, ManaColor, PlayerId } from './types.ts';

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
/* Sources                                                                    */
/* -------------------------------------------------------------------------- */

export interface ManaSource {
  instanceId: InstanceId;
  name: string;
  /** Colours this source can produce. Empty means colourless only. */
  produces: ManaColor[];
  isLand: boolean;
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
 * Untapped permanents a player controls that this module is willing to call a
 * mana source.
 *
 * Every land, because a land that taps for nothing is rare enough that
 * refusing all of them would be worse. Plus any other permanent whose rules
 * text says it adds mana. Summoning-sick creatures are excluded — a mana dork
 * that just landed cannot tap.
 */
export function manaSourcesFor(state: GameState, playerId: PlayerId): ManaSource[] {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return [];

  const sources: ManaSource[] = [];
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
  /** Sources to tap, in order. Empty when the cost is free or unpayable. */
  tapIds: InstanceId[];
  /** How much mana was needed. */
  required: number;
  /** How much was available. */
  available: number;
  /** Prose for a disabled control's tooltip. Empty when `ok`. */
  reason: string;
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

  if (required === 0) {
    return { ok: true, tapIds: [], required: 0, available: sources.length, reason: '' };
  }

  if (sources.length < required) {
    return {
      ok: false,
      tapIds: [],
      required,
      available: sources.length,
      reason: `Needs ${required} mana, ${sources.length} untapped source${sources.length === 1 ? '' : 's'} available.`,
    };
  }

  const matched = matchPips(parsed.pips, sources);
  if (!matched) {
    return {
      ok: false,
      tapIds: [],
      required,
      available: sources.length,
      reason: 'No untapped source produces the colours this costs.',
    };
  }

  const used = new Set<number>(matched.filter(index => index >= 0));
  const tapIds: InstanceId[] = matched.map(index => sources[index].instanceId);

  // {C}: a source that makes no colour at all.
  let colorlessLeft = parsed.colorless;
  for (let s = 0; s < sources.length && colorlessLeft > 0; s++) {
    if (used.has(s) || sources[s].produces.length > 0) continue;
    used.add(s);
    tapIds.push(sources[s].instanceId);
    colorlessLeft -= 1;
  }
  if (colorlessLeft > 0) {
    return {
      ok: false,
      tapIds: [],
      required,
      available: sources.length,
      reason: 'No untapped colourless source for the {C} in this cost.',
    };
  }

  // Generic: least flexible first, so the rainbow lands survive for later.
  const spare: number[] = [];
  for (let s = 0; s < sources.length; s++) if (!used.has(s)) spare.push(s);
  spare.sort((a, b) => sources[a].produces.length - sources[b].produces.length);

  let genericLeft = parsed.generic;
  for (const index of spare) {
    if (genericLeft <= 0) break;
    tapIds.push(sources[index].instanceId);
    genericLeft -= 1;
  }

  if (genericLeft > 0) {
    return {
      ok: false,
      tapIds: [],
      required,
      available: sources.length,
      reason: `Needs ${required} mana, ${sources.length} untapped source${sources.length === 1 ? '' : 's'} available.`,
    };
  }

  return { ok: true, tapIds, required, available: sources.length, reason: '' };
}

/** Convenience: can this player cast this card right now, and what does it tap? */
export function planCast(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance
): PaymentPlan {
  return planPayment(castingCostOf(card), manaSourcesFor(state, playerId));
}

/** Untapped mana available to a player, for the HUD. */
export function availableMana(state: GameState, playerId: PlayerId): number {
  return manaSourcesFor(state, playerId).length;
}
