import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { 
  Camera, 
  X, 
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
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { logActivity } from '@/features/dashboard/hooks';
import { useAutoCapture } from './useAutoCapture';

interface CameraScanDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onCardAdded?: (card: any) => void;
}

export function CameraScanDrawer({ isOpen, onClose, onCardAdded }: CameraScanDrawerProps) {
  const { 
    settings, 
    updateSettings, 
    recentScans, 
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
    
    if (isOpen) fetchOptions();
  }, [isOpen]);

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
        // Don't show toast for auto-scan failures, just reset
        setTimeout(() => setScanStatus('idle'), 1000);
        return;
      }

      setLastRecognized(cardName);
      setScanStatus('matching');

      // Search for the card
      const result = await scryfallFuzzySearch(cardName);

      if (result.candidates.length === 0) {
        setScanStatus('error');
        showError('No Match', `Could not find "${cardName}" in the database.`);
        setTimeout(() => setScanStatus('idle'), 1500);
        return;
      }

      // If high confidence and auto-add enabled, add immediately
      if (result.best && result.best.score >= 0.9 && settings.autoAdd) {
        await addCardToCollection(result.best);
        setScanStatus('success');
        setLastRecognized(null); // Clear recognition after successful add
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
  }, [processing, settings.autoAdd]);

  // Auto-capture hook - aggressive settings for fast scanning
  const { isCapturing: isAutoCapturing, stop: stopAutoCapture } = useAutoCapture(
    captureFrame,
    (imageData) => captureAndAnalyze(imageData),
    {
      enabled: autoScanEnabled && cameraReady && !processing && candidates.length === 0 && !lastAddedCard,
      sharpnessThreshold: 200, // Lower threshold for faster detection
      stabilityDelay: 200, // Quick 200ms stability check
      cooldownDelay: 1500 // 1.5s between scans for rapid scanning
    }
  );

  // Add card to collection
  const addCardToCollection = async (candidate: CardCandidate, quantity = 1) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        showError('Auth Error', 'Please log in to add cards');
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
      
      // Auto-clear last added after 3 seconds to allow next scan
      setTimeout(() => setLastAddedCard(null), 3000);
      
      await logActivity('card_added', 'card', candidate.cardId, {
        name: candidate.name,
        source: 'camera_scan',
        quantity
      });

      setCandidates([]);
      onCardAdded?.(candidate);

    } catch (error: any) {
      console.error('Add card error:', error);
      showError('Unable to add card', error.message || 'Database error');
    }
  };

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
      showSuccess('Undone', `Removed ${lastAddedCard.name}`);
      setLastAddedCard(null);
    } catch (error) {
      console.error('Undo error:', error);
      showError('Undo Failed', 'Could not undo last action');
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
      showError('Search Error', 'Failed to search for card');
    } finally {
      setProcessing(false);
    }
  };

  // Lifecycle
  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      setCandidates([]);
      setLastRecognized(null);
      setScanStatus('idle');
      setLastAddedCard(null);
    }

    return () => stopCamera();
  }, [isOpen, startCamera, stopCamera]);

  const getStatusText = () => {
    switch (scanStatus) {
      case 'capturing': return 'Capturing...';
      case 'analyzing': return 'AI Analyzing...';
      case 'matching': return 'Finding Card...';
      case 'success': return 'Card Added!';
      case 'error': return 'Try Again';
      default: return autoScanEnabled ? 'Auto-scanning...' : 'Tap to Scan';
    }
  };

  const getStatusColor = () => {
    switch (scanStatus) {
      case 'success': return 'bg-green-500';
      case 'error': return 'bg-red-500';
      case 'analyzing':
      case 'matching': return 'bg-yellow-500';
      default: return 'bg-primary';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-full max-h-full w-screen h-screen p-0 gap-0 overflow-hidden [&>button]:hidden">
        <div className="flex flex-col h-full bg-black text-white" style={{ minHeight: '100svh' }}>
          
          {/* Header */}
          <div className="flex items-center justify-between p-4 bg-black/80 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <Camera className="h-5 w-5" />
              <span className="font-semibold">Card Scanner</span>
              {processing && (
                <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-300">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Processing
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
                className="text-white hover:bg-white/10"
              >
                <SettingsIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-white hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="p-4 bg-black/90 border-b border-white/10 space-y-4">
              {/* Scan Behavior */}
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
                    className="bg-black/50 border border-white/20 rounded px-2 py-1 text-sm text-white"
                  >
                    <option value="newest">Newest</option>
                    <option value="cheapest">Cheapest</option>
                  </select>
                </div>
              </div>

              {/* Add Destinations */}
              <div className="border-t border-white/10 pt-3">
                <p className="text-xs text-muted-foreground mb-2">Add scanned cards to:</p>
                <div className="space-y-2">
                  {/* Collection toggle */}
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={settings.addToCollection}
                      onCheckedChange={(checked) => updateSettings({ addToCollection: checked })}
                    />
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm text-white">Collection</Label>
                  </div>

                  {/* Deck selection */}
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={settings.addToDeck}
                      onCheckedChange={(checked) => updateSettings({ addToDeck: checked })}
                    />
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm text-white">Deck</Label>
                    {settings.addToDeck && (
                      <Select 
                        value={settings.selectedDeckId} 
                        onValueChange={(val) => updateSettings({ selectedDeckId: val })}
                      >
                        <SelectTrigger className="w-32 h-7 text-xs bg-black/50 border-white/20">
                          <SelectValue placeholder="Select deck" />
                        </SelectTrigger>
                        <SelectContent className="bg-background border-border">
                          {decks.map(deck => (
                            <SelectItem key={deck.id} value={deck.id}>{deck.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Storage selection */}
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={settings.addToStorage}
                      onCheckedChange={(checked) => updateSettings({ addToStorage: checked })}
                    />
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm text-white">Storage</Label>
                    {settings.addToStorage && (
                      <Select 
                        value={settings.selectedStorageId} 
                        onValueChange={(val) => updateSettings({ selectedStorageId: val })}
                      >
                        <SelectTrigger className="w-32 h-7 text-xs bg-black/50 border-white/20">
                          <SelectValue placeholder="Select box" />
                        </SelectTrigger>
                        <SelectContent className="bg-background border-border">
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
          <div className="flex-1 relative bg-black overflow-hidden">
            {cameraError ? (
              <div className="flex items-center justify-center h-full p-4">
                <div className="text-center">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-400" />
                  <p className="text-white mb-4">{cameraError}</p>
                  <Button onClick={startCamera} variant="outline" className="text-white border-white">
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
                
                {/* Framing Guide - Full card-shaped border */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div 
                    className={`relative w-[75%] max-w-xs aspect-[63/88] rounded-xl overflow-hidden ${
                      processing ? 'animate-pulse' : ''
                    }`}
                    style={{
                      boxShadow: `0 0 0 3px ${processing ? '#facc15' : 'hsl(var(--primary))'}`,
                    }}
                  >
                    {/* Card shape outline */}
                    <div className={`absolute inset-0 border-[3px] rounded-xl ${
                      processing ? 'border-yellow-400' : 'border-primary'
                    }`} />
                    
                    {/* Inner card texture hint */}
                    <div className="absolute inset-2 border border-white/20 rounded-lg" />
                    
                    {/* Title bar area indicator */}
                    <div className="absolute top-3 left-3 right-3 h-6 bg-white/5 rounded border border-white/10" />
                    
                    {/* Art box area indicator */}
                    <div className="absolute top-11 left-3 right-3 h-[45%] bg-white/5 rounded border border-white/10" />
                  </div>
                  
                  {/* Instructions above frame */}
                  <div className="absolute top-[8%] left-0 right-0 text-center">
                    <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                      processing ? 'bg-yellow-500/20 text-yellow-300' : 'bg-primary/20 text-primary'
                    }`}>
                      {processing ? 'Scanning...' : 'Align card within frame'}
                    </span>
                  </div>
                </div>

                {/* Last recognized - stays visible longer */}
                {lastRecognized && scanStatus !== 'success' && (
                  <div className="absolute top-20 left-4 right-4 bg-black/80 backdrop-blur-sm rounded-lg p-3 border border-primary/30">
                    <p className="text-xs text-primary">Recognized</p>
                    <p className="font-semibold text-white text-lg">{lastRecognized}</p>
                  </div>
                )}

                {/* Control Buttons */}
                <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-3">
                  <div className="flex items-center gap-4">
                    {/* Auto-scan toggle */}
                    <Button
                      onClick={() => setAutoScanEnabled(!autoScanEnabled)}
                      variant="outline"
                      size="sm"
                      className={`rounded-full w-14 h-14 border-2 ${autoScanEnabled ? 'border-green-400 bg-green-500/20 text-green-400' : 'border-white/40 bg-black/40 text-white/60'}`}
                    >
                      {autoScanEnabled ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                    </Button>
                    
                    {/* Manual capture button */}
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
                    
                    {/* Spacer for symmetry */}
                    <div className="w-14 h-14" />
                  </div>
                  <p className="text-white text-sm font-medium">{getStatusText()}</p>
                  {autoScanEnabled && (
                    <p className="text-white/60 text-xs">Hold card steady • Auto-adds when matched</p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Candidates or Manual Search */}
          <div className="bg-black/95 border-t border-white/10">
            {candidates.length > 0 ? (
              <div className="p-4">
                <p className="text-sm text-muted-foreground mb-3">Select the correct card:</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                  {candidates.map((candidate) => (
                    <button
                      key={candidate.cardId}
                      onClick={() => addCardToCollection(candidate)}
                      className="flex items-center gap-2 p-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-left"
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
                        <p className="text-xs text-muted-foreground uppercase">{candidate.setCode}</p>
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
                    className="bg-white/5 border-white/20 text-white placeholder:text-white/40 text-base"
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
                <div className="flex items-center gap-3 p-3 rounded-lg border border-green-500/30 bg-green-500/10">
                  <img 
                    src={lastAddedCard.imageUrl} 
                    alt={lastAddedCard.name}
                    className="w-12 h-16 object-cover rounded border border-white/20"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-green-400 flex items-center gap-1">
                      <Check className="h-3 w-3" /> Added to collection
                    </p>
                    <p className="font-medium text-white truncate">{lastAddedCard.name}</p>
                    <p className="text-xs text-muted-foreground uppercase">{lastAddedCard.setCode}</p>
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
      </DialogContent>
    </Dialog>
  );
}
