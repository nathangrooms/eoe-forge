/**
 * Homepage — the tournament manager.
 *
 * `/tournament` runs Swiss or single elimination with real DCI maths, and the
 * homepage did not mention it existed.
 *
 * WHAT USED TO BE HERE, AND WHY IT IS NOT
 * ---------------------------------------
 * A live worked example: four real precon decks, two rounds played, the round
 * three pairings produced by calling the app's own `generatePairings` and every
 * figure in a standings table produced by calling its own `computeStandings`,
 * in the reader's browser, as the page loaded. It was carefully built and it
 * was the right instinct — run the thing rather than print a picture of it.
 *
 * It went for two reasons.
 *
 * It was proving something nobody disputed. A visitor deciding whether to run
 * their pod on this instead of a spreadsheet is not asking whether we can add
 * up match points. The paragraph under the table said so out loud, at length,
 * and was addressed to a code reviewer rather than to a player.
 *
 * And it cost about 980px on a phone: a second set of pairings under a
 * photograph of pairings, then a table, then the four results the table was
 * computed from. `tournament-standings` had been captured since 19 August and
 * had never been shown to anybody — a photograph of the real standings screen,
 * with the real tiebreakers in it, doing the same job in one image.
 *
 * So: two photographs, a heading, one line and six chips. The entrant selection,
 * the `PLAYED` fixture, `buildRounds`, `pickEntrants`, the standings table and
 * the pairing panels all went with it, which also removes a batched card query
 * and a `useMemo` over `PRECON_INDEX` from the homepage.
 */

import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { MobileReveal, Section, SectionHeading } from '@/components/marketing/Section';
import { AppScreenshot } from '@/components/marketing/AppScreenshot';

/**
 * What the thing does, in six words each.
 *
 * These carry more than the ninety words of prose that used to sit above them,
 * and they are the section's feature list rather than its working.
 */
const CAPABILITIES = [
  'Swiss or single elimination',
  'Pairings that avoid rematches',
  'Byes handled properly',
  'Round timer',
  'Drops mid-event',
  'Decklists registered per player',
];

export function HomeTournaments() {
  return (
    <Section tint>
      {/* The lead used to explain match points and OMW to somebody who has
          played an FNM ("Three points for a win and one for a draw, with your
          opponents' win rate breaking the ties"), and then promise that nobody
          gets paired twice while somebody else is free — which is chip two,
          below. What is left is the shape of the event and the one line that is
          a genuine relief to anybody who has run one. */}
      <SectionHeading
        eyebrow="Tournaments"
        title="Run the pod, not a spreadsheet"
        lead={
          <>
            Swiss or knockout, with the usual tiebreakers.{' '}
            <span className="hidden sm:inline">
              Results go in with one click, and you can take them back.
            </span>
          </>
        }
      />

      {/* BOTH CAPTIONS IN THIS SECTION USED TO NARRATE THE PICTURE ABOVE THEM.
          "A Swiss event in progress: the round clock, and the pairings for
          round three with the deck each seat registered" is a list of the
          things a reader can see, which is what `alt` is for and what a sighted
          reader does not need. A caption earns its line by saying something the
          image cannot. These two say the thing an organiser wants to know and
          the picture cannot show: that the events are private to the machine
          that runs them, and that nothing has to be typed twice. */}
      <div className="mt-9 sm:mt-14">
        <AppScreenshot
          scene="tournament"
          alt="The DeckMatrix tournament manager running a Swiss Commander event: a round clock, the current round's pairings with each seat's commander card, and live standings down the right"
          caption="Each seat's commander follows them into the standings and onto the podium."
        />
      </div>

      {/* The standings, behind a control on a phone.
​
          Two 16:10 photographs stacked is ~440px at 390px wide, and the first
          one already carries standings down its right-hand edge. The second is
          the screen an organiser looks at between rounds, so it earns its place
          on a desktop, where `MobileReveal` is inert and both are simply on the
          page. */}
      <MobileReveal label="See the standings">
        <div className="mt-5 sm:mt-8">
          {/* No caption. "Match points, records and the tiebreakers, after
              every result" named the four columns the reader is looking at,
              and the lead has already said "with the usual tiebreakers" two
              hundred pixels above. The `alt` carries it for anyone who cannot
              see the picture, which is whose job that is. */}
          <AppScreenshot
            scene="tournament-standings"
            alt="Live standings for a Swiss Commander event: each player's match points, their win-loss-draw record and the three DCI tiebreaker percentages"
          />
        </div>
      </MobileReveal>

      <div className="mt-8 flex flex-wrap justify-center gap-2 sm:mt-10">
        {CAPABILITIES.map(c => (
          <span
            key={c}
            className="rounded-full bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground"
          >
            {c}
          </span>
        ))}
      </div>

      <div className="mt-8 text-center sm:mt-10">
        <Button asChild size="lg" variant="outline">
          <Link to="/tournament">
            Open the tournament manager
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Section>
  );
}

export default HomeTournaments;
