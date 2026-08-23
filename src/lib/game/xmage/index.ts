/**
 * DeckMatrix — the XMage runtime API. Entry point and manifest.
 *
 * Ported from **XMage**, MIT licensed, `Copyright (c) 2010 betasteward@gmail.com`,
 * https://github.com/magefree/mage. Read in place; nothing vendored. XMage's
 * display strings are not copied — those carry Wizards of the Coast rules text.
 *
 * ## How a translated card body runs
 *
 *     const run = runXmageEffect(state, {
 *       sourceId, controllerId, targets, idPrefix: `${state.version}:0`,
 *     }, (game, source) => {
 *       const controller = game.getPlayer(source.getControllerId());
 *       const permanent = game.getPermanent(source.getFirstTarget());
 *       if (!controller || !permanent) return false;
 *       controller.drawCards(2);
 *       permanent.destroy();
 *       return true;
 *     });
 *
 * That body is a line-for-line translation of XMage's Java. `run.actions` is a
 * list of ordinary `GameAction`s the reducer folds, so the card resolving is
 * replayable, undoable and identical on every client.
 *
 * If the body reaches a decision — `chooseUse`, `choose`, `chooseTarget` — the
 * run comes back with `ok: false`, an EMPTY action list and one `PendingChoice`.
 * The caller answers and runs it again. Nothing half-done is ever returned, and
 * the question is the same shape `activate.ts` raises and `bot.ts` answers, so a
 * bot seat and a human seat go through one seam.
 *
 * ## The manifest is derived, not typed
 *
 * `xmageApiManifest()` builds one of every facade and reads its OWN method
 * names back off the object. A method that is not there is not in the manifest,
 * so the coverage number in `docs/engine/RUNTIME-API.md` cannot drift away from
 * the code. `scripts/xmage/runtime-coverage.mjs` reads it and joins it against
 * the ranked call histogram.
 */

import type { GameState, InstanceId, PlayerId, StackTarget } from '../types.ts';
import type { PendingChoice } from '../activate.ts';
import {
  makeScope,
  runBody,
  type XmageAnswers,
  type XmageRun,
  type XmageRunOptions,
  type XmageScope,
} from './runtime.ts';
import {
  makeCards,
  makeChoice,
  makeGame,
  makePermanent,
  makePlayer,
  makeToken,
  type XGame,
} from './objects.ts';
import { makeFilter } from './filters.ts';
import {
  fixedTarget,
  makeAbility,
  makeEffect,
  makeEvent,
  makeTarget,
  type XAbility,
} from './targets.ts';

export * from './runtime.ts';
export * from './objects.ts';
export * from './filters.ts';
export * from './targets.ts';

/* -------------------------------------------------------------------------- */
/* Running one body                                                           */
/* -------------------------------------------------------------------------- */

export interface XmageEffectOptions extends XmageRunOptions {
  /** The permanent or card whose ability this is. XMage's `source.getSourceId()`. */
  sourceId: InstanceId;
  controllerId: PlayerId;
  /** Announced targets, this engine's own shape. */
  targets?: readonly StackTarget[];
  /** The X the player announced. */
  x?: number;
  abilityId?: string;
}

/** XMage's `OneShotEffect.apply(Game, Ability)`, with our objects behind it. */
export type XmageBody = (game: XGame, source: XAbility) => boolean;

export function runXmageEffect(
  state: GameState,
  options: XmageEffectOptions,
  body: XmageBody
): XmageRun {
  const scope: XmageScope = makeScope(state, options);
  const game = makeGame(scope, options.controllerId);
  const source = makeAbility(scope, {
    abilityId: options.abilityId,
    sourceId: options.sourceId,
    controllerId: options.controllerId,
    targets: options.targets ?? [],
    x: options.x,
  });
  return runBody(scope, () => body(game, source));
}

/**
 * Run a body, feeding back answers until it either finishes or asks something
 * the decider cannot answer.
 *
 * The decider is `(choice: PendingChoice) => XmageAnswer`, the SAME callback
 * shape `cast-targets.ts` and `bot.ts` already use, so an existing bot decider
 * drives a translated XMage body without being adapted.
 *
 * `maxRounds` is a guard against a body that asks a new question every time it
 * is answered. It is a bug when it trips, and it says so rather than looping.
 */
export function runXmageEffectWith(
  state: GameState,
  options: XmageEffectOptions,
  body: XmageBody,
  decide: (choice: PendingChoice) => StackTarget | InstanceId[] | number[] | null,
  maxRounds = 32
): XmageRun {
  const answers: XmageAnswers = { ...(options.answers ?? {}) };

  for (let round = 0; round < maxRounds; round++) {
    const run = runXmageEffect(state, { ...options, answers }, body);
    if (run.ok) return run;

    const choice = run.pending[0];
    if (!choice?.modeRef) return run;
    if (Object.prototype.hasOwnProperty.call(answers, choice.modeRef)) {
      // The same question came back after being answered, which means the
      // answer was refused. Returning it unresolved is right: looping would
      // hide a disagreement between the decider and the body.
      return run;
    }
    const answer = decide(choice);
    if (answer === null || answer === undefined) return run;
    answers[choice.modeRef] = answer;
  }

  return runXmageEffect(state, { ...options, answers }, body);
}

/* -------------------------------------------------------------------------- */
/* The manifest                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Every `Type#method` this folder implements, read off the objects themselves.
 *
 * Built against a minimal throwaway state, because the facades are closures and
 * their method names are the only thing being read. Nothing here is a list a
 * human typed, so it cannot claim a method the code does not have.
 */
export function xmageApiManifest(): Record<string, string[]> {
  const state = {
    id: 'manifest',
    players: [],
    cards: {},
    combat: { attackers: [] },
    activePlayerId: '',
    turn: 0,
    version: 0,
  } as unknown as GameState;

  const scope = makeScope(state, { idPrefix: 'manifest' });
  const game = makeGame(scope);
  const ability = makeAbility(scope, { sourceId: 'x', controllerId: 'p' });

  const namesOf = (value: unknown): string[] =>
    value && typeof value === 'object'
      ? Object.keys(value as object).filter(
          key => typeof (value as Record<string, unknown>)[key] === 'function'
        )
      : [];

  const permanent = makePermanent(scope, 'x');
  const player = makePlayer(scope, 'p');
  const cards = makeCards(scope, []);
  const filter = makeFilter('manifest');
  const target = makeTarget(scope, {});
  const pointer = fixedTarget('x');
  const event = makeEvent({ type: 'MANIFEST' });
  const effect = makeEffect(() => true);
  const token = makeToken(scope, { name: 'manifest' });
  const choice = makeChoice(scope, []);

  return {
    Game: namesOf(game),
    GameState: namesOf(game.getState()),
    Battlefield: namesOf(game.getBattlefield()),
    Player: namesOf(player),
    Permanent: namesOf(permanent),
    Card: namesOf(permanent),
    MageObject: namesOf(permanent),
    Controllable: ['getControllerId', 'isControlledBy'],
    MageItem: ['getId'],
    Cards: namesOf(cards),
    // The PLAYER's library, `mage.players.Library`. `api-surface-typed.mjs`
    // keys most of these calls `ZoneChangeInfo.Library#…`, which is a nested
    // helper that declares none of them; `runtime-coverage.mjs` re-keys those
    // rows and prints how many calls it moved.
    Library: namesOf(player.getLibrary()),
    Counters: ['getCount', 'entries'],
    CounterType: ['createInstance'],
    MageInt: ['getValue', 'isUnknown'],
    Filter: namesOf(filter),
    Predicates: ['and', 'or', 'not', 'any'],
    CardType: ['getPredicate'],
    SubType: ['getPredicate'],
    Ability: namesOf(ability),
    Target: namesOf(target),
    Targets: namesOf(ability.getTargets()),
    TargetPointer: namesOf(pointer),
    GameEvent: namesOf(event),
    Effect: namesOf(effect),
    DynamicValue: ['calculate'],
    CardUtil: ['getExileZoneId', 'getSourceCostsTag', 'overflowInc'],
    Choice: namesOf(choice),
    Token: namesOf(token),
    SpellStack: namesOf(game.getStack()),
    StackObject: ['getId', 'getName', 'getControllerId', 'getSourceId', 'isSpell', 'getCard'],
    Spell: ['getId', 'getName', 'getControllerId', 'getSourceId', 'getCard'],
    Combat: namesOf(game.getCombat()),
  };
}

