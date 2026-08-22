import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowRight, Boxes, Camera, LineChart, Layers, Search, Sparkles,
} from 'lucide-react';
import { ManaSymbol } from '@/components/ui/mana-symbols';
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
 */

/* ------------------------------------------------------------------ features */

const FEATURES = [
  {
    icon: Boxes,
    title: 'Know where every card physically is',
    body:
      'Put your collection into real boxes: binders, deck boxes, bulk boxes, down to the slot. ' +
      'When a decklist needs a card, DeckMatrix tells you which box to open instead of leaving you to hunt.',
    accent: 'text-type-lands',
  },
  {
    icon: Layers,
    title: 'Build with what you actually own',
    body:
      'The deck builder reads your collection, so you can see at a glance which cards are already on your shelf ' +
      'and which you still need to buy. No more building a list you cannot sleeve up.',
    accent: 'text-type-creatures',
  },
  {
    icon: Search,
    title: 'Search every card there is',
    body:
      'Every paper card, updated from Scryfall every night, so a new set is searchable as soon as it is ' +
      'on Scryfall, not months later.',
    accent: 'text-type-instants',
  },
  {
    icon: LineChart,
    title: 'Watch your collection value move',
    body:
      'Prices are captured on a daily schedule and kept as history, so collection value is a trend line you can ' +
      'look back through, not just a number that changes when you reload.',
    accent: 'text-type-artifacts',
  },
  {
    icon: Camera,
    title: 'Add cards with your camera',
    body:
      'Scan cards to add them to your collection instead of typing names one at a time.',
    accent: 'text-type-planeswalkers',
  },
  {
    icon: Sparkles,
    title: 'Get a read on your deck',
    body:
      'Analysis tools look at your curve, colour identity and composition, and suggest what to cut and what to ' +
      'add. Handy when a deck feels off and you cannot say why.',
    accent: 'text-type-enchantments',
  },
];

export function HomeFeatures() {
  return (
    <Section id="features">
      <SectionHeading
        title="Built for the part of Magic that happens away from the table"
        lead="Brewing, tuning, and working out what you already own."
      />

      <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(f => {
          const Icon = f.icon;
          return (
            <Card key={f.title} className="transition-shadow hover:shadow-glow-subtle">
              <CardContent className="pt-6">
                <div className="mb-4 inline-flex rounded-lg bg-muted p-2.5">
                  <Icon className={`h-5 w-5 ${f.accent}`} />
                </div>
                <h3 className="font-medium leading-snug">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------- formats */

const COLOR_LABELS: { c: string; label: string }[] = [
  { c: 'W', label: 'White' },
  { c: 'U', label: 'Blue' },
  { c: 'B', label: 'Black' },
  { c: 'R', label: 'Red' },
  { c: 'G', label: 'Green' },
];

export function HomeColorIdentity() {
  return (
    <Section tint size="compact">
      <SectionHeading
        title="Colour identity handled properly"
        lead="Commander lives and dies by colour identity. DeckMatrix reads it off the card itself rather than the mana cost, so hybrid, phyrexian and rules-text symbols all count the way the rules say they should."
      />

      <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
        {COLOR_LABELS.map(({ c, label }) => (
          <div key={c} className="flex flex-col items-center gap-2">
            <ManaSymbol color={c} size="lg" />
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ----------------------------------------------------------------- collection */

/**
 * The collection page, photographed.
 *
 * This section was dropped from the page on 2026-08-19 for a good reason: the
 * picture beside it was `/hero-768.webp`, the hero's own background image reused
 * as decoration and cropped to 16:10, so the page opened and closed on the same
 * artwork. It is back because that reason is now fixed — the picture is the real
 * `/collection` screen, taken by `scripts/app-shots.mjs`, and it is the one
 * screen the whole product is named after. The hero promises "your collection,
 * finally organised" and until now the page never showed a collection.
 *
 * The four bullets it used to carry are gone rather than restored: three of them
 * are whole sections of their own further down (storage, price history, the
 * builder reading your collection) and the fourth, the wishlist, is a footer
 * link. What is left is the claim and the evidence.
 */
export function HomeCollection() {
  return (
    <Section>
      <SectionHeading
        eyebrow="Collection"
        title="Your collection, not just your decklists"
        lead={
          <>
            Most deck builders assume you can buy anything. DeckMatrix starts from what is already
            in your boxes: how many you have, what condition they are in, which box they are sitting
            in, and what the lot is worth today.
          </>
        }
      />

      <div className="mt-8 sm:mt-14">
        <AppScreenshot
          scene="collection"
          alt="The DeckMatrix collection page: a header counting the cards, the unique cards among them and their market value, above a grid of real Magic cards each showing its set, condition and price"
          caption="Counted from the copies you own, at the printing you own."
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
        title="Bring your collection with you"
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
