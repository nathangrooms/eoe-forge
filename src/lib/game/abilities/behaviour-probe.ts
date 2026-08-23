/**
 * The behavioural stage: does the engine actually DO anything with this DSL?
 *
 * ## The gap this closes, and why it is the only stage that touches the engine
 *
 * `validate.ts` proves an ability is well-formed. `roundtrip.ts` proves it says
 * what the card says. Neither has any opinion on whether the runtime can execute
 * it, and that is exactly the gap this project's two-numbers rule exists to name:
 * a card can be perfectly REPRESENTABLE and do nothing on a battlefield, because
 * the effects it compiled to are ones `to-actions.ts` defers rather than performs.
 *
 * So this module runs the effects. Not against a description of the engine —
 * against `rules.ts`, `makeContext` and `runEffects`, the same three the game
 * uses — on a small synthetic board, and reports which of four things happened.
 *
 * ## Four outcomes, and only two of them are rejections
 *
 *   - `threw`    — the interpreter raised. The DSL is broken in a way the schema
 *                  could not see. REJECT.
 *   - `silent`   — no actions AND no deferrals. This is the prohibited state the
 *                  whole design exists to prevent: an ability that resolves to
 *                  nothing while telling nobody. REJECT.
 *   - `deferred` — the engine said out loud what it would not decide. ACCEPT the
 *                  DSL, and record that the card is NOT automated.
 *   - `ran`      — actions came out and nothing was deferred. ACCEPT, and this is
 *                  the only outcome that may be counted toward AUTOMATED.
 *
 * Deferral must not be a rejection. A model that correctly compiles "target
 * player sacrifices a creature" has done its job; that the engine cannot yet ask
 * the player which creature is our gap, not the model's, and throwing the DSL
 * away would delete the very row that becomes useful the day the primitive lands.
 *
 * ## The board is deliberately small and fixed
 *
 * Two players, the source on the battlefield, one ally, one opposing creature, an
 * artifact, and one card in hand, library and graveyard. Enough for a selector to
 * find something; not so much that "it produced actions" becomes easy. It is the
 * same board for every card, so a difference in outcome is a difference in the DSL.
 *
 * ## The questions this probe now ASKS instead of refusing — 23 Aug 2026
 *
 * Three of the four outcomes above used to be decided before the engine was
 * given a fair chance to answer, and every one of those refusals dated from a
 * time when the engine really could not answer:
 *
 *   1. ANY ability that announced a target was reported `deferred` WITHOUT its
 *      effects being judged, on a comment saying that binding a target here
 *      would "test the fake". Nothing owned target legality when that was
 *      written. `chooseTargetsFor` owns it now, for all three ways a target is
 *      announced — an activated ability (`activate.ts`), a spell
 *      (`cast-targets.ts`) and a trigger (`announce.ts`) all end in it — so the
 *      probe binds through the same function and there is no fake to test.
 *   2. A MODE was left unanswered, so a modal ability deferred on its own
 *      offer. `bot.ts` answers one in a real game; `botChoice` answers it here.
 *   3. A `may` deferred, so a card whose whole body sits behind one could never
 *      be shown to do anything.
 *
 * ## Who answers, and why it is never this file
 *
 * Nothing in this module decides a target or a mode. `botChoice` and
 * `botTargetForEffects` in `bot.ts` decide, which is the same pair the bot uses
 * at a real table, and `chooseTargetsFor` decides what is legal to offer them.
 * A probe that answered with a rule of its own would produce a number about the
 * probe.
 *
 * ## Binding a target is not a way of passing, and the bar did not move
 *
 * Actions have to come out and nothing may be deferred, exactly as before. What
 * changed is that the ability is now given what it announces before it is asked
 * to run, rather than failed for announcing anything. A bound ability that then
 * produces nothing is `silent`, which is a REJECTION and a harder verdict than
 * the `deferred` it used to get. A target the board cannot supply — no legal
 * candidate, or a shape `chooseTargetsFor` refuses such as "two targets at
 * once" — is still `deferred`, which is what happened before as well.
 *
 * ## Two answers this probe gives that NOBODY ELSE CAN, and what they cost
 *
 * A `may` is answered YES, through `RunOptions.answerMayYes`. A mode is answered
 * by `botChoice`. Neither question has anyone to ask it in the shipped product:
 * `trigger-bridge.ts` refuses to own an optional trigger because the choice is
 * the player's, and `verify-ability-coverage.mjs` measures on every run that no
 * shipped surface draws a mode choice.
 *
 * So the effects run, because what they did is worth knowing, and THE CARD IS
 * REFUSED ANYWAY. The outcome is `deferred`, which is the same verdict the card
 * got before targets were bound at all. What the probe answered is listed in
 * `answered` so the refusal can be read rather than trusted.
 *
 * The first version of this change, earlier the same day, ran those answers and
 * scored the card `ran`. That was worth 66 cards in the passing total, every one
 * of them PROMPTED, a bucket whose entire definition is that every decision on
 * the card is one a shipped surface already draws. Measured, then corrected.
 */

import type { Ability, Effect } from '../../cards/abilities/dsl.ts';
import { effectsOf } from '../../cards/abilities/dsl.ts';
import { addCard, createGame } from '../rules.ts';
import type { GameState, StackTarget, Zone } from '../types.ts';
import { chooseTargetsFor, type ActivationChoices, type PendingChoice } from '../activate.ts';
import { botChoice, botTargetForEffects } from '../bot.ts';
import { announcedTargetsOf } from './card-abilities.ts';
import { makeContext } from './context.ts';
import { runEffects } from './to-actions.ts';

export type BehaviourOutcome = 'ran' | 'deferred' | 'silent' | 'threw';

export interface BehaviourVerdict {
  outcome: BehaviourOutcome;
  /** True unless the outcome is one the pipeline refuses to store. */
  ok: boolean;
  actions: number;
  deferred: string[];
  error?: string;
  /** Per-ability, in the order they were given. */
  perAbility: Array<{ id: string; kind: string; outcome: BehaviourOutcome; actions: number }>;
  /**
   * What was ANSWERED for this card, and by whom, one line per answer.
   *
   * Here so a card that improved can be audited against what it was given.
   * A number that moved because somebody was answered for is a different fact
   * from a number that moved because the engine got better, and the two are
   * indistinguishable in a total.
   */
  answered: string[];
  /** Abilities whose announced targets the board could not supply, with why. */
  unbound: string[];
}

function probeBoard(): GameState {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    players: [{ name: 'P1' }, { name: 'P2' }],
    seed: 7,
  });
  state = { ...state, status: 'playing' };

  const put = (instanceId: string, ownerId: string, name: string, typeLine: string, zone: Zone): void => {
    state = addCard(
      state,
      {
        instanceId,
        cardId: instanceId,
        name,
        ownerId,
        typeLine,
        power: '2',
        toughness: '2',
        tapped: false,
        damage: 0,
      },
      zone,
    );
  };

  put('probe-source', 'p1', 'Probe Source', 'Creature — Human', 'battlefield');
  put('probe-mine', 'p1', 'Probe Ally', 'Creature — Soldier', 'battlefield');
  put('probe-theirs', 'p2', 'Probe Foe', 'Creature — Zombie', 'battlefield');
  put('probe-artifact', 'p1', 'Probe Relic', 'Artifact', 'battlefield');
  put('probe-hand', 'p1', 'Probe In Hand', 'Creature — Human', 'hand');
  put('probe-library', 'p1', 'Probe In Library', 'Creature — Human', 'library');
  put('probe-yard', 'p1', 'Probe In Yard', 'Creature — Human', 'graveyard');

  return state;
}

/**
 * Run one effect tree on the probe board and report what came out.
 *
 * `probeBehaviour` takes whole abilities and grades a card. This takes bare
 * effects and grades a VERB, which is what a measuring script needs when it
 * wants to know whether the interpreter really performs `{do:'pump'}` today
 * rather than take somebody's word for it.
 *
 * That is why this is exported. `scripts/verify-ability-coverage.mjs` carried a
 * hand-written list of six verbs "named and never resolved", and a hand-written
 * list is a claim about code that goes stale the moment the code changes —
 * silently, and in whichever direction flatters whoever edited it last. Asking
 * the interpreter cannot go stale.
 */
export function probeEffects(effects: readonly Effect[]): {
  actions: number;
  deferred: string[];
  threw?: string;
} {
  try {
    const run = runEffects(effects, makeContext(probeBoard(), 'probe-source', 'p1'), {
      at: 0,
      cause: 'probe',
      idPrefix: 'probe:0',
    });
    return { actions: run.actions.length, deferred: run.deferred };
  } catch (err) {
    return { actions: 0, deferred: [], threw: (err as Error).message };
  }
}

/**
 * Aim one ability's announced targets the way a bot aims them at a real table.
 *
 * `chooseTargetsFor` is asked what is legal and settles anything forced by
 * itself; whatever it still wants an answer for goes to `bot.ts`, which decides.
 * Which bot function decides is the one the GAME would use for that kind of
 * ability, so the probe cannot be more decisive than the table is:
 *
 *   - `activated` -> `botChoice`, the function `chooseActivation` passes to
 *     `planActivationWith`.
 *   - `triggered` and `spell` -> `botTargetForEffects`, which is the body of
 *     `botTriggerTarget` and reads the direction off the ability's own effects,
 *     so removal points across the table and a pump stays home.
 *
 * `ok:false` is a REFUSAL and stays one. CR 601.2c with no legal candidate,
 * "up to two targets at once" which `chooseTargetsFor` will not announce, and a
 * bot that declines all end here, and the ability is reported `deferred`
 * exactly as it was before any of this.
 */
interface BoundTargets {
  /** Null means the board could not supply them, and `why` says what happened. */
  targets: StackTarget[] | null;
  why: string;
}

function bindTargetsLikeABot(state: GameState, ability: Ability): BoundTargets {
  const specs = announcedTargetsOf(ability);

  /*
   * A TARGET THE CARD ANNOUNCES AND NO EFFECT READS IS A DROPPED CLAUSE.
   *
   * `announcedTargetsOf` returns only the specs some effect actually indexes.
   * When the ability declares more than that, the compiler wrote down a target
   * and then wrote no effect that uses it, which means the DSL says less than
   * the card does. Decimate is the plain case: "Destroy target artifact, target
   * creature, target enchantment, and target land" announces four and compiles
   * to a single `destroy` of the first, so three quarters of the card is gone.
   *
   * Refusing it here is the only place it gets caught. The paragraph bar in
   * `verify-ability-coverage.mjs` is satisfied — the sentence did map to an
   * ability — and the ability runs and produces an action, so without this the
   * card reads as working. It stays a refusal until the DSL reads what it
   * announced.
   */
  const declared = 'targets' in ability && Array.isArray(ability.targets) ? ability.targets.length : 0;
  if (declared > specs.length) {
    return {
      targets: null,
      why: `the ability announces ${declared} target(s) and its effects read only ${specs.length}, so part of the card compiled to nothing`,
    };
  }

  if (specs.length === 0) return { targets: [], why: '' };

  const source = state.cards['probe-source'];
  const effects = effectsOf(ability);
  let choices: ActivationChoices = {};

  // One pass per question. The cap is a guard against a spec that never
  // settles, never a budget: eight is well past the widest target list any
  // printed card carries.
  for (let pass = 0; pass < 8; pass++) {
    const aim = chooseTargetsFor(state, 'p1', source, specs, choices, 0);
    if (!aim.reason) return { targets: aim.targets, why: '' };

    const ask = aim.pending[0];
    if (!ask) return { targets: null, why: aim.reason };

    const answer =
      ability.kind === 'activated'
        ? botChoice(state, 'p1', source, ask)
        : botTargetForEffects(state, 'p1', effects, ask);
    if (!answer || Array.isArray(answer)) {
      return { targets: null, why: `the bot declined to aim this: ${ask.prompt}` };
    }

    const targets = [...(choices.targets ?? [])];
    targets[ask.ref] = answer;
    choices = { ...choices, targets };
  }
  return { targets: null, why: 'eight passes and the targets were still not settled' };
}

/**
 * Answer every mode this run offered, with `botChoice`, and run it again.
 *
 * `RunOptions.modes` is the engine's own channel — `planActivation` fills the
 * identical field from the identical `ModeChoice.ref` — so nothing here is a
 * probe-only path into the interpreter. The loop repeats because answering an
 * outer mode can uncover a mode nested inside the branch that was chosen.
 *
 * The answer is `botChoice`'s: the card's own first option, up to `min`. That
 * is a weak policy and it is the bot's weak policy, not a new one.
 */
function answerModes(
  state: GameState,
  ability: Ability,
  effects: readonly Effect[],
  targets: readonly StackTarget[],
  answered: string[]
): { actions: number; deferred: string[]; modesAnswered: number } {
  const source = state.cards['probe-source'];
  let modes: Record<string, readonly number[]> = {};
  let modesAnswered = 0;

  for (let pass = 0; pass < 8; pass++) {
    const run = runEffects(effects, makeContext(state, 'probe-source', 'p1', { targets: [...targets] }), {
      at: 0,
      cause: 'probe',
      idPrefix: 'probe:0',
      answerMayYes: true,
      ...(Object.keys(modes).length > 0 ? { modes } : {}),
    });
    if (run.choices.length === 0) return { actions: run.actions.length, deferred: run.deferred, modesAnswered };

    const choice = run.choices[0];
    const pending: PendingChoice = {
      kind: 'mode',
      ref: 0,
      modeRef: choice.ref,
      prompt: choice.prompt,
      instanceIds: [],
      playerIds: [],
      modes: choice.options,
      min: choice.min,
      max: choice.max,
    };
    const picked = botChoice(state, 'p1', source, pending);
    if (!Array.isArray(picked) || picked.length === 0) {
      // The bot had no answer. The deferral it left behind is the honest report.
      return { actions: run.actions.length, deferred: run.deferred, modesAnswered };
    }
    modes = { ...modes, [choice.ref]: picked as readonly number[] };
    modesAnswered++;
    answered.push(`${ability.id ?? '?'}: botChoice answered the mode "${choice.prompt}" with [${picked.join(', ')}]`);
  }

  // Eight modes deep and still asking. Report what the last run said.
  const run = runEffects(effects, makeContext(state, 'probe-source', 'p1', { targets: [...targets] }), {
    at: 0,
    cause: 'probe',
    idPrefix: 'probe:0',
    answerMayYes: true,
    modes,
  });
  return { actions: run.actions.length, deferred: run.deferred, modesAnswered };
}

/** Does this ability carry a `{do:'may'}` anywhere in its tree? */
function hasMay(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(hasMay);
  if (!node || typeof node !== 'object') return false;
  const record = node as Record<string, unknown>;
  if (record.do === 'may') return true;
  return Object.values(record).some(hasMay);
}

/**
 * The same effects with every translated XMage body taken out of them.
 *
 * Used to ask ONE question and nothing else: did the body contribute an action?
 * See the caller for why that question could not be asked any other way.
 * Recursive, because a body can sit inside a `may` or inside one arm of a mode.
 */
function withoutXmageBodies(effects: readonly Effect[]): Effect[] {
  const out: Effect[] = [];
  for (const effect of effects) {
    const node = effect as unknown as Record<string, unknown>;
    if (node.do === 'xmage-body') continue;
    if (node.do === 'may' && Array.isArray(node.effects)) {
      out.push({ ...effect, effects: withoutXmageBodies(node.effects as Effect[]) } as Effect);
      continue;
    }
    if (node.do === 'choose-mode' && Array.isArray(node.modes)) {
      out.push({
        ...effect,
        modes: (node.modes as Array<{ text: string; effects: Effect[] }>).map(mode => ({
          ...mode,
          effects: withoutXmageBodies(mode.effects),
        })),
      } as Effect);
      continue;
    }
    out.push(effect);
  }
  return out;
}

/** Is there a translated XMage body anywhere in this tree? */
function hasXmageBody(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(hasXmageBody);
  if (!node || typeof node !== 'object') return false;
  const record = node as Record<string, unknown>;
  if (record.do === 'xmage-body') return true;
  return Object.values(record).some(hasXmageBody);
}

const RANK: Record<BehaviourOutcome, number> = { ran: 0, deferred: 1, silent: 2, threw: 3 };

export function probeBehaviour(abilities: readonly Ability[]): BehaviourVerdict {
  const state = probeBoard();
  const perAbility: BehaviourVerdict['perAbility'] = [];
  const allDeferred: string[] = [];
  const answered: string[] = [];
  const unbound: string[] = [];
  let totalActions = 0;
  let worst: BehaviourOutcome = 'ran';
  let error: string | undefined;

  const worsen = (outcome: BehaviourOutcome): void => {
    if (RANK[outcome] > RANK[worst]) worst = outcome;
  };

  // A card with no abilities has nothing to probe. It is not silent — there was
  // never anything to be silent about — and failing it would reject every
  // vanilla creature in the catalogue.
  if (abilities.length === 0) {
    return { outcome: 'ran', ok: true, actions: 0, deferred: [], perAbility: [], answered: [], unbound: [] };
  }

  for (const ability of abilities) {
    // Keywords, statics and replacements are not effect trees. The engine reads
    // them in `statics.ts` and `card-abilities.ts` rather than running them, so
    // probing them here would score every lord and every flier as silent.
    if (ability.kind === 'keyword' || ability.kind === 'static' || ability.kind === 'replacement') {
      perAbility.push({ id: ability.id ?? '?', kind: ability.kind, outcome: 'ran', actions: 0 });
      continue;
    }

    const effects: Effect[] = effectsOf(ability);
    if (effects.length === 0) {
      perAbility.push({ id: ability.id ?? '?', kind: ability.kind, outcome: 'silent', actions: 0 });
      worsen('silent');
      continue;
    }

    let outcome: BehaviourOutcome;
    let actions = 0;
    try {
      /*
       * The targets FIRST, then the effects, and the order is the whole change.
       * The ability used to be failed for announcing a target before anything
       * it does was looked at; now it is given what it announces and then held
       * to the same bar it was always held to.
       */
      const bound = bindTargetsLikeABot(state, ability);
      if (bound.targets === null) {
        // The board could not supply what the card asks for. Unchanged verdict:
        // this ability was not executed, and the card is not automated.
        unbound.push(`${ability.id ?? '?'}: ${bound.why}`);
        allDeferred.push(`targets could not be bound on the probe board: ${bound.why}`);
        perAbility.push({ id: ability.id ?? '?', kind: ability.kind, outcome: 'deferred', actions: 0 });
        worsen('deferred');
        continue;
      }
      if (bound.targets.length > 0) {
        answered.push(
          `${ability.id ?? '?'}: ${bound.targets.length} target(s) bound through chooseTargetsFor, aimed by ${
            ability.kind === 'activated' ? 'botChoice' : 'botTargetForEffects'
          }`
        );
      }
      const carriesMay = hasMay(effects);
      if (carriesMay) answered.push(`${ability.id ?? '?'}: a "you may" was answered YES by the probe`);

      const run = answerModes(state, ability, effects, bound.targets, answered);
      actions = run.actions;
      totalActions += actions;
      allDeferred.push(...run.deferred);

      /*
       * AN ANSWER NOTHING IN THE PRODUCT CAN GIVE IS NOT A PASS. Added on the
       * adversarial review of 23 Aug 2026, and it is the correction to this
       * file's own change earlier the same day.
       *
       * Two of the three questions this probe started answering are questions
       * NOBODY ELSE CAN ANSWER. The comment at the top of the file said so
       * about the "you may" and then let the card score `ran` anyway, and the
       * mode was never written down at all:
       *
       *   - a "you may": `trigger-bridge.ts` refuses to own an optional
       *     trigger in as many words, because the choice is the player's, and
       *     no surface offers the yes or the no.
       *   - a mode: `verify-ability-coverage.mjs` measures on every run that NO
       *     shipped surface draws a mode choice, and prints it. A card scored
       *     as working on a mode the bot picked is a card counted against a
       *     decision that same run reports nobody can make.
       *
       * Measured before this was written: 41 cards reached the passing total on
       * the "may" answer alone and 25 more on a mode answer, all 66 of them in
       * the PROMPTED bucket, whose whole definition is that every decision on
       * the card is one a shipped surface already draws.
       *
       * The effects still RUN, because what they did is worth knowing and is
       * recorded in `answered` and in `actions`. The card is refused anyway.
       * This is the verdict the same card got before targets were bound, so it
       * takes nothing away from the engine and it hands nothing free to it.
       */
      const refusals: string[] = [];
      if (carriesMay) {
        refusals.push(
          'the probe answered a question nobody else can: a "you may", and nothing in the product offers the yes or the no'
        );
      }
      if (run.modesAnswered > 0) {
        refusals.push(
          'the probe answered a question nobody else can: a mode, and no shipped surface draws the options'
        );
      }

      /*
       * A TRANSLATED XMAGE BODY THAT CONTRIBUTED NOTHING IS A CLAUSE NOBODY RAN.
       *
       * `to-actions.ts` names a body that reports success and changes nothing.
       * It says nothing at all about a body that returns FALSE and changes
       * nothing, and it is right not to: XMage returns false for "the condition
       * was not met", which is a legitimate resolution, and a note about it in a
       * real game would be a lie. So the game cannot ask this question, and the
       * measuring stage has to.
       *
       * It is asked by running the same effects again with the bodies taken out
       * and comparing the action counts. Equal counts mean the body produced
       * nothing, so the clause it stands for was neither performed nor deferred,
       * and the card is passing on the clauses beside it.
       *
       * Measured before this was written: 8 cards reached AUTOMATED this way,
       * all 8 of them cards that moved out of SILENT when targets started
       * binding. Depressurize is the plain case. "Target creature gets -3/-0
       * until end of turn. Then if that creature's power is 0 or less, destroy
       * it" produces the pump and nothing else, on a board of 2/2s where the
       * destroy is exactly what should happen.
       */
      if (actions > 0 && hasXmageBody(effects)) {
        const stripped = withoutXmageBodies(effects);
        const withoutBodies = answerModes(state, ability, stripped, bound.targets, []);
        if (withoutBodies.actions >= actions) {
          refusals.push(
            'a translated XMage body produced no action and gave no reason, so that clause was never shown to work'
          );
        }
      }

      if (actions === 0 && run.deferred.length === 0) {
        // A bound ability that produced nothing and said nothing. This is the
        // REJECTION the binding makes possible, and it is checked FIRST because
        // it is the harshest of the three: before, the same card was let off
        // with a deferral because nobody ran it.
        outcome = 'silent';
      } else if (refusals.length > 0) {
        outcome = 'deferred';
        for (const reason of refusals) allDeferred.push(reason);
      } else if (run.deferred.length > 0) {
        outcome = 'deferred';
      } else {
        outcome = 'ran';
      }
    } catch (err) {
      outcome = 'threw';
      error ??= (err as Error).message;
    }
    perAbility.push({ id: ability.id ?? '?', kind: ability.kind, outcome, actions });
    worsen(outcome);
  }

  return {
    outcome: worst,
    ok: worst === 'ran' || worst === 'deferred',
    actions: totalActions,
    deferred: [...new Set(allDeferred)],
    error,
    perAbility,
    answered,
    unbound,
  };
}
