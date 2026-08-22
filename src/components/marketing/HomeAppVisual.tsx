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
      {/* THE HEADING SAID "This is the builder" OVER A PHOTOGRAPH OF THE DECK
          PAGE, and had done since the scene was changed on the owner's own
          instruction ("Maybe need to just use the deck detail page instead").
          The lead under it described editing behaviour — cards dropping into
          groups, a curve redrawing as you type — none of which is visible in a
          picture of a finished deck. Both now describe what is on screen.
​
          The last sentence is a feature the homepage had never mentioned once:
          `/p/:slug` publishes a deck to a link anybody can open, which is one of
          the top reasons people use Moxfield at all. See src/lib/api/shareAPI.ts
          and src/pages/PublicDeck.tsx. */}
      <SectionHeading
        title="Build a deck, then see what you built"
        lead="An EDH power score, what the list costs, its colour identity and every card type counted. Publish it and anyone can open it from a link."
      />

      <div className="mt-8 sm:mt-14">
        {/* The deck page, not the builder's edit surface.

            The builder shot was photographing a working surface: a filter row,
            a tab bar and a card grid. The deck page leads with what the product
            actually worked out, the power score, the value, the colour identity
            and the type breakdown, and it is the calmer picture. Owner: "Maybe
            need to just use the deck detail page instead." */}
        <AppScreenshot
          scene="deck"
          alt="A hundred-card Commander deck in DeckMatrix: its commander, its EDH power score, what it is worth, its colour identity and a breakdown of every card type in the list"
          /* Named, not described. "A real Commander precon" is a claim; Eldrazi
             Incursion is evidence, and the name is in
             public/screens/manifest.json where the shot was taken. The sentence
             that followed it insisted the numbers were worked out from the list,
             which is what a deck page is. */
          caption="Eldrazi Incursion, a Commander precon, loaded whole."
        />
      </div>

      <div className="mt-8 text-center sm:mt-10">
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
