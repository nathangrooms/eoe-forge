/**
 * The Deno globals the edge functions use, declared for `tsc`.
 *
 * `tsconfig.app.json` type-checks `supabase/functions/` along with `src/`,
 * because the engine is vendored into four of those functions and a drifted
 * copy should fail the check. It has no Deno lib, so every `Deno.env.get`
 * read was an error — ONE permanent error, printed on every run, which is the
 * kind a person learns to scroll past. It hid three real errors of mine
 * between 31 Aug and 3 Sep 2026, though the thing that hid them best was
 * `node_modules/.bin` being missing entirely, so `npx tsc` resolved to a
 * different package and printed "This is not the tsc command you are looking
 * for" while every session read that as a pass.
 *
 * Deliberately the SMALLEST surface that compiles rather than the real Deno
 * types: a full lib would also declare `fetch`, `Response` and friends and
 * quietly override the DOM ones the app half of this check needs.
 */
declare const Deno: {
  env: { get(key: string): string | undefined };
};
