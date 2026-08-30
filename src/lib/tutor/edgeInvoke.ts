import { supabase } from '@/integrations/supabase/client';
import { invokeWithRetry } from './invokeWithRetry';

/**
 * What supabase-js hands back from `functions.invoke`, restated.
 *
 * `T` defaults to `any` because supabase-js types it that way and all six call
 * sites read fields straight off it (`data.message`, `data.cards`,
 * `data.visualData`). Tightening it here would be honest about this file and
 * dishonest about the edge function, whose response shape is declared nowhere,
 * and it would turn a one-word change at six call sites into a rewrite of six
 * components.
 *
 * `error` is an Error because every supabase-js functions error extends one and
 * every caller reads `error.message`. The status is carried on `context`, which
 * is what `invokeWithRetry` reads to tell a gateway refusal from ours.
 */
type EdgeResult<T> = {
  data: T | null;
  error: (Error & { context?: { status?: number } }) | null;
};

/**
 * `supabase.functions.invoke`, with the gateway retried. A DROP-IN.
 *
 * Same two arguments, same `{ data, error }` back, so a call site changes by one
 * word and nothing downstream of it moves. That is deliberate: six places ask
 * Tutor a question and every one of them destructures the result differently.
 *
 * All the judgement lives in `invokeWithRetry`, which imports nothing and is
 * tested. This file exists only to bind the real client to it, because
 * `node:test` cannot resolve the `@/` alias and a module that imported the
 * client would be a module with no tests.
 *
 * Why it is needed, measured against the deployed Tutor on 2026-08-30: 12 of 50
 * real questions came back `502 Bad Gateway` in under 151 ms, and one probe saw
 * six consecutive. A 502 in 24 ms never reached the function, which takes about
 * half a second to answer. Nothing retried, so the page printed its own failure
 * and a player saw a product that broke one question in six for a reason that
 * had nothing to do with their question.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function askEdgeFunctionRaw<T = any>(
  fn: string,
  options: { body?: unknown; headers?: Record<string, string> } = {}
): Promise<EdgeResult<T>> {
  const { data, error, retries } = await invokeWithRetry<T>(fn, {
    body: options.body,
    headers: options.headers,
    invoke: (name, opts) =>
      supabase.functions.invoke(name, opts as never) as Promise<{ data: unknown; error: unknown }>,
  });

  if (retries > 0) {
    console.info(`[${fn}] answered after ${retries} gateway retr${retries === 1 ? 'y' : 'ies'}`);
  }

  return { data, error: (error ?? null) as EdgeResult<T>['error'] };
}
