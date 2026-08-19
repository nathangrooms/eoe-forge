/**
 * The deck, written out for Tutor.
 *
 * The old function decided whether to include the decklist by testing the
 * user's message against a regular expression:
 *
 *   /(card list|specific cards|which cards|card analysis|cut these|
 *     replace these|show me the|what cards)/i
 *
 * "Which lands can I upgrade?" does not contain "which cards", so the list was
 * withheld and the answer said, correctly and humiliatingly, that it did not
 * know what was in the deck. The user then said "replace", and the pattern
 * wanted "replace these". Even when the guess came out right the list was cut
 * with `.substring(0, 1200)`, which is about thirty entries of a hundred-card
 * deck.
 *
 * A Commander deck is a hundred lines. There is no budget argument for guessing.
 * It is always sent, and `measure()` prints what it actually costs so the claim
 * stays checkable rather than assumed.
 */

export interface DeckCard {
  card_name?: string;
  name?: string;
  quantity?: number;
  is_commander?: boolean;
  is_sideboard?: boolean;
  card_data?: {
    type_line?: string;
    mana_cost?: string;
    oracle_text?: string;
    cmc?: number;
    produced_mana?: string[] | null;
    color_identity?: string[];
    prices?: Record<string, string | null>;
    edhrec_rank?: number | null;
  };
  /* The page sends a flatter shape than the RPC does. Both are accepted. */
  type_line?: string;
  mana_cost?: string;
  oracle_text?: string;
  cmc?: number;
  produced_mana?: string[] | null;
}

export interface NormalisedCard {
  name: string;
  quantity: number;
  isCommander: boolean;
  isSideboard: boolean;
  typeLine: string;
  manaCost: string;
  oracleText: string;
  cmc: number;
  producedMana: string[] | null;
  priceUSD: number | null;
  edhrecRank: number | null;
}

export function normaliseDeckCards(cards: DeckCard[] | undefined): NormalisedCard[] {
  if (!Array.isArray(cards)) return [];
  return cards.map(entry => {
    const d = entry.card_data ?? {};
    const usd = d.prices?.usd;
    return {
      name: entry.card_name ?? entry.name ?? '',
      quantity: entry.quantity ?? 1,
      isCommander: Boolean(entry.is_commander),
      isSideboard: Boolean(entry.is_sideboard),
      typeLine: d.type_line ?? entry.type_line ?? '',
      manaCost: d.mana_cost ?? entry.mana_cost ?? '',
      oracleText: d.oracle_text ?? entry.oracle_text ?? '',
      cmc: Number(d.cmc ?? entry.cmc ?? 0),
      producedMana: d.produced_mana ?? entry.produced_mana ?? null,
      priceUSD: usd ? Number(usd) : null,
      edhrecRank: d.edhrec_rank ?? null,
    };
  }).filter(c => c.name);
}

export const isLand = (c: NormalisedCard) => /\bland\b/i.test(c.typeLine);

/** Rough token count. Four characters per token is close enough to budget with. */
export const measure = (text: string) => ({
  chars: text.length,
  approxTokens: Math.ceil(text.length / 4),
});

/**
 * One line per card: name, cost, type, and for a land what it actually taps for.
 *
 * A land's colour is not on the card, it is in what the land produces, so a list
 * that prints only names cannot be used to answer a question about a mana base.
 */
function line(c: NormalisedCard): string {
  const qty = c.quantity > 1 ? `${c.quantity}x ` : '';
  const type = c.typeLine.split('—')[0].trim() || 'Unknown';

  if (isLand(c)) {
    const produces = c.producedMana;
    const taps =
      produces === null
        ? 'unknown what it taps for'
        : produces.length === 0
          ? 'taps for no mana itself'
          : `taps for ${produces.join('')}`;
    const tapped = /enters tapped|enters the battlefield tapped/i.test(c.oracleText)
      ? ', enters tapped'
      : '';
    return `${qty}${c.name} [${taps}${tapped}]`;
  }

  const cost = c.manaCost ? ` ${c.manaCost}` : '';
  return `${qty}${c.name}${cost} (${type}, ${c.cmc} MV)`;
}

/**
 * The whole list, grouped so a question about lands can be answered by reading
 * one block rather than by scanning a hundred undifferentiated names.
 */
export function renderDecklist(cards: NormalisedCard[]): string {
  const main = cards.filter(c => !c.isSideboard);
  const commanders = main.filter(c => c.isCommander);
  const lands = main.filter(c => !c.isCommander && isLand(c));
  const spells = main.filter(c => !c.isCommander && !isLand(c));

  const count = (list: NormalisedCard[]) => list.reduce((n, c) => n + c.quantity, 0);
  const block = (title: string, list: NormalisedCard[]) =>
    list.length ? `\n${title} (${count(list)}):\n${list.map(c => '  ' + line(c)).join('\n')}` : '';

  const spellsByType = new Map<string, NormalisedCard[]>();
  for (const c of spells) {
    const key = primaryType(c.typeLine);
    if (!spellsByType.has(key)) spellsByType.set(key, []);
    spellsByType.get(key)!.push(c);
  }

  const order = ['Creature', 'Artifact', 'Enchantment', 'Planeswalker', 'Instant', 'Sorcery', 'Battle', 'Other'];
  const spellBlocks = order
    .filter(t => spellsByType.has(t))
    .map(t => block(t.toUpperCase() + 'S', spellsByType.get(t)!))
    .join('');

  return [
    block('COMMANDER', commanders),
    block('LANDS', lands),
    spellBlocks,
  ].join('\n');
}

function primaryType(typeLine: string): string {
  const t = typeLine.toLowerCase();
  if (t.includes('creature')) return 'Creature';
  if (t.includes('planeswalker')) return 'Planeswalker';
  if (t.includes('instant')) return 'Instant';
  if (t.includes('sorcery')) return 'Sorcery';
  if (t.includes('artifact')) return 'Artifact';
  if (t.includes('enchantment')) return 'Enchantment';
  if (t.includes('battle')) return 'Battle';
  return 'Other';
}
