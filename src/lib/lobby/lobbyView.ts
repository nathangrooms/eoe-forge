/**
 * The lobby's decisions, with nothing attached to them.
 *
 * Everything in this file is a pure function of data the lobby already holds:
 * how long a table has been waiting, whether this account may sit down, what
 * the join button should say, and what a Postgres error actually means to the
 * person reading it. It imports nothing, which is the point — `node --test`
 * can reach it, and `lobbyView.test.ts` asserts the copy as whole strings
 * because the copy IS the feature in most of these cases.
 *
 * The rule this file exists to keep: a refusal must always say what to do
 * next. "You cannot join" is a dead end. "You need a deck with cards in it,
 * here is the button that makes one" is not.
 */

import type { OpenTable, RoomSeat, TableRoom } from './types.ts';

/* -------------------------------------------------------------------------- */
/* How long it has been waiting                                               */
/* -------------------------------------------------------------------------- */

/**
 * A table's wait, in the words somebody would say out loud.
 *
 * Rounded down and coarse on purpose. "Waiting 3 minutes" and "waiting 3
 * minutes and 41 seconds" tell a player the same thing, and only one of them
 * re-renders every second.
 */
export function waitedFor(since: string | number | Date, now: number = Date.now()): string {
  const started = since instanceof Date ? since.getTime() : new Date(since).getTime();
  if (!Number.isFinite(started)) return 'just now';

  const seconds = Math.max(0, Math.floor((now - started) / 1000));
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour' : `${hours} hours`;

  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

/**
 * How long a lobby has left before the sweep takes it.
 *
 * The number is in the migration and it is 30 minutes of no activity. It is
 * repeated here rather than fetched because a countdown that needs a round trip
 * is worse than a countdown that is a minute out of date, and both halves are
 * named the same thing so a change to one is findable from the other.
 */
export const LOBBY_IDLE_MINUTES = 30;

/** True once a table is close enough to the sweep to be worth warning about. */
export function isGoingStale(
  lastActivityAt: string | number | Date,
  now: number = Date.now()
): boolean {
  const last = lastActivityAt instanceof Date
    ? lastActivityAt.getTime()
    : new Date(lastActivityAt).getTime();
  if (!Number.isFinite(last)) return false;
  const idleMinutes = (now - last) / 60000;
  return idleMinutes >= LOBBY_IDLE_MINUTES - 5;
}

/* -------------------------------------------------------------------------- */
/* The entry rule                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The owner's rule, in one place: signed in, and holding at least one deck
 * with cards in it.
 *
 * It is checked here so the lobby can say it plainly before anybody picks a
 * table, and it is checked again by a trigger on `game_participants` so it
 * holds whatever the client does. This half exists for the sentence and the
 * button; that half exists for the guarantee.
 */
export type EntryVerdict =
  | { ok: true }
  | { ok: false; reason: 'signed-out' | 'no-decks' | 'empty-decks'; title: string; body: string; actionLabel: string; actionHref: string };

export interface EntryInput {
  signedIn: boolean;
  /** Every deck on the account, with how many cards each holds. */
  decks: Array<{ cardCount?: number | null }>;
}

export function entryVerdict(input: EntryInput): EntryVerdict {
  if (!input.signedIn) {
    return {
      ok: false,
      reason: 'signed-out',
      title: 'Sign in to play online',
      body: 'Online tables are tied to your account, so other players know who they are sitting with.',
      actionLabel: 'Sign in',
      actionHref: '/login',
    };
  }

  if (input.decks.length === 0) {
    return {
      ok: false,
      reason: 'no-decks',
      title: 'You need a deck first',
      body: 'Online play needs one deck loaded in. Build one, import a list you already have, or start from a precon.',
      actionLabel: 'Build a deck',
      actionHref: '/decks/new',
    };
  }

  if (!input.decks.some(deck => (deck.cardCount ?? 0) > 0)) {
    return {
      ok: false,
      reason: 'empty-decks',
      title: 'Your decks are empty',
      body: 'You have decks saved but none of them have any cards in them yet. Add cards to one and it will show up here.',
      actionLabel: 'Open my decks',
      actionHref: '/decks',
    };
  }

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* What to call somebody                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The name to put on a seat before the player changes it.
 *
 * It cuts at the '@' for the same reason `safe_display_name` does in the
 * database: `profiles.username` is world readable, two of them on this project
 * are raw email addresses, and a lobby is exactly the surface that would
 * publish one to every signed-in account. The database applies that rule
 * whatever a client sends, so this exists only so the box a player is shown
 * already holds what will actually be stored.
 */
export function preferredName(account: {
  username?: string | null;
  email?: string | null;
}): string {
  const raw = (account.username ?? '').trim() || (account.email ?? '').trim();
  const cut = raw.split('@')[0].trim().slice(0, 24);
  return cut || 'Player';
}

/* -------------------------------------------------------------------------- */
/* What a table row says                                                      */
/* -------------------------------------------------------------------------- */

export type TableAction = 'rejoin' | 'join' | 'full';

export function actionForTable(table: OpenTable): TableAction {
  if (table.seated) return 'rejoin';
  if (table.seatsTaken >= table.maxSeats) return 'full';
  return 'join';
}

export function actionLabel(action: TableAction): string {
  if (action === 'rejoin') return 'Back to your seat';
  if (action === 'full') return 'Full';
  return 'Take a seat';
}

/** "2 of 4 seats" — plain, and it never says "0 of 4" because a table always has a host. */
export function seatsLine(table: OpenTable): string {
  return `${table.seatsTaken} of ${table.maxSeats} seats`;
}

/* -------------------------------------------------------------------------- */
/* The room                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Seats laid out by seat number, with the empty ones present as nulls.
 *
 * The room draws a fixed number of chairs rather than a list that grows, so a
 * player arriving does not shuffle everything below it. An empty chair is a
 * real thing on screen and it is what tells you there is room.
 */
export function chairs(room: Pick<TableRoom, 'maxSeats' | 'seats'>): Array<RoomSeat | null> {
  const out: Array<RoomSeat | null> = [];
  for (let i = 0; i < room.maxSeats; i += 1) {
    out.push(room.seats.find(seat => seat.seat === i) ?? null);
  }
  return out;
}

/**
 * Why the host cannot press start yet, or null when they can.
 *
 * The database refuses a start that breaks any of these, in
 * `start_online_table`. Saying it here first turns a raised exception into a
 * sentence next to a disabled button, which is the difference between a rule
 * and a surprise.
 */
export function whyNotStartable(room: Pick<TableRoom, 'seats' | 'status'>): string | null {
  if (room.status !== 'lobby') return 'This game has already started.';
  if (room.seats.length < 2) return 'A game needs at least two seats. Share the link to fill one.';

  const withoutDeck = room.seats.filter(seat => seat.deckSize <= 0 || !seat.committed);
  if (withoutDeck.length > 0) {
    const names = withoutDeck.map(seat => seat.name).join(', ');
    return `Still waiting on a deck from ${names}.`;
  }

  const notReady = room.seats.filter(seat => !seat.ready);
  if (notReady.length > 0) {
    const names = notReady.map(seat => seat.name).join(', ');
    return `Waiting for ${names} to say they are ready.`;
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Errors, in words                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Turn a Postgres error into something a player can act on.
 *
 * The messages the RPCs raise are already written for people, so most of this
 * is passing them through. The two that are not are the entry rule, which
 * arrives as a check violation from a trigger, and a network failure, which
 * arrives as nothing useful at all.
 */
export function lobbyErrorMessage(error: unknown): string {
  const raw =
    typeof error === 'string'
      ? error
      : ((error as { message?: string } | null)?.message ?? '');

  if (!raw) return 'That did not go through. Try it again in a moment.';

  if (raw.includes('one deck with cards in it')) {
    return 'You need one deck with cards in it before you can sit down.';
  }
  if (raw.includes('that table is full')) {
    return 'Somebody took the last seat. Try another table.';
  }
  if (raw.includes('no table with that code')) {
    return 'No table with that code. It may have been packed away.';
  }
  if (raw.includes('already started')) {
    return 'That game has already started.';
  }
  if (raw.includes('cannot post in the discussion')) {
    return 'Your account cannot post in the discussion. Get in touch if that looks wrong.';
  }
  if (raw.includes('sign in to post')) {
    return 'Sign in to join in. Reading is open to everybody.';
  }
  if (raw.includes('slow down a moment')) {
    return 'One at a time. Give it a second.';
  }
  if (raw.includes('a lot of messages in a minute')) {
    return 'That is a lot of messages in a minute. Give it a moment.';
  }
  if (raw.includes('you already said that')) {
    return 'You already said that.';
  }
  if (raw.includes('enough new topics for one hour')) {
    return 'That is enough new topics for one hour. Reply to one instead.';
  }
  if (raw.includes('that discussion is closed')) {
    return 'That discussion is closed.';
  }
  if (raw.includes('not there any more')) {
    return 'That discussion is not there any more.';
  }
  if (raw.includes('other people have replied')) {
    return 'Other people have replied, so this one needs a moderator.';
  }
  if (raw.includes('not yours to remove')) {
    return 'That is not yours to remove.';
  }
  if (raw.toLowerCase().includes('failed to fetch') || raw.includes('NetworkError')) {
    return 'Could not reach the table. Check your connection and try again.';
  }

  return raw;
}
