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
 * THERE IS NO ARTWORK YET AND THIS SHIPS ANYWAY
 * ---------------------------------------------------------------------------
 * A cover is one asset per mode at `/covers/play/<id>.webp`, cut 3:4. Until one
 * is dropped in, the door is the procedural playmat: the same CSS surface the
 * game is played on, drawn at whatever size the door happens to be, with each
 * mode carrying its own weave and its own colour so the four are told apart.
 * That is a deliberate look rather than a hole, because it may be what ships
 * for a while, and it is the one atmospheric field in this product that owes
 * nothing to anybody's licence.
 *
 * A missing cover is remembered for the life of the tab, so four 404s happen
 * once rather than on every visit to the step.
 *
 * ---------------------------------------------------------------------------
 * WHY THE SCRIM IS TWO GRADIENTS AND NOT ONE FLAT WASH
 * ---------------------------------------------------------------------------
 * Type sits low on this card, so the darkening has to be low too. A flat wash
 * heavy enough to carry a caption also flattens the picture it is carrying. Two
 * stacked gradients put the weight under the words and leave the top two thirds
 * of the image alone, which is what makes it a cover rather than a grey panel.
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

function Cover({
  src,
  fallback,
  alt,
}: {
  src: string;
  fallback: { style: string; tint: string };
  alt: string;
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
          loading="lazy"
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
  return (
    <div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
            <Cover src={mode.cover} fallback={mode.fallback} alt="" />

            {/* The darkening. Weighted low, so the picture keeps its top. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  'linear-gradient(to top, hsl(0 0% 3% / 0.94) 0%, hsl(0 0% 3% / 0.74) 34%, hsl(0 0% 3% / 0.18) 62%, transparent 100%),' +
                  'linear-gradient(to bottom, hsl(0 0% 3% / 0.45) 0%, transparent 38%)',
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

            {/* What is not finished, said at the TOP of the door rather than in
                the description. Down there it pushed one card's title out of
                line with the other three, and four doors whose titles do not
                agree on a baseline stop reading as a set. */}
            {mode.developing && (
              <span className="absolute inset-x-5 top-5 rounded-lg bg-black/55 px-2.5 py-2 text-[0.7rem] leading-snug text-white/85">
                <span className="block font-semibold uppercase tracking-[0.16em] text-white/70">
                  Still being built
                </span>
                <span className="mt-0.5 block">{mode.developing}</span>
              </span>
            )}

            <span className="relative flex min-w-0 flex-col gap-2">
              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-white/60">
                {mode.eyebrow}
              </span>

              <span className="text-2xl font-bold uppercase leading-none tracking-tight text-white lg:text-3xl">
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
