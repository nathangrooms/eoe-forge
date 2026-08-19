import { cn } from '@/lib/utils';

/**
 * A photograph of the real running app.
 *
 * Owner: *"lots of the images dont actually look like real in app screens"*, and
 * then: *"we will likely just replace some sections with in-app screenshots"*.
 * This is the one way those pictures get onto the page, so there is one place
 * that decides how they are framed and one place to change it.
 *
 * The files come from `scripts/app-shots.mjs`, which drives a real browser over
 * the real pages — real card rows, real art, real prices, the app's own header
 * and rail around them. `docs/overhaul/APP-SCREENSHOTS.md` says what is real in
 * them, what is fixture and when they have to be re-taken.
 *
 * Rules this component exists to hold:
 *
 *   - NEVER CROPPED. Every scene is captured at 16:10 and drawn at 16:10 with
 *     `h-auto`, so the image is its own aspect ratio and no `object-cover` ever
 *     shaves an edge off a screen. The same rule cards get.
 *   - No border. Depth is the shadow plus the rounding, per design law.
 *   - Two widths, offered as a `srcSet` rather than one heavy file, so a laptop
 *     downloads the 1600 and a retina display the 1920.
 *   - `aspect-[16/10]` on the wrapper reserves the space before the bytes land,
 *     so a screenshot arriving does not shove the rest of the section down.
 */

export interface AppScreenshotProps {
  /** Scene key from `public/screens/manifest.json` — the file stem. */
  scene: string;
  /** What is in the picture. Never "screenshot of the app". */
  alt: string;
  /** A line under the image saying what is being looked at. */
  caption?: React.ReactNode;
  /** The first screenshot on the page is worth loading eagerly. */
  priority?: boolean;
  /**
   * Off when the caller already provides the rounding and the shadow — the life
   * counter sits inside a device bezel, and two roundings on one image reads as
   * a mistake rather than as depth.
   */
  frame?: boolean;
  className?: string;
}

export function AppScreenshot({
  scene,
  alt,
  caption,
  priority,
  frame = true,
  className,
}: AppScreenshotProps) {
  return (
    <figure className={cn('w-full', className)}>
      <div
        className={cn(
          'overflow-hidden bg-card',
          frame && 'rounded-2xl shadow-2xl shadow-black/40'
        )}
      >
        <img
          src={`/screens/${scene}-1600.webp`}
          srcSet={`/screens/${scene}-1600.webp 1600w, /screens/${scene}-1920.webp 1920w`}
          sizes="(min-width: 1600px) 1600px, 100vw"
          width={1600}
          height={1000}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          className="aspect-[16/10] w-full"
        />
      </div>

      {caption && (
        <figcaption className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

export default AppScreenshot;
