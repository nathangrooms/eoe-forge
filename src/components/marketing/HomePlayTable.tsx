/**
 * Homepage — play mode.
 *
 * `/play` is a genuinely playable table against a bot and the homepage did not
 * mention it existed. This used to draw the table in CSS from real `cards` rows:
 * permanents in rows with lands in their own row below, tapped permanents turned
 * ninety degrees, the commander in its own zone, the hand fanned along the
 * bottom edge. It was careful, and it was still a drawing of a game.
 *
 * That is a worse problem here than anywhere else on the page, because the claim
 * this section makes is "a real game runs in your browser" — and the one thing
 * that cannot support that claim is an illustration. So the picture is now a
 * photograph of a real game: `scripts/app-shots.mjs` opens `/play`, starts a
 * table, plays lands, casts what is castable over several turns and photographs
 * the board it arrives at. Every permanent on it was put there by the rules
 * engine, not by this file.
 *
 * What is asserted in the copy (bot opponent, three views, the twelve-step turn
 * with decision-free steps walked automatically) was read out of
 * `src/components/play` and `src/lib/game` before it was written.
 */

import { Link } from 'react-router-dom';
import { ArrowRight, Hand as HandIcon, LayoutGrid, Swords } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { Section, SectionHeading } from '@/components/marketing/Section';
import { AppScreenshot } from '@/components/marketing/AppScreenshot';

/** The three views the board really offers, read off `src/components/play`. */
const VIEWS = [
  { id: 'table', label: 'Table', icon: LayoutGrid, note: 'The whole board, both seats.' },
  { id: 'hand', label: 'Hand', icon: HandIcon, note: 'Your seat, zoomed in.' },
  { id: 'combat', label: 'Combat', icon: Swords, note: 'Pick attackers and blockers.' },
];

export function HomePlayTable() {
  return (
    <Section>
      <SectionHeading
        eyebrow="Play"
        title="Play a real game, in the browser"
        lead={
          <>
            {/* WAS: "...and tapped means turned sideways." Owner: "you say
                things like 'card goes sideways' as if people dont know what
                tapping is". Nobody who comes looking for a Magic collection
                manager needs tapping explained, and explaining it tells them the
                product does not know who they are. */}
            Play one of your own decks against the computer. Cards sit in rows the way they do on a
            real table, with your lands in their own row underneath.{' '}
            {/* The three tiles under the picture already name the table, the
                hand and the combat view, so on a phone that sentence is the
                caption of a figure that has not appeared yet. */}
            <span className="hidden sm:inline">
              Swap between the table, your hand and a combat view for picking attackers and
              blockers. Any part of the turn with nothing to decide is done for you.
            </span>
          </>
        }
      />

      <div className="mt-9 sm:mt-14">
        <AppScreenshot
          scene="play-table"
          alt="A game of Commander part-way through: creatures and lands on both battlefields, the commander in its own zone, and a hand of cards along the bottom edge"
          caption="A real game, several turns in. Nothing here is drawn — this board was played out and photographed."
        />
      </div>

      <div className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-3 sm:gap-4">
        {VIEWS.map(v => (
          <div key={v.id} className="rounded-xl bg-muted/30 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <v.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              {v.label}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{v.note}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 text-center sm:mt-10">
        <Button asChild size="lg">
          <Link to="/play">
            Sit down at the table
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Section>
  );
}

export default HomePlayTable;
