import { forwardRef, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  getLoyalty,
  getManaCost,
  getOracleText,
  getPowerToughness,
  getSetCode,
  getTypeLine,
} from '@/lib/scryfall/card-utils';
import {
  CARD_H_MM,
  CARD_W_MM,
  MM_TO_PX,
  PAPER,
  PROXY_PER_PAGE,
  chunkIntoPages,
  type PaperSize,
  type ProxySlot,
} from './proxy-print';
import './proxy-sheet.css';

/**
 * The physical sheet — the same DOM the printer gets and the preview shows.
 *
 * ## Why this hand-rolls an `<img>` instead of using `CardImage`
 *
 * `CardImage` is the right answer everywhere a card is *displayed*, and it is
 * still what the selection list below uses. It cannot be the answer here,
 * because it is built for screen and two of its guarantees are wrong on paper:
 *
 * - it pins the box to `aspect-ratio: 488/680` (0.71765) as an inline style, and
 *   a real card is 63 x 88 mm (0.71591). Inside a 63 mm-wide slot that yields
 *   87.8 mm, so every row would sit 0.2 mm short and the cut lines would walk.
 * - it draws with `object-cover`, which crops the 0.3% ratio difference off the
 *   art. Cropping is precisely what this change exists to stop, and the `<img>`
 *   class is not exposed for a caller to override.
 *
 * It also brings a blur-up under-layer (a second request per card — 200 requests
 * for a 100-card deck), hover lifts, shadows and a corner clip, none of which
 * mean anything on paper.
 *
 * What actually mattered about the `CardImage` rule is that resolution and
 * double-faced lookup go through one place, and they still do: every URL here
 * comes from `getBestCardImage` in `card-utils`, the same function `CardImage`
 * calls, resolved in `buildProxySlots`.
 */

export interface ProxySheetProps {
  slots: ProxySlot[];
  paper: PaperSize;
  cutGuides: boolean;
  /**
   * Fit the sheet to the container width. Off for the hidden measuring pass and
   * irrelevant in print, where the scale is stripped entirely.
   */
  fitToWidth?: boolean;
  className?: string;
}

/**
 * `@page` cannot be selected by class and its `size` will not read a custom
 * property, so the rule is emitted as markup keyed to the chosen paper. Margin
 * is 0 because the sheet centres its own 189 x 264 mm block — letting the UA
 * add a margin *and* centring would double-count and shrink the cards.
 */
function PageRule({ paper }: { paper: PaperSize }) {
  const { wMm, hMm } = PAPER[paper];
  return <style>{`@media print { @page { size: ${wMm}mm ${hMm}mm; margin: 0; } }`}</style>;
}

/** Legible, obviously-not-real stand-in for a printing with no image at all. */
function TextProxy({ card }: { card: any }) {
  const pt = getPowerToughness(card);
  const loyalty = getLoyalty(card);
  const oracle = getOracleText(card);
  const set = getSetCode(card).toUpperCase();

  return (
    <div className="proxy-text">
      <div className="proxy-text__head">
        <span className="proxy-text__name">{card?.name ?? 'Unknown card'}</span>
        <span className="proxy-text__cost">{getManaCost(card)}</span>
      </div>
      <div className="proxy-text__type">{getTypeLine(card) || 'Unknown type'}</div>
      <div className="proxy-text__oracle">{oracle}</div>
      <div className="proxy-text__foot">
        {/* Says what it is. A blank or broken image would leave the player
            guessing whether the proxy printed wrong or the card has no art. */}
        <span className="proxy-text__marker">Text proxy · no art{set ? ` · ${set}` : ''}</span>
        {pt ? (
          <span className="proxy-text__pt">
            {pt.power}/{pt.toughness}
          </span>
        ) : loyalty ? (
          <span className="proxy-text__pt">{loyalty}</span>
        ) : null}
      </div>
    </div>
  );
}

export const ProxySheet = forwardRef<HTMLDivElement, ProxySheetProps>(function ProxySheet(
  { slots, paper, cutGuides, fitToWidth = true, className },
  ref
) {
  const pages = useMemo(() => chunkIntoPages(slots), [slots]);
  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const { wMm, hMm } = PAPER[paper];
  const pageWidthPx = wMm * MM_TO_PX;
  const pageHeightPx = hMm * MM_TO_PX;
  const gapPx = 8 * MM_TO_PX;

  /**
   * The preview is the sheet at reduced size, not a re-layout, so the only
   * thing that changes between screen and paper is this number. Measured with a
   * ResizeObserver rather than a media query because the tab's width depends on
   * the deck-builder's own panels, not on the viewport.
   */
  useEffect(() => {
    if (!fitToWidth) return;
    const el = outerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / pageWidthPx);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitToWidth, pageWidthPx]);

  const effectiveScale = fitToWidth ? scale : 1;
  /* The scaler is taken out of flow by `transform`, so the wrapper has to
     reserve the scaled height itself or the page below it overlaps. */
  const reservedHeight =
    pages.length > 0 ? (pages.length * pageHeightPx + (pages.length - 1) * gapPx) * effectiveScale : 0;

  return (
    <div
      ref={outerRef}
      className={className}
      style={{ overflow: 'hidden' }}
    >
      <PageRule paper={paper} />
      <div
        ref={ref}
        className={`proxy-sheet${cutGuides ? ' proxy-sheet--guides' : ''}`}
        style={
          {
            '--proxy-card-w': `${CARD_W_MM}mm`,
            '--proxy-card-h': `${CARD_H_MM}mm`,
            '--proxy-page-w': `${wMm}mm`,
            '--proxy-page-h': `${hMm}mm`,
            '--proxy-preview-scale': effectiveScale,
            height: reservedHeight ? `${reservedHeight}px` : undefined,
          } as CSSProperties
        }
      >
        <div className="proxy-sheet__scaler">
          {pages.map((page, pageIndex) => (
            <div className="proxy-page" key={pageIndex}>
              {page.map(slot => (
                <div className="proxy-slot" key={slot.key}>
                  {slot.imageUrl ? (
                    <img
                      className="proxy-slot__img"
                      src={slot.imageUrl}
                      alt={
                        slot.faceLabel
                          ? `${slot.card?.name ?? 'Card'} (${slot.faceLabel.toLowerCase()})`
                          : (slot.card?.name ?? 'Card')
                      }
                      /*
                       * Eager, never lazy. An off-screen lazy image is not
                       * guaranteed to have decoded when the print job is
                       * rasterised, and a 12-page sheet is almost entirely
                       * off-screen — the failure mode is blank cards on paper,
                       * discovered after the ink is spent. `DeckProxyGenerator`
                       * additionally waits on `decode()` before opening the
                       * print dialog.
                       */
                      loading="eager"
                      decoding="sync"
                      draggable={false}
                    />
                  ) : (
                    <TextProxy card={slot.card} />
                  )}
                  {(slot.faceLabel || slot.isCommander) && (
                    <span className="proxy-slot__tag">
                      {slot.isCommander ? 'Commander' : slot.faceLabel}
                    </span>
                  )}
                </div>
              ))}
              {/* Trailing empties keep the final page a full 3x3 grid, so a
                  short last page still puts its cards in the same positions as
                  every other sheet rather than centring the remainder. */}
              {page.length < PROXY_PER_PAGE &&
                Array.from({ length: PROXY_PER_PAGE - page.length }).map((_, i) => (
                  <div className="proxy-slot proxy-slot--empty" key={`empty-${i}`} aria-hidden="true" />
                ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
