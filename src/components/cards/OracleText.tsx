import { Fragment, type ReactNode } from 'react';
import { ManaPip, type ManaCostSize } from '@/components/ui/mana-cost';
import { cn } from '@/lib/utils';

/**
 * Rules text with real mana symbols.
 *
 * A card's *cost* has been rendered as pips for a while, but its rules text was
 * still printed raw — "{T}: Add {C}{C}" as literal braces. To a Magic player
 * that is the same bug as printing the mana cost as text, and it is worse in
 * rules text because that is the text they are actually reading. Every `{…}`
 * symbol Scryfall emits in oracle text is rendered through the same `ManaPip`
 * the cost uses, so tap, energy, hybrid and generic symbols all match the rest
 * of the product.
 *
 * Reminder text — the parenthesised italics Wizards prints under an ability —
 * is de-emphasised rather than dropped, which is how the printed card reads it.
 */

/** Either a `{…}` symbol or a run of parenthesised reminder text. */
const TOKEN = /(\{[^{}]+\})|(\([^()]*\))/g;

export interface OracleTextProps {
  text?: string | null;
  /** Pip size. `sm` sits correctly on 15–16px body text. */
  size?: ManaCostSize;
  className?: string;
}

function renderLine(line: string, size: ManaCostSize, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // A fresh RegExp per line: `TOKEN` is global and `lastIndex` is stateful, so
  // sharing one instance across lines silently drops symbols from the second
  // paragraph onwards.
  const re = new RegExp(TOKEN.source, 'g');

  let cursor = 0;
  let n = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(line)) !== null) {
    if (match.index > cursor) {
      nodes.push(<Fragment key={`${keyPrefix}-t${n++}`}>{line.slice(cursor, match.index)}</Fragment>);
    }

    if (match[1]) {
      nodes.push(
        <ManaPip
          key={`${keyPrefix}-p${n++}`}
          symbol={match[1].slice(1, -1)}
          size={size}
          className="mx-[1px] align-[-0.15em]"
        />
      );
    } else if (match[2]) {
      nodes.push(
        <em key={`${keyPrefix}-r${n++}`} className="text-muted-foreground">
          {match[2]}
        </em>
      );
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < line.length) {
    nodes.push(<Fragment key={`${keyPrefix}-t${n++}`}>{line.slice(cursor)}</Fragment>);
  }

  return nodes;
}

export function OracleText({ text, size = 'sm', className }: OracleTextProps) {
  if (!text || !text.trim()) return null;

  const lines = text.split('\n');

  return (
    <div className={cn('space-y-2.5 text-[0.95rem] leading-relaxed text-foreground', className)}>
      {lines.map((line, i) =>
        line.trim() === '' ? null : <p key={i}>{renderLine(line, size, `l${i}`)}</p>
      )}
    </div>
  );
}

export default OracleText;
