/**
 * The local scanner.
 *
 * Points the camera at a card, tells you how the framing is doing while you
 * line it up, and identifies the card without a network round trip or a model
 * call. Recognition is a hash lookup against an index of every printing we
 * hold, cached in the browser, so the answer arrives in a few milliseconds.
 *
 * Three behaviours are deliberate and worth not "fixing" later:
 *
 * 1. **It shows several printings and asks, rather than picking one.** Reprints
 *    frequently reuse the original illustration, and when two printings share
 *    art there is nothing in the photograph that distinguishes them. Choosing
 *    silently would put the wrong row in someone's collection, where printings
 *    differ in price by orders of magnitude and the mistake is invisible.
 * 2. **The vision model is never called automatically.** It appears as a button
 *    only after local recognition has said it could not identify the card.
 * 3. **The live framing hints do not gate the shutter.** They are advice. The
 *    hash tolerates more blur than the eye expects, and refusing to scan a
 *    photo that would have matched is its own kind of failure.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Loader2, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { RecognitionResult } from '@/lib/vision';

import { useCamera } from './useCamera';
import { useLocalRecognition } from './useLocalRecognition';
import { fetchPrintings, type PrintingDetail } from './printingLookup';
import { ScanCandidateList } from './ScanCandidateList';
import { identifyWithVisionModel, frameToDataUrl } from './visionFallback';

export interface LocalScanViewProps {
  /** Called when the user commits to a printing. */
  onAccept: (printing: PrintingDetail, confidence: number) => void;
}

/** What the framing hint says, and how loudly. */
const FRAMING_COPY: Record<string, { text: string; tone: 'idle' | 'warn' | 'ready' }> = {
  'no-card': { text: 'Point the camera at a card', tone: 'idle' },
  'too-small': { text: 'Move closer', tone: 'warn' },
  'too-dark': { text: 'Too dark, find more light', tone: 'warn' },
  'too-blurry': { text: 'Hold steady', tone: 'warn' },
  ready: { text: 'Card found', tone: 'ready' },
};

export function LocalScanView({ onAccept }: LocalScanViewProps) {
  const navigate = useNavigate();
  const { videoRef, startCamera, stopCamera, isLoading, error } = useCamera();
  const {
    loading,
    indexSize,
    indexError,
    framing,
    result,
    busy,
    watchFraming,
    recognise,
    clearResult,
  } = useLocalRecognition();

  const [candidates, setCandidates] = useState<PrintingDetail[]>([]);
  const [modelBusy, setModelBusy] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelName, setModelName] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void startCamera();
    return () => stopCamera();
    // startCamera/stopCamera are stable callbacks from useCamera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => watchFraming(videoRef.current), [watchFraming, videoRef, isLoading]);

  // Turn the engine's candidate ids into cards with art. Kept out of the engine
  // so recognition itself never waits on the network.
  useEffect(() => {
    let cancelled = false;
    if (!result || result.candidates.length === 0) {
      setCandidates([]);
      return;
    }
    (async () => {
      try {
        const rows = await fetchPrintings(result.candidates.map((c) => c.cardId));
        if (!cancelled) setCandidates(rows);
      } catch {
        if (!cancelled) setCandidates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [result]);

  const distances = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of result?.candidates ?? []) m[c.cardId] = c.pDistance;
    return m;
  }, [result]);

  async function onScan() {
    setModelError(null);
    setModelName(null);
    await recognise(videoRef.current);
  }

  function onRetake() {
    clearResult();
    setCandidates([]);
    setModelError(null);
    setModelName(null);
  }

  /** The model call. Only ever reached from the button below. */
  async function onUseVisionModel() {
    const video = videoRef.current;
    if (!video) return;
    const dataUrl = frameToDataUrl(video);
    if (!dataUrl) return;
    setModelBusy(true);
    setModelError(null);
    try {
      const res = await identifyWithVisionModel(dataUrl);
      setModelName(res.name);
      setCandidates(res.printings);
      if (res.notInCatalogue) {
        setModelError(
          `The model read this as "${res.name}", but we do not hold that card in the catalogue yet.`,
        );
      }
    } catch (err) {
      setModelError(err instanceof Error ? err.message : 'The vision model call failed.');
    } finally {
      setModelBusy(false);
    }
  }

  const hint = FRAMING_COPY[framing?.state ?? 'no-card'] ?? FRAMING_COPY['no-card'];
  const indexReady = loading === null && !indexError;

  return (
    <div className="space-y-4">
      {/* ---- viewfinder ---------------------------------------------- */}
      <div className="relative overflow-hidden rounded-2xl bg-muted/30">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="aspect-[3/4] w-full bg-black object-cover sm:aspect-video"
        />

        {/* Framing guide. Follows the detected quad when there is one, so the
            user can see that the scanner is looking at the card and not the
            table. */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className={cn(
              'absolute inset-[8%] rounded-xl transition-colors duration-200',
              framing?.state === 'ready'
                ? 'shadow-[0_0_0_2px_hsl(var(--foreground)/0.55)]'
                : 'shadow-[0_0_0_2px_hsl(var(--foreground)/0.18)]',
            )}
          />
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
          <div className="flex items-center justify-between gap-3">
            <span
              className={cn(
                'text-xs font-medium',
                hint.tone === 'ready' ? 'text-white' : 'text-white/70',
              )}
            >
              {isLoading ? 'Starting camera…' : hint.text}
            </span>
            {indexReady ? (
              <span className="text-[11px] text-white/50">
                {indexSize.toLocaleString()} printings · offline
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* ---- index load / errors -------------------------------------- */}
      {loading ? (
        <div className="space-y-2 rounded-xl bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">
            {loading.phase === 'download'
              ? `Downloading the card index, ${loading.loaded.toLocaleString()} of ${loading.total.toLocaleString()}. This happens once.`
              : loading.phase === 'pack'
                ? 'Preparing the index…'
                : 'Loading the card index…'}
          </p>
          {loading.total > 0 ? (
            <Progress value={(loading.loaded / loading.total) * 100} className="h-1" />
          ) : null}
        </div>
      ) : null}

      {indexError ? (
        <p className="rounded-xl bg-muted/30 p-3 text-xs text-muted-foreground">
          The card index could not be loaded ({indexError}). Local recognition is unavailable, but
          you can still use the vision model below.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl bg-muted/30 p-3 text-xs text-muted-foreground">{error}</p>
      ) : null}

      {/* ---- controls -------------------------------------------------- */}
      <div className="flex items-center gap-2">
        <Button onClick={onScan} disabled={!indexReady || busy || isLoading} className="flex-1">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
          {busy ? 'Identifying…' : 'Scan card'}
        </Button>
        {result ? (
          <Button variant="secondary" onClick={onRetake}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retake
          </Button>
        ) : null}
      </div>

      {/* ---- result ---------------------------------------------------- */}
      {result ? (
        <ScanResult
          result={result}
          candidates={candidates}
          distances={distances}
          modelName={modelName}
          modelBusy={modelBusy}
          modelError={modelError}
          onUseVisionModel={onUseVisionModel}
          onAccept={(p) => {
            onAccept(p, confidenceScore(result));
            onRetake();
          }}
        />
      ) : null}
    </div>
  );
}

/** A 0..1 number for the scan store, derived from the engine's own distance. */
function confidenceScore(result: RecognitionResult): number {
  const top = result.candidates[0];
  if (!top) return 0;
  // 0 bits -> 1.0, 16 bits -> 0. Linear is honest enough for a display value;
  // the real decision was already made by the engine.
  return Math.max(0, Math.min(1, 1 - top.pDistance / 16));
}

interface ScanResultProps {
  result: RecognitionResult;
  candidates: PrintingDetail[];
  distances: Record<string, number>;
  modelName: string | null;
  modelBusy: boolean;
  modelError: string | null;
  onUseVisionModel: () => void;
  onAccept: (printing: PrintingDetail) => void;
}

function ScanResult({
  result,
  candidates,
  distances,
  modelName,
  modelBusy,
  modelError,
  onUseVisionModel,
  onAccept,
}: ScanResultProps) {
  const headings: Record<RecognitionResult['status'], string> = {
    resolved: 'Identified',
    'choose-printing': 'Which printing is it?',
    uncertain: 'Not sure about this one',
    'no-match': 'Could not identify this card',
    'no-card': 'No card in frame',
  };

  return (
    <section className="space-y-4 rounded-2xl bg-muted/30 p-4">
      <div className="space-y-1">
        <h2 className="text-sm font-medium text-foreground">{headings[result.status]}</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">{result.explanation}</p>
        {result.collector?.raw ? (
          <p className="text-[11px] text-muted-foreground">
            Read from the card: “{result.collector.raw.trim()}”
          </p>
        ) : null}
      </div>

      {candidates.length > 0 ? (
        <ScanCandidateList
          candidates={candidates}
          distances={distances}
          resolvedCardId={result.resolvedCardId}
          onChoose={onAccept}
          width={result.status === 'resolved' ? 208 : 160}
          heading={modelName ? `The vision model read this as “${modelName}”` : undefined}
          subheading={
            modelName
              ? 'It reads the name only, never the printing. The printing is still your call.'
              : undefined
          }
        />
      ) : null}

      {modelError ? (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {modelError}
        </p>
      ) : null}

      {/* The model, offered but never taken automatically. */}
      {result.offerVisionFallback ? (
        <div className="space-y-2 rounded-xl bg-background/40 p-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Reading it here on your device did not place this card. You can send the picture off to be
            read instead. That costs a network call, so it never happens on its own.
          </p>
          <Button size="sm" variant="secondary" onClick={onUseVisionModel} disabled={modelBusy}>
            {modelBusy ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-3.5 w-3.5" />
            )}
            {modelBusy ? 'Reading…' : 'Send the picture off to be read'}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
