import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowRight, Boxes, Camera, LineChart, Layers, Search, Sparkles, Wallet, Heart,
} from 'lucide-react';
import { ManaSymbol } from '@/components/ui/mana-symbols';

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
      'Map your collection to real-world storage — binders, deck boxes, bulk boxes — down to the slot. ' +
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
    title: 'Search the whole catalogue',
    body:
      'The full paper card pool, synced nightly from Scryfall — so new sets are searchable as soon as they are ' +
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
      'add — useful when a deck feels off but you cannot say why.',
    accent: 'text-type-enchantments',
  },
];

export function HomeFeatures() {
  return (
    <section id="features" className="py-24 sm:py-32">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl text-balance">
            Built for the part of Magic that happens away from the table
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Brewing, tuning, and working out what you already own.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-[1500px] gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
      </div>
    </section>
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
    <section className="bg-card/40 py-20">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl text-balance">
            Colour identity handled properly
          </h2>
          <p className="mt-4 text-muted-foreground text-pretty">
            Commander lives and dies by colour identity. DeckMatrix reads it from the card, not from the
            mana cost — so hybrid, phyrexian and rules-text pips are counted the way the rules count them.
          </p>
        </div>

        <div className="mx-auto mt-10 flex max-w-2xl flex-wrap items-center justify-center gap-6">
          {COLOR_LABELS.map(({ c, label }) => (
            <div key={c} className="flex flex-col items-center gap-2">
              <ManaSymbol color={c} size="lg" />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- collection */

export function HomeCollection() {
  return (
    <section className="py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto grid max-w-[1500px] items-center gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-balance">
              Your collection, not just your decklists
            </h2>
            <p className="mt-4 leading-relaxed text-muted-foreground text-pretty">
              Most deck builders assume you can buy anything. DeckMatrix starts from what is already in
              your boxes: quantities, condition, where it is stored, and what it is worth now versus when
              you got it.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                ['Quantities and condition per printing', Wallet],
                ['Physical storage down to the slot', Boxes],
                ['Wishlist for the cards you still want', Heart],
                ['Daily price capture, kept as history', LineChart],
              ].map(([label, Icon]) => {
                const I = Icon as typeof Wallet;
                return (
                  <li key={label as string} className="flex items-start gap-3">
                    <I className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{label as string}</span>
                  </li>
                );
              })}
            </ul>
            <Button asChild className="mt-8">
              <Link to="/register">
                Start your collection
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-2xl shadow-2xl shadow-black/40">
              <img
                src="/hero-768.webp"
                alt="The five colours of Magic rendered as painted panels"
                loading="lazy"
                decoding="async"
                className="aspect-[16/10] w-full object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------- CTA */

export function HomeCTA() {
  return (
    <section className="bg-card/40 py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-balance">
            Bring your collection with you
          </h2>
          <p className="mt-4 text-muted-foreground text-pretty">
            Free while we are in early access. No card details, no trial timer.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
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
        </div>
      </div>
    </section>
  );
}
