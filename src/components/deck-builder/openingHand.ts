/**
 * What an opening hand IS, with no React in it.
 *
 * Split out of `QuickDeckTester.tsx` so the rules below can be tested. The
 * test runner is `node --test --experimental-strip-types`, which cannot parse
 * JSX, so anything living in a `.tsx` file is unreachable from a test. Both
 * faults this module records were shipped for a long time behind exactly that
 * gap: they are arithmetic, they were always checkable, and nothing could
 * reach them to check.
 *
 * `cardCategories` is imported by relative path on purpose. `@/` is a Vite
 * alias and node does not resolve it, and the whole point of this file is that
 * node can load it.
 */
import { categorizeCard } from '../../lib/deck/cardCategories.ts';

export interface DeckCard {
  id: string;
  name: string;
  cmc: number;
  type_line: string;
  mana_cost?: string;
  image_uris?: {
    small?: string;
    normal?: string;
    large?: string;
  };
}

export interface HandStats {
  avgCmc: number;
  lands: number;
  creatures: number;
  spells: number;
}

/**
 * A land is decided by the FRONT FACE, the same way every other deck surface
 * decides it.
 *
 * This used to be `type_line.toLowerCase().includes('land')` over the whole
 * line, and a modal double-faced card writes both faces into one string:
 * `Pinnacle Monk // Mystic Peak` is `Creature — Djinn Monk // Land`. So the
 * widget called it a land and `categorizeCard`, which splits on `//` first,
 * did not.
 *
 * That disagreement was on screen, in one screenshot, about one deck. The page
 * header read `Lands 0` and `Land ratio 0%` — right, the fixture deck is all
 * creatures — while the panel underneath read `Lands 1` for a hand drawn out
 * of that same library.
 *
 * It was not only a label. `handVerdict` decides keep-or-mulligan off this
 * count, so a hand of seven spells holding two MDFCs was told it had two lands
 * and was keepable, which is the opposite of the advice the page exists to
 * give.
 */
export function isLand(card: DeckCard): boolean {
  return categorizeCard(card.type_line) === 'lands';
}

/**
 * Fisher-Yates, because the old shuffle was not one.
 *
 * It was `[...deck].sort(() => Math.random() - 0.5)`. A comparator that answers
 * at random is not a valid comparator and the sort does not visit every pair,
 * so the result is nowhere near uniform. Measured over 200,000 seven-card draws
 * from a 60-card list, counting how often each card reached the opening hand
 * against the 7/60 it should:
 *
 *   card at the top of the list   2.148x
 *   card second in the list       1.344x
 *   card at the bottom            0.934x
 *   spread across the whole list  2.68x
 *
 * `fetchDeckCards` returns rows in a stable order, so that is not noise that
 * washes out over repeated draws: the same few cards keep turning up, and the
 * page whose only job is to show a representative opening hand was reliably
 * showing an unrepresentative one.
 *
 * The same measurement against this function reports a 1.04x spread, which is
 * sampling noise at that trial count.
 */
export function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The hand laid out the way a player fans one: lands first, then everything
 * else by mana value.
 *
 * This replaced an eight-row bar chart captioned "Mana Curve in Hand". A curve
 * drawn from seven cards is eight bars of which six read 1 and two read 0, and
 * it took more vertical space than the cards did. Sorting the hand puts the
 * same information into the cards themselves, where the mana cost is already
 * printed in the corner of every one of them, and costs no space at all.
 */
export function fanned(cards: DeckCard[]): DeckCard[] {
  return [...cards].sort((a, b) => {
    const la = isLand(a) ? 0 : 1;
    const lb = isLand(b) ? 0 : 1;
    if (la !== lb) return la - lb;
    if (a.cmc !== b.cmc) return a.cmc - b.cmc;
    return a.name.localeCompare(b.name);
  });
}

export function statsFor(cards: DeckCard[]): HandStats {
  const lands = cards.filter(isLand).length;
  const nonLands = cards.filter(c => !isLand(c));
  const creatures = nonLands.filter(c => c.type_line?.toLowerCase().includes('creature')).length;
  return {
    lands,
    creatures,
    spells: nonLands.length - creatures,
    avgCmc: nonLands.length > 0 ? nonLands.reduce((sum, c) => sum + c.cmc, 0) / nonLands.length : 0,
  };
}

export interface HandVerdict {
  verdict: string;
  tone: string;
  badge: 'secondary' | 'destructive';
  message: string;
}

/** The read on the seven. Monochrome except the one state that is a warning. */
export function handVerdict(stats: HandStats, kept: number): HandVerdict {
  const plain = { tone: 'bg-muted/40', badge: 'secondary' as const };
  const bad = { tone: 'bg-destructive/10', badge: 'destructive' as const };
  if (kept === 0) return { verdict: 'Empty', ...plain, message: 'Nothing kept.' };
  if (stats.lands < 2) {
    return { verdict: 'Poor', ...bad, message: 'Too few lands, so this is likely a mulligan.' };
  }
  if (stats.lands > 5) {
    return { verdict: 'Poor', ...bad, message: 'Too many lands, so this is worth a mulligan.' };
  }
  if (stats.lands === 2 && stats.avgCmc > 4) {
    return { verdict: 'Risky', ...plain, message: 'Two lands under a high curve.' };
  }
  if (stats.lands >= 3 && stats.lands <= 4) {
    return { verdict: 'Good', ...plain, message: 'A keepable hand.' };
  }
  return { verdict: 'Average', ...plain, message: 'Borderline, and it depends on the deck.' };
}

/** Stable identity for a card in a specific hand slot. */
export const handKey = (card: DeckCard, index: number) => `${card.id}-${index}`;
