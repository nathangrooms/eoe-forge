/**
 * The camera-facing side of local recognition.
 *
 * Two responsibilities, kept apart because they run at wildly different rates:
 *
 *   `framing`   assessed several times a second off the live preview, to tell
 *               the user "hold steady" / "too blurry" while they line the card
 *               up. Cheap: detection and a focus measure, no matching.
 *   `recognise` run once, on demand or on auto-capture. Does the full layered
 *               pipeline and returns ranked candidates with a confidence.
 *
 * Nothing here touches the recognition maths — that all lives in
 * `src/lib/vision/`, is pure, and is measured offline. This hook only moves
 * pixels out of a `<video>` and results into React state.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  assessFrame,
  recognizeCard,
  loadHashIndex,
  CardHashIndex,
  type FrameQuality,
  type RecognitionResult,
  type IndexLoadProgress,
  type RgbaImage,
} from '@/lib/vision';
import { supabaseHashSource } from './hashSource';
import { lookupPrintingIdentities } from './printingLookup';
import { createCollectorOcr } from './collectorOcr';

export interface UseLocalRecognitionOptions {
  /** How often to re-assess framing, in ms. */
  framingIntervalMs?: number;
  /** Enable the Tesseract layer for contested printings. Costs ~1s when it runs. */
  enableOcr?: boolean;
}

export interface LocalRecognitionState {
  /** Index load progress, or null once ready. */
  loading: IndexLoadProgress | null;
  indexSize: number;
  indexError: string | null;
  framing: FrameQuality | null;
  result: RecognitionResult | null;
  busy: boolean;
}

/**
 * Pull the current video frame into an `RgbaImage`.
 *
 * Downscaled to `maxWidth` first. A 1080p frame is 2 megapixels and detection
 * downsamples to 360px wide anyway, so copying the full frame out of the GPU
 * every tick would be pure waste — this is the single biggest cost in the live
 * loop and the easiest to get wrong.
 */
function grabFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  maxWidth: number,
): RgbaImage | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const scale = vw > maxWidth ? maxWidth / vw : 1;
  const w = Math.round(vw * scale);
  const h = Math.round(vh * scale);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  return { data: img.data, width: w, height: h };
}

/** Live preview is assessed small; a real scan gets more pixels. */
const FRAMING_WIDTH = 480;
const CAPTURE_WIDTH = 900;

export function useLocalRecognition(options: UseLocalRecognitionOptions = {}) {
  const { framingIntervalMs = 250, enableOcr = true } = options;

  const indexRef = useRef<CardHashIndex | null>(null);
  const ocrRef = useRef<ReturnType<typeof createCollectorOcr> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runningRef = useRef(false);

  const [state, setState] = useState<LocalRecognitionState>({
    loading: { phase: 'cache', loaded: 0, total: 0 },
    indexSize: 0,
    indexError: null,
    framing: null,
    result: null,
    busy: false,
  });

  if (!canvasRef.current && typeof document !== 'undefined') {
    canvasRef.current = document.createElement('canvas');
  }

  // ---- load the index once ------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const index = await loadHashIndex(supabaseHashSource, (p) => {
          if (!cancelled) setState((s) => ({ ...s, loading: p }));
        });
        if (cancelled) return;
        indexRef.current = index;
        setState((s) => ({ ...s, loading: null, indexSize: index.size }));
      } catch (err) {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: null,
          indexError: err instanceof Error ? err.message : String(err),
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Tear the OCR worker down on unmount. Tesseract spawns a real worker thread
  // and leaving it running keeps the tab busy after the user has left.
  useEffect(() => {
    return () => {
      ocrRef.current?.terminate();
      ocrRef.current = null;
    };
  }, []);

  /** Start the live framing loop against a video element. */
  const watchFraming = useCallback(
    (video: HTMLVideoElement | null) => {
      if (!video) return () => {};
      let timer: number | undefined;
      let stopped = false;

      const tick = () => {
        if (stopped) return;
        // Never assess while a real scan is in flight — it would contend for
        // the main thread with the thing the user is waiting on.
        if (!runningRef.current && canvasRef.current) {
          const frame = grabFrame(video, canvasRef.current, FRAMING_WIDTH);
          if (frame) {
            try {
              const framing = assessFrame(frame);
              setState((s) => ({ ...s, framing }));
            } catch {
              // A transient decode failure must not kill the loop.
            }
          }
        }
        timer = window.setTimeout(tick, framingIntervalMs);
      };
      tick();

      return () => {
        stopped = true;
        if (timer !== undefined) window.clearTimeout(timer);
      };
    },
    [framingIntervalMs],
  );

  /** Run the full pipeline on the current frame. */
  const recognise = useCallback(
    async (video: HTMLVideoElement | null): Promise<RecognitionResult | null> => {
      const index = indexRef.current;
      if (!index || !video || !canvasRef.current) return null;

      const frame = grabFrame(video, canvasRef.current, CAPTURE_WIDTH);
      if (!frame) return null;

      runningRef.current = true;
      setState((s) => ({ ...s, busy: true }));
      try {
        if (enableOcr && !ocrRef.current) ocrRef.current = createCollectorOcr();
        const result = await recognizeCard(frame, {
          index,
          lookupPrintings: lookupPrintingIdentities,
          ocr: enableOcr ? (img) => ocrRef.current!.read(img) : undefined,
          maxCandidates: 6,
        });
        setState((s) => ({ ...s, result, busy: false }));
        return result;
      } finally {
        runningRef.current = false;
        setState((s) => ({ ...s, busy: false }));
      }
    },
    [enableOcr],
  );

  const clearResult = useCallback(() => setState((s) => ({ ...s, result: null })), []);

  return { ...state, watchFraming, recognise, clearResult };
}
