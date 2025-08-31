import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { 
  Camera, 
  X, 
  Circle, 
  Settings as SettingsIcon, 
  Plus, 
  Minus, 
  AlertCircle,
  Zap,
  Search
} from 'lucide-react';
import { useCamera } from './useCamera';
import { useAutoCapture } from './useAutoCapture';
import { useScanStore, type ScannedCard } from './store';
import { cropTitleBand, preprocessForOCR, resizeForOCR } from './image';
import { recognizeCardName } from './ocrWorker';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { logActivity } from '@/features/dashboard/hooks';

interface ScanDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onCardAdded?: (card: any) => void;
}

interface CardCandidate {
  score: number;
  oracleId: string;
  name: string;
  setCode: string;
  cardId: string;
  imageUrl: string;
  priceUsd?: number;
}

export function ScanDrawer({ isOpen, onClose, onCardAdded }: ScanDrawerProps) {
  const { videoRef, startCamera, stopCamera, captureFrame, isLoading, error } = useCamera();
  const { 
    settings, 
    updateSettings, 
    recentScans, 
    addRecentScan, 
    updateScanQuantity,
    isScanning,
    setIsScanning,
    setLastOCR
  } = useScanStore();

  const [showSettings, setShowSettings] = useState(false);
  const [candidates, setCandidates] = useState<CardCandidate[]>([]);
  const [showCandidates, setShowCandidates] = useState(false);
  const [currentFrame, setCurrentFrame] = useState<ImageData | null>(null);
  const [manualSearch, setManualSearch] = useState('');
  const [processing, setProcessing] = useState(false);
  const [lastErrorTime, setLastErrorTime] = useState(0);

  const handleCapture = async (imageData?: ImageData) => {
    if (processing) return;

    const frameData = imageData || captureFrame();
    if (!frameData) return;

    setProcessing(true);
    setCurrentFrame(frameData);

    try {
      // Crop and preprocess the image
      const croppedData = cropTitleBand(frameData);
      const processedData = preprocessForOCR(croppedData);
      const resizedData = resizeForOCR(processedData);

      // Perform OCR
      const { text, confidence } = await recognizeCardName(resizedData);
      setLastOCR(text, confidence);

      if (confidence < 0.45) {
        // Only show error if more than 3 seconds since last error to reduce spam
        const now = Date.now();
        if (now - lastErrorTime > 3000) {
          setLastErrorTime(now);
          // Don't show error during auto-capture to reduce spam
          if (!settings.autoCapture) {
            showError('OCR Failed', 'Could not read card name clearly. Try adjusting lighting or angle.');
          }
        }
        return;
      }

      // Match against database
      await matchCardName(text, confidence);

    } catch (error) {
      console.error('Scan error:', error);
      showError('Scan Error', 'Failed to process image. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const matchCardName = async (text: string, confidence: number) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('https://udnaflcohfyljrsgqggy.supabase.co/functions/v1/scan-match', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g'
        },
        body: JSON.stringify({ 
          text: text.trim(), 
          prefer: settings.preferPrinting 
        })
      });

      if (!response.ok) throw new Error('Match failed');

      const { candidates: matchCandidates, best } = await response.json();

      if (best && best.score > 0.9 && settings.autoAdd) {
        // Auto-add high confidence match
        await addCardToCollection(best);
      } else if (matchCandidates && matchCandidates.length > 0) {
        setCandidates(matchCandidates.slice(0, 6));
        setShowCandidates(true);
      } else {
        showError('No Match', `Could not find "${text}" in the database.`);
      }

    } catch (error) {
      console.error('Match error:', error);
      showError('Match Error', 'Failed to match card name. Please try manual search.');
    }
  };

  const addCardToCollection = async (candidate: CardCandidate, quantity = 1) => {
    try {
      // Add to collection via existing API
      const response = await fetch('https://udnaflcohfyljrsgqggy.supabase.co/rest/v1/user_collections', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g'
        },
        body: JSON.stringify({
          card_id: candidate.cardId,
          card_name: candidate.name,
          set_code: candidate.setCode,
          quantity
        })
      });

      if (!response.ok) throw new Error('Failed to add to collection');

      // Create scanned card record
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
        confidence: 0.95 // Placeholder
      };

      addRecentScan(scannedCard);
      showSuccess('Card Added', `Added ${quantity}x ${candidate.name} to collection`);

      // Log activity
      await logActivity('card_added', 'card', candidate.cardId, {
        name: candidate.name,
        source: 'scan',
        quantity
      });

      setShowCandidates(false);
      setCandidates([]);

      if (onCardAdded) {
        onCardAdded(candidate);
      }

    } catch (error) {
      console.error('Add card error:', error);
      showError('Add Failed', 'Could not add card to collection');
    }
  };

  const handleManualSearch = async () => {
    if (!manualSearch.trim()) return;
    await matchCardName(manualSearch.trim(), 1.0);
  };

  const { isCapturing } = useAutoCapture(
    captureFrame,
    handleCapture,
    {
      enabled: settings.autoCapture && isOpen && !processing && !showCandidates,
      sharpnessThreshold: settings.sharpnessThreshold,
      stabilityDelay: 200,
      cooldownDelay: 800
    }
  );

  useEffect(() => {
    if (isOpen) {
      startCamera();
      setIsScanning(true);
    } else {
      stopCamera();
      setIsScanning(false);
      setShowCandidates(false);
      setCandidates([]);
    }

    return () => {
      stopCamera();
      setIsScanning(false);
    };
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-full max-h-full w-screen h-screen p-0 gap-0 overflow-hidden">
        <div className="flex flex-col h-full bg-black text-white touch-pan-y"
             style={{ 
               // Optimize for mobile viewport
               minHeight: '100svh',
               WebkitUserSelect: 'none',
               userSelect: 'none'
             }}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 bg-black/80 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <Camera className="h-5 w-5" />
              <span className="font-semibold">Fast Scan</span>
              {processing && (
                <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-300">
                  Processing...
                </Badge>
              )}
              {isCapturing && (
                <Badge variant="secondary" className="bg-green-500/20 text-green-300">
                  <Circle className="h-3 w-3 mr-1 fill-current animate-pulse" />
                  Auto
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={settings.autoCapture}
                    onCheckedChange={(checked) => updateSettings({ autoCapture: checked })}
                  />
                  <Label className="text-sm text-white">Auto Capture</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={settings.autoAdd}
                    onCheckedChange={(checked) => updateSettings({ autoAdd: checked })}
                  />
                  <Label className="text-sm text-white">Auto Add</Label>
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
          <div className="flex-1 relative bg-black">
            {error ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-400" />
                  <p className="text-white mb-4">{error}</p>
                  <Button onClick={startCamera} variant="outline" className="text-white border-white">
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
                
                {/* Framing Guide - Mobile Optimized */}
                <div className="absolute inset-0 flex items-start justify-center pt-12 sm:pt-16 pointer-events-none">
                  <div className="relative w-72 sm:w-80 h-16 sm:h-20 border-2 border-blue-400 border-dashed rounded-lg bg-blue-400/10">
                    <div className="absolute -top-8 left-0 text-blue-400 text-sm font-medium">
                      Align card name here
                    </div>
                    {/* Corner indicators for better mobile guidance */}
                    <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-blue-400" />
                    <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-blue-400" />
                    <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-blue-400" />
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-blue-400" />
                  </div>
                </div>

                {/* Capture Button - Mobile Optimized */}
                <div className="absolute bottom-6 sm:bottom-8 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-3">
                  <Button
                    onClick={() => handleCapture()}
                    disabled={processing || isLoading}
                    size="lg"
                    className="rounded-full w-20 h-20 bg-white text-black hover:bg-gray-200 active:scale-95 transition-transform shadow-lg"
                  >
                    <Camera className="h-8 w-8" />
                  </Button>
                  {!settings.autoCapture && (
                    <p className="text-white text-sm">Tap to capture</p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Manual Search - Mobile Optimized */}
          <div className="p-4 bg-black/90 border-t border-white/10 pb-safe">
            <div className="flex gap-2">
              <Input
                value={manualSearch}
                onChange={(e) => setManualSearch(e.target.value)}
                placeholder="Or search manually..."
                className="bg-black/50 border-white/20 text-white placeholder:text-gray-400 touch-target"
                onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
              />
              <Button 
                onClick={handleManualSearch} 
                variant="outline" 
                className="text-white border-white touch-target shrink-0"
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Recent Scans */}
          {recentScans.length > 0 && (
            <div className="p-4 bg-black/90 border-t border-white/10">
              <h3 className="text-sm font-medium text-white mb-2">Recent Scans</h3>
              <div className="flex gap-2 overflow-x-auto">
                {recentScans.slice(0, 3).map((scan) => (
                  <Card key={scan.id} className="bg-white/10 border-white/20 min-w-[200px]">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2">
                        <img
                          src={scan.imageUrl}
                          alt={scan.name}
                          className="w-8 h-10 object-cover rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{scan.name}</p>
                          <p className="text-xs text-gray-300">{scan.setCode.toUpperCase()}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-white hover:bg-white/10"
                            onClick={() => updateScanQuantity(scan.id, Math.max(1, scan.quantity - 1))}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="text-sm text-white w-6 text-center">{scan.quantity}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-white hover:bg-white/10"
                            onClick={() => updateScanQuantity(scan.id, scan.quantity + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Candidates Modal - Mobile Optimized */}
        {showCandidates && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-20 flex items-end touch-pan-y">
            <Card className="w-full bg-white m-4 max-h-[70vh] overflow-hidden rounded-t-2xl">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Select Card</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCandidates(false)}
                    className="touch-target"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-4 max-h-80 overflow-y-auto overscroll-contain">
                  {candidates.map((candidate, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 active:bg-gray-100 cursor-pointer touch-friendly transition-colors"
                      onClick={() => addCardToCollection(candidate)}
                    >
                      <img
                        src={candidate.imageUrl}
                        alt={candidate.name}
                        className="w-12 h-16 object-cover rounded"
                      />
                      <div className="flex-1">
                        <p className="font-medium">{candidate.name}</p>
                        <p className="text-sm text-muted-foreground">{candidate.setCode.toUpperCase()}</p>
                        {candidate.priceUsd && (
                          <p className="text-sm text-green-600">${candidate.priceUsd}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline">Score: {(candidate.score * 100).toFixed(0)}%</Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}