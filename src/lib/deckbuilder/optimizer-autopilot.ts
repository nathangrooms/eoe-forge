/**
 * One button that applies the whole optimiser pass, and the arithmetic behind it.
 *
 * The owner's ask was "an auto optimise button that swaps both cards and lands,
 * no need to manually select". That is one control, but it is not one action:
 * an optimiser pass moves cards in five different ways, three of them bounded
 * by how many slots the deck actually has. Getting the bounds wrong is how a
 * button ends up handing somebody a 103 card Commander deck that will not save.
 *
 * So the counting lives here, in a pure function with no React and no network,
 * and the panel does nothing but carry it out. Everything the button says
 * before it runs comes from this file.
 *
 * THE ORDER, AND WHY
 * ------------------
 * 1. Land trades. Size neutral, and the mana base is what everything else has
 *    to be cast off. Lands first is the same rule the tab strip already follows
 *    when a deck is short of both: a spell you cannot cast is worth less than
 *    the land that casts it.
 * 2. Card trades. Also size neutral.
 * 3. Cuts. They free slots, so they run before anything that needs one.
 * 4. Lands into the empty slots.
 * 5. Spells into whatever is left.
 *
 * THE THREE BUDGETS
 * -----------------
 * Cuts are capped at how many cards the deck is OVER its limit. A deck sitting
 * at exactly 100 has a cut budget of zero, so the auto pass cuts nothing, even
 * though the Cut tab is full of suggestions. That is deliberate and it is the
 * single most important line in this file: the Cut tab is always populated now,
 * including for a legal sized deck, because a 100 card deck is exactly where
 * you want to know which card is weakest. Acting on that automatically would
 * leave the deck at 99 and unsaveable.
 *
 * Land additions are capped at the land slots the edge function counted, and
 * spell additions at what remains of the empty slots after the lands have taken
 * theirs. Both are also hard capped by the empty slots themselves, so a missing
 * or stale split can never overfill the deck.
 *
 * WHAT IT DOES NOT DECIDE
 * -----------------------
 * Whether a change succeeded. The panel measures that by reading the decklist
 * before and after, because an add can be refused by colour identity or a copy
 * limit and say nothing. A plan is an intention; the receipt is a measurement,
 * and they are built by different code on purpose.
 */

export type AutoPriority = 'high' | 'medium' | 'low';

export type AutoPhaseKind = 'landSwaps' | 'cardSwaps' | 'cuts' | 'landAdds' | 'spellAdds';

/**
 * One card movement the plan intends.
 *
 * `index` points back into the list this came from, so the panel can find the
 * original suggestion row and apply it with the handler that already exists.
 * Names alone would mean a second lookup by string, and a second lookup is how
 * the wrong row gets applied when two suggestions touch the same card.
 */
export interface AutoCandidate {
  index: number;
  /** The card leaving the deck. Null for an addition. */
  out: string | null;
  /** The card joining the deck. Null for a cut. */
  in: string | null;
  priority: AutoPriority;
  /** Only used to order the cut budget. Lands are cut last. */
  isLand?: boolean;
}

export interface AutoPhase {
  kind: AutoPhaseKind;
  /** What this step does, counted. */
  heading: string;
  /** Why it sits where it does in the order. One sentence, or empty. */
  because: string;
  items: AutoCandidate[];
}

export interface AutoPlan {
  phases: AutoPhase[];
  /** Cards joining the deck. */
  cardsIn: number;
  /** Cards leaving it. */
  cardsOut: number;
  /** Rows the plan touches. A trade is one row and counts once. */
  moves: number;
  sizeBefore: number;
  /** Where the deck lands if every move goes through. */
  sizeAfter: number;
  requiredSize: number;
  /** Empty slots the plan does not fill. */
  slotsLeft: number;
  /** Anything the plan deliberately leaves alone, said out loud. */
  heldBack: string[];
}

export interface AutoPlanInput {
  /** Land for land trades, in list order. */
  landSwaps: ReadonlyArray<{ out: string; in: string; priority: AutoPriority }>;
  /** Spell for spell trades, in list order. */
  cardSwaps: ReadonlyArray<{ out: string; in: string; priority: AutoPriority }>;
  /** Cards the pass would cut, spells and lands together. */
  cuts: ReadonlyArray<{ name: string; priority: AutoPriority; isLand: boolean }>;
  landAdds: ReadonlyArray<{ name: string; priority: AutoPriority }>;
  spellAdds: ReadonlyArray<{ name: string; priority: AutoPriority }>;
  /** The decklist as it stands, commander included. */
  sizeBefore: number;
  /** 100 for Commander, 60 otherwise. Decided by the panel, not here. */
  requiredSize: number;
  /**
   * How the empty slots split, as the edge function counted it. Null when
   * nothing counted it, and then the lands take from the empty slots directly
   * and the spells take what is left. Never guessed at a ratio.
   */
  landSlots: number | null;
  spellSlots: number | null;
  /** Whether the deck still needs basics after the recommended lands go in. */
  hasBasicFiller: boolean;
}

const PRIORITY_RANK: Record<AutoPriority, number> = { high: 0, medium: 1, low: 2 };

/** Plural without an "(s)". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The verb that agrees with a count. "1 land stays", "3 lands stay". */
function agrees(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * Highest priority first, stable inside a priority.
 *
 * Stable matters: the lists arrive in the order the ranker put them in, and a
 * sort that reshuffles equals throws that ordering away. Array.prototype.sort
 * has been required to be stable since ES2019.
 */
function byPriority<T extends { priority: AutoPriority }>(
  items: readonly T[]
): Array<T & { index: number }> {
  return items
    .map((item, index) => ({ ...item, index }))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.index - b.index);
}

/** Cuts, worst first, and a land only once the spells are exhausted. */
function cutOrder(
  cuts: AutoPlanInput['cuts']
): Array<{ name: string; priority: AutoPriority; isLand: boolean; index: number }> {
  return cuts
    .map((cut, index) => ({ ...cut, index }))
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        Number(a.isLand) - Number(b.isLand) ||
        a.index - b.index
    );
}

/**
 * The whole pass, counted.
 *
 * Pure. Given the same lists and the same deck size it returns the same plan,
 * which is what lets the preview the reader agrees to be the thing that runs.
 */
export function planAutoOptimise(input: AutoPlanInput): AutoPlan {
  const emptySlots = Math.max(0, input.requiredSize - input.sizeBefore);
  const excess = Math.max(0, input.sizeBefore - input.requiredSize);
  const heldBack: string[] = [];
  const phases: AutoPhase[] = [];

  /*
   * ONE MOVE PER CARD, AND WHY IT IS NOT PARANOIA.
   *
   * The edge function dedupes each section against itself and not against the
   * others: `seenCut`, `seenRepCut` and `seenLandCut` are three separate sets.
   * So the same card can honestly appear on the Cut tab AND as the outgoing
   * half of a swap, and it does. Applied one at a time by hand that is
   * harmless, because the second attempt finds nothing to remove. Applied as
   * one list it is not: the deck page looks the card up in a decklist captured
   * before the list started, finds it both times, and takes a copy out twice.
   * A 100 card deck ends at 99 and will not save.
   *
   * A chain is the same problem wearing a different hat. Trade A for B and then
   * B for C, and the second trade removes a card that was never there before
   * the first one put it there. One name leaves at most once, one name arrives
   * at most once, and a name doing one may not do the other. Earlier phases
   * win, which means lands win, which is the order the rest of the optimiser
   * already follows.
   */
  const leaving = new Set<string>();
  const arriving = new Set<string>();
  const key = (name: string) => name.toLowerCase();
  const conflicts = (out: string | null, into: string | null): boolean => {
    if (out && (leaving.has(key(out)) || arriving.has(key(out)))) return true;
    if (into && (arriving.has(key(into)) || leaving.has(key(into)))) return true;
    return false;
  };
  const claim = (out: string | null, into: string | null) => {
    if (out) leaving.add(key(out));
    if (into) arriving.add(key(into));
  };

  /**
   * Take from a pool until the budget is full, skipping anything that would
   * move a card twice. Returns what was taken and how many were skipped for
   * each of the two reasons, because they read differently on screen.
   */
  function take<T>(
    pool: readonly T[],
    budget: number,
    read: (item: T) => { out: string | null; in: string | null }
  ): { taken: T[]; overBudget: number; doubled: number } {
    const taken: T[] = [];
    let doubled = 0;
    let overBudget = 0;
    for (const item of pool) {
      const move = read(item);
      if (conflicts(move.out, move.in)) {
        doubled += 1;
        continue;
      }
      if (taken.length >= budget) {
        overBudget += 1;
        continue;
      }
      claim(move.out, move.in);
      taken.push(item);
    }
    return { taken, overBudget, doubled };
  }

  /** One sentence for cards an earlier step is already moving. */
  const doubledNote = (count: number, where: string): string =>
    `${plural(count, 'card')} on the ${where} ${
      count === 1 ? 'is' : 'are'
    } already being moved by an earlier step, so ${
      count === 1 ? 'it is' : 'they are'
    } left alone here. A card can only leave the deck once.`;

  /* 1. Land trades. -------------------------------------------------- */
  const landSwapTake = take(byPriority(input.landSwaps), input.landSwaps.length, s => ({
    out: s.out,
    in: s.in,
  }));
  const landSwaps: AutoCandidate[] = landSwapTake.taken.map(s => ({
    index: s.index,
    out: s.out,
    in: s.in,
    priority: s.priority,
    isLand: true,
  }));
  if (landSwapTake.doubled > 0) heldBack.push(doubledNote(landSwapTake.doubled, 'Lands tab'));
  if (landSwaps.length > 0) {
    phases.push({
      kind: 'landSwaps',
      heading: `Trade ${plural(landSwaps.length, 'land')}`,
      because:
        'The mana base goes first. Each of these is one land out and one land in, so the land count does not move.',
      items: landSwaps,
    });
  }

  /* 2. Card trades. -------------------------------------------------- */
  const cardSwapTake = take(byPriority(input.cardSwaps), input.cardSwaps.length, s => ({
    out: s.out,
    in: s.in,
  }));
  const cardSwaps: AutoCandidate[] = cardSwapTake.taken.map(s => ({
    index: s.index,
    out: s.out,
    in: s.in,
    priority: s.priority,
  }));
  if (cardSwapTake.doubled > 0) heldBack.push(doubledNote(cardSwapTake.doubled, 'Swaps tab'));
  if (cardSwaps.length > 0) {
    phases.push({
      kind: 'cardSwaps',
      heading: `Trade ${plural(cardSwaps.length, 'card')}`,
      because: 'One card out and one card in each time, so the deck stays the size it is.',
      items: cardSwaps,
    });
  }

  /* 3. Cuts, capped at how far over the limit the deck is. ----------- */
  const cutTake = take(cutOrder(input.cuts), excess, c => ({ out: c.name, in: null }));
  const cuts: AutoCandidate[] = cutTake.taken.map(c => ({
    index: c.index,
    out: c.name,
    in: null,
    priority: c.priority,
    isLand: c.isLand,
  }));
  if (cutTake.doubled > 0) heldBack.push(doubledNote(cutTake.doubled, 'Cut tab'));
  if (cuts.length > 0) {
    phases.push({
      kind: 'cuts',
      heading: `Cut ${plural(cuts.length, 'card')}`,
      because: `This deck is ${plural(excess, 'card')} over ${input.requiredSize}, so ${
        cuts.length === 1 ? 'one card has' : `${cuts.length} cards have`
      } to go. Cuts run before anything is added, so the slots are free when they are needed.`,
      items: cuts,
    });
  }
  if (cutTake.overBudget > 0) {
    const left = cutTake.overBudget;
    heldBack.push(
      // Three different situations, and the first two both have a cut budget
      // of zero. "Already at 100 cards" printed on a deck of 56 was the version
      // that got caught: a deck under its limit is not a deck at its limit, and
      // saying so is how a reader stops trusting the rest of the numbers.
      emptySlots > 0
        ? `Nothing is cut. This deck is ${plural(
            emptySlots,
            'card'
          )} short already, so a cut would only make the hole bigger. The Cut tab still lists ${plural(
            left,
            'card'
          )} you can trade out by hand.`
        : excess === 0
        ? `Nothing is cut. This deck is already at ${input.requiredSize} cards, and cutting one would leave it short. The Cut tab still lists ${plural(
            left,
            'card'
          )} you can trade out by hand.`
        : `${plural(left, 'further cut suggestion')} ${agrees(
            left,
            'stays',
            'stay'
          )} on the Cut tab. Only ${plural(excess, 'card')} can come out before the deck goes under ${
            input.requiredSize
          }.`
    );
  }

  /* 4. Lands into the empty slots. ----------------------------------- */
  let slotsLeft = emptySlots;
  const landRoom = Math.min(slotsLeft, input.landSlots ?? slotsLeft);
  const landTake = take(byPriority(input.landAdds), landRoom, a => ({ out: null, in: a.name }));
  const landAdds: AutoCandidate[] = landTake.taken.map(a => ({
    index: a.index,
    out: null,
    in: a.name,
    priority: a.priority,
    isLand: true,
  }));
  slotsLeft -= landAdds.length;
  if (landTake.doubled > 0) heldBack.push(doubledNote(landTake.doubled, 'Lands tab'));
  if (landAdds.length > 0) {
    phases.push({
      kind: 'landAdds',
      heading: `Add ${plural(landAdds.length, 'land')}`,
      because:
        input.landSlots !== null
          ? `${plural(input.landSlots, 'of the empty slot', 'of the empty slots')} ${
              input.landSlots === 1 ? 'is a land' : 'are lands'
            }, counted from what this deck's spells cost.`
          : 'These go into empty slots, so the deck grows by one card each time.',
      items: landAdds,
    });
  }
  if (landTake.overBudget > 0) {
    const left = landTake.overBudget;
    heldBack.push(
      landRoom === 0
        ? `${plural(left, 'recommended land')} ${agrees(
            left,
            'stays',
            'stay'
          )} on the Lands tab. This deck has no empty slot for one, so a better land has to come in as a trade.`
        : `${plural(left, 'recommended land')} ${agrees(
            left,
            'stays',
            'stay'
          )} on the Lands tab. Only ${plural(landRoom, 'land slot')} could take one.`
    );
  }

  /* 5. Spells into what is left. ------------------------------------- */
  const spellRoom = Math.min(slotsLeft, input.spellSlots ?? slotsLeft);
  const spellTake = take(byPriority(input.spellAdds), spellRoom, a => ({ out: null, in: a.name }));
  const spellAdds: AutoCandidate[] = spellTake.taken.map(a => ({
    index: a.index,
    out: null,
    in: a.name,
    priority: a.priority,
  }));
  slotsLeft -= spellAdds.length;
  if (spellTake.doubled > 0) heldBack.push(doubledNote(spellTake.doubled, 'Ideas tab'));
  if (spellAdds.length > 0) {
    phases.push({
      kind: 'spellAdds',
      heading: `Add ${plural(spellAdds.length, 'card')}`,
      because:
        landAdds.length > 0
          ? 'Whatever the mana base did not need, filled with the best cards for this deck.'
          : 'These go into the empty slots.',
      items: spellAdds,
    });
  }
  if (spellTake.overBudget > 0) {
    heldBack.push(
      spellRoom === 0
        ? `${plural(spellTake.overBudget, 'card idea')} ${agrees(
            spellTake.overBudget,
            'stays',
            'stay'
          )} on the Ideas tab. Every empty slot this deck has is spoken for.`
        : `${plural(spellTake.overBudget, 'card idea')} ${agrees(
            spellTake.overBudget,
            'stays',
            'stay'
          )} on the Ideas tab. Only ${plural(spellRoom, 'slot')} could take one.`
    );
  }

  const cardsIn = landSwaps.length + cardSwaps.length + landAdds.length + spellAdds.length;
  const cardsOut = landSwaps.length + cardSwaps.length + cuts.length;
  const moves = landSwaps.length + cardSwaps.length + cuts.length + landAdds.length + spellAdds.length;

  if (slotsLeft > 0) {
    heldBack.push(
      input.hasBasicFiller
        ? `${plural(slotsLeft, 'slot')} ${
            slotsLeft === 1 ? 'is' : 'are'
          } still empty after this. Basic lands are what goes in a slot nothing better wants, and the Lands tab counts them for you.`
        : `${plural(slotsLeft, 'slot')} ${slotsLeft === 1 ? 'is' : 'are'} still empty after this.`
    );
  }

  return {
    phases,
    cardsIn,
    cardsOut,
    moves,
    sizeBefore: input.sizeBefore,
    sizeAfter: input.sizeBefore + cardsIn - cardsOut,
    requiredSize: input.requiredSize,
    slotsLeft,
    heldBack,
  };
}

/**
 * The one line the button leads with.
 *
 * Every number in it comes off the plan, so the sentence and the list below it
 * cannot drift apart.
 */
export function planSummary(plan: AutoPlan): string {
  if (plan.moves === 0) return 'There is nothing to apply.';

  const parts: string[] = [];
  const trades =
    (plan.phases.find(p => p.kind === 'landSwaps')?.items.length ?? 0) +
    (plan.phases.find(p => p.kind === 'cardSwaps')?.items.length ?? 0);
  const cuts = plan.phases.find(p => p.kind === 'cuts')?.items.length ?? 0;
  const adds =
    (plan.phases.find(p => p.kind === 'landAdds')?.items.length ?? 0) +
    (plan.phases.find(p => p.kind === 'spellAdds')?.items.length ?? 0);

  if (trades > 0) parts.push(plural(trades, 'card traded', 'cards traded'));
  if (cuts > 0) parts.push(plural(cuts, 'card cut', 'cards cut'));
  if (adds > 0) parts.push(plural(adds, 'card added', 'cards added'));

  const size =
    plan.sizeAfter === plan.sizeBefore
      ? `Your deck stays at ${plan.sizeBefore} cards.`
      : `Your deck goes from ${plan.sizeBefore} to ${plan.sizeAfter} cards.`;

  return `${listSentence(parts)}. ${size}`;
}

/** "a, b and c". Oxford comma left off, which is how the rest of the app reads. */
export function listSentence(parts: readonly string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/* ------------------------------------------------------------------ *
 * What actually happened
 * ------------------------------------------------------------------ */

/** A decklist reduced to what a receipt needs: how many of each name. */
export type DeckTally = ReadonlyMap<string, number>;

export interface DeckChange {
  name: string;
  /** Copies gained. Negative means copies lost. */
  delta: number;
}

export interface DeckDiff {
  gained: DeckChange[];
  lost: DeckChange[];
  /** Copies added across every name. */
  added: number;
  /** Copies removed across every name. */
  removed: number;
  sizeBefore: number;
  sizeAfter: number;
}

/**
 * Count a decklist by name.
 *
 * Names are lower cased for the comparison and the original casing is kept for
 * display, because the store, Scryfall and the edge function do not agree on
 * capitalisation and a receipt that reports "Sol Ring out, sol ring in" is
 * worse than no receipt.
 */
export function tallyDeck(
  cards: ReadonlyArray<{ name: string; quantity?: number }>
): Map<string, number> {
  const tally = new Map<string, number>();
  for (const card of cards) {
    if (!card?.name) continue;
    const key = card.name.toLowerCase();
    tally.set(key, (tally.get(key) ?? 0) + (card.quantity ?? 1));
  }
  return tally;
}

/** Display names, keyed the same way `tallyDeck` keys its counts. */
export function displayNames(
  ...lists: ReadonlyArray<ReadonlyArray<{ name: string }>>
): Map<string, string> {
  const names = new Map<string, string>();
  for (const list of lists) {
    for (const card of list) {
      if (card?.name) names.set(card.name.toLowerCase(), card.name);
    }
  }
  return names;
}

/**
 * What changed between two readings of the same decklist.
 *
 * This is the receipt, and it is a measurement rather than a restatement of the
 * plan. An addition can be refused for colour identity or a copy limit without
 * telling the panel anything, and a removal can miss because the name in the
 * suggestion is not the name in the deck. Diffing the list catches both, and it
 * is also what undo runs against: undo puts back what moved, not what was meant
 * to move.
 */
export function diffDecks(before: DeckTally, after: DeckTally, names: Map<string, string>): DeckDiff {
  const keys = new Set<string>([...before.keys(), ...after.keys()]);
  const gained: DeckChange[] = [];
  const lost: DeckChange[] = [];
  let added = 0;
  let removed = 0;

  for (const key of keys) {
    const delta = (after.get(key) ?? 0) - (before.get(key) ?? 0);
    if (delta === 0) continue;
    const name = names.get(key) ?? key;
    if (delta > 0) {
      gained.push({ name, delta });
      added += delta;
    } else {
      lost.push({ name, delta });
      removed += -delta;
    }
  }

  const sortByName = (a: DeckChange, b: DeckChange) => a.name.localeCompare(b.name);
  gained.sort(sortByName);
  lost.sort(sortByName);

  const total = (tally: DeckTally) => {
    let n = 0;
    for (const count of tally.values()) n += count;
    return n;
  };

  return { gained, lost, added, removed, sizeBefore: total(before), sizeAfter: total(after) };
}

/**
 * The receipt in one line, from the diff.
 *
 * Deliberately says nothing about the plan. When a card the plan named is not
 * in the diff, `unplanned` below is what reports it, separately, so a shortfall
 * never hides inside a summary that reads like a success.
 */
export function diffSummary(diff: DeckDiff): string {
  if (diff.added === 0 && diff.removed === 0) return 'Nothing in the deck changed.';
  const parts: string[] = [];
  if (diff.removed > 0) parts.push(plural(diff.removed, 'card out', 'cards out'));
  if (diff.added > 0) parts.push(plural(diff.added, 'card in', 'cards in'));
  const size =
    diff.sizeAfter === diff.sizeBefore
      ? `The deck is still ${diff.sizeAfter} cards.`
      : `The deck went from ${diff.sizeBefore} to ${diff.sizeAfter} cards.`;
  return `${listSentence(parts)}. ${size}`;
}

/**
 * Cards the plan named that the decklist never moved.
 *
 * The honest half of the receipt. An add refused by the colour identity check
 * or a copy limit shows up here and nowhere else, and before this existed it
 * showed up nowhere at all: the toast said "Applied 12 replacements" whatever
 * the deck did.
 */
export function missedByPlan(plan: AutoPlan, diff: DeckDiff): string[] {
  const gained = new Set(diff.gained.map(c => c.name.toLowerCase()));
  const lost = new Set(diff.lost.map(c => c.name.toLowerCase()));
  const missed: string[] = [];

  for (const phase of plan.phases) {
    for (const item of phase.items) {
      if (item.in && !gained.has(item.in.toLowerCase())) missed.push(item.in);
      if (item.out && !lost.has(item.out.toLowerCase())) missed.push(item.out);
    }
  }
  return [...new Set(missed)];
}
