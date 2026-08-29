/**
 * Four doors.
 *
 * Owner's reference: four cards across, each full bleed, each carrying an
 * eyebrow in small caps, a large display title, one or two lines saying what
 * the mode IS, a quiet fact bottom left and the way in bottom right. The image
 * is the whole card, darkened enough that the type sits on it, with the text
 * weighted low. Nothing has an outline. It should read as four doors, not four
 * form controls.
 *
 * ---------------------------------------------------------------------------
 * THE ARTWORK IS REAL NOW, AND THE DOOR IS CUT TO IT
 * ---------------------------------------------------------------------------
 * Four covers live in the public `art` bucket. They decode 1376 x 768 and the
 * door's aspect ratio is those two numbers, so `object-cover` crops nothing off
 * any edge. They were drawn wide precisely so nothing has to be.
 *
 * Two doors across rather than four, for the same reason. Four 16:9 doors on a
 * 1920 page are 460px wide and 258px tall, which is a thumbnail strip. Two
 * across gives each cover about 940 x 525 and lets the picture be the thing you
 * see first, which is what a door is for.
 *
 * The procedural playmat surface is still painted underneath, so a cover that
 * fails to load reveals a finished surface rather than a hole, and a failure is
 * remembered for the life of the tab so one 404 does not become one per visit.
 *
 * ---------------------------------------------------------------------------
 * THE COPY CAME OFF THE PICTURE. MEASURED, 28 Aug 2026
 * ---------------------------------------------------------------------------
 * Four doors across a 1592px page are 386px wide, and at the cover's own 1.79
 * ratio that is 386 x 216. Every word of the door — eyebrow, title, two lines
 * of body, the quiet fact and the way in — was being set inside that 216px
 * letterbox, on top of the artwork, under one gradient. Both halves lost:
 *
 *   - the eyebrows OTHER PEOPLE / ONE SEAT / HANDS OFF were unreadable over
 *     stained glass and bright spell art, and the body copy under ONLINE and
 *     PLAYTEST fought the picture the whole way across;
 *   - the picture, which is the thing a door is for, was reduced to a 216px
 *     strip with type over four fifths of it.
 *
 * And directly below, the play page ended at y=580 of a 1000px window: 42% of
 * the screen was empty black. So the room to fix it was already on the page.
 *
 * The door is now a picture AND a card, stacked: the cover at its own aspect
 * ratio with NOTHING drawn over it, and the words below it on the surface tint
 * every other card on this app uses. Contrast stops depending on which part of
 * an illustration landed behind a given letter, the artwork is finally shown
 * whole and unmodified, and the wall fills the window instead of stranding it.
 *
 * Still ONE ROW of four. Owner: *"all modes one line not 2 they are massive."*
 * The row got taller, not narrower, which is what the empty 42% was for.
 */

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Playmat } from './Playmat';
import type { MatStyleId } from './matStyles';
import type { MatTintId } from './usePlaymatStyle';
import { COVER_ASPECT, PLAY_MODES, type PlayModeId } from './playModes';

/** Covers that are not there. Remembered so the 404 happens once per tab. */
const missingCovers = new Set<string>();

/**
 * `fetchpriority`, lowercase, spread onto the img.
 *
 * This is React 18.3.1. `fetchPriority` in camelCase is a React 19 prop; on 18
 * it still reaches the DOM lowercased — measured, the attribute reads back as
 * `fetchpriority="high"` and the browser honours it — but on the way React logs
 *
 *   Warning: React does not recognize the `fetchPriority` prop on a DOM element
 *
 * through `console.error`, on every load of this page. A console error that is
 * not an error is how everybody learns to stop reading the console, which is
 * how a real one gets missed. Spelling it lowercase is what the warning itself
 * asks for, and it is a plain pass-through attribute either way.
 */
const priority = (eager: boolean) => ({ fetchpriority: eager ? 'high' : 'auto' });

function Cover({
  src,
  fallback,
  alt,
  eager,
}: {
  src: string;
  fallback: { style: string; tint: string };
  alt: string;
  /**
   * A door above the fold is fetched straight away.
   *
   * They were all four `loading="lazy"`, which is right for a picture further
   * down a page and wrong for the picture that IS the page: the reader is
   * looking at the doors while the browser waits to be told they matter.
   *
   * It used to be the first two, because the wall was two columns and the
   * second row began at y=601 in an 800px window. The wall is one row now, so
   * "the two above the fold" is all four of them: measured on 22 Aug 2026,
   * every door sits at y=248 and is 164px tall at 1280 x 800 and 253px tall at
   * 1920 x 1080. Doors three and four were still lazy and still auto priority,
   * on screen, for a reason that had stopped being true.
   */
  eager: boolean;
}) {
  const [failed, setFailed] = useState(() => missingCovers.has(src));

  return (
    <>
      {/* Always painted, so a cover that fails to decode reveals a finished
          surface underneath rather than a hole. */}
      <Playmat
        className="absolute inset-0 h-full w-full"
        rounded="rounded-none"
        tone="active"
        style={fallback.style as MatStyleId}
        tintOverride={fallback.tint as MatTintId}
        image={null}
        colors={null}
      />
      {!failed && (
        <img
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          {...priority(eager)}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => {
            missingCovers.add(src);
            setFailed(true);
          }}
        />
      )}
    </>
  );
}

export interface ModeWallProps {
  /** The mode currently chosen, if the reader has been here before. */
  value: PlayModeId | null;
  onChoose: (mode: PlayModeId) => void;
  /**
   * A live fact per mode, printed beside the static one. Online uses it for
   * the number of tables actually waiting, which is the thing that makes the
   * lead door worth leading with.
   */
  live?: Partial<Record<PlayModeId, string>>;
}

export function ModeWall({ value, onChoose, live }: ModeWallProps) {
  /* NO "STILL BEING BUILT" BADGE. Owner: "Still being built can just go, it's
     gonna be ready soon anyway." It was also the one thing on these cards that
     did not fit once they went to four across, running 43px into the title.

     ONE ROW, not a 2x2. Owner: "all modes one line not 2 they are massive."
     At two columns a 16:9 door is around 500px tall, so the four of them stacked
     a thousand pixels of artwork above the thing you came here to press. Four
     across quarters the width and therefore quarters the height. */
  return (
    <div className="grid w-full items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {PLAY_MODES.map(mode => {
        const active = value === mode.id;
        const liveLine = live?.[mode.id] ?? null;

        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => onChoose(mode.id)}
            aria-pressed={active}
            className={cn(
              'motion-press group relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-2xl bg-card text-left transition-shadow duration-200',
              active
                ? 'shadow-[0_18px_46px_rgba(0,0,0,0.55)]'
                : 'shadow-[0_10px_30px_rgba(0,0,0,0.35)] hover:shadow-[0_18px_46px_rgba(0,0,0,0.5)]'
            )}
          >
            {/* THE PICTURE. Its own box, its own ratio, nothing drawn over it.
                All four are on screen at once, so all four are eager. */}
            <span className="relative block w-full shrink-0 overflow-hidden" style={{ aspectRatio: COVER_ASPECT }}>
              <Cover src={mode.cover} fallback={mode.fallback} alt="" eager />

              {/* Hover and selection are light on the surface, never an
                  outline, and they sit on the picture rather than under the
                  words so the copy's contrast never moves. */}
              <span
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute inset-0 transition-opacity duration-200',
                  active ? 'bg-white/[0.06] opacity-100' : 'bg-white/[0.05] opacity-0 group-hover:opacity-100'
                )}
              />
            </span>

            {/* THE WORDS. On the card surface, so every one of them reads at
                full contrast whatever the illustration above happens to be
                doing. `flex-1` so the four bodies line their actions up even
                when one mode says more than another. */}
            <span className="relative flex min-w-0 flex-1 flex-col gap-2 p-5">
              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                {mode.eyebrow}
              </span>

              <span className="text-2xl font-bold uppercase leading-none tracking-tight text-foreground">
                {mode.title}
              </span>

              <span className="mt-1 space-y-1">
                {mode.lines.map(line => (
                  <span key={line} className="block text-[0.8rem] leading-snug text-muted-foreground">
                    {line}
                  </span>
                ))}
              </span>

              {/* Pushed to the bottom of the body, so ENTER sits on one line
                  across all four doors however long the copy above it runs.

                  The fact and the way in are STACKED, not set beside each
                  other. Side by side they collided on the two doors whose fact
                  is longest: "2 to 4 seats. Needs an account and one deck with
                  cards in it." wrapped to two lines and ran into ENTER, and
                  "1 seat. Nothing blocks and nothing attacks back." finished
                  hard against it. A door is 374px wide and a sentence plus a
                  button does not fit on one line of it. */}
              <span className="mt-auto flex flex-col gap-2 pt-4">
                <span className="min-w-0 text-[0.7rem] leading-snug text-muted-foreground/70">
                  {liveLine ? (
                    <>
                      <span className="block font-medium text-foreground/80">{liveLine}</span>
                      <span className="block">{mode.meta}</span>
                    </>
                  ) : (
                    mode.meta
                  )}
                </span>

                <span className="flex items-center gap-1.5 self-end text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-foreground">
                  {mode.action}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
