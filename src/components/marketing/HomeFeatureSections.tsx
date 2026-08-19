/**
 * Feature sections — re-export shim.
 *
 * Every section that used to be defined in this file has outgrown it. Each one
 * now lives in its own module and is re-exported here so existing imports keep
 * working:
 *
 *   `HomeSearch`      four Scryfall queries that now actually RUN, against the
 *                     same endpoint the card browser uses, drawing their real
 *                     results as whole cards.
 *   `HomePortability` the import/export round trip, run on the page: a pasted
 *                     list, the cards it resolved to, and the same cards written
 *                     back out in every export format.
 *   `HomePower`       the nine published subscore weights, plus the game-changer
 *                     catalogue the scorer loads, drawn as whole cards.
 *   `HomeScanner`     a CSS camera — body, viewfinder, focus brackets around a
 *                     whole 5:7 card, shutter, and the fuzzy match resolving
 *                     underneath.
 *   `HomeTutor`       a real 100-card precon, with the answer computed from it.
 *   `HomePrecons`     `PRECON_INDEX` — 184 real products, whole commander cards.
 *
 * `HomeStorage` also started here and moved to its own module; it is exported
 * from '@/components/marketing/HomeStorage' and imported directly by the page.
 */

export { HomeSearch } from '@/components/marketing/HomeSearch';
export { HomePortability } from '@/components/marketing/HomePortability';
export { HomePower } from '@/components/marketing/HomePower';
export { HomeScanner } from '@/components/marketing/HomeScanner';
export { HomeTutor } from '@/components/marketing/HomeTutor';
export { HomePrecons } from '@/components/marketing/HomePrecons';
