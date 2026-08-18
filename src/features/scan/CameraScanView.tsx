import { useState, useEffect, useRef, useCallback } from 'react';
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
import { logActivity } from '@/features/dashboard/hooks';
import { useAutoCapture } from './useAutoCapture';

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
  const [autoScanEnabled, setAutoScanEnabled] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [lastAddedCard, setLastAddedCard] = useState<ScannedCard | null>(null);
  const [decks, setDecks] = useState<Array<{ id: string; name: string }>>([]);
  const [storageContainers, setStorageContainers] = useState<Array<{ id: string; name: string }>>([]);

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

  // Capture frame and send to AI
  const captureAndAnalyze = useCallback(async (imageData?: ImageData) => {
    if (processing) return;

    setProcessing(true);
    setScanStatus('capturing');

    try {
      let imageBase64: string;

      if (imageData) {
        // Use provided ImageData from auto-capture
        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get canvas context');
        ctx.putImageData(imageData, 0, 0);
        imageBase64 = canvas.toDataURL('image/jpeg', 0.8);
      } else {
        // Manual capture
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx || video.videoWidth === 0) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        imageBase64 = canvas.toDataURL('image/jpeg', 0.8);
      }

      setScanStatus('analyzing');

      // Send to AI for card recognition
      const { data, error } = await supabase.functions.invoke('scan-card-ai', {
        body: { image: imageBase64 }
      });

      if (error) throw error;

      const cardName = data?.cardName;

      if (!cardName) {
        setScanStatus('error');
        setLastRecognized(null);
        setTimeout(() => setScanStatus('idle'), 1000);
        return;
      }

      setLastRecognized(cardName);
      setScanStatus('matching');

      // Search for the card
      const result = await scryfallFuzzySearch(cardName);

      if (result.candidates.length === 0) {
        setScanStatus('error');
        setLastRecognized(`No match: "${cardName}"`);
        setTimeout(() => {
          setScanStatus('idle');
          setLastRecognized(null);
        }, 1500);
        return;
      }

      // If high confidence and auto-add enabled, add immediately
      if (result.best && result.best.score >= 0.9 && settings.autoAdd) {
        await addCardToCollection(result.best);
        setScanStatus('success');
        setLastRecognized(null);
        setTimeout(() => setScanStatus('idle'), 1500);
      } else {
        setCandidates(result.candidates);
        setScanStatus('idle');
      }

    } catch (error: any) {
      console.error('Scan error:', error);
      setScanStatus('error');
      setTimeout(() => setScanStatus('idle'), 1500);
    } finally {
      setProcessing(false);
    }
  }, [processing, settings.autoAdd, addCardToCollection]);

  // Auto-capture hook - ultra-aggressive settings for maximum speed
  useAutoCapture(
    captureFrame,
    (imageData) => captureAndAnalyze(imageData),
    {
      enabled: autoScanEnabled && cameraReady && !processing && candidates.length === 0,
      sharpnessThreshold: 120, // Very low threshold for instant detection
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

  const getStatusColor = () => {
    switch (scanStatus) {
      case 'success': return 'bg-emerald-600';
      case 'error': return 'bg-red-600';
      case 'analyzing':
      case 'matching': return 'bg-amber-500';
      default: return 'bg-primary';
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
            <Badge variant="secondary" className="bg-amber-500/20 text-amber-300">
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
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-400" />
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
                  boxShadow: `0 0 0 3px ${processing ? '#f59e0b' : 'hsl(var(--primary))'}`,
                }}
              >
                <div className="absolute inset-3 rounded-lg bg-white/5" />
              </div>

              <div className="absolute top-[6%] left-0 right-0 text-center">
                <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                  processing ? 'bg-amber-500/20 text-amber-300' : 'bg-primary/20 text-primary'
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
                  className={`rounded-full w-14 h-14 ${autoScanEnabled ? 'bg-emerald-500/25 text-emerald-300' : 'bg-black/50 text-white/60'}`}
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
                  {candidate.imageUrl && (
                    <img
                      src={candidate.imageUrl}
                      alt={candidate.name}
                      className="w-10 h-14 object-cover rounded"
                    />
                  )}
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
          <div className="p-4">
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

        {/* Last Added Card with Undo */}
        {lastAddedCard && (
          <div className="px-4 pb-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10">
              <img
                src={lastAddedCard.imageUrl}
                alt={lastAddedCard.name}
                className="w-12 h-16 object-cover rounded"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-emerald-400 flex items-center gap-1">
                  <Check className="h-3 w-3" /> Added to collection
                </p>
                <p className="font-medium text-white truncate">{lastAddedCard.name}</p>
                <p className="text-xs text-white/50 uppercase">{lastAddedCard.setCode}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={undoLastAdd}
                className="text-white/60 hover:text-red-400 hover:bg-red-500/10"
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
