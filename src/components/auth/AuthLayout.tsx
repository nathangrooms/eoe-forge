import { ReactNode } from 'react';
import { Wordmark } from '@/components/Wordmark';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface AuthLayoutProps {
  title: string;
  description: string;
  children: ReactNode;
  showBackToHome?: boolean;
}

/**
 * Auth layout. The colour artwork is FULL BLEED behind the whole page.
 *
 * It used to live inside one half of a `lg:grid-cols-2`, and that was the bug.
 * The artwork is 16:9 (1920x1081). Forced into a tall half-width column it is
 * roughly a 0.69 ratio box, so `object-cover` keeps only 0.69/1.78 = 39% of the
 * image width and centre-crops the rest. The owner counted the result: three
 * colours visible out of the five they wanted.
 *
 * Full bleed across a ~1.6 ratio viewport keeps about 90% of the width, so the
 * whole spread survives. The form floats over it rather than sitting beside it.
 *
 * Scrims are deliberately restrained. The owner on the homepage hero: "no need
 * for as much black gradient overlay, covers background too much". So the ground
 * is local to the text that needs it, not a sheet over the entire image.
 *
 * Replaces a purple gradient with an animated grid, four blurred floating orbs,
 * and a "Trusted by thousands of Magic players worldwide" line that was not
 * true. The product is pre-launch.
 */
export function AuthLayout({
  title, description, children, showBackToHome = true,
}: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen">
      {/* ---------------- artwork: full bleed, all five colours ---------------- */}
      <div className="absolute inset-0 -z-10" aria-hidden="true">
        {/* Same four-step ladder as the homepage hero, and the same reason: the
            gap between 1280 and 1920 swallowed every ordinary desktop width, so
            1366, 1440 and 1536 windows all pulled the 313 kB file. See the note
            in `HomeHero` for the measurements.

            The `src` fallback is the 1280, not the 1920. `src` is only read by
            a browser that does not understand `srcSet`, and handing that
            browser the largest file of the four is backwards. */}
        <img
          src="/hero-1280.webp"
          srcSet="/hero-768.webp 768w, /hero-1280.webp 1280w, /hero-1536.webp 1536w, /hero-1920.webp 1920w"
          sizes="100vw"
          alt=""
          decoding="async"
          className="h-full w-full object-cover object-center"
        />
        {/* One light wash so white type never sits directly on bright art, and a
            soft floor so the page has somewhere to end. Nothing heavier: the art
            is the point. */}
        <div className="absolute inset-0 bg-background/30" />
        {/* The page needs a floor. Stripping the scrims back to let the art
            through went too far and left the artwork ending on a hard edge at
            the bottom of the viewport.

            It holds FULL background for the bottom quarter, deliberately: the
            five colour symbols and their labels are baked into the artwork
            itself, and half-covering them looked like a rendering fault rather
            than a design. Cover them properly. The fade then runs up through
            three fifths of the height so the transition is never a visible
            line. */}
        <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-background from-25% via-background/80 to-transparent" />
      </div>

      <div className="relative flex min-h-screen flex-col">
        <header className="flex items-center justify-between p-6 lg:p-10">
          {/* The wordmark lands on the white panel, which is the brightest part
              of the artwork. White-on-gold needs help. */}
          <Link to="/" className="inline-flex w-fit rounded-lg bg-background/70 px-3 py-1.5 backdrop-blur">
            <Wordmark size="md" />
          </Link>
          {showBackToHome && (
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-lg bg-background/80 px-3 py-1.5 text-sm text-foreground/90 backdrop-blur transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to home
            </Link>
          )}
        </header>

        {/* Centred. It sat hard against the right edge first, which read as
            pasted on, and inboard-right still left the composition lopsided
            against a symmetrical five-panel artwork. The art is a centred
            spread, so the thing you came here to do belongs on its axis. The
            tagline stacks above the form rather than beside it. */}
        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-10">
          {/* The tagline sits over the art on wide screens, where there is room
              for it without covering the panels. */}
          <div className="mb-8 hidden max-w-xl text-center lg:block">
            <p className="text-3xl font-medium leading-snug text-balance drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]">
              Every card you own, in one place.
            </p>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-foreground/85 drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]">
              Catalogue your collection, track where each card is stored, and build decks
              against what is already on your shelf.
            </p>
          </div>

          {/* The form gets its own ground. This is the one place a solid surface
              is worth spending, because input legibility is not negotiable. */}
          {/* OPAQUE, deliberately. The first attempt used bg-background/92 with a
              backdrop blur, and it landed over the brightest panels of the art
              (red dragon, green canopy) where even 8% bleed-through washed the
              labels and the heading out. Input legibility is not negotiable, so
              this one surface stops being clever and becomes solid. The art is
              still doing its job in the other four fifths of the page. */}
          <div className="w-full max-w-sm rounded-2xl bg-card p-7 shadow-2xl shadow-black/70 ring-1 ring-black/40 sm:p-8">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>

            <div className="mt-8">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
