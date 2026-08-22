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
 * that cannot support that claim is an illustration. So the picture became a
 * photograph of a real game, taken by `scripts/app-shots.mjs`.
 *
 * That photograph is off the page as of 22 Aug 2026 and the reasons are written
 * where it used to sit. It comes back the moment a clean capture exists; there
 * is no drawing here and there must never be one again.
 *
 * EVERY CLAIM IN THIS FILE WAS RE-READ OFF `src/components/play` ON 22 AUG 2026,
 * BECAUSE THE FIRST READING HAD GONE STALE. The three view tiles had described
 * a two seat table and a Combat screen that was deliberately deleted, for weeks,
 * under a screenshot that showed the real tabs. A claim checked once is a claim
 * checked once.
 */

import { Link } from 'react-router-dom';
import { ArrowRight, Eye, Hand as HandIcon, LayoutGrid } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { Section, SectionHeading } from '@/components/marketing/Section';

/**
 * The three tabs on the table, re-read off `PlayHUD.tsx` on 22 Aug 2026.
 *
 * ALL THREE OF THESE WERE WRONG, and the page's own screenshot showed it: the
 * tab strip in the picture read Table | Hand | View while the tiles under it
 * read Table | Hand | Combat.
 *
 *   - "The whole board, both seats" described a duel. `PlayHUD.tsx:91` calls it
 *     "All four quadrants", and `Play.tsx` seats up to four. Telling a
 *     Commander player the table holds two seats is the wrong way round from
 *     every other claim on this page.
 *   - "Your seat, zoomed in" is not what Hand does. `PlayHUD.tsx:92`: "The same
 *     table view, your seat alone." Nothing is magnified.
 *   - COMBAT IS NOT A VIEW A PLAYER CAN CHOOSE. `PlayHUD.tsx:87` says so in as
 *     many words: attackers and blockers are declared on the table now, and
 *     offering Combat as a fourth destination "would advertise the takeover
 *     that was just removed". The id still exists and still renders the table.
 *     So the homepage was selling a screen that had been deliberately deleted.
 *   - VIEW was missing, and it is the one of the three a pod actually needs:
 *     look at somebody else's board without leaving your seat.
 *
 * The notes are the app's own `hint` text put into a player's words. If the
 * tabs change again, they change in `PlayHUD.tsx` first and here second.
 */
const VIEWS = [
  /* Not "all four seats": `seatsFor` seats two, three or four, so a number here
     is wrong at two of the three. */
  { id: 'table', label: 'Table', icon: LayoutGrid, note: "Everybody's board at once." },
  { id: 'hand', label: 'Hand', icon: HandIcon, note: 'The same table, your seat only.' },
  { id: 'view', label: 'View', icon: Eye, note: "Somebody else's board, full screen." },
];

export function HomePlayTable() {
  return (
    <Section>
      {/* THE LEAD THE OWNER QUOTED, AND WHY IT IS GONE.
​
          It read: "Cards sit in rows the way they do on a real table, lands in
          their own row underneath, and tapped means turned sideways." The first
          half captioned the photograph directly beneath it. The second half
          explained TAPPING to somebody who has come looking for a Magic
          collection manager, which tells them the product does not know who they
          are. The sentence after it named the table, the hand and the combat
          view, which are the labels on the three tiles under the picture.
​
          What replaces the space is the thing this section was NOT saying.
          CLAUDE.md records that the engine runs the abilities of about 2.7% of
          the catalogue and correctly marks the other 95.7% as needing a human.
          "Play a real game" with that left out is the exact shape of claim this
          project has had to correct twice. It costs one clause to say, and the
          manual controls it names are real. */}
      <SectionHeading
        eyebrow="Play"
        title="Play a real game, in the browser"
        /* GOLDFISHING IS THE NEW CLAUSE, BECAUSE THE APP SHIPS IT AND THIS
           PAGE HAD NEVER SAID SO. Read off the live `/play` on 22 Aug 2026:
           it opens on four modes now, Online, Versus bots, Goldfish and
           Playtest, and Goldfish is described there as "Draw, mulligan, curve
           out, and find out how the list actually plays before you take it
           anywhere." Six sections above this one the reader was shown a deck
           builder, so that is the mode with the most obvious use to them, and
           "goldfish" is their own word for it rather than a paraphrase of it.
​
           ONLINE STAYS OFF THIS PAGE. That same screen labels it STILL BEING
           BUILT: you can open a table, take a seat, agree decks and talk, and
           the game across the connection is the piece not finished. A homepage
           listing it as a way to play would be the shape of overstatement this
           project has had to correct twice. */
        /* "MOST CARDS YOU STILL RESOLVE YOURSELF" WAS TOO KIND TO US.
​
           CLAUDE.md measures it: the abilities of about 2.7% of the catalogue
           run on their own, and the other 97.3% are correctly marked as needing
           a human. "Most" is technically true of 97.3% and a reader hears
           "maybe two thirds", which is the same shape of flattering imprecision
           this page has had to correct twice. Say nearly all of it, because
           nearly all of it is what it is, and then say the controls are good,
           because that is the part that decides whether it is worth sitting
           down.
​
           "It walks the parts of a turn you have no decisions in" was product
           voice for something players have one word for: it passes. */
        lead="Play one of your own decks against the computer, or goldfish it on your own. It passes the steps where nothing can happen. Nearly every card you resolve yourself, so the counters, the tap and the zone controls are the part that had to be good."
      />

      {/* THE PHOTOGRAPH IS OFF THE PAGE UNTIL IT CAN BE RETAKEN, AND THERE ARE
          THREE SEPARATE REASONS, ANY ONE OF WHICH IS ENOUGH.
​
          It was captured on 19 Aug and every other picture on this page was
          retaken on 22 Aug. `play-table` was asked for in that run and refused
          eight times, because `/play` now opens on a mode picker and the scene
          in `scripts/app-shots.mjs` still waits for text ("player game") that is
          no longer on the first screen and clicks a "Start 4-player game" button
          that is now three steps in.
​
          1. IT BREAKS SCRYFALL'S TERMS. `src/components/play/Playmat.tsx` was
             applying `saturate(0.26) brightness(0.4) contrast(1.06)` to card
             art; that was removed on 20 Aug, and its own comment quotes the
             guideline it broke. The capture predates the fix by a day, so the
             file in `public/screens/` is a picture of desaturated, colour
             shifted Scryfall art. This project has broken those terms twice and
             must not publish a third.
          2. IT CONTRADICTS THE THREE TILES BELOW IT. The tab strip along the
             top of that image reads Table | Hand | View. The tiles used to read
             Table | Hand | Combat.
          3. TWO LANDS IN IT DID NOT RENDER. The top seat's land row is two
             empty black rectangles with the word "Swamp" on them.
​
          The section stands on the tiles and the button until a clean capture
          exists. Fixing the capture is a change to `scripts/`, which belongs to
          another workflow: press ENTER on Versus bots and choose a deck before
          the existing `playTable` driver runs. `public/screens/manifest.json`
          records the same thing under `withheld`. */}

      <div className="mt-9 grid gap-3 sm:mt-14 sm:grid-cols-3 sm:gap-4">
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
