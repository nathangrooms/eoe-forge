/**
 * What a friend is told you are doing.
 *
 * This string is shown to other people verbatim, under their friend's name, so
 * it is written the way a player would say it out loud and not the way the code
 * thinks about itself. "step=deck mode=bots" is a fact about a state machine.
 * "picking a deck" is a fact about a person.
 *
 * It is deliberately coarse. A friends list needs to answer "is Dave about, and
 * is he in the middle of something", and nothing finer than that is anybody's
 * business. There is no card, no life total, no opponent and no timing here,
 * and the only place a table is named is when somebody is sitting at one and
 * could be joined.
 *
 * Pure and importing nothing, so `node --test` reads it and the words are
 * asserted as whole strings.
 */

export type PresenceStep = 'mode' | 'deck' | 'table' | 'playing' | 'lobby';

export type PresenceMode = 'online' | 'bots' | 'goldfish' | 'playtest' | null;

/** What somebody is up to, in a player's words. Never longer than a phrase. */
export function presenceDoing(step: PresenceStep, mode: PresenceMode): string {
  if (step === 'lobby') return 'looking for a game';

  if (step === 'playing') {
    switch (mode) {
      case 'bots':
        return 'playing against bots';
      case 'goldfish':
        return 'goldfishing a deck';
      case 'playtest':
        return 'watching a playtest';
      case 'online':
        return 'in a game';
      default:
        return 'in a game';
    }
  }

  if (step === 'deck') return 'picking a deck';
  if (step === 'table') return 'setting up a game';
  return 'choosing what to play';
}
