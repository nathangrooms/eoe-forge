/**
 * Why does /cards/<id> sit on "Loading card…"?
 *
 * Follows one card page for 30 seconds at 390px and prints every request it
 * makes with its status, so the stall is named rather than guessed at.
 */
import puppeteer from 'puppeteer';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const IDS = process.argv.slice(2);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--disable-lcd-text', '--no-sandbox'],
});

for (const id of IDS) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const reqs = [];
  page.on('response', async r => {
    const u = r.url();
    if (u.includes('scryfall') || u.includes('supabase')) {
      reqs.push(`${r.status()} ${u.slice(0, 150)}`);
    }
  });
  page.on('requestfailed', r => reqs.push(`FAILED ${r.failure()?.errorText} ${r.url().slice(0, 150)}`));
  page.on('pageerror', e => reqs.push(`PAGEERROR ${e.message.slice(0, 160)}`));

  await page.goto(`${BASE}/cards/${id}`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 30000));
  const state = await page.evaluate(() => ({
    text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 220),
    h1: document.querySelector('h1')?.innerText ?? null,
  }));
  console.log(`\n=== ${id}`);
  console.log('after 30s:', JSON.stringify(state.text));
  console.log('requests:');
  for (const q of reqs) console.log('   ', q);
  await page.close();
}

await browser.close();
