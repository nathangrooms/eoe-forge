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
 */

import type { Ability, Effect } from '../../cards/abilities/dsl.ts';
import { effectsOf } from '../../cards/abilities/dsl.ts';
import { addCard, createGame } from '../rules.ts';
import type { GameState, Zone } from '../types.ts';
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
 * `{sel:'target'}` resolves to whatever the context was told the targets were.
 * The probe binds none, so a targeted ability would produce nothing and score
 * `silent` — a false rejection of correct DSL. Rather than fake a binding (which
 * would test the fake), targeted abilities are reported `deferred` with the
 * reason stated in the log.
 */
function needsTargetBinding(ability: Ability): boolean {
  return 'targets' in ability && Array.isArray(ability.targets) && ability.targets.length > 0;
}

const RANK: Record<BehaviourOutcome, number> = { ran: 0, deferred: 1, silent: 2, threw: 3 };

export function probeBehaviour(abilities: readonly Ability[]): BehaviourVerdict {
  const state = probeBoard();
  const perAbility: BehaviourVerdict['perAbility'] = [];
  const allDeferred: string[] = [];
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
    return { outcome: 'ran', ok: true, actions: 0, deferred: [], perAbility: [] };
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
      const run = runEffects(effects, makeContext(state, 'probe-source', 'p1'), {
        at: 0,
        cause: 'probe',
        idPrefix: 'probe:0',
      });
      actions = run.actions.length;
      totalActions += actions;
      allDeferred.push(...run.deferred);
      if (needsTargetBinding(ability)) {
        outcome = 'deferred';
        allDeferred.push('targets are not bound on the probe board, so this ability was not executed');
      } else if (run.deferred.length > 0) {
        outcome = 'deferred';
      } else if (actions === 0) {
        outcome = 'silent';
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
  };
}
