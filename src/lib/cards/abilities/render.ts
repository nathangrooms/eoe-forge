/**
 * DSL -> English. The inverse direction, and the only honest way to check a
 * compiler you did not write.
 *
 * ## Why this exists
 *
 * Schema validation proves a `CardAbilities` is well-formed. It cannot prove it
 * is *right*. `{do:'draw', who:{who:'you'}, count:7}` on a card that draws one
 * is perfectly well-formed and would silently hand a player six extra cards
 * every game. The only check that catches that class of error is to say the DSL
 * back in words and compare the words to the oracle text the card actually has.
 *
 * So this renderer is not a UI feature that happens to be useful for testing.
 * It is a **measuring instrument**, and it is written to a different standard
 * than prose would be:
 *
 *   - **Every semantic commitment must appear.** If the DSL says
 *     `duration:'end-of-turn'`, the words "until end of turn" come out. A
 *     renderer that prettifies by omitting a field makes the round-trip check
 *     blind to that field, which is worse than not checking at all — it would
 *     report a pass over a thing it never looked at.
 *   - **Nothing may be added.** No connective flavour, no implied wording. A
 *     word this file invents is a word the comparison will hunt for in the
 *     oracle text and fail to find, producing a false rejection.
 *   - **Vocabulary is oracle vocabulary.** "put a +1/+1 counter on", not "add a
 *     counter to". The comparison is lexical, so a synonym is a mismatch.
 *
 * It is deliberately NOT grammatical English. Articles, agreement and comma
 * placement are all stripped by the comparison anyway, and chasing them would
 * trade measurement accuracy for prose that nothing reads.
 */

import type {
  Ability,
  CardFilter,
  Condition,
  Cost,
  Duration,
  Effect,
  Modification,
  PlayerSelector,
  ReplaceableEvent,
  ReplacementResult,
  Restriction,
  Selector,
  Step,
  TargetSpec,
  TokenSpec,
  TriggerEvent,
  ValueExpr,
  WatchQuery,
  WatchedEvent,
  Zone,
} from './dsl.ts';
import { assertNever } from './dsl.ts';

const join = (parts: Array<string | undefined | null>, sep = ' '): string =>
  parts.filter((p): p is string => Boolean(p && p.trim())).join(sep).replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------------------ *
 * Values
 * ------------------------------------------------------------------ */

export function renderValue(value: ValueExpr): string {
  if (typeof value === 'number') return String(value);
  switch (value.v) {
    case 'x': return 'X';
    case 'count': return `the number of ${renderSelector(value.of)}`;
    case 'count-players': return `the number of ${renderPlayer(value.of)}`;
    case 'power': return `the power of ${renderSelector(value.of)}`;
    case 'toughness': return `the toughness of ${renderSelector(value.of)}`;
    case 'mana-value': return `the mana value of ${renderSelector(value.of)}`;
    case 'counters': return `the number of ${value.counter} counters on ${renderSelector(value.of)}`;
    case 'life': return `the life total of ${renderPlayer(value.of)}`;
    case 'cards-in': return `the number of cards in ${renderPlayer(value.of)} ${value.zone}`;
    case 'add': return value.of.map(renderValue).join(' plus ');
    case 'sub': return `${renderValue(value.a)} minus ${renderValue(value.b)}`;
    case 'mul': return value.of.map(renderValue).join(' times ');
    case 'div': return `${renderValue(value.a)} divided by ${renderValue(value.b)}`;
    case 'min': return `the least of ${value.of.map(renderValue).join(' and ')}`;
    case 'max': return `the greatest of ${value.of.map(renderValue).join(' and ')}`;
    case 'if':
      return `${renderValue(value.then)} if ${renderCondition(value.condition)}, otherwise ${renderValue(value.else)}`;
    case 'watch': return renderWatch(value.query);
    default: return assertNever(value);
  }
}

function renderWatch(query: WatchQuery): string {
  const window = query.window === 'this-turn' ? 'this turn' : 'this game';
  const measure = query.measure === 'amount' ? 'the total' : 'the number of';
  return `${measure} ${renderWatchedEvent(query.event)} ${window}`;
}

function renderWatchedEvent(event: WatchedEvent): string {
  switch (event.saw) {
    case 'spell-cast': return join([event.what ? renderFilter(event.what) : 'spells', 'cast', event.by && `by ${renderPlayer(event.by)}`]);
    case 'land-played': return join(['lands played', event.by && `by ${renderPlayer(event.by)}`]);
    case 'died': return join([event.what ? renderFilter(event.what) : 'creatures', event.controller && `${renderPlayer(event.controller)} controlled`, 'that died']);
    case 'entered': return join([event.what ? renderFilter(event.what) : 'permanents', event.controller && `${renderPlayer(event.controller)} controlled`, 'that entered']);
    case 'attacked': return join([event.what ? renderFilter(event.what) : 'creatures', event.controller && `${renderPlayer(event.controller)} controlled`, 'that attacked']);
    case 'token-created': return join(['tokens created', event.by && `by ${renderPlayer(event.by)}`]);
    case 'drew': return join(['cards drawn', event.by && `by ${renderPlayer(event.by)}`]);
    case 'gained-life': return join(['life gained', event.by && `by ${renderPlayer(event.by)}`]);
    case 'lost-life': return join(['life lost', event.by && `by ${renderPlayer(event.by)}`]);
    case 'dealt-damage': return join(['damage dealt', event.by && `by ${renderPlayer(event.by)}`, event.to && event.to !== 'any' && `to a ${event.to}`]);
    default: return assertNever(event);
  }
}

/* ------------------------------------------------------------------ *
 * Filters, selectors, players
 * ------------------------------------------------------------------ */

export function renderFilter(filter: CardFilter): string {
  switch (filter.is) {
    case 'type': case 'subtype': case 'supertype': return filter.value.toLowerCase();
    case 'name': return filter.value;
    case 'keyword': return `with ${filter.value.toLowerCase()}`;
    case 'color': return ({ W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green', C: 'colorless' })[filter.value];
    case 'colorless': return 'colorless';
    case 'multicolored': return 'multicolored';
    case 'tapped': return 'tapped';
    case 'untapped': return 'untapped';
    case 'attacking': return 'attacking';
    case 'blocking': return 'blocking';
    case 'blocked': return 'blocked';
    case 'token': return 'token';
    case 'commander': return 'commander';
    case 'other': return 'other';
    case 'any': return ''; // oracle text writes no word for "any permanent"
    case 'has-counter':
      return `with ${filter.atLeast !== undefined ? `${filter.atLeast} or more ` : 'a '}${filter.counter} counter`;
    case 'power': return `with power ${renderCmp(filter.cmp)} ${renderValue(filter.value)}`;
    case 'toughness': return `with toughness ${renderCmp(filter.cmp)} ${renderValue(filter.value)}`;
    case 'mana-value': return `with mana value ${renderCmp(filter.cmp)} ${renderValue(filter.value)}`;
    case 'not': return `non-${renderFilter(filter.of)}`;
    case 'and': return filter.of.map(renderFilter).join(' ');
    case 'or': return filter.of.map(renderFilter).join(' or ');
    default: return assertNever(filter);
  }
}

function renderCmp(cmp: string): string {
  switch (cmp) {
    case 'lt': return 'less than';
    case 'lte': return 'less than or equal to';
    case 'eq': return 'equal to';
    case 'gte': return 'greater than or equal to';
    case 'gt': return 'greater than';
    case 'ne': return 'not equal to';
    default: return cmp;
  }
}

export function renderSelector(selector: Selector): string {
  switch (selector.sel) {
    case 'self': return 'this permanent';
    case 'none': return 'nothing';
    case 'each': return 'each';
    case 'target': return 'target';
    case 'trigger-source': return 'that permanent';
    case 'trigger-subject': return 'that creature';
    case 'attached': return 'enchanted permanent';
    case 'all': {
      // No leading quantifier. Oracle text writes "creatures you control", not
      // "each creature you control", and the ones that do write "all" are not
      // distinguishable here from the ones that do not.
      //
      // Off the battlefield an object is a CARD and its holder is named with a
      // possessive: "target artifact card in your graveyard", never "artifact
      // you control in graveyard". Both differences showed up in calibration as
      // a dropped "card" and an invented "control" on the same cards.
      const elsewhere = selector.zone !== undefined && CARD_ZONES.has(selector.zone);
      return join([
        renderFilter(selector.where),
        elsewhere ? 'cards' : undefined,
        selector.controller
          ? (elsewhere ? possessive(selector.controller) : `${renderPlayer(selector.controller)} controls`)
          : undefined,
        elsewhere ? `in ${zoneWords(selector.zone!)}` : undefined,
      ]);
    }
    default: return assertNever(selector);
  }
}

/** "your graveyard", "each opponent's hand" — possession, not control. */
function possessive(player: PlayerSelector): string {
  return player.who === 'you' ? 'your' : `${renderPlayer(player)}s`;
}

export function renderPlayer(player: PlayerSelector): string {
  switch (player.who) {
    case 'you': return 'you';
    case 'each-opponent': return 'each opponent';
    case 'each-player': return 'each player';
    case 'active': return 'active player';
    case 'defending': return 'defending player';
    case 'monarch': return 'the monarch';
    case 'trigger-player': return 'that player';
    case 'target-player': return 'target player';
    case 'controller-of': return `controller of ${renderSelector(player.of)}`;
    case 'owner-of': return `owner of ${renderSelector(player.of)}`;
    default: return assertNever(player);
  }
}

/* ------------------------------------------------------------------ *
 * Conditions
 * ------------------------------------------------------------------ */

export function renderCondition(condition: Condition): string {
  switch (condition.if) {
    case 'count':
      return `the number of ${renderSelector(condition.of)} is ${renderCmp(condition.cmp)} ${renderValue(condition.value)}`;
    case 'value':
      return `${renderValue(condition.a)} is ${renderCmp(condition.cmp)} ${renderValue(condition.b)}`;
    case 'controls':
      return `${renderPlayer(condition.who)} controls ${renderCmp(condition.cmp)} ${renderValue(condition.value)} ${renderFilter(condition.what)}`;
    case 'matches':
      return `${renderSelector(condition.of)} is ${renderFilter(condition.what)}`;
    case 'step': return `during ${condition.is.map(renderStep).join(' or ')}`;
    case 'your-turn': return 'it is your turn';
    case 'first-time-this-turn': return 'this is the first time this turn';
    case 'not': return `it is not the case that ${renderCondition(condition.of)}`;
    case 'and': return condition.of.map(renderCondition).join(' and ');
    case 'or': return condition.of.map(renderCondition).join(' or ');
    default: return assertNever(condition);
  }
}

function renderStep(step: Step): string {
  return ({
    untap: 'the untap step',
    upkeep: 'the upkeep',
    draw: 'the draw step',
    precombat_main: 'the precombat main phase',
    begin_combat: 'the beginning of combat',
    declare_attackers: 'the declare attackers step',
    declare_blockers: 'the declare blockers step',
    combat_damage: 'the combat damage step',
    end_combat: 'the end of combat',
    postcombat_main: 'the postcombat main phase',
    end: 'the end step',
    cleanup: 'the cleanup step',
  } as Record<Step, string>)[step];
}

function renderDuration(duration: Duration): string {
  switch (duration) {
    case 'end-of-turn': return 'until end of turn';
    case 'your-next-turn': return 'until your next turn';
    case 'while-source-on-battlefield': return 'for as long as this permanent remains on the battlefield';
    case 'permanent': return '';
    default: return assertNever(duration);
  }
}

/**
 * Zones where an object is a CARD and oracle text calls it one. The stack is
 * pointedly not among them: "counter target spell" never says "card", and
 * emitting one there invented the word on 80 of 2,000 known-good cards.
 */
const CARD_ZONES = new Set<Zone>(['library', 'graveyard', 'hand', 'exile', 'command']);

const zoneWords = (zone: Zone): string =>
  zone === 'library' ? 'library'
    : zone === 'graveyard' ? 'graveyard'
    : zone === 'battlefield' ? 'the battlefield'
    : zone === 'hand' ? 'hand'
    : zone === 'exile' ? 'exile'
    : zone === 'command' ? 'the command zone'
    : 'the stack';

/* ------------------------------------------------------------------ *
 * Effects
 * ------------------------------------------------------------------ */

export function renderEffect(effect: Effect): string {
  switch (effect.do) {
    case 'gain-life': return `${renderPlayer(effect.who)} gains ${renderValue(effect.amount)} life`;
    case 'lose-life': return `${renderPlayer(effect.who)} loses ${renderValue(effect.amount)} life`;
    case 'set-life': return `${renderPlayer(effect.who)} life total becomes ${renderValue(effect.amount)}`;
    case 'damage': {
      const to = 'sel' in effect.to ? renderSelector(effect.to) : renderPlayer(effect.to);
      return `deals ${renderValue(effect.amount)} damage to ${to}`;
    }
    case 'poison': return `${renderPlayer(effect.who)} gets ${renderValue(effect.amount)} poison counters`;
    case 'draw': return `${renderPlayer(effect.who)} draws ${renderValue(effect.count)} cards`;
    case 'mill': return `${renderPlayer(effect.who)} mills ${renderValue(effect.count)} cards`;
    case 'discard':
      return join([renderPlayer(effect.who), 'discards', renderValue(effect.count), 'cards', effect.random && 'at random']);
    case 'move-zone':
      return join([
        // "Return target permanent to its owner's hand" is the oracle wording for
        // a move to hand; "put into hand" is not a phrase Wizards uses.
        effect.to === 'hand' ? 'return' : 'put', renderSelector(effect.what),
        effect.to === 'hand' ? 'to hand' : `into ${zoneWords(effect.to)}`,
        effect.position === 'top' ? 'on top' : effect.position === 'bottom' ? 'on the bottom' : undefined,
        effect.tapped && 'tapped',
      ]);
    case 'destroy': return `destroy ${renderSelector(effect.what)}`;
    case 'sacrifice': return `${renderPlayer(effect.who)} sacrifices ${renderValue(effect.count)} ${renderSelector(effect.what)}`;
    case 'exile': return `exile ${renderSelector(effect.what)}`;
    case 'return-from':
      return `${renderPlayer(effect.who)} returns ${renderValue(effect.count)} ${renderSelector(effect.what)} from ${zoneWords(effect.zone)} to ${zoneWords(effect.to)}`;
    case 'search-library':
      return join([
        renderPlayer(effect.who), 'searches library for', renderValue(effect.count),
        // The thing found in a library is a card, whatever the selector's zone says.
        renderSelector(effect.what), effect.what.sel === 'all' && effect.what.zone === undefined ? 'card' : undefined,
        `put into ${zoneWords(effect.to)}`, effect.tapped && 'tapped', effect.thenShuffle && 'then shuffle',
      ]);
    case 'shuffle': return `${renderPlayer(effect.who)} shuffles`;
    case 'create-token':
      return join([
        renderPlayer(effect.who), 'creates', renderValue(effect.count), renderToken(effect.token), 'token',
        effect.tapped && 'tapped',
      ]);
    case 'tap': return `tap ${renderSelector(effect.what)}`;
    case 'untap': return `untap ${renderSelector(effect.what)}`;
    case 'add-counters':
      return `put ${renderValue(effect.count)} ${effect.counter} counters on ${renderSelector(effect.what)}`;
    case 'remove-counters':
      return `remove ${renderValue(effect.count)} ${effect.counter} counters from ${renderSelector(effect.what)}`;
    case 'pump':
      return join([
        renderSelector(effect.what), 'gets', signed(effect.power) + '/' + signed(effect.toughness),
        effect.grant?.length ? `and gains ${effect.grant.join(' and ').toLowerCase()}` : undefined,
        renderDuration(effect.duration),
      ]);
    case 'gain-control':
      return join([renderPlayer(effect.who), 'gains control of', renderSelector(effect.what), renderDuration(effect.duration)]);
    // "Attach this permanent to target creature you control" — the oracle
    // wording of equip (CR 702.6a), and of an Aura entering attached to what it
    // was cast at.
    case 'attach':
      return effect.to.sel === 'none'
        ? `unattach ${renderSelector(effect.what)}`
        : `attach ${renderSelector(effect.what)} to ${renderSelector(effect.to)}`;
    case 'add-mana':
      return join([
        renderPlayer(effect.who), 'adds', effect.mana,
        effect.count !== undefined ? `for each ${renderValue(effect.count)}` : undefined,
        effect.restriction ? renderRestrictionText(effect.restriction.spendOn, effect.restriction.what) : undefined,
      ]);
    case 'player-counter':
      return `${renderPlayer(effect.who)} gets ${renderValue(effect.count)} ${effect.counter} counters`;
    case 'set-monarch': return `${renderPlayer(effect.who)} becomes the monarch`;
    case 'lose-game': return `${renderPlayer(effect.who)} loses the game`;
    case 'win-game': return `${renderPlayer(effect.who)} wins the game`;
    case 'counter': return `counter ${renderSelector(effect.what)}`;
    case 'unless-pays':
      return `${renderEffects(effect.effects)} unless ${renderPlayer(effect.who)} pays ${effect.cost.map(renderCost).join(' and ')}`;
    case 'if':
      return join([
        'if', renderCondition(effect.condition), ',', renderEffects(effect.then),
        effect.else?.length ? `otherwise ${renderEffects(effect.else)}` : undefined,
      ]);
    case 'for-each': {
      const over = 'sel' in effect.over ? renderSelector(effect.over) : renderPlayer(effect.over);
      return `for each ${over} ${renderEffects(effect.effects)}`;
    }
    case 'repeat': return `${renderValue(effect.times)} times ${renderEffects(effect.effects)}`;
    case 'choose-mode':
      return join([
        'choose', renderValue(effect.min) === renderValue(effect.max)
          ? renderValue(effect.min)
          : `up to ${renderValue(effect.max)}`,
        '-', effect.modes.map((m) => renderEffects(m.effects)).join(' ; '),
      ]);
    case 'may': return `${renderPlayer(effect.who)} may ${renderEffects(effect.effects)}`;
    case 'manual': return effect.text;
    /* There is nothing to render. The body is imperative Java translated by
     * machine and it carries no words of its own, so what comes back names the
     * XMage class and says plainly that this is a pointer. Inventing a sentence
     * here would be this file guessing at behaviour it cannot read, and
     * `roundtrip.ts` compares what this returns against the printed card. */
    case 'xmage-body': return `[xmage body ${effect.key}]`;
    default: return assertNever(effect);
  }
}

/** `pump` prints its numbers signed, because "+2/+2" and "2/2" are different cards. */
function signed(value: ValueExpr): string {
  if (typeof value === 'number') return value >= 0 ? `+${value}` : String(value);
  return `+${renderValue(value)}`;
}

/**
 * Tokens Wizards names without describing. Oracle text says "create a Treasure
 * token", never "create a colorless Treasure artifact token", so rendering the
 * type line for these invents words the card does not have.
 */
const PREDEFINED_TOKENS = new Set([
  'treasure', 'food', 'clue', 'blood', 'map', 'powerstone', 'incubator', 'gold',
  'junk', 'shard', 'walker', 'role', 'lander',
]);

function renderToken(token: TokenSpec): string {
  if (PREDEFINED_TOKENS.has(token.name.trim().toLowerCase())) return token.name.toLowerCase();
  return join([
    token.power !== undefined && token.toughness !== undefined ? `${token.power}/${token.toughness}` : undefined,
    token.colorIdentity?.length ? token.colorIdentity.map((c) => renderFilter({ is: 'color', value: c })).join(' and ') : undefined,
    token.typeLine ? token.typeLine.toLowerCase() : token.name,
    token.keywords?.length ? `with ${token.keywords.join(' and ').toLowerCase()}` : undefined,
  ]);
}

function renderRestrictionText(spendOn: string, what?: CardFilter): string {
  const kind = spendOn === 'cast' ? 'cast' : spendOn === 'activate' ? 'activate abilities' : 'cast or activate';
  return join(['spend this mana only to', kind, what && renderFilter(what), what && 'spells']);
}

export function renderEffects(effects: readonly Effect[]): string {
  return effects.map(renderEffect).join('. ');
}

/* ------------------------------------------------------------------ *
 * Costs
 * ------------------------------------------------------------------ */

export function renderCost(cost: Cost): string {
  switch (cost.pay) {
    case 'mana': return cost.cost;
    // Oracle text spells these as symbols, never as words. Rendering them as
    // "tap this permanent" made every tap ability read as an invented verb and a
    // dropped {T} at once — one difference counted twice, both times wrongly.
    case 'tap': return '{T}';
    case 'untap': return '{Q}';
    case 'tap-others': return `tap ${renderValue(cost.count)} ${renderSelector(cost.what)}`;
    case 'sacrifice': return `sacrifice ${renderValue(cost.count)} ${renderSelector(cost.what)}`;
    case 'discard': return join(['discard', renderValue(cost.count), cost.what && renderSelector(cost.what), 'cards', cost.random && 'at random']);
    case 'exile': return `exile ${renderValue(cost.count)} ${renderSelector(cost.what)} from ${zoneWords(cost.from)}`;
    case 'life': return `pay ${renderValue(cost.amount)} life`;
    case 'remove-counters':
      return join(['remove', renderValue(cost.count), cost.counter, 'counters from', cost.from && renderSelector(cost.from)]);
    case 'add-counters':
      return join(['put', renderValue(cost.count), cost.counter, 'counters on', cost.to && renderSelector(cost.to)]);
    case 'return-to-hand': return `return ${renderValue(cost.count)} ${renderSelector(cost.what)} to hand`;
    case 'reveal': return `reveal ${renderValue(cost.count)} ${renderSelector(cost.what)}`;
    default: return assertNever(cost);
  }
}

/* ------------------------------------------------------------------ *
 * Continuous modifications
 * ------------------------------------------------------------------ */

export function renderModification(modification: Modification): string {
  switch (modification.layer) {
    case 'control': return `${renderPlayer(modification.newController)} controls`;
    case 'type':
      return join([
        modification.addTypes?.length ? `is also ${modification.addTypes.join(' and ').toLowerCase()}` : undefined,
        modification.addSubtypes?.length ? `is also ${modification.addSubtypes.join(' and ').toLowerCase()}` : undefined,
        modification.removeTypes?.length ? `loses ${modification.removeTypes.join(' and ').toLowerCase()}` : undefined,
      ]);
    case 'color': return `is ${modification.setColors.map((c) => renderFilter({ is: 'color', value: c })).join(' and ')}`;
    case 'ability':
      return join([
        modification.grant?.length ? `has ${modification.grant.join(' and ').toLowerCase()}` : undefined,
        modification.remove?.length ? `loses ${modification.remove.join(' and ').toLowerCase()}` : undefined,
      ]);
    case 'pt-set': return `base power and toughness ${renderValue(modification.power)}/${renderValue(modification.toughness)}`;
    case 'pt-modify': return `gets ${signed(modification.power)}/${signed(modification.toughness)}`;
    case 'pt-switch': return 'switch power and toughness';
    case 'cost-modify': {
      const delta = typeof modification.delta === 'number' ? modification.delta : null;
      const direction = delta !== null && delta < 0 ? 'less' : 'more';
      const amount = delta !== null ? Math.abs(delta) : renderValue(modification.delta);
      // Oracle text writes the delta as a mana symbol — "costs {1} less to
      // cast" — so a bare "1" here both invents a numeral and drops a symbol.
      return join([
        renderSelector(modification.applies), 'costs',
        delta !== null ? `{${Math.abs(delta)}}` : String(amount), direction, 'to cast',
        `for ${renderPlayer(modification.forWhom)}`,
      ]);
    }
    case 'restriction': return renderRestriction(modification.rule);
    default: return assertNever(modification);
  }
}

function renderRestriction(rule: Restriction): string {
  switch (rule.rule) {
    case 'cant-attack': return join([renderSelector(rule.who), 'cant attack', rule.unless && `unless ${renderCondition(rule.unless)}`]);
    case 'cant-block': return join([renderSelector(rule.who), 'cant block', rule.unless && `unless ${renderCondition(rule.unless)}`]);
    case 'must-attack': return join([renderSelector(rule.who), 'attacks each combat if able', rule.unless && `unless ${renderCondition(rule.unless)}`]);
    case 'cant-untap': return join([renderSelector(rule.who), 'doesnt untap', rule.unless && `unless ${renderCondition(rule.unless)}`]);
    case 'cant-be-blocked-except-by': return `${renderSelector(rule.who)} cant be blocked except by ${renderSelector(rule.by)}`;
    case 'cant-be-targeted': return `${renderSelector(rule.who)} cant be the target of ${renderPlayer(rule.by)} spells`;
    case 'cant-cast': return `${renderPlayer(rule.who)} cant cast ${renderSelector(rule.what)}`;
    case 'max-lands-per-turn': return `${renderPlayer(rule.who)} may play ${renderValue(rule.n)} lands each turn`;
    case 'damage-prevention':
      return join([
        'prevent', rule.amount === 'all' ? 'all' : renderValue(rule.amount), 'damage',
        rule.from && `from ${renderSelector(rule.from)}`, `to ${renderSelector(rule.to)}`,
      ]);
    default: return assertNever(rule);
  }
}

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

export function renderTriggerEvent(event: TriggerEvent): string {
  switch (event.on) {
    case 'enters': return `when ${renderSelector(event.who)} enters`;
    case 'dies': return `when ${renderSelector(event.who)} dies`;
    case 'leaves': return join(['when', renderSelector(event.who), 'leaves', event.from && zoneWords(event.from)]);
    case 'zone-change':
      return `when ${renderSelector(event.who)} moves from ${event.from === 'any' ? 'anywhere' : zoneWords(event.from)} to ${event.to === 'any' ? 'anywhere' : zoneWords(event.to)}`;
    case 'attacks': return `whenever ${renderSelector(event.who)} attacks`;
    case 'blocks': return `whenever ${renderSelector(event.who)} blocks`;
    case 'becomes-blocked': return `whenever ${renderSelector(event.who)} becomes blocked`;
    case 'deals-damage':
      return join([
        'whenever', renderSelector(event.source), event.combatOnly && 'deals combat damage',
        !event.combatOnly && 'deals damage', event.to && event.to !== 'any' && `to a ${event.to}`,
      ]);
    case 'dealt-damage': return `whenever ${renderSelector(event.who)} is dealt damage`;
    case 'cast': return join(['whenever', event.by && `${renderPlayer(event.by)}`, 'casts', renderSelector(event.what)]);
    case 'step': return `at ${renderStep(event.step)} of ${renderPlayer(event.whose)}`;
    case 'tapped': return `whenever ${renderSelector(event.who)} becomes tapped`;
    case 'untapped': return `whenever ${renderSelector(event.who)} becomes untapped`;
    case 'counter-added': return `whenever a ${event.counter} counter is put on ${renderSelector(event.who)}`;
    case 'gains-life': return `whenever ${renderPlayer(event.whose)} gains life`;
    case 'loses-life': return `whenever ${renderPlayer(event.whose)} loses life`;
    case 'draws-card': return `whenever ${renderPlayer(event.whose)} draws a card`;
    case 'sacrificed': return `whenever ${renderSelector(event.who)} is sacrificed`;
    default: return assertNever(event);
  }
}

export function renderReplaceableEvent(event: ReplaceableEvent): string {
  switch (event.on) {
    case 'enters': return `if ${renderSelector(event.who)} would enter`;
    case 'damage':
      return join(['if', event.from && `${renderSelector(event.from)} would deal`, !event.from && 'damage would be dealt',
        event.combatOnly && 'combat', `damage to ${renderSelector(event.to)}`]);
    case 'draw': return `if ${renderPlayer(event.whose)} would draw a card`;
    case 'dies': return `if ${renderSelector(event.who)} would die`;
    case 'counter-placed':
      return `if ${event.counter ? `${event.counter} counters` : 'one or more counters'} would be put on ${renderSelector(event.target)}`;
    case 'life-gain': return `if ${renderPlayer(event.whose)} would gain life`;
    case 'life-loss': return `if ${renderPlayer(event.whose)} would lose life`;
    case 'token-created': return `if ${renderPlayer(event.whose)} would create a token`;
    case 'step': return `at ${renderStep(event.step)} of ${renderPlayer(event.whose)}`;
    default: return assertNever(event);
  }
}

export function renderReplacementResult(result: ReplacementResult): string {
  switch (result.do) {
    case 'enters-tapped': return 'it enters tapped';
    case 'enters-with-counters': return `it enters with ${renderValue(result.count)} ${result.counter} counters on it`;
    case 'enters-under-control': return `it enters under the control of ${renderPlayer(result.controller)}`;
    case 'prevent': return `prevent ${result.amount === 'all' ? 'all' : renderValue(result.amount)} of it`;
    case 'redirect': return `it is dealt to ${renderTarget(result.to)} instead`;
    case 'multiply': return `${renderValue(result.factor)} times that many instead`;
    case 'replace-zone': return `it goes to ${zoneWords(result.to)} instead`;
    case 'skip': return 'skip it instead';
    case 'additional': return renderEffects(result.effects);
    default: return assertNever(result);
  }
}

export function renderTarget(target: TargetSpec): string {
  const count =
    target.min === target.max ? (target.max === 1 ? '' : String(target.max)) : `up to ${target.max}`;
  // A target off the battlefield is a card and says so; one on the battlefield
  // does not. "target creature card in a graveyard" vs "target creature".
  const elsewhere = target.zone !== undefined && CARD_ZONES.has(target.zone);
  return join([
    count, 'target', target.filter && renderFilter(target.filter),
    elsewhere ? 'card' : undefined,
    target.what === 'any' && !target.filter ? 'any target' : target.what === 'player' ? 'player' : undefined,
    elsewhere ? `in ${zoneWords(target.zone!)}` : undefined,
    target.controller
      ? (elsewhere ? possessive(target.controller) : `${renderPlayer(target.controller)} controls`)
      : undefined,
  ]);
}

/* ------------------------------------------------------------------ *
 * Abilities
 * ------------------------------------------------------------------ */

export function renderAbility(ability: Ability): string {
  switch (ability.kind) {
    case 'keyword':
      return join([ability.keyword.toLowerCase(), ability.parameter]);
    case 'triggered':
      return join([
        renderTriggerEvent(ability.event),
        ability.condition && `if ${renderCondition(ability.condition)}`,
        ',', ability.optional && 'you may',
        ability.targets?.length ? ability.targets.map(renderTarget).join(' and ') : undefined,
        renderEffects(ability.effects),
        ability.limit && `only ${ability.limit.count} times each ${ability.limit.per}`,
      ]);
    case 'activated':
      return join([
        ability.costs.map(renderCost).join(', '), ':',
        ability.condition && `only if ${renderCondition(ability.condition)}`,
        ability.targets?.length ? ability.targets.map(renderTarget).join(' and ') : undefined,
        renderEffects(ability.effects),
        ability.timing === 'sorcery' && 'activate only as a sorcery',
        ability.limit && `only ${ability.limit.count} times each ${ability.limit.per}`,
      ]);
    case 'mana':
      return join([ability.costs.map(renderCost).join(', '), ':', renderEffects(ability.effects)]);
    case 'spell':
      return join([
        ability.targets?.length ? ability.targets.map(renderTarget).join(' and ') : undefined,
        renderEffects(ability.effects),
      ]);
    case 'static':
      return join([
        ability.condition && `as long as ${renderCondition(ability.condition)},`,
        renderSelector(ability.affects),
        ability.modifications.map(renderModification).join(' and '),
      ]);
    case 'replacement':
      return join([
        renderReplaceableEvent(ability.event),
        ability.condition && `and ${renderCondition(ability.condition)}`,
        ',', renderReplacementResult(ability.result),
      ]);
    default: return assertNever(ability);
  }
}

/** Every ability, in order, as one blob. This is what the round-trip compares. */
export function renderAbilities(abilities: readonly Ability[]): string {
  return abilities.map(renderAbility).join('\n');
}
