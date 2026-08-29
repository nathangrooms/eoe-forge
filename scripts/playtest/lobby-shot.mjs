/**
 * THE LOBBY, LOOKED AT.
 *
 * The room held one message and drew it at the TOP of a 32rem box with the rest
 * empty below, which reads as a form that failed to load rather than as a room
 * somebody has spoken in. A chat grows up from the composer. This measures
 * where the last message sits and takes the picture.
 */
import fs from 'node:fs';
import { openHarness, sleep } from './uiLib.mjs';

const OUT = '.shots/lobby';

const main = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { browser, page, health } = await openHarness({ width: 1600, height: 1000, page: 'lobby-harness.html' });
  await sleep(3500);
  await page.screenshot({ path: `${OUT}/lobby.png` });

  const seen = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('ol li')].map(li => {
      const r = li.getBoundingClientRect();
      return { text: (li.innerText || '').replace(/\s+/g, ' ').slice(0, 40), top: Math.round(r.top), bottom: Math.round(r.bottom) };
    });
    /* The scrolling column the messages live in. */
    const col = [...document.querySelectorAll('div')].find(d => {
      const cs = getComputedStyle(d);
      return cs.overflowY === 'auto' && d.querySelector('ol');
    });
    const box = col ? col.getBoundingClientRect() : null;
    return {
      messages: rows,
      column: box ? { top: Math.round(box.top), bottom: Math.round(box.bottom), h: Math.round(box.height) } : null,
      friends: [...document.querySelectorAll('*')]
        .filter(el => el.children.length === 0 && /^friends$/i.test((el.textContent || '').trim()))
        .map(el => Math.round(el.getBoundingClientRect().top)),
    };
  });

  const last = seen.messages[seen.messages.length - 1];
  console.log(JSON.stringify(seen, null, 2));
  if (last && seen.column) {
    const gap = seen.column.bottom - last.bottom;
    console.log(`\nlast message sits ${gap}px above the bottom of the column (was the full height of it).`);
  }
  console.log('console errors ' + health.consoleErrors.length + ', page errors ' + health.pageErrors.length);
  await browser.close();
};
main();
