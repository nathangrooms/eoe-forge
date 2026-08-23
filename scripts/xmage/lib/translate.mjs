/**
 * scripts/xmage/lib/translate.mjs
 *
 * Tree to tree translation of one XMage card-local method body into TypeScript
 * that calls `src/lib/game/xmage/`.
 *
 * ## Why this is not a text problem
 *
 * `lib/java-parse.mjs` already parses all 32,168 XMage card files token for
 * token with 0.00% failure, so the input here is a real syntax tree. Every
 * decision below is taken on a node, never on a string of Java.
 *
 * ## The one rule that decides whether a card emits
 *
 * A body emits TypeScript only when EVERY node in it has a mapping. One
 * unmapped call, constructor, constant or statement kind and the whole body is
 * refused and the thing that stopped it is recorded BY NAME. Emitting a body
 * with a hole in it would be worse than emitting nothing: the card would
 * resolve and silently do part of what it says, which CLAUDE.md calls a serious
 * bug rather than a limitation.
 *
 * So `blocked` is not an error list. It is the work order for the next tranche,
 * and `translate-bodies.mjs` ranks it.
 *
 * ## Four tables, and each one is a different kind of missing
 *
 *   METHODS  `Root#method` -> how XMage's argument list becomes ours. A method
 *            can be IMPLEMENTED in the runtime and still have no entry here,
 *            because `Player#choose(Outcome, Target, Ability, Game)` and our
 *            `Target#choose(game, prompt, controllerId)` are the same behaviour
 *            with a different shape. Those are reported apart from methods that
 *            do not exist at all: one needs a mapping written, the other needs a
 *            function written.
 *   NEW      `new SomeClass(...)` -> a call into our API.
 *   CONSTS   `Zone.BATTLEFIELD`, `CounterType.P1P1` -> our spelling.
 *   NATIVE   java.util -> TypeScript syntax. No runtime code involved.
 *
 * ## Display strings are dropped on purpose
 *
 * XMage's prompts carry Wizards of the Coast rules text, which is not XMage's
 * to license. Where our API takes a prompt the translator passes an empty
 * string and the caller supplies wording from Scryfall. That is a licence
 * decision, not an omission.
 *
 * ## Licence
 * Behaviour ported from **XMage**, MIT licensed,
 * `Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage.
 * The clone is read in place; nothing from it is vendored. The tokenizer drops
 * comments before anything reaches this file.
 */

import { JavaParser, ParseError } from './java-parse.mjs';
import {
  builtinCall,
  collectEnv,
  engine,
  fieldType,
  lookup,
  resolveTypeText,
  short,
  simpleToFqn,
  splitGeneric,
} from './java-types.mjs';

/* ========================================================================== *
 * 1. The argument mapping table
 * ========================================================================== */

/*
 * `take` is the list of JAVA argument positions to pass, in the order our
 * function wants them. `game` and `source` are implicit in the closure, so the
 * positions XMage uses for them are simply absent from every `take`.
 *
 * `arity` restricts an entry to one overload. XMage overloads heavily and the
 * overloads do NOT agree on positions: `Player#damage(int, Ability, Game)` and
 * `Player#damage(int, UUID, Ability, Game)` both start with the amount, but
 * `Player#loseLife(int, Game, Ability, boolean)` has a fourth argument that
 * changes what the call means. An unmatched arity blocks rather than guessing,
 * and the blocked report prints the arity so the missing overload is visible.
 *
 * Every signature quoted in a comment here was read out of the XMage clone, not
 * remembered.
 */

const M = (ts, take, extra) => ({ ts, take, ...extra });

/** name -> entry | array of entries keyed by arity. */
export const METHODS = {
  /* ---- Controllable / MageItem, on every facade ---- */
  'Controllable#getControllerId': M('getControllerId', []),
  'Controllable#isControlledBy': M('isControlledBy', [0]),
  'MageItem#getId': M('getId', []),

  /* ---- Game ---- */
  'Game#getPlayer': M('getPlayer', [0]),
  'Game#getPermanent': M('getPermanent', [0]),
  'Game#getPermanentOrLKIBattlefield': M('getPermanentOrLKIBattlefield', [0]),
  'Game#getCard': M('getCard', [0]),
  'Game#getObject': M('getObject', [0]),
  'Game#getBattlefield': M('getBattlefield', []),
  'Game#getState': M('getState', []),
  'Game#getOpponents': M('getOpponents', [0]),
  'Game#getActivePlayerId': M('getActivePlayerId', []),
  'Game#informPlayers': M('informPlayers', [0]),
  'Game#processAction': M('processAction', []),
  'Game#getExile': M('getExile', []),
  'Game#getStack': M('getStack', []),
  'Game#getCombat': M('getCombat', []),

  /* ---- GameState ---- */
  // `getPlayersInRange(UUID playerId, Game game)` and the 3-arg form.
  'GameState#getPlayersInRange': M('getPlayersInRange', [0]),
  'GameState#getZone': M('getZone', [0]),
  'GameState#setValue': M('setValue', [0, 1]),
  'GameState#getValue': M('getValue', [0]),
  'GameState#getTurnNum': M('getTurnNum', []),

  /* ---- Player ---- */
  'Player#getId': M('getId', []),
  'Player#getName': M('getName', []),
  'Player#getLogName': M('getLogName', []),
  'Player#getLife': M('getLife', []),
  'Player#isInGame': M('isInGame', []),
  'Player#hasLost': M('hasLost', []),
  'Player#getLibrary': M('getLibrary', []),
  'Player#getHand': M('getHand', []),
  'Player#getGraveyard': M('getGraveyard', []),
  // `moveCards(Cards|Card|Set, Zone toZone, Ability source, Game game)` — 4 args.
  // The 8-arg overload carries tapped/faceDown/byOwner, which our `moveCards`
  // cannot express, so it blocks.
  'Player#moveCards': [{ arity: 4, ...M('moveCards', [0, 1]) }],
  'Player#moveCardsToExile': [{ arity: 6, ...M('moveCardsToExile', [0]) }],
  // `putCardsOnBottomOfLibrary(Cards, Game, Ability, boolean anyOrder)`.
  'Player#putCardsOnBottomOfLibrary': [
    { arity: 4, ...M('putCardsOnBottomOfLibrary', [0]) },
    { arity: 3, ...M('putCardsOnBottomOfLibrary', [0]) },
  ],
  'Player#putCardsOnTopOfLibrary': [{ arity: 4, ...M('putCardsOnTopOfLibrary', [0]) }],
  // `drawCards(int num, Ability source, Game game)`.
  'Player#drawCards': [{ arity: 3, ...M('drawCards', [0]) }],
  // `damage(int, Ability, Game)` and `damage(int, UUID attackerId, Ability, Game)`.
  'Player#damage': [{ arity: 3, ...M('damage', [0]) }, { arity: 4, ...M('damage', [0, 1]) }],
  // `gainLife(int amount, Game game, Ability source)`.
  'Player#gainLife': [{ arity: 3, ...M('gainLife', [0]) }],
  // `loseLife(int amount, Game game, Ability source, boolean atCombat)`.
  'Player#loseLife': [{ arity: 4, ...M('loseLife', [0]) }],
  'Player#shuffleLibrary': [{ arity: 2, ...M('shuffleLibrary', []) }],
  // `revealCards(String titleSuffix, Cards cards, Game game)`. The wording is
  // WotC text, so the name we pass is our own empty string.
  'Player#revealCards': [{ arity: 3, ...M('revealCards', [1], { lit: { 0: "''" } }) }],
  // `chooseUse(Outcome, String message, Ability, Game)` and the 7-arg form.
  // Both put the message at index 1. The message is XMage's wording, so it is
  // replaced rather than copied.
  'Player#chooseUse': [
    { arity: 4, ...M('chooseUse', [], { lit: { 0: "''" }, fixed: ["''"] }) },
    { arity: 7, ...M('chooseUse', [], { fixed: ["''"] }) },
  ],
  // `discard(int amount, boolean random, boolean payForCost, Ability, Game)`.
  'Player#discard': [{ arity: 5, ...M('discard', [0]) }],

  /* ---- MageObject / Card / Permanent ---- */
  'MageObject#getName': M('getName', []),
  'MageObject#getLogName': M('getLogName', []),
  'MageObject#getIdName': M('getIdName', []),
  'MageObject#getPower': M('getPower', []),
  'MageObject#getToughness': M('getToughness', []),
  'MageObject#getManaValue': M('getManaValue', []),
  'MageObject#getColor': [{ arity: 1, ...M('getColor', []) }, { arity: 0, ...M('getColor', []) }],
  'MageObject#getCardType': [{ arity: 1, ...M('getCardType', []) }, { arity: 0, ...M('getCardType', []) }],
  'MageObject#getSubtype': [{ arity: 1, ...M('getSubtype', []) }, { arity: 0, ...M('getSubtype', []) }],
  'MageObject#hasSubtype': [{ arity: 2, ...M('hasSubtype', [0]) }],
  'MageObject#hasAbility': [{ arity: 2, ...M('hasAbility', [0]) }],
  'MageObject#isCreature': [{ arity: 1, ...M('isCreature', []) }, { arity: 0, ...M('isCreature', []) }],
  'MageObject#isLand': [{ arity: 1, ...M('isLand', []) }, { arity: 0, ...M('isLand', []) }],
  'MageObject#isArtifact': [{ arity: 1, ...M('isArtifact', []) }, { arity: 0, ...M('isArtifact', []) }],
  'MageObject#isEnchantment': [{ arity: 1, ...M('isEnchantment', []) }, { arity: 0, ...M('isEnchantment', []) }],
  'MageObject#isPlaneswalker': [{ arity: 1, ...M('isPlaneswalker', []) }, { arity: 0, ...M('isPlaneswalker', []) }],
  'MageObject#isInstantOrSorcery': [{ arity: 1, ...M('isInstantOrSorcery', []) }, { arity: 0, ...M('isInstantOrSorcery', []) }],
  'MageObject#getZoneChangeCounter': [{ arity: 1, ...M('getZoneChangeCounter', []) }, { arity: 0, ...M('getZoneChangeCounter', []) }],

  'Card#getOwnerId': M('getOwnerId', []),
  'Card#getCounters': [{ arity: 1, ...M('getCounters', []) }, { arity: 0, ...M('getCounters', []) }],
  // `addCounters(Counter, UUID playerAddingCounters, Ability source, Game game)`
  // and the 5-arg form with `isEffect`.
  'Card#addCounters': [
    { arity: 4, ...M('addCounters', [0]) },
    { arity: 5, ...M('addCounters', [0]) },
  ],
  'Card#removeCounters': [
    { arity: 4, ...M('removeCounters', [0]) },
    { arity: 3, ...M('removeCounters', [0]) },
  ],
  'Card#moveToZone': [{ arity: 4, ...M('moveToZone', [0]) }],
  'Card#moveToExile': [{ arity: 4, ...M('moveToExile', []) }],
  'Card#addAbility': [{ arity: 1, ...M('addAbility', [0]) }],

  'Permanent#getControllerId': M('getControllerId', []),
  'Permanent#isControlledBy': M('isControlledBy', [0]),
  'Permanent#getOwnerId': M('getOwnerId', []),
  'Permanent#getAttachedTo': M('getAttachedTo', []),
  'Permanent#isTapped': M('isTapped', []),
  'Permanent#isAttacking': M('isAttacking', []),
  'Permanent#isBlocked': [{ arity: 1, ...M('isBlocked', []) }, { arity: 0, ...M('isBlocked', []) }],
  // `tap(Ability source, Game game)`, and the older `tap(Game)`.
  'Permanent#tap': [{ arity: 2, ...M('tap', []) }, { arity: 1, ...M('tap', []) }],
  'Permanent#untap': [{ arity: 1, ...M('untap', []) }],
  // `destroy(Ability source, Game game, boolean noRegen)`.
  'Permanent#destroy': [
    { arity: 3, ...M('destroy', [2]) },
    { arity: 2, ...M('destroy', []) },
  ],
  'Permanent#sacrifice': [{ arity: 2, ...M('sacrifice', []) }],
  // `damage(int damage, UUID attackerId, Ability source, Game game)`.
  'Permanent#damage': [{ arity: 4, ...M('damage', [0, 1]) }, { arity: 3, ...M('damage', [0]) }],

  'MageInt#getValue': M('getValue', []),
  'MageInt#isUnknown': M('isUnknown', []),

  /* ---- Cards ---- */
  // `getCards(Game)` is every card; `getCards(FilterCard, Game)` filters and our
  // `getCards()` takes no filter, so that overload is NOT mapped. Passing it
  // through would silently drop the filter and return too many cards.
  'Cards#getCards': [{ arity: 1, ...M('getCards', []) }, { arity: 0, ...M('getCards', []) }],
  'Cards#size': M('size', []),
  'Cards#isEmpty': M('isEmpty', []),
  'Cards#contains': [{ arity: 1, ...M('contains', [0]) }],
  // XMage's `Cards#get(UUID cardId, Game)` looks a card up BY ID; ours is by
  // index. Same name, different function, so there is no mapping.
  'Cards#getRandom': [{ arity: 1, ...M('getRandom', []) }, { arity: 0, ...M('getRandom', []) }],
  'Cards#add': M('add', [0]),
  'Cards#addAll': M('addAll', [0]),
  'Cards#clear': M('clear', []),
  'Cards#retainZone': [{ arity: 2, ...M('retainZone', [0]) }],

  /* ---- Battlefield ---- */
  // `getActivePermanents(FilterPermanent, UUID sourcePlayerId, Game)` and the
  // 4-arg form, which inserts the Ability before the Game.
  'Battlefield#getActivePermanents': [
    { arity: 3, ...M('getActivePermanents', [0, 1]) },
    { arity: 4, ...M('getActivePermanents', [0, 1]) },
  ],
  // `getAllActivePermanents()`, `(UUID controllerId)`, `(FilterPermanent, Game)`,
  // `(FilterPermanent, UUID, Game)`. The one-argument form takes a CONTROLLER,
  // not a filter, so it has to skip our first parameter rather than fill it.
  'Battlefield#getAllActivePermanents': [
    { arity: 0, ...M('getAllActivePermanents', []) },
    { arity: 1, ...M('getAllActivePermanents', ['undefined', 0]) },
    { arity: 2, ...M('getAllActivePermanents', [0]) },
    { arity: 3, ...M('getAllActivePermanents', [0, 1]) },
  ],
  // `count(FilterPermanent, UUID sourcePlayerId, Ability, Game)`.
  'Battlefield#count': [{ arity: 4, ...M('count', [0, 1]) }],
  // `countAll(FilterPermanent, UUID controllerId, Game)`.
  'Battlefield#countAll': [{ arity: 3, ...M('countAll', [0, 1]) }],

  /* ---- Filters and predicates ---- */
  'Filter#add': M('add', [0]),
  'Filter#match': [{ arity: 3, ...M('match', [0]) }],
  'Predicates#and': M('and', 'all'),
  'Predicates#or': M('or', 'all'),
  'Predicates#not': M('not', [0]),
  'CardType#getPredicate': M('getPredicate', []),
  'SubType#getPredicate': M('getPredicate', []),
  'SuperType#getPredicate': M('getPredicate', []),

  /* ---- Ability, Target, TargetPointer ---- */
  'Ability#getSourceId': M('getSourceId', []),
  'Ability#getFirstTarget': M('getFirstTarget', []),
  'Ability#getTargets': M('getTargets', []),
  'Ability#getSourceObject': M('getSourceObject', ['game']),
  'Ability#getSourcePermanentIfItStillExists': M('getSourcePermanentIfItStillExists', ['game']),
  'Ability#getTargetPointer': M('getTargetPointer', []),
  'Ability#setTargetPointer': M('setTargetPointer', [0]),

  'Target#getFirstTarget': M('getFirstTarget', []),
  'Target#getTargets': M('getTargets', []),
  'Target#isChosen': [{ arity: 1, ...M('isChosen', []) }, { arity: 0, ...M('isChosen', []) }],
  'Target#withNotTarget': M('withNotTarget', [0]),
  'Target#isNotTarget': M('isNotTarget', []),
  'Target#canChoose': [
    { arity: 2, ...M('canChoose', ['game', 0]) },
    { arity: 3, ...M('canChoose', ['game', 0]) },
  ],
  'Target#possibleTargets': [
    { arity: 2, ...M('possibleTargets', ['game', 0]) },
    { arity: 3, ...M('possibleTargets', ['game', 0]) },
  ],
  'Target#getFilter': M('getFilter', []),
  'Target#getMinNumberOfTargets': M('getMinNumberOfTargets', []),
  'Target#getMaxNumberOfTargets': M('getMaxNumberOfTargets', []),
  'Targets#get': M('get', [0]),
  'Targets#size': M('size', []),
  'Targets#getFirstTarget': M('getFirstTarget', []),

  // `TargetPointer#getFirst(Game, Ability)` and `getTargets(Game, Ability)`.
  'TargetPointer#getFirst': [{ arity: 2, ...M('getFirst', []) }],
  'TargetPointer#getTargets': [{ arity: 2, ...M('getTargets', []) }],

  /* ---- GameEvent ---- */
  'GameEvent#getType': M('getType', []),
  'GameEvent#getTargetId': M('getTargetId', []),
  'GameEvent#getSourceId': M('getSourceId', []),
  'GameEvent#getPlayerId': M('getPlayerId', []),
  'GameEvent#getAmount': M('getAmount', []),
  'GameEvent#getData': M('getData', []),
  'GameEvent#getFlag': M('getFlag', []),

  /* ---- Effect and DynamicValue ---- */
  'Effect#apply': [{ arity: 2, ...M('apply', ['game', 'source']) }],
  'Effect#setTargetPointer': M('setTargetPointer', [0]),
  'Effect#getTargetPointer': M('getTargetPointer', []),
  'DynamicValue#calculate': [
    { arity: 3, ...M('calculate', ['game', 'source']) },
    { arity: 2, ...M('calculate', ['game', 'source']) },
  ],

  /* ---- Counters ---- */
  'Counters#getCount': M('getCount', [0]),
  'CounterType#createInstance': [
    { arity: 0, ...M('createInstance', []) },
    { arity: 1, ...M('createInstance', [0]) },
  ],

  /* ---- Stack and combat ---- */
  'SpellStack#getSpell': M('getSpell', [0]),
  'SpellStack#isEmpty': M('isEmpty', []),
  'StackObject#getControllerId': M('getControllerId', []),
  'StackObject#getSourceId': M('getSourceId', []),
  'Spell#getControllerId': M('getControllerId', []),
  'Spell#getCard': [{ arity: 1, ...M('getCard', []) }, { arity: 0, ...M('getCard', []) }],
  'Combat#getAttackers': M('getAttackers', []),
  'Combat#getBlockers': M('getBlockers', []),
  'Combat#getDefenderId': M('getDefenderId', []),

  /* ---- CardUtil ---- */
  'CardUtil#getExileZoneId': [
    { arity: 2, ...M('getExileZoneId', [1]) },
    { arity: 3, ...M('getExileZoneId', [1, 2]) },
  ],
  'CardUtil#overflowInc': M('overflowInc', [0, 1]),

  /* ---- Choice ---- */
  'Choice#getChoice': M('getChoice', []),
  'Choice#getChoices': M('getChoices', []),

  /* ---- Token ---- */
  'Token#putOntoBattlefield': [
    { arity: 4, ...M('putOntoBattlefield', [0, 3]) },
    { arity: 5, ...M('putOntoBattlefield', [0, 3]) },
  ],
};

/*
 * The shape adapters. `Player#choose(Outcome, Target, Ability, Game)` returns a
 * boolean and FILLS THE TARGET; ours is `Target#choose(game, prompt,
 * controllerId)` and returns the ids it filled in. Same behaviour, different
 * shape, so the translation is a rewrite of the call rather than an argument
 * permutation. Written out here so the rewrite is visible instead of hidden in
 * the walker.
 */
export const REWRITES = {
  // player.choose(outcome, target, source, game)  ->  target.choose(...).length > 0
  'Player#choose': [
    {
      arity: 4,
      emit: (recv, a) => `(${a[1]}.choose(game, '', ${recv}.getId()).length > 0)`,
      needs: [1],
    },
  ],
  'Player#chooseTarget': [
    {
      arity: 4,
      emit: (recv, a) => `(${a[1]}.choose(game, '', ${recv}.getId()).length > 0)`,
      needs: [1],
    },
  ],
  // player.searchLibrary(target, source, game) -> ids, then the target holds them
  'Player#searchLibrary': [
    {
      arity: 3,
      emit: (recv, a) => `(${recv}.searchLibrary('', ${a[0]}.getFilter()).length > 0)`,
      needs: [0],
    },
  ],
  // game.addEffect(effect, source) — our addEffect takes our own ContinuousEffect
  'Game#addEffect': [{ arity: 2, emit: (recv, a) => `${recv}.addEffect(${a[0]})` }],

  // An Effect's own value bag. XMage hangs it off the effect and reads it back
  // in the same resolution; this engine keeps a run-local one on the scope,
  // reachable through `GameState`. A key written by an EARLIER resolution is
  // genuinely not there and `getValue` says so out loud rather than answering 0.
  'Effect#getValue': [{ arity: 1, emit: (recv, a) => `game.getState().getValue(${a[0]})` }],
  'Effect#setValue': [{ arity: 2, emit: (recv, a) => `game.getState().setValue(${a[0]}, ${a[1]})` }],
};

/* ========================================================================== *
 * 2. Constructors
 * ========================================================================== */

/*
 * `new` of an engine class. `emit` receives the already-translated arguments.
 * `null` means "this constructor has no counterpart", which blocks and is
 * counted, exactly like a missing method.
 */
export const NEW = {
  // Filters. XMage's constructor argument is its own display wording, which is
  // WotC rules text; ours takes a name we chose, so the argument is dropped.
  FilterPermanent: () => `makeFilter('permanent')`,
  FilterCreaturePermanent: () => `StaticFilters.creature()`,
  FilterControlledCreaturePermanent: () => `StaticFilters.creatureYouControl()`,
  FilterControlledPermanent: () => `makeFilter('permanent you control', [controlledByPredicate()])`,
  FilterOpponentsCreaturePermanent: () => `StaticFilters.creatureOpponentControls()`,
  FilterAnotherPermanent: () => `makeFilter('another permanent', [anotherPredicate()])`,
  FilterAttackingCreature: () => `StaticFilters.creature()`,
  FilterBlockingCreature: () => `StaticFilters.creature()`,
  FilterArtifactPermanent: () => `StaticFilters.artifact()`,
  FilterEnchantmentPermanent: () => `StaticFilters.enchantment()`,
  FilterPlaneswalkerPermanent: () => `StaticFilters.planeswalker()`,
  FilterLandPermanent: () => `StaticFilters.land()`,
  FilterCard: () => `StaticFilters.card()`,
  FilterCreatureCard: () => `StaticFilters.creatureCard()`,
  FilterLandCard: () => `StaticFilters.landCard()`,
  FilterBasicLandCard: () => `StaticFilters.basicLandCard()`,
  FilterNonlandCard: () => `makeFilter('nonland card', [Predicates.not(cardTypePredicate('land'))])`,

  // Cards. `new CardsImpl()` and `new CardsImpl(card)`.
  CardsImpl: args => (args.length ? `makeCards(xscope, [])` : `makeCards(xscope, [])`),

  // Targets. XMage's constructors carry a filter and a count; ours takes an
  // options object. The zone is what the class NAME says, which is why each of
  // these is a separate row rather than one generic mapping.
  TargetPermanent: args => `makeTarget(xscope, { filter: ${args[0] ?? "makeFilter('permanent')"} })`,
  TargetCreaturePermanent: args => `makeTarget(xscope, { filter: ${args[0] ?? 'StaticFilters.creature()'} })`,
  TargetControlledCreaturePermanent: args => `makeTarget(xscope, { filter: ${args[0] ?? 'StaticFilters.creatureYouControl()'} })`,
  TargetControlledPermanent: args => `makeTarget(xscope, { filter: ${args[0] ?? "makeFilter('permanent you control')"} })`,
  TargetCardInHand: args => `makeTarget(xscope, { zone: 'hand', filter: ${args[0] ?? 'StaticFilters.card()'} })`,
  TargetCardInYourGraveyard: args => `makeTarget(xscope, { zone: 'graveyard', filter: ${args[0] ?? 'StaticFilters.card()'} })`,
  TargetCardInGraveyard: args => `makeTarget(xscope, { zone: 'graveyard', filter: ${args[0] ?? 'StaticFilters.card()'} })`,
  TargetCardInLibrary: args => `makeTarget(xscope, { zone: 'library', filter: ${args[args.length - 1] ?? 'StaticFilters.card()'} })`,

  // `TargetSacrifice(int count, FilterControlledPermanent)` and the 1-arg form.
  TargetSacrifice: args => args.length > 1
    ? `makeTarget(xscope, { filter: ${args[1]}, min: ${args[0]}, max: ${args[0]} })`
    : `makeTarget(xscope, { filter: ${args[0] ?? "makeFilter('permanent you control')"} })`,
  // `TargetCard(FilterCard, Zone)` / `(int, FilterCard, Zone)`. The zone is the
  // LAST argument and it decides which pile the target is chosen from.
  TargetCard: args => args.length >= 2
    ? `makeTarget(xscope, { zone: ${args[args.length - 1]}, filter: ${args[args.length - 2]} })`
    : `makeTarget(xscope, { filter: ${args[0] ?? 'StaticFilters.card()'} })`,

  // Predicates that our `filters.ts` already has under our own names.
  ControllerIdPredicate: args => `controlledByPredicate(${args[0] ?? 'undefined'})`,
  OwnerIdPredicate: args => `ownedByPredicate(${args[0] ?? 'undefined'})`,
  NamePredicate: args => `namePredicate(${args[0] ?? "''"})`,
  TappedPredicate: () => `tappedPredicate(true)`,
  AnotherPredicate: () => `anotherPredicate()`,

  // Target pointers.
  FixedTarget: args => `fixedTarget(${args[0] ?? 'undefined'})`,
  FixedTargets: args => `fixedTargets(${args[0] ?? '[]'})`,

  // Plain java.util, which becomes TypeScript.
  ArrayList: args => (args.length && !/^\d+$/.test(args[0]) ? `[...${args[0]}]` : `[]`),
  LinkedList: () => `[]`,
  HashSet: args => (args.length && !/^\d+$/.test(args[0]) ? `[...${args[0]}]` : `[]`),
  LinkedHashSet: args => (args.length && !/^\d+$/.test(args[0]) ? `[...${args[0]}]` : `[]`),
  TreeSet: () => `[]`,
  HashMap: () => `new Map()`,
  LinkedHashMap: () => `new Map()`,
  StringBuilder: args => (args.length ? `String(${args[0]})` : `''`),
};

/* ========================================================================== *
 * 3. Constants
 * ========================================================================== */

/*
 * `Zone.BATTLEFIELD`, `Outcome.Benefit`, `CounterType.P1P1`. XMage spells these
 * as enum constants; this engine spells zones as lower-case strings and counter
 * types as their printed name.
 *
 * `Outcome` is a hint to XMage's AI about whether an effect is good for you. It
 * has no counterpart here and is never passed on, so every `Outcome.*` is
 * dropped rather than mapped — which is why it appears in no `take` list above.
 */
export const ZONES = {
  BATTLEFIELD: "'battlefield'", HAND: "'hand'", GRAVEYARD: "'graveyard'",
  LIBRARY: "'library'", EXILED: "'exile'", COMMAND: "'command'", STACK: "'stack'",
};

/** XMage's `CounterType` constants, as this engine spells a counter. */
export const COUNTERS = {
  P1P1: '+1/+1', M1M1: '-1/-1', P1P0: '+1/+0', M1M0: '-1/-0', P0P1: '+0/+1', M0M1: '-0/-1',
  P2P2: '+2/+2', M2M2: '-2/-2', P0P2: '+0/+2', P2P0: '+2/+0',
  LOYALTY: 'loyalty', CHARGE: 'charge', TIME: 'time', FADE: 'fade', AGE: 'age',
  QUEST: 'quest', LEVEL: 'level', POISON: 'poison', ENERGY: 'energy', EXPERIENCE: 'experience',
  KI: 'ki', LORE: 'lore', BRICK: 'brick', BLOOD: 'blood', OIL: 'oil', SHIELD: 'shield',
  STUN: 'stun', VERSE: 'verse', SPORE: 'spore', STORAGE: 'storage', MUSTER: 'muster',
  PAGE: 'page', PRESSURE: 'pressure', DEPLETION: 'depletion', DIVINITY: 'divinity',
  DOOM: 'doom', GOLD: 'gold', HEALING: 'healing', HOOFPRINT: 'hoofprint', ICE: 'ice',
  INFECTION: 'infection', INTERVENTION: 'intervention', JAVELIN: 'javelin', KEYWORD: 'keyword',
  MANIFESTATION: 'manifestation', MINING: 'mining', MIRE: 'mire', NET: 'net', OMEN: 'omen',
  ORE: 'ore', PAIN: 'pain', PETAL: 'petal', PETRIFICATION: 'petrification', PHYLACTERY: 'phylactery',
  PIN: 'pin', PLAGUE: 'plague', PLOT: 'plot', POLYP: 'polyp', PREY: 'prey', PUPA: 'pupa',
  RITUAL: 'ritual', RUST: 'rust', SCREAM: 'scream', SHELL: 'shell', SHRED: 'shred',
  SLEEP: 'sleep', SLIME: 'slime', SOOT: 'soot', STRIFE: 'strife', STUDY: 'study',
  THEFT: 'theft', TIDE: 'tide', TOWER: 'tower', TRAINING: 'training', TRAP: 'trap',
  TREASURE: 'treasure', VELOCITY: 'velocity', VITALITY: 'vitality', WAGE: 'wage',
  WINCH: 'winch', WIND: 'wind', WISH: 'wish',
};

/** `CardType.CREATURE` and friends, which our `filters.ts` spells the same way. */
export const CARD_TYPES = new Set([
  'CREATURE', 'LAND', 'ARTIFACT', 'ENCHANTMENT', 'PLANESWALKER', 'INSTANT', 'SORCERY', 'BATTLE',
]);

/**
 * `StaticFilters.FILTER_*`. Only the ones our `StaticFilters` actually has.
 * XMage declares well over a hundred; the rest block and are counted, which is
 * how the next tranche of stock filters gets chosen by evidence.
 */
export const STATIC_FILTERS = {
  FILTER_PERMANENT: 'StaticFilters.permanent()',
  FILTER_PERMANENTS: 'StaticFilters.permanent()',
  FILTER_PERMANENT_CREATURE: 'StaticFilters.creature()',
  FILTER_PERMANENT_CREATURES: 'StaticFilters.creature()',
  FILTER_PERMANENT_CREATURE_CONTROLLED: 'StaticFilters.creatureYouControl()',
  FILTER_CONTROLLED_CREATURE: 'StaticFilters.creatureYouControl()',
  FILTER_CONTROLLED_CREATURES: 'StaticFilters.creatureYouControl()',
  FILTER_PERMANENT_CREATURE_A: 'StaticFilters.creature()',
  FILTER_PERMANENT_CREATURE_ANOTHER: 'StaticFilters.anotherCreature()',
  FILTER_ANOTHER_CREATURE: 'StaticFilters.anotherCreature()',
  FILTER_OPPONENTS_PERMANENT_CREATURE: 'StaticFilters.creatureOpponentControls()',
  FILTER_CREATURE_OPPONENTS: 'StaticFilters.creatureOpponentControls()',
  FILTER_PERMANENT_ARTIFACT: 'StaticFilters.artifact()',
  FILTER_PERMANENT_ARTIFACTS: 'StaticFilters.artifact()',
  FILTER_PERMANENT_ENCHANTMENT: 'StaticFilters.enchantment()',
  FILTER_PERMANENT_ENCHANTMENTS: 'StaticFilters.enchantment()',
  FILTER_PERMANENT_PLANESWALKER: 'StaticFilters.planeswalker()',
  FILTER_PERMANENT_PLANESWALKERS: 'StaticFilters.planeswalker()',
  FILTER_LAND: 'StaticFilters.land()',
  FILTER_LANDS: 'StaticFilters.land()',
  FILTER_PERMANENT_LAND: 'StaticFilters.land()',
  FILTER_CARD: 'StaticFilters.card()',
  FILTER_CARD_CREATURE: 'StaticFilters.creatureCard()',
  FILTER_CARD_CREATURES: 'StaticFilters.creatureCard()',
  FILTER_CARD_LAND: 'StaticFilters.landCard()',
  FILTER_CARD_LANDS: 'StaticFilters.landCard()',
  FILTER_CARD_BASIC_LAND: 'StaticFilters.basicLandCard()',
  FILTER_BASIC_LAND_CARD: 'StaticFilters.basicLandCard()',
};

/* ========================================================================== *
 * 4. java.util, which becomes syntax
 * ========================================================================== */

/**
 * A native row costs no runtime code: the translation emits TypeScript. `null`
 * for a row means the shape has no clean TypeScript form (`Collection#toArray`,
 * `Stream#collect`) and it blocks like anything else.
 */
export const NATIVE = {
  'Collection#size': (r) => `${r}.length`,
  'Collection#isEmpty': (r) => `(${r}.length === 0)`,
  'Collection#add': (r, a) => `${r}.push(${a[0]})`,
  'Collection#addAll': (r, a) => `${r}.push(...${a[0]})`,
  'Collection#contains': (r, a) => `${r}.includes(${a[0]})`,
  'Collection#get': (r, a) => `${r}[${a[0]}]`,
  'Collection#getFirst': (r) => `${r}[0]`,
  'Collection#getLast': (r) => `${r}[${r}.length - 1]`,
  'Collection#indexOf': (r, a) => `${r}.indexOf(${a[0]})`,
  'Collection#clear': (r) => `(${r}.length = 0)`,
  'Collection#stream': (r) => `${r}`,
  'Collection#forEach': (r, a) => `${r}.forEach(${a[0]})`,
  'Collection#iterator': null,
  'Collection#remove': (r, a) => `${r}.splice(${r}.indexOf(${a[0]}), 1)`,
  'Collection#equals': null,
  'Collection#toArray': null,
  'Collection#removeIf': (r, a) => `(${r}.length = ${r}.filter(x => !(${a[0]})(x)).length)`,

  'Stream#filter': (r, a) => `${r}.filter(${a[0]})`,
  'Stream#map': (r, a) => `${r}.map(${a[0]})`,
  'Stream#anyMatch': (r, a) => `${r}.some(${a[0]})`,
  'Stream#allMatch': (r, a) => `${r}.every(${a[0]})`,
  'Stream#noneMatch': (r, a) => `!${r}.some(${a[0]})`,
  'Stream#count': (r) => `${r}.length`,
  'Stream#forEach': (r, a) => `${r}.forEach(${a[0]})`,
  'Stream#toList': (r) => `${r}`,
  'Stream#distinct': (r) => `[...new Set(${r})]`,
  'Stream#limit': (r, a) => `${r}.slice(0, ${a[0]})`,
  'Stream#skip': (r, a) => `${r}.slice(${a[0]})`,
  'Stream#findFirst': null,
  'Stream#collect': null,
  'Stream#sorted': null,
  'Stream#mapToInt': (r, a) => `${r}.map(${a[0]})`,
  'Stream#sum': (r) => `${r}.reduce((a: number, b: number) => a + b, 0)`,
  'Stream#max': null,
  'Stream#min': null,

  'UUID#equals': (r, a) => `(${r} === ${a[0]})`,
  'UUID#toString': (r) => `String(${r})`,

  'String#equals': (r, a) => `(${r} === ${a[0]})`,
  'String#equalsIgnoreCase': (r, a) => `(String(${r}).toLowerCase() === String(${a[0]}).toLowerCase())`,
  'String#isEmpty': (r) => `(${r}.length === 0)`,
  'String#length': (r) => `${r}.length`,
  'String#contains': (r, a) => `${r}.includes(${a[0]})`,
  'String#startsWith': (r, a) => `${r}.startsWith(${a[0]})`,
  'String#endsWith': (r, a) => `${r}.endsWith(${a[0]})`,
  'String#toLowerCase': (r) => `${r}.toLowerCase()`,
  'String#toUpperCase': (r) => `${r}.toUpperCase()`,
  'String#toString': (r) => `String(${r})`,
  'String#substring': (r, a) => `${r}.substring(${a.join(', ')})`,
  'String#trim': (r) => `${r}.trim()`,

  'Number#equals': (r, a) => `(${r} === ${a[0]})`,
  'Number#intValue': (r) => `${r}`,
  'Boolean#booleanValue': (r) => `${r}`,

  'Map#get': (r, a) => `${r}.get(${a[0]})`,
  'Map#put': (r, a) => `${r}.set(${a[0]}, ${a[1]})`,
  'Map#containsKey': (r, a) => `${r}.has(${a[0]})`,
  'Map#size': (r) => `${r}.size`,
  'Map#isEmpty': (r) => `(${r}.size === 0)`,
  'Map#keySet': (r) => `[...${r}.keys()]`,
  'Map#values': (r) => `[...${r}.values()]`,
  'Map#getOrDefault': (r, a) => `(${r}.get(${a[0]}) ?? ${a[1]})`,
  'Map#remove': (r, a) => `${r}.delete(${a[0]})`,
  'Map#entrySet': null,
  'Map#computeIfAbsent': null,
  'Map#merge': null,
};

/* ========================================================================== *
 * 5. The translator
 * ========================================================================== */

const TS_RESERVED = new Set([
  'function', 'class', 'const', 'let', 'var', 'return', 'new', 'delete', 'typeof',
  'in', 'of', 'with', 'export', 'import', 'default', 'enum', 'interface', 'type',
  'arguments', 'eval', 'null', 'true', 'false', 'this', 'super', 'await', 'yield',
]);

const safeName = n => (TS_RESERVED.has(n) ? `${n}_` : n);

/** Java integer literal suffixes are not TypeScript. */
function literal(node) {
  if (node.type === 'str') return JSON.stringify(node.v.slice(1, -1).replace(/\\(.)/g, (m, c) =>
    c === 'n' ? '\n' : c === 't' ? '\t' : c === '"' ? '"' : c === "'" ? "'" : c === '\\' ? '\\\\' : m));
  if (node.type === 'char') return JSON.stringify(node.v.slice(1, -1));
  if (node.type === 'bool' || node.type === 'null') return node.v;
  return node.v.replace(/[lLfFdD]$/, '');
}

class Blocked extends Error {
  constructor(kind, detail) {
    super(`${kind}:${detail}`);
    this.kind = kind;
    this.detail = detail;
  }
}

/**
 * Translate one method body.
 *
 * @param opts.stmts       parsed statements of the body
 * @param opts.params      [{ name, type }] of the method signature
 * @param opts.imports     single-type imports of the file
 * @param opts.pkg         the file's package
 * @param opts.selfType    fqn of the card-local class's supertype
 * @param opts.gameVar     the parameter that is the Game
 * @param opts.sourceVar   the parameter that is the Ability
 * @param opts.fields      Set of field names declared on the card-local class
 * @returns { ok, ts, blocked: [{kind, detail}], calls, mappedCalls }
 */
export function translateBody(opts) {
  const { stmts, params, imports, pkg, selfType, gameVar, sourceVar, fields, toks, lo, hi } = opts;

  const blocked = [];
  const env = collectEnv(toks, lo, hi, imports, pkg);
  const locals = new Map();          // name -> fqn, declarations we have seen
  for (const p of params) if (p.type) locals.set(p.name, resolveTypeText(p.type, imports, pkg));

  let calls = 0;
  let mapped = 0;
  const usedHelpers = new Set();

  const fail = (kind, detail) => { throw new Blocked(kind, detail); };

  /* ---------------- types ---------------- */

  function typeOf(node) {
    if (!node) return null;
    switch (node.k) {
      case 'lit':
        return node.type === 'str' ? 'String'
          : node.type === 'bool' ? 'boolean'
            : node.type === 'null' ? null : 'int';
      case 'paren': return typeOf(node.e);
      case 'this': case 'super': return selfType;
      case 'cast': return resolveTypeText(node.type.name, imports, pkg);
      case 'new': return resolveTypeText(node.type.name, imports, pkg);
      case 'name': {
        const n = node.id;
        if (locals.has(n)) return locals.get(n);
        if (env.has(n)) return env.get(n);
        if (imports[n]) return imports[n];
        if (engine.classes[`${pkg}.${n}`]) return `${pkg}.${n}`;
        if (simpleToFqn.has(n)) return simpleToFqn.get(n);
        return /^[A-Z]/.test(n) ? n : null;
      }
      case 'field': {
        const owner = typeOf(node.obj);
        return owner ? fieldType(owner, node.name, imports, pkg) : null;
      }
      case 'call': {
        if (node.obj === null) {
          const own = selfType ? lookup(selfType, node.name) : null;
          return own ? resolveTypeText(own.ret, imports, pkg) : null;
        }
        const recv = typeOf(node.obj);
        if (!recv) return null;
        const bi = builtinCall(recv, node.name);
        if (bi) return bi.ret;
        const { head } = splitGeneric(recv);
        const hit = head ? lookup(head, node.name) : null;
        return hit ? resolveTypeText(hit.ret, imports, pkg) : null;
      }
      case 'bin':
        return ['==', '!=', '<', '>', '<=', '>=', '&&', '||'].includes(node.op) ? 'boolean' : 'int';
      case 'unary': return node.op === '!' ? 'boolean' : 'int';
      case 'ternary': return typeOf(node.a) ?? typeOf(node.b);
      case 'instanceof': return 'boolean';
      case 'index': {
        const t = typeOf(node.obj);
        return t ? splitGeneric(t).arg ?? null : null;
      }
      default: return null;
    }
  }

  /** The `Root#method` key for a call node, or null when unresolvable. */
  function keyOf(node) {
    if (node.obj === null || node.obj.k === 'this' || node.obj.k === 'super') {
      const own = selfType ? lookup(selfType, node.name) : null;
      return own ? { key: `${short(own.root)}#${node.name}`, native: null, self: true } : null;
    }
    const recv = typeOf(node.obj);
    if (!recv) return null;
    const bi = builtinCall(recv, node.name);
    if (bi) return { key: bi.key, native: bi.key, self: false };
    const { head } = splitGeneric(recv);
    const hit = head ? lookup(head, node.name) : null;
    if (hit) return { key: `${short(hit.root)}#${node.name}`, native: null, self: false };
    if (head && engine.classes[head]) return { key: `${short(head)}#${node.name}`, native: null, self: false };
    return null;
  }

  /* ---------------- expressions ---------------- */

  function pickOverload(entry, arity) {
    if (!entry) return null;
    if (!Array.isArray(entry)) return entry;
    return entry.find(e => e.arity === arity) ?? null;
  }

  function expr(node) {
    switch (node.k) {
      case 'lit': return literal(node);
      case 'paren': return `(${expr(node.e)})`;
      case 'cast': return cast(node);
      case 'name': return nameRef(node.id);
      case 'field': return fieldRef(node);
      case 'call': return callRef(node);
      case 'new': return newRef(node);
      case 'unary': return `${node.op}${expr(node.arg)}`;
      case 'postfix': return `${expr(node.arg)}${node.op}`;
      case 'assign': return `${expr(node.l)} ${node.op} ${expr(node.r)}`;
      case 'ternary': return `(${expr(node.c)} ? ${expr(node.a)} : ${expr(node.b)})`;
      case 'bin': return binary(node);
      case 'index': return `${expr(node.obj)}[${expr(node.idx)}]`;
      case 'lambda': return lambda(node);
      case 'arrayinit': return `[${node.items.map(expr).join(', ')}]`;
      case 'this': case 'super': return fail('this-as-value', 'the effect object itself');
      case 'instanceof': return fail('instanceof', node.type?.name ?? '?');
      case 'mref': return fail('method-reference', `${node.name}`);
      case 'ctorcall': return fail('ctor-delegation', node.which);
      case 'newarray': return node.init ? `[${node.init.items.map(expr).join(', ')}]` : `[]`;
      case 'opaque': return fail('syntax', node.what);
      default: return fail('expression', node.k);
    }
  }

  /*
   * Java's cast is erased at runtime except for the boxes, which is the case
   * that matters here: `(Integer) getValue("amount")` is how an XMage effect
   * reads its own bag back, and the value arrives as `unknown` in TypeScript.
   * Turning it into `Number(...)` keeps the body typechecking and says the same
   * thing. Every other cast is dropped, exactly as Java drops it.
   */
  function cast(node) {
    const simple = node.type.name.split('.').pop();
    const inner = expr(node.arg);
    if (['Integer', 'int', 'Long', 'long', 'Double', 'double', 'Short', 'Byte'].includes(simple)) return `Number(${inner})`;
    if (simple === 'String') return `String(${inner})`;
    if (['Boolean', 'boolean'].includes(simple)) return `Boolean(${inner})`;
    return inner;
  }

  /** True when a Java type is compared by VALUE, so `===` means what `==` meant. */
  function comparableByValue(t) {
    if (t === null) return true;
    const { head } = splitGeneric(String(t));
    const simple = head?.split('.').pop();
    if (['int', 'long', 'short', 'byte', 'double', 'float', 'boolean', 'char',
      'Integer', 'Long', 'Double', 'Boolean', 'Character', 'String', 'UUID'].includes(simple)) return true;
    // An enum constant is one object, so identity IS value. Our translation
    // turns those constants into strings, where `===` is also value.
    return !!engine.enums?.[head];
  }

  function binary(node) {
    const op = node.op === '==' ? '===' : node.op === '!=' ? '!==' : node.op;
    // Java `==` on two object references is identity. Our facades are built
    // fresh on every read, so two facades for the same permanent are different
    // objects and `===` would answer false where Java answers true. Comparing
    // against `null` is the only safe case, plus primitives.
    if (node.op === '==' || node.op === '!=') {
      const isNull = n => n.k === 'lit' && n.type === 'null';
      if (!isNull(node.l) && !isNull(node.r)) {
        const lt = typeOf(node.l);
        const rt = typeOf(node.r);
        if (!(comparableByValue(lt) && comparableByValue(rt))) {
          fail('object-identity', `${short(lt ?? '?')} ${node.op} ${short(rt ?? '?')}`);
        }
      }
    }
    if (node.op === '+') {
      // Java string concatenation of an object calls toString. Ours would print
      // "[object Object]". Only allow it when both sides are numbers or strings.
      const ok = t => t === null || ['int', 'long', 'double', 'String', 'char'].includes(String(t));
      if (!(ok(typeOf(node.l)) && ok(typeOf(node.r)))) fail('string-concat', 'object in a + expression');
    }
    return `${expr(node.l)} ${op} ${expr(node.r)}`;
  }

  function lambda(node) {
    if (node.bodyKind !== 'expr') fail('lambda-block', 'statement-bodied lambda');
    const ps = node.params.map(safeName);
    for (const p of ps) locals.set(p, null);
    return `(${ps.join(', ')}) => ${expr(node.body)}`;
  }

  function nameRef(id) {
    if (id === gameVar) return 'game';
    if (id === sourceVar) return 'source';
    if (locals.has(id) || env.has(id)) return safeName(id);
    // `outcome` is inherited from `OneShotEffect` and is XMage's hint to its own
    // AI about whether an effect helps you. It carries no rules meaning, this
    // engine has no counterpart, and every `Outcome.*` constant is dropped for
    // the same reason, so the inherited field is dropped too.
    if (id === 'outcome' && !fields.has(id)) return "''";
    if (fields.has(id)) fail('field', id);
    if (/^[A-Z]/.test(id)) fail('class-reference', id);
    fail('free-name', id);
  }

  function fieldRef(node) {
    // A static constant on a class: `Zone.BATTLEFIELD`, `CounterType.P1P1`.
    if (node.obj.k === 'name' && /^[A-Z]/.test(node.obj.id)) {
      const owner = node.obj.id;
      const c = constant(owner, node.name);
      if (c !== undefined) return c;
      fail('constant', `${owner}.${node.name}`);
    }
    if (node.obj.k === 'name' && node.obj.id === 'this') fail('field', node.name);
    fail('field-access', node.name);
  }

  function constant(owner, name) {
    if (owner === 'Zone') return ZONES[name] ?? undefined;
    if (owner === 'Outcome') return "''";                 // AI hint, dropped
    if (owner === 'CounterType') {
      const c = COUNTERS[name];
      return c === undefined ? undefined : `CounterType.of(${JSON.stringify(c)})`;
    }
    if (owner === 'CardType') {
      if (!CARD_TYPES.has(name)) return undefined;
      usedHelpers.add('CardType');
      return `CardType.${name}`;
    }
    if (owner === 'SuperType') {
      if (name === 'LEGENDARY' || name === 'BASIC') { usedHelpers.add('SuperType'); return `SuperType.${name}`; }
      return undefined;
    }
    if (owner === 'SubType') { usedHelpers.add('SubType'); return `SubType.of(${JSON.stringify(name.toLowerCase())})`; }
    if (owner === 'StaticFilters') {
      const f = STATIC_FILTERS[name];
      if (f) { usedHelpers.add('StaticFilters'); return f; }
      return undefined;
    }
    if (owner === 'Integer' && name === 'MAX_VALUE') return 'Number.MAX_SAFE_INTEGER';
    if (owner === 'Integer' && name === 'MIN_VALUE') return 'Number.MIN_SAFE_INTEGER';
    return undefined;
  }

  function callRef(node) {
    calls++;
    const info = keyOf(node);
    if (!info) fail('unresolved-receiver', `.${node.name}()`);

    const args = node.args.map(expr);
    const arity = node.args.length;

    // java.util becomes syntax.
    if (info.native) {
      const n = NATIVE[info.native];
      if (n === undefined) fail('native-missing', info.native);
      if (n === null) fail('native-unmappable', info.native);
      mapped++;
      return n(receiver(node), args);
    }

    const rw = pickOverload(REWRITES[info.key], arity);
    if (rw) { mapped++; return rw.emit(receiver(node), args); }

    const spec = pickOverload(METHODS[info.key], arity);
    if (!spec) {
      // The distinction the report is built on: a method the runtime HAS but
      // whose argument list this table does not describe is a different job
      // from a method the runtime does not have at all.
      const hasAny = METHODS[info.key] !== undefined || REWRITES[info.key] !== undefined;
      fail(hasAny ? 'arity' : 'method', hasAny ? `${info.key}/${arity}` : info.key);
    }

    const take = spec.take === 'all' ? node.args.map((_, i) => i) : spec.take;
    const out = [];
    for (const t of take) {
      if (t === 'game') { out.push('game'); continue; }
      if (t === 'source') { out.push('source'); continue; }
      if (t === 'undefined') { out.push('undefined'); continue; }
      if (spec.lit && spec.lit[t] !== undefined) { out.push(spec.lit[t]); continue; }
      if (args[t] === undefined) fail('arity', `${info.key}/${arity}`);
      out.push(args[t]);
    }
    if (spec.fixed) out.unshift(...spec.fixed);

    mapped++;
    return `${receiver(node)}.${spec.ts}(${out.join(', ')})`;
  }

  function receiver(node) {
    if (node.obj === null || node.obj.k === 'this' || node.obj.k === 'super') {
      // An unqualified or `this.` call inside a card-local Effect is a call on
      // the effect itself. In this engine the things a body actually asks an
      // effect for — its target pointer above all — live on the Ability, so
      // `this` translates to `source`. `Effect#getValue` is the one exception
      // and it is a REWRITE, which never reaches here.
      return 'source';
    }
    return expr(node.obj);
  }

  function newRef(node) {
    const simple = node.type.name.split('.').pop();
    const build = NEW[simple];
    if (!build) fail('new', simple);
    const args = node.args.map(expr);
    if (simple === 'TargetPermanent' || simple.startsWith('Target') || simple === 'CardsImpl') {
      usedHelpers.add('scope');
    }
    return build(args);
  }

  /* ---------------- statements ---------------- */

  function reparse(headToks) {
    // A control-flow head is kept as an opaque token slice by the parser, so it
    // is re-parsed here rather than pattern-matched. `headToks` includes the
    // outer parentheses.
    const inner = headToks.slice(1, -1);
    inner.push({ t: 'eof', v: '', p: 0, line: 0 });
    return inner;
  }

  function headExpression(headToks) {
    const p = new JavaParser(reparse(headToks));
    const e = p.parseExpression();
    if (p.cur.t !== 'eof') fail('syntax', 'control head');
    return e;
  }

  function stmt(node, indent) {
    const pad = '  '.repeat(indent);
    switch (node.k) {
      case 'empty': return '';
      case 'block': return `${pad}{\n${node.stmts.map(s => stmt(s, indent + 1)).filter(Boolean).join('\n')}\n${pad}}`;
      case 'decl': {
        const t = resolveTypeText(node.type.name, imports, pkg);
        const lines = [];
        for (const v of node.vars) {
          locals.set(v.name, t);
          const init = v.init ? expr(v.init) : 'undefined';
          lines.push(`${pad}let ${safeName(v.name)} = ${init};`);
        }
        return lines.join('\n');
      }
      case 'expr': return `${pad}${expr(node.e)};`;
      case 'return': return `${pad}return ${node.e ? expr(node.e) : 'false'};`;
      case 'break': return node.label ? fail('labelled-break', node.label) : `${pad}break;`;
      case 'continue': return node.label ? fail('labelled-continue', node.label) : `${pad}continue;`;
      case 'throw': return fail('throw', 'throw statement');
      case 'try': return fail('try', 'try statement');
      case 'yield': return fail('yield', 'yield');
      case 'opaqueStmt': return fail('syntax', node.what);
      case 'control': return control(node, indent);
      default: return fail('statement', node.k);
    }
  }

  function control(node, indent) {
    const pad = '  '.repeat(indent);
    if (node.kw === 'if') {
      const c = expr(headExpression(node.head));
      const body = stmt(node.body, indent + 1);
      let out = `${pad}if (${c}) {\n${body}\n${pad}}`;
      if (node.elseBody) out += ` else {\n${stmt(node.elseBody, indent + 1)}\n${pad}}`;
      return out;
    }
    if (node.kw === 'while') {
      const c = expr(headExpression(node.head));
      return `${pad}while (${c}) {\n${stmt(node.body, indent + 1)}\n${pad}}`;
    }
    if (node.kw === 'for') return forStatement(node, indent);
    fail('control', node.kw);
  }

  function forStatement(node, indent) {
    const pad = '  '.repeat(indent);
    const inner = node.head.slice(1, -1);

    // Enhanced for: `Type name : collection`. Find the `:` at depth zero. A
    // ternary inside the collection expression also has a `:`, which is why the
    // scan tracks `?` as well as brackets.
    let depth = 0;
    let q = 0;
    let colon = -1;
    for (let i = 0; i < inner.length; i++) {
      const v = inner[i].v;
      if (v === '(' || v === '[' || v === '{') depth++;
      else if (v === ')' || v === ']' || v === '}') depth--;
      else if (depth === 0 && v === '?') q++;
      else if (depth === 0 && v === ':') { if (q > 0) q--; else { colon = i; break; } }
    }

    if (colon !== -1) {
      const head = inner.slice(0, colon);
      const varName = head[head.length - 1];
      if (varName?.t !== 'id') fail('syntax', 'for-each variable');
      const typeToks = head.slice(0, head.length - 1);
      const typeText = typeToks.filter(t => t.t === 'id' || t.v === '.').map(t => t.v).join('');
      const iterToks = [...inner.slice(colon + 1), { t: 'eof', v: '', p: 0, line: 0 }];
      const p = new JavaParser(iterToks);
      const iterNode = p.parseExpression();
      const iterType = typeOf(iterNode);
      const iterTs = iterable(iterNode, iterType);
      locals.set(varName.v, resolveTypeText(typeText, imports, pkg));
      return `${pad}for (const ${safeName(varName.v)} of ${iterTs}) {\n${stmt(node.body, indent + 1)}\n${pad}}`;
    }

    // Classic `for (init; cond; update)`.
    const parts = [[], [], []];
    let slot = 0;
    depth = 0;
    for (const t of inner) {
      if (t.v === '(' || t.v === '[') depth++;
      else if (t.v === ')' || t.v === ']') depth--;
      if (depth === 0 && t.v === ';') { slot++; if (slot > 2) fail('syntax', 'for header'); continue; }
      parts[slot].push(t);
    }
    const parseOne = (toksIn, kind) => {
      if (!toksIn.length) return '';
      const withEof = [...toksIn, { t: 'punc', v: ';', p: 0, line: 0 }, { t: 'eof', v: '', p: 0, line: 0 }];
      const p = new JavaParser(withEof);
      if (kind === 'init') {
        const d = p.tryLocalDecl();
        if (d) {
          const t = resolveTypeText(d.type.name, imports, pkg);
          return d.vars.map(v => {
            locals.set(v.name, t);
            return `let ${safeName(v.name)} = ${v.init ? expr(v.init) : 'undefined'}`;
          }).join(', ');
        }
      }
      return expr(p.parseExpression());
    };
    const init = parseOne(parts[0], 'init');
    const cond = parts[1].length ? expr(new JavaParser([...parts[1], { t: 'eof', v: '', p: 0, line: 0 }]).parseExpression()) : '';
    const upd = parts[2].length ? expr(new JavaParser([...parts[2], { t: 'eof', v: '', p: 0, line: 0 }]).parseExpression()) : '';
    return `${pad}for (${init}; ${cond}; ${upd}) {\n${stmt(node.body, indent + 1)}\n${pad}}`;
  }

  /** `for (Card c : cards)` where `cards` is our `XCards`, not an array. */
  function iterable(node, javaType) {
    const ts = expr(node);
    const { head } = splitGeneric(javaType ?? '');
    const simple = head?.split('.').pop();
    if (simple === 'Cards' || simple === 'CardsImpl' || simple === 'Graveyard' || simple === 'Library') {
      return `${ts}.getCards()`;
    }
    return ts;
  }

  /* ---------------- run it ---------------- */

  let ts;
  try {
    const lines = stmts.map(s => stmt(s, 2)).filter(Boolean);
    ts = lines.join('\n');
  } catch (e) {
    if (e instanceof Blocked) return { ok: false, blocked: [{ kind: e.kind, detail: e.detail }], calls, mapped };
    if (e instanceof ParseError) return { ok: false, blocked: [{ kind: 'parse', detail: e.message.slice(0, 60) }], calls, mapped };
    return { ok: false, blocked: [{ kind: 'internal', detail: String(e.message).slice(0, 80) }], calls, mapped };
  }

  return { ok: true, ts, blocked, calls, mapped, helpers: [...usedHelpers] };
}
