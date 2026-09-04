/**
 * The producer: a card row in, behaviour facets out.
 *
 * This is the join between the two halves of the app that had never been
 * connected. `src/lib/cards/abilities/` compiles Scryfall oracle text into the
 * structured `Ability` DSL and `src/lib/cards/xmage/` holds the ported XMage
 * records behind the same shapes. Both were built for PLAY. Nothing in deck
 * building or recommendation had ever read either of them, which is why the
 * generator still decided what a card was by matching words.
 *
 * WHY THE PRODUCER IS HERE AND NOT IN THE ENGINE
 * ----------------------------------------------
 * `engine-parity.test.ts` requires that nothing under `src/engine/` imports
 * outside `src/engine/`, and that rule is load-bearing: it is the only reason
 * the whole engine tree can be mirrored byte for byte into an edge function
 * bundle. So the engine declares the facet vocabulary
 * (`src/engine/knowledge/behaviour.ts`) and reads facets off the card; this
 * file is the one place that knows how to produce them, and it lives outside.
 *
 * THE PRECEDENCE RULE IS NOT REDECIDED HERE
 * -----------------------------------------
 * Which of the two sources speaks for a card is already settled by
 * `src/lib/cards/xmage/lowered.ts`: the oracle-text compiler wins whenever it
 * fully understands the card, and the XMage record is consulted only for a card
 * the compiler has already marked incomplete. This file calls `xmageSwapFor`
 * rather than reimplementing that rule, so there is one answer to "what does
 * this card do" in the whole repository.
 *
 * WHAT THAT RULE COSTS TODAY, MEASURED
 * ------------------------------------
 * `scratch/xmage-source-census.mjs` runs this producer over all 31,833
 * commander-legal cards in the 2026-08-19 catalogue snapshot and counts where
 * each answer came from. On 2026-08-23: **compiler 24,268, XMage record 1,541,
 * no record at all 7,565**.
 *
 * THAT SECOND FIGURE CORRECTS AN EARLIER ONE. `ENGINE-PICKS.md` part two
 * reported "XMage record 0" and concluded the two sources were disjoint in
 * exactly the wrong place. They are not. The zero came from this file deriving
 * `source` from `abilities.length` instead of from `CardAbilities.source`,
 * which hid every card the compiler had ALREADY swapped internally. Wrath of
 * God and Damnation are two of the 1,541. The reading is fixed below and the
 * report is corrected in part three.
 *
 * The `xmageSwapFor` call here is separate from the compiler's own, and it
 * still fires zero times for the reason the old note gave: it only runs when
 * the compiler is incomplete, and by then the compiler has already consulted
 * the same table. It stays because the day either source moves, it pays.
 *
 * Pure. No network, no database, no AI.
 */

import type {
  Ability,
  CardFilter,
  Cost,
  Effect,
  PlayerSelector,
  Selector,
  TargetSpec,
  TokenSpec,
  ValueExpr,
} from '../../cards/abilities/dsl.ts';
import { compileCardAbilities } from '../../cards/abilities/compiler.ts';
// The compiler's own subtype vocabulary, so a word is a subtype in exactly one
// place in this repository. See `readNamedSubtypesInRules`.
import { isSubtypeWord, parseKeywordWithParameter } from '../../cards/abilities/grammar.ts';
import { parseCosts } from '../../cards/abilities/clause-rules.ts';
import { abilityWordsOf, normalizeCard, type AbilityCard } from '../../cards/abilities/normalize.ts';
import { xmageSwapFor } from '../../cards/xmage/lowered.ts';
import { parseCost } from '../../cards/xmage/compare.ts';
import type { Facet } from '../../../engine/knowledge/behaviour.ts';

/* ------------------------------------------------------------------ *
 * Public shape
 * ------------------------------------------------------------------ */

export interface FacetResult {
  facets: Facet[];
  /**
   * Which source spoke for this card.
   *
   * `'compiler'` — the oracle-text compiler produced abilities.
   * `'xmage'`    — the compiler was incomplete and the ported record replaced it.
   * `'none'`     — neither produced an ability. The engine falls back to tags,
   *                and the caller should count how often this happens.
   */
  source: 'compiler' | 'xmage' | 'none';
  /** The compiler's own verdict, carried through so a caller can report it. */
  coverage: string;
}

/** A row this can read. Every field is a column on `cards` / `cards_unique`. */
export interface FacetInput extends AbilityCard {
  type_line?: string | null;
  oracle_text?: string | null;
}

/**
 * Keyword actions that always create a token, and the token they create.
 *
 * An empty value means the keyword makes a token whose type the keyword itself
 * does not fix: `manifest` is a face-down 2/2, and `embalm`, `eternalize`,
 * `myriad` and `squad` all make copies of something.
 */
const TOKEN_KEYWORDS: Readonly<Record<string, string>> = {
  investigate: 'clue',
  'living weapon': 'germ',
  amass: 'army',
  incubate: 'incubator',
  afterlife: 'spirit',
  fabricate: 'servo',
  manifest: '',
  embalm: '',
  eternalize: '',
  myriad: '',
  squad: '',
};

/**
 * Read one card.
 *
 * Facets are sorted and deduped so two cards with the same behaviour produce
 * the same array, which is what lets a caller compare them, cache them by
 * oracle id, or one day put them in a `text[]` column with a GIN index.
 */
export function facetsForCard(row: FacetInput): FacetResult {
  const out = new Set<Facet>();

  // Type line facts. Always available, never from a record, and the only source
  // for `type:` and `sub:` — the engine's creature role is decided here.
  readTypeLine(row.type_line ?? null, out);
  readSizeAndCost(row, out);

  let abilities: readonly Ability[] = [];
  let source: FacetResult['source'] = 'none';
  let coverage = 'unknown';
  /* Kept outside the try so the cost salvage below can see it. */
  let refused: ReadonlyArray<{ text?: string }> = [];

  try {
    const compiled = compileCardAbilities(row);
    coverage = compiled.coverage;
    abilities = compiled.abilities;
    refused = compiled.unparsed ?? [];
    /*
     * READ THE COMPILER'S OWN VERDICT, not the length of its output.
     *
     * This line used to say `abilities.length > 0 ? 'compiler' : 'none'`, and
     * that is how `ENGINE-PICKS.md` came to report "XMage record 0". The
     * compiler performs the XMage swap ITSELF — see `xmageSwapFor` inside
     * `compiler.ts` — and reports it on `CardAbilities.source`, so every card
     * the ported record spoke for was being counted as the compiler's.
     * Re-measured over the same 31,833 rows on 2026-08-23 by
     * `scratch/xmage-source-census.mjs`: the record speaks for 1,541 of them,
     * 4.8%, including Wrath of God and Damnation. `book` is the hand-authored
     * path and does not fire anywhere in this catalogue; it is grouped with the
     * compiler rather than given a fourth name nobody would ever see.
     */
    source =
      abilities.length === 0 ? 'none' : compiled.source === 'xmage' ? 'xmage' : 'compiler';

    if (compiled.coverage !== 'full') {
      const swap = xmageSwapFor(compiled, normalizeCard(row));
      if ('swap' in swap && swap.swap.abilities.length > 0) {
        abilities = swap.swap.abilities;
        source = 'xmage';
      }
    }
  } catch {
    // A row the compiler cannot even normalise is a row with no record. It is
    // not a row with no behaviour, and the difference is exactly what `source`
    // carries: the engine will fall back to tags for it.
    abilities = [];
    source = 'none';
  }

  for (const ability of abilities) readAbility(ability, out);

  /*
   * HOW COMPLETELY THE RECORD READ THE CARD. The engine needs this, and it is
   * the difference between two very different silences.
   *
   * Bone Saw compiles to `coverage: 'full'`: the compiler read every clause and
   * none of them is a win condition, so "no wincon facet" is a POSITIVE answer
   * and the engine should not go looking for a `voltron` tag to overrule it.
   *
   * Craterhoof Behemoth compiles to `coverage: 'partial'`: the compiler took
   * the haste keyword and the enters trigger and refused the "creatures you
   * control get +X/+X" clause, which is the entire card. Here "no wincon facet"
   * means NOT READ, and the tags are the only thing left that knows.
   *
   * Emitting the distinction rather than letting the engine infer it from an
   * absence is the same principle the compiler itself runs on: a gap is
   * counted and named, never silently dropped.
   */
  if (coverage === 'full') out.add('rec:full');
  else if (abilities.length > 0) out.add('rec:partial');

  readOwnTypeInRules(row, out);
  readNamedSubtypesInRules(row, out);

  /*
   * SCRYFALL ALREADY KNOWS EVERY KEYWORD ON EVERY CARD, and this file has never
   * once asked.
   *
   * `keywords` is a curated field on every Scryfall row, derived from Wizards'
   * own labelling. 16,507 cards in the catalogue carry one. Until now the only
   * source of `kw:` was the compiler recognising a keyword LINE, so a keyword
   * with no rule produced nothing at all: Bonesplitter's whole record was empty
   * because "Equip {1}" is not a shape any rule matched, and Equip is on 941
   * cards. Measured against Scryfall's catalog of 223 keyword abilities, the
   * engine named 162 and missed 60, and every one of the 60 was sitting in this
   * array untouched.
   *
   * IT SUPPLEMENTS THE COMPILER RATHER THAN REPLACING IT, because the two know
   * different things. Scryfall lists the keywords a card HAS. The compiler also
   * finds the keywords a card GRANTS — "target creature gains flying until end
   * of turn" — which never appear in this array, and granting flying is what
   * makes a card an evasion enabler rather than a flier.
   *
   * Spelling matches what the compiler already emits: lowercased, printed
   * spacing kept, so it is `kw:first strike` with a space. A hyphenated variant
   * would double every multi-word keyword in the vocabulary and split the count
   * for every consumer.
   */
  for (const kw of (row as { keywords?: string[] | null }).keywords ?? []) {
    const word = String(kw).toLowerCase().replace(/’/g, "'").trim();
    if (!word) continue;
    out.add(`kw:${word}`);
    /*
     * A KEYWORD ACTION THAT MAKES A TOKEN IS A TOKEN MAKER.
     *
     * The same route `infect` takes to `eff:poison` below: the same fact said a
     * different way, not a new judgement. "Investigate" MEANS "create a Clue
     * token" - the rules define it that way and the reminder text says so - so
     * a card carrying the keyword creates a token whether or not the compiler
     * read the sentence.
     *
     * Measured 4 Sep 2026: 1,052 cards say "create ... token" in their oracle
     * text and carry no `eff:create-token`, and these keywords account for 275.
     * Tireless Tracker (rank 653) knew only about counters, Batterskull only
     * about equip, Urza's Saga only about searching. None of the three was a
     * token maker to the engine.
     *
     * Deliberately only the keywords that ALWAYS create one. `populate` copies
     * a token you already control and creates nothing on its own; `undying` and
     * `persist` return the card itself rather than a token.
     */
    const token = TOKEN_KEYWORDS[word];
    if (token !== undefined) {
      out.add('eff:create-token');
      if (token) out.add(`tok:${token}`);
    }
  }

  /*
   * THE COST OF AN ABILITY WHOSE BODY WE COULD NOT READ.
   *
   * `compiler.ts` builds an activated ability only when `anyAutomated(effects)`
   * holds, so when the body defeats it the WHOLE ability is discarded including
   * a cost that parsed perfectly. "{2}{R}, {T}, Discard a card: <unreadable>"
   * contributed nothing, not even that it taps.
   *
   * Measured against a 374-word key built by two independent readers: 21 of the
   * 35 words that neither the compiler nor Scryfall Tagger could reach were
   * exactly this. It is the largest free win on the board and needs no reading.
   *
   * DONE HERE AND NOT IN THE COMPILER, AND THE REASON IS THE REGENERATE RULE.
   * `activatedAbilitiesOfCard` in `src/lib/game/activate.ts` filters on
   * `kind === 'activated'` and nothing else, so an ability published with an
   * unreadable body becomes a button that takes the player's mana and does
   * nothing. That is the one unforgivable outcome and it is why regenerate is
   * refused. Reading the cost into a FACET gives deck building the information
   * while publishing NO ABILITY, so the runtime is untouched and still reports
   * the clause as manual.
   *
   * A quote mark means the colon belongs to a granted ability, which is a
   * different declared gap. `compiler.ts` excludes it on the same test.
   */
  for (const clause of refused) {
    const text = String(clause?.text ?? '');
    if (!text || text.includes('"')) continue;
    const colon = text.indexOf(':');
    if (colon <= 0) continue;
    const costs = parseCosts(text.slice(0, colon));
    if (costs) readActivationCost(costs, out);
  }

  /*
   * THE ABILITY WORD, which the parser correctly throws away and deck building
   * cannot do without.
   *
   * It carries no rules meaning, so `normalizeParagraph` strips it before any
   * rule sees the clause. That is right for parsing and it was catastrophic for
   * everything else: measured against Scryfall's catalog of 69 ability words,
   * the engine emitted a facet for ONE. Landfall is on 193 cards and is one of
   * our own eighteen shells.
   *
   * `kw:` rather than a new prefix, because an ability word behaves exactly like
   * a keyword for every consumer that matters: it names a thing a deck is built
   * around, it is matched by ROLE_FACETS and PLAN_RULES the same way, and giving
   * it a prefix of its own would mean touching every one of them for no gain.
   */
  for (const word of abilityWordsOf(row as AbilityCard)) out.add(`kw:${word}`);

  /*
   * A WHEEL, derived. Wheel of Fortune reads `eff:discard eff:draw scope:all
   * cares:zone:hand` and Windfall the same with `eff:discard-self`: a whole
   * table throwing away its hand and drawing a new one, which is the one job
   * a draw-payoff commander wants most and no single verb says. The hand zone
   * is the guard: "each other player discards a card, you draw" is a Syphon
   * Mind, not a wheel.
   */
  if (
    out.has('eff:draw') &&
    (out.has('eff:discard') || out.has('eff:discard-self')) &&
    out.has('scope:all') &&
    out.has('cares:zone:hand')
  ) {
    out.add('eff:wheel');
  }

  return { facets: [...out].sort(), source, coverage };
}

/**
 * SUBTYPES THIS CARD'S RULES TEXT NAMES, WHETHER OR NOT IT HAS THEM.
 *
 * KAALIA OF THE VAST IS WHY THIS EXISTS, and she is a different failure from
 * the one `readOwnTypeInRules` handles. Her whole ability is "whenever Kaalia
 * attacks an opponent, you may put an Angel, Demon, or Dragon creature card
 * from your hand onto the battlefield tapped and attacking that opponent", and
 * the compiler returns ONE ability for her: the flying keyword. The trigger is
 * refused whole, `unparsed: [{ reason: 'ambiguous' }]`, so there is no filter
 * to read, no selector to read, and no object to read one off. She reaches
 * `planForCommander` carrying `kw:flying rec:partial sub:cleric sub:human
 * type:creature type:legendary` and comes back with `wants: []`.
 *
 * Measured, before this: an end-to-end build for Kaalia against the live
 * database on 2026-08-28 returned 28 creatures and NOT ONE Angel, Demon or
 * Dragon among them. It returned Guttersnipe, Firebrand Archer, Electrostatic
 * Field, Purphoros and Impact Tremors, which is a competent mono-red burn deck
 * with a white-black-red mana base, and it is not a Kaalia deck. The three
 * creature types that are the entire point of the card were never extracted, so
 * nothing downstream could act on them.
 *
 * `readOwnTypeInRules` cannot reach this. Its rule is that the subtype has to
 * be on the card's OWN type line, which is right for the tribe question — Krenko
 * is a Goblin who counts Goblins — and Kaalia is a Human Cleric. Angel, Demon
 * and Dragon are not hers.
 *
 * So this asks the weaker printed question, the one that is still true: does
 * this card's rules text NAME a subtype. That is Scryfall's half of the job
 * under CLAUDE.md, "printed truth: names, costs, type lines, oracle text", and
 * it is not an attempt to work out what the card DOES with them, which stays
 * with the compiler and the ported records.
 *
 * WHAT IT EMITS AND WHAT IT DELIBERATELY CANNOT. `cares:sub:` and nothing else
 * — never `tok:`, never an `eff:`, never a tribe. `tribeOf` in the engine still
 * requires the subtype on the commander's own type line, so Kaalia gains three
 * wants and stays `tribe: null`, which is right: she is not a tribal commander,
 * she is a commander who cheats three specific creature types into play. The
 * engine rule that turns these into wants is the one Sram already uses, so
 * nothing new was needed on that side.
 *
 * THE VOCABULARY IS NOT INVENTED HERE. `isSubtypeWord` in
 * `cards/abilities/grammar.ts` is the compiler's own list, derived from the
 * catalogue and already filtered by the blocklist of subtypes that are ordinary
 * English words ("Time", "Will", "Lord"). Sharing it means a word is a subtype
 * in exactly one place in this repository.
 *
 * TWO THINGS ARE STRIPPED BEFORE THE TEXT IS READ, and both are false positives
 * that were measured rather than imagined:
 *
 *   Reminder text. "(This card is every creature type.)" explains changeling;
 *                  it is not a Shapeshifter payoff. Already stripped by
 *                  `rulesTextOf`.
 *   The card's own NAME. Oracle text spells a card's own name out in full, and
 *                  plenty of names contain a subtype: Devil's Play reads
 *                  "Devil's Play deals X damage to any target" and would
 *                  otherwise claim to care about Devils. `Rhino, Wrecker of
 *                  Walls` is the same trap, and `normalize.ts` guards against
 *                  it for the compiler for the same reason.
 *
 * BASIC LAND TYPES ARE EXCLUDED. Forest, Island, Swamp, Mountain and Plains are
 * in the vocabulary because a land's type line carries them, but a rules text
 * naming one is talking about the mana base, and the mana base is chosen by the
 * castability engine from what a land produces rather than by behaviour facets.
 * Leaving them in would put `cares:sub:forest` on every fetch and every ramp
 * spell in the format and buy nothing.
 */
const BASIC_LAND_TYPES: ReadonlySet<string> = new Set([
  'forest',
  'island',
  'swamp',
  'mountain',
  'plains',
]);

function readNamedSubtypesInRules(row: FacetInput, out: Set<Facet>): void {
  const text = rulesTextOf(row, { stripOwnName: true });
  if (!text) return;

  /*
   * A SUBTYPE THE CARD MAKES A TOKEN OF IS NOT A SUBTYPE THE CARD IS ABOUT, and
   * this is the line between the two commanders that look alike from here.
   *
   * Talrand, Sky Summoner reads "create a 2/2 blue Drake creature token with
   * flying". The word Drake is in his text, so without this he would want DRAKE
   * CARDS at full tribe weight, and a Talrand deck is about instants and
   * sorceries — that is the exact rule `readOwnTypeInRules` was written not to
   * break, arriving from the other side. The compiler already read that clause
   * and already said what it does with Drakes: `tok:drake`. A record that spoke
   * is not overruled by a word.
   *
   * It costs nothing on the commanders that do care. Krenko makes Goblin tokens
   * AND counts Goblins, but Goblin is on his own type line, so
   * `readOwnTypeInRules` supplies `cares:sub:goblin` before this runs and the
   * suppression never reaches it. Same for Edgar Markov and Vampires, and for
   * Lathril and Elves. Kaalia has no `tok:` facet at all, because she makes no
   * tokens, so all three of hers survive.
   */
  const madeAsTokens = new Set(
    [...out].filter(f => f.startsWith('tok:')).map(f => f.slice('tok:'.length))
  );

  /* One pass over the words the text actually contains, rather than a pass over
     the whole vocabulary: the vocabulary is about 280 words and a rules text is
     about 30, so this is the cheap direction and the pool is 30,000 rows. */
  /*
   * WITH THE FRAME IN FRONT OF EACH WORD, because a subtype in a negative
   * phrase is a fact about what the card AVOIDS. This scan split the text on
   * non-letters and read every subtype word as a thing the card cares about,
   * so "Protection from Humans" made Yawgmoth, Thran Physician a Human tribal
   * commander and "a non-Human creature" did the same to Kinnan. Both are
   * Humans, and both decks filled with Humans on the strength of the one
   * phrase on the card that means the reverse.
   *
   * The tokeniser is replaced by a positioned scan so the twenty-four
   * characters before a hit can be checked against the closed list of
   * negative frames `namesWordPositively` uses. Same words are skipped, same
   * token and basic-land exclusions apply; only the frame check is new.
   */
  const seen = new Set<string>();
  const wordRe = /[a-z'-]+/g;
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(text)) !== null) {
    const word = m[0].replace(/^[-']+|[-']+$/g, '');
    if (word.length < 2 || seen.has(word)) continue;
    const sub = singularSubtype(word);
    if (!sub || BASIC_LAND_TYPES.has(sub) || madeAsTokens.has(sub)) { seen.add(word); continue; }
    const before = text.slice(Math.max(0, m.index - 24), m.index);
    if (NEGATIVE_FRAME.test(before)) continue; /* not `seen`: a later, positive mention still counts */
    /* "Mystic Arcanum -" is an ability word, and Mystic is a creature type.
       Prosper, Tome-Bound was a Mystic tribal commander on the strength of it. */
    const wordEnd = m.index + m[0].length;
    if (ABILITY_WORD_AFTER.test(text.slice(wordEnd, wordEnd + 40))) continue;
    seen.add(word);
    out.add(`cares:sub:${sub}`);
  }
}

/**
 * The subtype this word names, in whatever form the text printed it.
 *
 * Oracle text says "Dragons you control" and "each Elf", so the plural has to
 * resolve to the same subtype as the singular. The irregulars Magic actually
 * prints are listed in `IRREGULAR_PLURALS`; everything else is `s` or `es`, and
 * a word that is a subtype as printed is taken as printed first so that
 * "Praetors" cannot be read as a plural of a subtype that does not exist.
 */
function singularSubtype(word: string): string | null {
  if (isSubtypeWord(word)) return word;
  for (const [singular, plural] of Object.entries(IRREGULAR_PLURALS)) {
    if (word === plural) return isSubtypeWord(singular) ? singular : null;
  }
  for (const suffix of ['es', 's']) {
    if (!word.endsWith(suffix)) continue;
    const stem = word.slice(0, -suffix.length);
    if (stem.length >= 2 && isSubtypeWord(stem)) return stem;
  }
  return null;
}

/**
 * DOES THIS CARD'S RULES TEXT NAME ITS OWN CREATURE TYPE.
 *
 * A printed-truth read, and it is here because the record misses it on exactly
 * the cards where it matters most.
 *
 * `CommanderPlan.tribe` in the engine states the rule: the subtype has to be on
 * the commander's own type line AND inside one of its abilities. Krenko passes
 * and Talrand fails, which is right. The problem is the second half. The engine
 * can only ask a compiled record, and the compiler refuses precisely the
 * clauses that make a tribal commander tribal. Measured by
 * `scratch/refute-eight.mjs` on the 2026-08-19 snapshot, over eight commanders
 * the tuning never saw:
 *
 *   Edgar Markov   record reads kw:first strike, kw:haste, sub:knight,
 *                  sub:vampire. The eminence trigger and the +1/+1 attack
 *                  trigger are both refused, so there is no `cares:sub:vampire`
 *                  and no `tok:vampire`.
 *   Lathril        No `tok:elf` from "create that many 1/1 Elf Warrior tokens",
 *                  no `cares:sub:elf` from "Tap ten untapped Elves you control".
 *   Yuriko         No `cares:sub:ninja` from "Whenever a Ninja you control deals
 *                  combat damage to a player".
 *
 * All three came back `tribe: null`, two of them with no wants at all, and all
 * three built a deck of cheap colourless artifacts that was LESS on theme than
 * drawing at random from their own colour pool. That is the owner's "every
 * commander has unique style" test failing on three of eight, silently.
 *
 * So this asks the printed text the same question the record could not answer:
 * does a subtype from this card's own type line appear as a word in its own
 * rules text. Under the division of sources in CLAUDE.md that is Scryfall's
 * half of the job, "printed truth: names, costs, type lines, oracle text", and
 * it is not an attempt to work out what the card DOES, which stays XMage's half
 * and stays with the compiler.
 *
 * WHAT IT DELIBERATELY CANNOT DO. It emits `cares:sub:` and never `tok:` and
 * never an effect, so it can say "this card is about Vampires" and can never
 * say what it does about them. A word is weaker evidence than a record, so the
 * facet it produces is the weakest one that still carries the meaning.
 *
 * THE CASES IT HAS TO GET RIGHT, all asserted in `behaviour.test.ts`:
 *
 *   Talrand, Sky Summoner  A Merfolk Wizard whose text says "instant or sorcery"
 *                          and "Drake". Neither of its own subtypes appears, so
 *                          nothing is emitted and Talrand still has no tribe.
 *   Kaalia of the Vast     A Human Cleric whose text names Angel, Demon and
 *                          Dragon. None of those is her own subtype, so nothing
 *                          is emitted and she gets no tribe, which is right:
 *                          she is not a tribal commander.
 *   Yuriko                 "Ninjutsu" must not match `sub:ninja`. Word
 *                          boundaries, not substrings.
 *
 * Reminder text is stripped first, because "(This card is every creature
 * type.)" is an explanation of a keyword and not the card naming a tribe.
 */
function readOwnTypeInRules(row: FacetInput, out: Set<Facet>): void {
  const subs = [...out].filter(f => f.startsWith('sub:')).map(f => f.slice('sub:'.length));
  if (subs.length === 0) return;

  const text = rulesTextOf(row);
  if (!text) return;

  for (const sub of subs) {
    if (!/^[a-z][a-z'-]*$/.test(sub)) continue;
    if (namesWordPositively(text, sub)) out.add(`cares:sub:${sub}`);
  }
}

/**
 * The word appears, and NOT in a phrase that means the opposite.
 *
 * `namesWord` finds the word. This asks what the words before it are doing,
 * because the same subtype in a negative frame is a fact about what the card
 * AVOIDS, and reading it as what the card wants produced two wrong commanders
 * in one afternoon:
 *
 *   Yawgmoth, Thran Physician   "Protection from Humans"     -> Human tribal
 *   Kinnan, Bonder Prodigy      "a non-Human creature"       -> Human tribal
 *
 * Both are Humans themselves, so the scan was looking for their OWN type in
 * their rules and found it in the one place it means the reverse. The frames
 * are a closed list, on purpose: each was found on a real card and a wider
 * guess would start refusing real tribal payoffs.
 */
/** The closed list of phrases that put the subtype after them in a NEGATIVE frame. */
const NEGATIVE_FRAME =
  /(protection from|non-?|can't be blocked by|other than|except by|except for|rather than|isn't a|aren't|not a|without)\s*$/;

/**
 * The word is the start of an ABILITY WORD, which Scryfall prints as one to
 * three capitalised words and a dash before the ability: "Mystic Arcanum -",
 * "Pact Boon -", "Will of the council -". A creature type inside one is not a
 * creature type the card cares about. Matched against the text AFTER the hit,
 * up to two more words and then the dash.
 */
const ABILITY_WORD_AFTER = /^(?: [a-z'-]+){0,2} [\u2014\u2013-] /;

function namesWordPositively(text: string, word: string): boolean {
  const forms = [word, `${word}s`, `${word}es`, IRREGULAR_PLURALS[word]].filter(Boolean) as string[];
  for (const form of forms) {
    const re = new RegExp(`(^|[^a-z'])${escapeRe(form)}([^a-z']|$)`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const before = text.slice(Math.max(0, m.index - 24), m.index + m[1].length);
      const wordEnd = m.index + m[1].length + form.length;
      if (ABILITY_WORD_AFTER.test(text.slice(wordEnd, wordEnd + 40))) continue;
      if (!NEGATIVE_FRAME.test(before)) return true;
    }
  }
  return false;
}

/**
 * Every face's rules text, with bracketed reminder text removed.
 *
 * `stripOwnName` additionally removes the card's printed name, and every comma
 * separated part of it, before the text is read. Oracle text spells a card's
 * own name out in full, so "Devil's Play deals X damage to any target" contains
 * the word "Devil" and "Rhino, Wrecker of Walls" contains both "Rhino" and
 * "Walls". A card naming itself is not a card naming a subtype, and only the
 * reader that scans for arbitrary subtypes needs the distinction — the own-type
 * reader is asking about the type line it already has.
 */
function rulesTextOf(row: FacetInput, opts?: { stripOwnName?: boolean }): string {
  const parts: string[] = [];
  if (typeof row.oracle_text === 'string') parts.push(row.oracle_text);
  const faces = (row as { card_faces?: { oracle_text?: string | null }[] | null }).card_faces;
  for (const face of faces ?? []) {
    if (typeof face?.oracle_text === 'string') parts.push(face.oracle_text);
  }
  let text = parts.join('\n').replace(/\([^)]*\)/g, ' ').toLowerCase();
  if (opts?.stripOwnName) {
    const name = typeof row.name === 'string' ? row.name.toLowerCase() : '';
    // Longest first, so "rhino, wrecker of walls" is removed before "rhino"
    // would match inside it and leave the rest of the name behind.
    const pieces = [name, ...name.split(/\s*\/\/\s*/), ...name.split(/\s*,\s*/)]
      .map(p => p.trim())
      .filter(p => p.length >= 2)
      .sort((a, b) => b.length - a.length);
    for (const piece of pieces) text = text.split(piece).join(' ');
  }
  return text;
}

/**
 * Is `word` present as a word, allowing the plurals Magic actually prints?
 *
 * `Elves` is the form that matters and the one a stemmer gets wrong in both
 * directions, so the irregulars are listed rather than derived.
 */
const IRREGULAR_PLURALS: Readonly<Record<string, string>> = {
  elf: 'elves',
  dwarf: 'dwarves',
  wolf: 'wolves',
  mouse: 'mice',
  goose: 'geese',
};

/**
 * Does the text name this word, as a word?
 *
 * "NON-HUMAN" IS NOT NAMING HUMANS. Kinnan, Bonder Prodigy is a Human Druid
 * whose only use of the word is "a non-Human creature card", and this read it
 * as him naming his own type: `cares:sub:human`, which `tribeOf` then took as
 * proof he is a Human tribal commander, so his deck wanted the one creature
 * type his ability refuses to put onto the battlefield. Junji, the Midnight
 * Sky ("non-Dragon creature card") was a Dragon tribal commander by the same
 * route. The lookbehind is the whole fix: a subtype written straight after
 * "non-" is the complement being named, not the type.
 */
function namesWord(text: string, word: string): boolean {
  const forms = new Set([word, `${word}s`, `${word}es`]);
  const irregular = IRREGULAR_PLURALS[word];
  if (irregular) forms.add(irregular);
  for (const form of forms) {
    /* `non-` is not a boundary before a word, it is a negation of it. The
       hyphen matched `[^a-z']` and "non-Human" read as naming Humans, which is
       how a commander who fetches NON-Humans was told he loves Humans. */
    if (new RegExp(`(^|[^a-z'])(?<!non-)(?<!non)${escapeRe(form)}([^a-z']|$)`).test(text)) return true;
  }
  return false;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\\-]/g, '\\$&');
}

/* ------------------------------------------------------------------ *
 * The type line
 * ------------------------------------------------------------------ */

/**
 * Card types and supertypes the engine has a use for.
 *
 * Anything else is skipped, not guessed. Checked against Scryfall's own catalog
 * on 31 Aug 2026, which is the authoritative list Wizards maintains: Magic has
 * seven supertypes and this held ONE of them.
 *
 * The four added are all real deck signals and all free, because they are
 * already sitting in the type line the parser reads:
 *
 *   snow    157 cards, and snow-matters is a deck somebody builds. Dead Of
 *           Winter and Marit Lage's Slumber count them.
 *   basic   641 cards. The difference between a land a fetch can find and one
 *           it cannot, which is most of what a mana base is.
 *   token   4,130 mentions. A token is not a card and a deck that makes them
 *           is not a deck that draws them.
 *   world   37 cards. Rare, but the legend rule for worlds is its own thing.
 *
 * `ongoing` and `elite` are deliberately absent: `ongoing` is Archenemy scheme
 * vocabulary and `elite` appears on one card, so neither would ever separate a
 * deck. A facet nothing acts on is noise, which is the same reason a colour
 * choice carries no `cares:` facet.
 */
const CARD_TYPES: readonly string[] = [
  'creature',
  'instant',
  'sorcery',
  'artifact',
  'enchantment',
  'land',
  'planeswalker',
  'battle',
  'legendary',
  'snow',
  'basic',
  'token',
  'world',
];

/**
 * Mana value and printed power, in the coarse bands a plan can ask for.
 *
 * Read off the row, never from a record: a card's cost and size are printed
 * facts, and the wants that needed them are about shape rather than text.
 * Yuriko wants a creature that connects on turn two, Xenagos wants a body worth
 * doubling, Animar wants the seven-drop that costs nothing once he is big.
 * None of that is a facet a rule could produce from the rules text, and the
 * curve signal in the ranker scores the exact number but cannot be ASKED for.
 *
 * Lands carry no `mv:` band: a land's mana value is zero and it is not cheap.
 * Power is read only when it is a number; `*` stays unknown.
 */
function readSizeAndCost(row: FacetInput, out: Set<Facet>): void {
  const r = row as { cmc?: number | string | null; power?: string | number | null; type_line?: string | null };
  const isLand = /\bLand\b/.test(r.type_line ?? '');
  const cmc = r.cmc == null || r.cmc === '' ? NaN : Number(r.cmc);
  if (!isLand && Number.isFinite(cmc)) {
    if (cmc <= 2) out.add('mv:cheap');
    if (cmc >= 6) out.add('mv:big');
  }
  const power = r.power == null || r.power === '' ? NaN : Number(r.power);
  if (Number.isFinite(power) && power >= 5) out.add('pt:big');
}

function readTypeLine(typeLine: string | null, out: Set<Facet>): void {
  if (!typeLine) return;
  /*
   * BOTH FACES, not just the front.
   *
   * This read `split('//')[0]` and threw the back away, so 851 double-faced
   * cards were described by half their type line. Bonecrusher Giant is
   * "Creature — Giant // Instant — Adventure" and the engine could not see that
   * it was an Adventure at all: 145 cards carry that spell type and 13 carry
   * Omen, and neither was readable.
   *
   * A back face is a REAL part of the card here in a way it is not for
   * abilities. `compiler.ts` deliberately refuses to fold a back face's
   * abilities into the front's, because that would grant the card abilities it
   * does not have while front side up. A TYPE is different: an Adventure
   * creature is an Adventure creature in your deck list, in your search
   * results, and in every count of what the deck is made of.
   */
  for (const face of typeLine.split('//')) readTypeFace(face, out);
}

function readTypeFace(front: string, out: Set<Facet>): void {
  // The em dash is the printed separator between types and subtypes. Some rows
  // carry a hyphen instead, so both are accepted; nothing else is.
  const dash = front.search(/[—-]/);
  const types = (dash >= 0 ? front.slice(0, dash) : front).toLowerCase();
  const subs = dash >= 0 ? front.slice(dash + 1) : '';

  for (const t of CARD_TYPES) {
    if (new RegExp(`\\b${t}\\b`).test(types)) out.add(`type:${t}`);
  }
  const subRun = subs.trim().toLowerCase();
  for (const word of subRun.split(/\s+/)) {
    const w = word.trim();
    if (w) out.add(`sub:${w}`);
  }
  /*
   * THE ONE MULTI-WORD SUBTYPE IN MAGIC.
   *
   * Splitting on whitespace is correct for every subtype Wizards has ever
   * printed except one: checked against all eight Scryfall subtype catalogs on
   * 31 Aug 2026, "Time Lord" is the only value containing a space, out of 507.
   * It was becoming `sub:time` and `sub:lord`, neither of which is a creature
   * type, on 33 cards.
   *
   * The joined form is added rather than the split being replaced, because the
   * split is right for the other 506 and a lookup table for one value would be
   * a table somebody has to maintain.
   */
  if (subRun.includes(' ')) out.add(`sub:${subRun}`);
}

/* ------------------------------------------------------------------ *
 * The record
 * ------------------------------------------------------------------ */

/**
 * EVERY TYPE OR SUBTYPE FILTER IN THE ABILITY, WHEREVER IT SITS.
 *
 * `readAbility` below walks the ability by hand, position by position, because
 * most positions contribute more than a filter — a selector also decides
 * `scope:all`, an effect also contributes its verb, a trigger also contributes
 * `trig:`. That hand walk is right for those facets and it was WRONG for
 * `cares:type:` and `cares:sub:`, because it only reached a filter in the
 * positions somebody had remembered to visit.
 *
 * MEASURED, on all 31,833 commander-legal rows in the 2026-08-19 catalogue
 * (`scratch/filter-position-census.mjs`, which deep-walks the compiled ability
 * graph and diffs it against a faithful re-tracing of `readAbility`'s route):
 *
 *     rows with at least one compiled ability      24,433
 *     rows carrying a type or subtype filter        9,127
 *       reader dropped at least one of them         1,430
 *       reader dropped every one of them            1,176
 *
 * Where those 1,430 sat, by card count:
 *
 *     activation cost      "Sacrifice a creature:"          497   Phyrexian Tower
 *     ability condition    "if you control an artifact"     283   Roadside Reliquary
 *     count expression     "for each Goblin you control"    238   Gaea's Cradle
 *     static modification  "+1/+1 for each enchantment"     204   Helm of the Gods
 *     effect object        "put a creature card into hand"  113   Memorial to Unity
 *     trigger event        `event.source`, never visited     67   Grenzo, Havoc Raiser
 *     effect condition     "if you control an artifact"      41   Galvanic Blast
 *
 * The brief that opened this said the compiler read a filter on a TRIGGER and
 * not one on the OBJECT AN EFFECT ACTS ON. Measured, that is not what was
 * happening. Effect objects were the position most nearly right: 1,534 cards
 * carry a filter there and the reader already reached 1,421 of them, because
 * `destroy`, `pump`, `sacrifice`, `search-library`, `exile`, `tap`, `untap`,
 * `move-zone`, `return-from`, `gain-control`, `add-counters` and `damage` all
 * hand their selector to `readSelector`. `look-and-pick` was the one effect
 * whose object filter was dropped, and `event.source` was a TRIGGER filter
 * being dropped, which is the opposite way round from the brief.
 *
 * WHY THIS IS A SWEEP AND NOT SEVENTEEN MORE HAND-WRITTEN CASES. The DSL fixes
 * the meaning of `{is:'type'}` and `{is:'subtype'}` independently of where the
 * member sits: it always names a card characteristic. So the answer to "does
 * this card care about Dragons" does not depend on the path taken to the
 * filter, and a reader that walks to it by name will go stale again the next
 * time `dsl.ts` grows a member. It grew `look-and-pick` and `attach` since this
 * file was written and both were missed. This walk cannot go stale.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It emits `cares:type:` and `cares:sub:` and
 * nothing else. Not `kw:` from a keyword filter, not `ctr:` from a counter
 * filter, not `scope:all`, not `eff:`. Those stay with the hand walk, which
 * knows the position they mean something in. So this sweep can only ADD
 * `cares:` facets to a card and can never remove or change one, which is the
 * property that makes it safe to land on a vocabulary five other files read.
 *
 * `text`, `prompt` and `hint` are skipped: they hold verbatim oracle prose, no
 * filter is ever nested inside a string, and walking them is wasted work.
 */
const PROSE_FIELDS: ReadonlySet<string> = new Set(['text', 'prompt', 'hint']);

function readCaresFilters(node: unknown, out: Set<Facet>): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) readCaresFilters(item, out);
    return;
  }
  const rec = node as Record<string, unknown>;
  /*
   * A NEGATED FILTER NAMES WHAT THE CARD IS NOT ABOUT. "Nonland permanent",
   * "noncreature spell", "nontoken creature", "non-Human creature card": the
   * word under the `not` is the thing being excluded, and walking into it
   * said the card cares about exactly that thing. Measured over the 3,000 most
   * played cards (`scratch/neg-measure.mjs`, 2 Sep 2026): 92 cards lose a
   * facet and none gains one. Cyclonic Rift stops caring about lands, Negate
   * and Mystic Remora about creatures, Go for the Throat about artifacts, and
   * Kinnan, Bonder Prodigy about Humans, which is the one that matters for a
   * deck: his ability puts a NON-Human onto the battlefield and the plan was
   * asking for Humans. Same rule in `readFilter` below, for the hand walk.
   */
  /* The DSL spells a negated filter `{ is: 'not', of }`, not `{ not: ... }`;
     the first version of this guard checked for a key that never exists and
     so never fired. "nonland" kept reading as caring about lands. */
  if (rec.is === 'not') return;
  if (typeof rec.value === 'string') {
    if (rec.is === 'type') out.add(`cares:type:${rec.value.toLowerCase()}`);
    else if (rec.is === 'subtype') out.add(`cares:sub:${rec.value.toLowerCase()}`);
  }
  /*
   * `{is:'commander'}` is the one filter with no value, so it is read here on
   * its own. `cares:commander` was declared in the engine's vocabulary for
   * "the card that singles out YOUR COMMANDER" and this file had never emitted
   * it: the compiler produced the filter nowhere, so the free-spell cycle
   * (Fierce Guardianship, Deadly Rollick, Flawless Maneuver) reached the word
   * only through Tagger's `cycle-c20-free-spell`. The filter now sits in the
   * spell's `alternativeCosts[].condition`, which this walk reaches like any
   * other position.
   */
  if (rec.is === 'commander') out.add('cares:commander');
  for (const [key, value] of Object.entries(rec)) {
    if (PROSE_FIELDS.has(key)) continue;
    readCaresFilters(value, out);
  }
}

/**
 * The keyword a grant entry gives, with its parameter dropped.
 *
 * A grant can now carry a parameterised keyword — "protection from red",
 * "protection from the chosen color" — the way a printed keyword line does,
 * and the keyword line has always been read as `kw:protection` with the
 * parameter left off. Reading a grant of the same thing as
 * `grants:protection from the chosen color` would make Gods Willing invisible
 * to the `protection` role, which asks for `grants:protection` by name, while
 * a card PRINTED with protection counts. The facet says what kind of shield
 * the card hands out; which colour is a question for the table.
 */
function grantedKeyword(grant: unknown): string {
  const g = String(grant).toLowerCase();
  return parseKeywordWithParameter(g)?.keyword ?? g;
}

function readAbility(ability: Ability, out: Set<Facet>): void {
  // Every filter, whatever position it sits in. Runs alongside the hand walk
  // below rather than replacing it: see `readCaresFilters`.
  readCaresFilters(ability, out);

  if (ability.kind === 'keyword') {
    out.add(`kw:${ability.keyword.toLowerCase()}`);
    // Four keywords ARE effects the deck builder cares about and have no
    // `Effect` member, because the runtime handles them structurally. Reading
    // them here is the same fact by a different route, not a new judgement.
    if (ability.keyword.toLowerCase() === 'infect') out.add('eff:poison');
    return;
  }

  if (ability.kind === 'triggered') {
    out.add(`trig:${ability.event.on}`);
    /*
     * WHAT KIND OF SPELL a cast trigger listens for, as its own word.
     *
     * "Whenever you cast a creature spell" is the whole of Chulane and Animar,
     * and it used to reach the plan only through an English intent rule. The
     * moment the compiler read Chulane whole, the intent rules were skipped -
     * correctly, English must not talk over a parsed record - and the parsed
     * record said `trig:cast` and `cares:type:creature`, which is also what a
     * card that pumps a creature whenever you cast anything says. The type on
     * the EVENT's own filter is the fact, so it is named on the trigger.
     */
    if (ability.event.on === 'cast') {
      const where = (ability.event as { what?: { where?: CardFilter } }).what?.where;
      for (const type of typesNamedBy(where)) out.add(`trig:cast:${type}`);
      /* "...spell that targets a creature you control": the condition on
         the spell is the whole of Feather and every heroic commander. */
      if (namesTargets(where)) out.add('trig:cast:targeting');
    }
    readTriggerDirection(ability.event, out);
    readTriggerEvent(ability.event, out);
    readEffects(ability.effects, out, (ability as { targets?: readonly TargetSpec[] }).targets);
    for (const t of ability.targets ?? []) if (t.filter) readFilter(t.filter, out, 'cares');
    return;
  }

  if (ability.kind === 'activated' || ability.kind === 'mana') {
    readEffects(ability.effects, out, (ability as { targets?: readonly TargetSpec[] }).targets);
    readActivationCost(ability.costs, out);
    if (ability.kind === 'activated') {
      for (const t of ability.targets ?? []) if (t.filter) readFilter(t.filter, out, 'cares');
    }
    return;
  }

  if (ability.kind === 'spell') {
    readEffects(ability.effects, out, (ability as { targets?: readonly TargetSpec[] }).targets);
    /*
     * What you must ALSO do to cast it — under `cost:cast-`, NOT `cost:`.
     *
     * THE PREFIX IS THE WHOLE POINT and the first version of this got it wrong.
     * `cost:` was introduced for ACTIVATION costs, to tell Viscera Seer from
     * Diabolic Edict: an outlet you can use every turn against a spell that
     * eats one creature once. Emitting `cost:sacrifice` for a spell's
     * additional cost erased exactly that distinction, and the Meren deck built
     * the same night proves what it costs — twelve "when a creature dies"
     * payoffs, Grave Pact and Dictate of Erebos among them, and NO SACRIFICE
     * OUTLET, because Deadly Dispute answered the plan's `cost:sacrifice` want
     * and Ashnod's Altar never got a look.
     *
     * Village Rites is an aristocrats card and should say so; it is not an
     * engine and must not answer the want that asks for one. Two facets, two
     * weights in the plan.
     */
    for (const cost of ability.additionalCosts ?? []) {
      if (cost.pay === 'mana') continue;
      out.add(`cost:cast-${cost.pay}` as Facet);
      const what = (cost as { what?: Selector }).what;
      if (what) readSelector(what, out);
    }
    for (const t of ability.targets ?? []) if (t.filter) readFilter(t.filter, out, 'cares');
    return;
  }

  if (ability.kind === 'static') {
    readSelector(ability.affects, out);
    for (const mod of ability.modifications) {
      /*
       * SETTING power and toughness is not PUMPING it, and the two were the
       * same word.
       *
       * Humble ("target creature loses all abilities and becomes 0/1") and
       * Kenrith's Transformation are ANSWERS: they work through indestructible,
       * through a giant creature, through anything, because they overwrite the
       * number rather than adding to it. Reading them as `eff:pump` filed them
       * in `enhance`, the role for cards that make your creatures better.
       */
      if (mod.layer === 'pt-modify') out.add('eff:pump');
      if (mod.layer === 'pt-set') out.add('eff:set-pt');
      if (mod.layer === 'ability') {
        /*
         * GIVING A KEYWORD IS NOT HAVING ONE, and this line could not tell them
         * apart.
         *
         * `kw:hexproof` meant both "this creature has hexproof" and "this card
         * grants hexproof to something", so Purphoros (who HAS indestructible)
         * and Swiftfoot Boots (which GRANT hexproof) produced the same facet.
         * CLAUDE.md records the consequence as roughly 15% false positives on
         * the `protection` role and gives the reason as the facet set being
         * flat; it is not, it is this line throwing the distinction away.
         *
         * `grants:` keeps both, because a deck wants both and for different
         * reasons: a flier is evasion, a card that gives flying is an evasion
         * ENABLER, and only the second is a reason to run more creatures.
         */
        for (const g of mod.grant ?? []) {
          const kw = grantedKeyword(g);
          out.add(`grants:${kw}`);
          out.add(`kw:${kw}`);
        }
      }
      /*
       * An extra land drop is RAMP, and it had no facet at all.
       *
       * Exploration, Dryad of the Ilysian Grove, Oracle of Mul Daya, Azusa,
       * Aesi and The Gitrog Monster compiled to a `restriction` modification,
       * which produced nothing here, so the eleven best lands-matter cards in
       * the format read as doing nothing and the builder could not place any of
       * them.
       *
       * A FACET OF ITS OWN rather than `cares:type:land`, which was measured
       * first and is the Bone Saw mistake in a new word: 85 cards in the top
       * 2,000 carry it, and among them Cyclonic Rift, Anguished Unmaking and
       * Stroke of Midnight, which mention lands only to say "nonland
       * permanent". Nine rescues against three removal spells filed as ramp is
       * not a narrower version of the right rule.
       *
       * The `eff:` prefix on something that is not an Effect verb follows
       * `eff:pump` directly above, which comes from a pt modification for the
       * same reason: the facet vocabulary describes what a card DOES for a deck
       * builder, and the layer it was written on is not that.
       */
      if (mod.layer === 'restriction' && mod.rule.rule === 'max-lands-per-turn') {
        out.add('eff:extra-land-drop');
      }
      /*
       * A permission to play or cast out of the graveyard, split by what the
       * permission covers, because the two halves are two different jobs:
       *
       *   eff:play-from-graveyard   LANDS. Crucible of Worlds (597) and Ramunap
       *                             Excavator (476): more land drops over a
       *                             game, which is why the engine files it as
       *                             ramp.
       *   eff:cast-from-graveyard   NONLAND cards. Karador, Lurrus, Rivaz: a
       *                             second hand, which is card advantage and
       *                             files as recursion under `draw`.
       *
       * Muldrotha carries both, Crucible only the first, Karador only the
       * second. One verb for the pair would put Karador in ramp, and a
       * qualifier facet beside it would change nothing, because a role check
       * asks whether ONE facet is present. Same reasoning as
       * `eff:exile-graveyard` and `eff:exile-own`: a separate verb, not a
       * qualifier.
       *
       * The FILTER decides, not the word the card printed. The DSL does not
       * keep the verb, because a land is played and a spell is cast whatever
       * the sentence said (CR 305.1, 601.1), so "play Forests" and "play
       * lands" are one permission and "cast a creature spell" is another.
       *
       * `eff:play-from-graveyard` was declared, wired into `ramp`, and fed by
       * nothing until this block — CLAUDE.md's fifth instance of that shape.
       */
      if (mod.layer === 'restriction' && mod.rule.rule === 'may-play-from') {
        const { from, what } = mod.rule;
        if (from === 'graveyard' && what.sel === 'all') {
          out.add('cares:zone:graveyard');
          if (mayMatchLand(what.where)) out.add('eff:play-from-graveyard');
          if (mayMatchNonland(what.where)) out.add('eff:cast-from-graveyard');
          readFilter(what.where, out, 'cares');
        }
      }
    }
    return;
  }

  if (ability.kind === 'replacement') {
    if (ability.result.do === 'enters-with-counters') {
      out.add('eff:add-counters');
      out.add(`ctr:${ability.result.counter.toLowerCase()}`);
    }
    if (ability.result.do === 'additional') {
      readEffects(ability.result.effects, out, (ability as { targets?: readonly TargetSpec[] }).targets);
    }
    /*
     * "If you tap a permanent for mana, it produces twice as much" is Mana
     * Reflection, and a deck runs it as ramp. The record carries no `add-mana`
     * effect to read, because a multiplier is a factor and not an amount, so
     * the verb is written here the way `enters-with-counters` writes
     * `eff:add-counters` above. No `mana:` figure with it: twice what a
     * permanent makes is not a number this card knows, and one would be
     * invented.
     */
    if (ability.event.on === 'tapped-for-mana' && ability.result.do === 'multiply') {
      out.add('eff:add-mana');
      readSelector(ability.event.who, out);
    }
  }
}

/**
 * WHAT THE ABILITY COSTS TO USE, which is half of what it does.
 *
 * Sol Ring reads `{T}: Add {C}{C}` and a Dimir Signet reads `{1}, {T}: Add
 * {U}{B}`. Every other fact about the two cards is identical — artifact, adds
 * mana, adds two of it — so without this facet they are the same card, and
 * measured on 2026-08-23 that is exactly what happened: ranking a Sol Ring page
 * on facets alone returned ten Signets at a perfect score and pushed Mana Crypt
 * off the list. The activation cost is the argument that separates them, and
 * throwing an argument away is the precise mistake the XMage re-extraction
 * exists to stop making.
 *
 * `{X}` costs are not a number, so a cost containing one contributes nothing
 * rather than a floor pretending to be a price. That is `parseCost`'s rule and
 * it is read from `parseCost`, not restated here.
 *
 * Capped at 3, like `mana:`, because past that the exact figure stops
 * separating cards a player would compare.
 */
function readActivationCost(costs: readonly Cost[] | undefined, out: Set<Facet>): void {
  let mana = 0;
  let sawMana = false;
  for (const cost of costs ?? []) {
    /* WHAT THE COST IS, not only what it costs in mana.
       ------------------------------------------------------------------
       A sacrifice outlet is a card whose ABILITY COSTS a sacrifice, and this
       function used to walk straight past every non-mana cost. Measured on
       2026-08-30, all five of the outlets a Meren deck is built on are
       `rec:full` — the compiler read every word — and not one carried a facet
       saying you could sacrifice to it:

         Ashnod's Altar     134   read as "adds 2 mana", a mana rock
         Viscera Seer       255   read as "scries"
         Phyrexian Altar    310   read as "adds 1 mana"
         Goblin Bombardment 457   read as "deals damage"
         Carrion Feeder     614   read as "adds counters"

       Aristocrats is one of the largest archetypes in the format and the engine
       could not see its central enabler. Worse than not seeing it: `rec:full`
       makes the absence of a facet a positive NO, so the tag fallback could not
       rescue them either.

       This is the mistake the paragraph above names by its own name. The cost
       is an argument, and throwing an argument away is what the XMage
       re-extraction exists to stop doing. What gets sacrificed is already read
       by `readSelector` below into `cares:type:creature`. */
    if (cost.pay !== 'mana') {
      const what = (cost as { what?: Selector }).what;
      /*
       * SACRIFICING ITSELF IS NOT AN OUTLET, and until 31 Aug 2026 the facet
       * could not tell the two apart.
       *
       * "Sacrifice this artifact: draw a card" and "Sacrifice a creature: add
       * two mana" both produced `cost:sacrifice`, so the aristocrats plan's
       * loudest want was answered by Vexing Bauble, Soul-Guide Lantern, Stone
       * of Erech and Hedron Archive — four cards that eat only themselves,
       * once. A Meren deck came out with twelve "when a creature dies" payoffs,
       * Grave Pact and Dictate of Erebos among them, and NOTHING that could
       * sacrifice a creature on demand.
       *
       * `cost:sacrifice` now means the card eats something else, which is what
       * an outlet is and what every consumer of the facet was written to mean.
       */
      const eatsItself = (what as { sel?: string } | undefined)?.sel === 'self';
      out.add((eatsItself ? `cost:${cost.pay}-self` : `cost:${cost.pay}`) as Facet);
      if (what) readSelector(what, out);
      continue;
    }
    const parsed = parseCost(cost.cost);
    if (parsed.hasX) {
      /*
       * AN X COST IS A MANA SINK, AND IT USED TO EMIT NOTHING.
       *
       * This was `return`, so an activated ability whose cost contains X
       * produced NO `acost:` facet at all and the card read as having no
       * activated ability whatsoever. 1,864 cards, and they are a coherent
       * archetype: Walking Ballista, Hydra, Shark Typhoon, every "mana sink"
       * a deck runs precisely because it absorbs a late-game surplus.
       *
       * Returning was right about one thing, which is why it survived: X has no
       * mana VALUE, so adding it to the total would be a lie. `acost:x` says
       * the cost is variable, which is the fact a deck cares about.
       */
      out.add('acost:x');
      sawMana = true;
      continue;
    }
    mana += parsed.manaValue ?? 0;
    sawMana = true;
  }
  if (!sawMana && (costs ?? []).length === 0) return;
  out.add(`acost:${Math.min(mana, 3)}`);
}

/**
 * WHOSE TRIGGER, AND WHICH STEP. Three words the record already held and the
 * facet layer threw away.
 *
 * `scripts/probe/silent-facets.mjs` ranks the facets a commander carries that
 * produce no want. After `trig:attacks` the next three rows were `trig:enters`
 * (263 thin commanders), `trig:cast` (131) and `trig:step` (208), and every one
 * of them was REFUSED as a plan rule for the same reason: the word names two
 * opposite decks at once.
 *
 *   trig:enters   Ghalta triggers on ITSELF arriving, so the deck wants ways to
 *                 blink it. Tatyova and Purphoros trigger on OTHER permanents
 *                 arriving, so the deck wants lands and creatures instead.
 *   trig:cast     Birgi and K'rrik are paid when YOU cast, which is a
 *                 spellslinger deck. Lotho, Mangara, Kambal and Nezahal are
 *                 paid when an OPPONENT casts, which is a stax deck.
 *   trig:step     an upkeep trigger, an end step trigger and a beginning of
 *                 combat trigger are three different cards.
 *
 * The DSL has carried the distinction all along - `{on:'cast', what, by}`,
 * `{on:'enters', who}`, `{on:'step', step, whose}` - and only the flattening to
 * one word lost it. This is the `effect.who` finding of 1 Sep 2026 repeated on
 * triggers: a mandatory field, present on every emission, read by nothing.
 *
 * A SEPARATE WORD, NOT A QUALIFIER, for the reason `eff:exile-own` is one: a
 * plan rule and a role check both ask whether ONE facet is present, so a
 * `by:opponent` facet sitting beside `trig:cast` would change nothing because
 * nothing would consult it.
 *
 * THE BASE FACET IS ALWAYS STILL EMITTED, so nothing that reads `trig:cast`
 * today loses anything, and UNKNOWN STAYS UNKNOWN - an absent `by` adds no
 * word rather than guessing "you". Guessing is what produced the 574 misfiled
 * cards the `effect.who` split had to undo.
 */
function readTriggerDirection(
  event: { on: string } & Record<string, unknown>,
  out: Set<Facet>
): void {
  if (event.on === 'cast') {
    const by = (event as { by?: { who?: string } }).by?.who;
    if (by === 'each-opponent') out.add('trig:cast-opponent');
    else if (by === 'you') out.add('trig:cast-own');
    return;
  }
  if (event.on === 'enters') {
    const who = (event as { who?: { sel?: string } }).who?.sel;
    if (who === 'self') out.add('trig:enters-self');
    else if (who) out.add('trig:enters-other');
    return;
  }
  if (event.on === 'step') {
    const step = (event as { step?: string }).step;
    if (typeof step === 'string' && step) out.add(`trig:step:${step.replace(/_/g, '-')}`);
  }
}

function readTriggerEvent(event: { on: string } & Record<string, unknown>, out: Set<Facet>): void {
  const who = (event as { who?: Selector; what?: Selector }).who ?? (event as { what?: Selector }).what;
  if (who) readSelector(who, out);
  const counter = (event as { counter?: string }).counter;
  if (typeof counter === 'string' && counter) out.add(`ctr:${counter.toLowerCase()}`);
}

function readEffects(
  effects: readonly Effect[] | undefined,
  out: Set<Facet>,
  targets?: readonly TargetSpec[]
): void {
  for (const e of effects ?? []) readEffect(e, out, targets);
  if (isWheel(effects)) {
    out.add('eff:wheel');
    out.add('scope:all');
  }
}

/**
 * A WHEEL: every player throws their hand away and every player draws, in the
 * same effect list.
 *
 * `eff:wheel` is a word the Tagger has supplied for months (`wheel-symmetrical`
 * maps to `eff:draw cares:zone:hand scope:all eff:wheel`) and the compiler
 * never produced, because it could not read "discards their hand" at all. Now
 * that it can, the same card must come out of both readers with the same word,
 * or a card the compiler reads loses the facet the Tagger was giving it — the
 * merge in `cards_pool` lets a non-gated tag speak only where the compiler is
 * silent, so a better reading would have been a worse record.
 *
 * This is a conjunction over facets, and CLAUDE.md is right that those are only
 * sound when the facets provably come from the same clause. Here they do: both
 * effects are members of ONE effect list, which is one sentence of one ability,
 * so a card that discards in one paragraph and draws in another is not a wheel
 * and does not read as one. `scope:all` is added for the same reason `eff:wheel`
 * is: it is what the Tagger says about the shape, and it is true — the effect
 * reaches every player rather than one.
 *
 * Only the SYMMETRICAL wheel. "Discard your hand, then draw seven cards" aimed
 * at one player is a refill, and the Tagger's `wheel-one-sided` carries no
 * `eff:wheel` either. The verbs themselves are left as they were: `eff:discard`
 * because the discard reaches opponents, `eff:draw-each` because the draw is
 * everybody's. Those judgements belong to the aim rules above, not here.
 */
function isWheel(effects: readonly Effect[] | undefined): boolean {
  if (!effects) return false;
  const everyone = (e: Effect): boolean =>
    aimOfPlayer((e as { who?: PlayerSelector }).who) === 'everyone';
  const emptiesHands = effects.some(
    (e) => e.do === 'discard' && (e as { count?: unknown }).count === 'hand' && everyone(e),
  );
  const refills = effects.some((e) => e.do === 'draw' && everyone(e));
  return emptiesHands && refills;
}

/**
 * One effect.
 *
 * Control flow members recurse; everything else contributes its verb and
 * whatever arguments the deck builder can use. The recursion is what makes
 * "destroy all creatures" inside a mode of a modal spell count the same as one
 * printed on its own line, which the tag matcher could never do.
 */
function readEffect(effect: Effect, out: Set<Facet>, targets?: readonly TargetSpec[]): void {
  switch (effect.do) {
    case 'if':
      readEffects(effect.then, out, targets);
      readEffects(effect.else, out, targets);
      return;
    /* Both branches are read, and the verb itself is recorded, because a deck
     * built around "you may pay 2 life: draw a card" is built around a
     * repeatable optional cost, and a reader that saw only the draw would price
     * it as a cantrip. */
    case 'do-if-cost-paid':
      out.add('eff:do-if-cost-paid');
      readEffects(effect.then, out, targets);
      readEffects(effect.else, out, targets);
      return;
    case 'for-each':
    case 'repeat':
    case 'may':
    case 'unless-pays':
      if (effect.do === 'unless-pays') out.add('eff:unless-pays');
      readEffects(effect.effects, out, targets);
      return;
    case 'choose-mode':
      for (const m of effect.modes) readEffects(m.effects, out, targets);
      return;

    /*
     * `manual` is not a gap to be skipped. The compiler assigns a hint id from
     * a named rule in `effect-rules.ts`, so "proliferate" is a rule that fired,
     * not a word that appeared. Four of those ids are things a deck is built
     * around, and proliferate is the whole of Atraxa, so the id is read and
     * anything else stays unread rather than being guessed at.
     */
    case 'manual': {
      const id = manualId(effect.hint ?? effect.text ?? '');
      if (id) out.add(`eff:${id}`);
      return;
    }

    case 'xmage-body':
      // A pointer at translated Java. It carries no verb, so there is nothing
      // to read and `CARD-SEMANTICS.md` says so in as many words.
      return;

    case 'add-mana': {
      out.add('eff:add-mana');
      const pips = (effect.mana.match(/\{[^}]+\}/g) ?? []).length;
      if (pips > 0) out.add(`mana:${Math.min(pips, 3)}`);
      return;
    }

    case 'create-token': {
      out.add('eff:create-token');
      readToken(effect.token, out);
      return;
    }

    case 'add-counters':
    case 'remove-counters': {
      /*
       * WHOSE COUNTERS. "Put a +1/+1 counter on Korvold" and "put a +1/+1
       * counter on each creature you control" both compiled to the same two
       * facets, so Korvold, Fae-Cursed King and Animar, Soul of Elements - a
       * sacrifice commander and a creature-cast commander - both planned as
       * +1/+1 counters decks and were built around Hardened Scales. The same
       * fault as `effect.who` on the other verbs, on the one verb that names
       * its object with a selector rather than a player.
       *
       * A SEPARATE WORD, on the precedent of `cost:sacrifice-self` and
       * `eff:exile-self`: a qualifier alongside `eff:add-counters` would change
       * nothing, because a role or a plan rule asks whether a card carries ONE
       * facet. Managorger Hydra and Forgotten Ancient move with it, and a
       * counters shell that wants them names them through this word.
       */
      const own = effect.do === 'add-counters' && (effect.what as { sel?: string }).sel === 'self';
      out.add(own ? 'eff:add-counters-self' : `eff:${effect.do}`);
      out.add(own ? `ctr:${effect.counter.toLowerCase()}-self` : `ctr:${effect.counter.toLowerCase()}`);
      readSelector(effect.what, out);
      return;
    }

    case 'player-counter':
      out.add('eff:player-counter');
      out.add(`ctr:${effect.counter.toLowerCase()}`);
      return;

    case 'return-from':
      /*
       * FROM THE HAND IS NOT RECURSION.
       *
       * "Put a land card from your hand onto the battlefield" compiles to the
       * same verb as "return a creature card from your graveyard to your hand",
       * because the DSL has one word for "move N cards matching this out of a
       * zone". The deck-building reading is not the same word: `eff:return-from`
       * is in the `draw` role and is what every reanimator plan asks for, so
       * reading Sakura-Tribe Scout as `eff:return-from` would file it as card
       * advantage and offer it to Meren. Same shape as `eff:exile-graveyard`
       * and `eff:exile-own`: a separate word, not a qualifier, because a role
       * check asks whether ONE facet is present.
       *
       * A land from hand onto the battlefield is an extra land drop in every
       * sense a deck builder means — Chulane, Uro and Growth Spiral are ramp —
       * so it takes the word Exploration already carries. Anything else from
       * the hand (Elvish Piper, Sneak Attack, Stoneforge Mystic's activation)
       * is `eff:put-onto-battlefield`. "A creature or land card" (Court of
       * Bounty) carries both, because it does both.
       */
      if (effect.zone === 'hand' && effect.to === 'battlefield') {
        const where = effect.what.sel === 'all' ? effect.what.where : null;
        const land = where !== null && namesLand(where);
        if (land) out.add('eff:extra-land-drop');
        if (!land || where === null || namesNonLand(where)) out.add('eff:put-onto-battlefield');
        out.add('cares:zone:hand');
        readSelector(effect.what, out);
        return;
      }
      out.add('eff:return-from');
      out.add(`cares:zone:${effect.zone}`);
      readSelector(effect.what, out);
      return;

    case 'move-zone': {
      /*
       * BOUNCING YOUR OWN PERMANENT IS NOT BOUNCING THEIRS.
       *
       * Chulane's "{3}, {T}: Return target creature you control to its owner's
       * hand" and Cyclonic Rift both compiled to `move-zone` to hand, and the
       * facet said `eff:move-zone` for both, so a Chulane or Animar plan
       * asking for creatures that come back to be cast again could only ask
       * for the facet every removal-shaped bounce spell also carries. Same
       * fault and same fix as `eff:exile-own`: the direction goes IN the
       * verb, because a role check and a plan want both ask whether the card
       * carries one facet.
       *
       * Only a bounce, `to: 'hand'`. Putting your own creature on top of its
       * library is a different card and keeps the plain verb. And a LAND
       * bounce keeps it too: "return target land you control to its owner's
       * hand" is the karoo shape, not a creature coming back for a recast.
       */
      /*
       * AND A NON-CREATURE RETURNING ITSELF IS NOT A CREATURE COMING BACK.
       *
       * Rancor (829) says "return Rancor to its owner's hand" and Batterskull
       * (4,993) and Spine of Ish Sah say the same of themselves. Every one is
       * a bounce of your own permanent and none of them is what Chulane,
       * Teller of Tales or Animar, Soul of Elements is paid for, which is a
       * CREATURE re-entering the stack. Measured 3 Sep 2026: 182 cards in
       * Chulane's colours carried `eff:bounce-own` and the ones the ranker
       * reached first were Rancor and Spine of Ish Sah, so his "bounce your
       * own creatures to cast them again" job stayed empty with the facet in
       * place and the plan asking for it.
       *
       * A creature returning ITSELF still counts: Whitemane Lion and Shrieking
       * Drake are exactly the cards, and their own re-entry is the recast.
       * So the test is on the card, not on the selector: a `self` bounce
       * belongs to a creature or it is not this.
       */
      const bouncesSelfOnly = (effect.what as { sel?: string }).sel === 'self';
      const own =
        effect.to === 'hand' &&
        isSelfAimed(aimOfSelector(effect.what, targets)) &&
        !selectsLand(effect.what, targets) &&
        !(bouncesSelfOnly && !out.has('type:creature'));
      out.add(own ? 'eff:bounce-own' : 'eff:move-zone');
      out.add(`cares:zone:${effect.to}`);
      readSelector(effect.what, out);
      return;
    }

    case 'search-library':
      out.add('eff:search-library');
      // A search that finds lands is ramp, a search that finds anything else is
      // a tutor. The filter is what says which, so the filter is read.
      if (effect.what.sel === 'all' && namesType(effect.what.where, 'land')) {
        out.add('cares:zone:library-land');
      }
      readSelector(effect.what, out);
      return;

    case 'pump': {
      /*
       * A SIGN, because minus two is not an anthem.
       *
       * `ROLE_FACETS.enhance` reads `eff:pump`, so every mass minus-N sweeper
       * in the format was filed as a card that makes your creatures better.
       * Measured: 116 cards carry a negative mass pump and no positive pump
       * anywhere on the card. Massacre Wurm (513), Massacre Girl (1702),
       * Doomwake Giant (1788), Languish (5684).
       *
       * Shrinking an opponent's board IS removal, so the new verb goes in that
       * role rather than nowhere: it kills things, which is the job.
       *
       * The numbers can be expressions rather than literals, and an expression
       * whose sign cannot be read stays `eff:pump`. Refusing to guess is right
       * here, because guessing the sign backwards is what this fixes.
       */
      const num = (v: unknown): number | null =>
        typeof v === 'number' ? v : null;
      const p = num((effect as { power?: unknown }).power);
      const t = num((effect as { toughness?: unknown }).toughness);
      const negative = (p !== null && p < 0) || (t !== null && t < 0);
      const positive = (p !== null && p > 0) || (t !== null && t > 0);
      out.add(negative && !positive ? 'eff:shrink' : 'eff:pump');
      readSelector(effect.what, out);
      /*
       * A pump SIZED BY A CREATURE'S POWER is a card that wants big creatures.
       *
       * Xenagos doubles whatever he points at, Berserk doubles the power of
       * its target, Wild Beastmaster pumps the team by his own power: every
       * one of them is worth more the bigger the creature already is, which
       * is the same want as "power 4 or greater matters". `cares:power` was
       * declared for those filters and nothing emitted it, so the word was
       * on the list and on no card. A literal +2/+2 does not care how big the
       * creature was, so it stays silent.
       */
      if (readsStat(effect.power) || readsStat(effect.toughness)) out.add('cares:power');
      /* Same distinction as the static layer above: a pump spell that grants
         trample is an evasion ENABLER, not a card that has trample. */
      for (const g of effect.grant ?? []) {
        const kw = grantedKeyword(g);
        out.add(`grants:${kw}`);
        out.add(`kw:${kw}`);
      }
      return;
    }

    case 'exile': {
      /*
       * EXILING A GRAVEYARD IS NOT REMOVAL, and the flat facet set cannot say
       * so any other way.
       *
       * `ROLE_FACETS.removal` reads `eff:exile`, so the moment the compiler
       * learned to read "exile all graveyards" — Soul-Guide Lantern, Tormod's
       * Crypt, Relic of Progenitus — every piece of graveyard hate in the
       * format became an ANSWER, and the builder started reaching for them to
       * fill removal slots. That is worse than not reading the card at all: it
       * takes a slot from a card that removes something.
       *
       * A separate verb rather than a qualifier on the role, because the
       * distinction is a fact about the EFFECT and belongs where the effect is
       * read. It is also the exact facet anti-synergy will key on: a card that
       * empties a graveyard, in a deck whose plan is built on one.
       */
      const zone =
        (effect as { from?: string }).from ?? (effect.what as { zone?: string } | undefined)?.zone;
      if (zone === 'graveyard') {
        out.add('eff:exile-graveyard');
      } else if ((effect.what as { sel?: string } | undefined)?.sel === 'self') {
        /*
         * A CARD THAT EXILES ITSELF IS NOT BLINKING YOUR BOARD.
         *
         * "{R}: Exile Urabrask, then return it to the battlefield transformed"
         * is how every New Phyrexia Praetor and every Final Fantasy Dominant
         * reaches its back face. It reads as a blink and it is not one: Syr
         * Vondam is paid when ANOTHER creature you control is exiled, so a card
         * exiling itself pays him nothing, and a blink DECK wants cards that
         * flicker its other creatures repeatedly.
         *
         * Measured: widening the blink rule to read "... transformed under its
         * owner's control" gave 14 cards the facet, all of them correctly a
         * blink of SOMETHING — and Syr Vondam's archetype score fell 6/60 to
         * 4/60, because those cards took the reserved slots that Eerie
         * Interlude and Ghostway had. Better reading, worse deck, and the gap
         * between the two was this distinction.
         *
         * Same shape and same precedent as `cost:sacrifice` against
         * `cost:sacrifice-self`, and as the whole `effect.who` split: a
         * separate verb, never a qualifier, because a role check asks whether a
         * card carries ONE facet and a qualifier alongside would change nothing.
         */
        out.add('eff:exile-self');
      } else if (isSelfAimed(aimOfSelector(effect.what, targets))) {
        /* EXILING YOUR OWN BOARD IS PROTECTION, not an answer. Teferi's
           Protection (rank 109) and Eerie Interlude (956) were filed as
           removal, and 140 cards catalogue-wide held the removal role on
           nothing but this. It is also, precisely, what a blink spell does. */
        out.add('eff:exile-own');
      } else {
        out.add('eff:exile');
      }
      readSelector(effect.what, out);
      return;
    }

    case 'destroy':
    case 'tap': {
      /* Destroying or tapping YOUR OWN permanents is a cost or an engine, never
         an answer. Krark-Clan Ironworks and Springleaf Drum were both filed as
         removal and interaction respectively on this exact confusion. */
      const aim = aimOfSelector(effect.what, targets);
      out.add(isSelfAimed(aim) ? `eff:${effect.do}-own` : `eff:${effect.do}`);
      readSelector(effect.what, out);
      return;
    }

    case 'untap':
    case 'counter':
      out.add(`eff:${effect.do}`);
      readSelector(effect.what, out);
      return;

    case 'gain-control':
      out.add('eff:gain-control');
      readSelector(effect.what, out);
      return;

    case 'sacrifice':
      out.add('eff:sacrifice');
      readSelector(effect.what, out);
      return;

    /*
     * AN OPEN CHOICE, AND WHAT IT IS ABOUT.
     *
     * `eff:choose` alone would say a decision happens and nothing about what
     * the card is for. The subject is the whole point: fifty cards choose a
     * CREATURE TYPE as they enter, and every one is a tribal card — Shared
     * Triumph, Circle of Solace, Roaming Throne, Secluded Courtyard, Rally the
     * Ranks. Before this they produced no record at all and the deck builder
     * could not see them.
     *
     * `cares:sub:chosen` rather than a real subtype, because the type is picked
     * by the player at the table. Naming a subtype here would be an invention:
     * Secluded Courtyard is not a Goblin card, it is a card that becomes one.
     * The pseudo-value keeps it inside the prefix the whole engine already
     * reads for tribal, so `planForCommander` and the tagger both find it
     * without a new rule.
     *
     * A colour or a player is not a deck-building signal, so those carry the
     * verb and nothing more. A facet nothing acts on is noise.
     */
    case 'choose':
      out.add('eff:choose');
      if (effect.what === 'creature-type') out.add('cares:sub:chosen');
      if (effect.what === 'basic-land-type') out.add('cares:type:land');
      return;

    case 'draw': {
      /* GROUP HUG IS NOT CARD ADVANTAGE. 28 cards make each player draw with
         no draw for you, and 26 held the `draw` role on nothing else, so
         Temple Bell (1899) was indistinguishable from Rhystic Study. */
      const aim = aimOfPlayer((effect as { who?: PlayerSelector }).who);
      out.add(aim === 'everyone' || aim === 'opponent' ? 'eff:draw-each' : 'eff:draw');
      /* A REVEALED DRAW READS THE TOP OF THE LIBRARY. "Reveal the top card of
         your library and put that card into your hand" is Dark Confidant and
         Yuriko, and what is on top decides what the card costs or deals, so a
         deck built around one wants the top of its library arranged. That is
         the want `cares:zone:library` already carries for every plan that
         plays off the top, and a plain draw does not care what it draws. */
      if ((effect as { revealed?: boolean }).revealed) out.add('cares:zone:library');
      return;
    }

    case 'discard': {
      /* LOOTING IS NOT INTERACTION. 279 cards held the interaction role solely
         on an `eff:discard` aimed at the caster: Faithless Looting (97),
         Frantic Search (101). Discarding your own cards is card selection, and
         the draw half of the card already says so. */
      const aim = aimOfPlayer((effect as { who?: PlayerSelector }).who);
      out.add(isSelfAimed(aim) ? 'eff:discard-self' : 'eff:discard');
      /* A whole hand, not a card or two. The zone facet is what the Tagger
         already says about every wheel and about "discards their hand", and
         it is the facet a hand-size deck asks for. */
      if ((effect as { count?: unknown }).count === 'hand') out.add('cares:zone:hand');
      return;
    }

    case 'damage': {
      /* PAYING LIFE TO MAKE MANA IS NOT REMOVAL. 60 cards deal damage only to
         their own controller and 58 held the removal role on nothing else.
         Talisman of Dominance (rank 93) came back `ramp, removal`. */
      const aim = aimOfPlayer((effect as { to?: PlayerSelector }).to as PlayerSelector | undefined);
      const selfHit = isSelfAimed(aim) || isSelfAimed(aimOfSelector((effect as { to?: Selector }).to as Selector | undefined, targets));
      out.add(selfHit ? 'eff:damage-self' : 'eff:damage');
      if ('sel' in (effect.to as object)) readSelector(effect.to as Selector, out);
      return;
    }

    case 'look-and-pick':
      /*
       * A dig reads the top of the library, and that is what the plan rules
       * for "plays cards straight off the top of your library" ask for. The
       * selector-carrying verbs say so through `readSelector`, which emits the
       * zone of every non-battlefield selector; this member carries a bare
       * filter and no selector, so the zone has to be said here. The filter
       * itself is read by the `readCaresFilters` sweep.
       */
      out.add('eff:look-and-pick');
      out.add('cares:zone:library');
      /* A dig that puts the card ONTO THE BATTLEFIELD is Elvish Piper by
         another route: Kinnan's activation, Collected Company, Lurking
         Predators. The plan rule for cheating things in wants big bodies,
         and a dig into the hand (Impulse) is not that. */
      if ((effect as { pickedTo?: { zone?: string } }).pickedTo?.zone === 'battlefield') {
        out.add('eff:put-onto-battlefield');
      }
    case 'impulse':
      /* RED'S CARD DRAW, and NOT `eff:exile`. Light Up the Stage exiles two
         cards and gives them back; filing that under the verb that puts Swords
         to Plowshares in the removal role would spend a removal slot on a draw
         spell. `cares:zone:exile` is the fact a Prosper deck keys on: he is
         paid whenever a card is PLAYED from exile, and this is how the cards
         get there. */
      out.add('eff:impulse');
      out.add('cares:zone:exile');
      return;

    case 'mill':
    case 'gain-life':
    case 'lose-life':
    case 'set-life':
    case 'poison':
    case 'shuffle':
    case 'scry':
    case 'surveil':
    case 'attach':
    case 'set-monarch':
    case 'win-game':
    case 'lose-game':
      out.add(`eff:${effect.do}`);
      return;

    default:
      return;
  }
}

/**
 * The named `manual` hints worth reading, and only these.
 *
 * Each is a rule id in `effect-rules.ts`, matched on the hint's own prefix
 * because that is how the hint is assembled there: `"<id>: <why it refused>"`.
 * A hint whose id is not on this list contributes nothing, which is the same
 * refusal the compiler already made.
 */
/*
 * `bounce-own` is the untargeted "return a creature you control to its owner's
 * hand": Whitemane Lion, Shrieking Drake, Kor Skyfisher, Cloudstone Curio. The
 * compiler refuses to pick which creature (that is the player's choice, and
 * `{sel:'all'}` would bounce them all), so the record is a marker — but a
 * named one, and the name is what lets a Chulane deck find the cards it is
 * built on. The targeted and self forms reach the same facet through
 * `move-zone` above.
 */

/* `cast-free` joined on 3 Sep 2026. The verb had been in `EFFECT_VERBS` since
   the vocabulary was written and nothing in this file could ever emit it: the
   compiler had no rule for "cast ... without paying its mana cost", so Etali,
   Mizzix's Mastery and Electrodominance reached a plan only through Tagger.
   A card whose ONLY readable clause is the free cast (Rishkar's Expertise)
   still does: a marker alone is not a record, and that refusal is right. */
const MANUAL_IDS: readonly string[] = ['proliferate', 'extra-turn', 'extra-combat', 'scry', 'bounce-own', 'cast-free'];

function manualId(hint: string): string | null {
  const head = hint.split(':')[0].trim().toLowerCase();
  return MANUAL_IDS.includes(head) ? head : null;
}

function readToken(token: TokenSpec, out: Set<Facet>): void {
  const line = token.typeLine ?? '';
  const dash = line.search(/[—-]/);
  const subs = dash >= 0 ? line.slice(dash + 1) : '';
  for (const word of subs.trim().split(/\s+/)) {
    const w = word.trim().toLowerCase();
    if (w) out.add(`tok:${w}`);
  }
  if (!subs && token.name) out.add(`tok:${token.name.trim().toLowerCase()}`);
}

/**
 * A selector: what an effect is pointed at.
 *
 * `sel:'all'` with a filter is a mass effect and gets `scope:all`, which is the
 * facet that separates Wrath of God from Doom Blade. The filter itself becomes
 * `cares:` facets, which is how "destroys all creatures" and "destroys all
 * lands" stop being the same fact.
 */
/* ------------------------------------------------------------------ *
 * WHO AN EFFECT IS AIMED AT
 * ------------------------------------------------------------------ */

/**
 * Whose stuff an effect touches.
 *
 * ## The defect this exists to fix
 *
 * The word "controller" appeared ZERO times in this file, and `effect.who` was
 * never read, despite `who` being a mandatory field on nineteen effect verbs
 * and present on 9,202 of 9,202 emissions. Every effect was recorded as though
 * it were aimed at an opponent.
 *
 * Measured over all 33,032 cards: **574 cards hold a role SOLELY because the
 * facet cannot say who the effect is aimed at**, 546 of them non-land and
 * therefore competing for real spell slots.
 *
 *     eff:discard   279   Faithless Looting (97) is INTERACTION. It is looting.
 *     eff:exile     140   Teferi's Protection (109) is REMOVAL. It is the best
 *                         protection spell in the format.
 *     eff:damage     63   Talisman of Dominance (93) is REMOVAL, because it
 *                         deals one damage to YOU to make mana.
 *     eff:tap        41
 *     eff:pump       36
 *     eff:destroy    13
 *
 * The owner's friend found this from the other end: *"blink and bounce can also
 * be protection"*. He was right, and blink was one instance of a general fault.
 *
 * ## Why a separate verb and not a qualifier
 *
 * `ROLE_FACETS.removal` reads `eff:exile`, and a role check asks whether the
 * card carries that one facet. An `aims:self` facet sitting alongside would
 * change nothing, because nothing would consult it. So the direction has to be
 * IN the verb, which is exactly the precedent `eff:exile-graveyard` set when
 * reading graveyard hate turned every piece of it into an answer.
 *
 * ## Unknown means unknown
 *
 * A `{sel:'target'}` can be anything, and the ability's targeting restriction
 * lives on the `TargetSpec` rather than here. Returning 'unknown' for those is
 * deliberate: guessing "opponent" is what produced the 574, and guessing "you"
 * would strip removal off the whole format. Only a selector that SAYS whose it
 * is counts.
 */
type Aim = 'you' | 'opponent' | 'everyone' | 'unknown';

function aimOfPlayer(who: PlayerSelector | undefined): Aim {
  switch (who?.who) {
    case 'you': return 'you';
    case 'each-opponent': return 'opponent';
    case 'each-player': return 'everyone';
    default: return 'unknown';
  }
}

function aimOfSelector(sel: Selector | undefined, targets?: readonly TargetSpec[]): Aim {
  if (!sel) return 'unknown';
  /* The card itself. Vexing Bauble exiling itself is not removal. */
  if (sel.sel === 'self' || sel.sel === 'attached') return 'you';
  if (sel.sel === 'all') return aimOfPlayer(sel.controller);
  /*
   * A TARGET SAYS WHOSE IT IS ON THE TargetSpec, NOT ON THE SELECTOR.
   *
   * "Exile any number of target creatures you control" compiles to
   * `{sel:'target', ref:0}`, and the "you control" lives on `targets[0]
   * .controller`. Without this lookup Eerie Interlude stayed filed as REMOVAL
   * after the rest of the direction work landed, which is how this gap was
   * found: seven of eight test cards moved and it did not.
   */
  if (sel.sel === 'target') {
    const spec = (targets ?? []).find(t => t.ref === sel.ref);
    return aimOfPlayer(spec?.controller);
  }
  return 'unknown';
}

/** True when the effect touches only the caster's own side. */
const isSelfAimed = (aim: Aim): boolean => aim === 'you';

/** Does the filter say what the spell must TARGET? `{is:'targets'}` under `and`/`or`. */
function namesTargets(filter: CardFilter | undefined): boolean {
  if (!filter) return false;
  switch (filter.is) {
    case 'targets': return true;
    case 'and':
    case 'or': return filter.of.some(namesTargets);
    default: return false;
  }
}

/** The card types a filter names positively: `type` leaves under `and`/`or`, never under `not`. */
function typesNamedBy(filter: CardFilter | undefined): string[] {
  if (!filter) return [];
  switch (filter.is) {
    case 'type': return [filter.value.toLowerCase()];
    case 'and':
    case 'or': return filter.of.flatMap(typesNamedBy);
    default: return [];
  }
}

/**
 * Does this amount read a creature's power or toughness anywhere inside it?
 *
 * Walked structurally rather than by case, because a `ValueExpr` nests —
 * `{v:'mul', of:[2, {v:'power', …}]}` — and a walker keyed on today's members
 * would go quiet the day a new arithmetic member arrives. It answers only
 * "is a stat read", never whose; the pump case above is the one asking.
 */
function readsStat(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const v = (value as { v?: unknown }).v;
  if (v === 'power' || v === 'toughness') return true;
  return Object.values(value).some(readsStat);
}

function readSelector(selector: Selector, out: Set<Facet>): void {
  if (selector.sel !== 'all') return;
  out.add('scope:all');
  if (selector.zone && selector.zone !== 'battlefield') out.add(`cares:zone:${selector.zone}`);
  readFilter(selector.where, out, 'cares');
}

function readFilter(filter: CardFilter, out: Set<Facet>, prefix: 'cares'): void {
  switch (filter.is) {
    case 'type':
      out.add(`${prefix}:type:${filter.value.toLowerCase()}`);
      return;
    case 'subtype':
      out.add(`${prefix}:sub:${filter.value.toLowerCase()}`);
      return;
    case 'keyword':
      out.add(`kw:${filter.value.toLowerCase()}`);
      return;
    case 'has-counter':
      out.add(`ctr:${filter.counter.toLowerCase()}`);
      return;
    case 'token':
      out.add(`${prefix}:type:token`);
      return;
    case 'not':
      /*
       * A NEGATED FILTER IS NOT A THING THE CARD CARES ABOUT, and this case
       * walked into it and read the inside as if it were. Brago, King Eternal
       * blinks "any number of target nonland permanents"; the target compiles
       * correctly to `{is:'not', of:{is:'type', value:'land'}}`, this emitted
       * `cares:type:land`, the plan echoed it as `type:land` at 0.90, and a
       * blink commander wanted lands harder than anything on his card. Same
       * class as "non-Human" and "Protection from Humans" in the word scans:
       * a negative frame read as a positive one. The filter says what to
       * EXCLUDE; nothing is wanted.
       */
      return;
    case 'and':
    case 'or':
      for (const f of filter.of) readFilter(f, out, prefix);
      return;
    default:
      return;
  }
}

/**
 * Does the moved object certainly describe a land? A bounce of your own land
 * is the karoo clause and must not read as `eff:bounce-own`. The filter lives
 * on the selector for `all` and on the `TargetSpec` for a target; `self` and
 * the pronoun selectors carry no filter, so they answer no.
 */
function selectsLand(sel: Selector, targets?: readonly TargetSpec[]): boolean {
  if (sel.sel === 'all') return namesType(sel.where, 'land');
  if (sel.sel === 'target') {
    const spec = (targets ?? []).find(t => t.ref === sel.ref);
    return spec?.filter ? namesType(spec.filter, 'land') : false;
  }
  return false;
}

/** Does this filter certainly name this card type? Used only for land search. */
function namesType(filter: CardFilter, type: string): boolean {
  switch (filter.is) {
    case 'type':
      return filter.value.toLowerCase() === type;
    case 'and':
    case 'or':
      return filter.of.some(f => namesType(f, type));
    default:
      return false;
  }
}

/**
 * Does this filter name a land, by type, by the `basic` supertype, or by a
 * basic land type? "A basic Forest card" (Gaea's Touch) carries no `type` leaf
 * at all and is still a land drop, which `namesType` alone would miss.
 * `BASIC_LAND_TYPES` is the set declared beside `readOwnTypeInRules` above.
 */
function namesLand(filter: CardFilter): boolean {
  switch (filter.is) {
    case 'type':
      return filter.value.toLowerCase() === 'land';
    case 'supertype':
      return filter.value.toLowerCase() === 'basic';
    case 'subtype':
      return BASIC_LAND_TYPES.has(filter.value.toLowerCase());
    case 'and':
    case 'or':
      return filter.of.some(namesLand);
    default:
      return false;
  }
}

/** Does this filter name a card type OTHER than land? "A creature or land card" does. */
function namesNonLand(filter: CardFilter): boolean {
  switch (filter.is) {
    case 'type':
      return filter.value.toLowerCase() !== 'land';
    case 'and':
    case 'or':
      return filter.of.some(namesNonLand);
    default:
      return false;
  }
}

/**
 * Could a LAND card satisfy this filter? Could a NONLAND card?
 *
 * Both are conservative in the same direction: a filter this cannot read
 * (a colour, a mana value bound, `any`) says yes, so an unread clause widens
 * a permission rather than hiding it. The two are separate functions rather
 * than one with a flag because `not` is asymmetric: "nonland" rules lands
 * out and rules nothing else in, while "noncreature" tells us nothing about
 * lands either way. `BASIC_LAND_TYPES` is the set the tribe reader already
 * keeps, so "You may play Forests from your graveyard" (Titania, Nature's
 * Force) reads as a land permission without the word "land" in it.
 */
function mayMatchLand(filter: CardFilter): boolean {
  switch (filter.is) {
    case 'type': return filter.value.toLowerCase() === 'land';
    case 'subtype': return BASIC_LAND_TYPES.has(filter.value.toLowerCase());
    case 'not': return !(filter.of.is === 'type' && filter.of.value.toLowerCase() === 'land');
    case 'and': return filter.of.every(mayMatchLand);
    case 'or': return filter.of.some(mayMatchLand);
    default: return true;
  }
}

function mayMatchNonland(filter: CardFilter): boolean {
  switch (filter.is) {
    case 'type': return filter.value.toLowerCase() !== 'land';
    case 'subtype': return !BASIC_LAND_TYPES.has(filter.value.toLowerCase());
    case 'and': return filter.of.every(mayMatchNonland);
    case 'or': return filter.of.some(mayMatchNonland);
    default: return true;
  }
}

/* ------------------------------------------------------------------ *
 * Bulk
 * ------------------------------------------------------------------ */

export interface FacetCensus {
  cards: number;
  compiler: number;
  xmage: number;
  none: number;
  facets: number;
}

/**
 * Read a pool, and hand back the census alongside it.
 *
 * The census is not optional and not a debug aid. The engine's fallback to tags
 * is invisible from the outside, so a caller that does not know how often it
 * fired cannot tell a behaviour-driven deck from a word-matched one.
 */
export function facetsForPool<T extends FacetInput>(
  rows: readonly T[]
): { byOracleId: Map<string, Facet[]>; census: FacetCensus } {
  const byOracleId = new Map<string, Facet[]>();
  const census: FacetCensus = { cards: 0, compiler: 0, xmage: 0, none: 0, facets: 0 };

  for (const row of rows) {
    const id = row.oracle_id;
    if (!id || byOracleId.has(id)) continue;
    const result = facetsForCard(row);
    byOracleId.set(id, result.facets);
    census.cards += 1;
    census[result.source] += 1;
    census.facets += result.facets.length;
  }

  return { byOracleId, census };
}

/**
 * The unused-value type import above is deliberate: `ValueExpr` names the shape
 * a count argument takes, and a reader looking for "where does the count go"
 * should find the answer here rather than concluding it was dropped. Counts are
 * NOT read into facets, because "create X tokens" and "create one token" are
 * the same behaviour for a deck builder and a different one only for the
 * runtime. Stated rather than silently omitted.
 */
export type CountArgument = ValueExpr;
