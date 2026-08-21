import { useState } from 'react';
import { Check, Copy, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The link that is the whole point.
 *
 * Owner: "online should work by sending a shareable link to other users". So
 * the link is the object, shown in full and copyable in one press, and the six
 * character code sits beside it for the times somebody is reading it out over a
 * call rather than pasting it.
 *
 * The confirmation is in place: the button becomes a tick for two seconds and
 * goes back. No toast, no dialog, nothing that moves the layout. The tick swap
 * is opacity only, so nothing under it shifts.
 */
export interface ShareLinkProps {
  code: string;
  link: string;
  className?: string;
}

export function ShareLink({ code, link, className }: ShareLinkProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), 2000);
    } catch {
      // A blocked clipboard is not worth an error message: the link is on
      // screen in full and can be selected by hand.
      setCopied(false);
    }
  };

  return (
    <div className={cn('rounded-xl bg-muted/40 p-4', className)}>
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
        Send this to your friends
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-background/60 px-3 py-2 text-sm text-foreground">
          {link}
        </code>
        <Button onClick={copy} className="shrink-0">
          <span className="relative flex items-center gap-2">
            <Copy
              className={cn(
                'h-4 w-4 transition-opacity duration-200',
                copied && 'opacity-0'
              )}
              aria-hidden="true"
            />
            <Check
              className={cn(
                'absolute left-0 h-4 w-4 opacity-0 transition-opacity duration-200',
                copied && 'opacity-100'
              )}
              aria-hidden="true"
            />
            {copied ? 'Copied' : 'Copy link'}
          </span>
        </Button>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Or read out the code: <span className="font-mono text-foreground">{code}</span>
      </p>
    </div>
  );
}
