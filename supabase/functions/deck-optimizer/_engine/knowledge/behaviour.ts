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
   */
  wincon: ['eff:win-game', 'eff:lose-game', 'eff:poison', 'eff:extra-turn', 'eff:extra-combat'],
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
  return { score: unionWeight === 0 ? 0 : interWeight / unionWeight, shared, basis };
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
