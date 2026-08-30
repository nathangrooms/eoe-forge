/**
 * Call an edge function, and try again when the PLATFORM refuses rather than
 * the function.
 *
 * ## Why this exists
 *
 * Measured against the deployed Tutor on 2026-08-30 while scoring 80 real
 * questions: **12 of the first 50 came back `502 Bad Gateway` in 24 to 151
 * milliseconds.** Reproduced on its own by asking the same trivial question 25
 * times, which gave 19 answers and **6 CONSECUTIVE 502s**.
 *
 * A 502 arriving in 24 ms is not the function failing. The function takes about
 * half a second to answer; nothing that returns in 24 ms ever reached it. It is
 * the load balancer in front, and the next attempt usually works.
 *
 * Nothing retried. The page printed its own "something went wrong" and the
 * player saw a product that fails roughly one question in six, for a reason
 * that had nothing to do with their question.
 *
 * ## What is and is not retried
 *
 * ONLY the gateway statuses, and only when the body is empty or not ours.
 * A 4xx is the request being wrong and will be wrong again. A 500 raised BY the
 * function carries our own JSON error and means the work was attempted; sending
 * it again would repeat whatever went wrong and could repeat a side effect. A
 * 546 is the resource limit, which a retry cannot help and which the deck
 * generator surfaces deliberately.
 *
 * ## Why the delays look like this
 *
 * Short, because a person is watching a spinner. Three attempts and about
 * 900 ms of waiting in the worst case, which is inside the time an answer takes
 * anyway, so a recovered call still feels like one slow answer rather than a
 * failure. Beyond that the honest thing is to tell the player.
 */
const GATEWAY_STATUSES = new Set([502, 503, 504]);
const RETRY_DELAYS_MS = [250, 650];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** How a Supabase FunctionsHttpError carries the status, when it does. */
function statusOf(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const withContext = error as { context?: { status?: unknown }; status?: unknown };
  const raw = withContext.context?.status ?? withContext.status;
  return typeof raw === 'number' ? raw : null;
}

/**
 * True when the failure came from the gateway rather than from our code.
 *
 * The status is checked first because it is unambiguous. The message is a
 * fallback for the shape where supabase-js reports only
 * "Edge Function returned a non-2xx status code", which is what a 502 looks
 * like from the client when no body came back at all.
 */
function isGatewayFailure(error: unknown): boolean {
  const status = statusOf(error);
  if (status !== null) return GATEWAY_STATUSES.has(status);

  const message = error instanceof Error ? error.message : String(error ?? '');
  return /\b(502|503|504)\b|bad gateway|service unavailable|gateway time-?out/i.test(message);
}

export interface InvokeResult<T> {
  data: T | null;
  error: unknown;
  /** How many gateway refusals were ridden out. 0 on a first-attempt answer. */
  retries: number;
}

export interface InvokeOptions {
  body?: unknown;
  headers?: Record<string, string>;
  /**
   * What actually makes the call.
   *
   * REQUIRED, and this module imports no client of its own on purpose. Two
   * reasons, and the second is why it is not merely tidy: the retry rules are
   * the thing worth testing and they can be tested with no network, and this
   * file cannot import `@/integrations/supabase/client` because `node:test`
   * does not resolve the `@/` alias, so a module that reached for it would be
   * a module with no tests at all.
   *
   * `askEdgeFunction` in `edgeInvoke.ts` binds the real client.
   */
  invoke: (fn: string, options: { body?: unknown; headers?: Record<string, string> })
    => Promise<{ data: unknown; error: unknown }>;
  /** Overridable so a test does not spend a second sleeping. */
  delaysMs?: readonly number[];
}

/**
 * `supabase.functions.invoke`, with the gateway retried.
 *
 * Returns the same `{ data, error }` every caller already destructures, plus a
 * count of what it absorbed so a caller can log it. It never throws for a
 * reason `invoke` would not have thrown for.
 */
export async function invokeWithRetry<T = unknown>(
  fn: string,
  options: InvokeOptions
): Promise<InvokeResult<T>> {
  const { invoke, delaysMs = RETRY_DELAYS_MS, ...rest } = options;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    const { data, error } = await invoke(fn, rest);

    if (!error) return { data: data as T, error: null, retries: attempt };

    lastError = error;
    if (!isGatewayFailure(error)) break;
    if (attempt === delaysMs.length) break;

    await sleep(delaysMs[attempt]);
  }

  return { data: null, error: lastError, retries: 0 };
}
