/**
 * The recognition pipeline: a frame in, ranked candidates and a confidence out.
 *
 * Layered most-reliable-signal-first, and built around one rule: **it never
 * silently picks a printing.** Every path either produces an answer it can
 * justify, or hands the user a short list to choose from. A collection tracker
 * that quietly records the wrong printing is worse than one that asks, because
 * the user has no way to discover the error — printings of the same card differ
 * in price by orders of magnitude but look identical in a collection list.
 *
 * The camera frame is a parameter, not something this module goes and fetches.
 * That is what makes the whole pipeline testable from a JPEG on disk with no
 * webcam, no DOM and no browser, which is how its accuracy is measured.
 *
 *   Layer 1  detect and rectify        -> a flat 488x680 card, or "no card"
 *   Layer 2  art pHash + dHash         -> which card, with a distance
 *   Layer 3  printing resolution       -> sole printing / OCR / ask the user
 *
 * Layer 3 only runs when layer 2 found something, and the OCR step inside it
 * only runs when the card genuinely has more than one printing we hold. On the
 * overwhelming majority of scans the answer comes from layer 2 alone, in about
 * a millisecond, with no network and no OCR.
 */

import { rgbaToGray, cropGray, laplacianVariance, meanLuma, type GrayImage, type RgbaImage } from './image.ts';
import { pHash, dHash, type Hash64 } from './hash.ts';
import { ART_WINDOW, COLLECTOR_WINDOW, CANON_W, CANON_H } from './artWindow.ts';
import { detectCardQuad, warpPerspective, type DetectedQuad, type DetectOptions } from './detect.ts';
import { CardHashIndex, type HashCandidate } from './hashIndex.ts';
import {
  parseCollectorLine,
  matchPrintingByCollector,
  type CollectorReading,
  type PrintingIdentity,
} from './collectorNumber.ts';

/**
 * Distance thresholds, in art-pHash Hamming bits.
 *
 * These are calibrated by `scripts/vision/evaluate.mjs`, which runs the real
 * pipeline over simulated captures of real catalogue images and reports the
 * precision and acceptance rate at each threshold. Changing them without
 * re-running that script invalidates every accuracy claim made about this
 * module, so the script prints the table the numbers come from.
 */
export const THRESHOLDS = {
  /** At or below this, the card identity is treated as settled. */
  accept: 8,
  /** Between `accept` and this, we have a guess but say so and offer alternatives. */
  review: 14,
  /**
   * Two candidates within this many bits of each other are not meaningfully
   * distinguishable, so both are shown rather than one being picked.
   *
   * Measured, and higher than intuition suggests. `scripts/vision/sibling-distances.mjs`
   * over all 23,335 printings belonging to multi-printing cards found the
   * distance from each printing to its NEAREST sibling:
   *
   *     <= 0 bits   31.2%      <= 6 bits   76.1%
   *     <= 2 bits   57.4%      <= 8 bits   79.1%
   *     <= 4 bits   70.2%      <= 12 bits  82.4%
   *
   * The distribution has a knee around 6 and then flattens — printings inside
   * it reuse the same illustration, printings beyond it have genuinely
   * different art. Crucially, reused art does NOT give identical hashes: the
   * catalogue renders still differ in set symbol, holo stamp and frame, which
   * moves the hash a few bits. On top of that the photograph itself lands a
   * median 4 bits from its own catalogue render, so two same-art printings can
   * easily swap places.
   *
   * A margin of 3 assumed "same art means same hash" and therefore committed to
   * whichever near-tie happened to land closer. That produced 8 wrong printings
   * in 1,680 captures, every one of them the right card. At 6 the engine defers
   * those instead.
   */
  ambiguityMargin: 6,
} as const;

/** Live framing feedback, cheap enough to run on every preview frame. */
export type FramingState =
  | 'no-card'
  | 'too-small'
  | 'too-blurry'
  | 'too-dark'
  | 'hold-steady'
  | 'ready';

export interface FrameQuality {
  state: FramingState;
  /** Variance of the Laplacian on the rectified card. Higher is sharper. */
  sharpness: number;
  /** Mean luma of the rectified card, 0..255. */
  brightness: number;
  /** Fraction of the frame the card occupies. */
  areaFraction: number;
  quad: DetectedQuad | null;
}

/**
 * Focus and exposure limits.
 *
 * Measured on rectified 488x680 cards rather than on raw frames, so they do not
 * shift when the camera resolution does. `sharpnessFloor` is set where the
 * evaluation showed hash accuracy starting to fall away rather than at the
 * point an image looks bad to a human — the hash tolerates more blur than the
 * eye expects, and nagging the user to re-frame a photo that would have matched
 * is its own kind of failure.
 */
export const QUALITY = {
  sharpnessFloor: 55,
  brightnessFloor: 40,
  minAreaFraction: 0.10,
} as const;

export interface RecognitionCandidate {
  cardId: string;
  oracleGroup: number;
  /** Art pHash Hamming distance, 0..64. The primary evidence. */
  pDistance: number;
  /** Art dHash Hamming distance, 0..64. Independent second opinion. */
  dDistance: number;
  /** Combined ranking score. */
  distance: number;
  /** Why this candidate is in the list. */
  reason: 'hash' | 'sole-printing' | 'collector-number' | 'sibling-printing';
}

export type RecognitionStatus =
  /** One card, one printing, confidently. */
  | 'resolved'
  /** Card is known; several printings are plausible and the user must choose. */
  | 'choose-printing'
  /** A guess exists but is not trustworthy. Candidates shown, nothing recorded. */
  | 'uncertain'
  /** Nothing matched well enough to show. */
  | 'no-match'
  /** No card found in the frame at all. */
  | 'no-card';

export type Confidence = 'high' | 'medium' | 'low';

export interface RecognitionResult {
  status: RecognitionStatus;
  confidence: Confidence;
  /** Ranked, best first. Never empty unless status is `no-card` or `no-match`. */
  candidates: RecognitionCandidate[];
  /** Set only when status is `resolved`. */
  resolvedCardId: string | null;
  /** How the printing was settled, for the UI to explain itself. */
  resolvedBy: 'hash-unique-art' | 'sole-printing' | 'collector-number' | null;
  quality: FrameQuality;
  /** What OCR read, when it ran. Null when it was not needed or not supplied. */
  collector: CollectorReading | null;
  /**
   * True when local recognition could not settle it and the remote vision model
   * is worth offering. The UI must present this as a choice — this flag never
   * triggers a model call on its own.
   */
  offerVisionFallback: boolean;
  /** Human-readable account of what happened, for the UI and for debugging. */
  explanation: string;
  timings: { detectMs: number; hashMs: number; searchMs: number; ocrMs: number; totalMs: number };
}

/** OCR is injected so the engine stays pure and testable without Tesseract. */
export type OcrFn = (image: GrayImage) => Promise<string>;

/** Printing metadata lookup, injected. Only called when a printing is contested. */
export type PrintingLookupFn = (cardIds: string[]) => Promise<PrintingIdentity[]>;

export interface RecognizeOptions {
  index: CardHashIndex;
  /** Supply to enable the collector-number layer. Without it, contested printings go straight to the user. */
  ocr?: OcrFn;
  lookupPrintings?: PrintingLookupFn;
  detect?: DetectOptions;
  /** Pre-detected corners, to skip layer 1 when the caller already has them. */
  quad?: DetectedQuad | null;
  maxCandidates?: number;
}

/**
 * Assess a frame without matching it. Cheap enough for every preview frame.
 *
 * Deliberately separate from {@link recognizeCard}: the UI needs to tell the
 * user "hold steady" many times a second, and running a full hash search to do
 * that would be wasteful.
 */
export function assessFrame(frame: RgbaImage, options: DetectOptions = {}): FrameQuality {
  const gray = rgbaToGray(frame);
  const quad = detectCardQuad(gray, options);
  if (!quad) {
    return { state: 'no-card', sharpness: 0, brightness: meanLuma(gray), areaFraction: 0, quad: null };
  }

  const card = warpPerspective(gray, quad.corners, CANON_W, CANON_H);
  const sharpness = laplacianVariance(card);
  const brightness = meanLuma(card);

  let state: FramingState = 'ready';
  if (quad.areaFraction < QUALITY.minAreaFraction) state = 'too-small';
  else if (brightness < QUALITY.brightnessFloor) state = 'too-dark';
  else if (sharpness < QUALITY.sharpnessFloor) state = 'too-blurry';

  return { state, sharpness, brightness, areaFraction: quad.areaFraction, quad };
}

/**
 * Rectify a frame to the canonical card image, or null if no card is found.
 * Exposed because the camera UI wants to show the user what it is about to match.
 */
export function rectifyCard(
  frame: RgbaImage,
  options: DetectOptions = {},
  quad?: DetectedQuad | null,
): { card: GrayImage; quad: DetectedQuad } | null {
  const gray = rgbaToGray(frame);
  const q = quad ?? detectCardQuad(gray, options);
  if (!q) return null;
  return { card: warpPerspective(gray, q.corners, CANON_W, CANON_H), quad: q };
}

/** Hash the art window of an already-rectified card. */
export function hashRectifiedCard(card: GrayImage): { p: Hash64; d: Hash64 } {
  const art = cropGray(card, ART_WINDOW);
  return { p: pHash(art), d: dHash(art) };
}

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

/**
 * Run the full pipeline over one frame.
 *
 * Async only because the OCR and printing-lookup layers are; the hash path that
 * answers most scans never awaits anything.
 */
export async function recognizeCard(
  frame: RgbaImage,
  options: RecognizeOptions,
): Promise<RecognitionResult> {
  const t0 = now();
  const maxCandidates = options.maxCandidates ?? 5;
  const timings = { detectMs: 0, hashMs: 0, searchMs: 0, ocrMs: 0, totalMs: 0 };

  // ---- Layer 1: find and flatten the card -------------------------------
  const gray = rgbaToGray(frame);
  const tDetect = now();
  const quad = options.quad ?? detectCardQuad(gray, options.detect);
  timings.detectMs = now() - tDetect;

  if (!quad) {
    timings.totalMs = now() - t0;
    return {
      status: 'no-card',
      confidence: 'low',
      candidates: [],
      resolvedCardId: null,
      resolvedBy: null,
      quality: { state: 'no-card', sharpness: 0, brightness: meanLuma(gray), areaFraction: 0, quad: null },
      collector: null,
      offerVisionFallback: false,
      explanation: 'No card-shaped object found in the frame.',
      timings,
    };
  }

  const card = warpPerspective(gray, quad.corners, CANON_W, CANON_H);
  const sharpness = laplacianVariance(card);
  const brightness = meanLuma(card);
  const quality: FrameQuality = {
    state:
      quad.areaFraction < QUALITY.minAreaFraction
        ? 'too-small'
        : brightness < QUALITY.brightnessFloor
          ? 'too-dark'
          : sharpness < QUALITY.sharpnessFloor
            ? 'too-blurry'
            : 'ready',
    sharpness,
    brightness,
    areaFraction: quad.areaFraction,
    quad,
  };

  // ---- Layer 2: which card? ---------------------------------------------
  const tHash = now();
  const { p, d } = hashRectifiedCard(card);
  timings.hashMs = now() - tHash;

  const tSearch = now();
  const hits = options.index.search(p, d, Math.max(maxCandidates * 2, 10));
  timings.searchMs = now() - tSearch;

  if (hits.length === 0) {
    timings.totalMs = now() - t0;
    return {
      status: 'no-match',
      confidence: 'low',
      candidates: [],
      resolvedCardId: null,
      resolvedBy: null,
      quality,
      collector: null,
      offerVisionFallback: true,
      explanation: 'The index returned nothing. It may not be loaded.',
      timings,
    };
  }

  const best = hits[0];

  // Beyond `review` bits the top hit carries no useful information — the
  // measured distance distribution for wrong cards sits squarely in this range,
  // so reporting a candidate here would be presenting noise as a guess.
  if (best.pDistance > THRESHOLDS.review) {
    timings.totalMs = now() - t0;
    return {
      status: 'no-match',
      confidence: 'low',
      candidates: [],
      resolvedCardId: null,
      resolvedBy: null,
      quality,
      collector: null,
      offerVisionFallback: true,
      explanation:
        quality.state === 'ready'
          ? `Closest match is ${best.pDistance} bits away, past the point where matches are trustworthy. The card may not be in the catalogue.`
          : `Frame quality is "${quality.state}" and nothing matched closely.`,
      timings,
    };
  }

  // Candidates for a *different card* — grouped so several printings of the
  // same card do not eat all five slots.
  const cardLevel = dedupeByGroup(hits);
  const confident = best.pDistance <= THRESHOLDS.accept;

  // Is the card identity itself contested? Two different cards at similar
  // distance means we should not commit even if the top one is close.
  const runnerUp = cardLevel.find((c) => c.oracleGroup !== best.oracleGroup);
  const cardContested =
    runnerUp !== undefined && runnerUp.pDistance - best.pDistance < THRESHOLDS.ambiguityMargin;

  if (!confident || cardContested) {
    timings.totalMs = now() - t0;
    return {
      status: 'uncertain',
      confidence: cardContested ? 'low' : 'medium',
      candidates: cardLevel.slice(0, maxCandidates).map((c) => toCandidate(c, 'hash')),
      resolvedCardId: null,
      resolvedBy: null,
      quality,
      collector: null,
      offerVisionFallback: true,
      explanation: cardContested
        ? `Two different cards match about equally well (${best.pDistance} and ${runnerUp!.pDistance} bits apart). Pick one, or use the vision model.`
        : `Best match is ${best.pDistance} bits away. Plausible, but not certain.`,
      timings,
    };
  }

  // ---- Layer 3: which printing? -----------------------------------------
  const siblings = options.index.printingsInGroup(best.oracleGroup);

  // 3a. Only one printing exists. Nothing to disambiguate.
  if (siblings.length <= 1) {
    timings.totalMs = now() - t0;
    return {
      status: 'resolved',
      confidence: best.pDistance <= 4 ? 'high' : 'medium',
      candidates: [toCandidate(best, 'sole-printing')],
      resolvedCardId: best.cardId,
      resolvedBy: 'sole-printing',
      quality,
      collector: null,
      offerVisionFallback: false,
      explanation: `Matched at ${best.pDistance} bits; this is the only printing of it we hold.`,
      timings,
    };
  }

  // 3b. Several printings exist. Do they actually look different? If the art
  // differs, the hash has already told them apart and we can trust it. If they
  // are near-identical in hash space, the art is shared and the hash is at
  // chance between them — no threshold can fix that, so it must not try.
  const siblingHits = siblings
    .map((id) => options.index.distanceTo(id, p, d))
    .filter((x): x is HashCandidate => x !== null)
    .sort((a, b) => a.distance - b.distance);

  const contenders = siblingHits.filter(
    (s) => s.pDistance - siblingHits[0].pDistance < THRESHOLDS.ambiguityMargin,
  );

  if (contenders.length === 1) {
    timings.totalMs = now() - t0;
    return {
      status: 'resolved',
      // Graded by distance, on the same rule as the sole-printing branch above.
      // This used to be an unconditional 'high', which meant an 8-bit match on a
      // multi-printing card reported MORE confidence than the identical 8-bit
      // match on a single-printing one — the harder case claiming the better
      // score. The uniqueness of the winner is already carried by
      // `resolvedBy: 'hash-unique-art'`; `confidence` should describe how well
      // the photograph actually matched, and nothing else.
      confidence: contenders[0].pDistance <= 4 ? 'high' : 'medium',
      candidates: siblingHits.slice(0, maxCandidates).map((c) => toCandidate(c, 'hash')),
      resolvedCardId: contenders[0].cardId,
      resolvedBy: 'hash-unique-art',
      quality,
      collector: null,
      offerVisionFallback: false,
      explanation:
        `This card has ${siblings.length} printings and their art differs; ` +
        `the photograph matches this one at ${contenders[0].pDistance} bits, ` +
        `the next at ${siblingHits[1]?.pDistance}.`,
      timings,
    };
  }

  // 3c. Shared art. The collector number is now the only real evidence.
  let collector: CollectorReading | null = null;
  if (options.ocr && options.lookupPrintings) {
    const tOcr = now();
    try {
      const block = cropGray(card, COLLECTOR_WINDOW);
      const text = await options.ocr(block);
      collector = parseCollectorLine(text);
      const identities = await options.lookupPrintings(contenders.map((c) => c.cardId));
      const matches = matchPrintingByCollector(collector, identities);
      const exact = matches.filter((m) => m.exact);
      timings.ocrMs = now() - tOcr;

      // Exactly one printing agreed on both number and set code. That
      // conjunction is strong enough to override the hash's indifference.
      if (exact.length === 1) {
        const chosen = contenders.find((c) => c.cardId === exact[0].cardId) ?? contenders[0];
        timings.totalMs = now() - t0;
        return {
          status: 'resolved',
          confidence: 'high',
          candidates: contenders.slice(0, maxCandidates).map((c) => toCandidate(c, 'collector-number')),
          resolvedCardId: exact[0].cardId,
          resolvedBy: 'collector-number',
          quality,
          collector,
          offerVisionFallback: false,
          explanation:
            `${siblings.length} printings share this artwork, so the art cannot tell them apart. ` +
            `Read "${collector.setCode ?? '?'} ${collector.collectorNumber ?? '?'}" off the card, ` +
            `which matches exactly one of them.`,
          timings,
        };
      }
    } catch {
      timings.ocrMs = now() - tOcr;
      // OCR failing is routine, not exceptional. Fall through to the picker.
    }
  }

  // 3d. Ask. This is the honest outcome, not a failure.
  timings.totalMs = now() - t0;
  const sharedArtNote =
    collector?.looksPre2015 === true
      ? ' This card predates printed collector numbers, so there is nothing on it that identifies the printing.'
      : '';
  return {
    status: 'choose-printing',
    confidence: 'medium',
    candidates: contenders.slice(0, maxCandidates).map((c) => toCandidate(c, 'sibling-printing')),
    resolvedCardId: null,
    resolvedBy: null,
    quality,
    collector,
    offerVisionFallback: false,
    explanation:
      `Identified the card at ${best.pDistance} bits, but ${contenders.length} printings ` +
      `share this artwork and are indistinguishable by image.${sharedArtNote} Pick the one you have.`,
    timings,
  };
}

function toCandidate(
  h: HashCandidate,
  reason: RecognitionCandidate['reason'],
): RecognitionCandidate {
  return {
    cardId: h.cardId,
    oracleGroup: h.oracleGroup,
    pDistance: h.pDistance,
    dDistance: h.dDistance,
    distance: h.distance,
    reason,
  };
}

/** Keep the best hit per card, so the candidate list is five cards not five printings. */
function dedupeByGroup(hits: readonly HashCandidate[]): HashCandidate[] {
  const seen = new Set<number>();
  const out: HashCandidate[] = [];
  for (const h of hits) {
    if (seen.has(h.oracleGroup)) continue;
    seen.add(h.oracleGroup);
    out.push(h);
  }
  return out;
}
