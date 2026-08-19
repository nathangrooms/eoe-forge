/**
 * Photograph the price PANEL against the live database.
 *
 *   node scripts/price-panel-shots.mjs          # BASE defaults to :8099
 *   BASE=http://127.0.0.1:8080 node scripts/price-panel-shots.mjs
 *
 * `scripts/price-shots.mjs` is a different run by a different hand: it walks the
 * owned-card SURFACES (collection, wishlist, storage) with a PostgREST shim.
 * This one is narrower and needs no shim. It draws `src/components/pricing`
 * against five REAL rows of `public.cards`, read straight through the app's own
 * Supabase client, because `cards` is world readable and no session is needed.
 *
 * The five are chosen so that the nulls are the subject:
 *
 *   Lightning Bolt   msc  every paper slot filled, plus a ticket price
 *   Crux of Fate     sta  the etched case, all three finishes genuinely priced
 *   Sol Ring         msc  dollars, euros and tickets, and `usd_foil` NULL
 *   Armillary Sphere c13  `finishes: ['nonfoil']`, so no foil was ever printed
 *   70,000 Light-Years    no price in any slot at all
 *
 * The run FAILS if any "$0.00", "€0.00" or "0.00 tix" reaches the page. That is
 * the whole claim: unknown and zero are different facts, and a zero here would
 * tell a player a card is worthless when we simply do not have its price.
 *
 * Written rather than committed, like the play harness. The repo gitignores the
 * two files it emits, and Vite's build input is `index.html` alone, so nothing
 * here is ever bundled.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = process.env.OUT || '.shots';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HARNESS_HTML = 'price-panel-harness.html';
const HARNESS_ENTRY = 'src/dev/__pricePanelHarness.tsx';

fs.mkdirSync('src/dev', { recursive: true });
fs.writeFileSync(
  HARNESS_HTML,
  `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>Price panel harness</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${HARNESS_ENTRY}"></script>
  </body>
</html>
`
);

fs.writeFileSync(
  HARNESS_ENTRY,
  `/* Gitignored puppeteer harness for the price panel. Written by
 * scripts/price-panel-shots.mjs. Not shipped, not routed, not built.
 *
 * Rows come from the live \`cards\` table through the app's own client, so what
 * is photographed is what production holds, not a fixture that agrees with the
 * component by construction. No credentials anywhere: \`cards\` is readable to
 * an anonymous caller. */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../index.css';
import { TooltipProvider } from '../components/ui/tooltip';
import { supabase } from '../integrations/supabase/client';
import { CardPrices, PriceTag, PriceTotalLine } from '../components/pricing';
import { totalPrices } from '../lib/pricing';
import { DeckCardTable } from '../components/deck/DeckCardTable';

const IDS: [string, string][] = [
  ['7673784e-db4b-43a1-8d55-1bb9fc1e284f', 'Every paper price, plus tickets'],
  ['f3ccea48-ee90-4da8-832d-8c30c98bf1dd', 'Etched foil, all three finishes real'],
  ['91fdb56b-54d5-4272-8319-505ff987fe9b', 'Three markets, and usd_foil is NULL'],
  ['a87dd615-565d-4b79-a346-f8c6bb0a8340', 'finishes proves no foil was printed'],
  ['02080f42-863a-471b-992b-67e35ef1b7b7', 'No price in any slot at all'],
];

function Harness() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('cards')
      .select('id, name, set_code, set_name, collector_number, finishes, prices')
      .in('id', IDS.map(([id]) => id))
      .then(({ data, error }) => {
        if (error) { setError(error.message); return; }
        const byId = new Map((data ?? []).map((r: any) => [r.id, r]));
        setRows(IDS.map(([id, why]) => ({ id, why, card: byId.get(id) ?? null })));
      });
  }, []);

  if (error) return <p style={{ color: 'red', padding: 24 }} data-harness="error">{error}</p>;
  if (!rows) return <p style={{ padding: 24 }}>Loading from the live database…</p>;

  const owned = rows.filter(r => r.card).map(r => ({ prices: r.card.prices, quantity: 2, foil: 0 }));

  return (
    <div className="min-h-screen bg-background p-6 text-foreground" data-harness="ready">
      <h1 className="mb-1 text-2xl font-semibold">Prices, read from the live database</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Five real printings out of public.cards. Nothing here is a fixture.
      </p>

      <div className="mb-8 max-w-3xl rounded-xl bg-card p-4 shadow-lg shadow-black/20">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Compact tags, and a total that admits its gaps
        </p>
        <div className="mb-4 space-y-1.5">
          {rows.map(r => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-4 rounded-lg bg-muted/30 px-3 py-2"
            >
              <span className="truncate text-sm">{r.card?.name ?? r.id} · 2 copies</span>
              <PriceTag card={r.card} copies={2} showMarket />
            </div>
          ))}
        </div>
        <PriceTotalLine
          total={totalPrices(owned, 'USD')}
          label="Value of these ten copies"
          detail="full"
          size="lg"
        />
      </div>

      {/* The decklist total, which used to add a silent 0 for every card it
          could not price. Same five real rows, so one of them has no price. */}
      <div className="mb-8 max-w-4xl rounded-xl bg-card p-4 shadow-lg shadow-black/20" data-deck-table>
        <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Deck value, with the copies it could not price
        </p>
        <DeckCardTable
          rows={rows.map((r, i) => ({
            id: \`row-\${i}\`,
            card_id: r.id,
            card_name: r.card?.name ?? 'Unknown card',
            quantity: 2,
            is_commander: false,
            is_sideboard: false,
            card: r.card ?? null,
          })) as any}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {rows.map(r => (
          <div key={r.id} data-card={r.card?.name ?? r.id}>
            <p className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">{r.why}</p>
            <p className="mb-2 text-sm font-medium">
              {r.card?.name ?? 'missing row'}{' '}
              <span className="font-mono uppercase text-muted-foreground">{r.card?.set_code}</span>
            </p>
            <CardPrices card={r.card ?? {}} />
          </div>
        ))}
      </div>
    </div>
  );
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <TooltipProvider>
      <MemoryRouter initialEntries={['/']}>
        <Harness />
      </MemoryRouter>
    </TooltipProvider>
  </QueryClientProvider>
);
`
);

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 180000,
  // Subpixel antialiasing puts coloured fringes on thin type over charcoal and
  // reads as a styling bug that is not there.
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1400, deviceScaleFactor: 1 });
page.on('pageerror', e => log('  [pageerror]', e.message.slice(0, 200)));
page.on('console', m => {
  if (m.type() === 'error') log('  [console]', m.text().slice(0, 200));
});

await page.goto(`${BASE}/${HARNESS_HTML}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('[data-harness="ready"], [data-harness="error"]', { timeout: 60000 });
await sleep(1200);

await page.screenshot({ path: `${OUT}/price-panel-00-all.png`, fullPage: true });
log('  shot ->', `${OUT}/price-panel-00-all.png`);

/* Each card alone, so the null cases are readable rather than thumbnails. */
const cards = await page.$$('[data-card]');
for (let i = 0; i < cards.length; i++) {
  const name = await cards[i].evaluate(el => el.getAttribute('data-card'));
  const slug = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const file = `${OUT}/price-panel-${String(i + 1).padStart(2, '0')}-${slug}.png`;
  await cards[i].screenshot({ path: file });
  log('  shot ->', file);
}

const deckTable = await page.$('[data-deck-table]');
if (deckTable) {
  await deckTable.screenshot({ path: `${OUT}/price-panel-06-deck-total.png` });
  log('  shot ->', `${OUT}/price-panel-06-deck-total.png`);
}

/* ------------------------------------------------------------- the assertion */

const text = await page.evaluate(() => document.body.innerText);
log('\n=== page text ===\n' + text + '\n');

let failed = false;

const zeros = text.match(/[$€]\s?0\.00\b|\b0\.00 tix\b/g) ?? [];
if (zeros.length) {
  log(`FAIL: ${zeros.length} zero price(s) rendered: ${[...new Set(zeros)].join(', ')}`);
  failed = true;
}

const wants = [
  'We have no price for this printing yet',
  'made in normal only',
  'TCGplayer',
  'Cardmarket',
  'Magic Online',
  'tix',
];
const absent = wants.filter(w => !text.includes(w));
if (absent.length) {
  log(`FAIL: expected wording missing from the page: ${absent.join(', ')}`);
  failed = true;
}

if (!failed) {
  log('PASS: no zero prices rendered, and every market we hold is named on screen.');
}
await browser.close();
process.exit(failed ? 1 : 0);
