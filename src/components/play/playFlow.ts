/**
 * Mode, then deck, then the table.
 *
 * The owner's second reference is a character select screen, and it is the
 * better one because it is a whole flow rather than one card: a step label and
 * a big title, a breadcrumb of the choices made so far, the grid of options,
 * the large render of what is selected, the detail panel beside it, back
 * bottom left and the next step bottom right.
 *
 * That pattern is carried across every step of every mode, because it is what
 * makes four modes feel like one product. Online adds seats and other people to
 * the last step. It does not restart the flow and it does not get its own deck
 * picker.
 *
 * Pure, so `node --test` reads it and the copy is asserted as whole strings.
 */

import { modeOf, type PlayModeId } from './playModes.ts';

export type PlayStepId = 'mode' | 'deck' | 'table';

export const PLAY_STEPS: readonly PlayStepId[] = ['mode', 'deck', 'table'];

/** `STEP TWO`, spelled out. A numeral here reads as a form field. */
const ORDINALS: Record<PlayStepId, string> = {
  mode: 'Step one',
  deck: 'Step two',
  table: 'Step three',
};

export interface StepHeading {
  /** The small label above the title. */
  label: string;
  /** The big display title. */
  title: string;
  /** One line under it, or null. */
  note: string | null;
}

/**
 * What a step calls itself.
 *
 * The last step is the one that differs, and only in its words: for three of
 * the modes you are sitting down at a table you are about to deal, and for
 * online you are finding one that other people are already at.
 */
export function headingFor(step: PlayStepId, mode: PlayModeId | null): StepHeading {
  if (step === 'mode') {
    return {
      label: ORDINALS.mode,
      title: 'Choose a mode',
      note: 'Four ways to play the same game. The difference is who is sitting opposite you.',
    };
  }

  if (step === 'deck') {
    return {
      label: ORDINALS.deck,
      title: 'Choose your deck',
      note:
        mode === 'playtest'
          ? 'This is the deck in the first seat. The others are chosen at the table.'
          : 'The commander is the whole card, exactly as it is printed.',
    };
  }

  if (mode === 'online') {
    return {
      label: ORDINALS.table,
      title: 'Find a table',
      note: 'Open one and send the link, or sit down at one somebody is waiting at.',
    };
  }

  if (mode === 'playtest') {
    return {
      label: ORDINALS.table,
      title: 'Fill the seats',
      note: 'Two to four decks, all of them played for you.',
    };
  }

  if (mode === 'goldfish') {
    return {
      label: ORDINALS.table,
      title: 'Your seat',
      note: 'One seat, your surface, and a seed you can come back to.',
    };
  }

  return {
    label: ORDINALS.table,
    title: 'Fill the seats',
    note: 'Choose who sits opposite you, and how hard they push.',
  };
}

/* -------------------------------------------------------------------------- */
/* The breadcrumb                                                             */
/* -------------------------------------------------------------------------- */

export interface Crumb {
  /** The small label. `MODE`, `DECK`, `TABLE`. */
  label: string;
  /** What was chosen, or null when it has not been chosen yet. */
  value: string | null;
  /** The step this crumb goes back to when it is clicked. */
  step: PlayStepId;
}

/** The word an unmade choice shows. Never a dash, never an empty space. */
export const UNCHOSEN = 'Not yet';

/**
 * The choices so far, always all three, so the row does not change width as
 * the reader walks the flow.
 */
export function breadcrumbFor(input: {
  mode: PlayModeId | null;
  deckName: string | null;
  tableLabel: string | null;
}): Crumb[] {
  return [
    { label: 'Mode', value: input.mode ? modeOf(input.mode).title : null, step: 'mode' },
    { label: 'Deck', value: input.deckName, step: 'deck' },
    { label: 'Table', value: input.tableLabel, step: 'table' },
  ];
}

/* -------------------------------------------------------------------------- */
/* Walking it                                                                 */
/* -------------------------------------------------------------------------- */

/** The step before this one, or null at the start. */
export function previousStep(step: PlayStepId): PlayStepId | null {
  const index = PLAY_STEPS.indexOf(step);
  return index > 0 ? PLAY_STEPS[index - 1] : null;
}

/** The step after this one, or null at the end. */
export function nextStep(step: PlayStepId): PlayStepId | null {
  const index = PLAY_STEPS.indexOf(step);
  return index >= 0 && index < PLAY_STEPS.length - 1 ? PLAY_STEPS[index + 1] : null;
}

/**
 * What the bottom right control says.
 *
 * Every step names the thing it is about to do rather than saying "Next", so
 * the reader is never pressing a button whose result they have to guess.
 */
export function forwardLabelFor(step: PlayStepId, mode: PlayModeId | null): string {
  if (step === 'mode') return 'Choose a deck';
  if (step === 'deck') {
    if (mode === 'online') return 'Find a table';
    if (mode === 'playtest') return 'Fill the seats';
    if (mode === 'goldfish') return 'Set up your seat';
    return 'Choose opponents';
  }
  return 'Start';
}

/**
 * What the start control in the page header says, given a mode and a seat
 * count. Exported rather than retyped at the header so the two cannot drift.
 */
export function startLabelFor(mode: PlayModeId, seats: number): string {
  if (mode === 'goldfish') return 'Start goldfish';
  if (mode === 'playtest') return `Watch the ${seats}-player game`;
  if (mode === 'online') return 'Open a table';
  return `Start ${seats}-player game`;
}
