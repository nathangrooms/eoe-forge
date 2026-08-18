import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

/**
 * Homepage hero.
 *
 * The six-panel colour artwork is the single strongest asset on the page, so it
 * is shown at full saturation across the top and allowed to fall away into the
 * page background rather than being flattened under a full-surface scrim.
 * Type sits in the darkened lower third where contrast is guaranteed.
 *
 * Served as responsive WebP (2.66 MB PNG -> 193 KB at 1280px) and marked
 * high priority because it is the LCP element.
 */

export function HomeHero({ cardCount }: { cardCount: number | null }) {
  return (
    <section className="relative isolate overflow-hidden">
      {/* ---------- artwork ---------- */}
      <div className="absolute inset-x-0 top-0 -z-10 h-[78%]">
        <img
          src="/hero-1280.webp"
          srcSet="/hero-768.webp 768w, /hero-1280.webp 1280w, /hero-1920.webp 1920w"
          sizes="100vw"
          alt=""
          aria-hidden="true"
          decoding="async"
          {...{ fetchpriority: 'high' }}
          className="h-full w-full object-cover object-center"
        />
        {/* Vertical fade into the page. Weighted to the bottom so the art stays
            vivid up top and the headline still lands on near-solid ground. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/80 to-background"
        />
        {/* Edge vignette so the panels do not collide with the viewport sides. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_25%,transparent_35%,hsl(var(--background))_100%)]"
        />
      </div>

      <div className="container mx-auto px-4 pt-40 pb-20 sm:pt-56 sm:pb-24">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl lg:text-[5.25rem] lg:leading-[0.95] text-balance">
            Your collection.
            <br />
            <span className="text-muted-foreground">Finally organised.</span>
          </h1>

          <p className="mx-auto mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
            Catalogue every card you own — down to which box it is in — then build decks
            that know what is already on your shelf.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full px-7 text-base sm:w-auto">
              <Link to="/register">
                Start free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="w-full px-7 text-base backdrop-blur sm:w-auto"
            >
              <Link to="/login">Sign in</Link>
            </Button>
          </div>

          {/* The only claim above the fold, and it is read from the table it describes. */}
          <p className="mt-8 text-sm text-muted-foreground">
            {cardCount ? `${cardCount.toLocaleString()} cards` : 'Full card pool'} · synced nightly
            from Scryfall
          </p>
        </div>
      </div>
    </section>
  );
}

export default HomeHero;
