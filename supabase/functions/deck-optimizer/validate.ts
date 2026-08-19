/**
 * The gate on every card the response names in a card-bearing FIELD.
 *
 * The prompt is grounded — the model is handed a pool of real, legal,
 * in-identity cards and told to choose from it — but a prompt is a request,
 * not a guarantee. Grounding reduces how often the model invents a card;
 * this file is what makes inventing one harmless. Every name in a card-bearing
 * field is resolved before it ships, and anything that fails is dropped with a
 * recorded reason.
 *
 * WHAT THIS DOES NOT COVER. Stated because the previous wording here was "the
 * gate; nothing reaches the user without passing through here", and that is
 * not true:
 *
 *   - `summary`, `strengths`, `strategy` and `manabase` are free prose written
 *     by the model and shipped verbatim. The prompt tells it to name no cards
 *     there, but nothing enforces it, so a card named in a sentence is
 *     unverified. It carries no `cardId`, so it cannot be clicked or added —
 *     the exposure is a sentence rather than an action — but it is an exposure,
 *     and `validation.dropRate` does not measure it.
 *   - `currentPowerLevel` and `projectedPowerLevel` are the model's opinion,
 *     passed through unclamped. Both are pre-existing fields.
 *
 * Two card-bearing fields are checked against the DECK rather than against
 * `cards`: `removals` / `replacements.remove`, and `issues[].card`. That is the
 * stronger check for what they claim — "cut this card you play" is false unless
 * the deck plays it — and it is why a card the deck contains but the catalogue
 * does not is still cuttable.
 *
 * The reasons are recorded rather than merely counted because the count is the
 * point: it is the measurement of how often the ungrounded path was wrong, and
 * the owner should be able to read it off the response instead of taking
 * anyone's word for it.
 *
 * Pure apart from the diagnostic lookup, which is injected.
 */

import { normalizeName, frontFace, type CatalogRow } from './catalog.ts';
import {
  normalizeRow,
  withinIdentity,
  isLegalIn,
  type CandidateCard,
  type Color,
} from './_engine/advise/index.ts';

/** Why a suggestion was dropped. */
export type DropReason =
  | 'does-not-exist'
  | 'illegal-in-format'
  | 'outside-color-identity'
  | 'already-in-deck'
  | 'not-in-deck'
  | 'duplicate'
  | 'empty-name'
  | 'not-a-land'
  | 'is-commander';

export interface DroppedItem {
  section: string;
  name: string;
  reason: DropReason;
  /** Extra measured context, e.g. the card's real colour identity. */
  detail?: string;
}

/**
 * An index of everything the function knows to be real.
 *
 * Built from the candidate pool (legal + in-identity by construction, because
 * SQL filtered on exactly those two rules) plus the deck's own resolved rows.
 * Membership of `pool` therefore *is* the legality-and-identity check: a name
 * that resolves here has already passed both, which is why validation cannot
 * be accidentally weakened by editing a condition somewhere else.
 */
export class CardIndex {
  /** normalised full name -> cheapest printing. */
  readonly #byName = new Map<string, CandidateCard>();
  /** normalised front face of a double-faced card -> cheapest printing. */
  readonly #byFrontFace = new Map<string, CandidateCard>();
  /** display columns keyed by printing id, when they were fetched. */
  readonly #display = new Map<string, CatalogRow>();

  constructor(rows: readonly CatalogRow[], format: string) {
    for (const row of rows) {
      const card = normalizeRow(row, format);
      this.#offer(this.#byName, normalizeName(card.name), card);
      const front = frontFace(card.name);
      if (front) this.#offer(this.#byFrontFace, normalizeName(front), card);
      if (row.image_url != null || row.set_code != null || row.rarity != null) {
        this.#display.set(card.id, row);
      }
    }
  }

  /**
   * Keep the cheapest printing, exactly as the ranker's dedupe does, so the
   * price attached to a suggestion is the price of the cheapest way to own the
   * card rather than whichever row the database returned first.
   */
  #offer(map: Map<string, CandidateCard>, key: string, card: CandidateCard) {
    const prev = map.get(key);
    if (!prev) {
      map.set(key, card);
      return;
    }
    if (prev.usd === null && card.usd !== null) map.set(key, card);
    else if (prev.usd !== null && card.usd !== null && card.usd < prev.usd) map.set(key, card);
    else if (prev.usd === card.usd && card.id < prev.id) map.set(key, card);
  }

  /**
   * Resolve a name.
   *
   * Full names win outright. A front-face match is only accepted when the name
   * is not itself some other card's full name, so "Dusk" never resolves to
   * "Dusk // Dawn" if a card simply called "Dusk" exists.
   */
  resolve(name: string): CandidateCard | null {
    const key = normalizeName(name);
    if (!key) return null;
    return this.#byName.get(key) ?? this.#byFrontFace.get(key) ?? null;
  }

  display(card: CandidateCard): CatalogRow | null {
    return this.#display.get(card.id) ?? null;
  }

  get size(): number {
    return this.#byName.size;
  }
}

/**
 * Classify a name the pool did not contain.
 *
 * Purely diagnostic — the suggestion is dropped either way — but "this card is
 * green and your commander is not" is a far more useful line in a log than
 * "dropped", and it is the number that says whether the ungrounded path was
 * hallucinating cards or merely ignoring colour identity.
 */
export function diagnose(
  name: string,
  catalogueRows: readonly CatalogRow[],
  format: string,
  deckIdentity: readonly Color[]
): { reason: DropReason; detail?: string } {
  const key = normalizeName(name);
  const matches = catalogueRows.filter(
    r => normalizeName(r.name) === key || normalizeName(frontFace(r.name) ?? '') === key
  );
  if (!matches.length) return { reason: 'does-not-exist' };

  // A card exists as several printings; it is legal if ANY printing is, and
  // its colour identity is a property of the card, not the printing.
  const cards = matches.map(r => normalizeRow(r, format));
  if (!cards.some(c => isLegalIn(c.legalities, format))) {
    const seen = cards[0].legalities?.[format.toLowerCase()] ?? 'not listed';
    return { reason: 'illegal-in-format', detail: `legalities.${format} = ${seen}` };
  }
  if (!cards.some(c => withinIdentity(c.colorIdentity, deckIdentity))) {
    return {
      reason: 'outside-color-identity',
      detail: `identity [${cards[0].colorIdentity.join('') || 'colourless'}] ` +
        `is not within [${deckIdentity.join('') || 'colourless'}]`,
    };
  }
  // Exists, legal, in identity, yet absent from the pool. The pool is built
  // from exactly those rules, so this should be unreachable; say so rather
  // than silently claiming a reason that is not true.
  return { reason: 'does-not-exist', detail: 'resolved in catalogue but absent from the legal pool' };
}

/** Accumulates what was dropped, so the response can report it. */
export class ValidationLog {
  readonly dropped: DroppedItem[] = [];
  #checked = 0;
  #accepted = 0;

  check(): void {
    this.#checked++;
  }

  accept(): void {
    this.#accepted++;
  }

  drop(section: string, name: string, reason: DropReason, detail?: string): void {
    this.dropped.push({ section, name: String(name ?? ''), reason, ...(detail ? { detail } : {}) });
  }

  /**
   * The report the owner reads.
   *
   * `dropRate` is the share of card names the model produced that could not be
   * shown to a user. Before this change that number existed but nobody could
   * see it, because nothing computed it.
   */
  summary() {
    const byReason: Record<string, number> = {};
    for (const d of this.dropped) byReason[d.reason] = (byReason[d.reason] ?? 0) + 1;
    return {
      checked: this.#checked,
      accepted: this.#accepted,
      dropped: this.dropped.length,
      dropRate: this.#checked > 0 ? Number((this.dropped.length / this.#checked).toFixed(4)) : 0,
      byReason,
      droppedItems: this.dropped.slice(0, 60),
    };
  }
}

/** A land type line, for validating the land section. */
export function isLandCard(card: CandidateCard): boolean {
  return /\bland\b/i.test(card.typeLine);
}

/**
 * A basic land — "Basic Land — Plains".
 *
 * The one class of card the "already in the deck" rule must not apply to. A
 * deck may run any number of basics (Commander's singleton rule names them as
 * the explicit exception, and constructed's four-of limit does too), so
 * "add three more Plains" is ordinary advice to a deck that is short on lands
 * and already plays Plains — which is nearly every deck that needs it.
 */
export function isBasicLand(card: CandidateCard): boolean {
  return isLandCard(card) && /\bbasic\b/i.test(card.typeLine);
}

/**
 * May this name be cut, and if not, why not.
 *
 * Both arguments are sets of NORMALISED names — `normalizeName` keys, not raw
 * card names — because that is what the caller already holds and comparing raw
 * names here would reintroduce the case sensitivity the normaliser exists to
 * remove.
 *
 * Extracted from the validator so the commander exception is a rule with a test
 * rather than a condition inside a closure. It had no test before, and it had
 * no condition either: the commander is a member of the deck, `inDeck` was the
 * only question asked, and so the commander was cuttable. The optimiser panel
 * applies an accepted cut by calling `onRemoveCard(name)`, so that answer was
 * one click away from removing the one card a Commander deck is built around
 * and cannot replace by drawing another.
 *
 * Order matters and is asserted: `not-in-deck` is tested first so the reason
 * recorded for a name that is neither in the deck nor the commander is the
 * true one. The commander IS in the deck; being the commander is a separate
 * and stronger objection.
 *
 * Returns null when the cut is allowed.
 */
export function cutRefusal(
  key: string,
  inDeck: ReadonlySet<string>,
  commanderKeys: ReadonlySet<string>
): Extract<DropReason, 'not-in-deck' | 'is-commander'> | null {
  if (!inDeck.has(key)) return 'not-in-deck';
  if (commanderKeys.has(key)) return 'is-commander';
  return null;
}

/**
 * The model named an already-accepted land a second time. Is that a second
 * COPY, or the same suggestion said twice?
 *
 * Only basics can be a copy. Every other card is singleton in Commander and
 * capped at four elsewhere, so "Command Tower, Command Tower" is the model
 * repeating itself, not asking for two.
 *
 * This is the one rule in the validator that decides an outcome by ADDING to a
 * suggestion rather than by dropping one, and it sits on the only path that
 * bypasses `resolveAdd` — so the oracle-id duplicate guard that protects every
 * other section never runs for lands. It got the answer wrong in both
 * directions at once before this existed: a repeated non-basic was folded into
 * `quantity: 2` and logged as ACCEPTED, and the response told a Commander
 * player to add two copies of a singleton card.
 *
 * `null` is 'duplicate', not 'copy': an unresolved card is not a known basic,
 * and the safe reading of "I cannot tell" is the one that adds nothing.
 */
export function landRepeatDisposition(existing: CandidateCard | null): 'copy' | 'duplicate' {
  return existing && isBasicLand(existing) ? 'copy' : 'duplicate';
}
