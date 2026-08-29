/**
 * An INDEPENDENT prober for the deployed Tutor endpoint.
 *
 * WHY A SECOND HARNESS EXISTS
 * ---------------------------
 * `tutor-fifty-run.mjs` recorded fifty answers and a review then scored those
 * recordings. A recording can be stale, mis-transcribed or selectively quoted,
 * and none of those faults are visible from inside the file that holds it. So
 * this script asks the live function again, from scratch, and prints what comes
 * back with no scoring and no interpretation. It shares no code with the other
 * harness on purpose; the only thing the two have in common is the request
 * shape, which is copied from `generateResponse` in `src/pages/Tutor.tsx`.
 *
 * Usage:
 *   node scripts/tutor-refute-probe.mjs --file=scripts/tutor-refute-asks.json
 *   node scripts/tutor-refute-probe.mjs --q="What does Sol Ring do?" [--deck=atraxa]
 *
 * `--deck` names a key in `scratch/tutor-decks.json`, mapped by index: 0 is the
 * Atraxa deck, 1 is the Ulamog deck. Deck rows go through the SAME `enrich`
 * mapping the page applies, so the body is the one a player's browser sends.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const summaries = JSON.parse(fs.readFileSync(path.join(root, 'scratch/tutor-decks.json'), 'utf8'));

function enrich(summary) {
  return {
    ...summary,
    cards: (summary.cards ?? []).map(dc => ({
      name: dc.card_name,
      quantity: dc.quantity || 1,
      is_commander: dc.is_commander,
      is_sideboard: dc.is_sideboard,
      type_line: dc.card_data?.type_line ?? undefined,
      mana_cost: dc.card_data?.mana_cost ?? undefined,
      cmc: dc.card_data?.cmc ?? undefined,
      oracle_text: dc.card_data?.oracle_text ?? undefined,
      produced_mana: dc.card_data?.produced_mana ?? undefined,
      card_data: dc.card_data
        ? {
            type_line: dc.card_data.type_line ?? undefined,
            mana_cost: dc.card_data.mana_cost ?? undefined,
            oracle_text: dc.card_data.oracle_text ?? undefined,
            cmc: dc.card_data.cmc ?? undefined,
            produced_mana: dc.card_data.produced_mana ?? undefined,
            prices: dc.card_data.prices ?? undefined,
            edhrec_rank: dc.card_data.edhrec_rank ?? undefined,
          }
        : undefined,
    })),
  };
}

const DECKS = {
  atraxa: enrich(summaries['0'] ?? summaries[0]),
  ulamog: enrich(summaries['1'] ?? summaries[1]),
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function ask(message, deckKey = null, cardInFocus = null) {
  const deck = deckKey ? DECKS[deckKey] ?? null : null;
  if (deckKey && !deck) throw new Error(`no deck for ${deckKey}`);

  const body = {
    message: cardInFocus ? `CARD IN FOCUS: ${cardInFocus}\n\n${message}` : message,
    deckContext: deck,
    conversationHistory: [],
    responseStyle: 'concise',
    conversationId: null,
  };

  const started = Date.now();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/mtg-brain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const ms = Date.now() - started;
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* a non-JSON body is a finding, not a crash */
  }
  return {
    question: message,
    deck: deckKey,
    http_status: res.status,
    wall_clock_ms: ms,
    answered_from: data?.answeredFrom ?? null,
    routing: data?.routing ?? null,
    standing: data?.standing ?? null,
    cards: (data?.cards ?? []).map(c => c.name),
    charts: (data?.visualData?.charts ?? []).length,
    message: data?.message ?? text,
  };
}

async function main() {
  const fileArg = process.argv.find(a => a.startsWith('--file='));
  const qArg = process.argv.find(a => a.startsWith('--q='));
  const deckArg = process.argv.find(a => a.startsWith('--deck='));
  const outArg = process.argv.find(a => a.startsWith('--out='));

  let asks = [];
  if (fileArg) {
    asks = JSON.parse(fs.readFileSync(path.resolve(root, fileArg.slice('--file='.length)), 'utf8'));
  } else if (qArg) {
    asks = [{ id: 'ad-hoc', q: qArg.slice('--q='.length), deck: deckArg ? deckArg.slice('--deck='.length) : null }];
  } else {
    console.error('give --file= or --q=');
    process.exit(1);
  }

  const out = [];
  for (const a of asks) {
    const r = await ask(a.q, a.deck ?? null, a.card ?? null);
    out.push({ id: a.id ?? null, why: a.why ?? null, ...r });
    console.log(`\n===== ${a.id ?? ''} [${r.http_status} ${r.wall_clock_ms}ms from=${r.answered_from} route=${r.routing?.ask ?? 'none'}${r.routing?.subject ? '/' + r.routing.subject : ''}]`);
    console.log(`Q: ${a.q}${a.deck ? `   (deck: ${a.deck})` : ''}`);
    console.log(`A: ${r.message}`);
    await sleep(900); // do not hammer the function
  }

  if (outArg) {
    fs.writeFileSync(path.resolve(root, outArg.slice('--out='.length)), JSON.stringify(out, null, 2));
    console.log(`\nwrote ${out.length} to ${outArg.slice('--out='.length)}`);
  }
}

// Windows paths make the usual `file://${argv[1]}` comparison fail, so compare
// resolved paths instead. Getting this wrong makes the script exit silently,
// which reads as "it ran and found nothing".
if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] ?? '')) {
  await main();
}
