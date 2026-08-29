/**
 * How long does the phone player wait?
 *
 * At a table, mid game, with three people looking at you, the number that
 * matters is not "does it eventually load". It is how many seconds pass before
 * the card's rules text is on screen. This polls every 250ms for the moment the
 * page stops saying "Loading card…" and the oracle text is actually readable.
 *
 * Throttled to Fast 3G because a phone at a game shop is not on office wifi.
 */
import puppeteer from 'puppeteer';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';

const TARGETS = [
  ['card priced   (Deflecting Swat cmm)', `/cards/b4b36435-55b3-4615-8812-af41d4fc64d9`],
  ['card unpriced (Deflecting Swat cmm)', `/cards/8a2a7ae1-467c-4eca-9ce2-39692804e492`],
  ['card dfc      (Delver mid)', `/cards/abff6c81-65a4-48fa-ba8f-580f87b0344a`],
  ['homepage', '/'],
  ['lobby', '/play/online'],
];

const browser = await puppeteer.launch({ headless: 'new', args: ['--disable-lcd-text', '--no-sandbox'] });

for (const [label, route] of TARGETS) {
  for (const net of ['no throttle', 'fast 3G']) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    if (net === 'fast 3G') {
      const cdp = await page.target().createCDPSession();
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 150,
        downloadThroughput: (1.6 * 1024 * 1024) / 8,
        uploadThroughput: (750 * 1024) / 8,
      });
    }
    const t0 = Date.now();
    let firstPaint = null;
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 90000 });

    let ready = null;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const s = await page.evaluate(() => {
        const t = (document.body.innerText || '').trim();
        return {
          len: t.length,
          loading: /Loading card…|Loading card\.\.\./.test(t),
          hasHeading: Boolean(document.querySelector('h1')?.innerText?.trim()),
        };
      }).catch(() => null);
      if (!s) break;
      if (firstPaint === null && s.len > 40) firstPaint = Date.now() - t0;
      if (!s.loading && s.hasHeading) { ready = Date.now() - t0; break; }
      await new Promise(r => setTimeout(r, 250));
    }
    console.log(
      `${label.padEnd(38)} ${net.padEnd(12)} first text ${String(firstPaint ?? '-').padStart(6)}ms   readable ${String(ready ?? 'NEVER (60s)').padStart(11)}${ready ? 'ms' : ''}`
    );
    await page.close();
  }
}
await browser.close();
