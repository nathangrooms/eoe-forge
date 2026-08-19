/**
 * Local, in-browser card recognition.
 *
 * Identifies a Magic card from a camera frame by perceptual-hashing its
 * artwork against an index of every printing in the catalogue. No model call,
 * no network round trip on the happy path, no per-scan cost.
 *
 * The two things worth knowing before using this:
 *
 * 1. **It returns candidates and a confidence, never a bare answer.** Printings
 *    of the same card frequently share artwork, and when they do, no image
 *    technique can tell them apart — the information is not in the photograph.
 *    The engine detects that case and asks the user rather than guessing.
 *
 * 2. **The frame is injected.** Nothing here touches `navigator.mediaDevices`.
 *    That is what lets the whole pipeline be measured against thousands of
 *    images offline, which is where its accuracy numbers come from.
 */

export type { GrayImage, RgbaImage, NormRect } from './image.ts';
export {
  rgbaToGray,
  rgbToGray,
  resizeAreaGray,
  cropGray,
  laplacianVariance,
  meanLuma,
} from './image.ts';

export type { Hash64 } from './hash.ts';
export { pHash, dHash, hamming64, hashToHex, hexToHash, popcount32 } from './hash.ts';

export { ART_WINDOW, COLLECTOR_WINDOW, CANON_W, CANON_H } from './artWindow.ts';

export type { Point, DetectedQuad, DetectOptions } from './detect.ts';
export { detectCardQuad, warpPerspective, getPerspectiveTransform, orderCorners } from './detect.ts';

export type { IndexRow, HashCandidate } from './hashIndex.ts';
export { CardHashIndex, combinedDistance } from './hashIndex.ts';

export type { CollectorReading, PrintingIdentity, CollectorMatch } from './collectorNumber.ts';
export {
  parseCollectorLine,
  matchPrintingByCollector,
  normaliseCollectorNumber,
} from './collectorNumber.ts';

export type {
  RecognitionResult,
  RecognitionCandidate,
  RecognitionStatus,
  RecognizeOptions,
  Confidence,
  FrameQuality,
  FramingState,
  OcrFn,
  PrintingLookupFn,
} from './recognize.ts';
export {
  recognizeCard,
  assessFrame,
  rectifyCard,
  hashRectifiedCard,
  THRESHOLDS,
  QUALITY,
} from './recognize.ts';

export { loadHashIndex, clearCachedIndex, type IndexLoadProgress } from './loadIndex.ts';
