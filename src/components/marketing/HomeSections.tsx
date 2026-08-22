import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { Section, SectionHeading } from '@/components/marketing/Section';
import { AppScreenshot } from '@/components/marketing/AppScreenshot';

/**
 * Homepage content sections.
 *
 * Ground rule: every statement here maps to a feature that exists in the app and
 * a table that exists in the database. The previous homepage carried fabricated
 * testimonials, four contradictory sets of invented usage statistics, a fake
 * competitor comparison and Math.random() prices badged as live TCGPlayer data.
 * None of that is replaced with a "safer" invention — it is simply gone.
 *
 * TWO SECTIONS LEFT THIS FILE ON 22 AUG 2026.
 *
 *   `HomeFeatures`      six icon-and-paragraph cards. The page never rendered
 *                       it, and each of the six is now a section of its own with
 *                       a photograph in it. Its `id="features"` was what the
 *                       public nav's Features link pointed at, so that anchor
 *                       moved to `HomeStorage` — the section a visitor pressing
 *                       "Features" should land on, and the one thing on this
 *                       page nobody else has.
 *   `HomeColorIdentity` five pips and a paragraph explaining colour identity to
 *                       Commander players, who have known it since they started.
 */

/* ----------------------------------------------------------------- collection */

/**
 * The collection page, photographed.
 *
 * This section was dropped from the page on 2026-08-19 for a good reason: the
 * picture beside it was `/hero-768.webp`, the hero's own background image reused
 * as decoration and cropped to 16:10, so the page opened and closed on the same
 * artwork. It is back because that reason is now fixed — the picture is the real
 * `/collection` screen, taken by `scripts/app-shots.mjs`, and it is the one
 * screen the whole product is named after.
 *
 * It follows `HomeStorage` now rather than the deck page, which is why its lead
 * no longer mentions which box a card is in: the section directly above it is
 * entirely about boxes, and the hero has already said it once.
 */
export function HomeCollection() {
  return (
    <Section>
      <SectionHeading
        eyebrow="Collection"
        title="Your collection, not just your decklists"
        lead="How many of each you own, what condition they are in, and what the lot is worth today."
      />

      <div className="mt-8 sm:mt-14">
        <AppScreenshot
          scene="collection"
          alt="The DeckMatrix collection page: a header counting the cards, the unique cards among them and their market value, above a grid of real Magic cards each showing its set, condition and price"
          /* Was: "Cards, unique cards, market value and the ones nobody has a
             price for — counted from the copies you actually own, at the
             printing you own." An em-dash (copy rule 2), a caption listing the
             column headings visible in the picture above it, and an in-app
             caveat about unpriced printings that belongs in the app. What
             survives is the half nobody else can claim. */
          caption="Counted at the printing you own, not at the cheapest one in print."
        />
      </div>

      <div className="mt-8 text-center sm:mt-10">
        <Button asChild size="lg">
          <Link to="/register">
            Start your collection
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Section>
  );
}

/* ----------------------------------------------------------------------- CTA */

export function HomeCTA() {
  return (
    <Section tint>
      <SectionHeading
        /* Was "Bring your collection with you", which collided with the import
           and export section's heading and meant nothing standing on its own. */
        title="Start with what you already own"
        lead="Free while we are in early access. No card details, no trial timer."
      >
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:mt-8 sm:flex-row">
          <Button asChild size="lg" className="w-full sm:w-auto shadow-glow-elegant">
            <Link to="/register">
              Create your account
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </SectionHeading>
    </Section>
  );
}
