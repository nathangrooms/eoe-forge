import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { CardImage } from '@/components/cards';

/**
 * Homepage hero.
 *
 * Image-led: a fan of real, recognisable cards is the hero, with the six-panel
 * colour artwork behind it. Type sits over a dedicated ground rather than over
 * the art, so contrast never depends on which panel is behind a given letter.
 */

interface HeroCard {
  id: string;
  name: string;
  image_uris: Record<string, string> | null;
}

/* Iconic, instantly recognisable to any Commander player. */
const HERO_CARDS = [
  'Sol Ring',
  'Cyclonic Rift',
  'Rhystic Study',
  'Smothering Tithe',
  'Jeweled Lotus',
  'Dockside Extortionist',
  'Craterhoof Behemoth',
];

export function HomeHero({ cardCount }: { cardCount: number | null }) {
  const [cards, setCards] = useState<HeroCard[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('cards')
        .select('id,name,image_uris')
        .in('name', HERO_CARDS)
        .not('image_uris', 'is', null)
        .limit(60);

      /* One printing per name, ordered as listed so the fan is deterministic. */
      const byName = new Map<string, HeroCard>();
      for (const row of ((data ?? []) as unknown as HeroCard[])) {
        if (row.image_uris?.normal && !byName.has(row.name)) byName.set(row.name, row);
      }
      setCards(HERO_CARDS.map(n => byName.get(n)).filter(Boolean) as HeroCard[]);
    })();
  }, []);

  return (
    <section className="relative isolate overflow-hidden">
      {/* six-panel colour artwork */}
      <div className="absolute inset-x-0 top-0 -z-10 h-[70%]">
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
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-background/45 via-background/85 to-background" />
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(115%_75%_at_50%_20%,transparent_30%,hsl(var(--background))_100%)]" />
      </div>

      <div className="container mx-auto px-4 pt-20 sm:pt-24">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl lg:text-[5.5rem] lg:leading-[0.94] text-balance">
            Your collection.
            <br />
            <span className="text-muted-foreground">Finally organised.</span>
          </h1>

          <p className="mx-auto mt-7 max-w-lg text-lg leading-relaxed text-muted-foreground text-pretty">
            Catalogue every card you own — down to which box it is in — then build decks
            that know what is already on your shelf.
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

          <p className="mt-7 text-sm text-muted-foreground">
            {cardCount ? `${cardCount.toLocaleString()} cards` : 'Full card pool'} · synced nightly from Scryfall
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
