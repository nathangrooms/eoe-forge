import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import {
  Camera,
  Settings as SettingsIcon,
  Search,
  Loader2,
  RotateCcw,
  Check,
  AlertCircle,
  Pause,
  Play,
  Undo2,
  Package,
  Layers,
  FolderOpen
} from 'lucide-react';
import { useScanStore, type ScannedCard } from './store';
import { scryfallFuzzySearch, type CardCandidate } from './cardRecognition';
import { useLocalRecognition } from './useLocalRecognition';
import { fetchPrintings } from './printingLookup';
import { identifyWithVisionModel, frameToDataUrl } from './visionFallback';
import { logActivity } from '@/features/dashboard/hooks';
import { useAutoCapture } from './useAutoCapture';
import { CardImage, cardDetailPath } from '@/components/cards';

/**
 * A scan candidate carries one image URL, not a Scryfall image set. This wraps
 * it in the shape `CardImage` reads, so the scanner draws its cards through the
 * one card component — at the real 488:680 aspect, never `object-cover` in a
 * box of some other ratio.
 */
function cardShapeOf(candidate: { name: string; imageUrl?: string }) {
  const url = candidate.imageUrl || '';
  return {
    name: candidate.name,
    image_uris: url ? { small: url, normal: url, large: url } : {},
  };
}

/**
 * The "Added to collection" card, as a link to the card it names.
 *
 * Drawn at `sm` (110px) rather than the 48px it used to be: this is the one
 * card on the viewfinder a person is asked to look at and judge, and a 48px
 * thumbnail is not something you can check a printing against.
 */
function LastAddedIdentity({ card }: { card: ScannedCard }) {
  const href = cardDetailPath({ id: card.cardId, name: card.name });

  const body = (
    <>
      <CardImage card={cardShapeOf(card)} size="sm" hideFlip className="shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white/70 flex items-center gap-1">
          <Check className="h-3 w-3" /> Added to collection
        </p>
        <p className="font-medium text-white truncate">{card.name}</p>
        <p className="text-xs text-white/50 uppercase">{card.setCode}</p>
      </div>
    </>
  );

  if (!href) {
    return <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>;
  }

  return (
    <Link
      to={href}
      title={`Open ${card.name}`}
      className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </Link>
  );
}

interface CameraScanViewProps {
  onCardAdded?: (card: any) => void;
}

/**
 * The live camera scanning surface. This used to be a full-screen Dialog that
 * hid its own close button and forced `w-screen h-screen` — which was the code
 * admitting it wanted to be a page. It is now rendered by the /scan/camera
 * route: no overlay, no focus trap, and Back leaves it.
 */
export function CameraScanView({ onCardAdded }: CameraScanViewProps) {
  const {
    settings,
    updateSettings,
    addRecentScan,
    removeRecentScan
  } = useScanStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [candidates, setCandidates] = useState<CardCandidate[]>([]);
  const [manualSearch, setManualSearch] = useState('');
  const [lastRecognized, setLastRecognized] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<'idle' | 'capturing' | 'analyzing' | 'matching' | 'success' | 'error'>('idle');
  /**
   * Auto-capture reads the persisted setting.
   *
   * This was `useState(true)` — a local flag that ignored `settings.autoCapture`
   * entirely, which is why the Auto-capture switch on /scan was a dead control:
   * it wrote to the store and nothing in the app ever read it back. The flag now
   * seeds from the store and writes through, so the toggle on /scan and the
   * pause button in here are the same switch.
   */
  const autoScanEnabled = settings.autoCapture;
  const setAutoScanEnabled = useCallback(
    (next: boolean) => updateSettings({ autoCapture: next }),
    [updateSettings]
  );
  const [cameraReady, setCameraReady] = useState(false);
  const [lastAddedCard, setLastAddedCard] = useState<ScannedCard | null>(null);
  const [decks, setDecks] = useState<Array<{ id: string; name: string }>>([]);
  const [storageContainers, setStorageContainers] = useState<Array<{ id: string; name: string }>>([]);

  /**
   * Local, in-browser recognition. Replaces the per-scan Gemini call that used
   * to sit on this path.
   *
   * The old flow posted every captured frame to `scan-card-ai`, which cost a
   * model call and a network round trip per card and only ever returned a NAME
   * — so the printing was whichever row happened to sort first. Hashing the art
   * against an index of every printing we hold is faster, free, works offline,
   * and can actually distinguish printings whose art differs.
   */
  const local = useLocalRecognition({ enableOcr: true });
  /** Set when local recognition gave up, which is the only way the model is reachable. */
  const [modelOffer, setModelOffer] = useState<string | null>(null);
  const [modelBusy, setModelBusy] = useState(false);

  // Fetch decks and storage containers for settings
  useEffect(() => {
    const fetchOptions = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const [decksRes, storageRes] = await Promise.all([
        supabase.from('user_decks').select('id, name').eq('user_id', session.user.id).limit(20),
        supabase.from('storage_containers').select('id, name').eq('user_id', session.user.id).limit(20)
      ]);

      if (decksRes.data) setDecks(decksRes.data);
      if (storageRes.data) setStorageContainers(storageRes.data);
    };

    fetchOptions();
  }, []);

  // Capture frame for auto-capture hook
  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx || video.videoWidth === 0) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }, []);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      setIsLoading(true);
      setCameraError(null);
      setCameraReady(false);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }
    } catch (error: any) {
      console.error('Camera error:', error);
      setCameraError(error.message || 'Could not access camera');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  // Add card to collection
  const addCardToCollection = useCallback(async (candidate: CardCandidate, quantity = 1) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        // Silent fail for auth errors during scanning - don't interrupt the flow
        console.error('Auth required to add cards');
        return;
      }

      // Ensure we have a valid set_code (required field)
      const setCode = candidate.setCode || 'unknown';

      const { data: existingCard } = await supabase
        .from('user_collections')
        .select('id, quantity')
        .eq('card_id', candidate.cardId)
        .eq('user_id', session.user.id)
        .maybeSingle();

      let result;
      if (existingCard) {
        result = await supabase
          .from('user_collections')
          .update({
            quantity: existingCard.quantity + quantity,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingCard.id);
      } else {
        result = await supabase
          .from('user_collections')
          .insert({
            card_id: candidate.cardId,
            card_name: candidate.name,
            set_code: setCode,
            quantity,
            user_id: session.user.id
          });
      }

      if (result.error) {
        console.error('Database insert error:', result.error);
        throw result.error;
      }

      const scannedCard: ScannedCard = {
        id: `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        cardId: candidate.cardId,
        oracleId: candidate.oracleId,
        name: candidate.name,
        setCode: setCode,
        setName: setCode.toUpperCase(),
        imageUrl: candidate.imageUrl,
        priceUsd: candidate.priceUsd,
        quantity,
        scannedAt: new Date().toISOString(),
        confidence: candidate.score
      };

      addRecentScan(scannedCard);
      setLastAddedCard(scannedCard);
      setLastRecognized(null);

      // Keep last added card visible until the NEXT scan replaces it (no auto-clear)

      await logActivity('card_added', 'card', candidate.cardId, {
        name: candidate.name,
        source: 'camera_scan',
        quantity
      });

      setCandidates([]);
      onCardAdded?.(candidate);

    } catch (error: any) {
      console.error('Add card error:', error);
      // No toast - silent fail to avoid interrupting scanning flow
    }
  }, [addRecentScan, onCardAdded]);

  /**
   * Identify the card in the current frame, locally.
   *
   * This used to POST the frame to `scan-card-ai` (Gemini) on every single
   * scan. That cost a model call and a network round trip per card, failed
   * offline, and — because the model returns a card NAME and nothing else —
   * could never identify which PRINTING you were holding. Whichever row sorted
   * first went into the collection, and printings of the same card differ in
   * price by orders of magnitude.
   *
   * Now the art is perceptual-hashed against an index of every printing we
   * hold, in the browser, in about a millisecond. The model is still available
   * but only behind an explicit button, and only after this has said it could
   * not identify the card. See `visionFallback.ts`.
   */
  const captureAndAnalyze = useCallback(async (_imageData?: ImageData) => {
    if (processing) return;
    if (!videoRef.current) return;

    setProcessing(true);
    setModelOffer(null);
    setScanStatus('analyzing');

    try {
      const result = await local.recognise(videoRef.current);
      if (!result) {
        setScanStatus('idle');
        return;
      }

      if (result.status === 'no-card' || result.status === 'no-match' || result.status === 'uncertain') {
        setCandidates([]);
        setLastRecognized(null);
        // The ONLY place the model becomes reachable. Offering is not calling.
        setModelOffer(result.offerVisionFallback ? result.explanation : null);
        setScanStatus(result.status === 'no-card' ? 'idle' : 'error');
        setTimeout(() => setScanStatus('idle'), 1200);
        return;
      }

      setScanStatus('matching');

      // Turn the engine's ids into cards with art, names and prices.
      const printings = await fetchPrintings(result.candidates.map((c) => c.cardId));
      if (printings.length === 0) {
        setScanStatus('error');
        setTimeout(() => setScanStatus('idle'), 1200);
        return;
      }

      const asCandidates: CardCandidate[] = printings.map((p) => {
        const hit = result.candidates.find((c) => c.cardId === p.cardId);
        return {
          // A 0..1 display score derived from the engine's own Hamming
          // distance: 0 bits is certain, 16 bits is worthless. `THRESHOLDS.review`
          // (14) is the point past which the engine discards a hit entirely, so
          // 16 is just beyond the last distance that can reach here.
          //
          // The fallback is 0, not a middling 0.5. `printings` is derived from
          // `result.candidates`, so a miss means the row came back without a
          // matching candidate — i.e. we have no distance for it at all. A
          // no-evidence case must not be recorded as half-confident: this value
          // ends up in `ScannedCard.confidence`, which `/scan` averages and
          // shows as a percentage.
          score: hit ? Math.max(0, Math.min(1, 1 - hit.pDistance / 16)) : 0,
          oracleId: p.oracleId,
          name: p.name,
          setCode: p.setCode,
          cardId: p.cardId,
          imageUrl: p.imageUris.normal || p.imageUris.large || p.imageUris.small || '',
          priceUsd: p.priceUsd ?? undefined,
        };
      });

      setLastRecognized(asCandidates[0]?.name ?? null);

      // Auto-add ONLY when the engine committed to a single printing. When it
      // says "choose-printing" there are several printings it cannot tell
      // apart, and adding one silently is exactly the bug this rewrite exists
      // to remove — so those always go to the user, whatever the setting says.
      const committed = result.status === 'resolved' && result.resolvedCardId;
      if (committed && settings.autoAdd) {
        const chosen = asCandidates.find((c) => c.cardId === result.resolvedCardId);
        if (chosen) {
          await addCardToCollection(chosen);
          setScanStatus('success');
          setLastRecognized(null);
          setTimeout(() => setScanStatus('idle'), 1200);
          return;
        }
      }

      setCandidates(asCandidates);
      setScanStatus('idle');
    } catch (error) {
      console.error('Scan error:', error);
      setScanStatus('error');
      setTimeout(() => setScanStatus('idle'), 1500);
    } finally {
      setProcessing(false);
    }
  }, [processing, settings.autoAdd, addCardToCollection, local]);

  /**
   * Call the vision model. Reachable ONLY from the button rendered when
   * `modelOffer` is set, i.e. only after local recognition failed.
   *
   * The model reads a name, never a printing, so its answer is still presented
   * as a list of printings for the user to choose from rather than committed to.
   */
  const runVisionModel = useCallback(async () => {
    if (!videoRef.current) return;
    const dataUrl = frameToDataUrl(videoRef.current);
    if (!dataUrl) return;
    setModelBusy(true);
    try {
      const res = await identifyWithVisionModel(dataUrl);
      setLastRecognized(res.name);
      setCandidates(
        res.printings.map((p) => ({
          // 1 means "a human confirmed this", not "the algorithm was sure".
          //
          // This was 0.8 — a number nothing measured. It mattered because the
          // value lands in `ScannedCard.confidence`, which `/scan` averages and
          // renders as a percentage: an invented 0.8 quietly inflated a quality
          // figure the user reads, for the one path where the local recogniser
          // had in fact failed completely.
          //
          // There is no image-derived confidence to report here. The model
          // returns a NAME and no printing, so every printing of that name is
          // equally plausible until the user taps one — and they tap it while
          // looking at its art. The only true statement available is that the
          // identity was confirmed by a person rather than by a hash, and 1
          // encodes that without pretending a measurement happened.
          score: 1,
          oracleId: p.oracleId,
          name: p.name,
          setCode: p.setCode,
          cardId: p.cardId,
          imageUrl: p.imageUris.normal || p.imageUris.large || p.imageUris.small || '',
          priceUsd: p.priceUsd ?? undefined,
        })),
      );
      setModelOffer(
        res.notInCatalogue
          ? `The model read this as "${res.name}", but we do not hold that card yet.`
          : null,
      );
    } catch (err) {
      console.error('Vision model error:', err);
      setModelOffer('The vision model call failed. Try reframing and scanning again.');
    } finally {
      setModelBusy(false);
    }
  }, []);

  // Auto-capture hook - ultra-aggressive settings for maximum speed
  useAutoCapture(
    captureFrame,
    (imageData) => captureAndAnalyze(imageData),
    {
      enabled: autoScanEnabled && cameraReady && !processing && candidates.length === 0,
      // The stored threshold, not a constant beside an unread setting.
      sharpnessThreshold: settings.sharpnessThreshold,
      stabilityDelay: 100, // Ultra-quick 100ms stability check
      cooldownDelay: 800 // 0.8s between scans for rapid-fire scanning
    }
  );

  // Undo last added card
  const undoLastAdd = async () => {
    if (!lastAddedCard) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      // Find and reduce or delete from collection
      const { data: existingCard } = await supabase
        .from('user_collections')
        .select('id, quantity')
        .eq('card_id', lastAddedCard.cardId)
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (existingCard) {
        if (existingCard.quantity <= lastAddedCard.quantity) {
          await supabase.from('user_collections').delete().eq('id', existingCard.id);
        } else {
          await supabase
            .from('user_collections')
            .update({ quantity: existingCard.quantity - lastAddedCard.quantity })
            .eq('id', existingCard.id);
        }
      }

      removeRecentScan(lastAddedCard.id);
      setLastAddedCard(null);
    } catch (error) {
      console.error('Undo error:', error);
    }
  };

  // Manual search
  const handleManualSearch = async () => {
    if (!manualSearch.trim()) return;

    setProcessing(true);
    try {
      const result = await scryfallFuzzySearch(manualSearch);
      setCandidates(result.candidates);
      setLastRecognized(manualSearch);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setProcessing(false);
    }
  };

  // The camera owns the lifetime of the route, not of an overlay.
  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const getStatusText = () => {
    switch (scanStatus) {
      case 'capturing': return 'Capturing...';
      case 'analyzing': return 'Analyzing...';
      case 'matching': return 'Finding Card...';
      case 'success': return 'Card Added!';
      case 'error': return 'Try Again';
      default: return autoScanEnabled ? 'Auto-scanning...' : 'Tap to Scan';
    }
  };

  /**
   * Scanner state is carried by the icon and the label, not by a hue. Green for
   * success / amber for busy / red for error is generic-web-app colour on a
   * surface where colour means mana.
   */
  const getStatusColor = () => {
    switch (scanStatus) {
      case 'error': return 'bg-muted text-muted-foreground';
      case 'analyzing':
      case 'matching': return 'bg-secondary text-secondary-foreground';
      default: return 'bg-primary text-primary-foreground';
    }
  };

  return (
    <div className="flex flex-col rounded-lg overflow-hidden bg-black text-white shadow-lg">
      {/* Status strip */}
      <div className="flex items-center justify-between gap-2 p-3 bg-black/80">
        <div className="flex items-center gap-3">
          <Camera className="h-4 w-4" />
          <span className="text-sm font-medium">
            {lastRecognized ?? 'Card scanner'}
          </span>
          {processing && (
            <Badge variant="secondary">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Processing
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowSettings(!showSettings)}
          className="text-white hover:bg-white/10"
        >
          <SettingsIcon className="h-4 w-4 mr-2" />
          {showSettings ? 'Hide options' : 'Options'}
        </Button>
      </div>

      {/* Settings region - expands in place, nothing overlays the camera */}
      {showSettings && (
        <div className="p-4 bg-white/5 space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center space-x-2">
              <Switch
                checked={settings.autoAdd}
                onCheckedChange={(checked) => updateSettings({ autoAdd: checked })}
              />
              <Label className="text-sm text-white">Auto-add matches</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Label className="text-sm text-white">Prefer:</Label>
              <select
                value={settings.preferPrinting}
                onChange={(e) => updateSettings({ preferPrinting: e.target.value as any })}
                className="bg-white/10 rounded px-2 py-1 text-sm text-white"
              >
                <option value="newest">Newest</option>
                <option value="cheapest">Cheapest</option>
              </select>
            </div>
          </div>

          <div className="pt-3">
            <p className="text-xs text-white/50 mb-2">Add scanned cards to:</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Switch
                  checked={settings.addToCollection}
                  onCheckedChange={(checked) => updateSettings({ addToCollection: checked })}
                />
                <Package className="h-4 w-4 text-white/50" />
                <Label className="text-sm text-white">Collection</Label>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={settings.addToDeck}
                  onCheckedChange={(checked) => updateSettings({ addToDeck: checked })}
                />
                <Layers className="h-4 w-4 text-white/50" />
                <Label className="text-sm text-white">Deck</Label>
                {settings.addToDeck && (
                  <Select
                    value={settings.selectedDeckId}
                    onValueChange={(val) => updateSettings({ selectedDeckId: val })}
                  >
                    <SelectTrigger className="w-32 h-7 text-xs bg-white/10 border-0">
                      <SelectValue placeholder="Select deck" />
                    </SelectTrigger>
                    <SelectContent>
                      {decks.map(deck => (
                        <SelectItem key={deck.id} value={deck.id}>{deck.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={settings.addToStorage}
                  onCheckedChange={(checked) => updateSettings({ addToStorage: checked })}
                />
                <FolderOpen className="h-4 w-4 text-white/50" />
                <Label className="text-sm text-white">Storage</Label>
                {settings.addToStorage && (
                  <Select
                    value={settings.selectedStorageId}
                    onValueChange={(val) => updateSettings({ selectedStorageId: val })}
                  >
                    <SelectTrigger className="w-32 h-7 text-xs bg-white/10 border-0">
                      <SelectValue placeholder="Select box" />
                    </SelectTrigger>
                    <SelectContent>
                      {storageContainers.map(container => (
                        <SelectItem key={container.id} value={container.id}>{container.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Camera View */}
      <div className="relative bg-black overflow-hidden aspect-[3/4] sm:aspect-[4/3] max-h-[65vh]">
        {cameraError ? (
          <div className="flex items-center justify-center h-full p-4">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-white/70" />
              <p className="text-white mb-4">{cameraError}</p>
              <Button onClick={startCamera} variant="secondary">
                <RotateCcw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Framing Guide - card-shaped */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className={`relative h-[70%] aspect-[63/88] rounded-xl overflow-hidden ${
                  processing ? 'animate-pulse' : ''
                }`}
                style={{
                  boxShadow: `0 0 0 3px ${processing ? 'hsl(var(--muted-foreground))' : 'hsl(var(--primary))'}`,
                }}
              >
                <div className="absolute inset-3 rounded-lg bg-white/5" />
              </div>

              <div className="absolute top-[6%] left-0 right-0 text-center">
                <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                  processing ? 'bg-white/15 text-white' : 'bg-primary/20 text-primary'
                }`}>
                  {processing ? 'Scanning...' : 'Align card within frame'}
                </span>
              </div>
            </div>

            {/* Control Buttons */}
            <div className="absolute bottom-4 left-0 right-0 flex flex-col items-center gap-2">
              <div className="flex items-center gap-4">
                <Button
                  onClick={() => setAutoScanEnabled(!autoScanEnabled)}
                  variant="ghost"
                  size="sm"
                  aria-pressed={autoScanEnabled}
                  aria-label={autoScanEnabled ? 'Pause auto-capture' : 'Resume auto-capture'}
                  className={`rounded-full w-14 h-14 ${autoScanEnabled ? 'bg-white/20 text-white' : 'bg-black/50 text-white/60'}`}
                >
                  {autoScanEnabled ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </Button>

                <Button
                  onClick={() => captureAndAnalyze()}
                  disabled={processing || isLoading}
                  size="lg"
                  className={`rounded-full w-20 h-20 ${getStatusColor()} hover:opacity-90 active:scale-95 transition-all shadow-lg`}
                >
                  {scanStatus === 'success' ? (
                    <Check className="h-8 w-8" />
                  ) : processing ? (
                    <Loader2 className="h-8 w-8 animate-spin" />
                  ) : (
                    <Camera className="h-8 w-8" />
                  )}
                </Button>

                <div className="w-14 h-14" />
              </div>
              <p className="text-white text-sm font-medium">{getStatusText()}</p>
            </div>
          </>
        )}
      </div>

      {/* Candidates or Manual Search */}
      <div className="bg-black/95">
        {candidates.length > 0 ? (
          <div className="p-4">
            <p className="text-sm text-white/60 mb-3">Select the correct card:</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
              {candidates.map((candidate) => (
                <button
                  key={candidate.cardId}
                  onClick={() => addCardToCollection(candidate)}
                  className="flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left"
                >
                  <CardImage
                    card={cardShapeOf(candidate)}
                    size="xs"
                    hideFlip
                    interactive={false}
                    className="shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-white">{candidate.name}</p>
                    <p className="text-xs text-white/50 uppercase">{candidate.setCode}</p>
                  </div>
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCandidates([])}
              className="mt-2 text-white/60"
            >
              Clear results
            </Button>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {/*
              * The vision model, offered and never taken automatically.
              *
              * This block only appears when local recognition has said it could
              * not identify the card. Pressing it is a paid model call over the
              * network; nothing in the scan flow presses it for you.
              */}
            {modelOffer ? (
              <div className="rounded-lg bg-white/5 p-3 space-y-2">
                <p className="text-xs leading-relaxed text-white/60">{modelOffer}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={modelBusy}
                  onClick={runVisionModel}
                >
                  {modelBusy ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {modelBusy ? 'Asking the model...' : 'Use the online vision model'}
                </Button>
              </div>
            ) : null}
            <div className="flex gap-2">
              <Input
                value={manualSearch}
                onChange={(e) => setManualSearch(e.target.value)}
                placeholder="Or type card name..."
                className="bg-white/5 border-0 text-white placeholder:text-white/40 text-base"
                onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
              />
              <Button
                onClick={handleManualSearch}
                variant="secondary"
                disabled={processing}
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/*
         * Last added card, with undo — and, finally, with a way in to the card.
         *
         * Owner: *"Scanned cards, should be able to click the last added to your
         * collection."* This block is literally that card, and it was the last
         * dead end left in the scan flow: `/scan` links its tiles and the
         * session pile on `/scan/camera` links its tiles, while the one thing
         * captioned "Added to collection" — the card a person actually reaches
         * for to check the scanner got it right — did nothing when clicked.
         *
         * The Undo button stays a sibling of the link rather than inside it, so
         * there is no interactive content nested in the anchor. `href` is null
         * only for a scan carrying neither an id nor a name, which the store
         * cannot produce; the tile falls back to plain markup in that case
         * instead of rendering a link to nowhere.
         */}
        {lastAddedCard && (
          <div className="px-4 pb-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-white/10">
              <LastAddedIdentity card={lastAddedCard} />
              <Button
                variant="ghost"
                size="sm"
                onClick={undoLastAdd}
                className="text-white/60 hover:text-white hover:bg-white/10"
              >
                <Undo2 className="h-4 w-4 mr-1" />
                Undo
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
