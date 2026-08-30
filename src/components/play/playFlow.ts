/**
 * Mode, then deck, then the table.
 *
 * The owner's second reference is a character select screen, and it is the
 * better one because it is a whole flow rather than one card: a step label and
 * a big title, a breadcrumb of the choices made so far, the grid of options,
 * the large render of what is selected, the detail panel beside it, back on the
 * left and the next step on the right.
 *
 * That pattern is carried across every step of every mode, because it is what
 * makes four modes feel like one product. Online adds seats and other people to
 * the last step. It does not restart the flow and it does not get its own deck
 * picker.
 *
 * ---------------------------------------------------------------------------
 * A MODE HAS AS MANY STEPS AS IT HAS DECISIONS, AND IT SAYS HOW MANY
 * ---------------------------------------------------------------------------
 * Owner, 29 Aug 2026: the load-in is *"super confusing"*.
 *
 * Two things measured on 30 Aug 2026 at 1600 x 1000, walking it as a player:
 *
 *  1. The label said STEP THREE and nothing on the page said three of WHAT.
 *     Three of three, or three of five? The reader cannot tell how much is
 *     left, on a screen whose whole job is getting them to a game.
 *  2. Goldfish had three steps and two decisions. Its third screen held one
 *     chair, a seed and a wallpaper picker: 1,645px of page, of which the
 *     playmat catalogue was 750px, for a mode whose own door says "nothing
 *     blocks and nothing attacks back". There was nothing on it to decide.
 *
 * So the count is now the truth and it is printed: `stepLabel` says "Step two
 * of three", and `stepsFor` gives goldfish two steps because goldfish has two
 * decisions. A mode with no table to fill does not get a screen for filling it.
 *
 * Pure, so `node --test` reads it and the copy is asserted as whole strings.
 */

import { modeOf, type PlayModeId } from './playModes.ts';

export type PlayStepId = 'mode' | 'deck' | 'table';

export const PLAY_STEPS: readonly PlayStepId[] = ['mode', 'deck', 'table'];

/** Goldfish is one seat, so it has nothing to fill and no screen for filling it. */
const GOLDFISH_STEPS: readonly PlayStepId[] = ['mode', 'deck'];

/**
 * The steps this mode actually walks.
 *
 * With no mode chosen the answer is the long one, because the reader is on step
 * one and has not yet told us which flow they are in.
 */
export function stepsFor(mode: PlayModeId | null): readonly PlayStepId[] {
  return mode === 'goldfish' ? GOLDFISH_STEPS : PLAY_STEPS;
}

/** True when this step is the one that starts the game. */
export function isLastStep(step: PlayStepId, mode: PlayModeId | null): boolean {
  const steps = stepsFor(mode);
  return steps[steps.length - 1] === step;
}

/** Spelled out. A numeral in a step label reads as a form field. */
const ORDINALS = ['one', 'two', 'three', 'four'];

/**
 * `Step two of three`.
 *
 * Both halves matter. Which one you are on answers "where am I", and how many
 * there are answers "how much of this is left", which is the question a person
 * who came here to play a game is actually asking. On step one no mode has been
 * chosen, so the total is not known yet and is not claimed.
 */
export function stepLabel(step: PlayStepId, mode: PlayModeId | null): string {
  const steps = stepsFor(mode);
  const index = steps.indexOf(step);
  const position = ORDINALS[index] ?? ORDINALS[0];
  if (!mode) return `Step ${position}`;
  return `Step ${position} of ${ORDINALS[steps.length - 1]}`;
}

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
 * The last step is the one that differs, and only in its words: for two of the
 * modes you are sitting down at a table you are about to deal, and for online
 * you are finding one that other people are already at.
 */
export function headingFor(step: PlayStepId, mode: PlayModeId | null): StepHeading {
  const label = stepLabel(step, mode);

  if (step === 'mode') {
    return {
      label,
      title: 'Choose a mode',
      note: 'Four ways to play the same game. The difference is who is sitting opposite you.',
    };
  }

  if (step === 'deck') {
    return {
      label,
      title: 'Choose your deck',
      note:
        mode === 'playtest'
          ? 'This is the deck in the first seat. The others are chosen at the table.'
          : mode === 'goldfish'
            ? 'Pick a deck and deal. Nobody is sitting opposite, so there is nothing else to set up.'
            : 'The commander is the whole card, exactly as it is printed.',
    };
  }

  if (mode === 'online') {
    return {
      label,
      title: 'Find a table',
      note: 'Open one and send the link, or sit down at one somebody is waiting at.',
    };
  }

  if (mode === 'playtest') {
    return {
      label,
      title: 'Fill the seats',
      note: 'Two to four decks, all of them played for you.',
    };
  }

  return {
    label,
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

const CRUMB_LABELS: Record<PlayStepId, string> = {
  mode: 'Mode',
  deck: 'Deck',
  table: 'Table',
};

/**
 * The choices so far, one crumb per step this mode has.
 *
 * A crumb for a step the mode never visits is a choice the reader is being told
 * they have not made yet and can never make. Goldfish carried a permanent
 * "TABLE Not yet" for exactly that reason, and it is gone.
 */
export function breadcrumbFor(input: {
  mode: PlayModeId | null;
  deckName: string | null;
  tableLabel: string | null;
}): Crumb[] {
  const values: Record<PlayStepId, string | null> = {
    mode: input.mode ? modeOf(input.mode).title : null,
    deck: input.deckName,
    table: input.tableLabel,
  };
  return stepsFor(input.mode).map(step => ({
    label: CRUMB_LABELS[step],
    value: values[step],
    step,
  }));
}

/* -------------------------------------------------------------------------- */
/* Walking it                                                                 */
/* -------------------------------------------------------------------------- */

/** The step before this one in this mode, or null at the start. */
export function previousStep(step: PlayStepId, mode: PlayModeId | null): PlayStepId | null {
  const steps = stepsFor(mode);
  const index = steps.indexOf(step);
  return index > 0 ? steps[index - 1] : null;
}

/** The step after this one in this mode, or null at the end. */
export function nextStep(step: PlayStepId, mode: PlayModeId | null): PlayStepId | null {
  const steps = stepsFor(mode);
  const index = steps.indexOf(step);
  return index >= 0 && index < steps.length - 1 ? steps[index + 1] : null;
}

/**
 * A step read out of the URL, made safe.
 *
 * `step` is in the address bar so back and forward move between steps rather
 * than off the page, and so a link can point at one. That means any string can
 * arrive here, including a step the chosen mode does not have: `?mode=goldfish
 * &step=table` names a screen goldfish no longer owns, and it lands on the last
 * screen goldfish does own rather than on nothing.
 */
export function stepFromUrl(raw: string | null, mode: PlayModeId | null): PlayStepId {
  if (!mode) return 'mode';
  const steps = stepsFor(mode);
  const asked = (raw ?? '') as PlayStepId;
  if (steps.includes(asked)) return asked;
  /* A mode in the URL and no step named is the link a deck tile sends: it has
     picked the mode for you and the deck is the next thing to choose. */
  return 'deck';
}

/**
 * What the control on the right says on a step that is not the last one.
 *
 * Every step names the thing it is about to do rather than saying "Next", so
 * the reader is never pressing a button whose result they have to guess. On the
 * last step of a mode this is not used at all: `startLabelFor` is, because the
 * button deals a game and should say so.
 */
export function forwardLabelFor(step: PlayStepId, mode: PlayModeId | null): string {
  if (step === 'mode') return 'Choose a deck';
  if (step === 'deck') {
    if (mode === 'online') return 'Find a table';
    if (mode === 'playtest') return 'Fill the seats';
    return 'Choose opponents';
  }
  return 'Start';
}

/**
 * What the control says on the last step, given a mode and a seat count.
 *
 * ---------------------------------------------------------------------------
 * ONE CONTROL, IN ONE PLACE, ON EVERY STEP
 * ---------------------------------------------------------------------------
 * Measured 30 Aug 2026 at 1600 x 1000: the way on sat at y=216 in the step bar
 * on steps one and two, and then on step three it was not there at all and a
 * different button, "Start 2-player game", was at y=108 in the page header. On
 * a 390px phone it was worse: step three's start control was at y=170, ABOVE
 * the back control at y=278, so the last screen of the flow read bottom to top.
 *
 * The reader had to relearn where "go" is on the screen that matters most. The
 * start control is the forward control now, in the step bar, top right, where
 * it has been on every other step all along.
 */
export function startLabelFor(mode: PlayModeId, seats: number): string {
  if (mode === 'goldfish') return 'Start goldfish';
  if (mode === 'playtest') return `Watch the ${seats}-player game`;
  if (mode === 'online') return 'Open a table';
  return `Start ${seats}-player game`;
}
