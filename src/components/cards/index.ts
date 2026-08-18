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
 * Card detail. `CardDetail` is the body with no container; `CardDetailPane`
 * docks it beside a list; `CardDetailSplit` is the list-plus-pane layout. The
 * routed view lives at `/cards/:id`. None of these is an overlay.
 */
export { CardDetail, CardDetailHeading, type CardDetailProps } from './CardDetail';

export {
  CardDetailPane,
  CardDetailSplit,
  cardDetailPath,
  type CardDetailPaneProps,
  type CardDetailSplitProps,
} from './CardDetailPane';
