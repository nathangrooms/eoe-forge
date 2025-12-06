import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Package, 
  Upload, 
  Search, 
  Camera,
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface CollectionEmptyStateProps {
  onAddCards?: () => void;
  onImport?: () => void;
  onScan?: () => void;
}

export function CollectionEmptyState({
  onAddCards,
  onImport,
  onScan,
}: CollectionEmptyStateProps) {
  return (
    <Card className="border-dashed border-2 border-muted-foreground/20">
      <CardContent className="py-12 px-6">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          {/* Icon */}
          <div className="relative mx-auto w-20 h-20">
            <div className="absolute inset-0 bg-gradient-cosmic rounded-full opacity-20 blur-xl" />
            <div className="relative w-full h-full rounded-full bg-gradient-cosmic flex items-center justify-center">
              <Package className="h-10 w-10 text-primary-foreground" />
            </div>
          </div>

          {/* Text */}
          <div className="space-y-2">
            <h3 className="text-2xl font-bold">Start Your Collection</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Track your Magic: The Gathering cards, monitor their value, and build the perfect deck
            </p>
          </div>

          {/* Action Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
            <button
              onClick={onAddCards}
              className="group p-4 rounded-xl border border-border bg-card hover:bg-accent/50 hover:border-primary/50 transition-all duration-300 text-left"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Search className="h-5 w-5" />
                </div>
                <span className="font-semibold">Search & Add</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Find cards by name and add them to your collection
              </p>
            </button>

            <button
              onClick={onImport}
              className="group p-4 rounded-xl border border-border bg-card hover:bg-accent/50 hover:border-primary/50 transition-all duration-300 text-left"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                  <Upload className="h-5 w-5" />
                </div>
                <span className="font-semibold">Import List</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Bulk import from Arena, MTGO, or text files
              </p>
            </button>

            <button
              onClick={onScan}
              className="group p-4 rounded-xl border border-border bg-card hover:bg-accent/50 hover:border-primary/50 transition-all duration-300 text-left"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                  <Camera className="h-5 w-5" />
                </div>
                <span className="font-semibold">Scan Cards</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Use your camera to quickly add physical cards
              </p>
            </button>
          </div>

          {/* AI suggestion */}
          <div className="pt-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-cosmic text-primary-foreground text-sm">
              <Sparkles className="h-4 w-4" />
              <span>Tip: Our AI can help you build optimal decks from your collection</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
