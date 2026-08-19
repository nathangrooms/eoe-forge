import test from 'node:test';
import assert from 'node:assert/strict';
import { TIMED_OUT_MESSAGE, withTimeout } from './withTimeout.ts';

test('a write that finishes in time is passed straight through', async () => {
  const value = await withTimeout(Promise.resolve('filed'), 1000);
  assert.equal(value, 'filed');
});

test('a write that fails keeps its own error, not the timeout wording', async () => {
  await assert.rejects(
    withTimeout(Promise.reject(new Error('That card is not in our catalogue yet')), 1000),
    /not in our catalogue/
  );
});

test('a write that never answers gives up out loud instead of hanging', async () => {
  const never = new Promise(() => {});
  await assert.rejects(withTimeout(never, 20), error => {
    assert.equal((error as Error).message, TIMED_OUT_MESSAGE);
    return true;
  });
});

test('the message a person reads names the problem and what to do', () => {
  // Copy rules: no jargon, no em-dashes. "Timeout" and "request failed" are
  // engineering words; a player wants to know the server went quiet.
  assert.ok(!TIMED_OUT_MESSAGE.includes('—'), 'no em-dash in user-facing copy');
  assert.ok(!/timeout|timed out|request|error/i.test(TIMED_OUT_MESSAGE), 'no jargon');
  assert.match(TIMED_OUT_MESSAGE, /try again/i);
});

test('the timer is cleared, so a resolved write does not hold the process open', async () => {
  // If `withTimeout` leaked its timer, node:test would sit here for the full
  // delay rather than finishing as soon as the work does.
  const started = Date.now();
  await withTimeout(Promise.resolve(1), 60000);
  assert.ok(Date.now() - started < 1000);
});
