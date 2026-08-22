/**
 * Photograph the discussion.
 *
 *     npm run dev
 *     PORT=8080 node scripts/lobby-forum-shots.mjs
 *
 * Writes into `.shots/` (gitignored). `--disable-lcd-text` because subpixel
 * antialiasing puts coloured fringes on thin type over a dark ground and reads
 * as a styling bug that is not there.
 *
 * ---------------------------------------------------------------------------
 * TWO KINDS OF PICTURE, AND THEY ARE NOT THE SAME CLAIM
 * ---------------------------------------------------------------------------
 * SIGNED OUT, REAL. `/play/online` and `/play/online?topic=N` are the shipped
 * page against the real database with no account. That state is what this
 * change introduced and it cannot be checked any other way.
 *
 * THE COMPONENT HARNESS is the shipped components with FIXTURE props, for the
 * states an account is needed to reach: a moderator looking at a post, a
 * removed post keeping its place, and a table's talk in its column. It is a
 * picture of the components, not of a signed-in page, and it does not claim to
 * be one. Nobody here can sign in, so a signed-in page stays unphotographed and
 * is reported as such rather than implied.
 */

import puppeteer from 'puppeteer';
import { mkdir, writeFile, rm } from 'node:fs/promises';

const PORT = process.env.PORT ?? 8080;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = '.shots';
const HARNESS = 'forum-harness.html';
const ENTRY = 'src/dev/__forumHarness.tsx';

const scenes = [
  ['forum-board', '/play/online'],
  ['forum-thread', `/play/online?topic=${process.env.TOPIC ?? 51}`],
  ['forum-moderator', `/${HARNESS}`],
];

/* -------------------------------------------------------------------------- */
/* The harness, written and deleted per run                                   */
/* -------------------------------------------------------------------------- */

const harnessEntry = `
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import '../index.css';
import { DiscussionThread } from '@/components/lobby/DiscussionThread';
import { TableTalk } from '@/components/lobby/TableTalk';

const now = Date.now();
const ago = minutes => new Date(now - minutes * 60_000).toISOString();

const posts = [
  {
    id: 1, topicId: 1, scope: 'board', tableId: null,
    userId: 'them', name: 'grumbo',
    body: 'Room for one more at #ABC234 if anybody fancies it. Deck is https://scryfall.com/card/kess if you want to know what you are up against.',
    tableCode: 'ABC234', createdAt: ago(40), removed: false, reportCount: 0,
  },
  {
    id: 2, topicId: 1, scope: 'board', tableId: null,
    userId: 'me', name: 'you',
    body: 'On my way.',
    tableCode: null, createdAt: ago(22), removed: false, reportCount: 0,
  },
  {
    id: 3, topicId: 1, scope: 'board', tableId: null,
    userId: 'spam', name: 'someone',
    body: null,
    tableCode: null, createdAt: ago(11), removed: true, reportCount: 3,
  },
  {
    id: 4, topicId: 1, scope: 'board', tableId: null,
    userId: 'spam', name: 'someone',
    body: 'BUY CHEAP CARDS <script>alert(1)</script> at http://not.real.example',
    tableCode: null, createdAt: ago(3), removed: false, reportCount: 2,
  },
];

function Harness() {
  return (
    <MemoryRouter>
      <div className="min-h-screen bg-background p-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="rounded-xl bg-muted/30 p-6">
            <h2 className="text-lg font-semibold text-foreground">Room for a fourth tonight</h2>
            <p className="mt-1 text-xs text-muted-foreground">grumbo started this 40 min ago. 3 replies.</p>
            <div className="mt-4">
              <DiscussionThread
                posts={posts}
                loading={false}
                sending={false}
                canPost
                myUserId="me"
                isModerator
                placeholder="Reply"
                onSend={() => {}}
                onRemove={() => {}}
                onReport={() => {}}
                onBlock={() => {}}
              />
            </div>
          </section>

          <TableTalk
            tableId={null}
            seated={false}
            signedIn
            myUserId="me"
            myName="you"
          />
        </div>
      </div>
    </MemoryRouter>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
`;

const harnessPage = `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>Forum harness</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${ENTRY}"></script>
  </body>
</html>
`;

await mkdir(OUT, { recursive: true });
await mkdir('src/dev', { recursive: true });
await writeFile(ENTRY, harnessEntry, 'utf8');
await writeFile(HARNESS, harnessPage, 'utf8');

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--disable-lcd-text', '--no-sandbox', '--font-render-hinting=none'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 1 });

const problems = [];
page.on('console', message => {
  if (message.type() === 'error') problems.push(message.text());
});
page.on('pageerror', error => problems.push(String(error)));

try {
  for (const [name, path] of scenes) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0' });
    await new Promise(resolve => setTimeout(resolve, 1200));
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

    const text = await page.evaluate(() => document.body.innerText);
    console.log(`--- ${name} (${path}) ---`);
    console.log(text.slice(0, 1600));
    console.log();
  }

  /* The guarantee worth checking in a browser rather than in a test: markup a
     stranger typed is text on the page and not an element in the tree. */
  const injected = await page.evaluate(() => document.querySelectorAll('script:not([type])').length);
  console.log(`injected script elements in the harness page: ${injected}`);
} finally {
  await browser.close();
  await rm(ENTRY, { force: true });
  await rm(HARNESS, { force: true });
}

if (problems.length) {
  console.log('CONSOLE ERRORS:');
  for (const problem of problems) console.log('  ', problem);
} else {
  console.log('no console errors');
}
