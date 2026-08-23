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
import { cardServesRole, type RoleSubject } from '../knowledge/behaviour.ts';

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
  /*
   * `voltron` was removed on 2026-08-23 and it is the largest single fix in
   * this file.
   *
   * `voltron` is carried by essentially every piece of Equipment in the
   * catalogue, so while it sat here every Equipment was a WIN CONDITION and
   * collected the full role-gap credit for being one. Measured across the four
   * test decks in `docs/design/ENGINE-PICKS.md`: all twelve win-condition slots
   * were Equipment, and Basilisk Collar was the win condition of all four
   * decks. A strategy is not a win condition, and a Bone Saw is not a strategy.
   *
   * `storm` and `infect` stay, because each names a card that ends a game on
   * its own. What replaced `voltron` is not another word: `behaviour.ts` reads
   * `eff:win-game`, `eff:lose-game`, `eff:poison`, extra turns, extra combats
   * and mass pump straight off the ability record, which is how Craterhoof
   * Behemoth qualifies and Bone Saw does not.
   */
  wincon: ['finisher', 'wincon', 'extra-turn', 'extra-combat', 'infect', 'storm'],
  land: ['land'],
  /*
   * Empty, and it has to stay empty.
   *
   * A creature is a creature because its type line says so, not because a
   * tagger recognised a word in its oracle text. `cardRole` answers this role
   * from the type line and never consults tags for it, so an entry here would
   * be a second and weaker answer to a question that already has an exact one.
   */
  creature: [],
};

const ROLE_TAG_SETS: Readonly<Record<Role, ReadonlySet<string>>> = (() => {
  const out = {} as Record<Role, ReadonlySet<string>>;
  for (const role of ROLES) out[role] = new Set(ROLE_TAGS[role]);
  return out;
})();

/**
 * How many creatures a deck wants, by the style the owner picked.
 *
 * DECLARED POLICY. The numbers are choices, so here is the arithmetic behind
 * each one rather than a bare figure to take on trust.
 *
 * A Commander deck is 99 cards besides the commander. The generator's land
 * target is 35, which leaves 64 nonland slots, and the other five quotas ask
 * for 35 of those. Creatures OVERLAP those quotas: a mana dork is ramp, a
 * Craterhoof Behemoth is a win condition, an Eternal Witness is recursion. So
 * the creature number is a FLOOR taken across the whole deck rather than a
 * sixth quota competing for slots, and `generateDeck` counts what the earlier
 * passes already picked and tops up only the difference.
 *
 *   `creatures`  32  The mode the owner means by "creature mode". Half the
 *                    nonland slots, and inside the 30 to 35 range a creature
 *                    precon runs.
 *   `balanced`   24  The default. Just over a third of the nonland slots, which
 *                    leaves the five role quotas free to be filled by the best
 *                    card rather than by the best creature.
 *   `spells`     12  A deck made of instants and sorceries still needs bodies
 *                    to block with and something to carry the win. Twelve is
 *                    the floor at which a deck can still defend itself.
 *
 * A style changes this ONE number and nothing else, so picking one cannot
 * quietly reshape the rest of the deck.
 */
export const CREATURE_TARGETS = {
  creatures: 32,
  balanced: 24,
  spells: 12,
} as const;

/** The deck styles a caller may ask for. */
export type DeckStyle = keyof typeof CREATURE_TARGETS;

export const DECK_STYLES: readonly DeckStyle[] = ['creatures', 'balanced', 'spells'];

/**
 * The creature floor for a style name.
 *
 * Unknown names fall back to `balanced` rather than throwing, because the name
 * arrives from a request body and an unrecognised style must produce a deck
 * rather than an error. `matchedStyle` says whether it was recognised, so a
 * caller can report "you asked for X and got the default" instead of silently
 * building something else.
 */
export function creatureTargetFor(style: string | null | undefined): {
  target: number;
  style: DeckStyle;
  matchedStyle: boolean;
} {
  const key = (style ?? '').trim().toLowerCase();
  if (key in CREATURE_TARGETS) {
    return { target: CREATURE_TARGETS[key as DeckStyle], style: key as DeckStyle, matchedStyle: true };
  }
  return { target: CREATURE_TARGETS.balanced, style: 'balanced', matchedStyle: false };
}

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
  creature: CREATURE_TARGETS.balanced,
};

/** Deck sizes used to scale the declared targets. */
const COMMANDER_DECK_SIZE = 100;
const CONSTRUCTED_DECK_SIZE = 60;

/** Which roles a card serves, in stable order. */
export function rolesOf(tags: readonly string[] | null | undefined): Role[] {
  if (!tags?.length) return [];
  return ROLES.filter(role => tags.some(tag => ROLE_TAG_SETS[role].has(tag)));
}

/**
 * Does this card serve this role, judged by its TAGS alone?
 *
 * Signature unchanged, because `power/subscores.ts` scores a deck the user
 * typed in and genuinely has nothing but tags to work from. It is no longer
 * what the profile, the ranker or the generator call.
 */
export function servesRole(tags: readonly string[] | null | undefined, role: Role): boolean {
  if (!tags?.length) return false;
  return tags.some(tag => ROLE_TAG_SETS[role].has(tag));
}

/**
 * Does this card serve this role, judged by its RECORD where it has one?
 *
 * The one entry point the profile, the ranker and the generator all use, so
 * "is this ramp" has a single answer and the fallback to tags happens in one
 * place where it can be counted. `behaviour.ts` owns the rule; this wrapper
 * exists only to hand it the tag fallback, which keeps the two modules from
 * importing each other in a cycle at run time.
 */
export function cardRole(subject: RoleSubject, role: Role): boolean {
  return cardServesRole(subject, role, servesRole);
}

/**
 * Targets for a format, scaled from the declared Commander policy.
 *
 * Commander is singleton and 100 cards; a 60-card constructed deck needs
 * proportionally fewer of everything, so the targets scale by deck size and
 * round to the nearest card.
 *
 * `style` picks the creature floor, and it is taken here rather than applied by
 * the caller so it goes through the SAME scaling as every other target. A
 * caller that set `creature` itself would ask a 60-card deck for 32 creatures
 * out of 60, which is a different deck from the 32 out of 99 the style means.
 *
 * An explicit `overrides.creature` still wins over the style, because an
 * explicit number is a caller who knows what they want.
 */
export function roleTargetsFor(
  format: string,
  overrides?: Partial<Record<Role, number>>,
  style?: string | null
): Record<Role, number> {
  const commanderish = isCommanderFormat(format);
  const scale = commanderish ? 1 : CONSTRUCTED_DECK_SIZE / COMMANDER_DECK_SIZE;

  const out = {} as Record<Role, number>;
  for (const role of ROLES) {
    out[role] = Math.round(COMMANDER_ROLE_TARGETS[role] * scale);
  }
  if (style != null) {
    out.creature = Math.round(creatureTargetFor(style).target * scale);
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
