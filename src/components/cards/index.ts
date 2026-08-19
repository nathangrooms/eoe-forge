/**
 * Shared card-display primitives.
 *
 * Every surface that draws a Magic card should reach for these rather than
 * hand-rolling an `<img src={card.image_uris.small}>` — that is what made cards
 * look soft across the product in the first place.
 *
 * ```tsx
 * const [cardWidth, setCardWidth] = useCardSize('search');
 *
 * <CardSizeSlider storageKey="search" value={cardWidth} onValueChange={setCardWidth} />
 * <CardGrid width={cardWidth}>
 *   {cards.map(card => (
 *     <CardImage key={card.id} card={card} width={cardWidth} fill onClick={() => open(card)} />
 *   ))}
 * </CardGrid>
 * ```
 */

export {
  CardImage,
  CardImageSkeleton,
  CARD_IMAGE_SIZES,
  CARD_ASPECT,
  cardSizeForWidth,
  type CardImageProps,
  type CardImageSize,
} from './CardImage';

export {
  CardSizeSlider,
  useCardSize,
  BORDERLESS_SLIDER,
  CARD_WIDTH_MIN,
  CARD_WIDTH_MAX,
  CARD_WIDTH_DEFAULT,
  CARD_WIDTH_STEP,
  type CardSizeSliderProps,
} from './CardSizeSlider';

export { CardGrid, CardGridSkeleton, type CardGridProps } from './CardGrid';

/**
 * Opening a card.
 *
 * Outside play mode there is exactly one answer: `/cards/:id`. Reach for
 * `useOpenCard()` in a click handler, or `cardDetailPath()` when an href for a
 * real `<Link>` is wanted. Browsing surfaces must not dock a detail pane beside
 * the grid — the owner has rejected that three times.
 */
export { cardDetailPath, useOpenCard } from './card-link';

/**
 * Card detail bodies. `CardDetail` is the body with no container;
 * `CardDetailPane` wraps it for the deck-building surfaces that inspect a card
 * against the list being edited. Everywhere someone is *browsing*, a click on a
 * card goes to `/cards/:id` instead.
 */
export { CardDetail, CardDetailHeading, type CardDetailProps } from './CardDetail';

export {
  CardDetailPane,
  CardDetailSplit,
  type CardDetailPaneProps,
  type CardDetailSplitProps,
} from './CardDetailPane';

/**
 * Pieces of the routed card page (`/cards/:id`). Each owns one query, so they
 * stay separate rather than collapsing into one file, and several are reusable
 * anywhere a card is the subject: `OracleText` renders rules text with real
 * mana pips, `CardLegalityGrid` renders every format Scryfall reports.
 */
export { OracleText, type OracleTextProps } from './OracleText';
export { CardLegalityGrid, type CardLegalityGridProps } from './CardLegalityGrid';
export { CardPrintingsRow, type CardPrintingsRowProps } from './CardPrintingsRow';
/**
 * The one place a printing gets chosen. A collection row saying which copy is
 * in the box, a listing saying which copy is for sale, and the card page's
 * art-variants shelf are all this component.
 */
export {
  PrintingPicker,
  hasFinish,
  type PrintingPickerProps,
  type PrintingFinish,
} from './PrintingPicker';
export { CardPriceHistory, type CardPriceHistoryProps } from './CardPriceHistory';
export {
  CardWorksWellWith,
  CardSimilar,
  cardHref,
  type CardRelatedProps,
  type RelatedGroup,
} from './CardRelated';
export { CardAddToDeckPanel, type CardAddToDeckPanelProps } from './CardAddToDeckPanel';
