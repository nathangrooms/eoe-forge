import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { 
  Camera, 
  X, 
  Settings as SettingsIcon, 
  Plus, 
  Minus, 
  Search,
  Loader2,
  Zap,
  RotateCcw,
  Check,
  AlertCircle
} from 'lucide-react';
import { useScanStore, type ScannedCard } from './store';
import { scryfallFuzzySearch, type CardCandidate } from './cardRecognition';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { logActivity } from '@/features/dashboard/hooks';

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
    updateScanQuantity
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

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      setIsLoading(true);
      setCameraError(null);

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
  }, []);

  // Capture frame and send to AI
  const captureAndAnalyze = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || processing) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx || video.videoWidth === 0) return;

    setProcessing(true);
    setScanStatus('capturing');

    try {
      // Capture frame
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      // Convert to base64
      const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);
      
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
        showError('Not Recognized', 'Could not identify a card. Try adjusting the angle or lighting.');
        return;
      }

      setLastRecognized(cardName);
      setScanStatus('matching');

      // Search for the card
      const result = await scryfallFuzzySearch(cardName);

      if (result.candidates.length === 0) {
        setScanStatus('error');
        showError('No Match', `Could not find "${cardName}" in the database.`);
        return;
      }

      // If high confidence and auto-add enabled, add immediately
      if (result.best && result.best.score >= 0.9 && settings.autoAdd) {
        await addCardToCollection(result.best);
        setScanStatus('success');
        setTimeout(() => setScanStatus('idle'), 1500);
      } else {
        setCandidates(result.candidates);
        setScanStatus('idle');
      }

    } catch (error: any) {
      console.error('Scan error:', error);
      setScanStatus('error');
      showError('Scan Failed', error.message || 'Failed to analyze image');
    } finally {
      setProcessing(false);
    }
  }, [processing, settings.autoAdd]);

  // Add card to collection
  const addCardToCollection = async (candidate: CardCandidate, quantity = 1) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        showError('Auth Error', 'Please log in to add cards');
        return;
      }

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
            set_code: candidate.setCode,
            quantity,
            user_id: session.user.id
          });
      }

      if (result.error) throw result.error;

      const scannedCard: ScannedCard = {
        id: `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        cardId: candidate.cardId,
        oracleId: candidate.oracleId,
        name: candidate.name,
        setCode: candidate.setCode,
        setName: candidate.setCode.toUpperCase(),
        imageUrl: candidate.imageUrl,
        priceUsd: candidate.priceUsd,
        quantity,
        scannedAt: new Date().toISOString(),
        confidence: candidate.score
      };

      addRecentScan(scannedCard);
      showSuccess('Added', `${quantity}x ${candidate.name}`);
      
      await logActivity('card_added', 'card', candidate.cardId, {
        name: candidate.name,
        source: 'camera_scan',
        quantity
      });

      setCandidates([]);
      onCardAdded?.(candidate);

    } catch (error: any) {
      console.error('Add card error:', error);
      showError('Error', 'Failed to add card');
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
      default: return 'Tap to Scan';
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
            <div className="p-4 bg-black/90 border-b border-white/10">
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
                
                {/* Framing Guide */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative w-[85%] max-w-sm aspect-[5/7] border-2 border-primary/80 rounded-lg">
                    <div className="absolute -top-8 left-0 right-0 text-center text-primary text-sm font-medium">
                      Position card within frame
                    </div>
                    {/* Corner markers */}
                    <div className="absolute -top-1 -left-1 w-6 h-6 border-t-3 border-l-3 border-primary rounded-tl" />
                    <div className="absolute -top-1 -right-1 w-6 h-6 border-t-3 border-r-3 border-primary rounded-tr" />
                    <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-3 border-l-3 border-primary rounded-bl" />
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-3 border-r-3 border-primary rounded-br" />
                  </div>
                </div>

                {/* Last recognized */}
                {lastRecognized && (
                  <div className="absolute top-4 left-4 right-4 bg-black/80 backdrop-blur-sm rounded-lg p-3">
                    <p className="text-sm text-muted-foreground">Recognized:</p>
                    <p className="font-semibold text-white">{lastRecognized}</p>
                  </div>
                )}

                {/* Capture Button */}
                <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-3">
                  <Button
                    onClick={captureAndAnalyze}
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
                  <p className="text-white text-sm font-medium">{getStatusText()}</p>
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

            {/* Recent Scans Strip */}
            {recentScans.length > 0 && (
              <div className="px-4 pb-4">
                <p className="text-xs text-muted-foreground mb-2">Recent ({recentScans.length})</p>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {recentScans.slice(0, 8).map((scan) => (
                    <div key={scan.id} className="shrink-0 relative group">
                      <img 
                        src={scan.imageUrl} 
                        alt={scan.name}
                        className="w-12 h-16 object-cover rounded border border-white/20"
                      />
                      <Badge 
                        variant="secondary" 
                        className="absolute -top-1 -right-1 h-4 min-w-4 p-0 flex items-center justify-center text-[10px]"
                      >
                        {scan.quantity}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
