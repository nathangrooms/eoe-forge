/**
 * Roles: the handful of jobs a deck needs filled, expressed in real tags.
 *
 * Every tag named below was checked against `TAG_RULES` in
 * `knowledge/tagger.ts` — no role maps to a tag that does not exist, and
 * `roles.test` fails if one ever does. Both canonical names and their legacy
 * aliases are listed, because a deck row may carry either; role membership is
 * a boolean, so listing an alias beside its canonical name cannot double-count
 * the way additive tag scoring would.
 *
 * Pure. No network, no AI.
 */

import type { Role } from '../core/types.ts';
import { ROLES } from '../core/types.ts';

/**
 * Tags that mark a card as serving a role.
 *
 * A card can serve several roles at once, which is correct: Cultivate is ramp,
 * a Sol Ring is ramp, and a sweeper is removal.
 */
export const ROLE_TAGS: Readonly<Record<Role, readonly string[]>> = {
  ramp: ['ramp', 'mana-rock', 'mana-dork', 'fast-mana', 'cost-reduction', 'treasure'],
  draw: ['card-draw', 'draw'],
  removal: [
    'targeted-removal',
    'board-wipe',
    'removal',
    'removal-spot',
    'removal-sweeper',
    'land-destruction',
    'bounce',
  ],
  interaction: ['counterspell', 'protection', 'stax', 'graveyard-hate'],
  wincon: ['finisher', 'wincon', 'extra-turn', 'extra-combat', 'infect', 'storm', 'voltron'],
  land: ['land'],
};

const ROLE_TAG_SETS: Readonly<Record<Role, ReadonlySet<string>>> = (() => {
  const out = {} as Record<Role, ReadonlySet<string>>;
  for (const role of ROLES) out[role] = new Set(ROLE_TAGS[role]);
  return out;
})();

/**
 * Default role targets for a 100-card Commander deck.
 *
 * These are DECLARED POLICY, not a measurement. They are the conventional
 * deck-building targets this engine aims at, written down here so they can be
 * argued with and overridden per call, rather than buried in a scoring
 * expression. The *gap* the engine reports is real — it is measured from the
 * deck's own cards — but the target it is measured against is a choice.
 *
 * Non-commander formats run 60 cards, so the targets scale in `roleTargetsFor`.
 */
export const COMMANDER_ROLE_TARGETS: Readonly<Record<Role, number>> = {
  ramp: 10,
  draw: 10,
  removal: 8,
  interaction: 4,
  wincon: 3,
  land: 36,
};

/** Deck sizes used to scale the declared targets. */
const COMMANDER_DECK_SIZE = 100;
const CONSTRUCTED_DECK_SIZE = 60;

/** Which roles a card serves, in stable order. */
export function rolesOf(tags: readonly string[] | null | undefined): Role[] {
  if (!tags?.length) return [];
  return ROLES.filter(role => tags.some(tag => ROLE_TAG_SETS[role].has(tag)));
}

/** Does this card serve this role? */
export function servesRole(tags: readonly string[] | null | undefined, role: Role): boolean {
  if (!tags?.length) return false;
  return tags.some(tag => ROLE_TAG_SETS[role].has(tag));
}

/**
 * Targets for a format, scaled from the declared Commander policy.
 *
 * Commander is singleton and 100 cards; a 60-card constructed deck needs
 * proportionally fewer of everything, so the targets scale by deck size and
 * round to the nearest card.
 */
export function roleTargetsFor(
  format: string,
  overrides?: Partial<Record<Role, number>>
): Record<Role, number> {
  const commanderish = isCommanderFormat(format);
  const scale = commanderish ? 1 : CONSTRUCTED_DECK_SIZE / COMMANDER_DECK_SIZE;

  const out = {} as Record<Role, number>;
  for (const role of ROLES) {
    out[role] = Math.round(COMMANDER_ROLE_TARGETS[role] * scale);
  }
  if (overrides) {
    for (const role of ROLES) {
      const v = overrides[role];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[role] = v;
    }
  }
  return out;
}

/**
 * Singleton, 100-card, colour-identity-enforcing formats.
 *
 * All of these are keys that genuinely appear in `cards.legalities`.
 */
const COMMANDER_FORMATS: ReadonlySet<string> = new Set([
  'commander',
  'duel',
  'oathbreaker',
  'predh',
  'paupercommander',
  'brawl',
  'standardbrawl',
  'competitivebrawl',
]);

export function isCommanderFormat(format: string): boolean {
  return COMMANDER_FORMATS.has(format.toLowerCase());
}
