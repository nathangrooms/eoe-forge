/**
 * Photograph and MEASURE the redesigned play flow.
 *
 * Sibling of `playtest-shots.mjs` and it reuses that script's harness verbatim:
 * the Vite HMR stub (another workstream saving mid-run reloads the page and
 * throws the screen away) and the Supabase block, so nothing here depends on a
 * session or on the database being awake.
 *
 * Two harnesses, because two things need seeing and only one of them can be
 * reached without an account:
 *
 *   `flow`   the real `<Play />` page. Signed out it still renders step one,
 *            which is the mode wall, and walking to step two shows the entry
 *            gate a reader with no decks gets. Both are real screens.
 *   `decks`  `DeckStep` and `SeatStep` with fixture props, so the deck wall,
 *            the large commander and the detail panel can be seen at all. The
 *            card rows are fetched live from Scryfall by name, so the cards on
 *            screen are real cards and not invented ones. This is a picture of
 *            the COMPONENTS with props; it does not claim to be a signed in
 *            page.
 *
 * What it measures rather than eyeballs:
 *   - four doors, their rectangles, and that they are cut 3:4;
 *   - that a door has no border on any side;
 *   - that no cover image loaded, so what is on screen IS the fallback;
 *   - anything whose right edge is past the viewport, at 1280 and at 1920.
 *
 *   node scripts/play-flow-shots.mjs
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const OUT = '.shots/play-flow';
const PORT = Number(process.env.PORT || 8107 + (Date.now() % 40));
const BASE = `http://127.0.0.1:${PORT}`;
fs.mkdirSync(OUT, { recursive: true });

let shotN = 0;
const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ----------------------------------------------------------------- fixtures */

const COMMANDERS = [
  'Atraxa, Praetors’ Voice',
  'Krenko, Mob Boss',
  'Muldrotha, the Gravetide',
  'Edgar Markov',
  'Omnath, Locus of Creation',
  'Talrand, Sky Summoner',
];

async function realCard(name) {
  const url = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`;
  /* Scryfall refuses a request with no identity: their API guidelines ask for
     a User-Agent and an Accept header, and returns 400 without them. */
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'DeckMatrix/1.0 (screenshot harness)',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Scryfall ${res.status} for ${name}`);
  const card = await res.json();
  await sleep(120); // Scryfall asks for a gap between requests.
  return {
    id: card.id,
    name: card.name,
    type_line: card.type_line,
    mana_cost: card.mana_cost,
    color_identity: card.color_identity,
    rarity: card.rarity,
    layout: card.layout,
    image_uris: card.image_uris ?? null,
    faces: card.card_faces ?? null,
    prices: card.prices,
    is_legendary: /legendary/i.test(card.type_line || ''),
  };
}

/* ------------------------------------------------------------------ harness */

const HARNESS_HTML = 'play-flow-harness.html';
const HARNESS_ENTRY = 'src/dev/__playFlowHarness.tsx';

const writeIfChanged = (file, body) => {
  try {
    if (fs.readFileSync(file, 'utf8') === body) return;
  } catch {
    /* absent */
  }
  fs.writeFileSync(file, body);
};

fs.mkdirSync('src/dev', { recursive: true });
writeIfChanged(
  HARNESS_HTML,
  `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>Play flow harness</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${HARNESS_ENTRY}"></script>
  </body>
</html>
`
);

writeIfChanged(
  HARNESS_ENTRY,
  `/* Gitignored puppeteer harness for the play flow. Written by
 * scripts/play-flow-shots.mjs. Not shipped, not routed, not built. */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import '../index.css';
import { AuthProvider } from '../components/AuthProvider';
import { TooltipProvider } from '../components/ui/tooltip';
import { StandardPageLayout } from '../components/layouts/StandardPageLayout';
import Play from '../pages/Play';
import { DeckStep } from '../components/play/DeckStep';
import { SeatStep } from '../components/play/SeatStep';
import { ChoiceTrail, StepFooter, StepTitle } from '../components/play/StepChrome';
import { breadcrumbFor, headingFor } from '../components/play/playFlow';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const which = new URLSearchParams(location.search).get('view') || 'flow';

function Fixtures() {
  const decks = (window as any).__dmDecks ?? [];
  const [step, setStep] = useState<'deck' | 'table'>(
    (new URLSearchParams(location.search).get('step') as 'deck' | 'table') || 'deck'
  );
  const [deckId, setDeckId] = useState<string | null>(decks[0]?.id ?? null);
  const [opponents, setOpponents] = useState([{ deckId: decks[1]?.id ?? null }]);
  const [armed, setArmed] = useState(1);
  const heading = headingFor(step, 'bots');
  const chosen = decks.find((d: any) => d.id === deckId) ?? null;

  return (
    <StandardPageLayout
      title={<StepTitle label={heading.label} title={heading.title} />}
      description={heading.note ?? undefined}
      action={step === 'table' ? <button className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground">Start 3-player game</button> : null}
    >
      <div className="w-full space-y-4">
        <ChoiceTrail
          crumbs={breadcrumbFor({
            mode: 'bots',
            deckName: chosen?.name ?? 'Seeded deck',
            tableLabel: step === 'table' ? '3 seats' : null,
          })}
          current={step}
          onJump={next => setStep(next === 'table' ? 'table' : 'deck')}
        />
        {step === 'deck' ? (
          <DeckStep
            decks={decks}
            loading={false}
            mode="bots"
            value={deckId}
            onChoose={setDeckId}
            allowSeeded
          />
        ) : (
          <SeatStep
            mode="bots"
            decks={decks}
            loadingDecks={false}
            deckId={deckId}
            onDeckId={setDeckId}
            opponents={opponents}
            onOpponents={setOpponents}
            armedSeat={armed}
            onArmSeat={setArmed}
            aggression="normal"
            onAggression={() => {}}
            variant="table"
            onVariant={() => {}}
            seed={7}
            onSeed={() => {}}
          />
        )}
        <StepFooter
          backLabel={step === 'deck' ? 'Change mode' : 'Change deck'}
          onBack={() => setStep('deck')}
          forwardLabel={step === 'deck' ? 'Choose opponents' : undefined}
          onForward={step === 'deck' ? () => setStep('table') : undefined}
        />
      </div>
    </StandardPageLayout>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <TooltipProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={['/play']}>
          {which === 'decks' ? <Fixtures /> : <Play />}
          <Toaster position="top-center" />
        </MemoryRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);
`
);

/* --------------------------------------------------------------- dev server */

log('starting vite on', PORT);
const vite = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' }
);
vite.stdout.on('data', d => process.stdout.write(`  [vite] ${d}`));
vite.stderr.on('data', d => process.stdout.write(`  [vite] ${d}`));

const ready = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/${HARNESS_HTML}`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  return false;
};
if (!(await ready())) {
  vite.kill();
  throw new Error('vite did not come up');
}

/* ---------------------------------------------------------------- puppeteer */

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
page.on('pageerror', e => log('  [pageerror]', e.message.slice(0, 220)));
page.on('console', m => {
  if (m.type() === 'error') log('  [error]', m.text().slice(0, 200));
});

const VITE_CLIENT_STUB = `
export function createHotContext() {
  return {
    accept() {}, acceptExports() {}, dispose() {}, prune() {}, decline() {},
    invalidate() {}, on() {}, off() {}, send() {}, data: {},
  };
}
const sheets = new Map();
export function updateStyle(id, content) {
  let style = sheets.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheets.set(id, style);
  } else { style.textContent = content; }
}
export function removeStyle(id) {
  const style = sheets.get(id);
  if (style) { document.head.removeChild(style); sheets.delete(id); }
}
export function injectQuery(url) { return url; }
`;

await page.setRequestInterception(true);
page.on('request', req => {
  const url = req.url();
  if (url.includes('/@vite/client')) {
    return req.respond({
      status: 200,
      contentType: 'application/javascript',
      body: VITE_CLIENT_STUB,
    });
  }
  if (/supabase\.co\/(rest|auth)\//.test(url)) return req.abort('failed');
  return req.continue();
});

const shot = async name => {
  const file = `${OUT}/${String(shotN++).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  log('  shot ->', file);
};

/* ------------------------------------------------------------ measurements */

/** Every door, its box, its aspect, and whether it draws a line anywhere. */
const doors = () =>
  page.evaluate(() => {
    const nodes = [...document.querySelectorAll('button[aria-pressed]')].filter(el =>
      /ENTER/i.test(el.innerText || '')
    );
    return nodes.map(el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const img = el.querySelector('img');
      return {
        title: (el.innerText || '').split('\n')[1] ?? '',
        w: Math.round(r.width),
        h: Math.round(r.height),
        aspect: Number((r.width / r.height).toFixed(3)),
        borders: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth],
        coverLoaded: Boolean(img && img.complete && img.naturalWidth > 0),
        // The procedural surface: a background-image made of gradients.
        fallbackPainted: [...el.querySelectorAll('div')].some(d =>
          /gradient/.test(getComputedStyle(d).backgroundImage || '')
        ),
      };
    });
  });

/** Anything running off the right edge, ignoring real horizontal scrollers. */
const overflow = () =>
  page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const inScroller = el => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (p.scrollWidth > p.clientWidth + 1 && (cs.overflowX === 'auto' || cs.overflowX === 'scroll'))
          return true;
      }
      return false;
    };
    const hits = [];
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const over = r.right - vw;
      if (over > 1 && !inScroller(el)) {
        hits.push({
          over: Math.round(over),
          tag: el.tagName.toLowerCase(),
          cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60),
        });
      }
    }
    return hits.slice(0, 8);
  });

/** How much of the viewport the content actually uses. */
const widthUse = () =>
  page.evaluate(() => {
    const main = document.querySelector('[class*="max-w-full"]') || document.body;
    const r = main.getBoundingClientRect();
    return {
      viewport: document.documentElement.clientWidth,
      content: Math.round(r.width),
      rightGap: Math.round(document.documentElement.clientWidth - r.right),
    };
  });

/** The full commander cards on the deck step, so "LARGE" is a number. */
const cards = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('img[alt]')]
      .filter(img => img.naturalWidth > 200 && img.naturalHeight > img.naturalWidth)
      .map(img => {
        const r = img.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      })
      .sort((a, b) => b.w - a.w)
      .slice(0, 6)
  );

const report = {};

for (const width of [1280, 1920]) {
  await page.setViewport({ width, height: 1100, deviceScaleFactor: 1 });

  /* ------------------------------------------------------ step one, real page */
  await page.goto(`${BASE}/${HARNESS_HTML}?view=flow`, { waitUntil: 'networkidle2' });
  await sleep(900);
  await shot(`${width}-step1-modes`);
  report[`doors@${width}`] = await doors();
  report[`overflow-step1@${width}`] = await overflow();
  report[`width-step1@${width}`] = await widthUse();

  /* Walk to step two, which signed out is the entry gate. */
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(b => /ENTER/i.test(b.innerText || ''));
    el?.click();
  });
  await sleep(700);
  await shot(`${width}-step2-gate`);
  report[`overflow-step2gate@${width}`] = await overflow();

}

/* The fixture decks need real cards, fetched once and injected before render. */
log('fetching real card rows from Scryfall');
const faces = [];
for (const name of COMMANDERS) {
  try {
    faces.push(await realCard(name));
  } catch (error) {
    log('  could not fetch', name, error.message);
  }
}
const fixtureDecks = faces.map((face, index) => ({
  id: `fixture-${index}`,
  name: [
    'Four colour value',
    'Goblins, obviously',
    'Everything from the yard',
    'Vampires with haste',
    'Landfall pile',
    'One thousand drakes',
  ][index],
  format: 'commander',
  formatLabel: 'Commander',
  colors: face.color_identity ?? [],
  cardCount: index === 4 ? 0 : 100,
  commanderName: face.name,
  faceCard: face,
  power: null,
}));

for (const width of [1280, 1920]) {
  for (const step of ['deck', 'table']) {
    await page.setViewport({ width, height: 1100, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(decks => {
      window.__dmDecks = decks;
    }, fixtureDecks);
    await page.goto(`${BASE}/${HARNESS_HTML}?view=decks&step=${step}`, {
      waitUntil: 'networkidle2',
    });
    await sleep(1600);
    await shot(`${width}-${step === 'deck' ? 'step2-deckwall' : 'step3-seats'}`);
    report[`overflow-${step}@${width}`] = await overflow();
    report[`cards-${step}@${width}`] = await cards();
    report[`width-${step}@${width}`] = await widthUse();
  }
}

log('\n' + JSON.stringify(report, null, 2));
fs.writeFileSync(`${OUT}/measurements.json`, JSON.stringify(report, null, 2));

await browser.close();
vite.kill();
process.exit(0);
