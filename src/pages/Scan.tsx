import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Camera, Zap, Settings, BarChart3, Plus, Smartphone, Sparkles } from 'lucide-react';
import { SimpleScanDrawer } from '@/features/scan/SimpleScanDrawer';
import { useScanStore } from '@/features/scan/store';
import { DeckAdditionPanel } from '@/components/collection/DeckAdditionPanel';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { showSuccess } from '@/components/ui/toast-helpers';
import { AIScanHelper } from '@/components/scan/AIScanHelper';

export default function Scan() {
  const [showScanDrawer, setShowScanDrawer] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [addToCollection, setAddToCollection] = useState(true);
  const [addToDeck, setAddToDeck] = useState(false);
  
  const { recentScans, settings, updateSettings } = useScanStore();

  const handleCardAdded = (card: any) => {
    showSuccess('Card Scanned', `Successfully added ${card.name} to your collection!`);
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
      title="Quick Add Cards"
      description="Fast card entry with Scryfall's smart search - type a name and tap to add"
      action={
        <Button onClick={() => setShowScanDrawer(true)} size="lg" className="gap-2 touch-target">
          <Sparkles className="h-5 w-5" />
          <span className="hidden sm:inline">Quick Add</span>
          <span className="sm:hidden">Add</span>
        </Button>
      }
    >
      <div className="space-y-6 pb-safe"> {/* Add padding for mobile safe area */}
        {/* AI Scan Helper */}
        {recentScans.length > 0 && (
          <AIScanHelper recentScans={recentScans} />
        )}

        {/* Mobile-Optimized Quick Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="touch-friendly">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recent Scans</CardTitle>
              <Camera className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{recentScanStats.totalScanned}</div>
              <p className="text-xs text-muted-foreground">
                {recentScanStats.totalCards} cards total
              </p>
            </CardContent>
          </Card>

          <Card className="touch-friendly">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recognition Rate</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(recentScanStats.avgConfidence * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Average confidence
              </p>
            </CardContent>
          </Card>

          <Card className="touch-friendly">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Auto Features</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap">
                <Badge variant={settings.autoCapture ? "default" : "secondary"} className="text-xs">
                  Auto Capture
                </Badge>
                <Badge variant={settings.autoAdd ? "default" : "secondary"} className="text-xs">
                  Auto Add
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {settings.preferPrinting} printing preference
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Smart Search Feature Highlight */}
        <Card className="bg-gradient-to-br from-primary/10 to-purple-500/10 border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-primary/20 rounded-full">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Powered by Scryfall</h3>
                <p className="text-muted-foreground text-sm">Smart fuzzy search handles typos and partial names automatically</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span>Fuzzy Matching</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span>Instant Results</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span>All Printings</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span>Price Info</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Destination Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Scan Destination
            </CardTitle>
          </CardHeader>
          <CardContent>
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

        {/* Main Action - Quick Add */}
        <Card className="text-center p-8 bg-gradient-to-br from-primary/5 to-purple-500/5 border-primary/20">
          <Sparkles className="h-16 w-16 mx-auto mb-6 text-primary" />
          <h2 className="text-2xl font-bold mb-4">Ready to Add Cards?</h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Just start typing a card name - Scryfall's smart search handles typos and partial names. Tap any result to instantly add it.
          </p>
          <Button 
            onClick={() => setShowScanDrawer(true)} 
            size="lg" 
            className="gap-2 px-8 py-4 text-lg touch-target w-full sm:w-auto"
          >
            <Sparkles className="h-6 w-6" />
            Quick Add Cards
          </Button>
        </Card>

        {/* Recent Scans */}
        {recentScans.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Recent Scans
                <Badge variant="secondary">{recentScans.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {recentScans.slice(0, 6).map((scan) => (
                  <Card key={scan.id} className="bg-muted/50 touch-friendly">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={scan.imageUrl}
                          alt={scan.name}
                          className="w-12 h-16 object-cover rounded"
                          loading="lazy"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{scan.name}</p>
                          <p className="text-sm text-muted-foreground">{scan.setCode.toUpperCase()}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge variant="outline" className="text-xs">Qty: {scan.quantity}</Badge>
                            {scan.priceUsd && (
                              <Badge variant="outline" className="text-xs">${scan.priceUsd}</Badge>
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

        {/* How It Works */}
        <Card>
          <CardHeader>
            <CardTitle>How Quick Add Works</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">1. Start Typing</h3>
                <p className="text-sm text-muted-foreground">
                  Type any card name - even partial names or with typos. "Sol Rng" still finds "Sol Ring"!
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">2. See Results</h3>
                <p className="text-sm text-muted-foreground">
                  Scryfall's fuzzy search shows matching cards instantly with images, sets, and prices.
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Plus className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">3. Tap to Add</h3>
                <p className="text-sm text-muted-foreground">
                  One tap adds the card to your collection. Keep typing to add more cards quickly.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <SimpleScanDrawer
        isOpen={showScanDrawer}
        onClose={() => setShowScanDrawer(false)}
        onCardAdded={handleCardAdded}
      />
    </StandardPageLayout>
  );
}