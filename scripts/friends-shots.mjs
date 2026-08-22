/**
 * Photograph the friends list, and measure it.
 *
 *     npm run dev
 *     PORT=8080 node scripts/friends-shots.mjs
 *
 * Writes into `.shots/` (gitignored). `--disable-lcd-text` because subpixel
 * antialiasing puts coloured fringes on thin type over a dark ground and reads
 * as a styling bug that is not there.
 *
 * ---------------------------------------------------------------------------
 * TWO KINDS OF PICTURE, AND THEY ARE NOT THE SAME CLAIM
 * ---------------------------------------------------------------------------
 * SIGNED OUT, REAL. `/play/online` is the shipped page against the real
 * database with no account. It is the one state this change introduces that can
 * be photographed for real, and it is the one that has to be right: the friends
 * panel has to say what an account would give you rather than showing an empty
 * list, and the chat has to keep working.
 *
 * THE COMPONENT HARNESS is the shipped `FriendRow` with FIXTURE friends, for
 * the states an account is needed to reach. It is a picture of the components,
 * not of a signed-in page, and it does not claim to be one. Nobody here can
 * sign in, so a signed-in page stays unphotographed and is reported as such
 * rather than implied.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS MEASURED RATHER THAN LOOKED AT
 * ---------------------------------------------------------------------------
 *   1. the page never scrolls sideways, at 1280 and at 1920
 *   2. no row's text is clipped by its own box
 *   3. the four states of a row read as four different things, checked by
 *      reading the sentences off the page rather than off the source
 */

import puppeteer from 'puppeteer';
import { mkdir, writeFile, rm } from 'node:fs/promises';

const PORT = process.env.PORT ?? 8080;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = '.shots';
const HARNESS = 'friends-harness.html';
const ENTRY = 'src/dev/__friendsHarness.tsx';

const harnessEntry = `
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../index.css';
import { FriendRow } from '@/components/lobby/FriendRow';
import { FriendsRail } from '@/components/play/FriendsRail';
import { SHARING_CHOICES, sharingSummary } from '@/lib/lobby';

const client = new QueryClient();

const now = Date.now();
const ago = minutes => new Date(now - minutes * 60_000).toISOString();

const base = {
  avatarUrl: null,
  since: ago(60 * 24 * 20),
  sharesDecks: true,
  sharesCollection: false,
  around: false,
  seenAt: null,
  doing: null,
  tableCode: null,
  deckCount: 0,
  topDeck: null,
  commanderName: null,
  commanderImage: null,
  inviteId: null,
  inviteCode: null,
};

/* Real Scryfall art, unmodified and uncropped, drawn through the canonical
   CardImage inside CommanderFace. These are the same normal-size images the
   database hands back in \`commander_image\`. */
const ATRAXA =
  'https://cards.scryfall.io/normal/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg';
const KESS =
  'https://cards.scryfall.io/normal/front/4/9/499dee8f-1fbe-4746-bb60-ce78e5e3a9f7.jpg';

const rows = [
  ['Somebody asking you', {
    ...base, userId: 'a', name: 'grumbo', state: 'they_asked',
  }],
  ['A friend at a table', {
    ...base, userId: 'b', name: 'Grooms', state: 'friend',
    around: true, doing: 'at a table', tableCode: 'K7QRTM',
    seenAt: ago(1), deckCount: 4,
    commanderName: "Atraxa, Praetors' Voice", commanderImage: ATRAXA,
    topDeck: 'Superfriends',
  }],
  ['A friend around now', {
    ...base, userId: 'c', name: 'Uhduhhuh', state: 'friend',
    around: true, doing: 'picking a deck', seenAt: ago(2), deckCount: 2,
    commanderName: 'Kess, Dissident Mage', commanderImage: KESS,
    topDeck: 'Storm',
  }],
  ['A friend who shares nothing', {
    ...base, userId: 'd', name: 'quiet', state: 'friend',
    sharesDecks: false, sharesCollection: false,
  }],
  ['A friend with no decks yet', {
    ...base, userId: 'e', name: 'newcomer', state: 'friend',
    seenAt: ago(60 * 5), deckCount: 0,
  }],
  ['An invitation to a table', {
    ...base, userId: 'f', name: 'Grooms', state: 'friend',
    around: true, seenAt: ago(1), deckCount: 4,
    commanderName: "Atraxa, Praetors' Voice", commanderImage: ATRAXA,
    inviteId: 9, inviteCode: 'K7QRTM',
  }],
  ['Somebody you asked', {
    ...base, userId: 'g', name: 'maybe', state: 'you_asked',
  }],
];

function Harness() {
  return (
    <QueryClientProvider client={client}>
    <MemoryRouter>
      <div className="min-h-screen bg-background p-8">
        <div className="mx-auto w-full max-w-6xl space-y-8">
          {/* The strip on step one of /play, as a brand new account sees it.
              The populated state needs an account and stays unphotographed. */}
          <div data-rail>
            <FriendsRail
              userId={null}
              signedIn
              onOpenLobby={() => {}}
              onOpenTable={() => {}}
            />
          </div>

          <section className="w-full rounded-xl bg-muted/30 p-6">
            <h2 className="text-lg font-semibold text-foreground">Friends</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {sharingSummary({ decks: true, collection: false, activity: true })}
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map(([label, friend]) => (
                <div key={friend.userId} data-row={label}>
                  <FriendRow
                    friend={friend}
                    onAccept={() => {}}
                    onRefuse={() => {}}
                    onOpen={() => {}}
                    onJoinTable={() => {}}
                    onDeclineInvite={() => {}}
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="w-full rounded-xl bg-muted/30 p-6" data-sharing>
            <h2 className="text-lg font-semibold text-foreground">What friends can see</h2>
            <div className="mt-3 space-y-3">
              {SHARING_CHOICES.map(choice => (
                <div key={choice.key} className="rounded-lg bg-muted/40 p-3">
                  <p className="text-sm font-medium text-foreground">{choice.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{choice.detail}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </MemoryRouter>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
`;

const harnessPage = `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>Friends harness</title></head>
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
const problems = [];
page.on('console', message => {
  if (message.type() === 'error') problems.push(message.text());
});
page.on('pageerror', error => problems.push(String(error)));

const scenes = [
  ['friends-rows', `/${HARNESS}`],
  ['friends-lobby-signed-out', '/play/online'],
];

try {
  for (const width of [1280, 1920]) {
    await page.setViewport({ width, height: width === 1280 ? 900 : 1080, deviceScaleFactor: 1 });

    for (const [name, path] of scenes) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0' });
      await new Promise(resolve => setTimeout(resolve, 1500));
      await page.screenshot({ path: `${OUT}/${name}-${width}.png`, fullPage: true });

      const measured = await page.evaluate(() => {
        const doc = document.documentElement;
        const rail = document.querySelector('[data-rail]');
        const rows = [...document.querySelectorAll('[data-row]')].map(node => {
          const box = node.getBoundingClientRect();
          return {
            label: node.getAttribute('data-row'),
            width: Math.round(box.width),
            height: Math.round(box.height),
            clipped: node.scrollHeight > node.clientHeight + 1,
            text: node.innerText.replace(/\n+/g, ' | '),
          };
        });
        return {
          sideways: doc.scrollWidth - doc.clientWidth,
          rail: rail ? rail.innerText.split(String.fromCharCode(10)).filter(Boolean).join(' | ') : null,
          rows,
          text: document.body.innerText,
        };
      });

      console.log(`--- ${name} at ${width} ---`);
      console.log(`sideways overflow: ${measured.sideways}px`);
      if (measured.rail) console.log(`  rail: ${measured.rail}`);
      for (const row of measured.rows) {
        console.log(
          `  ${row.width}x${row.height}${row.clipped ? ' CLIPPED' : ''}  ${row.label}: ${row.text}`
        );
      }
      if (measured.rows.length === 0) console.log(measured.text.slice(0, 1800));
      console.log();
    }
  }
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
