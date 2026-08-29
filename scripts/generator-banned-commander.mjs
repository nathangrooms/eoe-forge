/**
 * Does the deployed generator refuse a commander that is banned in Commander?
 *
 * The colour probe already sent it Golos, Tireless Pilgrim, which is banned,
 * and the only thing that came back was the CPU limit, so nothing there proves
 * a legality gate exists or is missing. These five are banned AND cheap enough
 * in colour identity that the build finishes, so the answer is unambiguous.
 *
 * Ban list read from Scryfall, banned:commander, 83 cards on 2026-08-29.
 *
 *   node scripts/generator-banned-commander.mjs
 */
const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';
const ENDPOINT = `${SUPABASE_URL}/functions/v1/ai-deck-builder-v2`;

const PROBES = [
  { name: 'Griselbrand', ci: ['B'] },
  { name: 'Emrakul, the Aeons Torn', ci: [] },
  { name: 'Iona, Shield of Emeria', ci: ['W'] },
  { name: 'Rofellos, Llanowar Emissary', ci: ['G'] },
  { name: 'Erayo, Soratami Ascendant', ci: ['U'] },
];

for (const p of PROBES) {
  const started = Date.now();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ANON}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commander: { name: p.name, color_identity: p.ci, colors: p.ci },
      archetype: 'value', style: 'balanced', powerLevel: 7, useAIPlanning: true, includeLands: true,
    }),
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* the body itself is the finding */ }
  const deck = body?.result?.deck;
  const version = res.headers.get('x-engine-version');
  console.log(`${p.name}: ${res.status} ${res.ok ? 'BUILT' : (body?.code ?? body?.error ?? text.slice(0, 80))}` +
    (deck ? ` — ${deck.reduce((a, c) => a + (c.quantity || 1), 0)} cards, engine ${version}` : '') +
    ` (${Date.now() - started} ms)`);
  if (body?.result?.validation) console.log(`    validation: ${JSON.stringify(body.result.validation.blocking)} ${JSON.stringify(body.result.validation.issues)}`);
}
