/**
 * What a proposed swap does to the mana base.
 *
 * The optimiser suggests cutting a card and playing another. When the card
 * being cut taps for mana — or the one coming in does — every *other* card in
 * the deck gets easier or harder to cast, and that consequence was invisible:
 * the panel showed a reason string and nothing else. "Cut Steam Vents for
 * Lightning Bolt" and "cut Shock for Lightning Bolt" are very different
 * suggestions and used to look identical.
 *
 * The measurement deliberately holds the *card set* fixed and varies only the
 * mana profile. Scoring the whole deck before and after would mix two effects
 * together — the incoming card's own castability shifts the average as much as
 * the mana change does — and the number would no longer mean "the mana base got
 * worse". Here, every card that stays in the deck is scored against the old
 * sources and the new ones, so the delta is attributable to the swap alone.
 *
 * Nothing here estimates. Every figure is computed by `playability.ts` from the
 * real decklist; when the swap does not touch the mana base at all this returns
 * `null` and the UI renders nothing rather than a decorative 0%.
 */

import {
  buildManaProfile,
  cardPlayability,
  type CardPlayability,
  type ManaProfile,
  type PlayabilityCardInput,
} from '@/lib/deck/playability';

/** A card whose castability moved because the mana base moved. */
export interface AffectedCard {
  name: string;
  /** Castability before the swap, 0–100. */
  before: number;
  /** Castability after the swap, 0–100. */
  after: number;
  /** `after - before`. Negative means the swap made this card harder to cast. */
  delta: number;
}

export interface ManaImpact {
  /** Copy-weighted mean castability of the cards that stay, before the swap. */
  averageBefore: number;
  /** The same mean after it. */
  averageAfter: number;
  /** `averageAfter - averageBefore`, in percentage points. */
  averageDelta: number;
  /** Total mana sources before and after — lands, rocks and dorks together. */
  sourcesBefore: number;
  sourcesAfter: number;
  /** Per-colour source counts that actually changed, worst first. */
  colourChanges: Array<{ colour: string; before: number; after: number }>;
  /** The cards that moved most, largest absolute delta first. */
  worstHit: AffectedCard[];
  /** True if any card's castability fell below the threshold that was above it. */
  newlyHardToCast: number;
  /**
   * The mana base as it would be once the swap is applied.
   *
   * Exposed because the incoming card has to be scored against it. Quoting the
   * arrival's castability on the *current* base is wrong precisely when this
   * object is non-null: the row is saying "cutting this land makes the deck
   * harder to cast" and then, underneath, quoting the newcomer's odds on the
   * base that still contains the land being cut.
   */
  profileAfter: ManaProfile;
}

/** Under this, a card counts as hard to cast. Matches `DEFAULT_THRESHOLD`. */
const HARD_TO_CAST = 50;

/** Deltas smaller than this are rounding, not a consequence worth a badge. */
const MEANINGFUL_POINTS = 0.5;

const COLOUR_LABEL: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

/**
 * Do two profiles describe the same mana base?
 *
 * Compares what actually feeds castability — how many sources there are, when
 * they come online and which colours they make — rather than the card names, so
 * swapping one Island for another Island correctly reports no impact.
 */
function sameManaBase(a: ManaProfile, b: ManaProfile): boolean {
  if (a.sources.length !== b.sources.length) return false;
  if (a.landCount !== b.landCount) return false;
  if (a.rockCount !== b.rockCount) return false;
  if (a.dorkCount !== b.dorkCount) return false;
  if (a.librarySize !== b.librarySize) return false;
  for (const colour of Object.keys(a.sourcesByColour)) {
    if (a.sourcesByColour[colour as keyof typeof a.sourcesByColour] !==
        b.sourcesByColour[colour as keyof typeof b.sourcesByColour]) {
      return false;
    }
  }
  // Two bases can agree on every count and still differ in timing — trading a
  // Sol Ring for a Llanowar Elves keeps one rock-shaped hole but moves when it
  // is filled. Compare the online-turn histogram to catch that.
  const histogram = (p: ManaProfile) => {
    const counts = new Map<string, number>();
    for (const s of p.sources) {
      const key = `${s.onlineTurn}|${s.colourMask}|${s.amount}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  };
  const ha = histogram(a);
  const hb = histogram(b);
  if (ha.size !== hb.size) return false;
  for (const [key, count] of ha) {
    if (hb.get(key) !== count) return false;
  }
  return true;
}

function isLandLike(card: PlayabilityCardInput): boolean {
  return /\bLand\b/i.test((card.type_line ?? '').split('//')[0]);
}

/**
 * Measure one swap.
 *
 * `deck` is the current decklist (commander included, flagged `isCommander`).
 * `remove` and `add` are the two cards the swap names. Returns `null` when the
 * swap leaves the mana base untouched, or when the change is too small to be
 * worth a line of UI — in both cases the caller should render nothing.
 */
export function measureManaImpact(
  deck: readonly PlayabilityCardInput[],
  remove: PlayabilityCardInput | null,
  add: PlayabilityCardInput | null
): ManaImpact | null {
  if (!remove && !add) return null;

  // Build the deck as it would be after the swap. Only one copy leaves, which
  // matters for a deck running several basics of the same name.
  const after: PlayabilityCardInput[] = [];
  let removed = false;
  for (const card of deck) {
    if (!removed && remove && card.name.toLowerCase() === remove.name.toLowerCase()) {
      removed = true;
      const quantity = card.quantity ?? 1;
      if (quantity > 1) after.push({ ...card, quantity: quantity - 1 });
      continue;
    }
    after.push(card);
  }
  if (add) after.push({ ...add, quantity: 1 });

  const profileBefore = buildManaProfile(deck);
  const profileAfter = buildManaProfile(after);

  // The whole point of the gate: most swaps are spell-for-spell and have no
  // mana consequence at all. Those get no badge rather than a 0.0% one.
  if (sameManaBase(profileBefore, profileAfter)) return null;

  // Score only the cards present in *both* lists, so the delta is the mana
  // base's doing and not the arrival of a cheaper card.
  let weightedBefore = 0;
  let weightedAfter = 0;
  let weight = 0;
  let newlyHardToCast = 0;
  const moved: AffectedCard[] = [];

  const seenCost = new Map<string, { before: CardPlayability; after: CardPlayability }>();

  for (const card of deck) {
    if (card.isCommander) continue;
    if (isLandLike(card)) continue;
    if (remove && card.name.toLowerCase() === remove.name.toLowerCase()) continue;

    // Castability depends on the cost, not the name, so a deck full of
    // two-mana spells solves the DP once. Without this the panel would run a
    // hundred exact solves per swap.
    const key = card.mana_cost ?? '';
    let scored = seenCost.get(key);
    if (!scored) {
      scored = {
        before: cardPlayability(card, profileBefore),
        after: cardPlayability(card, profileAfter),
      };
      seenCost.set(key, scored);
    }

    if (scored.before.pct === null || scored.after.pct === null) continue;

    const quantity = card.quantity ?? 1;
    weightedBefore += scored.before.pct * quantity;
    weightedAfter += scored.after.pct * quantity;
    weight += quantity;

    if (scored.before.pct >= HARD_TO_CAST && scored.after.pct < HARD_TO_CAST) {
      newlyHardToCast += quantity;
    }

    const delta = scored.after.pct - scored.before.pct;
    if (Math.abs(delta) >= MEANINGFUL_POINTS) {
      moved.push({
        name: card.name,
        before: scored.before.pct,
        after: scored.after.pct,
        delta,
      });
    }
  }

  if (weight === 0) return null;

  const averageBefore = weightedBefore / weight;
  const averageAfter = weightedAfter / weight;
  const averageDelta = averageAfter - averageBefore;

  const colourChanges = (Object.keys(profileBefore.sourcesByColour) as Array<
    keyof typeof profileBefore.sourcesByColour
  >)
    .map(colour => ({
      colour: COLOUR_LABEL[colour] ?? colour,
      before: profileBefore.sourcesByColour[colour],
      after: profileAfter.sourcesByColour[colour],
    }))
    .filter(c => c.before !== c.after);

  // A land-count change with no measurable castability movement is still worth
  // reporting; a sub-rounding change with no colour movement is not.
  if (
    Math.abs(averageDelta) < MEANINGFUL_POINTS &&
    colourChanges.length === 0 &&
    profileBefore.sources.length === profileAfter.sources.length
  ) {
    return null;
  }

  moved.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    averageBefore,
    averageAfter,
    averageDelta,
    sourcesBefore: profileBefore.sources.length,
    sourcesAfter: profileAfter.sources.length,
    colourChanges,
    worstHit: moved.slice(0, 4),
    newlyHardToCast,
    profileAfter,
  };
}

/**
 * Castability of a single card against a decklist's existing mana base.
 *
 * Used for cards the optimiser wants to *add*: a five-drop with two blue pips
 * is a different proposition in a deck with nine blue sources than in one with
 * twenty-five, and that is knowable before you accept the suggestion.
 */
export function castabilityOnDeck(
  profile: ManaProfile | null,
  card: PlayabilityCardInput | null
): CardPlayability | null {
  if (!profile || !card) return null;
  const result = cardPlayability(card, profile);
  if (result.pct === null) return null;
  return result;
}
