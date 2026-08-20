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
 *
 * ---------------------------------------------------------------------------
 * A SURFACE AND A PICTURE ARE TWO DIFFERENT CHOICES
 * ---------------------------------------------------------------------------
 * An uploaded picture does not replace the surface, it sits under it: the
 * weave still reads across it and the table light still sits the cards down
 * onto it. So picking Felt while playing on your own photograph is a real
 * thing to want, and choosing a surface here never throws a picture away.
 *
 * What that costs is that the six previews no longer show the whole answer, so
 * when a picture IS live this picker puts the actual mat above them and says
 * so. Pictures themselves are managed on `/play/mats`, because a library needs
 * room that a rail does not have.
 *
 * The link to that page is optional and off by default, because this same
 * component renders inside the running game, and following a link from there
 * unmounts the board and loses the game.
 */

import { memo } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Playmat } from './Playmat';
import { MAT_STYLES, MAT_STYLE_IDS } from './matStyles';
import { MAT_TINTS, usePlaymatPrefs } from './usePlaymatStyle';

export const MatStylePicker = memo(function MatStylePicker({
  /** The seat's colours, so a preview shows the mat you will actually get. */
  colors,
  className,
  /** Show the way to the library. Never inside a running game. See above. */
  showManageLink = false,
}: {
  colors?: readonly string[] | null;
  className?: string;
  showManageLink?: boolean;
}) {
  const { style: chosen, tint, matUrl, chooseStyle, chooseTint } = usePlaymatPrefs();

  return (
    <div className={cn('space-y-3', className)}>
      {/* COLOUR FIRST, and it is the reason this row exists.

          The surfaces are charcoal by design, so with no colour behind them all
          six previews read as the same black rectangle. Owner: "need playmat
          colour picker, all look black". `Deck` follows whoever sits there,
          which is what tells four seats apart at a glance, but on the setup
          screen there is no seat yet, so without an explicit choice there was
          nothing to see. */}
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Playmat colour">
        {MAT_TINTS.map(option => {
          const active = option.id === tint;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => chooseTint(option.id)}
              className={cn(
                'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/60',
                active
                  ? 'bg-foreground text-background'
                  : 'bg-foreground/10 text-muted-foreground hover:bg-foreground/15'
              )}
            >
              {option.name}
            </button>
          );
        })}
      </div>

      {/* The whole answer, when a picture is part of it. */}
      {matUrl && (
        <div className="space-y-1">
          <Playmat
            colors={colors}
            tone="viewer"
            ownSeat
            rounded="rounded-md"
            className="h-16 w-full"
          />
          <p className="text-[11px] text-muted-foreground">
            Your own picture, with the surface below drawn over it.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Playmat surface">
        {MAT_STYLE_IDS.map(id => {
          const style = MAT_STYLES[id];
          const active = id === chosen;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => chooseStyle(id)}
              title={style.note}
              className={cn(
                'group flex flex-col gap-1.5 rounded-lg p-1 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/60',
                active ? 'bg-foreground/10' : 'hover:bg-foreground/5'
              )}
            >
              {/* The preview is the real component, with the style forced and
                  any picture kept out of it: this row is about surfaces. */}
              <Playmat
                colors={colors}
                tone="viewer"
                style={id}
                image={null}
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

      {showManageLink && (
        <Link
          to="/play/mats"
          className="inline-block text-[11px] font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Use your own picture
        </Link>
      )}
    </div>
  );
});

export default MatStylePicker;
