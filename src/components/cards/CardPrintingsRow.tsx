import { PrintingPicker } from './PrintingPicker';

/**
 * The card page's printings section.
 *
 * Owner, verbatim: *"other art variants should show straight away too not
 * hidden away"*. So this is not a tab and not a toggle. It sits directly under
 * the card, and clicking a printing swaps what the whole page is describing
 * (art, set, collector number, artist, prices, legality) without leaving.
 *
 * It used to be a horizontally scrolling strip of thumbnails fetched from
 * Scryfall. Both halves of that are now wrong. The strip cropped the last card
 * at the edge and hid everything past six behind a scroll gesture nobody makes,
 * on the one section of the page where the ART is the subject. And Scryfall was
 * the source only because our catalogue held roughly one printing per card and
 * this row would have had a single entry in it, which stopped being true on
 * 19 Aug 2026.
 *
 * Everything below is now `PrintingPicker`, the same shelf a collection row and
 * a listing use to say which printing they mean. The name stays because the
 * section it draws has not changed its job.
 */

export interface CardPrintingsRowProps {
  /** Every printing of a card shares one oracle id. */
  oracleId?: string;
  cardName: string;
  /** Id of the printing the page is currently showing. */
  activeId?: string;
  onSelect: (printing: any) => void;
  className?: string;
}

export function CardPrintingsRow({
  oracleId,
  cardName,
  activeId,
  onSelect,
  className,
}: CardPrintingsRowProps) {
  return (
    <PrintingPicker
      className={className}
      oracleId={oracleId}
      selectedId={activeId}
      onSelect={onSelect}
      heading="Printings and art variants"
      /* "Click" on a page most people open on a phone. Half the readers of this
         line are tapping. */
      note={`Every printing of ${cardName} we hold. Choose one to see it.`}
    />
  );
}

export default CardPrintingsRow;
