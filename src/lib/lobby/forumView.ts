/**
 * The discussion's decisions and its copy, with nothing attached to them.
 *
 * Pure functions of data the page already holds, so `node --test` can reach
 * them and so the sentences a person reads are asserted as whole strings. The
 * copy IS the feature in most of these: a refusal that does not say what would
 * fix it is a dead end, and a dead end in a lobby is somebody closing the tab.
 */

import type { ForumTopic } from './types.ts';
import { waitedFor } from './lobbyView.ts';

/* -------------------------------------------------------------------------- */
/* Who may say something                                                      */
/* -------------------------------------------------------------------------- */

export interface PostingRule {
  signedIn: boolean;
  /** True once the database has refused this account for being blocked. */
  blocked?: boolean;
  /** A closed conversation. Reading stays open. */
  locked?: boolean;
  /** For a table's talk only: are you actually sitting at it. */
  seated?: boolean;
  /** Set for a table's talk, so the rule can say the right sentence. */
  atTable?: boolean;
}

export interface PostingVerdict {
  canPost: boolean;
  /** Null when you can post. Otherwise what is in the way, and what fixes it. */
  reason: string | null;
}

/**
 * Whether this person may say something here.
 *
 * THE DECK RULE DOES NOT APPLY TO TALKING. Sitting down at a table needs an
 * account and one deck with cards in it, because you are about to play a game
 * with it. Asking whether anybody wants a game needs an account and nothing
 * else. A board that turns away the person who has not built a deck yet is
 * turning away the exact person a lobby exists to help.
 */
export function postingVerdict(rule: PostingRule): PostingVerdict {
  if (!rule.signedIn) {
    return {
      canPost: false,
      reason: 'Sign in to join in. Anybody can read this, an account is only needed to post.',
    };
  }

  if (rule.blocked) {
    return {
      canPost: false,
      reason: 'Your account cannot post in the discussion. Get in touch if that looks wrong.',
    };
  }

  if (rule.atTable && !rule.seated) {
    return {
      canPost: false,
      reason: 'Take a seat and you can talk to the others at this table.',
    };
  }

  if (rule.locked) {
    return { canPost: false, reason: 'This one is closed. Start a new topic instead.' };
  }

  return { canPost: true, reason: null };
}

/* -------------------------------------------------------------------------- */
/* How a conversation reads in the list                                       */
/* -------------------------------------------------------------------------- */

/**
 * How many replies, in the words somebody would say.
 *
 * `postCount` counts the opening post as well, which is why one post is no
 * replies. Counting it as a reply would tell every new topic it already had an
 * answer.
 */
export function replyLine(topic: Pick<ForumTopic, 'postCount'>): string {
  const replies = Math.max(0, topic.postCount - 1);
  if (replies === 0) return 'No replies yet';
  return replies === 1 ? '1 reply' : `${replies} replies`;
}

/** Who spoke last and how long ago, or when it started if nobody has. */
export function lastWordLine(
  topic: Pick<ForumTopic, 'postCount' | 'lastPostName' | 'lastPostAt' | 'authorName' | 'createdAt'>,
  now: number = Date.now()
): string {
  if (topic.postCount <= 1) {
    return `${topic.authorName} asked, ${waitedFor(topic.createdAt, now)} ago`;
  }
  const who = topic.lastPostName ?? topic.authorName;
  return `${who} replied, ${waitedFor(topic.lastPostAt, now)} ago`;
}

/**
 * The line the board shows when it is empty.
 *
 * Said differently for somebody who cannot post yet, because "start it off" is
 * an instruction they cannot follow and reads as the page being broken.
 *
 * NAMES WHAT IS EMPTY. It used to say "Nobody has posted yet", and the room
 * chat 300 pixels above it was showing a post. On a phone the two feeds stack
 * and read as one thing, so the page appeared to flatly contradict itself to
 * the one visitor most likely to be looking for signs of life. The chat and the
 * board are different things; the sentence now says which one it is about.
 */
export function emptyBoardLine(signedIn: boolean): string {
  return signedIn
    ? 'No conversations here yet. Ask for a game and see who answers.'
    : 'No conversations here yet. Sign in to start one.';
}

/* -------------------------------------------------------------------------- */
/* Starting a conversation                                                    */
/* -------------------------------------------------------------------------- */

/** The database refuses shorter than this, so the box says so first. */
export const TITLE_MIN = 3;
export const TITLE_MAX = 120;
export const BODY_MAX = 2000;

/** What is wrong with this draft, or null when nothing is. */
export function whyNotStartTopic(title: string, body: string): string | null {
  if (title.trim().length < TITLE_MIN) {
    return 'Give it a title so people know what it is about.';
  }
  if (title.trim().length > TITLE_MAX) {
    return `A title is ${TITLE_MAX} characters at most.`;
  }
  if (body.trim().length === 0) {
    return 'Write something to go with it.';
  }
  if (body.trim().length > BODY_MAX) {
    return `A post is ${BODY_MAX} characters at most.`;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* What the room is for                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The one line under the heading.
 *
 * It has to say three things: what to use it for, that it stays, and that it is
 * public. The third matters most. A person deciding whether to type their
 * Discord name into a box is entitled to know who can read it, and finding out
 * afterwards is the kind of surprise that is not recoverable.
 */
export const BOARD_BLURB =
  'Ask for a game, say what you feel like playing, or answer somebody. Conversations stay here, and anybody can read them, including people who are not signed in.';

/** The same three facts for a table, where two of the answers are different. */
export const TABLE_TALK_BLURB =
  'Only the people at this table can read this. It goes when the table does.';
