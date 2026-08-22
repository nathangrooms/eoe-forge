/**
 * The lobby: tables people can see, open, share and join.
 *
 *   import { listOpenTables, subscribeToLobby, tableLink } from '@/lib/lobby';
 *
 * Four files, four jobs:
 *
 *   `tables.ts`    every call to the online-table RPCs, one query per screen
 *   `forum.ts`     the discussion, on the board and at a table both
 *   `richText.ts`  making a stranger's words safe to draw
 *   `channel.ts`   how a screen finds out something changed, without polling
 *   `seat.ts`      what "ready" means: shuffle your own deck and commit to it
 *   `lobbyView.ts` the table decisions and copy, pure, so tests can reach them
 *   `forumView.ts` the discussion decisions and copy, same rule
 *   `share.ts`     the link, which is the owner's stated way into a game
 *
 * What is deliberately NOT here: anything that draws a game. The lobby's job
 * ends when the host presses start. A seat whose actions arrive over a
 * transport is still a seat, and it plays on the same table, the same hand, the
 * same card preview and the same log as goldfish, bots and playtest.
 */

export * from './types.ts';
export * from './tables.ts';
export * from './forum.ts';
export * from './richText.ts';
export * from './channel.ts';
export * from './seat.ts';
export * from './lobbyView.ts';
export * from './forumView.ts';
export * from './share.ts';
