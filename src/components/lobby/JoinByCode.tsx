import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { codeFromInput } from '@/lib/lobby';

/**
 * Somebody sent you a link.
 *
 * The link is the owner's stated way into an online game, so the box takes the
 * whole link as happily as it takes the six characters. `codeFromInput` pulls
 * the code out of either, because people paste the link far more often than
 * they read the code out, and a box that rejects the link it just produced is
 * the kind of small insult that makes a feature feel unfinished.
 */

export function JoinByCode({ onOpen }: { onOpen: (code: string) => void }) {
  const [input, setInput] = useState('');
  const code = codeFromInput(input);

  const go = () => {
    if (code) onOpen(code);
  };

  return (
    <section className="rounded-xl bg-muted/30 p-4">
      <h2 className="text-sm font-semibold text-foreground">Got a link?</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Paste the whole thing, or type the code somebody read out.
      </p>

      <div className="mt-3 flex gap-2">
        <Input
          value={input}
          onChange={event => setInput(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') go();
          }}
          placeholder="Link or code"
          className="bg-background/60"
          aria-label="Table link or code"
        />
        <Button onClick={go} disabled={!code}>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
          <span className="ml-2">Open</span>
        </Button>
      </div>
    </section>
  );
}
