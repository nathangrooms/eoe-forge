/**
 * Content the page is hiding inside its own boxes.
 *
 *   node scripts/probe/clip-audit.mjs
 *   node scripts/probe/clip-audit.mjs --screens deck
 *   node scripts/probe/clip-audit.mjs --admin --screens admin
 *
 * WHY THIS IS NOT `nav-audit`
 * ---------------------------
 * `nav-audit` measures the PAGE: how tall it is, how much of the viewport it
 * leaves empty, whether card art is cropped. Every one of those numbers is
 * about the document, and a page can score perfectly on all of them while
 * hiding a third of what it drew.
 *
 * Tutor did exactly that. It reported `pageH 1000, dead 32, crop 0` — a clean
 * row — while its welcome content sat in a 564px scroll pane holding 720px of
 * content. 156px hidden: the six quick actions were cut through their own
 * second line, so "Mechanics and interactions" read "Mechanics and", and the
 * four example prompts underneath could not be seen at all. Nothing in the
 * layout audit can see that, because the page height was correct; it was the
 * pane inside it that was wrong.
 *
 * So this asks a different question of every element on the screen: is your
 * `scrollHeight` larger than your `clientHeight` while your overflow is not
 * `visible`? That is the definition of "there is more here than is being
 * shown", and it catches both shapes at once:
 *
 *   A SCROLLER with content past its edge. Sometimes fine (a message thread,
 *   a long list) and sometimes the Tutor bug, so they are reported with their
 *   text and a person decides.
 *
 *   A CLIPPER — `overflow: hidden` — with content past its edge. This one is
 *   almost never fine: there is no scrollbar and no gesture that reveals it,
 *   so whatever is past the edge is unreachable rather than merely off-screen.
 *
 * WHAT IT DELIBERATELY IGNORES
 * ----------------------------
 * `overflow-x` on a rail. Every card rail in this app is a horizontal scroller
 * by design and reporting all of them would bury the vertical findings, which
 * are the ones that hide things. Only vertical overflow is measured.
 *
 * Deliberate truncation, which is a different thing from hiding. `truncate` and
 * `line-clamp-N` are both `overflow: hidden`, and both draw an ellipsis, which
 * is a visible promise that there is more and a link that leads to it. A deck
 * whose name runs to three lines is meant to show two.
 *
 * Overflow under 16px. A shadow, a focus ring or a sub-pixel rounding error
 * lands in that band and none of them is content. The Tutor bug was 156px;
 * nothing worth finding is 8px.
 *
 * DECORATION THAT IS MEANT TO RUN PAST THE EDGE. The dashboard's identity
 * ground is an `aria-hidden` image at `scale-125` inside an `overflow-hidden`
 * panel — it is oversized ON PURPOSE, so the blur radius never drags a
 * transparent edge inward, and the clip is the mechanism rather than the bug.
 * The first version of this tool reported it as 77px of hidden content, which
 * is the tool inventing a defect. So a finding survives only when something
 * that is neither `aria-hidden` nor `pointer-events: none` is past the edge.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer';
import { SETS } from './screens.mjs';

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const DIST = process.env.DIST || 'dist';
/**
 * Whatever port is free, unless one is named.
 *
 * The fixed default meant a second probe started while the first was still
 * running died on EADDRINUSE, and working around that by hand produced
 * PORT=475RANDOM, which is not a port. Both failures cost a run. listen(0)
 * asks the operating system for a free one and the real number is read back
 * after it binds, so two probes can never collide and there is nothing to
 * pick. Setting PORT still pins it, for the case where something outside has
 * to reach the server.
 */
const PORT_REQUEST = Number(process.env.PORT || 0);
const SETTLE = Number(arg('settle', '9000'));
const AS_ADMIN = process.argv.includes('--admin');
const NO_SHIM = process.argv.includes('--signed-out');
const WIDTH = Number(arg('width', '1600'));
const HEIGHT = Number(arg('height', '1000'));

/** The left menu, which is the list the owner's brief names. */
const NAV = [
  ['home', '/dashboard'],
  ['card-search', '/cards'],
  ['tutor', '/tutor'],
  ['collection', '/collection'],
  ['decks', '/decks'],
  ['proxies', '/proxies'],
  ['marketplace', '/marketplace'],
  ['play', '/play'],
  ['life', '/life'],
  ['tournaments', '/tournament'],
  ['precons', '/precons'],
  ['wishlist', '/wishlist'],
  ['settings', '/settings'],
];

const which = arg('screens');
const ROUTES = which ? (SETS[which] ? SETS[which]() : null) : NAV;
if (!ROUTES) {
  console.error(`unknown screen set. try: ${Object.keys(SETS).join(', ')}`);
  process.exit(1);
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};
const server = http.createServer((q, r) => {
  const p = decodeURIComponent(q.url.split('?')[0]);
  let f = path.join(DIST, p);
  let e = path.extname(f);
  if (!e || !fs.existsSync(f)) { f = path.join(DIST, 'index.html'); e = '.html'; }
  r.writeHead(200, { 'content-type': MIME[e] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => server.listen(PORT_REQUEST, r));
/** The port it actually got. */
const PORT = server.address().port;

const SHIM = fs.readFileSync(path.resolve('scripts/refute-shim.js'), 'utf8');
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--disable-lcd-text', '--no-sandbox'],
});

/** Runs in the page. Returns every box hiding more than a few pixels. */
const findHidden = () => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    /* Vertical only. A card rail is a horizontal scroller on purpose and there
       are dozens of them. */
    if (cs.overflowY === 'visible') continue;
    if (el.clientHeight < 24) continue; // one truncated line, with an ellipsis
    /* Deliberate truncation draws an ellipsis, which is a visible promise that
       there is more. That is not hiding. */
    if (cs.textOverflow === 'ellipsis') continue;
    if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none') continue;
    const hidden = el.scrollHeight - el.clientHeight;
    /* Below 16px is a shadow, a focus ring or sub-pixel rounding. */
    if (hidden < 16) continue;

    /* Is anything a READER would want past the edge? A decorative layer that
       is deliberately oversized is not, and the identity ground on the
       dashboard is exactly that. */
    const edge = el.getBoundingClientRect().bottom;
    const decorative = node => {
      for (let n = node; n && n !== el; n = n.parentElement) {
        if (n.getAttribute('aria-hidden') === 'true') return true;
        if (getComputedStyle(n).pointerEvents === 'none') return true;
      }
      return false;
    };
    const realPastEdge = [...el.querySelectorAll('*')].some(
      d => d.getBoundingClientRect().bottom > edge + 4 && !decorative(d)
    );
    if (!realPastEdge) continue;

    /* The text that is past the edge, which is the part worth reading. Taken
       from the tail because that is the end that gets cut. */
    const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
    out.push({
      hidden,
      scrolls: cs.overflowY === 'auto' || cs.overflowY === 'scroll',
      w: Math.round(el.getBoundingClientRect().width),
      h: el.clientHeight,
      cls: (el.className || '').toString().slice(0, 46),
      head: text.slice(0, 54),
      tail: text.length > 54 ? text.slice(-46) : '',
    });
  }
  /* Nested boxes report the same overflow twice. Keep the innermost, which is
     the one whose own content does not fit. */
  return out
    .filter((a, i) => !out.some((b, j) => j !== i && b.h < a.h && Math.abs(b.hidden - a.hidden) < 8))
    .sort((a, b) => b.hidden - a.hidden);
};

const findings = [];
try {
  for (const [name, route] of ROUTES) {
    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT });
    if (AS_ADMIN) await page.evaluateOnNewDocument(() => { window.__DM_ADMIN = true; });
    if (!NO_SHIM) await page.evaluateOnNewDocument(SHIM);
    await page.goto(`http://127.0.0.1:${PORT}${route}`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, SETTLE));

    const hidden = await page.evaluate(findHidden).catch(() => []);
    await page.close();

    const clipped = hidden.filter(h => !h.scrolls);
    const scrolled = hidden.filter(h => h.scrolls);
    findings.push({ name, route, clipped, scrolled });

    const worst = hidden[0];
    console.log(
      `${name.padEnd(16)} ${clipped.length ? `${clipped.length} CLIPPED` : '        '}  ` +
        `${scrolled.length ? `${scrolled.length} scrolls` : ''}` +
        `${worst ? `   worst ${worst.hidden}px of ${worst.h}px` : '   clean'}`
    );
    for (const h of hidden.slice(0, 3)) {
      console.log(
        `    ${h.scrolls ? 'scrolls' : 'CLIPS  '} ${String(h.hidden).padStart(4)}px  ` +
          `${h.w}x${h.h}  "${h.head}"${h.tail ? ` ... "${h.tail}"` : ''}`
      );
    }
  }

  const bad = findings.filter(f => f.clipped.length > 0);
  console.log(
    `\n${bad.length} screen(s) hide content with NO WAY TO REACH IT` +
      `${bad.length ? `: ${bad.map(f => f.name).join(', ')}` : ''}`
  );
} finally {
  await browser.close();
  server.close();
}
