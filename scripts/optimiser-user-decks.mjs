/**
 * The DEPLOYED optimiser, run against the decks that are actually in
 * `user_decks` on the live project.
 *
 * `scripts/optimiser-real-decks.mjs` ran precons out of `meta_decks`, which are
 * real lists but not lists anybody on this site built. These five are the only
 * rows in `user_decks` that carry cards at all, so they are the whole of what a
 * player has ever handed this tool.
 *
 * The decklists are in `.shots/opt-user/decks.json`, dumped from `deck_cards`
 * (which `anon` cannot read, so they cannot be fetched here) and checked row
 * count against the table before being written.
 *
 * Two defects are being re-checked in particular, because both were fixed and
 * neither has been looked at by a person since:
 *
 *   1. It told every 100-card deck to ADD lands it had no room for.
 *   2. Every suggestion cited the SAME role gap, the tenth still saying
 *      "fills a wincon gap (0 of 3)" for a deck that would by then hold seven.
 *
 * And two numbers that were null and are now computed: `projectedPowerLevel`
 * and `edhImpact`. The check that matters for those is that they MOVE, and are
 * not the current score handed back under another name.
 *
 *   node scripts/optimiser-user-decks.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';
const OUT = path.resolve('.shots/opt-user');
const DECKS = JSON.parse(fs.readFileSync(path.join(OUT, 'decks.json'), 'utf8'));

async function rest(q) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

/** The catalogue row for every name in the deck, so the payload matches the client's. */
async function enrich(names) {
  const out = new Map();
  for (let i = 0; i < names.length; i += 40) {
    const chunk = names.slice(i, i + 40);
    const rows = await rest(
      `cards_unique?name=in.(${chunk.map(n => `"${n.replace(/"/g, '\\"')}"`).join(',')})` +
        `&select=name,type_line,mana_cost,cmc,color_identity&limit=200`
    );
    for (const r of rows) if (!out.has(r.name)) out.set(r.name, r);
  }
  return out;
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
    /* a non-JSON body is itself the finding */
  }
  return { ok: res.ok, status: res.status, ms: Date.now() - started, body, raw: body ? null : text.slice(0, 800) };
}

fs.mkdirSync(OUT, { recursive: true });
const index = [];

for (const d of DECKS) {
  process.stderr.write(`${d.name.slice(0, 40)} … `);
  const names = [...new Set([...d.cards.map(c => c[0]), d.commander])];
  const rows = await enrich(names);
  const missing = names.filter(n => !rows.has(n));

  const cmdrRow = rows.get(d.commander);
  const deckContext = {
    id: d.id,
    name: d.name,
    format: d.format,
    commander: cmdrRow
      ? {
          name: cmdrRow.name,
          type_line: cmdrRow.type_line,
          mana_cost: cmdrRow.mana_cost,
          cmc: Number(cmdrRow.cmc) || 0,
          color_identity: cmdrRow.color_identity,
        }
      : d.commander,
    cards: d.cards.map(([name, qty]) => {
      const r = rows.get(name);
      return {
        name,
        type_line: r?.type_line ?? null,
        mana_cost: r?.mana_cost ?? null,
        cmc: Number(r?.cmc) || 0,
        quantity: qty,
      };
    }),
    power: null,
  };

  const runs = [];
  for (let i = 0; i < 2; i++) runs.push(await optimise(deckContext));
  const r = runs[0];
  process.stderr.write(`${r.status} ${r.ms} ms / ${runs[1].ms} ms\n`);

  fs.writeFileSync(
    path.join(OUT, `${d.id}.json`),
    JSON.stringify(
      {
        deck: { id: d.id, name: d.name, commander: d.commander, cards: d.cards, missingFromCatalogue: missing },
        timingsMs: runs.map(x => x.ms),
        statuses: runs.map(x => x.status),
        response: r.body,
        secondResponse: runs[1].body,
        raw: r.raw,
      },
      null,
      2
    )
  );
  index.push({ id: d.id, name: d.name, status: r.status, ms: runs.map(x => x.ms), missing: missing.length });
}

fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2));
console.log(JSON.stringify(index, null, 2));
