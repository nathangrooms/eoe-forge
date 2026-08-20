/**
 * What can I actually do with this card, right now?
 *
 * One question, one answer, one place. The preview draws whatever this returns
 * and nothing else, so a button on screen is a play the rules engine has
 * already agreed to.
 *
 * ## Why it is a `.ts` and not part of the component
 *
 * The test runner is `node --test` over `src/**\/*.test.ts` and cannot parse
 * JSX. While this logic lived inside `CardInspector.tsx` it could not be tested
 * at all — which is how "the preview offers Attack on a card in your graveyard"
 * would ship without anything noticing. The playmat sizing work was extracted
 * for exactly this reason; this follows it.
 *
 * ## The rule the spec sets
 *
 * > They must be the REAL actions available for that card, in that zone, right
 * > now: cast, attack, tap, block, move to graveyard, and so on. Never a fixed
 * > list padded with disabled entries.
 *
 * So an action that is not legal is not in `actions`. It is not turned into a
 * greyed-out button either, because a row of dead buttons is exactly the "fixed
 * list padded with disabled entries" the spec refuses.
 *
 * What it must NOT become is silence. Project law: *"NEVER SILENTLY DO
 * NOTHING."* A card you were expecting to be able to cast and cannot needs to
 * say why, so the refusals come back separately in `blocked` — sentences, drawn
 * as text under the actions rather than as controls you cannot press.
 *
 * Legality is asked of the engine every time: `planLandDrop`, `planCastFromHand`,
 * `eligibleAttackers`, `eligibleBlockers`, `canBlock`. Nothing here re-derives a
 * rule, so this list and the rules cannot drift apart.
 */

import {
  canBlock,
  castTiming,
  commanderZoneOfferFor,
  eligibleAttackers,
  eligibleBlockers,
  isLand,
  isUnderAttack,
  planCastFromHand,
  planLandDrop,
  statLineIn,
  type CardInstance,
  type GameState,
  type PlayerId,
  type Zone,
  // Relative rather than the `@/` alias, for the reason `turnFlow.ts` gives:
  // `node --test` has no bundler to resolve an alias with.
} from '../../lib/game/index.ts';

/** What pressing a button does. The surface switches on this. */
export type CardActionKind =
  | 'play-land'
  | 'cast'
  | 'tap'
  | 'untap'
  | 'attack'
  | 'block'
  | 'move'
  | 'focus-seat';

export interface CardAction {
  /** Unique within one list, so React has a key and a test has a handle. */
  id: string;
  kind: CardActionKind;
  /** The words on the button. Plain, short, no jargon. */
  label: string;
  /** The full sentence, for the tooltip and for a screen reader. */
  hint: string;
  /** `primary` is the play you are most likely here to make. */
  tone: 'primary' | 'quiet';
  /** `attack`: which seat this creature is being sent at. */
  defenderPlayerId?: PlayerId;
  /** `block`: which attacker this creature stands in front of. */
  attackerId?: string;
  /** `move`: where the card is being put. */
  zone?: Zone;
}

/** A play that is not available, and the reason, as a sentence. */
export interface BlockedAction {
  id: string;
  reason: string;
}

export interface CardActionsResult {
  actions: CardAction[];
  blocked: BlockedAction[];
  /** Every manual zone move offered for this card. Drawn quieter than the rest. */
  moves: CardAction[];
}

export interface CardActionOptions {
  /** Playtest escape hatch: ignore mana entirely. */
  freeCast?: boolean;
  /** Offer "look at their board". Absent when there is nowhere to send them. */
  canFocusSeat?: boolean;
  /**
   * Nobody is taking decisions from this screen.
   *
   * `/simulate` is this same board being WATCHED: every seat is played by the
   * bot and there is no dispatcher behind the preview at all. Offering Cast or
   * Attack there would be offering a button that does nothing, which is the
   * exact failure the owner reported as *"why do card effects not do
   * anything"*.
   *
   * So a watched preview offers no play, and no refusal either: a refusal is
   * the answer to "why can I not do this", and here the answer is not about the
   * card. The one thing that survives is the view control, because it changes
   * what is on screen rather than what is in the game.
   */
  readOnly?: boolean;
  /**
   * The game is not open for business yet, and why.
   *
   * Set while the opening hand is still being decided. A player must be able to
   * READ the seven cards they are judging — that is the entire decision — so the
   * preview stays open and the card stays large. What it must not do is let
   * them play one before they have kept, which is a rules violation and was
   * measured happening: the screenshot harness played a land on turn one with
   * the mulligan bar still on screen.
   *
   * Carried as prose rather than a boolean so the panel can SAY why the plays
   * are missing. A button that vanishes with no explanation is the same silence
   * as a button that does nothing.
   */
  holdReason?: string;
}

/**
 * Zones a card of yours can be sent to by hand, other than the one it is in.
 *
 * `command` is not here and must not be added to the list: only a commander
 * belongs in a command zone, and a general "To command zone" on every card
 * would be a control that builds an illegal board. It is offered separately,
 * below, on the one card the rules allow it for.
 */
const MOVE_TARGETS: ReadonlyArray<{ zone: Zone; label: string }> = [
  { zone: 'hand', label: 'To hand' },
  { zone: 'battlefield', label: 'To battlefield' },
  { zone: 'graveyard', label: 'To graveyard' },
  { zone: 'exile', label: 'To exile' },
  { zone: 'library', label: 'To library' },
];

export function actionsForCard(
  state: GameState,
  viewerPlayerId: PlayerId,
  card: CardInstance,
  options: CardActionOptions = {}
): CardActionsResult {
  const actions: CardAction[] = [];
  const blocked: BlockedAction[] = [];
  const moves: CardAction[] = [];

  const mine = card.controllerId === viewerPlayerId;
  const land = isLand(card);
  const controller = state.players.find(p => p.id === card.controllerId);

  /* The opening hand is not settled, so nothing is playable yet. The reason is
     handed back as a refusal rather than as silence. */
  if (options.holdReason) {
    blocked.push({ id: 'hold', reason: options.holdReason });
    return { actions, blocked, moves };
  }

  /* A watched game. See `readOnly` above: no play, no refusal, and the view
     control only because it moves the camera rather than the game. */
  if (options.readOnly) {
    if (options.canFocusSeat && controller) {
      actions.push({
        id: 'focus-seat',
        kind: 'focus-seat',
        label: `Watch ${controller.name} alone`,
        hint: `Fill the screen with ${controller.name}'s side of the table`,
        tone: 'quiet',
      });
    }
    return { actions, blocked, moves };
  }

  /* ---------------------------------------------------------------------- */
  /* From the hand and the command zone                                     */
  /* ---------------------------------------------------------------------- */

  if (mine && land && card.zone === 'hand') {
    const plan = planLandDrop(state, viewerPlayerId, card.instanceId);
    if (plan.ok) {
      actions.push({
        id: 'play-land',
        kind: 'play-land',
        label: 'Play land',
        hint: `Put ${card.name} onto the battlefield`,
        tone: 'primary',
      });
    } else {
      blocked.push({ id: 'play-land', reason: plan.reason });
    }
  }

  if (mine && !land && (card.zone === 'hand' || card.zone === 'command')) {
    const plan = planCastFromHand(state, viewerPlayerId, card.instanceId, {
      ignoreMana: options.freeCast,
    });
    /*
     * WHEN, as well as whether it is paid for.
     *
     * `planCastFromHand` answers cost and zone and says nothing about timing —
     * `rules.ts` documents that as deliberate and points a surface that wants
     * the real rule at the engine. This was the only thing between a player and
     * casting a creature during the opponent's untap step: measured by playing
     * it, the preview offered Cast on a sorcery-speed creature on six out of
     * six opponent steps, and pressing it resolved the creature onto the board.
     *
     * Attack and block have always asked about the step. Cast now does too, and
     * the refusal is a sentence rather than a dead button, the same as every
     * other refusal here.
     */
    const timing = castTiming(state, viewerPlayerId, card);
    const commander = card.zone === 'command';
    /* The tax is mana, so it is said in mana. "plus 4 tax" reads as a fee in
       some other currency, and a player pricing their turn is counting lands. */
    const label = commander
      ? plan.tax > 0
        ? `Cast commander, ${plan.tax} more mana`
        : 'Cast commander'
      : 'Cast';
    /* The timing refusal wins when both fail. "Needs 2 mana" is the wrong
       sentence to read on the opponent's untap step, because paying for it
       would not help. */
    if (!timing.ok) {
      blocked.push({ id: 'cast', reason: timing.reason });
    } else if (plan.ok) {
      actions.push({
        id: 'cast',
        kind: 'cast',
        label,
        hint: commander && plan.tax > 0
          ? `Cast ${card.name} from the command zone. ${plan.tax} of the cost is commander tax.`
          : `Cast ${card.name}`,
        tone: 'primary',
      });
    } else {
      blocked.push({ id: 'cast', reason: plan.reason });
    }
  }

  /*
   * CR 903.9a — a commander sitting in a graveyard or exile may be put into the
   * command zone instead, and the word is MAY.
   *
   * Offered here as well as in the panel that explains it, because this list is
   * what the preview draws for a card and a player who has clicked their dead
   * commander is asking exactly this question. `commanderZoneOffers` owns the
   * legality; nothing is re-derived.
   */
  if (mine && !options.readOnly) {
    const offer = commanderZoneOfferFor(state, viewerPlayerId, card);
    if (offer) {
      actions.push({
        id: 'to-command-zone',
        kind: 'move',
        zone: 'command',
        label: 'To the command zone',
        hint:
          `Put ${card.name} into your command zone instead of leaving it in your ${offer.from}. ` +
          `Casting it again costs ${offer.nextCastMana} mana, ${offer.nextCastTax} of that tax.`,
        tone: 'primary',
      });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* On the battlefield                                                     */
  /* ---------------------------------------------------------------------- */

  const declared = state.combat.attackers.some(d => d.attackerId === card.instanceId);
  const blocking = state.combat.attackers.find(d => d.blockedBy.indexOf(card.instanceId) !== -1);

  const canDeclareAttack =
    mine &&
    card.zone === 'battlefield' &&
    state.step === 'declare_attackers' &&
    state.activePlayerId === viewerPlayerId &&
    eligibleAttackers(state, viewerPlayerId).some(c => c.instanceId === card.instanceId);

  if (canDeclareAttack) {
    const defenders = state.players.filter(p => p.id !== viewerPlayerId && !p.hasLost);
    for (const defender of defenders) {
      actions.push({
        id: `attack:${defender.id}`,
        kind: 'attack',
        label: defenders.length === 1 ? 'Attack' : `Attack ${defender.name}`,
        hint: `Send ${card.name} at ${defender.name}`,
        tone: 'primary',
        defenderPlayerId: defender.id,
      });
    }
  }

  /*
   * Blocking, asked of the engine rather than restated here. `eligibleBlockers`
   * owns "can this creature block at all" and `canBlock` owns evasion, so a
   * button offered here is a block the rules would accept. A creature already
   * standing in front of something is not offered again: `BLOCK` appends to the
   * declaration, so a second press would put the same body in the way twice.
   */
  const canDeclareBlock =
    mine &&
    card.zone === 'battlefield' &&
    state.step === 'declare_blockers' &&
    isUnderAttack(state, viewerPlayerId) &&
    !blocking &&
    eligibleBlockers(state, viewerPlayerId).some(c => c.instanceId === card.instanceId);

  if (canDeclareBlock) {
    for (const declaration of state.combat.attackers) {
      if (declaration.defenderPlayerId !== viewerPlayerId) continue;
      const attacker = state.cards[declaration.attackerId];
      if (!attacker || !canBlock(state, attacker, card)) continue;
      actions.push({
        id: `block:${declaration.attackerId}`,
        kind: 'block',
        label: `Block ${attacker.name}`,
        hint:
          `${card.name} (${statLineIn(state, card) ?? '?'}) stands in front of ` +
          `${attacker.name} (${statLineIn(state, attacker) ?? '?'})`,
        tone: 'primary',
        attackerId: declaration.attackerId,
      });
    }
  }

  if (mine && card.zone === 'battlefield') {
    /* Tap is the everyday one, so it goes last among the primaries and drops to
       quiet whenever there is a combat decision competing with it. */
    actions.push({
      id: card.tapped ? 'untap' : 'tap',
      kind: card.tapped ? 'untap' : 'tap',
      label: card.tapped ? 'Untap' : 'Tap',
      hint: card.tapped ? `Untap ${card.name}` : `Tap ${card.name} for mana or a cost`,
      tone: canDeclareAttack || canDeclareBlock ? 'quiet' : 'primary',
    });
  }

  if (declared) {
    blocked.push({ id: 'attacking', reason: `${card.name} is already attacking.` });
  }
  if (blocking) {
    const attacker = state.cards[blocking.attackerId];
    blocked.push({
      id: 'blocking',
      reason: attacker ? `${card.name} is already blocking ${attacker.name}.` : `${card.name} is already blocking.`,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Somebody else's card                                                   */
  /* ---------------------------------------------------------------------- */

  if (!mine && options.canFocusSeat && controller) {
    actions.push({
      id: 'focus-seat',
      kind: 'focus-seat',
      label: `Look at ${controller.name}'s board`,
      hint: `Fill the screen with ${controller.name}'s side of the table`,
      tone: 'quiet',
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Manual moves, for the parts of Magic the engine does not automate      */
  /* ---------------------------------------------------------------------- */

  if (mine) {
    for (const target of MOVE_TARGETS) {
      if (target.zone === card.zone) continue;
      moves.push({
        id: `move:${target.zone}`,
        kind: 'move',
        label: target.label,
        hint: `Move ${card.name} to your ${target.zone}`,
        tone: 'quiet',
        zone: target.zone,
      });
    }
  }

  return { actions, blocked, moves };
}

/**
 * The card's current standing, as short chips: tapped, sick, damaged, counters.
 *
 * Presentation reads this rather than assembling it, so the preview and any
 * other surface that wants the same summary say the same words.
 */
export function cardNotes(state: GameState, card: CardInstance): string[] {
  const notes: string[] = [];
  if (card.tapped) notes.push('Tapped');
  if (card.summoningSick && card.zone === 'battlefield') notes.push('Summoning sick');
  if (card.damage > 0) notes.push(`${card.damage} damage`);
  for (const [key, value] of Object.entries(card.counters)) {
    if (value !== 0) notes.push(`${value > 0 ? '+' : ''}${value} ${key}`);
  }
  if (state.combat.attackers.some(d => d.attackerId === card.instanceId)) notes.push('Attacking');
  const blocking = state.combat.attackers.find(d => d.blockedBy.indexOf(card.instanceId) !== -1);
  if (blocking) {
    const attacker = state.cards[blocking.attackerId];
    notes.push(attacker ? `Blocking ${attacker.name}` : 'Blocking');
  }
  return notes;
}
