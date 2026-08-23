/**
 * DeckMatrix — XMage card-local effect bodies, TRANSLATED BY MACHINE.
 *
 * !! GENERATED FILE. DO NOT EDIT. !!
 * Source of truth: scripts/xmage/translate-bodies.mjs and
 * scripts/xmage/lib/translate.mjs. A hand edit here is lost on the next run,
 * and a wrong body is fixed in the translator, never here.
 *
 * Regenerate:  node scripts/xmage/translate-bodies.mjs
 * Report:      scripts/coverage/.data/xmage-translation.json
 *
 * Each entry is one XMage card-local class whose `apply(Game, Ability)` method
 * translated completely. A body with ONE unmapped call, constructor, constant or
 * statement is not in this file at all: it is counted as blocked on that thing
 * by name, so the next tranche of API work is chosen by evidence rather than by
 * taste. Half a card resolving would be worse than no card resolving.
 *
 * Ported from **XMage**, MIT licensed, `Copyright (c) 2010 betasteward@gmail.com`,
 * https://github.com/magefree/mage. The clone is read in place and nothing from
 * it is vendored. XMage's display strings are NOT copied — those carry Wizards
 * of the Coast rules text, which is not XMage's to license. Where our API takes
 * a prompt the translator passes an empty string and the caller supplies wording
 * from Scryfall.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import type { XGame } from './objects.ts';
import type { XAbility } from './targets.ts';
import type { XmageBody } from './index.ts';
import { COLOR_CHOICES, CounterType, makeCards, makeChoice, makeToken } from './objects.ts';
import {
  CardType,
  Predicates,
  StaticFilters,
  SubType,
  SuperType,
  anotherPredicate,
  cardTypePredicate,
  colorPredicate,
  controlledByOpponentPredicate,
  controlledByPredicate,
  makeFilter,
  namePredicate,
  subTypePredicate,
  superTypePredicate,
  ownedByPredicate,
  tappedPredicate,
} from './filters.ts';
import { CardUtil, fixedTarget, makeTarget } from './targets.ts';
import {
  boostSourceEffect,
  boostTargetEffect,
  createTokenEffect,
  xmageToken,
} from './effects.ts';

/** One translated body, with where in XMage it came from. */
export interface TranslatedBody {
  /** The XMage card class the body was read out of. */
  card: string;
  /** The card-local effect class that declared `apply`. */
  effect: string;
  /** What that class extends, which says when the body runs. */
  base: string;
  /** Path inside the XMage clone. Read in place; nothing vendored. */
  source: string;
  /**
   * True when the whole body is a bare return of true or false.
   *
   * These are real overrides and they translate perfectly, and they are worth
   * nothing on their own: the class is an AsThoughEffect or a
   * ContinuousEffect whose behaviour lives in a different method. Half of
   * what is in this file is one of these, so the flag is on the record rather
   * than in a document, and no caller can mistake one for behaviour by
   * accident.
   */
  trivial: boolean;
  run: XmageBody;
}

export const TRANSLATED_BODIES: Record<string, TranslatedBody> = {
  "AbattoirGhoul::AbattoirGhoulEffect": {
    card: "AbattoirGhoul",
    effect: "AbattoirGhoulEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AbattoirGhoul.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let creature = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (creature !== null) {
      {
        let toughness = creature.getToughness().getValue();
        if (controller !== null) {
          {
            controller.gainLife(toughness);
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "AberrantMindSorcerer::AberrantMindSorcererEffect": {
    card: "AberrantMindSorcerer",
    effect: "AberrantMindSorcererEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AberrantMindSorcerer.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let card = game.getCard(source.getTargetPointer().getFirst());
    return player !== null && card !== null && player.chooseUse('') && player.putCardsOnTopOfLibrary(card);
      return true;
    },
  },
  "AbstruseAppropriation::AbstruseAppropriationAsThoughEffect": {
    card: "AbstruseAppropriation",
    effect: "AbstruseAppropriationAsThoughEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/a/AbstruseAppropriation.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "AbuelosAwakening::AbuelosAwakeningContinuousEffect": {
    card: "AbuelosAwakening",
    effect: "AbuelosAwakeningContinuousEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/a/AbuelosAwakening.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "AcademicProbation::AcademicProbationRestrictionEffect": {
    card: "AcademicProbation",
    effect: "AcademicProbationRestrictionEffect",
    base: "RestrictionEffect",
    source: "Mage.Sets/src/mage/cards/a/AcademicProbation.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "AcererakTheArchlich::AcererakTheArchlichEffect": {
    card: "AcererakTheArchlich",
    effect: "AcererakTheArchlichEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AcererakTheArchlich.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let tokens = 0;
    for (const playerId of game.getOpponents(source.getControllerId())) {
      {
        tokens++;
        let player = game.getPlayer(playerId);
        if (player === null) {
          {
            continue;
          }
        }
        let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creature().add(controlledByPredicate()), min: 0, max: 1 }).withNotTarget(true);
        (target.choose(game, '', player.getId()).length > 0);
        let permanent = game.getPermanent(target.getFirstTarget());
        if (permanent !== null && permanent.sacrifice()) {
          {
            tokens--;
          }
        }
      }
    }
    if (tokens > 0) {
      {
        xmageToken(game.xmageScope(), "ZombieToken").putOntoBattlefield(tokens, source.getControllerId());
      }
    }
    return true;
      return true;
    },
  },
  "AcidicSoil::AcidicSoilEffect": {
    card: "AcidicSoil",
    effect: "AcidicSoilEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AcidicSoil.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanents = game.getBattlefield().getActivePermanents(StaticFilters.land(), source.getControllerId());
    for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player !== null) {
          {
            let amount = 0;
            for (const permanent of permanents) {
              {
                if (permanent.isControlledBy(playerId)) {
                  {
                    amount++;
                  }
                }
              }
            }
            if (amount > 0) {
              {
                player.damage(amount, source.getSourceId());
              }
            }
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "AcolyteHybrid::AcolyteHybridEffect": {
    card: "AcolyteHybrid",
    effect: "AcolyteHybridEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AcolyteHybrid.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent === null || !permanent.destroy()) {
      {
        return false;
      }
    }
    let player = game.getPlayer(permanent.getControllerId());
    if (player !== null) {
      {
        player.drawCards(1);
      }
    }
    return true;
      return true;
    },
  },
  "AcornCatapult::AcornCatapultEffect": {
    card: "AcornCatapult",
    effect: "AcornCatapultEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AcornCatapult.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player === null) {
      {
        let permanent = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
        if (permanent !== null) {
          {
            player = game.getPlayer(permanent.getControllerId());
          }
        }
      }
    }
    if (player !== null) {
      {
        xmageToken(game.xmageScope(), "SquirrelToken").putOntoBattlefield(1, player.getId());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "AetherWeb::AetherWebEffect": {
    card: "AetherWeb",
    effect: "AetherWebEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/a/AetherWeb.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "AgathasSoulCauldron::AgathasSoulCauldronManaEffect": {
    card: "AgathasSoulCauldron",
    effect: "AgathasSoulCauldronManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/a/AgathasSoulCauldron.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "AgonizingRemorse::AgonizingRemorseEffect": {
    card: "AgonizingRemorse",
    effect: "AgonizingRemorseEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AgonizingRemorse.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let opponent = game.getPlayer(source.getFirstTarget());
    if (controller === null || opponent === null) {
      {
        return false;
      }
    }
    opponent.revealCards('', opponent.getHand());
    let target = undefined;
    let cards = undefined;
    if (controller.chooseUse('')) {
      {
        target = makeTarget(game.xmageScope(), { filter: makeFilter(['nonland','card'], [Predicates.not(cardTypePredicate('land'))]), zone: 'hand' });
        target.withNotTarget(true);
        cards = opponent.getHand();
      }
    } else {
      {
        target = makeTarget(game.xmageScope(), { filter: StaticFilters.card(), zone: 'graveyard' });
        target.withNotTarget(true);
        cards = opponent.getGraveyard();
      }
    }
    if ((target.choose(game, '', controller.getId(), cards.ids()).length > 0)) {
      {
        let card = game.getCard(target.getFirstTarget());
        if (card !== null) {
          {
            controller.moveCards(card, 'exile');
          }
        }
      }
    }
    controller.loseLife(1);
    return true;
      return true;
    },
  },
  "AjaniSleeperAgent::AjaniSleeperAgentEffect": {
    card: "AjaniSleeperAgent",
    effect: "AjaniSleeperAgentEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AjaniSleeperAgent.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let card = controller.getLibrary().getFromTop();
    if (card === null) {
      {
        return false;
      }
    }
    controller.revealCards('', makeCards(game.xmageScope(), []).add(card));
    if (card.isCreature() || card.isPlaneswalker()) {
      {
        controller.moveCards(card, 'hand');
      }
    } else {
      if (controller.chooseUse('')) {
        {
          controller.putCardsOnBottomOfLibrary(card);
        }
      }
    }
    return true;
      return true;
    },
  },
  "AkoumFlameseeker::AkoumFlameseekerEffect": {
    card: "AkoumFlameseeker",
    effect: "AkoumFlameseekerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AkoumFlameseeker.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let cards = controller.discard(1);
        if (!cards.isEmpty()) {
          {
            controller.drawCards(1);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "AkoumStonewaker::AkoumStonewakerEffect": {
    card: "AkoumStonewaker",
    effect: "AkoumStonewakerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AkoumStonewaker.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let effect = createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), "Elemental31TrampleHasteToken"));
    if (effect.apply(game, source)) {
      {
        effect.exileTokensCreatedAtNextEndStep(game, source);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "AlienSymbiosis::AlienSymbiosisGraveyardEffect": {
    card: "AlienSymbiosis",
    effect: "AlienSymbiosisGraveyardEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/a/AlienSymbiosis.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "AliveWell::WellEffect": {
    card: "AliveWell",
    effect: "WellEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AliveWell.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player !== null) {
      {
        let life = 2 * game.getBattlefield().count(StaticFilters.creatureYouControl(), source.getControllerId());
        player.gainLife(life);
      }
    }
    return true;
      return true;
    },
  },
  "AlpineMoon::AlpineMoonEffect": {
    card: "AlpineMoon",
    effect: "AlpineMoonEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/a/AlpineMoon.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "AminatousAugury::AminatousAuguryCastFromExileEffect": {
    card: "AminatousAugury",
    effect: "AminatousAuguryCastFromExileEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/a/AminatousAugury.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "AmphinMutineer::AmphinMutineerEffect": {
    card: "AmphinMutineer",
    effect: "AmphinMutineerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AmphinMutineer.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    let player = game.getPlayer(permanent.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    player.moveCards(permanent, 'exile');
    xmageToken(game.xmageScope(), "SalamanderWarriorToken").putOntoBattlefield(1, player.getId());
    return true;
      return true;
    },
  },
  "AnaBattlemage::AnaBattlemageEffect": {
    card: "AnaBattlemage",
    effect: "AnaBattlemageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AnaBattlemage.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetCreature = game.getPermanent(source.getTargetPointer().getFirst());
    if (targetCreature === null) {
      {
        return false;
      }
    }
    let controller = game.getPlayer(targetCreature.getControllerId());
    return controller !== null && controller.damage(targetCreature.getPower().getValue(), source.getSourceId()) > 0;
      return true;
    },
  },
  "AncestorDragon::AncestorDragonEffect": {
    card: "AncestorDragon",
    effect: "AncestorDragonEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AncestorDragon.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let you = game.getPlayer(source.getControllerId());
    if (you !== null) {
      {
        let attackers = game.getCombat().getAttackers().length;
        you.gainLife(attackers);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "AncientRunes::AncientRunesDamageTargetEffect": {
    card: "AncientRunes",
    effect: "AncientRunesDamageTargetEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AncientRunes.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player !== null) {
      {
        let damage = game.getBattlefield().getAllActivePermanents(makeFilter(["artifact", "you", "control"], [controlledByPredicate(), cardTypePredicate("artifact")]), source.getTargetPointer().getFirst()).length;
        player.damage(damage, source.getSourceId());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "AngelOfDestiny::AngelOfDestinyGainLifeEffect": {
    card: "AngelOfDestiny",
    effect: "AngelOfDestinyGainLifeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AngelOfDestiny.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    let damage = Number(game.getState().getValue("damage"));
    if (controller !== null) {
      {
        controller.gainLife(damage);
      }
    }
    if (player !== null) {
      {
        player.gainLife(damage);
      }
    }
    return true;
      return true;
    },
  },
  "AngelicFavor::AngelicFavorEffect": {
    card: "AngelicFavor",
    effect: "AngelicFavorEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AngelicFavor.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let effect = createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), "AngelToken"));
    if (effect.apply(game, source)) {
      {
        effect.exileTokensCreatedAtNextEndStep(game, source);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "AngrathMinotaurPirate::AngrathMinotaurPirateThirdAbilityEffect": {
    card: "AngrathMinotaurPirate",
    effect: "AngrathMinotaurPirateThirdAbilityEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AngrathMinotaurPirate.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetOpponent = game.getPlayer(source.getTargetPointer().getFirst());
    if (targetOpponent !== null) {
      {
        let powerSum = 0;
        for (const permanent of game.getBattlefield().getAllActivePermanents(StaticFilters.creature(), source.getSourceId())) {
          {
            permanent.destroy(false);
            powerSum += permanent.getPower().getValue();
          }
        }
        game.processAction();
        targetOpponent.damage(powerSum, source.getSourceId());
      }
    }
    return true;
      return true;
    },
  },
  "AnimateArtifact::AnimateArtifactContinuousEffect": {
    card: "AnimateArtifact",
    effect: "AnimateArtifactContinuousEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/a/AnimateArtifact.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "AnotherChance::AnotherChanceMillEffect": {
    card: "AnotherChance",
    effect: "AnotherChanceMillEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AnotherChance.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    if (player.chooseUse('')) {
      {
        player.millCards(2);
      }
    }
    return true;
      return true;
    },
  },
  "AntMansArmy::AntMansArmyEffect": {
    card: "AntMansArmy",
    effect: "AntMansArmyEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AntMansArmy.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let token = (player.chooseUse('') ? xmageToken(game.xmageScope(), "FoodToken") : xmageToken(game.xmageScope(), "TreasureToken"));
    return token.putOntoBattlefield(1, source.getControllerId());
      return true;
    },
  },
  "AnvilOfBogardan::AnvilOfBogardanEffect": {
    card: "AnvilOfBogardan",
    effect: "AnvilOfBogardanEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AnvilOfBogardan.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    if (targetPlayer !== null) {
      {
        targetPlayer.drawCards(1);
        targetPlayer.discard(1);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "ArchfiendOfDepravity::ArchfiendOfDepravityEffect": {
    card: "ArchfiendOfDepravity",
    effect: "ArchfiendOfDepravityEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/ArchfiendOfDepravity.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let opponent = game.getPlayer(source.getTargetPointer().getFirst());
    if (opponent !== null) {
      {
        let creaturesToSacrifice = [];
        let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creatureYouControl(), min: 0, max: 2 }).withNotTarget(true);
        if ((target.choose(game, '', opponent.getId()).length > 0)) {
          {
            for (const permanent of game.getBattlefield().getActivePermanents(StaticFilters.creatureYouControl(), opponent.getId())) {
              {
                if (permanent !== null && !target.getTargets().includes(permanent.getId())) {
                  {
                    creaturesToSacrifice.push(permanent);
                  }
                }
              }
            }
          }
        }
        for (const creature of creaturesToSacrifice) {
          {
            creature.sacrifice();
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "ArchfiendsVessel::ArchfiendsVesselEffect": {
    card: "ArchfiendsVessel",
    effect: "ArchfiendsVesselEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/ArchfiendsVessel.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let archfiendsVessel = source.getSourcePermanentIfItStillExists(game);
    if (archfiendsVessel !== null) {
      {
        let controller = game.getPlayer(source.getControllerId());
        if (controller !== null) {
          {
            let moved = controller.moveCards(archfiendsVessel, 'exile');
            if (moved) {
              {
                let token = xmageToken(game.xmageScope(), "DemonToken");
                token.putOntoBattlefield(1, controller.getId());
              }
            }
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "ArchonOfRedemption::ArchonOfRedemptionEffect": {
    card: "ArchonOfRedemption",
    effect: "ArchonOfRedemptionEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/ArchonOfRedemption.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (player === null || permanent === null) {
      {
        return false;
      }
    }
    return player.gainLife(permanent.getPower().getValue()) > 0;
      return true;
    },
  },
  "ArjunTheShiftingFlame::ArjunTheShiftingFlameEffect": {
    card: "ArjunTheShiftingFlame",
    effect: "ArjunTheShiftingFlameEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/ArjunTheShiftingFlame.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let you = game.getPlayer(source.getControllerId());
    if (you !== null) {
      {
        let count = you.getHand().size();
        you.putCardsOnBottomOfLibrary(you.getHand());
        you.drawCards(count);
      }
    }
    return true;
      return true;
    },
  },
  "ArlinnThePacksHope::ArlinnTheMoonsFuryEffect": {
    card: "ArlinnThePacksHope",
    effect: "ArlinnTheMoonsFuryEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/a/ArlinnThePacksHope.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "ArmedWithProof::ArmedWithProofEffect": {
    card: "ArmedWithProof",
    effect: "ArmedWithProofEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/a/ArmedWithProof.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "ArterialAlchemy::ArterialAlchemyEffect": {
    card: "ArterialAlchemy",
    effect: "ArterialAlchemyEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/a/ArterialAlchemy.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "ArtificersHex::ArtificersHexEffect": {
    card: "ArtificersHex",
    effect: "ArtificersHexEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/ArtificersHex.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let enchantment = game.getPermanent(source.getSourceId());
    if (enchantment !== null && enchantment.getAttachedTo() !== null) {
      {
        let equipment = game.getPermanent(enchantment.getAttachedTo());
        if (equipment !== null && equipment.getAttachedTo() !== null) {
          {
            let creature = game.getPermanent(equipment.getAttachedTo());
            if (creature !== null && creature.isCreature()) {
              {
                return creature.destroy(false);
              }
            }
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "ArvinoxTheMindFlail::ArvinoxTheMindFlailCastFromExileEffect": {
    card: "ArvinoxTheMindFlail",
    effect: "ArvinoxTheMindFlailCastFromExileEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/a/ArvinoxTheMindFlail.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ArvinoxTheMindFlail::ArvinoxTheMindFlailSpendAnyManaEffect": {
    card: "ArvinoxTheMindFlail",
    effect: "ArvinoxTheMindFlailSpendAnyManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/a/ArvinoxTheMindFlail.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ArvinoxTheMindFlail::ArvinoxTheMindFlailLookEffect": {
    card: "ArvinoxTheMindFlail",
    effect: "ArvinoxTheMindFlailLookEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/a/ArvinoxTheMindFlail.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "AsForetold::AsForetoldAddAltCostEffect": {
    card: "AsForetold",
    effect: "AsForetoldAddAltCostEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/a/AsForetold.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "AshcoatOfTheShadowSwarm::AshcoatEffect": {
    card: "AshcoatOfTheShadowSwarm",
    effect: "AshcoatEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AshcoatOfTheShadowSwarm.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: (StaticFilters.creatureCard().add(subTypePredicate("rat"))), min: 0, max: 2, zone: "graveyard" }).withNotTarget(true);
    (target.choose(game, '', player.getId()).length > 0);
    player.moveCards(makeCards(game.xmageScope(), []).addAll(target.getTargets()), 'hand');
    return true;
      return true;
    },
  },
  "AshiokNightmareWeaver::AshiokNightmareWeaverExileEffect": {
    card: "AshiokNightmareWeaver",
    effect: "AshiokNightmareWeaverExileEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AshiokNightmareWeaver.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let opponent = game.getPlayer(source.getTargetPointer().getFirst());
    let controller = game.getPlayer(source.getControllerId());
    if (opponent === null || controller === null) {
      {
        return false;
      }
    }
    controller.moveCardsToExile(opponent.getLibrary().getTopCards(3));
    return true;
      return true;
    },
  },
  "AshiokNightmareWeaver::AshiokNightmareWeaverExileAllEffect": {
    card: "AshiokNightmareWeaver",
    effect: "AshiokNightmareWeaverExileAllEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AshiokNightmareWeaver.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let cards = makeCards(game.xmageScope(), []);
    for (const opponentId of game.getOpponents(source.getControllerId())) {
      {
        let opponent = game.getPlayer(opponentId);
        if (opponent === null) {
          {
            continue;
          }
        }
        cards.addAll(opponent.getHand());
        cards.addAll(opponent.getGraveyard());
      }
    }
    controller.moveCardsToExile(cards.getCards());
    return true;
      return true;
    },
  },
  "Asmoranomardicadaistinaculdacar::AsmoranomardicadaistinaculdacarEffect": {
    card: "Asmoranomardicadaistinaculdacar",
    effect: "AsmoranomardicadaistinaculdacarEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/Asmoranomardicadaistinaculdacar.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    return permanent.damage(6, permanent.getId()) > 0;
      return true;
    },
  },
  "AssassinsStrike::AssassinsStrikeEffect": {
    card: "AssassinsStrike",
    effect: "AssassinsStrikeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AssassinsStrike.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getFirstTarget());
    if (permanent !== null) {
      {
        let player = game.getPlayer(permanent.getControllerId());
        if (player !== null) {
          {
            player.discard(1);
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "AssembleThePlayers::AssembleThePlayersPlayTopEffect": {
    card: "AssembleThePlayers",
    effect: "AssembleThePlayersPlayTopEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/a/AssembleThePlayers.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "AtomwheelAcrobats::AtomwheelAcrobatsCountersEffect": {
    card: "AtomwheelAcrobats",
    effect: "AtomwheelAcrobatsCountersEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AtomwheelAcrobats.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    if (game.getState().getValue("rolled") === null) {
      {
        return false;
      }
    }
    let amount = Number(game.getState().getValue("rolled"));
    let sourcePermanent = source.getSourcePermanentIfItStillExists(game);
    if (sourcePermanent === null) {
      {
        return false;
      }
    }
    sourcePermanent.addCounters(CounterType.of("+1/+1").createInstance(amount));
    return true;
      return true;
    },
  },
  "AuguryAdept::AuguryAdeptEffect": {
    card: "AuguryAdept",
    effect: "AuguryAdeptEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AuguryAdept.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let card = controller.getLibrary().getFromTop();
    if (card === null) {
      {
        return false;
      }
    }
    controller.revealCards('', makeCards(game.xmageScope(), []).add(card));
    controller.moveCards(card, 'hand');
    let cmc = card.getManaValue();
    if (cmc > 0) {
      {
        controller.gainLife(cmc);
      }
    }
    return true;
      return true;
    },
  },
  "AuraBarbs::AuraBarbsEffect": {
    card: "AuraBarbs",
    effect: "AuraBarbsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AuraBarbs.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let filterEnchantments = makeFilter('permanent');
    filterEnchantments.add(cardTypePredicate("enchantment"));
    for (const permanent of game.getBattlefield().getActivePermanents(filterEnchantments, source.getControllerId())) {
      {
        let controller = game.getPlayer(permanent.getControllerId());
        if (controller !== null) {
          {
            controller.damage(2, permanent.getId());
            game.informPlayers('' + controller.getLogName() + '' + permanent.getName());
          }
        }
      }
    }
    filterEnchantments.add(subTypePredicate("aura"));
    for (const auraEnchantment of game.getBattlefield().getActivePermanents(filterEnchantments, source.getControllerId())) {
      {
        if (auraEnchantment.getAttachedTo() !== null) {
          {
            let attachedToCreature = game.getPermanent(auraEnchantment.getAttachedTo());
            if (attachedToCreature !== null && attachedToCreature.isCreature()) {
              {
                attachedToCreature.damage(2, auraEnchantment.getId());
                game.informPlayers('' + attachedToCreature.getName() + '' + auraEnchantment.getName());
              }
            }
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "AurraSingBaneOfJedi::SacrificeAllEffect": {
    card: "AurraSingBaneOfJedi",
    effect: "SacrificeAllEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AurraSingBaneOfJedi.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanents = game.getBattlefield().getActivePermanents(StaticFilters.creature(), source.getControllerId());
    for (const p of permanents) {
      {
        p.sacrifice();
      }
    }
    return true;
      return true;
    },
  },
  "AutumnWillow::AutumnWillowEffect": {
    card: "AutumnWillow",
    effect: "AutumnWillowEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/a/AutumnWillow.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "AvengerEnDal::AvengerEnDalEffect": {
    card: "AvengerEnDal",
    effect: "AvengerEnDalEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/a/AvengerEnDal.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (permanent !== null) {
      {
        let player = game.getPlayer(permanent.getControllerId());
        if (player !== null) {
          {
            player.gainLife(permanent.getToughness().getValue());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "AzulaCunningUsurper::AzulaCunningUsurperCastEffect": {
    card: "AzulaCunningUsurper",
    effect: "AzulaCunningUsurperCastEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/a/AzulaCunningUsurper.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "AzulaCunningUsurper::AzulaCunningUsurperFlashEffect": {
    card: "AzulaCunningUsurper",
    effect: "AzulaCunningUsurperFlashEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/a/AzulaCunningUsurper.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "AzulaCunningUsurper::AzulaCunningUsurperManaEffect": {
    card: "AzulaCunningUsurper",
    effect: "AzulaCunningUsurperManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/a/AzulaCunningUsurper.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "Backlash::BacklashEffect": {
    card: "Backlash",
    effect: "BacklashEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/Backlash.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetCreature = game.getPermanent(source.getTargetPointer().getFirst());
    if (targetCreature !== null) {
      {
        targetCreature.tap();
        let controller = game.getPlayer(targetCreature.getControllerId());
        if (controller !== null) {
          {
            controller.damage(targetCreature.getPower().getValue(), targetCreature.getId());
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "BalanceOfPower::BalanceOfPowerEffect": {
    card: "BalanceOfPower",
    effect: "BalanceOfPowerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BalanceOfPower.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let opponent = game.getPlayer(source.getFirstTarget());
    if (opponent !== null && player !== null && opponent.getHand().size() > player.getHand().size()) {
      {
        player.drawCards(opponent.getHand().size() - player.getHand().size());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "Balor::BalorEffect": {
    card: "Balor",
    effect: "BalorEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/Balor.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getFirstTarget());
    return player !== null && player.getHand().size() >= 1 && player.damage(player.getHand().size(), source.getSourceId()) > 0;
      return true;
    },
  },
  "BalustradeSpy::BalustradeSpyEffect": {
    card: "BalustradeSpy",
    effect: "BalustradeSpyEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BalustradeSpy.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getTargetPointer().getFirst());
    if (controller === null) {
      {
        return false;
      }
    }
    let toGraveyard = makeCards(game.xmageScope(), []);
    for (const card of controller.getLibrary().getCards()) {
      {
        if (card !== null) {
          {
            toGraveyard.add(card);
            if (card.isLand()) {
              {
                break;
              }
            }
          }
        }
      }
    }
    controller.revealCards('', toGraveyard);
    controller.moveCards(toGraveyard, 'graveyard');
    return true;
      return true;
    },
  },
  "BaneAlleyBroker::BaneAlleyBrokerLookAtCardEffect": {
    card: "BaneAlleyBroker",
    effect: "BaneAlleyBrokerLookAtCardEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/b/BaneAlleyBroker.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "BanefulOmen::BanefulOmenEffect": {
    card: "BanefulOmen",
    effect: "BanefulOmenEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BanefulOmen.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null || !player.getLibrary().hasCards()) {
      {
        return false;
      }
    }
    let card = player.getLibrary().getFromTop();
    if (card === null) {
      {
        return false;
      }
    }
    player.revealCards('', makeCards(game.xmageScope(), []).add(card));
    let mv = card.getManaValue();
    for (const opponentId of game.getOpponents(source.getControllerId())) {
      {
        let opponent = game.getPlayer(opponentId);
        if (opponent !== null) {
          {
            opponent.loseLife(mv);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "BarbarianBully::BarbarianBullyEffect": {
    card: "BarbarianBully",
    effect: "BarbarianBullyEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BarbarianBully.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getSourceId());
    if (permanent === null) {
      {
        return false;
      }
    }
    let costPaid = false;
    for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player === null) {
          {
            continue;
          }
        }
        if (player.chooseUse('')) {
          {
            player.damage(4, permanent.getId());
            costPaid = true;
          }
        }
      }
    }
    if (!costPaid) {
      {
        game.addEffect(boostSourceEffect(game.xmageScope(), 2, 2, "EndOfTurn"), source);
      }
    }
    return true;
      return true;
    },
  },
  "BarbedShocker::BarbedShockerEffect": {
    card: "BarbedShocker",
    effect: "BarbedShockerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BarbedShocker.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    if (targetPlayer === null || targetPlayer.getHand().isEmpty()) {
      {
        return false;
      }
    }
    targetPlayer.drawCards(targetPlayer.discardCards(targetPlayer.getHand()).size());
    return true;
      return true;
    },
  },
  "BasaltGolem::BasaltGolemEffect": {
    card: "BasaltGolem",
    effect: "BasaltGolemEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BasaltGolem.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let creature = game.getPermanent(source.getTargetPointer().getFirst());
    if (creature === null) {
      return false;
    }
    let player = game.getPlayer(creature.getControllerId());
    if (player === null) {
      return false;
    }
    if (!creature.sacrifice()) {
      return false;
    }
    return xmageToken(game.xmageScope(), "BasaltGolemToken").putOntoBattlefield(1, player.getId());
      return true;
    },
  },
  "BatwingBrume::BatwingBrumeEffect": {
    card: "BatwingBrume",
    effect: "BatwingBrumeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BatwingBrume.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        for (const playerId of game.getState().getPlayersInRange(controller.getId())) {
          {
            let amount = game.getBattlefield().getAllActivePermanents(StaticFilters.creature(), playerId).length;
            if (amount > 0) {
              {
                let player = game.getPlayer(playerId);
                if (player !== null) {
                  {
                    player.loseLife(amount);
                  }
                }
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "BeaconOfImmortality::BeaconOfImmortalityEffect": {
    card: "BeaconOfImmortality",
    effect: "BeaconOfImmortalityEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BeaconOfImmortality.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getFirstTarget());
    if (player !== null) {
      {
        let amount = player.getLife();
        if (amount < 0) {
          {
            player.loseLife(-amount);
            return true;
          }
        }
        if (amount > 0) {
          {
            player.gainLife(amount);
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "BelloBardOfTheBrambles::BelloBardOfTheBramblesEffect": {
    card: "BelloBardOfTheBrambles",
    effect: "BelloBardOfTheBramblesEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/b/BelloBardOfTheBrambles.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "BellowingFiend::BellowingFiendEffect": {
    card: "BellowingFiend",
    effect: "BellowingFiendEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BellowingFiend.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let damagedCreature = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (damagedCreature !== null) {
      {
        let controller = game.getPlayer(damagedCreature.getControllerId());
        if (controller !== null) {
          {
            controller.damage(3, source.getSourceId());
          }
        }
      }
    }
    let you = game.getPlayer(source.getControllerId());
    if (you !== null) {
      {
        you.damage(3, source.getSourceId());
      }
    }
    return true;
      return true;
    },
  },
  "BetorKinToAll::BetorKinToAllEffect": {
    card: "BetorKinToAll",
    effect: "BetorKinToAllEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BetorKinToAll.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const playerId of game.getOpponents(source.getControllerId())) {
      {
        let opponent = game.getPlayer(playerId);
        if (opponent !== null) {
          {
            opponent.loseLife(opponent.getLife() / 2 + opponent.getLife() % 2);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "BindTheMonster::BindTheMonsterEffect": {
    card: "BindTheMonster",
    effect: "BindTheMonsterEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BindTheMonster.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let attachment = game.getPermanentOrLKIBattlefield(source.getSourceId());
    if (attachment !== null) {
      {
        let creature = game.getPermanent(attachment.getAttachedTo());
        if (creature !== null) {
          {
            creature.tap();
            let player = game.getPlayer(source.getControllerId());
            if (player !== null) {
              {
                player.damage(creature.getPower().getValue(), creature.getId());
              }
            }
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "BiomanticMastery::BiomanticMasteryEffect": {
    card: "BiomanticMastery",
    effect: "BiomanticMasteryEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BiomanticMastery.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    for (const playerId of source.getTargetPointer().getTargets()) {
      {
        let player = game.getPlayer(playerId);
        if (player === null) {
          {
            continue;
          }
        }
        let creatures = game.getBattlefield().countAll(StaticFilters.creature(), playerId);
        controller.drawCards(creatures);
      }
    }
    return true;
      return true;
    },
  },
  "Bioplasm::BioplasmEffect": {
    card: "Bioplasm",
    effect: "BioplasmEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/Bioplasm.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let library = player.getLibrary();
    if (library === null || !library.hasCards()) {
      {
        return false;
      }
    }
    let card = library.getFromTop();
    if (card === null) {
      {
        return false;
      }
    }
    if (player.moveCards(card, 'exile') && card.isCreature()) {
      {
        game.addEffect(boostSourceEffect(game.xmageScope(), card.getPower().getValue(), card.getToughness().getValue(), "EndOfTurn"), source);
      }
    }
    return true;
      return true;
    },
  },
  "Biorhythm::BiorhythmEffect": {
    card: "Biorhythm",
    effect: "BiorhythmEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/Biorhythm.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player !== null) {
          {
            let diff = player.getLife() - game.getBattlefield().countAll((StaticFilters.creature()), playerId);
            if (diff > 0) {
              {
                player.loseLife(diff);
              }
            }
            if (diff < 0) {
              {
                player.gainLife(-diff);
              }
            }
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "BlacksmithsSkill::BlacksmithsSkillEffect": {
    card: "BlacksmithsSkill",
    effect: "BlacksmithsSkillEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BlacksmithsSkill.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent !== null && permanent.isArtifact() && permanent.isCreature()) {
      {
        game.addEffect(boostTargetEffect(game.xmageScope(), 2, 2), source);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "BladeOfTheBloodchief::BladeOfTheBloodchiefEffect": {
    card: "BladeOfTheBloodchief",
    effect: "BladeOfTheBloodchiefEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BladeOfTheBloodchief.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let enchantment = game.getPermanent(source.getSourceId());
    if (enchantment !== null && enchantment.getAttachedTo() !== null) {
      {
        let creature = game.getPermanent(enchantment.getAttachedTo());
        if (creature !== null) {
          {
            if (creature.hasSubtype("vampire")) {
              {
                creature.addCounters(CounterType.of("+1/+1").createInstance(2));
              }
            } else {
              {
                creature.addCounters(CounterType.of("+1/+1").createInstance());
              }
            }
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "BladeOfTheOni::BladeOfTheOniEffect": {
    card: "BladeOfTheOni",
    effect: "BladeOfTheOniEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/b/BladeOfTheOni.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "BlazingSalvo::BlazingSalvoEffect": {
    card: "BlazingSalvo",
    effect: "BlazingSalvoEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BlazingSalvo.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent !== null) {
      {
        let player = game.getPlayer(permanent.getControllerId());
        if (player !== null) {
          {
            let message = '';
            if (player.chooseUse('')) {
              {
                player.damage(5, source.getSourceId());
              }
            } else {
              {
                permanent.damage(3, source.getSourceId());
              }
            }
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "BlessedReincarnation::BlessedReincarnationEffect": {
    card: "BlessedReincarnation",
    effect: "BlessedReincarnationEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BlessedReincarnation.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent !== null && controller !== null) {
      {
        controller.moveCards(permanent, 'exile');
        game.processAction();
        let permanentController = game.getPlayer(permanent.getControllerId());
        if (permanentController !== null) {
          {
            let library = permanentController.getLibrary();
            if (library.hasCards()) {
              {
                let toReveal = makeCards(game.xmageScope(), []);
                for (const card of library.getCards()) {
                  {
                    toReveal.add(card);
                    if (card.isCreature()) {
                      {
                        permanentController.moveCards(card, 'battlefield');
                        break;
                      }
                    }
                  }
                }
                permanentController.revealCards('', toReveal);
                if (toReveal.size() > 1) {
                  {
                    permanentController.shuffleLibrary();
                  }
                }
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "BlessedRespite::BlessedRespiteEffect": {
    card: "BlessedRespite",
    effect: "BlessedRespiteEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BlessedRespite.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    if (targetPlayer !== null) {
      {
        targetPlayer.moveCards(targetPlayer.getGraveyard(), 'library');
        targetPlayer.shuffleLibrary();
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "BlizzardSpecter::ReturnToHandEffect": {
    card: "BlizzardSpecter",
    effect: "ReturnToHandEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BlizzardSpecter.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    if (targetPlayer === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: makeFilter(['permanent','you','control'], [controlledByPredicate()]), min: 1, max: 1 }).withNotTarget(true);
    if (target.canChoose(game, targetPlayer.getId())) {
      {
        (target.choose(game, '', targetPlayer.getId()).length > 0);
        let permanent = game.getPermanent(target.getFirstTarget());
        if (permanent !== null) {
          {
            targetPlayer.moveCards(permanent, 'hand');
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "BloodBaronOfVizkopa::BloodBaronOfVizkopaEffect": {
    card: "BloodBaronOfVizkopa",
    effect: "BloodBaronOfVizkopaEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/b/BloodBaronOfVizkopa.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "BloodSun::BloodSunEffect": {
    card: "BloodSun",
    effect: "BloodSunEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/b/BloodSun.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "BloodTribute::BloodTributeGainLifeEffect": {
    card: "BloodTribute",
    effect: "BloodTributeGainLifeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BloodTribute.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player !== null) {
      {
        let amount = Number(game.getState().getValue(String(source.getSourceId()) + "_BloodTribute"));
        if (amount !== null && amount > 0) {
          {
            player.gainLife(amount);
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "BloodTyrant::BloodTyrantEffect": {
    card: "BloodTyrant",
    effect: "BloodTyrantEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BloodTyrant.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let counters = 0;
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        for (const playerId of game.getState().getPlayersInRange(controller.getId())) {
          {
            let player = game.getPlayer(playerId);
            if (player !== null) {
              {
                if (player.loseLife(1) > 0) {
                  {
                    counters++;
                  }
                }
              }
            }
          }
        }
        let bloodTyrant = game.getPermanent(source.getSourceId());
        if (bloodTyrant !== null && counters > 0) {
          {
            bloodTyrant.addCounters(CounterType.of("+1/+1").createInstance(counters));
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "BlossomingWreath::BlossomingWreathEffect": {
    card: "BlossomingWreath",
    effect: "BlossomingWreathEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BlossomingWreath.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        controller.gainLife(makeCards(game.xmageScope(), controller.getGraveyard().ids()).retain(StaticFilters.creatureCard()).size());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "BludgeonBrawl::BludgeonBrawlEffect": {
    card: "BludgeonBrawl",
    effect: "BludgeonBrawlEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/b/BludgeonBrawl.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "BobReluctantHYDRAAgent::BobReluctantHYDRAAgentEffect": {
    card: "BobReluctantHYDRAAgent",
    effect: "BobReluctantHYDRAAgentEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BobReluctantHYDRAAgent.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let permanent = source.getSourcePermanentIfItStillExists(game);
    if (controller === null || permanent === null || !controller.moveCards(permanent, 'hand')) {
      {
        return false;
      }
    }
    for (const opponentId of game.getOpponents(source.getControllerId())) {
      {
        let opponent = game.getPlayer(opponentId);
        if (opponent !== null) {
          {
            opponent.loseLife(2);
          }
        }
      }
    }
    controller.gainLife(2);
    return true;
      return true;
    },
  },
  "BolassCitadel::BolassCitadelPlayTheTopCardEffect": {
    card: "BolassCitadel",
    effect: "BolassCitadelPlayTheTopCardEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/b/BolassCitadel.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "BoldwyrHeavyweights::BoldwyrHeavyweightsEffect": {
    card: "BoldwyrHeavyweights",
    effect: "BoldwyrHeavyweightsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BoldwyrHeavyweights.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let playersThatSearched = [];
    for (const opponentId of game.getOpponents(source.getControllerId())) {
      {
        let opponent = game.getPlayer(opponentId);
        if (opponent !== null && opponent.chooseUse('')) {
          {
            let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creatureCard(), zone: "library" });
            if ((opponent.searchLibrary('', target).length > 0)) {
              {
                let targetCard = opponent.getLibrary().getCard(target.getFirstTarget());
                if (targetCard !== null) {
                  {
                    opponent.moveCards(targetCard, 'battlefield');
                    playersThatSearched.push(opponent);
                  }
                }
              }
            }
          }
        }
      }
    }
    for (const opponent of playersThatSearched) {
      {
        opponent.shuffleLibrary();
      }
    }
    return true;
      return true;
    },
  },
  "BondOfInsight::BondOfInsightEffect": {
    card: "BondOfInsight",
    effect: "BondOfInsightEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BondOfInsight.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player === null) {
          {
            continue;
          }
        }
        player.millCards(4);
      }
    }
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: makeFilter(["card"], [Predicates.or(cardTypePredicate("instant"), cardTypePredicate("sorcery"))]), min: 0, max: 2, zone: "graveyard" }).withNotTarget(true);
    if (!(target.choose(game, '', player.getId()).length > 0)) {
      {
        return false;
      }
    }
    let cards = makeCards(game.xmageScope(), []).addAll(target.getTargets());
    return player.moveCards(cards, 'hand');
      return true;
    },
  },
  "BoneDancer::BoneDancerEffect": {
    card: "BoneDancer",
    effect: "BoneDancerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BoneDancer.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let defendingPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    if (controller !== null && defendingPlayer !== null) {
      {
        let lastCreatureCard = null;
        for (const card of defendingPlayer.getGraveyard().getCards()) {
          {
            if (card.isCreature()) {
              {
                lastCreatureCard = card;
              }
            }
          }
        }
        if (lastCreatureCard !== null) {
          {
            controller.moveCards(lastCreatureCard, 'battlefield');
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "BookBurning::BookBurningMillEffect": {
    card: "BookBurning",
    effect: "BookBurningMillEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BookBurning.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let sourceObject = source.getSourceObject(game);
    if (sourceObject !== null) {
      {
        let millCards = true;
        for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
          {
            let player = game.getPlayer(playerId);
            if (player !== null && player.chooseUse('')) {
              {
                millCards = false;
                player.damage(6, source.getSourceId());
                game.informPlayers(player.getLogName() + '' + sourceObject.getLogName() + '');
              }
            }
          }
        }
        if (millCards) {
          {
            let targetPlayer = game.getPlayer(source.getTargetPointer().getFirst());
            if (targetPlayer !== null) {
              {
                targetPlayer.moveCards(targetPlayer.getLibrary().getTopCards(6), 'graveyard');
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "BoomerangBasics::BoomerangBasicsEffect": {
    card: "BoomerangBasics",
    effect: "BoomerangBasicsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BoomerangBasics.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (player === null || permanent === null) {
      {
        return false;
      }
    }
    let flag = permanent.isControlledBy(player.getId());
    player.moveCards(permanent, 'hand');
    if (flag) {
      {
        game.processAction();
        player.drawCards(1);
      }
    }
    return true;
      return true;
    },
  },
  "BorosFuryShield::BorosFuryShieldDamageEffect": {
    card: "BorosFuryShield",
    effect: "BorosFuryShieldDamageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BorosFuryShield.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let target = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (target !== null) {
      {
        let player = game.getPlayer(target.getControllerId());
        if (player !== null) {
          {
            let power = target.getPower().getValue();
            player.damage(power, source.getId());
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "BorrowedKnowledge::BorrowedKnowledgeEffect": {
    card: "BorrowedKnowledge",
    effect: "BorrowedKnowledgeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BorrowedKnowledge.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let opponent = game.getPlayer(source.getTargetPointer().getFirst());
    return player !== null && opponent !== null && player.drawCards(opponent.getHand().size()) > 0;
      return true;
    },
  },
  "BosiumStrip::BosiumStripCastFromGraveyardEffect": {
    card: "BosiumStrip",
    effect: "BosiumStripCastFromGraveyardEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/b/BosiumStrip.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "BrackishBlunder::BrackishBlunderEffect": {
    card: "BrackishBlunder",
    effect: "BrackishBlunderEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BrackishBlunder.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (player === null || permanent === null) {
      {
        return false;
      }
    }
    let tapped = permanent.isTapped();
    player.moveCards(permanent, 'hand');
    if (tapped) {
      {
        xmageToken(game.xmageScope(), "MapToken").putOntoBattlefield(1, source.getControllerId());
      }
    }
    return true;
      return true;
    },
  },
  "BrainstealerDragon::BrainstealerDragonLifeEffect": {
    card: "BrainstealerDragon",
    effect: "BrainstealerDragonLifeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BrainstealerDragon.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (permanent === null) {
      {
        return false;
      }
    }
    let player = game.getPlayer(permanent.getOwnerId());
    return player !== null && player.loseLife(permanent.getManaValue()) > 0;
      return true;
    },
  },
  "BrambleFamiliar::FetchQuestEffect": {
    card: "BrambleFamiliar",
    effect: "FetchQuestEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BrambleFamiliar.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let cards = player.millCards(7);
    if (makeCards(game.xmageScope(), cards.ids()).retain((StaticFilters.card().add(Predicates.or(cardTypePredicate("creature"), cardTypePredicate("enchantment"), cardTypePredicate("land"))))).size() < 1) {
      {
        return true;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: (StaticFilters.card().add(Predicates.or(cardTypePredicate("creature"), cardTypePredicate("enchantment"), cardTypePredicate("land")))), min: 1, max: 1, zone: "graveyard" }).withNotTarget(true);
    (target.choose(game, '', player.getId(), cards.ids()).length > 0);
    player.moveCards(makeCards(game.xmageScope(), []).addAll(target.getTargets()), 'battlefield');
    return true;
      return true;
    },
  },
  "BreakingWave::BreakingWaveEffect": {
    card: "BreakingWave",
    effect: "BreakingWaveEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BreakingWave.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let creatures = game.getBattlefield().getActivePermanents(StaticFilters.creature(), source.getControllerId());
    for (const creature of creatures) {
      {
        if (creature.isTapped()) {
          {
            creature.untap();
          }
        } else {
          {
            creature.tap();
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "BreenaTheDemagogue::BreenaTheDemagogueEffect": {
    card: "BreenaTheDemagogue",
    effect: "BreenaTheDemagogueEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BreenaTheDemagogue.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null || game.getBattlefield().count(StaticFilters.creatureYouControl(), source.getControllerId()) < 1) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creatureYouControl() });
    target.withNotTarget(true);
    (target.choose(game, '', player.getId()).length > 0);
    let permanent = game.getPermanent(target.getFirstTarget());
    return permanent !== null && permanent.addCounters(CounterType.of("+1/+1").createInstance(2));
      return true;
    },
  },
  "BrightPalmSoulAwakener::BrightPalmSoulAwakenerEffect": {
    card: "BrightPalmSoulAwakener",
    effect: "BrightPalmSoulAwakenerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BrightPalmSoulAwakener.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent === null) {
      {
        return false;
      }
    }
    let count = permanent.getCounters().getCount(CounterType.of("+1/+1"));
    return count > 0 && permanent.addCounters(CounterType.of("+1/+1").createInstance(count));
      return true;
    },
  },
  "Brightling::BrightlingEffect": {
    card: "Brightling",
    effect: "BrightlingEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/Brightling.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getSourceId());
    if (player === null || permanent === null) {
      {
        return false;
      }
    }
    let boost = ((player.chooseUse('') ? 1 : -1));
    game.addEffect(boostSourceEffect(game.xmageScope(), boost, -1 * boost, "EndOfTurn"), source);
    return true;
      return true;
    },
  },
  "Brightmare::BrightmareEffect": {
    card: "Brightmare",
    effect: "BrightmareEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/Brightmare.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    permanent.tap();
    let player = game.getPlayer(source.getControllerId());
    if (player !== null) {
      {
        player.gainLife(permanent.getPower().getValue());
      }
    }
    return true;
      return true;
    },
  },
  "BrokkosApexOfForever::BrokkosMutateFromGraveyardEffect": {
    card: "BrokkosApexOfForever",
    effect: "BrokkosMutateFromGraveyardEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/b/BrokkosApexOfForever.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "BronzeBombshell::BronzeBombshellEffect": {
    card: "BronzeBombshell",
    effect: "BronzeBombshellEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BronzeBombshell.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let bronzeBombshell = game.getPermanent(source.getSourceId());
    if (bronzeBombshell !== null) {
      {
        let newController = game.getPlayer(bronzeBombshell.getControllerId());
        if (newController !== null) {
          {
            if (bronzeBombshell.sacrifice()) {
              {
                newController.damage(7, source.getSourceId());
                return true;
              }
            }
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "BronzebeakForagers::BronzebeakForagerDissolveEffect": {
    card: "BronzebeakForagers",
    effect: "BronzebeakForagerDissolveEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BronzebeakForagers.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let card = game.getCard(source.getTargetPointer().getFirst());
    if (player !== null && card !== null) {
      {
        return player.moveCards(card, 'graveyard');
      }
    }
    return false;
      return true;
    },
  },
  "BronzehideLion::BronzehideLionContinuousEffect": {
    card: "BronzehideLion",
    effect: "BronzehideLionContinuousEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/b/BronzehideLion.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "BroodBirthing::BroodBirthingEffect": {
    card: "BroodBirthing",
    effect: "BroodBirthingEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BroodBirthing.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let filter = StaticFilters.creatureYouControl();
    filter.add(subTypePredicate("eldrazi"));
    filter.add(subTypePredicate("spawn"));
    let token = xmageToken(game.xmageScope(), "EldraziSpawnToken");
    let count = (game.getBattlefield().countAll(filter, source.getControllerId()) > 0 ? 3 : 1);
    token.putOntoBattlefield(count, source.getControllerId());
    return true;
      return true;
    },
  },
  "BroodSliver::BroodSliverEffect": {
    card: "BroodSliver",
    effect: "BroodSliverEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BroodSliver.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanentController = game.getPlayer(source.getTargetPointer().getFirst());
    if (permanentController !== null) {
      {
        if (permanentController.chooseUse('')) {
          {
            return xmageToken(game.xmageScope(), "SliverToken").putOntoBattlefield(1, permanentController.getId());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "BulkUp::BulkUpEffect": {
    card: "BulkUp",
    effect: "BulkUpEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BulkUp.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent === null || permanent.getPower().getValue() === 0) {
      {
        return false;
      }
    }
    game.addEffect(boostTargetEffect(game.xmageScope(), permanent.getPower().getValue(), 0).setTargetPointer(fixedTarget(permanent)), source);
    return true;
      return true;
    },
  },
  "Bulwark::BulwarkDamageEffect": {
    card: "Bulwark",
    effect: "BulwarkDamageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/Bulwark.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let opponent = game.getPlayer(source.getTargetPointer().getFirst());
    let controller = game.getPlayer(source.getControllerId());
    if (opponent !== null && controller !== null) {
      {
        let amount = controller.getHand().size() - opponent.getHand().size();
        if (amount > 0) {
          {
            opponent.damage(amount, source.getSourceId());
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "BurdenOfProof::BurdenOfProofEffect": {
    card: "BurdenOfProof",
    effect: "BurdenOfProofEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/b/BurdenOfProof.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "BuriedAlive::BuriedAliveEffect": {
    card: "BuriedAlive",
    effect: "BuriedAliveEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BuriedAlive.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creatureCard(), min: 0, max: 3, zone: "library" });
    (controller.searchLibrary('', target).length > 0);
    let cards = makeCards(game.xmageScope(), []).addAll(target.getTargets());
    cards.retainZone('library');
    controller.moveCards(cards, 'graveyard');
    controller.shuffleLibrary();
    return true;
      return true;
    },
  },
  "BurnTheAccursed::BurnTheAccursedEffect": {
    card: "BurnTheAccursed",
    effect: "BurnTheAccursedEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/b/BurnTheAccursed.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    permanent.damage(5, source.getSourceId());
    let player = game.getPlayer(permanent.getControllerId());
    if (player !== null) {
      {
        player.damage(2, source.getSourceId());
      }
    }
    return true;
      return true;
    },
  },
  "CallOfTheWild::CallOfTheWildEffect": {
    card: "CallOfTheWild",
    effect: "CallOfTheWildEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CallOfTheWild.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let sourceObject = source.getSourceObject(game);
    if (controller === null || sourceObject === null) {
      {
        return false;
      }
    }
    if (controller.getLibrary().hasCards()) {
      {
        let card = controller.getLibrary().getFromTop();
        if (card !== null) {
          {
            let cards = makeCards(game.xmageScope(), []).add(card);
            controller.revealCards('', cards);
            if (card.isCreature()) {
              {
                controller.moveCards(card, 'battlefield');
              }
            } else {
              {
                controller.moveCards(card, 'graveyard');
              }
            }
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "CallousSellSword::CallousSellSwordSacrificeFirstTargetEffect": {
    card: "CallousSellSword",
    effect: "CallousSellSwordSacrificeFirstTargetEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CallousSellSword.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    return permanent !== null && permanent.sacrifice();
      return true;
    },
  },
  "CanoptekScarabSwarm::CanoptekScarabSwarmEffect": {
    card: "CanoptekScarabSwarm",
    effect: "CanoptekScarabSwarmEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CanoptekScarabSwarm.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player === null) {
      {
        return false;
      }
    }
    let count = makeCards(game.xmageScope(), player.getGraveyard().ids()).retain((StaticFilters.card().add(Predicates.or(cardTypePredicate("artifact"), cardTypePredicate("land"))))).size();
    player.moveCards(player.getGraveyard(), 'exile');
    xmageToken(game.xmageScope(), "InsectColorlessArtifactToken").putOntoBattlefield(count, source.getControllerId());
    return true;
      return true;
    },
  },
  "CanopyGargantuan::CanopyGargantuanEffect": {
    card: "CanopyGargantuan",
    effect: "CanopyGargantuanEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CanopyGargantuan.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const permanent of game.getBattlefield().getActivePermanents(makeFilter(["another", "creature", "you", "control"], [controlledByPredicate(), cardTypePredicate("creature"), anotherPredicate()]), source.getControllerId())) {
      {
        let toughness = permanent.getToughness().getValue();
        if (toughness > 0) {
          {
            permanent.addCounters(CounterType.of("+1/+1").createInstance(toughness));
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "CaptivatingVampire::CaptivatingVampireEffect": {
    card: "CaptivatingVampire",
    effect: "CaptivatingVampireEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/CaptivatingVampire.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "CarrionLocust::CarrionLocustEffect": {
    card: "CarrionLocust",
    effect: "CarrionLocustEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CarrionLocust.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetCard = game.getCard(source.getFirstTarget());
    if (targetCard === null) {
      {
        return false;
      }
    }
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let creature = targetCard.isCreature();
    let owner = game.getPlayer(targetCard.getOwnerId());
    controller.moveCards(targetCard, 'exile');
    if (creature && owner !== null) {
      {
        owner.loseLife(1);
      }
    }
    return true;
      return true;
    },
  },
  "CaseFileAuditor::CaseFileAuditorManaEffect": {
    card: "CaseFileAuditor",
    effect: "CaseFileAuditorManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/CaseFileAuditor.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "CaseOfTheGatewayExpress::CaseOfTheGatewayExpressEffect": {
    card: "CaseOfTheGatewayExpress",
    effect: "CaseOfTheGatewayExpressEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CaseOfTheGatewayExpress.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    for (const creature of game.getBattlefield().getActivePermanents(StaticFilters.creatureYouControl(), source.getControllerId())) {
      {
        if (creature === null) {
          {
            continue;
          }
        }
        permanent.damage(1, creature.getId());
      }
    }
    return true;
      return true;
    },
  },
  "Catastrophe::CatastropheEffect": {
    card: "Catastrophe",
    effect: "CatastropheEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/Catastrophe.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        if (controller.chooseUse('')) {
          {
            for (const permanent of game.getBattlefield().getActivePermanents(StaticFilters.land(), controller.getId())) {
              {
                permanent.destroy(permanent.isCreature());
              }
            }
          }
        } else {
          {
            for (const permanent of game.getBattlefield().getActivePermanents(StaticFilters.creature(), controller.getId())) {
              {
                permanent.destroy(true);
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "CelestialDawn::CelestialDawnToPlainsEffect": {
    card: "CelestialDawn",
    effect: "CelestialDawnToPlainsEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/CelestialDawn.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "CelestialDawn::CelestialDawnSpendAnyManaEffect": {
    card: "CelestialDawn",
    effect: "CelestialDawnSpendAnyManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/CelestialDawn.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "CelestialDawn::CelestialDawnSpendColorlessManaEffect": {
    card: "CelestialDawn",
    effect: "CelestialDawnSpendColorlessManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/CelestialDawn.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "CelestialMantle::CelestialMantleEffect": {
    card: "CelestialMantle",
    effect: "CelestialMantleEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CelestialMantle.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player !== null) {
      {
        player.gainLife(player.getLife());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "CellarDoor::CellarDoorEffect": {
    card: "CellarDoor",
    effect: "CellarDoorEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CellarDoor.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getFirstTarget());
    if (player !== null && player.getLibrary().hasCards()) {
      {
        let card = player.getLibrary().getFromBottom();
        if (card !== null) {
          {
            player.moveCards(card, 'graveyard');
            if (card.isCreature()) {
              {
                let token = xmageToken(game.xmageScope(), "ZombieToken");
                token.putOntoBattlefield(1, source.getControllerId());
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "CemeteryIlluminator::CemeteryIlluminatorPlayTopEffect": {
    card: "CemeteryIlluminator",
    effect: "CemeteryIlluminatorPlayTopEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/CemeteryIlluminator.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "CemeteryRecruitment::CemeteryRecruitmentEffect": {
    card: "CemeteryRecruitment",
    effect: "CemeteryRecruitmentEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CemeteryRecruitment.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let card = game.getCard(source.getTargetPointer().getFirst());
        if (card !== null) {
          {
            if (controller.moveCards(card, 'hand') && card.hasSubtype("zombie")) {
              {
                controller.drawCards(1);
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "CephalidVandal::CephalidVandalEffect": {
    card: "CephalidVandal",
    effect: "CephalidVandalEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CephalidVandal.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getSourceId());
    if (permanent !== null && controller !== null) {
      {
        let amount = permanent.getCounters().getCount(CounterType.of("shred"));
        controller.millCards(amount);
      }
    }
    return true;
      return true;
    },
  },
  "CertainDeath::CertainDeathEffect": {
    card: "CertainDeath",
    effect: "CertainDeathEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CertainDeath.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let you = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent !== null && you !== null) {
      {
        permanent.destroy(false);
        let permController = game.getPlayer(permanent.getControllerId());
        if (permController !== null) {
          {
            permController.loseLife(2);
            you.gainLife(2);
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "ChainerNightmareAdept::ChainerNightmareAdeptContinuousEffect": {
    card: "ChainerNightmareAdept",
    effect: "ChainerNightmareAdeptContinuousEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/ChainerNightmareAdept.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ChallengerTroll::ChallengerTrollEffect": {
    card: "ChallengerTroll",
    effect: "ChallengerTrollEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/ChallengerTroll.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "ChandraFlamecaller::ChandraElementalEffect": {
    card: "ChandraFlamecaller",
    effect: "ChandraElementalEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/ChandraFlamecaller.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let effect = createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), "ElementalHasteToken"), 2);
        effect.apply(game, source);
        effect.exileTokensCreatedAtNextEndStep(game, source);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "ChandraFlamecaller::ChandraDrawEffect": {
    card: "ChandraFlamecaller",
    effect: "ChandraDrawEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/ChandraFlamecaller.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let amount = player.discardCards(player.getHand()).size();
    player.drawCards(amount + 1);
    return true;
      return true;
    },
  },
  "ChandraHopesBeacon::ChandraHopesBeaconPlayEffect": {
    card: "ChandraHopesBeacon",
    effect: "ChandraHopesBeaconPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/ChandraHopesBeacon.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ChandrasIgnition::ChandrasIgnitionEffect": {
    card: "ChandrasIgnition",
    effect: "ChandrasIgnitionEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/ChandrasIgnition.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetCreature = game.getPermanent(source.getTargetPointer().getFirst());
    if (targetCreature !== null && targetCreature.getPower().getValue() > 0) {
      {
        for (const creature of game.getBattlefield().getActivePermanents(StaticFilters.creature(), source.getControllerId())) {
          {
            if (!(creature.getId() === targetCreature.getId())) {
              {
                creature.damage(targetCreature.getPower().getValue(), targetCreature.getId());
              }
            }
          }
        }
        for (const opponentId of game.getOpponents(source.getControllerId())) {
          {
            let opponent = game.getPlayer(opponentId);
            if (opponent !== null) {
              {
                opponent.damage(targetCreature.getPower().getValue(), targetCreature.getId());
              }
            }
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "ChaosHarlequin::ChaosHarlequinEffect": {
    card: "ChaosHarlequin",
    effect: "ChaosHarlequinEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/ChaosHarlequin.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let card = player.getLibrary().getFromTop();
    if (card === null) {
      {
        return false;
      }
    }
    player.moveCards(card, 'exile');
    game.addEffect(boostSourceEffect(game.xmageScope(), (card.isLand() ? -4 : 2), 0, "EndOfTurn"), source);
    return true;
      return true;
    },
  },
  "ChaosLord::ChaosLordEffect": {
    card: "ChaosLord",
    effect: "ChaosLordEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/ChaosLord.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "CharredFoyerWarpedSpace::WarpedSpaceAddAltCostEffect": {
    card: "CharredFoyerWarpedSpace",
    effect: "WarpedSpaceAddAltCostEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/CharredFoyerWarpedSpace.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "Chastise::ChastiseEffect": {
    card: "Chastise",
    effect: "ChastiseEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/Chastise.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (permanent !== null) {
      {
        let power = permanent.getPower().getValue();
        let player = game.getPlayer(source.getControllerId());
        if (player !== null) {
          {
            player.gainLife(power);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "ChimericCoils::ChimericCoilsEffect": {
    card: "ChimericCoils",
    effect: "ChimericCoilsEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/ChimericCoils.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "ChimericStaff::ChimericStaffEffect": {
    card: "ChimericStaff",
    effect: "ChimericStaffEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/ChimericStaff.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "ChirrutImwe::ChirrutImweEffect": {
    card: "ChirrutImwe",
    effect: "ChirrutImweEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/ChirrutImwe.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "ChissGoriaForgeTyrant::ChissGoriaForgeTyrantCanPlayEffect": {
    card: "ChissGoriaForgeTyrant",
    effect: "ChissGoriaForgeTyrantCanPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/ChissGoriaForgeTyrant.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ChooseYourWeapon::ChooseYourWeaponEffect": {
    card: "ChooseYourWeapon",
    effect: "ChooseYourWeaponEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/ChooseYourWeapon.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    game.addEffect(boostTargetEffect(game.xmageScope(), permanent.getPower().getValue(), permanent.getToughness().getValue(), "EndOfTurn"), source);
    return true;
      return true;
    },
  },
  "ChromaticOrrery::ChromaticOrreryEffect": {
    card: "ChromaticOrrery",
    effect: "ChromaticOrreryEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/ChromaticOrrery.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "Cindervines::CindervinesEffect": {
    card: "Cindervines",
    effect: "CindervinesEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/Cindervines.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    let player = game.getPlayer(permanent.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    permanent.destroy(false);
    player.damage(2, source.getSourceId());
    return true;
      return true;
    },
  },
  "CircleOfTheMoonDruid::CircleOfTheMoonDruidBearEffect": {
    card: "CircleOfTheMoonDruid",
    effect: "CircleOfTheMoonDruidBearEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/CircleOfTheMoonDruid.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "ClearTheMind::ClearTheMindEffect": {
    card: "ClearTheMind",
    effect: "ClearTheMindEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/ClearTheMind.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getFirstTarget());
    if (player === null) {
      {
        return false;
      }
    }
    player.putCardsOnBottomOfLibrary(makeCards(game.xmageScope(), []).addAll(player.getGraveyard().getCards()));
    player.shuffleLibrary();
    return true;
      return true;
    },
  },
  "ClingToDust::ClingToDustEffect": {
    card: "ClingToDust",
    effect: "ClingToDustEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/ClingToDust.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let card = game.getCard(source.getFirstTarget());
    if (player === null || card === null) {
      {
        return false;
      }
    }
    let isCreature = card.isCreature();
    if (!player.moveCards(card, 'exile')) {
      {
        return false;
      }
    }
    if (isCreature) {
      {
        player.gainLife(3);
      }
    } else {
      {
        player.drawCards(1);
      }
    }
    return true;
      return true;
    },
  },
  "ColdSnap::ColdSnapDamageTargetEffect": {
    card: "ColdSnap",
    effect: "ColdSnapDamageTargetEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/ColdSnap.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player !== null) {
      {
        let damage = game.getBattlefield().getAllActivePermanents((StaticFilters.land().add(superTypePredicate("snow"))), source.getTargetPointer().getFirst()).length;
        player.damage(damage, source.getSourceId());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "ColfenorsPlans::ColfenorsPlansPlayCardEffect": {
    card: "ColfenorsPlans",
    effect: "ColfenorsPlansPlayCardEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/ColfenorsPlans.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ColfenorsPlans::ColfenorsPlansLookAtCardEffect": {
    card: "ColfenorsPlans",
    effect: "ColfenorsPlansLookAtCardEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/ColfenorsPlans.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "CollectiveDefiance::CollectiveDefianceEffect": {
    card: "CollectiveDefiance",
    effect: "CollectiveDefianceEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CollectiveDefiance.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    if (targetPlayer === null) {
      {
        return false;
      }
    }
    let count = targetPlayer.discardCards(targetPlayer.getHand()).size();
    targetPlayer.drawCards(count);
    return true;
      return true;
    },
  },
  "CollectiveEffort::CollectiveEffortEffect": {
    card: "CollectiveEffort",
    effect: "CollectiveEffortEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CollectiveEffort.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let target = game.getPlayer(source.getFirstTarget());
    if (target !== null) {
      {
        for (const p of game.getBattlefield().getAllActivePermanents(StaticFilters.creature(), target.getId())) {
          {
            p.addCounters(CounterType.of("+1/+1").createInstance());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "ColossalBadger::ColossalBadgerEffect": {
    card: "ColossalBadger",
    effect: "ColossalBadgerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/ColossalBadger.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let amount = makeCards(game.xmageScope(), player.millCards(4).ids()).retain(StaticFilters.creatureCard()).size();
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (amount > 0 && permanent !== null) {
      {
        game.processAction();
        permanent.addCounters(CounterType.of("+1/+1").createInstance(amount));
      }
    }
    return true;
      return true;
    },
  },
  "CommuneWithLava::CommuneWithLavaMayPlayEffect": {
    card: "CommuneWithLava",
    effect: "CommuneWithLavaMayPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/CommuneWithLava.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ConcealingCurtains::RevealingEyeEffect": {
    card: "ConcealingCurtains",
    effect: "RevealingEyeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/ConcealingCurtains.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let opponent = game.getPlayer(source.getFirstTarget());
    if (controller === null || opponent === null) {
      {
        return false;
      }
    }
    opponent.revealCards('', opponent.getHand());
    if (makeCards(game.xmageScope(), opponent.getHand().ids()).retain(makeFilter(["card"], [Predicates.not(cardTypePredicate("land"))])).size() < 1) {
      {
        return true;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: makeFilter(["card"], [Predicates.not(cardTypePredicate("land"))]), min: 0, max: 1, zone: 'hand' });
    (target.choose(game, '', controller.getId(), opponent.getHand().ids()).length > 0);
    let card = game.getCard(target.getFirstTarget());
    if (card === null) {
      {
        return true;
      }
    }
    (opponent.discardCards(card).size() > 0);
    opponent.drawCards(1);
    return true;
      return true;
    },
  },
  "Condemn::CondemnEffect": {
    card: "Condemn",
    effect: "CondemnEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/Condemn.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getFirstTarget());
    if (permanent !== null) {
      {
        let player = game.getPlayer(permanent.getControllerId());
        if (player !== null) {
          {
            player.gainLife(permanent.getToughness().getValue());
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "ConsignToThePit::ConsignToThePitEffect": {
    card: "ConsignToThePit",
    effect: "ConsignToThePitEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/ConsignToThePit.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    let player = game.getPlayer(permanent.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    permanent.destroy(false);
    player.damage(2, source.getSourceId());
    return true;
      return true;
    },
  },
  "ConspiracyUnraveler::ConspiracyUnravelerInsteadEffect": {
    card: "ConspiracyUnraveler",
    effect: "ConspiracyUnravelerInsteadEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/ConspiracyUnraveler.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "ConsumingAberration::ConsumingAberrationEffect": {
    card: "ConsumingAberration",
    effect: "ConsumingAberrationEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/ConsumingAberration.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const opponentId of game.getOpponents(source.getControllerId())) {
      {
        let player = game.getPlayer(opponentId);
        if (player === null) {
          {
            continue;
          }
        }
        let cards = makeCards(game.xmageScope(), []);
        for (const card of player.getLibrary().getCards()) {
          {
            if (card !== null) {
              {
                cards.add(card);
                if (card.isLand()) {
                  {
                    break;
                  }
                }
              }
            }
          }
        }
        player.revealCards('', cards);
        player.moveCards(cards, 'graveyard');
      }
    }
    return true;
      return true;
    },
  },
  "ContagionEngine::ContagionEngineEffect": {
    card: "ContagionEngine",
    effect: "ContagionEngineEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/ContagionEngine.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    if (targetPlayer !== null) {
      {
        for (const creature of game.getBattlefield().getAllActivePermanents(StaticFilters.creature(), targetPlayer.getId())) {
          {
            creature.addCounters(CounterType.of("-1/-1").createInstance());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "ContainmentBreach::ContainmentBreachEffect": {
    card: "ContainmentBreach",
    effect: "ContainmentBreachEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/ContainmentBreach.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    permanent.destroy(false);
    if (permanent.getManaValue() <= 2) {
      {
        xmageToken(game.xmageScope(), "PestBlackGreenDiesToken").putOntoBattlefield(1, source.getControllerId());
      }
    }
    return true;
      return true;
    },
  },
  "Convalescence::ConvalescenceEffect": {
    card: "Convalescence",
    effect: "ConvalescenceEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/Convalescence.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player !== null && player.getLife() <= 10) {
      {
        player.gainLife(1);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "Conversion::ConversionEffect": {
    card: "Conversion",
    effect: "ConversionEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/Conversion.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "CopperhornScout::CopperhornScoutUntapEffect": {
    card: "CopperhornScout",
    effect: "CopperhornScoutUntapEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CopperhornScout.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let filter = StaticFilters.creatureYouControl();
    let creatures = game.getBattlefield().getActivePermanents(filter, source.getControllerId());
    for (const creature of creatures) {
      {
        if (!(creature.getId() === source.getSourceId())) {
          {
            creature.untap();
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "CoramTheUndertaker::CoramTheUndertakerPlayLandFromGraveyardEffect": {
    card: "CoramTheUndertaker",
    effect: "CoramTheUndertakerPlayLandFromGraveyardEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/CoramTheUndertaker.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "CoramTheUndertaker::CoramTheUndertakerCastSpellFromGraveyardEffect": {
    card: "CoramTheUndertaker",
    effect: "CoramTheUndertakerCastSpellFromGraveyardEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/CoramTheUndertaker.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "Corrosion::CorrosionUpkeepEffect": {
    card: "Corrosion",
    effect: "CorrosionUpkeepEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/Corrosion.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let sourcePermanent = game.getPermanentOrLKIBattlefield(source.getSourceId());
    if (player !== null && sourcePermanent !== null) {
      {
        let targetPlayer = game.getPlayer(source.getFirstTarget());
        if (targetPlayer !== null) {
          {
            for (const permanent of game.getBattlefield().getAllActivePermanents((StaticFilters.artifact()), targetPlayer.getId())) {
              {
                permanent.addCounters(CounterType.of("rust").createInstance());
              }
            }
          }
        }
        for (const permanent of game.getBattlefield().getActivePermanents((StaticFilters.artifact()), source.getControllerId())) {
          {
            if (permanent.getManaValue() <= permanent.getCounters().getCount(CounterType.of("rust"))) {
              {
                permanent.destroy(true);
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "CosimaGodOfTheVoyage::TheOmenkeelPlayFromExileEffect": {
    card: "CosimaGodOfTheVoyage",
    effect: "TheOmenkeelPlayFromExileEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/CosimaGodOfTheVoyage.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "CosmicRebirth::CosmicRebirthEffect": {
    card: "CosmicRebirth",
    effect: "CosmicRebirthEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CosmicRebirth.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let card = game.getCard(source.getTargetPointer().getFirst());
    return player !== null && card !== null && player.moveCards(card, (card.getManaValue() <= 3 && player.chooseUse('') ? 'battlefield' : 'hand'));
      return true;
    },
  },
  "CosmosCharger::CosmosChargerAllowForetellAnytime": {
    card: "CosmosCharger",
    effect: "CosmosChargerAllowForetellAnytime",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/CosmosCharger.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "CountrysideCrusher::CountrysideCrusherEffect": {
    card: "CountrysideCrusher",
    effect: "CountrysideCrusherEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CountrysideCrusher.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let sourcePermanent = game.getPermanentOrLKIBattlefield(source.getSourceId());
    if (controller === null || sourcePermanent === null) {
      {
        return false;
      }
    }
    let cards = makeCards(game.xmageScope(), []);
    for (const card of controller.getLibrary().getCards()) {
      {
        cards.add(card);
        if (card.isLand()) {
          {
            controller.moveCards(card, 'graveyard');
          }
        } else {
          {
            break;
          }
        }
      }
    }
    controller.revealCards('', cards);
    return true;
      return true;
    },
  },
  "CourtOfLocthwain::CourtOfLocthwainCastForFreeEffect": {
    card: "CourtOfLocthwain",
    effect: "CourtOfLocthwainCastForFreeEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/CourtOfLocthwain.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "CrampedVentsAccessMaze::AccessMazeEffect": {
    card: "CrampedVentsAccessMaze",
    effect: "AccessMazeEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/CrampedVentsAccessMaze.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "CraterHellion::CraterHellionEffect": {
    card: "CraterHellion",
    effect: "CraterHellionEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CraterHellion.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanents = game.getBattlefield().getActivePermanents(StaticFilters.creature(), source.getControllerId());
    for (const permanent of permanents) {
      {
        if (!(permanent.getId() === source.getSourceId())) {
          {
            permanent.damage(4, source.getSourceId());
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "Crevasse::CrevasseEffect": {
    card: "Crevasse",
    effect: "CrevasseEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/Crevasse.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "CrownOfConvergence::CrownOfConvergenceEffect": {
    card: "CrownOfConvergence",
    effect: "CrownOfConvergenceEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CrownOfConvergence.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let card = controller.getLibrary().getFromTop();
        if (card !== null) {
          {
            controller.putCardsOnBottomOfLibrary(makeCards(game.xmageScope(), []).add(card));
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "CruelReality::CruelRealityEffect": {
    card: "CruelReality",
    effect: "CruelRealityEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CruelReality.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let cursedPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    let controller = game.getPlayer(source.getControllerId());
    if (cursedPlayer === null || controller === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: (makeFilter(['permanent','you','control'], [controlledByPredicate()]).add(Predicates.or(cardTypePredicate("creature"), cardTypePredicate("planeswalker")))).add(controlledByPredicate()) }).withNotTarget(true);
    if (target.canChoose(game, cursedPlayer.getId()) && (target.choose(game, '', cursedPlayer.getId()).length > 0)) {
      {
        let objectToBeSacrificed = game.getPermanent(target.getFirstTarget());
        if (objectToBeSacrificed !== null) {
          {
            if (objectToBeSacrificed.sacrifice()) {
              {
                return true;
              }
            }
          }
        }
      }
    }
    cursedPlayer.loseLife(5);
    return true;
      return true;
    },
  },
  "Crumble::CrumbleEffect": {
    card: "Crumble",
    effect: "CrumbleEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/Crumble.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (permanent !== null) {
      {
        let cost = permanent.getManaValue();
        let player = game.getPlayer(permanent.getControllerId());
        if (player !== null) {
          {
            player.gainLife(cost);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "CrushUnderfoot::CrushUnderfootEffect": {
    card: "CrushUnderfoot",
    effect: "CrushUnderfootEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CrushUnderfoot.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: (StaticFilters.creatureYouControl()) });
    target.withNotTarget(true);
    if (!target.canChoose(game, controller.getId()) || !(target.choose(game, '', controller.getId()).length > 0)) {
      {
        return false;
      }
    }
    let giant = game.getPermanent(target.getFirstTarget());
    if (giant === null) {
      {
        return false;
      }
    }
    game.informPlayers('' + giant.getName());
    let targetCreature = game.getPermanent(source.getTargetPointer().getFirst());
    return targetCreature !== null && targetCreature.damage(giant.getPower().getValue(), source.getSourceId()) > 0;
      return true;
    },
  },
  "CullingDais::CullingDaisEffect": {
    card: "CullingDais",
    effect: "CullingDaisEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CullingDais.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let p = game.getPermanentOrLKIBattlefield(source.getSourceId());
    let player = game.getPlayer(source.getControllerId());
    if (p !== null && player !== null) {
      {
        let count = p.getCounters().getCount(CounterType.of("charge"));
        player.drawCards(count);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "CunningAbduction::CunningAbductionSpendAnyManaEffect": {
    card: "CunningAbduction",
    effect: "CunningAbductionSpendAnyManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/CunningAbduction.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "Curfew::CurfewEffect": {
    card: "Curfew",
    effect: "CurfewEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/Curfew.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player === null || game.getBattlefield().countAll(StaticFilters.creature(), playerId) <= 0) {
          {
            continue;
          }
        }
        let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creatureYouControl() });
        target.withNotTarget(true);
        (target.choose(game, '', player.getId()).length > 0);
        let permanent = game.getPermanent(target.getFirstTarget());
        if (permanent !== null) {
          {
            player.moveCards(permanent, 'hand');
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "CurseOfBounty::UntapAllNonlandsTargetEffect": {
    card: "CurseOfBounty",
    effect: "UntapAllNonlandsTargetEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CurseOfBounty.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player !== null) {
      {
        for (const nonland of game.getBattlefield().getAllActivePermanents(makeFilter(["permanent"], [Predicates.not(cardTypePredicate("land"))]), player.getId())) {
          {
            nonland.untap();
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "CurseOfChaos::CurseOfChaosEffect": {
    card: "CurseOfChaos",
    effect: "CurseOfChaosEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CurseOfChaos.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let attacker = game.getPlayer(source.getTargetPointer().getFirst());
    if (attacker !== null) {
      {
        if (!attacker.getHand().isEmpty() && attacker.chooseUse('')) {
          {
            attacker.discard(1);
            attacker.drawCards(1);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "CurseOfConformity::CurseOfConformityEffect": {
    card: "CurseOfConformity",
    effect: "CurseOfConformityEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/CurseOfConformity.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "CurseOfShakenFaith::CurseOfShakenFaithEffect": {
    card: "CurseOfShakenFaith",
    effect: "CurseOfShakenFaithEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CurseOfShakenFaith.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let enchantment = game.getPermanentOrLKIBattlefield(source.getSourceId());
    if (enchantment !== null) {
      {
        let enchantedPlayer = game.getPlayer(enchantment.getAttachedTo());
        if (enchantedPlayer !== null) {
          {
            enchantedPlayer.damage(2, source.getSourceId());
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "CurseOfUnbinding::CurseOfUnbindingEffect": {
    card: "CurseOfUnbinding",
    effect: "CurseOfUnbindingEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CurseOfUnbinding.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(game.getActivePlayerId());
    if (player === null) {
      {
        return false;
      }
    }
    let cards = makeCards(game.xmageScope(), []);
    let toHand = null;
    for (const card of player.getLibrary().getCards()) {
      {
        cards.add(card);
        if (card.isCreature()) {
          {
            toHand = card;
            break;
          }
        }
      }
    }
    player.revealCards('', cards);
    let controller = game.getPlayer(source.getControllerId());
    if (toHand !== null && controller !== null) {
      {
        controller.moveCards(toHand, 'battlefield');
      }
    }
    cards.retainZone('library');
    player.moveCards(cards, 'graveyard');
    return true;
      return true;
    },
  },
  "CyberdriveAwakener::CyberdriveAwakenerEffect": {
    card: "CyberdriveAwakener",
    effect: "CyberdriveAwakenerEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/c/CyberdriveAwakener.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "CyclopsGladiator::CyclopsGladiatorEffect": {
    card: "CyclopsGladiator",
    effect: "CyclopsGladiatorEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/c/CyclopsGladiator.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    let cyclops = game.getPermanent(source.getSourceId());
    if (permanent !== null && cyclops !== null) {
      {
        permanent.damage(cyclops.getPower().getValue(), cyclops.getId());
        cyclops.damage(permanent.getPower().getValue(), permanent.getId());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "DanLewis::DanLewisEffect": {
    card: "DanLewis",
    effect: "DanLewisEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/d/DanLewis.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "DarettiScrapSavant::DarettiSacrificeEffect": {
    card: "DarettiScrapSavant",
    effect: "DarettiSacrificeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DarettiScrapSavant.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: makeFilter(["artifact", "you", "control"], [controlledByPredicate(), cardTypePredicate("artifact")]), min: 1, max: 1 }).withNotTarget(true);
    if (!target.canChoose(game, controller.getId()) || !(target.choose(game, '', controller.getId()).length > 0)) {
      {
        return true;
      }
    }
    let artifact = game.getPermanent(target.getFirstTarget());
    if (artifact === null || !artifact.sacrifice()) {
      {
        return true;
      }
    }
    let card = game.getCard(source.getTargetPointer().getFirst());
    return card === null || controller.moveCards(card, 'battlefield');
      return true;
    },
  },
  "DaringPiracy::DaringPiracyEffect": {
    card: "DaringPiracy",
    effect: "DaringPiracyEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DaringPiracy.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let effect = createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), "PirateRedToken"));
    effect.apply(game, source);
    effect.exileTokensCreatedAtNextEndStep(game, source);
    return true;
      return true;
    },
  },
  "DarkImpostor::DarkImpostorExileTargetEffect": {
    card: "DarkImpostor",
    effect: "DarkImpostorExileTargetEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DarkImpostor.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getFirstTarget());
    if (player === null || permanent === null) {
      {
        return false;
      }
    }
    return player.moveCardsToExile(permanent);
      return true;
    },
  },
  "DarkSuspicions::DarkSuspicionsEffect": {
    card: "DarkSuspicions",
    effect: "DarkSuspicionsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DarkSuspicions.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let opponent = game.getPlayer(source.getTargetPointer().getFirst());
    if (controller !== null && opponent !== null) {
      {
        let xValue = opponent.getHand().size() - controller.getHand().size();
        if (xValue > 0) {
          {
            opponent.loseLife(xValue);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "DarksteelMonolith::DarksteelMonolithAddAltCostEffect": {
    card: "DarksteelMonolith",
    effect: "DarksteelMonolithAddAltCostEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/d/DarksteelMonolith.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "DawnhandDissident::DawnhandDissidentEffect": {
    card: "DawnhandDissident",
    effect: "DawnhandDissidentEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/d/DawnhandDissident.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "DeadIronSledge::DeadIronSledgeDestroyEffect": {
    card: "DeadIronSledge",
    effect: "DeadIronSledgeDestroyEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DeadIronSledge.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const targetId of source.getTargetPointer().getTargets()) {
      {
        let permanent = game.getPermanent(targetId);
        if (permanent !== null) {
          {
            permanent.destroy(false);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "DeadMansChest::DeadMansChestCastFromExileEffect": {
    card: "DeadMansChest",
    effect: "DeadMansChestCastFromExileEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/d/DeadMansChest.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "DeadMansChest::DeadMansChestSpendManaEffect": {
    card: "DeadMansChest",
    effect: "DeadMansChestSpendManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/d/DeadMansChest.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "DeadReckoning::DeadReckoningEffect": {
    card: "DeadReckoning",
    effect: "DeadReckoningEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DeadReckoning.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let targets = source.getTargetPointer().getTargets();
    let card = game.getCard(targets[0]);
    if (player === null || card === null || !player.chooseUse('')) {
      {
        return false;
      }
    }
    let power = card.getPower().getValue();
    player.putCardsOnTopOfLibrary(card);
    if (targets.length < 2 || power < 1) {
      {
        return true;
      }
    }
    let permanent = game.getPermanent(targets[1]);
    if (permanent === null) {
      {
        return true;
      }
    }
    permanent.damage(power);
    return true;
      return true;
    },
  },
  "Deadfall::DeadfallEffect": {
    card: "Deadfall",
    effect: "DeadfallEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/d/Deadfall.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "DeathBegetsLife::DeathBegetsLifeEffect": {
    card: "DeathBegetsLife",
    effect: "DeathBegetsLifeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DeathBegetsLife.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let destroyedPermanent = 0;
        for (const permanent of game.getBattlefield().getActivePermanents((makeFilter('permanent').add(Predicates.or(cardTypePredicate("creature"), cardTypePredicate("enchantment")))), controller.getId())) {
          {
            if (permanent.destroy()) {
              {
                destroyedPermanent++;
              }
            }
          }
        }
        if (destroyedPermanent > 0) {
          {
            game.processAction();
            controller.drawCards(destroyedPermanent);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "DeathByDragons::DeathByDragonsEffect": {
    card: "DeathByDragons",
    effect: "DeathByDragonsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DeathByDragons.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        for (const playerId of game.getState().getPlayersInRange(controller.getId())) {
          {
            if (!(playerId === source.getTargetPointer().getFirst())) {
              {
                let token = xmageToken(game.xmageScope(), "Dragon55Token");
                token.putOntoBattlefield(1, playerId);
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "DeathKiss::DeathKissEffect": {
    card: "DeathKiss",
    effect: "DeathKissEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DeathKiss.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent !== null) {
      {
        game.addEffect(boostTargetEffect(game.xmageScope(), permanent.getPower().getValue(), 0).setTargetPointer(fixedTarget(permanent)), source);
      }
    }
    return true;
      return true;
    },
  },
  "DeathbonnetSprout::DeathbonnetHulkEffect": {
    card: "DeathbonnetSprout",
    effect: "DeathbonnetHulkEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DeathbonnetSprout.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.card(), min: 0, max: 1, zone: "graveyard" });
    target.withNotTarget(true);
    (target.choose(game, '', player.getId()).length > 0);
    let card = game.getCard(target.getFirstTarget());
    if (card === null) {
      {
        return false;
      }
    }
    let creature = card.isCreature();
    player.moveCards(card, 'exile');
    if (!creature) {
      {
        return true;
      }
    }
    let permanent = source.getSourcePermanentIfItStillExists(game);
    if (permanent !== null) {
      {
        permanent.addCounters(CounterType.of("+1/+1").createInstance());
      }
    }
    return true;
      return true;
    },
  },
  "DeathbringerLiege::DeathbringerLiegeEffect": {
    card: "DeathbringerLiege",
    effect: "DeathbringerLiegeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DeathbringerLiege.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let p = game.getPermanent(source.getTargetPointer().getFirst());
    if (p !== null && p.isTapped()) {
      {
        p.destroy(false);
      }
    }
    return false;
      return true;
    },
  },
  "DeathgorgeScavenger::DeathgorgeScavengerEffect": {
    card: "DeathgorgeScavenger",
    effect: "DeathgorgeScavengerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DeathgorgeScavenger.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let card = game.getCard(source.getTargetPointer().getFirst());
        if (card !== null) {
          {
            controller.moveCards(card, 'exile');
            if (card.isCreature()) {
              {
                controller.gainLife(2);
              }
            } else {
              {
                game.addEffect(boostSourceEffect(game.xmageScope(), 1, 1, "EndOfTurn"), source);
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "DeathsCaress::DeathsCaressEffect": {
    card: "DeathsCaress",
    effect: "DeathsCaressEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DeathsCaress.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let creature = game.getPermanentOrLKIBattlefield(source.getFirstTarget());
    if (player !== null && creature !== null && creature.hasSubtype("human")) {
      {
        player.gainLife(creature.getToughness().getValue());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "DebtToTheKami::DebtToTheKamiExileCreatureEffect": {
    card: "DebtToTheKami",
    effect: "DebtToTheKamiExileCreatureEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DebtToTheKami.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getFirstTarget());
    if (player === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creatureYouControl() });
    target.withNotTarget(true);
    (target.choose(game, '', player.getId()).length > 0);
    let permanent = game.getPermanent(target.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    return player.moveCards(permanent, 'exile');
      return true;
    },
  },
  "DebtToTheKami::DebtToTheKamiExileEnchantmentEffect": {
    card: "DebtToTheKami",
    effect: "DebtToTheKamiExileEnchantmentEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DebtToTheKami.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getFirstTarget());
    if (player === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: (makeFilter(['permanent','you','control'], [controlledByPredicate()]).add(cardTypePredicate("enchantment"))) });
    target.withNotTarget(true);
    (target.choose(game, '', player.getId()).length > 0);
    let permanent = game.getPermanent(target.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    return player.moveCards(permanent, 'exile');
      return true;
    },
  },
  "DecreeOfAnnihilation::DecreeOfAnnihilationEffect": {
    card: "DecreeOfAnnihilation",
    effect: "DecreeOfAnnihilationEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DecreeOfAnnihilation.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let cards = makeCards(game.xmageScope(), []);
    for (const permanent of game.getBattlefield().getActivePermanents((makeFilter('permanent').add(Predicates.or(cardTypePredicate("artifact"), cardTypePredicate("creature"), cardTypePredicate("land")))), source.getControllerId())) {
      {
        cards.add(permanent);
      }
    }
    for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player === null) {
          {
            continue;
          }
        }
        cards.addAll(player.getHand());
        cards.addAll(player.getGraveyard());
      }
    }
    return controller.moveCards(cards, 'exile');
      return true;
    },
  },
  "DecreeOfPain::DecreeOfPainEffect": {
    card: "DecreeOfPain",
    effect: "DecreeOfPainEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DecreeOfPain.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let destroyedCreature = 0;
        for (const creature of game.getBattlefield().getActivePermanents(StaticFilters.creature(), controller.getId())) {
          {
            if (creature.destroy(true)) {
              {
                destroyedCreature++;
              }
            }
          }
        }
        if (destroyedCreature > 0) {
          {
            game.processAction();
            controller.drawCards(destroyedCreature);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "DefyDeath::DefyDeathEffect": {
    card: "DefyDeath",
    effect: "DefyDeathEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DefyDeath.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent !== null && permanent.hasSubtype("angel")) {
      {
        permanent.addCounters(CounterType.of("+1/+1").createInstance(2));
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "Delirium::DeliriumEffect": {
    card: "Delirium",
    effect: "DeliriumEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/Delirium.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let creature = game.getPermanent(source.getFirstTarget());
    if (creature !== null) {
      {
        let amount = creature.getPower().getValue();
        let controller = game.getPlayer(creature.getControllerId());
        if (controller !== null) {
          {
            controller.damage(amount, creature.getId());
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "Demilich::DemilichPlayEffect": {
    card: "Demilich",
    effect: "DemilichPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/d/Demilich.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "DemonicBargain::DemonicBargainEffect": {
    card: "DemonicBargain",
    effect: "DemonicBargainEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DemonicBargain.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    player.moveCards(player.getLibrary().getTopCards(13), 'exile');
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.card(), zone: "library" });
    (player.searchLibrary('', target).length > 0);
    let card = player.getLibrary().getCard(target.getFirstTarget());
    if (card !== null) {
      {
        player.moveCards(card, 'hand');
      }
    }
    player.shuffleLibrary();
    return true;
      return true;
    },
  },
  "DemonicEmbrace::DemonicEmbracePlayEffect": {
    card: "DemonicEmbrace",
    effect: "DemonicEmbracePlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/d/DemonicEmbrace.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "DemonlordBelzenlok::DemonlordBelzenlokEffect": {
    card: "DemonlordBelzenlok",
    effect: "DemonlordBelzenlokEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DemonlordBelzenlok.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanentOrLKIBattlefield(source.getSourceId());
    if (controller === null || permanent === null) {
      {
        return false;
      }
    }
    let cont = true;
    let addedToHand = 0;
    while (controller.getLibrary().hasCards() && cont) {
      {
        let card = controller.getLibrary().getFromTop();
        if (card !== null) {
          {
            controller.moveCards(card, 'exile');
            if (!card.isLand()) {
              {
                if (card.getManaValue() < 4) {
                  {
                    cont = false;
                  }
                }
                controller.moveCards(card, 'hand');
                addedToHand++;
              }
            }
          }
        }
      }
    }
    controller.damage(addedToHand, source.getSourceId());
    return true;
      return true;
    },
  },
  "Depressurize::DepressurizeTargetEffect": {
    card: "Depressurize",
    effect: "DepressurizeTargetEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/Depressurize.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent === null || permanent.getPower().getValue() > 0) {
      {
        return false;
      }
    }
    permanent.destroy();
    return true;
      return true;
    },
  },
  "DereviEmpyrialTactician::PutCommanderOnBattlefieldEffect": {
    card: "DereviEmpyrialTactician",
    effect: "PutCommanderOnBattlefieldEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DereviEmpyrialTactician.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let card = game.getCard(source.getSourceId());
    if (card !== null) {
      {
        player.moveCards(card, 'battlefield');
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "DesculptingBlast::DesculptingBlastEffect": {
    card: "DesculptingBlast",
    effect: "DesculptingBlastEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DesculptingBlast.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (player === null || permanent === null) {
      {
        return false;
      }
    }
    let flag = permanent.isAttacking();
    player.moveCards(permanent, 'hand');
    if (flag) {
      {
        xmageToken(game.xmageScope(), "DroneFlyingToken").putOntoBattlefield(1, source.getControllerId());
      }
    }
    return true;
      return true;
    },
  },
  "DesecratedEarth::DesecratedEarthEffect": {
    card: "DesecratedEarth",
    effect: "DesecratedEarthEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DesecratedEarth.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (permanent !== null) {
      {
        let player = game.getPlayer(permanent.getControllerId());
        if (player !== null) {
          {
            player.discard(1);
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "DestroyTheEvidence::DestroyTheEvidenceEffect": {
    card: "DestroyTheEvidence",
    effect: "DestroyTheEvidenceEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DestroyTheEvidence.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let landPermanent = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (landPermanent !== null) {
      {
        let player = game.getPlayer(landPermanent.getControllerId());
        if (player === null) {
          {
            return false;
          }
        }
        let cards = makeCards(game.xmageScope(), []);
        for (const card of player.getLibrary().getCards()) {
          {
            if (card !== null) {
              {
                cards.add(card);
                if (card.isLand()) {
                  {
                    break;
                  }
                }
              }
            }
          }
        }
        player.revealCards('', cards);
        player.moveCards(cards, 'graveyard');
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "DestructiveRevelry::DestructiveRevelryEffect": {
    card: "DestructiveRevelry",
    effect: "DestructiveRevelryEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DestructiveRevelry.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent !== null) {
      {
        permanent.destroy(false);
        let permController = game.getPlayer(permanent.getControllerId());
        if (permController !== null) {
          {
            permController.damage(2, source.getSourceId());
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "DetectionTower::DetectionTowerEffect": {
    card: "DetectionTower",
    effect: "DetectionTowerEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/d/DetectionTower.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "DetectivesPhoenix::DetectivesPhoenixEffect": {
    card: "DetectivesPhoenix",
    effect: "DetectivesPhoenixEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/d/DetectivesPhoenix.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "DevilishValet::DevilishValetEffect": {
    card: "DevilishValet",
    effect: "DevilishValetEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DevilishValet.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = source.getSourcePermanentIfItStillExists(game);
    if (permanent === null) {
      {
        return false;
      }
    }
    game.addEffect(boostSourceEffect(game.xmageScope(), permanent.getPower().getValue(), 0, "EndOfTurn"), source);
    return true;
      return true;
    },
  },
  "DevourInShadow::DevourInShadowEffect": {
    card: "DevourInShadow",
    effect: "DevourInShadowEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DevourInShadow.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let target = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (player !== null && target !== null) {
      {
        player.loseLife(target.getToughness().getValue());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "DimensionalInfiltrator::DimensionalInfiltratorEffect": {
    card: "DimensionalInfiltrator",
    effect: "DimensionalInfiltratorEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DimensionalInfiltrator.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let opponent = game.getPlayer(source.getFirstTarget());
    if (player === null || opponent === null) {
      {
        return false;
      }
    }
    let card = opponent.getLibrary().getFromTop();
    if (card === null) {
      {
        return false;
      }
    }
    player.moveCards(card, 'exile');
    if (!card.isLand()) {
      {
        return true;
      }
    }
    let permanent = source.getSourcePermanentIfItStillExists(game);
    return permanent !== null && player.chooseUse('') && player.moveCards(permanent, 'hand');
      return true;
    },
  },
  "DimirCutpurse::DimirCutpurseEffect": {
    card: "DimirCutpurse",
    effect: "DimirCutpurseEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DimirCutpurse.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let you = game.getPlayer(source.getControllerId());
    let damagedPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    if (damagedPlayer !== null) {
      {
        damagedPlayer.discard(1);
      }
    }
    if (you !== null) {
      {
        you.drawCards(1);
      }
    }
    return true;
      return true;
    },
  },
  "DinasGuidance::DinasGuidanceEffect": {
    card: "DinasGuidance",
    effect: "DinasGuidanceEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DinasGuidance.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creatureCard(), zone: "library" });
    if ((controller.searchLibrary('', target).length > 0)) {
      {
        let card = game.getCard(target.getFirstTarget());
        if (card !== null) {
          {
            controller.revealCards('', makeCards(game.xmageScope(), []).add(card));
            if (controller.chooseUse('')) {
              {
                controller.moveCards(card, 'hand');
              }
            } else {
              {
                controller.moveCards(card, 'graveyard');
              }
            }
          }
        }
      }
    }
    controller.shuffleLibrary();
    return true;
      return true;
    },
  },
  "DingusStaff::DingusStaffEffect": {
    card: "DingusStaff",
    effect: "DingusStaffEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DingusStaff.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (permanent !== null) {
      {
        let controller = game.getPlayer(permanent.getControllerId());
        if (controller !== null) {
          {
            controller.damage(2, source.getSourceId());
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "DinrovaHorror::DinrovaHorrorEffect": {
    card: "DinrovaHorror",
    effect: "DinrovaHorrorEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DinrovaHorror.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let target = game.getPermanent(source.getFirstTarget());
    if (target !== null) {
      {
        let controller = game.getPlayer(target.getControllerId());
        if (controller !== null) {
          {
            controller.moveCards(target, 'hand');
            controller.discard(1);
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "DireTactics::DireTacticsEffect": {
    card: "DireTactics",
    effect: "DireTacticsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DireTactics.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    let player = game.getPlayer(source.getControllerId());
    if (permanent === null || player === null) {
      {
        return false;
      }
    }
    let toughness = permanent.getToughness().getValue();
    player.moveCards(permanent, 'exile');
    if (game.getBattlefield().countAll((makeFilter('permanent')), player.getId()) < 1) {
      {
        player.loseLife(toughness);
      }
    }
    return true;
      return true;
    },
  },
  "DiregrafScavenger::DiregrafScavengerEffect": {
    card: "DiregrafScavenger",
    effect: "DiregrafScavengerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DiregrafScavenger.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let targetCard = game.getCard(source.getFirstTarget());
    if (controller === null || targetCard === null) {
      {
        return false;
      }
    }
    let creature = targetCard.isCreature();
    if (!controller.moveCards(targetCard, 'exile')) {
      {
        return false;
      }
    }
    if (creature) {
      {
        for (const opponentId of game.getOpponents(source.getControllerId())) {
          {
            let opponent = game.getPlayer(opponentId);
            if (opponent !== null) {
              {
                opponent.loseLife(2);
              }
            }
          }
        }
        controller.gainLife(2);
      }
    }
    return true;
      return true;
    },
  },
  "Disappear::DisappearEffect": {
    card: "Disappear",
    effect: "DisappearEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/Disappear.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let aura = game.getPermanentOrLKIBattlefield(source.getSourceId());
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null && aura !== null && aura.getAttachedTo() !== null) {
      {
        let enchantedCreature = game.getPermanent(aura.getAttachedTo());
        controller.moveCards(aura, 'hand');
        if (enchantedCreature !== null) {
          {
            controller.moveCards(enchantedCreature, 'hand');
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "DisciplesOfGix::DisciplesOfGixEffect": {
    card: "DisciplesOfGix",
    effect: "DisciplesOfGixEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DisciplesOfGix.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: makeFilter(["artifact", "card"], [cardTypePredicate("artifact")]), min: 0, max: 3, zone: "library" });
    (controller.searchLibrary('', target).length > 0);
    let cards = makeCards(game.xmageScope(), []).addAll(target.getTargets());
    cards.retainZone('library');
    controller.moveCards(cards, 'graveyard');
    controller.shuffleLibrary();
    return true;
      return true;
    },
  },
  "DismissIntoDream::DismissIntoDreamEffect": {
    card: "DismissIntoDream",
    effect: "DismissIntoDreamEffect",
    base: "CreaturesBecomeOtherTypeEffect",
    source: "Mage.Sets/src/mage/cards/d/DismissIntoDream.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "DivineCongregation::DivineCongregationEffect": {
    card: "DivineCongregation",
    effect: "DivineCongregationEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DivineCongregation.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let player = game.getPlayer(source.getFirstTarget());
    if (controller !== null && player !== null) {
      {
        let critters = game.getBattlefield().getAllActivePermanents(StaticFilters.creature(), player.getId()).length;
        controller.gainLife(2 * critters);
      }
    }
    return true;
      return true;
    },
  },
  "DivineReckoning::DivineReckoningEffect": {
    card: "DivineReckoning",
    effect: "DivineReckoningEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DivineReckoning.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let chosen = [];
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        for (const playerId of game.getState().getPlayersInRange(controller.getId())) {
          {
            let player = game.getPlayer(playerId);
            if (player !== null) {
              {
                let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creatureYouControl(), min: 1, max: 1 }).withNotTarget(true);
                if ((target.choose(game, '', player.getId()).length > 0)) {
                  {
                    let permanent = game.getPermanent(target.getFirstTarget());
                    if (permanent !== null) {
                      {
                        chosen.push(permanent);
                      }
                    }
                  }
                }
              }
            }
          }
        }
        for (const permanent of game.getBattlefield().getActivePermanents(StaticFilters.creature(), source.getControllerId())) {
          {
            if (!chosen.includes(permanent)) {
              {
                permanent.destroy(false);
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "DivinerSpirit::DivinerSpiritEffect": {
    card: "DivinerSpirit",
    effect: "DivinerSpiritEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DivinerSpirit.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let sourceController = game.getPlayer(source.getControllerId());
    let damagedPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    if (sourceController !== null && damagedPlayer !== null) {
      {
        let amount = Number(game.getState().getValue("damage"));
        if (amount > 0) {
          {
            sourceController.drawCards(amount);
            damagedPlayer.drawCards(amount);
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "DogmeatEverLoyal::DogmeatEverLoyalEffect": {
    card: "DogmeatEverLoyal",
    effect: "DogmeatEverLoyalEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DogmeatEverLoyal.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null || makeCards(game.xmageScope(), player.getGraveyard().ids()).retain((StaticFilters.card().add(Predicates.or(subTypePredicate("aura"), subTypePredicate("equipment"))))).size() < 1) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: (StaticFilters.card().add(Predicates.or(subTypePredicate("aura"), subTypePredicate("equipment")))), zone: "graveyard" });
    target.withNotTarget(true);
    (target.choose(game, '', player.getId()).length > 0);
    let card = game.getCard(target.getFirstTarget());
    return card !== null && player.moveCards(card, 'hand');
      return true;
    },
  },
  "DongZhouTheTyrant::DongZhouTheTyrantEffect": {
    card: "DongZhouTheTyrant",
    effect: "DongZhouTheTyrantEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DongZhouTheTyrant.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let creature = game.getPermanent(source.getFirstTarget());
    if (creature !== null) {
      {
        let amount = creature.getPower().getValue();
        let controller = game.getPlayer(creature.getControllerId());
        if (controller !== null) {
          {
            controller.damage(amount, creature.getId());
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "Doomgape::DoomgapeEffect": {
    card: "Doomgape",
    effect: "DoomgapeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/Doomgape.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creature().add(controlledByPredicate()) }).withNotTarget(true);
        if ((target.choose(game, '', controller.getId()).length > 0)) {
          {
            let creature = game.getPermanent(target.getFirstTarget());
            if (creature !== null) {
              {
                if (creature.sacrifice()) {
                  {
                    controller.gainLife(creature.getToughness().getValue());
                    return true;
                  }
                }
              }
            }
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "DoubleTrouble::DoubleTroubleEffect": {
    card: "DoubleTrouble",
    effect: "DoubleTroubleEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DoubleTrouble.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const permanent of game.getBattlefield().getActivePermanents(StaticFilters.creatureYouControl(), source.getControllerId())) {
      {
        let power = permanent.getPower().getValue();
        if (power !== 0) {
          {
            game.addEffect(boostTargetEffect(game.xmageScope(), power, 0).setTargetPointer(fixedTarget(permanent)), source);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "DragonHunter::CanBlockDragonsAsThoughtIthadReachEffect": {
    card: "DragonHunter",
    effect: "CanBlockDragonsAsThoughtIthadReachEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/d/DragonHunter.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "DragonclawStrike::DragonclawStrikeEffect": {
    card: "DragonclawStrike",
    effect: "DragonclawStrikeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DragonclawStrike.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent === null) {
      {
        return false;
      }
    }
    game.addEffect(boostTargetEffect(game.xmageScope(), permanent.getPower().getValue(), permanent.getToughness().getValue()).setTargetPointer(fixedTarget(permanent)), source);
    return true;
      return true;
    },
  },
  "DrakeFamiliar::DrakeFamiliarEffect": {
    card: "DrakeFamiliar",
    effect: "DrakeFamiliarEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DrakeFamiliar.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.enchantment() });
    target.withNotTarget(true);
    if (target.canChoose(game, controller.getId()) && controller.chooseUse('')) {
      {
        (target.choose(game, '', controller.getId()).length > 0);
        let permanent = game.getPermanent(target.getFirstTarget());
        if (permanent !== null) {
          {
            return controller.moveCards(permanent, 'hand');
          }
        }
      }
    }
    let permanent = source.getSourcePermanentIfItStillExists(game);
    return permanent !== null && permanent.sacrifice();
      return true;
    },
  },
  "DralnusCrusade::DralnusCrusadeEffect": {
    card: "DralnusCrusade",
    effect: "DralnusCrusadeEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/d/DralnusCrusade.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "DranaAndLinvala::DranaAndLinvalaManaEffect": {
    card: "DranaAndLinvala",
    effect: "DranaAndLinvalaManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/d/DranaAndLinvala.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "DranaTheLastBloodchief::DranaTheLastBloodchiefSubtypeEffect": {
    card: "DranaTheLastBloodchief",
    effect: "DranaTheLastBloodchiefSubtypeEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/d/DranaTheLastBloodchief.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "DrasticRevelation::DrasticRevelationEffect": {
    card: "DrasticRevelation",
    effect: "DrasticRevelationEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DrasticRevelation.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let you = game.getPlayer(source.getControllerId());
    if (you === null) {
      {
        return false;
      }
    }
    you.discardCards(you.getHand());
    you.drawCards(7);
    you.discard(3);
    return false;
      return true;
    },
  },
  "DraugrNecromancer::DraugrNecromancerCastFromExileEffect": {
    card: "DraugrNecromancer",
    effect: "DraugrNecromancerCastFromExileEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/d/DraugrNecromancer.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "DraugrNecromancer::DraugrNecromancerSpendAnyManaEffect": {
    card: "DraugrNecromancer",
    effect: "DraugrNecromancerSpendAnyManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/d/DraugrNecromancer.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "DreamCache::DreamCacheEffect": {
    card: "DreamCache",
    effect: "DreamCacheEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DreamCache.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        controller.drawCards(3);
        let putOnTop = controller.chooseUse('');
        let target = makeTarget(game.xmageScope(), { filter: StaticFilters.card(), min: 2, max: 2, zone: "hand" });
        (target.choose(game, '', controller.getId()).length > 0);
        let cardsToLibrary = makeCards(game.xmageScope(), []).addAll(target.getTargets());
        if (!cardsToLibrary.isEmpty()) {
          {
            if (putOnTop) {
              {
                controller.putCardsOnTopOfLibrary(cardsToLibrary);
              }
            } else {
              {
                controller.putCardsOnBottomOfLibrary(cardsToLibrary);
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "DreamHalls::DreamHallsEffect": {
    card: "DreamHalls",
    effect: "DreamHallsEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/d/DreamHalls.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "DreamdewEntrancer::DreamdewEntrancerEffect": {
    card: "DreamdewEntrancer",
    effect: "DreamdewEntrancerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DreamdewEntrancer.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    return player !== null && permanent !== null && permanent.isControlledBy(source.getControllerId()) && player.drawCards(2) > 0;
      return true;
    },
  },
  "DruidicSatchel::DruidicSatchelEffect": {
    card: "DruidicSatchel",
    effect: "DruidicSatchelEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DruidicSatchel.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let card = controller.getLibrary().getFromTop();
    if (card !== null) {
      {
        controller.revealCards('', makeCards(game.xmageScope(), []).add(card));
        if (card.isCreature()) {
          {
            xmageToken(game.xmageScope(), "SaprolingToken").putOntoBattlefield(1, source.getControllerId());
          }
        }
        if (card.isLand()) {
          {
            controller.moveCards(card, 'battlefield');
          }
        }
        if (!card.isCreature() && !card.isLand()) {
          {
            controller.gainLife(2);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "Duplicant::DuplicantContinuousEffect": {
    card: "Duplicant",
    effect: "DuplicantContinuousEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/d/Duplicant.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "DuskmantleSeer::DuskmantleSeerEffect": {
    card: "DuskmantleSeer",
    effect: "DuskmantleSeerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DuskmantleSeer.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player === null) {
          {
            continue;
          }
        }
        let card = player.getLibrary().getFromTop();
        if (card === null) {
          {
            continue;
          }
        }
        player.revealCards('', makeCards(game.xmageScope(), []).add(card));
        player.loseLife(card.getManaValue());
        player.moveCards(card, 'hand');
      }
    }
    return true;
      return true;
    },
  },
  "DwarvenDriller::DwarvenDrillerEffect": {
    card: "DwarvenDriller",
    effect: "DwarvenDrillerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DwarvenDriller.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent !== null) {
      {
        let player = game.getPlayer(permanent.getControllerId());
        if (player !== null) {
          {
            let message = '';
            if (player.chooseUse('')) {
              {
                player.damage(2, source.getSourceId());
              }
            } else {
              {
                permanent.destroy(false);
              }
            }
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "DwarvenScorcher::DwarvenScorcherEffect": {
    card: "DwarvenScorcher",
    effect: "DwarvenScorcherEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/d/DwarvenScorcher.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    let player = game.getPlayer(permanent.getControllerId());
    if (player !== null && player.chooseUse('')) {
      {
        return player.damage(2, source.getSourceId()) > 0;
      }
    }
    return permanent.damage(1, source.getSourceId()) > 0;
      return true;
    },
  },
  "DynaheirInvokerAdept::DynaheirInvokerAdeptHasteEffect": {
    card: "DynaheirInvokerAdept",
    effect: "DynaheirInvokerAdeptHasteEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/d/DynaheirInvokerAdept.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "EMPBlast::EMPBlastEffect": {
    card: "EMPBlast",
    effect: "EMPBlastEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/EMPBlast.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const artifact of game.getBattlefield().getActivePermanents(StaticFilters.artifact(), source.getControllerId())) {
      {
        artifact.tap();
      }
    }
    return true;
      return true;
    },
  },
  "EarlyHarvest::UntapAllLandsTargetEffect": {
    card: "EarlyHarvest",
    effect: "UntapAllLandsTargetEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/EarlyHarvest.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player !== null) {
      {
        for (const land of game.getBattlefield().getAllActivePermanents((StaticFilters.land().add(superTypePredicate("basic"))), player.getId())) {
          {
            land.untap();
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "EarlyWinter::EarlyWinterTargetEffect": {
    card: "EarlyWinter",
    effect: "EarlyWinterTargetEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/EarlyWinter.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getFirstTarget());
    if (player === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: (makeFilter(['permanent','you','control'], [controlledByPredicate()]).add(cardTypePredicate("enchantment"))) });
    target.withNotTarget(true);
    (target.choose(game, '', player.getId()).length > 0);
    let permanent = game.getPermanent(target.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    return player.moveCards(permanent, 'exile');
      return true;
    },
  },
  "EatenByPiranhas::EatenByPiranhasEffect": {
    card: "EatenByPiranhas",
    effect: "EatenByPiranhasEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/e/EatenByPiranhas.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "EaterOfTheDead::EaterOfTheDeadEffect": {
    card: "EaterOfTheDead",
    effect: "EaterOfTheDeadEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/EaterOfTheDead.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanentOrLKIBattlefield(source.getSourceId());
    if (player === null || permanent === null || !permanent.isTapped()) {
      {
        return false;
      }
    }
    let card = game.getCard(source.getFirstTarget());
    if (card !== null) {
      {
        player.moveCards(card, 'exile');
      }
    }
    permanent.untap();
    return true;
      return true;
    },
  },
  "EaterOfVirtue::EaterOfVirtueExileEffect": {
    card: "EaterOfVirtue",
    effect: "EaterOfVirtueExileEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/EaterOfVirtue.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let eaterOfVirtue = game.getPermanent(source.getSourceId());
    let exiledCard = game.getCard(source.getTargetPointer().getFirst());
    if (controller !== null && eaterOfVirtue !== null && exiledCard !== null) {
      {
        let exileId = CardUtil.getExileZoneId(source.getSourceId());
        controller.moveCardsToExile(exiledCard);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "EbondeathDracolich::EbondeathDracolichEffect": {
    card: "EbondeathDracolich",
    effect: "EbondeathDracolichEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/e/EbondeathDracolich.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "EccentricApprentice::EccentricApprenticeEffect": {
    card: "EccentricApprentice",
    effect: "EccentricApprenticeEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/e/EccentricApprentice.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "EgoErasure::EgoErasureEffect": {
    card: "EgoErasure",
    effect: "EgoErasureEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/e/EgoErasure.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "EldraziMonument::EldraziMonumentEffect": {
    card: "EldraziMonument",
    effect: "EldraziMonumentEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/EldraziMonument.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creature().add(controlledByPredicate()) }).withNotTarget(true);
    if (target.canChoose(game, controller.getId())) {
      {
        (target.choose(game, '', controller.getId()).length > 0);
        let permanent = game.getPermanent(target.getFirstTarget());
        if (permanent !== null) {
          {
            return permanent.sacrifice();
          }
        }
      }
    }
    let permanent = game.getPermanent(source.getSourceId());
    if (permanent !== null) {
      {
        return permanent.sacrifice();
      }
    }
    return false;
      return true;
    },
  },
  "ElementalMastery::ElementalMasteryEffect": {
    card: "ElementalMastery",
    effect: "ElementalMasteryEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/ElementalMastery.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let creatureAttached = game.getPermanent(source.getSourceId());
    if (creatureAttached !== null) {
      {
        let power = creatureAttached.getPower().getValue();
        if (power > 0) {
          {
            let effect = createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), "Elemental11HasteToken"), power);
            effect.apply(game, source);
            effect.exileTokensCreatedAtNextEndStep(game, source);
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "EliteSpellbinder::EliteSpellbinderCastEffect": {
    card: "EliteSpellbinder",
    effect: "EliteSpellbinderCastEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/e/EliteSpellbinder.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "Elminster::ElminsterExileEffect": {
    card: "Elminster",
    effect: "ElminsterExileEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/Elminster.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let card = player.getLibrary().getFromTop();
    if (card === null) {
      {
        return false;
      }
    }
    player.moveCards(card, 'exile');
    if (card.getManaValue() > 0) {
      {
        xmageToken(game.xmageScope(), "FaerieDragonToken").putOntoBattlefield(card.getManaValue(), source.getControllerId());
      }
    }
    return true;
      return true;
    },
  },
  "ElspethTirel::ElspethTirelFirstEffect": {
    card: "ElspethTirel",
    effect: "ElspethTirelFirstEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/ElspethTirel.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let amount = game.getBattlefield().countAll(StaticFilters.creature(), source.getControllerId());
    let player = game.getPlayer(source.getControllerId());
    if (player !== null) {
      {
        player.gainLife(amount);
      }
    }
    return true;
      return true;
    },
  },
  "ElvishRefueler::ElvishRefuelerEffect": {
    card: "ElvishRefueler",
    effect: "ElvishRefuelerEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/e/ElvishRefueler.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "EmberwildeCaptain::EmberwildeCaptainEffect": {
    card: "EmberwildeCaptain",
    effect: "EmberwildeCaptainEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/EmberwildeCaptain.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(game.getActivePlayerId());
    if (player === null || player.getHand().size() < 1) {
      {
        return false;
      }
    }
    return player.damage(player.getHand().size(), source.getSourceId()) > 0;
      return true;
    },
  },
  "EmielTheBlessed::EmielTheBlessedEffect": {
    card: "EmielTheBlessed",
    effect: "EmielTheBlessedEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/EmielTheBlessed.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent === null) {
      {
        return false;
      }
    }
    let counters = (permanent.hasSubtype("unicorn") ? 2 : 1);
    return permanent.addCounters(CounterType.of("+1/+1").createInstance(counters));
      return true;
    },
  },
  "EmryLurkerOfTheLoch::EmryLurkerOfTheLochPlayEffect": {
    card: "EmryLurkerOfTheLoch",
    effect: "EmryLurkerOfTheLochPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/e/EmryLurkerOfTheLoch.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "EnchantersBane::EnchantersBaneEffect": {
    card: "EnchantersBane",
    effect: "EnchantersBaneEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/EnchantersBane.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    let player = game.getPlayer(permanent.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    if (player.chooseUse('')) {
      {
        permanent.sacrifice();
      }
    } else {
      {
        player.damage(permanent.getManaValue(), permanent.getId());
      }
    }
    return true;
      return true;
    },
  },
  "EndlessWhispers::ReturnSourceToBattlefieldEffect": {
    card: "EndlessWhispers",
    effect: "ReturnSourceToBattlefieldEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/EndlessWhispers.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    if (game.getState().getZone(source.getSourceId()) !== 'graveyard') {
      {
        return false;
      }
    }
    let card = game.getCard(source.getSourceId());
    if (card === null) {
      {
        return false;
      }
    }
    let player = game.getPlayer(source.getFirstTarget());
    if (player === null) {
      {
        return false;
      }
    }
    return player.moveCards(card, 'battlefield');
      return true;
    },
  },
  "Endling::EndlingEffect": {
    card: "Endling",
    effect: "EndlingEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/Endling.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getSourceId());
    if (player === null || permanent === null) {
      {
        return false;
      }
    }
    let boost = (player.chooseUse('') ? 1 : -1);
    game.addEffect(boostSourceEffect(game.xmageScope(), boost, -1 * boost, "EndOfTurn"), source);
    return true;
      return true;
    },
  },
  "Endurance::EnduranceEffect": {
    card: "Endurance",
    effect: "EnduranceEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/Endurance.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    return targetPlayer !== null && targetPlayer.putCardsOnBottomOfLibrary(targetPlayer.getGraveyard());
      return true;
    },
  },
  "EnduringIdeal::EnduringIdealEffect": {
    card: "EnduringIdeal",
    effect: "EnduringIdealEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/EnduringIdeal.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let applied = false;
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let target = makeTarget(game.xmageScope(), { filter: makeFilter(["enchantment", "card"], [cardTypePredicate("enchantment")]), zone: "library" });
        (controller.searchLibrary('', target).length > 0);
        let targetCard = game.getCard(target.getFirstTarget());
        if (targetCard === null) {
          {
            applied = false;
          }
        } else {
          {
            applied = controller.moveCards(targetCard, 'battlefield');
            controller.shuffleLibrary();
          }
        }
      }
    }
    return applied;
      return true;
    },
  },
  "EngulfingSlagwurm::EngulfingSlagwurmEffect": {
    card: "EngulfingSlagwurm",
    effect: "EngulfingSlagwurmEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/EngulfingSlagwurm.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let creature = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (creature !== null && controller !== null) {
      {
        controller.gainLife(creature.getToughness().getValue());
      }
    }
    return false;
      return true;
    },
  },
  "Enslave::EnslaveEffect": {
    card: "Enslave",
    effect: "EnslaveEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/Enslave.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let sourcePermanent = game.getPermanentOrLKIBattlefield(source.getSourceId());
    if (sourcePermanent !== null) {
      {
        let attached = game.getPermanentOrLKIBattlefield(sourcePermanent.getAttachedTo());
        if (attached !== null) {
          {
            let owner = game.getPlayer(attached.getOwnerId());
            if (owner !== null) {
              {
                owner.damage(1, attached.getId());
                return true;
              }
            }
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "EntrailsFeaster::EntrailsFeasterEffect": {
    card: "EntrailsFeaster",
    effect: "EntrailsFeasterEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/EntrailsFeaster.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null && source.getSourceId() !== null) {
      {
        let sourceObject = source.getSourcePermanentIfItStillExists(game);
        let target = makeTarget(game.xmageScope(), { filter: makeFilter(["creature", "card"], [cardTypePredicate("creature")]), zone: "graveyard" });
        target.withNotTarget(true);
        if (target.canChoose(game, controller.getId()) && controller.chooseUse('')) {
          {
            if ((target.choose(game, '', controller.getId()).length > 0)) {
              {
                let cardChosen = game.getCard(target.getFirstTarget());
                if (cardChosen !== null) {
                  {
                    controller.moveCardsToExile(cardChosen);
                    if (sourceObject !== null) {
                      {
                        sourceObject.addCounters(CounterType.of("+1/+1").createInstance());
                      }
                    }
                  }
                }
              }
            } else {
              if (sourceObject !== null) {
                {
                  sourceObject.tap();
                }
              }
            }
          }
        } else {
          if (sourceObject !== null) {
            {
              sourceObject.tap();
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "EpicFight::EpicFightEffect": {
    card: "EpicFight",
    effect: "EpicFightEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/EpicFight.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    let boost = boostTargetEffect(game.xmageScope(), permanent.getPower().getValue(), permanent.getToughness().getValue()).setTargetPointer(fixedTarget(permanent));
    game.addEffect(boost, source);
    return true;
      return true;
    },
  },
  "ErraticExplosion::ErraticExplosionEffect": {
    card: "ErraticExplosion",
    effect: "ErraticExplosionEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/ErraticExplosion.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let toReveal = makeCards(game.xmageScope(), []);
        let nonLandCard = null;
        for (const card of controller.getLibrary().getCards()) {
          {
            toReveal.add(card);
            if (!card.isLand()) {
              {
                nonLandCard = card;
                break;
              }
            }
          }
        }
        controller.revealCards('', toReveal);
        if (nonLandCard !== null) {
          {
            let targetCreature = game.getPermanent(source.getTargetPointer().getFirst());
            if (targetCreature !== null) {
              {
                targetCreature.damage(nonLandCard.getManaValue(), source.getSourceId());
              }
            } else {
              {
                let targetPlayer = game.getPlayer(source.getTargetPointer().getFirst());
                if (targetPlayer !== null) {
                  {
                    targetPlayer.damage(nonLandCard.getManaValue(), source.getSourceId());
                  }
                }
              }
            }
          }
        }
        return controller.putCardsOnBottomOfLibrary(toReveal);
      }
    }
    return false;
      return true;
    },
  },
  "ErraticMutation::ErraticMutationEffect": {
    card: "ErraticMutation",
    effect: "ErraticMutationEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/ErraticMutation.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let sourceObject = game.getObject(source.getSourceId());
    if (controller !== null && sourceObject !== null) {
      {
        let toReveal = makeCards(game.xmageScope(), []);
        let nonLandCard = null;
        for (const card of controller.getLibrary().getCards()) {
          {
            toReveal.add(card);
            if (!card.isLand()) {
              {
                nonLandCard = card;
                break;
              }
            }
          }
        }
        controller.revealCards('', toReveal);
        if (nonLandCard !== null) {
          {
            let boostValue = nonLandCard.getManaValue();
            let effect = boostTargetEffect(game.xmageScope(), boostValue, -boostValue, "EndOfTurn");
            effect.setTargetPointer(fixedTarget(source.getTargetPointer().getFirst()));
            game.addEffect(effect, source);
          }
        }
        return controller.putCardsOnBottomOfLibrary(toReveal);
      }
    }
    return false;
      return true;
    },
  },
  "EscapeToTheWilds::EscapeToTheWildsMayPlayEffect": {
    card: "EscapeToTheWilds",
    effect: "EscapeToTheWildsMayPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/e/EscapeToTheWilds.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "EternalScourge::EternalScourgePlayEffect": {
    card: "EternalScourge",
    effect: "EternalScourgePlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/e/EternalScourge.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "EtherealAbsolution::EtherealAbsolutionEffect": {
    card: "EtherealAbsolution",
    effect: "EtherealAbsolutionEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/EtherealAbsolution.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let card = game.getCard(source.getFirstTarget());
    if (player === null || card === null) {
      {
        return false;
      }
    }
    if (card.isCreature()) {
      {
        createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), "WhiteBlackSpiritToken")).apply(game, source);
      }
    }
    return player.moveCards(card, 'exile');
      return true;
    },
  },
  "EvelynTheCovetous::EvelynTheCovetousCastEffect": {
    card: "EvelynTheCovetous",
    effect: "EvelynTheCovetousCastEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/e/EvelynTheCovetous.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "EvelynTheCovetous::EvelynTheCovetousManaEffect": {
    card: "EvelynTheCovetous",
    effect: "EvelynTheCovetousManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/e/EvelynTheCovetous.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "EvendoBrushrazer::EvendoBrushrazerEffect": {
    card: "EvendoBrushrazer",
    effect: "EvendoBrushrazerEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/e/EvendoBrushrazer.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "EverythingamajigC::ChimericStaffEffect": {
    card: "EverythingamajigC",
    effect: "ChimericStaffEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/e/EverythingamajigC.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "ExcavaTheRisenPast::ExcavaTheRisenPastContinuousEffect": {
    card: "ExcavaTheRisenPast",
    effect: "ExcavaTheRisenPastContinuousEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/e/ExcavaTheRisenPast.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "ExcavationTechnique::ExcavationTechniqueEffect": {
    card: "ExcavationTechnique",
    effect: "ExcavationTechniqueEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/ExcavationTechnique.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    permanent.destroy(false);
    xmageToken(game.xmageScope(), "TreasureToken").putOntoBattlefield(2, permanent.getControllerId());
    return true;
      return true;
    },
  },
  "Exile::ExileEffect": {
    card: "Exile",
    effect: "ExileEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/Exile.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getFirstTarget());
    if (permanent !== null) {
      {
        let player = game.getPlayer(source.getControllerId());
        if (player !== null) {
          {
            player.gainLife(permanent.getToughness().getValue());
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "ExpeditedInheritance::ExpeditedInheritanceMayPlayEffect": {
    card: "ExpeditedInheritance",
    effect: "ExpeditedInheritanceMayPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/e/ExpeditedInheritance.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ExpelTheUnworthy::ExpelTheUnworthyEffect": {
    card: "ExpelTheUnworthy",
    effect: "ExpelTheUnworthyEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/ExpelTheUnworthy.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let target = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (target === null) {
      {
        return false;
      }
    }
    let player = game.getPlayer(target.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    return player.gainLife(target.getManaValue()) > 0;
      return true;
    },
  },
  "ExtinguishTheLight::ExtinguishTheLightEffect": {
    card: "ExtinguishTheLight",
    effect: "ExtinguishTheLightEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/ExtinguishTheLight.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    let manaValue = permanent.getManaValue();
    permanent.destroy();
    if (manaValue <= 3) {
      {
        let controller = game.getPlayer(source.getControllerId());
        if (controller !== null) {
          {
            controller.gainLife(3);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "EyeOfSingularity::EyeOfSingularityETBEffect": {
    card: "EyeOfSingularity",
    effect: "EyeOfSingularityETBEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/e/EyeOfSingularity.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let cardNames = new Map();
    let toDestroy = new Map();
    for (const permanent of game.getBattlefield().getActivePermanents((makeFilter('permanent').add(Predicates.not(superTypePredicate("basic")))), source.getControllerId())) {
      {
        let cardName = permanent.getName();
        if (cardNames.get(cardName) === null) {
          {
            cardNames.set(cardName, permanent.getId());
          }
        } else {
          {
            toDestroy.set(cardNames.get(cardName), 1);
            toDestroy.set(permanent.getId(), 1);
          }
        }
      }
    }
    for (const id of [...toDestroy.keys()]) {
      {
        let permanent = game.getPermanent(id);
        if (permanent !== null) {
          {
            permanent.destroy(false);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "FabledPassage::FabledPassageUntapLandEffect": {
    card: "FabledPassage",
    effect: "FabledPassageUntapLandEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/FabledPassage.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetLandCard = game.getCard(source.getTargetPointer().getFirst());
    if (targetLandCard === null) {
      {
        return false;
      }
    }
    if (game.getBattlefield().countAll(StaticFilters.land(), source.getControllerId()) < 4) {
      {
        return true;
      }
    }
    let land = game.getPermanent(targetLandCard.getId());
    if (land === null) {
      {
        return false;
      }
    }
    return land.untap();
      return true;
    },
  },
  "FadeFromHistory::FadeFromHistoryTokenEffect": {
    card: "FadeFromHistory",
    effect: "FadeFromHistoryTokenEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/FadeFromHistory.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let playerIds = [];
    for (const permanent of game.getBattlefield().getActivePermanents(makeFilter(["permanent"], [Predicates.or(cardTypePredicate("artifact"), cardTypePredicate("enchantment"))]), source.getControllerId())) {
      {
        playerIds.push(permanent.getControllerId());
      }
    }
    for (const playerId of playerIds) {
      {
        xmageToken(game.xmageScope(), "BearToken").putOntoBattlefield(1, playerId);
      }
    }
    return true;
      return true;
    },
  },
  "FaerieImpostor::FaerieImpostorEffect": {
    card: "FaerieImpostor",
    effect: "FaerieImpostorEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/FaerieImpostor.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: makeFilter(["another", "creature", "you", "control"], [controlledByPredicate(), cardTypePredicate("creature"), anotherPredicate()]), min: 1, max: 1 }).withNotTarget(true);
    if (target.canChoose(game, controller.getId()) && controller.chooseUse('')) {
      {
        (target.choose(game, '', controller.getId()).length > 0);
        let permanent = game.getPermanent(target.getFirstTarget());
        if (permanent !== null) {
          {
            controller.moveCards(permanent, 'hand');
            return true;
          }
        }
      }
    }
    let permanent = source.getSourcePermanentIfItStillExists(game);
    return permanent !== null && permanent.sacrifice();
      return true;
    },
  },
  "FalcoSparaPactweaver::FalcoSparaPactweaverEffect": {
    card: "FalcoSparaPactweaver",
    effect: "FalcoSparaPactweaverEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/f/FalcoSparaPactweaver.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "FalseDawn::FalseDawnManaSpendEffect": {
    card: "FalseDawn",
    effect: "FalseDawnManaSpendEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/f/FalseDawn.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "FanaticOfTheHarrowing::FanaticOfTheHarrowingEffect": {
    card: "FanaticOfTheHarrowing",
    effect: "FanaticOfTheHarrowingEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/FanaticOfTheHarrowing.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let flag = false;
    for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player === null) {
          {
            continue;
          }
        }
        if (!player.discard(1).isEmpty() && (playerId === source.getControllerId())) {
          {
            flag = true;
          }
        }
      }
    }
    game.processAction();
    if (flag) {
      {
        let controller = game.getPlayer(source.getControllerId());
        if (controller !== null) {
          {
            controller.drawCards(1);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "FathomFeeder::FathomFeederEffect": {
    card: "FathomFeeder",
    effect: "FathomFeederEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/FathomFeeder.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const opponentId of game.getOpponents(source.getControllerId())) {
      {
        let player = game.getPlayer(opponentId);
        if (player !== null) {
          {
            let card = player.getLibrary().getFromTop();
            if (card !== null) {
              {
                player.moveCards(card, 'exile');
              }
            }
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "FathomTrawl::FathomTrawlEffect": {
    card: "FathomTrawl",
    effect: "FathomTrawlEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/FathomTrawl.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let sourceObject = game.getObject(source.getSourceId());
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null || sourceObject === null) {
      {
        return false;
      }
    }
    let cards = makeCards(game.xmageScope(), []);
    let nonlandCards = makeCards(game.xmageScope(), []);
    let landCards = makeCards(game.xmageScope(), []);
    for (const card of controller.getLibrary().getCards()) {
      {
        if (card !== null) {
          {
            cards.add(card);
            if (!card.isLand()) {
              {
                nonlandCards.add(card);
                if (nonlandCards.size() === 3) {
                  {
                    break;
                  }
                }
              }
            } else {
              {
                landCards.add(card);
              }
            }
          }
        } else {
          {
            break;
          }
        }
      }
    }
    controller.revealCards('', cards);
    controller.moveCards(nonlandCards, 'hand');
    controller.putCardsOnBottomOfLibrary(landCards);
    return true;
      return true;
    },
  },
  "FearOfImmobility::FearOfImmobilityEffect": {
    card: "FearOfImmobility",
    effect: "FearOfImmobilityEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/FearOfImmobility.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    return permanent !== null && game.getOpponents(source.getControllerId()).includes(permanent.getControllerId()) && permanent.addCounters(CounterType.of("stun").createInstance());
      return true;
    },
  },
  "FearsomeAwakening::FearsomeAwakeningEffect": {
    card: "FearsomeAwakening",
    effect: "FearsomeAwakeningEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/FearsomeAwakening.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent !== null && permanent.hasSubtype("dragon")) {
      {
        permanent.addCounters(CounterType.of("+1/+1").createInstance(2));
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "Fecundity::FecundityEffect": {
    card: "Fecundity",
    effect: "FecundityEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/Fecundity.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (permanent !== null) {
      {
        let controller = game.getPlayer(permanent.getControllerId());
        if (controller !== null) {
          {
            if (controller.chooseUse('')) {
              {
                controller.drawCards(1);
              }
            }
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "FeedTheSwarm::FeedTheSwarmEffect": {
    card: "FeedTheSwarm",
    effect: "FeedTheSwarmEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/FeedTheSwarm.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    let player = game.getPlayer(source.getControllerId());
    if (permanent === null || player === null) {
      {
        return false;
      }
    }
    player.loseLife(permanent.getManaValue());
    permanent.destroy(false);
    return true;
      return true;
    },
  },
  "FellTheMighty::FellTheMightyEffect": {
    card: "FellTheMighty",
    effect: "FellTheMightyEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/FellTheMighty.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let targetCreature = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (controller !== null && targetCreature !== null) {
      {
        for (const permanent of game.getBattlefield().getActivePermanents(StaticFilters.creature(), controller.getId())) {
          {
            if (permanent.getPower().getValue() > targetCreature.getPower().getValue()) {
              {
                permanent.destroy(false);
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "FeralLightning::FeralLightningEffect": {
    card: "FeralLightning",
    effect: "FeralLightningEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/FeralLightning.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let effect = createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), "ElementalHasteToken"), 3);
        effect.apply(game, source);
        effect.exileTokensCreatedAtNextEndStep(game, source);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "FestivalOfEmbers::FestivalOfEmbersCastEffect": {
    card: "FestivalOfEmbers",
    effect: "FestivalOfEmbersCastEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/f/FestivalOfEmbers.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "FeudkillersVerdict::FeudkillersVerdictEffect": {
    card: "FeudkillersVerdict",
    effect: "FeudkillersVerdictEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/FeudkillersVerdict.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        controller.gainLife(10);
        let moreLife = false;
        for (const opponentId of game.getOpponents(source.getControllerId())) {
          {
            let opponent = game.getPlayer(opponentId);
            if (opponent !== null) {
              {
                if (controller.getLife() > opponent.getLife()) {
                  {
                    moreLife = true;
                    break;
                  }
                }
              }
            }
          }
        }
        if (moreLife) {
          {
            return createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), "GiantWarriorToken"), 1).apply(game, source);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "FeveredVisions::FeveredVisionsEffect": {
    card: "FeveredVisions",
    effect: "FeveredVisionsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/FeveredVisions.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let activePlayerId = game.getActivePlayerId();
    let player = game.getPlayer(activePlayerId);
    if (controller !== null && player !== null) {
      {
        player.drawCards(1);
        let opponents = game.getOpponents(source.getControllerId());
        if (opponents.includes(player.getId()) && player.getHand().size() > 3) {
          {
            player.damage(2, source.getSourceId());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "FieldOfRuin::FieldOfRuinEffect": {
    card: "FieldOfRuin",
    effect: "FieldOfRuinEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/FieldOfRuin.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        for (const playerId of game.getState().getPlayersInRange(controller.getId())) {
          {
            let player = game.getPlayer(playerId);
            if (player !== null) {
              {
                let target = makeTarget(game.xmageScope(), { filter: StaticFilters.basicLandCard(), min: 0, max: 1, zone: "library" });
                if ((player.searchLibrary('', target).length > 0)) {
                  {
                    player.moveCards(makeCards(game.xmageScope(), []).addAll(target.getTargets()).getCards(), 'battlefield');
                    player.shuffleLibrary();
                  }
                }
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "FireGiantsFury::FireGiantsFuryMayPlayEffect": {
    card: "FireGiantsFury",
    effect: "FireGiantsFuryMayPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/f/FireGiantsFury.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "FireProphecy::FireProphecyEffect": {
    card: "FireProphecy",
    effect: "FireProphecyEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/FireProphecy.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null || player.getHand().isEmpty() || !player.chooseUse('')) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.card(), zone: "hand" });
    (target.choose(game, '', player.getId(), player.getHand().ids()).length > 0);
    let card = game.getCard(target.getFirstTarget());
    if (card === null) {
      {
        return false;
      }
    }
    if (player.putCardsOnBottomOfLibrary(card)) {
      {
        player.drawCards(1);
      }
    }
    return true;
      return true;
    },
  },
  "FirstResponder::FirstResponderEffect": {
    card: "FirstResponder",
    effect: "FirstResponderEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/FirstResponder.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: makeFilter(["another", "creature", "you", "control"], [controlledByPredicate(), cardTypePredicate("creature"), anotherPredicate()]), min: 0, max: 1 });
    target.withNotTarget(true);
    (target.choose(game, '', player.getId()).length > 0);
    let permanent = game.getPermanent(target.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    player.moveCards(permanent, 'hand');
    let power = permanent.getPower().getValue();
    let sourcePermanent = source.getSourcePermanentIfItStillExists(game);
    if (power > 0 && sourcePermanent !== null) {
      {
        sourcePermanent.addCounters(CounterType.of("+1/+1").createInstance(power));
      }
    }
    return true;
      return true;
    },
  },
  "FlamesOfRemembrance::FlamesOfRemembranceMayPlayExiledEffect": {
    card: "FlamesOfRemembrance",
    effect: "FlamesOfRemembranceMayPlayExiledEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/f/FlamesOfRemembrance.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "Flameskull::FlameskullPlayEffect": {
    card: "Flameskull",
    effect: "FlameskullPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/f/Flameskull.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "FolioOfFancies::FolioOfFanciesEffect": {
    card: "FolioOfFancies",
    effect: "FolioOfFanciesEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/FolioOfFancies.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    for (const playerId of game.getOpponents(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player === null) {
          {
            continue;
          }
        }
        player.millCards(player.getHand().size());
      }
    }
    return true;
      return true;
    },
  },
  "ForTheFamily::ForTheFamilyEffect": {
    card: "ForTheFamily",
    effect: "ForTheFamilyEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/ForTheFamily.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let boost = undefined;
    if (game.getBattlefield().count(StaticFilters.creatureYouControl(), source.getControllerId()) >= 4) {
      {
        boost = 4;
      }
    } else {
      {
        boost = 2;
      }
    }
    game.addEffect(boostTargetEffect(game.xmageScope(), boost, boost), source);
    return true;
      return true;
    },
  },
  "ForceDrain::ForceDrainEffect": {
    card: "ForceDrain",
    effect: "ForceDrainEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/ForceDrain.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let permanent = game.getPermanent(source.getTargetPointer().getFirst());
        if (permanent !== null) {
          {
            permanent.damage(2, source.getId());
            return true;
          }
        }
        let player = game.getPlayer(source.getTargetPointer().getFirst());
        if (player !== null) {
          {
            if (player.damage(2, source.getId()) > 0) {
              {
                controller.gainLife(2);
              }
            }
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "ForceMastery::ForceMasteryEffect": {
    card: "ForceMastery",
    effect: "ForceMasteryEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/ForceMastery.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let card = controller.getLibrary().getFromTop();
        if (card !== null) {
          {
            controller.revealCards('', makeCards(game.xmageScope(), []).add(card));
            controller.moveCards(card, 'hand');
            controller.gainLife(card.getManaValue());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "ForgeOfHeroes::ForgeOfHeroesEffect": {
    card: "ForgeOfHeroes",
    effect: "ForgeOfHeroesEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/ForgeOfHeroes.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent === null) {
      {
        return false;
      }
    }
    if (permanent.isCreature()) {
      {
        permanent.addCounters(CounterType.of("+1/+1").createInstance());
      }
    }
    if (permanent.isPlaneswalker()) {
      {
        permanent.addCounters(CounterType.of("loyalty").createInstance());
      }
    }
    return true;
      return true;
    },
  },
  "Forget::ForgetEffect": {
    card: "Forget",
    effect: "ForgetEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/Forget.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPlayer = game.getPlayer(source.getFirstTarget());
    if (targetPlayer !== null) {
      {
        targetPlayer.drawCards(targetPlayer.discard(2).size());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "ForgottenCreation::ForgottenCreationEffect": {
    card: "ForgottenCreation",
    effect: "ForgottenCreationEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/ForgottenCreation.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let cardsInHand = controller.getHand().size();
        if (cardsInHand > 0) {
          {
            controller.discard(cardsInHand);
            controller.drawCards(cardsInHand);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "FormOfTheDinosaur::FormOfTheDinosaurEffect": {
    card: "FormOfTheDinosaur",
    effect: "FormOfTheDinosaurEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/FormOfTheDinosaur.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let targetCreature = game.getPermanent(source.getTargetPointer().getFirst());
        if (targetCreature !== null) {
          {
            targetCreature.damage(15, source.getSourceId());
            controller.damage(targetCreature.getPower().getValue(), targetCreature.getId());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "FracturingGust::FracturingGustDestroyEffect": {
    card: "FracturingGust",
    effect: "FracturingGustDestroyEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/FracturingGust.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let destroyedPermanents = 0;
        for (const permanent of game.getBattlefield().getActivePermanents((makeFilter('permanent').add(Predicates.or(cardTypePredicate("artifact"), cardTypePredicate("enchantment")))), source.getControllerId())) {
          {
            if (permanent.destroy(false)) {
              {
                ++destroyedPermanents;
              }
            }
          }
        }
        game.processAction();
        if (destroyedPermanents > 0) {
          {
            controller.gainLife(2 * destroyedPermanents);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "FrenziedSaddlebrute::FrenziedSaddlebruteEffect": {
    card: "FrenziedSaddlebrute",
    effect: "FrenziedSaddlebruteEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/f/FrenziedSaddlebrute.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "Froghemoth::FroghemothEffect": {
    card: "Froghemoth",
    effect: "FroghemothEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/Froghemoth.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let cardsToExile = [];
    let numCounters = 0;
    let lifeGain = 0;
    for (const cardId of source.getTargetPointer().getTargets()) {
      {
        let card = game.getCard(cardId);
        if (card !== null && game.getState().getZone(cardId) === 'graveyard' && cardsToExile.push(card)) {
          {
            if (card.isCreature()) {
              {
                numCounters++;
              }
            } else {
              {
                lifeGain++;
              }
            }
          }
        }
      }
    }
    if (!(cardsToExile.length === 0)) {
      {
        controller.moveCards(cardsToExile, 'exile');
        game.processAction();
        if (numCounters > 0) {
          {
            let permanent = source.getSourcePermanentIfItStillExists(game);
            if (permanent !== null) {
              {
                permanent.addCounters(CounterType.of("+1/+1").createInstance(numCounters));
              }
            }
          }
        }
        if (lifeGain > 0) {
          {
            controller.gainLife(lifeGain);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "Fumigate::FumigateEffect": {
    card: "Fumigate",
    effect: "FumigateEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/Fumigate.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let destroyedCreature = 0;
        for (const creature of game.getBattlefield().getActivePermanents(StaticFilters.creature(), controller.getId())) {
          {
            if (creature.destroy(false)) {
              {
                destroyedCreature++;
              }
            }
          }
        }
        if (destroyedCreature > 0) {
          {
            game.processAction();
            controller.gainLife(destroyedCreature);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "FuneralPyre::FuneralPyreEffect": {
    card: "FuneralPyre",
    effect: "FuneralPyreEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/f/FuneralPyre.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let exiledCard = game.getCard(source.getFirstTarget());
    if (player === null || exiledCard === null) {
      {
        return false;
      }
    }
    let owner = game.getPlayer(exiledCard.getOwnerId());
    player.moveCards(exiledCard, 'exile');
    if (owner !== null) {
      {
        xmageToken(game.xmageScope(), "SpiritWhiteToken").putOntoBattlefield(1, owner.getId());
      }
    }
    return true;
      return true;
    },
  },
  "FuturistOperative::FuturistOperativeEffect": {
    card: "FuturistOperative",
    effect: "FuturistOperativeEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/f/FuturistOperative.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "GallifreyStands::GallifreyStandsReturnEffect": {
    card: "GallifreyStands",
    effect: "GallifreyStandsReturnEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GallifreyStands.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let cards = makeCards(game.xmageScope(), []).addAll(makeCards(game.xmageScope(), player.getGraveyard().ids()).retain((StaticFilters.card().add(subTypePredicate("doctor")))).getCards());
    return player.moveCards(cards, 'hand');
      return true;
    },
  },
  "GalvanicRelay::GalvanicRelayMayPlayEffect": {
    card: "GalvanicRelay",
    effect: "GalvanicRelayMayPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/g/GalvanicRelay.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "GarrukApexPredator::GarrukApexPredatorEffect3": {
    card: "GarrukApexPredator",
    effect: "GarrukApexPredatorEffect3",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GarrukApexPredator.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let creature = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (player !== null && creature !== null) {
      {
        player.gainLife(creature.getToughness().getValue());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "GarrukRelentless::GarrukRelentlessDamageEffect": {
    card: "GarrukRelentless",
    effect: "GarrukRelentlessDamageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GarrukRelentless.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = source.getSourcePermanentIfItStillExists(game);
    let creature = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    return permanent !== null && creature !== null && permanent.damage(creature.getPower().getValue(), creature.getId()) > 0;
      return true;
    },
  },
  "GarrukSavageHerald::GarrukSavageHeraldEffect": {
    card: "GarrukSavageHerald",
    effect: "GarrukSavageHeraldEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GarrukSavageHerald.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let card = player.getLibrary().getFromTop();
    if (card === null) {
      {
        return false;
      }
    }
    player.revealCards('', makeCards(game.xmageScope(), []).add(card));
    if (card.isCreature()) {
      {
        return player.moveCards(card, 'hand');
      }
    } else {
      {
        return player.putCardsOnBottomOfLibrary(card);
      }
    }
      return true;
    },
  },
  "GarrukVeiledButcher::GarrukVeiledButcherDiscardEffect": {
    card: "GarrukVeiledButcher",
    effect: "GarrukVeiledButcherDiscardEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GarrukVeiledButcher.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let cardsToDraw = 0;
    for (const opponentId of game.getOpponents(source.getControllerId())) {
      {
        let opponent = game.getPlayer(opponentId);
        if (opponent === null) {
          {
            continue;
          }
        }
        let discarded = opponent.discard(2);
        if (makeCards(game.xmageScope(), discarded.ids()).retain(makeFilter(["card"], [Predicates.not(cardTypePredicate("land"))])).size() < 2) {
          {
            cardsToDraw++;
          }
        }
      }
    }
    if (cardsToDraw > 0) {
      {
        controller.drawCards(cardsToDraw);
      }
    }
    return true;
      return true;
    },
  },
  "GateToTheAether::GateToTheAetherEffect": {
    card: "GateToTheAether",
    effect: "GateToTheAetherEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GateToTheAether.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let activePlayer = game.getPlayer(source.getTargetPointer().getFirst());
    if (activePlayer !== null) {
      {
        let card = activePlayer.getLibrary().getFromTop();
        if (card !== null) {
          {
            activePlayer.revealCards('', makeCards(game.xmageScope(), []).add(card));
            if (card.isArtifact() || card.isCreature() || card.isEnchantment() || card.isLand()) {
              {
                if (activePlayer.chooseUse('')) {
                  {
                    activePlayer.moveCards(card, 'battlefield');
                  }
                }
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "GazeOfAdamaro::GazeOfAdamaroEffect": {
    card: "GazeOfAdamaro",
    effect: "GazeOfAdamaroEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GazeOfAdamaro.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    if (targetPlayer !== null) {
      {
        targetPlayer.damage(targetPlayer.getHand().size(), source.getSourceId());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "GeistOfSaintTraft::GeistOfSaintTraftEffect": {
    card: "GeistOfSaintTraft",
    effect: "GeistOfSaintTraftEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GeistOfSaintTraft.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let effect = createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), "AngelToken"), 1, true, true);
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null && effect.apply(game, source)) {
      {
        effect.removeTokensCreatedAt(game, source);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "Geistwave::GeistwaveEffect": {
    card: "Geistwave",
    effect: "GeistwaveEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/Geistwave.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (player === null || permanent === null) {
      {
        return false;
      }
    }
    let flag = permanent.isControlledBy(source.getControllerId());
    player.moveCards(permanent, 'hand');
    if (flag) {
      {
        player.drawCards(1);
      }
    }
    return true;
      return true;
    },
  },
  "GelatinousCube::GelatinousCubeEffect": {
    card: "GelatinousCube",
    effect: "GelatinousCubeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GelatinousCube.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let card = game.getCard(source.getTargetPointer().getFirst());
    return player !== null && card !== null && player.moveCards(card, 'graveyard');
      return true;
    },
  },
  "GemcutterBuccaneer::GemcutterBuccaneerEffect": {
    card: "GemcutterBuccaneer",
    effect: "GemcutterBuccaneerEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/g/GemcutterBuccaneer.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "GenesisChamber::GenesisChamberEffect": {
    card: "GenesisChamber",
    effect: "GenesisChamberEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GenesisChamber.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (permanent !== null) {
      {
        let token = xmageToken(game.xmageScope(), "MyrToken");
        token.putOntoBattlefield(1, permanent.getControllerId());
      }
    }
    return true;
      return true;
    },
  },
  "GerrardsVerdict::GerrardsVerdictEffect": {
    card: "GerrardsVerdict",
    effect: "GerrardsVerdictEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GerrardsVerdict.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let targetPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    if (controller !== null && targetPlayer !== null) {
      {
        controller.gainLife(makeCards(game.xmageScope(), targetPlayer.discard(2).ids()).retain(StaticFilters.landCard()).size() * 3);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "GetawayGlamer::GetawayGlamerEffect": {
    card: "GetawayGlamer",
    effect: "GetawayGlamerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GetawayGlamer.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetCreature = game.getPermanent(source.getFirstTarget());
    if (targetCreature === null) {
      {
        return false;
      }
    }
    let powerOfTarget = targetCreature.getPower().getValue();
    let creatures = game.getBattlefield().getActivePermanents(StaticFilters.creature(), source.getControllerId());
    for (const creature of creatures) {
      {
        if (creature.getPower().getValue() > powerOfTarget) {
          {
            return false;
          }
        }
      }
    }
    targetCreature.destroy(false);
    return true;
      return true;
    },
  },
  "GhaltaStampedeTyrant::GhaltaStampedeTyrantEffect": {
    card: "GhaltaStampedeTyrant",
    effect: "GhaltaStampedeTyrantEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GhaltaStampedeTyrant.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creatureCard(), min: 0, max: Number.MAX_SAFE_INTEGER, zone: "hand" });
    (target.choose(game, '', player.getId()).length > 0);
    player.moveCards(makeCards(game.xmageScope(), []).addAll(target.getTargets()), 'battlefield');
    return true;
      return true;
    },
  },
  "GhastlordOfFugue::GhastlordOfFugueEffect": {
    card: "GhastlordOfFugue",
    effect: "GhastlordOfFugueEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GhastlordOfFugue.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    let controller = game.getPlayer(source.getControllerId());
    let sourceObject = game.getObject(source.getSourceId());
    if (targetPlayer !== null && sourceObject !== null && controller !== null) {
      {
        targetPlayer.revealCards('', targetPlayer.getHand());
        let target = makeTarget(game.xmageScope(), { filter: StaticFilters.card(), zone: 'hand' });
        target.withNotTarget(true);
        let chosenCard = null;
        if ((target.choose(game, '', controller.getId(), targetPlayer.getHand().ids()).length > 0)) {
          {
            chosenCard = game.getCard(target.getFirstTarget());
          }
        }
        if (chosenCard !== null) {
          {
            controller.moveCards(chosenCard, 'exile');
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "GhastlyDeathTyrant::GhastlyDeathTyrantEffect": {
    card: "GhastlyDeathTyrant",
    effect: "GhastlyDeathTyrantEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GhastlyDeathTyrant.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (player === null || permanent === null) {
      {
        return false;
      }
    }
    permanent.destroy();
    player.loseLife(permanent.getManaValue());
    return true;
      return true;
    },
  },
  "GhastlyDiscovery::GhastlyDiscoveryEffect": {
    card: "GhastlyDiscovery",
    effect: "GhastlyDiscoveryEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GhastlyDiscovery.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        controller.drawCards(2);
        controller.discard(1);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "GhostlyWings::GhostlyWingsReturnEffect": {
    card: "GhostlyWings",
    effect: "GhostlyWingsReturnEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GhostlyWings.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getSourceId());
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null && permanent !== null && permanent.getAttachedTo() !== null) {
      {
        let enchantedCreature = game.getPermanent(permanent.getAttachedTo());
        if (enchantedCreature !== null) {
          {
            controller.moveCards(enchantedCreature, 'hand');
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "GhoulsNightOut::GhoulsNightOutTypeChangingEffect": {
    card: "GhoulsNightOut",
    effect: "GhoulsNightOutTypeChangingEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/g/GhoulsNightOut.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "Giantbaiting::GiantbaitingEffect": {
    card: "Giantbaiting",
    effect: "GiantbaitingEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/Giantbaiting.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let effect = createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), "GiantBaitingGiantWarriorToken"));
    if (effect.apply(game, source)) {
      {
        effect.exileTokensCreatedAtNextEndStep(game, source);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "GideonsDefeat::GideonsDefeatEffect": {
    card: "GideonsDefeat",
    effect: "GideonsDefeatEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GideonsDefeat.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (controller !== null && permanent !== null) {
      {
        controller.moveCards(permanent, 'exile');
        game.processAction();
        if (permanent.isPlaneswalker() && permanent.hasSubtype("gideon")) {
          {
            controller.gainLife(5);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "GixsCommand::GixsCommandReturnEffect": {
    card: "GixsCommand",
    effect: "GixsCommandReturnEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GixsCommand.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: makeFilter(["creature", "card"], [cardTypePredicate("creature")]), min: 0, max: 2, zone: "graveyard" }).withNotTarget(true);
    (target.choose(game, '', controller.getId()).length > 0);
    return controller.moveCards(makeCards(game.xmageScope(), []).addAll(target.getTargets()), 'hand');
      return true;
    },
  },
  "Glaciers::GlaciersEffect": {
    card: "Glaciers",
    effect: "GlaciersEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/g/Glaciers.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "GlaringSpotlight::GlaringSpotlightEffect": {
    card: "GlaringSpotlight",
    effect: "GlaringSpotlightEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/g/GlaringSpotlight.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "GleefulDemolition::GleefulDemolitionEffect": {
    card: "GleefulDemolition",
    effect: "GleefulDemolitionEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GleefulDemolition.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent === null || player === null) {
      {
        return false;
      }
    }
    let isMine = permanent.isControlledBy(source.getControllerId());
    permanent.destroy(false);
    if (isMine) {
      {
        let token = xmageToken(game.xmageScope(), "PhyrexianGoblinToken");
        token.putOntoBattlefield(3, source.getControllerId());
      }
    }
    return true;
      return true;
    },
  },
  "Glimmerpost::GlimmerpostEffect": {
    card: "Glimmerpost",
    effect: "GlimmerpostEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/Glimmerpost.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let amount = game.getBattlefield().count((makeFilter('permanent').add(subTypePredicate("locus"))), source.getControllerId());
    let player = game.getPlayer(source.getControllerId());
    if (player !== null) {
      {
        player.gainLife(amount);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "GlimpseTheCosmos::GlimpseTheCosmosPlayEffect": {
    card: "GlimpseTheCosmos",
    effect: "GlimpseTheCosmosPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/g/GlimpseTheCosmos.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "GlintHawk::GlintHawkEffect": {
    card: "GlintHawk",
    effect: "GlintHawkEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GlintHawk.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: makeFilter(["artifact", "you", "control"], [controlledByPredicate(), cardTypePredicate("artifact")]) });
    target.withNotTarget(true);
    if (target.canChoose(game, controller.getId()) && controller.chooseUse('')) {
      {
        (target.choose(game, '', controller.getId()).length > 0);
        let permanent = game.getPermanent(target.getFirstTarget());
        if (permanent !== null) {
          {
            controller.moveCards(permanent, 'hand');
            return true;
          }
        }
      }
    }
    let permanent = source.getSourcePermanentIfItStillExists(game);
    return permanent !== null && permanent.sacrifice();
      return true;
    },
  },
  "GlisteningOil::GlisteningOilEffect": {
    card: "GlisteningOil",
    effect: "GlisteningOilEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GlisteningOil.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let enchantment = game.getPermanent(source.getSourceId());
    if (enchantment !== null && enchantment.getAttachedTo() !== null) {
      {
        let creature = game.getPermanent(enchantment.getAttachedTo());
        if (creature !== null) {
          {
            creature.addCounters(CounterType.of("-1/-1").createInstance());
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "GloomSower::GloomSowerEffect": {
    card: "GloomSower",
    effect: "GloomSowerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GloomSower.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent === null) {
      {
        return false;
      }
    }
    let player = game.getPlayer(permanent.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    player.loseLife(2);
    return true;
      return true;
    },
  },
  "GlowsporeShaman::GlowsporeShamanEffect": {
    card: "GlowsporeShaman",
    effect: "GlowsporeShamanEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GlowsporeShaman.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: (StaticFilters.landCard()), min: 0, max: 1, zone: "graveyard" }).withNotTarget(true);
    if (player.chooseUse('') && (target.choose(game, '', player.getId()).length > 0)) {
      {
        let card = game.getCard(target.getFirstTarget());
        if (card !== null) {
          {
            return player.putCardsOnTopOfLibrary(makeCards(game.xmageScope(), []).add(card));
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "GlyphOfLife::GlyphOfLifeGainLifeEffect": {
    card: "GlyphOfLife",
    effect: "GlyphOfLifeGainLifeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GlyphOfLife.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player !== null) {
      {
        player.gainLife(Number(game.getState().getValue("damageAmount")));
      }
    }
    return true;
      return true;
    },
  },
  "Goatnap::GoatnapEffect": {
    card: "Goatnap",
    effect: "GoatnapEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/Goatnap.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null || !permanent.hasSubtype("goat")) {
      {
        return false;
      }
    }
    game.addEffect(boostTargetEffect(game.xmageScope(), 3, 0, "EndOfTurn"), source);
    return true;
      return true;
    },
  },
  "GoblinCharbelcher::GoblinCharbelcherEffect": {
    card: "GoblinCharbelcher",
    effect: "GoblinCharbelcherEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GoblinCharbelcher.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let isMountain = false;
    let sourceObject = game.getObject(source.getSourceId());
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null || sourceObject === null) {
      {
        return false;
      }
    }
    let cards = makeCards(game.xmageScope(), []);
    let landFound = false;
    for (const card of controller.getLibrary().getCards()) {
      {
        if (card !== null) {
          {
            cards.add(card);
            if (card.isLand()) {
              {
                landFound = true;
                if (card.hasSubtype("mountain")) {
                  {
                    isMountain = true;
                  }
                }
                break;
              }
            }
          }
        } else {
          {
            break;
          }
        }
      }
    }
    controller.revealCards('', cards);
    let damage = cards.size();
    if (landFound) {
      {
        damage--;
      }
    }
    if (isMountain) {
      {
        damage *= 2;
      }
    }
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent !== null) {
      {
        permanent.damage(damage, source.getSourceId());
      }
    } else {
      {
        let targetPlayer = game.getPlayer(source.getTargetPointer().getFirst());
        if (targetPlayer !== null) {
          {
            targetPlayer.damage(damage, source.getSourceId());
          }
        }
      }
    }
    controller.putCardsOnBottomOfLibrary(cards);
    return true;
      return true;
    },
  },
  "GoblinGuide::GoblinGuideEffect": {
    card: "GoblinGuide",
    effect: "GoblinGuideEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GoblinGuide.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let defender = game.getPlayer(source.getTargetPointer().getFirst());
    let sourceObject = game.getObject(source.getSourceId());
    if (sourceObject !== null && defender !== null) {
      {
        let card = defender.getLibrary().getFromTop();
        if (card !== null) {
          {
            let cards = makeCards(game.xmageScope(), []).add(card);
            defender.revealCards('', cards);
            if (card.isLand()) {
              {
                defender.moveCards(card, 'hand');
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "GoblinMachinist::GoblinMachinistEffect": {
    card: "GoblinMachinist",
    effect: "GoblinMachinistEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GoblinMachinist.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let cards = makeCards(game.xmageScope(), []);
        for (const card of controller.getLibrary().getCards()) {
          {
            if (card !== null) {
              {
                cards.add(card);
                if (!card.isLand()) {
                  {
                    if (card.getManaValue() > 0) {
                      {
                        game.addEffect(boostSourceEffect(game.xmageScope(), card.getManaValue(), 0, "EndOfTurn"), source);
                      }
                    }
                    break;
                  }
                }
              }
            }
          }
        }
        controller.revealCards('', cards);
        controller.putCardsOnBottomOfLibrary(cards);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "GoblinSpymaster::SpyMasterGoblinCreateTokenEffect": {
    card: "GoblinSpymaster",
    effect: "SpyMasterGoblinCreateTokenEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GoblinSpymaster.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(game.getActivePlayerId());
    if (player !== null) {
      {
        let token = xmageToken(game.xmageScope(), "SpyMasterGoblinToken");
        token.putOntoBattlefield(1, player.getId());
      }
    }
    return true;
      return true;
    },
  },
  "GoblinTinkerer::GoblinTinkererDamageEffect": {
    card: "GoblinTinkerer",
    effect: "GoblinTinkererDamageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GoblinTinkerer.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let targetArtifact = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (controller !== null && targetArtifact !== null) {
      {
        let sourceObject = game.getPermanent(source.getSourceId());
        let damage = targetArtifact.getManaValue();
        if (sourceObject !== null && damage > 0) {
          {
            sourceObject.damage(damage, targetArtifact.getId());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "GoblinWelder::GoblinWelderEffect": {
    card: "GoblinWelder",
    effect: "GoblinWelderEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GoblinWelder.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    if (source.getTargetPointer().getTargets().length < 2) {
      {
        return false;
      }
    }
    let artifact = game.getPermanent(source.getTargetPointer().getFirst());
    let card = game.getCard(source.getTargetPointer().getTargets()[1]);
    let controller = game.getPlayer(source.getControllerId());
    if (artifact === null || card === null || controller === null) {
      {
        return false;
      }
    }
    let owner = game.getPlayer(card.getOwnerId());
    if (owner === null) {
      {
        return false;
      }
    }
    let sacrifice = artifact.sacrifice();
    let putOnBF = owner.moveCards(card, 'battlefield');
    if (sacrifice || putOnBF) {
      {
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "GodEternalBontu::GodEternalBontuEffect": {
    card: "GodEternalBontu",
    effect: "GodEternalBontuEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GodEternalBontu.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: makeFilter(["another", "you", "control"], [controlledByPredicate(), anotherPredicate()]).add(controlledByPredicate()), min: 0, max: Number.MAX_SAFE_INTEGER }).withNotTarget(true);
    if (!(target.choose(game, '', player.getId()).length > 0)) {
      {
        return false;
      }
    }
    let counter = 0;
    for (const permanentId of target.getTargets()) {
      {
        let permanent = game.getPermanent(permanentId);
        if (permanent !== null && permanent.sacrifice()) {
          {
            counter++;
          }
        }
      }
    }
    return player.drawCards(counter) > 0;
      return true;
    },
  },
  "GostaDirk::GostaDirkEffect": {
    card: "GostaDirk",
    effect: "GostaDirkEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/g/GostaDirk.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "GourmandsTalent::GourmandsTalentEffect": {
    card: "GourmandsTalent",
    effect: "GourmandsTalentEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/g/GourmandsTalent.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "GrandMasterOfFlowers::GrandMasterOfFlowersEffect": {
    card: "GrandMasterOfFlowers",
    effect: "GrandMasterOfFlowersEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/g/GrandMasterOfFlowers.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "GrandMoffTarkin::GrandMoffTarkinEffect": {
    card: "GrandMoffTarkin",
    effect: "GrandMoffTarkinEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GrandMoffTarkin.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetCreature = game.getPermanent(source.getTargetPointer().getFirst());
    if (targetCreature === null) {
      {
        return false;
      }
    }
    let player = game.getPlayer(targetCreature.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    if (player.getLife() > 2 && player.chooseUse('')) {
      {
        player.loseLife(2);
        game.informPlayers(player.getLogName() + '' + targetCreature.getName() + '');
        let sourceController = game.getPlayer(source.getControllerId());
        if (sourceController !== null) {
          {
            sourceController.drawCards(1);
          }
        }
        return true;
      }
    }
    targetCreature.destroy(false);
    return true;
      return true;
    },
  },
  "GravePact::GravePactEffect": {
    card: "GravePact",
    effect: "GravePactEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GravePact.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let perms = [];
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        for (const playerId of game.getState().getPlayersInRange(controller.getId())) {
          {
            let player = game.getPlayer(playerId);
            if (player !== null && !(playerId === source.getControllerId())) {
              {
                let target = makeTarget(game.xmageScope(), { filter: makeFilter(["creature"], [cardTypePredicate("creature")]).add(controlledByPredicate()) }).withNotTarget(true);
                if (target.canChoose(game, player.getId())) {
                  {
                    (target.choose(game, '', player.getId()).length > 0);
                    perms.push(...target.getTargets());
                  }
                }
              }
            }
          }
        }
        for (const permID of perms) {
          {
            let permanent = game.getPermanent(permID);
            if (permanent !== null) {
              {
                permanent.sacrifice();
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "GravebladeMarauder::GravebladeMarauderEffect": {
    card: "GravebladeMarauder",
    effect: "GravebladeMarauderEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GravebladeMarauder.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    let controller = game.getPlayer(source.getControllerId());
    if (targetPlayer !== null && controller !== null) {
      {
        targetPlayer.loseLife(makeCards(game.xmageScope(), controller.getGraveyard().ids()).retain(StaticFilters.creatureCard()).size());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "Gravecrawler::GravecrawlerPlayEffect": {
    card: "Gravecrawler",
    effect: "GravecrawlerPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/g/Gravecrawler.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "GraveyardTrespasser::GraveyardTrespasserEffect": {
    card: "GraveyardTrespasser",
    effect: "GraveyardTrespasserEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GraveyardTrespasser.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let cards = makeCards(game.xmageScope(), []).addAll(source.getTargetPointer().getTargets());
    if (player === null || cards.isEmpty()) {
      {
        return false;
      }
    }
    player.moveCards(cards, 'exile');
    let amount = makeCards(game.xmageScope(), cards.ids()).retain(StaticFilters.creatureCard()).size();
    if (amount < 1) {
      {
        return true;
      }
    }
    game.processAction();
    player.gainLife(amount);
    for (const opponentId of game.getOpponents(source.getControllerId())) {
      {
        let opponent = game.getPlayer(opponentId);
        if (opponent !== null) {
          {
            opponent.loseLife(amount);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "GraveyardTrespasser::GraveyardGluttonEffect": {
    card: "GraveyardTrespasser",
    effect: "GraveyardGluttonEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GraveyardTrespasser.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let cards = makeCards(game.xmageScope(), []).addAll(source.getTargetPointer().getTargets());
    if (player === null || cards.isEmpty()) {
      {
        return false;
      }
    }
    player.moveCards(cards, 'exile');
    let amount = makeCards(game.xmageScope(), cards.ids()).retain(StaticFilters.creatureCard()).size();
    if (amount < 1) {
      {
        return true;
      }
    }
    player.gainLife(amount);
    for (const opponentId of game.getOpponents(source.getControllerId())) {
      {
        let opponent = game.getPlayer(opponentId);
        if (opponent !== null) {
          {
            opponent.loseLife(amount);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "GravityWell::GravityWellEffect": {
    card: "GravityWell",
    effect: "GravityWellEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/g/GravityWell.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "GreatOakGuardian::GreatOakGuardianUntapEffect": {
    card: "GreatOakGuardian",
    effect: "GreatOakGuardianUntapEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GreatOakGuardian.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPlayer = game.getPlayer(source.getControllerId());
    if (targetPlayer !== null) {
      {
        for (const permanent of game.getBattlefield().getAllActivePermanents(StaticFilters.creature(), targetPlayer.getId())) {
          {
            permanent.untap();
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "GreatWall::GreatWallEffect": {
    card: "GreatWall",
    effect: "GreatWallEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/g/GreatWall.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "GrellPhilosopher::GrellPhilosopherBlueManaEffect": {
    card: "GrellPhilosopher",
    effect: "GrellPhilosopherBlueManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/g/GrellPhilosopher.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "GrenzoDungeonWarden::GrenzoDungeonWardenEffect": {
    card: "GrenzoDungeonWarden",
    effect: "GrenzoDungeonWardenEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GrenzoDungeonWarden.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        if (controller.getLibrary().hasCards()) {
          {
            let card = controller.getLibrary().getFromBottom();
            if (card !== null) {
              {
                controller.moveCards(card, 'graveyard');
                if (card.isCreature()) {
                  {
                    let sourcePermanent = game.getPermanentOrLKIBattlefield(source.getSourceId());
                    if (sourcePermanent !== null && card.getPower().getValue() <= sourcePermanent.getPower().getValue()) {
                      {
                        controller.moveCards(card, 'battlefield');
                      }
                    }
                  }
                }
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "GrevenPredatorCaptain::GrevenPredatorCaptainEffect": {
    card: "GrevenPredatorCaptain",
    effect: "GrevenPredatorCaptainEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GrevenPredatorCaptain.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: makeFilter(["another", "creature", "you", "control"], [controlledByPredicate(), cardTypePredicate("creature"), anotherPredicate()]), min: 0, max: 1 }).withNotTarget(true);
    if (!(target.choose(game, '', player.getId()).length > 0)) {
      {
        return false;
      }
    }
    let permanent = game.getPermanent(target.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    let power = permanent.getPower().getValue();
    let toughness = permanent.getToughness().getValue();
    if (!permanent.sacrifice()) {
      {
        return false;
      }
    }
    player.drawCards(power);
    player.loseLife(toughness);
    return true;
      return true;
    },
  },
  "GreyKnightParagon::GreyKnightParagonEffect": {
    card: "GreyKnightParagon",
    effect: "GreyKnightParagonEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GreyKnightParagon.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    return player !== null && permanent !== null && ((permanent.hasSubtype("demon") ? player.moveCards(permanent, 'exile') : permanent.destroy()));
      return true;
    },
  },
  "GrimoireOfTheDead::GrimoireOfTheDeadEffect2": {
    card: "GrimoireOfTheDead",
    effect: "GrimoireOfTheDeadEffect2",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/g/GrimoireOfTheDead.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "GrimoireThief::GrimoireThiefLookEffect": {
    card: "GrimoireThief",
    effect: "GrimoireThiefLookEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/g/GrimoireThief.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "Grindclock::GrindclockEffect": {
    card: "Grindclock",
    effect: "GrindclockEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/Grindclock.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let sourceObject = game.getPermanentOrLKIBattlefield(source.getSourceId());
    if (sourceObject !== null) {
      {
        let amount = sourceObject.getCounters().getCount(CounterType.of("charge"));
        let targetPlayer = game.getPlayer(source.getFirstTarget());
        if (targetPlayer !== null) {
          {
            targetPlayer.millCards(amount);
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "GristTheHungerTide::GristTheHungerTideTypeEffect": {
    card: "GristTheHungerTide",
    effect: "GristTheHungerTideTypeEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/g/GristTheHungerTide.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "GristTheHungerTide::GristTheHungerTideTokenEffect": {
    card: "GristTheHungerTide",
    effect: "GristTheHungerTideTokenEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GristTheHungerTide.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let permanent = source.getSourcePermanentIfItStillExists(game);
    let token = xmageToken(game.xmageScope(), "IzoniInsectToken");
    while (true) {
      {
        token.putOntoBattlefield(1, source.getControllerId());
        if (makeCards(game.xmageScope(), player.millCards(1).ids()).retain((StaticFilters.card().add(subTypePredicate("insect")))).size() < 1) {
          {
            break;
          }
        }
        if (permanent !== null) {
          {
            permanent.addCounters(CounterType.of("loyalty").createInstance());
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "GrolnokTheOmnivore::GrolnokTheOmnivorePlayEffect": {
    card: "GrolnokTheOmnivore",
    effect: "GrolnokTheOmnivorePlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/g/GrolnokTheOmnivore.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "GrubsCommand::GrubsCommandMillEffect": {
    card: "GrubsCommand",
    effect: "GrubsCommandMillEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GrubsCommand.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player === null || !player.getLibrary().hasCards()) {
      {
        return false;
      }
    }
    player.moveCards(makeCards(game.xmageScope(), player.millCards(5).ids()).retain((StaticFilters.card())).getCards(), 'hand');
    return true;
      return true;
    },
  },
  "GuidelightPathmaker::GuidelightPathmakerEffect": {
    card: "GuidelightPathmaker",
    effect: "GuidelightPathmakerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GuidelightPathmaker.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: makeFilter(["artifact", "card"], [cardTypePredicate("artifact")]), zone: "library" });
    (player.searchLibrary('', target).length > 0);
    let card = player.getLibrary().getCard(target.getFirstTarget());
    if (card === null) {
      {
        player.shuffleLibrary();
        return true;
      }
    }
    player.revealCards('', makeCards(game.xmageScope(), []).add(card));
    if (card.getManaValue() <= 2) {
      {
        player.moveCards(card, 'battlefield');
      }
    } else {
      {
        player.moveCards(card, 'hand');
      }
    }
    player.shuffleLibrary();
    return true;
      return true;
    },
  },
  "GusthasScepter::GusthasScepterReturnEffect": {
    card: "GusthasScepter",
    effect: "GusthasScepterReturnEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/g/GusthasScepter.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: (StaticFilters.card()), zone: "exile" });
    target.withNotTarget(true);
    if (!target.canChoose(game, source.getControllerId())) {
      {
        return false;
      }
    }
    (target.choose(game, '', player.getId()).length > 0);
    let card = game.getCard(target.getFirstTarget());
    return card !== null && player.moveCards(card, 'hand');
      return true;
    },
  },
  "GusthasScepter::GusthasScepterLookAtCardEffect": {
    card: "GusthasScepter",
    effect: "GusthasScepterLookAtCardEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/g/GusthasScepter.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "GwenomRemorseless::GwenomRemorselessPlayTopCardEffect": {
    card: "GwenomRemorseless",
    effect: "GwenomRemorselessPlayTopCardEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/g/GwenomRemorseless.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "HaakonStromgaldScourge::HaakonStromgaldScourgePlayEffect": {
    card: "HaakonStromgaldScourge",
    effect: "HaakonStromgaldScourgePlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/h/HaakonStromgaldScourge.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "HaldanAvidArcanist::HaldanAvidArcanistCastFromExileEffect": {
    card: "HaldanAvidArcanist",
    effect: "HaldanAvidArcanistCastFromExileEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/h/HaldanAvidArcanist.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "HaldanAvidArcanist::HaldanAvidArcanistSpendAnyManaEffect": {
    card: "HaldanAvidArcanist",
    effect: "HaldanAvidArcanistSpendAnyManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/h/HaldanAvidArcanist.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "HallowedRespite::HallowedRespiteEffect": {
    card: "HallowedRespite",
    effect: "HallowedRespiteEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/h/HallowedRespite.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    if (permanent.isControlledBy(source.getControllerId())) {
      {
        permanent.addCounters(CounterType.of("+1/+1").createInstance());
      }
    } else {
      {
        permanent.tap();
      }
    }
    return true;
      return true;
    },
  },
  "HaloChargedSkaab::HaloChargedSkaabEffect": {
    card: "HaloChargedSkaab",
    effect: "HaloChargedSkaabEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/h/HaloChargedSkaab.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: (StaticFilters.card().add(Predicates.or(cardTypePredicate("instant"), cardTypePredicate("sorcery"), cardTypePredicate("battle")))), min: 0, max: 1, zone: "graveyard" }).withNotTarget(true);
    (target.choose(game, '', player.getId()).length > 0);
    let card = game.getCard(target.getFirstTarget());
    return card !== null && player.putCardsOnTopOfLibrary(card);
      return true;
    },
  },
  "HalsinEmeraldArchdruid::HalsinEmeraldArchdruidEffect": {
    card: "HalsinEmeraldArchdruid",
    effect: "HalsinEmeraldArchdruidEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/h/HalsinEmeraldArchdruid.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "HamaTheBloodbender::HamaTheBloodbenderCastEffect": {
    card: "HamaTheBloodbender",
    effect: "HamaTheBloodbenderCastEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/h/HamaTheBloodbender.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "HamletbackGoliath::HamletbackGoliathEffect": {
    card: "HamletbackGoliath",
    effect: "HamletbackGoliathEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/h/HamletbackGoliath.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let creature = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    let sourceObject = game.getPermanent(source.getSourceId());
    if (creature !== null && sourceObject !== null) {
      {
        sourceObject.addCounters(CounterType.of("+1/+1").createInstance(creature.getPower().getValue()));
      }
    }
    return true;
      return true;
    },
  },
  "HarbingerOfTheSeas::HarbingerOfTheSeasEffect": {
    card: "HarbingerOfTheSeas",
    effect: "HarbingerOfTheSeasEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/h/HarbingerOfTheSeas.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "HarmonicConvergence::HarmonicConvergenceEffect": {
    card: "HarmonicConvergence",
    effect: "HarmonicConvergenceEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/h/HarmonicConvergence.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player !== null) {
          {
            let filter = StaticFilters.enchantment();
            filter.add(ownedByPredicate(player.getId()));
            let toLib = makeCards(game.xmageScope(), []);
            for (const enchantment of game.getBattlefield().getActivePermanents(filter, playerId)) {
              {
                toLib.add(enchantment);
              }
            }
            player.putCardsOnTopOfLibrary(toLib);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "HarnessInfinity::HarnessInfinityEffect": {
    card: "HarnessInfinity",
    effect: "HarnessInfinityEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/h/HarnessInfinity.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let hand = makeCards(game.xmageScope(), []).addAll(player.getHand());
    let graveyard = makeCards(game.xmageScope(), []).addAll(player.getGraveyard());
    player.moveCards(hand, 'graveyard');
    player.moveCards(graveyard, 'hand');
    return true;
      return true;
    },
  },
  "HaroldAndBobFirstNumens::HaroldAndBobContinuousEffect": {
    card: "HaroldAndBobFirstNumens",
    effect: "HaroldAndBobContinuousEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/h/HaroldAndBobFirstNumens.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "HauntedAngel::HauntedAngelEffect": {
    card: "HauntedAngel",
    effect: "HauntedAngelEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/h/HauntedAngel.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controllerId = source.getControllerId();
    let token = xmageToken(game.xmageScope(), "HauntedAngelToken");
    for (const playerId of game.getState().getPlayersInRange(controllerId)) {
      {
        if (!(playerId === controllerId)) {
          {
            token.putOntoBattlefield(1, playerId);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "HavengulLich::HavengulLichPlayEffect": {
    card: "HavengulLich",
    effect: "HavengulLichPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/h/HavengulLich.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "HealTheScars::HealTheScarsEffect": {
    card: "HealTheScars",
    effect: "HealTheScarsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/h/HealTheScars.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (permanent !== null) {
      {
        let player = game.getPlayer(source.getControllerId());
        if (player !== null) {
          {
            player.gainLife(permanent.getToughness().getValue());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "HealingTechnique::HealingTechniqueEffect": {
    card: "HealingTechnique",
    effect: "HealingTechniqueEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/h/HealingTechnique.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let card = game.getCard(source.getFirstTarget());
    if (player === null || card === null) {
      {
        return false;
      }
    }
    let manaValue = card.getManaValue();
    player.moveCards(card, 'hand');
    player.gainLife(manaValue);
    return true;
      return true;
    },
  },
  "HeartlessHidetsugu::HeartlessHidetsuguDamageEffect": {
    card: "HeartlessHidetsugu",
    effect: "HeartlessHidetsuguDamageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/h/HeartlessHidetsugu.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        for (const playerId of game.getState().getPlayersInRange(controller.getId())) {
          {
            let player = game.getPlayer(playerId);
            if (player !== null) {
              {
                let damage = player.getLife() / 2;
                player.damage(damage, source.getSourceId());
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "HeartwarmingRedemption::HeartwarmingRedemptionEffect": {
    card: "HeartwarmingRedemption",
    effect: "HeartwarmingRedemptionEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/h/HeartwarmingRedemption.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let discarded = player.discard(player.getHand().size()).size();
    player.drawCards(discarded + 1);
    player.gainLife(player.getHand().size());
    return true;
      return true;
    },
  },
  "HedonistsTrove::HedonistsTroveExileEffect": {
    card: "HedonistsTrove",
    effect: "HedonistsTroveExileEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/h/HedonistsTrove.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let targetPlayer = game.getPlayer(source.getFirstTarget());
    let exileId = CardUtil.getExileZoneId(source.getSourceId());
    game.getState().setValue(String(source.getSourceId()), exileId);
    return controller !== null && targetPlayer !== null && controller.moveCardsToExile(targetPlayer.getGraveyard().getCards());
      return true;
    },
  },
  "HedonistsTrove::HedonistsTrovePlayLandEffect": {
    card: "HedonistsTrove",
    effect: "HedonistsTrovePlayLandEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/h/HedonistsTrove.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "HedonistsTrove::HedonistsTroveCastNonlandCardsEffect": {
    card: "HedonistsTrove",
    effect: "HedonistsTroveCastNonlandCardsEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/h/HedonistsTrove.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "Helbrute::HelbruteEffect": {
    card: "Helbrute",
    effect: "HelbruteEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/h/Helbrute.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "HellholeRats::HellholeRatsEffect": {
    card: "HellholeRats",
    effect: "HellholeRatsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/h/HellholeRats.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let damage = 0;
    let targetPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    if (targetPlayer !== null) {
      {
        let cards = targetPlayer.discard(1);
        if (!cards.isEmpty()) {
          {
            for (const card of cards.getCards()) {
              {
                damage = card.getManaValue();
              }
            }
            targetPlayer.damage(damage, source.getSourceId());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "HellionEruption::HellionEruptionEffect": {
    card: "HellionEruption",
    effect: "HellionEruptionEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/h/HellionEruption.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanents = game.getBattlefield().getAllActivePermanents(StaticFilters.creature(), source.getControllerId());
    for (const permanent of permanents) {
      {
        permanent.sacrifice();
      }
    }
    (xmageToken(game.xmageScope(), "HellionToken")).putOntoBattlefield(permanents.length, source.getControllerId());
    return true;
      return true;
    },
  },
  "HidetsugusSecondRite::HidetsugusSecondRiteEffect": {
    card: "HidetsugusSecondRite",
    effect: "HidetsugusSecondRiteEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/h/HidetsugusSecondRite.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    if (targetPlayer !== null) {
      {
        if (targetPlayer.getLife() === 10) {
          {
            targetPlayer.damage(10, source.getSourceId());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "HiredGiant::HiredGiantEffect": {
    card: "HiredGiant",
    effect: "HiredGiantEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/h/HiredGiant.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let playersThatSearched = [];
        for (const playerId of game.getState().getPlayersInRange(controller.getId())) {
          {
            if (!(playerId === controller.getId())) {
              {
                let player = game.getPlayer(playerId);
                if (player !== null && player.chooseUse('')) {
                  {
                    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.landCard(), zone: "library" });
                    if ((player.searchLibrary('', target).length > 0)) {
                      {
                        let targetCard = player.getLibrary().getCard(target.getFirstTarget());
                        if (targetCard !== null) {
                          {
                            player.moveCards(targetCard, 'battlefield');
                            playersThatSearched.push(player);
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        for (const player of playersThatSearched) {
          {
            player.shuffleLibrary();
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "HitRun::RunEffect": {
    card: "HitRun",
    effect: "RunEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/h/HitRun.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let attackingCreatures = game.getBattlefield().count(StaticFilters.creature(), controller.getId());
        if (attackingCreatures > 1) {
          {
            for (const permanent of game.getBattlefield().getAllActivePermanents(StaticFilters.creature(), controller.getId())) {
              {
                let effect = boostTargetEffect(game.xmageScope(), attackingCreatures - 1, 0, "EndOfTurn");
                effect.setTargetPointer(fixedTarget(permanent));
                game.addEffect(effect, source);
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "HogMonkeyRampage::HogMonkeyRampageEffect": {
    card: "HogMonkeyRampage",
    effect: "HogMonkeyRampageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/h/HogMonkeyRampage.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    return permanent !== null && permanent.getPower().getValue() >= 4 && permanent.addCounters(CounterType.of("+1/+1").createInstance());
      return true;
    },
  },
  "HokoriDustDrinker::HokoriDustDrinkerUntapEffect": {
    card: "HokoriDustDrinker",
    effect: "HokoriDustDrinkerUntapEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/h/HokoriDustDrinker.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(game.getActivePlayerId());
    let target = makeTarget(game.xmageScope(), { filter: makeFilter(["land", "you", "control"], [controlledByPredicate(), cardTypePredicate("land")]) });
    if (player === null || !(target.choose(game, '', player.getId()).length > 0)) {
      {
        return false;
      }
    }
    for (const landId of target.getTargets()) {
      {
        let land = game.getPermanent(landId);
        if (land !== null) {
          {
            land.untap();
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "HoldForRansom::HoldForRansomSacrificeEffect": {
    card: "HoldForRansom",
    effect: "HoldForRansomSacrificeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/h/HoldForRansom.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let aura = game.getPermanent(source.getTargetPointer().getFirst());
    if (aura === null) {
      {
        return false;
      }
    }
    let auraController = game.getPlayer(aura.getControllerId());
    aura.sacrifice();
    if (auraController !== null) {
      {
        auraController.drawCards(1);
      }
    }
    return true;
      return true;
    },
  },
  "HolyJusticiar::HolyJusticiarEffect": {
    card: "HolyJusticiar",
    effect: "HolyJusticiarEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/h/HolyJusticiar.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let creature = game.getPermanent(source.getFirstTarget());
    if (player === null || creature === null) {
      {
        return false;
      }
    }
    creature.tap();
    if (creature.hasSubtype("zombie")) {
      {
        player.moveCards(creature, 'exile');
      }
    }
    return true;
      return true;
    },
  },
  "HonestWork::HonestWorkAbilityEffect": {
    card: "HonestWork",
    effect: "HonestWorkAbilityEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/h/HonestWork.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "HourOfGlory::HourOfGloryEffect": {
    card: "HourOfGlory",
    effect: "HourOfGloryEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/h/HourOfGlory.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let sourceObject = source.getSourceObject(game);
    if (controller !== null && sourceObject !== null) {
      {
        let targetCreature = game.getPermanent(source.getTargetPointer().getFirst());
        if (targetCreature !== null) {
          {
            controller.moveCards(targetCreature, 'exile');
            if (targetCreature.hasSubtype("god")) {
              {
                game.processAction();
                let targetController = game.getPlayer(targetCreature.getControllerId());
                if (targetController !== null) {
                  {
                    targetController.revealCards('', targetController.getHand());
                    let toExile = [];
                    for (const card of targetController.getHand().getCards()) {
                      {
                        if ((card.getName() === targetCreature.getName())) {
                          {
                            toExile.push(card);
                          }
                        }
                      }
                    }
                    targetController.moveCards(toExile, 'exile');
                  }
                }
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "Humility::HumilityEffect": {
    card: "Humility",
    effect: "HumilityEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/h/Humility.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "HydrasGrowth::HydrasGrowthDoubleEffect": {
    card: "HydrasGrowth",
    effect: "HydrasGrowthDoubleEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/h/HydrasGrowth.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getSourceId());
    if (permanent !== null && permanent.getAttachedTo() !== null) {
      {
        let attachedTo = game.getPermanent(permanent.getAttachedTo());
        if (attachedTo !== null) {
          {
            let amount = attachedTo.getCounters().getCount(CounterType.of("+1/+1"));
            if (amount > 0) {
              {
                attachedTo.addCounters(CounterType.of("+1/+1").createInstance(amount));
              }
            }
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "HydroManFluidFelon::HydroManFluidFelonEffect": {
    card: "HydroManFluidFelon",
    effect: "HydroManFluidFelonEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/h/HydroManFluidFelon.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "Hypnox::HypnoxExileEffect": {
    card: "Hypnox",
    effect: "HypnoxExileEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/h/Hypnox.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let player = game.getPlayer(source.getFirstTarget());
    if (controller === null || player === null) {
      {
        return false;
      }
    }
    return controller.moveCardsToExile(player.getHand().getCards());
      return true;
    },
  },
  "IanMalcolmChaotician::IanMalcolmChaoticianCastEffect": {
    card: "IanMalcolmChaotician",
    effect: "IanMalcolmChaoticianCastEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/i/IanMalcolmChaotician.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "IanMalcolmChaotician::IanMalcolmChaoticianManaEffect": {
    card: "IanMalcolmChaotician",
    effect: "IanMalcolmChaoticianManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/i/IanMalcolmChaotician.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "IceCauldron::IceCauldronCastFromExileEffect": {
    card: "IceCauldron",
    effect: "IceCauldronCastFromExileEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/i/IceCauldron.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "IdentityCrisis::IdentityCrisisEffect": {
    card: "IdentityCrisis",
    effect: "IdentityCrisisEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/i/IdentityCrisis.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getFirstTarget());
    let player = game.getPlayer(source.getFirstTarget());
    if (controller === null || player === null) {
      {
        return false;
      }
    }
    let cards = makeCards(game.xmageScope(), []);
    cards.addAll(player.getHand());
    cards.addAll(player.getGraveyard());
    return controller.moveCards(cards, 'exile');
      return true;
    },
  },
  "IdolOfEndurance::IdolOfEnduranceCastFromExileEffect": {
    card: "IdolOfEndurance",
    effect: "IdolOfEnduranceCastFromExileEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/i/IdolOfEndurance.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "IdolOfFalseGods::IdolOfFalseGodsEffect": {
    card: "IdolOfFalseGods",
    effect: "IdolOfFalseGodsEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/i/IdolOfFalseGods.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "IdrisSoulOfTheTARDIS::IdrisSoulOfTheTARDISGainEffect": {
    card: "IdrisSoulOfTheTARDIS",
    effect: "IdrisSoulOfTheTARDISGainEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/i/IdrisSoulOfTheTARDIS.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "IgnisScientia::IgnisScientiaEffect": {
    card: "IgnisScientia",
    effect: "IgnisScientiaEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/i/IgnisScientia.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let card = game.getCard(source.getTargetPointer().getFirst());
    if (player === null || card === null) {
      {
        return false;
      }
    }
    let flag = card.isCreature();
    player.moveCards(card, 'exile');
    if (flag) {
      {
        xmageToken(game.xmageScope(), "TreasureToken").putOntoBattlefield(1, source.getControllerId());
      }
    }
    return true;
      return true;
    },
  },
  "IllusionaryTerrain::IllusionaryTerrainEffect": {
    card: "IllusionaryTerrain",
    effect: "IllusionaryTerrainEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/i/IllusionaryTerrain.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "ImmaculateMagistrate::ImmaculateMagistrateEffect": {
    card: "ImmaculateMagistrate",
    effect: "ImmaculateMagistrateEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/i/ImmaculateMagistrate.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent !== null) {
      {
        let count = game.getBattlefield().count((makeFilter(['permanent','you','control'], [controlledByPredicate()]).add(subTypePredicate("elf"))), source.getControllerId());
        if (count > 0) {
          {
            permanent.addCounters(CounterType.of("+1/+1").createInstance(count));
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "ImpelledGiant::ImpelledGiantBoostEffect": {
    card: "ImpelledGiant",
    effect: "ImpelledGiantBoostEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/i/ImpelledGiant.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let impelledGiant = game.getPermanent(source.getSourceId());
    let tappedCreature = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (tappedCreature !== null && impelledGiant !== null) {
      {
        let amount = tappedCreature.getPower().getValue();
        game.addEffect(boostSourceEffect(game.xmageScope(), amount, 0, "EndOfTurn"), source);
      }
    }
    return true;
      return true;
    },
  },
  "ImperialEdict::ImperialEdictEffect": {
    card: "ImperialEdict",
    effect: "ImperialEdictEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/i/ImperialEdict.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getFirstTarget());
    if (player === null) {
      {
        return false;
      }
    }
    let filter = StaticFilters.creature();
    filter.add(controlledByPredicate(player.getId()));
    let target = makeTarget(game.xmageScope(), { filter: filter, min: 1, max: 1 }).withNotTarget(true);
    if ((target.choose(game, '', player.getId()).length > 0)) {
      {
        let permanent = game.getPermanent(target.getFirstTarget());
        if (permanent !== null) {
          {
            permanent.destroy(false);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "ImprisonedInTheMoon::ImprisonedInTheMoonEffect": {
    card: "ImprisonedInTheMoon",
    effect: "ImprisonedInTheMoonEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/i/ImprisonedInTheMoon.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "InciteRebellion::InciteRebellionEffect": {
    card: "InciteRebellion",
    effect: "InciteRebellionEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/i/InciteRebellion.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        for (const playerId of game.getState().getPlayersInRange(controller.getId())) {
          {
            let player = game.getPlayer(playerId);
            if (player !== null) {
              {
                let count = game.getBattlefield().countAll((StaticFilters.creature()), playerId);
                if (count > 0) {
                  {
                    player.damage(count, source.getSourceId());
                    for (const permanent of game.getBattlefield().getAllActivePermanents((StaticFilters.creature()), playerId)) {
                      {
                        permanent.damage(count, source.getSourceId());
                      }
                    }
                  }
                }
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "IncubationIncongruity::IncongruityEffect": {
    card: "IncubationIncongruity",
    effect: "IncongruityEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/i/IncubationIncongruity.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (permanent !== null) {
      {
        let token = xmageToken(game.xmageScope(), "FrogLizardToken");
        token.putOntoBattlefield(1, permanent.getControllerId());
      }
    }
    return true;
      return true;
    },
  },
  "IndomitableMight::IndomitableMightEffect": {
    card: "IndomitableMight",
    effect: "IndomitableMightEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/i/IndomitableMight.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "InfectiousHorror::InfectiousHorrorEffect": {
    card: "InfectiousHorror",
    effect: "InfectiousHorrorEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/i/InfectiousHorror.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const opponentId of game.getOpponents(source.getControllerId())) {
      {
        let opponent = game.getPlayer(opponentId);
        if (opponent !== null) {
          {
            opponent.loseLife(2);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "InfernalReckoning::InfernalJudgmentEffect": {
    card: "InfernalReckoning",
    effect: "InfernalJudgmentEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/i/InfernalReckoning.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    let player = game.getPlayer(source.getControllerId());
    if (permanent === null || player === null) {
      {
        return false;
      }
    }
    let creaturePower = permanent.getPower().getValue();
    player.moveCards(permanent, 'exile');
    player.gainLife(creaturePower);
    return true;
      return true;
    },
  },
  "InnerStruggle::InnerStruggleEffect": {
    card: "InnerStruggle",
    effect: "InnerStruggleEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/i/InnerStruggle.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let targetCreature = game.getPermanent(source.getTargetPointer().getFirst());
        if (targetCreature !== null) {
          {
            targetCreature.damage(targetCreature.getPower().getValue(), targetCreature.getId());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "InspiritFlagshipVessel::InspiritFlagshipVesselEffect": {
    card: "InspiritFlagshipVessel",
    effect: "InspiritFlagshipVesselEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/i/InspiritFlagshipVessel.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    return player !== null && permanent !== null && permanent.addCounters((player.chooseUse('') ? CounterType.of("+1/+1").createInstance() : CounterType.of("charge").createInstance(2)));
      return true;
    },
  },
  "InstillEnergy::CanAttackAsThoughItHadHasteEnchantedEffect": {
    card: "InstillEnergy",
    effect: "CanAttackAsThoughItHadHasteEnchantedEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/i/InstillEnergy.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "IntetTheDreamer::IntetTheDreamerAsThoughEffect": {
    card: "IntetTheDreamer",
    effect: "IntetTheDreamerAsThoughEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/i/IntetTheDreamer.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "IntoThePit::IntoThePitEffect": {
    card: "IntoThePit",
    effect: "IntoThePitEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/i/IntoThePit.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "IntrepidPaleontologist::IntrepidPaleontologistPlayEffect": {
    card: "IntrepidPaleontologist",
    effect: "IntrepidPaleontologistPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/i/IntrepidPaleontologist.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "InvasionOfGobakhan::InvasionOfGobakhanCastEffect": {
    card: "InvasionOfGobakhan",
    effect: "InvasionOfGobakhanCastEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/i/InvasionOfGobakhan.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "InvasionOfIkoria::ZilorthaApexOfIkoriaEffect": {
    card: "InvasionOfIkoria",
    effect: "ZilorthaApexOfIkoriaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/i/InvasionOfIkoria.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "InvasionOfInnistrad::DelugeOfTheDeadEffect": {
    card: "InvasionOfInnistrad",
    effect: "DelugeOfTheDeadEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/i/InvasionOfInnistrad.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let card = game.getCard(source.getTargetPointer().getFirst());
    if (player === null || card === null) {
      {
        return false;
      }
    }
    player.moveCards(card, 'exile');
    if (card.isCreature()) {
      {
        xmageToken(game.xmageScope(), "ZombieToken").putOntoBattlefield(1, source.getControllerId());
      }
    }
    return true;
      return true;
    },
  },
  "InvincibleHymn::InvincibleHymnEffect": {
    card: "InvincibleHymn",
    effect: "InvincibleHymnEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/i/InvincibleHymn.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player !== null) {
      {
        let newValue = player.getLibrary().size();
        let oldValue = player.getLife();
        if (newValue - oldValue > 0) {
          {
            player.gainLife(newValue - oldValue);
          }
        }
        if (oldValue - newValue > 0) {
          {
            player.loseLife(oldValue - newValue);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "InvocationOfSaintTraft::InvocationOfSaintTraftEffect": {
    card: "InvocationOfSaintTraft",
    effect: "InvocationOfSaintTraftEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/i/InvocationOfSaintTraft.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let effect = createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), "AngelToken"), 1, true, true);
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null && (effect.apply(game, source))) {
      {
        effect.removeTokensCreatedAt(game, source);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "IronLadDivergingDestiny::IronLadDivergingDestinyEffect": {
    card: "IronLadDivergingDestiny",
    effect: "IronLadDivergingDestinyEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/i/IronLadDivergingDestiny.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let card = player.getLibrary().getFromTop();
    if (card === null) {
      {
        return true;
      }
    }
    player.revealCards('', makeCards(game.xmageScope(), []).add(card));
    if (card.isArtifact()) {
      {
        player.drawCards(1);
      }
    }
    return true;
      return true;
    },
  },
  "IronMaiden::IronMaidenEffect": {
    card: "IronMaiden",
    effect: "IronMaidenEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/i/IronMaiden.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player !== null) {
      {
        let amount = player.getHand().size() - 4;
        if (amount > 0) {
          {
            player.damage(amount, source.getSourceId());
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "IsildursFatefulStrike::IsildursFatefulStrikeEffect": {
    card: "IsildursFatefulStrike",
    effect: "IsildursFatefulStrikeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/i/IsildursFatefulStrike.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent === null) {
      {
        return false;
      }
    }
    permanent.destroy();
    let player = game.getPlayer(permanent.getControllerId());
    if (player === null || player.getHand().size() <= 4) {
      {
        return true;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.card(), min: player.getHand().size() - 4, max: player.getHand().size() - 4, zone: "hand" });
    (target.choose(game, '', player.getId(), player.getHand().ids()).length > 0);
    player.moveCards(makeCards(game.xmageScope(), []).addAll(target.getTargets()), 'exile');
    return true;
      return true;
    },
  },
  "IvoryTower::IvoryTowerEffect": {
    card: "IvoryTower",
    effect: "IvoryTowerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/i/IvoryTower.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player !== null) {
      {
        let amount = player.getHand().size() - 4;
        if (amount > 0) {
          {
            player.gainLife(amount);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "JaceTheMindSculptor::JaceTheMindSculptorEffect2": {
    card: "JaceTheMindSculptor",
    effect: "JaceTheMindSculptorEffect2",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/j/JaceTheMindSculptor.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let targetPlayer = game.getPlayer(source.getFirstTarget());
    if (controller !== null && targetPlayer !== null) {
      {
        controller.moveCards(targetPlayer.getLibrary().getTopCards(targetPlayer.getLibrary().size()), 'exile');
        targetPlayer.moveCards(targetPlayer.getHand(), 'library');
        targetPlayer.shuffleLibrary();
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "JacesArchivist::JacesArchivistEffect": {
    card: "JacesArchivist",
    effect: "JacesArchivistEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/j/JacesArchivist.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let maxDiscarded = 0;
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        for (const playerId of game.getState().getPlayersInRange(controller.getId())) {
          {
            let player = game.getPlayer(playerId);
            if (player !== null) {
              {
                let discardedCards = player.discard(player.getHand().size());
                if (discardedCards.size() > maxDiscarded) {
                  {
                    maxDiscarded = discardedCards.size();
                  }
                }
              }
            }
          }
        }
        for (const playerId of game.getState().getPlayersInRange(controller.getId())) {
          {
            let player = game.getPlayer(playerId);
            if (player !== null) {
              {
                player.drawCards(maxDiscarded);
              }
            }
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "JacobHaukenInspector::JacobHaukenInspectorLookEffect": {
    card: "JacobHaukenInspector",
    effect: "JacobHaukenInspectorLookEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/j/JacobHaukenInspector.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "JacobHaukenInspector::HaukensInsightLookEffect": {
    card: "JacobHaukenInspector",
    effect: "HaukensInsightLookEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/j/JacobHaukenInspector.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "JacobHaukenInspector::HaukensInsightPlayEffect": {
    card: "JacobHaukenInspector",
    effect: "HaukensInsightPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/j/JacobHaukenInspector.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "JadziOracleOfArcavios::JourneyToTheOracleEffect": {
    card: "JadziOracleOfArcavios",
    effect: "JourneyToTheOracleEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/j/JadziOracleOfArcavios.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.landCard(), min: 0, max: Number.MAX_SAFE_INTEGER, zone: "hand" });
    (target.choose(game, '', player.getId()).length > 0);
    return player.moveCards(makeCards(game.xmageScope(), []).addAll(target.getTargets()), 'battlefield');
      return true;
    },
  },
  "JestersScepter::JestersScepterLookAtCardEffect": {
    card: "JestersScepter",
    effect: "JestersScepterLookAtCardEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/j/JestersScepter.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "JetmirNexusOfRevels::JetmirNexusOfRevelsEffect": {
    card: "JetmirNexusOfRevels",
    effect: "JetmirNexusOfRevelsEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/j/JetmirNexusOfRevels.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "JinxedChoker::JinxedChokerAddCounterEffect": {
    card: "JinxedChoker",
    effect: "JinxedChokerAddCounterEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/j/JinxedChoker.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = source.getSourcePermanentIfItStillExists(game);
    return permanent !== null && permanent.addCounters(CounterType.of("charge").createInstance());
      return true;
    },
  },
  "JohannApprenticeSorcerer::JohannApprenticeSorcererPlayTopEffect": {
    card: "JohannApprenticeSorcerer",
    effect: "JohannApprenticeSorcererPlayTopEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/j/JohannApprenticeSorcerer.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "JornGodOfWinter::KaldringTheRimestaffGraveyardEffect": {
    card: "JornGodOfWinter",
    effect: "KaldringTheRimestaffGraveyardEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/j/JornGodOfWinter.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "JunkJet::JunkJetAbility": {
    card: "JunkJet",
    effect: "JunkJetAbility",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/j/JunkJet.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let equipment = game.getPermanentOrLKIBattlefield(source.getSourceId());
    if (equipment === null) {
      {
        return false;
      }
    }
    let equippedCreature = game.getPermanent(equipment.getAttachedTo());
    if (equippedCreature === null) {
      {
        return false;
      }
    }
    let boost = boostTargetEffect(game.xmageScope(), equippedCreature.getPower().getValue(), 0, "EndOfTurn").setTargetPointer(fixedTarget(equippedCreature));
    game.addEffect(boost, source);
    return true;
      return true;
    },
  },
  "Justice::JusticeEffect": {
    card: "Justice",
    effect: "JusticeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/j/Justice.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let damageAmount = Number(game.getState().getValue("damageAmount"));
    let targetId = source.getTargetPointer().getFirst();
    if (damageAmount !== null && targetId !== null) {
      {
        let player = game.getPlayer(targetId);
        if (player !== null) {
          {
            player.damage(damageAmount, targetId);
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "JusticeStrike::JusticeStrikeEffect": {
    card: "JusticeStrike",
    effect: "JusticeStrikeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/j/JusticeStrike.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    return permanent.damage(permanent.getPower().getValue(), permanent.getId()) > 0;
      return true;
    },
  },
  "Kaboom::KaboomEffect": {
    card: "Kaboom",
    effect: "KaboomEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/k/Kaboom.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    for (const targetId of source.getTargetPointer().getTargets()) {
      {
        let toReveal = makeCards(game.xmageScope(), []);
        let nonland = null;
        for (const card of controller.getLibrary().getCards()) {
          {
            toReveal.add(card);
            if (!card.isLand()) {
              {
                nonland = card;
                break;
              }
            }
          }
        }
        controller.revealCards('', toReveal);
        if (nonland !== null) {
          {
            let planeswalker = game.getPermanent(targetId);
            if (planeswalker !== null) {
              {
                planeswalker.damage(nonland.getManaValue());
              }
            } else {
              {
                let targetPlayer = game.getPlayer(targetId);
                if (targetPlayer !== null) {
                  {
                    targetPlayer.damage(nonland.getManaValue());
                  }
                }
              }
            }
          }
        }
        controller.putCardsOnBottomOfLibrary(toReveal);
      }
    }
    return true;
      return true;
    },
  },
  "KaghaShadowArchdruid::KaghaShadowArchdruidEffect": {
    card: "KaghaShadowArchdruid",
    effect: "KaghaShadowArchdruidEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/k/KaghaShadowArchdruid.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "KalastriaHighborn::LoseGainEffect": {
    card: "KalastriaHighborn",
    effect: "LoseGainEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/k/KalastriaHighborn.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let you = game.getPlayer(source.getControllerId());
    let them = game.getPlayer(source.getFirstTarget());
    if (you === null && them === null) {
      {
        return false;
      }
    }
    if (you !== null) {
      {
        you.gainLife(2);
      }
    }
    if (them !== null) {
      {
        them.loseLife(2);
      }
    }
    return true;
      return true;
    },
  },
  "KamahlsWill::KamahlsWillEffect": {
    card: "KamahlsWill",
    effect: "KamahlsWillEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/k/KamahlsWill.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    for (const creature of game.getBattlefield().getActivePermanents(StaticFilters.creatureYouControl(), source.getControllerId())) {
      {
        if (creature === null || creature.getPower().getValue() < 1) {
          {
            continue;
          }
        }
        permanent.damage(creature.getPower().getValue(), creature.getId());
      }
    }
    return true;
      return true;
    },
  },
  "KariZevSkyshipRaider::KariZevSkyshipRaiderEffect": {
    card: "KariZevSkyshipRaider",
    effect: "KariZevSkyshipRaiderEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/k/KariZevSkyshipRaider.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let effect = createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), "RagavanToken"), 1, true, true);
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null && effect.apply(game, source)) {
      {
        effect.removeTokensCreatedAt(game, source);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "Karma::KarmaDamageTargetEffect": {
    card: "Karma",
    effect: "KarmaDamageTargetEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/k/Karma.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player !== null) {
      {
        let damage = game.getBattlefield().getAllActivePermanents((makeFilter(["land", "you", "control"], [controlledByPredicate(), cardTypePredicate("land")]).add(subTypePredicate("swamp"))), source.getTargetPointer().getFirst()).length;
        player.damage(damage, source.getSourceId());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "KarnSilverGolem::KarnSilverGolemEffect": {
    card: "KarnSilverGolem",
    effect: "KarnSilverGolemEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/k/KarnSilverGolem.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "KarnTheGreatCreator::KarnTheGreatCreatorAnimateEffect": {
    card: "KarnTheGreatCreator",
    effect: "KarnTheGreatCreatorAnimateEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/k/KarnTheGreatCreator.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "KarnsTouch::KarnsTouchEffect": {
    card: "KarnsTouch",
    effect: "KarnsTouchEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/k/KarnsTouch.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "KayaBaneOfTheDead::KayaBaneOfTheDeadEffect": {
    card: "KayaBaneOfTheDead",
    effect: "KayaBaneOfTheDeadEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/k/KayaBaneOfTheDead.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "KaylasMusicBox::KaylasMusicBoxLookEffect": {
    card: "KaylasMusicBox",
    effect: "KaylasMusicBoxLookEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/k/KaylasMusicBox.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "KaylasMusicBox::KaylasMusicBoxPlayFromExileEffect": {
    card: "KaylasMusicBox",
    effect: "KaylasMusicBoxPlayFromExileEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/k/KaylasMusicBox.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "KazanduStomper::KazanduStomperEffect": {
    card: "KazanduStomper",
    effect: "KazanduStomperEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/k/KazanduStomper.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: makeFilter(["land", "you", "control"], [controlledByPredicate(), cardTypePredicate("land")]), min: 0, max: 2 }).withNotTarget(true);
    (target.choose(game, '', player.getId()).length > 0);
    return player.moveCards(makeCards(game.xmageScope(), []).addAll(target.getTargets()), 'hand');
      return true;
    },
  },
  "KeldonBattlewagon::KeldonBattlewagonBoostEffect": {
    card: "KeldonBattlewagon",
    effect: "KeldonBattlewagonBoostEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/k/KeldonBattlewagon.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let keldonBattlewagon = game.getPermanent(source.getSourceId());
    let tappedCreature = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (tappedCreature !== null && keldonBattlewagon !== null) {
      {
        let amount = tappedCreature.getPower().getValue();
        game.addEffect(boostSourceEffect(game.xmageScope(), amount, 0, "EndOfTurn"), source);
      }
    }
    return true;
      return true;
    },
  },
  "KeldonFirebombers::KeldonFirebombersEffect": {
    card: "KeldonFirebombers",
    effect: "KeldonFirebombersEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/k/KeldonFirebombers.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let landsToSacrifice = [];
    for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player !== null) {
          {
            let amount = game.getBattlefield().getAllActivePermanents(StaticFilters.land(), playerId).length - 3;
            if (amount > 0) {
              {
                let target = makeTarget(game.xmageScope(), { filter: StaticFilters.land().add(controlledByPredicate()), min: amount, max: amount }).withNotTarget(true);
                (target.choose(game, '', player.getId()).length > 0);
                for (const landId of target.getTargets()) {
                  {
                    let land = game.getPermanent(landId);
                    if (land !== null) {
                      {
                        landsToSacrifice.push(land);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    for (const land of landsToSacrifice) {
      {
        land.sacrifice();
      }
    }
    return true;
      return true;
    },
  },
  "KellanInquisitiveProdigy::KellanInquisitiveProdigyEffect": {
    card: "KellanInquisitiveProdigy",
    effect: "KellanInquisitiveProdigyEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/k/KellanInquisitiveProdigy.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (controller === null || permanent === null) {
      {
        return false;
      }
    }
    let isMine = permanent.isControlledBy(source.getControllerId());
    permanent.destroy(false);
    if (isMine) {
      {
        controller.drawCards(1);
      }
    }
    return true;
      return true;
    },
  },
  "KembasLegion::KembasLegionEffect": {
    card: "KembasLegion",
    effect: "KembasLegionEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/k/KembasLegion.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "KenrithTheReturnedKing::KenrithTheReturnedKingEffect": {
    card: "KenrithTheReturnedKing",
    effect: "KenrithTheReturnedKingEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/k/KenrithTheReturnedKing.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let card = game.getCard(source.getFirstTarget());
    if (card === null) {
      {
        return false;
      }
    }
    let player = game.getPlayer(card.getOwnerId());
    if (player === null) {
      {
        return false;
      }
    }
    return player.moveCards(card, 'battlefield');
      return true;
    },
  },
  "KentaroTheSmilingCat::KentaroTheSmilingCatCastingEffect": {
    card: "KentaroTheSmilingCat",
    effect: "KentaroTheSmilingCatCastingEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/k/KentaroTheSmilingCat.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "KessDissidentMage::KessDissidentMageCastFromGraveyardEffect": {
    card: "KessDissidentMage",
    effect: "KessDissidentMageCastFromGraveyardEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/k/KessDissidentMage.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "KethisTheHiddenHand::KethisTheHiddenHandGraveyardEffect": {
    card: "KethisTheHiddenHand",
    effect: "KethisTheHiddenHandGraveyardEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/k/KethisTheHiddenHand.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "KheruMindEater::KheruMindEaterEffect": {
    card: "KheruMindEater",
    effect: "KheruMindEaterEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/k/KheruMindEater.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "KheruMindEater::KheruMindEaterLookAtCardEffect": {
    card: "KheruMindEater",
    effect: "KheruMindEaterLookAtCardEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/k/KheruMindEater.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "KikuNightsFlower::KikuNightsFlowerEffect": {
    card: "KikuNightsFlower",
    effect: "KikuNightsFlowerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/k/KikuNightsFlower.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent !== null) {
      {
        permanent.damage(permanent.getPower().getValue(), permanent.getId());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "KikusShadow::KikusShadowEffect": {
    card: "KikusShadow",
    effect: "KikusShadowEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/k/KikusShadow.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let targetCreature = game.getPermanent(source.getTargetPointer().getFirst());
        if (targetCreature !== null) {
          {
            targetCreature.damage(targetCreature.getPower().getValue(), source.getSourceId());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "KnacksawClique::KnacksawCliqueCastFromExileEffect": {
    card: "KnacksawClique",
    effect: "KnacksawCliqueCastFromExileEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/k/KnacksawClique.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "KnowledgePool::KnowledgePoolExileThreeCardsEffect": {
    card: "KnowledgePool",
    effect: "KnowledgePoolExileThreeCardsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/k/KnowledgePool.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let sourceObject = game.getObject(source.getSourceId());
    if (sourceObject === null) {
      {
        return false;
      }
    }
    for (const playerId of game.getState().getPlayersInRange(controller.getId())) {
      {
        let player = game.getPlayer(playerId);
        if (player === null) {
          {
            continue;
          }
        }
        player.moveCardsToExile(player.getLibrary().getTopCards(3));
      }
    }
    return true;
      return true;
    },
  },
  "KrangAndShredder::KrangAndShredderExileEffect": {
    card: "KrangAndShredder",
    effect: "KrangAndShredderExileEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/k/KrangAndShredder.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const opponentId of game.getOpponents(source.getControllerId())) {
      {
        let opponent = game.getPlayer(opponentId);
        if (opponent === null) {
          {
            continue;
          }
        }
        for (const card of opponent.getLibrary().getCards()) {
          {
            opponent.moveCardsToExile(card);
            if (!card.isLand()) {
              {
                break;
              }
            }
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "KreshTheBloodbraided::KreshTheBloodbraidedEffect": {
    card: "KreshTheBloodbraided",
    effect: "KreshTheBloodbraidedEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/k/KreshTheBloodbraided.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    let kreshTheBloodbraided = game.getPermanent(source.getSourceId());
    if (permanent !== null && kreshTheBloodbraided !== null) {
      {
        let amount = permanent.getPower().getValue();
        if (amount > 0) {
          {
            kreshTheBloodbraided.addCounters(CounterType.of("+1/+1").createInstance(amount));
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "KwainItinerantMeddler::KwainItinerantMeddlerEffect": {
    card: "KwainItinerantMeddler",
    effect: "KwainItinerantMeddlerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/k/KwainItinerantMeddler.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let players = [];
    for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player !== null && player.chooseUse('') && player.drawCards(1) > 0) {
          {
            players.push(player);
          }
        }
      }
    }
    for (const player of players) {
      {
        player.gainLife(1);
      }
    }
    return !(players.length === 0);
      return true;
    },
  },
  "LagonnaBandStoryteller::LagonnaBandStorytellerEffect": {
    card: "LagonnaBandStoryteller",
    effect: "LagonnaBandStorytellerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/l/LagonnaBandStoryteller.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let card = game.getCard(source.getFirstTarget());
    if (controller === null || card === null || !card.isEnchantment() || game.getState().getZone(card.getId()) !== 'graveyard') {
      {
        return false;
      }
    }
    let cmc = card.getManaValue();
    if (controller.putCardsOnTopOfLibrary(makeCards(game.xmageScope(), []).add(card))) {
      {
        controller.gainLife(cmc);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "LaquatussCreativity::LaquatussCreativityEffect": {
    card: "LaquatussCreativity",
    effect: "LaquatussCreativityEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/l/LaquatussCreativity.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getFirstTarget());
    if (player !== null) {
      {
        let handCount = makeCards(game.xmageScope(), player.getHand().ids()).retain(StaticFilters.card()).size();
        player.drawCards(handCount);
        player.discard(handCount);
      }
    }
    return false;
      return true;
    },
  },
  "LaraCroftTombRaider::LaraCroftTombRaiderCastEffect": {
    card: "LaraCroftTombRaider",
    effect: "LaraCroftTombRaiderCastEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/l/LaraCroftTombRaider.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "LastDitchEffort::LastDitchEffortEffect": {
    card: "LastDitchEffort",
    effect: "LastDitchEffortEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/l/LastDitchEffort.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player !== null) {
      {
        let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creature().add(controlledByPredicate()), min: 0, max: Number.MAX_SAFE_INTEGER }).withNotTarget(true);
        (target.choose(game, '', player.getId()).length > 0);
        let numSacrificed = 0;
        for (const permanentId of target.getTargets()) {
          {
            let permanent = game.getPermanent(permanentId);
            if (permanent !== null && permanent.sacrifice()) {
              {
                numSacrificed++;
              }
            }
          }
        }
        if (numSacrificed > 0) {
          {
            let uuid = source.getTargetPointer().getFirst();
            let permanent = game.getPermanent(uuid);
            let opponent = game.getPlayer(uuid);
            if (permanent !== null) {
              {
                permanent.damage(numSacrificed, source.getSourceId());
              }
            }
            if (opponent !== null) {
              {
                opponent.damage(numSacrificed, source.getSourceId());
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "LastMarchOfTheEnts::LastMarchOfTheEntsEffect": {
    card: "LastMarchOfTheEnts",
    effect: "LastMarchOfTheEntsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/l/LastMarchOfTheEnts.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creatureCard(), min: 0, max: Number.MAX_SAFE_INTEGER, zone: "hand" });
    (target.choose(game, '', player.getId()).length > 0);
    player.moveCards(makeCards(game.xmageScope(), []).addAll(target.getTargets()), 'battlefield');
    return true;
      return true;
    },
  },
  "LavaBlister::LavaBlisterEffect": {
    card: "LavaBlister",
    effect: "LavaBlisterEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/l/LavaBlister.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent !== null) {
      {
        let player = game.getPlayer(permanent.getControllerId());
        if (player !== null) {
          {
            let message = '';
            if (player.chooseUse('')) {
              {
                player.damage(6, source.getSourceId());
              }
            } else {
              {
                permanent.destroy(false);
              }
            }
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "LegionLeadership::LegionLeadershipTargetEffect": {
    card: "LegionLeadership",
    effect: "LegionLeadershipTargetEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/l/LegionLeadership.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    let boost = boostTargetEffect(game.xmageScope(), permanent.getPower().getValue(), 0, "EndOfTurn").setTargetPointer(fixedTarget(permanent));
    game.addEffect(boost, source);
    return true;
      return true;
    },
  },
  "LeonardoSewerSamurai::LeonardoSewerSamuraiEffect": {
    card: "LeonardoSewerSamurai",
    effect: "LeonardoSewerSamuraiEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/l/LeonardoSewerSamurai.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "Leveler::LevelerExileLibraryEffect": {
    card: "Leveler",
    effect: "LevelerExileLibraryEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/l/Leveler.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let count = controller.getLibrary().size();
        let cards = makeCards(game.xmageScope(), []).addAll(controller.getLibrary().getTopCards(count));
        controller.moveCards(cards, 'exile');
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "LeyLine::LeyLineEffect": {
    card: "LeyLine",
    effect: "LeyLineEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/l/LeyLine.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(game.getActivePlayerId());
    let permanent = game.getPermanent(source.getFirstTarget());
    if (player === null || permanent === null) {
      {
        return false;
      }
    }
    if (player.chooseUse('')) {
      {
        permanent.addCounters(CounterType.of("+1/+1").createInstance());
      }
    }
    return true;
      return true;
    },
  },
  "LeylineTyrant::LeylineTyrantManaEffect": {
    card: "LeylineTyrant",
    effect: "LeylineTyrantManaEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/l/LeylineTyrant.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "Liability::LiabilityEffect": {
    card: "Liability",
    effect: "LiabilityEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/l/Liability.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (permanent !== null) {
      {
        let controller = game.getPlayer(permanent.getControllerId());
        if (controller !== null) {
          {
            controller.loseLife(1);
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "LiegeOfTheTangle::LiegeOfTheTangleEffect": {
    card: "LiegeOfTheTangle",
    effect: "LiegeOfTheTangleEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/l/LiegeOfTheTangle.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "LifeAndLimb::LifeAndLimbEffect": {
    card: "LifeAndLimb",
    effect: "LifeAndLimbEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/l/LifeAndLimb.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "LifeDeath::DeathEffect": {
    card: "LifeDeath",
    effect: "DeathEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/l/LifeDeath.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let creatureCard = game.getCard(source.getTargetPointer().getFirst());
    let controller = game.getPlayer(source.getControllerId());
    if (creatureCard !== null && controller !== null) {
      {
        let result = false;
        if (game.getState().getZone(creatureCard.getId()) === 'graveyard') {
          {
            controller.moveCards(creatureCard, 'battlefield');
          }
        }
        controller.loseLife(creatureCard.getManaValue());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "LightstallInquisitor::LightstallInquisitorAsThoughEffect": {
    card: "LightstallInquisitor",
    effect: "LightstallInquisitorAsThoughEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/l/LightstallInquisitor.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "LilianaDeathMage::LilianaDeathMageUltimateEffect": {
    card: "LilianaDeathMage",
    effect: "LilianaDeathMageUltimateEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/l/LilianaDeathMage.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let opponent = game.getPlayer(source.getFirstTarget());
    if (opponent !== null) {
      {
        let amount = makeCards(game.xmageScope(), opponent.getGraveyard().ids()).retain(StaticFilters.creatureCard()).size();
        opponent.loseLife(amount * 2);
      }
    }
    return true;
      return true;
    },
  },
  "LilianaOfTheDarkRealms::LilianaOfTheDarkRealmsEffect": {
    card: "LilianaOfTheDarkRealms",
    effect: "LilianaOfTheDarkRealmsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/l/LilianaOfTheDarkRealms.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let swamps = game.getBattlefield().count((makeFilter(['permanent','you','control'], [controlledByPredicate()])), source.getControllerId());
    if (swamps < 1) {
      {
        return false;
      }
    }
    let plusMessage = "+" + swamps + "/+" + swamps;
    let minusMessage = "-" + swamps + "/-" + swamps;
    if (!player.chooseUse('')) {
      {
        swamps *= -1;
      }
    }
    game.addEffect(boostTargetEffect(game.xmageScope(), swamps, swamps, "EndOfTurn"), source);
    return true;
      return true;
    },
  },
  "LilianaTheNecromancer::LilianaTheNecromancerEffect": {
    card: "LilianaTheNecromancer",
    effect: "LilianaTheNecromancerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/l/LilianaTheNecromancer.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: (StaticFilters.creatureCard()), min: 0, max: 2, zone: "graveyard" });
    target.withNotTarget(true);
    if (!(target.choose(game, '', player.getId()).length > 0)) {
      {
        return false;
      }
    }
    let cardsToMove = makeCards(game.xmageScope(), []);
    for (const targetId of target.getTargets()) {
      {
        let card = game.getCard(targetId);
        if (card !== null) {
          {
            cardsToMove.add(card);
          }
        }
      }
    }
    return player.moveCards(cardsToMove, 'battlefield');
      return true;
    },
  },
  "LilianaVess::LilianaVessEffect": {
    card: "LilianaVess",
    effect: "LilianaVessEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/l/LilianaVess.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let creatureCards = [];
        for (const playerId of game.getState().getPlayersInRange(controller.getId())) {
          {
            let player = game.getPlayer(playerId);
            if (player !== null) {
              {
                creatureCards.push(...makeCards(game.xmageScope(), player.getGraveyard().ids()).retain(StaticFilters.creatureCard()).getCards());
              }
            }
          }
        }
        controller.moveCards(creatureCards, 'battlefield');
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "LilianasDefeat::LilianasDefeatEffect": {
    card: "LilianasDefeat",
    effect: "LilianasDefeatEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/l/LilianasDefeat.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (player !== null && permanent !== null) {
      {
        permanent.destroy(true);
        game.processAction();
        if (permanent.isPlaneswalker() && permanent.hasSubtype("liliana")) {
          {
            let permanentController = game.getPlayer(permanent.getControllerId());
            if (permanentController !== null) {
              {
                permanentController.loseLife(3);
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "LinvalaShieldOfSeaGate::LinvalaShieldOfSeaGateRestrictionEffect": {
    card: "LinvalaShieldOfSeaGate",
    effect: "LinvalaShieldOfSeaGateRestrictionEffect",
    base: "RestrictionEffect",
    source: "Mage.Sets/src/mage/cards/l/LinvalaShieldOfSeaGate.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "LithoformBlight::ChangeLandAttachedEffect": {
    card: "LithoformBlight",
    effect: "ChangeLandAttachedEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/l/LithoformBlight.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "LivingArmor::LivingArmorEffect": {
    card: "LivingArmor",
    effect: "LivingArmorEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/l/LivingArmor.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let creature = game.getPermanent(source.getTargets().getFirstTarget());
    if (creature !== null) {
      {
        let amount = creature.getManaValue();
        creature.addCounters(CounterType.of("+0/+1").createInstance(amount));
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "LivingLore::LivingLoreExileEffect": {
    card: "LivingLore",
    effect: "LivingLoreExileEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/l/LivingLore.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: makeFilter(["card"], [Predicates.or(cardTypePredicate("instant"), cardTypePredicate("sorcery"))]), zone: "graveyard" });
    target.withNotTarget(true);
    (target.choose(game, '', controller.getId()).length > 0);
    let card = game.getCard(target.getFirstTarget());
    if (card === null) {
      {
        return false;
      }
    }
    let mageObject = game.getObject(source.getSourceId());
    if (mageObject === null) {
      {
        return false;
      }
    }
    controller.moveCardsToExile(card);
    return true;
      return true;
    },
  },
  "LlanowarDruid::LlanowarDruidEffect": {
    card: "LlanowarDruid",
    effect: "LlanowarDruidEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/l/LlanowarDruid.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player !== null) {
      {
        for (const permanent of game.getBattlefield().getActivePermanents((makeFilter('permanent').add(subTypePredicate("forest"))), source.getControllerId())) {
          {
            permanent.untap();
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "LlanowarEmpath::LlanowarEmpathEffect": {
    card: "LlanowarEmpath",
    effect: "LlanowarEmpathEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/l/LlanowarEmpath.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let sourceObject = game.getObject(source.getSourceId());
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null || sourceObject === null) {
      {
        return false;
      }
    }
    let card = controller.getLibrary().getFromTop();
    if (card !== null) {
      {
        let cards = makeCards(game.xmageScope(), []);
        cards.add(card);
        controller.revealCards('', cards);
        if (card.isCreature()) {
          {
            controller.moveCards(card, 'hand');
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "LobeliaDefenderOfBagEnd::LobeliaDefenderOfBagLookEffect": {
    card: "LobeliaDefenderOfBagEnd",
    effect: "LobeliaDefenderOfBagLookEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/l/LobeliaDefenderOfBagEnd.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "LobeliaDefenderOfBagEnd::LobeliaDefenderOfBagEndPlayFromExileEffect": {
    card: "LobeliaDefenderOfBagEnd",
    effect: "LobeliaDefenderOfBagEndPlayFromExileEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/l/LobeliaDefenderOfBagEnd.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "LobeliaSackvilleBaggins::LobeliaSackvilleBagginsEffect": {
    card: "LobeliaSackvilleBaggins",
    effect: "LobeliaSackvilleBagginsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/l/LobeliaSackvilleBaggins.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let card = game.getCard(source.getTargetPointer().getFirst());
    if (player === null || card === null) {
      {
        return false;
      }
    }
    player.moveCards(card, 'exile');
    let power = card.getPower().getValue();
    if (power > 0) {
      {
        xmageToken(game.xmageScope(), "TreasureToken").putOntoBattlefield(power, source.getControllerId());
      }
    }
    return true;
      return true;
    },
  },
  "LonghornFirebeast::LonghornFirebeastEffect": {
    card: "LonghornFirebeast",
    effect: "LonghornFirebeastEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/l/LonghornFirebeast.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getSourceId());
    if (controller !== null && permanent !== null) {
      {
        for (const opponentUuid of game.getOpponents(source.getControllerId())) {
          {
            let opponent = game.getPlayer(opponentUuid);
            if (opponent !== null && opponent.chooseUse('')) {
              {
                game.informPlayers(opponent.getLogName() + '' + permanent.getLogName());
                opponent.damage(5, permanent.getId());
                permanent.sacrifice();
                return true;
              }
            }
          }
        }
        game.informPlayers('' + permanent.getLogName() + '');
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "LordMagnus::LordMagnusFirstEffect": {
    card: "LordMagnus",
    effect: "LordMagnusFirstEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/l/LordMagnus.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "LordMagnus::LordMagnusSecondEffect": {
    card: "LordMagnus",
    effect: "LordMagnusSecondEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/l/LordMagnus.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "LostInTheMaze::LostInTheMazeEffect": {
    card: "LostInTheMaze",
    effect: "LostInTheMazeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/l/LostInTheMaze.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const targetId of source.getTargetPointer().getTargets()) {
      {
        let permanent = game.getPermanent(targetId);
        if (permanent !== null && !permanent.isControlledBy(source.getControllerId())) {
          {
            permanent.addCounters(CounterType.of("stun").createInstance());
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "LothlorienBlade::LothlorienBladeEffect": {
    card: "LothlorienBlade",
    effect: "LothlorienBladeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/l/LothlorienBlade.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetCreature = game.getPermanent(source.getTargetPointer().getFirst());
    let equipment = game.getPermanentOrLKIBattlefield(source.getSourceId());
    if (targetCreature === null || equipment === null) {
      {
        return false;
      }
    }
    let attacker = game.getPermanentOrLKIBattlefield(equipment.getAttachedTo());
    if (attacker === null) {
      {
        return false;
      }
    }
    targetCreature.damage(attacker.getPower().getValue(), attacker.getId());
    return true;
      return true;
    },
  },
  "LukkaCoppercoatOutcast::LukkaCoppercoatOutcastCastEffect": {
    card: "LukkaCoppercoatOutcast",
    effect: "LukkaCoppercoatOutcastCastEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/l/LukkaCoppercoatOutcast.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "Lychguard::LychguardEffect": {
    card: "Lychguard",
    effect: "LychguardEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/l/Lychguard.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let cards = makeCards(game.xmageScope(), []).addAll(makeCards(game.xmageScope(), player.getGraveyard().ids()).retain((StaticFilters.card().add(superTypePredicate("legendary")))).getCards());
    return player.moveCards(cards, 'hand');
      return true;
    },
  },
  "MaestrosAscendancy::MaestrosAscendancyCastEffect": {
    card: "MaestrosAscendancy",
    effect: "MaestrosAscendancyCastEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/m/MaestrosAscendancy.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "MajesticMetamorphosis::MajesticMetamorphosisEffect": {
    card: "MajesticMetamorphosis",
    effect: "MajesticMetamorphosisEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/m/MajesticMetamorphosis.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "Malboro::MalboroEffect": {
    card: "Malboro",
    effect: "MalboroEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/Malboro.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const opponentId of game.getOpponents(source.getControllerId())) {
      {
        let player = game.getPlayer(opponentId);
        if (player !== null) {
          {
            player.moveCards(player.getLibrary().getTopCards(3), 'exile');
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "ManaSeverance::ManaSeveranceEffect": {
    card: "ManaSeverance",
    effect: "ManaSeveranceEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/ManaSeverance.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.landCard(), min: 0, max: Number.MAX_SAFE_INTEGER, zone: "library" });
    (player.searchLibrary('', target).length > 0);
    let cards = makeCards(game.xmageScope(), []).addAll(target.getTargets());
    cards.retainZone('library');
    player.moveCards(cards, 'exile');
    player.shuffleLibrary();
    return true;
      return true;
    },
  },
  "ManascapeRefractor::ManascapeRefractorSpendAnyManaEffect": {
    card: "ManascapeRefractor",
    effect: "ManascapeRefractorSpendAnyManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/m/ManascapeRefractor.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "MandateOfAbaddon::MandateOfAbaddonEffect": {
    card: "MandateOfAbaddon",
    effect: "MandateOfAbaddonEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MandateOfAbaddon.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let creature = game.getPermanent(source.getTargetPointer().getFirst());
    if (creature === null) {
      {
        return false;
      }
    }
    let power = creature.getPower().getValue();
    for (const permanent of game.getBattlefield().getActivePermanents(StaticFilters.creature(), source.getControllerId())) {
      {
        if (permanent.getPower().getValue() < power) {
          {
            permanent.destroy();
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "ManholeMissile::ManholeMissileEffect": {
    card: "ManholeMissile",
    effect: "ManholeMissileEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/ManholeMissile.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null || player.getHand().isEmpty() || !player.chooseUse('')) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.card(), zone: "hand" });
    (target.choose(game, '', player.getId(), player.getHand().ids()).length > 0);
    let card = game.getCard(target.getFirstTarget());
    if (card === null) {
      {
        return false;
      }
    }
    if (player.putCardsOnBottomOfLibrary(card)) {
      {
        player.drawCards(1);
      }
    }
    return true;
      return true;
    },
  },
  "MaralenFaeAscendant::MaralenFaeAscendantCastFromExileEffect": {
    card: "MaralenFaeAscendant",
    effect: "MaralenFaeAscendantCastFromExileEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/m/MaralenFaeAscendant.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "MaralenOfTheMornsong::MaralenOfTheMornsongEffect2": {
    card: "MaralenOfTheMornsong",
    effect: "MaralenOfTheMornsongEffect2",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MaralenOfTheMornsong.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let activePlayerId = game.getActivePlayerId();
    let player = game.getPlayer(activePlayerId);
    if (player !== null) {
      {
        player.loseLife(3);
        let target = makeTarget(game.xmageScope(), { filter: StaticFilters.card(), zone: "library" });
        if ((player.searchLibrary('', target).length > 0)) {
          {
            player.moveCards(makeCards(game.xmageScope(), []).addAll(target.getTargets()), 'hand');
          }
        }
        player.shuffleLibrary();
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "MarangRiverProwler::MarangRiverProwlerCastEffect": {
    card: "MarangRiverProwler",
    effect: "MarangRiverProwlerCastEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/m/MarangRiverProwler.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "MaraudingRaptor::MaraudingRaptorEffect": {
    card: "MaraudingRaptor",
    effect: "MaraudingRaptorEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MaraudingRaptor.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent === null) {
      {
        return false;
      }
    }
    if (permanent.damage(2, source.getSourceId()) > 0 && permanent.hasSubtype("dinosaur")) {
      {
        game.addEffect(boostSourceEffect(game.xmageScope(), 2, 0, "EndOfTurn"), source);
      }
    }
    return true;
      return true;
    },
  },
  "MarchOfTheMachines::MarchOfTheMachinesEffect": {
    card: "MarchOfTheMachines",
    effect: "MarchOfTheMachinesEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/m/MarchOfTheMachines.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "MasakoTheHumorless::BlockTappedEffect": {
    card: "MasakoTheHumorless",
    effect: "BlockTappedEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/m/MasakoTheHumorless.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "MastermindPlum::MastermindPlumEffect": {
    card: "MastermindPlum",
    effect: "MastermindPlumEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MastermindPlum.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let cards = makeCards(game.xmageScope(), []).addAll(source.getTargetPointer().getTargets());
    if (cards.isEmpty()) {
      {
        return false;
      }
    }
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    player.moveCards(cards, 'exile');
    cards.retainZone('exile');
    if (makeCards(game.xmageScope(), cards.ids()).retain(makeFilter(["artifact", "card"], [cardTypePredicate("artifact")])).size() > 0) {
      {
        let treasure = xmageToken(game.xmageScope(), "TreasureToken");
        treasure.putOntoBattlefield(1, source.getControllerId());
      }
    }
    return true;
      return true;
    },
  },
  "MeTheImmortal::MeTheImmortalCastEffect": {
    card: "MeTheImmortal",
    effect: "MeTheImmortalCastEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/m/MeTheImmortal.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "Meadowboon::MeadowboonEffect": {
    card: "Meadowboon",
    effect: "MeadowboonEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/Meadowboon.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let target = game.getPlayer(source.getFirstTarget());
    if (target !== null) {
      {
        for (const p of game.getBattlefield().getAllActivePermanents(StaticFilters.creature(), target.getId())) {
          {
            p.addCounters(CounterType.of("+1/+1").createInstance());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "MemoryLeak::MemoryLeakEffect": {
    card: "MemoryLeak",
    effect: "MemoryLeakEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MemoryLeak.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let opponent = game.getPlayer(source.getFirstTarget());
    if (controller === null || opponent === null) {
      {
        return false;
      }
    }
    opponent.revealCards('', opponent.getHand());
    let target = undefined;
    let cards = undefined;
    if (controller.chooseUse('')) {
      {
        let filter = makeFilter(['nonland','card'], [Predicates.not(cardTypePredicate('land'))]);
        target = makeTarget(game.xmageScope(), { filter: filter, zone: 'hand' });
        target.withNotTarget(true);
        cards = opponent.getHand();
      }
    } else {
      {
        let filter = makeFilter(['nonland','card'], [Predicates.not(cardTypePredicate('land'))]);
        target = makeTarget(game.xmageScope(), { filter: filter, zone: 'graveyard' });
        target.withNotTarget(true);
        cards = opponent.getGraveyard();
      }
    }
    if ((target.choose(game, '', controller.getId(), cards.ids()).length > 0)) {
      {
        let card = game.getCard(target.getFirstTarget());
        if (card !== null) {
          {
            controller.moveCards(card, 'exile');
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "MephidrossVampire::MephidrossVampireEffect": {
    card: "MephidrossVampire",
    effect: "MephidrossVampireEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/m/MephidrossVampire.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "MercyKilling::MercyKillingTokenEffect": {
    card: "MercyKilling",
    effect: "MercyKillingTokenEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MercyKilling.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (permanent !== null) {
      {
        let power = permanent.getPower().getValue();
        return xmageToken(game.xmageScope(), "GreenWhiteElfWarriorToken").putOntoBattlefield(power, permanent.getControllerId());
      }
    }
    return false;
      return true;
    },
  },
  "MidnightRitual::MidnightRitualEffect": {
    card: "MidnightRitual",
    effect: "MidnightRitualEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MidnightRitual.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let cardsToExile = makeCards(game.xmageScope(), []).addAll(source.getTargetPointer().getTargets());
        controller.moveCards(cardsToExile, 'exile');
        if (!cardsToExile.isEmpty()) {
          {
            game.processAction();
            xmageToken(game.xmageScope(), "ZombieToken").putOntoBattlefield(cardsToExile.size(), controller.getId());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "MightformHarmonizer::MightformHarmonizerEffect": {
    card: "MightformHarmonizer",
    effect: "MightformHarmonizerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MightformHarmonizer.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent === null || permanent.getPower().getValue() === 0) {
      {
        return false;
      }
    }
    game.addEffect(boostTargetEffect(game.xmageScope(), permanent.getPower().getValue(), 0).setTargetPointer(fixedTarget(permanent)), source);
    return true;
      return true;
    },
  },
  "MindFuneral::MindFuneralEffect": {
    card: "MindFuneral",
    effect: "MindFuneralEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MindFuneral.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let opponent = game.getPlayer(source.getTargetPointer().getFirst());
    if (opponent !== null) {
      {
        let cards = makeCards(game.xmageScope(), []);
        let landsFound = 0;
        for (const card of opponent.getLibrary().getCards()) {
          {
            cards.add(card);
            if (card.isLand() && ++landsFound === 4) {
              {
                break;
              }
            }
          }
        }
        opponent.revealCards('', cards);
        opponent.moveCards(cards, 'graveyard');
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "Mindmoil::MindmoilEffect": {
    card: "Mindmoil",
    effect: "MindmoilEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/Mindmoil.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let you = game.getPlayer(source.getControllerId());
    if (you !== null) {
      {
        let count = you.getHand().size();
        you.putCardsOnBottomOfLibrary(you.getHand());
        you.drawCards(count);
      }
    }
    return true;
      return true;
    },
  },
  "Mindreaver::MindreaverExileEffect": {
    card: "Mindreaver",
    effect: "MindreaverExileEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/Mindreaver.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let player = game.getPlayer(source.getFirstTarget());
    if (controller === null || player === null) {
      {
        return false;
      }
    }
    let cards = makeCards(game.xmageScope(), []).addAll(player.getLibrary().getTopCards(3));
    return controller.moveCardsToExile(cards.getCards());
      return true;
    },
  },
  "Mindsparker::MindsparkerEffect": {
    card: "Mindsparker",
    effect: "MindsparkerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/Mindsparker.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    if (targetPlayer !== null) {
      {
        targetPlayer.damage(2, source.getSourceId());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "MineWorker::MineWorkerEffect": {
    card: "MineWorker",
    effect: "MineWorkerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MineWorker.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let powerPlantName = '';
    let towerName = '';
    let powerPlant = false;
    let tower = false;
    let life = 1;
    for (const permanent of game.getBattlefield().getAllActivePermanents(StaticFilters.creature(), controller.getId())) {
      {
        let name = permanent.getName();
        if (!powerPlant && (powerPlantName === name)) {
          {
            powerPlant = true;
          }
        } else {
          if (!tower && (towerName === name)) {
            {
              tower = true;
            }
          }
        }
        if (powerPlant && tower) {
          {
            life = 3;
            break;
          }
        }
      }
    }
    controller.gainLife(life);
    return true;
      return true;
    },
  },
  "MinimusContainment::MinimusContainmentEffect": {
    card: "MinimusContainment",
    effect: "MinimusContainmentEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/m/MinimusContainment.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "MinionMissile::MinionMissileEffect": {
    card: "MinionMissile",
    effect: "MinionMissileEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MinionMissile.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    let player = game.getPlayer(permanent.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    permanent.destroy(false);
    player.damage(2, source.getSourceId());
    return true;
      return true;
    },
  },
  "MinionsMurmurs::MinionsMurmursEffect": {
    card: "MinionsMurmurs",
    effect: "MinionsMurmursEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MinionsMurmurs.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let creaturesControlled = game.getBattlefield().countAll(StaticFilters.creature(), controller.getId());
        controller.drawCards(creaturesControlled);
        controller.loseLife(creaturesControlled);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "MiraculousRecovery::MiraculousRecoveryEffect": {
    card: "MiraculousRecovery",
    effect: "MiraculousRecoveryEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MiraculousRecovery.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent !== null) {
      {
        permanent.addCounters(CounterType.of("+1/+1").createInstance());
      }
    }
    return false;
      return true;
    },
  },
  "MirkwoodElk::MirkwoodElkEffect": {
    card: "MirkwoodElk",
    effect: "MirkwoodElkEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MirkwoodElk.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let targetElf = game.getCard(source.getTargetPointer().getFirst());
        if (targetElf !== null) {
          {
            controller.moveCards(targetElf, 'hand');
            controller.gainLife(targetElf.getPower().getValue());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "MisfortuneTeller::MisfortuneTellerEffect": {
    card: "MisfortuneTeller",
    effect: "MisfortuneTellerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MisfortuneTeller.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let card = game.getCard(source.getFirstTarget());
    if (card === null) {
      {
        return false;
      }
    }
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let creature = card.isCreature();
    let land = card.isLand();
    if (!controller.moveCards(card, 'exile')) {
      {
        return false;
      }
    }
    if (creature) {
      {
        xmageToken(game.xmageScope(), "RogueToken").putOntoBattlefield(1, source.getControllerId());
      }
    }
    if (land) {
      {
        xmageToken(game.xmageScope(), "TreasureToken").putOntoBattlefield(1, source.getControllerId());
      }
    }
    if (!creature && !land) {
      {
        controller.gainLife(3);
      }
    }
    return true;
      return true;
    },
  },
  "MisfortunesGain::MisfortunesGainEffect": {
    card: "MisfortunesGain",
    effect: "MisfortunesGainEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MisfortunesGain.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let target = game.getPermanent(source.getTargetPointer().getFirst());
    if (controller !== null && target !== null) {
      {
        target.destroy(false);
        let owner = game.getPlayer(target.getOwnerId());
        if (owner !== null) {
          {
            owner.gainLife(4);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "Misinformation::MisinformationEffect": {
    card: "Misinformation",
    effect: "MisinformationEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/Misinformation.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let targets = source.getTargetPointer().getTargets();
        if (targets !== null) {
          {
            let cards = makeCards(game.xmageScope(), []).addAll(targets);
            controller.putCardsOnTopOfLibrary(cards);
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "MistbreathElder::MistbreathElderEffect": {
    card: "MistbreathElder",
    effect: "MistbreathElderEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MistbreathElder.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let permanent = source.getSourcePermanentIfItStillExists(game);
    return player !== null && permanent !== null && player.chooseUse('') && player.moveCards(permanent, 'hand');
      return true;
    },
  },
  "MisthollowGriffin::MisthollowGriffinPlayEffect": {
    card: "MisthollowGriffin",
    effect: "MisthollowGriffinPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/m/MisthollowGriffin.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "MistmoonGriffin::MistmoonGriffinEffect": {
    card: "MistmoonGriffin",
    effect: "MistmoonGriffinEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MistmoonGriffin.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let lastCreatureCard = null;
        for (const card of controller.getGraveyard().getCards()) {
          {
            if (card.isCreature()) {
              {
                lastCreatureCard = card;
              }
            }
          }
        }
        if (lastCreatureCard !== null) {
          {
            return controller.moveCards(lastCreatureCard, 'battlefield');
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "MistveilPlains::MistveilPlainsGraveyardToLibraryEffect": {
    card: "MistveilPlains",
    effect: "MistveilPlainsGraveyardToLibraryEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MistveilPlains.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let card = game.getCard(source.getFirstTarget());
    let player = game.getPlayer(source.getControllerId());
    if (card === null || player === null || game.getState().getZone(card.getId()) !== 'graveyard') {
      {
        return false;
      }
    }
    return player.putCardsOnBottomOfLibrary(card);
      return true;
    },
  },
  "MonkClass::MonkClassCastEffect": {
    card: "MonkClass",
    effect: "MonkClassCastEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/m/MonkClass.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "MonkeyCage::MonkeyCageEffect": {
    card: "MonkeyCage",
    effect: "MonkeyCageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MonkeyCage.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let creature = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (creature === null) {
      {
        return false;
      }
    }
    let cmc = creature.getManaValue();
    return cmc > 0 && xmageToken(game.xmageScope(), "MonkeyToken").putOntoBattlefield(cmc, source.getControllerId());
      return true;
    },
  },
  "MoonlightHunt::MoonlightHuntEffect": {
    card: "MoonlightHunt",
    effect: "MoonlightHuntEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MoonlightHunt.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let targetCreature = game.getPermanent(source.getTargetPointer().getFirst());
    if (controller !== null && targetCreature !== null) {
      {
        for (const permanent of game.getBattlefield().getAllActivePermanents((StaticFilters.creature().add(Predicates.or(subTypePredicate("wolf"), subTypePredicate("werewolf")))), source.getControllerId())) {
          {
            targetCreature.damage(permanent.getPower().getValue(), permanent.getId());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "MoralityShift::MoralityShiftEffect": {
    card: "MoralityShift",
    effect: "MoralityShiftEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MoralityShift.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let copyLibrary = [...controller.getLibrary().getCards()];
    let copyGraveyard = [...controller.getGraveyard().getCards()];
    controller.moveCards(copyGraveyard, 'library');
    controller.moveCards(copyLibrary, 'graveyard');
    controller.shuffleLibrary();
    return true;
      return true;
    },
  },
  "MorbidBloom::MorbidBloomEffect": {
    card: "MorbidBloom",
    effect: "MorbidBloomEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MorbidBloom.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let card = game.getCard(source.getFirstTarget());
    if (player === null || card === null) {
      {
        return false;
      }
    }
    player.moveCards(card, 'exile');
    let toughness = card.getToughness().getValue();
    if (toughness < 1) {
      {
        return true;
      }
    }
    return xmageToken(game.xmageScope(), "SaprolingToken").putOntoBattlefield(toughness, player.getId());
      return true;
    },
  },
  "Mordenkainen::MordenkainenExchangeEffect": {
    card: "Mordenkainen",
    effect: "MordenkainenExchangeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/Mordenkainen.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let hand = makeCards(game.xmageScope(), []).addAll(controller.getHand());
    let library = makeCards(game.xmageScope(), []).addAll(controller.getLibrary().getCardList());
    controller.putCardsOnTopOfLibrary(hand);
    controller.moveCards(library, 'hand');
    controller.shuffleLibrary();
    return true;
      return true;
    },
  },
  "MordenkainensPolymorph::MordenkainensPolymorphEffect": {
    card: "MordenkainensPolymorph",
    effect: "MordenkainensPolymorphEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/m/MordenkainensPolymorph.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "MornsongAria::MornsongAriaTriggerEffect": {
    card: "MornsongAria",
    effect: "MornsongAriaTriggerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MornsongAria.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let activePlayerId = game.getActivePlayerId();
    let player = game.getPlayer(activePlayerId);
    if (player !== null) {
      {
        player.loseLife(3);
        let target = makeTarget(game.xmageScope(), { filter: StaticFilters.card(), zone: "library" });
        if ((player.searchLibrary('', target).length > 0)) {
          {
            player.moveCards(makeCards(game.xmageScope(), []).addAll(target.getTargets()), 'hand');
          }
        }
        player.shuffleLibrary();
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "MrFoxglove::MrFoxgloveEffect": {
    card: "MrFoxglove",
    effect: "MrFoxgloveEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MrFoxglove.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (controller === null || player === null) {
      {
        return false;
      }
    }
    let cardsToDraw = player.getHand().size() - controller.getHand().size();
    let cardsDrawn = 0;
    if (cardsToDraw > 0) {
      {
        cardsDrawn = controller.drawCards(cardsToDraw);
      }
    }
    if (cardsToDraw <= 0 || cardsDrawn === 0) {
      {
        if (controller.chooseUse('')) {
          {
            let target = makeTarget(game.xmageScope(), { filter: makeFilter(["creature", "card"], [cardTypePredicate("creature")]), zone: "hand" });
            if ((target.choose(game, '', controller.getId()).length > 0)) {
              {
                let card = game.getCard(target.getFirstTarget());
                if (card !== null) {
                  {
                    return controller.moveCards(card, 'battlefield');
                  }
                }
              }
            }
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "MrHousePresidentAndCEO::MrHousePresidentAndCEOTokenEffect": {
    card: "MrHousePresidentAndCEO",
    effect: "MrHousePresidentAndCEOTokenEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MrHousePresidentAndCEO.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    if (game.getState().getValue("rolled") === null) {
      {
        return false;
      }
    }
    let amount = Number(game.getState().getValue("rolled"));
    if (amount >= 4) {
      {
        let robotToken = xmageToken(game.xmageScope(), "Robot33Token");
        robotToken.putOntoBattlefield(1, source.getControllerId());
      }
    }
    if (amount >= 6) {
      {
        let treasureToken = xmageToken(game.xmageScope(), "TreasureToken");
        treasureToken.putOntoBattlefield(1, source.getControllerId());
      }
    }
    return amount >= 4;
      return true;
    },
  },
  "MrOrfeoTheBoulder::MrOrfeoTheBoulderEffect": {
    card: "MrOrfeoTheBoulder",
    effect: "MrOrfeoTheBoulderEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MrOrfeoTheBoulder.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent === null) {
      {
        return false;
      }
    }
    game.addEffect(boostTargetEffect(game.xmageScope(), permanent.getPower().getValue(), 0).setTargetPointer(fixedTarget(permanent)), source);
    return true;
      return true;
    },
  },
  "Mudhole::MudholeEffect": {
    card: "Mudhole",
    effect: "MudholeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/Mudhole.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getFirstTarget());
    if (player === null) {
      {
        return false;
      }
    }
    return player.moveCards(makeCards(game.xmageScope(), player.getGraveyard().ids()).retain(StaticFilters.landCard()).getCards(), 'exile');
      return true;
    },
  },
  "MuldrothaTheGravetide::MuldrothaTheGravetideCastFromGraveyardEffect": {
    card: "MuldrothaTheGravetide",
    effect: "MuldrothaTheGravetideCastFromGraveyardEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/m/MuldrothaTheGravetide.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "MultanisDecree::MultanisDecreeDestroyEffect": {
    card: "MultanisDecree",
    effect: "MultanisDecreeDestroyEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MultanisDecree.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let enchantmentsDestoyed = 0;
    for (const permanent of game.getBattlefield().getActivePermanents(StaticFilters.enchantment(), source.getControllerId())) {
      {
        if (permanent.destroy(false)) {
          {
            enchantmentsDestoyed++;
          }
        }
      }
    }
    if (enchantmentsDestoyed > 0 && controller !== null) {
      {
        controller.gainLife(enchantmentsDestoyed * 2);
      }
    }
    return false;
      return true;
    },
  },
  "MultiformWonder::MultiformWonder2Effect": {
    card: "MultiformWonder",
    effect: "MultiformWonder2Effect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MultiformWonder.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let sourceObject = source.getSourceObject(game);
    if (controller !== null && sourceObject !== null) {
      {
        let power = 2;
        let toughness = -2;
        let message = '' + sourceObject.getLogName() + '';
        if (controller.chooseUse('')) {
          {
            power *= -1;
            toughness *= -1;
          }
        }
        game.addEffect(boostSourceEffect(game.xmageScope(), power, toughness, "EndOfTurn"), source);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "MurderOfCrows::MurderOfCrowsEffect": {
    card: "MurderOfCrows",
    effect: "MurderOfCrowsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MurderOfCrows.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player !== null && player.chooseUse('')) {
      {
        if (player.drawCards(1) > 0) {
          {
            player.discard(1);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "MurderousRedcap::MurderousRedcapEffect": {
    card: "MurderousRedcap",
    effect: "MurderousRedcapEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MurderousRedcap.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let sourcePermanent = game.getPermanent(source.getSourceId());
    let permanent = game.getPermanent(source.getFirstTarget());
    if (sourcePermanent === null) {
      {
        sourcePermanent = game.getPermanentOrLKIBattlefield(source.getSourceId());
      }
    }
    if (sourcePermanent !== null && permanent !== null) {
      {
        permanent.damage(sourcePermanent.getPower().getValue(), sourcePermanent.getId());
        return true;
      }
    }
    let player = game.getPlayer(source.getFirstTarget());
    if (sourcePermanent !== null && player !== null) {
      {
        player.damage(sourcePermanent.getPower().getValue(), sourcePermanent.getId());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "MycosynthLattice::ManaCanBeSpentAsAnyColorEffect": {
    card: "MycosynthLattice",
    effect: "ManaCanBeSpentAsAnyColorEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/m/MycosynthLattice.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "MyojinOfLifesWeb::MyojinOfLifesWebPutCreatureOnBattlefieldEffect": {
    card: "MyojinOfLifesWeb",
    effect: "MyojinOfLifesWebPutCreatureOnBattlefieldEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MyojinOfLifesWeb.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creatureCard(), min: 0, max: Number.MAX_SAFE_INTEGER, zone: "hand" });
    if ((target.choose(game, '', controller.getId()).length > 0)) {
      {
        return controller.moveCards(makeCards(game.xmageScope(), []).addAll(target.getTargets()).getCards(), 'battlefield');
      }
    }
    return false;
      return true;
    },
  },
  "MyojinOfNightsReach::MyojinOfNightsReachEffect": {
    card: "MyojinOfNightsReach",
    effect: "MyojinOfNightsReachEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MyojinOfNightsReach.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const opponentId of game.getOpponents(source.getControllerId())) {
      {
        let opponent = game.getPlayer(opponentId);
        if (opponent !== null) {
          {
            opponent.discardCards(opponent.getHand());
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "MyrServitor::MyrServitorReturnEffect": {
    card: "MyrServitor",
    effect: "MyrServitorReturnEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/m/MyrServitor.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player !== null) {
          {
            player.moveCards(makeCards(game.xmageScope(), player.getGraveyard().ids()).retain((StaticFilters.card().add(namePredicate('')))).getCards(), 'battlefield');
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "MythosOfVadrok::MythosOfVadrokRestrictionEffect": {
    card: "MythosOfVadrok",
    effect: "MythosOfVadrokRestrictionEffect",
    base: "RestrictionEffect",
    source: "Mage.Sets/src/mage/cards/m/MythosOfVadrok.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "NantukoCultivator::NantukoCultivatorEffect": {
    card: "NantukoCultivator",
    effect: "NantukoCultivatorEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/n/NantukoCultivator.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null || makeCards(game.xmageScope(), player.getHand().ids()).retain(StaticFilters.landCard()).size() < 1) {
      {
        return false;
      }
    }
    let toDiscard = makeTarget(game.xmageScope(), { filter: StaticFilters.landCard(), min: 0, max: Number.MAX_SAFE_INTEGER, zone: "hand" });
    (toDiscard.choose(game, '', player.getId()).length > 0);
    let count = player.discardCards(makeCards(game.xmageScope(), []).addAll(toDiscard.getTargets())).size();
    if (count < 1) {
      {
        return false;
      }
    }
    let permanent = game.getPermanent(source.getSourceId());
    if (permanent !== null) {
      {
        permanent.addCounters(CounterType.of("+1/+1").createInstance(count));
      }
    }
    player.drawCards(count);
    return true;
      return true;
    },
  },
  "NantukoMentor::NantukoMentorEffect": {
    card: "NantukoMentor",
    effect: "NantukoMentorEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/n/NantukoMentor.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPermanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (targetPermanent !== null) {
      {
        let effect = boostTargetEffect(game.xmageScope(), targetPermanent.getPower().getValue(), targetPermanent.getPower().getValue(), "EndOfTurn");
        effect.setTargetPointer(fixedTarget(targetPermanent));
        game.addEffect(effect, source);
      }
    }
    return true;
      return true;
    },
  },
  "Narcolepsy::NarcolepsyEffect": {
    card: "Narcolepsy",
    effect: "NarcolepsyEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/n/Narcolepsy.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let narcolepsy = game.getPermanent(source.getSourceId());
    if (narcolepsy !== null) {
      {
        let enchanted = game.getPermanent(narcolepsy.getAttachedTo());
        if (enchanted !== null) {
          {
            enchanted.tap();
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "NarsetEnlightenedMaster::NarsetEnlightenedMasterCastFromExileEffect": {
    card: "NarsetEnlightenedMaster",
    effect: "NarsetEnlightenedMasterCastFromExileEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/n/NarsetEnlightenedMaster.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "NathanDrakeTreasureHunter::NathanDrakeTreasureHunterManaEffect": {
    card: "NathanDrakeTreasureHunter",
    effect: "NathanDrakeTreasureHunterManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/n/NathanDrakeTreasureHunter.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "NaturesResurgence::NaturesResurgenceEffect": {
    card: "NaturesResurgence",
    effect: "NaturesResurgenceEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/n/NaturesResurgence.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let sourcePlayer = game.getPlayer(source.getControllerId());
    if (sourcePlayer !== null) {
      {
        for (const playerId of game.getState().getPlayersInRange(sourcePlayer.getId())) {
          {
            let player = game.getPlayer(playerId);
            if (player !== null) {
              {
                let amount = makeCards(game.xmageScope(), player.getGraveyard().ids()).retain((StaticFilters.creatureCard())).size();
                player.drawCards(amount);
              }
            }
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "NautiloidShip::NautiloidShipEffect": {
    card: "NautiloidShip",
    effect: "NautiloidShipEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/n/NautiloidShip.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creatureCard(), min: 0, max: 1, zone: "exile" });
    (target.choose(game, '', player.getId()).length > 0);
    let card = game.getCard(target.getFirstTarget());
    return card !== null && player.moveCards(card, 'battlefield');
      return true;
    },
  },
  "NazahnReveredBladesmith::NazahnTapEffect": {
    card: "NazahnReveredBladesmith",
    effect: "NazahnTapEffect",
    base: "TapTargetEffect",
    source: "Mage.Sets/src/mage/cards/n/NazahnReveredBladesmith.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent !== null) {
      {
        permanent.tap();
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "NecronMonolith::NecronMonolithEffect": {
    card: "NecronMonolith",
    effect: "NecronMonolithEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/n/NecronMonolith.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let count = makeCards(game.xmageScope(), player.millCards(3).ids()).retain(StaticFilters.creatureCard()).size();
    if (count > 0) {
      {
        game.processAction();
        xmageToken(game.xmageScope(), "NecronWarriorToken").putOntoBattlefield(count, source.getControllerId());
      }
    }
    return true;
      return true;
    },
  },
  "NessianBoar::NessianBoarEffect": {
    card: "NessianBoar",
    effect: "NessianBoarEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/n/NessianBoar.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent === null) {
      {
        return false;
      }
    }
    let player = game.getPlayer(permanent.getControllerId());
    return player !== null && player.drawCards(1) > 0;
      return true;
    },
  },
  "NetherbornPhalanx::NetherbornPhalanxEffect": {
    card: "NetherbornPhalanx",
    effect: "NetherbornPhalanxEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/n/NetherbornPhalanx.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player !== null) {
      {
        for (const playerId of game.getOpponents(source.getControllerId())) {
          {
            let count = game.getBattlefield().getAllActivePermanents(StaticFilters.creature(), playerId).length;
            if (count > 0) {
              {
                let opponent = game.getPlayer(playerId);
                if (opponent !== null) {
                  {
                    opponent.loseLife(count);
                  }
                }
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "NeurokFamiliar::NeurokFamiliarEffect": {
    card: "NeurokFamiliar",
    effect: "NeurokFamiliarEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/n/NeurokFamiliar.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let sourceObject = source.getSourceObject(game);
    if (controller === null || sourceObject === null) {
      {
        return false;
      }
    }
    if (controller.getLibrary().hasCards()) {
      {
        let card = controller.getLibrary().getFromTop();
        if (card !== null) {
          {
            let cards = makeCards(game.xmageScope(), []).add(card);
            controller.revealCards('', cards);
            if (card.isArtifact()) {
              {
                controller.moveCards(card, 'hand');
              }
            } else {
              {
                controller.moveCards(card, 'graveyard');
              }
            }
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "NeverHappened::NeverHappenedEffect": {
    card: "NeverHappened",
    effect: "NeverHappenedEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/n/NeverHappened.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let opponent = game.getPlayer(source.getFirstTarget());
    if (controller === null || opponent === null) {
      {
        return false;
      }
    }
    opponent.revealCards('', opponent.getHand());
    let target = undefined;
    let cards = undefined;
    if (controller.chooseUse('')) {
      {
        let filter = makeFilter(['nonland','card'], [Predicates.not(cardTypePredicate('land'))]);
        target = makeTarget(game.xmageScope(), { filter: filter, zone: 'hand' });
        target.withNotTarget(true);
        cards = opponent.getHand();
      }
    } else {
      {
        let filter = makeFilter(['nonland','card'], [Predicates.not(cardTypePredicate('land'))]);
        target = makeTarget(game.xmageScope(), { filter: filter, zone: 'graveyard' });
        target.withNotTarget(true);
        cards = opponent.getGraveyard();
      }
    }
    if ((target.choose(game, '', controller.getId(), cards.ids()).length > 0)) {
      {
        let card = game.getCard(target.getFirstTarget());
        if (card !== null) {
          {
            controller.moveCards(card, 'exile');
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "NewBlood::ChangeCreatureTypeTargetEffect": {
    card: "NewBlood",
    effect: "ChangeCreatureTypeTargetEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/n/NewBlood.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "NezumiShortfang::StabwhiskerLoseLifeEffect": {
    card: "NezumiShortfang",
    effect: "StabwhiskerLoseLifeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/n/NezumiShortfang.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let opponent = game.getPlayer(source.getTargetPointer().getFirst());
    if (opponent !== null) {
      {
        let lifeLose = 3 - opponent.getHand().size();
        if (lifeLose > 0) {
          {
            opponent.loseLife(lifeLose);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "NiambiEsteemedSpeaker::NiambiEsteemedSpeakerEffect": {
    card: "NiambiEsteemedSpeaker",
    effect: "NiambiEsteemedSpeakerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/n/NiambiEsteemedSpeaker.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    let player = game.getPlayer(source.getControllerId());
    if (permanent === null || player === null) {
      {
        return false;
      }
    }
    return permanent.getManaValue() > 0 && player.gainLife(permanent.getManaValue()) > 0;
      return true;
    },
  },
  "NicolBolasTheRavager::NicolBolasTheArisenEffect": {
    card: "NicolBolasTheRavager",
    effect: "NicolBolasTheArisenEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/n/NicolBolasTheRavager.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPlayer = game.getPlayer(source.getFirstTarget());
    let controller = game.getPlayer(source.getControllerId());
    if (targetPlayer === null || controller === null) {
      {
        return false;
      }
    }
    return controller.moveCards(targetPlayer.getLibrary().getTopCards(targetPlayer.getLibrary().size() - 1), 'exile');
      return true;
    },
  },
  "NightDealings::NightDealingsEffect": {
    card: "NightDealings",
    effect: "NightDealingsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/n/NightDealings.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = source.getSourcePermanentIfItStillExists(game);
    let damageAmount = Number(game.getState().getValue("damageAmount"));
    return permanent !== null && damageAmount !== null && damageAmount > 0 && permanent.addCounters(CounterType.of("theft").createInstance(damageAmount));
      return true;
    },
  },
  "NightveilSpecter::NightveilSpecterExileEffect": {
    card: "NightveilSpecter",
    effect: "NightveilSpecterExileEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/n/NightveilSpecter.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player !== null) {
      {
        let card = player.getLibrary().getFromTop();
        if (card !== null) {
          {
            player.moveCardsToExile(card);
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "NightveilSpecter::NightveilSpecterEffect": {
    card: "NightveilSpecter",
    effect: "NightveilSpecterEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/n/NightveilSpecter.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "NineFingersKeene::NineFingersKeeneEffect": {
    card: "NineFingersKeene",
    effect: "NineFingersKeeneEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/n/NineFingersKeene.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let cards = makeCards(game.xmageScope(), []).addAll(player.getLibrary().getTopCards(9));
    if (cards.isEmpty()) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: (StaticFilters.card().add(subTypePredicate("gate"))), min: 0, max: 1, zone: "library" });
    (target.choose(game, '', player.getId(), cards.ids()).length > 0);
    let card = game.getCard(target.getFirstTarget());
    if (card !== null) {
      {
        player.moveCards(card, 'battlefield');
      }
    }
    cards.retainZone('library');
    if (game.getBattlefield().count((makeFilter(['permanent','you','control'], [controlledByPredicate()])), source.getControllerId()) >= 9) {
      {
        player.moveCards(cards, 'hand');
      }
    } else {
      {
        player.putCardsOnBottomOfLibrary(cards);
      }
    }
    return true;
      return true;
    },
  },
  "NinjaTeen::NinjaTeenCastEffect": {
    card: "NinjaTeen",
    effect: "NinjaTeenCastEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/n/NinjaTeen.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "NissaRevane::NissaRevaneGainLifeEffect": {
    card: "NissaRevane",
    effect: "NissaRevaneGainLifeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/n/NissaRevane.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let life = 2 * game.getBattlefield().count((makeFilter(['permanent','you','control'], [controlledByPredicate()])), source.getControllerId());
    if (player !== null) {
      {
        player.gainLife(life);
      }
    }
    return true;
      return true;
    },
  },
  "NissaWorldsoulSpeaker::NissaWorldsoulSpeakerEffect": {
    card: "NissaWorldsoulSpeaker",
    effect: "NissaWorldsoulSpeakerEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/n/NissaWorldsoulSpeaker.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "NissasRevelation::NissasRevelationEffect": {
    card: "NissasRevelation",
    effect: "NissasRevelationEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/n/NissasRevelation.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let sourceObject = source.getSourceObject(game);
    if (controller !== null && sourceObject !== null) {
      {
        let card = controller.getLibrary().getFromTop();
        if (card !== null) {
          {
            let cards = makeCards(game.xmageScope(), []);
            cards.add(card);
            controller.revealCards('', cards);
            if (card.isCreature()) {
              {
                controller.drawCards(card.getPower().getValue());
                controller.gainLife(card.getToughness().getValue());
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "NivixAerieOfTheFiremind::NivixAerieOfTheFiremindCanCastEffect": {
    card: "NivixAerieOfTheFiremind",
    effect: "NivixAerieOfTheFiremindCanCastEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/n/NivixAerieOfTheFiremind.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "NoctisPrinceOfLucis::NoctisPrinceOfLucisEffect": {
    card: "NoctisPrinceOfLucis",
    effect: "NoctisPrinceOfLucisEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/n/NoctisPrinceOfLucis.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "NoosegrafMob::NoosegrafMobEffect": {
    card: "NoosegrafMob",
    effect: "NoosegrafMobEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/n/NoosegrafMob.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getSourceId());
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null && permanent !== null && permanent.getCounters().getCount(CounterType.of("+1/+1")) > 0) {
      {
        permanent.removeCounters(CounterType.of("+1/+1").createInstance());
        let effect = createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), "ZombieToken"));
        return effect.apply(game, source);
      }
    }
    return false;
      return true;
    },
  },
  "NovaFlame::NovaFlameEffect": {
    card: "NovaFlame",
    effect: "NovaFlameEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/n/NovaFlame.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent === null) {
      {
        return false;
      }
    }
    let power = permanent.getPower().getValue();
    if (power < 1) {
      {
        return false;
      }
    }
    for (const creature of game.getBattlefield().getActivePermanents(StaticFilters.creature(), source.getControllerId())) {
      {
        if (!(creature.getId() === permanent.getId())) {
          {
            creature.damage(power, permanent.getId());
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "NowhereToRun::NowhereToRunHexproofEffect": {
    card: "NowhereToRun",
    effect: "NowhereToRunHexproofEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/n/NowhereToRun.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "NoxiousGearhulk::NoxiousGearhulkEffect": {
    card: "NoxiousGearhulk",
    effect: "NoxiousGearhulkEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/n/NoxiousGearhulk.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let creatureToDestroy = game.getPermanent(source.getTargetPointer().getFirst());
    if (creatureToDestroy !== null && player !== null) {
      {
        if (player.chooseUse('')) {
          {
            if (creatureToDestroy.destroy(false)) {
              {
                player.gainLife(creatureToDestroy.getToughness().getValue());
              }
            }
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "NylaShirshuSleuth::NylaShirshuSleuthEffect": {
    card: "NylaShirshuSleuth",
    effect: "NylaShirshuSleuthEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/n/NylaShirshuSleuth.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let card = game.getCard(source.getTargetPointer().getFirst());
    if (player === null || card === null) {
      {
        return false;
      }
    }
    let mv = card.getManaValue();
    player.moveCardsToExile(card);
    if (mv > 0) {
      {
        player.loseLife(mv);
        xmageToken(game.xmageScope(), "ClueArtifactToken").putOntoBattlefield(mv, source.getControllerId());
      }
    }
    return true;
      return true;
    },
  },
  "NyleaKeenEyed::NyleaKeenEyedEffect": {
    card: "NyleaKeenEyed",
    effect: "NyleaKeenEyedEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/n/NyleaKeenEyed.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let card = player.getLibrary().getFromTop();
    if (card === null) {
      {
        return false;
      }
    }
    player.revealCards('', makeCards(game.xmageScope(), []).add(card));
    if (card.isCreature()) {
      {
        return player.moveCards(card, 'hand');
      }
    }
    if (!player.chooseUse('')) {
      {
        return true;
      }
    }
    return player.moveCards(card, 'graveyard');
      return true;
    },
  },
  "NyleasColossus::NyleasColossusEffect": {
    card: "NyleasColossus",
    effect: "NyleasColossusEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/n/NyleasColossus.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    let power = permanent.getPower().getValue();
    let toughness = permanent.getToughness().getValue();
    game.addEffect(boostTargetEffect(game.xmageScope(), power, toughness, "EndOfTurn"), source);
    return true;
      return true;
    },
  },
  "OathOfDruids::OathOfDruidsEffect": {
    card: "OathOfDruids",
    effect: "OathOfDruidsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/o/OathOfDruids.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(game.getActivePlayerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let revealed = makeCards(game.xmageScope(), []);
    let selectedCard = null;
    let notSelectedCards = makeCards(game.xmageScope(), []);
    if (!controller.chooseUse('')) {
      {
        return true;
      }
    }
    for (const card of controller.getLibrary().getCards()) {
      {
        revealed.add(card);
        if (card.isCreature()) {
          {
            selectedCard = card;
            break;
          }
        } else {
          {
            notSelectedCards.add(card);
          }
        }
      }
    }
    controller.revealCards('', revealed);
    if (selectedCard !== null) {
      {
        controller.moveCards(selectedCard, 'battlefield');
      }
    }
    controller.moveCards(notSelectedCards, 'graveyard');
    return true;
      return true;
    },
  },
  "OathOfGhouls::OathOfGhoulsEffect": {
    card: "OathOfGhouls",
    effect: "OathOfGhoulsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/o/OathOfGhouls.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let sourceObject = game.getObject(source.getSourceId());
    let firstPlayer = game.getPlayer(game.getActivePlayerId());
    if (sourceObject === null || firstPlayer === null) {
      {
        return false;
      }
    }
    let filter = StaticFilters.creatureCard();
    filter.add(ownedByPredicate(firstPlayer.getId()));
    let target = makeTarget(game.xmageScope(), { filter: filter, zone: "graveyard" });
    target.withNotTarget(true);
    if (target.canChoose(game, firstPlayer.getId()) && firstPlayer.chooseUse('') && (target.choose(game, '', firstPlayer.getId()).length > 0)) {
      {
        let card = game.getCard(target.getFirstTarget());
        if (card !== null) {
          {
            firstPlayer.moveCards(card, 'hand');
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "OathOfNissa::OathOfNissaSpendAnyManaEffect": {
    card: "OathOfNissa",
    effect: "OathOfNissaSpendAnyManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/o/OathOfNissa.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "OathOfScholars::OathOfScholarsEffect": {
    card: "OathOfScholars",
    effect: "OathOfScholarsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/o/OathOfScholars.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let sourceObject = game.getObject(source.getSourceId());
    let firstPlayer = game.getPlayer(game.getActivePlayerId());
    if (sourceObject === null || firstPlayer === null) {
      {
        return false;
      }
    }
    if (firstPlayer.chooseUse('')) {
      {
        firstPlayer.discard(firstPlayer.getHand().size());
        firstPlayer.drawCards(3);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "OathkeeperTakenosDaisho::OathkeeperExileEquippedEffect": {
    card: "OathkeeperTakenosDaisho",
    effect: "OathkeeperExileEquippedEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/o/OathkeeperTakenosDaisho.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let equipment = game.getPermanentOrLKIBattlefield(source.getSourceId());
    if (equipment !== null && equipment.getAttachedTo() !== null) {
      {
        let creature = game.getPermanent(equipment.getAttachedTo());
        if (creature !== null) {
          {
            return creature.moveToExile();
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "OathswornVampire::OathswornVampirePlayEffect": {
    card: "OathswornVampire",
    effect: "OathswornVampirePlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/o/OathswornVampire.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ObNixilisTheAdversary::ObNixilisTheAdversaryDiscardEffect": {
    card: "ObNixilisTheAdversary",
    effect: "ObNixilisTheAdversaryDiscardEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/o/ObNixilisTheAdversary.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controllerId = source.getControllerId();
    let controller = game.getPlayer(controllerId);
    if (controller === null) {
      {
        return false;
      }
    }
    for (const opponentId of game.getOpponents(controllerId)) {
      {
        let opponent = game.getPlayer(opponentId);
        if (opponent === null) {
          {
            continue;
          }
        }
        if (opponent.getHand().isEmpty() || !opponent.chooseUse('') || opponent.discard(1).isEmpty()) {
          {
            opponent.loseLife(2);
          }
        }
      }
    }
    for (const permanent of game.getBattlefield().getAllActivePermanents(undefined, controllerId)) {
      {
        if (permanent.hasSubtype("demon") || permanent.hasSubtype("devil")) {
          {
            controller.gainLife(2);
            break;
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "OftNabbedGoat::OftNabbedGoatOwnerDrawsEffect": {
    card: "OftNabbedGoat",
    effect: "OftNabbedGoatOwnerDrawsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/o/OftNabbedGoat.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getSourceId());
    if (permanent === null) {
      {
        return false;
      }
    }
    let owner = game.getPlayer(permanent.getOwnerId());
    if (owner === null) {
      {
        return false;
      }
    }
    let counterCount = permanent.getCounters().getCount(CounterType.of("-1/-1"));
    owner.drawCards(counterCount);
    for (const opponentId of game.getOpponents(owner.getId())) {
      {
        let player = game.getPlayer(opponentId);
        if (player !== null) {
          {
            player.loseLife(counterCount);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "OgreHeadHelm::OgreHeadHelmEffect": {
    card: "OgreHeadHelm",
    effect: "OgreHeadHelmEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/o/OgreHeadHelm.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (player === null || permanent === null || !player.chooseUse('') || !permanent.sacrifice()) {
      {
        return false;
      }
    }
    player.discardCards(player.getHand());
    player.drawCards(3);
    return true;
      return true;
    },
  },
  "OkoThiefOfCrowns::OkoThiefOfCrownsEffect": {
    card: "OkoThiefOfCrowns",
    effect: "OkoThiefOfCrownsEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/o/OkoThiefOfCrowns.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "OldGrowthTroll::OldGrowthTrollContinuousEffect": {
    card: "OldGrowthTroll",
    effect: "OldGrowthTrollContinuousEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/o/OldGrowthTroll.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "OldManOfTheSea::OldManOfTheSeaEffect": {
    card: "OldManOfTheSea",
    effect: "OldManOfTheSeaEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/o/OldManOfTheSea.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "OmnivorousFlytrap::OmnivorousFlytrapEffect": {
    card: "OmnivorousFlytrap",
    effect: "OmnivorousFlytrapEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/o/OmnivorousFlytrap.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    for (const targetId of source.getTargetPointer().getTargets()) {
      {
        let permanent = game.getPermanent(targetId);
        if (permanent !== null) {
          {
            let existingCounters = permanent.getCounters().getCount(CounterType.of("+1/+1"));
            if (existingCounters > 0) {
              {
                permanent.addCounters(CounterType.of("+1/+1").createInstance(existingCounters));
              }
            }
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "OneRingToRuleThemAll::OneRingToRuleThemAllEffect": {
    card: "OneRingToRuleThemAll",
    effect: "OneRingToRuleThemAllEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/o/OneRingToRuleThemAll.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const playerId of game.getOpponents(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player !== null) {
          {
            player.loseLife(makeCards(game.xmageScope(), player.getGraveyard().ids()).retain(StaticFilters.creatureCard()).size());
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "OneWithTheMultiverse::OneWithTheMultiverseEffect": {
    card: "OneWithTheMultiverse",
    effect: "OneWithTheMultiverseEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/o/OneWithTheMultiverse.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "OneWithTheStars::OneWithTheStarsEffect": {
    card: "OneWithTheStars",
    effect: "OneWithTheStarsEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/o/OneWithTheStars.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "OpalTitan::OpalTitanBecomesCreatureEffect": {
    card: "OpalTitan",
    effect: "OpalTitanBecomesCreatureEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/o/OpalTitan.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "Opalescence::OpalescenceEffect": {
    card: "Opalescence",
    effect: "OpalescenceEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/o/Opalescence.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "OpenSeason::OpenSeasonEffect": {
    card: "OpenSeason",
    effect: "OpenSeasonEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/o/OpenSeason.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
      {
        if ((playerId === source.getTargetPointer().getFirst())) {
          {
            continue;
          }
        }
        let player = game.getPlayer(playerId);
        if (player !== null) {
          {
            player.gainLife(2);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "OranRiefHydra::OranRiefHydraEffect": {
    card: "OranRiefHydra",
    effect: "OranRiefHydraEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/o/OranRiefHydra.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let landLKI = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    let land = game.getPermanent(source.getTargetPointer().getFirst());
    let sourcePermanent = game.getPermanent(source.getSourceId());
    if (land !== null && landLKI !== null && sourcePermanent !== null) {
      {
        if (landLKI.hasSubtype("forest")) {
          {
            sourcePermanent.addCounters(CounterType.of("+1/+1").createInstance(2));
          }
        } else {
          {
            sourcePermanent.addCounters(CounterType.of("+1/+1").createInstance());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "OrchardWarden::OrchardWardenffect": {
    card: "OrchardWarden",
    effect: "OrchardWardenffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/o/OrchardWarden.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (controller !== null && permanent !== null) {
      {
        controller.gainLife(permanent.getToughness().getValue());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "OriginOfBlackWidow::OriginOfBlackWidowEffect": {
    card: "OriginOfBlackWidow",
    effect: "OriginOfBlackWidowEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/o/OriginOfBlackWidow.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const playerId of game.getOpponents(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player !== null) {
          {
            player.loseLife(makeCards(game.xmageScope(), player.getGraveyard().ids()).retain(StaticFilters.creatureCard()).size());
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "OriqLoremage::OriqLoremageEffect": {
    card: "OriqLoremage",
    effect: "OriqLoremageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/o/OriqLoremage.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.card(), zone: "library" });
    (player.searchLibrary('', target).length > 0);
    let card = player.getLibrary().getCard(target.getFirstTarget());
    if (card === null) {
      {
        player.shuffleLibrary();
        return true;
      }
    }
    player.moveCards(card, 'graveyard');
    player.shuffleLibrary();
    let permanent = source.getSourcePermanentIfItStillExists(game);
    if (!card.isInstantOrSorcery() || permanent === null) {
      {
        return true;
      }
    }
    permanent.addCounters(CounterType.of("+1/+1").createInstance());
    return true;
      return true;
    },
  },
  "OrnateKanzashi::OrnateKanzashiCastFromExileEffect": {
    card: "OrnateKanzashi",
    effect: "OrnateKanzashiCastFromExileEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/o/OrnateKanzashi.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "OrzhovCharm::OrzhovCharmDestroyAndLoseLifeEffect": {
    card: "OrzhovCharm",
    effect: "OrzhovCharmDestroyAndLoseLifeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/o/OrzhovCharm.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let target = game.getPermanent(source.getTargetPointer().getFirst());
    let controller = game.getPlayer(source.getControllerId());
    if (target === null || controller === null) {
      {
        return false;
      }
    }
    let toughness = target.getToughness().getValue();
    target.destroy(false);
    if (toughness > 0) {
      {
        controller.loseLife(toughness);
      }
    }
    return true;
      return true;
    },
  },
  "OsteomancerAdept::OsteomancerAdeptEffect": {
    card: "OsteomancerAdept",
    effect: "OsteomancerAdeptEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/o/OsteomancerAdept.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "OtherworldAtlas::OtherworldAtlasDrawEffect": {
    card: "OtherworldAtlas",
    effect: "OtherworldAtlasDrawEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/o/OtherworldAtlas.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let sourcePlayer = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getSourceId());
    if (permanent !== null && sourcePlayer !== null) {
      {
        let amount = permanent.getCounters().getCount(CounterType.of("charge"));
        if (amount > 0) {
          {
            for (const playerId of game.getState().getPlayersInRange(sourcePlayer.getId())) {
              {
                let player = game.getPlayer(playerId);
                if (player !== null) {
                  {
                    player.drawCards(amount);
                  }
                }
              }
            }
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "Outmaneuver::OutmaneuverEffect": {
    card: "Outmaneuver",
    effect: "OutmaneuverEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/o/Outmaneuver.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "OverwhelmingSplendor::OverwhelmingSplendorLoseAbilitiesEffect": {
    card: "OverwhelmingSplendor",
    effect: "OverwhelmingSplendorLoseAbilitiesEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/o/OverwhelmingSplendor.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "Ovinomancer::OvinomancerEffect": {
    card: "Ovinomancer",
    effect: "OvinomancerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/o/Ovinomancer.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetId = source.getTargetPointer().getFirst();
    if (targetId !== null) {
      {
        let permanent = game.getPermanentOrLKIBattlefield(targetId);
        if (permanent !== null) {
          {
            let controllerId = permanent.getControllerId();
            if (controllerId !== null) {
              {
                xmageToken(game.xmageScope(), "SheepToken").putOntoBattlefield(1, controllerId);
                return true;
              }
            }
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "Pandemonium::PandemoniumEffect": {
    card: "Pandemonium",
    effect: "PandemoniumEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/Pandemonium.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let enteringCreature = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
        if (enteringCreature !== null) {
          {
            let targetPermanent = game.getPermanent(source.getTargets().getFirstTarget());
            if (targetPermanent !== null) {
              {
                targetPermanent.damage(enteringCreature.getPower().getValue(), enteringCreature.getId());
              }
            } else {
              {
                let targetPlayer = game.getPlayer(source.getTargets().getFirstTarget());
                if (targetPlayer !== null) {
                  {
                    targetPlayer.damage(enteringCreature.getPower().getValue(), enteringCreature.getId());
                  }
                }
              }
            }
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "Paraselene::ParaseleneEffect": {
    card: "Paraselene",
    effect: "ParaseleneEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/Paraselene.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let count = 0;
    for (const permanent of game.getBattlefield().getActivePermanents(StaticFilters.enchantment(), source.getControllerId())) {
      {
        if (permanent.destroy(false)) {
          {
            count++;
          }
        }
      }
    }
    if (count > 0) {
      {
        let player = game.getPlayer(source.getControllerId());
        if (player !== null) {
          {
            player.gainLife(count);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "ParasiticImplant::ParasiticImplantEffect": {
    card: "ParasiticImplant",
    effect: "ParasiticImplantEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/ParasiticImplant.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let enchantment = game.getPermanent(source.getSourceId());
    if (enchantment !== null && enchantment.getAttachedTo() !== null) {
      {
        let creature = game.getPermanent(enchantment.getAttachedTo());
        if (creature !== null) {
          {
            return creature.sacrifice();
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "PardicDragon::PardicDragonEffect": {
    card: "PardicDragon",
    effect: "PardicDragonEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/PardicDragon.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let opponent = game.getPlayer(source.getTargetPointer().getFirst());
    let sourceCard = game.getCard(source.getSourceId());
    if (opponent !== null && sourceCard !== null) {
      {
        if (opponent.chooseUse('')) {
          {
            sourceCard.addCounters(CounterType.of("time").createInstance());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "Paroxysm::ParoxysmEffect": {
    card: "Paroxysm",
    effect: "ParoxysmEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/Paroxysm.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let aura = game.getPermanent(source.getSourceId());
    if (aura !== null) {
      {
        let creatureAttachedTo = game.getPermanent(aura.getAttachedTo());
        if (creatureAttachedTo !== null) {
          {
            let controllerOfCreature = game.getPlayer(creatureAttachedTo.getControllerId());
            if (controllerOfCreature !== null) {
              {
                let revealCardFromTop = controllerOfCreature.getLibrary().getFromTop();
                if (revealCardFromTop !== null) {
                  {
                    let cards = makeCards(game.xmageScope(), []).add(revealCardFromTop);
                    controllerOfCreature.revealCards('', cards);
                    if (revealCardFromTop.isLand()) {
                      {
                        creatureAttachedTo.destroy(false);
                      }
                    } else {
                      {
                        let effect = boostTargetEffect(game.xmageScope(), 3, 3, "EndOfTurn");
                        effect.setTargetPointer(fixedTarget(creatureAttachedTo.getId()));
                        game.addEffect(effect, source);
                      }
                    }
                    return true;
                  }
                }
              }
            }
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "PathOfPeace::PathOfPeaceEffect": {
    card: "PathOfPeace",
    effect: "PathOfPeaceEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/PathOfPeace.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let target = game.getPermanent(source.getTargetPointer().getFirst());
    if (controller !== null && target !== null) {
      {
        target.destroy(false);
        let owner = game.getPlayer(target.getOwnerId());
        if (owner !== null) {
          {
            owner.gainLife(4);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "PatientRebuilding::PatientRebuildingEffect": {
    card: "PatientRebuilding",
    effect: "PatientRebuildingEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/PatientRebuilding.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getFirstTarget());
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null || player === null) {
      {
        return false;
      }
    }
    let numberOfLandCards = 0;
    let movedCards = player.millCards(3).getCards();
    for (const card of movedCards) {
      {
        if (card.isLand()) {
          {
            numberOfLandCards++;
          }
        }
      }
    }
    if (numberOfLandCards > 0) {
      {
        return controller.drawCards(numberOfLandCards) > 0;
      }
    }
    return true;
      return true;
    },
  },
  "PerilousPredicament::PerilousPredicamentSacrificeOpponentsEffect": {
    card: "PerilousPredicament",
    effect: "PerilousPredicamentSacrificeOpponentsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/PerilousPredicament.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let perms = [];
    for (const playerId of game.getOpponents(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player !== null) {
          {
            let filterArtifact = makeFilter(["creature", "artifact"], [cardTypePredicate("creature"), cardTypePredicate("artifact")]);
            let filterNonArtifact = StaticFilters.creature();
            filterNonArtifact.add(Predicates.not(cardTypePredicate("artifact")));
            if (game.getBattlefield().countAll(filterArtifact, player.getId()) > 0) {
              {
                let target = makeTarget(game.xmageScope(), { filter: filterArtifact.add(controlledByPredicate()) }).withNotTarget(true);
                if (target.canChoose(game, player.getId())) {
                  {
                    (target.choose(game, '', player.getId()).length > 0);
                    perms.push(...target.getTargets());
                  }
                }
              }
            }
            if (game.getBattlefield().countAll(filterNonArtifact, player.getId()) > 0) {
              {
                let target = makeTarget(game.xmageScope(), { filter: filterNonArtifact.add(controlledByPredicate()) }).withNotTarget(true);
                if (target.canChoose(game, player.getId())) {
                  {
                    (target.choose(game, '', player.getId()).length > 0);
                    perms.push(...target.getTargets());
                  }
                }
              }
            }
          }
        }
      }
    }
    for (const permID of perms) {
      {
        let permanent = game.getPermanent(permID);
        if (permanent !== null) {
          {
            permanent.sacrifice();
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "PersistentConstrictor::PersistentConstrictorEffect": {
    card: "PersistentConstrictor",
    effect: "PersistentConstrictorEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/PersistentConstrictor.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(game.getActivePlayerId());
    return player !== null && player.loseLife(1) > 0;
      return true;
    },
  },
  "PestilenceDemon::PestilenceDemonEffect": {
    card: "PestilenceDemon",
    effect: "PestilenceDemonEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/PestilenceDemon.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const creature of game.getBattlefield().getActivePermanents(StaticFilters.creature(), source.getControllerId())) {
      {
        if (creature !== null) {
          {
            creature.damage(1, source.getSourceId());
          }
        }
      }
    }
    for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player !== null) {
          {
            player.damage(1, source.getSourceId());
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "PhantomWings::PhantomWingsReturnEffect": {
    card: "PhantomWings",
    effect: "PhantomWingsReturnEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/PhantomWings.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanentOrLKIBattlefield(source.getSourceId());
    if (player === null || permanent === null || permanent.getAttachedTo() === null) {
      {
        return false;
      }
    }
    let enchantedCreature = game.getPermanent(permanent.getAttachedTo());
    return enchantedCreature !== null && player.moveCards(enchantedCreature, 'hand');
      return true;
    },
  },
  "Phthisis::PhthisisEffect": {
    card: "Phthisis",
    effect: "PhthisisEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/Phthisis.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let creature = game.getPermanent(source.getTargetPointer().getFirst());
    if (creature !== null) {
      {
        let controller = game.getPlayer(creature.getControllerId());
        if (controller !== null) {
          {
            let lifeLoss = CardUtil.overflowInc(creature.getPower().getValue(), creature.getToughness().getValue());
            creature.destroy(false);
            controller.loseLife(lifeLoss);
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "PhylacteryLich::PhylacteryLichEffect": {
    card: "PhylacteryLich",
    effect: "PhylacteryLichEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/PhylacteryLich.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player !== null) {
      {
        let target = makeTarget(game.xmageScope(), { filter: (makeFilter(['permanent','you','control'], [controlledByPredicate()]).add(cardTypePredicate("artifact"))), min: 1, max: 1 }).withNotTarget(true);
        if (target.canChoose(game, source.getControllerId())) {
          {
            if ((target.choose(game, '', player.getId()).length > 0)) {
              {
                let permanent = game.getPermanent(target.getFirstTarget());
                if (permanent !== null) {
                  {
                    permanent.addCounters(CounterType.of("phylactery").createInstance());
                  }
                }
              }
            }
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "PhyrexianDelver::PhyrexianDelverEffect": {
    card: "PhyrexianDelver",
    effect: "PhyrexianDelverEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/PhyrexianDelver.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let creatureCard = game.getCard(source.getTargetPointer().getFirst());
    let controller = game.getPlayer(source.getControllerId());
    if (creatureCard !== null && controller !== null) {
      {
        let result = false;
        if (game.getState().getZone(creatureCard.getId()) === 'graveyard') {
          {
            result = controller.moveCards(creatureCard, 'battlefield');
          }
        }
        controller.loseLife(creatureCard.getManaValue());
        return result;
      }
    }
    return false;
      return true;
    },
  },
  "PiasRevolution::PiasRevolutionReturnEffect": {
    card: "PiasRevolution",
    effect: "PiasRevolutionReturnEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/PiasRevolution.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let cards = makeCards(game.xmageScope(), []).addAll(source.getTargetPointer().getTargets()).getCards();
    if (controller === null || (cards.length === 0)) {
      {
        return false;
      }
    }
    let opponent = game.getPlayer(source.getFirstTarget());
    if (opponent !== null && opponent.chooseUse('')) {
      {
        opponent.damage(3, source.getSourceId());
      }
    } else {
      {
        controller.moveCards(cards, 'hand');
      }
    }
    return true;
      return true;
    },
  },
  "PitOfOfferings::PitOfOfferingsEffect": {
    card: "PitOfOfferings",
    effect: "PitOfOfferingsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/PitOfOfferings.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let sourceObject = source.getSourceObject(game);
    if (controller === null || sourceObject === null) {
      {
        return false;
      }
    }
    let cardsExiled = makeCards(game.xmageScope(), []).addAll(source.getTargetPointer().getTargets());
    controller.moveCardsToExile(cardsExiled.getCards());
    return true;
      return true;
    },
  },
  "PlaneswalkersMischief::PlaneswalkersMischiefCastFromExileEffect": {
    card: "PlaneswalkersMischief",
    effect: "PlaneswalkersMischiefCastFromExileEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/p/PlaneswalkersMischief.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "PlungeIntoDarkness::PlungeIntoDarknessLifeEffect": {
    card: "PlungeIntoDarkness",
    effect: "PlungeIntoDarknessLifeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/PlungeIntoDarkness.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player !== null) {
      {
        let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creature().add(controlledByPredicate()), min: 0, max: Number.MAX_SAFE_INTEGER }).withNotTarget(true);
        (target.choose(game, '', player.getId()).length > 0);
        let numSacrificed = 0;
        for (const permanentId of target.getTargets()) {
          {
            let permanent = game.getPermanent(permanentId);
            if (permanent !== null) {
              {
                if (permanent.sacrifice()) {
                  {
                    numSacrificed++;
                  }
                }
              }
            }
          }
        }
        if (numSacrificed > 0) {
          {
            player.gainLife(3 * numSacrificed);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "PolymorphistsJest::PolymorphistsJestEffect": {
    card: "PolymorphistsJest",
    effect: "PolymorphistsJestEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/p/PolymorphistsJest.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "PoppetStitcher::PoppetFactoryEffect": {
    card: "PoppetStitcher",
    effect: "PoppetFactoryEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/p/PoppetStitcher.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "PossessedGoat::PossessedGoatEffect": {
    card: "PossessedGoat",
    effect: "PossessedGoatEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/p/PossessedGoat.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "PossessedPortal::PossessedPortalEffect": {
    card: "PossessedPortal",
    effect: "PossessedPortalEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/PossessedPortal.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player === null) {
          {
            continue;
          }
        }
        if (player.getHand().isEmpty() || !player.chooseUse('') || player.discard(1).isEmpty()) {
          {
            let target = makeTarget(game.xmageScope(), { filter: StaticFilters.permanent().add(controlledByPredicate()) }).withNotTarget(true);
            if (target.canChoose(game, player.getId())) {
              {
                (target.choose(game, '', player.getId()).length > 0);
                let permanent = game.getPermanent(target.getFirstTarget());
                if (permanent !== null) {
                  {
                    permanent.sacrifice();
                  }
                }
              }
            }
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "PowerPlantWorker::PowerPlantWorkerEffect": {
    card: "PowerPlantWorker",
    effect: "PowerPlantWorkerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/PowerPlantWorker.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let sourcePermanent = source.getSourcePermanentIfItStillExists(game);
    if (sourcePermanent === null) {
      {
        return false;
      }
    }
    let mineName = '';
    let towerName = '';
    let mine = false;
    let tower = false;
    for (const permanent of game.getBattlefield().getAllActivePermanents(StaticFilters.creature(), source.getControllerId())) {
      {
        let name = permanent.getName();
        if (!mine && (mineName === name)) {
          {
            mine = true;
          }
        } else {
          if (!tower && (towerName === name)) {
            {
              tower = true;
            }
          }
        }
        if (mine && tower) {
          {
            return sourcePermanent.addCounters(CounterType.of("+1/+1").createInstance(2));
          }
        }
      }
    }
    game.addEffect(boostSourceEffect(game.xmageScope(), 2, 2, "EndOfTurn"), source);
    return true;
      return true;
    },
  },
  "PracticedOffense::PracticedOffenseEffect": {
    card: "PracticedOffense",
    effect: "PracticedOffenseEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/PracticedOffense.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const permanent of game.getBattlefield().getActivePermanents(StaticFilters.creatureYouControl(), source.getTargetPointer().getFirst())) {
      {
        permanent.addCounters(CounterType.of("+1/+1").createInstance());
      }
    }
    return true;
      return true;
    },
  },
  "PraetorsCounsel::PraetorsCounselEffect": {
    card: "PraetorsCounsel",
    effect: "PraetorsCounselEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/PraetorsCounsel.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        controller.moveCards(controller.getGraveyard(), 'hand');
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "PredatoryFocus::PredatoryFocusEffect": {
    card: "PredatoryFocus",
    effect: "PredatoryFocusEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/p/PredatoryFocus.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "PriceOfKnowledge::PriceOfKnowledgeEffect": {
    card: "PriceOfKnowledge",
    effect: "PriceOfKnowledgeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/PriceOfKnowledge.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    if (targetPlayer !== null) {
      {
        let xValue = targetPlayer.getHand().size();
        if (xValue > 0) {
          {
            targetPlayer.damage(xValue, source.getSourceId());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "PrimalInstinct::PrimalInstictEffect": {
    card: "PrimalInstinct",
    effect: "PrimalInstictEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/PrimalInstinct.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let target = game.getPermanent(source.getTargetPointer().getFirst());
        if (target !== null) {
          {
            target.addCounters(CounterType.of("+1/+1").createInstance());
            let addCounterCount = target.getCounters().getCount(CounterType.of("+1/+1"));
            target.addCounters(CounterType.of("+1/+1").createInstance(addCounterCount));
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "PrimordialMist::PrimordialMistCastFromExileEffect": {
    card: "PrimordialMist",
    effect: "PrimordialMistCastFromExileEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/p/PrimordialMist.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "PrincessYue::PrincessYueTypeEffect": {
    card: "PrincessYue",
    effect: "PrincessYueTypeEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/p/PrincessYue.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "PrisonersDilemma::PrisonersDilemmaEffect": {
    card: "PrisonersDilemma",
    effect: "PrisonersDilemmaEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/PrisonersDilemma.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let silence = [];
    let snitch = [];
    for (const playerId of game.getOpponents(source.getControllerId())) {
      {
        let opponent = game.getPlayer(playerId);
        if (opponent === null) {
          {
            continue;
          }
        }
        let choseSilence = opponent.chooseUse('');
        if (choseSilence) {
          {
            silence.push(opponent);
          }
        } else {
          {
            snitch.push(opponent);
          }
        }
      }
    }
    for (const player of snitch) {
      {
        game.informPlayers(player.getName() + '');
      }
    }
    for (const player of silence) {
      {
        game.informPlayers(player.getName() + '');
      }
    }
    if ((snitch.length === 0)) {
      {
        for (const player of silence) {
          {
            player.damage(4, source.getSourceId());
          }
        }
      }
    } else {
      if ((silence.length === 0)) {
        {
          for (const player of snitch) {
            {
              player.damage(8, source.getSourceId());
            }
          }
        }
      } else {
        {
          for (const player of silence) {
            {
              player.damage(12, source.getSourceId());
            }
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "ProbeDroid::ProbeDroidEffect": {
    card: "ProbeDroid",
    effect: "ProbeDroidEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/ProbeDroid.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player === null) {
      {
        return false;
      }
    }
    player.revealCards('', player.getHand());
    return true;
      return true;
    },
  },
  "ProgenitorsIcon::ProgenitorsIconAsThoughEffect": {
    card: "ProgenitorsIcon",
    effect: "ProgenitorsIconAsThoughEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/p/ProgenitorsIcon.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "PromiseOfBunrei::PromiseOfBunreiEffect": {
    card: "PromiseOfBunrei",
    effect: "PromiseOfBunreiEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/PromiseOfBunrei.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getSourceId());
    if (controller !== null && permanent !== null) {
      {
        if (permanent.sacrifice()) {
          {
            return createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), "SpiritToken"), 4).apply(game, source);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "Prophecy::ProphecyEffect": {
    card: "Prophecy",
    effect: "ProphecyEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/Prophecy.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPlayer = game.getPlayer(source.getFirstTarget());
    let controller = game.getPlayer(source.getControllerId());
    let sourceObject = game.getObject(source.getSourceId());
    if (sourceObject === null || targetPlayer === null || controller === null) {
      {
        return false;
      }
    }
    if (targetPlayer.getLibrary().hasCards()) {
      {
        let cards = makeCards(game.xmageScope(), []);
        let card = targetPlayer.getLibrary().getFromTop();
        if (card === null) {
          {
            return false;
          }
        }
        cards.add(card);
        targetPlayer.revealCards('', cards);
        if (card.isLand()) {
          {
            controller.gainLife(1);
          }
        }
        targetPlayer.shuffleLibrary();
      }
    }
    return true;
      return true;
    },
  },
  "PropheticFlamespeaker::PropheticFlamespeakerCastFromExileEffect": {
    card: "PropheticFlamespeaker",
    effect: "PropheticFlamespeakerCastFromExileEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/p/PropheticFlamespeaker.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ProvokeTheTrolls::ProvokeTheTrollsEffect": {
    card: "ProvokeTheTrolls",
    effect: "ProvokeTheTrollsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/ProvokeTheTrolls.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getFirstTarget());
    if (player !== null) {
      {
        return player.damage(3, source.getSourceId()) > 0;
      }
    }
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null || permanent.damage(3, source.getSourceId()) < 1) {
      {
        return false;
      }
    }
    if (permanent.isCreature()) {
      {
        game.addEffect(boostTargetEffect(game.xmageScope(), 3, 0), source);
      }
    }
    return true;
      return true;
    },
  },
  "PsychicIntrusion::PsychicIntrusionCastFromExileEffect": {
    card: "PsychicIntrusion",
    effect: "PsychicIntrusionCastFromExileEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/p/PsychicIntrusion.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "PsychicIntrusion::PsychicIntrusionSpendAnyManaEffect": {
    card: "PsychicIntrusion",
    effect: "PsychicIntrusionSpendAnyManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/p/PsychicIntrusion.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "PullFromEternity::PullFromEternityEffect": {
    card: "PullFromEternity",
    effect: "PullFromEternityEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/PullFromEternity.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let card = game.getCard(source.getTargetPointer().getFirst());
        if (card !== null) {
          {
            controller.moveCards(card, 'graveyard');
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "PurifyingDragon::PurifyingDragonEffect": {
    card: "PurifyingDragon",
    effect: "PurifyingDragonEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/PurifyingDragon.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    return permanent.damage((permanent.hasSubtype("zombie") ? 2 : 1), source.getSourceId()) > 0;
      return true;
    },
  },
  "PyrotechnicPerformer::PyrotechnicPerformerEffect": {
    card: "PyrotechnicPerformer",
    effect: "PyrotechnicPerformerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/p/PyrotechnicPerformer.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let turnedUpCreature = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (turnedUpCreature === null) {
      {
        return false;
      }
    }
    for (const playerId of game.getOpponents(source.getControllerId())) {
      {
        let opponent = game.getPlayer(playerId);
        if (opponent === null) {
          {
            continue;
          }
        }
        opponent.damage(turnedUpCreature.getPower().getValue(), turnedUpCreature.getId());
      }
    }
    return true;
      return true;
    },
  },
  "Quagmire::QuagmireEffect": {
    card: "Quagmire",
    effect: "QuagmireEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/q/Quagmire.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "QuestForAncientSecrets::QuestForAncientSecretsEffect": {
    card: "QuestForAncientSecrets",
    effect: "QuestForAncientSecretsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/q/QuestForAncientSecrets.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getFirstTarget());
    if (player === null) {
      {
        return false;
      }
    }
    player.putCardsOnBottomOfLibrary(player.getGraveyard());
    player.shuffleLibrary();
    return true;
      return true;
    },
  },
  "Quicken::QuickenAsThoughEffect": {
    card: "Quicken",
    effect: "QuickenAsThoughEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/q/Quicken.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "QuicksilverElemental::QuickSilverElementalBlueManaEffect": {
    card: "QuicksilverElemental",
    effect: "QuickSilverElementalBlueManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/q/QuicksilverElemental.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "QuilledGreatwurm::QuilledGreatwurmEffect": {
    card: "QuilledGreatwurm",
    effect: "QuilledGreatwurmEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/q/QuilledGreatwurm.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "Rackling::RacklingEffect": {
    card: "Rackling",
    effect: "RacklingEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/Rackling.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player !== null) {
      {
        let damage = 3 - player.getHand().size();
        if (damage > 0) {
          {
            player.damage(damage, source.getSourceId());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "RaffinesGuidance::RafinnesGuidancePlayEffect": {
    card: "RaffinesGuidance",
    effect: "RafinnesGuidancePlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/r/RaffinesGuidance.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "RakdosCharm::RakdosCharmDamageEffect": {
    card: "RakdosCharm",
    effect: "RakdosCharmDamageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RakdosCharm.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let filter = makeFilter('permanent');
    filter.add(cardTypePredicate("creature"));
    for (const permanent of game.getBattlefield().getActivePermanents(filter, source.getControllerId())) {
      {
        let controller = game.getPlayer(permanent.getControllerId());
        if (controller !== null) {
          {
            controller.damage(1, permanent.getId());
            game.informPlayers('' + controller.getLogName() + '' + permanent.getName());
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "RakdosGuildmage::RakdosGuildmageEffect": {
    card: "RakdosGuildmage",
    effect: "RakdosGuildmageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RakdosGuildmage.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let effect = createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), "RakdosGuildmageGoblinToken"));
    if (effect.apply(game, source)) {
      {
        effect.exileTokensCreatedAtNextEndStep(game, source);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "RakdosRiteknife::RakdosRiteknifeEffect": {
    card: "RakdosRiteknife",
    effect: "RakdosRiteknifeEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/r/RakdosRiteknife.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "RalMonsoonMage::RalLeylineProdigyCastEffect": {
    card: "RalMonsoonMage",
    effect: "RalLeylineProdigyCastEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/r/RalMonsoonMage.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "RampageOfTheValkyries::RampageOfTheValkyriesEffect": {
    card: "RampageOfTheValkyries",
    effect: "RampageOfTheValkyriesEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RampageOfTheValkyries.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let perms = [];
    for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player === null || (player.getId() === source.getControllerId())) {
          {
            continue;
          }
        }
        let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creatureYouControl() });
        target.withNotTarget(true);
        if (!target.canChoose(game, playerId)) {
          {
            continue;
          }
        }
        (target.choose(game, '', player.getId()).length > 0);
        perms.push(target.getFirstTarget());
      }
    }
    for (const permID of perms) {
      {
        let permanent = game.getPermanent(permID);
        if (permanent !== null) {
          {
            permanent.sacrifice();
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "RaphaelMostAttitude::RaphaelMostAttitudeEffect": {
    card: "RaphaelMostAttitude",
    effect: "RaphaelMostAttitudeEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/r/RaphaelMostAttitude.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "RaphaelsTechnique::RaphaelsTechniqueEffect": {
    card: "RaphaelsTechnique",
    effect: "RaphaelsTechniqueEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RaphaelsTechnique.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let wheelers = [];
    for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player !== null && player.chooseUse('')) {
          {
            game.informPlayers(player.getName() + '');
            wheelers.push(player);
          }
        }
      }
    }
    for (const player of wheelers) {
      {
        player.discardCards(player.getHand());
        player.drawCards(7);
      }
    }
    return true;
      return true;
    },
  },
  "RapidHybridization::RapidHybridizationEffect": {
    card: "RapidHybridization",
    effect: "RapidHybridizationEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RapidHybridization.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (permanent !== null) {
      {
        let token = xmageToken(game.xmageScope(), "FrogLizardToken");
        token.putOntoBattlefield(1, permanent.getControllerId());
      }
    }
    return true;
      return true;
    },
  },
  "RasaadYnBashir::RasaadYnBashirEffect": {
    card: "RasaadYnBashir",
    effect: "RasaadYnBashirEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RasaadYnBashir.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const permanent of game.getBattlefield().getActivePermanents(StaticFilters.creatureYouControl(), source.getControllerId())) {
      {
        if (permanent.getToughness().getValue() !== 0) {
          {
            game.addEffect(boostTargetEffect(game.xmageScope(), 0, permanent.getToughness().getValue()).setTargetPointer(fixedTarget(permanent)), source);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "RavenEagle::RavenEagleEffect": {
    card: "RavenEagle",
    effect: "RavenEagleEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RavenEagle.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let card = game.getCard(source.getTargetPointer().getFirst());
    if (player === null || card === null) {
      {
        return false;
      }
    }
    let isCreature = card.isCreature();
    player.moveCards(card, 'exile');
    if (isCreature) {
      {
        game.processAction();
        xmageToken(game.xmageScope(), "ClueArtifactToken").putOntoBattlefield(1, source.getControllerId());
      }
    }
    return true;
      return true;
    },
  },
  "RavingDead::RavingDeadDamageEffect": {
    card: "RavingDead",
    effect: "RavingDeadDamageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RavingDead.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player !== null) {
      {
        let amount = player.getLife() / 2;
        if (amount > 0) {
          {
            player.loseLife(amount);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "RavingOniSlave::RavingOniSlaveEffect": {
    card: "RavingOniSlave",
    effect: "RavingOniSlaveEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RavingOniSlave.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        if (game.getBattlefield().count(StaticFilters.creature(), source.getControllerId()) < 1) {
          {
            controller.loseLife(3);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "RazeToTheGround::RazeToTheGroundEffect": {
    card: "RazeToTheGround",
    effect: "RazeToTheGroundEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RazeToTheGround.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    let manaValue = permanent.getManaValue();
    permanent.destroy();
    if (manaValue <= 1) {
      {
        let controller = game.getPlayer(source.getControllerId());
        if (controller !== null) {
          {
            controller.drawCards(1);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "RazorHippogriff::RazorHippogriffGainLifeEffect": {
    card: "RazorHippogriff",
    effect: "RazorHippogriffGainLifeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RazorHippogriff.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let card = game.getCard(source.getFirstTarget());
    if (player !== null && card !== null) {
      {
        player.gainLife(card.getManaValue());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "RealmRazer::ExileAllEffect": {
    card: "RealmRazer",
    effect: "ExileAllEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RealmRazer.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanents = game.getBattlefield().getActivePermanents(StaticFilters.land(), source.getControllerId());
    for (const permanent of permanents) {
      {
        permanent.moveToExile();
      }
    }
    return true;
      return true;
    },
  },
  "ReasonBelieve::BelieveEffect": {
    card: "ReasonBelieve",
    effect: "BelieveEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/ReasonBelieve.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let card = controller.getLibrary().getFromTop();
        if (card !== null) {
          {
            if (card.isCreature() && controller.chooseUse('')) {
              {
                controller.moveCards(card, 'battlefield');
              }
            } else {
              {
                controller.moveCards(card, 'hand');
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "Recoil::RecoilEffect": {
    card: "Recoil",
    effect: "RecoilEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/Recoil.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let target = game.getPermanent(source.getFirstTarget());
    if (target === null) {
      {
        return false;
      }
    }
    let controller = game.getPlayer(target.getControllerId());
    if (controller !== null) {
      {
        controller.moveCards(target, 'hand');
        controller.discard(1);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "RecurringInsight::RecurringInsightEffect": {
    card: "RecurringInsight",
    effect: "RecurringInsightEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RecurringInsight.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let opponent = game.getPlayer(source.getTargetPointer().getFirst());
        if (opponent !== null) {
          {
            controller.drawCards(opponent.getHand().size());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "RedDeathShipwrecker::AlluringEyesDrawEffect": {
    card: "RedDeathShipwrecker",
    effect: "AlluringEyesDrawEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RedDeathShipwrecker.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    let player = game.getPlayer(permanent.getControllerId());
    if (player !== null) {
      {
        player.drawCards(1);
      }
    }
    return true;
      return true;
    },
  },
  "ReleaseToMemory::ReleaseToMemoryEffect": {
    card: "ReleaseToMemory",
    effect: "ReleaseToMemoryEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/ReleaseToMemory.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getFirstTarget());
    if (player === null) {
      {
        return false;
      }
    }
    let creatures = makeCards(game.xmageScope(), player.getGraveyard().ids()).retain(StaticFilters.creatureCard()).size();
    player.moveCards(player.getGraveyard(), 'exile');
    if (creatures > 0) {
      {
        game.processAction();
        xmageToken(game.xmageScope(), "SpiritToken").putOntoBattlefield(creatures, source.getControllerId());
      }
    }
    return true;
      return true;
    },
  },
  "RelicsRoar::RelicsRoarEffect": {
    card: "RelicsRoar",
    effect: "RelicsRoarEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/r/RelicsRoar.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "RendingFlame::RendingFlameEffect": {
    card: "RendingFlame",
    effect: "RendingFlameEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RendingFlame.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    permanent.damage(5);
    if (!permanent.hasSubtype("spirit")) {
      {
        return true;
      }
    }
    let player = game.getPlayer(permanent.getControllerId());
    if (player !== null) {
      {
        player.damage(2);
      }
    }
    return true;
      return true;
    },
  },
  "Renounce::RenounceEffect": {
    card: "Renounce",
    effect: "RenounceEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/Renounce.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let amount = 0;
    let toSacrifice = makeTarget(game.xmageScope(), { filter: StaticFilters.permanent().add(controlledByPredicate()), min: 0, max: Number.MAX_SAFE_INTEGER }).withNotTarget(true);
    if ((toSacrifice.choose(game, '', player.getId()).length > 0)) {
      {
        for (const uuid of toSacrifice.getTargets()) {
          {
            let permanent = game.getPermanent(uuid);
            if (permanent !== null) {
              {
                permanent.sacrifice();
                amount++;
              }
            }
          }
        }
        player.gainLife(amount * 2);
      }
    }
    return true;
      return true;
    },
  },
  "RenownedWeaponsmith::RenownedWeaponsmithEffect": {
    card: "RenownedWeaponsmith",
    effect: "RenownedWeaponsmithEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RenownedWeaponsmith.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let sourceObject = game.getObject(source.getSourceId());
    if (sourceObject !== null && controller !== null) {
      {
        let target = makeTarget(game.xmageScope(), { filter: (StaticFilters.card().add(Predicates.or(namePredicate(''), namePredicate('')))), zone: "library" });
        if ((controller.searchLibrary('', target).length > 0)) {
          {
            if (!(target.getTargets().length === 0)) {
              {
                let revealed = makeCards(game.xmageScope(), []);
                let card = game.getCard(target.getFirstTarget());
                if (card !== null) {
                  {
                    revealed.add(card);
                    controller.revealCards('', revealed);
                    controller.moveCards(revealed, 'hand');
                  }
                }
              }
            }
          }
        }
        controller.shuffleLibrary();
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "Repentance::RepentanceEffect": {
    card: "Repentance",
    effect: "RepentanceEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/Repentance.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent !== null) {
      {
        permanent.damage(permanent.getPower().getValue(), permanent.getId());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "Reprocess::ReprocessEffect": {
    card: "Reprocess",
    effect: "ReprocessEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/Reprocess.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let amount = 0;
    let toSacrifice = makeTarget(game.xmageScope(), { filter: (makeFilter(['permanent','you','control'], [controlledByPredicate()]).add(Predicates.or(cardTypePredicate("artifact"), cardTypePredicate("creature"), cardTypePredicate("land")))).add(controlledByPredicate()), min: 0, max: Number.MAX_SAFE_INTEGER }).withNotTarget(true);
    if ((toSacrifice.choose(game, '', player.getId()).length > 0)) {
      {
        for (const uuid of toSacrifice.getTargets()) {
          {
            let permanent = game.getPermanent(uuid);
            if (permanent !== null) {
              {
                permanent.sacrifice();
                amount++;
              }
            }
          }
        }
        player.drawCards(amount);
      }
    }
    return true;
      return true;
    },
  },
  "RequisitionRaid::RequisitionRaidEffect": {
    card: "RequisitionRaid",
    effect: "RequisitionRaidEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RequisitionRaid.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const permanent of game.getBattlefield().getActivePermanents(StaticFilters.creatureYouControl(), source.getTargetPointer().getFirst())) {
      {
        permanent.addCounters(CounterType.of("+1/+1").createInstance());
      }
    }
    return true;
      return true;
    },
  },
  "RescueFromTheUnderworld::RescueFromTheUnderworldTextEffect": {
    card: "RescueFromTheUnderworld",
    effect: "RescueFromTheUnderworldTextEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RescueFromTheUnderworld.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ResearchDevelopment::DevelopmentEffect": {
    card: "ResearchDevelopment",
    effect: "DevelopmentEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/ResearchDevelopment.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player !== null) {
      {
        for (let i = 0; i < 3; i++) {
          {
            let opponents = game.getOpponents(source.getControllerId());
            let putToken = true;
            for (const opponentUuid of opponents) {
              {
                let opponent = game.getPlayer(opponentUuid);
                if (opponent !== null && opponent.chooseUse('')) {
                  {
                    game.informPlayers(opponent.getLogName() + '' + player.getLogName() + '');
                    player.drawCards(1);
                    putToken = false;
                    break;
                  }
                }
              }
            }
            if (putToken) {
              {
                createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), "ResearchDevelopmentToken")).apply(game, source);
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "ReservoirKraken::ReservoirKrakenEffect": {
    card: "ReservoirKraken",
    effect: "ReservoirKrakenEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/ReservoirKraken.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let opponentTapped = false;
    for (const opponentId of game.getOpponents(source.getControllerId())) {
      {
        let opponent = game.getPlayer(opponentId);
        if (opponent === null) {
          {
            continue;
          }
        }
        let target = makeTarget(game.xmageScope(), { filter: makeFilter(["untapped", "creature", "you", "control"], [controlledByPredicate(), cardTypePredicate("creature"), tappedPredicate(false)]) });
        target.withNotTarget(true);
        if (!target.canChoose(game, opponentId) || !opponent.chooseUse('')) {
          {
            continue;
          }
        }
        (target.choose(game, '', opponent.getId()).length > 0);
        let permanent = game.getPermanent(target.getFirstTarget());
        if (permanent !== null && permanent.tap()) {
          {
            opponentTapped = true;
          }
        }
      }
    }
    if (opponentTapped) {
      {
        let kraken = source.getSourcePermanentIfItStillExists(game);
        if (kraken !== null) {
          {
            kraken.tap();
          }
        }
        xmageToken(game.xmageScope(), "FishToken").putOntoBattlefield(1, source.getControllerId());
      }
    }
    return true;
      return true;
    },
  },
  "RetracedImage::RetracedImageEffect": {
    card: "RetracedImage",
    effect: "RetracedImageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RetracedImage.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let target = makeTarget(game.xmageScope(), { filter: StaticFilters.card(), zone: "hand" });
        if (target.canChoose(game, controller.getId()) && (target.choose(game, '', controller.getId()).length > 0)) {
          {
            let chosenCard = game.getCard(target.getFirstTarget());
            if (chosenCard !== null) {
              {
                let cards = makeCards(game.xmageScope(), []);
                cards.add(chosenCard);
                controller.revealCards('', cards);
                for (const permanent of game.getBattlefield().getAllActivePermanents()) {
                  {
                    if ((permanent.getName() === chosenCard.getName())) {
                      {
                        return controller.moveCards(chosenCard, 'battlefield');
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "ReturnToDust::ReturnToDustExileEffect": {
    card: "ReturnToDust",
    effect: "ReturnToDustExileEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/ReturnToDust.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let firstTarget = game.getPermanent(source.getFirstTarget());
    if (firstTarget !== null) {
      {
        controller.moveCards(firstTarget, 'exile');
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "RevengeStarWars::RevengeEffect": {
    card: "RevengeStarWars",
    effect: "RevengeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RevengeStarWars.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let target = game.getPermanent(source.getTargetPointer().getFirst());
    if (target !== null && target.isCreature()) {
      {
        let effect = boostTargetEffect(game.xmageScope(), 4, 0, "EndOfTurn");
        effect.setTargetPointer(fixedTarget(target.getId()));
        game.addEffect(effect, source);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "RideTheAvalanche::RideTheAvalancheAsThoughEffect": {
    card: "RideTheAvalanche",
    effect: "RideTheAvalancheAsThoughEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/r/RideTheAvalanche.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "RidersOfTheMark::RidersOfTheMarkEffect": {
    card: "RidersOfTheMark",
    effect: "RidersOfTheMarkEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RidersOfTheMark.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = source.getSourcePermanentIfItStillExists(game);
    let player = game.getPlayer(source.getControllerId());
    if (permanent === null || player === null) {
      {
        return false;
      }
    }
    let toughness = permanent.getToughness().getValue();
    if (!player.moveCards(permanent, 'hand')) {
      {
        return false;
      }
    }
    if (toughness > 0) {
      {
        createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), "HumanSoldierToken"), toughness).apply(game, source);
      }
    }
    return true;
      return true;
    },
  },
  "RiseOfTheDarkRealms::RiseOfTheDarkRealmsEffect": {
    card: "RiseOfTheDarkRealms",
    effect: "RiseOfTheDarkRealmsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RiseOfTheDarkRealms.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let creatureCards = [];
        for (const playerId of game.getState().getPlayersInRange(controller.getId())) {
          {
            let player = game.getPlayer(playerId);
            if (player !== null) {
              {
                for (const card of player.getGraveyard().getCards()) {
                  {
                    if (card.isCreature()) {
                      {
                        creatureCards.push(card);
                      }
                    }
                  }
                }
              }
            }
          }
        }
        controller.moveCards(creatureCards, 'battlefield');
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "RisenExecutioner::RisenExecutionerCastEffect": {
    card: "RisenExecutioner",
    effect: "RisenExecutionerCastEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/r/RisenExecutioner.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "RisingWaters::RisingWatersUntapEffect": {
    card: "RisingWaters",
    effect: "RisingWatersUntapEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RisingWaters.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(game.getActivePlayerId());
    let target = makeTarget(game.xmageScope(), { filter: makeFilter(["land", "you", "control"], [controlledByPredicate(), cardTypePredicate("land")]) });
    if (player === null || !(target.choose(game, '', player.getId()).length > 0)) {
      {
        return false;
      }
    }
    for (const landId of target.getTargets()) {
      {
        let land = game.getPermanent(landId);
        if (land !== null) {
          {
            land.untap();
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "RiskFactor::RiskFactorEffect": {
    card: "RiskFactor",
    effect: "RiskFactorEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RiskFactor.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let opponent = game.getPlayer(source.getFirstTarget());
    if (controller === null || opponent === null) {
      {
        return false;
      }
    }
    if (opponent.chooseUse('')) {
      {
        opponent.damage(4, source.getSourceId());
      }
    } else {
      {
        controller.drawCards(3);
      }
    }
    return true;
      return true;
    },
  },
  "RiteOfTheRagingStorm::RiteOfTheRagingStormEffect": {
    card: "RiteOfTheRagingStorm",
    effect: "RiteOfTheRagingStormEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RiteOfTheRagingStorm.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player !== null) {
      {
        return xmageToken(game.xmageScope(), "LightningRagerToken").putOntoBattlefield(1, player.getId());
      }
    }
    return false;
      return true;
    },
  },
  "RoarOfEndlessSong::RoarOfEndlessSongEffect": {
    card: "RoarOfEndlessSong",
    effect: "RoarOfEndlessSongEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RoarOfEndlessSong.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const permanent of game.getBattlefield().getActivePermanents(StaticFilters.creatureYouControl(), source.getControllerId())) {
      {
        game.addEffect(boostTargetEffect(game.xmageScope(), permanent.getPower().getValue(), permanent.getToughness().getValue()).setTargetPointer(fixedTarget(permanent)), source);
      }
    }
    return true;
      return true;
    },
  },
  "RoarOfReclamation::RoarOfReclamationEffect": {
    card: "RoarOfReclamation",
    effect: "RoarOfReclamationEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RoarOfReclamation.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player !== null) {
          {
            player.moveCards(makeCards(game.xmageScope(), player.getGraveyard().ids()).retain(makeFilter(["artifact", "card"], [cardTypePredicate("artifact")])).getCards(), 'battlefield');
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "RobberFly::DrawCardsDefendingPlayerEffect": {
    card: "RobberFly",
    effect: "DrawCardsDefendingPlayerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RobberFly.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let defendingPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    if (controller !== null && defendingPlayer !== null) {
      {
        let numberOfCardsInHand = defendingPlayer.getHand().size();
        defendingPlayer.discardCards(defendingPlayer.getHand());
        defendingPlayer.drawCards(numberOfCardsInHand);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "RogueClass::RogueClassLookEffect": {
    card: "RogueClass",
    effect: "RogueClassLookEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/r/RogueClass.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "RogueClass::RogueClassPlayEffect": {
    card: "RogueClass",
    effect: "RogueClassPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/r/RogueClass.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "RogueClass::RogueClassManaEffect": {
    card: "RogueClass",
    effect: "RogueClassManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/r/RogueClass.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "RoilingTerrain::RoilingTerrainEffect": {
    card: "RoilingTerrain",
    effect: "RoilingTerrainEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RoilingTerrain.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetedLand = game.getPermanent(source.getTargetPointer().getFirst());
    if (targetedLand !== null) {
      {
        targetedLand.destroy(true);
        let targetController = game.getPlayer(targetedLand.getControllerId());
        if (targetController !== null) {
          {
            let landsInGraveyard = makeCards(game.xmageScope(), targetController.getGraveyard().ids()).retain(StaticFilters.landCard()).size();
            targetController.damage(landsInGraveyard, source.getSourceId());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "RonaDiscipleOfGix::RonaDiscipleOfGixPlayNonLandEffect": {
    card: "RonaDiscipleOfGix",
    effect: "RonaDiscipleOfGixPlayNonLandEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/r/RonaDiscipleOfGix.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "RonaSheoldredsFaithful::RonaSheoldredsFaithfulEffect": {
    card: "RonaSheoldredsFaithful",
    effect: "RonaSheoldredsFaithfulEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/r/RonaSheoldredsFaithful.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "RooftopStorm::RooftopStormRuleEffect": {
    card: "RooftopStorm",
    effect: "RooftopStormRuleEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/r/RooftopStorm.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "RootingKavu::RootingKavuEffect": {
    card: "RootingKavu",
    effect: "RootingKavuEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RootingKavu.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let cards = makeCards(game.xmageScope(), []).addAll(makeCards(game.xmageScope(), controller.getGraveyard().ids()).retain(StaticFilters.creatureCard()).getCards());
        controller.putCardsOnTopOfLibrary(cards);
        controller.shuffleLibrary();
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "RootingMoloch::RootingMolochMayPlayEffect": {
    card: "RootingMoloch",
    effect: "RootingMolochMayPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/r/RootingMoloch.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "RuinGrinder::RuinGrinderEffect": {
    card: "RuinGrinder",
    effect: "RuinGrinderEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RuinGrinder.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let wheelers = [];
    for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player !== null && player.chooseUse('')) {
          {
            game.informPlayers(player.getName() + '');
            wheelers.push(player);
          }
        }
      }
    }
    for (const player of wheelers) {
      {
        player.discardCards(player.getHand());
        player.drawCards(7);
      }
    }
    return true;
      return true;
    },
  },
  "RumblingAftershocks::RumblingAftershocksDealDamageEffect": {
    card: "RumblingAftershocks",
    effect: "RumblingAftershocksDealDamageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RumblingAftershocks.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let damageAmount = Number(game.getState().getValue("damageAmount"));
    if (player !== null && damageAmount > 0) {
      {
        let targetPlayer = game.getPlayer(source.getTargetPointer().getFirst());
        if (targetPlayer !== null) {
          {
            targetPlayer.damage(damageAmount, source.getSourceId());
            return true;
          }
        }
        let permanent = game.getPermanent(source.getTargetPointer().getFirst());
        if (permanent !== null) {
          {
            permanent.damage(damageAmount, source.getSourceId());
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "RuneforgeChampion::RuneforgeChampionEffect": {
    card: "RuneforgeChampion",
    effect: "RuneforgeChampionEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/r/RuneforgeChampion.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "RustlerRampage::RustlerRampageEffect": {
    card: "RustlerRampage",
    effect: "RustlerRampageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/r/RustlerRampage.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const permanent of game.getBattlefield().getActivePermanents(StaticFilters.creatureYouControl(), source.getTargetPointer().getFirst())) {
      {
        permanent.untap();
      }
    }
    return true;
      return true;
    },
  },
  "RuxaPatientProfessor::RuxaPatientProfessorEffect": {
    card: "RuxaPatientProfessor",
    effect: "RuxaPatientProfessorEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/r/RuxaPatientProfessor.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "SabinMasterMonk::SabinMasterMonkEffect": {
    card: "SabinMasterMonk",
    effect: "SabinMasterMonkEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SabinMasterMonk.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "SageEyeAvengers::SageEyeAvengersEffect": {
    card: "SageEyeAvengers",
    effect: "SageEyeAvengersEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SageEyeAvengers.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let sourceObject = game.getObject(source.getSourceId());
    if (sourceObject !== null && controller !== null) {
      {
        let targetCreature = game.getPermanent(source.getTargetPointer().getFirst());
        if (targetCreature !== null && targetCreature.getPower().getValue() < sourceObject.getPower().getValue()) {
          {
            controller.moveCards(targetCreature, 'hand');
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SandsOfTime::SandsOfTimeEffect": {
    card: "SandsOfTime",
    effect: "SandsOfTimeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SandsOfTime.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player !== null) {
      {
        for (const permanent of game.getBattlefield().getAllActivePermanents((makeFilter(['permanent','you','control'], [controlledByPredicate()]).add(Predicates.or(cardTypePredicate("artifact"), cardTypePredicate("creature"), cardTypePredicate("land")))), source.getTargetPointer().getFirst())) {
          {
            if (permanent.isTapped()) {
              {
                permanent.untap();
              }
            } else {
              {
                permanent.tap();
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SaplingOfColfenor::SaplingOfColfenorEffect": {
    card: "SaplingOfColfenor",
    effect: "SaplingOfColfenorEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SaplingOfColfenor.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let sourceObject = source.getSourceObject(game);
    if (controller !== null && sourceObject !== null) {
      {
        if (controller.getLibrary().hasCards()) {
          {
            let card = controller.getLibrary().getFromTop();
            if (card !== null) {
              {
                let cards = makeCards(game.xmageScope(), []).add(card);
                controller.revealCards('', cards);
                if (card.isCreature()) {
                  {
                    controller.gainLife(card.getToughness().getValue());
                    controller.loseLife(card.getPower().getValue());
                    return controller.moveCards(cards.getCards(), 'hand');
                  }
                }
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SarkhanTheDragonspeaker::SarkhanTheDragonspeakerEffect": {
    card: "SarkhanTheDragonspeaker",
    effect: "SarkhanTheDragonspeakerEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SarkhanTheDragonspeaker.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "SarkhanTheMad::SarkhanTheMadSacEffect": {
    card: "SarkhanTheMad",
    effect: "SarkhanTheMadSacEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SarkhanTheMad.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargets().getFirstTarget());
    if (permanent !== null) {
      {
        permanent.sacrifice();
        let player = game.getPlayer(permanent.getControllerId());
        if (player !== null) {
          {
            let dragonToken = xmageToken(game.xmageScope(), "Dragon55Token");
            dragonToken.putOntoBattlefield(1, player.getId());
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "SarkhanTheMasterless::SarkhanTheMasterlessDamageEffect": {
    card: "SarkhanTheMasterless",
    effect: "SarkhanTheMasterlessDamageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SarkhanTheMasterless.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let creature = game.getPermanent(source.getTargetPointer().getFirst());
    if (creature === null) {
      {
        return false;
      }
    }
    for (const permanent of game.getBattlefield().getAllActivePermanents(undefined, source.getControllerId())) {
      {
        if (permanent !== null && permanent.hasSubtype("dragon")) {
          {
            creature.damage(1, permanent.getId());
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "SarkhanTheMasterless::SarkhanTheMasterlessBecomeDragonEffect": {
    card: "SarkhanTheMasterless",
    effect: "SarkhanTheMasterlessBecomeDragonEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SarkhanTheMasterless.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "SavageAlliance::SavageAllianceDamageEffect": {
    card: "SavageAlliance",
    effect: "SavageAllianceDamageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SavageAlliance.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getFirstTarget());
    if (player !== null) {
      {
        let filter = StaticFilters.creature();
        filter.add(controlledByPredicate(player.getId()));
        let creatures = game.getBattlefield().getActivePermanents(filter, source.getControllerId());
        for (const creature of creatures) {
          {
            creature.damage(1, source.getSourceId());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SavageSummoning::SavageSummoningAsThoughEffect": {
    card: "SavageSummoning",
    effect: "SavageSummoningAsThoughEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SavageSummoning.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "SavraQueenOfTheGolgari::SavraSacrificeEffect": {
    card: "SavraQueenOfTheGolgari",
    effect: "SavraSacrificeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SavraQueenOfTheGolgari.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let perms = [];
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        for (const playerId of game.getState().getPlayersInRange(controller.getId())) {
          {
            let player = game.getPlayer(playerId);
            if (player !== null && !(playerId === source.getControllerId())) {
              {
                let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creature().add(controlledByPredicate()) }).withNotTarget(true);
                if (target.canChoose(game, player.getId())) {
                  {
                    (target.choose(game, '', player.getId()).length > 0);
                    perms.push(...target.getTargets());
                  }
                }
              }
            }
          }
        }
        for (const permID of perms) {
          {
            let permanent = game.getPermanent(permID);
            if (permanent !== null) {
              {
                permanent.sacrifice();
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SawtoothLoon::SawtoothLoonEffect": {
    card: "SawtoothLoon",
    effect: "SawtoothLoonEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SawtoothLoon.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        controller.drawCards(2);
        let target = makeTarget(game.xmageScope(), { filter: StaticFilters.card(), min: 2, max: 2, zone: "hand" });
        (target.choose(game, '', controller.getId()).length > 0);
        let cardsToLibrary = makeCards(game.xmageScope(), []).addAll(target.getTargets());
        if (!cardsToLibrary.isEmpty()) {
          {
            controller.putCardsOnBottomOfLibrary(cardsToLibrary);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SchemingFence::SchemingFenceManaEffect": {
    card: "SchemingFence",
    effect: "SchemingFenceManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SchemingFence.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ScourTheDesert::ScourTheDesertEffect": {
    card: "ScourTheDesert",
    effect: "ScourTheDesertEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/ScourTheDesert.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let card = game.getCard(source.getFirstTarget());
    if (player === null || card === null) {
      {
        return false;
      }
    }
    let toughness = card.getToughness().getValue();
    player.moveCards(card, 'exile');
    if (toughness > 0) {
      {
        xmageToken(game.xmageScope(), "BirdToken").putOntoBattlefield(toughness, source.getControllerId());
      }
    }
    return true;
      return true;
    },
  },
  "ScourgeOfNelToth::ScourgeOfNelTothPlayEffect": {
    card: "ScourgeOfNelToth",
    effect: "ScourgeOfNelTothPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/ScourgeOfNelToth.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ScoutsWarning::ScoutsWarningAsThoughEffect": {
    card: "ScoutsWarning",
    effect: "ScoutsWarningAsThoughEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/ScoutsWarning.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ScrabblingClaws::ScrabblingClawsEffect": {
    card: "ScrabblingClaws",
    effect: "ScrabblingClawsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/ScrabblingClaws.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPlayer = game.getPlayer(source.getFirstTarget());
    if (targetPlayer === null) {
      {
        return false;
      }
    }
    let filter = StaticFilters.card();
    filter.add(ownedByPredicate(targetPlayer.getId()));
    let target = makeTarget(game.xmageScope(), { filter: filter, zone: "graveyard" });
    if (!(target.choose(game, '', targetPlayer.getId()).length > 0)) {
      {
        return false;
      }
    }
    let card = game.getCard(target.getFirstTarget());
    return card !== null && targetPlayer.moveCards(card, 'exile');
      return true;
    },
  },
  "ScrapMastery::ScrapMasteryEffect": {
    card: "ScrapMastery",
    effect: "ScrapMasteryEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/ScrapMastery.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let exiledCards = new Map();
        for (const playerId of game.getState().getPlayersInRange(controller.getId())) {
          {
            let player = game.getPlayer(playerId);
            if (player !== null) {
              {
                let cards = makeCards(game.xmageScope(), player.getGraveyard().ids()).retain(makeFilter(["artifact", "card"], [cardTypePredicate("artifact")])).getCards();
                controller.moveCards(cards, 'exile');
                exiledCards.set(player.getId(), cards);
              }
            }
          }
        }
        for (const playerId of game.getState().getPlayersInRange(controller.getId())) {
          {
            let player = game.getPlayer(playerId);
            if (player !== null) {
              {
                for (const permanent of game.getBattlefield().getAllActivePermanents(StaticFilters.artifact(), playerId)) {
                  {
                    permanent.sacrifice();
                  }
                }
              }
            }
          }
        }
        for (const playerId of game.getState().getPlayersInRange(controller.getId())) {
          {
            let player = game.getPlayer(playerId);
            if (player !== null) {
              {
                player.moveCards(exiledCards.get(playerId), 'battlefield');
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "ScribNibblers::ScribNibblersEffect": {
    card: "ScribNibblers",
    effect: "ScribNibblersEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/ScribNibblers.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let you = game.getPlayer(source.getControllerId());
    let targetPlayer = game.getPlayer(source.getFirstTarget());
    if (you === null || targetPlayer === null || !targetPlayer.getLibrary().hasCards()) {
      {
        return false;
      }
    }
    let card = targetPlayer.getLibrary().getFromTop();
    if (card === null) {
      {
        return false;
      }
    }
    you.moveCards(card, 'exile');
    if (card.isLand()) {
      {
        you.gainLife(1);
      }
    }
    return true;
      return true;
    },
  },
  "Scrounge::ScroungeEffect": {
    card: "Scrounge",
    effect: "ScroungeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/Scrounge.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let opponent = game.getPlayer(source.getTargetPointer().getFirst());
    if (controller !== null && opponent !== null) {
      {
        let filter = makeFilter(["artifact", "card"], [cardTypePredicate("artifact")]);
        filter.add(ownedByPredicate(opponent.getId()));
        let chosenCard = makeTarget(game.xmageScope(), { filter: filter, zone: "graveyard" });
        chosenCard.withNotTarget(true);
        if (chosenCard.canChoose(game, opponent.getId())) {
          {
            (chosenCard.choose(game, '', opponent.getId()).length > 0);
            let card = game.getCard(chosenCard.getFirstTarget());
            if (card !== null) {
              {
                game.informPlayers('' + opponent.getLogName() + '' + card.getLogName());
                let cardsToMove = makeCards(game.xmageScope(), []);
                cardsToMove.add(card);
                controller.moveCards(cardsToMove, 'battlefield');
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SearchWarrant::SearchWarrantEffect": {
    card: "SearchWarrant",
    effect: "SearchWarrantEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SearchWarrant.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let targetPlayer = game.getPlayer(source.getFirstTarget());
    if (player !== null && targetPlayer !== null) {
      {
        targetPlayer.revealCards('', targetPlayer.getHand());
        let ctd = targetPlayer.getHand().size();
        player.gainLife(ctd);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SeasonedPyromancer::SeasonedPyromancerEffect": {
    card: "SeasonedPyromancer",
    effect: "SeasonedPyromancerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SeasonedPyromancer.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let nonlands = makeCards(game.xmageScope(), player.discard(2).ids()).retain(makeFilter(["card"], [Predicates.not(cardTypePredicate("land"))])).size();
    player.drawCards(2);
    if (nonlands === 0) {
      {
        return true;
      }
    }
    xmageToken(game.xmageScope(), "RedElementalToken").putOntoBattlefield(nonlands, source.getControllerId());
    return true;
      return true;
    },
  },
  "SeedsOfInnocence::SeedsOfInnocenceEffect": {
    card: "SeedsOfInnocence",
    effect: "SeedsOfInnocenceEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SeedsOfInnocence.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        for (const artifact of game.getBattlefield().getActivePermanents(StaticFilters.artifact(), controller.getId())) {
          {
            let artifactController = game.getPlayer(artifact.getControllerId());
            let cmc = artifact.getManaValue();
            if (artifact.destroy(true)) {
              {
                if (artifactController !== null) {
                  {
                    artifactController.gainLife(cmc);
                  }
                }
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SelectiveMemory::SelectiveMemoryEffect": {
    card: "SelectiveMemory",
    effect: "SelectiveMemoryEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SelectiveMemory.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: makeFilter(["card"], [Predicates.not(cardTypePredicate("land"))]), min: 0, max: Number.MAX_SAFE_INTEGER, zone: "library" });
    (player.searchLibrary('', target).length > 0);
    let cards = makeCards(game.xmageScope(), []).addAll(target.getTargets());
    cards.retainZone('library');
    player.moveCards(cards, 'exile');
    player.shuffleLibrary();
    return true;
      return true;
    },
  },
  "SelfDestruct::SelfDestructEffect": {
    card: "SelfDestruct",
    effect: "SelfDestructEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SelfDestruct.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targets = source.getTargetPointer().getTargets();
    if (targets.length < 2) {
      {
        return false;
      }
    }
    let creature = game.getPermanent(targets[0]);
    if (creature === null) {
      {
        return false;
      }
    }
    let power = creature.getPower().getValue();
    if (power < 1) {
      {
        return false;
      }
    }
    let permanent = game.getPermanent(targets[1]);
    if (permanent !== null) {
      {
        permanent.damage(power, creature.getId());
      }
    }
    let player = game.getPlayer(targets[1]);
    if (player !== null) {
      {
        player.damage(power, creature.getId());
      }
    }
    creature.damage(power, creature.getId());
    return true;
      return true;
    },
  },
  "SelflessExorcist::SelflessExorcistEffect": {
    card: "SelflessExorcist",
    effect: "SelflessExorcistEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SelflessExorcist.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let card = game.getCard(source.getFirstTarget());
    if (player === null || card === null) {
      {
        return false;
      }
    }
    player.moveCards(card, 'exile');
    game.processAction();
    let permanent = source.getSourcePermanentIfItStillExists(game);
    if (permanent === null) {
      {
        return true;
      }
    }
    permanent.damage(card.getPower().getValue(), card.getId());
    return true;
      return true;
    },
  },
  "SenTriplets::SenTripletsPlayFromOpponentsHandEffect": {
    card: "SenTriplets",
    effect: "SenTripletsPlayFromOpponentsHandEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SenTriplets.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "SengirNosferatu::ReturnSengirNosferatuEffect": {
    card: "SengirNosferatu",
    effect: "ReturnSengirNosferatuEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SengirNosferatu.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: (StaticFilters.card().add(namePredicate(''))), zone: "exile" });
    target.withNotTarget(true);
    if (!target.canChoose(game, controller.getId())) {
      {
        return false;
      }
    }
    (target.choose(game, '', controller.getId()).length > 0);
    let card = game.getCard(target.getTargets()[0]);
    if (card !== null) {
      {
        return controller.moveCards(card, 'battlefield');
      }
    }
    return false;
      return true;
    },
  },
  "SephirothFabledSOLDIER::SephirothOneWingedAngelSacrificeEffect": {
    card: "SephirothFabledSOLDIER",
    effect: "SephirothOneWingedAngelSacrificeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SephirothFabledSOLDIER.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.anotherCreature().add(controlledByPredicate()), min: 0, max: Number.MAX_SAFE_INTEGER }).withNotTarget(true);
    (target.choose(game, '', player.getId()).length > 0);
    let count = 0;
    for (const targetId of target.getTargets()) {
      {
        let permanent = game.getPermanent(targetId);
        if (permanent !== null && permanent.sacrifice()) {
          {
            count++;
          }
        }
      }
    }
    if (count < 1) {
      {
        return false;
      }
    }
    player.drawCards(count);
    return true;
      return true;
    },
  },
  "SequesteredStash::SequesteredStashEffect": {
    card: "SequesteredStash",
    effect: "SequesteredStashEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SequesteredStash.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: makeFilter(["artifact", "card"], [cardTypePredicate("artifact")]), zone: "graveyard" });
    target.withNotTarget(true);
    if (target.canChoose(game, source.getControllerId()) && controller.chooseUse('') && (target.choose(game, '', controller.getId()).length > 0)) {
      {
        let card = game.getCard(target.getFirstTarget());
        if (card !== null) {
          {
            controller.moveCards(card, 'library');
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "SerendibDjinn::SerendibDjinnEffect": {
    card: "SerendibDjinn",
    effect: "SerendibDjinnEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SerendibDjinn.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let target = makeTarget(game.xmageScope(), { filter: makeFilter(["land", "you", "control"], [controlledByPredicate(), cardTypePredicate("land")]).add(controlledByPredicate()) }).withNotTarget(true);
        if (target.canChoose(game, controller.getId())) {
          {
            (target.choose(game, '', controller.getId()).length > 0);
            let permanent = game.getPermanent(target.getFirstTarget());
            if (permanent !== null) {
              {
                permanent.sacrifice();
                if (permanent.hasSubtype("island")) {
                  {
                    controller.damage(3, source.getSourceId());
                  }
                }
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SerpentsSoulJar::SerpentsSoulJarExileEffect": {
    card: "SerpentsSoulJar",
    effect: "SerpentsSoulJarExileEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SerpentsSoulJar.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let permanent = source.getSourcePermanentIfItStillExists(game);
    let card = game.getCard(source.getTargetPointer().getFirst());
    if (player === null || permanent === null || card === null) {
      {
        return false;
      }
    }
    player.moveCardsToExile(card);
    return true;
      return true;
    },
  },
  "SerpentsSoulJar::SerpentsSoulJarCastFromExileEffect": {
    card: "SerpentsSoulJar",
    effect: "SerpentsSoulJarCastFromExileEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SerpentsSoulJar.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "SerraAscendant::SerraAscendantEffect": {
    card: "SerraAscendant",
    effect: "SerraAscendantEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SerraAscendant.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "SerraParagon::SerraParagonPlayEffect": {
    card: "SerraParagon",
    effect: "SerraParagonPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SerraParagon.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "SeverSoul::GainLifeEqualToToughnessEffect": {
    card: "SeverSoul",
    effect: "GainLifeEqualToToughnessEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SeverSoul.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (permanent !== null) {
      {
        let player = game.getPlayer(source.getControllerId());
        if (player !== null) {
          {
            player.gainLife(permanent.getToughness().getValue());
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "SeverancePriest::SeverancePriestEffect": {
    card: "SeverancePriest",
    effect: "SeverancePriestEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SeverancePriest.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let opponent = game.getPlayer(source.getTargetPointer().getFirst());
    if (controller === null || opponent === null || opponent.getHand().isEmpty()) {
      {
        return false;
      }
    }
    opponent.revealCards('', opponent.getHand());
    let target = makeTarget(game.xmageScope(), { filter: makeFilter(["card"], [Predicates.not(cardTypePredicate("land"))]), min: 0, max: 1, zone: 'hand' });
    (target.choose(game, '', controller.getId(), opponent.getHand().ids()).length > 0);
    let card = game.getCard(target.getFirstTarget());
    return card !== null && controller.moveCardsToExile(card);
      return true;
    },
  },
  "ShackleSlinger::ShackleSlingerEffect": {
    card: "ShackleSlinger",
    effect: "ShackleSlingerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/ShackleSlinger.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent === null) {
      {
        return false;
      }
    }
    if (!permanent.isTapped()) {
      {
        return permanent.tap();
      }
    }
    return permanent.addCounters(CounterType.of("stun").createInstance());
      return true;
    },
  },
  "ShadowOfTheEnemy::ShadowOfTheEnemyCastFromExileEffect": {
    card: "ShadowOfTheEnemy",
    effect: "ShadowOfTheEnemyCastFromExileEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/ShadowOfTheEnemy.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ShadowOfTheEnemy::ShadowOfTheEnemySpendManaEffect": {
    card: "ShadowOfTheEnemy",
    effect: "ShadowOfTheEnemySpendManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/ShadowOfTheEnemy.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ShadowPuppeteers::ShadowPuppeteersContinousEffect": {
    card: "ShadowPuppeteers",
    effect: "ShadowPuppeteersContinousEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/ShadowPuppeteers.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "ShadrixSilverquill::ShadrixSilverquillEffect": {
    card: "ShadrixSilverquill",
    effect: "ShadrixSilverquillEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/ShadrixSilverquill.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    if (game.getPlayer(source.getFirstTarget()) === null) {
      {
        return false;
      }
    }
    for (const permanent of game.getBattlefield().getActivePermanents(StaticFilters.creatureYouControl(), source.getFirstTarget())) {
      {
        if (permanent === null) {
          {
            continue;
          }
        }
        permanent.addCounters(CounterType.of("+1/+1").createInstance());
      }
    }
    return true;
      return true;
    },
  },
  "ShangChiMasterOfKungFu::ShangChiMasterOfKungFuHasteEffect": {
    card: "ShangChiMasterOfKungFu",
    effect: "ShangChiMasterOfKungFuHasteEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/ShangChiMasterOfKungFu.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ShapeAnew::ShapeAnewEffect": {
    card: "ShapeAnew",
    effect: "ShapeAnewEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/ShapeAnew.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPermanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (targetPermanent === null) {
      {
        return false;
      }
    }
    targetPermanent.sacrifice();
    let targetController = game.getPlayer(targetPermanent.getControllerId());
    if (targetController === null) {
      {
        return false;
      }
    }
    let revealed = makeCards(game.xmageScope(), []);
    let artifactCard = null;
    for (const card of targetController.getLibrary().getCards()) {
      {
        revealed.add(card);
        if (card.isArtifact()) {
          {
            artifactCard = card;
            break;
          }
        }
      }
    }
    targetController.revealCards('', revealed);
    if (artifactCard !== null) {
      {
        targetController.moveCards(artifactCard, 'battlefield');
      }
    }
    targetController.shuffleLibrary();
    return true;
      return true;
    },
  },
  "ShardOfTheNightbringer::ShardOfTheNightbringerEffect": {
    card: "ShardOfTheNightbringer",
    effect: "ShardOfTheNightbringerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/ShardOfTheNightbringer.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let opponent = game.getPlayer(source.getTargetPointer().getFirst());
    if (opponent === null) {
      {
        return false;
      }
    }
    let lifeLost = opponent.loseLife(opponent.getLife() / 2 + opponent.getLife() % 2);
    if (lifeLost < 1) {
      {
        return false;
      }
    }
    let controller = game.getPlayer(source.getControllerId());
    return controller === null || controller.gainLife(lifeLost) > 0;
      return true;
    },
  },
  "ShareTheSpoils::ShareTheSpoilsPlayExiledCardEffect": {
    card: "ShareTheSpoils",
    effect: "ShareTheSpoilsPlayExiledCardEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/ShareTheSpoils.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ShareTheSpoils::ShareTheSpoilsSpendAnyManaEffect": {
    card: "ShareTheSpoils",
    effect: "ShareTheSpoilsSpendAnyManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/ShareTheSpoils.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "SharedFate::SharedFatePlayEffect": {
    card: "SharedFate",
    effect: "SharedFatePlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SharedFate.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "SharedFate::SharedFateLookEffect": {
    card: "SharedFate",
    effect: "SharedFateLookEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SharedFate.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "SharkeyTyrantOfTheShire::SharkeyTyrantOfTheShireAsThoughEffect": {
    card: "SharkeyTyrantOfTheShire",
    effect: "SharkeyTyrantOfTheShireAsThoughEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SharkeyTyrantOfTheShire.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ShelobDreadWeaver::ShelobDreadWeaverExileEffect": {
    card: "ShelobDreadWeaver",
    effect: "ShelobDreadWeaverExileEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/ShelobDreadWeaver.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let permanent = source.getSourcePermanentIfItStillExists(game);
    let card = game.getCard(source.getTargetPointer().getFirst());
    if (player === null || permanent === null || card === null) {
      {
        return false;
      }
    }
    player.moveCardsToExile(card);
    return true;
      return true;
    },
  },
  "ShelteringPrayers::ShelteringPrayersEffect": {
    card: "ShelteringPrayers",
    effect: "ShelteringPrayersEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/ShelteringPrayers.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "ShelteringWord::ShelteringWordEffect": {
    card: "ShelteringWord",
    effect: "ShelteringWordEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/ShelteringWord.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getFirstTarget());
    if (player !== null && permanent !== null) {
      {
        let amount = permanent.getToughness().getValue();
        if (amount > 0) {
          {
            player.gainLife(amount);
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "ShoalSerpent::ShoalSerpentEffect": {
    card: "ShoalSerpent",
    effect: "ShoalSerpentEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/ShoalSerpent.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "Shocker::ShockerEffect": {
    card: "Shocker",
    effect: "ShockerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/Shocker.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    if (targetPlayer === null) {
      {
        return false;
      }
    }
    let count = targetPlayer.discardCards(targetPlayer.getHand()).size();
    targetPlayer.drawCards(count);
    return true;
      return true;
    },
  },
  "ShowdownOfTheSkalds::ShowdownOfTheSkaldsMayPlayEffect": {
    card: "ShowdownOfTheSkalds",
    effect: "ShowdownOfTheSkaldsMayPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/ShowdownOfTheSkalds.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "SiegeBehemoth::SiegeBehemothEffect": {
    card: "SiegeBehemoth",
    effect: "SiegeBehemothEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SiegeBehemoth.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "SigardasSummons::SigardasSummonsEffect": {
    card: "SigardasSummons",
    effect: "SigardasSummonsEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SigardasSummons.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "SigurdJarlOfRavensthorpe::SigurdJarlOfRavensthorpeEffect": {
    card: "SigurdJarlOfRavensthorpe",
    effect: "SigurdJarlOfRavensthorpeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SigurdJarlOfRavensthorpe.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (player === null || permanent === null) {
      {
        return false;
      }
    }
    if (player.chooseUse('')) {
      {
        permanent.addCounters(CounterType.of("lore").createInstance());
      }
    } else {
      {
        permanent.removeCounters(CounterType.of("lore").createInstance());
      }
    }
    return true;
      return true;
    },
  },
  "SilasRennSeekerAdept::SilasRennSeekerAdeptPlayEffect": {
    card: "SilasRennSeekerAdept",
    effect: "SilasRennSeekerAdeptPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SilasRennSeekerAdept.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "SilverBolt::SilverBoltEffect": {
    card: "SilverBolt",
    effect: "SilverBoltEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SilverBolt.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    if (permanent.damage(3) > 0 && permanent.hasSubtype("werewolf")) {
      {
        permanent.destroy(false);
      }
    }
    return true;
      return true;
    },
  },
  "Simoon::SimoonEffect": {
    card: "Simoon",
    effect: "SimoonEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/Simoon.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getFirstTarget());
    if (player !== null) {
      {
        let filter = StaticFilters.creature();
        filter.add(controlledByPredicate(player.getId()));
        let creatures = game.getBattlefield().getActivePermanents(filter, source.getControllerId());
        for (const creature of creatures) {
          {
            creature.damage(1, source.getSourceId());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SinProdder::SinProdderEffect": {
    card: "SinProdder",
    effect: "SinProdderEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SinProdder.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let card = controller.getLibrary().getFromTop();
        if (card !== null) {
          {
            controller.revealCards('', makeCards(game.xmageScope(), []).add(card));
            let message = '' + card.getName() + '' + controller.getName() + '';
            let putInGraveyard = false;
            for (const opponentUuid of game.getOpponents(source.getControllerId())) {
              {
                let opponent = game.getPlayer(opponentUuid);
                if (opponent !== null && !putInGraveyard && opponent.chooseUse('')) {
                  {
                    putInGraveyard = true;
                    opponent.damage(card.getManaValue(), source.getSourceId());
                    break;
                  }
                }
              }
            }
            if (putInGraveyard) {
              {
                controller.moveCards(card, 'graveyard');
              }
            } else {
              {
                controller.moveCards(card, 'hand');
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SireOfInsanity::SireOfInsanityEffect": {
    card: "SireOfInsanity",
    effect: "SireOfInsanityEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SireOfInsanity.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let sourcePlayer = game.getPlayer(source.getControllerId());
    if (sourcePlayer === null) {
      {
        return false;
      }
    }
    for (const playerId of game.getState().getPlayersInRange(sourcePlayer.getId())) {
      {
        let player = game.getPlayer(playerId);
        if (player !== null) {
          {
            player.discardCards(player.getHand());
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "SisterHospitaller::SisterHospitallerEffect": {
    card: "SisterHospitaller",
    effect: "SisterHospitallerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SisterHospitaller.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let card = game.getCard(source.getTargetPointer().getFirst());
    if (player === null || card === null) {
      {
        return false;
      }
    }
    let mv = card.getManaValue();
    player.moveCards(card, 'battlefield');
    player.gainLife(mv);
    return true;
      return true;
    },
  },
  "Skred::SkredDamageEffect": {
    card: "Skred",
    effect: "SkredDamageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/Skred.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let amount = game.getBattlefield().count((makeFilter(['permanent','you','control'], [controlledByPredicate()]).add(superTypePredicate("snow"))), source.getControllerId());
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (amount > 0) {
      {
        if (permanent !== null) {
          {
            permanent.damage(amount, source.getSourceId());
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "SkulkingKiller::SkulkingKillerEffect": {
    card: "SkulkingKiller",
    effect: "SkulkingKillerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SkulkingKiller.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null || game.getBattlefield().count(StaticFilters.creatureYouControl(), permanent.getControllerId()) > 1) {
      {
        return false;
      }
    }
    game.addEffect(boostTargetEffect(game.xmageScope(), -2, -2), source);
    return true;
      return true;
    },
  },
  "SkullRaid::SkullRaidEffect": {
    card: "SkullRaid",
    effect: "SkullRaidEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SkullRaid.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let opponent = game.getPlayer(source.getFirstTarget());
    if (opponent === null) {
      {
        return false;
      }
    }
    let discarded = opponent.discard(2).size();
    if (discarded >= 2) {
      {
        return true;
      }
    }
    let player = game.getPlayer(source.getControllerId());
    if (player !== null) {
      {
        player.drawCards(2 - discarded);
      }
    }
    return true;
      return true;
    },
  },
  "Skullcage::SkullcageEffect": {
    card: "Skullcage",
    effect: "SkullcageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/Skullcage.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player !== null) {
      {
        if (player.getHand().size() !== 3 && player.getHand().size() !== 4) {
          {
            player.damage(2, source.getSourceId());
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "SkullknockerOgre::SkullknockerOgreEffect": {
    card: "SkullknockerOgre",
    effect: "SkullknockerOgreEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SkullknockerOgre.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player === null) {
      {
        return false;
      }
    }
    if (player.discard(1).size() > 0) {
      {
        player.drawCards(1);
      }
    }
    return true;
      return true;
    },
  },
  "SkyclavePickAxe::SkyclavePickAxeEffect": {
    card: "SkyclavePickAxe",
    effect: "SkyclavePickAxeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SkyclavePickAxe.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getSourceId());
    if (permanent === null || game.getPermanent(permanent.getAttachedTo()) === null) {
      {
        return false;
      }
    }
    game.addEffect(boostTargetEffect(game.xmageScope(), 2, 2).setTargetPointer(fixedTarget(permanent.getAttachedTo())), source);
    return true;
      return true;
    },
  },
  "SkyclaveShade::SkyclaveShadeEffect": {
    card: "SkyclaveShade",
    effect: "SkyclaveShadeEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SkyclaveShade.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "SludgeMonster::SludgeMonsterEffect": {
    card: "SludgeMonster",
    effect: "SludgeMonsterEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SludgeMonster.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "SludgeStrider::SludgeStriderEffect": {
    card: "SludgeStrider",
    effect: "SludgeStriderEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SludgeStrider.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPlayer = game.getPlayer(source.getFirstTarget());
    let you = game.getPlayer(source.getControllerId());
    if (targetPlayer !== null) {
      {
        targetPlayer.loseLife(1);
      }
    }
    if (you !== null) {
      {
        you.gainLife(1);
      }
    }
    return true;
      return true;
    },
  },
  "SlumberingTora::SlumberingToraEffect": {
    card: "SlumberingTora",
    effect: "SlumberingToraEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SlumberingTora.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "SmashToSmithereens::SmashToSmithereensEffect": {
    card: "SmashToSmithereens",
    effect: "SmashToSmithereensEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SmashToSmithereens.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetArtifact = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (targetArtifact !== null) {
      {
        let controllerOfArtifact = game.getPlayer(targetArtifact.getControllerId());
        targetArtifact.destroy(false);
        if (controllerOfArtifact !== null) {
          {
            controllerOfArtifact.damage(3, source.getSourceId());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SmugglersSurprise::SmugglersSurpriseEffect": {
    card: "SmugglersSurprise",
    effect: "SmugglersSurpriseEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SmugglersSurprise.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creatureCard(), min: 0, max: 2, zone: "hand" });
    if ((target.choose(game, '', controller.getId()).length > 0)) {
      {
        return controller.moveCards(makeCards(game.xmageScope(), []).addAll(target.getTargets()).getCards(), 'battlefield');
      }
    }
    return false;
      return true;
    },
  },
  "SolarBlaze::SolarBlazeEffect": {
    card: "SolarBlaze",
    effect: "SolarBlazeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SolarBlaze.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const permanent of game.getBattlefield().getActivePermanents(StaticFilters.creature(), source.getControllerId())) {
      {
        permanent.damage(permanent.getPower().getValue(), permanent.getId());
      }
    }
    return true;
      return true;
    },
  },
  "SolidarityOfHeroes::SolidarityOfHeroesEffect": {
    card: "SolidarityOfHeroes",
    effect: "SolidarityOfHeroesEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SolidarityOfHeroes.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        for (const targetId of source.getTargetPointer().getTargets()) {
          {
            let permanent = game.getPermanent(targetId);
            if (permanent !== null) {
              {
                let existingCounters = permanent.getCounters().getCount(CounterType.of("+1/+1"));
                if (existingCounters > 0) {
                  {
                    permanent.addCounters(CounterType.of("+1/+1").createInstance(existingCounters));
                  }
                }
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SongOfTheDryads::BecomesColorlessForestLandEffect": {
    card: "SongOfTheDryads",
    effect: "BecomesColorlessForestLandEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SongOfTheDryads.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "SonicAssault::SonicAssaultEffect": {
    card: "SonicAssault",
    effect: "SonicAssaultEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SonicAssault.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let creature = game.getPermanent(source.getFirstTarget());
    if (creature === null) {
      {
        return false;
      }
    }
    creature.tap();
    let player = game.getPlayer(creature.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    player.damage(2, source.getSourceId());
    return true;
      return true;
    },
  },
  "SootImp::SootImpEffect": {
    card: "SootImp",
    effect: "SootImpEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SootImp.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let caster = game.getPlayer(source.getTargetPointer().getFirst());
    if (caster !== null) {
      {
        caster.loseLife(1);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SorinGrimNemesis::SorinGrimNemesisRevealEffect": {
    card: "SorinGrimNemesis",
    effect: "SorinGrimNemesisRevealEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SorinGrimNemesis.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    if (controller.getLibrary().hasCards()) {
      {
        let card = controller.getLibrary().getFromTop();
        if (card !== null) {
          {
            let cards = makeCards(game.xmageScope(), []);
            cards.add(card);
            controller.revealCards('', cards);
            if (controller.moveCards(card, 'hand')) {
              {
                for (const playerId of game.getOpponents(source.getControllerId())) {
                  {
                    if (card.getManaValue() > 0) {
                      {
                        let opponent = game.getPlayer(playerId);
                        if (opponent !== null) {
                          {
                            opponent.loseLife(card.getManaValue());
                          }
                        }
                      }
                    }
                  }
                }
                return true;
              }
            }
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "SorinGrimNemesis::SorinTokenEffect": {
    card: "SorinGrimNemesis",
    effect: "SorinTokenEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SorinGrimNemesis.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let maxLife = 0;
    let playerList = game.getState().getPlayersInRange(source.getControllerId());
    for (const pid of playerList) {
      {
        let p = game.getPlayer(pid);
        if (p !== null) {
          {
            if (maxLife < p.getLife()) {
              {
                maxLife = p.getLife();
              }
            }
          }
        }
      }
    }
    createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), "VampireKnightToken"), maxLife).apply(game, source);
    return true;
      return true;
    },
  },
  "SorinVengefulBloodlord::SorinVengefulBloodlordEffect": {
    card: "SorinVengefulBloodlord",
    effect: "SorinVengefulBloodlordEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SorinVengefulBloodlord.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "SoulPartition::SoulPartitionCastEffect": {
    card: "SoulPartition",
    effect: "SoulPartitionCastEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SoulPartition.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "SoulRansom::SoulRansomEffect": {
    card: "SoulRansom",
    effect: "SoulRansomEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SoulRansom.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = source.getSourcePermanentIfItStillExists(game);
    if (permanent !== null) {
      {
        permanent.sacrifice();
      }
    } else {
      {
        permanent = game.getPermanentOrLKIBattlefield(source.getSourceId());
      }
    }
    if (permanent === null) {
      {
        return false;
      }
    }
    let controller = game.getPlayer(permanent.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    controller.drawCards(2);
    return true;
      return true;
    },
  },
  "SoulSculptor::SoulSculptorEffect": {
    card: "SoulSculptor",
    effect: "SoulSculptorEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SoulSculptor.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "SoulSearch::SoulSearchEffect": {
    card: "SoulSearch",
    effect: "SoulSearchEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SoulSearch.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let opponent = game.getPlayer(source.getTargetPointer().getFirst());
    if (controller === null || opponent === null || opponent.getHand().isEmpty()) {
      {
        return false;
      }
    }
    opponent.revealCards('', opponent.getHand());
    if (makeCards(game.xmageScope(), opponent.getHand().ids()).retain(makeFilter(["card"], [Predicates.not(cardTypePredicate("land"))])).size() < 1) {
      {
        return true;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: makeFilter(["card"], [Predicates.not(cardTypePredicate("land"))]), min: 1, max: 1, zone: 'hand' });
    (target.choose(game, '', controller.getId(), opponent.getHand().ids()).length > 0);
    let card = game.getCard(target.getFirstTarget());
    if (card === null) {
      {
        return false;
      }
    }
    controller.moveCards(card, 'exile');
    if (card.getManaValue() <= 1) {
      {
        xmageToken(game.xmageScope(), "WhiteBlackSpiritToken").putOntoBattlefield(1, source.getControllerId());
      }
    }
    return true;
      return true;
    },
  },
  "SoulfireEruption::SoulfireEruptionCastEffect": {
    card: "SoulfireEruption",
    effect: "SoulfireEruptionCastEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SoulfireEruption.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "Soulquake::SoulquakeEffect": {
    card: "Soulquake",
    effect: "SoulquakeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/Soulquake.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let cardsToHand = [];
    for (const permanent of game.getBattlefield().getActivePermanents(StaticFilters.creature(), source.getControllerId())) {
      {
        cardsToHand.push(permanent);
      }
    }
    for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player !== null) {
          {
            for (const card of makeCards(game.xmageScope(), player.getGraveyard().ids()).retain((StaticFilters.creatureCard())).getCards()) {
              {
                cardsToHand.push(card);
              }
            }
          }
        }
      }
    }
    return controller.moveCards(cardsToHand, 'hand');
      return true;
    },
  },
  "SoulsGrace::SoulsGraceEffect": {
    card: "SoulsGrace",
    effect: "SoulsGraceEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SoulsGrace.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    let player = game.getPlayer(source.getControllerId());
    if (permanent !== null && player !== null) {
      {
        let amount = permanent.getPower().getValue();
        if (amount > 0) {
          {
            player.gainLife(amount);
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "SoulsMajesty::SoulsMajestyEffect": {
    card: "SoulsMajesty",
    effect: "SoulsMajestyEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SoulsMajesty.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let target = game.getPermanent(source.getFirstTarget());
    let player = game.getPlayer(source.getControllerId());
    if (player !== null && target !== null) {
      {
        player.drawCards(target.getPower().getValue());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SoulsMight::SoulsMightEffect": {
    card: "SoulsMight",
    effect: "SoulsMightEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SoulsMight.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent !== null && permanent.getPower().getValue() > 0) {
      {
        permanent.addCounters(CounterType.of("+1/+1").createInstance(permanent.getPower().getValue()));
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SparkOfCreativity::SparkOfCreativityPlayEffect": {
    card: "SparkOfCreativity",
    effect: "SparkOfCreativityPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SparkOfCreativity.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "SparkRupture::SparkRuptureEffect": {
    card: "SparkRupture",
    effect: "SparkRuptureEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SparkRupture.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "SpeakeasyServer::SpeakeasyServerEffect": {
    card: "SpeakeasyServer",
    effect: "SpeakeasyServerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SpeakeasyServer.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controllerId = source.getControllerId();
    let controller = game.getPlayer(controllerId);
    if (controller === null) {
      {
        return false;
      }
    }
    controller.gainLife(game.getBattlefield().count(makeFilter(["another", "creature", "you", "control"], [controlledByPredicate(), cardTypePredicate("creature"), anotherPredicate()]), controllerId));
    return true;
      return true;
    },
  },
  "Spelunking::SpelunkingEffect": {
    card: "Spelunking",
    effect: "SpelunkingEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/Spelunking.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.landCard(), min: 0, max: 1, zone: "hand" });
    (target.choose(game, '', controller.getId()).length > 0);
    let landInHand = game.getCard(target.getFirstTarget());
    if (landInHand === null) {
      {
        return false;
      }
    }
    controller.moveCards(landInHand, 'battlefield');
    if (landInHand.hasSubtype("cave")) {
      {
        controller.gainLife(4);
      }
    }
    return true;
      return true;
    },
  },
  "SphinxBoneWand::SphinxBoneWandEffect": {
    card: "SphinxBoneWand",
    effect: "SphinxBoneWandEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SphinxBoneWand.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let sourcePermanent = game.getPermanent(source.getSourceId());
    if (sourcePermanent !== null) {
      {
        sourcePermanent.addCounters(CounterType.of("charge").createInstance());
        let amount = sourcePermanent.getCounters().getCount(CounterType.of("charge"));
        let permanent = game.getPermanent(source.getFirstTarget());
        if (permanent !== null) {
          {
            permanent.damage(amount, source.getSourceId());
          }
        }
        let player = game.getPlayer(source.getFirstTarget());
        if (player !== null) {
          {
            player.damage(amount, source.getSourceId());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SpikeshotElder::SpikeshotElderEffect": {
    card: "SpikeshotElder",
    effect: "SpikeshotElderEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SpikeshotElder.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let sourcePermanent = game.getPermanent(source.getSourceId());
    if (sourcePermanent === null) {
      {
        sourcePermanent = game.getPermanentOrLKIBattlefield(source.getSourceId());
      }
    }
    if (sourcePermanent === null) {
      {
        return false;
      }
    }
    let damage = sourcePermanent.getPower().getValue();
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent !== null) {
      {
        permanent.damage(damage, sourcePermanent.getId());
        return true;
      }
    }
    let player = game.getPlayer(source.getFirstTarget());
    if (player !== null) {
      {
        player.damage(damage, sourcePermanent.getId());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SpikeshotGoblin::SpikeshotGoblinEffect": {
    card: "SpikeshotGoblin",
    effect: "SpikeshotGoblinEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SpikeshotGoblin.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let sourcePermanent = game.getPermanent(source.getSourceId());
    if (sourcePermanent === null) {
      {
        sourcePermanent = game.getPermanentOrLKIBattlefield(source.getSourceId());
      }
    }
    if (sourcePermanent === null) {
      {
        return false;
      }
    }
    let damage = sourcePermanent.getPower().getValue();
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent !== null) {
      {
        permanent.damage(damage, sourcePermanent.getId());
        return true;
      }
    }
    let player = game.getPlayer(source.getFirstTarget());
    if (player !== null) {
      {
        player.damage(damage, sourcePermanent.getId());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SpinalEmbrace::SpinalEmbraceSacrificeEffect": {
    card: "SpinalEmbrace",
    effect: "SpinalEmbraceSacrificeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SpinalEmbrace.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let affectedTargets = 0;
    for (const permanentId of source.getTargetPointer().getTargets()) {
      {
        let permanent = game.getPermanent(permanentId);
        if (permanent !== null) {
          {
            permanent.sacrifice();
            affectedTargets++;
            let controller = game.getPlayer(source.getControllerId());
            if (controller !== null) {
              {
                controller.gainLife(permanent.getPower().getValue());
              }
            }
          }
        }
      }
    }
    return affectedTargets > 0;
      return true;
    },
  },
  "SpinningWheelKick::SpinningWheelKickEffect": {
    card: "SpinningWheelKick",
    effect: "SpinningWheelKickEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SpinningWheelKick.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let creature = game.getPermanent(source.getFirstTarget());
    if (creature === null) {
      {
        return false;
      }
    }
    for (const targetId of source.getTargetPointer().getTargets()) {
      {
        let permanent = game.getPermanent(targetId);
        if (permanent !== null) {
          {
            permanent.damage(creature.getPower().getValue(), creature.getId());
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "SpiritualFocus::SpiritualFocusDrawCardEffect": {
    card: "SpiritualFocus",
    effect: "SpiritualFocusDrawCardEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SpiritualFocus.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getSourceId());
    let player = game.getPlayer(source.getControllerId());
    if (player !== null && permanent !== null) {
      {
        if (player.chooseUse('')) {
          {
            player.drawCards(1);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SpitefulRepossession::SpitefulRepossessionEffect": {
    card: "SpitefulRepossession",
    effect: "SpitefulRepossessionEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SpitefulRepossession.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controlledLands = game.getBattlefield().count(makeFilter(["land", "you", "control"], [controlledByPredicate(), cardTypePredicate("land")]), source.getControllerId());
    let damageDealt = 0;
    for (const opponentId of game.getOpponents(source.getControllerId())) {
      {
        let lands = game.getBattlefield().count(makeFilter(["land", "you", "control"], [controlledByPredicate(), cardTypePredicate("land")]), opponentId);
        if (lands <= controlledLands) {
          {
            continue;
          }
        }
        let opponent = game.getPlayer(opponentId);
        if (opponent !== null) {
          {
            damageDealt += opponent.damage(lands - controlledLands);
          }
        }
      }
    }
    if (damageDealt > 0) {
      {
        xmageToken(game.xmageScope(), "TreasureToken").putOntoBattlefield(damageDealt, source.getControllerId());
      }
    }
    return true;
      return true;
    },
  },
  "SplinterAndLeoFatherAndSon::SplinterAndLeoFatherAndSonEffect": {
    card: "SplinterAndLeoFatherAndSon",
    effect: "SplinterAndLeoFatherAndSonEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SplinterAndLeoFatherAndSon.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player === null) {
      {
        return false;
      }
    }
    for (const permanent of game.getBattlefield().getAllActivePermanents(undefined, player.getId())) {
      {
        if (permanent.isCreature() && !(permanent.getId() === source.getSourceId())) {
          {
            permanent.addCounters(CounterType.of("+1/+1").createInstance());
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "SplitTheParty::SplitThePartyEffect": {
    card: "SplitTheParty",
    effect: "SplitThePartyEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SplitTheParty.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let targetPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    if (controller === null || targetPlayer === null) {
      {
        return false;
      }
    }
    let numCreatures = game.getBattlefield().countAll(StaticFilters.creature(), targetPlayer.getId());
    if (numCreatures > 0) {
      {
        let halfCreatures = (numCreatures / 2) + (numCreatures % 2);
        let filter = StaticFilters.creature();
        filter.add(controlledByPredicate(targetPlayer.getId()));
        let target = makeTarget(game.xmageScope(), { filter: filter, min: halfCreatures, max: halfCreatures }).withNotTarget(true);
        if ((target.choose(game, '', controller.getId()).length > 0)) {
          {
            let cardsToHand = [];
            for (const creatureId of target.getTargets()) {
              {
                let card = game.getPermanent(creatureId);
                if (card !== null) {
                  {
                    cardsToHand.push(card);
                  }
                }
              }
            }
            controller.moveCards(cardsToHand, 'hand');
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "SquallGunbladeDuelist::SquallGunbladeDuelistDamageEffect": {
    card: "SquallGunbladeDuelist",
    effect: "SquallGunbladeDuelistDamageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SquallGunbladeDuelist.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    let permanent = game.getPermanentOrLKIBattlefield(source.getSourceId());
    return player !== null && permanent !== null && player.damage(permanent.getPower().getValue(), permanent.getId()) > 0;
      return true;
    },
  },
  "SqueeDubiousMonarch::SqueeDubiousMonarchEffect": {
    card: "SqueeDubiousMonarch",
    effect: "SqueeDubiousMonarchEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SqueeDubiousMonarch.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "SqueeTheImmortal::SqueePlayEffect": {
    card: "SqueeTheImmortal",
    effect: "SqueePlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SqueeTheImmortal.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "StaffOfTheAges::StaffOfTheAgesEffect": {
    card: "StaffOfTheAges",
    effect: "StaffOfTheAgesEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/StaffOfTheAges.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "StalkingYeti::StalkingYetiEffect": {
    card: "StalkingYeti",
    effect: "StalkingYetiEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/StalkingYeti.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let thisCreature = game.getPermanent(source.getSourceId());
    let thatCreature = game.getPermanent(source.getFirstTarget());
    if (thisCreature === null || thatCreature === null) {
      {
        return false;
      }
    }
    thatCreature.damage(thisCreature.getPower().getValue(), thisCreature.getId());
    game.processAction();
    thisCreature.damage(thatCreature.getPower().getValue(), thatCreature.getId());
    return true;
      return true;
    },
  },
  "Starfall::StarfallEffect": {
    card: "Starfall",
    effect: "StarfallEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/Starfall.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent !== null) {
      {
        permanent.damage(3, source.getSourceId());
        if (permanent.isEnchantment()) {
          {
            let targetController = game.getPlayer(permanent.getControllerId());
            if (targetController !== null) {
              {
                targetController.damage(3, source.getSourceId());
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "StarfieldOfNyx::StarfieldOfNyxEffect": {
    card: "StarfieldOfNyx",
    effect: "StarfieldOfNyxEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/StarfieldOfNyx.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "StealTheShow::StealTheShowEffect": {
    card: "StealTheShow",
    effect: "StealTheShowEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/StealTheShow.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player === null) {
      {
        return false;
      }
    }
    let discarded = player.discard(0, Number.MAX_SAFE_INTEGER).size();
    player.drawCards(discarded);
    return true;
      return true;
    },
  },
  "SteelSquirrel::SteelSquirrelEffect": {
    card: "SteelSquirrel",
    effect: "SteelSquirrelEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SteelSquirrel.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getSourceId());
    let amount = Number(game.getState().getValue("rolled"));
    if (controller !== null && permanent !== null && amount !== null) {
      {
        game.addEffect(boostSourceEffect(game.xmageScope(), amount, amount, "EndOfTurn"), source);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SternJudge::SternJudgeEffect": {
    card: "SternJudge",
    effect: "SternJudgeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SternJudge.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player === null) {
          {
            continue;
          }
        }
        player.loseLife(game.getBattlefield().countAll((makeFilter(['permanent','you','control'], [controlledByPredicate()])), player.getId()));
      }
    }
    return true;
      return true;
    },
  },
  "StoneIdolTrap::StoneIdolTrapEffect": {
    card: "StoneIdolTrap",
    effect: "StoneIdolTrapEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/StoneIdolTrap.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let effect = createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), "StoneIdolToken"));
    if (effect.apply(game, source)) {
      {
        effect.removeTokensCreatedAt(game, source);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "StormOfSouls::StormOfSoulsChangeCreatureEffect": {
    card: "StormOfSouls",
    effect: "StormOfSoulsChangeCreatureEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/StormOfSouls.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "StormWorld::StormWorldEffect": {
    card: "StormWorld",
    effect: "StormWorldEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/StormWorld.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player !== null) {
      {
        let damage = 4 - player.getHand().size();
        if (damage > 0) {
          {
            player.damage(damage, source.getSourceId());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "StormbreathDragon::StormbreathDragonDamageEffect": {
    card: "StormbreathDragon",
    effect: "StormbreathDragonDamageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/StormbreathDragon.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const opponentId of game.getOpponents(source.getControllerId())) {
      {
        let opponent = game.getPlayer(opponentId);
        if (opponent !== null) {
          {
            let damage = opponent.getHand().size();
            if (damage > 0) {
              {
                opponent.damage(damage, source.getSourceId());
              }
            }
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "StreetSavvy::StreetSavvyEffect": {
    card: "StreetSavvy",
    effect: "StreetSavvyEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/StreetSavvy.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "StrongholdDiscipline::StrongholdDisciplineEffect": {
    card: "StrongholdDiscipline",
    effect: "StrongholdDisciplineEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/StrongholdDiscipline.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        for (const playerId of game.getState().getPlayersInRange(controller.getId())) {
          {
            let count = game.getBattlefield().getAllActivePermanents(StaticFilters.creature(), playerId).length;
            if (count > 0) {
              {
                let player = game.getPlayer(playerId);
                if (player !== null) {
                  {
                    player.loseLife(count);
                  }
                }
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SuddenReclamation::SuddenReclamationEffect": {
    card: "SuddenReclamation",
    effect: "SuddenReclamationEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SuddenReclamation.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let cardsToHand = makeCards(game.xmageScope(), []);
        let target = makeTarget(game.xmageScope(), { filter: makeFilter(["creature", "card"], [cardTypePredicate("creature")]), zone: "graveyard" });
        target.withNotTarget(true);
        if (target.canChoose(game, controller.getId()) && (target.choose(game, '', controller.getId()).length > 0)) {
          {
            let card = game.getCard(target.getFirstTarget());
            if (card !== null) {
              {
                cardsToHand.add(card);
              }
            }
          }
        }
        target = makeTarget(game.xmageScope(), { filter: StaticFilters.landCard(), zone: "graveyard" });
        target.withNotTarget(true);
        if (target.canChoose(game, controller.getId()) && (target.choose(game, '', controller.getId()).length > 0)) {
          {
            let card = game.getCard(target.getFirstTarget());
            if (card !== null) {
              {
                cardsToHand.add(card);
              }
            }
          }
        }
        controller.moveCards(cardsToHand, 'hand');
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SuddenSpoiling::SuddenSpoilingEffect": {
    card: "SuddenSpoiling",
    effect: "SuddenSpoilingEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SuddenSpoiling.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "SugarCoat::SugarCoatEffect": {
    card: "SugarCoat",
    effect: "SugarCoatEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SugarCoat.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "SunClasp::SunClaspReturnEffect": {
    card: "SunClasp",
    effect: "SunClaspReturnEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SunClasp.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getSourceId());
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null && permanent !== null && permanent.getAttachedTo() !== null) {
      {
        let enchantedCreature = game.getPermanent(permanent.getAttachedTo());
        if (enchantedCreature !== null) {
          {
            controller.moveCards(enchantedCreature, 'hand');
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SunglassesOfUrza::SunglassesOfUrzaManaAsThoughtEffect": {
    card: "SunglassesOfUrza",
    effect: "SunglassesOfUrzaManaAsThoughtEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SunglassesOfUrza.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "SunscourgeChampion::SunscourgeChampionEffect": {
    card: "SunscourgeChampion",
    effect: "SunscourgeChampionEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SunscourgeChampion.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = source.getSourcePermanentIfItStillExists(game);
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null && permanent !== null) {
      {
        controller.gainLife(permanent.getPower().getValue());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SupportMission::SupportMissionEffect": {
    card: "SupportMission",
    effect: "SupportMissionEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SupportMission.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    let sourcePermanent = game.getPermanent(source.getSourceId());
    if (permanent !== null && sourcePermanent !== null) {
      {
        let questCounters = sourcePermanent.getCounters().getCount(CounterType.of("quest"));
        let countersToAdd = (questCounters >= 5 ? 2 : 1);
        permanent.addCounters(CounterType.of("+1/+1").createInstance(countersToAdd));
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "SurvivalCache::SurvivalCacheEffect": {
    card: "SurvivalCache",
    effect: "SurvivalCacheEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SurvivalCache.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let sourcePlayer = game.getPlayer(source.getControllerId());
    if (sourcePlayer !== null) {
      {
        let haveMoreLife = false;
        for (const id of game.getOpponents(source.getControllerId())) {
          {
            let opponent = game.getPlayer(id);
            if (opponent !== null && opponent.getLife() < sourcePlayer.getLife()) {
              {
                haveMoreLife = true;
                break;
              }
            }
          }
        }
        if (haveMoreLife) {
          sourcePlayer.drawCards(1);
        }
      }
    }
    return false;
      return true;
    },
  },
  "SwiftReconfiguration::SwiftReconfigurationEffect": {
    card: "SwiftReconfiguration",
    effect: "SwiftReconfigurationEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SwiftReconfiguration.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "SwordOfLightAndShadow::SwordOfLightAndShadowEffect": {
    card: "SwordOfLightAndShadow",
    effect: "SwordOfLightAndShadowEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SwordOfLightAndShadow.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let card = game.getCard(source.getTargetPointer().getFirst());
    return controller !== null && card !== null && controller.moveCards(card, 'hand');
      return true;
    },
  },
  "SwordOfTheParuns::MayTapOrUntapAttachedEffect": {
    card: "SwordOfTheParuns",
    effect: "MayTapOrUntapAttachedEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SwordOfTheParuns.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let equipment = game.getPermanent(source.getSourceId());
    if (equipment === null) {
      {
        equipment = game.getPermanentOrLKIBattlefield(source.getSourceId());
      }
    }
    if (equipment !== null && equipment.getAttachedTo() !== null) {
      {
        let equipedCreature = game.getPermanent(equipment.getAttachedTo());
        let player = game.getPlayer(source.getControllerId());
        if (equipedCreature !== null && player !== null) {
          {
            if (equipedCreature.isTapped()) {
              {
                if (player.chooseUse('')) {
                  {
                    equipedCreature.untap();
                  }
                }
              }
            } else {
              {
                if (player.chooseUse('')) {
                  {
                    equipedCreature.tap();
                  }
                }
              }
            }
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "SwordOfWarAndPeace::SwordOfWarAndPeaceDamageEffect": {
    card: "SwordOfWarAndPeace",
    effect: "SwordOfWarAndPeaceDamageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SwordOfWarAndPeace.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    if (targetPlayer !== null) {
      {
        targetPlayer.damage(targetPlayer.getHand().size(), source.getSourceId());
      }
    }
    return true;
      return true;
    },
  },
  "SydriGalvanicGenius::SydriGalvanicGeniusEffect": {
    card: "SydriGalvanicGenius",
    effect: "SydriGalvanicGeniusEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/s/SydriGalvanicGenius.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "SynapseSliver::SynapseSliverEffect": {
    card: "SynapseSliver",
    effect: "SynapseSliverEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SynapseSliver.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    return player !== null && player.chooseUse('') && player.drawCards(1) > 0;
      return true;
    },
  },
  "SyphonFlesh::SyphonFleshEffect": {
    card: "SyphonFlesh",
    effect: "SyphonFleshEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/s/SyphonFlesh.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let perms = [];
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        for (const playerId of game.getState().getPlayersInRange(controller.getId())) {
          {
            let player = game.getPlayer(playerId);
            if (player !== null && !(playerId === source.getControllerId())) {
              {
                let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creature().add(controlledByPredicate()) }).withNotTarget(true);
                if (target.canChoose(game, player.getId())) {
                  {
                    (target.choose(game, '', player.getId()).length > 0);
                    perms.push(...target.getTargets());
                  }
                }
              }
            }
          }
        }
        for (const permID of perms) {
          {
            let permanent = game.getPermanent(permID);
            if (permanent !== null) {
              {
                permanent.sacrifice();
              }
            }
          }
        }
        let sacrificedAmount = ((perms.length === 0) ? 0 : perms.length);
        if (sacrificedAmount > 0) {
          {
            let token = xmageToken(game.xmageScope(), "ZombieToken");
            token.putOntoBattlefield(sacrificedAmount, source.getControllerId());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "TIEInterceptor::TIEInterceptorEffect": {
    card: "TIEInterceptor",
    effect: "TIEInterceptorEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TIEInterceptor.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const opponentId of game.getOpponents(source.getControllerId())) {
      {
        let opponent = game.getPlayer(opponentId);
        if (opponent !== null) {
          {
            opponent.loseLife(2);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "TaboraxHopesDemise::TaboraxHopesDemiseEffect": {
    card: "TaboraxHopesDemise",
    effect: "TaboraxHopesDemiseEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TaboraxHopesDemise.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (permanent === null || !permanent.hasSubtype("cleric")) {
      {
        return false;
      }
    }
    let player = game.getPlayer(source.getControllerId());
    if (player !== null && player.chooseUse('') && player.drawCards(1) > 0) {
      {
        player.loseLife(1);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "TakenumaBleeder::TakenumaBleederEffect": {
    card: "TakenumaBleeder",
    effect: "TakenumaBleederEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TakenumaBleeder.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        if (game.getBattlefield().countAll(StaticFilters.creature(), source.getControllerId()) < 1) {
          {
            controller.loseLife(1);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "Takklemaggot::TakklemaggotNonAuraEffect": {
    card: "Takklemaggot",
    effect: "TakklemaggotNonAuraEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/Takklemaggot.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "TalusPaladin::TalusPaladinEffect": {
    card: "TalusPaladin",
    effect: "TalusPaladinEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TalusPaladin.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let taluspPaladin = game.getPermanent(source.getSourceId());
    if (taluspPaladin !== null && player !== null) {
      {
        let question = '';
        if (!player.chooseUse('')) {
          {
            return false;
          }
        }
        taluspPaladin.addCounters(CounterType.of("+1/+1").createInstance());
      }
    }
    return false;
      return true;
    },
  },
  "TangletroveKelp::TangletroveKelpEffect": {
    card: "TangletroveKelp",
    effect: "TangletroveKelpEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/TangletroveKelp.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "TargNarDemonFangGnoll::TargNarDemonFangGnollEffect": {
    card: "TargNarDemonFangGnoll",
    effect: "TargNarDemonFangGnollEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TargNarDemonFangGnoll.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = source.getSourcePermanentIfItStillExists(game);
    if (permanent === null) {
      {
        return false;
      }
    }
    game.addEffect(boostSourceEffect(game.xmageScope(), permanent.getPower().getValue(), permanent.getToughness().getValue(), "EndOfTurn"), source);
    return true;
      return true;
    },
  },
  "TarriansJournal::TheTombOfAclazotzEffect": {
    card: "TarriansJournal",
    effect: "TheTombOfAclazotzEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/TarriansJournal.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "TashaTheWitchQueen::TashaTheWitchQueenExileEffect": {
    card: "TashaTheWitchQueen",
    effect: "TashaTheWitchQueenExileEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TashaTheWitchQueen.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let cards = makeCards(game.xmageScope(), []).addAll(source.getTargetPointer().getTargets());
    player.moveCards(cards, 'exile');
    cards.retainZone('exile');
    for (const card of cards.getCards()) {
      {
        card.addCounters(CounterType.of("page").createInstance());
      }
    }
    return true;
      return true;
    },
  },
  "TashasHideousLaughter::TashasHideousLaughterEffect": {
    card: "TashasHideousLaughter",
    effect: "TashasHideousLaughterEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TashasHideousLaughter.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let cards = makeCards(game.xmageScope(), []);
    for (const playerId of game.getOpponents(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player === null) {
          {
            continue;
          }
        }
        let totalMV = 0;
        for (const card of player.getLibrary().getCards()) {
          {
            cards.add(card);
            totalMV += card.getManaValue();
            if (totalMV >= 20) {
              {
                break;
              }
            }
          }
        }
      }
    }
    return controller.moveCards(cards, 'exile');
      return true;
    },
  },
  "TeferiMasterOfTime::TeferiMasterOfTimeActivationEffect": {
    card: "TeferiMasterOfTime",
    effect: "TeferiMasterOfTimeActivationEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/TeferiMasterOfTime.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "TeferiTemporalPilgrim::TeferiTemporalPilgrimEffect": {
    card: "TeferiTemporalPilgrim",
    effect: "TeferiTemporalPilgrimEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TeferiTemporalPilgrim.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let opponent = game.getPlayer(source.getFirstTarget());
    if (opponent === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: makeFilter(['permanent','you','control'], [controlledByPredicate()]) });
    target.withNotTarget(true);
    (target.choose(game, '', opponent.getId()).length > 0);
    let toHand = game.getPermanent(target.getFirstTarget());
    if (toHand !== null) {
      {
        opponent.moveCards(toHand, 'hand');
        game.processAction();
      }
    }
    let toLibrary = [...game.getBattlefield().getAllActivePermanents(makeFilter(["permanent"], [Predicates.not(cardTypePredicate("land"))]), opponent.getId())];
    if ((toLibrary.length === 0)) {
      {
        return true;
      }
    }
    let ownerIds = [];
    for (const permanent of toLibrary) {
      {
        ownerIds.push(permanent.getOwnerId());
      }
    }
    opponent.moveCards(toLibrary, 'library');
    for (const ownerId of ownerIds) {
      {
        let owner = game.getPlayer(ownerId);
        if (owner !== null) {
          {
            owner.shuffleLibrary();
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "TeferisPuzzleBox::TeferisPuzzleBoxEffect": {
    card: "TeferisPuzzleBox",
    effect: "TeferisPuzzleBoxEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TeferisPuzzleBox.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player !== null) {
      {
        let count = player.getHand().size();
        player.putCardsOnBottomOfLibrary(player.getHand());
        player.drawCards(count);
      }
    }
    return true;
      return true;
    },
  },
  "TeleminPerformance::TeleminPerformanceEffect": {
    card: "TeleminPerformance",
    effect: "TeleminPerformanceEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TeleminPerformance.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let opponent = game.getPlayer(source.getTargetPointer().getFirst());
        if (opponent !== null) {
          {
            let creature = null;
            let nonCreatures = makeCards(game.xmageScope(), []);
            let reveal = makeCards(game.xmageScope(), []);
            for (const card of opponent.getLibrary().getCards()) {
              {
                reveal.add(card);
                if (card.isCreature()) {
                  {
                    creature = card;
                    break;
                  }
                } else {
                  {
                    nonCreatures.add(card);
                  }
                }
              }
            }
            opponent.revealCards('', reveal);
            opponent.moveCards(nonCreatures, 'graveyard');
            if (creature !== null) {
              {
                game.processAction();
                controller.moveCards(creature, 'battlefield');
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "TemporalAperture::TemporalApertureTopCardCastEffect": {
    card: "TemporalAperture",
    effect: "TemporalApertureTopCardCastEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/TemporalAperture.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "TemptWithBunnies::TemptWithBunniesEffect": {
    card: "TemptWithBunnies",
    effect: "TemptWithBunniesEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TemptWithBunnies.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        controller.drawCards(1);
        let tokenCopy = xmageToken(game.xmageScope(), "RabbitToken");
        tokenCopy.putOntoBattlefield(1, source.getControllerId(), false);
        let opponentsAddedTokens = 0;
        for (const playerId of game.getOpponents(controller.getId())) {
          {
            let opponent = game.getPlayer(playerId);
            if (opponent !== null) {
              {
                if (opponent.chooseUse('')) {
                  {
                    opponent.drawCards(1);
                    opponentsAddedTokens++;
                    tokenCopy.putOntoBattlefield(1, playerId, false);
                  }
                }
              }
            }
          }
        }
        if (opponentsAddedTokens > 0) {
          {
            controller.drawCards(opponentsAddedTokens);
            tokenCopy.putOntoBattlefield(opponentsAddedTokens, source.getControllerId(), false);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "TemptingContract::TemptingContractEffect": {
    card: "TemptingContract",
    effect: "TemptingContractEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TemptingContract.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let counter = 0;
    for (const playerId of game.getOpponents(source.getControllerId())) {
      {
        let opponent = game.getPlayer(playerId);
        if (opponent !== null && opponent.chooseUse('') && xmageToken(game.xmageScope(), "TreasureToken").putOntoBattlefield(1, opponent.getId())) {
          {
            counter++;
          }
        }
      }
    }
    if (counter > 0) {
      {
        xmageToken(game.xmageScope(), "TreasureToken").putOntoBattlefield(counter, source.getControllerId());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "TenaciousUnderdog::TenaciousUnderdogEffect": {
    card: "TenaciousUnderdog",
    effect: "TenaciousUnderdogEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/TenaciousUnderdog.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "TenthDistrictHero::TenthDistrictHeroEffect": {
    card: "TenthDistrictHero",
    effect: "TenthDistrictHeroEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/TenthDistrictHero.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "TerashisGrasp::TerashisGraspEffect": {
    card: "TerashisGrasp",
    effect: "TerashisGraspEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TerashisGrasp.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPermanent = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (targetPermanent !== null) {
      {
        let cost = targetPermanent.getManaValue();
        let player = game.getPlayer(source.getControllerId());
        if (player !== null) {
          {
            player.gainLife(cost);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "TergridGodOfFright::TergridGodOfFrightEffect": {
    card: "TergridGodOfFright",
    effect: "TergridGodOfFrightEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TergridGodOfFright.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let card = game.getCard(source.getTargetPointer().getFirst());
        if (card !== null) {
          {
            controller.moveCards(card, 'battlefield');
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "TerminalVelocity::TerminalVelocityDamageEffect": {
    card: "TerminalVelocity",
    effect: "TerminalVelocityDamageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TerminalVelocity.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getSourceId());
    if (permanent === null || permanent.getManaValue() < 1) {
      {
        return false;
      }
    }
    for (const creature of game.getBattlefield().getActivePermanents(StaticFilters.creature(), source.getControllerId())) {
      {
        creature.damage(permanent.getManaValue(), permanent.getId());
      }
    }
    return true;
      return true;
    },
  },
  "Terminus::TerminusEffect": {
    card: "Terminus",
    effect: "TerminusEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/Terminus.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player !== null) {
          {
            let filter = StaticFilters.creature();
            filter.add(ownedByPredicate(player.getId()));
            let toLib = makeCards(game.xmageScope(), []);
            for (const permanent of game.getBattlefield().getActivePermanents(filter, source.getControllerId())) {
              {
                toLib.add(permanent);
              }
            }
            player.putCardsOnBottomOfLibrary(toLib);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "TerritorialBruntar::TerritorialBruntarAsThoughEffect": {
    card: "TerritorialBruntar",
    effect: "TerritorialBruntarAsThoughEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/TerritorialBruntar.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "TezzeretBetrayerOfFlesh::TezzeretBetrayerOfFleshTypeEffect": {
    card: "TezzeretBetrayerOfFlesh",
    effect: "TezzeretBetrayerOfFleshTypeEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/TezzeretBetrayerOfFlesh.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "TezzeretMasterOfTheBridge::TezzeretMasterOfTheBridgeEffect2": {
    card: "TezzeretMasterOfTheBridge",
    effect: "TezzeretMasterOfTheBridgeEffect2",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TezzeretMasterOfTheBridge.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let cards = makeCards(game.xmageScope(), []).addAll(player.getLibrary().getTopCards(10));
    player.moveCards(cards, 'exile');
    let cards2 = makeCards(game.xmageScope(), []);
    for (const card of cards.getCards()) {
      {
        if (card.isArtifact()) {
          {
            cards2.add(card);
          }
        }
      }
    }
    return player.moveCards(cards2, 'battlefield');
      return true;
    },
  },
  "TezzeretTheSeeker::TezzeretTheSeekerEffect3": {
    card: "TezzeretTheSeeker",
    effect: "TezzeretTheSeekerEffect3",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/TezzeretTheSeeker.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "TheAntiquitiesWar::TheAntiquitiesWarEffect": {
    card: "TheAntiquitiesWar",
    effect: "TheAntiquitiesWarEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/TheAntiquitiesWar.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "TheBearsOfLittjara::TheBearsOfLittjaraEffect": {
    card: "TheBearsOfLittjara",
    effect: "TheBearsOfLittjaraEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TheBearsOfLittjara.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    for (const creature of game.getBattlefield().getActivePermanents(StaticFilters.creatureYouControl(), source.getControllerId())) {
      {
        if (creature === null) {
          {
            continue;
          }
        }
        let power = creature.getPower().getValue();
        if (power >= 4) {
          {
            permanent.damage(power, creature.getId());
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "TheBlackArrow::TheBlackArrowEffect": {
    card: "TheBlackArrow",
    effect: "TheBlackArrowEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TheBlackArrow.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent !== null) {
      {
        let dealtDamage = permanent.damage(1, source.getSourceId()) > 0;
        if (dealtDamage && permanent.hasSubtype("dragon")) {
          {
            permanent.destroy(false);
          }
        }
        return true;
      }
    }
    let player = game.getPlayer(source.getFirstTarget());
    if (player !== null) {
      {
        player.damage(1, source.getSourceId());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "TheBlackstaffOfWaterdeep::TheBlackstaffOfWaterdeepEffect": {
    card: "TheBlackstaffOfWaterdeep",
    effect: "TheBlackstaffOfWaterdeepEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/TheBlackstaffOfWaterdeep.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "TheCelestus::TheCelestusLootEffect": {
    card: "TheCelestus",
    effect: "TheCelestusLootEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TheCelestus.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    player.gainLife(1);
    if (player.chooseUse('')) {
      {
        player.drawCards(1);
        player.discard(1);
      }
    }
    return true;
      return true;
    },
  },
  "TheChainVeil::TheChainVeilIncreaseLoyaltyUseEffect": {
    card: "TheChainVeil",
    effect: "TheChainVeilIncreaseLoyaltyUseEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/TheChainVeil.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "TheFourteenthDoctor::TheFourteenthDoctorRevealEffect": {
    card: "TheFourteenthDoctor",
    effect: "TheFourteenthDoctorRevealEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TheFourteenthDoctor.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let cards = makeCards(game.xmageScope(), []).addAll(player.getLibrary().getTopCards(14));
    player.revealCards('', cards);
    let toGrave = makeCards(game.xmageScope(), []).addAll(makeCards(game.xmageScope(), cards.ids()).retain((StaticFilters.card().add(subTypePredicate("doctor")))).getCards());
    player.moveCards(toGrave, 'graveyard');
    cards.retainZone('library');
    player.putCardsOnBottomOfLibrary(cards);
    return true;
      return true;
    },
  },
  "TheHorusHeresy::TheHorusHeresyDestroyEffect": {
    card: "TheHorusHeresy",
    effect: "TheHorusHeresyDestroyEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TheHorusHeresy.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    if (game.getBattlefield().count(StaticFilters.creature(), source.getControllerId()) < 1) {
      {
        return false;
      }
    }
    let permanents = [];
    for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player === null) {
          {
            continue;
          }
        }
        let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creature() });
        target.withNotTarget(true);
        (target.choose(game, '', player.getId()).length > 0);
        let permanent = game.getPermanent(target.getFirstTarget());
        if (permanent !== null) {
          {
            permanents.push(permanent);
            game.informPlayers(player.getLogName() + '' + permanent.getLogName());
          }
        }
      }
    }
    for (const permanent of permanents) {
      {
        permanent.destroy();
      }
    }
    return true;
      return true;
    },
  },
  "TheIndomitable::TheIndomitableCastEffect": {
    card: "TheIndomitable",
    effect: "TheIndomitableCastEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/TheIndomitable.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "TheIrencrag::TheIrencragBecomesContinuousEffect": {
    card: "TheIrencrag",
    effect: "TheIrencragBecomesContinuousEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/TheIrencrag.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "TheMasterTranscendent::TheMasterTranscendentContinuousEffect": {
    card: "TheMasterTranscendent",
    effect: "TheMasterTranscendentContinuousEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/TheMasterTranscendent.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "TheMistyMountainsCold::TheMistyMountainsColdEffect": {
    card: "TheMistyMountainsCold",
    effect: "TheMistyMountainsColdEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TheMistyMountainsCold.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), "TreasureToken")).apply(game, source);
    if (game.getBattlefield().count((makeFilter(['permanent','you','control'], [controlledByPredicate()])), source.getControllerId()) < 4) {
      {
        return true;
      }
    }
    let permanent = source.getSourcePermanentIfItStillExists(game);
    if (permanent !== null && permanent.sacrifice()) {
      {
        createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), "Dragon66Token")).apply(game, source);
      }
    }
    return true;
      return true;
    },
  },
  "TheSkullsporeNexus::TheSkullsporeNexusDoubleEffect": {
    card: "TheSkullsporeNexus",
    effect: "TheSkullsporeNexusDoubleEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TheSkullsporeNexus.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    let boost = boostTargetEffect(game.xmageScope(), permanent.getPower().getValue(), 0, "EndOfTurn").setTargetPointer(fixedTarget(permanent));
    game.addEffect(boost, source);
    return true;
      return true;
    },
  },
  "TheTemporalAnchor::TheTemporalAnchorPlayEffect": {
    card: "TheTemporalAnchor",
    effect: "TheTemporalAnchorPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/TheTemporalAnchor.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "TheWanderingEmperor::TheWanderingEmperorEffect": {
    card: "TheWanderingEmperor",
    effect: "TheWanderingEmperorEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/TheWanderingEmperor.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "TheaterOfHorrors::TheaterOfHorrorsCastEffect": {
    card: "TheaterOfHorrors",
    effect: "TheaterOfHorrorsCastEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/TheaterOfHorrors.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ThelonsChant::ThelonsChantEffect": {
    card: "ThelonsChant",
    effect: "ThelonsChantEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/ThelonsChant.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    let sourcePermanent = game.getPermanentOrLKIBattlefield(source.getSourceId());
    if (player !== null && sourcePermanent !== null) {
      {
        let paid = false;
        let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creatureYouControl() });
        target.withNotTarget(true);
        if (player.chooseUse('') && (target.choose(game, '', player.getId()).length > 0)) {
          {
            let permanent = game.getPermanent(target.getFirstTarget());
            if (permanent !== null) {
              {
                permanent.addCounters(CounterType.of("-1/-1").createInstance());
                paid = true;
              }
            }
          }
        }
        if (!paid) {
          {
            player.damage(3, source.getSourceId());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "ThickSkinnedGoblin::ThickSkinnedGoblinCostModificationEffect": {
    card: "ThickSkinnedGoblin",
    effect: "ThickSkinnedGoblinCostModificationEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/ThickSkinnedGoblin.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ThornbowArcher::ThornbowArcherEffect": {
    card: "ThornbowArcher",
    effect: "ThornbowArcherEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/ThornbowArcher.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        for (const opponentId of game.getOpponents(controller.getId())) {
          {
            let opponent = game.getPlayer(opponentId);
            if (opponent !== null) {
              {
                if (game.getBattlefield().countAll((StaticFilters.creature().add(subTypePredicate("elf"))), opponentId) === 0) {
                  {
                    opponent.loseLife(1);
                  }
                }
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "ThoughtGorger::ThoughtGorgerEffectEnters": {
    card: "ThoughtGorger",
    effect: "ThoughtGorgerEffectEnters",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/ThoughtGorger.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let thoughtGorger = game.getPermanent(source.getSourceId());
    if (player === null || player.getHand().isEmpty() || thoughtGorger === null || !thoughtGorger.addCounters(CounterType.of("+1/+1").createInstance(player.getHand().size()))) {
      {
        return false;
      }
    }
    player.discardCards(player.getHand());
    return true;
      return true;
    },
  },
  "ThoughtLash::ThoughtLashExileLibraryEffect": {
    card: "ThoughtLash",
    effect: "ThoughtLashExileLibraryEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/ThoughtLash.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let cards = makeCards(game.xmageScope(), []).addAll(controller.getLibrary().getTopCards(controller.getLibrary().size()));
        controller.moveCards(cards, 'exile');
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "ThoughtPrison::ThoughtPrisonDamageEffect": {
    card: "ThoughtPrison",
    effect: "ThoughtPrisonDamageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/ThoughtPrison.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    if (targetPlayer !== null) {
      {
        targetPlayer.damage(2, source.getSourceId());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "ThoughtweftGambit::ThoughtweftGambitEffect": {
    card: "ThoughtweftGambit",
    effect: "ThoughtweftGambitEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/ThoughtweftGambit.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let passed = false;
    let opponents = game.getOpponents(source.getControllerId());
    let controller = game.getPlayer(source.getControllerId());
    if (opponents !== null) {
      {
        for (const creature of game.getBattlefield().getActivePermanents((StaticFilters.creature()), source.getControllerId())) {
          {
            if (opponents.includes(creature.getControllerId())) {
              {
                creature.tap();
              }
            }
          }
        }
        passed = true;
      }
    }
    if (controller !== null) {
      {
        for (const creature of game.getBattlefield().getActivePermanents((StaticFilters.creature()), source.getControllerId())) {
          {
            if ((controller.getId() === creature.getControllerId())) {
              {
                creature.untap();
              }
            }
          }
        }
        passed = true;
      }
    }
    return passed;
      return true;
    },
  },
  "ThousandYearElixir::ThousandYearElixirEffect": {
    card: "ThousandYearElixir",
    effect: "ThousandYearElixirEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/ThousandYearElixir.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ThrakkusTheButcher::ThrakkusTheButcherEffect": {
    card: "ThrakkusTheButcher",
    effect: "ThrakkusTheButcherEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/ThrakkusTheButcher.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const permanent of game.getBattlefield().getActivePermanents((StaticFilters.creatureYouControl()), source.getControllerId())) {
      {
        if (permanent.getPower().getValue() !== 0) {
          {
            game.addEffect(boostTargetEffect(game.xmageScope(), permanent.getPower().getValue(), 0).setTargetPointer(fixedTarget(permanent)), source);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "ThrashingMudspawn::ThrashingMudspawnEffect": {
    card: "ThrashingMudspawn",
    effect: "ThrashingMudspawnEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/ThrashingMudspawn.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let amount = Number(game.getState().getValue("damage"));
    let player = game.getPlayer(source.getControllerId());
    if (amount === null || amount < 1 || player === null) {
      {
        return false;
      }
    }
    player.loseLife(amount);
    return true;
      return true;
    },
  },
  "ThreeWishes::ThreeWishesLookAtCardEffect": {
    card: "ThreeWishes",
    effect: "ThreeWishesLookAtCardEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/ThreeWishes.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ThreeWishes::ThreeWishesPlayFromExileEffect": {
    card: "ThreeWishes",
    effect: "ThreeWishesPlayFromExileEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/ThreeWishes.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ThroneOfEmpires::ThroneOfEmpiresEffect": {
    card: "ThroneOfEmpires",
    effect: "ThroneOfEmpiresEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/ThroneOfEmpires.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let scepter = false;
    let crown = false;
    for (const permanent of game.getBattlefield().getAllActivePermanents(undefined, source.getControllerId())) {
      {
        if ((permanent.getName() === '')) {
          {
            scepter = true;
          }
        } else {
          if ((permanent.getName() === '')) {
            {
              crown = true;
            }
          }
        }
        if (scepter && crown) {
          break;
        }
      }
    }
    let soldier = xmageToken(game.xmageScope(), "SoldierToken");
    let count = (scepter && crown ? 5 : 1);
    soldier.putOntoBattlefield(count, source.getControllerId());
    return false;
      return true;
    },
  },
  "Thunderheads::ThunderheadsEffect": {
    card: "Thunderheads",
    effect: "ThunderheadsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/Thunderheads.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let effect = createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), "WeirdToken"));
    if (effect.apply(game, source)) {
      {
        effect.exileTokensCreatedAtNextEndStep(game, source);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "Thunderwave::ThunderwaveEffect": {
    card: "Thunderwave",
    effect: "ThunderwaveEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/Thunderwave.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creatureYouControl(), min: 0, max: 1 });
    target.withNotTarget(true);
    (target.choose(game, '', player.getId()).length > 0);
    for (const permanent of game.getBattlefield().getActivePermanents(StaticFilters.creature(), source.getControllerId())) {
      {
        if (!(permanent.getId() === target.getFirstTarget())) {
          {
            permanent.damage(3);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "TimelineCuller::TimelineCullerEffect": {
    card: "TimelineCuller",
    effect: "TimelineCullerEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/TimelineCuller.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "TimelyReinforcements::TimelyReinforcementsEffect": {
    card: "TimelyReinforcements",
    effect: "TimelyReinforcementsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TimelyReinforcements.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let lessCreatures = false;
        let lessLife = false;
        let filter = StaticFilters.creature();
        let count = game.getBattlefield().countAll(filter, controller.getId());
        for (const uuid of game.getOpponents(controller.getId())) {
          {
            let opponent = game.getPlayer(uuid);
            if (opponent !== null) {
              {
                if (opponent.getLife() > controller.getLife()) {
                  {
                    lessLife = true;
                  }
                }
                if (game.getBattlefield().countAll(filter, uuid) > count) {
                  {
                    lessCreatures = true;
                  }
                }
              }
            }
            if (lessLife && lessCreatures) {
              {
                break;
              }
            }
          }
        }
        if (lessLife) {
          {
            controller.gainLife(6);
          }
        }
        if (lessCreatures) {
          {
            let effect = createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), "SoldierToken"), 3);
            effect.apply(game, source);
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "TinybonesBaubleBurglar::TinybonesBaubleBurglarPlayEffect": {
    card: "TinybonesBaubleBurglar",
    effect: "TinybonesBaubleBurglarPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/TinybonesBaubleBurglar.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "TinybonesBaubleBurglar::TinybonesBaubleBurglarSpendAnyManaEffect": {
    card: "TinybonesBaubleBurglar",
    effect: "TinybonesBaubleBurglarSpendAnyManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/TinybonesBaubleBurglar.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "TinybonesTrinketThief::TinybonesTrinketThiefEffect": {
    card: "TinybonesTrinketThief",
    effect: "TinybonesTrinketThiefEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TinybonesTrinketThief.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const playerId of game.getOpponents(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player !== null && player.getHand().isEmpty()) {
          {
            player.loseLife(10);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "TirelessProvisioner::TirelessProvisionerEffect": {
    card: "TirelessProvisioner",
    effect: "TirelessProvisionerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TirelessProvisioner.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let token = (player.chooseUse('') ? xmageToken(game.xmageScope(), "FoodToken") : xmageToken(game.xmageScope(), "TreasureToken"));
    return token.putOntoBattlefield(1, source.getControllerId());
      return true;
    },
  },
  "TitanOfIndustry::TitanOfIndustryEffect": {
    card: "TitanOfIndustry",
    effect: "TitanOfIndustryEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TitanOfIndustry.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null || game.getBattlefield().count(StaticFilters.creatureYouControl(), source.getControllerId()) < 1) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creatureYouControl() });
    target.withNotTarget(true);
    (target.choose(game, '', player.getId()).length > 0);
    let permanent = game.getPermanent(target.getFirstTarget());
    return permanent !== null && permanent.addCounters(CounterType.of("shield").createInstance());
      return true;
    },
  },
  "TitaniasCommand::TitaniasCommandEffect": {
    card: "TitaniasCommand",
    effect: "TitaniasCommandEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TitaniasCommand.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (controller === null || player === null) {
      {
        return false;
      }
    }
    let cards = makeCards(game.xmageScope(), []).addAll(player.getGraveyard());
    if (cards.isEmpty()) {
      {
        return false;
      }
    }
    controller.moveCards(cards, 'exile');
    cards.retainZone('exile');
    controller.gainLife(cards.size());
    return true;
      return true;
    },
  },
  "TitaniasSong::TitaniasSongEffect": {
    card: "TitaniasSong",
    effect: "TitaniasSongEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/TitaniasSong.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "TlincalliHunter::TlincalliHunterAddAltCostEffect": {
    card: "TlincalliHunter",
    effect: "TlincalliHunterAddAltCostEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/TlincalliHunter.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "TomBombadil::TomBombadilEffect": {
    card: "TomBombadil",
    effect: "TomBombadilEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TomBombadil.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let toReveal = makeCards(game.xmageScope(), []);
    let toBattlefield = null;
    for (const card of controller.getLibrary().getCards()) {
      {
        toReveal.add(card);
        if (card.hasSubtype("saga")) {
          {
            toBattlefield = card;
            break;
          }
        }
      }
    }
    controller.revealCards('', toReveal);
    if (toBattlefield !== null) {
      {
        controller.moveCards(toBattlefield, 'battlefield');
        toReveal.retainZone('library');
      }
    }
    controller.putCardsOnBottomOfLibrary(toReveal);
    return true;
      return true;
    },
  },
  "ToothAndNail::ToothAndNailPutCreatureOnBattlefieldEffect": {
    card: "ToothAndNail",
    effect: "ToothAndNailPutCreatureOnBattlefieldEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/ToothAndNail.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creatureCard(), min: 0, max: 2, zone: "hand" });
    if ((target.choose(game, '', controller.getId()).length > 0)) {
      {
        return controller.moveCards(makeCards(game.xmageScope(), []).addAll(target.getTargets()).getCards(), 'battlefield');
      }
    }
    return false;
      return true;
    },
  },
  "TortureChamber::TortureChamberEffect1": {
    card: "TortureChamber",
    effect: "TortureChamberEffect1",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TortureChamber.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getSourceId());
    if (player !== null && permanent !== null) {
      {
        let painCounters = permanent.getCounters().getCount(CounterType.of("pain"));
        player.damage(painCounters, source.getSourceId());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "TourachsChant::TourachsChantEffect": {
    card: "TourachsChant",
    effect: "TourachsChantEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TourachsChant.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    let sourcePermanent = game.getPermanentOrLKIBattlefield(source.getSourceId());
    if (player !== null && sourcePermanent !== null) {
      {
        let paid = false;
        let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creatureYouControl() });
        target.withNotTarget(true);
        if (player.chooseUse('') && (target.choose(game, '', player.getId()).length > 0)) {
          {
            let permanent = game.getPermanent(target.getFirstTarget());
            if (permanent !== null) {
              {
                permanent.addCounters(CounterType.of("-1/-1").createInstance());
                paid = true;
              }
            }
          }
        }
        if (!paid) {
          {
            player.damage(3, source.getSourceId());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "Toymaker::ToymakerEffect": {
    card: "Toymaker",
    effect: "ToymakerEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/Toymaker.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "TrackDown::TrackDownEffect": {
    card: "TrackDown",
    effect: "TrackDownEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TrackDown.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let sourceObject = game.getObject(source.getSourceId());
    if (sourceObject === null || controller === null) {
      {
        return false;
      }
    }
    if (!controller.getLibrary().hasCards()) {
      {
        return false;
      }
    }
    let card = controller.getLibrary().getFromTop();
    if (card === null) {
      {
        return false;
      }
    }
    let cards = makeCards(game.xmageScope(), []);
    cards.add(card);
    controller.revealCards('', cards);
    if (card.isLand() || card.isCreature()) {
      {
        controller.drawCards(1);
      }
    }
    return true;
      return true;
    },
  },
  "TraitorsRoar::TraitorsRoarEffect": {
    card: "TraitorsRoar",
    effect: "TraitorsRoarEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TraitorsRoar.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let applied = false;
    let targetCreature = game.getPermanent(source.getTargetPointer().getFirst());
    if (targetCreature !== null) {
      {
        applied = targetCreature.tap();
        let controller = game.getPlayer(targetCreature.getControllerId());
        if (controller !== null) {
          {
            controller.damage(targetCreature.getPower().getValue(), targetCreature.getId());
            applied = true;
          }
        }
      }
    }
    return applied;
      return true;
    },
  },
  "TrapfindersTrick::TrapfindersTrickEffect": {
    card: "TrapfindersTrick",
    effect: "TrapfindersTrickEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TrapfindersTrick.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getFirstTarget());
    if (player === null) {
      {
        return false;
      }
    }
    player.revealCards('', player.getHand());
    player.discardCards(makeCards(game.xmageScope(), []).addAll(makeCards(game.xmageScope(), player.getHand().ids()).retain((StaticFilters.card().add(subTypePredicate("trap")))).getCards()));
    return true;
      return true;
    },
  },
  "TreacherousTerrain::TreacherousTerrainEffect": {
    card: "TreacherousTerrain",
    effect: "TreacherousTerrainEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TreacherousTerrain.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanents = game.getBattlefield().getActivePermanents(StaticFilters.land(), source.getControllerId());
    for (const playerId of game.getOpponents(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player !== null) {
          {
            let amount = 0;
            for (const permanent of permanents) {
              {
                if (permanent.isControlledBy(playerId)) {
                  {
                    amount++;
                  }
                }
              }
            }
            if (amount > 0) {
              {
                player.damage(amount, source.getSourceId());
              }
            }
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "TreasureHunt::TreasureHuntEffect": {
    card: "TreasureHunt",
    effect: "TreasureHuntEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TreasureHunt.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null && controller.getLibrary().hasCards()) {
      {
        let cards = makeCards(game.xmageScope(), []);
        for (const card of controller.getLibrary().getCards()) {
          {
            cards.add(card);
            if (!card.isLand()) {
              {
                break;
              }
            }
          }
        }
        controller.revealCards('', cards);
        controller.moveCards(cards, 'hand');
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "TrenzaloreClocktower::TrenzaloreClocktowerEffect": {
    card: "TrenzaloreClocktower",
    effect: "TrenzaloreClocktowerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TrenzaloreClocktower.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let cards = makeCards(game.xmageScope(), []).addAll(player.getGraveyard());
    cards.addAll(player.getHand());
    player.putCardsOnTopOfLibrary(cards);
    player.shuffleLibrary();
    return true;
      return true;
    },
  },
  "TrespassersCurse::TrespassersCurseEffect": {
    card: "TrespassersCurse",
    effect: "TrespassersCurseEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TrespassersCurse.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controllerOfCreature = game.getPlayer(source.getTargetPointer().getFirst());
    let controller = game.getPlayer(source.getControllerId());
    if (controllerOfCreature !== null && controller !== null) {
      {
        controllerOfCreature.loseLife(1);
        controller.gainLife(1);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "TributeToHunger::TributeToHungerEffect": {
    card: "TributeToHunger",
    effect: "TributeToHungerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TributeToHunger.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let opponent = game.getPlayer(source.getTargets().getFirstTarget());
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null && opponent !== null) {
      {
        let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creature().add(controlledByPredicate()) }).withNotTarget(true);
        if (target.canChoose(game, opponent.getId())) {
          {
            (target.choose(game, '', opponent.getId()).length > 0);
            let permanent = game.getPermanent(target.getFirstTarget());
            if (permanent !== null) {
              {
                permanent.sacrifice();
                controller.gainLife(permanent.getToughness().getValue());
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "TrystansCommand::TrystansCommandUntapEffect": {
    card: "TrystansCommand",
    effect: "TrystansCommandUntapEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TrystansCommand.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    if (targetPlayer !== null) {
      {
        for (const permanent of game.getBattlefield().getAllActivePermanents(StaticFilters.creature(), targetPlayer.getId())) {
          {
            permanent.untap();
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "TuktukScrapper::TuktukScrapperEffect": {
    card: "TuktukScrapper",
    effect: "TuktukScrapperEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TuktukScrapper.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetArtifact = game.getPermanent(source.getTargetPointer().getFirst());
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null && targetArtifact !== null) {
      {
        targetArtifact.destroy(false);
        let targetController = game.getPlayer(targetArtifact.getControllerId());
        if (targetController !== null && game.getState().getZone(targetArtifact.getId()) === 'graveyard') {
          {
            let alliesControlled = game.getBattlefield().count((makeFilter(['permanent','you','control'], [controlledByPredicate()]).add(subTypePredicate("ally"))), source.getControllerId());
            if (alliesControlled > 0) {
              {
                targetController.damage(alliesControlled, source.getSourceId());
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "TwoHandedAxe::TwoHandedAxeEffect": {
    card: "TwoHandedAxe",
    effect: "TwoHandedAxeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/TwoHandedAxe.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent === null || permanent.getPower().getValue() === 0) {
      {
        return false;
      }
    }
    game.addEffect(boostTargetEffect(game.xmageScope(), permanent.getPower().getValue(), 0).setTargetPointer(fixedTarget(permanent)), source);
    return true;
      return true;
    },
  },
  "Typhoon::TyphoonEffect": {
    card: "Typhoon",
    effect: "TyphoonEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/t/Typhoon.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
      {
        if (!(playerId === source.getControllerId())) {
          {
            let player = game.getPlayer(playerId);
            if (player !== null) {
              {
                let amount = 0;
                for (const permanent of game.getBattlefield().getAllActivePermanents((makeFilter('permanent').add(subTypePredicate("island"))), playerId)) {
                  {
                    amount++;
                  }
                }
                if (amount > 0) {
                  {
                    player.damage(amount, source.getSourceId());
                  }
                }
              }
            }
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "TyvarJubilantBrawler::TyvarJubilantBrawlerHasteEffect": {
    card: "TyvarJubilantBrawler",
    effect: "TyvarJubilantBrawlerHasteEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/t/TyvarJubilantBrawler.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "UbaMask::UbaMaskPlayEffect": {
    card: "UbaMask",
    effect: "UbaMaskPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/u/UbaMask.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "UginTheIneffable::UginTheIneffableLookAtFaceDownEffect": {
    card: "UginTheIneffable",
    effect: "UginTheIneffableLookAtFaceDownEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/u/UginTheIneffable.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "UkkimaStalkingShadow::UkkimaStalkingShadowEffect": {
    card: "UkkimaStalkingShadow",
    effect: "UkkimaStalkingShadowEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/u/UkkimaStalkingShadow.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanentOrLKIBattlefield(source.getSourceId());
    if (permanent === null || permanent.getPower().getValue() <= 0) {
      {
        return false;
      }
    }
    let player = game.getPlayer(source.getFirstTarget());
    if (player !== null) {
      {
        player.damage(permanent.getPower().getValue(), source.getSourceId());
      }
    }
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        controller.gainLife(permanent.getPower().getValue());
      }
    }
    return true;
      return true;
    },
  },
  "UlamogTheCeaselessHunger::UlamogExileLibraryEffect": {
    card: "UlamogTheCeaselessHunger",
    effect: "UlamogExileLibraryEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/u/UlamogTheCeaselessHunger.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let defender = game.getPlayer(source.getTargetPointer().getFirst());
    if (defender !== null) {
      {
        defender.moveCards(defender.getLibrary().getTopCards(20), 'exile');
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "UlamogTheDefiler::UlamogTheDefilerTargetEffect": {
    card: "UlamogTheDefiler",
    effect: "UlamogTheDefilerTargetEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/u/UlamogTheDefiler.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let opponent = game.getPlayer(source.getFirstTarget());
    if (opponent === null) {
      {
        return false;
      }
    }
    let toExile = (opponent.getLibrary().size() + 1) / 2;
    let cards = opponent.getLibrary().getTopCards(toExile);
    if ((cards.length === 0)) {
      {
        return false;
      }
    }
    opponent.moveCardsToExile(cards);
    return true;
      return true;
    },
  },
  "UltimaOriginOfOblivion::UltimaOriginOfOblivionEffect": {
    card: "UltimaOriginOfOblivion",
    effect: "UltimaOriginOfOblivionEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/u/UltimaOriginOfOblivion.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "Umbilicus::BloodClockEffect": {
    card: "Umbilicus",
    effect: "BloodClockEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/u/Umbilicus.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player === null) {
      {
        return false;
      }
    }
    if (player.getLife() > 2 && player.chooseUse('')) {
      {
        player.loseLife(2);
        game.informPlayers(player.getLogName() + '');
        return true;
      }
    } else {
      {
        let target = makeTarget(game.xmageScope(), { filter: makeFilter(['permanent','you','control'], [controlledByPredicate()]) });
        if (target.canChoose(game, player.getId()) && (target.choose(game, '', player.getId()).length > 0)) {
          {
            let permanent = game.getPermanent(target.getFirstTarget());
            if (permanent !== null) {
              {
                game.informPlayers(player.getLogName() + '' + permanent.getName() + '');
                return player.moveCards(permanent, 'hand');
              }
            }
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "UmbrisFearManifest::UmbrisFearManifestEffect": {
    card: "UmbrisFearManifest",
    effect: "UmbrisFearManifestEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/u/UmbrisFearManifest.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getFirstTarget());
    if (player === null) {
      {
        return false;
      }
    }
    for (const card of player.getLibrary().getCards()) {
      {
        player.moveCards(card, 'exile');
        if (card.isLand()) {
          {
            break;
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "UnbenderTine::UnbenderTineEffect": {
    card: "UnbenderTine",
    effect: "UnbenderTineEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/u/UnbenderTine.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetPermanent = game.getPermanent(source.getFirstTarget());
    if (targetPermanent === null) {
      {
        return false;
      }
    }
    return targetPermanent.untap();
      return true;
    },
  },
  "UnctusGrandMetatect::UnctusGrandMetatectEffect": {
    card: "UnctusGrandMetatect",
    effect: "UnctusGrandMetatectEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/u/UnctusGrandMetatect.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "UndeadSprinter::UndeadSprinterEffect": {
    card: "UndeadSprinter",
    effect: "UndeadSprinterEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/u/UndeadSprinter.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "UndercityInformer::UndercityInformerEffect": {
    card: "UndercityInformer",
    effect: "UndercityInformerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/u/UndercityInformer.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player === null) {
      {
        return false;
      }
    }
    let cards = makeCards(game.xmageScope(), []);
    for (const card of player.getLibrary().getCards()) {
      {
        cards.add(card);
        if (card.isLand()) {
          {
            break;
          }
        }
      }
    }
    player.revealCards('', cards);
    player.moveCards(cards, 'graveyard');
    return true;
      return true;
    },
  },
  "Undertow::UndertowEffect": {
    card: "Undertow",
    effect: "UndertowEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/u/Undertow.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "Unforge::UnforgeEffect": {
    card: "Unforge",
    effect: "UnforgeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/u/Unforge.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let equipment = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (equipment !== null) {
      {
        let creature = game.getPermanent(equipment.getAttachedTo());
        if (creature !== null) {
          {
            creature.damage(2, source.getSourceId());
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "UnifiedStrike::UnifiedStrikeEffect": {
    card: "UnifiedStrike",
    effect: "UnifiedStrikeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/u/UnifiedStrike.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let creature = game.getPermanent(source.getFirstTarget());
    let player = game.getPlayer(source.getControllerId());
    if (creature === null || player === null) {
      {
        return false;
      }
    }
    let soldierCount = game.getBattlefield().getActivePermanents((makeFilter('permanent').add(subTypePredicate("soldier"))), source.getControllerId()).length;
    let successful = creature.getPower().getValue() <= soldierCount;
    if (successful) {
      {
        player.moveCards(creature, 'exile');
      }
    }
    return successful;
      return true;
    },
  },
  "UnleashFury::UnleashFuryEffect": {
    card: "UnleashFury",
    effect: "UnleashFuryEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/u/UnleashFury.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    game.addEffect(boostTargetEffect(game.xmageScope(), permanent.getPower().getValue(), 0, "EndOfTurn"), source);
    return true;
      return true;
    },
  },
  "UnluckyWitness::UnluckyWitnessPlayEffect": {
    card: "UnluckyWitness",
    effect: "UnluckyWitnessPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/u/UnluckyWitness.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "UnnaturalGrowth::UnnaturalGrowthEffect": {
    card: "UnnaturalGrowth",
    effect: "UnnaturalGrowthEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/u/UnnaturalGrowth.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const permanent of game.getBattlefield().getAllActivePermanents((StaticFilters.creatureYouControl()), source.getControllerId())) {
      {
        let effect = boostTargetEffect(game.xmageScope(), permanent.getPower().getValue(), permanent.getToughness().getValue());
        effect.setTargetPointer(fixedTarget(permanent));
        game.addEffect(effect, source);
      }
    }
    return true;
      return true;
    },
  },
  "UnquenchableFury::UnquenchableFuryEffect": {
    card: "UnquenchableFury",
    effect: "UnquenchableFuryEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/u/UnquenchableFury.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    return player !== null && !player.getHand().isEmpty() && player.damage(player.getHand().size()) > 0;
      return true;
    },
  },
  "UnwindingClock::UnwindingClockEffect": {
    card: "UnwindingClock",
    effect: "UnwindingClockEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/u/UnwindingClock.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "Upwelling::UpwellingRuleEffect": {
    card: "Upwelling",
    effect: "UpwellingRuleEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/u/Upwelling.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "UrDrago::UrDragoEffect": {
    card: "UrDrago",
    effect: "UrDragoEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/u/UrDrago.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "Urabrask::TheGreatWorkEffect": {
    card: "Urabrask",
    effect: "TheGreatWorkEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/u/Urabrask.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player === null) {
      {
        return false;
      }
    }
    player.damage(3);
    for (const permanent of game.getBattlefield().getActivePermanents(StaticFilters.creatureYouControl(), player.getId())) {
      {
        permanent.damage(3);
      }
    }
    return true;
      return true;
    },
  },
  "Urabrask::TheGreatWorkCastFromGraveyardEffect": {
    card: "Urabrask",
    effect: "TheGreatWorkCastFromGraveyardEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/u/Urabrask.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "UrbanBurgeoning::UrbanBurgeoningUntapEffect": {
    card: "UrbanBurgeoning",
    effect: "UrbanBurgeoningUntapEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/u/UrbanBurgeoning.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "UriangerAugurelt::UriangerAugureltPlayEffect": {
    card: "UriangerAugurelt",
    effect: "UriangerAugureltPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/u/UriangerAugurelt.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ValgavothTerrorEater::ValgavothTerrorEaterPlayEffect": {
    card: "ValgavothTerrorEater",
    effect: "ValgavothTerrorEaterPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/v/ValgavothTerrorEater.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ValkiGodOfLies::ExileTargetArtifactOrCreatureEffect": {
    card: "ValkiGodOfLies",
    effect: "ExileTargetArtifactOrCreatureEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/v/ValkiGodOfLies.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let Tibalt = source.getSourceObject(game);
    let exileId = CardUtil.getExileZoneId(source.getSourceId());
    if (controller !== null && Tibalt !== null) {
      {
        let targetCreatureOrArtifact = game.getPermanent(source.getTargets().getFirstTarget());
        if (targetCreatureOrArtifact !== null) {
          {
            controller.moveCardsToExile(targetCreatureOrArtifact);
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "ValkyriesCall::ValkyriesCallContinuousEffect": {
    card: "ValkyriesCall",
    effect: "ValkyriesCallContinuousEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/v/ValkyriesCall.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "VanguardsShield::VanguardsShieldEffect": {
    card: "VanguardsShield",
    effect: "VanguardsShieldEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/v/VanguardsShield.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "VeiledSentry::VeiledSentryEffect": {
    card: "VeiledSentry",
    effect: "VeiledSentryEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/v/VeiledSentry.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "Vendetta::VendettaEffect": {
    card: "Vendetta",
    effect: "VendettaEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/v/Vendetta.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    let target = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (player !== null && target !== null) {
      {
        player.loseLife(target.getToughness().getValue());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "VentureForth::VentureForthEffect": {
    card: "VentureForth",
    effect: "VentureForthEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/v/VentureForth.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let cards = makeCards(game.xmageScope(), []);
    for (const card of player.getLibrary().getCards()) {
      {
        player.moveCards(card, 'exile');
        if (card.isLand()) {
          {
            player.moveCards(card, 'battlefield');
            break;
          }
        }
        cards.add(card);
      }
    }
    player.putCardsOnBottomOfLibrary(cards);
    return true;
      return true;
    },
  },
  "VexingDevil::VexingDevilEffect": {
    card: "VexingDevil",
    effect: "VexingDevilEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/v/VexingDevil.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let permanent = game.getPermanent(source.getSourceId());
    if (controller !== null && permanent !== null) {
      {
        for (const opponentUuid of game.getOpponents(source.getControllerId())) {
          {
            let opponent = game.getPlayer(opponentUuid);
            if (opponent !== null && opponent.chooseUse('')) {
              {
                game.informPlayers(opponent.getLogName() + '' + permanent.getLogName());
                opponent.damage(4, permanent.getId());
                permanent.sacrifice();
                return true;
              }
            }
          }
        }
        game.informPlayers('' + permanent.getLogName() + '');
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "ViashinoHeretic::ViashinoHereticEffect": {
    card: "ViashinoHeretic",
    effect: "ViashinoHereticEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/v/ViashinoHeretic.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent !== null) {
      {
        let couvertedManaCost = permanent.getManaValue();
        let player = game.getPlayer(permanent.getControllerId());
        permanent.destroy(false);
        if (player !== null) {
          {
            player.damage(couvertedManaCost, source.getSourceId());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "VillainousWrath::VillainousWrathEffect": {
    card: "VillainousWrath",
    effect: "VillainousWrathEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/v/VillainousWrath.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player === null) {
      {
        return false;
      }
    }
    let amount = game.getBattlefield().count(StaticFilters.creatureYouControl(), player.getId());
    return amount > 0 && player.loseLife(amount) > 0;
      return true;
    },
  },
  "Viseling::ViselingEffect": {
    card: "Viseling",
    effect: "ViselingEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/v/Viseling.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let opponent = game.getPlayer(source.getTargetPointer().getFirst());
    if (opponent !== null) {
      {
        let xValue = opponent.getHand().size() - 4;
        if (xValue > 0) {
          {
            opponent.damage(xValue, source.getSourceId());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "VisionsOfBrutality::VisionsOfBrutalityEffect": {
    card: "VisionsOfBrutality",
    effect: "VisionsOfBrutalityEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/v/VisionsOfBrutality.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    let enchantment = game.getPermanentOrLKIBattlefield(source.getSourceId());
    if (controller === null || enchantment === null || enchantment.getAttachedTo() === null) {
      {
        return false;
      }
    }
    let enchanted = game.getPermanentOrLKIBattlefield(enchantment.getAttachedTo());
    if (enchanted !== null) {
      {
        let controllerEnchanted = game.getPlayer(enchanted.getControllerId());
        if (controllerEnchanted !== null) {
          {
            let damage = Number(game.getState().getValue("damage"));
            if (damage > 0) {
              {
                controllerEnchanted.loseLife(damage);
              }
            }
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "VisionsOfRuin::VisionsOfRuinEffect": {
    card: "VisionsOfRuin",
    effect: "VisionsOfRuinEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/v/VisionsOfRuin.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanents = [];
    for (const playerId of game.getOpponents(source.getControllerId())) {
      {
        let opponent = game.getPlayer(playerId);
        if (opponent === null || game.getBattlefield().count(makeFilter(["artifact", "you", "control"], [controlledByPredicate(), cardTypePredicate("artifact")]), playerId) < 1) {
          {
            continue;
          }
        }
        let target = makeTarget(game.xmageScope(), { filter: makeFilter(["artifact", "you", "control"], [controlledByPredicate(), cardTypePredicate("artifact")]) });
        target.withNotTarget(true);
        (target.choose(game, '', opponent.getId()).length > 0);
        permanents.push(game.getPermanent(target.getFirstTarget()));
      }
    }
    let sacrificed = 0;
    for (const permanent of permanents) {
      {
        if (permanent !== null && permanent.sacrifice()) {
          {
            sacrificed++;
          }
        }
      }
    }
    if (sacrificed > 0) {
      {
        xmageToken(game.xmageScope(), "TreasureToken").putOntoBattlefield(sacrificed, source.getControllerId());
      }
    }
    return true;
      return true;
    },
  },
  "VivienChampionOfTheWilds::VivienChampionOfTheWildsLookEffect": {
    card: "VivienChampionOfTheWilds",
    effect: "VivienChampionOfTheWildsLookEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/v/VivienChampionOfTheWilds.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "VivienChampionOfTheWilds::VivienChampionOfTheWildsCastFromExileEffect": {
    card: "VivienChampionOfTheWilds",
    effect: "VivienChampionOfTheWildsCastFromExileEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/v/VivienChampionOfTheWilds.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "VizierOfTheMenagerie::VizierOfTheMenagerieManaEffect": {
    card: "VizierOfTheMenagerie",
    effect: "VizierOfTheMenagerieManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/v/VizierOfTheMenagerie.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "VizkopaGuildmage::VizkopaGuildmageEffect": {
    card: "VizkopaGuildmage",
    effect: "VizkopaGuildmageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/v/VizkopaGuildmage.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let amountLifeGained = Number(game.getState().getValue("amountLifeGained"));
    if (amountLifeGained !== null) {
      {
        for (const opponentId of game.getOpponents(source.getControllerId())) {
          {
            let opponent = game.getPlayer(opponentId);
            if (opponent !== null) {
              {
                opponent.loseLife(amountLifeGained);
              }
            }
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "VoidStalker::VoidStalkerEffect": {
    card: "VoidStalker",
    effect: "VoidStalkerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/v/VoidStalker.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetCreature = game.getPermanent(source.getTargetPointer().getFirst());
    let sourcePermanent = game.getPermanent(source.getSourceId());
    let toShuffle = [];
    if (targetCreature !== null) {
      {
        let owner = game.getPlayer(targetCreature.getOwnerId());
        if (owner !== null) {
          {
            owner.putCardsOnTopOfLibrary(targetCreature);
            toShuffle.push(owner);
          }
        }
      }
    }
    if (sourcePermanent !== null) {
      {
        let owner = game.getPlayer(sourcePermanent.getOwnerId());
        if (owner !== null) {
          {
            owner.putCardsOnTopOfLibrary(sourcePermanent);
            toShuffle.push(owner);
          }
        }
      }
    }
    for (const player of toShuffle) {
      {
        player.shuffleLibrary();
      }
    }
    return true;
      return true;
    },
  },
  "VolcanicEruption::VolcanicEruptionEffect": {
    card: "VolcanicEruption",
    effect: "VolcanicEruptionEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/v/VolcanicEruption.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let destroyedCount = 0;
    for (const targetID of source.getTargetPointer().getTargets()) {
      {
        let permanent = game.getPermanent(targetID);
        if (permanent !== null) {
          {
            if (permanent.destroy(false)) {
              {
                if (game.getState().getZone(permanent.getId()) === 'graveyard') {
                  {
                    destroyedCount++;
                  }
                }
              }
            }
          }
        }
      }
    }
    if (destroyedCount > 0) {
      {
        let permanents = game.getBattlefield().getActivePermanents(StaticFilters.creature(), source.getControllerId());
        for (const permanent of permanents) {
          {
            permanent.damage(destroyedCount, source.getSourceId());
          }
        }
        for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
          {
            let player = game.getPlayer(playerId);
            if (player !== null) {
              {
                player.damage(destroyedCount, source.getSourceId());
              }
            }
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "VolcanicSpite::VolcanicSpiteEffect": {
    card: "VolcanicSpite",
    effect: "VolcanicSpiteEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/v/VolcanicSpite.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null || player.getHand().isEmpty() || !player.chooseUse('')) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.card(), zone: "hand" });
    (target.choose(game, '', player.getId(), player.getHand().ids()).length > 0);
    let card = game.getCard(target.getFirstTarget());
    if (card === null) {
      {
        return false;
      }
    }
    if (player.putCardsOnBottomOfLibrary(card)) {
      {
        player.drawCards(1);
      }
    }
    return true;
      return true;
    },
  },
  "VolitionReins::UntapVolitionReinsEffect": {
    card: "VolitionReins",
    effect: "UntapVolitionReinsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/v/VolitionReins.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let enchantment = game.getPermanent(source.getSourceId());
    if (enchantment !== null && enchantment.getAttachedTo() !== null) {
      {
        let permanent = game.getPermanent(enchantment.getAttachedTo());
        if (permanent !== null && permanent.isTapped()) {
          {
            permanent.untap();
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "VonasHunger::VonasHungerEffect": {
    card: "VonasHunger",
    effect: "VonasHungerEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/v/VonasHunger.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let perms = [];
    for (const playerId of game.getOpponents(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player !== null) {
          {
            let numTargets = (game.getBattlefield().countAll(StaticFilters.creatureYouControl(), player.getId()) + 1) / 2;
            if (numTargets > 0) {
              {
                let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creatureYouControl().add(controlledByPredicate()), min: numTargets, max: numTargets }).withNotTarget(true);
                if (target.canChoose(game, player.getId())) {
                  {
                    (target.choose(game, '', player.getId()).length > 0);
                    perms.push(...target.getTargets());
                  }
                }
              }
            }
          }
        }
      }
    }
    for (const permID of perms) {
      {
        let permanent = game.getPermanent(permID);
        if (permanent !== null) {
          {
            permanent.sacrifice();
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "VoraciousBibliophile::VoraciousBibliophileEffect": {
    card: "VoraciousBibliophile",
    effect: "VoraciousBibliophileEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/v/VoraciousBibliophile.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let numTargets = Number(game.getState().getValue("numTargets"));
    controller.drawCards(numTargets);
    return true;
      return true;
    },
  },
  "VraskaTheSilencer::VraskaTheSilencerContinuousEffect": {
    card: "VraskaTheSilencer",
    effect: "VraskaTheSilencerContinuousEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/v/VraskaTheSilencer.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "VraskasStoneglare::VraskasStoneglareEffect": {
    card: "VraskasStoneglare",
    effect: "VraskasStoneglareEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/v/VraskasStoneglare.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    let player = game.getPlayer(source.getControllerId());
    let toughness = permanent.getToughness().getValue();
    permanent.destroy(false);
    if (player !== null) {
      {
        player.gainLife(toughness);
      }
    }
    return true;
      return true;
    },
  },
  "WakandanRoyalGuard::WakandanRoyalGuardEffect": {
    card: "WakandanRoyalGuard",
    effect: "WakandanRoyalGuardEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/w/WakandanRoyalGuard.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent !== null) {
      {
        if (permanent.getId() !== source.getSourceId() && permanent.hasSubtype("hero")) {
          {
            permanent.addCounters(CounterType.of("+1/+1").createInstance(2));
          }
        } else {
          {
            permanent.addCounters(CounterType.of("+1/+1").createInstance());
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "WakingTheTrolls::WakingTheTrollsEffect": {
    card: "WakingTheTrolls",
    effect: "WakingTheTrollsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/w/WakingTheTrolls.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let myLands = game.getBattlefield().count(makeFilter(["land", "you", "control"], [controlledByPredicate(), cardTypePredicate("land")]), source.getControllerId());
    let theirLands = game.getBattlefield().count(makeFilter(["land", "you", "control"], [controlledByPredicate(), cardTypePredicate("land")]), source.getFirstTarget());
    if (myLands <= theirLands) {
      {
        return false;
      }
    }
    return xmageToken(game.xmageScope(), "TrollWarriorToken").putOntoBattlefield(myLands - theirLands, source.getControllerId());
      return true;
    },
  },
  "WallOfReverence::WallOfReverenceTriggeredEffect": {
    card: "WallOfReverence",
    effect: "WallOfReverenceTriggeredEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/w/WallOfReverence.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let target = game.getPermanent(source.getFirstTarget());
    let player = game.getPlayer(source.getControllerId());
    if (target !== null && player !== null) {
      {
        player.gainLife(target.getPower().getValue());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "WaltzOfRage::WaltzOfRageEffect": {
    card: "WaltzOfRage",
    effect: "WaltzOfRageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/w/WaltzOfRage.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent === null) {
      {
        return false;
      }
    }
    let power = permanent.getPower().getValue();
    if (power < 1) {
      {
        return false;
      }
    }
    for (const creature of game.getBattlefield().getActivePermanents(StaticFilters.creature(), source.getControllerId())) {
      {
        if (!(creature.getId() === permanent.getId())) {
          {
            creature.damage(power, permanent.getId());
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "WarReport::WarReportEffect": {
    card: "WarReport",
    effect: "WarReportEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/w/WarReport.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player !== null) {
      {
        let lifeToGain = game.getBattlefield().count(StaticFilters.creature(), source.getControllerId());
        lifeToGain += game.getBattlefield().count(StaticFilters.artifact(), source.getControllerId());
        player.gainLife(lifeToGain);
      }
    }
    return true;
      return true;
    },
  },
  "WarTrainedSlasher::WarTrainedSlasherEffect": {
    card: "WarTrainedSlasher",
    effect: "WarTrainedSlasherEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/w/WarTrainedSlasher.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = source.getSourcePermanentIfItStillExists(game);
    if (permanent === null) {
      {
        return false;
      }
    }
    let power = permanent.getPower().getValue();
    if (power === 0) {
      {
        return false;
      }
    }
    game.addEffect(boostSourceEffect(game.xmageScope(), power, 0, "EndOfTurn"), source);
    return true;
      return true;
    },
  },
  "WarmongersChariot::WarmongersChariotEffect": {
    card: "WarmongersChariot",
    effect: "WarmongersChariotEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/w/WarmongersChariot.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "WasitoraNekoruQueen::WasitoraNekoruQueenEffect": {
    card: "WasitoraNekoruQueen",
    effect: "WasitoraNekoruQueenEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/w/WasitoraNekoruQueen.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let damagedPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    let controller = game.getPlayer(source.getControllerId());
    if (damagedPlayer !== null && controller !== null) {
      {
        let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creature().add(controlledByPredicate()) }).withNotTarget(true);
        if ((target.choose(game, '', damagedPlayer.getId()).length > 0)) {
          {
            let objectToBeSacrificed = game.getPermanent(target.getFirstTarget());
            if (objectToBeSacrificed !== null) {
              {
                if (objectToBeSacrificed.sacrifice()) {
                  {
                    return true;
                  }
                }
              }
            }
          }
        }
        createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), "WasitoraCatDragonToken")).apply(game, source);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "WaveOfReckoning::WaveOfReckoningDamageEffect": {
    card: "WaveOfReckoning",
    effect: "WaveOfReckoningDamageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/w/WaveOfReckoning.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let filter = makeFilter('permanent');
    filter.add(cardTypePredicate("creature"));
    for (const permanent of game.getBattlefield().getActivePermanents(filter, source.getControllerId())) {
      {
        let amount = permanent.getPower().getValue();
        permanent.damage(amount, permanent.getId());
      }
    }
    return true;
      return true;
    },
  },
  "WeiAssassins::WeiAssassinsEffect": {
    card: "WeiAssassins",
    effect: "WeiAssassinsEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/w/WeiAssassins.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getFirstTarget());
    if (player === null) {
      {
        return false;
      }
    }
    let filter = StaticFilters.creature();
    filter.add(controlledByPredicate(player.getId()));
    let target = makeTarget(game.xmageScope(), { filter: filter, min: 1, max: 1 }).withNotTarget(true);
    if ((target.choose(game, '', player.getId()).length > 0)) {
      {
        let permanent = game.getPermanent(target.getFirstTarget());
        if (permanent !== null) {
          {
            permanent.destroy(false);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "WerewolfPackLeader::WerewolfPackLeaderEffect": {
    card: "WerewolfPackLeader",
    effect: "WerewolfPackLeaderEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/w/WerewolfPackLeader.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "WheelOfTorture::WheelOfTortureEffect": {
    card: "WheelOfTorture",
    effect: "WheelOfTortureEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/w/WheelOfTorture.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getTargetPointer().getFirst());
    if (player !== null) {
      {
        let amount = 3 - player.getHand().size();
        if (amount > 0) {
          {
            player.damage(amount, source.getSourceId());
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "WhiskAway::WhiskAwayEffect": {
    card: "WhiskAway",
    effect: "WhiskAwayEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/w/WhiskAway.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetCreature = game.getPermanent(source.getTargetPointer().getFirst());
    let controller = game.getPlayer(source.getControllerId());
    if (targetCreature !== null && controller !== null) {
      {
        return controller.putCardsOnTopOfLibrary(targetCreature);
      }
    }
    return false;
      return true;
    },
  },
  "WhisperingMadness::WhisperingMadnessEffect": {
    card: "WhisperingMadness",
    effect: "WhisperingMadnessEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/w/WhisperingMadness.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let maxDiscarded = 0;
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    for (const playerId of game.getState().getPlayersInRange(controller.getId())) {
      {
        let player = game.getPlayer(playerId);
        if (player === null) {
          {
            continue;
          }
        }
        let discarded = player.discardCards(player.getHand()).size();
        if (discarded > maxDiscarded) {
          {
            maxDiscarded = discarded;
          }
        }
      }
    }
    for (const playerId of game.getState().getPlayersInRange(controller.getId())) {
      {
        let player = game.getPlayer(playerId);
        if (player !== null) {
          {
            player.drawCards(maxDiscarded);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "WhispersteelDagger::WhispersteelDaggerCastFromExileEffect": {
    card: "WhispersteelDagger",
    effect: "WhispersteelDaggerCastFromExileEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/w/WhispersteelDagger.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "WhispersteelDagger::WhispersteelDaggerSpendAnyManaEffect": {
    card: "WhispersteelDagger",
    effect: "WhispersteelDaggerSpendAnyManaEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/w/WhispersteelDagger.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "WickedGuardian::WickedGuardianEffect": {
    card: "WickedGuardian",
    effect: "WickedGuardianEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/w/WickedGuardian.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    if (game.getBattlefield().count(makeFilter(["another", "creature", "you", "control"], [controlledByPredicate(), cardTypePredicate("creature"), anotherPredicate()]), source.getControllerId()) === 0) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: makeFilter(["another", "creature", "you", "control"], [controlledByPredicate(), cardTypePredicate("creature"), anotherPredicate()]), min: 0, max: 1 }).withNotTarget(true);
    if (!(target.choose(game, '', player.getId()).length > 0)) {
      {
        return false;
      }
    }
    let permanent = game.getPermanent(target.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    permanent.damage(2, source.getSourceId());
    return player.drawCards(1) > 0;
      return true;
    },
  },
  "WickerfolkIndomitable::WickerfolkIndomitableGraveyardEffect": {
    card: "WickerfolkIndomitable",
    effect: "WickerfolkIndomitableGraveyardEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/w/WickerfolkIndomitable.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "WildShape::WildShapeEffect": {
    card: "WildShape",
    effect: "WildShapeEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/w/WildShape.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "WillOfTheJeskai::WillOfTheJeskaiEffect": {
    card: "WillOfTheJeskai",
    effect: "WillOfTheJeskaiEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/w/WillOfTheJeskai.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let wheelers = [];
    for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
      {
        let player = game.getPlayer(playerId);
        if (player !== null && player.chooseUse('')) {
          {
            game.informPlayers(player.getName() + '');
            wheelers.push(player);
          }
        }
      }
    }
    for (const player of wheelers) {
      {
        player.discardCards(player.getHand());
        player.drawCards(5);
      }
    }
    return true;
      return true;
    },
  },
  "Windfall::WindfallEffect": {
    card: "Windfall",
    effect: "WindfallEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/w/Windfall.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let maxDiscarded = 0;
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    for (const playerId of game.getState().getPlayersInRange(controller.getId())) {
      {
        let player = game.getPlayer(playerId);
        if (player === null) {
          {
            continue;
          }
        }
        let discarded = player.discardCards(player.getHand()).size();
        if (discarded > maxDiscarded) {
          {
            maxDiscarded = discarded;
          }
        }
      }
    }
    for (const playerId of game.getState().getPlayersInRange(controller.getId())) {
      {
        let player = game.getPlayer(playerId);
        if (player !== null) {
          {
            player.drawCards(maxDiscarded);
          }
        }
      }
    }
    return true;
      return true;
    },
  },
  "WindsOfChange::WindsOfChangeEffect": {
    card: "WindsOfChange",
    effect: "WindsOfChangeEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/w/WindsOfChange.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        let permanentsCount = new Map();
        for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
          {
            let player = game.getPlayer(playerId);
            if (player !== null) {
              {
                permanentsCount.set(playerId, player.getHand().size());
                player.moveCards(player.getHand(), 'library');
                player.shuffleLibrary();
              }
            }
          }
        }
        for (const playerId of game.getState().getPlayersInRange(source.getControllerId())) {
          {
            let player = game.getPlayer(playerId);
            if (player !== null && permanentsCount.has(playerId)) {
              {
                player.drawCards(permanentsCount.get(playerId));
              }
            }
          }
        }
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "Wish::WishPlayFromSideboardEffect": {
    card: "Wish",
    effect: "WishPlayFromSideboardEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/w/Wish.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "WishfulMerfolk::WishfulMerfolkEffect": {
    card: "WishfulMerfolk",
    effect: "WishfulMerfolkEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/w/WishfulMerfolk.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "WitnessProtection::WitnessProtectionEffect": {
    card: "WitnessProtection",
    effect: "WitnessProtectionEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/w/WitnessProtection.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "Woeleecher::WoeleecherEffect": {
    card: "Woeleecher",
    effect: "WoeleecherEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/w/Woeleecher.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let target = game.getPermanent(source.getFirstTarget());
    let you = game.getPlayer(source.getControllerId());
    if (target !== null && you !== null) {
      {
        let numberCountersOriginal = target.getCounters().getCount(CounterType.of("-1/-1"));
        target.removeCounters(CounterType.of("-1/-1").createInstance());
        if (target.getCounters().getCount(CounterType.of("-1/-1")) < numberCountersOriginal) {
          {
            you.gainLife(2);
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "WordOfCommand::WordOfCommandTestFlashEffect": {
    card: "WordOfCommand",
    effect: "WordOfCommandTestFlashEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/w/WordOfCommand.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "WordsOfWisdom::WordsOfWisdomEffect": {
    card: "WordsOfWisdom",
    effect: "WordsOfWisdomEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/w/WordsOfWisdom.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller !== null) {
      {
        for (const playerId of game.getState().getPlayersInRange(controller.getId())) {
          {
            if (!(playerId === controller.getId())) {
              {
                let player = game.getPlayer(playerId);
                if (player !== null) {
                  {
                    player.drawCards(1);
                  }
                }
              }
            }
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "WorldheartPhoenix::WorldheartPhoenixPlayEffect": {
    card: "WorldheartPhoenix",
    effect: "WorldheartPhoenixPlayEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/w/WorldheartPhoenix.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "WormfangBehemoth::WormfangBehemothEffect": {
    card: "WormfangBehemoth",
    effect: "WormfangBehemothEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/w/WormfangBehemoth.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null || player.getHand().isEmpty()) {
      {
        return false;
      }
    }
    return player.moveCardsToExile(player.getHand().getCards());
      return true;
    },
  },
  "WrackWithMadness::WrackWithMadnessEffect": {
    card: "WrackWithMadness",
    effect: "WrackWithMadnessEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/w/WrackWithMadness.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let permanent = game.getPermanent(source.getTargetPointer().getFirst());
    if (permanent !== null) {
      {
        permanent.damage(permanent.getPower().getValue(), permanent.getId());
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "WretchedBanquet::WretchedBanquetEffect": {
    card: "WretchedBanquet",
    effect: "WretchedBanquetEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/w/WretchedBanquet.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let targetCreature = game.getPermanent(source.getFirstTarget());
    if (targetCreature === null) {
      {
        return false;
      }
    }
    let creatures = game.getBattlefield().getActivePermanents(StaticFilters.creature(), source.getControllerId());
    let minPower = targetCreature.getPower().getValue() + 1;
    for (const creature of creatures) {
      {
        if (minPower > creature.getPower().getValue()) {
          {
            minPower = creature.getPower().getValue();
          }
        }
      }
    }
    if (targetCreature.getPower().getValue() <= minPower) {
      {
        targetCreature.destroy(false);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "XanatharGuildKingpin::XanatharPlayFromTopOfTargetLibraryEffect": {
    card: "XanatharGuildKingpin",
    effect: "XanatharPlayFromTopOfTargetLibraryEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/x/XanatharGuildKingpin.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "XanatharGuildKingpin::SpendManaAsAnyColorToCastTopOfLibraryTargetEffect": {
    card: "XanatharGuildKingpin",
    effect: "SpendManaAsAnyColorToCastTopOfLibraryTargetEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/x/XanatharGuildKingpin.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "XenicPoltergeist::XenicPoltergeistEffect": {
    card: "XenicPoltergeist",
    effect: "XenicPoltergeistEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/x/XenicPoltergeist.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "XuIfitOsteoharmonist::XuIfitOsteoharmonistEffect": {
    card: "XuIfitOsteoharmonist",
    effect: "XuIfitOsteoharmonistEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/x/XuIfitOsteoharmonist.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "XyrisTheWrithingStorm::XyrisTheWrithingStormCombatDamageEffect": {
    card: "XyrisTheWrithingStorm",
    effect: "XyrisTheWrithingStormCombatDamageEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/x/XyrisTheWrithingStorm.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let sourceController = game.getPlayer(source.getControllerId());
    let damagedPlayer = game.getPlayer(source.getTargetPointer().getFirst());
    if (sourceController !== null && damagedPlayer !== null) {
      {
        let amount = Number(game.getState().getValue("damage"));
        if (amount > 0) {
          {
            sourceController.drawCards(amount);
            damagedPlayer.drawCards(amount);
            return true;
          }
        }
      }
    }
    return false;
      return true;
    },
  },
  "YgraEaterOfAll::YgraEaterOfAllEffect": {
    card: "YgraEaterOfAll",
    effect: "YgraEaterOfAllEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/y/YgraEaterOfAll.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "YixlidJailer::YixlidJailerEffect": {
    card: "YixlidJailer",
    effect: "YixlidJailerEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/y/YixlidJailer.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "YorvoLordOfGarenbrig::YorvoLordOfGarenbrigEffect": {
    card: "YorvoLordOfGarenbrig",
    effect: "YorvoLordOfGarenbrigEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/y/YorvoLordOfGarenbrig.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let sourcePerm = game.getPermanent(source.getSourceId());
    if (sourcePerm === null) {
      {
        return false;
      }
    }
    sourcePerm.addCounters(CounterType.of("+1/+1").createInstance());
    let permanent = game.getPermanentOrLKIBattlefield(source.getTargetPointer().getFirst());
    if (permanent === null) {
      {
        return true;
      }
    }
    game.processAction();
    if (permanent.getPower().getValue() > sourcePerm.getPower().getValue()) {
      {
        sourcePerm.addCounters(CounterType.of("+1/+1").createInstance());
      }
    }
    return true;
      return true;
    },
  },
  "YurlokOfScorchThrash::YurlokOfScorchThrashRuleEffect": {
    card: "YurlokOfScorchThrash",
    effect: "YurlokOfScorchThrashRuleEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/y/YurlokOfScorchThrash.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "ZaffaiAndTheTempests::ZaffaiAndTheTempestsEffect": {
    card: "ZaffaiAndTheTempests",
    effect: "ZaffaiAndTheTempestsEffect",
    base: "AsThoughEffectImpl",
    source: "Mage.Sets/src/mage/cards/z/ZaffaiAndTheTempests.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return true;
      return true;
    },
  },
  "ZektarShrineExpedition::ZektarShrineExpeditionEffect": {
    card: "ZektarShrineExpedition",
    effect: "ZektarShrineExpeditionEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/z/ZektarShrineExpedition.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let effect = createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), "RedElementalTrampleHasteToken"));
    if (effect.apply(game, source)) {
      {
        effect.exileTokensCreatedAtNextEndStep(game, source);
        return true;
      }
    }
    return false;
      return true;
    },
  },
  "ZilorthaStrengthIncarnate::ZilorthaStrengthIncarnateEffect": {
    card: "ZilorthaStrengthIncarnate",
    effect: "ZilorthaStrengthIncarnateEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/z/ZilorthaStrengthIncarnate.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
  "ZimonesHypothesis::ZimonesHypothesisCounterEffect": {
    card: "ZimonesHypothesis",
    effect: "ZimonesHypothesisCounterEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/z/ZimonesHypothesis.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let player = game.getPlayer(source.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    let target = makeTarget(game.xmageScope(), { filter: StaticFilters.creature(), min: 0, max: 1 }).withNotTarget(true);
    (target.choose(game, '', player.getId()).length > 0);
    let permanent = game.getPermanent(target.getFirstTarget());
    return permanent !== null && permanent.addCounters(CounterType.of("+1/+1").createInstance());
      return true;
    },
  },
  "ZombieMob::ZombieMobExileEffect": {
    card: "ZombieMob",
    effect: "ZombieMobExileEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/z/ZombieMob.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    let controller = game.getPlayer(source.getControllerId());
    if (controller === null) {
      {
        return false;
      }
    }
    let cards = makeCards(game.xmageScope(), []).addAll(makeCards(game.xmageScope(), controller.getGraveyard().ids()).retain(StaticFilters.creatureCard()).getCards());
    controller.moveCards(cards, 'exile');
    return true;
      return true;
    },
  },
  "ZopandrelHungerDominus::ZopandrelHungerDominusEffect": {
    card: "ZopandrelHungerDominus",
    effect: "ZopandrelHungerDominusEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/z/ZopandrelHungerDominus.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    for (const permanent of game.getBattlefield().getAllActivePermanents(StaticFilters.creatureYouControl(), source.getControllerId())) {
      {
        let effect = boostTargetEffect(game.xmageScope(), permanent.getPower().getValue(), permanent.getToughness().getValue());
        effect.setTargetPointer(fixedTarget(permanent));
        game.addEffect(effect, source);
      }
    }
    return true;
      return true;
    },
  },
  "ZulaportDuelist::ZulaportDuelistEffect": {
    card: "ZulaportDuelist",
    effect: "ZulaportDuelistEffect",
    base: "OneShotEffect",
    source: "Mage.Sets/src/mage/cards/z/ZulaportDuelist.java",
    trivial: false,
    run: (game: XGame, source: XAbility): boolean => {
    game.addEffect(boostTargetEffect(game.xmageScope(), -2, 0), source);
    let permanent = game.getPermanent(source.getFirstTarget());
    if (permanent === null) {
      {
        return false;
      }
    }
    let player = game.getPlayer(permanent.getControllerId());
    if (player === null) {
      {
        return false;
      }
    }
    player.millCards(2);
    return true;
      return true;
    },
  },
  "ZurEternalSchemer::ZurEternalSchemerEffect": {
    card: "ZurEternalSchemer",
    effect: "ZurEternalSchemerEffect",
    base: "ContinuousEffectImpl",
    source: "Mage.Sets/src/mage/cards/z/ZurEternalSchemer.java",
    trivial: true,
    run: (game: XGame, source: XAbility): boolean => {
    return false;
      return true;
    },
  },
};

/**
 * How many bodies this file carries, and how many of them do anything. Both
 * read off the object rather than typed, so neither can drift from the file.
 */
export function translatedBodyCount(): { total: number; substantive: number } {
  const all = Object.values(TRANSLATED_BODIES);
  return { total: all.length, substantive: all.filter(b => !b.trivial).length };
}
