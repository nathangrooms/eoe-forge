/**
 * Tests for a deck's match record.
 *
 *   node --test --experimental-strip-types src/lib/deck/deckRecord.test.ts
 *
 * The one that matters is the year test on "this month". It shipped without
 * one, so a game played last August counted towards this August, and the figure
 * grew by twelve months of games every time the calendar came round. It was
 * fixed in the fold that merged `MatchAnalytics` into the tracker; this is the
 * guard that keeps it fixed now the arithmetic has moved again.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deckRecordStats, type MatchRow } from './deckRecord.ts';

const NOW = new Date('2026-08-15T12:00:00Z');

let seq = 0;
function match(result: string, playedAt: string, opponent?: string): MatchRow {
  return {
    id: `m-${++seq}`,
    result,
    played_at: playedAt,
    opponent_commander: opponent ?? null,
    opponent_deck_name: null,
  };
}

test('a deck with no matches has no win rate, not a zero one', () => {
  const stats = deckRecordStats([], NOW);
  assert.equal(stats.winRate, null);
  assert.equal(stats.recentWinRate, null);
  assert.equal(stats.monthWinRate, null);
});

test('this month is a calendar month IN THIS YEAR', () => {
  const rows = [
    match('win', '2026-08-02T00:00:00Z'),
    // Same month, a year earlier. Without the year test this counted.
    match('win', '2025-08-02T00:00:00Z'),
    match('loss', '2025-08-03T00:00:00Z'),
  ];
  const stats = deckRecordStats(rows, NOW);
  assert.equal(stats.monthCount, 1);
  assert.equal(stats.monthWinRate, 100);
});

test('recent form is the first ten rows, which is the newest ten', () => {
  // The query orders newest first, so slicing is the right rule and re-sorting
  // here would be a second opinion about it.
  const rows = [
    ...Array.from({ length: 10 }, () => match('win', '2026-08-10T00:00:00Z')),
    ...Array.from({ length: 10 }, () => match('loss', '2026-01-01T00:00:00Z')),
  ];
  const stats = deckRecordStats(rows, NOW);
  assert.equal(stats.recentCount, 10);
  assert.equal(stats.recentWinRate, 100);
  assert.equal(stats.winRate, 50);
});

test('opponents are grouped and ordered by games played', () => {
  const rows = [
    match('win', '2026-08-01T00:00:00Z', 'Atraxa'),
    match('loss', '2026-08-02T00:00:00Z', 'Atraxa'),
    match('win', '2026-08-03T00:00:00Z', 'Krenko'),
  ];
  const stats = deckRecordStats(rows, NOW);
  assert.equal(stats.opponents[0].opponent, 'Atraxa');
  assert.equal(stats.opponents[0].total, 2);
  assert.equal(stats.opponents[0].winRate, 50);
});

test('a match with no opponent recorded is grouped, not dropped', () => {
  const stats = deckRecordStats([match('win', '2026-08-01T00:00:00Z')], NOW);
  assert.equal(stats.opponents.length, 1);
  assert.equal(stats.opponents[0].opponent, 'Unrecorded');
});

test('the timeline covers twelve months including the empty ones', () => {
  const stats = deckRecordStats([match('win', '2026-08-01T00:00:00Z')], NOW);
  assert.equal(stats.months.length, 12);
  // Newest last, so it reads left to right.
  assert.equal(stats.months[11].month, '2026-08');
  assert.equal(stats.months[11].played, 1);
  // A month with no games has no win rate. Zero would say you lost them.
  assert.equal(stats.months[0].winRate, null);
  assert.equal(stats.months[0].played, 0);
});

test('the timeline labels a month from an earlier year with its year', () => {
  const stats = deckRecordStats([], NOW);
  // Twelve months back from August 2026 starts in September 2025.
  assert.equal(stats.months[0].label, 'Sep 25');
  assert.equal(stats.months[11].label, 'Aug');
});
