/**
 * The friends list's decisions and its copy, with nothing attached to them.
 *
 * Pure functions of data the panel already holds, so `node --test` can reach
 * them and so the sentences a person reads are asserted as whole strings.
 *
 * The copy IS the feature in most of these. "Does not share their collection"
 * and "has no cards in it" look the same on screen if the difference is not
 * written down, and one of those is a privacy choice somebody made while the
 * other is an empty shelf. A friends list that cannot tell you which is which
 * quietly makes people look mean.
 */

import type { Friend, FriendCollection, FriendState, Sharing } from './friends.ts';
import { waitedFor } from './lobbyView.ts';

/* -------------------------------------------------------------------------- */
/* Where you stand with somebody                                              */
/* -------------------------------------------------------------------------- */

/** The word on the button in a search result. */
export function askLabel(state: FriendState | 'none'): string {
  switch (state) {
    case 'friend':
      return 'Already friends';
    case 'you_asked':
      return 'Asked';
    case 'they_asked':
      return 'Accept';
    default:
      return 'Add friend';
  }
}

/** Whether that button does anything. "Asked" is a fact, not an action. */
export function canAsk(state: FriendState | 'none'): boolean {
  return state === 'none' || state === 'they_asked';
}

/* -------------------------------------------------------------------------- */
/* Are they around                                                            */
/* -------------------------------------------------------------------------- */

/**
 * What to write under somebody's name.
 *
 * Four different facts, and they must not be allowed to read as the same one:
 *
 *   at a table       where they are, so you can go and join it
 *   around           on the site now
 *   last seen        on the site at some point, and this is when
 *   not shared       they have turned activity off, which is not the same as
 *                    never being on, and saying "last seen never" about
 *                    somebody who plays every day would be a lie
 */
export function aroundLine(friend: Friend, now: number = Date.now()): string {
  if (friend.state === 'they_asked') return 'Waiting for your answer';
  if (friend.state === 'you_asked') return 'Waiting for their answer';

  if (friend.tableCode) return `At table ${friend.tableCode}`;
  if (friend.around) return friend.doing ? `Around now, ${friend.doing}` : 'Around now';
  if (friend.seenAt) return `Last around ${waitedFor(friend.seenAt, now)} ago`;
  return 'Does not share when they are around';
}

/** True when the dot beside the name should be lit. */
export function isAround(friend: Friend): boolean {
  return friend.state === 'friend' && friend.around;
}

/* -------------------------------------------------------------------------- */
/* What they play                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The one line about somebody's decks.
 *
 * A friend who shares nothing and a friend who has built nothing get different
 * sentences, because they are different facts about a person.
 */
export function playsLine(friend: Friend): string {
  if (friend.state !== 'friend') return 'Decks stay hidden until you are friends';
  if (!friend.sharesDecks) return 'Does not share their decks';
  if (friend.deckCount === 0) return 'No decks yet';

  const decks = friend.deckCount === 1 ? '1 deck' : `${friend.deckCount} decks`;
  if (friend.commanderName) return `${decks}, playing ${friend.commanderName}`;
  if (friend.topDeck) return `${decks}, last on ${friend.topDeck}`;
  return decks;
}

/**
 * The collection, said honestly.
 *
 * The total covers only the cards that have a price. Saying "$358.75" over a
 * collection where six cards have no quote, without saying so, is a number
 * that reads as complete and is not.
 */
export function collectionLine(collection: FriendCollection): string {
  const cards = collection.cards === 1 ? '1 card' : `${collection.cards} cards`;
  const copies =
    collection.copies === 1 ? '1 copy' : `${collection.copies} copies`;

  if (collection.valueUsd === null) {
    return `${cards}, ${copies}. None of them has a price yet.`;
  }

  const money = `$${collection.valueUsd.toFixed(2)}`;
  if (collection.unpriced === 0) {
    return `${cards}, ${copies}, worth ${money}.`;
  }

  const missing =
    collection.unpriced === 1
      ? '1 of them has no price, so it is not in that total'
      : `${collection.unpriced} of them have no price, so they are not in that total`;
  return `${cards}, ${copies}, worth ${money}. ${missing}.`;
}

/** What the collection tab says when somebody keeps it to themselves. */
export function collectionHiddenLine(name: string): string {
  return `${name} keeps their collection private. Decks are a separate choice and they may still share those.`;
}

/* -------------------------------------------------------------------------- */
/* Inviting                                                                   */
/* -------------------------------------------------------------------------- */

export interface InviteRule {
  /** The table you are sitting at right now, if any. */
  myTableCode?: string | null;
  /** Whether that table is still in its lobby rather than mid game. */
  tableIsWaiting?: boolean;
  state: FriendState;
}

/** Null when you can invite. Otherwise what is in the way, and what fixes it. */
export function whyNotInvite(rule: InviteRule): string | null {
  if (rule.state !== 'friend') return 'You can invite somebody once you are friends.';
  if (!rule.myTableCode) return 'Open a table first, then invite them to it.';
  if (rule.tableIsWaiting === false) return 'That game has already started.';
  return null;
}

/** What an invitation sitting in your list says. */
export function inviteLine(friend: Friend): string | null {
  if (!friend.inviteCode) return null;
  return `${friend.name} asked you to join table ${friend.inviteCode}.`;
}

/* -------------------------------------------------------------------------- */
/* Grouping the list                                                          */
/* -------------------------------------------------------------------------- */

export interface FriendGroups {
  /** People waiting on YOUR answer. Nothing else on the page outranks these. */
  waiting: Friend[];
  around: Friend[];
  away: Friend[];
  /** People you asked who have not answered. */
  asked: Friend[];
}

/**
 * Four groups, in the order a person cares about them.
 *
 * `my_friends()` already returns them in this order, and this splits the one
 * list rather than sorting it again, so the panel and the database cannot come
 * to disagree about what is at the top.
 */
export function groupFriends(friends: Friend[]): FriendGroups {
  const groups: FriendGroups = { waiting: [], around: [], away: [], asked: [] };
  for (const friend of friends) {
    if (friend.state === 'they_asked') groups.waiting.push(friend);
    else if (friend.state === 'you_asked') groups.asked.push(friend);
    else if (friend.around) groups.around.push(friend);
    else groups.away.push(friend);
  }
  return groups;
}

/** The count for the tab, which is requests only. A friend is not a to-do. */
export function waitingCount(friends: Friend[]): number {
  return friends.filter(friend => friend.state === 'they_asked').length +
    friends.filter(friend => friend.inviteId !== null).length;
}

/** How many are around, for the strip on the play page. */
export function aroundCount(friends: Friend[]): number {
  return friends.filter(isAround).length;
}

/* -------------------------------------------------------------------------- */
/* Copy for the empty cases                                                   */
/* -------------------------------------------------------------------------- */

export function emptyFriendsLine(signedIn: boolean): string {
  return signedIn
    ? 'Nobody yet. Search for somebody by name and ask them.'
    : 'Sign in to keep a friends list and see who is around.';
}

export const FRIENDS_BLURB =
  'Add somebody and you can see when they are around, what they play, and ask them to a table.';

/* -------------------------------------------------------------------------- */
/* The sharing switches, said in full                                         */
/* -------------------------------------------------------------------------- */

export interface SharingChoice {
  key: keyof Sharing;
  title: string;
  /** What turning it on actually does, in the words a player would use. */
  detail: string;
  /** The same thing as part of a sentence, so the summary reads as English. */
  phrase: string;
}

/**
 * The three choices and what each one means.
 *
 * Written out because a switch labelled "Collection" with no sentence under it
 * is somebody guessing what they just agreed to.
 */
export const SHARING_CHOICES: SharingChoice[] = [
  {
    key: 'decks',
    title: 'My decks',
    detail:
      'Friends can see your deck names, their commanders and how many cards are in them. Not the card lists.',
    phrase: 'your decks',
  },
  {
    key: 'collection',
    title: 'My collection',
    detail:
      'Friends can see what you own and what it is worth. This one starts off, because a collection is closer to a list of what you have paid for than to a deck.',
    phrase: 'your collection',
  },
  {
    key: 'activity',
    title: 'When I am around',
    detail:
      'Friends can see that you are on the site now and which table you are sitting at. Turn it off and you show as not shared, not as away.',
    phrase: 'when you are around',
  },
];

/** One sentence saying where a friend stands, for the top of the panel. */
export function sharingSummary(sharing: Sharing): string {
  const on = SHARING_CHOICES.filter(choice => sharing[choice.key]).map(choice => choice.phrase);
  if (on.length === 0) return 'Friends can see nothing about you beyond your name.';
  if (on.length === 1) return `Friends can see ${on[0]}.`;
  const last = on[on.length - 1];
  return `Friends can see ${on.slice(0, -1).join(', ')} and ${last}.`;
}

/* -------------------------------------------------------------------------- */
/* Channels                                                                   */
/* -------------------------------------------------------------------------- */

export const CHANNEL_NAME_MIN = 2;
export const CHANNEL_NAME_MAX = 60;

/** Null when the name will do. Otherwise what is wrong with it. */
export function whyNotChannel(title: string): string | null {
  const name = title.trim();
  if (name.length < CHANNEL_NAME_MIN) return 'Give the channel a name.';
  if (name.length > CHANNEL_NAME_MAX) return 'That name is longer than a channel name can be.';
  if (!/[a-z0-9]/i.test(name)) return 'The name needs at least one letter or number in it.';
  return null;
}

/**
 * What "open" and "private" actually mean, said where somebody is choosing.
 *
 * The second sentence of the private case is the uncomfortable one and it is
 * here on purpose. A moderator cannot judge a report about a private channel
 * without reading it, so either the site owner can read it or reports about it
 * cannot be acted on. This product picked the first, and says so rather than
 * letting "private" mean something it does not.
 */
export function channelReach(isPrivate: boolean): string {
  return isPrivate
    ? 'Only people you add can read it or post in it. The site owner can read it too, so that reports can be dealt with.'
    : 'Anybody can read it, including people who are not signed in. An account is needed to post.';
}
