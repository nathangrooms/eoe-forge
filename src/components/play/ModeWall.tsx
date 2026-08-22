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
 * ONE GRADIENT, IN THE BOTTOM THIRD, AND NOTHING OVER THE PICTURE
 * ---------------------------------------------------------------------------
 * These covers were drawn with a dark lower third for type to sit in, so the
 * type sits there and the darkening stops where that band stops. The version
 * before this one also laid a second gradient DOWN from the top, which was
 * insurance against artwork that did not exist. It exists, it does not need
 * insuring, and washing the top of a picture somebody drew for this screen is
 * the opposite of showing it.
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
    <div className="grid w-full gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
              'motion-press group relative flex w-full min-w-0 flex-col justify-end overflow-hidden rounded-2xl p-5 text-left',
              active && 'shadow-lg shadow-black/40'
            )}
            style={{ aspectRatio: COVER_ASPECT }}
          >
            {/* All four, because all four are on screen. See `Cover`. */}
            <Cover src={mode.cover} fallback={mode.fallback} alt="" eager />

            {/* The darkening, and only in the band the cover already darkened
                for it. Above 42% of the height the picture is untouched. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 top-[42%]"
              style={{
                backgroundImage:
                  'linear-gradient(to top, hsl(0 0% 3% / 0.9) 0%, hsl(0 0% 3% / 0.62) 40%, transparent 100%)',
              }}
            />

            {/* Hover and selection are light on the surface, never an outline. */}
            <span
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute inset-0 bg-white/0 transition-opacity duration-200',
                active ? 'opacity-100 bg-white/[0.06]' : 'opacity-0 group-hover:opacity-100 group-hover:bg-white/[0.05]'
              )}
            />

            <span className="relative flex min-w-0 flex-col gap-2">
              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-white/60">
                {mode.eyebrow}
              </span>

              <span className="text-2xl font-bold uppercase leading-none tracking-tight text-white lg:text-3xl xl:text-xl 2xl:text-2xl">
                {mode.title}
              </span>

              <span className="mt-1 space-y-1">
                {mode.lines.map(line => (
                  <span key={line} className="block text-[0.8rem] leading-snug text-white/80">
                    {line}
                  </span>
                ))}
              </span>

              <span className="mt-3 flex items-end justify-between gap-3">
                <span className="min-w-0 text-[0.7rem] leading-snug text-white/55">
                  {liveLine ? (
                    <>
                      <span className="block font-medium text-white/80">{liveLine}</span>
                      <span className="block">{mode.meta}</span>
                    </>
                  ) : (
                    mode.meta
                  )}
                </span>

                <span className="flex shrink-0 items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-white">
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
