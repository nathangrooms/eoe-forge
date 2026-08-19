// Finds content that runs off the right edge of the page.
//
// This exists because the same bug was "fixed" three times and came back twice,
// and because the obvious way to check for it does not work. The app wrapper
// carries `overflow-x-hidden`, so when something overflows, the browser clips it
// and `document.scrollWidth` still reports a clean number. Every check written
// against scrollWidth passed while the rightmost 256px of every page on desktop
// was being cut off, including a check of mine that told the owner the page was
// fine.
//
// So this measures element rectangles instead. An element whose right edge is
// past the viewport is overflowing, whatever the document says.
//
// Content inside a horizontal scroller is NOT overflow. The card rails scroll
// sideways on purpose, and their off-screen cards are the feature working. Those
// are excluded by walking up the ancestors looking for a real scroll container,
// which is the difference between a report worth reading and 136 false positives.
//
// WHAT A GREEN RUN HERE DOES NOT PROVE. Headless Chrome has no session, so the
// app serves its signed-out layout and the nav rail is not rendered. `main` then
// starts at 0 with no margin, which is exactly the case that never had the bug.
// A pass means "no overflow in the signed-out layout" and nothing more. The rail
// case is guarded separately by src/appShell.test.ts, which asserts the class
// invariant directly. Do not read a green run here as the desktop app being
// clear; check the rail width against the viewport in a real signed-in session.
//
//   node scripts/measure-overflow.mjs http://localhost:8081 /cards/sol-ring /collection
import puppeteer from 'puppeteer';

const BASE = process.argv[2] || 'http://localhost:8081';
const ROUTES = process.argv.slice(3).length ? process.argv.slice(3) : ['/'];

// Desktop widths that matter. 1280 is the common laptop, 1366 is still the most
// common panel in the wild, and 1536 is a 1920 screen at the 125% scaling
// Windows ships by default. The rail only exists at md and up, so a mobile width
// is included to prove the fix did not simply move the bug.
const WIDTHS = [390, 1280, 1366, 1536, 1920];

const findOverflow = () => {
  const vw = document.documentElement.clientWidth;
  const inScroller = el => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (p.scrollWidth > p.clientWidth + 1 && (cs.overflowX === 'auto' || cs.overflowX === 'scroll')) return true;
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
        cls: (typeof el.className === 'string' ? el.className : '').slice(0, 70),
        text: (el.textContent || '').trim().slice(0, 40),
      });
    }
  }
  hits.sort((a, b) => b.over - a.over);
  const main = document.querySelector('main');
  return {
    viewport: vw,
    worst: hits.slice(0, 6),
    count: hits.length,
    main: main
      ? { left: Math.round(main.getBoundingClientRect().left), right: Math.round(main.getBoundingClientRect().right), width: Math.round(main.getBoundingClientRect().width) }
      : null,
  };
};

const browser = await puppeteer.launch({ headless: 'new' });
let failures = 0;

for (const route of ROUTES) {
  for (const width of WIDTHS) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900 });
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 45000 });
      // Let lazy sections and images settle; an overflow that appears late is
      // still an overflow the reader sees.
      await new Promise(r => setTimeout(r, 1500));
      const res = await page.evaluate(findOverflow);
      const tag = `${route} @ ${width}`;
      if (res.count === 0) {
        console.log(`ok    ${tag.padEnd(34)} main ${res.main ? res.main.left + '-' + res.main.right : 'n/a'}`);
      } else {
        failures++;
        console.log(`OVER  ${tag.padEnd(34)} ${res.count} element(s), worst ${res.worst[0].over}px`);
        for (const h of res.worst) console.log(`        +${String(h.over).padStart(4)}px  ${h.tag}.${h.cls}  ${h.text ? '"' + h.text + '"' : ''}`);
      }
    } catch (err) {
      failures++;
      console.log(`ERR   ${route} @ ${width}: ${err.message}`);
    }
    await page.close();
  }
}

await browser.close();
console.log(failures === 0 ? '\nNo horizontal overflow.' : `\n${failures} viewport/route combinations overflow.`);
process.exit(failures === 0 ? 0 : 1);
