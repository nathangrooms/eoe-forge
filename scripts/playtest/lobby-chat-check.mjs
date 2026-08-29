/**
 * ASK 2: DOES THE LOBBY READ AS A CHAT BOX?
 *
 * Owner asked for a chat box. A forum is a list of topics you open; a chat box
 * is a running column of messages with a place to type at the bottom. The
 * difference is measurable, so measure it rather than squinting at it:
 *
 *   - are messages a flat running column, or a topic list you have to open?
 *   - does the column grow from the BOTTOM, the way a chat does?
 *   - is there a composer, and where?
 *   - does the copy still say forum words ("post", "topic", "thread",
 *     "discussion", "reply")?
 *
 * Signed out, which is the state the open board is designed for.
 *
 *   BASE=http://127.0.0.1:8080 node scripts/playtest/lobby-chat-check.mjs
 */
import fs from 'node:fs';
import { openHarness, sleep } from './uiLib.mjs';

const OUT = '.shots/lobby-chat';
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const { browser, page, health } = await openHarness({ width: 1600, height: 1000, page: 'lobby-harness.html' });
  await sleep(2500);
  await page.screenshot({ path: `${OUT}/lobby.png`, fullPage: false });
  await page.screenshot({ path: `${OUT}/lobby-full.png`, fullPage: true });

  const m = await page.evaluate(() => {
    const txt = (document.body.innerText || '');
    const flat = txt.replace(/\s+/g, ' ');

    // The chat column: the scroller that holds the messages.
    const scrollers = [...document.querySelectorAll('div')].filter(d => {
      const cs = getComputedStyle(d);
      return /auto|scroll/.test(cs.overflowY) && d.getBoundingClientRect().height > 120;
    }).map(d => {
      const r = d.getBoundingClientRect();
      return {
        h: Math.round(r.height), y: Math.round(r.y),
        scrollH: d.scrollHeight,
        firstChildY: d.firstElementChild ? Math.round(d.firstElementChild.getBoundingClientRect().y) : null,
        lastChildBottom: d.lastElementChild ? Math.round(d.lastElementChild.getBoundingClientRect().bottom) : null,
        justify: getComputedStyle(d.firstElementChild || d).justifyContent,
        text: (d.innerText || '').replace(/\s+/g, ' ').slice(0, 100),
      };
    });

    const composer = [...document.querySelectorAll('textarea,input[type="text"]')].map(i => {
      const r = i.getBoundingClientRect();
      return { tag: i.tagName.toLowerCase(), placeholder: i.placeholder || '', y: Math.round(r.y), h: Math.round(r.height), disabled: i.disabled };
    });

    const FORUM_WORDS = /\b(topic|thread|post|posted|reply|replies|discussion|board)\b/gi;
    const found = {};
    for (const w of flat.match(FORUM_WORDS) || []) found[w.toLowerCase()] = (found[w.toLowerCase()] || 0) + 1;

    const tabs = [...document.querySelectorAll('button')]
      .filter(b => { const r = b.getBoundingClientRect(); return r.height > 14 && r.height < 60 && (b.innerText || '').trim().length > 2; })
      .map(b => (b.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 34));

    /*
     * WHERE IS THE ONE MESSAGE, AND WHAT IS ABOVE IT?
     *
     * A previous pass moved the column to `justify-end` so a message sits at
     * the bottom "the way a chat does", and measured only the message's y. The
     * thing that decides whether it reads as a chat box is what the reader sees
     * arriving: the gap between the channel tabs and the first message, and
     * whether the message is on screen at all.
     */
    const author = [...document.querySelectorAll('*')]
      .filter(e => !e.children.length && /^[a-z0-9_.-]{2,24}$/i.test((e.innerText || '').trim()))
      .map(e => ({ t: (e.innerText || '').trim(), r: e.getBoundingClientRect() }))
      .filter(o => o.r.height > 8 && o.r.y > 400)
      .sort((a, b) => a.r.y - b.r.y)[0];
    const tabEl = [...document.querySelectorAll('button')]
      .find(b => /^General$/i.test((b.innerText || '').trim()));
    const tabBottom = tabEl ? tabEl.getBoundingClientRect().bottom : null;

    return {
      scrollers, composer, forumWords: found, tabs: [...new Set(tabs)].slice(0, 24),
      pageHeight: document.documentElement.scrollHeight, vh: innerHeight,
      snippet: flat.slice(0, 700),
      firstMessage: author ? { text: author.t, y: Math.round(author.r.y), bottom: Math.round(author.r.bottom) } : null,
      tabBottom: tabBottom === null ? null : Math.round(tabBottom),
      voidAbove: author && tabBottom !== null ? Math.round(author.r.y - tabBottom) : null,
    };
  });

  console.log('PAGE height', m.pageHeight, 'window', m.vh, m.pageHeight > m.vh ? `(scrolls ${m.pageHeight - m.vh}px past the window)` : '(fits)');
  console.log('\nMESSAGE COLUMNS (scrollers over 120px tall):');
  m.scrollers.forEach(s => console.log(`  box ${s.h}px at y=${s.y}, content ${s.scrollH}px, first child at y=${s.firstChildY}, last child bottom ${s.lastChildBottom}\n     "${s.text}"`));
  console.log('\nSOMEWHERE TO TYPE:', m.composer.length ? '' : 'NONE (signed out, which is by design)');
  m.composer.forEach(c => console.log(`  ${c.tag} "${c.placeholder}" @y${c.y} h${c.h}${c.disabled ? ' disabled' : ''}`));
  console.log('\nCHANNELS / TABS:', JSON.stringify(m.tabs));
  console.log('\nFORUM VOCABULARY STILL IN THE COPY:', JSON.stringify(m.forumWords));
  console.log('\nTHE FIRST MESSAGE:', JSON.stringify(m.firstMessage));
  console.log(`CHANNEL TABS END AT y=${m.tabBottom}; EMPTY SPACE BETWEEN TABS AND FIRST MESSAGE: ${m.voidAbove}px`);
  if (m.firstMessage && m.firstMessage.bottom > m.vh) {
    console.log(`  THE ONLY MESSAGE IS AT THE WINDOW EDGE OR BELOW IT (window ${m.vh}px, message bottom ${m.firstMessage.bottom}px).`);
  }
  console.log('\nFIRST 700 CHARS OF THE PAGE:\n', m.snippet);
  console.log('\nHEALTH page', health.pageErrors.length, 'console', health.consoleErrors.length, 'net', health.netFails.length);
  if (health.consoleErrors.length) console.log(health.consoleErrors.slice(0, 3));
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ m, health }, null, 1));
  await browser.close();
}
main().catch(e => { console.error('FAILED', e.message); process.exit(1); });
