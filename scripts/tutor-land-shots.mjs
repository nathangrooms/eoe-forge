/**
 * Ask Tutor the owner's question, in the real page, and photograph the answer.
 *
 * The session that started all this went:
 *
 *   "Which lands can I upgrade?"
 *   -> a pie chart, and then "please provide a list of the 36 lands you
 *      currently have"
 *
 * So that is the test. Same question, same deck, real `/tutor` page, real
 * `mtg-brain` edge function, real `cards` table. It passes if the answer names
 * lands that are actually in this deck, attaches real cards, and draws no chart.
 *
 * `/tutor` sits behind `ProtectedRoute` and this run has no credentials, which
 * is the same problem `scripts/play-combat-shots.mjs` solved: mount the REAL
 * page with the app's providers and no auth gate. Two reads on this page are
 * RLS-scoped to the signed-in user and so return nothing to a signed-out
 * browser, `user_decks` and `deck_cards`. Those two are served from a fixture
 * captured out of the same database, in `.tmp/tutor-fixture`. Everything else
 * is live: the decklist is joined against the real `cards` table, the question
 * goes to the deployed function, and the answer comes back over the wire.
 *
 *   npx vite --port 8099 &
 *   node scripts/tutor-land-shots.mjs
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = '.shots';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const QUESTION = process.env.QUESTION || 'Which lands can I upgrade?';
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ------------------------------------------------------------------ fixture */

const summary = JSON.parse(fs.readFileSync('.tmp/tutor-fixture/summary.json', 'utf8'));
const deckCardRows = fs
  .readFileSync('.tmp/tutor-fixture/deck-cards.txt', 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map(line => {
    const [card_id, card_name, quantity, is_commander, is_sideboard] = line.split('|');
    return {
      card_id,
      card_name,
      quantity: Number(quantity),
      is_commander: is_commander === '1',
      is_sideboard: is_sideboard === '1',
    };
  });

log(`fixture: ${deckCardRows.length} deck_cards rows, ${summary.counts.lands} lands`);

/* ------------------------------------------------------------------ harness */

const HARNESS_HTML = 'tutor-harness.html';
const HARNESS_ENTRY = 'src/dev/__tutorHarness.tsx';

fs.mkdirSync('src/dev', { recursive: true });

/**
 * Only touch a file when its contents would actually change.
 *
 * This script writes its own harness entry and HTML every run. Vite is watching
 * both, and a rewritten `.html` is not hot-swappable, so the dev server issued a
 * FULL PAGE RELOAD in the middle of the run. The reload wiped React state after
 * the deck had been attached, so the screenshots showed an empty page, the
 * question was typed into a form that no longer existed, and
 * `window.__tutorMemory` read back undefined because the module was still
 * re-executing. Every one of those looked like a bug in the page rather than in
 * the harness, which is exactly why it is worth a comment this long.
 */
const writeIfChanged = (file, contents) => {
  try {
    if (fs.readFileSync(file, 'utf8') === contents) return false;
  } catch {
    /* not there yet */
  }
  fs.writeFileSync(file, contents);
  return true;
};
const htmlChanged = writeIfChanged(
  HARNESS_HTML,
  `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>Tutor harness</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${HARNESS_ENTRY}"></script>
  </body>
</html>
`
);

const entryChanged = writeIfChanged(
  HARNESS_ENTRY,
  `/* Gitignored puppeteer harness for /tutor. Written by
 * scripts/tutor-land-shots.mjs. Not shipped, not routed, not built. */
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import '../index.css';
import { AuthProvider } from '../components/AuthProvider';
import { TooltipProvider } from '../components/ui/tooltip';
import { supabase } from '../integrations/supabase/client';
import { DeckAPI } from '../lib/api/deckAPI';
import Tutor from '../pages/Tutor';

const SUMMARY = ${JSON.stringify(summary)};
const DECK_CARDS = ${JSON.stringify(deckCardRows)};
const FAKE_USER = { id: '00000000-0000-4000-8000-000000000001' };

/* The deck list normally comes from an RPC gated on auth.uid(). */
(DeckAPI as any).getDeckSummaries = async () => [SUMMARY];
(DeckAPI as any).getDeckSummary = async () => SUMMARY;

/* Saved chats live in tables scoped to auth.uid(). Held in memory here so the
   real persistence path in Tutor.tsx is exercised end to end without a session.
   The row level security itself is proven separately, over HTTP, with the anon
   key. */
const memory: any = { tutor_conversations: [], tutor_messages: [] };

const realFrom = supabase.from.bind(supabase);
(supabase as any).from = (table: string) => {
  if (table === 'deck_cards') return thenable(DECK_CARDS);

  if (table === 'tutor_conversations' || table === 'tutor_messages') {
    const store = memory[table];
    const builder: any = {
      _filters: [] as [string, any][],
      _payload: null as any,
      select() { return builder; },
      order() { return builder; },
      limit() { return builder; },
      eq(col: string, val: any) { builder._filters.push([col, val]); return builder; },
      insert(row: any) {
        const created = {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...row,
        };
        store.push(created);
        builder._payload = created;
        return builder;
      },
      delete() {
        builder._payload = 'delete';
        return builder;
      },
      single() {
        return Promise.resolve({ data: builder._payload, error: null });
      },
      then(resolve: any, reject: any) {
        if (builder._payload === 'delete') {
          for (const [col, val] of builder._filters) {
            for (let i = store.length - 1; i >= 0; i--) if (store[i][col] === val) store.splice(i, 1);
          }
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        }
        if (builder._payload) return Promise.resolve({ data: builder._payload, error: null }).then(resolve, reject);
        let rows = store.slice();
        for (const [col, val] of builder._filters) rows = rows.filter((r: any) => r[col] === val);
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };
    return builder;
  }

  return realFrom(table as any);
};

function thenable(rows: any[]) {
  const b: any = {
    select: () => b, eq: () => b, in: () => b, order: () => b, limit: () => b,
    then: (resolve: any, reject: any) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  };
  return b;
}

const realGetUser = supabase.auth.getUser.bind(supabase.auth);
(supabase.auth as any).getUser = async () => ({ data: { user: FAKE_USER }, error: null });

/* Answers are read back out of the page by the driving script. */
(window as any).__tutorMemory = memory;

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <TooltipProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={['/tutor']}>
          <Tutor />
          <Toaster position="top-center" />
        </MemoryRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);
`
);

/* If either file did change, give the dev server time to notice, reload whatever
   it is going to reload, and go quiet again BEFORE the browser opens. */
if (htmlChanged || entryChanged) {
  log('harness files changed, waiting for the dev server to settle');
  await sleep(4000);
} else {
  log('harness files unchanged, no reload to wait for');
}

/* ------------------------------------------------------------------ browser */

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 600000,
  // Subpixel antialiasing puts coloured fringes on thin type over a dark
  // background and reads as a styling bug that is not there.
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1200, deviceScaleFactor: 1 });

/* Refuse a full page reload for the duration of the run.
 *
 * This dev server watches all of `src/`, and `src/` is being edited by other
 * people while this runs. Every one of their saves that Vite cannot hot-swap
 * becomes `location.reload()` in THIS page, which throws away the attached deck
 * and the thread mid-measurement. The symptom is a screenshot of an empty page
 * and a report of "no reply", which reads exactly like the feature being broken.
 *
 * Nothing about the page under test is stubbed here. Only the dev server's
 * ability to yank it out from under the camera. */
await page.evaluateOnNewDocument(() => {
  try {
    Object.defineProperty(location, 'reload', { value: () => {}, configurable: true });
  } catch {
    /* nothing to do: better to run and risk a reload than not to run */
  }
});

/* Do NOT try to block `/@vite/client` to stop Fast Refresh. It was tried: the
   React refresh preamble is served through that same client, so aborting it
   means the app never mounts at all and every selector times out. The reload
   guard above is as far as this can be taken; a concurrent edit to a module this
   page uses will still remount it, so a run that comes back with nothing
   attached is worth simply repeating. */
page.on('pageerror', e => log('  [pageerror]', e.message.slice(0, 200)));
page.on('console', m => {
  if (m.type() === 'error') log('  [console]', m.text().slice(0, 200));
});

let shotN = 0;
const shot = async name => {
  const file = `${OUT}/tutor-${String(shotN++).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  log('  shot ->', file);
  return file;
};

/** The reply the edge function actually returned, straight off the wire. */
let lastReply = null;
page.on('response', async res => {
  if (!res.url().includes('/functions/v1/mtg-brain')) return;
  try {
    lastReply = await res.json();
  } catch {
    /* non-JSON error body */
  }
});

log(`opening ${BASE}/${HARNESS_HTML}`);
await page.goto(`${BASE}/${HARNESS_HTML}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('textarea', { timeout: 60000 });
await sleep(1500);

/* Attach the deck through the picker, the way a player does. */
const clickText = async needle => {
  const handle = await page.evaluateHandle(n => {
    const all = [...document.querySelectorAll('button, [role="button"], [role="option"]')];
    return all.find(el => (el.innerText || '').toLowerCase().includes(n.toLowerCase())) || null;
  }, needle);
  const el = handle.asElement();
  if (!el) return false;
  await el.evaluate(e => e.scrollIntoView({ block: 'center' }));
  await el.click();
  return true;
};

/* The picker is a popover in a portal, so each step is confirmed before the
   next rather than fired blind.

   Waited for, not slept at. `ContextPicker` renders a skeleton with no
   aria-label until the deck list resolves, so a fixed sleep passes on a quiet
   machine and throws "No element found for selector" on a busy one. The
   database is shared with other work here, so it is regularly busy. */
const PICKER = 'button[aria-label="Choose what the answers are about"]';
await page.waitForSelector(PICKER, { timeout: 90000 });
await page.click(PICKER);
await page.waitForSelector('input[aria-label="Search your decks or any card"]', { timeout: 30000 });
/* And wait for a deck to actually be in the list before reaching for one. */
await page
  .waitForFunction(
    () => [...document.querySelectorAll('button')].some(el => (el.innerText || '').includes('Atraxa')),
    { timeout: 60000 }
  )
  .catch(() => log('  no deck ever appeared in the picker'));
await sleep(400);

/* A real mouse click, not `row.click()` from inside `page.evaluate`.
   The picker is a Radix popover and it listens for pointer events, so a
   synthetic DOM click is silently ignored: the evaluate returned true, the
   harness believed the deck was attached, and the question went off with no
   deck on it. Driving the real page means driving it the way a hand does. */
const deckRow = await page.evaluateHandle(() =>
  [...document.querySelectorAll('button')].find(
    el => (el.innerText || '').includes('Atraxa') && (el.innerText || '').includes('cards')
  ) || null
);
const deckEl = deckRow.asElement();
if (!deckEl) {
  log('  could not find the deck in the picker');
} else {
  await deckEl.evaluate(e => e.scrollIntoView({ block: 'center' }));
  await deckEl.click();
}

/* Wait for the page to say the deck is attached, rather than assume it. */
await page
  .waitForFunction(() => document.body.innerText.includes('Analysing Atraxa'), { timeout: 30000 })
  .catch(() => log('  the page never showed the deck as attached'));

/* And wait for it to finish READING the deck. The composer says so itself while
   the catalogue join is in flight, and asking during that window sends a deck
   with no cards in it. Three seconds was enough on a quiet database and was not
   enough on this one. */
await page
  .waitForFunction(() => !document.body.innerText.includes('before answering'), { timeout: 300000 })
  .catch(() => log('  the deck was still being read after five minutes'));
await sleep(1500);
await shot('deck-attached');

/* The owner's exact question. */
log(`asking: ${QUESTION}`);
await page.click('textarea');
await page.type('textarea', QUESTION, { delay: 4 });
await page.keyboard.press('Enter');

/* Wait for the reply rather than for a fixed sleep. */
const deadline = Date.now() + 120000;
while (!lastReply && Date.now() < deadline) await sleep(500);
await sleep(3500); // let the card art paint
await shot('answer');

/* Scroll the thread so the attached cards are in frame. */
await page.evaluate(() => {
  const scroller = document.querySelector('[data-radix-scroll-area-viewport]');
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
});
await sleep(2500);
await shot('answer-cards');

/* --------------------------------------------------------------- the verdict */

log('\n=== WHAT CAME BACK ===');
if (!lastReply) {
  log('  no reply from mtg-brain');
} else if (lastReply.error) {
  log('  error:', lastReply.error);
} else {
  const text = String(lastReply.message ?? '');
  log(`  charts: ${lastReply.visualData?.charts?.length ?? 0}`);
  log(`  tables: ${lastReply.visualData?.tables?.length ?? 0}`);
  log(`  cards attached: ${lastReply.cards?.length ?? 0}`);
  if (lastReply.cards?.length) {
    for (const c of lastReply.cards) log(`    ${c.name} [${c.id}] ${c.image_uri ? 'has art' : 'NO ART'}`);
  }

  const deckNames = new Set(deckCardRows.map(r => r.card_name.toLowerCase()));
  const named = [...text.matchAll(/\*\*([^*\n]{3,50})\*\*/g)].map(m => m[1].trim());
  const fromDeck = named.filter(n => deckNames.has(n.toLowerCase()));
  log(`  named ${named.length} things in bold, ${fromDeck.length} of them are cards in this deck:`);
  for (const n of fromDeck) log(`    ${n}`);

  const asksForList = /provide a list|what lands|tell me what|which lands do you|need to know/i.test(text);
  log(`  asks the user what is in the deck: ${asksForList ? 'YES (regression)' : 'no'}`);
  log(`  em dashes in the answer: ${(text.match(/—/g) || []).length}`);

  log('\n=== THE ANSWER ===\n');
  log(text);
}

/* Persistence: the thread should be a row, and reopening should restore it. */
const saved = await page.evaluate(() => {
  const m = window.__tutorMemory;
  return {
    conversations: m.tutor_conversations.map(c => ({ title: c.title, deck: c.deck_name })),
    messages: m.tutor_messages.map(x => ({ role: x.role, chars: x.content.length, cards: (x.cards || []).length })),
  };
});
log('\n=== SAVED ===');
log(`  conversations: ${JSON.stringify(saved.conversations)}`);
log(`  messages: ${JSON.stringify(saved.messages)}`);

/* And the list of past chats, drawn. */
await clickText('Your chats');
await sleep(1200);
await shot('saved-chats');

await browser.close();
process.exit(0);
