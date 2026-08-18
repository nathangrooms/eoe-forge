import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Retired.
 *
 * This function used to be a hand-copied Deno re-implementation of
 * `src/lib/deckbuilder/score/edh-power-calculator.ts`. It copied the weights,
 * the logistic parameters and the band cuts faithfully — and then extracted
 * completely different features: seven inline tutors instead of the curated
 * `catalog.tutors.json`, ten fast-mana names instead of `staples.json`, no
 * manabase analysis at all (`mana = fastMana * 6 + lowCurve * 0.8`), and
 * `stax_pressure` hardcoded to 0 behind a "Simplified for now" comment.
 *
 * Measured on one identical 99-card commander deck the two engines returned
 * 6.6 / band "high" and 6.2 / band "mid" — and this one was the only code that
 * wrote a *computed* value into `user_decks.power_level`, from a body of
 * subscores that disagreed with the real model on nearly every axis
 * (speed 58 vs 90, mana 98 vs 30, synergy 0 vs 40).
 *
 * It also had zero callers anywhere in `src/`, so the column it existed to
 * maintain was never maintained.
 *
 * The single producer of a deck's power score is now `computeDeckPower` in
 * `src/lib/deck/power.ts`, and the single writer of the stored score is
 * `persistDeckPower` in the same module.
 *
 * The endpoint is kept rather than the directory deleted so that deploying
 * *removes* the divergent scorer from production, instead of leaving the last
 * build of it serving traffic and writing to `power_level` behind the app's
 * back.
 */
const RETIREMENT_NOTICE = {
  error: 'calculate-deck-power has been retired',
  detail:
    'Deck power is computed by the DeckMatrix EDH engine (src/lib/deck/power.ts) and ' +
    'persisted by persistDeckPower. This endpoint was a divergent second implementation ' +
    'and returned a different score for the same decklist.',
  replacement: 'src/lib/deck/power.ts → computeDeckPower / persistDeckPower',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(JSON.stringify(RETIREMENT_NOTICE), {
    status: 410,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
