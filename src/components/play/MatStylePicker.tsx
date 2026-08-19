/**
 * Pick the surface you play on.
 *
 * Owner: *"thought we was gonna use awesome artwork and let yourself pick a
 * playmat style?"* The artwork half runs into a licence, and the reasoning is
 * at the top of `matStyles.ts` and `Playmat.tsx`. The picking half was simply
 * never built. This is it.
 *
 * Each option draws a REAL `Playmat` at the tone the viewer's own seat uses, so
 * what you are choosing between is the actual surface rather than a swatch that
 * approximates it. Cheap enough to do six times over: a mat is one element with
 * one `background-image`.
 */

import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Playmat } from './Playmat';
import { MAT_STYLES, MAT_STYLE_IDS, type MatStyleId } from './matStyles';
import { usePlaymatStyle } from './usePlaymatStyle';

export const MatStylePicker = memo(function MatStylePicker({
  /** The seat's colours, so a preview shows the mat you will actually get. */
  colors,
  className,
}: {
  colors?: readonly string[] | null;
  className?: string;
}) {
  const [chosen, choose] = usePlaymatStyle();

  return (
    <div className={cn('grid grid-cols-2 gap-2', className)} role="radiogroup" aria-label="Playmat">
      {MAT_STYLE_IDS.map(id => {
        const style = MAT_STYLES[id];
        const active = id === chosen;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => choose(id)}
            title={style.note}
            className={cn(
              'group flex flex-col gap-1.5 rounded-lg p-1 text-left transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/60',
              active ? 'bg-foreground/10' : 'hover:bg-foreground/5'
            )}
          >
            {/* The preview is the real component, with the style forced. */}
            <Playmat
              colors={colors}
              tone="viewer"
              style={id}
              rounded="rounded-md"
              className={cn(
                'h-12 w-full ring-1 transition-shadow',
                active ? 'ring-foreground/70' : 'ring-transparent'
              )}
            />
            <span className="px-0.5 text-xs font-medium">{style.name}</span>
          </button>
        );
      })}
    </div>
  );
});

export default MatStylePicker;
