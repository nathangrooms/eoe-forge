/**
 * Measure a deck: what it is made of, and what it is short of.
 *
 * Everything here is counted from the deck's own cards. The only number that
 * is not measured is `roleTargets`, which is declared policy — see `roles.ts`.
 * Keeping the two apart matters: "you have 4 ramp" is a fact about the deck,
 * "you want 10" is an opinion this engine holds out loud.
 *
 * Pure. No network, no AI.
 */

import { signalTags } from '../knowledge/tag-signal.ts';
import type { ManaProfile } from '../playability/castability.ts';
import type { DeckCard, DeckProfile, Role } from '../core/types.ts';
import { ROLES } from '../core/types.ts';
import { roleTargetsFor, cardRole } from './roles.ts';
import { normalizeIdentity } from './query.ts';
import { hasRecord, type CommanderPlan } from '../knowledge/behaviour.ts';

export interface DeckProfileInput {
  format: string;
  /** The commander's colour identity — the ceiling for every suggestion. */
  colorIdentity: readonly string[];
  cards: readonly DeckCard[];
  roleTargets?: Partial<Record<Role, number>>;
  /**
   * The deck's mana base, so ranking can ask whether a candidate is castable.
   * Omit it and castability is simply not consulted, which is the honest
   * default: unknown is not the same as unsupported.
   */
  manaProfile?: ManaProfile | null;
  /**
   * What the commander is for, read from its ability record by
   * `planForCommander`. Passed straight through onto the profile, because the
   * profile is what `scoreCandidate` gets and the plan is a property of the
   * deck rather than of any one candidate.
   */
  commanderPlan?: CommanderPlan | null;
}

/** Does this type line describe a land? */
function isLand(typeLine: string): boolean {
  return /\bland\b/i.test(typeLine);
}

/**
 * Build the profile.
 *
 * Quantities are respected: a 60-card deck running four copies of a draw spell
 * has four draw cards, not one. Commander decks are singleton, so `quantity`
 * defaults to 1 and the two cases share one code path.
 */
export function deriveDeckProfile(input: DeckProfileInput): DeckProfile {
  const cards = input.cards ?? [];

  const tagCounts: Record<string, number> = Object.create(null);
  const roleCounts = Object.fromEntries(ROLES.map(r => [r, 0])) as Record<Role, number>;
  const ownedOracleIds = new Set<string>();

  let deckSize = 0;
  let spellCount = 0;
  let cmcTotal = 0;
  let withRecord = 0;

  for (const card of cards) {
    const qty = Math.max(1, Math.trunc(card.quantity ?? 1));
    deckSize += qty;
    if (card.oracleId) ownedOracleIds.add(card.oracleId);

    const land = isLand(card.typeLine ?? '');
    if (!land) {
      spellCount += qty;
      cmcTotal += (Number.isFinite(card.cmc) ? card.cmc : 0) * qty;
    }

    // A tag is counted once per copy, but only once per card even if the card
    // carries both a canonical tag and its alias — `seen` guards that.
    const seen = new Set<string>();
    for (const tag of card.tags ?? []) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      tagCounts[tag] = (tagCounts[tag] ?? 0) + qty;
    }

    if (hasRecord(card)) withRecord += 1;

    // The record decides where it exists, the tags where it does not. Passing
    // the whole card rather than its tags is what lets `creature` be answered
    // off the type line and `wincon` off the record instead of off `voltron`.
    for (const role of ROLES) {
      if (cardRole(card, role)) roleCounts[role] += qty;
    }
  }

  // The deck's tag profile: every distinct tag it carries, reduced to signal
  // tags (aliases and platitudes stripped) and ordered by information content.
  const profileTags = signalTags(Object.keys(tagCounts));

  return {
    format: input.format.toLowerCase(),
    colorIdentity: normalizeIdentity(input.colorIdentity),
    deckSize,
    spellCount,
    meanCmc: spellCount > 0 ? cmcTotal / spellCount : 0,
    signalTags: profileTags,
    tagCounts,
    roleCounts,
    roleTargets: roleTargetsFor(input.format, input.roleTargets),
    ownedOracleIds,
    manaProfile: input.manaProfile ?? null,
    commanderPlan: input.commanderPlan ?? null,
    facetCoverage: { withRecord, total: cards.length },
  };
}

/**
 * How short of a role the deck is, as a fraction of its target.
 *
 * 0 means "at or over target", 1 means "has none of them at all". Returning a
 * ratio rather than a raw count keeps a deck missing 6 of 10 ramp comparable
 * with one missing 2 of 3 win conditions.
 */
export function roleShortfall(profile: DeckProfile, role: Role): number {
  const target = profile.roleTargets[role] ?? 0;
  if (target <= 0) return 0;
  const have = profile.roleCounts[role] ?? 0;
  if (have >= target) return 0;
  return (target - have) / target;
}

/** Roles the deck is short of, worst first. Ties broken by name for stability. */
export function gapRoles(profile: DeckProfile): Role[] {
  return ROLES.filter(r => roleShortfall(profile, r) > 0).sort(
    (a, b) => roleShortfall(profile, b) - roleShortfall(profile, a) || a.localeCompare(b)
  );
}
