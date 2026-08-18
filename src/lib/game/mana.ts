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
 *   - Mana rocks and dorks are included when their type line is Artifact or
 *     Creature and their oracle-free proxy — colour identity — is non-empty;
 *     an untapped Sol Ring is *not* counted as two, because this module has no
 *     oracle text to read.
 *
 * What it does not model: filter lands, cost reduction, additional costs,
 * alternative costs, X (treated as 0), and any ability that needs oracle text.
 *
 * The assignment itself is exact rather than greedy — a maximum bipartite
 * matching between coloured pips and sources. Greedy gets it wrong on a real
 * mana base (a Hallowed Fountain grabbed for {W} when it was the only {U}
 * source left), and a playtest tool that says "you cannot cast this" when you
 * can is worse than no check at all.
 *
 * Pure: no clock, no randomness, no React.
 */

import type { CardInstance, GameState, InstanceId, ManaColor, PlayerId } from './types';

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

export function isPermanent(card: CardInstance | null | undefined): boolean {
  const line = (card?.typeLine ?? '').toLowerCase();
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

/** Instants and sorceries resolve to the graveyard rather than the battlefield. */
export function resolvesToGraveyard(card: CardInstance | null | undefined): boolean {
  const line = (card?.typeLine ?? '').toLowerCase();
  return line.includes('instant') || line.includes('sorcery');
}

function producedColors(card: CardInstance): ManaColor[] {
  const identity = card.colorIdentity ?? [];
  return identity.filter((c): c is ManaColor => (COLORS as string[]).includes(c));
}

/**
 * Untapped permanents a player controls that this module is willing to call a
 * mana source: every land, plus artifacts and creatures with a colour identity
 * (rocks and dorks). Summoning-sick creatures are excluded — a mana dork that
 * just landed cannot tap.
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
    const rock = !land && (line.includes('artifact') || line.includes('creature'));

    if (!land && !rock) continue;
    if (rock && card.summoningSick && line.includes('creature')) continue;
    if (rock && producedColors(card).length === 0) continue;

    sources.push({
      instanceId: card.instanceId,
      name: card.name,
      produces: producedColors(card),
      isLand: land,
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
  return planPayment(card.manaCost, manaSourcesFor(state, playerId));
}

/** Untapped mana available to a player, for the HUD. */
export function availableMana(state: GameState, playerId: PlayerId): number {
  return manaSourcesFor(state, playerId).length;
}
