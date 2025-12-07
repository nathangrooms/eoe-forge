import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Smartphone, Share, Plus } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface InstallAppButtonProps {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
  autoShowIOS?: boolean;
}

export function InstallAppButton({ variant = 'outline', size = 'lg', className, autoShowIOS = true }: InstallAppButtonProps) {
  const { isInstallable, isIOS, isStandalone, promptInstall } = usePWAInstall();
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  // Auto-show iOS instructions on first visit
  useEffect(() => {
    if (autoShowIOS && isIOS && !isStandalone) {
      const hasSeenIOSPrompt = localStorage.getItem('deckmatrix-ios-prompt-seen');
      if (!hasSeenIOSPrompt) {
        // Small delay to let page load first
        const timer = setTimeout(() => {
          setShowIOSInstructions(true);
          localStorage.setItem('deckmatrix-ios-prompt-seen', 'true');
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [isIOS, isStandalone, autoShowIOS]);

  // Don't show if already installed
  if (isStandalone) {
    return null;
  }

  const handleClick = async () => {
    if (isIOS) {
      // Show iOS instructions modal
      setShowIOSInstructions(true);
    } else if (isInstallable) {
      // Trigger native install prompt for Android/Desktop
      await promptInstall();
    } else {
      // Show generic instructions for browsers that don't support PWA install
      setShowIOSInstructions(true);
    }
  };

  return (
    <>
      <Button 
        variant={variant} 
        size={size} 
        onClick={handleClick}
        className={className}
      >
        <Download className="h-5 w-5 mr-2" />
        Save to Home Screen
      </Button>

      <Dialog open={showIOSInstructions} onOpenChange={setShowIOSInstructions}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Install DeckMatrix
            </DialogTitle>
            <DialogDescription>
              Add DeckMatrix to your home screen for quick access
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {isIOS ? (
              <>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-primary">1</span>
                  </div>
                  <div>
                    <p className="font-medium">Tap the Share button</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      Look for the <Share className="h-4 w-4" /> icon in Safari's toolbar
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-primary">2</span>
                  </div>
                  <div>
                    <p className="font-medium">Tap "Add to Home Screen"</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      Look for the <Plus className="h-4 w-4" /> Add to Home Screen option
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-primary">3</span>
                  </div>
                  <div>
                    <p className="font-medium">Tap "Add" to confirm</p>
                    <p className="text-sm text-muted-foreground">
                      DeckMatrix will appear on your home screen
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-primary">1</span>
                  </div>
                  <div>
                    <p className="font-medium">Open browser menu</p>
                    <p className="text-sm text-muted-foreground">
                      Tap the three dots (⋮) in your browser
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-primary">2</span>
                  </div>
                  <div>
                    <p className="font-medium">Select "Install App" or "Add to Home Screen"</p>
                    <p className="text-sm text-muted-foreground">
                      The option may vary by browser
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-primary">3</span>
                  </div>
                  <div>
                    <p className="font-medium">Confirm installation</p>
                    <p className="text-sm text-muted-foreground">
                      DeckMatrix will appear on your home screen
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          <Button onClick={() => setShowIOSInstructions(false)} className="w-full">
            Got it!
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
