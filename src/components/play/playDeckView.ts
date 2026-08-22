/**
 * What a deck looks like on the way to a table, decided once.
 *
 * Owner: *"Then you'd have a deck selection mode too"* and *"maybe deck select
 * could be the full cards - maybe reuse from deck pages?"*
 *
 * Choosing a deck gets the same treatment as choosing a mode: a wall of decks,
 * each led by its commander card at full size, with the name, the format, the
 * EDH power score and the card count. This file is the part of that with no
 * React in it, so `node --test` can reach it and the sentences on a tile are
 * asserted rather than eyeballed.
 *
 * ---------------------------------------------------------------------------
 * A DECK THAT CANNOT BE PLAYED SAYS WHY, ON ITS OWN TILE
 * ---------------------------------------------------------------------------
 * This account holds nine saved decks with no cards in them. Hiding them makes
 * a wall that does not match the deck list and leaves the reader hunting for a
 * deck that is right there. So every deck is drawn, and the ones that cannot be
 * used in the chosen mode carry the reason.
 *
 * The reason genuinely differs by mode, which is the one place a mode is
 * allowed to change this screen:
 *
 *   goldfish, bots, playtest   an empty deck becomes a seeded commander deck,
 *                              because there is nobody opposite to mislead
 *   online                     an empty deck is refused, by this screen and by
 *                              a trigger on `game_participants`, because
 *                              somebody is sitting opposite expecting the deck
 *                              you named
 */

import type { PlayModeId } from './playModes.ts';

/** The canonical shape of a power score, structurally, so this file stays pure. */
export interface DeckPowerLike {
  score: number;
  band: string;
  bracket: number;
  drivers?: string[];
  stale?: boolean;
}

/**
 * One deck, as every play surface sees it.
 *
 * `faceCard` is a raw row from `cards` for the commander, handed straight to
 * `CardImage` so it can pick the resolution and flip a double faced commander.
 * It is deliberately untyped here: this file must not import a card type that
 * drags a Supabase client behind it.
 */
export interface PlayableDeck {
  id: string;
  name: string;
  /** The game core's format token. */
  format: string;
  /** The saved format, spelled the way the deck pages spell it. */
  formatLabel: string;
  colors: string[];
  cardCount: number;
  commanderName: string | null;
  faceCard: unknown | null;
  power: DeckPowerLike | null;
}

export interface Playability {
  /** False only when the mode genuinely cannot deal this deck. */
  playable: boolean;
  /** Why, in one sentence, or null when there is nothing to say. */
  note: string | null;
}

/**
 * Whether a deck can be dealt in a mode, and what to print on its tile.
 *
 * The empty case is the only one this can answer honestly today. Format
 * legality is a separate, real question, and it is answered by
 * `deck.power.legality` on the detail panel rather than guessed at here.
 */
export function deckPlayability(deck: PlayableDeck, mode: PlayModeId): Playability {
  if (deck.cardCount > 0) return { playable: true, note: null };

  if (mode === 'online') {
    return {
      playable: false,
      note: 'No cards in it yet. Online needs a real list, because somebody is sitting opposite.',
    };
  }

  return {
    playable: true,
    note: 'No cards in it yet, so a seeded commander deck stands in for this seat.',
  };
}

/** The card count line, in words rather than a bare number. */
export function cardCountLine(deck: PlayableDeck): string {
  if (deck.cardCount === 0) return 'No cards recorded';
  return `${deck.cardCount} card${deck.cardCount === 1 ? '' : 's'}`;
}

/**
 * What the deck is trying to do, taken from the power engine's own drivers.
 *
 * Nothing is invented here. `drivers` are the subscores that scored highest
 * with the measurement attached, written by the engine, so a deck with no
 * stored score gets no sentence rather than a made up one.
 */
export function deckIntent(deck: PlayableDeck): string | null {
  const drivers = deck.power?.drivers ?? [];
  if (drivers.length === 0) return null;
  return drivers.slice(0, 2).join('. ');
}

/**
 * The deck a step should open on: the first one that can actually be played,
 * falling back to the first one at all so a reader with nine empty decks still
 * sees a selection and its explanation.
 */
export function firstChoosableDeck(
  decks: PlayableDeck[],
  mode: PlayModeId
): PlayableDeck | null {
  if (decks.length === 0) return null;
  return decks.find(deck => deckPlayability(deck, mode).playable) ?? decks[0];
}

/**
 * Keep a chosen deck across a mode change when the new mode can still deal it,
 * and move off it when it cannot.
 *
 * Picking Atraxa for a goldfish and then switching to online should not
 * silently carry an empty deck to a table that will refuse it, and switching
 * back should not wipe a perfectly good choice.
 */
export function reconcileDeck(
  decks: PlayableDeck[],
  mode: PlayModeId,
  chosenId: string | null
): string | null {
  const chosen = chosenId ? decks.find(deck => deck.id === chosenId) ?? null : null;
  if (chosen && deckPlayability(chosen, mode).playable) return chosen.id;
  return firstChoosableDeck(decks, mode)?.id ?? null;
}

/* -------------------------------------------------------------------------- */
/* Shaping the rows                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Which card stands in for a deck with no commander: the best legend, then any
 * creature or planeswalker, then anything. Lifted verbatim from the playtest
 * picker, which is the behaviour being kept rather than re-invented.
 */
export function faceRank(typeLine: string | null, isLegendary: boolean | null): number {
  const line = (typeLine ?? '').toLowerCase();
  const creature = line.includes('creature');
  if (creature && isLegendary) return 3;
  if (creature || line.includes('planeswalker')) return 2;
  return 1;
}

/** A card row's USD price, for breaking ties between stand in faces. */
export function usdPrice(prices: unknown): number {
  const parsed = (typeof prices === 'string' ? safeParse(prices) : prices) as
    | { usd?: string | null }
    | null;
  const usd = parseFloat(parsed?.usd ?? '');
  return Number.isFinite(usd) ? usd : 0;
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** The format label the deck pages print. */
export function formatLabel(format: string | null | undefined): string {
  const raw = (format ?? '').trim();
  if (!raw) return 'Custom';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
