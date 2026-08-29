import { Loader2, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CardImage, CARD_ASPECT } from '@/components/cards';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { useCardLookup } from '@/features/dashboard/cardLookup';

/**
 * The simulate landing.
 *
 * It used to be a 672px form stranded in the middle of 1136px of usable width —
 * two text `<select>`s, a button, and not one card image on a page whose entire
 * subject is two Magic decks fighting. Both decks now show up as what they are:
 * the commander at readable size, uncropped, with the deck's real colour
 * identity, format and card count read from the database underneath.
 *
 * Everything here is measured, not asserted. The card count is the sum of
 * `deck_cards.quantity`; the colour identity is the deck's recorded identity
 * falling back to its commander's; the "what the engine covers" list describes
 * the step simulator that actually runs.
 */

export interface SimDeckOption {
  id: string;
  name: string;
  format: string;
  cardCount: number;
  colors: string[];
  commanderName: string | null;
  commanderCardId: string | null;
  /** The card that stands in for a deck with no commander. */
  faceCardId: string | null;
}

interface SimulationSetupProps {
  decks: SimDeckOption[];
  deck1Id: string;
  deck2Id: string;
  onDeck1Change: (id: string) => void;
  onDeck2Change: (id: string) => void;
  onStart: () => void;
  starting: boolean;
}

const ENGINE_COVERS = [
  'Lands, creatures, spells and a combat step',
  'Power and toughness tracked as the board changes',
  'Battlefield, hand, graveyard, exile and command zones',
  'A game log recording every action',
  'Playback speeds from 0.25x to 4x',
];

function DeckSeat({
  label,
  deck,
  decks,
  value,
  onChange,
  card,
  eager,
}: {
  label: string;
  deck: SimDeckOption | undefined;
  decks: SimDeckOption[];
  value: string;
  onChange: (id: string) => void;
  card: { color_identity?: string[] | null } | null;
  eager: boolean;
}) {
  const selectId = `sim-${label.toLowerCase().replace(/\s+/g, '-')}`;
  /* `user_decks.colors` is empty on plenty of real rows, which rendered a
     four-colour Atraxa deck as a colourless pip. The face card's own identity is
     the authority whenever the deck has not recorded one. */
  const colors = deck?.colors?.length ? deck.colors : (card?.color_identity ?? []);

  return (
    <div className="flex flex-col gap-3">
      <label
        htmlFor={selectId}
        className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </label>

      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={selectId}>
          <SelectValue placeholder="Choose a deck" />
        </SelectTrigger>
        <SelectContent>
          {decks.map(option => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* The deck, as a card. Bigger box, full art, nothing cropped. */}
      <div className="mx-auto w-full max-w-[340px]">
        {card ? (
          <CardImage card={card} fill hideFlip eager={eager} />
        ) : (
          <div
            className="flex w-full items-center justify-center rounded-xl bg-muted/40"
            style={{ aspectRatio: CARD_ASPECT }}
          >
            {colors.length > 0 ? (
              <ColorIdentity colors={colors} size="lg" className="scale-150" />
            ) : (
              <span className="px-4 text-center text-sm text-muted-foreground">
                {deck ? 'No card art for this deck yet' : 'No deck selected'}
              </span>
            )}
          </div>
        )}
      </div>

      {deck && (
        <div className="text-center">
          <p className="truncate text-sm font-medium text-foreground">{deck.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {deck.commanderName ?? 'No commander'}
          </p>
          <div className="mt-2 flex items-center justify-center gap-2">
            <ColorIdentity colors={colors} size="xs" />
            <span className="text-[11px] text-muted-foreground">
              <span className="capitalize">{deck.format}</span>
              {deck.cardCount > 0 && <> &middot; {deck.cardCount} cards</>}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function SimulationSetup({
  decks,
  deck1Id,
  deck2Id,
  onDeck1Change,
  onDeck2Change,
  onStart,
  starting,
}: SimulationSetupProps) {
  const lookup = useCardLookup(
    decks.map(deck => deck.commanderCardId ?? deck.faceCardId),
    decks.map(deck => deck.commanderName)
  );

  const deck1 = decks.find(deck => deck.id === deck1Id);
  const deck2 = decks.find(deck => deck.id === deck2Id);

  const resolve = (deck: SimDeckOption | undefined) =>
    deck ? lookup.resolve(deck.commanderCardId ?? deck.faceCardId, deck.commanderName) : null;

  const sameDeck = Boolean(deck1Id) && deck1Id === deck2Id;
  const ready = Boolean(deck1Id) && Boolean(deck2Id) && !sameDeck;

  if (decks.length < 2) {
    return (
      <div className="rounded-xl bg-card p-8 text-center shadow-lg shadow-black/20">
        <Swords className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <p className="mt-4 text-sm font-medium text-foreground">
          A simulation needs two decks
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          You have {decks.length === 0 ? 'no decks' : 'one deck'} so far. Build another and it
          will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Full width. The seats sit at the edges with VERSUS between them, so the
          page uses all 1136px instead of a centred 672px column. */}
      <div className="rounded-xl bg-card p-4 shadow-lg shadow-black/20 md:p-6">
        <div className="grid items-start gap-6 md:grid-cols-[1fr_auto_1fr]">
          <DeckSeat
            label="Deck 1"
            deck={deck1}
            decks={decks}
            value={deck1Id}
            onChange={onDeck1Change}
            card={resolve(deck1)}
            eager
          />

          {/* No rule between the seats: a 1px divider is a hairline by another
              name. Space and the word do the separating. */}
          <div className="flex items-center justify-center py-2 md:h-full md:px-2">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              vs
            </span>
          </div>

          <DeckSeat
            label="Deck 2"
            deck={deck2}
            decks={decks}
            value={deck2Id}
            onChange={onDeck2Change}
            card={resolve(deck2)}
            eager
          />
        </div>

        <div className="mt-6 space-y-2">
          <Button onClick={onStart} disabled={!ready || starting} className="w-full" size="lg">
            {starting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading decks…
              </>
            ) : (
              <>
                <Swords className="mr-2 h-4 w-4" />
                {deck1 && deck2 && !sameDeck
                  ? `Play ${deck1.name} against ${deck2.name}`
                  : 'Start simulation'}
              </>
            )}
          </Button>
          {sameDeck && (
            <p className="text-center text-xs text-muted-foreground">
              Pick two different decks. A deck cannot play itself.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-muted/30 p-4 text-sm">
          <div className="font-semibold text-foreground">What the engine covers</div>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {ENGINE_COVERS.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl bg-muted/30 p-4 text-sm">
          <div className="font-semibold text-foreground">What it does not</div>
          <p className="mt-2 text-muted-foreground">
            Rules coverage is partial. This is an early engine, not an implementation of the
            comprehensive rules: the stack, priority, replacement effects and most static
            abilities are approximated or absent. Treat a result as a rough sketch of how two
            lists interact, not as a verdict.
          </p>
        </div>
      </div>
    </div>
  );
}
