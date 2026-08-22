import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { CardImage, CardImageSkeleton } from '@/components/cards/CardImage';
import { showcaseCards } from '@/lib/homepage/snapshot';
import { Section, SectionHeading } from '@/components/marketing/Section';
import {
  BLEED_MM,
  BLOCK_H_MM,
  BLOCK_W_MM,
  CARD_H_MM,
  CARD_W_MM,
  PAPER,
  PROXY_COLS,
  PROXY_PER_PAGE,
  PROXY_ROWS,
  cropMarkSegments,
  sheetMargins,
} from '@/components/deck-builder/proxy-geometry';

/**
 * Homepage — proxies.
 *
 * `/proxies` has shipped, has its own nav entry, has unit tests and a browser
 * measurement behind its geometry, and the homepage had never mentioned it. The
 * owner named it directly: "proxies is missing too."
 *
 * WHY THIS IS DRAWN AND NOT PHOTOGRAPHED
 * --------------------------------------
 * The right picture here is a printed sheet on a desk, and there is no capture
 * of one: `scripts/app-shots.mjs` belongs to another workflow, so `proxy-sheet`
 * has to be requested rather than added here. A sheet of paper is also the same
 * kind of subject as the binder in `HomeStorage` and the camera in
 * `HomeScanner` — a physical object, not a screen — and those two are drawn for
 * that reason and are the better for it.
 *
 * WHAT KEEPS THE DRAWING HONEST
 * -----------------------------
 * Every measurement below is imported from `proxy-geometry.ts`, the same module
 * the print stylesheet, the on-screen preview and the jsPDF export all read. So
 * the page is 210 x 297 mm because A4 is, the block is 189 x 264 mm because
 * three 63 x 88 cards are, the margins are the real derived margins and the
 * crop marks are at the positions `cropMarkSegments` puts them. If anybody
 * retunes the sheet, this figure moves with it. Nothing here is a number typed
 * into a marketing file.
 *
 * The heading's "63 by 88 mm" is the one number on this section a reader could
 * hold a ruler against, and it is not read off the stylesheet: a stylesheet can
 * be correct and still print small, because "Fit to page" in the print dialog
 * rescales it. `scripts/proxy-output-measure.mjs` measures the card out of the
 * PRODUCED PDF instead, which is the only place the finished size is knowable,
 * and it is what entitles this page to say the size out loud.
 *
 * `proxy-geometry.ts` imports nothing at all — it is a leaf that runs under
 * `node --test` — so pulling it in costs the homepage bundle the constants and
 * no more.
 *
 * The cards are real rows from the nightly snapshot, drawn WHOLE at 5:7 through
 * `CardImage`, never cropped and never treated. They are the pool
 * `HomeShowcase` used before that section left the page, which is why this costs
 * no new query: expensive staples, which is exactly what people proxy.
 */

/**
 * How many cards the figure draws — the page's own capacity, not a number
 * chosen for the layout. The lead beside it writes the same figure as a word,
 * because "9 to a page" reads as a spec sheet and "nine to a page" reads as a
 * sentence; `proxy-geometry.test.ts` is what stops the two drifting apart.
 */
const SHEET_CARDS = PROXY_PER_PAGE;

/**
 * How many of the nine a phone draws.
 *
 * Nine is the whole point of the figure, and unlike a wall of search results
 * the ninth card is not the eighth one again: what is being shown is the SHAPE
 * of a full page. So all nine stay at every width. The sheet is one object that
 * scales, not a grid that reflows, which is why it can afford to.
 */

interface ProxyCard {
  id: string;
  name: string;
  layout?: string;
  faces?: unknown;
  image_uris?: Record<string, string>;
}

/** A percentage of the paper, so the figure is A4 at any rendered size. */
const pctX = (mm: number) => `${(mm / PAPER.a4.wMm) * 100}%`;
const pctY = (mm: number) => `${(mm / PAPER.a4.hMm) * 100}%`;

const MARGIN = sheetMargins('a4');
const MARKS = cropMarkSegments('a4');

/**
 * What the lead does NOT already say. The size and the nine-up are in the
 * heading's own sentence, so repeating them here would be the pattern this
 * rewrite exists to remove.
 */
const SHEET_FACTS = [`${PAPER.a4.label} or ${PAPER.letter.label}`, 'Crop marks', 'Print or PDF'];

function ProxySheetFigure({ cards }: { cards: ProxyCard[] | null }) {
  const slots: (ProxyCard | null)[] = cards
    ? Array.from({ length: SHEET_CARDS }, (_, i) => cards[i] ?? null)
    : Array.from({ length: SHEET_CARDS }, () => null);

  return (
    <figure className="mx-auto w-full max-w-[520px]">
      {/* The paper. A4's own ratio, so nothing about this object is a guess. */}
      <div
        className="relative w-full overflow-hidden rounded-sm bg-[hsl(0_0%_96%)] shadow-2xl shadow-black/60"
        style={{ aspectRatio: `${PAPER.a4.wMm} / ${PAPER.a4.hMm}` }}
      >
        {/* The black bleed the block is printed on. It is why a cut that misses
            by half a millimetre keeps a hair of black instead of showing a
            white sliver, and it is the only thing on a real sheet that is not
            a card. */}
        <div
          aria-hidden
          className="absolute bg-black"
          style={{
            left: pctX(MARGIN.xMm - BLEED_MM),
            top: pctY(MARGIN.yMm - BLEED_MM),
            width: pctX(BLOCK_W_MM + BLEED_MM * 2),
            height: pctY(BLOCK_H_MM + BLEED_MM * 2),
          }}
        />

        {/* Crop marks, at the positions the printed sheet puts them: white
            where they cross the bleed, grey where they run onto bare paper.
​
            `minWidth`/`minHeight` of a pixel, because a mark is 0.25 mm wide
            and this figure is drawn at about 520 px across. 0.25 of 210 mm is
            0.12% of the width, which is 0.6 of a pixel, and a browser is free
            to round that away entirely — thirty-two marks that sometimes
            disappear. A hairline drawn as the thinnest thing the screen has is
            the honest rendering of a hairline. */}
        {MARKS.map((m, i) => (
          <span
            key={i}
            aria-hidden
            className={m.tone === 'onBleed' ? 'absolute bg-white/80' : 'absolute bg-black/45'}
            style={{
              left: pctX(m.xMm),
              top: pctY(m.yMm),
              width: pctX(m.wMm),
              height: pctY(m.hMm),
              minWidth: '1px',
              minHeight: '1px',
            }}
          />
        ))}

        {/* The nine cards, abutting with no gutter, exactly as they print. */}
        <div
          className="absolute grid"
          style={{
            left: pctX(MARGIN.xMm),
            top: pctY(MARGIN.yMm),
            width: pctX(BLOCK_W_MM),
            height: pctY(BLOCK_H_MM),
            gridTemplateColumns: `repeat(${PROXY_COLS}, 1fr)`,
            gridTemplateRows: `repeat(${PROXY_ROWS}, 1fr)`,
          }}
        >
          {slots.map((card, i) =>
            card ? (
              <CardImage key={card.id} card={card} fill size="sm" hideFlip interactive={false} />
            ) : (
              <CardImageSkeleton key={`slot-${i}`} fill size="sm" />
            )
          )}
        </div>
      </div>

      {/* NO CAPTION. It read "One A4 sheet, at print size", which is the
          caption pattern this rewrite exists to remove: the eyebrow says
          Proxies, the heading says print, the lead says nine to a page at
          63 by 88 mm and the chip says A4, so a line under the picture naming
          the paper again is the fourth telling. "At print size" was also
          loose — the figure is A4's ratio at whatever width it is drawn, not
          210 mm across anybody's monitor — and a loose claim under a figure
          whose whole argument is that the millimetres are exact is the wrong
          sentence to keep. */}
    </figure>
  );
}

export function HomeProxies() {
  /* The pool `HomeShowcase` used to draw its marquee from, which left the page
     with that section. Twelve rows, nine used, no new query. */
  const cards = showcaseCards() as unknown as ProxyCard[] | null;

  return (
    <Section tint>
      <div className="grid items-start gap-9 sm:gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-16">
        <SectionHeading
          align="left"
          eyebrow="Proxies"
          title="Print proxies at the right size"
          lead={`Nine to a page at ${CARD_W_MM} by ${CARD_H_MM} mm, so a proxy sleeves up next to a real card.`}
        >
          <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:mt-6">
            Paste a list, or pull one from a deck, your wishlist or your shopping list. Pick which
            printing's art gets used and the choice is kept.
          </p>

          <div className="mt-7 flex flex-wrap gap-2 sm:mt-8">
            {SHEET_FACTS.map(f => (
              <span
                key={f}
                className="rounded-full bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground"
              >
                {f}
              </span>
            ))}
          </div>

          <Button asChild size="lg" className="mt-7 sm:mt-8">
            <Link to="/proxies">
              Start a proxy list
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>

          {/* WHAT PROXIES ARE FOR, ON THE MARKETING PAGE AND NOT ONLY IN THE
              TOOL. Wizards' Fan Content Policy requires fan content to be free,
              so a proxy sheet must never sit behind a payment and nothing here
              may suggest these are sellable or legal at an event.
​
              THE REASON DOES NOT BELONG IN THE SENTENCE. It read "For
              playtesting at your own table, and free, because Wizards' Fan
              Content Policy requires fan content to be free" — a clause that
              offers a word as its own justification, and cites a licence to a
              Commander player who came here to print a Sol Ring. The note
              beside the actual print button never explains itself and is the
              better sentence for it (`ProxyListPage.tsx:879`). The policy is
              why the line exists, which is what a comment is for.
​
              "Not real cards" went too. Nobody who has typed the word proxy
              needs telling. */}
          <p className="mt-6 max-w-lg text-sm leading-relaxed text-muted-foreground sm:mt-7">
            For playtesting at your own table. Free, never for sale, and never legal at an event.
          </p>
        </SectionHeading>

        <ProxySheetFigure cards={cards} />
      </div>
    </Section>
  );
}

export default HomeProxies;
