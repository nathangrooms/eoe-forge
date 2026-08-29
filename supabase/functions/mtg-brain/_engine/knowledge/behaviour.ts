/**
 * What a card DOES, and what a commander is FOR.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Everything the engine knew about a card until now came from `tagger.ts`,
 * which reads oracle TEXT with regexes and answers with a flat word like
 * `ramp` or `voltron`. Three failures follow from that, all of them measured
 * and written down in `docs/design/ENGINE-PICKS.md`:
 *
 *   1. `ROLE_TAGS.wincon` contains `voltron`, so every piece of Equipment in
 *      the catalogue is a win condition. All twelve win-condition slots across
 *      four measured decks were Equipment and Basilisk Collar was the win
 *      condition of all four.
 *   2. A word cannot separate two cards that share it. Bone Saw carries
 *      `equipment, voltron`; so does a Colossus Hammer. Sol Ring carries
 *      `ramp`; so does a six mana land fetch.
 *   3. A word cannot say what a COMMANDER is for, so every commander got the
 *      same deck: 60% mean pairwise overlap on nonland spells across Atraxa,
 *      Krenko, Talrand and Muldrotha, with thirty nonland cards in all four.
 *
 * A facet is not a word about a card. It is a fact about the card's structure,
 * read out of the ability record: `eff:add-mana` because the record contains an
 * `add-mana` effect, `tok:goblin` because the record creates a token whose
 * subtype is Goblin, `cares:type:instant` because a trigger's filter names the
 * instant card type. Sol Ring produces mana and Bone Saw does not, and that is
 * now a difference the engine can read rather than a difference it has to be
 * told about card by card.
 *
 * WHERE FACETS COME FROM, AND WHY NOT FROM HERE
 * ---------------------------------------------
 * They are produced OUTSIDE this tree, by `src/lib/deck/recommend/behaviour.ts`,
 * which composes the oracle-text ability compiler in `src/lib/cards/abilities/`
 * with the ported XMage records in `src/lib/cards/xmage/` under that port's own
 * precedence rule. The engine cannot do that itself: `engine-parity.test.ts`
 * requires that nothing under `src/engine/` imports outside `src/engine/`, and
 * that rule is what makes the whole tree mirrorable into an edge function. So
 * the engine declares the VOCABULARY here — every facet string a producer may
 * emit, and what the engine does with each — and reads facets off the card.
 *
 * A card with no facets is a card whose record was missing, and the engine
 * falls back to tags for it. That fallback is counted, not hidden: see
 * `facetCoverage`.
 *
 * Pure data and pure functions. No network, no AI, no database.
 */

import type { CandidateCard, DeckCard, Role } from '../core/types.ts';

/* ------------------------------------------------------------------ *
 * The vocabulary
 * ------------------------------------------------------------------ *
 *
 * A closed list, because an open one is a second tagger. A producer that wants
 * to say something new adds it here first, with the engine's use for it, or the
 * engine ignores it.
 */

/**
 * A behaviour facet: a `prefix:value` fact read from a card's ability record.
 *
 * The prefixes, and what each one is read off:
 *
 *   `type:`      a card type from the front face type line. `type:creature`.
 *   `sub:`       a subtype from the front face type line. `sub:goblin`.
 *   `kw:`        a keyword ability the record carries. `kw:flying`.
 *   `eff:`       an effect verb somewhere in the record. `eff:add-mana`.
 *   `mana:`      how many mana one `add-mana` produces. `mana:2` for Sol Ring.
 *   `acost:`     what an activated ability costs in mana. `acost:0` for Sol
 *                Ring, `acost:1` for a Signet. The two cards are identical on
 *                every other facet, so this is the one that separates them.
 *   `tok:`       a subtype of a token the record creates. `tok:goblin`.
 *   `ctr:`       a counter kind the record adds or removes. `ctr:+1/+1`.
 *   `cares:type:` a card type named by a filter the record uses.
 *   `cares:sub:`  a subtype named by a filter the record uses.
 *   `cares:zone:` a zone the record moves cards out of or into.
 *   `trig:`      a trigger event class. `trig:cast`.
 *   `scope:`     `scope:all` when an effect names every matching permanent.
 *   `rec:`       how completely the record read the card. See `REC_FULL`.
 *
 * Strings rather than a tagged union because they are stored on a card row,
 * compared by equality, and will one day be a `text[]` column with a GIN index.
 * A union would have to be serialised to exactly this on the way there.
 */
export type Facet = string;

/** Facet prefixes the engine reads. A producer may emit no others. */
export const FACET_PREFIXES: readonly string[] = [
  'type:',
  'sub:',
  'kw:',
  'eff:',
  'mana:',
  'acost:',
  'tok:',
  'ctr:',
  'cares:type:',
  'cares:sub:',
  'cares:zone:',
  'trig:',
  'scope:',
  'rec:',
];

/**
 * Every clause of the card was read and understood.
 *
 * The most load-bearing facet in the vocabulary, because it is what turns the
 * ABSENCE of another facet into evidence. Bone Saw carries `rec:full` and no
 * win-condition facet, so the engine can say Bone Saw is not a win condition
 * and stop looking. Craterhoof Behemoth carries `rec:partial` — the compiler
 * refused "creatures you control get +X/+X", which is the whole card — so the
 * absence there means NOT READ and the tags are still the best thing available.
 *
 * Without this distinction the record has to be trusted absolutely or not at
 * all, and both are wrong: absolute trust loses Craterhoof, no trust keeps
 * every Equipment as a win condition.
 */
export const REC_FULL: Facet = 'rec:full';

/** Some clauses were read and some were refused. */
export const REC_PARTIAL: Facet = 'rec:partial';

/**
 * Effect verbs a producer may emit under `eff:`.
 *
 * The first block is the `Effect` union in `src/lib/cards/abilities/dsl.ts`,
 * verb for verb. The second block is four concepts that the DSL spells as
 * `{do:'manual'}` with a named hint rather than as a verb of their own, because
 * each needs a player choice the runtime cannot make yet. They are still FACTS
 * about the card — the hint id is assigned by a rule in `effect-rules.ts`, not
 * by a regex over the whole card — and proliferate in particular is the single
 * thing an Atraxa deck is about, so refusing to read them would leave the
 * headline case unserved.
 */
export const EFFECT_VERBS: readonly string[] = [
  // The DSL's own verbs.
  'add-mana',
  'draw',
  'mill',
  'discard',
  'destroy',
  'exile',
  'sacrifice',
  'counter',
  'damage',
  'gain-life',
  'lose-life',
  'poison',
  'move-zone',
  'return-from',
  'search-library',
  'create-token',
  'add-counters',
  'remove-counters',
  'player-counter',
  'pump',
  'tap',
  'untap',
  'attach',
  'gain-control',
  'win-game',
  'lose-game',
  'set-monarch',
  'unless-pays',
  // Named `manual` hints, read by hint id.
  'proliferate',
  'extra-turn',
  'extra-combat',
  'scry',
];

/* ------------------------------------------------------------------ *
 * Reading facets off a card
 * ------------------------------------------------------------------ */

/** Anything the engine ranks or counts. Both carry facets when a record exists. */
export interface FacetCarrier {
  facets?: readonly Facet[] | null;
}

/** This card's facets, or an empty list when no record was produced for it. */
export function facetsOf(card: FacetCarrier | null | undefined): readonly Facet[] {
  const f = card?.facets;
  return f && f.length ? f : EMPTY;
}

const EMPTY: readonly Facet[] = Object.freeze([]);

/**
 * Does this card carry a behaviour record at all?
 *
 * NOT "does it carry any facet". Every card carries `type:` and `sub:` facets,
 * because those are read off the type line and the type line is always there.
 * A record is what the ABILITY compiler or the XMage table produced, and
 * `rec:full` / `rec:partial` is the only honest witness to it: Muldrotha, the
 * Gravetide has `type:creature sub:elemental sub:avatar` and no record at all,
 * and counting those three as evidence would have reported 100% record coverage
 * on a deck that was picked entirely from tags.
 */
export function hasRecord(card: FacetCarrier | null | undefined): boolean {
  const facets = facetsOf(card);
  return facets.includes(REC_FULL) || facets.includes(REC_PARTIAL);
}

/** Was the whole card read? Only then is a missing facet a positive answer. */
export function isCompleteRecord(card: FacetCarrier | null | undefined): boolean {
  return facetsOf(card).includes(REC_FULL);
}

/**
 * How much of a set of cards the records actually cover.
 *
 * Reported rather than assumed, because the answer decides how much of a build
 * is behaviour and how much is still the old word matching. The generator puts
 * this number in its notes and `ENGINE-PICKS.md` quotes it.
 */
export function facetCoverage(cards: readonly FacetCarrier[]): {
  withRecord: number;
  total: number;
  pct: number;
} {
  let withRecord = 0;
  for (const c of cards) if (hasRecord(c)) withRecord += 1;
  const total = cards.length;
  return { withRecord, total, pct: total > 0 ? (100 * withRecord) / total : 0 };
}

/* ------------------------------------------------------------------ *
 * Facets to roles
 * ------------------------------------------------------------------ *
 *
 * This is the table that replaces `ROLE_TAGS` wherever a record exists, and it
 * is the whole of the Bone Saw fix.
 *
 * Bone Saw's record is a static `+1/+0` on the equipped creature and an
 * `attach` activated ability. Under `ROLE_TAGS` the card's `voltron` tag made
 * it a WIN CONDITION and it collected the full role-gap credit. Under this
 * table it matches nothing, serves no role, and never enters a quota pass.
 * Sol Ring's record contains `add-mana`, so Sol Ring is ramp. Neither judgement
 * is about the card; both fall out of the same three lines of table.
 */
const ROLE_FACETS: Readonly<Record<Role, readonly Facet[]>> = {
  ramp: ['eff:add-mana', 'cares:zone:library-land'],
  draw: ['eff:draw'],
  removal: ['eff:destroy', 'eff:exile', 'eff:damage', 'eff:gain-control'],
  interaction: ['eff:counter', 'eff:tap', 'eff:unless-pays', 'eff:discard'],
  /*
   * Deliberately narrow, and it stays narrow.
   *
   * A card that says a player wins, a player loses, a player takes poison, or
   * that the turn happens again. Nothing else. The first draft of this list
   * also read a mass pump — `eff:pump` together with `scope:all` — as a win
   * condition, on the reasoning that "creatures you control get +X/+X" is the
   * swing-for-the-win card. Measured over the catalogue, that rule was wrong in
   * both directions at once and both were checked by name:
   *
   *   Adventuring Gear, Inventor's Goggles and Sai of the Shinobi all qualified.
   *   Their "equipped creature gets +N/+N" compiles to a pump whose selector is
   *   `all` with a creature filter, so three pieces of Equipment became the
   *   win conditions of the Muldrotha deck, which is the bug this whole change
   *   set exists to remove, rebuilt out of facets instead of out of tags.
   *
   *   Craterhoof Behemoth did NOT qualify. The compiler reads its haste and its
   *   enters trigger and refuses the "+X/+X" clause, so the actual mass pump
   *   card carries no pump facet at all.
   *
   * A rule that admits the Equipment and rejects the Craterhoof is not a
   * narrower version of the right rule, it is the wrong rule, so it is gone.
   * Craterhoof reaches this role through `rec:partial` and its `finisher` tag,
   * which is exactly what the tag fallback is for.
   *
   * `eff:poison` was removed on 2026-08-23 for the same reason, and it is the
   * voltron mistake a second time in a different word.
   *
   * The reasoning for keeping it was "a card that says a player takes poison".
   * What carries that facet in practice is every creature printed with toxic 1
   * or with infect, because one poison counter is still poison. Measured by
   * `scratch/refute-eight.mjs` over eight commanders on the 2026-08-19
   * snapshot: Blightbelly Rat, a two-mana 1/1 with toxic 1, was a win condition
   * of the Meren, Kaalia and Yuriko decks, and Ichorclaw Myr and Core Prowler
   * took most of the remaining twelve slots. Kaalia of the Vast, whose whole
   * job is putting a Demon onto the battlefield attacking, was handed a 1/1 Rat
   * as one of her three ways to end a game.
   *
   * Ten poison counters end a game; one does not, and this vocabulary carries
   * no magnitude for poison the way `mana:` carries one for mana. A rule that
   * cannot tell Blightsteel Colossus from Blightbelly Rat is not a narrower
   * version of the right rule, it is the wrong rule. The infect cards that do
   * end games reach this role through the tag fallback, the same door
   * Craterhoof comes through.
   */
  wincon: ['eff:win-game', 'eff:lose-game', 'eff:extra-turn', 'eff:extra-combat'],
  // Decided by the type line, never by an effect. See `cardServesRole`.
  creature: [],
  land: [],
};

/** Extra conditions a facet role has to meet, beyond carrying the facet. */
function facetRoleQualifies(role: Role, facets: readonly Facet[]): boolean {
  // A land taps for mana; that is not ramp, it is a land, and crediting it
  // would re-open the land quota inside the spell passes.
  if (role === 'ramp') return !facets.includes('type:land');
  return true;
}

/** Is this a creature? A type line question, and the type line is always known. */
function isCreatureTypeLine(typeLine: string | null | undefined): boolean {
  const front = (typeLine ?? '').split('//')[0];
  return /\bcreature\b/i.test(front) && !/\bland\b/i.test(front);
}

function isLandTypeLine(typeLine: string | null | undefined): boolean {
  return /\bland\b/i.test((typeLine ?? '').split('//')[0]);
}

/** What `cardServesRole` needs to answer. Satisfied by both card shapes. */
export interface RoleSubject extends FacetCarrier {
  typeLine?: string | null;
  tags?: readonly string[] | null;
}

/**
 * Does this card serve this role?
 *
 * THREE ANSWERS IN A FIXED ORDER, and the order is the whole rule:
 *
 *   1. The record SAYS SO. Sol Ring's record contains `add-mana`; Sol Ring is
 *      ramp. Nothing else is consulted.
 *   2. The record read the whole card and did not say so (`rec:full`). That is
 *      a positive NO. Bone Saw's record is a static +1/+0 and an `attach`, read
 *      completely, so Bone Saw is not a win condition and its `voltron` tag
 *      does not get to argue.
 *   3. The record is missing or incomplete. Only then do the tags speak, which
 *      is how Craterhoof Behemoth is still a win condition after the compiler
 *      refused the clause that makes it one.
 *
 * Step 2 is what the change is FOR. Trusting a record absolutely loses
 * Craterhoof; not trusting it at all keeps every piece of Equipment as a win
 * condition. Neither is a version of the right answer.
 *
 * `tagFallback` is passed in rather than imported so this module does not
 * depend on `advise/roles.ts`, which depends on it.
 */
export function cardServesRole(
  subject: RoleSubject,
  role: Role,
  tagFallback: (tags: readonly string[] | null | undefined, role: Role) => boolean
): boolean {
  // Type line questions. Exact, always answerable, never a fallback.
  if (role === 'creature') return isCreatureTypeLine(subject.typeLine);
  if (role === 'land') return isLandTypeLine(subject.typeLine);

  const facets = facetsOf(subject);

  // 1. The record says so.
  for (const f of ROLE_FACETS[role]) {
    if (facets.includes(f) && facetRoleQualifies(role, facets)) return true;
  }

  // 2. The record read the whole card and did not say so.
  if (facets.includes(REC_FULL)) return false;

  // 3. Nothing read this clause. The tags are what is left.
  return tagFallback(subject.tags, role);
}

/* ------------------------------------------------------------------ *
 * The commander plan
 * ------------------------------------------------------------------ *
 *
 * "Every commander has unique style, so it needs to use the brain to pick
 * cards" — the owner, 2026-08-23.
 *
 * A plan is a list of WANTS: facets a card can carry that would make it do the
 * thing this commander does. It is derived from the commander's own record and
 * from nothing else, so it is different for every commander whose record is
 * different, which is the property the four-deck overlap measurement tests.
 */

export interface Want {
  /** A candidate facet that satisfies this want. */
  facet: Facet;
  /** Relative worth, 0 to 1. Multiplied by `WEIGHTS.commanderFit` in `rank.ts`. */
  weight: number;
  /** Why, in words built from the commander's own record. Never free text. */
  because: string;
}

export interface CommanderPlan {
  /** The commander this was read off. */
  commanderName: string;
  wants: readonly Want[];
  /**
   * The archetype folded into those wants, or null when none was asked for.
   *
   * Set only by {@link withArchetype}. `planForCommander` never sets it, so a
   * plan that carries one has been through the combination rule and a plan that
   * does not is the commander on its own.
   */
  archetype?: ArchetypeInfluence | null;
  /**
   * A creature subtype the commander is built around, or null.
   *
   * The rule is deliberately strict: the subtype has to appear BOTH on the
   * commander's own type line AND inside one of its abilities. Krenko, Mob Boss
   * is a Goblin Warrior whose ability counts Goblins and makes Goblin tokens,
   * so the tribe is Goblin. Talrand, Sky Summoner is a Merfolk Wizard whose
   * ability makes Drakes; neither subtype appears in both places, so Talrand
   * has no tribe — which is right, because a Talrand deck is about instants and
   * sorceries and not about Merfolk.
   */
  tribe: string | null;
  /** True when the commander's record was empty and the plan came from tags. */
  fromTagsOnly: boolean;
}

/**
 * How a fact about the commander becomes a want about a candidate.
 *
 * Declared policy in one table, so the argument is with the table rather than
 * with a scoring expression. Weights are relative worth within the plan, not
 * scores; `rank.ts` multiplies them by one weight it owns.
 *
 * Read the left column as "the commander's record contains this" and the right
 * as "so a card carrying one of these is doing the commander's work".
 */
/**
 * Keywords that describe how a creature fights, as opposed to what it does.
 *
 * Deliberately only the combat ones. `flash` and `partner` also appear on
 * commanders with no other record, and neither says the deck should be built
 * around the commander connecting, so neither is here.
 */
/* ------------------------------------------------------------------ *
 * THE SECOND READER: what deck does this card want?
 * ------------------------------------------------------------------ *
 *
 * Measured over the 400 most-built commanders on 2026-08-30, 67 of them (17%)
 * produce no wants at all, so `commanderFit` contributes exactly zero to every
 * candidate and the deck is built on roles and popularity alone. That is the
 * owner's "random high edh cards" and the friend's "barely synergises with the
 * commander", and the names in that 17% are not obscure:
 *
 *   Azusa, Lost but Seeking    Muldrotha, the Gravetide   Teysa Karlov
 *   Torbran, Thane of Red Fell Etali, Primal Storm        Veyran, Voice of Duality
 *   Karlach, Fury of Avernus   Braids, Arisen Nightmare   Goreclaw
 *
 * Every one of those has a build direction any player would state in one
 * sentence. The engine had nothing, because the ability DSL could not express
 * the card and a plan is derived from compiled facets alone.
 *
 * WHY A SEPARATE READER RATHER THAN MORE DSL. The DSL drives gameplay
 * resolution, so it has to be exact: a card that resolves and does the wrong
 * thing is worse than one that needs a human. A deck-building want has a much
 * lower bar. It only has to point the ranker somewhere better than nowhere,
 * and being roughly right about Muldrotha wanting a graveyard beats being
 * silent about Muldrotha. Holding the two apart keeps that difference honest:
 * nothing here ever becomes an `Ability`, is never consulted during a game,
 * and can never make a card resolve.
 *
 * WHY IT ONLY FIRES ON SILENCE. Same reasoning as the combat-keyword fallback
 * below. These patterns read English rather than a parsed record, so they must
 * never talk over a commander whose abilities we actually compiled. Running
 * them only when nothing else fired makes that structural instead of a matter
 * of weights.
 *
 * ADDING A RULE. It has to be readable off the card's own text by a player,
 * the pattern has to be specific enough that a false match is hard to
 * construct, and the wants have to name facets that exist. `because` is a
 * fixed sentence per rule, in the same voice as `describeFacet`, never
 * assembled free text.
 */
interface IntentRule {
  /** What the card says, matched against its oracle text. */
  when: RegExp;
  /** Said the way a player would say it, to complete "…, so the deck wants". */
  reads: string;
  /** Facets that satisfy it, and how strongly. Below a compiled record's. */
  wants: readonly (readonly [Facet, number])[];
}

const INTENT_RULES: readonly IntentRule[] = [
  {
    // Azusa, Loot, Exploration. Extra land drops are only worth having if there
    // are extra lands to drop and something that reads them.
    when: /play (an additional land|two additional lands|\w+ additional lands)/i,
    reads: 'plays extra lands each turn',
    wants: [
      ['cares:zone:library-land', 0.85],
      ['eff:search-library', 0.7],
      ['cares:zone:library', 0.45],
    ],
  },
  {
    // Teysa Karlov, and every aristocrats commander whose text the DSL cannot
    // hold. A death trigger is worth nothing without creatures to die and a way
    // to make them die on demand.
    when: /(if a creature dying causes|whenever (a|another) creature (you control )?dies|creature you control dies)/i,
    reads: 'is paid when your creatures die',
    wants: [
      ['trig:dies', 0.85],
      ['eff:sacrifice', 0.8],
      ['eff:create-token', 0.7],
      ['eff:lose-life', 0.4],
    ],
  },
  {
    // Muldrotha, and anything that casts out of the yard. The graveyard has to
    // be filled before it can be a second hand.
    when: /(cast|play) .{0,60}from your graveyard/i,
    reads: 'casts spells out of your graveyard',
    wants: [
      ['cares:zone:graveyard', 0.85],
      ['eff:mill', 0.75],
      ['eff:return-from', 0.65],
      ['eff:discard', 0.5],
    ],
  },
  {
    // Veyran, and magecraft generally.
    when: /(magecraft|whenever you cast (or copy )?an instant or sorcery)/i,
    reads: 'triggers on your instants and sorceries',
    wants: [
      ['cares:type:instant', 0.85],
      ['cares:type:sorcery', 0.85],
      ['type:instant', 0.6],
      ['type:sorcery', 0.6],
    ],
  },
  {
    // Karlach, and extra-combat commanders. More combats want more attackers
    // that can attack the turn they land.
    when: /(additional combat phase|extra combat|untap all attacking creatures)/i,
    reads: 'takes extra combats',
    wants: [
      ['trig:attacks', 0.8],
      ['kw:haste', 0.7],
      ['eff:pump', 0.55],
      ['sub:equipment', 0.4],
    ],
  },
  {
    // Etali, Neheb, and the large family whose only ability is an attack
    // trigger. Getting it to attack, repeatedly and safely, IS the deck.
    when: /whenever [^.]{0,40}attacks/i,
    reads: 'is paid every time it attacks',
    wants: [
      ['trig:attacks', 0.75],
      ['kw:haste', 0.6],
      ['sub:equipment', 0.55],
      ['eff:pump', 0.5],
      ['eff:untap', 0.4],
    ],
  },
  {
    // Torbran. A damage amplifier wants many small damage sources, not one big
    // one, which is the opposite of what popularity alone would pick.
    when: /(would deal damage[^.]{0,80}instead|deals? that much damage plus)/i,
    reads: 'increases the damage your red sources deal',
    wants: [
      ['eff:damage', 0.85],
      ['type:instant', 0.5],
      ['type:sorcery', 0.5],
    ],
  },
  {
    // Goreclaw and the cost-reducers. The reduction is only worth a card slot
    // if the deck is full of the thing being reduced.
    when: /(creature spells you cast|creature spells) [^.]{0,40}cost [^.]{0,20}less to cast/i,
    reads: 'makes your creature spells cheaper',
    wants: [
      ['type:creature', 0.8],
      ['cares:type:creature', 0.5],
    ],
  },
  {
    // Kodama of the West Tree, Rishkar, and "modified" generally.
    when: /(modified creature|counters? on it|put a \+1\/\+1 counter)/i,
    reads: 'works with counters on your creatures',
    wants: [
      ['ctr:+1/+1', 0.8],
      ['eff:add-counters', 0.75],
      ['eff:proliferate', 0.6],
      ['sub:equipment', 0.45],
      ['sub:aura', 0.4],
    ],
  },
  {
    // Jaheira, Delney, and anything that improves tokens it does not make.
    when: /(tokens you control|creature tokens you control)/i,
    reads: 'improves the tokens you control',
    wants: [
      ['eff:create-token', 0.85],
      ['trig:enters', 0.4],
    ],
  },
  {
    // Braids. A repeatable "you may sacrifice" is a sacrifice deck asking for
    // things that are worth sacrificing.
    when: /you may sacrifice an?\b/i,
    reads: 'asks you to sacrifice your own permanents',
    wants: [
      ['eff:sacrifice', 0.8],
      ['trig:dies', 0.7],
      ['eff:create-token', 0.6],
    ],
  },
  {
    // Kodama of the East Tree, and the permanents-matter family. A trigger on
    // "another permanent you control enters" wants cheap permanents and things
    // that put more than one out at a time.
    when: /whenever (another |a )?(nontoken )?permanent you control enters/i,
    reads: 'triggers whenever your other permanents arrive',
    wants: [
      ['trig:enters', 0.8],
      ['eff:create-token', 0.6],
      ['eff:add-mana', 0.4],
    ],
  },
  {
    // Kediss, and commander-damage commanders generally. The deck is about the
    // commander connecting, so it wants the same things Voltron wants.
    when: /commander you control deals combat damage/i,
    reads: 'is paid when your commander connects',
    wants: [
      ['sub:equipment', 0.8],
      ['kw:haste', 0.65],
      ['eff:pump', 0.6],
      ['sub:aura', 0.5],
    ],
  },
  {
    // Delney, and the small-creatures family. A commander that rewards low
    // power wants a wide board of cheap bodies, not expensive ones.
    when: /power \d+ or less/i,
    reads: 'rewards your small creatures',
    wants: [
      ['eff:create-token', 0.8],
      ['type:creature', 0.55],
      ['trig:enters', 0.5],
    ],
  },
  {
    // Commanders that count what you control. Wide boards, not a single threat.
    when: /(for each creature you control|number of creatures you control)/i,
    reads: 'counts how many creatures you control',
    wants: [
      ['eff:create-token', 0.8],
      ['type:creature', 0.55],
    ],
  },
];

const COMBAT_KEYWORDS: readonly string[] = [
  'flying', 'trample', 'menace', 'deathtouch', 'lifelink', 'vigilance',
  'first strike', 'double strike', 'indestructible', 'haste', 'ward',
  'protection', 'shroud', 'hexproof', 'unblockable', 'fear', 'intimidate',
  'horsemanship', 'skulk',
];

/** "flying, trample and lifelink", for a sentence a player reads. */
function joinKeywords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/**
 * What "makes a token" is worth once we know WHICH token the commander counts.
 *
 * Low enough to sit below every real want and above nothing, because a token
 * deck does still want extra bodies. See the note where it is applied.
 */
const GENERIC_TOKEN_WHEN_SPECIFIC = 0.3;

const PLAN_RULES: readonly {
  when: Facet;
  wants: readonly { facet: Facet; weight: number }[];
}[] = [
  {
    when: 'eff:proliferate',
    wants: [
      { facet: 'eff:proliferate', weight: 1.0 },
      { facet: 'eff:add-counters', weight: 0.8 },
      { facet: 'eff:player-counter', weight: 0.6 },
    ],
  },
  {
    when: 'eff:add-counters',
    wants: [
      { facet: 'eff:add-counters', weight: 0.9 },
      { facet: 'eff:proliferate', weight: 0.8 },
    ],
  },
  {
    when: 'eff:create-token',
    wants: [
      { facet: 'eff:create-token', weight: 0.9 },
      { facet: 'eff:pump', weight: 0.5 },
      { facet: 'eff:sacrifice', weight: 0.4 },
    ],
  },
  {
    when: 'eff:draw',
    wants: [
      { facet: 'eff:draw', weight: 0.7 },
    ],
  },
  {
    when: 'eff:damage',
    wants: [
      { facet: 'eff:damage', weight: 0.7 },
    ],
  },
  {
    when: 'eff:return-from',
    wants: [
      { facet: 'eff:return-from', weight: 0.9 },
      { facet: 'cares:zone:graveyard', weight: 0.8 },
      { facet: 'eff:mill', weight: 0.5 },
      { facet: 'eff:sacrifice', weight: 0.4 },
    ],
  },
  {
    when: 'cares:zone:graveyard',
    wants: [
      { facet: 'cares:zone:graveyard', weight: 0.9 },
      { facet: 'eff:return-from', weight: 0.8 },
      { facet: 'eff:mill', weight: 0.5 },
    ],
  },
  {
    when: 'eff:gain-life',
    wants: [{ facet: 'eff:gain-life', weight: 0.7 }],
  },
  {
    when: 'eff:add-mana',
    wants: [{ facet: 'eff:add-mana', weight: 0.6 }],
  },
  {
    when: 'eff:sacrifice',
    wants: [
      { facet: 'eff:sacrifice', weight: 0.8 },
      { facet: 'eff:create-token', weight: 0.6 },
    ],
  },
  {
    when: 'eff:discard',
    wants: [{ facet: 'eff:discard', weight: 0.7 }],
  },
  {
    when: 'eff:mill',
    wants: [
      { facet: 'eff:mill', weight: 0.8 },
      { facet: 'cares:zone:graveyard', weight: 0.6 },
    ],
  },
  {
    when: 'eff:attach',
    wants: [
      { facet: 'eff:attach', weight: 0.8 },
      { facet: 'sub:equipment', weight: 0.7 },
      { facet: 'sub:aura', weight: 0.7 },
    ],
  },
];

/**
 * A trigger or filter that names a card TYPE becomes a want for that type.
 *
 * This is the Talrand case and it needs no table: "whenever you cast an instant
 * or sorcery spell" puts `cares:type:instant` and `cares:type:sorcery` on the
 * commander, and the want is simply for cards that ARE instants and sorceries,
 * plus other cards that care about the same types. One rule, and it fires for
 * every "whenever you cast a …" commander in the format.
 */
const TYPE_WANT_WEIGHT = 0.9;
const TYPE_ECHO_WEIGHT = 0.7;

/** A tribe want: being the creature type, and caring about the creature type. */
const TRIBE_MEMBER_WEIGHT = 1.0;
const TRIBE_PAYOFF_WEIGHT = 1.0;

/**
 * Facets that are true of nearly every commander and say nothing about style.
 *
 * Without this list, `kw:flying` off Atraxa's first line would make an Atraxa
 * deck want every flier in blue, and the four decks would converge again
 * through the back door. Evasion keywords and "is a creature" are true of most
 * commanders in the format, so they carry no information about which one this
 * is; that is the test for entry here, and it is the only test.
 */
const PLAN_IGNORED: ReadonlySet<Facet> = new Set([
  'kw:flying',
  'kw:vigilance',
  'kw:deathtouch',
  'kw:lifelink',
  'kw:trample',
  'kw:haste',
  'kw:menace',
  'kw:first strike',
  'kw:double strike',
  'kw:hexproof',
  'kw:reach',
  'kw:ward',
  'type:creature',
  'type:legendary',
  'scope:all',
]);

/**
 * Read the commander.
 *
 * `commanderTags` is used ONLY when the commander's record is empty, and the
 * plan says so through `fromTagsOnly` so a caller can report the fallback rate
 * rather than discover it later. Measured over the four test commanders, one of
 * four (Muldrotha, the Gravetide) falls back: the oracle-text compiler returns
 * `coverage: 'manual'` and no abilities for "you may play a land and cast a
 * permanent spell of each permanent type from your graveyard", and the XMage
 * table holds no record for that oracle id either.
 */
export function planForCommander(commander: {
  name: string;
  typeLine?: string | null;
  facets?: readonly Facet[] | null;
  tags?: readonly string[] | null;
  /**
   * The commander's own rules text, for {@link INTENT_RULES}.
   *
   * Optional, and every caller should pass it. Without it a commander the
   * ability compiler cannot parse gets no plan at all, which was 17% of the
   * 400 most-built commanders. It is read ONLY when the facet rules produced
   * nothing, and never to decide what a card does in a game.
   */
  oracleText?: string | null;
}): CommanderPlan {
  const facets = facetsOf(commander);
  const wants = new Map<Facet, Want>();

  const add = (facet: Facet, weight: number, because: string) => {
    const prev = wants.get(facet);
    if (!prev || prev.weight < weight) wants.set(facet, { facet, weight, because });
  };

  for (const rule of PLAN_RULES) {
    if (PLAN_IGNORED.has(rule.when)) continue;
    if (!facets.includes(rule.when)) continue;
    for (const w of rule.wants) {
      add(w.facet, w.weight, `${commander.name} ${describeFacet(rule.when)}`);
    }
  }

  // Card types the commander's own filters name.
  for (const f of facets) {
    if (!f.startsWith('cares:type:')) continue;
    const type = f.slice('cares:type:'.length);
    if (type === 'creature' || type === 'permanent') continue;
    add(`type:${type}`, TYPE_WANT_WEIGHT, `${commander.name} triggers on ${type} spells`);
    add(f, TYPE_ECHO_WEIGHT, `${commander.name} triggers on ${type} spells`);
  }

  /* SUBTYPES the commander's own filters name, when they are NOT a tribe.
     ------------------------------------------------------------------
     `cares:type:` had a rule and `cares:sub:` did not, except through the
     tribe branch below, which requires the subtype to be on the commander's
     own type line. That is right for Edgar Markov, a Vampire who counts
     Vampires. It silently drops every commander that cares about a subtype it
     does not have.

     Sram, Senior Edificer is the case that found it: "whenever you cast an
     Aura, Equipment, or Vehicle spell, draw a card". He produces
     `cares:sub:aura`, `cares:sub:equipment` and `cares:sub:vehicle` correctly,
     he is a Dwarf Advisor so there is no tribe, and all three wants were
     dropped. Measured on the built deck: 5 of his 56 nonland cards could
     trigger him at all, and the other 51 were white instants and mana rocks.

     A card that IS the subtype is what the commander wants; a card that CARES
     about it is a payoff and worth slightly less, which is the same shape the
     tribe branch uses. */
  for (const f of facets) {
    if (!f.startsWith('cares:sub:')) continue;
    const sub = f.slice('cares:sub:'.length);
    if (!sub) continue;
    add(`sub:${sub}`, TRIBE_MEMBER_WEIGHT, `${commander.name} triggers on ${sub} spells`);
    add(f, TYPE_ECHO_WEIGHT, `${commander.name} triggers on ${sub} spells`);
  }

  // The tribe, if there is one.
  const tribe = tribeOf(commander.typeLine, facets);
  if (tribe) {
    add(`sub:${tribe}`, TRIBE_MEMBER_WEIGHT, `${commander.name} is a ${tribe} that counts ${tribe}s`);
    add(`cares:sub:${tribe}`, TRIBE_PAYOFF_WEIGHT, `${commander.name} is a ${tribe} that counts ${tribe}s`);
    add(`tok:${tribe}`, TRIBE_PAYOFF_WEIGHT, `${commander.name} is a ${tribe} that counts ${tribe}s`);
  }

  // Counter kinds the commander puts out or reads.
  for (const f of facets) {
    if (!f.startsWith('ctr:')) continue;
    add(f, 0.9, `${commander.name} works with ${f.slice(4)} counters`);
    add('eff:proliferate', 0.8, `${commander.name} works with ${f.slice(4)} counters`);
  }

  /* THE COMMANDER THAT ONLY TELLS YOU HOW IT FIGHTS.
     ------------------------------------------------
     Measured over all 3,363 commander-legal legendary creatures: 1,612 produce
     no wants at all, and for 977 of them the compiler read the card perfectly
     well. Nothing fired because no rule was keyed on what it found. The facets
     sitting unused are overwhelmingly combat keywords:

       flying 306 · vigilance 129 · trample 119 · haste 100 · lifelink 67
       first strike 55 · deathtouch 54 · menace 52 · indestructible 45

     A legendary creature whose whole record is evasion and combat keywords is
     not a card the engine has nothing to say about. It is a VOLTRON commander,
     and every Magic player reads it that way: the commander IS the threat, so
     the deck wants equipment, auras and ways to keep it alive and connecting.
     Jareth, Leonine Titan blocks and pumps and wants exactly that, and until
     now he got the same generic deck as a card with no text at all.

     WHY THIS IS A FALLBACK AND NOT A RULE IN THE TABLE. It reads the SHAPE of
     the whole record rather than one facet: the claim is that combat keywords
     are ALL there is. Running it only when nothing else fired makes that
     structural, so it can never talk over a commander who told us something
     more specific. A card that makes tokens AND flies is a token deck.

     Weights sit below a real record's. This is an inference from silence, and
     it should lose to anything the card actually said. */
  /* THE SECOND READER, on silence only. See INTENT_RULES above. It sits ahead
     of the combat fallback because "this card says it is paid when creatures
     die" is a more specific claim than "this card has flying and nothing we
     could read", and the more specific reading should win. */
  if (!wants.size && commander.oracleText) {
    const text = commander.oracleText;
    for (const rule of INTENT_RULES) {
      if (!rule.when.test(text)) continue;
      const because = `${commander.name} ${rule.reads}`;
      for (const [facet, weight] of rule.wants) add(facet, weight, because);
    }
  }

  if (!wants.size) {
    const combat = COMBAT_KEYWORDS.filter(k => facets.includes(`kw:${k}`));
    if (combat.length) {
      const because =
        `${commander.name} has ${joinKeywords(combat)} and no other ability we can read, ` +
        `so the deck is built around getting it through`;
      add('sub:equipment', 0.75, because);
      add('sub:aura', 0.65, because);
      add('eff:pump', 0.6, because);
      add('cares:sub:equipment', 0.5, because);
      add('cares:sub:aura', 0.45, because);
    }
  }

  /* STILL NOTHING, AND THE RECORD IS ABOUT COMBAT WITHOUT SAYING A KEYWORD.
     The rule above reads `kw:` facets, so it finds a commander whose evasion is
     PRINTED and misses one whose fighting is written as an ability. Jareth,
     Leonine Titan is the case: he gets +7/+7 when he blocks and can gain
     protection, so his record is `eff:pump` and `trig:blocks` and not one
     keyword, and the keyword rule passed him by. Sauron, the Lidless Eye is the
     same shape through `eff:gain-control` and `eff:pump`.

     `eff:pump` was on 95 silent commanders and `cares:type:creature` on 188, the
     two largest effect facets with no rule behind them.

     A commander that pumps wants creatures to pump and equipment to carry, and
     one that only cares about creatures wants creatures. Both are weaker claims
     than any real plan, which is why they sit last and weigh least: "wants
     creatures" is nearly true of every deck, and it is only worth saying when
     the alternative is saying nothing at all. */
  if (!wants.size) {
    if (facets.includes('eff:pump')) {
      const because = `${commander.name} pumps a creature and we can read nothing else, so the deck feeds it`;
      add('type:creature', 0.55, because);
      add('sub:equipment', 0.5, because);
      add('eff:pump', 0.45, because);
    } else if (facets.includes('cares:type:creature')) {
      add(
        'type:creature',
        0.4,
        `${commander.name} names creatures and we can read nothing more specific`
      );
    }
  }

  /* A TOKEN IS NOT A TOKEN. THE SUBTYPE IS THE WHOLE POINT.
     -------------------------------------------------------
     Krenko's plan wanted `tok:goblin` at 1.0 and `eff:create-token` at 0.9,
     and the second one matches EVERY card in Magic that makes a Treasure, a
     Clue, a Food or a Blood. There are hundreds of those and a few dozen
     Goblin makers, so the generic want drowned the specific one: a generated
     Krenko deck came back with twenty-five Treasure cards in it, including
     Gold Pan at rank 10,212, while Sol Ring at rank 1 did not make the deck.

     A Commander player reads that instantly and it is what "the cards do not
     complement the commander" means. Krenko does not care that you made a
     Treasure. He counts Goblins.

     So when the plan names a SPECIFIC token, the generic want is demoted to a
     tie-break rather than removed. It is not worthless: a token deck really
     does want extra bodies, and a card that makes both a Goblin and something
     else should still score. It just must not beat the thing the commander
     actually counts, and at 0.9 against 1.0 it effectively did.

     Only fires when a specific token want exists. Talrand wants `tok:drake`
     and generic token makers are genuinely near-equivalent for him, so the
     same demotion applies and is still right: a Drake deck wants Drakes. A
     commander with no token subtype at all, whose plan says only
     `eff:create-token`, is untouched. */
  const specificToken = [...wants.keys()].some(f => f.startsWith('tok:'));
  if (specificToken) {
    const generic = wants.get('eff:create-token');
    if (generic && generic.weight > GENERIC_TOKEN_WHEN_SPECIFIC) {
      wants.set('eff:create-token', {
        ...generic,
        weight: GENERIC_TOKEN_WHEN_SPECIFIC,
        because: `${commander.name} counts a particular token, so making any token is only a tie-break`,
      });
    }
  }

  const fromTagsOnly = !hasRecord(commander);
  if (fromTagsOnly) {
    // No record. The commander's tags are all that is left, and a tag is a word,
    // so the wants it produces are weaker than a record's on purpose.
    for (const tag of commander.tags ?? []) {
      const facet = TAG_TO_FACET[tag];
      if (!facet) continue;
      add(facet, 0.5, `${commander.name} is tagged ${tag} (no ability record for this card)`);
    }
  }

  return {
    commanderName: commander.name,
    wants: [...wants.values()].sort((a, b) => b.weight - a.weight || a.facet.localeCompare(b.facet)),
    tribe,
    fromTagsOnly,
  };
}

/**
 * The tribe rule, in one function so it can be argued with in one place.
 *
 * Both places or nothing. See `CommanderPlan.tribe` for why Talrand must come
 * back null.
 */
function tribeOf(typeLine: string | null | undefined, facets: readonly Facet[]): string | null {
  const own = new Set<string>();
  const line = (typeLine ?? '').split('//')[0];

  /* A PLANESWALKER TYPE IS NOT A TRIBE.
     Lord Windgrace is a "Legendary Planeswalker — Windgrace", and this read
     Windgrace off the type line as though it were a creature subtype. His top
     three wants came back `sub:windgrace`, `cares:sub:windgrace` and
     `tok:windgrace`, which is a tribe of exactly one card that is himself and
     cannot be in the deck. A lands commander was given a tribal plan for a
     tribe that does not exist.

     Only a creature has a tribe. Every other card type's subtypes name
     something else entirely: a planeswalker's is its identity, an
     enchantment's is Aura or Saga, an artifact's is Equipment or Vehicle. Sram
     wanting Equipment is real and is handled by the `cares:sub:` rule, which
     is a different question from what the commander IS. */
  /* A plain substring test, not a regex. A word-boundary escape written
     through a shell heredoc into this file arrived as the BACKSPACE character,
     so the pattern was /[]Creature[]/ and matched nothing: every tribal
     commander silently lost its tribe. Type lines are a closed vocabulary and
     "creature" appears in them only as the card type, so a lowercased
     includes says exactly what is meant and has nothing to get wrong. */
  if (!line.toLowerCase().includes("creature")) return null;

  const dash = line.indexOf('—');
  if (dash >= 0) {
    for (const word of line.slice(dash + 1).trim().split(/\s+/)) {
      const w = word.trim().toLowerCase();
      if (w) own.add(w);
    }
  }
  if (own.size === 0) return null;

  for (const f of facets) {
    let sub: string | null = null;
    if (f.startsWith('cares:sub:')) sub = f.slice('cares:sub:'.length);
    else if (f.startsWith('tok:')) sub = f.slice('tok:'.length);
    if (sub && own.has(sub)) return sub;
  }
  return null;
}

/**
 * The last resort, for a commander with no record at all.
 *
 * Short on purpose. This is the path that produces the generic deck, so making
 * it rich would hide how often it fires rather than fix it.
 */
const TAG_TO_FACET: Readonly<Record<string, Facet>> = {
  proliferate: 'eff:proliferate',
  counters: 'eff:add-counters',
  tokens: 'eff:create-token',
  'token-maker': 'eff:create-token',
  graveyard: 'cares:zone:graveyard',
  reanimator: 'eff:return-from',
  'graveyard-recursion': 'eff:return-from',
  'self-mill': 'eff:mill',
  mill: 'eff:mill',
  aristocrats: 'eff:sacrifice',
  'sacrifice-outlet': 'eff:sacrifice',
  lifegain: 'eff:gain-life',
  'card-draw': 'eff:draw',
  spellslinger: 'type:instant',
  voltron: 'eff:attach',
  equipment: 'sub:equipment',
};

/** Turn a commander facet into a clause. Built from the facet, never invented. */
function describeFacet(facet: Facet): string {
  if (facet === 'eff:proliferate') return 'proliferates';
  if (facet === 'eff:add-counters') return 'puts counters on things';
  if (facet === 'eff:create-token') return 'makes tokens';
  if (facet === 'eff:return-from') return 'brings cards back';
  if (facet === 'cares:zone:graveyard') return 'plays out of the graveyard';
  if (facet === 'eff:sacrifice') return 'sacrifices things';
  if (facet === 'eff:attach') return 'attaches things to creatures';
  if (facet.startsWith('eff:')) return `uses ${facet.slice(4)}`;
  return `carries ${facet}`;
}

/* ------------------------------------------------------------------ *
 * The archetype the player asked for
 * ------------------------------------------------------------------ *
 *
 * "Decks must be custom to them, as well as the archetype" - the owner.
 *
 * `request.archetype` used to go to the language model's prompt and nowhere
 * else, so a player who picked Aristocrats and a player who picked Control got
 * the same ninety-nine cards ranked by the same numbers and a different
 * sentence in a prompt. This is the half that was missing.
 *
 * AN ARCHETYPE IS READ THE SAME WAY A COMMANDER IS
 * ------------------------------------------------
 * There is no table mapping `aristocrats` to a list of facets, and adding one
 * would be the quota table again in a different column: somebody's opinion
 * about what Aristocrats wants, written down once, unable to disagree with
 * itself when the catalogue changes.
 *
 * `src/lib/deck/archetypeShells.ts` already holds what an archetype is made of,
 * as CARDS: Aristocrats is Viscera Seer, Blood Artist, Bitterblossom and nine
 * others. Those are real cards, so they have oracle text, so the same producer
 * that reads a commander reads them too. The facets that RECUR across a shell's
 * own cards are what that shell does. Aristocrats comes back wanting
 * `trig:dies`, `eff:lose-life` and `eff:create-token` because four of its
 * twelve cards trigger on something dying and four drain life; nobody wrote
 * that down, and if somebody swaps a card in the shell the wants move with it.
 *
 * WHAT A SHELL IS ALLOWED TO WANT, AND WHY THE LIST IS SHORT
 * ----------------------------------------------------------
 * Only `eff:`, `cares:` and `trig:` facets: the verb, the verb's argument, and
 * when it happens. Everything else about an example card is the SHAPE of the
 * card somebody chose to write down rather than the shell's behaviour, and
 * reading it produces nonsense that was measured on the real catalogue before
 * this rule was written:
 *
 *   `type:` Seven of the eleven cards in the Tokens shell are enchantments,
 *     because doublers and anthems are enchantments. Read, `type:enchantment`
 *     became the shell's LOUDEST want and a Tokens deck would have been built
 *     to want enchantments ahead of tokens.
 *   `tok:` Two of the Tokens shell's cards are Hordeling Outburst and Dragon
 *     Fodder, so `tok:goblin` recurred, and every Tokens deck in the format
 *     would have wanted Goblins because two examples happened to be red.
 *   `sub:` and `kw:` The same accident: three Aristocrats cards are Humans.
 *
 * A commander's `sub:` and `tok:` facets are not an accident in the same way,
 * which is why {@link tribeOf} still reads them: a commander is ONE card, and
 * its own type line is a fact about the deck rather than a sampling artefact.
 */

/** One card of a shell, already read by the producer. */
export interface ArchetypeExemplar {
  name: string;
  facets: readonly Facet[];
}

/** A shell, as the engine receives it. The names are resolved by the caller. */
export interface ArchetypeInput {
  id: string;
  /** What a player would call it. Appears in the reason under a card. */
  name: string;
  /** How many cards the shell names, whether or not the catalogue had them. */
  named: number;
  /** The ones that resolved, in the caller's order. */
  exemplars: readonly ArchetypeExemplar[];
}

export interface ArchetypePlan {
  id: string;
  name: string;
  /**
   * Wants, strongest first.
   *
   * `weight` is a LIFT, not a share and not a score: how many times more often
   * the shell's own cards carry the facet than the cards in this pool do. It is
   * therefore usually greater than 1, which no other `Want` in the engine is.
   * That is safe because an `ArchetypePlan` never reaches `planFit` directly:
   * {@link withArchetype} rescales the whole list against the commander first,
   * and this number stays a plain measurement that can be printed.
   */
  wants: readonly Want[];
  /** Cards the catalogue resolved, against cards the shell names. */
  read: number;
  named: number;
  /** Cards that resolved and produced no ability record at all. */
  withoutRecord: number;
  /**
   * Facets that recurred across the shell and were dropped anyway, and why.
   *
   * Reported because a silent shell and a shell whose every want was thrown out
   * are different failures. `common` was carried by too much of the pool to
   * separate anything, `rare` by too little of it to fill slots.
   */
  dropped: readonly { facet: Facet; reason: 'common' | 'rare'; poolCards: number }[];
}

/**
 * How often each facet turns up in the cards this deck may actually play.
 *
 * The denominator that turns "the shell's cards share this" into "the shell's
 * cards share this MORE THAN CARDS IN GENERAL DO", which is the difference
 * between a want that ranks something and a want that ranks everything. See
 * {@link planForArchetype}.
 */
export interface FacetBackground {
  /** Cards counted over. */
  cards: number;
  /** How many of them carry each facet. */
  count: ReadonlyMap<Facet, number>;
  /**
   * The fewest pool cards a want may be satisfiable by.
   *
   * Derived by the caller from the deck size rather than declared here: a want
   * that fewer cards than the deck holds can satisfy cannot shape the deck, it
   * can only decorate a few slots, and letting it set the shell's loudest want
   * would quiet every want that could.
   */
  minCards: number;
}

/** Count facets across a population. One count per card, not per occurrence. */
export function facetBackground(
  cards: readonly FacetCarrier[],
  minCards: number
): FacetBackground {
  const count = new Map<Facet, number>();
  for (const card of cards) {
    for (const facet of new Set(facetsOf(card))) {
      count.set(facet, (count.get(facet) ?? 0) + 1);
    }
  }
  return { cards: cards.length, count, minCards: Math.max(0, minCards) };
}

/**
 * An {@link ArchetypePlan} placed against one particular commander's plan.
 *
 * `wants` here are SCALED, and that is the difference from `ArchetypePlan`:
 * the lifts have been divided through so the shell's strongest want sits at
 * {@link ARCHETYPE_SHARE} of the commander's strongest, which puts them back on
 * the 0 to 1 scale every other `Want` in the engine uses. These are the weights
 * that rank cards.
 */
export interface ArchetypeInfluence {
  id: string;
  name: string;
  wants: readonly Want[];
  read: number;
  named: number;
  withoutRecord: number;
  dropped: ArchetypePlan['dropped'];
  /** What every lift was multiplied by to get the weights above. */
  scale: number;
  /** Wants the shell added, meaning facets the commander had not named. */
  added: number;
  /**
   * True when the commander produced no wants of its own, so the shell is the
   * whole plan. Muldrotha, the Gravetide is the standing case.
   */
  alone: boolean;
}

/**
 * How many of a shell's cards have to share a facet before it is a want.
 *
 * Two. A facet on one card of a shell is a fact about that card: Altar of
 * Dementia mills, and Aristocrats decks do not particularly want to mill. Two
 * is the smallest number that can be called recurrence at all, and the shells
 * hold seven to twelve cards, so anything larger would silence the shells with
 * three-card packages entirely.
 */
const ARCHETYPE_MIN_EXEMPLARS = 2;

/** The only prefixes a shell may want. See the header above for the measurements. */
const ARCHETYPE_WANT_PREFIXES: readonly string[] = ['eff:', 'cares:', 'trig:'];

/**
 * How loud the archetype is allowed to be next to the commander.
 *
 * THE COMBINATION RULE IN ONE NUMBER, and it is declared policy. The owner's
 * requirement is that "Aristocrats Krenko is still Goblins", which is a
 * statement about ORDER rather than about a weight: whatever else changes, the
 * cards that do the commander's job have to outrank the cards that do the
 * archetype's. So the shell's strongest want is placed at this fraction of the
 * commander's strongest want and the rest of the shell follows in proportion.
 *
 * Being a fraction of the commander's own top want rather than a fixed number
 * is what makes it a modifier: a commander with a loud plan keeps the archetype
 * in proportion behind it, and a commander with a quiet one is not drowned out
 * by a shell that happens to have twelve cards.
 *
 * 0.6 rather than 0.3 or 0.9, and the sweep that chose it is
 * `scratch/archetype-share-sweep.mjs`: three commanders through the real
 * pipeline at each value, three archetypes each, everything else held still.
 * Two numbers decide it. OVERLAP is how much of a commander's three archetype
 * decks is the same cards, so lower means the archetype did something. OWN is
 * how many of Meren's nonland cards still do MEREN's job rather than the
 * shell's, across her aristocrats, control and big-mana builds, against 15 with
 * no archetype asked for, so higher means the commander still decides.
 *
 *          Krenko overlap   Meren overlap   Meren own
 *   0.30        62.4%           51.5%        11/15/15
 *   0.45        47.1%           33.1%         7/15/15
 *   0.60        42.8%           22.6%         5/12/15
 *   0.75        36.7%           16.1%         4/ 7/11
 *   0.90        31.5%           12.3%         1/ 5/ 7
 *
 * Below 0.6 the archetype is barely audible: at 0.3 Krenko's three decks are
 * nearly the same deck. Above it the commander starts losing, and it goes
 * quickly: between 0.6 and 0.75 Meren's control build drops from 12 of her own
 * cards to 7 and her big-mana build from all 15 to 11. 0.6 is the last value at
 * which two of her three builds keep essentially her whole plan.
 *
 * Krenko's Goblin count barely moves anywhere in that range, 17 to 27 against
 * 26 with no archetype asked for, which is the combination rule holding: the
 * shell chooses WHICH Goblins rather than whether there are Goblins.
 */
const ARCHETYPE_SHARE = 0.6;

/**
 * Read a shell: what do the cards it is made of do that other cards do not?
 *
 * No knowledge of any particular archetype, here or anywhere in the engine.
 * Hand it twelve cards and it reports what they share; the answer for
 * Aristocrats is an aristocrats answer because the cards are aristocrats cards.
 *
 * RECURRENCE ALONE WAS THE FIRST VERSION AND IT DID NOT WORK, which is worth
 * keeping because the failure looked exactly like success. Weighted by how much
 * of the shell carried a facet, the Aristocrats shell's joint loudest want came
 * back `cares:type:creature`, on 5 of its 12 cards. So did Control's, and so did
 * Big mana's, because half the cards in Magic that do anything at all do it to a
 * creature. Measured on the 2026-08-19 catalogue: `cares:type:creature` is
 * carried by 1,581 of the 7,496 cards a mono-red commander may play, 21% of the
 * pool. A want carried by a fifth of the pool does not rank a fifth of the pool
 * above the rest, it ranks everything, and the three archetype decks for Krenko
 * came out 88.5% the same cards.
 *
 * So a want is weighted by LIFT: the share of the SHELL carrying the facet
 * divided by the share of the POOL carrying it. `trig:dies` is on 33% of the
 * Aristocrats shell and 2.6% of a mono-red pool, a lift of 12.7;
 * `cares:type:creature` is on 42% of the shell and 21% of the pool, a lift of
 * 2.0. Death triggers are what makes Aristocrats Aristocrats and creatures are
 * what makes Magic Magic, and lift is the arithmetic that knows the difference.
 *
 * Two bounds, and both are the same statement about being able to shape a deck:
 *
 *   LIFT MUST EXCEED 1. A facet the shell carries LESS often than the pool does
 *     is evidence against the shell, not for it, and asking for it would build
 *     an averagely-shaped deck on purpose.
 *   THE POOL MUST HOLD `minCards` OF THEM. A want fewer cards can satisfy than
 *     the deck has slots cannot shape the deck, and because lift divides by a
 *     small number it would otherwise arrive enormous and quiet every want that
 *     can. This is what stops Big mana from asking a mono-red deck for
 *     `cares:sub:forest`, which nine cards in that pool satisfy.
 *
 * With no background the lift is 1 for everything and this falls back to plain
 * recurrence, which is the right behaviour for a caller that has no pool: worse
 * ordering, never a wrong one.
 *
 * LIFT ALONE DID NOT FIX KRENKO, and saying so here is the point of writing any
 * of this down. It fixed the commanders whose plans leave the deck room: Meren
 * went from 46.6% to 24.6% mean overlap between her three archetype decks and
 * Muldrotha from 16.9% to 2.2%. Krenko went the wrong way, 88.5% to 95.1%,
 * because a narrower shell is a quieter shell and his own plan was already
 * loud enough to fill the deck on its own. What fixed Krenko was giving the
 * shell its own axis instead of merging it into his wants: see
 * {@link withArchetype}. Both changes were needed and neither was sufficient.
 */
export function planForArchetype(
  input: ArchetypeInput,
  background?: FacetBackground | null
): ArchetypePlan {
  const count = new Map<Facet, number>();
  const example = new Map<Facet, string>();
  let withoutRecord = 0;

  for (const card of input.exemplars) {
    if (!hasRecord(card)) withoutRecord += 1;
    // Deduped per card, so a card carrying `eff:draw` twice still counts once.
    for (const facet of new Set(card.facets)) {
      if (PLAN_IGNORED.has(facet)) continue;
      if (!ARCHETYPE_WANT_PREFIXES.some(p => facet.startsWith(p))) continue;
      count.set(facet, (count.get(facet) ?? 0) + 1);
      if (!example.has(facet)) example.set(facet, card.name);
    }
  }

  const read = input.exemplars.length;
  const wants: Want[] = [];
  const dropped: { facet: Facet; reason: 'common' | 'rare'; poolCards: number }[] = [];

  for (const [facet, n] of count) {
    if (n < ARCHETYPE_MIN_EXEMPLARS) continue;
    const inShell = n / Math.max(1, read);

    if (!background || background.cards === 0) {
      wants.push({ facet, weight: inShell, because: shellClause(input, facet, n, read, example) });
      continue;
    }

    const poolCards = background.count.get(facet) ?? 0;
    if (poolCards < background.minCards) {
      dropped.push({ facet, reason: 'rare', poolCards });
      continue;
    }
    const lift = inShell / (poolCards / background.cards);
    if (lift <= 1) {
      dropped.push({ facet, reason: 'common', poolCards });
      continue;
    }
    wants.push({ facet, weight: lift, because: shellClause(input, facet, n, read, example) });
  }

  wants.sort((a, b) => b.weight - a.weight || a.facet.localeCompare(b.facet));
  dropped.sort((a, b) => b.poolCards - a.poolCards || a.facet.localeCompare(b.facet));

  return {
    id: input.id,
    name: input.name,
    wants,
    read,
    named: input.named,
    withoutRecord,
    dropped,
  };
}

/** The sentence a shell want carries under a card. Built from the shell, never invented. */
function shellClause(
  input: ArchetypeInput,
  facet: Facet,
  n: number,
  read: number,
  example: ReadonlyMap<Facet, string>
): string {
  return (
    `${input.name} decks want this: ${n} of the ${read} cards that make up the shell ` +
    `${describeWant(facet)}, ${example.get(facet)} among them`
  );
}

/**
 * THE COMBINATION. An archetype modifies a commander's plan; it never replaces it.
 *
 * A SEPARATE AXIS, NOT A COMPETING WANT, and that is the whole design. The
 * first version merged the shell's wants into the commander's one list and
 * `planFit` combined them, which sounds right and measured wrong: `planFit`
 * gives every want after the best only `EXTRA_WANT_DECAY` of its weight, so for
 * Krenko a Goblin scored 0.90 and a Goblin that also dies for value scored
 * 0.92. Two hundredths of a point, against a popularity spread worth ten times
 * that. The archetype could not reorder the Goblins at all, and asking for
 * Aristocrats moved three cards of sixty-one.
 *
 * So the shell scores on its own axis and the two are ADDED by `rank.ts`. What
 * that buys is exactly the sentence the owner asked for. For Krenko:
 *
 *     a Goblin that dies for value   commander 1.98 + shell 1.19
 *     a Goblin                       commander 1.98
 *     a sacrifice outlet that is not a Goblin        shell 1.19
 *
 * Aristocrats Krenko is still Goblins, and it is the Goblins that die. The
 * shell reorders inside what the commander already wanted and can only win a
 * slot outright where the commander wanted nothing.
 *
 * Three rules set the axis:
 *
 *   1. THE COMMANDER SETS THE SCALE. The shell's strongest want is placed at
 *      {@link ARCHETYPE_SHARE} of the commander's strongest and the rest follow
 *      in proportion to their lift, so the shell's whole axis is capped below
 *      the commander's however loud the shell's own numbers were.
 *   2. A COMMANDER WANT IS NEVER LOWERED. The merged list the SHAPE reads keeps
 *      the larger weight where both name a facet, which by rule 1 is always the
 *      commander's, and with it the commander's own sentence.
 *   3. A COMMANDER WITH NOTHING TO SAY LETS THE SHELL SPEAK AT FULL VOLUME.
 *      With no commander want there is nothing to be a fraction of, so the
 *      anchor is 1. That is the Muldrotha case: her record produces no wants at
 *      all, and before this her deck was picked on roles and popularity. It is
 *      reported as `alone` rather than left to be inferred.
 *
 * The returned plan's `wants` are the MERGED list, which is what
 * `deriveDeckShape` measures the deck's composition against: a card that does
 * either job is a card this deck is made of, whichever half asked for it. The
 * separate axis lives on `plan.archetype.wants` and is what `rank.ts` scores.
 *
 * Returns the commander's own plan unchanged when there is no archetype or the
 * shell produced nothing, so a caller can always call this.
 */
export function withArchetype(
  plan: CommanderPlan,
  archetype: ArchetypePlan | null | undefined
): CommanderPlan {
  if (!archetype || archetype.wants.length === 0) return plan;

  const commanderTop = plan.wants.reduce((best, w) => Math.max(best, w.weight), 0);
  const shellTop = archetype.wants[0].weight;
  const anchor = commanderTop > 0 ? commanderTop : 1;
  const scale = shellTop > 0 ? (anchor * ARCHETYPE_SHARE) / shellTop : 0;

  const scaled: Want[] = archetype.wants.map(w => ({
    facet: w.facet,
    weight: w.weight * scale,
    because: w.because,
  }));

  const merged = new Map<Facet, Want>();
  for (const want of plan.wants) merged.set(want.facet, want);

  let added = 0;
  for (const want of scaled) {
    const already = merged.get(want.facet);
    if (!already) added += 1;
    // Rule 2. The commander's weight wins on a tie as well, because its
    // sentence is about this deck and the shell's is about the format.
    if (already && already.weight >= want.weight) continue;
    merged.set(want.facet, want);
  }

  return {
    ...plan,
    wants: [...merged.values()].sort(
      (a, b) => b.weight - a.weight || a.facet.localeCompare(b.facet)
    ),
    archetype: {
      id: archetype.id,
      name: archetype.name,
      wants: scaled,
      read: archetype.read,
      named: archetype.named,
      withoutRecord: archetype.withoutRecord,
      dropped: archetype.dropped,
      scale,
      added,
      alone: commanderTop === 0,
    },
  };
}

/**
 * How much this card does the ARCHETYPE's job, on the archetype's own axis.
 *
 * The same arithmetic as {@link planFit} over a different list of wants, which
 * is what keeps the two signals comparable in `rank.ts`. Silent when no
 * archetype was asked for, the same way castability is silent when the mana
 * base is unknown: no signal at all rather than a zero that reads as a verdict.
 */
export function archetypeFit(
  archetype: ArchetypeInfluence | null | undefined,
  card: FacetCarrier
): PlanFit {
  if (!archetype || archetype.wants.length === 0) return NO_FIT;
  return planFit(
    { commanderName: archetype.name, wants: archetype.wants, tribe: null, fromTagsOnly: false },
    card
  );
}

/**
 * The clause a shell want carries into the reason under a card.
 *
 * Built from the facet and never invented, the same rule `describeSharedFacets`
 * follows, but phrased for "N of the shell's cards ___" rather than for "this
 * card ___", so it needs the plural verb. A facet with no phrase falls back to
 * naming itself, which is honest and rare: every `eff:` verb has a phrase.
 */
function describeWant(facet: Facet): string {
  if (facet.startsWith('eff:')) {
    const phrase = EFFECT_PHRASES[facet.slice(4)];
    if (phrase) return depluralise(phrase);
  }
  if (facet.startsWith('trig:')) {
    const event = facet.slice(5);
    return TRIGGER_PHRASES[event] ?? `trigger on ${event}`;
  }
  if (facet.startsWith('cares:type:')) return `are about ${facet.slice('cares:type:'.length)}s`;
  if (facet.startsWith('cares:sub:')) return `are about ${facet.slice('cares:sub:'.length)}s`;
  if (facet.startsWith('cares:zone:')) return `use the ${facet.slice('cares:zone:'.length)}`;
  return `carry ${facet}`;
}

/**
 * A trigger event, said the way a player would say it.
 *
 * `trig:dies` reads "trigger on dies" without this, which is the raw event name
 * from the DSL's `TriggerEvent` union showing through into copy a player reads
 * under a card. Only the events a shell has actually produced are here; anything
 * else falls back to naming the event, which is ugly and true rather than
 * invented.
 */
const TRIGGER_PHRASES: Readonly<Record<string, string>> = {
  dies: 'trigger on something dying',
  enters: 'trigger on something arriving',
  leaves: 'trigger on something leaving',
  cast: 'trigger on a spell being cast',
  attacks: 'trigger on an attack',
  blocks: 'trigger on a block',
  step: 'trigger at a point in the turn',
  sacrificed: 'trigger on a sacrifice',
  'zone-change': 'trigger on a card changing zones',
  'deals-damage': 'trigger on dealing damage',
  'dealt-damage': 'trigger on taking damage',
  'counter-added': 'trigger on a counter being placed',
  'draws-card': 'trigger on a card being drawn',
  'gains-life': 'trigger on life being gained',
  'loses-life': 'trigger on life being lost',
};

/**
 * "drains life" to "drain life". The phrases in {@link EFFECT_PHRASES} are
 * written for one card and these sentences have several, so the verb loses its
 * third-person ending. Only the first word is a verb, and none of them is
 * irregular, so this is the whole of the grammar.
 */
function depluralise(phrase: string): string {
  const space = phrase.indexOf(' ');
  const verb = space < 0 ? phrase : phrase.slice(0, space);
  const rest = space < 0 ? '' : phrase.slice(space);
  if (verb.endsWith('ies')) return `${verb.slice(0, -3)}y${rest}`;
  if (verb.endsWith('es') && (verb.endsWith('shes') || verb.endsWith('ches'))) {
    return `${verb.slice(0, -2)}${rest}`;
  }
  if (verb.endsWith('s')) return `${verb.slice(0, -1)}${rest}`;
  return phrase;
}

/* ------------------------------------------------------------------ *
 * Scoring a candidate against the plan
 * ------------------------------------------------------------------ */

export interface PlanFit {
  /** 0 to 1. The best single want the card satisfies, plus a little for more. */
  fit: number;
  /** The wants it satisfied, best first. Used to build the reason clause. */
  matched: readonly Want[];
}

/**
 * How much this card does the commander's job.
 *
 * COMBINED, NOT SUMMED, and the difference matters. The first draft added the
 * best want to a decaying share of the rest and clamped the total at 1, which
 * meant a card matching a 0.80 want and a 0.60 want reached the clamp and tied
 * with a card matching the deck's single 1.00 want. A ceiling everything piles
 * up against is not a ranking.
 *
 * So the wants combine the way independent evidence does: each one is a chance
 * that this card is doing the deck's work, and the total is the chance that at
 * least one of them is. The best want dominates, further wants can only add,
 * the result is bounded by 1 without a clamp, and the order is strict. A card
 * that IS the deck's plan beats a card that brushes three lesser parts of it,
 * which is the trade this signal exists to make.
 *
 * A WANT OF EXACTLY 1.0 SATURATES THIS, and it is left saturating on purpose.
 * `TRIBE_MEMBER_WEIGHT` is 1.0, so for Krenko, Mob Boss every one of the 1,520
 * Goblins in a mono-red pool comes back at fit exactly 1.0 and this signal
 * cannot order them. That was diagnosed while connecting the archetype and a
 * ceiling below 1 was written, measured and REMOVED: the archetype scores on
 * its own axis and is ADDED to this one, so it orders the Goblins without
 * needing room inside this number, and the ceiling measured slightly worse on
 * every commander tried. `scratch/archetype-ceiling-sweep.mjs`, Krenko across
 * three archetypes: no ceiling gave 39.9% mean overlap between the three decks
 * and kept all 61 of the cards doing Krenko's own job in every one of them; a
 * ceiling of 0.9 gave 42.8% and dropped one build to 59.
 */
export function planFit(plan: CommanderPlan | null, card: FacetCarrier): PlanFit {
  if (!plan || plan.wants.length === 0) return NO_FIT;
  const facets = facetsOf(card);
  if (facets.length === 0) return NO_FIT;

  const matched: Want[] = [];
  for (const want of plan.wants) {
    if (facets.includes(want.facet)) matched.push(want);
  }
  if (matched.length === 0) return NO_FIT;

  matched.sort((a, b) => b.weight - a.weight || a.facet.localeCompare(b.facet));

  let miss = 1 - clamp01(matched[0].weight);
  for (let i = 1; i < matched.length; i++) {
    miss *= 1 - clamp01(matched[i].weight) * EXTRA_WANT_DECAY;
  }
  return { fit: 1 - miss, matched };
}

/** Each want after the best counts for this much of what it would alone. */
const EXTRA_WANT_DECAY = 0.35;


function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

const NO_FIT: PlanFit = Object.freeze({ fit: 0, matched: Object.freeze([]) as readonly Want[] });

/* ------------------------------------------------------------------ *
 * Convenience for the two card shapes the engine already has
 * ------------------------------------------------------------------ */

export function subjectFor(card: CandidateCard | DeckCard): RoleSubject {
  return {
    typeLine: card.typeLine,
    tags: card.tags,
    facets: (card as CandidateCard & FacetCarrier).facets ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * Card against card: does it DO the same thing
 * ------------------------------------------------------------------ *
 *
 * "'similar' means does a similar thing" — the owner, 2026-08-23, about the
 * card page, whose recommendation groups matched shared TAGS.
 *
 * `planFit` above answers "does this card do the COMMANDER's job". This answers
 * the other question the engine owes a card page and an optimiser: does this
 * card do the same job as THAT card. Same facets, same reading, one weighting.
 *
 * WHY A WEIGHTED JACCARD AND NOT AN OVERLAP COUNT
 * ----------------------------------------------
 * Overlap alone is what tag matching already does, and it is why Frost Titan
 * reads as a Counterspell: one word in common, and nothing subtracted for
 * everything else the card does. Jaccard divides the shared weight by the
 * weight of the union, so a candidate that does the subject's job AND four
 * other jobs scores below one that does the subject's job and stops.
 * Counterspell and Mana Drain both read `eff:counter type:instant`; Frost Titan
 * reads `eff:tap sub:giant trig:attacks trig:enters type:creature` and shares
 * nothing, which is the right answer and the one no tag can reach.
 *
 * WHY THE WEIGHTS ARE NOT ALL 1
 * -----------------------------
 * A facet is a fact, but the facts are not equally about what the card DOES.
 * `eff:` is the verb and carries most. `cares:` and `scope:` are the verb's
 * ARGUMENTS, which is the whole reason the port kept them: "destroy all
 * creatures" and "destroy all lands" differ nowhere else. `type:` and `sub:`
 * are the card's shape rather than its behaviour and carry least, because a
 * Beast that pumps the team and a Sorcery that pumps the team are the same card
 * for this purpose. Declared positions with no empirical basis, like every
 * weight in `rank.ts`, kept in one table so the argument is with the table.
 */

const FACET_WEIGHTS: readonly { prefix: string; weight: number }[] = [
  // The verb.
  { prefix: 'eff:', weight: 1.0 },
  // The verb's arguments. This is the port's whole contribution.
  { prefix: 'cares:type:', weight: 0.8 },
  { prefix: 'cares:sub:', weight: 0.8 },
  { prefix: 'cares:zone:', weight: 0.8 },
  { prefix: 'scope:', weight: 0.8 },
  // Magnitudes and named objects the verb produced.
  { prefix: 'ctr:', weight: 0.7 },
  { prefix: 'tok:', weight: 0.7 },
  { prefix: 'mana:', weight: 0.6 },
  { prefix: 'acost:', weight: 0.6 },
  // When it happens.
  { prefix: 'trig:', weight: 0.4 },
  // Shape, not behaviour.
  { prefix: 'kw:', weight: 0.3 },
  { prefix: 'sub:', weight: 0.3 },
  { prefix: 'type:', weight: 0.25 },
];

/**
 * How completely the record was read is not part of what the card DOES.
 *
 * `rec:full` on both cards would otherwise be shared weight, so two cards the
 * compiler happened to finish would look alike for that reason alone. It is
 * read separately, as `basis`.
 */
const COMPARISON_IGNORED_PREFIX = 'rec:';

/**
 * Longest matching prefix wins, so `cares:type:creature` is an argument (0.8)
 * and not a `type:` shape fact (0.25). Matched by length rather than by table
 * order so that reordering the table for readability cannot silently change an
 * answer.
 */
function facetWeight(facet: Facet): number {
  if (facet.startsWith(COMPARISON_IGNORED_PREFIX)) return 0;
  let best = 0;
  let bestLen = -1;
  for (const row of FACET_WEIGHTS) {
    if (facet.startsWith(row.prefix) && row.prefix.length > bestLen) {
      best = row.weight;
      bestLen = row.prefix.length;
    }
  }
  return best;
}

/**
 * SAME EFFECT WITH SIMILAR ARGUMENTS, and "similar" is the operative word.
 *
 * Two facet prefixes carry a MAGNITUDE rather than a name. Comparing those by
 * set equality throws away the only thing they were kept for: a rock that adds
 * three mana is not "as different from" one that adds two as it is from one
 * that adds nothing. Measured on the live catalogue on 2026-08-23, equality
 * alone dropped Mana Vault out of Sol Ring's list entirely, on the strength of
 * `mana:3` against `mana:2`. So these two are compared by distance, and a gap
 * of one costs half the axis rather than all of it.
 *
 * `pick` is which value speaks for a card that has several. A card with two
 * mana abilities is described by the BIGGEST thing it can produce and by the
 * CHEAPEST way it can be used, because that is the rate a player would compare.
 */
const GRADED: readonly { prefix: string; pick: 'max' | 'min' }[] = [
  { prefix: 'mana:', pick: 'max' },
  { prefix: 'acost:', pick: 'min' },
];

function isGraded(facet: Facet): boolean {
  return GRADED.some(axis => facet.startsWith(axis.prefix));
}

/** The one number that speaks for this card on this axis, or null if it is silent. */
function axisValue(facets: readonly Facet[], axis: { prefix: string; pick: 'max' | 'min' }): number | null {
  let best: number | null = null;
  for (const f of facets) {
    if (!f.startsWith(axis.prefix)) continue;
    const n = Number(f.slice(axis.prefix.length));
    if (!Number.isFinite(n)) continue;
    if (best === null) best = n;
    else best = axis.pick === 'max' ? Math.max(best, n) : Math.min(best, n);
  }
  return best;
}

/** What one card-to-card comparison found. */
export interface BehaviourMatch {
  /** 0 to 1. Weighted Jaccard over both cards' facets. */
  score: number;
  /** The facets both carry, heaviest first. The reason clause is built from these. */
  shared: readonly Facet[];
  /**
   * How much of this answer is a record and how much is an absence.
   *
   *   `record`  - both cards were read completely, so a low score is a verdict.
   *   `partial` - at least one record admits it did not read the whole card, so
   *               a low score is a gap and not a judgement.
   *   `none`    - one of the two carries no record at all. Whatever came back
   *               is the type line talking, and a caller should fall back to
   *               tags and say which entries it did that for.
   */
  basis: 'record' | 'partial' | 'none';
}

const NO_MATCH: BehaviourMatch = Object.freeze({
  score: 0,
  shared: Object.freeze([]) as readonly Facet[],
  basis: 'none',
});

/**
 * Does this candidate do what the subject does?
 *
 * Symmetric by construction, which is a property a "similar cards" list needs
 * and a "fits this deck" list does not: if Mana Drain is a Counterspell then
 * Counterspell is a Mana Drain, and a ranking that disagreed with itself
 * depending on which card page you opened would be a bug a player can see.
 */
export function behaviourSimilarity(
  subject: FacetCarrier | null | undefined,
  candidate: FacetCarrier | null | undefined
): BehaviourMatch {
  const a = facetsOf(subject);
  const b = facetsOf(candidate);
  if (a.length === 0 || b.length === 0) return NO_MATCH;

  const bSet = new Set(b);
  const aSet = new Set(a);
  const shared: Facet[] = [];
  let interWeight = 0;
  let unionWeight = 0;

  for (const f of a) {
    if (isGraded(f)) continue;
    const w = facetWeight(f);
    unionWeight += w;
    if (bSet.has(f)) {
      interWeight += w;
      if (w > 0) shared.push(f);
    }
  }
  for (const f of b) {
    if (isGraded(f) || aSet.has(f)) continue;
    unionWeight += facetWeight(f);
  }

  // The magnitudes, compared by distance rather than by equality. See `GRADED`.
  for (const axis of GRADED) {
    const av = axisValue(a, axis);
    const bv = axisValue(b, axis);
    if (av === null && bv === null) continue;
    const w = facetWeight(`${axis.prefix}0`);
    unionWeight += w;
    if (av === null || bv === null) continue;
    const distance = Math.abs(av - bv);
    interWeight += w / (1 + distance);
    if (distance === 0) shared.push(`${axis.prefix}${av}`);
  }

  const complete = isCompleteRecord(subject) && isCompleteRecord(candidate);
  const basis: BehaviourMatch['basis'] =
    !hasRecord(subject) || !hasRecord(candidate) ? 'none' : complete ? 'record' : 'partial';

  shared.sort((x, y) => facetWeight(y) - facetWeight(x) || x.localeCompare(y));
  const raw = unionWeight === 0 ? 0 : interWeight / unionWeight;
  return { score: raw * agreementFactor(a, b), shared, basis };
}

/**
 * SAME VERB, DIFFERENT OBJECT, and a Jaccard cannot see the difference.
 *
 * A weighted Jaccard counts a facet the candidate lacks and a facet the
 * candidate has instead as the same kind of evidence: both land in the union
 * and neither lands in the intersection. For the axes that name what the verb
 * was DONE TO, that is wrong in a way a player sees immediately.
 *
 * Measured live on 2026-08-23 by `scratch/refute-related.mjs`, which builds the
 * card page's list the way `CardRelated.tsx` builds it. Wrath of God reads
 * "destroys, hits everything at once, about creatures". Its fourteen came back
 * holding Armageddon at 8 and Ravages of War at 7 — both of which read
 * "Destroy all lands." — and Cleansing Meditation at 9 and Cleanfall at 14,
 * which read "Destroy all enchantments." All four outranked Rout, which
 * destroys all creatures, because Rout also has a flash clause and every extra
 * facet Rout carries is another unshared term in its union. The list rewarded
 * doing a DIFFERENT thing over doing the SAME thing plus something else, and
 * the page's own notes gave it away: the four wrong entries printed "Also
 * destroys, hits everything at once" with the "about creatures" clause missing.
 *
 * So: when both records name an object on the same axis and they name no object
 * in common, that is a contradiction and not an absence, and the score is cut.
 * Silence on either side is still only an absence, because a partial record
 * that never read the filter must not be punished for what it did not say.
 *
 * `AGREEMENT_FLOOR` is declared policy, not a fit. 0.4 is the point at which a
 * card that destroys all lands falls below every card in the pool that destroys
 * all creatures, checked against that Wrath of God list and no other data.
 */
const AGREEMENT_FLOOR = 0.4;

/** The axes that name what the verb was done to. */
const ARGUMENT_AXES: readonly string[] = ['cares:type:', 'cares:sub:'];

function agreementFactor(a: readonly Facet[], b: readonly Facet[]): number {
  let factor = 1;
  for (const axis of ARGUMENT_AXES) {
    const av = a.filter(f => f.startsWith(axis));
    const bv = b.filter(f => f.startsWith(axis));
    // Silence on either side is an absence, not a disagreement.
    if (av.length === 0 || bv.length === 0) continue;
    if (av.some(f => bv.includes(f))) continue;
    factor *= AGREEMENT_FLOOR;
  }
  return factor;
}

/**
 * Turn shared facets into the clause a player reads under a card tile.
 *
 * Built from the facet, never invented, and it refuses rather than guesses: a
 * facet with no phrase here contributes nothing instead of being printed raw,
 * because `cares:zone:library-land` under a card image is worse than saying
 * less.
 */
export function describeSharedFacets(facets: readonly Facet[], limit = 3): string[] {
  const out: string[] = [];
  for (const f of facets) {
    const phrase = phraseFor(f);
    if (phrase && !out.includes(phrase)) out.push(phrase);
    if (out.length >= limit) break;
  }
  return out;
}

function phraseFor(facet: Facet): string | null {
  if (facet.startsWith('eff:')) return EFFECT_PHRASES[facet.slice(4)] ?? null;
  if (facet === 'scope:all') return 'hits everything at once';
  // A shared keyword IS a shared behaviour and the only reason it was not read
  // here at first is that the page has a keyword group of its own. It still has
  // to be sayable: without it Centaur Chieftain, which shares Craterhoof's
  // haste, drew the tile note "same card type, nothing else in common".
  if (facet.startsWith('kw:')) return `has ${facet.slice(3)}`;
  // Weakest thing worth saying, and it is only ever reached when nothing
  // stronger matched. Blossoming Bogbeast shares Craterhoof's Beast type and
  // nothing the compiler read, and "shares the beast type" is a truer note than
  // "same card type, nothing else in common".
  if (facet.startsWith('sub:')) return `shares the ${facet.slice(4)} type`;
  if (facet.startsWith('cares:type:')) return `about ${facet.slice('cares:type:'.length)}s`;
  if (facet.startsWith('cares:sub:')) return `about ${facet.slice('cares:sub:'.length)}s`;
  if (facet.startsWith('cares:zone:')) return `uses the ${facet.slice('cares:zone:'.length)}`;
  if (facet.startsWith('ctr:')) return `${facet.slice(4)} counters`;
  if (facet.startsWith('tok:')) return `makes ${facet.slice(4)} tokens`;
  if (facet.startsWith('mana:')) return `${facet.slice(5)} mana at a time`;
  if (facet === 'acost:0') return 'costs nothing to use';
  if (facet.startsWith('acost:')) return `costs ${facet.slice(6)} to use`;
  if (facet.startsWith('trig:')) return `triggers on ${facet.slice(5)}`;
  return null;
}

/** One phrase per DSL verb. The verbs are `EFFECT_VERBS`; nothing else is read. */
const EFFECT_PHRASES: Readonly<Record<string, string>> = {
  'add-mana': 'adds mana',
  draw: 'draws cards',
  mill: 'mills',
  discard: 'makes a player discard',
  destroy: 'destroys',
  exile: 'exiles',
  sacrifice: 'sacrifices',
  counter: 'counters a spell',
  damage: 'deals damage',
  'gain-life': 'gains life',
  'lose-life': 'drains life',
  poison: 'gives poison',
  'move-zone': 'moves cards between zones',
  'return-from': 'returns cards',
  'search-library': 'searches your library',
  'create-token': 'makes tokens',
  'add-counters': 'puts counters on things',
  'remove-counters': 'takes counters off',
  'player-counter': 'puts counters on players',
  pump: 'pumps creatures',
  tap: 'taps things down',
  untap: 'untaps things',
  attach: 'attaches to a creature',
  'gain-control': 'steals permanents',
  'win-game': 'wins the game',
  'lose-game': 'makes a player lose',
  'set-monarch': 'sets the monarch',
  'unless-pays': 'taxes the opponent',
  proliferate: 'proliferates',
  'extra-turn': 'takes an extra turn',
  'extra-combat': 'takes an extra combat',
  scry: 'scries',
};
