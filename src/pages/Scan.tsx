import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Camera, Zap, Settings, BarChart3, Plus, Smartphone, Target } from 'lucide-react';
import { CameraScanDrawer } from '@/features/scan/CameraScanDrawer';
import { useScanStore } from '@/features/scan/store';
import { DeckAdditionPanel } from '@/components/collection/DeckAdditionPanel';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { ScanInsightsHelper } from '@/components/scan/ScanInsightsHelper';

export default function Scan() {
  const [showScanDrawer, setShowScanDrawer] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [addToCollection, setAddToCollection] = useState(true);
  const [addToDeck, setAddToDeck] = useState(false);
  
  const { recentScans, settings, updateSettings } = useScanStore();

  // No toast on card added - the scanner shows inline feedback
  const handleCardAdded = (_card: any) => {
    // Silent - scanner shows last added card inline
  };

  const recentScanStats = {
    totalScanned: recentScans.length,
    totalCards: recentScans.reduce((sum, scan) => sum + scan.quantity, 0),
    avgConfidence: recentScans.length > 0 
      ? recentScans.reduce((sum, scan) => sum + scan.confidence, 0) / recentScans.length 
      : 0
  };

  return (
    <StandardPageLayout
      title="Card Scanner"
      description="Camera scanning for instant card recognition"
      action={
        <Button onClick={() => setShowScanDrawer(true)} size="lg" className="gap-2 touch-target">
          <Camera className="h-5 w-5" />
          <span className="hidden sm:inline">Start Scanning</span>
          <span className="sm:hidden">Scan</span>
        </Button>
      }
    >
      <div className="space-y-4 md:space-y-6 pb-safe">
        {/* Scan Insights Helper */}
        {recentScans.length > 0 && (
          <ScanInsightsHelper recentScans={recentScans} />
        )}

        {/* Quick Stats - 2 columns on mobile, 3 on desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
          <Card className="touch-friendly">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6 md:pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">Recent Scans</CardTitle>
              <Camera className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              <div className="text-xl md:text-2xl font-bold">{recentScanStats.totalScanned}</div>
              <p className="text-xs text-muted-foreground">
                {recentScanStats.totalCards} cards
              </p>
            </CardContent>
          </Card>

          <Card className="touch-friendly">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6 md:pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">Recognition</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              <div className="text-xl md:text-2xl font-bold">
                {(recentScanStats.avgConfidence * 100).toFixed(0)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Accuracy
              </p>
            </CardContent>
          </Card>

          <Card className="touch-friendly col-span-2 sm:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6 md:pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">Auto Features</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              <div className="flex gap-2 flex-wrap">
                <Badge variant={settings.autoCapture ? "default" : "secondary"} className="text-xs">
                  Auto Capture
                </Badge>
                <Badge variant={settings.autoAdd ? "default" : "secondary"} className="text-xs">
                  Auto Add
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Feature Highlight - compact for mobile */}
        <Card className="bg-gradient-to-br from-primary/10 to-purple-500/10 border-primary/20">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center gap-3 mb-3 md:mb-4">
              <div className="p-2 md:p-3 bg-primary/20 rounded-full">
                <Target className="h-5 w-5 md:h-6 md:w-6 text-primary" />
              </div>
              <div>
                <h3 className="text-base md:text-lg font-semibold">Smart Recognition</h3>
                <p className="text-muted-foreground text-xs md:text-sm">Instant card detection from camera</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 text-xs md:text-sm">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
                <span>Fast Detection</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
                <span>Any Angle</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
                <span>All Languages</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
                <span>Instant Add</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Destination Settings */}
        <Card>
          <CardHeader className="p-3 md:p-6">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Settings className="h-4 w-4 md:h-5 md:w-5" />
              Scan Destination
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <DeckAdditionPanel
              selectedDeckId={selectedDeckId}
              addToCollection={addToCollection}
              addToDeck={addToDeck}
              onSelectionChange={(config) => {
                setSelectedDeckId(config.selectedDeckId);
                setAddToCollection(config.addToCollection);
                setAddToDeck(config.addToDeck);
              }}
            />
          </CardContent>
        </Card>

        {/* Main Scan Button - more compact on mobile */}
        <Card className="text-center p-4 md:p-8 bg-gradient-to-br from-primary/5 to-purple-500/5 border-primary/20">
          <Camera className="h-12 w-12 md:h-16 md:w-16 mx-auto mb-4 md:mb-6 text-primary" />
          <h2 className="text-xl md:text-2xl font-bold mb-2 md:mb-4">Ready to Scan?</h2>
          <p className="text-muted-foreground mb-4 md:mb-8 max-w-md mx-auto text-sm md:text-base">
            Point your camera at any Magic: The Gathering card for instant recognition.
          </p>
          <Button 
            onClick={() => setShowScanDrawer(true)} 
            size="lg" 
            className="gap-2 px-6 md:px-8 py-3 md:py-4 text-base md:text-lg touch-target w-full sm:w-auto"
          >
            <Camera className="h-5 w-5 md:h-6 md:w-6" />
            Start Camera Scan
          </Button>
        </Card>

        {/* Recent Scans - 2 columns on mobile */}
        {recentScans.length > 0 && (
          <Card>
            <CardHeader className="p-3 md:p-6">
              <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                Recent Scans
                <Badge variant="secondary">{recentScans.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                {recentScans.slice(0, 6).map((scan) => (
                  <Card key={scan.id} className="bg-muted/50 touch-friendly">
                    <CardContent className="p-3 md:p-4">
                      <div className="flex items-center gap-2 md:gap-3">
                        <img
                          src={scan.imageUrl}
                          alt={scan.name}
                          className="w-10 h-14 md:w-12 md:h-16 object-cover rounded"
                          loading="lazy"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-sm md:text-base">{scan.name}</p>
                          <p className="text-xs text-muted-foreground">{scan.setCode.toUpperCase()}</p>
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            <Badge variant="outline" className="text-xs px-1">x{scan.quantity}</Badge>
                            {scan.priceUsd && (
                              <Badge variant="outline" className="text-xs px-1">${scan.priceUsd}</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              
              {recentScans.length > 6 && (
                <div className="text-center mt-4">
                  <Button variant="outline" onClick={() => setShowScanDrawer(true)} className="touch-target">
                    View All Scans
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* How It Works - 2 columns on mobile, 3 on desktop */}
        <Card>
          <CardHeader className="p-3 md:p-6">
            <CardTitle className="text-base md:text-lg">How Scanning Works</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
              <div className="text-center">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2 md:mb-4">
                  <Camera className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-1 md:mb-2 text-sm md:text-base">1. Point</h3>
                <p className="text-xs md:text-sm text-muted-foreground">
                  Position the card in frame
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2 md:mb-4">
                  <Target className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-1 md:mb-2 text-sm md:text-base">2. Detect</h3>
                <p className="text-xs md:text-sm text-muted-foreground">
                  Card identified instantly
                </p>
              </div>
              
              <div className="text-center col-span-2 md:col-span-1">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2 md:mb-4">
                  <Plus className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-1 md:mb-2 text-sm md:text-base">3. Add</h3>
                <p className="text-xs md:text-sm text-muted-foreground">
                  Added to your collection
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <CameraScanDrawer
        isOpen={showScanDrawer}
        onClose={() => setShowScanDrawer(false)}
        onCardAdded={handleCardAdded}
      />
    </StandardPageLayout>
  );
}