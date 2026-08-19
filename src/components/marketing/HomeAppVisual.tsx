import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Section, SectionHeading } from '@/components/marketing/Section';
import { AppScreenshot } from '@/components/marketing/AppScreenshot';

/**
 * Homepage — the deck builder.
 *
 * This section used to be a full-width CSS recreation of the builder, filled
 * with sixty real card rows. It was carefully made and it was the worst thing on
 * the page, for one reason: it was captioned "This is the builder" and it was
 * not the builder. Two things gave it away instantly to anyone who plays:
 *
 *   - the rows were a slice of the catalogue, not a deck. The commander slot
 *     held whichever legend happened to come back first, and the grid showed the
 *     same card three times over — which in Commander is illegal on sight.
 *   - the chrome was three grey dots and a title bar, which is not what the app
 *     looks like. The app has a header, a rail, tabs and a stacked curve.
 *
 * Owner: *"lots of the images dont actually look like real in app screens"*.
 * So it is a photograph now. `scripts/app-shots.mjs` loads a REAL Wizards precon
 * decklist — a hundred distinct cards, fetched from the same `fetch-precons`
 * edge function `/precons` uses and resolved against `cards_unique` — into the
 * real `/deck-builder` and photographs it. The power score, the curve, the
 * average mana value and the price in the picture are the app's own arithmetic
 * on those hundred cards.
 *
 * See `docs/overhaul/APP-SCREENSHOTS.md` for what is real in the picture, what
 * is fixture, and when it has to be taken again.
 */

export function HomeAppVisual() {
  return (
    <Section tint>
      <SectionHeading
        title="This is the builder"
        lead="Cards drop into the right group on their own, the curve redraws as you go, and what the deck costs is always on screen."
      />

      <div className="mt-14">
        <AppScreenshot
          scene="deck-builder"
          alt="The DeckMatrix deck builder holding a hundred-card Commander deck: the commander card, a mana curve broken down by card type, and the creature list underneath"
          caption="A real Commander precon, opened in the builder. The curve, the count and the price are worked out from the hundred cards in the list."
        />
      </div>

      <div className="mt-10 text-center">
        <Button asChild size="lg">
          <Link to="/deck-builder">
            Open the builder
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Section>
  );
}

export default HomeAppVisual;
