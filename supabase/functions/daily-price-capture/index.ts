/**
 * Daily price snapshot.
 *
 * This function used to walk the `cards` table and fetch Scryfall ONE CARD AT A
 * TIME with a 125 ms delay (8 req/s). With its default limit of 5000 that is
 * 625 s of sleeping alone, against an edge wall clock of ~150 s, so it died
 * mid-loop after ~400 cards every night. The `hasMore` self-chaining that would
 * have advanced the offset sat AFTER the loop and therefore never ran: the
 * offset never left 0, and the same first ~400 cards (ordered by `id`) were
 * re-captured forever. Measured result: 701 of 34,088 cards had any history,
 * and only 14 of the 583 cards users actually own, wishlist, deck or list.
 * A `BATCH_SIZE = 75` constant (Scryfall's bulk /cards/collection limit) was
 * declared and never referenced.
 *
 * None of that Scryfall traffic was necessary. `scryfall-sync` already
 * refreshes `cards.prices` nightly — 33,903 of 34,088 rows touched within two
 * days — so the snapshot is a pure INSERT ... SELECT over a table we already
 * hold. `public.capture_daily_prices()` does it set-based: measured 2,884 rows
 * in 2.5 s for scope 'relevant', 34,088 rows in 1.6 s for scope 'all'.
 *
 * pg_cron job 1 now calls that function directly in SQL and does not touch this
 * endpoint at all. This wrapper remains only so a manual/admin trigger hits the
 * same correct path rather than the old loop.
 *
 * Scope semantics (see the repoint migration for the storage arithmetic):
 *   'relevant' - every card in user_collections / wishlist / deck_cards /
 *                listings, plus every card priced >= p_min_usd.
 *   'all'      - the entire catalogue. ~5.1 GB/year; use deliberately.
 *
 * WHY THE SCOPE OVERRIDE IS AUTHENTICATED
 * This function is deployed with `verify_jwt = false` (supabase/config.toml),
 * so anybody on the internet holding the publishable anon key can invoke it.
 * That was survivable while the body was the old Scryfall loop: a hostile call
 * bought ~400 rate-limited fetches and then died on the wall clock. It is not
 * survivable now that the body is a set-based RPC. `?scope=all` would let an
 * unauthenticated caller write all 34,088 rows in ~1.6 s, repeatedly — a 12x
 * jump over the 2,884-row policy the repoint migration costed out at ~430
 * MB/year, and a cheap way to keep the database busy. So the query string may
 * only widen scope when the caller presents the service-role key; everyone
 * else gets the documented default no matter what they ask for.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_SCOPES = new Set(["relevant", "all"]);

const DEFAULT_SCOPE = "relevant";
const DEFAULT_MIN_USD = 5;

/**
 * True only for a caller presenting the service-role key, in either the
 * `Authorization: Bearer` or the `apikey` header. Compared against the secret
 * this function already holds, so no extra configuration is involved.
 */
function isServiceRoleCaller(req: Request): boolean {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) return false;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const apiKey = req.headers.get("apikey")?.trim();
  return bearer === serviceKey || apiKey === serviceKey;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);
  const privileged = isServiceRoleCaller(req);

  let scope = DEFAULT_SCOPE;
  let minUsd = DEFAULT_MIN_USD;

  if (privileged) {
    const rawScope = url.searchParams.get("scope") ?? DEFAULT_SCOPE;
    scope = VALID_SCOPES.has(rawScope) ? rawScope : DEFAULT_SCOPE;

    const rawMinUsd = Number.parseFloat(String(url.searchParams.get("min_usd") ?? DEFAULT_MIN_USD));
    minUsd = Number.isFinite(rawMinUsd) && rawMinUsd >= 0 ? rawMinUsd : DEFAULT_MIN_USD;
  }

  console.log(
    `Daily price capture: scope=${scope} min_usd=${minUsd} privileged=${privileged}`,
  );

  const startedAt = Date.now();
  const { data, error } = await supabase.rpc("capture_daily_prices", {
    p_scope: scope,
    p_min_usd: minUsd,
  });

  if (error) {
    console.error("capture_daily_prices failed:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(`Capture complete in ${elapsedMs} ms:`, data);

  return new Response(
    JSON.stringify({ success: true, elapsedMs, ...(data as Record<string, unknown>) }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
