import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Smartphone, Share, Plus, X } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

interface InstallAppButtonProps {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
}

const IOS_STEPS = [
  {
    title: 'Tap the Share button',
    detail: (
      <>
        Look for the <Share className="inline h-4 w-4" /> icon in Safari&apos;s toolbar
      </>
    ),
  },
  {
    title: 'Tap "Add to Home Screen"',
    detail: (
      <>
        Look for the <Plus className="inline h-4 w-4" /> Add to Home Screen option
      </>
    ),
  },
  {
    title: 'Tap "Add" to confirm',
    detail: <>DeckMatrix will appear on your home screen</>,
  },
];

const GENERIC_STEPS = [
  { title: 'Open browser menu', detail: <>Tap the three dots (⋮) in your browser</> },
  {
    title: 'Select "Install App" or "Add to Home Screen"',
    detail: <>The option may vary by browser</>,
  },
  { title: 'Confirm installation', detail: <>DeckMatrix will appear on your home screen</> },
];

/**
 * Three lines of instructions never justified an overlay: when the browser has
 * no install prompt of its own, the steps expand inline beneath the button.
 */
export function InstallAppButton({ variant = 'outline', size = 'lg', className }: InstallAppButtonProps) {
  const { isInstallable, isIOS, isStandalone, promptInstall } = usePWAInstall();
  const [showInstructions, setShowInstructions] = useState(false);

  // Don't show if already installed
  if (isStandalone) {
    return null;
  }

  const handleClick = async () => {
    if (!isIOS && isInstallable) {
      // Native install prompt for Android/Desktop
      await promptInstall();
      return;
    }
    setShowInstructions(open => !open);
  };

  const steps = isIOS ? IOS_STEPS : GENERIC_STEPS;

  return (
    <div className="flex flex-col gap-3">
      <Button
        variant={variant}
        size={size}
        onClick={handleClick}
        className={className}
        aria-expanded={showInstructions}
      >
        <Download className="mr-2 h-5 w-5" />
        Save to Home Screen
      </Button>

      {showInstructions && (
        <div className="rounded-lg bg-muted/40 p-4 text-left">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              <p className="text-sm font-medium">Add DeckMatrix to your home screen</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => setShowInstructions(false)}
              aria-label="Hide instructions"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <ol className="space-y-3">
            {steps.map((step, index) => (
              <li key={step.title} className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="text-sm text-muted-foreground">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
