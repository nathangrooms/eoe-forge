import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function Screenshots() {
  return (
    <section className="py-24 px-4">
      <div className="container mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            See DeckMatrix in Action
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Experience the power of AI-driven deck building with our intuitive interface.
          </p>
        </div>

        {/* Screenshots Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 max-w-6xl mx-auto">
          {/* Deck Builder Screenshot */}
          <div className="space-y-6">
            <div className="text-center lg:text-left">
              <Badge variant="outline" className="mb-4 text-spacecraft border-spacecraft/30">
                AI Deck Builder
              </Badge>
              <h3 className="text-2xl font-bold mb-3">
                Build Competitive Decks in Minutes
              </h3>
              <p className="text-muted-foreground text-lg">
                Our AI analyzes thousands of card combinations to suggest optimal builds for your playstyle and format.
              </p>
            </div>
            
            <Card className="relative group overflow-hidden bg-gradient-to-br from-spacecraft/5 to-station/5 border-spacecraft/20 hover:border-spacecraft/40 transition-all duration-300">
              <div className="aspect-video bg-gradient-to-br from-background to-spacecraft/10 flex items-center justify-center">
                <div className="text-center space-y-4 p-8">
                  <div className="w-20 h-20 mx-auto bg-spacecraft/20 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">🃏</span>
                  </div>
                  <p className="text-spacecraft font-semibold">Deck Builder Interface</p>
                  <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-16 bg-spacecraft/10 rounded border-2 border-spacecraft/20" />
                    ))}
                  </div>
                </div>
              </div>
              {/* Hover glow effect */}
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-spacecraft/20 to-station/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </Card>
          </div>

          {/* Collection Manager Screenshot */}
          <div className="space-y-6">
            <div className="text-center lg:text-left">
              <Badge variant="outline" className="mb-4 text-station border-station/30">
                Collection Manager
              </Badge>
              <h3 className="text-2xl font-bold mb-3">
                Track Every Card's Value
              </h3>
              <p className="text-muted-foreground text-lg">
                Monitor your collection's worth, find missing cards, and build decks from what you own.
              </p>
            </div>
            
            <Card className="relative group overflow-hidden bg-gradient-to-br from-station/5 to-warp/5 border-station/20 hover:border-station/40 transition-all duration-300">
              <div className="aspect-video bg-gradient-to-br from-background to-station/10 flex items-center justify-center">
                <div className="text-center space-y-4 p-8">
                  <div className="w-20 h-20 mx-auto bg-station/20 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">📊</span>
                  </div>
                  <p className="text-station font-semibold">Collection Analytics</p>
                  <div className="space-y-2 max-w-xs mx-auto">
                    <div className="h-3 bg-station/20 rounded-full">
                      <div className="h-3 bg-station/60 rounded-full w-3/4" />
                    </div>
                    <div className="h-3 bg-station/20 rounded-full">
                      <div className="h-3 bg-station/60 rounded-full w-1/2" />
                    </div>
                    <div className="h-3 bg-station/20 rounded-full">
                      <div className="h-3 bg-station/60 rounded-full w-5/6" />
                    </div>
                  </div>
                </div>
              </div>
              {/* Hover glow effect */}
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-station/20 to-warp/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}