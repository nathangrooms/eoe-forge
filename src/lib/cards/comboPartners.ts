/**
 * "Works well with" means goes in the same deck and does a DIFFERENT job.
 *
 * The owner, 2026-08-30, relaying a friend who used the card page: the
 * recommendations "are nowhere near alike". Measured the same day, the group
 * headed *Works well with* was showing the same list as *Does the same thing*,
 * which is the opposite of what the heading promises. Sol Talisman does not
 * work well with Sol Ring. It IS Sol Ring.
 *
 * WHAT WE ACTUALLY HOLD, MEASURED BEFORE ANYTHING WAS DESIGNED
 * -----------------------------------------------------------
 * Three candidate sources, checked against the live database on 2026-08-30:
 *
 *   `meta_card_pairs` — 21,409 rows, and it CANNOT support the claim. Its
 *   commander scope is 192 MTGJSON precon lists, which are authored bundles
 *   rather than deck choices, so two cards printed in the same product
 *   co-occur perfectly. Its highest-lift pairs are Desolate Mire with Fetid
 *   Heath, Temple of Malice with Tainted Peak, Thriving Isle with Thriving
 *   Heath: dual lands sharing a colour pair. And for the staples anybody
 *   actually opens the arithmetic is pinned: Sol Ring is in 189 of the 192, so
 *   lift maxes out at 192/189 = 1.0159 and every partner ties there. Ordered by
 *   raw co-occurrence instead, Sol Ring's partners are Command Tower, Arcane
 *   Signet, Plains, Island and Mountain. Not used.
 *
 *   `deck_cards` — 463 rows over 7 decks. Handled by the caller, gated.
 *
 *   `meta_combos` — 61,500 combos over 6,670 cards, every one keyed to a card
 *   in our catalogue. This is the one. A combo is not a correlation, it is a
 *   claim that two cards do something together that neither does alone, and it
 *   arrives with what they produce and how many decks run it.
 *
 * Measured output on 2026-08-30, which is the test of whether this was worth
 * building:
 *
 *   Thassa's Oracle   Demonic Consultation, Tainted Pact, Doomsday, Hermit Druid
 *   Kiki-Jiki         Zealous Conscripts, Combat Celebrant, Felidar Guardian
 *   Basalt Monolith   Rings of Brighthearth, Power Artifact, Forsaken Monument
 *   Sol Ring          Hullbreaker Horror, Tidespout Tyrant, Displacer Kitten
 *   Swords            Jumbo Cactuar, Sanguine Bond, Serra Avatar
 *
 * And Counterspell, Cultivate, Rhystic Study and Craterhoof Behemoth are in no
 * recorded combo at all, so they get NO GROUP. That is the point rather than a
 * shortfall: a generic answer has no specific partner, and saying nothing is
 * the honest reply.
 *
 * Attribution is a standing obligation, not decoration. See `COMBO_ATTRIBUTION`
 * in `../meta/types.ts` and the Commander Spellbook section of
 * THIRD-PARTY-NOTICES.md.
 *
 * Pure. The caller does the reading.
 */

/** A row of `meta_combos`, as much of it as a card tile needs. */
export interface ComboRow {
  id: string;
  /** How many cards the whole combo takes. 2 is a straight pair. */
  card_count: number | null;
  /** Commander Spellbook's OWN deck count, over THEIR corpus. Never ours. */
  popularity: number | null;
  /** What the combo produces, verbatim. Their words, not ours. */
  produces: string[] | null;
}

/** A row of `meta_combo_cards`. */
export interface ComboMemberRow {
  combo_id: string;
  oracle_id: string;
  card_name?: string | null;
}

export interface ComboPartner {
  oracleId: string;
  name: string;
  /** Fewest cards in any recorded combo joining this partner to the subject. */
  pieces: number;
  /** That combo's popularity on Commander Spellbook. */
  popularity: number | null;
  /** That combo's produces list, verbatim. */
  produces: string[];
  /** How many recorded combos the two appear in together. */
  combos: number;
}

/**
 * A combo needs both halves to be a pairing a player can act on.
 *
 * Measured on 2026-08-30: of 61,500 combos, 4,725 take two cards, 34,733 take
 * three, and 22,042 take four or more. A four-card line that happens to include
 * Sol Ring is not a fact about Sol Ring, and putting Junk Diver on Sol Ring's
 * page because both appear in a five-card Krark-Clan Ironworks loop is exactly
 * the "nowhere near alike" complaint in a new costume. Three is where a combo
 * is still a thing you assemble on purpose.
 */
export const MAX_COMBO_PIECES = 3;

/**
 * Turn the two joined tables into one row per partner, best combo first.
 *
 * "Best" is FEWEST CARDS, then most played. Deliberately in that order: a
 * two-card combo is a pairing, a three-card combo is a plan, and no amount of
 * popularity makes the second into the first. Sol Ring and Hullbreaker Horror
 * come top of Sol Ring's list on both counts; Displacer Kitten is more famous
 * and needs a third card, so it sits below.
 *
 * Ties break on the partner's name so the list is stable between renders. A
 * list whose order changes on reload reads as a broken query, and an unordered
 * result presented as a recommendation is the single worst thing this page has
 * done.
 */
export function rankComboPartners(
  subjectOracleId: string,
  combos: readonly ComboRow[],
  members: readonly ComboMemberRow[],
  limit = 14
): ComboPartner[] {
  const byCombo = new Map<string, ComboRow>();
  for (const combo of combos) {
    if (!combo?.id) continue;
    const pieces = Number(combo.card_count ?? 0);
    if (!Number.isFinite(pieces) || pieces < 2 || pieces > MAX_COMBO_PIECES) continue;
    byCombo.set(combo.id, combo);
  }

  const partners = new Map<string, ComboPartner>();
  for (const member of members) {
    if (!member?.oracle_id || member.oracle_id === subjectOracleId) continue;
    const combo = byCombo.get(member.combo_id);
    if (!combo) continue;

    const pieces = Number(combo.card_count);
    const popularity =
      combo.popularity != null && Number.isFinite(Number(combo.popularity))
        ? Number(combo.popularity)
        : null;

    const held = partners.get(member.oracle_id);
    if (!held) {
      partners.set(member.oracle_id, {
        oracleId: member.oracle_id,
        name: member.card_name ?? '',
        pieces,
        popularity,
        produces: combo.produces ?? [],
        combos: 1,
      });
      continue;
    }

    held.combos += 1;
    if (!held.name && member.card_name) held.name = member.card_name;
    // A better combo replaces the one on show; the count keeps every one.
    const better =
      pieces < held.pieces ||
      (pieces === held.pieces && (popularity ?? -1) > (held.popularity ?? -1));
    if (better) {
      held.pieces = pieces;
      held.popularity = popularity;
      held.produces = combo.produces ?? [];
    }
  }

  return Array.from(partners.values())
    .sort(
      (a, b) =>
        a.pieces - b.pieces ||
        (b.popularity ?? -1) - (a.popularity ?? -1) ||
        b.combos - a.combos ||
        a.name.localeCompare(b.name)
    )
    .slice(0, limit);
}

const PIECE_WORDS: Record<number, string> = { 2: 'Two', 3: 'Three' };

/**
 * The line under the card image.
 *
 * Says the size of the combo and what it makes, in Commander Spellbook's own
 * words. Their strings are left alone rather than reworded: "Near-infinite
 * lifegain" is a distinction they draw on purpose and paraphrasing it would be
 * us making a claim about a card we did not read.
 */
export function comboNote(partner: ComboPartner): string {
  const size = PIECE_WORDS[partner.pieces] ?? String(partner.pieces);
  const head = `${size}-card combo`;
  const produces = partner.produces.filter(Boolean).slice(0, 2).join(', ');
  return produces ? `${head}: ${produces}` : head;
}

/**
 * The line under the heading, which has to carry the denominator.
 *
 * A player cannot judge "these combo with it" without knowing how many combos
 * we looked at and where they came from. `MetaInclusion` has the same rule for
 * the same reason: a proportion without its denominator invites the reader to
 * imagine a corpus we do not have.
 */
export function comboBasis(name: string, shown: number, scanned: number): string {
  const combos = scanned === 1 ? '1 combo' : `${scanned} combos`;
  return (
    `Cards that combine with ${name} to do something neither does alone. ` +
    `Read from ${combos} it appears in, each taking at most ${MAX_COMBO_PIECES} cards, ` +
    `smallest combo first and then how many decks run it. ` +
    `Showing ${shown === 1 ? 'the one partner' : `the top ${shown}`}.`
  );
}
