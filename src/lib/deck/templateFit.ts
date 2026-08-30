/**
 * Which blueprint fits a deck you already have.
 *
 * WHY THIS IS ARITHMETIC AND NOT A QUESTION FOR TUTOR
 * ---------------------------------------------------
 * The Templates page carries a panel whose promise is "Reads the decks you
 * already have and suggests blueprints that fit them". It kept that promise by
 * sending Tutor a prompt asking for "5-7 specific deck template
 * recommendations", "why each fits their playstyle", "power level range" and
 * "learning curve" — open-ended advice Tutor is deliberately built to refuse.
 * Measured on 2026-08-30, pressing the button produced exactly that refusal:
 * "I cannot answer that one, and I would rather say so than guess."
 *
 * It was never a question. A template declares the formats it is for and the
 * colours it needs; a deck declares its format and its colour identity. Whether
 * one fits inside the other is a comparison, and a comparison cannot be wrong
 * about a card it has not read.
 *
 * WHAT COUNTS AS A FIT
 * --------------------
 *   FORMAT    the template has to list the deck's format, or it is not offered
 *             for that deck at all. This is a gate, not a score: a Standard
 *             blueprint is not a weak suggestion for a Commander deck, it is
 *             the wrong answer.
 *   COLOURS   the template's colours have to sit INSIDE the deck's identity.
 *             A Commander deck cannot play a card outside its identity, so a
 *             blueprint asking for red is not buildable in a white-blue deck at
 *             any strength. A colourless template fits everything.
 *
 * Among what is buildable, a tighter colour match ranks higher: a mono-red
 * blueprint is a better description of a mono-red deck than of a five-colour
 * one, where it would use a fifth of the cards available.
 *
 * NOTHING IS INVENTED. Every reason a suggestion carries is one of those two
 * facts said in words. There is no power level, no playstyle and no learning
 * curve, because the data holds none of those and the panel that claimed them
 * was making them up.
 */

export interface FitDeck {
  name: string;
  format: string;
  colors: string[];
}

export interface FitTemplate {
  id: string;
  name: string;
  formats: string[];
  colors?: string[];
}

export interface TemplateFit {
  templateId: string;
  templateName: string;
  /** The deck this blueprint was matched against. */
  deckName: string;
  /** Higher is a tighter fit. Only meaningful for ordering. */
  score: number;
  /** Plain words, built from the two facts above and nothing else. */
  because: string;
  /**
   * The same fact WITHOUT the deck name.
   *
   * When every suggestion on screen matches the same deck, repeating a
   * sixty-character deck title in each one says nothing three times. The
   * panel names the deck once and uses this. `because` is the standalone
   * sentence for the case where they differ.
   */
  detail: string;
}

const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const;

const normaliseColors = (colors: readonly string[] | undefined): string[] =>
  WUBRG.filter(c => (colors ?? []).some(x => String(x).toUpperCase() === c));

const listColors = (colors: string[]): string =>
  colors.length === 0 ? 'colourless' : colors.join('');

/**
 * Every template that is buildable in this deck, best fit first.
 *
 * Exported separately from {@link suggestTemplates} so the per-deck reasoning
 * can be tested without the ranking across decks on top of it.
 */
export function fitsForDeck(deck: FitDeck, templates: readonly FitTemplate[]): TemplateFit[] {
  const deckFormat = String(deck.format ?? '').toLowerCase();
  const deckColors = normaliseColors(deck.colors);

  const out: TemplateFit[] = [];
  for (const template of templates) {
    const formats = (template.formats ?? []).map(f => String(f).toLowerCase());
    if (!formats.includes(deckFormat)) continue;

    const needs = normaliseColors(template.colors);
    const outside = needs.filter(c => !deckColors.includes(c));
    if (outside.length > 0) continue;

    /*
     * A tighter colour match first. `spare` is how many colours the deck has
     * that the blueprint does not ask for: zero means the blueprint is exactly
     * this deck's colours, and five means it describes a fifth of what the deck
     * could play. Colourless templates sit behind coloured ones that fit
     * equally, because naming a colour is a stronger claim than naming none.
     */
    const spare = deckColors.length - needs.length;
    const score = 100 - spare * 10 - (needs.length === 0 ? 5 : 0);

    /* Both written out rather than one derived from the other by string
       surgery. The first draft built `because` by replacing " your " inside
       `detail`, which was a no-op for the colourless sentence and would have
       silently produced the wrong words the moment either was reworded. */
    const detail =
      needs.length === 0
        ? `Colourless, so it builds in any ${deckFormat} deck.`
        : spare === 0
          ? `Exactly your ${listColors(needs)} colours, and ${deckFormat}.`
          : `Uses ${listColors(needs)} of your ${listColors(deckColors)}, and ${deckFormat}.`;

    const because =
      needs.length === 0
        ? `Colourless, so it builds in ${deck.name}. Exactly ${deckFormat}.`
        : spare === 0
          ? `Exactly ${deck.name}'s ${listColors(needs)} colours, and ${deckFormat}.`
          : `Uses ${listColors(needs)} of ${deck.name}'s ${listColors(deckColors)}, and ${deckFormat}.`;

    out.push({
      templateId: template.id,
      templateName: template.name,
      deckName: deck.name,
      score,
      because,
      detail,
    });
  }

  return out.sort((a, b) => b.score - a.score || a.templateName.localeCompare(b.templateName));
}

/**
 * The best blueprints across every deck the player has.
 *
 * One suggestion per TEMPLATE, keeping the deck it fits best, because offering
 * the same blueprint five times for five decks is a list of one idea. Ordered
 * by fit, then by name so the order is stable between renders.
 */
export function suggestTemplates(
  decks: readonly FitDeck[],
  templates: readonly FitTemplate[],
  limit = 6
): TemplateFit[] {
  const best = new Map<string, TemplateFit>();

  for (const deck of decks) {
    for (const fit of fitsForDeck(deck, templates)) {
      const seen = best.get(fit.templateId);
      if (!seen || fit.score > seen.score) best.set(fit.templateId, fit);
    }
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.templateName.localeCompare(b.templateName))
    .slice(0, limit);
}
