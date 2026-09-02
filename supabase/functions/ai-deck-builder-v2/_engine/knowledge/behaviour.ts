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
  /* GIVING a keyword, as opposed to having one. `kw:hexproof` meant both until
     1 Sep 2026, so Purphoros (has indestructible) and Swiftfoot Boots (grants
     hexproof) produced the same facet, which is the ~15% false-positive rate
     CLAUDE.md records on the protection role. */
  'grants:',
  'type:',
  'sub:',
  'kw:',
  'eff:',
  'mana:',
  'acost:',
  'cost:',
  'tok:',
  'ctr:',
  'cares:type:',
  'cares:sub:',
  'cares:zone:',
  /*
   * A CARD WHOSE FILTER NAMES A KEYWORD rather than a type or a subtype.
   * "Whenever a creature with flying attacks", "creatures with cycling", the
   * foretell and transform payoffs. Three readers hit this independently and
   * every one of them had to skip a correct, uniform tag for want of it.
   *
   * It is the third member of a family that already has two: `cares:type:` and
   * `cares:sub:`. The card is asking about a PROPERTY of another card, and a
   * keyword is a property.
   */
  'cares:kw:',
  /* And the card that singles out YOUR COMMANDER, which is the most Commander-
     specific thing a card can do and had no word at all. Bastion Protector,
     Command Beacon, the whole "commander matters" shell. */
  'cares:commander',
  /* A filter that names a COLOUR, the way `cares:type:` names a card type.
     Four readers asked for it independently across two rounds. */
  'cares:color:',
  /* How much mana, or which colours, were spent to cast a spell: convoke,
     improvise, sunburst, "spend only mana produced by". Three readers. */
  'cares:mana-spent',
  /* A card whose condition reads a creature's POWER. Ghalta's own shell, and
     every "power 4 or greater matters" payoff. */
  'cares:power',
  /* Payoffs keyed on life having been GAINED, which is not the same as a card
     that gains life. Two readers, and the distinction is the whole lifegain
     archetype: Ajani's Pridemate wants the trigger, not the gain. */
  'cares:lifegain',
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
  /* Setting power and toughness is an ANSWER, not a pump: Humble and Kenrith's
     Transformation work through indestructible because they overwrite the
     number rather than adding to it. Reading them as `eff:pump` filed them in
     `enhance`, the role for cards that make your creatures better. */
  'set-pt',
  /*
   * THE SAME VERB, AIMED AT YOUR OWN SIDE. Not a qualifier, because a role
   * check asks whether the card carries one facet, so an `aims:` facet
   * alongside would change nothing. Same reasoning as `exile-graveyard`.
   */
  'exile-own',
  /* Exiling ITSELF, which is how a Praetor or a Dominant reaches its back
     face. Not a blink of your board: Syr Vondam is paid when ANOTHER creature
     you control is exiled, so this pays him nothing. See the long note in
     src/lib/deck/recommend/behaviour.ts. */
  'exile-self',
  'destroy-own',
  'tap-own',
  'discard-self',
  'damage-self',
  'draw-each',
  'shrink',
  /* An open choice made as a permanent enters, with the SUBJECT on the effect
     rather than in the verb, the way `among` sits on `add-mana`. So every
     consumer that reads `eff:choose` reads all of them, and a new subject needs
     no entry here and no role rule before the card counts for anything. */
  'choose',
  /*
   * COMBAT RESTRICTIONS, which the DSL has modelled all along and the facet
   * layer has never read.
   *
   * `dsl.ts` carries `{rule:'cant-be-blocked-except-by'}`, `{rule:'cant-block'}`
   * and `{rule:'cant-attack'}`, and `readEffects` reads exactly one Restriction
   * rule, `max-lands-per-turn`. So Pacifism — an aura whose entire text is
   * "enchanted creature can't attack or block" — carried NO facet at all, could
   * serve no role, and could not be chosen by any deck for any reason.
   *
   * Two of them are removal and one is evasion, which is why they are three
   * words and not one. A card that stops a creature attacking and blocking has
   * answered it; a card that makes YOUR creature unblockable has not answered
   * anything.
   */
  'cant-block',
  'cant-attack',
  'cant-be-blocked',
  /*
   * WHAT A SPELL COSTS, which CLAUDE.md has named as a hole for two days:
   * "Grand Arbiter Augustin IV compiles to three exact cost-modifying statics
   * and contributes nothing to deck building, because cost reduction has no
   * facet."
   *
   * Ghalta, Primal Hunger is rank 461 and carried NO facet at all, because her
   * whole card is a cost reduction and a trample keyword. Reduction is filed as
   * ramp: paying less for a spell and making more mana are the same job seen
   * from opposite ends, which is the reasoning `eff:extra-land-drop` already
   * uses. Taxing is interaction, because a card that makes everyone else pay
   * more is answering them.
   */
  'reduce-cost',
  'increase-cost',
  /*
   * STAX, which had no vocabulary whatsoever. Silence is rank 407 and its
   * entire text is "your opponents can't cast spells this turn"; Drannith
   * Magistrate is 720. Both produced nothing and could serve no role.
   */
  'cant-cast',
  'cant-activate',
  /*
   * COPYING, asked for by seven separate readers, which is the strongest signal
   * in the whole triage. Clone, Strionic Resonator (590), Vesuva (925). Copying
   * a permanent, a spell and a triggered ability are one word because the deck
   * building question is the same: this card becomes the best thing available.
   */
  'copy',
  /*
   * DOUBLING, which CLAUDE.md lists as an unread cluster by name: "replacement
   * doubling - Panharmonicon, Hardened Scales". Fiery Emancipation (855) and
   * Twinflame Tyrant (811) triple and double damage; Delney doubles triggers.
   * One word, because what is multiplied is already said by the other facets
   * the card carries.
   */
  'multiply',
  /* A noncreature permanent becomes a creature: manlands, and the enchantments
     that stand up. Not `eff:pump`, which assumes there is a creature already. */
  'animate',
  /* Pariah and Palisade Giant. Damage still happens, so it is not prevention,
     and the deck it belongs to is built on that difference. */
  'redirect-damage',
  /* Playing lands out of the graveyard. Crucible of Worlds (597) and Ramunap
     Excavator (476) both carried nothing at all. Ramp, for the same reason
     `eff:extra-land-drop` is ramp: it is more lands in play per turn. */
  'play-from-graveyard',
  /* Coin flips and dice. Roughly 200 cards across roll-d6, roll-d20 and
     coin-flip, and every existing verb would have been a lie about them. */
  'random',
  /* Goad, and "must attack". Different from `cant-attack` by direction and by
     purpose: one neutralises a creature, the other points it at somebody else. */
  'goad',
  /*
   * THE SAME RESTRICTION, POINTED AT ITSELF, and it is a different card.
   *
   * `eff:cant-attack` is Pacifism and is REMOVAL: you have answered something
   * of theirs. A creature that itself cannot attack is a Wall, and that is a
   * DRAWBACK priced into its stats. Tagger keeps the two apart as
   * `prevent-attack` (151 cards) and `restricted-attacker` (115), and mapping
   * both to one word would have filed every defensive creature in the game as
   * removal.
   *
   * Precisely the fault the `effect.who` work cost 574 cards to fix, and the
   * reason `exile-own`, `tap-own` and `discard-self` are separate verbs rather
   * than an `aims:` qualifier: a role check asks whether a card carries ONE
   * facet, so a qualifier alongside would change nothing.
   */
  'cant-attack-self',
  'cant-block-self',
  /* Cascade, discover, and "you may cast it without paying its mana cost".
     CLAUDE.md lists this as an unread cluster in the top 2,000 by name. */
  'cast-free',
  /* Lure and provoke. The opposite of `cant-block`: it compels the block rather
     than forbidding it, and the deck that wants it is a trample deck. */
  'force-block',
  /* Handing a permanent to somebody else. Donate, and the punisher cards that
     give away a drawback. The mirror of `gain-control`, and it must not share
     a word with it: one is removal and the other is a combo piece. */
  'give-control',
  /* A permanent turns to its other face. Werewolves, sagas that flip, the whole
     day/night shell. */
  'transform',
  /* Your spells cannot be countered. */
  'uncounterable',
  /* A player skips or gains a phase or a step: extra untap steps, skipped draw
     steps, Necropotence's own first line. */
  'skip-phase',
  /*
   * PREVENTING DAMAGE, and KEEPING A CREATURE ALIVE, which are different jobs.
   *
   * `prevent-damage` is the Fog and the Circle of Protection: the damage does
   * not happen. The DSL models it twice, as `{rule:'damage-prevention'}` and as
   * a `{do:'prevent'}` replacement, and the facet layer read neither.
   *
   * `protect` is the abstraction over four different keywords doing one job.
   * Measured across the `protects-creature` tag: hexproof dominates, then
   * shroud, then indestructible, then protection, plus shield counters. So
   * `grants:hexproof` would be right for three quarters and a lie for the rest,
   * and the deck builder's question is "what keeps my commander alive", which
   * is one question.
   */
  'prevent-damage',
  'protect',
  /* Setting a life total is not gaining or losing life, and the difference is
     the whole card: Repay in Kind and Biorhythm are symmetric resets. */
  'set-life',
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
export const ROLE_FACETS: Readonly<Record<Role, readonly Facet[]>> = {
  /* `eff:extra-land-drop` is Exploration and Azusa: not mana, but more lands
     in play every turn, which is what a player means by ramp. Derived from the
     `max-lands-per-turn` restriction, so only a card that actually grants one
     carries it. */
  /* `eff:reduce-cost` and `eff:play-from-graveyard` join for the reason the
     comment above gives `eff:extra-land-drop`: paying less and playing more
     lands are both "this deck does more per turn than its mana says it should".
     Ghalta at rank 461 and Crucible of Worlds at 597 could serve no role at all
     before this. */
  ramp: [
    'eff:add-mana', 'cares:zone:library-land', 'eff:extra-land-drop',
    'eff:reduce-cost', 'eff:play-from-graveyard',
  ],
  /*
   * Drawing a card, AND buying one back out of the graveyard, which is the same
   * thing from the deck's point of view: a card you did not have and now do.
   *
   * Regrowth, Life from the Loam, Dread Return, Phyrexian Reclamation and Whip
   * of Erebos all served no role at all, so the builder could not take any of
   * them however well they fitted. `scripts/role-rule-try.mjs recursion` lists
   * what the rule claims: eight rescued, every one of them genuine card
   * advantage, and eleven that already had a role, all creatures like Eternal
   * Witness which keep `creature` and gain this too, correctly.
   */
  draw: ['eff:draw', 'eff:return-from'],
  /* `eff:shrink` is here rather than in `enhance` because a mass minus-N KILLS
     things, which is the job removal names. Splitting the sign moved 116 cards
     out of enhance, where a sweeper was being counted as an anthem: Massacre
     Wurm, Massacre Girl, Doomwake Giant, Languish. */
  /*
   * `eff:cant-block` and `eff:cant-attack` are Pacifism, Arrest, Cage of Hands,
   * Ice Cage, Bound in Silence, Nahiri's Binding — the whole neutralising-aura
   * family, which carried no facet at all and so could serve no role and be
   * chosen by nothing. A creature that can neither attack nor block has been
   * answered as surely as one that was destroyed, and in white it is often the
   * only answer available at that mana value.
   */
  removal: [
    'eff:destroy', 'eff:exile', 'eff:damage', 'eff:gain-control', 'eff:shrink',
    'eff:cant-block', 'eff:cant-attack',
  ],
  /*
   * `eff:move-zone` is bounce, and bounce at INSTANT speed is interaction.
   *
   * Cyclonic Rift is ranked 54 and had no role at all. The type gate is what
   * makes the rule sound rather than a synonym for "moves a card": a sorcery
   * that returns something to a hand is a tempo play or a recursion engine, and
   * `role-rule-try.mjs bounce` showed exactly that — Tortured Existence and
   * Oversold Cemetery are graveyard engines and would have been filed as
   * answers. An instant that returns a permanent to its owner's hand is an
   * answer to what somebody just did, which is what this role means.
   */
  /* The three stax words. A card that stops a spell being cast, stops an
     ability being activated, or makes both cost more is answering what the
     other players are trying to do, which is what this role means. Silence
     (407) and Drannith Magistrate (720) had no role before this. */
  interaction: [
    'eff:counter', 'eff:tap', 'eff:unless-pays', 'eff:discard', 'eff:move-zone',
    'eff:cant-cast', 'eff:cant-activate', 'eff:increase-cost',
  ],
  /*
   * Searching a library, EXCEPT for the land case, which is ramp and is
   * already claimed by `cares:zone:library-land` above. Rampant Growth and
   * Demonic Tutor both compile to `eff:search-library`; only one of them is
   * a tutor in the sense a deck builder means, and the difference is the
   * destination. `facetRoleQualifies` below is where that is said.
   */
  tutor: ['eff:search-library'],
  /* The two subtypes, and nothing cleverer. `eff:attach` looks like the right
     facet and is not: Ethereal Armor and Rancor do not carry it, so a rule
     built on it misses the two best cards in the archetype. */
  /* Auras and equipment, AND an anthem, which is the same job done to a board
     instead of to one creature. `eff:pump` needs the qualifier below or it
     claims every "equipped creature gets +N/+N", which is the mistake the
     wincon note records at length. */
  enhance: ['sub:aura', 'sub:equipment', 'eff:pump'],
  /* The keyword is only half the rule; `facetRoleQualifies` carries the other
     half, and without it this claims every creature that HAS hexproof rather
     than the cards that GRANT it. See the long note on the role in types.ts. */
  /*
   * `eff:exile-own` is the owner's friend's point, made mechanical.
   *
   * Exiling your OWN board is what Teferi's Protection (rank 109) and Eerie
   * Interlude (956) do, and it is exactly what a blink spell does in response
   * to removal. Both were filed as REMOVAL until the facet learned to say who
   * the exile was aimed at, and 140 cards catalogue-wide held the removal role
   * on nothing else.
   *
   * The keywords stay first: a card that HAS hexproof and a card that GRANTS a
   * save are both protection, and `facetRoleQualifies` decides which by looking
   * at whether the card also attaches or targets.
   */
  protection: [
    'kw:hexproof', 'kw:shroud', 'kw:indestructible', 'kw:protection', 'kw:ward',
    'eff:exile-own',
    /*
     * `eff:protect` is one word for one job done by four keywords, so a card is
     * not missed because it chose shroud over hexproof. `eff:prevent-damage` is
     * the Fog half: stopping the damage is protecting the board, and Teferi's
     * Protection is already here through `eff:exile-own` for the same reason.
     *
     * `grants:protection` joins `kw:protection` because GIVING protection is
     * the thing a deck wants and HAVING it is incidental — the same distinction
     * the `grants:` prefix was added to make, and the one that stopped
     * Purphoros being counted as protection.
     */
    'eff:protect', 'eff:prevent-damage', 'grants:protection',
    /* Pariah does not stop the damage, it moves it, and the deck runs it for
       exactly that reason. Still protection: you do not take it. */
    'eff:redirect-damage',
  ],
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
  // Fetching a basic is ramp, not tutoring. Cultivate is not Demonic Tutor.
  if (role === 'tutor') return !facets.includes('cares:zone:library-land');

  /*
   * A card that GRANTS a protective keyword, never one that merely HAS it.
   *
   * The facet set is flat, so `kw:hexproof` says the keyword is somewhere on
   * the card and not which clause put it there. An instant, a sorcery, an aura
   * or a piece of equipment exists to be applied to something else, so a
   * protective keyword on one of those is a grant; on a creature it is usually
   * that creature describing itself. Purphoros and Emrakul carry
   * `kw:indestructible` about themselves and are not protection cards.
   */
  /*
   * An anthem is `eff:pump` over everything, and the gate is what stops it
   * being the wincon mistake in a different word. Measured with
   * `scripts/role-rule-try.mjs anthem-creatures`: eight rescues, every one of
   * them a real anthem or finisher — Overrun, Triumph of the Hordes, Eldrazi
   * Monument, Intangible Virtue. Without `cares:type:creature` it also claimed
   * Past in Flames, whose pump is over instants and sorceries.
   */
  if (role === 'enhance') {
    if (facets.includes('sub:aura') || facets.includes('sub:equipment')) return true;
    return facets.includes('scope:all') && facets.includes('cares:type:creature');
  }

  if (role === 'protection') {
    return (
      facets.includes('type:instant') ||
      facets.includes('type:sorcery') ||
      facets.includes('sub:aura') ||
      facets.includes('sub:equipment')
    );
  }

  /*
   * Recursion counts as draw only when it comes OUT OF A GRAVEYARD.
   *
   * `eff:return-from` alone is any zone change back to somewhere, including a
   * blink returning a creature it exiled. Regrowth is card advantage; Ephemerate
   * is not, and the difference is the zone.
   */
  if (role === 'draw') {
    return facets.includes('eff:draw') || facets.includes('cares:zone:graveyard');
  }

  /*
   * Bounce is interaction at instant speed and a tempo play at sorcery speed.
   * The other four interaction facets stand on their own; only `eff:move-zone`
   * needs the gate, so a card carrying any of them passes regardless.
   */
  if (role === 'interaction') {
    if (
      facets.includes('eff:counter') ||
      facets.includes('eff:tap') ||
      facets.includes('eff:unless-pays') ||
      facets.includes('eff:discard')
    ) {
      return true;
    }
    return facets.includes('cares:zone:hand') && facets.includes('type:instant');
  }

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
   * True when the ONLY wants in this plan came from the floor: the last-resort
   * reading for a commander whose card says nothing at all.
   *
   * It exists so  can stand the floor down. A player who chose
   * an archetype has given a real instruction, and the floor is a guess about
   * a blank card; the guess must not dilute the instruction. Without this the
   * archetype could no longer speak alone for Isamaru, which is the one case
   * where it should speak loudest.
   */
  floorOnly?: boolean;
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
/* The separator between two card faces' rules text.
   A named constant rather than a literal, because writing the escape inline is
   how it keeps getting destroyed: this session has turned a backslash escape
   into a control character six separate times while editing through shell and
   Python string transformations, and `'\n'` written that way arrives as a real
   newline and breaks the file. There is nothing to mangle here. */
const FACE_JOIN = String.fromCharCode(10);

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
      /* THE OUTLET FIRST, because it is the card the deck cannot function
         without and the one the engine could not see until `cost:` existed.
         `eff:sacrifice` is Diabolic Edict making an OPPONENT sacrifice; the
         card a Meren deck actually needs is Viscera Seer, whose sacrifice is
         the COST of its own ability. They are different cards and this rule
         used to ask for the wrong one. */
      ['cost:sacrifice', 0.9],
      /*
       * AND THE ONE-SHOT VERSION, lower, because it is a different card.
       *
       * Village Rites, Deadly Dispute and Diabolic Intent eat one creature once
       * and are real aristocrats cards; Ashnod's Altar and Viscera Seer are the
       * engine the deck cannot function without. They carried the same facet
       * until 31 Aug 2026, which is how a Meren deck came out with Grave Pact,
       * Dictate of Erebos, Bastion of Remembrance, Grim Haruspex and Midnight
       * Reaper in it and nothing at all to sacrifice a creature to.
       */
      ['cost:cast-sacrifice', 0.6],
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

  /* ---------------------------------------------------------------- *
   * Everything below is GENERATED. Do not hand-edit inside the markers.
   * ---------------------------------------------------------------- *
   *
   * Written by `scripts/coverage-apply-rules.mjs` from a measured JSON rule
   * set. Every one of these was proposed against the real oracle text of a
   * commander the engine said nothing about, measured for reach and OVERREACH
   * by `scripts/coverage-try-rules.mjs` over all of them, and then attacked by
   * a second reader whose job was to kill it.
   *
   * They are generated rather than typed in because a regex retyped by hand is
   * a regex with a different meaning, and this session destroyed a backslash
   * escape six separate ways: `\b` in a template literal is the BACKSPACE
   * character, so `/\bCreature\b/i` matched nothing across the whole corpus and
   * looked like a clean result. What ships is the same bytes that were
   * measured.
   *
   * To change one: edit the JSON, re-measure, regenerate. To add one by hand:
   * put it ABOVE this block, outside the markers.
   */
  /* BEGIN GENERATED INTENT RULES */
  {
    when: /\{T\}[,:](?![^()]*\))/i,
    reads: "does its work through a tap ability",
    wants: [
      ['eff:untap', 0.8],
      ['kw:haste', 0.6],
      ['sub:equipment', 0.45],
    ],
  },
  {
    when: /(^|\n)\{[0-9X]+\}:/i,
    reads: "has an ability you can pay for over and over, so the deck wants a lot of mana",
    wants: [
      ['eff:add-mana', 0.8],
      ['cares:zone:library-land', 0.45],
      ['type:land', 0.35],
      ['eff:untap', 0.35],
    ],
  },
  {
    when: /(unspent (green |red |black |white |blue )?mana|whenever you tap a land for mana|creature you control with a mana ability|adds \{[WUBRGC]\}|add \{[WUBRGC]\} for each)/i,
    reads: "makes more mana than most decks, so give it big things to spend it on",
    wants: [
      ['eff:add-mana', 0.85],
      ['cares:zone:library-land', 0.5],
      ['type:land', 0.4],
    ],
  },
  {
    when: /\bcascade\b|mana value \d+ or greater(?![^.]{0,60}can't be cast)/i,
    reads: "pays you for casting expensive spells",
    wants: [
      ['eff:add-mana', 0.85],
      ['eff:search-library', 0.55],
      ['cares:zone:library-land', 0.5],
    ],
  },
  {
    when: /((?<!loyalty |equip )abilities you activate|activated abilities of|copy target activated)/i,
    reads: "cares about the activated abilities on your permanents",
    wants: [
      ['acost:3', 0.7],
      ['acost:2', 0.65],
      ['acost:1', 0.6],
      ['eff:untap', 0.5],
    ],
  },
  {
    when: /doesn't untap during your( next)? untap step\./i,
    reads: "stays tapped unless you untap it",
    wants: [
      ['eff:untap', 0.85],
      ['eff:tap', 0.45],
    ],
  },
  {
    when: /whenever [^.\n]{0,40} deals combat damage to (a|an) (player|opponent)/i,
    reads: "is paid when it hits a player in combat",
    wants: [
      ['sub:equipment', 0.8],
      ['eff:pump', 0.6],
      ['sub:aura', 0.55],
      ['kw:haste', 0.5],
      ['cares:sub:equipment', 0.4],
    ],
  },
  {
    when: /can't be blocked(?! except)|unblockable|landwalk|horsemanship/i,
    reads: "gets past blockers",
    wants: [
      ['sub:equipment', 0.8],
      ['eff:pump', 0.65],
      ['sub:aura', 0.55],
      ['cares:sub:equipment', 0.5],
      ['kw:haste', 0.45],
    ],
  },
  {
    when: /(ninjutsu|sneak \{)/i,
    reads: "sneaks a ninja in on an unblocked attacker",
    wants: [
      ['sub:ninja', 0.75],
      ['kw:ninjutsu', 0.7],
      ['kw:menace', 0.45],
      ['sub:rogue', 0.4],
    ],
  },
  {
    when: /(rampage \d|bushido \d|afflict \d|must be blocked|becomes blocked, (it|that creature|they))/i,
    reads: "is paid for being blocked",
    wants: [
      ['eff:pump', 0.75],
      ['sub:equipment', 0.6],
      ['kw:trample', 0.55],
      ['sub:aura', 0.45],
    ],
  },
  {
    when: /(whenever you attack|creature attacking|attacking alone|creatures you control attack)/i,
    reads: "pays you for attacking",
    wants: [
      ['trig:attacks', 0.8],
      ['kw:haste', 0.6],
      ['sub:equipment', 0.5],
      ['eff:pump', 0.5],
    ],
  },
  {
    when: /at the beginning of combat on your turn(?!, if you've cast a noncreature spell)/i,
    reads: "starts working at the beginning of every combat",
    wants: [
      ['trig:attacks', 0.7],
      ['kw:haste', 0.6],
      ['eff:pump', 0.55],
      ['sub:equipment', 0.45],
    ],
  },
  {
    when: /attacks[^.]{0,25}if able(?![^()]*\))/i,
    reads: "has to attack whether you want it to or not",
    wants: [
      ['sub:equipment', 0.75],
      ['sub:aura', 0.6],
      ['eff:pump', 0.6],
      ['kw:trample', 0.5],
    ],
  },
  {
    when: /creatures you control (gain|get \+\d)/i,
    reads: "makes all of your creatures better at once",
    wants: [
      ['eff:create-token', 0.8],
      ['trig:enters', 0.45],
      ['eff:pump', 0.4],
    ],
  },
  {
    when: /power (and toughness are each|is) equal to/i,
    reads: "has no set power and grows as the game goes on",
    wants: [
      ['sub:equipment', 0.75],
      ['kw:trample', 0.6],
      ['sub:aura', 0.5],
      ['eff:pump', 0.5],
    ],
  },
  {
    when: /where X is [A-Z][^.]{0,30}'s power/,
    reads: "counts its own power",
    wants: [
      ['eff:add-counters', 0.8],
      ['ctr:+1/+1', 0.75],
      ['eff:pump', 0.7],
      ['sub:equipment', 0.6],
      ['sub:aura', 0.5],
    ],
  },
  {
    when: /(switch [^.\n]{0,40}power and toughness|damage equal to (its|their) toughness|toughness rather than (its|their) power|total toughness of creatures you control)/i,
    reads: "fights with toughness instead of power",
    wants: [
      ['kw:defender', 0.8],
      ['sub:wall', 0.5],
      ['eff:pump', 0.5],
      ['cares:sub:wall', 0.4],
    ],
  },
  {
    when: /(enchanted or equipped|is equipped|equipped creature|equip abilit)/i,
    reads: "rewards the creature carrying your equipment and auras",
    wants: [
      ['sub:equipment', 0.85],
      ['sub:aura', 0.7],
      ['eff:attach', 0.65],
      ['cares:sub:equipment', 0.5],
    ],
  },
  {
    when: /commanders? you control/i,
    reads: "looks after your commander",
    wants: [
      ['sub:equipment', 0.8],
      ['sub:aura', 0.6],
      ['eff:pump', 0.6],
      ['kw:haste', 0.45],
    ],
  },
  {
    when: /^(?:(?:reach|flying|trample|menace|deathtouch|first strike|double strike|vigilance|indestructible|haste|horsemanship|banding|shadow|fear|intimidate)\b|\([^)]*\)|[;,.\s])+$/i,
    reads: "has combat keywords and nothing else we can read",
    wants: [
      ['sub:equipment', 0.75],
      ['sub:aura', 0.65],
      ['eff:pump', 0.6],
      ['cares:sub:equipment', 0.5],
      ['cares:sub:aura', 0.45],
    ],
  },
  {
    when: /protection from everything/i,
    reads: "cannot be blocked or killed, so the deck pushes it through",
    wants: [
      ['sub:equipment', 0.8],
      ['eff:pump', 0.7],
      ['sub:aura', 0.6],
      ['cares:sub:equipment', 0.5],
    ],
  },
  {
    when: /the Ring tempts you/i,
    reads: "is paid when the Ring tempts you",
    wants: [
      ['trig:attacks', 0.7],
      ['type:creature', 0.5],
      ['sub:equipment', 0.45],
    ],
  },
  {
    when: /(whenever [^.\n]{0,60}is dealt damage|enrage|if damage would be dealt to)/i,
    reads: "turns damage dealt to it into something useful",
    wants: [
      ['eff:damage', 0.7],
      ['eff:pump', 0.5],
      ['ctr:+1/+1', 0.45],
      ['kw:trample', 0.4],
    ],
  },
  {
    when: /((return|put|exile|cast|play|reveal|mill)[^.\n]{0,60}from your graveyard|in your graveyard (has|have|gains) (unearth|encore|flashback|escape)|(?<!or a creature )cards? in your graveyard|descend \d|\bdelve\b|target [a-z ]{0,30}card in your graveyard|(is|are) put into your graveyard)/i,
    reads: "plays with the cards in your graveyard",
    wants: [
      ['cares:zone:graveyard', 0.85],
      ['eff:return-from', 0.8],
      ['eff:mill', 0.7],
      ['eff:discard', 0.55],
    ],
  },
  {
    when: /(from (a|your) graveyard onto the battlefield|from your graveyard to the battlefield|return that card to the battlefield|has unearth|gains encore)/i,
    reads: "brings creatures back from your graveyard",
    wants: [
      ['eff:return-from', 0.85],
      ['cares:zone:graveyard', 0.8],
      ['eff:mill', 0.6],
      ['eff:discard', 0.5],
    ],
  },
  {
    when: /instant (and|or) sorcery cards? in (your|a) graveyard|instant or sorcery card from (your|a) graveyard|cast target instant or sorcery card from a graveyard/i,
    reads: "casts your instants and sorceries back out of the graveyard",
    wants: [
      ['cares:zone:graveyard', 0.85],
      ['type:instant', 0.75],
      ['type:sorcery', 0.75],
      ['eff:mill', 0.5],
      ['cares:type:instant', 0.5],
    ],
  },
  {
    when: /(cast|play|put) [^.]{0,70}from (a|that player's|target player's|an opponent's|each) graveyard/i,
    reads: "casts spells out of other players' graveyards",
    wants: [
      ['eff:mill', 0.8],
      ['cares:zone:graveyard', 0.75],
      ['eff:return-from', 0.6],
      ['eff:discard', 0.45],
    ],
  },
  {
    when: /(, discard (a|two|another|three|X)[^:\n]{0,25}:|discard a card:|unless you discard a card|discard your hand|discard a card or pay|discard a creature card)/i,
    reads: "turns the cards in your hand into fuel",
    wants: [
      ['eff:discard', 0.75],
      ['cares:zone:graveyard', 0.7],
      ['eff:return-from', 0.65],
      ['kw:madness', 0.4],
    ],
  },
  {
    when: /connives?/i,
    reads: "throws cards into your graveyard as you draw",
    wants: [
      ['cares:zone:graveyard', 0.8],
      ['eff:return-from', 0.7],
      ['eff:discard', 0.6],
      ['eff:mill', 0.45],
    ],
  },
  {
    when: /((?<!unless )that (player|opponent) discards|each (player|opponent) discards|discarded a card this turn)/i,
    reads: "makes your opponents discard",
    wants: [
      ['eff:discard', 0.85],
      ['cares:zone:hand', 0.6],
      ['eff:lose-life', 0.4],
    ],
  },
  {
    when: /(you may (play|cast) (that card|those cards|it|the exiled cards|one of those cards)|may cast [^.\n]{0,40}from among|until end of turn, you may (play|cast)|for as long as (it remains|they remain) exiled|spend mana as though it were mana of any|cast a card exiled with)/i,
    reads: "plays cards off the top of a library instead of drawing them",
    wants: [
      ['cares:zone:library', 0.75],
      ['eff:add-mana', 0.6],
      ['eff:scry', 0.5],
    ],
  },
  {
    when: /((cast|play) [^.]{0,60}from the top of your library|look at the top card of your library|exiles? cards? from the top of your library)/i,
    reads: "plays cards straight off the top of your library",
    wants: [
      ['cares:zone:library', 0.8],
      ['eff:scry', 0.65],
      ['eff:search-library', 0.45],
    ],
  },
  {
    when: /whenever you scry|(\{T\}|\{\d\}|combat on your turn|your upkeep|end step)[^.]{0,50}scry \d/i,
    reads: "looks at the top of your library every turn",
    wants: [
      ['eff:scry', 0.85],
      ['eff:draw', 0.6],
    ],
  },
  {
    when: /(no maximum hand size|whenever you draw your (first|second|third) card|draw two cards instead|draws? an additional card)/i,
    reads: "rewards you for drawing extra cards",
    wants: [
      ['eff:draw', 0.85],
      ['eff:scry', 0.5],
      ['cares:zone:hand', 0.5],
    ],
  },
  {
    when: /((each|that|an) (player|opponent)[^.]{0,40}draws? (a card|an additional|two|\w+ cards)|whenever an opponent draws)/i,
    reads: "hands cards to the table, which is only good if the table pays for them",
    wants: [
      ['eff:draw', 0.75],
      ['eff:lose-life', 0.65],
      ['eff:damage', 0.55],
      ['eff:discard', 0.5],
    ],
  },
  {
    when: /\bmiracle\b/i,
    reads: "cares which card you draw first each turn",
    wants: [
      ['eff:scry', 0.75],
      ['eff:draw', 0.7],
      ['cares:zone:library', 0.5],
    ],
  },
  {
    when: /search your library for (a|up to \w+) creature cards?/i,
    reads: "goes and finds a creature",
    wants: [
      ['eff:search-library', 0.7],
      ['type:creature', 0.55],
      ['cares:type:creature', 0.5],
    ],
  },
  {
    when: /number of (Island|Swamp|Mountain|Forest|Plains)s you control|land cards? are put into your graveyard|number of lands you control|land card from your graveyard/i,
    reads: "counts the lands you control",
    wants: [
      ['type:land', 0.75],
      ['cares:type:land', 0.7],
      ['cares:zone:library-land', 0.6],
      ['eff:search-library', 0.55],
    ],
  },
  {
    when: /domain|basic land types among/i,
    reads: "counts the basic land types you control",
    wants: [
      ['cares:zone:library-land', 0.85],
      ['eff:search-library', 0.8],
      ['cares:type:land', 0.6],
    ],
  },
  {
    when: /(prowess|whenever you cast (your (first|second) spell each turn|a noncreature spell)|if you've cast a noncreature spell this turn|instants?,? (and|or) sorcer|noncreature spells? you cast|cast your second spell|artifact, instant, (and|or) sorcery)/i,
    reads: "leans on your instants and sorceries",
    wants: [
      ['cares:type:instant', 0.85],
      ['cares:type:sorcery', 0.85],
      ['type:instant', 0.6],
      ['type:sorcery', 0.6],
    ],
  },
  {
    when: /copy target instant or sorcery spell|instant, (and |or )?sorcery spell, copy that spell|copy target spell you control/i,
    reads: "copies your instants and sorceries",
    wants: [
      ['type:instant', 0.85],
      ['type:sorcery', 0.8],
      ['cares:type:instant', 0.6],
      ['cares:type:sorcery', 0.55],
    ],
  },
  {
    when: /counter target spell|counters? that spell|counter it unless(?![^()]*\))/i,
    reads: "counters spells",
    wants: [
      ['eff:counter', 0.85],
      ['cares:zone:stack', 0.75],
      ['type:instant', 0.6],
      ['eff:draw', 0.4],
    ],
  },
  {
    when: /(as though (it|they) had flash|have flash\b)/i,
    reads: "lets you cast things at the end of someone else's turn",
    wants: [
      ['kw:flash', 0.6],
      ['type:instant', 0.6],
      ['trig:enters', 0.5],
      ['eff:counter', 0.45],
    ],
  },
  {
    when: /(whenever an opponent casts|spells your opponents cast(?! that target)|opponents? can't cast|(?<!that target [^.]{0,40})cost \{?\w+\}? more to cast|can't be cast|can't cast spells|players can cast spells only|lands don't untap)/i,
    reads: "taxes and slows down what your opponents can do",
    wants: [
      ['eff:counter', 0.75],
      ['cares:zone:stack', 0.65],
      ['type:instant', 0.55],
      ['eff:add-mana', 0.5],
    ],
  },
  {
    when: /(whenever you cast a creature spell|(?<!non)creature spells? you cast|cast (green )?creature spells)/i,
    reads: "cares about the creature spells you cast",
    wants: [
      ['type:creature', 0.8],
      ['cares:type:creature', 0.55],
      ['trig:cast', 0.35],
    ],
  },
  {
    when: /(you can't cast noncreature spells|noncreature spells with mana value \d+ or greater can't be cast)/i,
    reads: "shuts off your own noncreature spells",
    wants: [
      ['type:creature', 0.85],
      ['cares:type:creature', 0.5],
      ['eff:add-mana', 0.35],
    ],
  },
  {
    when: /commit a crime/i,
    reads: "is paid for pointing spells at your opponents",
    wants: [
      ['eff:destroy', 0.7],
      ['eff:damage', 0.6],
      ['type:instant', 0.55],
      ['eff:exile', 0.5],
    ],
  },
  {
    when: /(artifact (card|spell|creature)s?|artifacts you control|control an artifact|another artifact|an artifact you control|artifact, instant, (and|or) sorcery|ability of an artifact|from an artifact source|all artifacts|an artifact entered)/i,
    reads: "builds around the artifacts you control",
    wants: [
      ['type:artifact', 0.85],
      ['cares:type:artifact', 0.7],
      ['cares:sub:treasure', 0.45],
      ['tok:treasure', 0.4],
    ],
  },
  {
    when: /(legendary (permanent|creature|card|spell)|legendaries)/i,
    reads: "rewards you for filling the deck with legends",
    wants: [
      ['type:legendary', 0.85],
      ['eff:search-library', 0.45],
    ],
  },
  {
    when: /(historic|artifacts, legendaries)/i,
    reads: "is paid for your artifacts, legends and Sagas",
    wants: [
      ['type:artifact', 0.75],
      ['type:legendary', 0.7],
      ['sub:saga', 0.5],
      ['cares:sub:saga', 0.4],
    ],
  },
  {
    when: /(enchanted creature|enchantment cards? in your hand|each enchantment (card|permanent|spell)|enchantment (spell|card|permanent)s? you (control|cast))/i,
    reads: "builds around enchantments",
    wants: [
      ['type:enchantment', 0.85],
      ['cares:type:enchantment', 0.6],
      ['sub:aura', 0.55],
      ['kw:enchant', 0.5],
    ],
  },
  {
    when: /(planeswalkers? you control (dies|enters|deals)|planeswalker (card|spell)|loyalty abilit)/i,
    reads: "builds around planeswalkers",
    wants: [
      ['type:planeswalker', 0.85],
      ['cares:type:planeswalker', 0.6],
      ['ctr:loyalty', 0.5],
    ],
  },
  {
    when: /(face-down creature|turn (target )?[^.\n]{0,25}face up|\bmorph\b)/i,
    reads: "plays creatures face down and flips them up",
    wants: [
      ['kw:morph', 0.85],
      ['kw:megamorph', 0.6],
      ['type:creature', 0.4],
    ],
  },
  {
    when: /(changeling|every creature type|creatures you control of the chosen type)/i,
    reads: "counts as every creature type at once",
    wants: [
      ['kw:changeling', 0.7],
      ['type:creature', 0.7],
      ['cares:type:creature', 0.45],
    ],
  },
  {
    when: /\boutlaws?\b/i,
    reads: "counts your outlaws",
    wants: [
      ['sub:rogue', 0.7],
      ['sub:assassin', 0.7],
      ['sub:mercenary', 0.7],
      ['sub:pirate', 0.7],
      ['sub:warlock', 0.7],
      ['trig:enters', 0.35],
    ],
  },
  {
    when: /becomes? the monarch/i,
    reads: "brings the monarch into the game",
    wants: [
      ['eff:set-monarch', 0.85],
      ['kw:deathtouch', 0.5],
      ['kw:vigilance', 0.45],
    ],
  },
  {
    when: /(open an attraction|whenever you roll)/i,
    reads: "opens Attractions and rolls dice",
    wants: [
      ['sub:attraction', 0.8],
      ['trig:enters', 0.4],
    ],
  },
  {
    when: /(as a copy of|becomes? a copy of|tokens? that are copies of|copy of (another )?target creature)/i,
    reads: "copies your creatures",
    wants: [
      /*
       * `eff:copy` first, because without it this rule asked a clone commander
       * for everything EXCEPT clones.
       *
       * The three wants below are the shell around the theme — enters triggers
       * worth copying, creatures to copy, tokens to copy them with — and not
       * one of the 61 cards carrying the `clone` tag has any of them. Clone,
       * Phantasmal Image, Spark Double, Sakashima and Vesuva compile to a
       * Shapeshifter type line and nothing else, so a Commander built to copy
       * things pulled no copy card toward itself at all.
       *
       * Found by the reader verifying the tag mapping, which is the point of
       * adding a word and a consumer in the same pass: `eff:copy` was declared,
       * fed by 65 cards, and read by nobody.
       */
      ['eff:copy', 0.85],
      ['trig:enters', 0.8],
      ['type:creature', 0.6],
      ['eff:create-token', 0.5],
    ],
  },
  {
    when: /((create|creates) [^.]{0,40}tokens? that('s| are) (a )?cop(y|ies)|tokens? would be created)/i,
    reads: "makes copies of your own permanents",
    wants: [
      ['eff:create-token', 0.85],
      ['trig:enters', 0.7],
      ['type:creature', 0.4],
    ],
  },
  {
    when: /created a token this turn|created one or more tokens|create a token|creates a token|creates? [^.\n]{0,45}creature tokens?/i,
    reads: "makes tokens of its own",
    wants: [
      ['eff:create-token', 0.85],
      ['trig:enters', 0.45],
      ['eff:sacrifice', 0.4],
      ['eff:pump', 0.4],
    ],
  },
  {
    when: /investigate/i,
    reads: "makes Clues you cash in later",
    wants: [
      ['tok:clue', 0.75],
      ['cares:sub:clue', 0.7],
      ['type:artifact', 0.5],
      ['eff:draw', 0.45],
    ],
  },
  {
    when: /return [^.]{0,40}(creature|permanent|spell|card)s?[^.]{0,40} to (its|their) owner'?s hands?/i,
    reads: "keeps sending permanents back to hand",
    wants: [
      ['trig:enters', 0.8],
      ['eff:move-zone', 0.6],
      ['type:creature', 0.4],
    ],
  },
  {
    when: /(when|whenever)[^.\n]{0,70}exile [A-Z][^.\n]{0,25}\. Return it to the battlefield/i,
    reads: "leaves and comes straight back",
    wants: [
      ['trig:enters', 0.8],
      ['eff:move-zone', 0.55],
      ['type:creature', 0.5],
    ],
  },
  {
    when: /creatures? entered the battlefield under your control|creatures? you control entered the battlefield/i,
    reads: "rewards a turn where lots of creatures arrived",
    wants: [
      ['eff:create-token', 0.8],
      ['trig:enters', 0.65],
      ['type:creature', 0.5],
    ],
  },
  {
    when: /put (a|an) (permanent|artifact, creature, or land) card from (your|their) hand onto the battlefield/i,
    reads: "puts permanents from your hand straight onto the battlefield",
    wants: [
      ['type:creature', 0.6],
      ['eff:draw', 0.5],
      ['type:artifact', 0.4],
      ['type:enchantment', 0.4],
    ],
  },
  {
    when: /for each card type among/i,
    reads: "pays you for casting a spread of card types",
    wants: [
      ['type:instant', 0.7],
      ['type:sorcery', 0.7],
      ['type:artifact', 0.7],
      ['type:enchantment', 0.7],
      ['type:creature', 0.45],
    ],
  },
  {
    when: /(, sacrifice (a|an|another|three other|any number of)\b|you may sacrifice any number of)/i,
    reads: "sacrifices your own permanents as a cost",
    wants: [
      ['eff:sacrifice', 0.8],
      ['trig:dies', 0.7],
      ['eff:create-token', 0.6],
      ['eff:return-from', 0.4],
    ],
  },
  {
    when: /(sacrifices? a permanent|sacrifices? an artifact, creature, or land|each player sacrifices|each opponent sacrifices)/i,
    reads: "makes everyone sacrifice permanents",
    wants: [
      ['eff:create-token', 0.8],
      ['eff:sacrifice', 0.6],
      ['trig:dies', 0.55],
      ['eff:return-from', 0.4],
    ],
  },
  {
    when: /(each opponent loses \w+ life|lost \d+ or more life|lost life this turn|that player loses \w+ life)/i,
    reads: "is paid when your opponents lose life",
    wants: [
      ['eff:lose-life', 0.8],
      ['eff:gain-life', 0.6],
      ['eff:damage', 0.5],
    ],
  },
  {
    when: /(whenever you gain life|if you gained \d+ or more life this turn|if you gained life this turn|causes you to gain life)/i,
    reads: "is paid whenever you gain life",
    wants: [
      ['eff:gain-life', 0.85],
      ['kw:lifelink', 0.65],
      ['trig:gains-life', 0.6],
      ['eff:lose-life', 0.4],
    ],
  },
  {
    when: /(double all damage|damage to each player|damage to each opponent|half that player's life total)/i,
    reads: "hits every opponent at once",
    wants: [
      ['eff:damage', 0.85],
      ['type:instant', 0.55],
      ['type:sorcery', 0.55],
      ['eff:lose-life', 0.45],
    ],
  },
  {
    when: /(double (all )?[^.\n]{0,30}damage|deals double that damage)/i,
    reads: "doubles the damage your cards deal",
    wants: [
      ['eff:damage', 0.85],
      ['eff:pump', 0.5],
      ['type:instant', 0.35],
      ['type:sorcery', 0.35],
    ],
  },
  {
    when: /(proliferate|put one or more counters on|counters? would be put on|plus one of each of those kinds of counters|move a counter from|put your choice of a counter|creatures? you control with counters on them|counters? on (a|another) (creature|permanent))/i,
    reads: "piles extra counters onto your permanents",
    wants: [
      ['eff:add-counters', 0.85],
      ['ctr:+1/+1', 0.8],
      ['eff:proliferate', 0.7],
      ['eff:player-counter', 0.45],
    ],
  },
  {
    when: /put [^.]{0,20}stun counters? on (each|target|those|up to)/i,
    reads: "taps your opponents' creatures down and keeps them there",
    wants: [
      ['eff:tap', 0.8],
      ['eff:proliferate', 0.6],
      ['eff:untap', 0.35],
    ],
  },
  {
    when: /gain control of target/i,
    reads: "takes your opponents' permanents",
    wants: [
      ['eff:gain-control', 0.8],
      ['eff:untap', 0.55],
      ['kw:haste', 0.5],
      ['eff:sacrifice', 0.45],
    ],
  },
  {
    when: /(prevent the next [0-9]|prevent all combat damage|damage that would be dealt to [^.]{0,40} is dealt to)/i,
    reads: "keeps your creatures alive through combat",
    wants: [
      ['kw:indestructible', 0.65],
      ['kw:protection', 0.6],
      ['kw:hexproof', 0.5],
      ['eff:gain-life', 0.5],
      ['kw:vigilance', 0.4],
    ],
  },
  {
    when: /creature an opponent controls would die, exile it instead/i,
    reads: "keeps the creatures your removal kills",
    wants: [
      ['eff:destroy', 0.85],
      ['eff:damage', 0.6],
      ['cares:type:creature', 0.4],
    ],
  },
  {
    when: /(casts? a spell that targets|spell you control that targets|creature you control becomes the target of a spell or ability)/i,
    reads: "rewards you for aiming spells at your own creatures",
    wants: [
      ['sub:aura', 0.7],
      ['eff:pump', 0.7],
      ['sub:equipment', 0.5],
      ['type:instant', 0.45],
    ],
  },
  {
    when: /triggers an additional time|copy target triggered ability/i,
    reads: "makes your other triggered abilities happen twice",
    wants: [
      ['trig:enters', 0.75],
      ['trig:attacks', 0.75],
      ['trig:dies', 0.55],
      ['eff:create-token', 0.45],
    ],
  },
  {
    when: /if (a|another) creature (you control )?died this turn|if (three|two|four|\d+) or more creatures died this turn/i,
    reads: "only pays out on a turn one of your creatures died",
    wants: [
      ['trig:dies', 0.8],
      ['eff:sacrifice', 0.75],
      ['eff:create-token', 0.6],
    ],
  },
  {
    when: /(^|\n)Flash( |\n|$)/i,
    reads: "can be cast on someone else's turn, so the deck holds mana up",
    wants: [
      ['type:instant', 0.7],
      ['eff:counter', 0.55],
      ['kw:flash', 0.5],
      ['trig:enters', 0.45],
    ],
  },
  {
    when: /deals? [^.\n]{0,30}damage (divided as you choose |equal to [^.\n]{0,25})?(to (any target|target creature|that player|each of up to)|divided as you choose among)/i,
    reads: "points damage at whatever needs shooting",
    wants: [
      ['eff:damage', 0.8],
      ['type:instant', 0.5],
      ['type:sorcery', 0.5],
      ['eff:destroy', 0.4],
    ],
  },
  {
    when: /prevent all damage that would be dealt to (?!target|any target|each|all)/i,
    reads: "cannot be killed by damage, so the deck arms it and swings",
    wants: [
      ['sub:equipment', 0.8],
      ['eff:pump', 0.7],
      ['sub:aura', 0.6],
      ['cares:sub:equipment', 0.5],
    ],
  },
  {
    when: /whenever [^.\n]{0,45}another (nontoken )?creature you control enters/i,
    reads: "triggers whenever your other creatures arrive",
    wants: [
      ['type:creature', 0.75],
      ['trig:enters', 0.7],
      ['eff:create-token', 0.5],
    ],
  },
  {
    when: /whenever [^.\n]{0,25} blocks (one or more|a |another)/i,
    reads: "is paid for blocking",
    wants: [
      ['kw:defender', 0.7],
      ['kw:vigilance', 0.55],
      ['eff:pump', 0.5],
      ['sub:wall', 0.45],
    ],
  },
  {
    // Edric, Grazilaxx and Popular Entertainer. The shipped combat damage
    // rule reads ` deals combat damage to a player`, so it finds one
    // attacker and misses every commander written in the plural, `one or
    // more creatures you control deal`. All three want the same deck: lots
    // of cheap bodies that opponents cannot profitably block.
    when: /whenever (one or more |a )?creatures?( you control)? deals? combat damage to (a player|one of your opponents)/i,
    reads: "pays you every time your creatures connect",
    wants: [
      ['trig:deals-damage', 0.8],
      ['kw:flying', 0.6],
      ['eff:create-token', 0.55],
      ['type:creature', 0.5],
      ['kw:menace', 0.45],
    ],
  },
  {
    // Fang, Fearless l'Cie and Kirol, History Buff. This is the reverse of
    // every graveyard rule we already have: the payment is not for filling
    // the yard, it is for emptying it. So the deck needs both halves,
    // something to put cards there and something to take them back.
    when: /cards? leave your graveyard/i,
    reads: "is paid when cards come back out of your graveyard",
    wants: [
      ['cares:zone:graveyard', 0.85],
      ['eff:return-from', 0.8],
      ['eff:mill', 0.6],
      ['eff:discard', 0.5],
    ],
  },
  {
    // Bruvac. A mill doubler is only a commander if the deck is full of
    // mill, and popularity alone gives him blue goodstuff instead.
    when: /(mill twice that many|would mill one or more cards)/i,
    reads: "doubles how much your opponents mill",
    wants: [
      ['eff:mill', 0.85],
      ['cares:zone:library', 0.5],
      ['cares:zone:graveyard', 0.35],
    ],
  },
  {
    // Candlekeep Sage and Far Traveler, read INSIDE the quotation marks. A
    // Background's own words are `Commander creatures you own have`, and
    // the deck is the ability it grants, not the granting. Both grant a
    // blink payoff, so both decks are creatures worth re-entering plus the
    // effects that re-enter them.
    when: /(enters or leaves the battlefield|exile up to one target tapped creature you control, then return it)/i,
    reads: "pays you for sending your creatures away and bringing them back",
    wants: [
      ['trig:enters', 0.8],
      ['eff:move-zone', 0.65],
      ['trig:leaves', 0.5],
      ['eff:draw', 0.4],
    ],
  },
  {
    // Syr Vondam, God-Eternal Bontu, God-Eternal Oketra. The owner named this
    // one: "syr vondom benefits from cards being exhiled, but strategy doesnt
    // show a blink option".
    //
    // The rule above it reads "dies", matches Syr Vondam, and stops, so the
    // plan came out as a pure aristocrats deck and the second half of his own
    // trigger was never read. A creature of yours going to exile is what a
    // BLINK deck does on purpose every turn, so the two halves want different
    // decks and both are correct.
    //
    // The weights sit just under the dies rule's on purpose. Sacrifice is the
    // cheaper and more repeatable way to turn the trigger on, so it should
    // stay the stronger reading; this adds the second deck rather than
    // replacing the first.
    when: /(dies or is put into exile|creature you control is put into exile|permanents? you control (is|are) exiled)/i,
    reads: 'is also paid when your own creatures are exiled, which is what blinking them does',
    /*
     * THESE WANTS WERE BOTH WRONG, in opposite directions, and the owner found
     * it by building the deck: "nothing in here is really blink".
     *
     * `eff:move-zone` was the loudest want at 0.80 and NO BLINK CARD CARRIES
     * IT. Ephemerate, Cloudshift and Ghostly Flicker produced no effect facet
     * at all, because "exile target creature you control, THEN return it" had
     * no rule. The want was dead: weight spent on nothing.
     *
     * `eff:exile` at 0.45 was worse than dead. Every removal spell in the
     * format carries it, so the deck filled with Swords to Plowshares and Path
     * to Exile, which do nothing for him whatsoever. He is paid by exile FROM
     * THE BATTLEFIELD and by his own creatures, and a flat `eff:exile` could
     * say neither.
     *
     * `eff:exile-own` says both, and it exists now.
     */
    wants: [
      ['eff:exile-own', 0.85],
      ['trig:enters', 0.7],
      ['eff:return-from', 0.6],
      ['trig:leaves', 0.5],
    ],
  },
  {
    // Laelia, Ranar, Bell Borca, The War Doctor, Ketramose. A different deck
    // from the one above and it must not be folded into it: these count cards
    // reaching exile FROM ANYWHERE, so the deck is impulse draw, foretell and
    // self-exile rather than flickering your own board.
    when: /(one or more (other )?cards are put into exile|card as it's put into exile|cards? (is|are) put into exile from)/i,
    reads: 'counts cards going to exile, so the deck puts them there itself',
    wants: [
      ['eff:exile', 0.8],
      ['cares:zone:library', 0.55],
      ['eff:draw', 0.45],
      ['cares:zone:graveyard', 0.35],
    ],
  },
  {
    // Folk Hero, read inside the quotation. Which type is decided by the
    // partner it is paired with, so the only honest wants are creatures
    // generally and the changelings that are every type at once and
    // therefore always turn it on.
    when: /shares a creature type with/i,
    reads: "pays you for casting things that share a creature type",
    wants: [
      ['type:creature', 0.75],
      ['kw:changeling', 0.6],
      ['cares:type:creature', 0.45],
    ],
  },
  {
    // Passionate Archaeologist, read inside the quotation. The deck is
    // built on cards that exile something and let you play it later, so
    // exile is the resource and not a removal effect.
    when: /cast a spell from exile/i,
    reads: "is paid when you cast a card from exile",
    wants: [
      ['eff:exile', 0.8],
      ['cares:zone:library', 0.5],
      ['eff:damage', 0.45],
      ['type:instant', 0.35],
    ],
  },
  {
    // Tomorrow, Azami's Familiar and Scion of Halaster. A replacement on
    // the draw is worth far more the more times you draw, so the deck
    // wants draw and it wants to know what is on top.
    when: /you would draw a card[^.\n]{0,30}look at/i,
    reads: "turns every card you draw into a choice",
    wants: [
      ['eff:draw', 0.75],
      ['cares:zone:library', 0.55],
      ['eff:scry', 0.45],
    ],
  },
  {
    // Scion of Halaster, the second half of what it grants. A free card
    // into the yard each turn is only a cost if nothing in the deck wants
    // it there, so the deck should want it there.
    when: /put one of them into your graveyard/i,
    reads: "puts a card in your graveyard every turn whether you like it or not",
    wants: [
      ['cares:zone:graveyard', 0.7],
      ['eff:return-from', 0.55],
      ['eff:mill', 0.45],
    ],
  },
  {
    // Tuvasa. The shipped enchantment rule wants the words `enchantment
    // card`, `enchantment permanent` or `enchantment spell you cast`, and
    // Tuvasa says neither, so the most obvious enchantress commander in
    // the game got a generic deck.
    when: /(for each enchantment you control|first enchantment spell each turn)/i,
    reads: "grows and draws off the enchantments you control",
    wants: [
      ['type:enchantment', 0.85],
      ['sub:aura', 0.6],
      ['cares:type:enchantment', 0.55],
      ['eff:draw', 0.4],
    ],
  },
  {
    // Zimone, Infinite Analyst. An X spell is only good with a lot of mana
    // behind it, and Zimone also pays in +1/+1 counters, so the deck is
    // ramp plus counters rather than cheap interaction.
    when: /spells? with \{X\} in (its|their) mana cost/i,
    reads: "rewards you for casting spells with X in the cost",
    wants: [
      ['eff:add-mana', 0.8],
      ['ctr:+1/+1', 0.7],
      ['eff:add-counters', 0.65],
      ['type:sorcery', 0.4],
      ['type:instant', 0.4],
    ],
  },
  {
    // Tyvar, the Pummeler. The shipped team pump rule reads `get +`
    // followed by a digit, so every commander whose pump is written as
    // +X/+X falls straight through it. A finisher that scales with the
    // board wants a board.
    when: /creatures you control get \+X\/\+X/i,
    reads: "makes your whole team bigger at once",
    wants: [
      ['type:creature', 0.7],
      ['eff:create-token', 0.6],
      ['kw:trample', 0.55],
      ['eff:pump', 0.5],
      ['eff:untap', 0.4],
    ],
  },
  {
    // Ulrich of the Krallenhorde. That sentence is printed on werewolves
    // and on nothing else, so it is the cleanest tribal signal in the
    // game. The tribe branch missed him because it needs the type named in
    // a filter and his only mention is `non-Werewolf creature you don't
    // control`.
    when: /if no spells were cast last turn/i,
    reads: "flips back and forth depending on how many spells were cast",
    wants: [
      ['sub:werewolf', 0.8],
      ['cares:sub:werewolf', 0.5],
      ['type:creature', 0.45],
      ['eff:pump', 0.35],
    ],
  },
  {
    // Zenos yae Galvus. The flip is the whole card and you have to kill
    // the chosen creature to get it, so the deck is removal first.
    when: /when the chosen creature leaves the battlefield/i,
    reads: "needs the creature it picked to die before it turns over",
    wants: [
      ['eff:destroy', 0.75],
      ['eff:exile', 0.6],
      ['eff:damage', 0.55],
    ],
  },
  {
    // Sasaya, Orochi Ascendant, on both faces. The front asks for seven
    // lands in hand and the back pays per land with the same name, so the
    // deck is basics, lands searched into hand rather than onto the
    // battlefield, and something enormous to spend it on. The shipped mana
    // rule reads `whenever you tap a land for mana` and Sasaya says `a
    // land you control is tapped for mana`.
    when: /(land cards? in your hand|a land you control is tapped for mana)/i,
    reads: "wants lands piled up in your hand and pays you for tapping them",
    wants: [
      ['cares:zone:library-land', 0.8],
      ['type:land', 0.7],
      ['eff:add-mana', 0.65],
      ['eff:search-library', 0.6],
      ['cares:zone:hand', 0.4],
    ],
  },
  {
    // Archelos. Tapping him locks the table down and untapping him frees
    // you, so the deck wants ways to tap and untap him at will, and it can
    // play the lands that would enter tapped anyway for free.
    when: /(other permanents|permanents your opponents control|creatures your opponents control|lands your opponents control) enters? tapped/i,
    reads: "decides whether everything else arrives tapped or untapped",
    wants: [
      ['eff:untap', 0.8],
      ['eff:tap', 0.6],
      ['type:land', 0.45],
      ['cares:zone:library-land', 0.4],
    ],
  },
  {
    // Blind Seer. Repainting a spell or permanent is only worth a
    // commander slot next to cards that care what colour something is:
    // protection, colour hosers and colour-specific removal.
    when: /becomes? the colou?r of your choice/i,
    reads: "changes what colour things are, so cards that punish one colour always have a target",
    wants: [
      ['kw:protection', 0.6],
      ['eff:destroy', 0.5],
      ['eff:counter', 0.45],
    ],
  },
  {
    // Yukora, the Prisoner. The drawback names the tribe, so the deck
    // answers it by being that tribe, and the trigger itself is a free
    // board sacrifice worth building around.
    when: /non-Ogre creatures/i,
    reads: "kills every creature you control that is not an Ogre",
    wants: [
      ['sub:ogre', 0.8],
      ['eff:sacrifice', 0.5],
      ['trig:dies', 0.45],
      ['cares:sub:ogre', 0.4],
    ],
  },
  {
    // Pipsqueak. Two demands in one sentence: other attackers, and a +1/+1
    // counter on it. The shipped counters rule looks for `counters on it`
    // and Pipsqueak says `on him`.
    when: /can't attack alone/i,
    reads: "will not attack on its own, so it needs friends and a counter",
    wants: [
      ['eff:create-token', 0.75],
      ['type:creature', 0.6],
      ['ctr:+1/+1', 0.55],
      ['eff:add-counters', 0.55],
      ['trig:attacks', 0.45],
    ],
  },
  {
    // Zurgo Bellstriker and Zhou Yu. Their entire text is a restriction. A
    // restriction says nothing about what to build, so the only honest
    // reading is the one every player makes at the table: a cheap legend
    // with no abilities is a body you arm and swing with.
    when: /can't (attack|block) (unless|creatures)/i,
    reads: "has a drawback in combat and nothing else we can read, so the deck pushes it through",
    wants: [
      ['sub:equipment', 0.65],
      ['eff:pump', 0.55],
      ['sub:aura', 0.5],
      ['kw:haste', 0.45],
      ['cares:sub:equipment', 0.4],
    ],
  },
  {
    // Halfdane and Ambassador Blorpityblorpboop. Both rewrite their own
    // power every turn from something outside the card, which means the
    // card tells you nothing about a deck except that the commander is the
    // thing attacking.
    when: /(base power (and toughness )?becomes?|change [A-Z][^.\n]{0,30}'s base power)/i,
    reads: "rewrites its own power every turn, so the deck just makes sure it connects",
    wants: [
      ['sub:equipment', 0.65],
      ['kw:trample', 0.55],
      ['eff:pump', 0.5],
      ['sub:aura', 0.45],
      ['kw:haste', 0.4],
    ],
  },
  {
    // Elrond, Moon-Reader. The shipped activated-ability rule reads
    // `abilities you activate` and `activated abilities of`, and Elrond
    // says `whenever you activate an ability of a creature`. The deck
    // wants creatures whose abilities are cheap enough to fire every turn,
    // and untappers to fire them twice.
    when: /whenever you activate an ability/i,
    reads: "pays you for using the abilities on your creatures",
    wants: [
      ['acost:1', 0.75],
      ['acost:0', 0.7],
      ['acost:2', 0.65],
      ['eff:untap', 0.55],
      ['type:creature', 0.5],
    ],
  },
  {
    // Professor Hojo and Loki. Both want a deck full of abilities that
    // pick a target, which is what equipping, pumping and tapping all are.
    when: /becomes? the target of an (activated )?ability/i,
    reads: "pays you when your abilities pick a target",
    wants: [
      ['acost:1', 0.7],
      ['acost:2', 0.65],
      ['acost:0', 0.6],
      ['eff:pump', 0.55],
      ['sub:equipment', 0.45],
      ['eff:tap', 0.4],
    ],
  },
  {
    // Stenn and Umori. Neither says which type, and Stenn cannot choose
    // creature or land, so the reading is that the deck is stacked with
    // noncreature permanents and spells rather than spread evenly.
    when: /of the chosen type cost/i,
    reads: "makes one card type cheaper, so the deck leans on that type",
    wants: [
      ['type:artifact', 0.6],
      ['type:enchantment', 0.6],
      ['type:instant', 0.5],
      ['type:sorcery', 0.5],
    ],
  },
  {
    // Zedruu. The deck is the opposite of every other control-changing
    // commander: it wants things that are bad to own and effects that hand
    // them over, and it counts how many it has given away.
    when: /(gains? control of target permanent you control|permanents you own that your opponents control)/i,
    reads: "gives your own permanents away and gets paid for it",
    wants: [
      ['eff:gain-control', 0.8],
      ['eff:draw', 0.5],
      ['eff:gain-life', 0.45],
      ['type:enchantment', 0.4],
    ],
  },
  {
    // Sisters of Stone Death. A lure is only good on a creature that wins
    // the fight and survives it, so the deck wants deathtouch, first
    // strike and ways to keep it alive rather than more attackers.
    when: /blocks [A-Z][^.\n]{0,30} this turn if able/i,
    reads: "forces a creature to block it",
    wants: [
      ['kw:deathtouch', 0.7],
      ['kw:first strike', 0.6],
      ['kw:vigilance', 0.5],
      ['sub:equipment', 0.5],
      ['eff:pump', 0.45],
    ],
  },
  {
    // Tymaret, Chosen from Death. Counting mana symbols only pays if the
    // deck is heavily one colour and full of permanents that stay on the
    // battlefield, which is creatures and enchantments rather than
    // instants.
    when: /devotion to (white|blue|black|red|green)/i,
    reads: "counts the coloured mana symbols on the permanents you control",
    wants: [
      ['type:creature', 0.6],
      ['type:enchantment', 0.55],
      ['eff:exile', 0.4],
      ['eff:gain-life', 0.35],
    ],
  },
  {
    // Yasharn. The reason anybody plays this card is the second sentence,
    // and it is a lock piece, so the deck should be the rest of the lock
    // and the lands to hold it up rather than a green ramp pile.
    when: /players can't (pay life|sacrifice|search)/i,
    reads: "stops everyone paying life or sacrificing things to get ahead",
    wants: [
      ['type:creature', 0.6],
      ['eff:search-library', 0.55],
      ['cares:zone:library-land', 0.5],
      ['type:land', 0.4],
      ['type:enchantment', 0.4],
    ],
  },
  {
    // Niambi. The whole card is one fetch, so the deck is the card being
    // fetched plus the enter-the-battlefield shell that gets to do it
    // again.
    when: /search your library (and\/or graveyard )?for a card named/i,
    reads: "goes and finds one particular card when it arrives",
    wants: [
      ['eff:search-library', 0.65],
      ['trig:enters', 0.6],
      ['eff:move-zone', 0.4],
    ],
  },
  /* END GENERATED INTENT RULES */
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
  /*
   * A COMMANDER WITH A TAP ABILITY WANTS HASTE, and this is a FACET rule rather
   * than an intent rule for a reason worth stating.
   *
   * The intent rules exist to rescue a card the compiler could not read, so
   * they are gated on `rec:full` — English must not talk over a parsed record.
   * Krenko, Mob Boss is `rec:full`: the compiler read "{T}: Create X 1/1 red
   * Goblin creature tokens" perfectly. It simply has no vocabulary for the
   * CONSEQUENCE, which every Commander player knows: a creature that taps for
   * value is doing nothing the turn it lands unless something gives it haste.
   *
   * That is not a rescue, it is an inference layered on a record that was read,
   * so the gate should not apply and the rule belongs here. Swiftfoot Boots and
   * Lightning Greaves, ranked 12 and 13 in the format, scored a commander fit of
   * ZERO for Krenko and were missing from every deck built for him.
   *
   * `cost:tap` on a COMMANDER, never on a card in the pool: these rules read the
   * commander's own facets, so a Sol Ring carrying `cost:tap` is not what fires
   * it. A commander whose only tap ability is a mana ability still wants haste,
   * which is why the rule is not narrowed further.
   *
   * The weights match the intent rule that says the same thing in English, so a
   * commander the compiler CANNOT read gets the identical plan through the other
   * door.
   */
  {
    when: 'cost:tap',
    wants: [
      { facet: 'eff:untap', weight: 0.8 },
      { facet: 'kw:haste', weight: 0.6 },
      { facet: 'sub:equipment', weight: 0.45 },
    ],
  },
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
  /*
   * A RETURN IS NOT A RETURN FROM THE GRAVEYARD, and this rule said it was.
   *
   * Brago, King Eternal exiles his own permanents and returns them. The blink
   * rule compiles that to `eff:exile-own` + `eff:return-from` with the zone on
   * the return set to exile, and this rule then handed him `cares:zone:graveyard`
   * at 0.8, `eff:mill` and `eff:sacrifice` — a reanimator plan for a commander
   * who never touches a graveyard. Measured: he read as Reanimator ahead of
   * Blink, and his deck came back with Entomb-shaped cards in it.
   *
   * The companions that assume a graveyard belong to the `cares:zone:graveyard`
   * rule directly below, which fires only when the card actually names one. A
   * return on its own says only that things come back.
   */
  {
    when: 'eff:return-from',
    wants: [
      { facet: 'eff:return-from', weight: 0.9 },
    ],
  },
  /*
   * BLINK, read from the facet that means it.
   *
   * `eff:exile-own` is the direction reader's word for "exiles one of YOUR
   * permanents", and paired with a return it is a blink. Brago, King Eternal
   * compiles to exactly that and had NO want for it: the only rules that could
   * speak about him were the combat-damage rule, which pushed voltron, and
   * the return-from rule above, which (until today) pushed reanimation. A
   * blink commander read as anything but blink.
   *
   * Universal, not a Brago rule: every commander whose own text blinks
   * something — Brago, Roon, Yorion, Aminatou, Norin — reaches this through
   * the same facet, and the wants are the Blink shell's own packages said as
   * facets: the blink, the things worth blinking, the doubling.
   */
  {
    when: 'eff:exile-own',
    wants: [
      { facet: 'eff:exile-own', weight: 0.9 },
      { facet: 'eff:return-from', weight: 0.8 },
      { facet: 'trig:enters', weight: 0.75 },
      { facet: 'cares:zone:exile', weight: 0.6 },
      { facet: 'eff:multiply', weight: 0.5 },
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
  /**
   * The card's faces, when it has them.
   *
   * `oracle_text` is NULL for every transform, modal DFC, split, adventure and
   * prepare layout, because Scryfall puts the words in `card_faces[]`.
   * CLAUDE.md records this and it still caught us: passing `oracle_text`
   * straight through meant every double-faced commander reached the intent
   * rules with an empty string and was recorded as having said nothing.
   * Measured 2026-08-30: 186 of 586 silent commanders, 31.7% of all silence,
   * were cards whose text was never handed to the reader.
   *
   * Reading it here rather than at each call site is deliberate. Three
   * callers pass a commander in and all three had the same hole; a fourth
   * would have had it too.
   */
  faces?: readonly { oracle_text?: string | null }[] | null;
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
  const oracleText =
    commander.oracleText?.trim() ||
    (commander.faces ?? [])
      .map(f => f?.oracle_text ?? '')
      .filter(Boolean)
      .join(FACE_JOIN) ||
    '';

  /*
   * ON SILENCE **OR** ON A THIN READING, and the second half was added
   * 2026-08-30 because of Meren of Clan Nel Toth.
   *
   * Meren is an aristocrats commander. Her text is "whenever another creature
   * you control dies" and "return it to the battlefield", and the intent rule
   * for exactly that sentence has existed all along. It never ran, because her
   * facets are not silent: `ctr:experience` produced two wants, so `wants.size`
   * was non-zero and the second reader was skipped. Her whole plan was
   *
   *   ctr:experience@0.9, eff:proliferate@0.8
   *
   * which is a true but incidental reading of a card whose deck is built out of
   * sacrifice outlets and creatures worth sacrificing. Measured through the
   * audit, 16 of 60 nonland cards keyed off her against 81-90% for four other
   * commanders in the same run.
   *
   * The gate's own comment is the argument for changing it: it says an intent
   * rule is "a more specific claim" than the combat fallback below, which is an
   * inference from SILENCE. A positive reading of the card's own sentence
   * should not be suppressed by an unrelated facet happening to fire. Only the
   * fallbacks below stay gated on nothing having fired at all.
   *
   * THIN, not always, because a commander whose record already produced a real
   * plan does not need a second opinion and blending one in would dilute it.
   * Four is the count at which the facet reading is carrying the deck on its
   * own; below that it is one or two incidental facets like Meren's counter.
   *
   * And the corroborating weights are SCALED. When the facets said nothing the
   * intent rule is the whole reading and keeps its weight; when they said
   * something thin it is a second voice, and it must not outrank the thing the
   * record actually stated. That is the same principle the fallback weights
   * below are written to.
   */
  /*
   * AND THE GATE IS THE COMPILER'S OWN VERDICT, not the size of the plan.
   *
   * Measured 31 Aug 2026 over the 400 most-played commanders: the compiler
   * reported `rec:full` for **42 of them, 10.5%**. For **322, 80.5%**, it said
   * it had NOT read the whole card and the plan nonetheless had four or more
   * wants, so the English reader never ran. Four in five of the commanders
   * people actually build had a reader that could have spoken about the
   * unread half of the card and was silent.
   *
   * That is the shape of the owner's complaint, generalised. Syr Vondam's
   * "or is put into exile" needed a new rule; the 322 need no new rules at
   * all, only permission for the existing 113 to speak.
   *
   * `rec:full` is the right gate and the want count never was. The original
   * reasoning — English must not talk over a parsed record — is exactly
   * right, and `rec:full` is the facet that means "there IS a parsed record
   * for every clause". A thick plan is not that: it is four wants derived
   * from one clause of a card with three more the compiler refused. The want
   * count measured how much was said, and the question was whether anything
   * was left unsaid.
   *
   * THREE SCALES, because the reader's standing differs in three ways:
   *   nothing was read      1.00  the intent rule IS the reading
   *   thin plan             0.80  a second voice beside a weak one
   *   thick, partial cover  0.65  it may only ADD facets the record has not
   *                               stated; every want the compiler produced
   *                               keeps its own higher weight, because `add`
   *                               takes the maximum.
   * The lowest scale puts the strongest intent want at 0.585, below a 0.6
   * facet want, so ordering among read clauses is untouched.
   */
  const THIN_PLAN = 4;
  const readEverything = facets.includes('rec:full');
  const thin = wants.size < THIN_PLAN;
  if (oracleText && (thin || !readEverything)) {
    const text = oracleText;
    const scale = wants.size === 0 ? 1 : thin ? 0.8 : 0.65;
    for (const rule of INTENT_RULES) {
      if (!rule.when.test(text)) continue;
      const because = `${commander.name} ${rule.reads}`;
      for (const [facet, weight] of rule.wants) add(facet, weight * scale, because);
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

  /* THE FLOOR: a commander whose card tells us nothing at all.
     ---------------------------------------------------------
     Twenty-one of the 3,411 commanders the deck generator offers print NO
     RULES TEXT ON ANY FACE. Isamaru, Hound of Konda is a 2/2 Dog for {W}.
     Yargle, Glutton of Urborg is a 9/3 Frog Spirit. Torsten Von Ursus is an
     8/8. No pattern over text can ever reach them, because there is no text,
     and every fallback above needs either a facet or a keyword to fire.

     A legendary creature with no abilities is played for exactly two things:
     its body, and commander damage. The deck a player actually builds is
     equipment, auras, evasion and ways to keep it swinging. That is not a
     guess about what the card might mean. It is the only reading the card
     supports.

     THE GUARD IS `!wants.size` AND NOTHING ELSE, deliberately not "the text
     was empty". The Prismatic Piper has text, all of it about choosing a
     colour before the game begins, and it says nothing whatever about a deck.
     The condition that matters is that the whole function found nothing.

     WEIGHTS ARE THE LOWEST IN THIS FILE so that literally any other reading
     outranks this one. It is the least confident thing the engine says.

     AND IT MUST NOT BE UNIFORM, or the generator builds twenty-one identical
     decks and we have replaced silence with a lie. The type line is the only
     information a blank card carries, so the creature's own subtypes go in
     too: Jedit Ojanen is a Cat Warrior and Cat tribal is a deck people
     actually build. This deliberately does NOT use `tribeOf`, whose rule is
     that the subtype must appear on the type line AND inside an ability. A
     card with no abilities can never satisfy that, which is precisely why
     these commanders reached here. */
  let floorOnly = false;
  if (!wants.size) {
    floorOnly = true;
    const because = `${commander.name} tells us nothing but its stats, so the deck arms it and swings`;
    add('sub:equipment', 0.5, because);
    add('sub:aura', 0.45, because);
    add('eff:pump', 0.4, because);
    add('cares:sub:equipment', 0.35, because);
    add('kw:trample', 0.35, because);
    add('kw:haste', 0.3, because);

    for (const subtype of subtypesOf(commander.typeLine)) {
      add(
        `sub:${subtype}`,
        0.3,
        `${commander.name} is a ${subtype} and that is the only thing its card says`
      );
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
    floorOnly,
  };
}

/**
 * The tribe rule, in one function so it can be argued with in one place.
 *
 * Both places or nothing. See `CommanderPlan.tribe` for why Talrand must come
 * back null.
 */
/**
 * The creature subtypes printed on a type line's FRONT face.
 *
 * Split out of `tribeOf` so the floor can reuse the parse without inheriting
 * the rule. `tribeOf` requires the subtype to appear on the type line AND
 * inside an ability, which is right for deciding a TRIBE and is exactly what
 * a card with no abilities can never satisfy. The floor needs the words on
 * their own, because for a blank card the type line is the only information
 * the card carries.
 *
 * Empty for anything that is not a creature. A planeswalker's subtype is its
 * identity and an enchantment's is Aura or Saga; neither is a tribe, and
 * reading Windgrace off Lord Windgrace once gave a lands commander a tribal
 * plan for a tribe of one card that was himself.
 */
function subtypesOf(typeLine: string | null | undefined): string[] {
  const line = (typeLine ?? '').split('//')[0];
  if (!line.toLowerCase().includes('creature')) return [];
  const dash = line.indexOf('—');
  if (dash < 0) return [];
  return line
    .slice(dash + 1)
    .trim()
    .split(/\s+/)
    .map(w => w.trim().toLowerCase())
    .filter(Boolean);
}

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
     so the pattern was /\bCreature\b/ and matched nothing: every tribal
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
  /**
   * WHICH PACKAGE OF THE SHELL THIS CARD BELONGS TO, and it is the whole of
   * why an archetype can now be built rather than merely leaned toward.
   *
   * A shell is not a bag of twelve cards, it is three or four PACKAGES with
   * names: "The blinks", "Things worth blinking", "Doubling the arrival".
   * `planForArchetype` used to flatten them into one want list, which destroys
   * the only information the shell actually carries.
   *
   * Flattened, Blink asks for `trig:enters` (4 of 12 cards) and `eff:exile-own`
   * (3 of 12) as two wants among many, and a card carrying either one scores.
   * Kept apart, "The blinks" asks for `eff:exile-own` AND `eff:return-from`
   * together, and "Things worth blinking" asks for `trig:enters` AND a value
   * effect together — which is the difference between Mulldrifter and any
   * creature that happens to enter the battlefield.
   *
   * Optional so a caller that does not know its packages still works; the
   * whole shell then behaves as one package, which is the old behaviour.
   */
  pkg?: string;
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

/**
 * One package of a shell, read as wants.
 *
 * The wants are derived from that package's OWN cards only, so they describe
 * one job rather than the whole archetype. `eff:exile-own` and `eff:return-from`
 * appearing together is what "a blink spell" means; either alone is not.
 */
export interface ArchetypePackagePlan {
  name: string;
  wants: readonly Want[];
  /** Cards of this package the catalogue resolved. */
  read: number;
  /** This package's share of the shell, by exemplar count. */
  share: number;
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
   * The shell's packages, each with its own wants and its own share of the
   * theme slots. Empty when the caller supplied no package labels.
   *
   * A package's `share` is its exemplar count over the shell's, which is the
   * only evidence available about how much of the deck it should be: a shell
   * that names four blink spells and four things to blink is saying those are
   * equally important, and nothing else in the data says otherwise.
   */
  packages: readonly ArchetypePackagePlan[];
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
/**
 * The facet families a shell is allowed to want.
 *
 * `cost:`, `ctr:` and `tok:` were added on 2 Sep 2026 and their absence was a
 * hole straight through the middle of the archetype system. The Aristocrats
 * shell names Viscera Seer, Carrion Feeder, Goblin Bombardment and Altar of
 * Dementia as its sacrifice outlets; all four carry `cost:sacrifice` and NONE
 * of it was readable, so the package derived `cares:type:creature` and nothing
 * else — and a "Sacrifice outlets" slot in a Meren deck was filled with
 * Swiftfoot Boots and Lightning Greaves, which share that facet and no other.
 *
 * The same hole silently emptied three more shells: Counters could not see
 * `ctr:+1/+1`, Tokens could not see `tok:`, and Treasure-shaped packages could
 * not see what they make.
 *
 * WHAT IS STILL EXCLUDED, and why it is not an oversight. `kw:`, `sub:` and
 * `type:` are what a card IS rather than what it does, and a shell wanting
 * `type:creature` would claim half the pool. `acost:` and `scope:` are the
 * incidental end of the vocabulary — `acost:0` is on every free activation and
 * `scope:all` on every anthem — and they are exactly the facets that let Boots
 * pass as a sacrifice outlet. `mana:` is a magnitude, not a job.
 */
const ARCHETYPE_WANT_PREFIXES: readonly string[] = [
  'eff:', 'cares:', 'trig:', 'cost:', 'ctr:', 'tok:',
];

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

  /*
   * THE PACKAGES, EACH READ ON ITS OWN.
   *
   * The flat `wants` above stay exactly as they were, because everything that
   * consumes an ArchetypePlan today reads them and a shell should still tilt a
   * build even when nothing uses the packages. This is added beside them.
   *
   * A package's wants use SHARE rather than lift: within four cards, "how many
   * of them do this" is the whole of what can be said, and the background lift
   * that makes sense over a twelve-card shell is noise over four. A facet on
   * half a package is a real signal about that package's job.
   */
  const byPackage = new Map<string, ArchetypeExemplar[]>();
  for (const card of input.exemplars) {
    if (!card.pkg) continue;
    const list = byPackage.get(card.pkg);
    if (list) list.push(card);
    else byPackage.set(card.pkg, [card]);
  }

  const packages: ArchetypePackagePlan[] = [];
  for (const [name, cards] of byPackage) {
    const seen = new Map<Facet, number>();
    const firstSeen = new Map<Facet, string>();
    for (const card of cards) {
      for (const facet of new Set(card.facets)) {
        if (PLAN_IGNORED.has(facet)) continue;
        if (!ARCHETYPE_WANT_PREFIXES.some(p => facet.startsWith(p))) continue;
        seen.set(facet, (seen.get(facet) ?? 0) + 1);
        if (!firstSeen.has(facet)) firstSeen.set(facet, card.name);
      }
    }
    const pkgWants: Want[] = [];
    for (const [facet, n] of seen) {
      /* Half the package, so one card of four cannot define the job. With four
         exemplars that is two, which is the same floor the flat list uses. */
      if (n * 2 < cards.length) continue;
      pkgWants.push({
        facet,
        weight: n / cards.length,
        because:
          `${input.name}: ${n} of the ${cards.length} cards in "${name}" ` +
          `${describeWant(facet)}, ${firstSeen.get(facet)} among them`,
      });
    }
    pkgWants.sort((a, b) => b.weight - a.weight || a.facet.localeCompare(b.facet));
    if (pkgWants.length === 0) continue;
    packages.push({
      name,
      wants: pkgWants,
      read: cards.length,
      share: cards.length / Math.max(1, read),
    });
  }

  return {
    id: input.id,
    name: input.name,
    wants,
    read,
    named: input.named,
    withoutRecord,
    dropped,
    packages,
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

  /* THE FLOOR STANDS DOWN when a real archetype was asked for. A plan whose
     only wants came from the floor is the engine saying it could not read the
     card; an archetype is the player saying what they want. Letting the guess
     compete would stop the shell speaking alone for exactly the commanders
     where it has the most to say. */
  const base: CommanderPlan = plan.floorOnly ? { ...plan, wants: [], floorOnly: false } : plan;

  const commanderTop = base.wants.reduce((best, w) => Math.max(best, w.weight), 0);
  const shellTop = archetype.wants[0].weight;
  const anchor = commanderTop > 0 ? commanderTop : 1;
  const scale = shellTop > 0 ? (anchor * ARCHETYPE_SHARE) / shellTop : 0;

  const scaled: Want[] = archetype.wants.map(w => ({
    facet: w.facet,
    weight: w.weight * scale,
    because: w.because,
  }));

  const merged = new Map<Facet, Want>();
  for (const want of base.wants) merged.set(want.facet, want);

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

/**
 * Facts of the form "this facet ATTACKS that want".
 *
 * The first negative knowledge in the engine, and it is a LIST rather than a
 * theory on purpose. Anti-synergy is not something the facet vocabulary can be
 * made to derive: it is a small set of measured cases, each added only after
 * somebody has looked at the cards it would claim, which is the discipline
 * `ROLE_FACETS` runs on and for the same reason.
 *
 * The case that forced it: the generator put Soul-Guide Lantern - graveyard
 * hate - in a Meren deck and in a Sheoldred deck, both of which are built on a
 * graveyard. Every other signal in the model answers "how much does this help",
 * so a card that empties the resource the deck runs on and a card that does
 * nothing scored the same.
 */
export const ATTACKS: ReadonlyArray<{ facet: Facet; want: Facet; because: string }> = [
  {
    facet: 'eff:exile-graveyard',
    want: 'cares:zone:graveyard',
    because: 'this empties graveyards, and the deck is built on using one',
  },
];

/**
 * Does this card work AGAINST what the commander asked for?
 *
 * One definition, because there are two callers and they must not drift: the
 * ranker subtracts a full commander-fit weight for it, and the generator's
 * reserved slots refuse it outright. The reserve is the one that matters - it
 * deliberately ignores `score`, so a penalty alone could not stop it, and
 * Soul-Guide Lantern went into a Sheoldred deck carrying a reason that said in
 * so many words that it empties graveyards and the deck is built on using one.
 */
/*
 * The plan's wants as a Set, built ONCE per plan.
 *
 * Building it inside the function looks harmless and is not: the ranker asks
 * this of every card in the pool, and on a five-colour commander that pool is
 * the whole catalogue, so it was fifteen thousand Set allocations per build.
 * Najeela came back WORKER_RESOURCE_LIMIT on the deployed function within
 * minutes of the check being added.
 *
 * Keyed on the plan object, which is created once per build and never mutated,
 * so the entry dies with it.
 */
const WANT_SETS = new WeakMap<CommanderPlan, ReadonlySet<string>>();

function wantSetFor(plan: CommanderPlan): ReadonlySet<string> {
  let set = WANT_SETS.get(plan);
  if (!set) {
    set = new Set(plan.wants.map(w => w.facet as string));
    WANT_SETS.set(plan, set);
  }
  return set;
}

export function worksAgainstPlan(
  plan: CommanderPlan | null | undefined,
  card: FacetCarrier
): { because: string } | null {
  if (!plan?.wants.length) return null;
  const facets = facetsOf(card);
  if (!facets.length) return null;
  /* The cheap test first: almost no card carries an attacking facet, so this
     returns on the first line for the overwhelming majority and never touches
     the want set at all. */
  for (const attack of ATTACKS) {
    if (!facets.includes(attack.facet)) continue;
    if (wantSetFor(plan).has(attack.want)) return { because: attack.because };
  }
  return null;
}

/**
 * Each want after the best counts for this much of what it would alone.
 *
 * 0.35 -> 0.20 on 31 Aug 2026, and it is the fix for the complaint that a
 * generated deck contains cards nobody would ever include.
 *
 * `planFit` is a noisy-OR, so a card matching five wants weakly outscores the
 * card that IS one of them. Reading a whole Meren deck showed what that costs:
 * Cauldron of Essence, rank 2,508, matched five wants at 0.888 and took the
 * `cost:sacrifice` slot, while Ashnod's Altar and Viscera Seer sat at 0.720 for
 * doing the one thing the deck cannot function without. The deck came out with
 * Grave Pact, Dictate of Erebos, Bastion of Remembrance, Grim Haruspex and
 * Midnight Reaper in it and NOTHING to sacrifice a creature to.
 *
 * Lowering it compresses the breadth bonus so the best match dominates, and a
 * tie between two cards whose best match is the same want then breaks on the
 * ranker's own score, where being a card people actually play counts.
 *
 * MEASURED across the six decks in `generator-synergy-audit.mjs`:
 *
 *          keyed  staples  orphans   median ranks
 *   0.35     83%    37/54       3    3138 1697 2387 2316  985 2712
 *   0.20     84%    37/54       2    2731 1638 2387 2026  985 3011
 *   0.10     84%    36/54       2    2731 1506 2229 2015  985 2712
 *
 * 0.10 loses Adeline a staple for nothing, so 0.20 is where it sits: the same
 * staple count, fewer orphans, and four of the six decks reaching less deep.
 */
const EXTRA_WANT_DECAY = 0.20;


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
  'cant-block': 'stops a creature blocking',
  'cant-attack': 'stops a creature attacking',
  'cant-be-blocked': 'makes a creature unblockable',
  'prevent-damage': 'prevents damage',
  protect: 'keeps your creatures alive',
  'set-life': 'sets a life total',
  'reduce-cost': 'makes spells cost less',
  'increase-cost': 'makes spells cost more',
  'cant-cast': 'stops spells being cast',
  'cant-activate': 'stops abilities being activated',
  copy: 'copies things',
  multiply: 'doubles or triples what happens',
  animate: 'turns a permanent into a creature',
  'redirect-damage': 'redirects damage',
  'play-from-graveyard': 'plays lands from the graveyard',
  random: 'flips a coin or rolls a die',
  goad: 'forces creatures to attack elsewhere',
  'cant-attack-self': 'cannot attack itself',
  'cant-block-self': 'cannot block itself',
  'cast-free': 'casts a spell without paying for it',
  'force-block': 'forces a creature to block it',
  'give-control': 'gives a permanent away',
  transform: 'turns a permanent to its other face',
  uncounterable: 'cannot be countered',
  'skip-phase': 'skips or adds a phase',
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
