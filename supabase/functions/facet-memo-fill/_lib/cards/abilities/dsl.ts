/**
 * DeckMatrix ability DSL — the type space.
 *
 * Abilities are DATA. Nothing in this file is a function, a closure, a class or
 * a regex object: a `CardAbilities` value survives `structuredClone`,
 * `JSON.stringify` and a Supabase `jsonb` column unchanged. That is the whole
 * point — a game is a JSON action log, the engine runs in the browser, and the
 * server only orders and revalidates.
 *
 * ## Where this file belongs
 * The engine plan puts this type space at `src/lib/game/ability-dsl.ts`. That
 * file is owned by the engine agent and does not exist yet, and `src/lib/game`
 * already imports `src/lib/cards/tagger.ts` (`effects.ts:59`), so the compiler
 * in this folder must not import from `game` — that would close an import
 * cycle. The types therefore live here for now, written to the agreed shape
 * field-for-field. When `game/ability-dsl.ts` lands, this file becomes a
 * one-line re-export and the compiler does not change: every module in
 * `src/lib/cards/abilities` imports its types from `./dsl.ts` and from nowhere
 * else, so the swap is a single-file edit with no drift surface.
 *
 * ## Two deliberate departures from the plan, both flagged
 * 1. `{ do: 'counter' }` is added to `Effect`. "Counter target spell" is on the
 *    build list and the plan gives the engine a real stack, but the effect
 *    vocabulary in the plan has no member for it. Marked PROPOSED below.
 * 2. `GapReason` gains `'unrecognised'`, `'ambiguous'` and `'multi-face'`. The
 *    plan names ten modelling gaps, but the overwhelmingly common case is "no
 *    rule matched this clause", which is not one of the ten. Without a code for
 *    it there is nowhere honest to put the bulk of the catalogue, and the
 *    anti-silent-no-op contract requires every clause to land somewhere.
 *
 * @see ./compiler.ts for the oracle-text front end.
 */

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

/** Mirrors `@/lib/game/types` `ManaColor`. Duplicated to keep this folder acyclic. */
export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';

/** Mirrors `@/lib/game/types` `Zone`, plus the `'stack'` the plan adds. */
export type Zone =
  | 'library'
  | 'hand'
  | 'battlefield'
  | 'graveyard'
  | 'exile'
  | 'command'
  | 'stack';

/** Mirrors `@/lib/game/types` `Step` exactly. */
export type Step =
  | 'untap'
  | 'upkeep'
  | 'draw'
  | 'precombat_main'
  | 'begin_combat'
  | 'declare_attackers'
  | 'declare_blockers'
  | 'combat_damage'
  | 'end_combat'
  | 'postcombat_main'
  | 'end'
  | 'cleanup';

export type Cmp = 'lt' | 'lte' | 'eq' | 'gte' | 'gt' | 'ne';

export type Duration =
  | 'end-of-turn'
  | 'your-next-turn'
  | 'while-source-on-battlefield'
  | 'permanent';

/** Mirrors `@/lib/game/types` `TokenSpec`. */
export interface TokenSpec {
  name: string;
  typeLine?: string;
  power?: string;
  toughness?: string;
  colorIdentity?: ManaColor[];
  keywords?: string[];
  oracleText?: string;
}

/* ------------------------------------------------------------------ *
 * Selectors — the workhorse. Same boolean-tree shape as tagger.ts's
 * `TagCondition`, for the same reason: one declarative tree, one
 * interpreter, and a shape that could later compile to SQL.
 * ------------------------------------------------------------------ */

export type Selector =
  | { sel: 'self' }
  | { sel: 'none' }
  | { sel: 'each' }
  | { sel: 'target'; ref: number }
  | { sel: 'trigger-source' }
  | { sel: 'trigger-subject' }
  | { sel: 'attached' }
  | { sel: 'all'; where: CardFilter; zone?: Zone; controller?: PlayerSelector };

export type CardFilter =
  | { is: 'type' | 'subtype' | 'supertype' | 'name' | 'keyword'; value: string }
  | { is: 'color'; value: ManaColor }
  | { is: 'colorless' }
  | { is: 'multicolored' }
  | { is: 'tapped' }
  | { is: 'untapped' }
  | { is: 'attacking' }
  | { is: 'blocking' }
  | { is: 'blocked' }
  | { is: 'token' }
  | { is: 'commander' }
  | { is: 'other' }
  | { is: 'any' }
  | { is: 'has-counter'; counter: string; atLeast?: number }
  | { is: 'power' | 'toughness' | 'mana-value'; cmp: Cmp; value: ValueExpr }
  | { is: 'not'; of: CardFilter }
  | { is: 'and'; of: CardFilter[] }
  | { is: 'or'; of: CardFilter[] };

export type PlayerSelector =
  | { who: 'you' }
  | { who: 'each-opponent' }
  | { who: 'each-player' }
  | { who: 'active' }
  | { who: 'defending' }
  | { who: 'monarch' }
  /**
   * "That player" — the player the trigger was ABOUT, not the one who controls
   * the ability. Rhystic Study's "unless that player pays {1}" and Smothering
   * Tithe's "that player may pay {2}" both name the one opponent whose cast or
   * draw fired the trigger, and `{who:'each-opponent'}` would name all of them.
   * It resolves to nobody unless the trigger bound it — the conservative
   * direction, the same one `{who:'defending'}` already takes: an ability that
   * asks nobody is a visible no-op; one that asks every opponent taxes three
   * players for one card.
   */
  | { who: 'trigger-player' }
  | { who: 'target-player'; ref: number }
  | { who: 'controller-of'; of: Selector }
  | { who: 'owner-of'; of: Selector };

/* ------------------------------------------------------------------ *
 * Values and conditions.
 *
 * A quantity that has to be counted from the board ("where X is the number of
 * creatures you control") is a typed expression tree, not a number and not a
 * closure. A closure could not be replayed on a client that received only an
 * action log; a bare number could not express the count at all. The tree is
 * evaluated against state at the moment the rules ask for it, and it survives
 * `JSON.stringify` on the way there.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * E6 — watchers.
 *
 * Game state answers "what is true now". It cannot answer "what happened
 * earlier this turn", because the moment an event is over the state that
 * recorded it has been overwritten: a creature that died is not on the
 * battlefield, a spell that resolved is not on the stack, and life that was
 * gained is indistinguishable from life that was never lost.
 *
 * ## Why this is a QUERY and not a piece of state
 *
 * The obvious implementation — a mutable `Watcher` object the engine pokes on
 * every event — is the one this project cannot have. It would be a second
 * source of truth living outside the action log, so two clients replaying the
 * same log could disagree, an undo would have to remember to unpoke it, and
 * nothing would prove it had stayed in step. That is a mutable side channel,
 * and a mutable side channel is how "looked automated, wasn't" happens.
 *
 * So a watcher here is **not state at all**. It is a declarative QUERY, pure
 * JSON like everything else in this file, and its answer is a fold over the
 * game's own action log — the artefact that is already the authority. Same log,
 * same answer, on every client, for ever, with no bookkeeping to get wrong.
 * `src/lib/game/abilities/watch.ts` is the fold.
 *
 * ## The honesty cost, stated plainly
 *
 * Nothing in the engine supplies that fold today. A `{v:'watch'}` evaluated
 * without a log answers 0, and 0 is a WRONG answer, not a neutral one — so the
 * ability bridge refuses to own any card whose effects contain one
 * (`unrunnableReason`), and `runEffects` emits a note naming the query. This
 * extension raises what the DSL can REPRESENT. It automates nothing by itself.
 * ------------------------------------------------------------------ */

export type WatchWindow = 'this-turn' | 'this-game';

/**
 * The events a watcher can count. Every member is one the action log genuinely
 * distinguishes; the notable absentee is "sacrificed", which is a `MOVE_ZONE`
 * to the graveyard exactly like a destruction and cannot be told apart from one
 * after the fact. Refusing it is the precision rule, not an oversight.
 */
export type WatchedEvent =
  | { saw: 'spell-cast'; what?: CardFilter; by?: PlayerSelector }
  | { saw: 'land-played'; by?: PlayerSelector }
  | { saw: 'died'; what?: CardFilter; controller?: PlayerSelector }
  | { saw: 'entered'; what?: CardFilter; controller?: PlayerSelector }
  | { saw: 'attacked'; what?: CardFilter; controller?: PlayerSelector }
  | { saw: 'token-created'; by?: PlayerSelector }
  | { saw: 'drew'; by?: PlayerSelector }
  | { saw: 'gained-life'; by?: PlayerSelector }
  | { saw: 'lost-life'; by?: PlayerSelector }
  | { saw: 'dealt-damage'; by?: PlayerSelector; to?: 'player' | 'permanent' | 'any' };

export interface WatchQuery {
  event: WatchedEvent;
  window: WatchWindow;
  /**
   * `'events'` counts occurrences — "the number of creatures that died this
   * turn". `'amount'` sums the numeric payload — "the total life you gained
   * this turn". They are different questions and one card may ask either, so
   * the query says which rather than the reader inferring it.
   */
  measure: 'events' | 'amount';
}

/**
 * Can this filter be answered from a snapshot of an object taken when the event
 * happened?
 *
 * Only characteristics that do not move can. "Tapped", "attacking", power and
 * toughness all change after the event and a past value would be a fabrication;
 * "keyword" is layer-dependent and the layers that granted it may be gone. A
 * filter that fails this test must never reach a `WatchQuery`, because
 * `matchesSnapshot` would answer `false` for it and quietly under-count.
 */
export function isWatchableFilter(filter: CardFilter): boolean {
  switch (filter.is) {
    case 'type':
    case 'subtype':
    case 'supertype':
    case 'name':
    case 'color':
    case 'colorless':
    case 'multicolored':
    case 'token':
    case 'commander':
    case 'any':
      return true;
    case 'mana-value':
      // A computed bound would need a live context the snapshot does not have.
      return typeof filter.value === 'number';
    case 'not':
      return isWatchableFilter(filter.of);
    case 'and':
    case 'or':
      return filter.of.every(isWatchableFilter);
    default:
      // 'keyword', 'tapped', 'untapped', 'attacking', 'blocking', 'blocked',
      // 'other', 'has-counter', 'power', 'toughness'.
      return false;
  }
}

export type ValueExpr =
  | number
  | { v: 'x' }
  | { v: 'count'; of: Selector }
  | { v: 'count-players'; of: PlayerSelector }
  | { v: 'power' | 'toughness' | 'mana-value'; of: Selector }
  | { v: 'counters'; of: Selector; counter: string }
  | { v: 'life'; of: PlayerSelector }
  | { v: 'cards-in'; zone: Zone; of: PlayerSelector }
  | { v: 'add'; of: ValueExpr[] }
  | { v: 'sub'; a: ValueExpr; b: ValueExpr }
  | { v: 'mul'; of: ValueExpr[] }
  | { v: 'div'; a: ValueExpr; b: ValueExpr }
  | { v: 'min'; of: ValueExpr[] }
  | { v: 'max'; of: ValueExpr[] }
  | { v: 'if'; condition: Condition; then: ValueExpr; else: ValueExpr }
  /**
   * E6. A fold over the action log, not a lookup in a mutable watcher. See the
   * `WatchQuery` block above for why, and for what it costs.
   *
   * One member covers both uses: a quantity ("draw a card for each creature
   * that died this turn") and a condition, via
   * `{if:'value', a:{v:'watch',…}, cmp:'gte', b:1}`. A separate `Condition`
   * member would have been a second spelling of one idea and a second place for
   * the evaluator to disagree with itself.
   */
  | { v: 'watch'; query: WatchQuery };

export type Condition =
  | { if: 'count'; of: Selector; cmp: Cmp; value: ValueExpr }
  | { if: 'value'; a: ValueExpr; cmp: Cmp; b: ValueExpr }
  | { if: 'controls'; who: PlayerSelector; what: CardFilter; cmp: Cmp; value: ValueExpr }
  /**
   * "Is THIS PARTICULAR object a certain way": the source is tapped, the
   * enchanted creature is black, the equipped creature is a Human.
   *
   * ## Why this is a condition and not a filter on the selector
   *
   * The obvious spelling is `{sel:'self', where:{is:'tapped'}}`. It was not
   * taken, and the reason is where selectors are read rather than what they
   * mean. `{sel:'self'}` is also the `affects` of a static ability and the
   * `what` of an effect, and those are resolved by `layers.ts` and `statics.ts`
   * on their own paths, not by `resolveSelector`. A `where` those two did not
   * implement would be silently ignored on exactly the abilities that are
   * hardest to notice being wrong, which is the "runs and is wrong" failure the
   * port refuses everywhere else.
   *
   * As a `Condition` it has one evaluator, `evalCondition`, and no second path
   * to fall through. `{if:'count'}` cannot stand in: it counts a set, and there
   * is no `CardFilter` member meaning "is the source", so "the source is
   * tapped" has no spelling in terms of a set.
   *
   * Holds when AT LEAST ONE object `of` resolves to matches `what`. For
   * `{sel:'self'}` and `{sel:'attached'}` that is one object or none, so the
   * "at least one" reading and the "the one" reading agree; for a set it reads
   * as "any", which is what every XMage condition of this shape asks.
   */
  | { if: 'matches'; of: Selector; what: CardFilter }
  | { if: 'step'; is: Step[] }
  | { if: 'your-turn' }
  | { if: 'first-time-this-turn'; key: string }
  | { if: 'not'; of: Condition }
  | { if: 'and'; of: Condition[] }
  | { if: 'or'; of: Condition[] };

/* ------------------------------------------------------------------ *
 * Effects — a closed vocabulary, exhaustively switched by the runtime.
 * ------------------------------------------------------------------ */

/**
 * What an open choice is made from. Only subjects a card actually names.
 *
 * `card-name` is deliberately ABSENT: Meddling Mage and Sorcerous Spyglass name
 * a card, which is hidden-choice for a real reason — the choice is information
 * the rest of the game has to be told about, and the runtime has nowhere to put
 * it. Refusing those keeps the gap honest instead of recording a choice nothing
 * can act on.
 */
export type ChoiceSubject =
  | 'creature-type'
  | 'color'
  | 'player'
  | 'opponent'
  | 'basic-land-type';

export type Effect =
  /* life & damage */
  | { do: 'gain-life' | 'lose-life' | 'set-life'; who: PlayerSelector; amount: ValueExpr }
  | { do: 'damage'; to: Selector | PlayerSelector; amount: ValueExpr }
  | { do: 'poison'; who: PlayerSelector; amount: ValueExpr }
  /* cards & zones */
  | { do: 'draw' | 'mill'; who: PlayerSelector; count: ValueExpr }
  | { do: 'discard'; who: PlayerSelector; count: ValueExpr; random?: boolean }
  | { do: 'move-zone'; what: Selector; to: Zone; position?: 'top' | 'bottom' | number; tapped?: boolean }
  | { do: 'destroy'; what: Selector }
  | { do: 'sacrifice'; who: PlayerSelector; what: Selector; count: ValueExpr }
  /*
   * `from` is the zone the cards are exiled OUT OF, and it exists because a
   * targeted exile hides that on the `TargetSpec` where a facet reader cannot
   * see it. "Exile target card from a graveyard" and "exile target creature"
   * are the same verb on the same selector shape and are not the same card:
   * one answers a threat and one attacks a graveyard, and `ROLE_FACETS.removal`
   * reads `eff:exile`, so without this every piece of graveyard hate in the
   * format counts as an answer and takes a removal slot from something that
   * removes.
   */
  | { do: 'exile'; what: Selector; from?: Zone }
  | { do: 'return-from'; zone: Zone; who: PlayerSelector; what: Selector; count: ValueExpr; to: Zone }
  /**
   * `upTo` is the difference between Rampant Growth and Cultivate.
   *
   * "Search your library for A basic land card" fetches one. "Search your
   * library for UP TO TWO basic land cards" lets the searcher take nought, one
   * or two, and `count` alone cannot say that: a fixed 2 would fetch two every
   * time. The rule used to refuse the whole card rather than say the wrong
   * number, which was right about the number and wrong about the silence,
   * because it cost Cultivate and Kodama's Reach any record at all. They are
   * ranked 20 and 37 in Commander.
   *
   * Same shape `look-and-pick` already uses for the same reason.
   */
  /*
   * `toPosition` is where in the library the card is put, and it exists for the
   * tutors that end "then shuffle and put that card on top": Vampiric,
   * Enlightened, Mystical, Worldly and Sylvan Tutor, all inside the 200 most
   * played cards in Commander and all of which produced NO ability record at
   * all until it did.
   *
   * It is not a decoration. A card shuffled into the library and a card placed
   * on top of it are different cards, and the difference is the whole point of
   * paying one mana for a tutor at instant speed. `MOVE_ZONE` has carried
   * `position` all along, so this is a reading the runtime could already
   * execute exactly, not an approximation.
   *
   * Its presence also fixes the ORDER. Everywhere else the search moves the
   * card and then shuffles; here the card says shuffle and THEN put it on top,
   * and doing it the usual way round would bury the card the player just paid
   * to find.
   */
  | { do: 'search-library'; who: PlayerSelector; what: Selector; count: ValueExpr; to: Zone; thenShuffle: boolean; tapped?: boolean; upTo?: boolean; toPosition?: 'top' | 'bottom' }
  | { do: 'shuffle'; who: PlayerSelector }
  /*
   * CR 701.18. Look at the top N cards of your library, then put any number of
   * them on the bottom and the rest back on top in any order.
   *
   * PROMOTED from `src/lib/game/abilities/primitives/extended-dsl.ts`, which is
   * the staging file for verbs whose handler is written and gated before the
   * union grows. The order it states is: verb staged, primitive written and
   * passing, member moves here, the one switch in `to-actions.ts` fails to
   * compile, the new case delegates to the primitive that already worked. This
   * is that last step. `scryToActions` is unchanged by the move.
   *
   * ## What this member does NOT claim
   *
   * Scry is a DECISION, and adding the verb does not automate it. There is no
   * board on which the choice is forced, not even scry 1 with one card left,
   * because top and bottom are different games. The engine defers it and says
   * whose library and how many, which is a typed question a surface can draw
   * instead of a sentence quoted out of the oracle text.
   *
   * What it buys is that the card stops being unreadable. 367 cards in the
   * XMage corpus name `ScryEffect` as a blocker and 195 name nothing else, and
   * every one of them was refused whole rather than lowered with a question
   * attached.
   */
  | { do: 'scry'; who: PlayerSelector; count: ValueExpr }
  /**
   * A choice made openly, that the rest of the card then reads.
   *
   * "As this land enters, choose a creature type" is Secluded Courtyard, and
   * until now it produced no record at all: the compiler classified every
   * `as ~ enters, choose` as `hidden-choice`, alongside "name a card" and
   * "separate into piles". That is too broad. Naming a card is hidden
   * information and a genuine modelling gap; choosing a creature type is
   * written on the permanent for the whole table to see, and the only thing
   * stopping the runtime offering it is that nobody wrote the prompt.
   *
   * WHAT is a FIELD, not fifty verbs, for the reason `among` is a field on
   * `add-mana`: every consumer that understands `eff:choose` understands all of
   * them, and a new subject needs no entry in EFFECT_VERBS, no facet and no
   * role rule before the card counts for anything.
   *
   * It matters well beyond play. Fifty cards choose a creature type, and every
   * one of them is a TRIBAL card the deck builder could not see: Shared
   * Triumph, Circle of Solace, Roaming Throne, Rally the Ranks, Secluded
   * Courtyard. They read as `cares:sub:chosen` now, which says the true thing:
   * this is about a creature type and the type is up to you.
   */
  | { do: 'choose'; who: PlayerSelector; what: ChoiceSubject }
  /*
   * CR 701.44. Look at the top N, then put any number into your graveyard and
   * the rest back on top in any order.
   *
   * The same decision shape as scry with a different destination, and a
   * SEPARATE verb rather than a parameter on scry. A player reading the log has
   * to be able to tell which one happened: cards in the graveyard are cards a
   * dozen other mechanics can reach, and cards on the bottom of the library are
   * gone. One verb with a flag would make those two the same line.
   */
  | { do: 'surveil'; who: PlayerSelector; count: ValueExpr }
  /*
   * "Look at the top four cards of your library. Put one of them into your hand
   * and the rest on the bottom of your library in a random order."
   *
   * 245 cards in the XMage corpus name this shape as a blocker and 130 name
   * nothing else, which makes it the largest remaining thing the port cannot
   * say. It is not `{do:'search-library'}` with different numbers: a search
   * looks at the WHOLE library and takes what it names, and this looks at a
   * fixed few and has to say where the ones NOT taken go. Three quantities and
   * two destinations against one of each.
   *
   * Both destinations are carried because losing either one changes the card.
   * "The rest on the bottom" and "the rest into your graveyard" are the
   * difference between a card that filters and a card that fills a graveyard on
   * purpose, and a member that recorded only what was taken would make those
   * two the same shape.
   *
   * Like scry and surveil this is a DECISION and the engine defers it. What the
   * member buys is that the question is typed: who, how many, out of what, and
   * where each half ends up.
   */
  | {
      do: 'look-and-pick';
      who: PlayerSelector;
      /** How many cards are looked at, from the top of that player's library. */
      look: ValueExpr;
      /** How many of the looked cards are taken. */
      pick: ValueExpr;
      /**
       * True when FEWER than `pick` may be taken, down to none. False is the
       * printed shape with no "up to" in it, where the cards are taken if there
       * are cards there to take.
       */
      upTo: boolean;
      /** Which of the looked cards may be taken. Absent means any of them. */
      what?: CardFilter;
      /** Where the taken cards go. */
      pickedTo: CardDestination;
      /** Where the ones not taken go. */
      restTo: CardDestination;
    }
  /* permanents */
  | { do: 'create-token'; who: PlayerSelector; token: TokenSpec; count: ValueExpr; tapped?: boolean }
  | { do: 'tap' | 'untap'; what: Selector }
  | { do: 'add-counters' | 'remove-counters'; what: Selector; counter: string; count: ValueExpr }
  | { do: 'pump'; what: Selector; power: ValueExpr; toughness: ValueExpr; grant?: string[]; duration: Duration }
  | { do: 'gain-control'; what: Selector; who: PlayerSelector; duration: Duration }
  /*
   * CR 301.5c / 303.4f — attach an Equipment, Aura or Fortification to a
   * permanent, or move it from whatever it was on.
   *
   * This is the member the whole equipment and Aura pool was waiting on, and
   * its absence is why `ATTACH` had a reducer case, a validation entry and
   * tests and had never once been constructed. "Equip {2}" is a printed
   * activated ability whose effect is this and nothing else (CR 702.6a), and
   * without a way to spell that effect the compiler could only emit the bare
   * keyword label, which no code path can run.
   *
   * `to` resolving to nothing means nothing happens, the same as every other
   * effect whose selector names nobody. Detaching is `to: {sel:'none'}`, which
   * is how "Unattach ~" would be spelled; nothing emits that yet.
   */
  | { do: 'attach'; what: Selector; to: Selector }
  /* mana & table.
   *
   * E8 — conditional mana. `restriction` is CR 106.6: mana that may only be
   * spent on certain things. Leaving it off and adding the mana anyway is a
   * silent upgrade — Cavern of Souls' mana would pay for anything and Ancient
   * Ziggurat would ramp into a counterspell — so the restriction rides on the
   * effect that produced the mana, which is the only place it can be enforced.
   *
   * `count` is E9 meeting E8: "Add {G} for each creature you control" is the
   * same mana string produced a computed number of times. Absent means once.
   */
  | { do: 'add-mana'; who: PlayerSelector; mana: string; count?: ValueExpr; restriction?: ManaSpendRestriction; among?: ManaColourSource }
  | { do: 'player-counter'; who: PlayerSelector; counter: string; count: ValueExpr }
  | { do: 'set-monarch'; who: PlayerSelector }
  | { do: 'lose-game' | 'win-game'; who: PlayerSelector }
  /* the stack.
   * PROPOSED ADDITION — not in the plan's vocabulary. "Counter target spell" is
   * on the build list and the plan gives the engine a real stack zone, so the
   * concept exists; only the effect member was missing. Flagged here so the DSL
   * owner accepts or rejects it deliberately rather than inheriting it. */
  | { do: 'counter'; what: Selector }
  /* an opponent-facing optional cost.
   *
   * "Unless that player pays {1}" (Rhystic Study) and "that player may pay {2}.
   * If the player doesn't, …" (Smothering Tithe) are the same shape: a player
   * who is NOT the ability's controller is offered a cost, and the effects run
   * only if they decline. Modelled as one member rather than two because the
   * two oracle spellings are one rule.
   *
   * This is not `{do:'may'}` inverted. `may` asks the controller and does the
   * thing on yes; this asks somebody else and does the thing on no, and getting
   * the polarity wrong resolves the card backwards. */
  | { do: 'unless-pays'; who: PlayerSelector; cost: Cost[]; effects: Effect[] }
  /* a CONTROLLER-facing optional cost, offered while the ability resolves.
   *
   * "You may pay {2}. If you do, draw a card." "You may discard a card. If you
   * do, draw two cards." "When this creature dies, you may exile it. If you do,
   * search your library for an enchantment card." One printed shape, and the
   * single largest thing stopping the XMage port from lowering a record: 588
   * cards name its class as a blocker and 310 name nothing else.
   *
   * `then` runs only when the cost is paid, `else` only when it is not. Both
   * are LISTS rather than one effect each, because the class this comes from
   * takes more of each through chained calls and reading only the first would
   * run half the card.
   *
   * `optional` is required and has no default. `true` is the printed "you may";
   * `false` is the shape with no "may" in it, where the cost is paid if it can
   * be paid. A default would either turn a mandatory payment into a question or
   * take a payment the player never agreed to, and which of the two it did
   * would depend on which default somebody picked. So it is always carried.
   *
   * THIS IS NOT `{do:'unless-pays'}` INVERTED. That one asks a player who is
   * not the controller and runs its effects when they DECLINE. This one asks
   * the controller and runs `then` when they ACCEPT. Same two English words,
   * opposite polarity, and using either in place of the other resolves every
   * card carrying it backwards. */
  | {
      do: 'do-if-cost-paid';
      who: PlayerSelector;
      cost: Cost[];
      optional: boolean;
      then: Effect[];
      else?: Effect[];
    }
  /* control flow */
  | { do: 'if'; condition: Condition; then: Effect[]; else?: Effect[] }
  | { do: 'for-each'; over: Selector | PlayerSelector; effects: Effect[] }
  | { do: 'repeat'; times: ValueExpr; effects: Effect[] }
  | { do: 'choose-mode'; min: ValueExpr; max: ValueExpr; modes: Array<{ text: string; effects: Effect[] }> }
  | { do: 'may'; who: PlayerSelector; text: string; effects: Effect[] }
  /* honesty */
  | { do: 'manual'; text: string; hint?: string }
  /*
   * A card whose effect XMage wrote as its OWN Java class, translated by
   * machine and executed by `src/lib/game/xmage/`.
   *
   * `key` names one entry in `TRANSLATED_BODIES`, spelled
   * `XMageCardClass::XMageEffectClass`. It is a POINTER, not a description:
   * this member carries no verb, no selector and no amount, so nothing reading
   * the DSL can say what the card does from the record alone.
   *
   * That is the honest shape, because the body genuinely is imperative Java and
   * a declarative description of it was never extracted. What it costs, stated
   * here rather than discovered later: `render.ts` cannot put this into words,
   * `roundtrip.ts` cannot check it against oracle text, and the deck-building,
   * recommendation and optimisation consumers `CARD-SEMANTICS.md` names get
   * nothing out of it. It answers the RESOLUTION question and no other. A card
   * carrying one of these is a quarter solved.
   *
   * `card` and `effect` are the two halves of `key`, carried separately so a
   * reader and a grep do not have to split it. The runtime reads `key`.
   */
  | { do: 'xmage-body'; key: string; card: string; effect: string };

/**
 * Where a group of cards ends up, for `{do:'look-and-pick'}`.
 *
 * A zone is not enough on its own. The library has two ends, and a card put on
 * the bottom is gone while a card put on top is the next draw; a permanent that
 * arrives tapped cannot attack this turn.
 *
 * `order` is the difference between "the rest on the bottom in any order",
 * where the player decides what they will draw last, and "in a random order",
 * where nobody knows. Neither changes which zone the cards are in and both
 * change how the card is played, so the field is carried rather than folded
 * away. Absent means the card says nothing about order.
 */
export interface CardDestination {
  zone: Zone;
  /** Only meaningful for `zone: 'library'`. */
  position?: 'top' | 'bottom';
  /** Only meaningful for `zone: 'library'`. */
  order?: 'any' | 'random';
  /** Only meaningful for `zone: 'battlefield'`. */
  tapped?: boolean;
}

/* ------------------------------------------------------------------ *
 * E8 — what restricted mana may be spent on (CR 106.6)
 * ------------------------------------------------------------------ */

/**
 * "Spend this mana only to cast artifact spells."
 *
 * `what` is the filter the SPELL or the ABILITY'S SOURCE must satisfy. It is
 * optional only for the shapes that genuinely restrict by kind alone — "spend
 * this mana only to activate abilities" — never as a default: a restriction
 * with no filter and no kind would be no restriction at all, and the compiler
 * refuses the clause instead of emitting one.
 */
/**
 * Where the COLOUR of "one mana of any colour" comes from, when the card names
 * a source rather than letting the player pick freely.
 *
 * These are among the most played mana sources in the format and they had no
 * ability record at all before this existed. Measured 30 Aug 2026 over the
 * hundred most played Commander cards, 26 of which the compiler could not read:
 *
 *   Command Tower     rank 2    any colour in your commander's identity
 *   Arcane Signet     rank 3    the same sentence
 *   Exotic Orchard    rank 9    any colour a land an opponent controls produces
 *   Fellwar Stone     rank 17   the same sentence
 *   Reflecting Pool   rank 173  any type a land YOU control could produce
 *   Mox Amber         rank 205  any colour among your legendary permanents
 *
 * It is a FIELD on `add-mana` rather than a verb of its own, and that is the
 * point rather than a shortcut. A new verb would need a line in `EFFECT_VERBS`,
 * a facet of its own, and an entry in `ROLE_FACETS.ramp` before any of these
 * counted as ramp anywhere. As a field, the facet stays `eff:add-mana` and
 * every consumer that already understands Sol Ring understands these too.
 *
 * The colour is still a decision, so `mana` carries the five-way hybrid and P05
 * defers it exactly as it defers `{R/G}`. Picking a colour on a player's behalf
 * is the one thing that folder does not do.
 */
export type ManaColourSource =
  | 'commander-identity'
  | 'opponent-lands'
  | 'your-lands'
  | 'your-legendary-permanents';

export interface ManaSpendRestriction {
  spendOn: 'cast' | 'activate' | 'cast-or-activate';
  what?: CardFilter;
  /** The verbatim clause, so a player is told the restriction in the card's own words. */
  text: string;
}

/* ------------------------------------------------------------------ *
 * Costs
 * ------------------------------------------------------------------ */

export type Cost =
  | { pay: 'mana'; cost: string }
  | { pay: 'tap' }
  | { pay: 'untap' }
  | { pay: 'tap-others'; what: Selector; count: ValueExpr }
  | { pay: 'sacrifice'; what: Selector; count: ValueExpr }
  | { pay: 'discard'; what?: Selector; count: ValueExpr; random?: boolean }
  | { pay: 'exile'; from: Zone; what: Selector; count: ValueExpr }
  | { pay: 'life'; amount: ValueExpr }
  | { pay: 'remove-counters'; counter: string; count: ValueExpr; from?: Selector }
  | { pay: 'add-counters'; counter: string; count: ValueExpr; to?: Selector }
  | { pay: 'return-to-hand'; what: Selector; count: ValueExpr }
  | { pay: 'reveal'; what: Selector; count: ValueExpr };

/* ------------------------------------------------------------------ *
 * Continuous modifications — explicit CR 613 layers, never inferred.
 * ------------------------------------------------------------------ */

export type Restriction =
  | { rule: 'cant-attack' | 'cant-block' | 'must-attack' | 'cant-untap'; who: Selector; unless?: Condition }
  | { rule: 'cant-be-blocked-except-by'; who: Selector; by: Selector }
  | { rule: 'cant-be-targeted'; who: Selector; by: PlayerSelector }
  | { rule: 'cant-cast'; what: Selector; who: PlayerSelector }
  | { rule: 'max-lands-per-turn'; who: PlayerSelector; n: ValueExpr }
  | { rule: 'damage-prevention'; to: Selector; from?: Selector; amount: ValueExpr | 'all' };

export type Modification =
  | { layer: 'control'; newController: PlayerSelector }
  | { layer: 'type'; addTypes?: string[]; addSubtypes?: string[]; removeTypes?: string[] }
  | { layer: 'color'; setColors: ManaColor[] }
  | { layer: 'ability'; grant?: string[]; remove?: string[] }
  | { layer: 'pt-set'; power: ValueExpr; toughness: ValueExpr }
  | { layer: 'pt-modify'; power: ValueExpr; toughness: ValueExpr }
  | { layer: 'pt-switch' }
  | { layer: 'cost-modify'; applies: Selector; delta: ValueExpr; genericOnly?: boolean; forWhom: PlayerSelector }
  | { layer: 'restriction'; rule: Restriction };

/* ------------------------------------------------------------------ *
 * Triggers and replacements
 * ------------------------------------------------------------------ */

export type TriggerEvent =
  | { on: 'enters'; who: Selector }
  | { on: 'dies'; who: Selector }
  | { on: 'leaves'; who: Selector; from?: Zone }
  | { on: 'zone-change'; who: Selector; from: Zone | 'any'; to: Zone | 'any' }
  | { on: 'attacks'; who: Selector }
  | { on: 'blocks'; who: Selector }
  | { on: 'becomes-blocked'; who: Selector }
  | { on: 'deals-damage'; source: Selector; to?: 'any' | 'player' | 'creature' | 'planeswalker'; combatOnly?: boolean }
  | { on: 'dealt-damage'; who: Selector }
  | { on: 'cast'; what: Selector; by?: PlayerSelector }
  | { on: 'step'; step: Step; whose: PlayerSelector }
  | { on: 'tapped' | 'untapped'; who: Selector }
  | { on: 'counter-added'; who: Selector; counter: string }
  | { on: 'gains-life' | 'loses-life'; whose: PlayerSelector }
  | { on: 'draws-card'; whose: PlayerSelector }
  | { on: 'sacrificed'; who: Selector };

export type ReplaceableEvent =
  | { on: 'enters'; who: Selector }
  | { on: 'damage'; to: Selector; from?: Selector; combatOnly?: boolean }
  | { on: 'draw'; whose: PlayerSelector }
  | { on: 'dies'; who: Selector }
  /**
   * `counter` absent means ANY kind of counter. Doubling Season doubles "one or
   * more counters", full stop; spelling that as a specific kind would double
   * +1/+1 counters and quietly not double loyalty, which is the half of the
   * card people play it for.
   */
  | { on: 'counter-placed'; target: Selector; counter?: string }
  | { on: 'life-gain' | 'life-loss'; whose: PlayerSelector }
  | { on: 'token-created'; whose: PlayerSelector }
  | { on: 'step'; step: Step; whose: PlayerSelector };

export type ReplacementResult =
  | { do: 'enters-tapped' }
  | { do: 'enters-with-counters'; counter: string; count: ValueExpr }
  | { do: 'enters-under-control'; controller: PlayerSelector }
  | { do: 'prevent'; amount: ValueExpr | 'all' }
  | { do: 'redirect'; to: TargetSpec }
  | { do: 'multiply'; factor: ValueExpr }
  | { do: 'replace-zone'; to: Zone }
  | { do: 'skip' }
  | { do: 'additional'; effects: Effect[] };

/* ------------------------------------------------------------------ *
 * Targeting
 * ------------------------------------------------------------------ */

export interface TargetSpec {
  ref: number;
  what: 'card' | 'player' | 'any';
  filter?: CardFilter;
  zone?: Zone;
  controller?: PlayerSelector;
  min: number;
  max: number;
  distinct?: boolean;
  prompt: string;
}

/* ------------------------------------------------------------------ *
 * The ability union
 * ------------------------------------------------------------------ */

/** Fields every ability carries. `text` is verbatim oracle, never invented. */
export interface AbilityBase {
  /** Stable per card — 'a0', 'a1'. Appears in the action log. */
  id: string;
  /** The verbatim oracle clause this came from. Shown on the stack. */
  text: string;
  /** 'approximate' still runs, but the runtime logs that it is an approximation. */
  confidence: 'exact' | 'approximate';
}

export interface TriggeredAbility extends AbilityBase {
  kind: 'triggered';
  event: TriggerEvent;
  activeZones?: Zone[];
  condition?: Condition;
  interveningIf?: boolean;
  optional?: boolean;
  limit?: { per: 'turn' | 'game'; count: number };
  targets?: TargetSpec[];
  effects: Effect[];
}

export interface ActivatedAbility extends AbilityBase {
  kind: 'activated';
  costs: Cost[];
  activeZones?: Zone[];
  timing?: 'any' | 'sorcery';
  condition?: Condition;
  limit?: { per: 'turn' | 'game'; count: number };
  targets?: TargetSpec[];
  effects: Effect[];
  isManaAbility?: boolean;
  isLoyalty?: boolean;
}

export interface StaticAbility extends AbilityBase {
  kind: 'static';
  activeZones?: Zone[];
  condition?: Condition;
  affects: Selector;
  modifications: Modification[];
}

export interface ReplacementAbility extends AbilityBase {
  kind: 'replacement';
  activeZones?: Zone[];
  condition?: Condition;
  event: ReplaceableEvent;
  result: ReplacementResult;
  selfReplacement?: boolean;
}

/** The effect of an instant or sorcery, or the ETB-independent body of a spell. */
export interface SpellAbility extends AbilityBase {
  kind: 'spell';
  targets?: TargetSpec[];
  effects: Effect[];
  /**
   * What you must ALSO do to cast it. CR 601.2f.
   *
   * "As an additional cost to cast this spell, sacrifice a creature" is 26 of
   * the 2,000 most played cards and every one of them read as nothing, because
   * the sentence is its own paragraph and no rule matched it. Village Rites,
   * ranked 200, is the aristocrats card in the format, and the aristocrats plan
   * asks for `cost:sacrifice` by name: the engine wanted the facet, the card
   * stated it, and the two never met.
   *
   * The same argument the activation cost is written under applies here and is
   * stronger. Deadly Dispute and Big Score both draw and make a Treasure; one
   * eats a creature and the other discards. Without the cost they are the same
   * card, and a deck builder that cannot tell them apart cannot build either
   * archetype.
   *
   * On the ability rather than the card because the compiler has no card-level
   * record to hang it on, and because a spell with two halves can only have the
   * cost attached to the half it is printed above.
   */
  additionalCosts?: Cost[];
}

export interface ManaAbility extends AbilityBase {
  kind: 'mana';
  costs: Cost[];
  activeZones?: Zone[];
  effects: Effect[];
}

export interface KeywordAbility extends AbilityBase {
  kind: 'keyword';
  keyword: string;
  /** "ward {2}", "annihilator 2", "protection from red" — the parameter, verbatim. */
  parameter?: string;
}

export type Ability =
  | TriggeredAbility
  | ActivatedAbility
  | StaticAbility
  | ReplacementAbility
  | SpellAbility
  | ManaAbility
  | KeywordAbility;

/* ------------------------------------------------------------------ *
 * The top-level record
 * ------------------------------------------------------------------ */

/**
 * Why a clause was not modelled. The first ten are the modelling gaps the plan
 * names; `complex-combat` and `stale` are its two extras. The last three are
 * additions this compiler needs and could not do without:
 *
 *   - `unrecognised` — no rule matched. The bulk of the catalogue. Without this
 *     code the compiler would have nowhere honest to put an unmatched clause,
 *     and "nowhere to put it" is exactly how a clause gets silently dropped.
 *   - `ambiguous`    — a rule matched but a precision guard rejected it. We know
 *     roughly what the clause is and refuse to guess the details. Counting these
 *     separately is what tells us which rule to sharpen next.
 *   - `multi-face`   — the clause belongs to a face other than the front. The
 *     compiler models the front face only; folding a transform back face into
 *     the front face's ability list would grant abilities the card does not have.
 */
export type GapReason =
  | 'copy-layer'
  | 'alt-cast'
  | 'granted-ability'
  | 'layer-dependency'
  | 'state-trigger'
  | 'duration'
  | 'hidden-choice'
  | 'needs-history'
  | 'outside-game'
  | 'meta-replacement'
  | 'complex-combat'
  | 'stale'
  | 'unrecognised'
  | 'ambiguous'
  | 'multi-face';

export interface UnparsedClause {
  text: string;
  reason: GapReason;
  /** Character span into the normalised text this record was derived from. */
  span: [number, number];
}

export interface CardAbilities {
  /** Scryfall `oracle_id` — stable across printings. The authoring key. */
  oracleId: string;
  name: string;
  abilities: Ability[];
  /** NON-EMPTY => this card can never be reported as fully automated. */
  unparsed: UnparsedClause[];
  /**
   * Which source produced `abilities`.
   *
   * `xmage` means the oracle-text compiler did NOT fully understand this card
   * and the ported XMage record replaced its whole ability list. The rule that
   * decides that, and the argument for it, are in `../xmage/lowered.ts`.
   */
  source: 'compiler' | 'book' | 'book-partial' | 'xmage';
  /** Hash of the normalised oracle text this was derived from. */
  oracleHash: string;
  /**
   * DERIVED by `deriveCoverage`, never hand-set.
   *
   * WHAT THIS RECORD ACCOUNTS FOR, whoever wrote it. On a `compiler` record
   * `'full'` means the oracle-text compiler read every printed paragraph. On an
   * `xmage` record it means the ported record replaced the whole card and the
   * `unparsed` list was emptied to say so. Both are true statements, they are
   * not the same statement, and that is why `compilerCoverage` sits below.
   */
  coverage: Coverage;
  /**
   * WHAT THE ORACLE-TEXT COMPILER ALONE MADE OF THE PRINTED CARD.
   *
   * Set once, from the compiler's own abilities and its own unparsed list,
   * before any second source is consulted, and carried through a swap
   * unchanged. NOTHING DOWNSTREAM MAY REWRITE IT.
   *
   * It exists because `coverage` is not stable across the swap while the
   * precedence rule turns on it. `xmageSwapFor` asks "did the compiler fully
   * understand the printed card", and before this field the only value it could
   * ask was one the swap rewrites a few lines later. Inside a single
   * `compileWithTrace` call statement order saved it — measured, zero
   * disagreements over 32,469 cards — but correct by accident of ordering is
   * not correct by construction, and putting a finished record back through the
   * same rule reversed the answer on every swapped card. A rule that depends on
   * nobody ever asking it twice is not a rule.
   */
  compilerCoverage: Coverage;
}

export type Coverage = 'full' | 'partial' | 'manual' | 'none';

/* ------------------------------------------------------------------ *
 * Derivations and guards
 * ------------------------------------------------------------------ */

/** True if any effect anywhere in the tree is a `{do:'manual'}` marker. */
export function hasManualEffect(effects: readonly Effect[] | undefined): boolean {
  if (!effects) return false;
  for (const e of effects) {
    if (e.do === 'manual') return true;
    if (e.do === 'if' && (hasManualEffect(e.then) || hasManualEffect(e.else))) return true;
    if (e.do === 'for-each' && hasManualEffect(e.effects)) return true;
    if (e.do === 'repeat' && hasManualEffect(e.effects)) return true;
    if (e.do === 'may' && hasManualEffect(e.effects)) return true;
    if (e.do === 'unless-pays' && hasManualEffect(e.effects)) return true;
    if (e.do === 'do-if-cost-paid' && (hasManualEffect(e.then) || hasManualEffect(e.else))) return true;
    if (e.do === 'choose-mode' && e.modes.some((m) => hasManualEffect(m.effects))) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * Structural walkers
 *
 * These exist so "does this ability lean on something the engine cannot
 * supply" is a QUESTION THE CODE ANSWERS, rather than a property somebody
 * remembers to re-check when a rule is added. `trigger-bridge.ts` uses both to
 * decide ownership, and a new nested effect member that is not walked here is
 * a card that would slip through — which is why every container member is
 * listed in one place.
 * ------------------------------------------------------------------ */

/** Every effect list nested inside one effect. One place, so nothing is missed. */
function childEffectLists(effect: Effect): Effect[][] {
  switch (effect.do) {
    case 'if':
    case 'do-if-cost-paid':
      return effect.else ? [effect.then, effect.else] : [effect.then];
    case 'for-each':
    case 'repeat':
    case 'may':
    case 'unless-pays':
      return [effect.effects];
    case 'choose-mode':
      return effect.modes.map((mode) => mode.effects);
    default:
      return [];
  }
}

/** Every `ValueExpr` reachable from an effect tree, including nested ones. */
export function valueExprsIn(effects: readonly Effect[]): ValueExpr[] {
  const out: ValueExpr[] = [];

  const walkValue = (value: ValueExpr | undefined): void => {
    if (value === undefined || typeof value === 'number') return;
    out.push(value);
    switch (value.v) {
      case 'add':
      case 'mul':
      case 'min':
      case 'max':
        for (const inner of value.of) walkValue(inner);
        break;
      case 'sub':
      case 'div':
        walkValue(value.a);
        walkValue(value.b);
        break;
      case 'if':
        walkValue(value.then);
        walkValue(value.else);
        walkCondition(value.condition);
        break;
      default:
        break;
    }
  };

  const walkCondition = (condition: Condition | undefined): void => {
    if (!condition) return;
    switch (condition.if) {
      case 'count':
        walkValue(condition.value);
        break;
      case 'value':
        walkValue(condition.a);
        walkValue(condition.b);
        break;
      case 'controls':
        walkValue(condition.value);
        break;
      case 'not':
        walkCondition(condition.of);
        break;
      case 'and':
      case 'or':
        for (const inner of condition.of) walkCondition(inner);
        break;
      default:
        break;
    }
  };

  const walkEffect = (effect: Effect): void => {
    // Read every numeric-ish field by name. A `for (const v of Object.values)`
    // would be shorter and would also walk `TokenSpec.power`, which is a string.
    const anyEffect = effect as Record<string, unknown>;
    for (const key of ['amount', 'count', 'times', 'min', 'max', 'power', 'toughness'] as const) {
      const field = anyEffect[key];
      if (typeof field === 'number' || (field && typeof field === 'object' && 'v' in (field as object))) {
        walkValue(field as ValueExpr);
      }
    }
    if (effect.do === 'if') walkCondition(effect.condition);
    for (const list of childEffectLists(effect)) for (const inner of list) walkEffect(inner);
  };

  for (const effect of effects) walkEffect(effect);
  return out;
}

/** Every `WatchQuery` an effect tree depends on. Empty means no turn history needed. */
export function watchQueriesIn(effects: readonly Effect[]): WatchQuery[] {
  return onlyWatches(valueExprsIn(effects));
}

function onlyWatches(values: readonly ValueExpr[]): WatchQuery[] {
  return values
    .filter((value): value is { v: 'watch'; query: WatchQuery } => typeof value !== 'number' && value.v === 'watch')
    .map((value) => value.query);
}

/**
 * Every `WatchQuery` an ABILITY depends on, effects and everything else.
 *
 * `watchQueriesIn` walks effect trees, and a `StaticAbility` has none: its
 * numbers live in `modifications`, which is exactly where "this spell costs {1}
 * less to cast for each creature that attacked this turn" puts its watch query.
 * A caller checking only the effects would report that card as needing no
 * history, which is the under-report this function exists to prevent.
 */
export function watchQueriesInAbility(ability: Ability): WatchQuery[] {
  const values: ValueExpr[] = [...valueExprsIn(effectsOf(ability))];

  if (ability.kind === 'static') {
    for (const modification of ability.modifications) {
      switch (modification.layer) {
        case 'cost-modify':
          values.push(modification.delta);
          break;
        case 'pt-set':
        case 'pt-modify':
          values.push(modification.power, modification.toughness);
          break;
        case 'restriction':
          if (modification.rule.rule === 'max-lands-per-turn') values.push(modification.rule.n);
          if (modification.rule.rule === 'damage-prevention' && modification.rule.amount !== 'all') {
            values.push(modification.rule.amount);
          }
          break;
        default:
          break;
      }
    }
  }

  if (ability.kind === 'replacement') {
    const result = ability.result;
    if (result.do === 'enters-with-counters') values.push(result.count);
    if (result.do === 'multiply') values.push(result.factor);
    if (result.do === 'prevent' && result.amount !== 'all') values.push(result.amount);
  }

  // Nested arithmetic inside those values still has to be walked.
  const expanded: ValueExpr[] = [];
  for (const value of values) {
    expanded.push(value);
    expanded.push(...valueExprsIn([{ do: 'gain-life', who: { who: 'you' }, amount: value }]));
  }
  return onlyWatches(expanded);
}

/** Every `PlayerSelector` an effect tree names, so a caller can check it is bindable. */
export function playerSelectorsIn(effects: readonly Effect[]): PlayerSelector[] {
  const out: PlayerSelector[] = [];
  const walk = (effect: Effect): void => {
    const anyEffect = effect as Record<string, unknown>;
    for (const key of ['who', 'whose', 'to', 'over'] as const) {
      const field = anyEffect[key];
      if (field && typeof field === 'object' && 'who' in (field as object)) out.push(field as PlayerSelector);
    }
    for (const list of childEffectLists(effect)) for (const inner of list) walk(inner);
  };
  for (const effect of effects) walk(effect);
  return out;
}

/** Every effect list an ability owns, so `hasManualEffect` can be run over it. */
export function effectsOf(ability: Ability): Effect[] {
  switch (ability.kind) {
    case 'triggered':
    case 'activated':
    case 'spell':
    case 'mana':
      return ability.effects;
    case 'replacement':
      return ability.result.do === 'additional' ? ability.result.effects : [];
    case 'static':
    case 'keyword':
      return [];
    default:
      return assertNever(ability);
  }
}

/**
 * `coverage` is computed, never asserted. `'full'` demands that no text was
 * dropped AND that no ability carries a `{do:'manual'}` marker, so there is no
 * way to spell "fully automated" while a clause went unmodelled.
 */
export function deriveCoverage(abilities: readonly Ability[], unparsed: readonly UnparsedClause[]): Coverage {
  const anyManual = abilities.some((a) => hasManualEffect(effectsOf(a)));
  if (abilities.length === 0) return unparsed.length === 0 ? 'none' : 'manual';
  if (unparsed.length === 0 && !anyManual) return 'full';
  return 'partial';
}

/**
 * The one discipline `tsconfig.app.json` will not enforce for us: `strict` and
 * `noImplicitAny` are both off, so union narrowing alone does not turn a missing
 * `switch` case into a compile error. Every switch over `Effect`, `Ability`,
 * `Selector`, `Modification` or `TriggerEvent` ends here.
 */
export function assertNever(x: never): never {
  throw new Error(`Unhandled ability-DSL variant: ${JSON.stringify(x)}`);
}

/**
 * Proves a value is pure JSON — no function, class instance, `Map`, `Set`,
 * `Date`, `undefined`-in-array or `NaN`. The DSL's central promise is that a
 * `CardAbilities` round-trips through `structuredClone` and a `jsonb` column
 * unchanged; this is the assertion that keeps the promise checkable.
 */
export function assertSerialisable(value: unknown, path = '$'): void {
  const t = typeof value;
  if (value === null || t === 'string' || t === 'boolean') return;
  if (t === 'number') {
    if (!Number.isFinite(value as number)) throw new Error(`${path}: non-finite number`);
    return;
  }
  if (t === 'undefined') throw new Error(`${path}: undefined is not JSON`);
  if (t === 'function' || t === 'symbol' || t === 'bigint') throw new Error(`${path}: ${t} is not JSON`);
  if (Array.isArray(value)) {
    value.forEach((v, i) => {
      if (v === undefined) throw new Error(`${path}[${i}]: undefined in array`);
      assertSerialisable(v, `${path}[${i}]`);
    });
    return;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new Error(`${path}: ${(value as object).constructor?.name ?? 'exotic object'} is not a plain object`);
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue; // an absent optional field; JSON.stringify drops it
    assertSerialisable(v, `${path}.${k}`);
  }
}

/* ------------------------------------------------------------------ *
 * Constructor helpers — the tagger's `t()` / `any()` / `all()` idiom.
 * Terse enough that a rule table reads like the oracle text it matches.
 * ------------------------------------------------------------------ */

export const SELF: Selector = { sel: 'self' };
export const YOU: PlayerSelector = { who: 'you' };
export const EACH_OPPONENT: PlayerSelector = { who: 'each-opponent' };
export const EACH_PLAYER: PlayerSelector = { who: 'each-player' };

export const type = (value: string): CardFilter => ({ is: 'type', value });
export const subtype = (value: string): CardFilter => ({ is: 'subtype', value });
export const keywordFilter = (value: string): CardFilter => ({ is: 'keyword', value });
export const notF = (of: CardFilter): CardFilter => ({ is: 'not', of });
export const andF = (...of: CardFilter[]): CardFilter => (of.length === 1 ? of[0] : { is: 'and', of });
export const orF = (...of: CardFilter[]): CardFilter => (of.length === 1 ? of[0] : { is: 'or', of });

/** `all` with a filter, optionally scoped to a controller and a zone. */
export const all = (
  where: CardFilter,
  controller?: PlayerSelector,
  zone?: Zone,
): Selector => {
  const s: Selector = { sel: 'all', where };
  if (controller) (s as { controller?: PlayerSelector }).controller = controller;
  if (zone) (s as { zone?: Zone }).zone = zone;
  return s;
};

export const target = (ref: number): Selector => ({ sel: 'target', ref });
export const targetPlayer = (ref: number): PlayerSelector => ({ who: 'target-player', ref });

export const manual = (text: string, hint?: string): Effect =>
  hint ? { do: 'manual', text, hint } : { do: 'manual', text };
