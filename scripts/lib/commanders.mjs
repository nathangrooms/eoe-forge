/**
 * What counts as a commander, and where its rules text actually lives.
 *
 * Three measurement scripts had their own copy of both answers and both copies
 * were wrong, in the same two ways. One place now, because a coverage
 * percentage is only worth reading if its denominator is right.
 *
 * BUG ONE, THE DENOMINATOR. `canLead` accepted any row with "creature" on some
 * face, with no legendary requirement. Measured 2026-08-30: 132 of the 207
 * cards reported as "vanilla commanders with no rules text" are not legendary
 * on either face. Reckless Waif, Flaxen Intruder, Curse of Leeches, Harvest
 * Hand. None of them can be anybody's commander and all of them were counted
 * against us, so 3,781 was not the number of commanders and 84.5% was not the
 * coverage rate.
 *
 * BUG TWO, THE TEXT. `oracle_text` is NULL for every transform, modal DFC,
 * split, adventure and prepare layout, because Scryfall puts the words in
 * `card_faces[]`. CLAUDE.md's own oracle_text section records this, and the
 * scripts read the column straight anyway, so every double-faced legend
 * reached the reader as a card that says nothing. Measured: 186 of 586 silent
 * commanders, 31.7% of ALL silence, was this one field.
 *
 * The same hole was in production, in the generator, the optimiser and Tutor.
 * `planForCommander` now takes `faces` and reads them itself.
 */

/**
 * Can this card lead a Commander deck?
 *
 * Legendary AND a creature, on the same face; or a card whose text says it can
 * be your commander, which is how Backgrounds' partners and the commander
 * planeswalkers qualify.
 *
 * Checking both on the SAME face matters. A transform card can be a
 * "Legendary Creature" on the front and a "Land" on the back, and testing the
 * whole type line for each word separately would also pass a card that is
 * legendary on one face and a creature on the other.
 */
export function canLeadADeck(row) {
  const faces = Array.isArray(row?.faces) ? row.faces : [];
  const lines = [row?.type_line ?? '', ...faces.map(f => f?.type_line ?? '')];

  const legendaryCreature = lines.some(line => {
    /* A double-faced card's top-level type_line is "A // B". Split it, so
       "Legendary Creature // Land" is judged on the front rather than on the
       concatenation. */
    return String(line)
      .split('//')
      .some(side => /legendary/i.test(side) && /creature/i.test(side));
  });
  if (legendaryCreature) return true;

  const text = [row?.oracle_text ?? '', ...faces.map(f => f?.oracle_text ?? '')].join(' ');
  return /can be your commander/i.test(text);
}

/** Commander-legal, and able to lead. Banned legends are not commanders. */
export function isCommander(row) {
  if (!canLeadADeck(row)) return false;
  const legality = row?.legalities?.commander;
  /* Missing legality is treated as legal: the column is populated for every
     row we hold, so an absent value means the caller did not select it, and
     silently dropping every card would be worse than counting a banned one. */
  return legality === undefined || legality === null || legality === 'legal';
}

/**
 * The card's rules text, from wherever Scryfall put it.
 *
 * Top level when present, otherwise the faces joined. Never the two
 * concatenated: a card has either a top-level text or faces, and joining both
 * would double every split card's words.
 */
export function rulesTextOf(row) {
  const top = String(row?.oracle_text ?? '').trim();
  if (top) return top;
  const faces = Array.isArray(row?.faces) ? row.faces : [];
  return faces
    .map(f => String(f?.oracle_text ?? '').trim())
    .filter(Boolean)
    .join(String.fromCharCode(10));
}

/** True when the card genuinely prints no rules text on any face. */
export function isVanilla(row) {
  return rulesTextOf(row).length === 0;
}
