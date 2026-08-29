/**
 * Every route a player can type must reach index.html, and no asset may.
 *
 * DeckMatrix is a single page app, so on a static host a deep link like
 * /deck/8f2c is a request for a FILE THAT DOES NOT EXIST. Without a rewrite
 * every link anybody shares returns 404, and the failure is invisible from the
 * inside because clicking through from the homepage never asks the server.
 *
 * The rule in vercel.json is one negative lookahead, which is exactly the kind
 * of regex that looks right and is not, so this asserts both directions: real
 * routes rewrite, and assets do not, because a rewrite that swallows
 * /assets/index-abc.js serves HTML where JavaScript was asked for and the app
 * fails to boot with no useful error.
 *
 *   node scripts/vercel-routes-check.mjs
 */
import fs from 'node:fs';
const cfg = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const src = cfg.rewrites[0].source;
const re = new RegExp('^' + src + '$');
const cases = [
  ['/decks', true], ['/deck/8f2c-1234', true], ['/p/my-deck-slug', true],
  ['/play', true], ['/play/online', true], ['/tutor', true], ['/login', true],
  ['/', true], ['/admin', true], ['/collection', true],
  ['/assets/index-Bb6aOXWJ.js', false], ['/assets/compiler-x.js', false],
  ['/favicon.ico', false], ['/robots.txt', false], ['/sitemap.xml', false],
  ['/screens/deck-1600.webp', false], ['/covers/play/online.webp', false],
  ['/manifest.webmanifest', false], ['/sw.js', false],
];
let bad = 0;
for (const [path, shouldRewrite] of cases) {
  const got = re.test(path);
  const ok = got === shouldRewrite;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${path.padEnd(30)} rewrite=${got} expected=${shouldRewrite}`);
}
console.log(bad ? `\n${bad} wrong` : '\nevery path routes correctly');
process.exit(bad ? 1 : 0);
