/** Exactly where the lobby's one message sits, and how much emptiness is above it. */
import { openHarness, sleep } from './uiLib.mjs';
const { browser, page } = await openHarness({ width: 1600, height: 1000, page: 'lobby-harness.html' });
await sleep(2500);
const m = await page.evaluate(() => {
  const hit = [...document.querySelectorAll('*')]
    .filter(e => !e.children.length && (e.innerText || '').trim() === 'admin')
    .map(e => e.getBoundingClientRect())[0];
  const tab = [...document.querySelectorAll('button')]
    .find(b => /^General$/i.test((b.innerText || '').trim()))?.getBoundingClientRect();
  const panel = [...document.querySelectorAll('div')]
    .map(d => ({ d, r: d.getBoundingClientRect() }))
    .filter(o => tab && o.r.top < tab.top && o.r.bottom > tab.bottom && o.r.height > 200)
    .sort((a, b) => a.r.height - b.r.height)[0];
  return {
    message: hit ? { y: Math.round(hit.y), bottom: Math.round(hit.bottom) } : null,
    tabsEndAt: tab ? Math.round(tab.bottom) : null,
    panel: panel ? { y: Math.round(panel.r.y), bottom: Math.round(panel.r.bottom), h: Math.round(panel.r.height) } : null,
    vh: innerHeight, pageH: document.documentElement.scrollHeight,
  };
});
console.log(JSON.stringify(m, null, 1));
if (m.message && m.tabsEndAt !== null) console.log(`EMPTY BAND between the channel tabs and the only message: ${m.message.y - m.tabsEndAt}px`);
if (m.message) console.log(m.message.bottom > m.vh ? `THE MESSAGE IS CUT BY THE WINDOW (bottom ${m.message.bottom} > ${m.vh})` : `on screen (bottom ${m.message.bottom} of ${m.vh})`);
await browser.close();
