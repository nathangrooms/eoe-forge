/**
 * The friends list's sentences, asserted whole.
 *
 * Two of these matter more than the rest, and they are the reason this file
 * exists rather than a comment saying "the copy is fine".
 *
 * 1. "Does not share their decks" and "No decks yet" describe two completely
 *    different people, and if the interface ever collapses them into one string
 *    it will be telling somebody their friend owns nothing when their friend
 *    simply chose not to show them. The tests pin both.
 *
 * 2. A collection total that leaves out the unpriced cards has to SAY it leaves
 *    them out. CLAUDE.md records a card with no USD quote rendering as $0.00
 *    while carrying a Cardmarket price of €2,199.95, which is the same mistake
 *    wearing a different hat.
 *
 * The copy rules are checked mechanically at the bottom: no em-dashes anywhere
 * a person reads.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FRIENDS_BLURB,
  SHARING_CHOICES,
  aroundCount,
  aroundLine,
  askLabel,
  canAsk,
  channelReach,
  collectionHiddenLine,
  collectionLine,
  emptyFriendsLine,
  groupFriends,
  inviteLine,
  isAround,
  playsLine,
  sharingSummary,
  waitingCount,
  whyNotChannel,
  whyNotInvite,
} from './friendsView.ts';
import type { Friend } from './friends.ts';

const NOW = Date.parse('2026-08-22T12:00:00Z');

function friend(over: Partial<Friend> = {}): Friend {
  return {
    userId: 'u1',
    name: 'Dave',
    avatarUrl: null,
    state: 'friend',
    since: '2026-08-01T12:00:00Z',
    sharesDecks: true,
    sharesCollection: false,
    around: false,
    seenAt: null,
    doing: null,
    tableCode: null,
    deckCount: 0,
    topDeck: null,
    commanderName: null,
    commanderImage: null,
    inviteId: null,
    inviteCode: null,
    ...over,
  };
}

/* -------------------------------------------------------------------------- */
/* Where you stand                                                            */
/* -------------------------------------------------------------------------- */

test('the button says what pressing it would do, and nothing when it would do nothing', () => {
  assert.equal(askLabel('none'), 'Add friend');
  assert.equal(askLabel('they_asked'), 'Accept');
  assert.equal(askLabel('you_asked'), 'Asked');
  assert.equal(askLabel('friend'), 'Already friends');

  assert.equal(canAsk('none'), true);
  // Asking back IS saying yes, so this one is live.
  assert.equal(canAsk('they_asked'), true);
  assert.equal(canAsk('you_asked'), false);
  assert.equal(canAsk('friend'), false);
});

/* -------------------------------------------------------------------------- */
/* Around                                                                     */
/* -------------------------------------------------------------------------- */

test('a table code beats being around, because it is somewhere to go', () => {
  assert.equal(
    aroundLine(friend({ around: true, doing: 'at a table', tableCode: 'K7QRTM' }), NOW),
    'At table K7QRTM'
  );
});

test('being around says what they are doing when there is something to say', () => {
  assert.equal(aroundLine(friend({ around: true, doing: 'choosing a mode' }), NOW), 'Around now, choosing a mode');
  assert.equal(aroundLine(friend({ around: true }), NOW), 'Around now');
});

test('never being seen and choosing not to share are different sentences', () => {
  // This is the one that would quietly libel somebody. "Last around never" about
  // a person who plays daily and has the switch off is a claim, not a blank.
  assert.equal(aroundLine(friend(), NOW), 'Does not share when they are around');
  assert.equal(
    aroundLine(friend({ seenAt: '2026-08-22T10:00:00Z' }), NOW),
    'Last around 2 hours ago'
  );
});

test('a request says which way round it is waiting', () => {
  assert.equal(aroundLine(friend({ state: 'they_asked' }), NOW), 'Waiting for your answer');
  assert.equal(aroundLine(friend({ state: 'you_asked' }), NOW), 'Waiting for their answer');
});

test('the lit dot is for friends who are around, not for pending requests', () => {
  assert.equal(isAround(friend({ around: true })), true);
  assert.equal(isAround(friend({ state: 'they_asked', around: true })), false);
});

/* -------------------------------------------------------------------------- */
/* What they play                                                             */
/* -------------------------------------------------------------------------- */

test('not sharing decks and owning no decks say different things', () => {
  assert.equal(playsLine(friend({ sharesDecks: false, deckCount: 0 })), 'Does not share their decks');
  assert.equal(playsLine(friend({ sharesDecks: true, deckCount: 0 })), 'No decks yet');
});

test('the decks line leads with the commander, because that is what a player asks', () => {
  assert.equal(
    playsLine(friend({ deckCount: 4, commanderName: "Atraxa, Praetors' Voice", topDeck: 'Superfriends' })),
    "4 decks, playing Atraxa, Praetors' Voice"
  );
  assert.equal(playsLine(friend({ deckCount: 1, topDeck: 'Test' })), '1 deck, last on Test');
});

test('somebody who has only asked shows nothing about their decks', () => {
  assert.equal(playsLine(friend({ state: 'you_asked', deckCount: 9 })), 'Decks stay hidden until you are friends');
});

/* -------------------------------------------------------------------------- */
/* The collection total, and what it leaves out                               */
/* -------------------------------------------------------------------------- */

test('a total that leaves cards out says so, with the count', () => {
  assert.equal(
    collectionLine({ cards: 53, copies: 161, priced: 47, unpriced: 6, valueUsd: 358.75, top: [] }),
    '53 cards, 161 copies, worth $358.75. 6 of them have no price, so they are not in that total.'
  );
});

test('a total with nothing left out does not apologise for nothing', () => {
  assert.equal(
    collectionLine({ cards: 2, copies: 3, priced: 2, unpriced: 0, valueUsd: 12.5, top: [] }),
    '2 cards, 3 copies, worth $12.50.'
  );
});

test('no price anywhere is said plainly rather than shown as nothing', () => {
  // A missing price is null, never 0. A rendered zero is always invented.
  assert.equal(
    collectionLine({ cards: 4, copies: 4, priced: 0, unpriced: 4, valueUsd: null, top: [] }),
    '4 cards, 4 copies. None of them has a price yet.'
  );
});

test('a hidden collection explains that decks are a separate choice', () => {
  assert.equal(
    collectionHiddenLine('Dave'),
    'Dave keeps their collection private. Decks are a separate choice and they may still share those.'
  );
});

/* -------------------------------------------------------------------------- */
/* Inviting                                                                   */
/* -------------------------------------------------------------------------- */

test('a refusal to invite says what would fix it', () => {
  assert.equal(whyNotInvite({ state: 'you_asked' }), 'You can invite somebody once you are friends.');
  assert.equal(whyNotInvite({ state: 'friend' }), 'Open a table first, then invite them to it.');
  assert.equal(
    whyNotInvite({ state: 'friend', myTableCode: 'K7QRTM', tableIsWaiting: false }),
    'That game has already started.'
  );
  assert.equal(whyNotInvite({ state: 'friend', myTableCode: 'K7QRTM', tableIsWaiting: true }), null);
});

test('an invitation names the table, because the code is the way in', () => {
  assert.equal(inviteLine(friend({ inviteId: 3, inviteCode: 'K7QRTM' })), 'Dave asked you to join table K7QRTM.');
  assert.equal(inviteLine(friend()), null);
});

/* -------------------------------------------------------------------------- */
/* Grouping                                                                   */
/* -------------------------------------------------------------------------- */

test('the four groups split one list rather than sorting it again', () => {
  const list = [
    friend({ userId: 'a', state: 'they_asked' }),
    friend({ userId: 'b', around: true }),
    friend({ userId: 'c' }),
    friend({ userId: 'd', state: 'you_asked' }),
  ];
  const groups = groupFriends(list);
  assert.deepEqual(groups.waiting.map(f => f.userId), ['a']);
  assert.deepEqual(groups.around.map(f => f.userId), ['b']);
  assert.deepEqual(groups.away.map(f => f.userId), ['c']);
  assert.deepEqual(groups.asked.map(f => f.userId), ['d']);
});

test('the badge counts what is waiting on you, not how many friends you have', () => {
  const list = [
    friend({ userId: 'a', state: 'they_asked' }),
    friend({ userId: 'b', inviteId: 7, inviteCode: 'K7QRTM' }),
    friend({ userId: 'c', around: true }),
  ];
  assert.equal(waitingCount(list), 2);
  assert.equal(aroundCount(list), 1);
});

/* -------------------------------------------------------------------------- */
/* The sharing switches                                                       */
/* -------------------------------------------------------------------------- */

test('the collection is the one that starts off, and the switch says why', () => {
  const collection = SHARING_CHOICES.find(choice => choice.key === 'collection');
  assert.ok(collection);
  assert.match(collection.detail, /starts off/);
});

test('the summary reads as a sentence at every setting', () => {
  assert.equal(
    sharingSummary({ decks: false, collection: false, activity: false }),
    'Friends can see nothing about you beyond your name.'
  );
  assert.equal(
    sharingSummary({ decks: true, collection: true, activity: true }),
    'Friends can see your decks, your collection and when you are around.'
  );
  assert.equal(
    sharingSummary({ decks: true, collection: false, activity: true }),
    'Friends can see your decks and when you are around.'
  );
  assert.equal(
    sharingSummary({ decks: true, collection: false, activity: false }),
    'Friends can see your decks.'
  );
});

/* -------------------------------------------------------------------------- */
/* Channels                                                                   */
/* -------------------------------------------------------------------------- */

test('a channel name is refused for a reason a person can act on', () => {
  assert.equal(whyNotChannel(' '), 'Give the channel a name.');
  assert.equal(whyNotChannel('!!'), 'The name needs at least one letter or number in it.');
  assert.equal(whyNotChannel('x'.repeat(61)), 'That name is longer than a channel name can be.');
  assert.equal(whyNotChannel('Deck help'), null);
});

test('private says who else can read it, including the uncomfortable half', () => {
  // A report about a private channel cannot be judged without reading it. This
  // product picked "the owner can read it" and says so rather than letting the
  // word private mean something it does not.
  assert.equal(
    channelReach(true),
    'Only people you add can read it or post in it. The site owner can read it too, so that reports can be dealt with.'
  );
  assert.equal(
    channelReach(false),
    'Anybody can read it, including people who are not signed in. An account is needed to post.'
  );
});

/* -------------------------------------------------------------------------- */
/* The copy rules, checked rather than remembered                             */
/* -------------------------------------------------------------------------- */

test('nothing a person reads carries an em-dash', () => {
  const everything = [
    FRIENDS_BLURB,
    emptyFriendsLine(true),
    emptyFriendsLine(false),
    channelReach(true),
    channelReach(false),
    collectionHiddenLine('Dave'),
    aroundLine(friend(), NOW),
    playsLine(friend()),
    sharingSummary({ decks: true, collection: true, activity: true }),
    ...SHARING_CHOICES.map(choice => `${choice.title} ${choice.detail}`),
  ];
  for (const line of everything) {
    assert.equal(line.includes('—'), false, `em-dash in: ${line}`);
    assert.equal(line.includes('–'), false, `en-dash in: ${line}`);
  }
});
