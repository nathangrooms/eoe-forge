#!/usr/bin/env node
/**
 * Builds public/og-image.jpg, the 1200x630 card every chat app draws when
 * somebody pastes a DeckMatrix link.
 *
 * ## Why this exists
 *
 * index.html pointed og:image and twitter:image at `/favicon.png`. Two things
 * were wrong with that and both of them mean a bare blue link:
 *
 *   1. The path is RELATIVE. Open Graph does not resolve relative paths, so
 *      Facebook, Twitter, Discord, Slack and iMessage all had nothing to fetch.
 *   2. The file was the 637x393 wordmark at 286 kB. Even resolved, it is the
 *      wrong aspect ratio for the 1.91:1 box those clients lay out, so it would
 *      have been letterboxed or cropped through the middle of the logo.
 *
 * ## What it composes
 *
 * The site's own hero art, the site's own wordmark, one plain line. No card
 * images: Scryfall's guidelines forbid modifying card art, and a social card
 * has to be darkened for type to sit on it. The hero is our own asset, so
 * darkening it is ours to do.
 *
 *   node scripts/social-image.mjs
 */
import sharp from 'sharp';
import fs from 'node:fs';

const W = 1200;
const H = 630;
const OUT = 'public/og-image.jpg';

const bg = await sharp('public/hero-1920.webp')
  .resize(W, H, { fit: 'cover', position: 'centre' })
  .toBuffer();

// --background is 220 7% 4%. The scrim is that colour, so the card reads as the
// same charcoal as the app rather than as a separate piece of marketing.
const scrim = await sharp({
  create: { width: W, height: H, channels: 4, background: { r: 10, g: 10, b: 11, alpha: 0.74 } },
}).png().toBuffer();

const logo = await sharp('public/logo-deckmatrix@2x.webp').resize({ width: 520 }).png().toBuffer();
const logoMeta = await sharp(logo).metadata();

const strapline = Buffer.from(
  `<svg width="${W}" height="120" xmlns="http://www.w3.org/2000/svg">` +
    `<text x="${W / 2}" y="52" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" ` +
    `font-size="34" letter-spacing="0.5" fill="#d8d8da">Build decks. Track what you own. Play.</text>` +
    `</svg>`
);

await sharp(bg)
  .composite([
    { input: scrim, top: 0, left: 0 },
    {
      input: logo,
      top: Math.round(H / 2 - logoMeta.height / 2) - 46,
      left: Math.round(W / 2 - logoMeta.width / 2),
    },
    { input: strapline, top: Math.round(H / 2) + 52, left: 0 },
  ])
  .jpeg({ quality: 84, mozjpeg: true })
  .toFile(OUT);

const meta = await sharp(OUT).metadata();
console.log(`${OUT}  ${meta.width}x${meta.height}  ${fs.statSync(OUT).size} bytes`);
