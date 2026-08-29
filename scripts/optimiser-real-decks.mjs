/**
 * The DEPLOYED optimiser, against decks somebody actually built.
 *
 * The two defects the optimiser was fixed for are the ones a player would have
 * spotted first, so they are the ones checked first here:
 *
 *   1. It told every 100-card deck to ADD lands it had no room for.
 *   2. All ten suggestions cited the SAME role gap, the tenth still saying
 *      "fills a wincon gap (0 of 3)" for a deck that would by then hold seven.
 *
 * The decks are real precon lists out of `meta_decks`, fetched here over
 * PostgREST rather than typed out, so the input is a deck a person owns rather
 * than a fixture. Precons are also the honest test case: they are what most
 * players hand a deck tool, and they have obvious upgrades, so an optimiser
 * with nothing useful to say about a precon has nothing useful to say.
 *
 *   node scripts/optimiser-real-decks.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';
const OUT = path.resolve('.shots/opt-real');

/** Precons chosen to span colour count and strategy, newest first. */
const DECKS = [
  { id: 'f10c0348-5fbc-4ebc-a598-54ad596b170b', label: 'Goblin Storm (Zada, mono red)' },
  { id: 'dea85a60-99b1-4f98-a6c4-ddbff8930b31', label: 'Lorehold Spirit (Quintorius, RW)' },
  { id: 'b789ded6-e931-4d27-aa71-f7c090bada22', label: 'Quandrix Unlimited (Zimone, GU)' },
  { id: '7aac70f9-c26e-40ef-8d68-3afd1cf46fad', label: 'Wakanda Forever (T Challa, 2 colours)' },
  { id: '817091f9-8e03-47ca-9f10-f6a16d409aa0', label: 'Doom Prevails (Doctor Doom, 3 colours)' },
  { id: 'bb8cd4a4-e9b9-4777-838a-7c73cc26c587', label: 'The Fantastic Four (Invisible Woman, 4 colours)' },
];

async function rest(pathAndQuery) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

/** Page past PostgREST's 1000-row cap, the same way the functions do. */
async function loadDeck(id) {
  const meta = await rest(
    `meta_decks?id=eq.${id}&select=id,name,commander_oracle_ids,total_cards`
  );
  const rows = await rest(
    `meta_deck_cards?deck_id=eq.${id}&select=oracle_id,quantity&limit=1000`
  );
  const oracleIds = [...new Set(rows.map(r => r.oracle_id))];
  const cards = [];
  for (let i = 0; i < oracleIds.length; i += 60) {
    const chunk = oracleIds.slice(i, i + 60);
    const got = await rest(
      `cards_unique?oracle_id=in.(${chunk.map(x => `"${x}"`).join(',')})` +
        `&select=oracle_id,name,type_line,mana_cost,cmc,color_identity&limit=1000`
    );
    cards.push(...got);
  }
  const byOracle = new Map(cards.map(c => [c.oracle_id, c]));
  const commanderOracle = meta[0].commander_oracle_ids?.[0] ?? null;
  const commanderRow = commanderOracle ? byOracle.get(commanderOracle) : null;

  const deckCards = [];
  for (const r of rows) {
    const c = byOracle.get(r.oracle_id);
    if (!c) continue;
    if (commanderOracle && r.oracle_id === commanderOracle) continue;
    deckCards.push({
      name: c.name,
      type_line: c.type_line,
      mana_cost: c.mana_cost,
      cmc: Number(c.cmc) || 0,
      quantity: r.quantity ?? 1,
    });
  }
  return { meta: meta[0], commanderRow, deckCards };
}

async function optimise(deckContext) {
  const started = Date.now();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/deck-optimizer`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ANON}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ deckContext, edhAnalysis: null, useCollection: false, collectionCards: [] }),
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON body is itself the finding */
  }
  return {
    ok: res.ok,
    status: res.status,
    ms: Date.now() - started,
    engineVersion: res.headers.get('x-engine-version'),
    body,
    raw: body ? null : text.slice(0, 1200),
  };
}

fs.mkdirSync(OUT, { recursive: true });
const index = [];
for (const d of DECKS) {
  process.stderr.write(`loading ${d.label} … `);
  const loaded = await loadDeck(d.id);
  const total = loaded.deckCards.reduce((s, c) => s + c.quantity, 0);
  const deckContext = {
    id: d.id,
    name: loaded.meta.name,
    format: 'commander',
    commander: loaded.commanderRow
      ? {
          name: loaded.commanderRow.name,
          type_line: loaded.commanderRow.type_line,
          mana_cost: loaded.commanderRow.mana_cost,
          cmc: Number(loaded.commanderRow.cmc) || 0,
          color_identity: loaded.commanderRow.color_identity ?? [],
        }
      : null,
    cards: loaded.deckCards,
    power: null,
  };
  process.stderr.write(`${total} cards, commander ${deckContext.commander?.name ?? 'NONE'} … `);
  const r = await optimise(deckContext);
  fs.writeFileSync(path.join(OUT, `${d.id}.json`), JSON.stringify({ deckContext, response: r }, null, 2));
  process.stderr.write(`${r.ok ? 'ok' : `FAILED ${r.status}`} ${r.ms}ms\n`);
  index.push({
    label: d.label,
    id: d.id,
    commander: deckContext.commander?.name ?? null,
    colours: (deckContext.commander?.color_identity ?? []).length,
    deckSize: total,
    ok: r.ok,
    status: r.status,
    ms: r.ms,
    engineVersion: r.engineVersion,
    error: r.body?.error ?? null,
  });
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2));
console.log(JSON.stringify(index, null, 2));
