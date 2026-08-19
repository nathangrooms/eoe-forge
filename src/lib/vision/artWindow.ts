/**
 * Where the art sits on a rectified card, and the canonical rectified size.
 *
 * These bounds were derived by locating Scryfall's own `art_crop` render inside
 * the full card image by normalised cross-correlation, reported as
 *   x0 0.0804 (sd 0.0143)   y0 0.1143 (sd 0.0039)
 *   x1 0.9196 (sd 0.0141)   y1 0.5534 (sd 0.0055)
 *
 * PROVENANCE CAVEAT: the script that produced those figures was not kept, so
 * the standard deviations above cannot be reproduced from this repository and
 * should be read as recorded history, not as a live measurement. Re-derive them
 * before treating the spreads as current.
 *
 * What IS reproducible from this repo is the thing the pipeline actually
 * depends on — that this window is applied identically everywhere:
 *   * `scripts/vision/verify-hash-parity.mjs` hashes through these bounds and
 *     compares against an OpenCV reference (it needs a `ref.json` regenerated
 *     by `parity-reference.py`; the previous run's reference was not kept);
 *   * the committed fixture index in `__fixtures__/index.bin` is bit-identical
 *     to re-hashing `__fixtures__/cards/*.jpg` through this window, which is
 *     checked with no external reference and no network.
 *
 * Hashing the art rather than the whole card is the single most valuable
 * geometric choice in the pipeline. The art region carries the identity, and it
 * excludes the two areas that vary for reasons unrelated to identity: the type
 * line and rules text (which reprints re-set and re-wrap) and the card border
 * (where sleeve edges, glare and detection slop all land).
 *
 * Known limit: full-art and borderless cards do not put their art here. The
 * `full_art` / `border_color` / `frame_effects` columns that would let us pick a
 * per-treatment window exist in the schema but are 100% NULL as of this writing,
 * so every card currently uses the normal-frame window. Cards whose true art
 * window differs are the pipeline's main source of wrong-card errors.
 */

import type { NormRect } from './image.ts';

/** Art window for a standard card frame, as a fraction of the rectified card. */
export const ART_WINDOW: NormRect = { x0: 0.0804, y0: 0.1143, x1: 0.9196, y1: 0.5534 };

/**
 * The bottom-left block carrying collector number, set code and language.
 *
 * Deliberately generous — the line sits at slightly different heights across
 * frame generations, and Tesseract copes better with a little margin than with
 * a crop that clips ascenders.
 */
export const COLLECTOR_WINDOW: NormRect = { x0: 0.03, y0: 0.885, x1: 0.62, y1: 0.975 };

/** Canonical rectified card size. Matches the aspect of a real 63x88mm card. */
export const CANON_W = 488;
export const CANON_H = 680;
