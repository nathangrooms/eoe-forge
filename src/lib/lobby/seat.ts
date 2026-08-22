/**
 * What putting your deck down actually means at an online table.
 *
 * ---------------------------------------------------------------------------
 * A DECK IS PUT DOWN, NOT SELECTED
 * ---------------------------------------------------------------------------
 * At a real table you shuffle your own deck, put it down, and say you are
 * ready. That is what happens here, in that order:
 *
 *   1. the deck you picked is loaded, in full;
 *   2. `dealOwnSeat` shuffles it against a secret seed generated on this
 *      device, and hands back the commitment for that shuffle;
 *   3. the seed and the deck go into `game_seat_secrets`, whose RLS is
 *      `user_id = auth.uid()` on every command, so nobody else at the table can
 *      read them by any route;
 *   4. what is PUBLIC goes onto the seat: the deck's name, how many cards are
 *      in the library, the commanders face up, and the commitment.
 *
 * Nobody's hidden cards ever exist on anybody else's machine, because there is
 * no dealer that knows more than one deck. `secrets.ts` states that design and
 * its amendment of 20 Aug 2026 in full; this file is the part that runs it.
 *
 * ---------------------------------------------------------------------------
 * WHEN IT RUNS, AND WHY THAT MOMENT
 * ---------------------------------------------------------------------------
 * `start_online_table` refuses to start unless every seat has a deck size and
 * a `seed_commitment`. That refusal is the whole audit story: the shuffle has
 * to be fixed BEFORE the first draw, or a seat that stacked its own deck could
 * not be caught afterwards by disclosing the seed.
 *
 * So this runs the moment a deck is CHOSEN at a table, not when Ready is
 * pressed, and choosing a different deck runs it again and un-readies the seat.
 * Two reasons, and both are about the room being honest:
 *
 *   1. what a seat publishes — the commanders face up, the library size — is
 *      what everybody else in the lobby is looking at while they decide whether
 *      to sit down. Holding that back until a private tick box is pressed means
 *      the lobby shows chairs with nothing on them.
 *   2. the guarantee that matters is "committed before the game starts", and
 *      the database is what enforces it. Pressing Ready earlier or later does
 *      not change that, so tying the shuffle to it only delays the information.
 *
 * Re-picking a deck therefore re-shuffles, which is correct: a commitment that
 * did not match the deck being played would prove nothing.
 *
 * The disclosure step, where the seed is published at the end and the shuffle
 * re-derived, is NOT built yet. The commitment is recorded now because it has
 * to be recorded now, not because the check exists.
 *
 * ---------------------------------------------------------------------------
 * ONE DEAL, USED BY THE TABLE TOO
 * ---------------------------------------------------------------------------
 * `dealOwnSeat` is deterministic in (deck, secretSeed). The lobby calls it to
 * get a commitment; the table calls it again on the same two inputs to rebuild
 * the same private mapping. That is also what makes a rejoin work. There is no
 * second shuffling routine anywhere, and there must not be one: two ways to
 * shuffle is two different games.
 */

/*
 * `src/lib/game/index.ts` does not re-export `net/`, so the import is direct.
 * Deliberate on that side: the engine's public surface is the rules, and the
 * transport is opt-in. Nothing in this file writes into that folder.
 */
import { dealOwnSeat, type CardIdentity } from '@/lib/game/net';
import { loadUserDeck, type DeckSummary } from '@/lib/play/deckSource';
import type { SeatDetails } from './tables.ts';

/**
 * A secret seed.
 *
 * 48 bits from the platform CSPRNG. Big enough that guessing it is not a
 * strategy, and inside the range a JavaScript number holds exactly, which
 * matters because it travels as a Postgres `bigint` and a value that loses
 * precision on the way back would rebuild a different shuffle on a rejoin.
 */
export function newSecretSeed(): number {
  const bytes = new Uint32Array(2);
  globalThis.crypto.getRandomValues(bytes);
  // 32 bits from the first word, 16 from the second: 48 bits, always positive.
  return bytes[0] * 0x10000 + (bytes[1] & 0xffff);
}

/**
 * The public seed for a table.
 *
 * It permutes anonymous slots only, so publishing it reveals nothing about
 * anybody's deck. It is the table's seed, not a deal.
 */
export function newPublicSeed(): number {
  const bytes = new Uint32Array(1);
  globalThis.crypto.getRandomValues(bytes);
  // Postgres `integer`, so it has to stay inside 31 bits.
  return bytes[0] % 2_147_483_647;
}

/** What a card looks like once it is on a seat for everyone to see. */
function toIdentity(card: {
  cardId: string;
  name: string;
  imageUrl?: string;
  colorIdentity?: string[];
  typeLine?: string;
}): CardIdentity {
  return {
    cardId: card.cardId,
    name: card.name,
    imageUrl: card.imageUrl,
    colorIdentity: card.colorIdentity,
    typeLine: card.typeLine,
  };
}

export interface PreparedSeat extends SeatDetails {
  /** The library size published on the seat. The 99, not counting commanders. */
  deckSize: number;
}

/**
 * Load a deck, shuffle it, and produce everything a seat has to publish.
 *
 * Throws when the deck cannot be loaded. Deliberately: play mode elsewhere
 * degrades to a seeded deck and says so, which is right for a goldfish and
 * wrong here. Nobody sits down at an online table to play a deck they did not
 * choose, so the failure is reported and the seat is left as it was.
 */
export async function prepareSeat(options: {
  tableId: string;
  playerId: string;
  displayName: string;
  deck: DeckSummary;
}): Promise<PreparedSeat> {
  const loaded = await loadUserDeck(options.deck);

  const commanders = loaded.commanders.map(toIdentity);
  const library = loaded.cards.map(toIdentity);
  const secretSeed = newSecretSeed();

  const deal = dealOwnSeat({
    tableId: options.tableId,
    playerId: options.playerId as never,
    // The lobby only needs the commitment, and the commitment is scoped by
    // table and seat rather than by connection. The table builds its own dealer
    // from the same seed when the game starts.
    participantId: options.playerId,
    secretSeed,
    deck: library,
    commanders,
  });

  return {
    displayName: options.displayName,
    deckId: options.deck.id,
    deckName: loaded.name,
    // `buildSharedTable` puts exactly this many anonymous slots in the library,
    // so it must be the 99 and never the 100.
    deckSize: library.length,
    commanders,
    seedCommitment: deal.commitment,
    secretSeed,
    deck: library,
  };
}
