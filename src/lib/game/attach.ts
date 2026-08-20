/**
 * DeckMatrix — shared game-state core: attachments (CR 301.5, 303.4, 702.6).
 *
 * ## What was missing, stated plainly
 *
 * `ATTACH` had a validation entry, two reducer cases, a log line, a state-based
 * action that unattaches correctly under CR 704.5n, and its own passing tests.
 * Nothing had ever constructed one. Measured over the harness pool: 672
 * Equipment, 1,299 Auras and 674 printed equip abilities, none of which could
 * do the single thing they exist to do. The harness measured the consequence
 * over 80 games as Equipment attaching 136 chances 0 times and Aura attaching
 * 70 chances 0 times.
 *
 * The gap had three parts and closing any two of them without the third would
 * have been worse than leaving it alone, because an equip control that visibly
 * works and grants nothing is a card lying about itself:
 *
 *   1. nothing built the action;
 *   2. nothing drew a control;
 *   3. nothing was known to turn an attached permanent into a continuous
 *      effect.
 *
 * The third turned out to be **already done**, and it is worth writing down
 * because it changes what this module has to be. `abilities/statics.ts` scans
 * the battlefield and resolves each static ability's `affects` selector, and
 * `abilities/context.ts` has always answered `{sel:'attached'}` by reading
 * `card.attachedTo`. The compiler has always turned "Equipped creature gets
 * +2/+0" into exactly that selector. So the moment an `ATTACH` is applied, the
 * layer engine picks the effect up in layer 7c, and a granted keyword in layer
 * 6, with no cache to invalidate and nothing to unwrite when the Equipment
 * leaves — the effect list is rebuilt from the board on every state. Measured
 * before writing a line of this: a Grizzly Bears reads 2/2, an ATTACH of
 * Bonesplitter makes it 4/2, and Rancor on top makes it 6/2 with trample.
 *
 * So this module is the other two parts, and it deliberately does NOT contain a
 * fourth implementation of what an attachment grants.
 *
 * ## One legality rule, not two
 *
 * `sba.ts` already knows, thoroughly, when an attachment is on something it
 * must not be on. Rather than write a second opinion for the moment a target is
 * chosen, `illegalHostReason` asks `sba.ts`'s own predicates about a
 * HYPOTHETICAL attachment, and targeting is simply "the hosts that answer null".
 * A player therefore cannot be offered a host that the very next state-based
 * action check would tear the attachment off, which is the failure mode a
 * separate targeting rule would eventually produce.
 *
 * The one thing added on top is the controller words in an "Enchant …" line,
 * because CR 601.2c chooses targets legally at announcement while CR 704.5m
 * only bins an Aura whose illegality this model can see. Asking for both is
 * stricter than SBA in exactly one direction, which is the safe one, and it is
 * why "Enchant creature you control" cannot be pointed across the table.
 *
 * Pure: no clock, no randomness, no I/O, no React.
 */

import type { CardInstance, GameState, InstanceId, PlayerId } from './types.ts';
import { getCard, getPlayer } from './rules.ts';
import { canBeTargetedBy } from './keywords.ts';
import { enchantSubject, illegalAuraReason, illegalEquipmentReason, isAura, isEquipment } from './sba.ts';
import { scanStatics } from './abilities/statics.ts';
import { boardCharacteristics } from './characteristics.ts';
import { readableClause } from './manual.ts';

/* -------------------------------------------------------------------------- */
/* What kind of thing this is                                                 */
/* -------------------------------------------------------------------------- */

export type AttachmentKind = 'equipment' | 'aura' | 'fortification';

/**
 * Is this card something that attaches, and what kind?
 *
 * Read off the type line, the same way `sba.ts` reads it, because that is what
 * the rules key on. A Fortification is vanishingly rare (two cards in the
 * 38,626-row bulk file) and costs one word to include.
 */
export function attachmentKindOf(card: CardInstance | null | undefined): AttachmentKind | null {
  if (!card) return null;
  if (isEquipment(card)) return 'equipment';
  if (isAura(card)) return 'aura';
  if ((card.typeLine ?? '').toLowerCase().includes('fortification')) return 'fortification';
  return null;
}

export function isAttachment(card: CardInstance | null | undefined): boolean {
  return attachmentKindOf(card) !== null;
}

/**
 * The "Enchant …" line, verbatim, or null.
 *
 * Shown beside the choice of host so a player is reading the card's own words
 * rather than this engine's paraphrase of them.
 */
export function enchantClauseOf(card: CardInstance | null | undefined): string | null {
  if (!card) return null;
  const match = /(?:^|\n)\s*(Enchant [^\n.]*)/i.exec(card.oracleText ?? '');
  return match ? match[1].trim() : null;
}

/* -------------------------------------------------------------------------- */
/* Legality                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The controller words in an "Enchant …" line, as a test on the host.
 *
 * Only the two spellings that are unambiguous. "Enchant creature you control"
 * (58 rows) and "Enchant creature an opponent controls" (5) are the whole of
 * what is recognised; anything else returns null and imposes no restriction,
 * which is the same partial-but-never-wrong bargain `illegalAuraReason` takes
 * with type words.
 */
function controllerRestriction(subject: string): 'you' | 'opponent' | null {
  if (/\byou control\b/.test(subject)) return 'you';
  if (/\ban opponent controls\b/.test(subject)) return 'opponent';
  return null;
}

/**
 * Why this attachment may not go on this host, or null when it may.
 *
 * A sentence, never a code, because it is drawn on the mat under the control
 * that is refusing.
 */
export function illegalHostReason(
  state: GameState,
  attachment: CardInstance,
  hostId: InstanceId
): string | null {
  const host = getCard(state, hostId);
  if (!host) return 'That permanent is not in this game.';
  if (host.removedFromGame) return `${host.name} has left the game.`;
  if (host.zone !== 'battlefield') return `${host.name} is not on the battlefield.`;
  if (hostId === attachment.instanceId) return `${attachment.name} cannot be attached to itself.`;

  const kind = attachmentKindOf(attachment);
  if (!kind) return `${attachment.name} is not an Equipment or an Aura.`;

  /*
   * The hypothetical. `sba.ts` answers "is this attachment legally attached"
   * for a card it is handed, so handing it the card as it WOULD be is the same
   * question asked one moment earlier, answered by the same code.
   */
  const hypothetical: CardInstance = { ...attachment, zone: 'battlefield', attachedTo: hostId };

  const equipmentReason = illegalEquipmentReason(state, hypothetical);
  if (equipmentReason) return sentence(attachment, host, equipmentReason);

  const auraReason = illegalAuraReason(state, hypothetical);
  if (auraReason) return sentence(attachment, host, auraReason);

  const subject = enchantSubject(attachment);
  if (subject) {
    const restriction = controllerRestriction(subject);
    const controller = host.controllerId;
    if (restriction === 'you' && controller !== attachment.controllerId) {
      return `${attachment.name} enchants a creature you control, and ${host.name} is not yours.`;
    }
    if (restriction === 'opponent' && controller === attachment.controllerId) {
      return `${attachment.name} enchants a creature an opponent controls, and ${host.name} is yours.`;
    }
  }

  return null;
}

function sentence(attachment: CardInstance, host: CardInstance, reason: string): string {
  return `${attachment.name} cannot go on ${host.name}: ${reason}.`;
}

/**
 * Every permanent this attachment could legally be put on right now.
 *
 * `chooserId` is whoever is making the choice, and it is checked separately
 * from the host's controller: CR 115.6 hexproof and shroud are about who is
 * choosing, while the "you control" clause above is about who controls the
 * host. An Aura you cast on an opponent's hexproof creature fails the first and
 * passes the second.
 */
export function legalHostsFor(
  state: GameState,
  chooserId: PlayerId,
  attachment: CardInstance | null | undefined
): InstanceId[] {
  if (!attachment) return [];
  const out: InstanceId[] = [];
  for (const player of state.players) {
    for (const instanceId of player.zones.battlefield) {
      const host = getCard(state, instanceId);
      if (!host) continue;
      if (illegalHostReason(state, attachment, instanceId)) continue;
      if (!canBeTargetedBy(host, chooserId, attachment)) continue;
      out.push(instanceId);
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Auras, on the way in                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Does casting this card require naming a permanent to attach it to?
 *
 * True for an Aura that enchants an object. False for the 51 Auras that enchant
 * a PLAYER or an opponent: this model gives instance ids to permanents only, so
 * such an Aura has nothing to point at, sits on the battlefield attached to
 * nothing, and `sba.ts` correctly declines to judge it. Also false for an
 * Equipment, which enters unattached and is equipped later, and that difference
 * is the whole reason Equipment and Auras need two different paths rather than
 * one.
 */
export function auraNeedsHost(card: CardInstance | null | undefined): boolean {
  if (!card || attachmentKindOf(card) !== 'aura') return false;
  const subject = enchantSubject(card);
  if (!subject) return false;
  return !subject.includes('player') && !subject.includes('opponent');
}

/** What to say above the row of hosts. The card's own line where it has one. */
export function hostPrompt(card: CardInstance | null | undefined): string {
  return enchantClauseOf(card) ?? 'Choose a permanent to attach this to';
}

/* -------------------------------------------------------------------------- */
/* Attachments, on the way out                                                */
/* -------------------------------------------------------------------------- */

/** Everything currently attached to this permanent, in arrival order. */
export function attachmentsOn(state: GameState, hostId: InstanceId): CardInstance[] {
  const out: CardInstance[] = [];
  for (const player of state.players) {
    for (const instanceId of player.zones.battlefield) {
      const card = getCard(state, instanceId);
      if (!card || card.removedFromGame) continue;
      if (card.attachedTo === hostId) out.push(card);
    }
  }
  return out;
}

/** The permanent this attachment is on, or undefined. */
export function hostOf(state: GameState, card: CardInstance | null | undefined): CardInstance | undefined {
  if (!card?.attachedTo) return undefined;
  const host = getCard(state, card.attachedTo);
  return host && !host.removedFromGame ? host : undefined;
}

/** What an attachment is currently giving its host. Never a guess. */
export interface AttachmentGrant {
  instanceId: InstanceId;
  name: string;
  kind: AttachmentKind;
  /** "+2/+0" when the layer engine is applying one, otherwise empty. */
  statLine: string;
  /** Keywords layer 6 is currently adding, lowercase. */
  keywords: string[];
  /**
   * The card's own clauses, verbatim, for every continuous effect the layer
   * engine is applying from this attachment.
   *
   * This is the honest floor. `statLine` and `keywords` cover the two shapes
   * that can be read off a modification exactly; everything else is reported by
   * quoting the card rather than by inventing a summary of it.
   */
  clauses: string[];
}

const signed = (value: number) => (value >= 0 ? `+${value}` : `${value}`);

/**
 * What each attachment on this permanent is granting it, read out of the layer
 * engine's own applied-effect trace.
 *
 * NOT recomputed and not paraphrased. `boardCharacteristics(state).trace`
 * records which effects actually applied to which objects, so an effect that
 * was skipped — its source gone, its condition false — is absent here for the
 * same reason it is absent from the board. That is what makes this safe to draw
 * beside a creature: it cannot claim a bonus the creature is not getting.
 *
 * A modification whose value is a `DynamicValue` rather than a plain number is
 * left out of `statLine` and shows up as a quoted clause instead. Printing a
 * number this function did not compute would be the fabrication the project
 * forbids, and the clause says the true thing.
 */
export function grantsOn(state: GameState, hostId: InstanceId): AttachmentGrant[] {
  const attachments = attachmentsOn(state, hostId);
  if (attachments.length === 0) return [];

  const layered = boardCharacteristics(state);
  const applied = new Set(
    layered.trace.filter(step => step.targets.includes(hostId)).map(step => step.effectId)
  );
  const effects = scanStatics(state).effects;

  return attachments.map(attachment => {
    let power = 0;
    let toughness = 0;
    let sawPT = false;
    const keywords: string[] = [];
    const clauses: string[] = [];

    for (const effect of effects) {
      if (effect.sourceId !== attachment.instanceId) continue;
      if (!applied.has(effect.id)) continue;

      // `note` is `"<card name>: <verbatim clause>"`, built by `statics.ts`.
      const clause = effect.note?.slice(effect.note.indexOf(':') + 1).trim();
      if (clause && !clauses.includes(clause)) clauses.push(clause);

      for (const part of effect.parts) {
        const modification = part.modification;
        if (modification.kind === 'modify-pt') {
          if (typeof modification.power === 'number') { power += modification.power; sawPT = true; }
          if (typeof modification.toughness === 'number') { toughness += modification.toughness; sawPT = true; }
        } else if (modification.kind === 'ability') {
          for (const ability of modification.addAbilities ?? []) {
            if (!keywords.includes(ability)) keywords.push(ability);
          }
        }
      }
    }

    return {
      instanceId: attachment.instanceId,
      name: attachment.name,
      kind: attachmentKindOf(attachment) ?? 'aura',
      statLine: sawPT ? `${signed(power)}/${signed(toughness)}` : '',
      keywords,
      clauses,
    };
  });
}

/**
 * One line a player can read at a glance: what this permanent is carrying.
 *
 * Empty when it carries nothing, so a caller can use it as the test for whether
 * to draw anything at all.
 */
export function carriesSummary(state: GameState, hostId: InstanceId): string {
  const grants = grantsOn(state, hostId);
  if (grants.length === 0) return '';
  return grants
    .map(grant => {
      const bonus = [grant.statLine, ...grant.keywords].filter(Boolean).join(', ');
      return bonus ? `${grant.name} ${bonus}` : grant.name;
    })
    .join(' · ');
}

/**
 * The clause an attachment is applying, with the compiler's tilde put back to
 * the card's name, for a caller drawing the full account.
 */
export function readableGrantClause(card: CardInstance, clause: string): string {
  return readableClause(clause, card);
}

/**
 * Is this player allowed to move this attachment around at all?
 *
 * Only used to decide whether to draw the equip control on somebody else's
 * Equipment. Kept here so the answer sits beside the rest of the attachment
 * rules rather than in a component.
 */
export function canMoveAttachment(state: GameState, playerId: PlayerId, card: CardInstance): boolean {
  if (!isAttachment(card) || card.zone !== 'battlefield') return false;
  if (card.controllerId !== playerId) return false;
  return !!getPlayer(state, playerId);
}
