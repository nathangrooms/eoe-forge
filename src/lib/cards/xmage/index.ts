/**
 * The card record: one shape, four consumers.
 *
 * Derived from XMage, MIT, Copyright (c) 2010 betasteward@gmail.com,
 * https://github.com/magefree/mage. The XMage clone is read in place and
 * nothing from it is vendored into this repository. Forge is GPL-3.0 and was
 * not fetched, read or referenced.
 *
 * The design argument, the hard-list walkthrough and the honest list of what
 * this shape cannot express are in `docs/engine/CARD-SEMANTICS.md`.
 */

export * from './record.ts';
export * from './roles.ts';
export * from './compare.ts';
export * from './lower.ts';
export * from './coverage.ts';

/* The ported vocabularies. One file per kind of thing an XMage argument can be,
 * each with its own measured census and its own list of what it refuses and
 * why. `docs/engine/PORT-LOG.md` is the ranked order they were written in and
 * what each one bought. */
export * from './keywords.ts';
export * from './triggers.ts';
export * from './targets.ts';
export * from './costs.ts';
export * from './values.ts';
export * from './modifications.ts';
export { XMAGE_TOKENS, XMAGE_TOKENS_STATS, type TokenEntry } from './tokens.generated.ts';
export { XMAGE_COUNTERS } from './counters.generated.ts';
