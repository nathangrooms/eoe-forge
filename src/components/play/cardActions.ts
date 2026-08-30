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
  auraNeedsHost,
  canBlock,
  castTiming,
  commanderZoneOfferFor,
  eligibleAttackers,
  eligibleBlockers,
  isLand,
  isUnderAttack,
  planCastFromHand,
  planLandDrop,
  planSpellTargets,
  spellNeedsATarget,
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
  /**
   * `move` into a library: which END of it.
   *
   * ---------------------------------------------------------------------------
   * "TO LIBRARY" USED TO MEAN "ON TOP", SILENTLY, AND THE LABEL NEVER SAID SO
   * ---------------------------------------------------------------------------
   * `moveTo` in `manual.ts` has always taken a position and no caller has ever
   * passed one; `handleMoveZone` in `Play.tsx` filled in `'top'`. So the one
   * control for putting a card into a library did the opposite of what half the
   * cards that ask for it say, with a label that gave the player nothing to
   * notice.
   *
   * Measured, and it is not hypothetical: a real goldfish run on 29 Aug 2026
   * dealt Condemn into the opening hand, whose entire effect is *put target
   * attacking creature on the bottom of its owner's library*. The engine does
   * not automate it, and the only by-hand control available put the creature on
   * top instead. The two ends are now two controls that say which they are.
   */
  position?: 'top' | 'bottom';
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
const MOVE_TARGETS: ReadonlyArray<{ zone: Zone }> = [
  { zone: 'hand' },
  { zone: 'battlefield' },
  { zone: 'graveyard' },
  { zone: 'exile' },
  /* Drawn as two controls, top and bottom. */
  { zone: 'library' },
];

/**
 * THE WORDS A PLAYER USES FOR THE MOVE THEY ARE MAKING.
 *
 * Owner, on a screenshot of this panel: *"this has a sacrifice ability which I
 * cannot cast?"* The control they were looking for was there. It was called
 * **To graveyard**, which is the engine's word for the zone and nobody's word
 * for the act, and it was below the fold underneath twenty by-hand chips.
 *
 * The move is the same move. Only its name changes, with the zone the card is
 * LEAVING, because that is what decides which act it is:
 *
 *   battlefield -> graveyard   you SACRIFICE a permanent
 *   hand        -> graveyard   you DISCARD a card
 *   battlefield -> hand        you RETURN it to your hand
 *
 * Project law, design rule 3: MTG-native, not generic-web-app. A destination is
 * not an action, and a player scanning for the word "sacrifice" will not find it
 * in a list of destinations however carefully that list is laid out.
 */
export function moveLabel(from: Zone, to: Zone): string {
  if (to === 'graveyard') {
    if (from === 'battlefield') return 'Sacrifice';
    if (from === 'hand') return 'Discard';
    return 'To graveyard';
  }
  if (to === 'hand') return from === 'battlefield' ? 'Return to hand' : 'To hand';
  if (to === 'exile') return 'Exile';
  if (to === 'battlefield') return 'To battlefield';
  return 'To library';
}

/** The whole sentence behind the label, for the tooltip and the screen reader. */
export function moveHint(name: string, from: Zone, to: Zone): string {
  if (to === 'graveyard' && from === 'battlefield') return `Sacrifice ${name}. It goes to your graveyard.`;
  if (to === 'graveyard' && from === 'hand') return `Discard ${name}. It goes to your graveyard.`;
  if (to === 'graveyard') return `Put ${name} into your graveyard`;
  if (to === 'hand' && from === 'battlefield') return `Return ${name} to your hand`;
  if (to === 'hand') return `Put ${name} into your hand`;
  if (to === 'exile') return `Exile ${name}`;
  if (to === 'battlefield') return `Put ${name} onto the battlefield`;
  return `Put ${name} into your library`;
}

/* -------------------------------------------------------------------------- */
/* ONE ANSWER TO "CAN I PLAY THIS FROM MY HAND"                               */
/* -------------------------------------------------------------------------- */
/**
 * Whether this card in this hand can be played right now, and why not.
 *
 * ## The bug this exists to end
 *
 * The fan and the preview each answered this question for themselves, and they
 * answered it differently. `ViewerHand` asked `planCastFromHand` alone, which
 * documents itself as answering COST AND ZONE and nothing else. The preview
 * asked `castTiming` as well, and withheld a plain Cast from a spell that names
 * a target because CR 601.2c chooses targets as the spell is cast.
 *
 * So the hand said "Crumb and Get It. You can cast this." and the panel under
 * it said "There is nothing this could target." Measured over 4,000 real cards
 * from the harness pool, on your own main phase with a board that could pay for
 * anything, before this function existed:
 *
 *   fan says playable            3,854
 *   preview offers a play        3,547
 *   FAN PROMISES, PANEL REFUSES    307      (7.7% of the sample)
 *
 * and in the untap step, where the fan asked nothing about timing at all, the
 * same sample disagreed on 3,410 cards.
 *
 * Both surfaces call this now, so the number is zero by construction rather
 * than by two files being kept in step by hand.
 *
 * ## `needsTarget` is not a refusal
 *
 * A Murder with a creature on the board is perfectly castable; the player has
 * simply not said what at yet. That is a legal play with one question left, so
 * it comes back `ok` and the fan leaves it bright. A Murder with an empty board
 * is CR 601.2c illegal, and that comes back refused, carrying the engine's own
 * sentence rather than a paraphrase of it.
 */
export interface HandPlayVerdict {
  /** True when pressing through to the preview leads to a real play. */
  ok: boolean;
  /** What the play would be. `null` when this card is not playable from here. */
  kind: 'play-land' | 'cast' | null;
  /** One sentence, in a player's words. Empty when `ok`. */
  reason: string;
  /**
   * Legal, but the player still has to name what it is aimed at.
   *
   * The preview draws `SpellTargetPanel` for these rather than a plain Cast
   * button, so a caller that wants to say "press this and you will be asked
   * something" has the flag to say it with.
   */
  needsTarget: boolean;
}

const NOT_PLAYABLE: HandPlayVerdict = { ok: false, kind: null, reason: '', needsTarget: false };

export function handPlayVerdict(
  state: GameState,
  viewerPlayerId: PlayerId,
  card: CardInstance,
  options: Pick<CardActionOptions, 'freeCast' | 'holdReason'> = {}
): HandPlayVerdict {
  if (card.controllerId !== viewerPlayerId) return NOT_PLAYABLE;
  if (card.zone !== 'hand' && card.zone !== 'command') return NOT_PLAYABLE;

  /* The opening hand is not settled. Said as a sentence, because a card that
     goes quiet during the mulligan is the silence the project forbids. */
  if (options.holdReason) {
    return { ok: false, kind: null, reason: options.holdReason, needsTarget: false };
  }

  if (isLand(card)) {
    if (card.zone !== 'hand') return NOT_PLAYABLE;
    const plan = planLandDrop(state, viewerPlayerId, card.instanceId);
    return { ok: plan.ok, kind: 'play-land', reason: plan.ok ? '' : plan.reason, needsTarget: false };
  }

  /* WHEN comes before WHETHER IT IS PAID FOR. "Needs 2 mana" is the wrong
     sentence to read on the opponent's untap step, because paying would not
     help. Same precedence the preview has always used. */
  const timing = castTiming(state, viewerPlayerId, card);
  if (!timing.ok) return { ok: false, kind: 'cast', reason: timing.reason, needsTarget: false };

  const plan = planCastFromHand(state, viewerPlayerId, card.instanceId, {
    ignoreMana: options.freeCast,
  });
  if (!plan.ok) return { ok: false, kind: 'cast', reason: plan.reason, needsTarget: false };

  /* An Aura's host is already asked for by `planCastFromHand` through
     `hostChoices`, and that answer already rides onto the stack as the target.
     Asking again here would refuse a spell the engine has already aimed. */
  if (auraNeedsHost(card) || !spellNeedsATarget(card)) {
    return { ok: true, kind: 'cast', reason: '', needsTarget: false };
  }

  /* CR 601.2c. `pending` empty with a reason set is the engine saying there is
     nothing legal to point at; `pending` non-empty is it asking a question,
     which is a play with a step left in it rather than a refusal. */
  const aim = planSpellTargets(state, viewerPlayerId, card);
  if (aim.reason && aim.pending.length === 0) {
    return { ok: false, kind: 'cast', reason: aim.reason, needsTarget: true };
  }

  return { ok: true, kind: 'cast', reason: '', needsTarget: true };
}

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
    const plan = handPlayVerdict(state, viewerPlayerId, card, options);
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
    /*
     * WHEN, as well as whether it is paid for, and whether there is anything to
     * aim it at. All three now come from `handPlayVerdict`, which the fan calls
     * too, so the two surfaces cannot answer this differently again. The
     * precedence it applies is the one this list has always used: timing beats
     * cost, because paying would not help on the opponent's untap step.
     */
    const verdict = handPlayVerdict(state, viewerPlayerId, card, options);
    /* Still needed for the tax, which is a number rather than a verdict. */
    const plan = planCastFromHand(state, viewerPlayerId, card.instanceId, {
      ignoreMana: options.freeCast,
    });
    const commander = card.zone === 'command';
    /* The tax is mana, so it is said in mana. "plus 4 tax" reads as a fee in
       some other currency, and a player pricing their turn is counting lands. */
    const label = commander
      ? plan.tax > 0
        ? `Cast commander, ${plan.tax} more mana`
        : 'Cast commander'
      : 'Cast';
    /*
     * A SPELL THAT NAMES A TARGET IS NOT OFFERED A PLAIN CAST BUTTON.
     *
     * CR 601.2c — targets are chosen as the spell is cast, and a plain Cast
     * would announce it aimed at nobody: Lightning Bolt on the stack, no target
     * on the object, resolves and deals damage to nothing. That is exactly what
     * happened until 23 Aug 2026, and it looked like an engine that had not
     * implemented the card.
     *
     * `SpellTargetPanel` is where it is cast from instead, and this is the same
     * rule `CenterPreview` already applies to an Aura for the same reason: an
     * Aura is cast AT something and its host row is where that is chosen. Both
     * refusals point at a control that is on screen, so nothing goes silent.
     */
    if (verdict.ok && !verdict.needsTarget) {
      actions.push({
        id: 'cast',
        kind: 'cast',
        label,
        hint: commander && plan.tax > 0
          ? `Cast ${card.name} from the command zone. ${plan.tax} of the cost is commander tax.`
          : `Cast ${card.name}`,
        tone: 'primary',
      });
    } else if (!verdict.ok && !verdict.needsTarget) {
      blocked.push({ id: 'cast', reason: verdict.reason });
    }
    /* A spell refused for want of a legal target says so through
       `SpellTargetPanel`, in the engine's own words, right where the targets
       would have been chosen. Repeating it here would print the same sentence
       twice in one preview. The FAN still gets it, from `handPlayVerdict`
       directly, which is the half that used to promise a cast it could not
       deliver. */
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
      /* A library has two ends and Magic asks for both by name, so it gets two
         controls. Every other zone is one place. */
      if (target.zone === 'library') {
        moves.push(
          {
            id: 'move:library:top',
            kind: 'move',
            label: 'Top of library',
            hint: `Put ${card.name} on top of your library`,
            tone: 'quiet',
            zone: 'library',
            position: 'top',
          },
          {
            id: 'move:library:bottom',
            kind: 'move',
            label: 'Bottom of library',
            hint: `Put ${card.name} on the bottom of your library`,
            tone: 'quiet',
            zone: 'library',
            position: 'bottom',
          }
        );
        continue;
      }
      moves.push({
        id: `move:${target.zone}`,
        kind: 'move',
        label: moveLabel(card.zone, target.zone),
        hint: moveHint(card.name, card.zone, target.zone),
        tone: 'quiet',
        zone: target.zone,
      });
    }
  }

  return { actions, blocked, moves };
}

/**
 * The card's current standing, as short chips: tapped, sick, attacking,
 * blocking.
 *
 * Presentation reads this rather than assembling it, so the preview and any
 * other surface that wants the same summary say the same words.
 *
 * ---------------------------------------------------------------------------
 * IT NO LONGER CARRIES DAMAGE OR COUNTERS, AND THAT IS TWO FIXES AT ONCE
 * ---------------------------------------------------------------------------
 * It used to walk `card.counters` and print `${delta} ${key}` for every entry.
 * Measured on a real board by `scripts/play-mark-shots.mjs`, that put
 * *"+6 mark:d20"* and *"+1 mark:sac at end"* on screen at 11px: the storage
 * prefix `marks.ts` exists to fence, on the table, in front of the player. This
 * project has shipped a parser's notation onto the mat once already — the `~`
 * in the upkeep strip, recorded in `manual.ts` — and this was the same bug
 * arriving by a different door.
 *
 * The prefix could have been stripped here. It is the wrong fix, because these
 * chips were also the THIRD drawing of the same facts. `CenterPreview` states
 * damage, counters and marks in the state row beside the power and toughness,
 * in the same visual family the mat uses; `GameCardView` draws them on the card
 * itself. A row of small grey pills repeating both is the wall of undifferentiated
 * text the owner asked to be rid of.
 *
 * So this keeps only what the state row does NOT say: the four standings that
 * are about what the permanent is DOING rather than what it is carrying.
 */
export function cardNotes(state: GameState, card: CardInstance): string[] {
  const notes: string[] = [];
  if (card.tapped) notes.push('Tapped');
  if (card.summoningSick && card.zone === 'battlefield') notes.push('Summoning sick');
  if (state.combat.attackers.some(d => d.attackerId === card.instanceId)) notes.push('Attacking');
  const blocking = state.combat.attackers.find(d => d.blockedBy.indexOf(card.instanceId) !== -1);
  if (blocking) {
    const attacker = state.cards[blocking.attackerId];
    notes.push(attacker ? `Blocking ${attacker.name}` : 'Blocking');
  }
  return notes;
}
