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
  /* The three the tagger emits, and it has emitted them all along. */
  tutor: ['tutor', 'tutor-broad', 'tutor-narrow'],
  /* `voltron` was removed from `wincon` on 2026-08-23 because every Equipment
     carries it and a Bone Saw is not a strategy. It is right HERE, because
     here the claim is only "this card suits a creature up", which is exactly
     what a Bone Saw does. */
  enhance: ['aura', 'equipment', 'voltron', 'protection'],
  /* The tag fallback for a card with no record. `protection` is the tagger's
     own word and it means the same thing, so a card the compiler could not
     read still reaches this role by the door every other role uses. */
  protection: ['protection'],
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
   * `infect` followed it out on the same day, and the fact that it took a
   * second pass to see is the point worth keeping.
   *
   * `eff:poison` was removed from `ROLE_FACETS` in `knowledge/behaviour.ts`
   * first, on the argument that one poison counter is not a win. That fixed
   * nothing on its own, because a card whose record is PARTIAL never reaches
   * that table's verdict — `cardServesRole` falls through to these words
   * instead — so Blightbelly Rat and Ichorclaw Myr walked back in through the
   * tag. Re-measured by `scratch/refute-eight.mjs` with only the facet half
   * done: Blightbelly Rat, a two-mana 1/1, was still a win condition of the
   * Meren, Kaalia and Yuriko decks. A role has TWO doors and closing one is
   * closing neither.
   *
   * `storm` stays, because a storm card ends a game on its own. What replaced
   * both words is not another word: `behaviour.ts` reads `eff:win-game`,
   * `eff:lose-game`, extra turns and extra combats straight off the ability
   * record, which is how Craterhoof Behemoth qualifies and Bone Saw does not.
   */
  wincon: ['finisher', 'wincon', 'extra-turn', 'extra-combat', 'storm'],
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
 * The three styles a player may ask for.
 *
 * A style used to BE a number: `creatures` meant a creature floor of 32,
 * `balanced` 24, `spells` 12. Those numbers are gone, and the reason is the
 * owner's:
 *
 *   "we cannot force a specific amount of creatures/artifacts/sorceries etc —
 *    every commander is completely different"
 *
 * A style is now a TILT applied to a share the commander's own record produced.
 * `build/shape.ts` owns that arithmetic; this module owns only the name, so
 * there is one place an unrecognised style is turned into a recognised one.
 */
export type DeckStyle = 'creatures' | 'balanced' | 'spells';

export const DECK_STYLES: readonly DeckStyle[] = ['creatures', 'balanced', 'spells'];

/**
 * Resolve a style name off a request body.
 *
 * Unknown names fall back to `balanced` rather than throwing, because the name
 * arrives from a request body and an unrecognised style must produce a deck
 * rather than an error. `matchedStyle` says whether it was recognised, so a
 * caller can report "you asked for X and got the default" instead of silently
 * building something else.
 */
export function styleFor(style: string | null | undefined): {
  style: DeckStyle;
  matchedStyle: boolean;
} {
  const key = (style ?? '').trim().toLowerCase();
  if (key === 'creatures' || key === 'balanced' || key === 'spells') {
    return { style: key, matchedStyle: true };
  }
  return { style: 'balanced', matchedStyle: false };
}

/**
 * The yardstick for grading a deck NOBODY DERIVED A SHAPE FOR.
 *
 * READ THE NAME BEFORE USING THIS. It is not what the generator builds to any
 * more, and putting it back there would undo the whole of `build/shape.ts`.
 * These numbers exist for the other half of the engine: `power/subscores.ts`
 * grading a list the user typed in, and the add-a-card panel measuring a deck
 * that already exists. Both are handed a pile of cards with no legal pool to
 * measure against and often no commander record to read, so "how much ramp is
 * enough" has no derivable answer there, and a stated convention is the honest
 * substitute for one.
 *
 * They are DECLARED POLICY and conventional — the numbers a deck-building
 * article gives — and the *gap* reported against them is real, because it is
 * counted off the deck's own cards. Anything that CAN derive a shape must,
 * through `deriveDeckShape`, and must not read this.
 *
 * `creature` is 0 and stays 0. There was never a defensible universal creature
 * count, which is the whole of what this change is about, and a deck with no
 * creatures is not short of any.
 *
 * Non-commander formats run 60 cards, so the numbers scale in `roleTargetsFor`.
 */
export const YARDSTICK_WHEN_NO_SHAPE_WAS_DERIVED: Readonly<Record<Role, number>> = {
  ramp: 10,
  draw: 10,
  removal: 8,
  interaction: 4,
  /* Two. The yardstick is only reached when no shape could be derived, and a
     deck that has never been read still wants to be told it has none. */
  tutor: 2,
  /* Two, so a deck that has never been read still reaches for the protection
     every commander wants. A voltron commander asks for many more through its
     own plan, and the shape derivation is what answers that. */
  enhance: 2,
  /* Two, and it is the least arguable number in this table. A Commander deck
     that runs no way at all to answer a removal spell aimed at its commander
     is a deck that loses to one card, and Swiftfoot Boots is the twelfth most
     played card in the format for that reason. */
  protection: 2,
  wincon: 3,
  land: 36,
  creature: 0,
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
 * Targets for a format, scaled from the declared yardstick.
 *
 * FOR GRADING A DECK THAT ALREADY EXISTS. The generator does not call this any
 * more — it calls `deriveDeckShape`, which reads the commander instead. See
 * {@link YARDSTICK_WHEN_NO_SHAPE_WAS_DERIVED} for why the yardstick still has
 * to exist and where it is allowed.
 *
 * Commander is singleton and 100 cards; a 60-card constructed deck needs
 * proportionally fewer of everything, so the numbers scale by deck size and
 * round to the nearest card.
 *
 * The `style` parameter went with the creature floor it used to pick. An
 * explicit override still wins, because an explicit number is a caller who
 * knows what they want.
 */
export function roleTargetsFor(
  format: string,
  overrides?: Partial<Record<Role, number>>
): Record<Role, number> {
  const commanderish = isCommanderFormat(format);
  const scale = commanderish ? 1 : CONSTRUCTED_DECK_SIZE / COMMANDER_DECK_SIZE;

  const out = {} as Record<Role, number>;
  for (const role of ROLES) {
    out[role] = Math.round(YARDSTICK_WHEN_NO_SHAPE_WAS_DERIVED[role] * scale);
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
