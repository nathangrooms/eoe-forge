/**
 * Put the fifty questions in `scripts/tutor-fifty.json` through the REAL Tutor
 * endpoint and write down exactly what came back.
 *
 * WHY THIS POSTS OVER HTTP INSTEAD OF CALLING answerFromCatalogue()
 * ----------------------------------------------------------------
 * "The engine supports it" and "a player can get it" are different claims, and
 * only the second one is worth measuring. Calling the inner function would
 * prove that the answerer works on inputs this file made up. So this sends the
 * same POST `Tutor.tsx` sends, to the deployed function, and records the reply
 * verbatim.
 *
 * The body is copied field for field off `generateResponse` in
 * `src/pages/Tutor.tsx`:
 *
 *   message              the question as typed. (No CARD IN FOCUS block: none
 *                        of the fifty selects a card in the picker.)
 *   deckContext          the deck summary spread flat, with `cards` REPLACED by
 *                        the page's own mapping of `deck_cards` joined to
 *                        `cards`. Same shape, same fields, same order.
 *   conversationHistory  empty. Each question is asked in a fresh chat, which is
 *                        what a player searching one thing does.
 *   responseStyle        'concise'. That is the page default; the detail switch
 *                        starts off.
 *   conversationId       null, a new chat.
 *
 * ONE KNOWN DIVERGENCE, AND IT IS RECORDED IN THE OUTPUT.
 * The page rides the signed-in player's own token on the request, and the
 * function uses it for one thing only: "which of your decks already play this".
 * This harness has the anon key and no session, so that one section is answered
 * as a signed-out caller would be answered. It changes nothing about routing and
 * nothing about any other section. It is written into the output file as
 * `harness.signed_in: false` rather than left for somebody to discover.
 *
 * Deck attachment is real. The two decks named in the question file are read
 * out of `scratch/tutor-decks.json`, which is dumped from `compute_deck_summaries`
 * as the deck's owner, so the counts, the colours, the commander and all 92 or
 * 100 rows are the ones the page would have sent.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

/* `--questions=` and `--out=` so the thirty extra questions go through THIS
   harness rather than a second one. Two harnesses asking the same endpoint two
   slightly different ways is how a score stops being comparable. */
const arg = (name, fallback) => {
  const found = process.argv.find(a => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const questionsPath = path.join(root, arg('questions', 'scripts/tutor-fifty.json'));
const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
const summaries = JSON.parse(
  fs.readFileSync(path.join(root, arg('decks', 'scratch/tutor-decks.json')), 'utf8')
);

/** The page's own mapping, `generateResponse` in Tutor.tsx, line for line. */
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

const decks = {};
for (const [key, meta] of Object.entries(questions.decks)) {
  const found = summaries.find(s => s.id === meta.id);
  if (found) decks[key] = enrich(found);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ask(question) {
  const deck = question.deck ? decks[question.deck] ?? null : null;
  if (question.deck && !deck) throw new Error(`no deck loaded for ${question.deck}`);

  const body = {
    message: question.q,
    deckContext: deck,
    conversationHistory: [],
    responseStyle: 'concise',
    conversationId: null,
  };

  const started = Date.now();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/mtg-brain`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const ms = Date.now() - started;

  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* left null on purpose: a body that is not JSON is a finding, not a crash */
  }

  return {
    id: question.id,
    category: question.category,
    question: question.q,
    deck_attached: question.deck ?? null,
    /* Filled in by the retry loop below. Kept on the row rather than only in
       the log, because a 502 is a real thing a player gets and the count of
       them is a finding in its own right. */
    transport_failures: 0,
    deck_cards_sent: deck ? deck.cards.length : 0,
    prediction: question.prediction,
    http_status: res.status,
    wall_clock_ms: ms,
    answered_from: data?.answeredFrom ?? null,
    standing: data?.standing ?? null,
    routing: data?.routing ?? null,
    basis: data?.basis ?? null,
    cached: data?.cached ?? false,
    cards_attached: Array.isArray(data?.cards) ? data.cards.length : 0,
    card_names: Array.isArray(data?.cards) ? data.cards.map(c => c.name) : [],
    charts: data?.visualData?.charts?.map(c => c.title) ?? [],
    answer: data?.message ?? text,
  };
}

/* `--only q29,q40` reruns a few rows and splices them into the file that is
   already there. One question failed with a socket error on the first pass,
   which is the network and not an answer, and rerunning fifty to recover one
   would put the other forty-nine on a warm cache and make their timings a lie. */
const onlyArg = process.argv.find(a => a.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',')) : null;

const results = [];
for (const question of questions.questions) {
  if (only && !only.has(question.id)) continue;
  process.stderr.write(`${question.id} ... `);

  /* RETRY A TRANSPORT FAILURE, AND COUNT IT.
   *
   * Measured 2026-08-30: twelve of these fifty came back `502 Bad Gateway`
   * from the platform's own load balancer, in two runs of consecutive
   * questions, in about 25 ms each. Asking the same trivial question 25 times
   * reproduced it at six in a row. It is the endpoint being unavailable for a
   * few seconds, not an answer, and scoring it as a routing failure would
   * blame the router for the platform.
   *
   * So a non-200 is retried up to three times, and the number of failures is
   * written onto the row. Hiding the retry would be worse than not retrying:
   * a 502 is what a player actually gets, and the count belongs in the report.
   */
  let row = null;
  let failures = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const got = await ask(question);
      if (got.http_status === 200) {
        row = { ...got, transport_failures: failures };
        break;
      }
      failures++;
      row = { ...got, transport_failures: failures };
    } catch (error) {
      failures++;
      row = { id: question.id, question: question.q, error: String(error), transport_failures: failures };
    }
    await sleep(3000);
  }
  process.stderr.write(
    `${row.wall_clock_ms ?? '?'}ms ${row.answered_from ?? `http ${row.http_status ?? 'error'}`}` +
      ` ask=${row.routing?.ask ?? 'none'}${failures ? ` (${failures} retried)` : ''}\n`
  );
  results.push(row);
  /* One at a time with a gap. This database has twice been pushed over by work
     that looked affordable, and every one of these is a read across `cards`. */
  await sleep(1200);
}

const outPath = path.join(root, arg('out', 'scripts/tutor-fifty-answers.json'));

let merged = results;
if (only && fs.existsSync(outPath)) {
  const before = JSON.parse(fs.readFileSync(outPath, 'utf8')).results ?? [];
  const fresh = new Map(results.map(r => [r.id, r]));
  merged = before.map(r => fresh.get(r.id) ?? r);
}

const out = {
  title: questions.title ?? 'Real Magic questions, put through the deployed Tutor endpoint',
  asked_from: path.relative(root, questionsPath).replace(/\\/g, '/'),
  ran: new Date().toISOString(),
  endpoint: `${SUPABASE_URL}/functions/v1/mtg-brain`,
  transport_failures: merged.reduce((n, r) => n + (r.transport_failures ?? 0), 0),
  harness: {
    path: 'HTTP POST, the same body src/pages/Tutor.tsx sends from generateResponse',
    retries: 'a non-200 is asked again up to three times; the count is on each row as transport_failures',
    signed_in: false,
    signed_in_note:
      'The anon key with no session. The function uses the caller token for one section only, which decks of yours already play this card. Every other section is unaffected.',
    conversation_history: 'empty for every question; each is a fresh chat',
    response_style: 'concise, the page default',
  },
  results: merged,
};

fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
process.stderr.write(
  `\nwrote ${out.asked_from ? path.relative(root, outPath).replace(/\\/g, '/') : outPath}` +
    ` (${merged.length} rows, ${results.length} asked this run, ${out.transport_failures} transport failures retried)\n`
);
