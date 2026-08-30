/**
 * Does Tutor obey a number and a price cap in the question?
 *
 * Scoring the fifty found question 22 answering an easier question than the one
 * asked: it was given "ten" and "under five dollars" and returned neither ten
 * cards nor a list that respected the cap. Nothing in the house style told it
 * to, so it was not really the model's fault. A rule was added, and this
 * measures whether the rule took.
 *
 * The check is mechanical rather than a reading, because "did it obey" is a
 * countable question:
 *
 *   count   the card names in the answer, resolved against the catalogue so a
 *           sentence mentioning a card twice is not two cards
 *   price   every named card's cheapest USD printing, from `cards`, against the
 *           cap in the question
 *
 * A card with no USD price on file is NOT a violation and is reported
 * separately. Around a thousand printings carry no quote, and treating a
 * missing price as zero is the exact bug CLAUDE.md records costing us a
 * $0.00 Shivan Dragon.
 *
 * Run: node scripts/tutor-limits-probe.mjs
 */
import process from 'node:process';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

/** The questions, each carrying the limit it states so the check is not a guess. */
const ASKS = [
  { id: 'l1', q: 'Name ten green ramp cards for Commander, each under five dollars.', count: 10, maxUsd: 5 },
  { id: 'l2', q: 'Give me five budget board wipes under three dollars.', count: 5, maxUsd: 3 },
  { id: 'l3', q: 'What are the three best white removal spells under two dollars?', count: 3, maxUsd: 2 },
  { id: 'l4', q: 'List seven blue card draw spells.', count: 7, maxUsd: null },
  { id: 'l5', q: 'Recommend four artifact tutors under ten dollars.', count: 4, maxUsd: 10 },
];

const GATEWAY = new Set([502, 503, 504]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ask(question) {
  /* Same retry the product now carries, so a gateway refusal is not read as a
     failure to obey a limit. */
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/mtg-brain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
      body: JSON.stringify({
        message: question,
        conversationHistory: [],
        responseStyle: 'concise',
        conversationId: null,
      }),
    });
    if (GATEWAY.has(res.status)) {
      await sleep(attempt === 0 ? 250 : 650);
      continue;
    }
    const text = await res.text();
    try {
      return { status: res.status, data: JSON.parse(text) };
    } catch {
      return { status: res.status, data: null, raw: text.slice(0, 400) };
    }
  }
  return { status: 502, data: null, raw: 'gateway refused three times' };
}

/**
 * Which of these guesses are real cards, and what the cheapest USD printing
 * costs.
 *
 * The two answers are kept apart on purpose, and an earlier version of this
 * file conflated them and reported nonsense: it filled every unmatched guess
 * with `null` and then filtered on `has()`, so a Title Case phrase that is not
 * a card counted as a card with no price. It said Tutor named 18 cards for a
 * question that listed 10.
 *
 * `found` answers "is this a card". `price` answers "what does it cost", and a
 * card genuinely carrying no USD quote stays out of it rather than becoming a
 * zero. Around a thousand printings have no quote; treating one as $0.00 is
 * the bug that printed a $0.00 Shivan Dragon.
 */
async function resolve(names) {
  const found = new Set();
  const price = new Map();
  if (!names.length) return { found, price };

  const inList = names.map(n => `"${n.replace(/"/g, '')}"`).join(',');
  const url =
    `${SUPABASE_URL}/rest/v1/cards?select=name,prices&name=in.(${encodeURIComponent(inList)})&limit=1000`;
  const res = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  if (!res.ok) return { found, price };

  for (const row of await res.json()) {
    found.add(row.name);
    const raw = row?.prices?.usd;
    if (raw === null || raw === undefined || raw === '') continue;
    const usd = Number(raw);
    if (!Number.isFinite(usd)) continue;
    const seen = price.get(row.name);
    if (seen === undefined || usd < seen) price.set(row.name, usd);
  }
  return { found, price };
}

/**
 * The card names the answer actually names.
 *
 * Read out of the prose rather than from a "Referenced Cards" section, which is
 * how the function itself resolves them, then confirmed against the catalogue
 * so a capitalised phrase that is not a card is not counted as one.
 */
function candidateNames(text) {
  const out = new Set();
  /* The shape a list answer is actually written in, which is regular:
       1. Blasphemous Act {8}{R} $0.78, rank 22
     The name ends at the mana cost or the price, and an earlier version that
     stopped at the first comma kept "{B}{B} $1.73" on the end of Damn and
     resolved nothing, so a five card answer measured as three. */
  for (const m of text.matchAll(/^\s*(?:[-*]|\d+[.)])\s+([^{$\n]+?)\s*(?=[{$]|$)/gm)) out.add(m[1].trim());
  /* Bold and plainer list forms. */
  for (const m of text.matchAll(/\*\*([^*]{3,60})\*\*/g)) out.add(m[1].trim());
  for (const m of text.matchAll(/^\s*(?:[-*]|\d+[.)])\s+([A-Z][^,.:;(\n]{2,50})/gm)) out.add(m[1].trim());
  /* Then any Title Case run of two or more words, which catches inline prose. */
  for (const m of text.matchAll(/\b([A-Z][a-z'’]+(?:[ -](?:of|the|and|to|in|for|a)?\s*[A-Z][a-z'’]+)+)\b/g)) {
    out.add(m[1].trim());
  }
  return [...out].map(s => s.replace(/\s*\(.*$/, '').replace(/[*_`]/g, '').trim()).filter(Boolean);
}

async function main() {
  const rows = [];
  for (const a of ASKS) {
    const { status, data, raw } = await ask(a.q);
    const answer = String(data?.message ?? data?.response ?? raw ?? '');

    const guesses = candidateNames(answer);
    const { found, price } = await resolve(guesses);
    /* A guess that resolves to nothing in `cards` was never a card. */
    const real = guesses.filter(n => found.has(n));

    const overCap =
      a.maxUsd === null ? [] : real.filter(n => price.has(n) && price.get(n) > a.maxUsd);
    const unpriced = real.filter(n => !price.has(n));

    rows.push({
      id: a.id,
      status,
      asked: a.count,
      named: real.length,
      countOk: real.length === a.count,
      cap: a.maxUsd,
      overCap: overCap.map(n => `${n} $${price.get(n).toFixed(2)}`),
      unpriced: unpriced.length,
      q: a.q,
      answer: answer.slice(0, 700),
    });

    console.log(
      `${a.id}  http ${status}  asked ${a.asked ?? a.count}  named ${real.length}` +
        `  ${real.length === a.count ? 'COUNT OK' : 'COUNT WRONG'}` +
        (a.maxUsd === null
          ? ''
          : `  cap $${a.maxUsd}  over ${overCap.length}${overCap.length ? ' -> ' + overCap.map(n => n + ' $' + price.get(n).toFixed(2)).join(', ') : ''}`) +
        (unpriced.length ? `  unpriced ${unpriced.length}` : '')
    );
  }

  const countOk = rows.filter(r => r.countOk).length;
  const capOk = rows.filter(r => r.cap !== null && r.overCap.length === 0).length;
  const capAsks = rows.filter(r => r.cap !== null).length;
  console.log(`\ncount honoured  ${countOk}/${rows.length}`);
  console.log(`cap honoured    ${capOk}/${capAsks}`);

  for (const r of rows.filter(x => !x.countOk || x.overCap.length)) {
    console.log(`\n--- ${r.id} ${r.q}`);
    console.log(r.answer);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
