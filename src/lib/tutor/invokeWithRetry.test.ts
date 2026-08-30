/**
 * The gateway retry, tested for the two ways it could be worse than nothing.
 *
 * Retrying too little leaves the measured failure in place: 12 of 50 real
 * questions came back 502 in under 151 ms, and 6 in a row on one probe.
 * Retrying too much is worse, because a 500 raised BY the function means the
 * work was attempted, and sending it again could repeat a side effect.
 *
 * The invoker is injected rather than mocked at the module level, so these
 * assertions are about the retry RULES and nothing else.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { invokeWithRetry } from './invokeWithRetry.ts';

/** A gateway refusal as supabase-js reports it: a status, no body of ours. */
const gateway = (status: number) => ({
  data: null,
  error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    context: { status },
  }),
});

/** An invoker that replays a queue and records what it was asked. */
function queued(responses: Array<{ data: unknown; error: unknown }>) {
  const calls: Array<{ fn: string; body: unknown }> = [];
  const invoke = async (fn: string, options: { body?: unknown }) => {
    calls.push({ fn, body: options?.body });
    return responses.shift() ?? { data: null, error: new Error('nothing queued') };
  };
  return { invoke, calls };
}

/* No real waiting: the delays are the product's, not the test's. */
const NOW: readonly number[] = [0, 0];

describe('riding out a gateway refusal', () => {
  it('answers on the first attempt without retrying', async () => {
    const q = queued([{ data: { answer: 'yes' }, error: null }]);
    const result = await invokeWithRetry('mtg-brain', {
      body: { message: 'hi' }, invoke: q.invoke, delaysMs: NOW,
    });
    assert.deepEqual(result.data, { answer: 'yes' });
    assert.equal(result.retries, 0);
    assert.equal(q.calls.length, 1);
  });

  it('retries a 502 and returns the answer that follows', async () => {
    const q = queued([gateway(502), { data: { answer: 'second time' }, error: null }]);
    const result = await invokeWithRetry('mtg-brain', { invoke: q.invoke, delaysMs: NOW });
    assert.deepEqual(result.data, { answer: 'second time' });
    assert.equal(result.retries, 1);
    assert.equal(q.calls.length, 2);
  });

  it('survives two in a row, which the probe measured six of', async () => {
    const q = queued([gateway(502), gateway(503), { data: { answer: 'third' }, error: null }]);
    const result = await invokeWithRetry('mtg-brain', { invoke: q.invoke, delaysMs: NOW });
    assert.deepEqual(result.data, { answer: 'third' });
    assert.equal(result.retries, 2);
  });

  it('gives up rather than hammering, and hands back the last error', async () => {
    const q = queued([gateway(502), gateway(502), gateway(502), { data: { answer: 'too late' }, error: null }]);
    const result = await invokeWithRetry('mtg-brain', { invoke: q.invoke, delaysMs: NOW });
    assert.equal(result.data, null);
    assert.ok(result.error, 'the failure was swallowed');
    assert.equal(q.calls.length, 3, 'more than three attempts');
  });

  it('DOES NOT retry a 500 raised by the function itself', async () => {
    /* A 500 from our own code means the work was attempted and carries our own
       error. Sending it again repeats whatever went wrong, and could repeat a
       side effect with it. */
    const q = queued([
      { data: null, error: Object.assign(new Error('boom'), { context: { status: 500 } }) },
      { data: { answer: 'never reached' }, error: null },
    ]);
    const result = await invokeWithRetry('mtg-brain', { invoke: q.invoke, delaysMs: NOW });
    assert.equal(result.data, null);
    assert.equal(q.calls.length, 1, 'a function error was retried');
  });

  it('DOES NOT retry a 4xx, which will be wrong again', async () => {
    const q = queued([
      { data: null, error: Object.assign(new Error('bad request'), { context: { status: 400 } }) },
      { data: { answer: 'never reached' }, error: null },
    ]);
    await invokeWithRetry('mtg-brain', { invoke: q.invoke, delaysMs: NOW });
    assert.equal(q.calls.length, 1);
  });

  it('DOES NOT retry 546, the resource limit', async () => {
    /* The deck generator surfaces this deliberately: a five-colour pool that
       does not fit will not fit on the second attempt either. */
    const q = queued([
      { data: null, error: Object.assign(new Error('limit'), { context: { status: 546 } }) },
      { data: { answer: 'never reached' }, error: null },
    ]);
    await invokeWithRetry('ai-deck-builder-v2', { invoke: q.invoke, delaysMs: NOW });
    assert.equal(q.calls.length, 1);
  });

  it('recognises a gateway failure that reports no status at all', async () => {
    /* What a 502 looks like from the client when no body came back: supabase-js
       reports only its generic message, so the message is the fallback. */
    const q = queued([
      { data: null, error: new Error('502 Bad Gateway') },
      { data: { answer: 'recovered' }, error: null },
    ]);
    const result = await invokeWithRetry('mtg-brain', { invoke: q.invoke, delaysMs: NOW });
    assert.deepEqual(result.data, { answer: 'recovered' });
    assert.equal(result.retries, 1);
  });

  it('passes the body through unchanged on every attempt', async () => {
    const body = { message: 'what does deathtouch do', conversationId: 'abc' };
    const q = queued([gateway(502), { data: { answer: 'ok' }, error: null }]);
    await invokeWithRetry('mtg-brain', { body, invoke: q.invoke, delaysMs: NOW });
    assert.equal(q.calls.length, 2);
    for (const call of q.calls) assert.deepEqual(call.body, body);
  });
});
