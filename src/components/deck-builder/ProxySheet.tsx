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
  bleedRect,
  chunkIntoPages,
  cropMarkSegments,
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
  /**
   * Bleed and crop marks. Nothing it draws lands on a card: it is a black band
   * around the block of nine, so a cut that misses by a hair keeps black rather
   * than showing white paper, plus a hairline tick at each end of every cut
   * line. Off prints the cards and nothing else.
   */
  cutGuides: boolean;
  /**
   * Fit the sheet to the container width. Off for the hidden measuring pass and
   * irrelevant in print, where the scale is stripped entirely.
   */
  fitToWidth?: boolean;
  /**
   * Show ONE sheet on screen instead of stacking every sheet.
   *
   * A 100-card deck is 12 sheets. Each one is scaled to the full width it is
   * given, so on a 1920 screen the preview was 12 pages of roughly 2,200 px
   * each and the page measured 28,398 px tall — a wall of white paper in a
   * charcoal app, and 26,000 px of scrolling to reach the bottom of a print
   * job you were only checking the layout of.
   *
   * The inactive sheets are hidden **for screen only**. Every page stays in the
   * DOM, so `isolateForPrint` still finds all twelve and the printed job is
   * unchanged — the invariant this file is built on, that the preview IS the
   * print DOM rather than a second drawing of it, survives.
   */
  previewPage?: number | null;
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

/**
 * Bleed and crop marks, positioned in millimetres from the corner of the paper.
 *
 * Every rectangle comes out of `proxy-geometry.ts`, which is the same array the
 * PDF export draws, so the printed sheet and the exported file cannot end up
 * with the marks in different places.
 *
 * Absolutely positioned rather than laid out, because `.proxy-page` is a grid
 * of nine fixed tracks and anything in flow would become a tenth cell. The
 * black band sits under the cards; the cards cover all of it except the 1.5 mm
 * that shows around the outside.
 */
function CutLayer({ paper }: { paper: PaperSize }) {
  const band = bleedRect(paper);
  const marks = cropMarkSegments(paper);
  const box = (r: { xMm: number; yMm: number; wMm: number; hMm: number }): CSSProperties => ({
    position: 'absolute',
    left: `${r.xMm}mm`,
    top: `${r.yMm}mm`,
    width: `${r.wMm}mm`,
    height: `${r.hMm}mm`,
  });

  return (
    <>
      <div className="proxy-bleed" style={box(band)} aria-hidden="true" />
      {marks.map((mark, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={mark.tone === 'onBleed' ? 'proxy-mark proxy-mark--on-bleed' : 'proxy-mark proxy-mark--on-paper'}
          style={box(mark)}
        />
      ))}
    </>
  );
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
  { slots, paper, cutGuides, fitToWidth = true, previewPage = null, className },
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
  /* One sheet on screen means one sheet of reserved height. Reserving all
     twelve is what made the page 28,398 px tall, and it would leave the same
     empty shaft below the visible sheet even with the others hidden. */
  const single = previewPage !== null && pages.length > 0;
  const shownPages = single ? 1 : pages.length;
  /* The scaler is taken out of flow by `transform`, so the wrapper has to
     reserve the scaled height itself or the page below it overlaps. */
  const reservedHeight =
    pages.length > 0 ? (shownPages * pageHeightPx + (shownPages - 1) * gapPx) * effectiveScale : 0;
  const activePage = single ? Math.min(Math.max(previewPage as number, 0), pages.length - 1) : -1;

  return (
    <div
      ref={outerRef}
      className={className}
      style={{ overflow: 'hidden' }}
    >
      <PageRule paper={paper} />
      <div
        ref={ref}
        className={`proxy-sheet${cutGuides ? ' proxy-sheet--guides' : ''}${single ? ' proxy-sheet--single' : ''}`}
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
            <div
              className={`proxy-page${single && pageIndex !== activePage ? ' proxy-page--off' : ''}`}
              key={pageIndex}
            >
              {cutGuides && <CutLayer paper={paper} />}
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
