import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { approxLabel, heroCards } from '@/lib/homepage/snapshot';
import { CardImage } from '@/components/cards';

/**
 * Homepage hero.
 *
 * Image-led: a fan of real, recognisable cards is the hero, with the six-panel
 * colour artwork behind it. Type sits over a dedicated ground rather than over
 * the art, so contrast never depends on which panel is behind a given letter.
 */

/**
 * The fan, from the nightly snapshot.
 *
 * Seven iconic cards, chosen and ordered in `scripts/homepage-snapshot.mjs` so
 * the fan is deterministic. They used to be fetched on mount, which meant the
 * first thing a visitor saw was seven empty gaps waiting on a round trip.
 */
export function HomeHero({ cardCount }: { cardCount: number | null }) {
  const cards = heroCards() ?? [];
  /* Rounded down and written with a "+", because the file was true last night
     and the catalogue only grows. `approxLabel` explains the choice. Null falls
     back to the phrase, never to a number. */
  const countLabel = approxLabel(cardCount);

  return (
    <section className="relative isolate overflow-hidden">
      {/* six-panel colour artwork */}
      <div className="absolute inset-x-0 top-0 -z-10 h-[70%]">
        {/* The 1536w step is not decoration, it is the gap in the ladder.

            `sizes="100vw"` asks for one image pixel per CSS pixel of window
            width, so the browser takes the smallest candidate at least that
            wide. With only 768 / 1280 / 1920 to choose from, every window wider
            than 1280 fell straight to the 1920 file, and that is exactly where
            desktop sits: 1366, 1440 and 1536 (a 1920 screen at the 125%
            scaling Windows ships by default) are all inside that band.
            Measured on the built site: a 1280 window fetched 197,644 bytes and
            a 1366 window fetched 313,458, so 6.7% more pixels cost 59% more
            bytes.

            1536w closes it. Measured at those three widths the hero drops from
            313,458 to 227,392 bytes, and the file is still wider than the box
            it is drawn into, so nothing is upscaled. The artwork is untouched:
            the same picture at a fourth size, encoded at 0.171 bytes per pixel
            against the 1920's own 0.151, so it cannot look worse than the file
            it replaces. */}
        <img
          src="/hero-1280.webp"
          srcSet="/hero-768.webp 768w, /hero-1280.webp 1280w, /hero-1536.webp 1536w, /hero-1920.webp 1920w"
          sizes="100vw"
          alt=""
          aria-hidden="true"
          decoding="async"
          {...{ fetchpriority: 'high' }}
          className="h-full w-full object-cover object-center"
        />
        {/* ---------- scrim ----------
            Three shaped layers, replacing two full-bleed ones.

            The pair that used to be here (a linear from-background/45 via /85
            to fully opaque, PLUS a radial that also landed on fully opaque
            background) covered the whole image twice over. Multiplied out that
            is ~90% ink across the entire artwork, including the outer panels,
            which carry no type at all and so had nothing to protect. The owner
            supplied this artwork; it was not visible.

            The scrim exists for exactly one reason, contrast under the type, so
            it is now shaped like the type instead of like the image:

              1. a light overall wash, only enough to stop the brightest panels
                 glaring;
              2. an ellipse over the headline block alone, roughly the width of
                 the text measure, so the outer panels keep their colour;
              3. a fade that begins BELOW the type, so the image lands on the
                 page rather than stopping on a line.

            Measured, not estimated: the hero is rendered at 1680 with the type
            set to `visibility: hidden`, the backdrop screenshotted, and every
            second pixel under each text box composited against that box's own
            computed colour (which carries alpha, so the /80 and /70 below are
            included). Reported as average over the box, then the single worst
            pixel in it:

              headline   15.1:1 avg, 3.5:1 worst  (large text needs 3:1)
              subhead    10.7:1 avg, 6.2:1 worst
              meta line   8.5:1 avg, 4.1:1 worst

            A second, independent run of the same method landed within 0.5 of
            each average and above each worst figure, so these are the
            conservative pair. */}
        <div aria-hidden="true" className="absolute inset-0 bg-background/25" />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(56%_50%_at_50%_38%,hsl(var(--background)/0.86)_0%,hsl(var(--background)/0.62)_50%,transparent_78%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,transparent_56%,hsl(var(--background)/0.7)_80%,hsl(var(--background))_100%)]"
        />
      </div>

      <div className="container mx-auto px-4 pt-20 sm:pt-24">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl lg:text-[5.5rem] lg:leading-[0.94] text-balance">
            Your collection.
            <br />
            <span className="text-muted-foreground">Finally organised.</span>
          </h1>

          {/* text-foreground/80 rather than text-muted-foreground. Lifting the
              type is what pays for the lighter scrim above: muted-foreground
              over the thinned wash bottomed out at 3.8:1, this holds 6.2:1 at
              its worst pixel, and it buys the artwork back a layer of ink.
              Figures from the run described above the scrim. */}
          <p className="mx-auto mt-7 max-w-lg text-lg leading-relaxed text-foreground/80 text-pretty">
            Track every card you own, right down to the box it is sitting in. Then build
            decks that already know what is on your shelf.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full px-8 text-base sm:w-auto">
              <Link to="/register">
                Start free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full px-8 text-base backdrop-blur sm:w-auto">
              <Link to="/login">Sign in</Link>
            </Button>
          </div>

          {/* Also lifted off muted-foreground: this line sits low enough to be
              past the ellipse's falloff, where it measured 2.8:1 against the
              lightest pixel behind it. At /70 its worst pixel is 4.1:1 — over
              the 3:1 this size clears, and short of the 4.5:1 body-copy bar,
              which is why it is a meta line and not the lead. */}
          <p className="mt-7 text-sm text-foreground/70">
            {countLabel ? `${countLabel} cards` : 'Full card pool'} · synced nightly from Scryfall
          </p>
        </div>
      </div>

      {/* ---------- card fan ----------
          WHOLE cards. This was a fixed-height box with the fan pushed below its
          own floor (`bottom-[-4rem]`) inside the section's overflow-hidden, so
          all seven cards were sliced on one hard horizontal line at ~72% height
          — seven cropped cards as the first thing a visitor sees, on a page
          whose entire argument is that it draws real ones properly.

          The fan is in flow now. Transforms do not contribute to layout, so the
          padding is sized to the overhang the rotation creates: rotating about
          `bottom center` lifts the far top corner ~17px above the card's own box
          and drops the near bottom corner ~27px below it, and the outermost card
          is additionally translated 42px down. pt-6 / pb-16 clears both, and the
          section's overflow-hidden now only ever clips empty space. */}
      <div className="relative mt-4 flex items-end justify-center pb-16 pt-6 sm:pb-20">
          {cards.map((c, i) => {
            const mid = (cards.length - 1) / 2;
            const offset = i - mid;
            return (
              <figure
                key={c.id}
                className="group relative -mx-6 w-32 shrink-0 transition-transform duration-500 hover:z-20 hover:-translate-y-6 motion-reduce:transition-none sm:-mx-8 sm:w-44 lg:-mx-6 lg:w-52"
                style={{
                  zIndex: 10 - Math.abs(offset),
                  transform: `rotate(${offset * 5}deg) translateY(${Math.abs(offset) * 14}px)`,
                  transformOrigin: 'bottom center',
                }}
              >
                {/* CardImage, not a hand-rolled <img>. The fan is drawn at up
                    to 208px and the hand-rolled version asked Scryfall for
                    `normal` (488px) — already under-sampled on the 2× displays
                    most visitors arrive on, for the first seven cards they
                    ever see. */}
                <CardImage
                  card={c}
                  size="lg"
                  fill
                  hideFlip
                  interactive={false}
                  eager={i < 3}
                  imageClassName="shadow-2xl shadow-black/60"
                />
              </figure>
            );
          })}
      </div>
    </section>
  );
}

export default HomeHero;
