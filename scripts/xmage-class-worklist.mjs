/**
 * DeckMatrix — the XMage class worklist, and the numbers under it.
 *
 * `scripts/xmage-ground-truth.mjs` established that XMage's ~32,000 cards are
 * compositions of 1,932 distinct engine classes. That is the unit. This script
 * turns the ranking into a WORKLIST: for each class near the top, does our
 * engine already have a counterpart, does it half have one, or is there
 * nothing.
 *
 * ## What is measured and what is judged, stated so they are never confused
 *
 * MEASURED, by this script, from `scratch/xmage-ground-truth.json` and the
 * cached Scryfall bulk file:
 *   - how many cards name each class
 *   - how many cards are fully covered by a given set of classes
 *   - the marginal card gain of adding one more class, greedily
 *   - how many of our own pool's card names join XMage's map, and how
 *
 * JUDGED, by a human reading our engine, in the `VERDICTS` table below:
 *   - HAVE / PARTIAL / MISSING / STRUCTURAL for each of the top 300 classes
 *   - the effort estimate, on a 0-3 scale
 *
 * Every percentage this script prints comes from the measured half. The
 * verdicts steer which classes go in the covered set; they do not invent any
 * count. Anyone who disagrees with a verdict can edit one line and re-run.
 *
 * ## Licence
 *
 * This script reads ONLY `scratch/xmage-ground-truth.json`, which is derived
 * data: class names and card names, no Java, no oracle text. XMage is MIT
 * (magefree/mage) and the licence is verified at run time by the extractor,
 * which throws before doing any work if it does not find MIT in the checkout.
 * Nothing from XMage is vendored into this repo. Attribution belongs in
 * docs/overhaul/XMAGE-VOCABULARY.md.
 *
 * Usage: node scripts/xmage-class-worklist.mjs
 * Local files only. No network, no database, no model.
 */

import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TRUTH = join(ROOT, 'scratch', 'xmage-ground-truth.json');
const ORACLE = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const OUT_TXT = join(ROOT, 'scratch', 'xmage-class-worklist.txt');
const OUT_JSON = join(ROOT, 'scratch', 'xmage-class-worklist.json');

const pct = (n, d) => (d === 0 ? '0.00' : ((n / d) * 100).toFixed(2));

/* ------------------------------------------------------------------ *
 * The verdicts.
 *
 * One row per class, in ranking order, for the top 300 by card count.
 *
 *   STRUCTURAL  a Java base class, interface, pointer or client-side hint.
 *               Nothing to build. Having an ability type at all satisfies it.
 *   HAVE        our DSL spells it AND a live consumer runs it.
 *   PARTIAL     our DSL spells it and the runtime does not act on it, or acts
 *               on a narrower case than the class covers.
 *   MISSING     no counterpart.
 *
 * The covered set for every card-level figure below is STRUCTURAL + HAVE.
 * PARTIAL counts as not covered, because a card whose effect prints a note
 * instead of changing the board is a card that did not run.
 *
 * Effort, 0-3, an estimate and labelled as one everywhere it is printed:
 *   0  nothing to do
 *   1  a mapping, a flag, a table entry. Under a day.
 *   2  a new DSL member plus its runtime case, or a new trigger event.
 *   3  a subsystem: a hidden-zone picker, a decision protocol, delayed
 *      triggers, targeting the stack.
 * ------------------------------------------------------------------ */

const VERDICTS = [
  ['Ability', 'STRUCTURAL', 0, 'Java base interface'],
  ['SimpleStaticAbility', 'HAVE', 0, 'StaticAbility -> statics.ts -> layers.ts'],
  ['SimpleActivatedAbility', 'HAVE', 0, 'ActivatedAbility -> activate.ts -> stack.ts'],
  ['ManaCostsImpl', 'HAVE', 0, "{pay:'mana'} -> mana.ts planPayment"],
  ['OneShotEffect', 'STRUCTURAL', 0, 'Java base class'],
  ['TargetPermanent', 'HAVE', 0, "TargetSpec what:'card'"],
  ['EntersBattlefieldTriggeredAbility', 'HAVE', 0, "{on:'enters',who:self}"],
  ['TargetCreaturePermanent', 'HAVE', 0, 'TargetSpec + type filter'],
  ['FlyingAbility', 'HAVE', 0, 'ENGINE_KEYWORDS, combat.ts'],
  ['TapSourceCost', 'HAVE', 0, "{pay:'tap'}"],
  ['CreateTokenEffect', 'HAVE', 0, "{do:'create-token'}"],
  ['DrawCardSourceControllerEffect', 'HAVE', 0, "{do:'draw'}"],
  ['Effect', 'STRUCTURAL', 0, 'Java base interface'],
  ['GenericManaCost', 'HAVE', 0, "{pay:'mana'}"],
  ['DamageTargetEffect', 'HAVE', 0, "{do:'damage'}"],
  ['AddCountersSourceEffect', 'HAVE', 0, "{do:'add-counters',what:self}"],
  ['TrampleAbility', 'HAVE', 0, 'ENGINE_KEYWORDS'],
  ['BoostTargetEffect', 'PARTIAL', 2, 'pump prints a note; no timed continuous list on GameState'],
  ['Condition', 'STRUCTURAL', 0, 'Java base interface'],
  ['BoostSourceEffect', 'PARTIAL', 2, 'pump, same gap'],
  ['GainAbilityTargetEffect', 'PARTIAL', 2, 'pump.grant, same gap'],
  ['GainLifeEffect', 'HAVE', 0, "{do:'gain-life'}"],
  ['AttachEffect', 'HAVE', 0, "{do:'attach'} -> ATTACH"],
  ['EnchantAbility', 'PARTIAL', 1, 'attach runs and sba.ts checks legality; the keyword is advisory'],
  ['DestroyTargetEffect', 'HAVE', 0, "{do:'destroy'}"],
  ['HasteAbility', 'HAVE', 0, 'ENGINE_KEYWORDS'],
  ['TargetCardInYourGraveyard', 'PARTIAL', 2, 'TargetSpec carries a zone; no picker offers a graveyard card'],
  ['DynamicValue', 'STRUCTURAL', 0, 'Java base interface'],
  ['SacrificeTargetCost', 'HAVE', 0, "{pay:'sacrifice'}, activate.ts asks when several"],
  ['SacrificeSourceCost', 'HAVE', 0, "{pay:'sacrifice'} on self"],
  ['FixedTarget', 'STRUCTURAL', 0, 'a target pointer, not a target kind'],
  ['TargetPlayer', 'HAVE', 0, "TargetSpec what:'player'"],
  ['BeginningOfUpkeepTriggeredAbility', 'HAVE', 0, "{on:'step',step:'upkeep'}"],
  ['VigilanceAbility', 'HAVE', 0, 'ENGINE_KEYWORDS'],
  ['AttacksTriggeredAbility', 'HAVE', 0, "{on:'attacks',who:self}"],
  ['AddCountersTargetEffect', 'HAVE', 0, "{do:'add-counters'}"],
  ['TargetControlledCreaturePermanent', 'HAVE', 0, 'TargetSpec + controller'],
  ['GainAbilitySourceEffect', 'PARTIAL', 2, 'pump.grant, same gap'],
  ['TargetCardInLibrary', 'PARTIAL', 3, 'search-library defers; primitives/zones.ts written and unwired'],
  ['TriggeredAbilityImpl', 'STRUCTURAL', 0, 'Java base class'],
  ['ConditionalContinuousEffect', 'HAVE', 0, 'conditional statics, conditional-statics.test.ts'],
  ['TargetAnyTarget', 'HAVE', 0, "TargetSpec what:'any'"],
  ['GainAbilityControlledEffect', 'PARTIAL', 2, "{layer:'ability'} applies; only 15 ENGINE_KEYWORDS mean anything"],
  ['GainAbilityAttachedEffect', 'PARTIAL', 2, 'same, on {sel:attached}'],
  ['BoostControlledEffect', 'HAVE', 0, "static {layer:'pt-modify'} anthem"],
  ['Mode', 'PARTIAL', 3, "{do:'choose-mode'} is spelled; nothing asks"],
  ['TargetOpponent', 'HAVE', 0, 'PlayerSelector each-opponent + TargetSpec'],
  ['FirstStrikeAbility', 'HAVE', 0, 'ENGINE_KEYWORDS'],
  ['SpellCastControllerTriggeredAbility', 'MISSING', 2, "'cast' fires only for the source itself"],
  ['PermanentsOnBattlefieldCount', 'HAVE', 0, "{v:'count',of:{sel:'all'}}"],
  ['ConditionalOneShotEffect', 'HAVE', 0, "{do:'if'}"],
  ['DoIfCostPaid', 'MISSING', 3, 'an optional cost offered mid-resolution'],
  ['DiesSourceTriggeredAbility', 'HAVE', 0, "{on:'dies',who:self}"],
  ['Hint', 'STRUCTURAL', 0, 'client display text'],
  ['EquipAbility', 'HAVE', 0, "activated {do:'attach'}, AbilityPanel + AttachmentPanel"],
  ['FlashAbility', 'MISSING', 1, 'advisory; timing is not enforced'],
  ['BeginningOfEndStepTriggeredAbility', 'HAVE', 0, "{on:'step',step:'end'}"],
  ['PermanentsOnTheBattlefieldCondition', 'HAVE', 0, "{if:'count'} / {if:'controls'}"],
  ['LifelinkAbility', 'HAVE', 0, 'ENGINE_KEYWORDS'],
  ['EntersBattlefieldTappedAbility', 'HAVE', 0, 'intrinsic.ts enters-tapped'],
  ['MenaceAbility', 'HAVE', 0, 'ENGINE_KEYWORDS'],
  ['BoostEnchantedEffect', 'HAVE', 0, "static pt-modify on {sel:'attached'}"],
  ['Target', 'STRUCTURAL', 0, 'Java base interface'],
  ['DeathtouchAbility', 'HAVE', 0, 'ENGINE_KEYWORDS'],
  ['TargetSpell', 'MISSING', 3, 'nothing targets an object on the stack'],
  ['ReachAbility', 'HAVE', 0, 'ENGINE_KEYWORDS'],
  ['DealsCombatDamageToAPlayerTriggeredAbility', 'HAVE', 0, "{on:'deals-damage',source:self}"],
  ['ValueHint', 'STRUCTURAL', 0, 'client display text'],
  ['TapTargetEffect', 'HAVE', 0, "{do:'tap'}"],
  ['ReplacementEffectImpl', 'STRUCTURAL', 0, 'Java base class'],
  ['IndestructibleAbility', 'HAVE', 0, 'ENGINE_KEYWORDS, sba.ts'],
  ['BoostEquippedEffect', 'HAVE', 0, 'static pt-modify on attached'],
  ['ReturnToHandTargetEffect', 'HAVE', 0, "{do:'move-zone',to:'hand'}"],
  ['ContinuousEffectImpl', 'STRUCTURAL', 0, 'Java base class'],
  ['ActivateAsSorceryActivatedAbility', 'HAVE', 0, "timing:'sorcery', activate.ts activationTiming"],
  ['ColorlessManaAbility', 'PARTIAL', 2, 'mana.ts counts untapped sources; the compiled ability is not read'],
  ['TargetCard', 'HAVE', 0, 'TargetSpec'],
  ['GetXValue', 'PARTIAL', 2, "{v:'x'} exists; activate.ts refuses rather than announcing X"],
  ['ExileTargetEffect', 'HAVE', 0, "{do:'exile'}"],
  ['ScryEffect', 'PARTIAL', 1, 'primitives/library-order.ts implements it, unwired, not in the core union'],
  ['Cost', 'STRUCTURAL', 0, 'Java base interface'],
  ['TargetControlledPermanent', 'HAVE', 0, 'TargetSpec + controller'],
  ['DiscardCardCost', 'HAVE', 0, "{pay:'discard'}"],
  ['ReturnFromGraveyardToHandTargetEffect', 'PARTIAL', 2, 'return-from defers; primitive written, unwired'],
  ['EntersBattlefieldAbility', 'HAVE', 0, "{on:'enters',who:self}"],
  ['ContinuousEffect', 'STRUCTURAL', 0, 'Java base interface'],
  ['BoostAllEffect', 'PARTIAL', 2, 'the static anthem runs; the until-end-of-turn spelling is a pump'],
  ['TargetCardInHand', 'HAVE', 0, "TargetSpec zone:'hand'"],
  ['DefenderAbility', 'HAVE', 0, 'ENGINE_KEYWORDS'],
  ['GainAbilityAllEffect', 'PARTIAL', 2, 'grant reaches layer 6; only 15 keywords mean anything'],
  ['CreateDelayedTriggeredAbilityEffect', 'MISSING', 3, 'no delayed trigger anywhere in the DSL'],
  ['LoyaltyAbility', 'HAVE', 0, 'isLoyalty, one per turn in activate.ts'],
  ['SimpleManaAbility', 'PARTIAL', 2, 'mana.ts derives mana from untapped permanents instead'],
  ['UntapTargetEffect', 'HAVE', 0, "{do:'untap'}"],
  ['GreenManaAbility', 'PARTIAL', 2, 'same as SimpleManaAbility'],
  ['ActivateIfConditionActivatedAbility', 'PARTIAL', 2, 'activate.ts refuses with a sentence rather than checking'],
  ['BeginningOfCombatTriggeredAbility', 'MISSING', 1, 'deriveTriggerEvents emits upkeep and end step only'],
  ['PayLifeCost', 'HAVE', 0, "{pay:'life'}"],
  ['ReturnFromGraveyardToBattlefieldTargetEffect', 'PARTIAL', 2, 'return-from defers'],
  ['TargetCardInGraveyard', 'PARTIAL', 2, 'no picker offers a graveyard card'],
  ['CyclingAbility', 'MISSING', 2, 'advisory; needs an activated ability usable from hand'],
  ['DiesCreatureTriggeredAbility', 'MISSING', 2, "'dies' fires only for the source"],
  ['TargetOpponentsCreaturePermanent', 'HAVE', 0, 'TargetSpec + controller'],
  ['SearchLibraryPutInHandEffect', 'PARTIAL', 3, 'needs a hidden-zone picker'],
  ['SearchLibraryPutInPlayEffect', 'PARTIAL', 3, 'needs a hidden-zone picker'],
  ['ProtectionAbility', 'HAVE', 0, 'keywords.ts protectionQualities + hasProtectionFrom'],
  ['RemoveCountersSourceCost', 'HAVE', 0, "{pay:'remove-counters'}"],
  ['AnyColorManaAbility', 'PARTIAL', 2, 'mana abilities are not read off the compiled record'],
  ['LoseLifeTargetEffect', 'HAVE', 0, "{do:'lose-life'}"],
  ['AsEntersBattlefieldAbility', 'MISSING', 2, 'a choice made as the permanent enters'],
  ['StaticValue', 'HAVE', 0, 'a plain number in ValueExpr'],
  ['DoubleStrikeAbility', 'HAVE', 0, 'ENGINE_KEYWORDS'],
  ['LookLibraryAndPickControllerEffect', 'MISSING', 3, 'hidden-zone look and pick'],
  ['ReflexiveTriggeredAbility', 'MISSING', 3, 'a trigger created during resolution'],
  ['HexproofAbility', 'HAVE', 0, 'keywords.ts canBeTargetedBy'],
  ['BlueManaAbility', 'PARTIAL', 2, 'as SimpleManaAbility'],
  ['RedManaAbility', 'PARTIAL', 2, 'as SimpleManaAbility'],
  ['BlackManaAbility', 'PARTIAL', 2, 'as SimpleManaAbility'],
  ['WhiteManaAbility', 'PARTIAL', 2, 'as SimpleManaAbility'],
  ['CounterTargetEffect', 'PARTIAL', 3, 'primitives/stack.ts written, unwired; no stack target'],
  ['DelayedTriggeredAbility', 'MISSING', 3, 'no delayed trigger in the DSL'],
  ['TargetLandPermanent', 'HAVE', 0, 'TargetSpec + type filter'],
  ['EntersBattlefieldControlledTriggeredAbility', 'MISSING', 2, "'enters' fires only for the source"],
  ['GainControlTargetEffect', 'PARTIAL', 2, 'gain-control prints a note; no timed continuous list'],
  ['LoseLifeSourceControllerEffect', 'HAVE', 0, "{do:'lose-life',who:'you'}"],
  ['AddCountersAllEffect', 'HAVE', 0, "{do:'add-counters',what:{sel:'all'}}"],
  ['DamagePlayersEffect', 'HAVE', 0, "{do:'damage'} to a PlayerSelector"],
  ['DiscardTargetEffect', 'HAVE', 0, "{do:'discard'}"],
  ['CreateTokenCopyTargetEffect', 'MISSING', 2, 'a token that copies a permanent'],
  ['KickerAbility', 'MISSING', 2, 'no additional cost paid on cast'],
  ['WardAbility', 'MISSING', 2, 'advisory keyword'],
  ['SagaAbility', 'MISSING', 3, 'lore counters plus chapter triggers'],
  ['FlashbackAbility', 'MISSING', 2, 'casting from the graveyard'],
  ['LoseLifeOpponentsEffect', 'HAVE', 0, "{do:'lose-life',who:'each-opponent'}"],
  ['ConditionHint', 'STRUCTURAL', 0, 'client display text'],
  ['DrawDiscardControllerEffect', 'PARTIAL', 1, 'draw runs; discard is deferred as a decision'],
  ['AtTheBeginOfNextEndStepDelayedTriggeredAbility', 'MISSING', 3, 'delayed triggers'],
  ['DamageAllEffect', 'HAVE', 0, "{do:'damage'} over {sel:'all'}"],
  ['CountersSourceCount', 'HAVE', 0, "{v:'counters',of:self}"],
  ['EntersBattlefieldAllTriggeredAbility', 'MISSING', 2, "'enters' fires only for the source"],
  ['KickedCondition', 'MISSING', 2, 'depends on kicker'],
  ['DestroyAllEffect', 'HAVE', 0, "{do:'destroy'} over {sel:'all'}"],
  ['SacrificeSourceEffect', 'HAVE', 0, "{do:'sacrifice'} on self"],
  ['ContinuousRuleModifyingEffectImpl', 'STRUCTURAL', 0, 'Java base class'],
  ['SurveilEffect', 'PARTIAL', 1, 'primitive written, unwired, not in the core union'],
  ['AsThoughEffectImpl', 'STRUCTURAL', 0, 'Java base class'],
  ['TapTargetCost', 'HAVE', 0, "{pay:'tap-others'}"],
  ['TargetArtifactPermanent', 'HAVE', 0, 'TargetSpec + type filter'],
  ['InfoEffect', 'STRUCTURAL', 0, 'reminder text only'],
  ['EntersBattlefieldWithCountersAbility', 'HAVE', 0, 'intrinsic.ts enters-with-counters'],
  ['ColoredManaCost', 'HAVE', 0, "{pay:'mana'}"],
  ['CardsInControllerGraveyardCount', 'HAVE', 0, "{v:'cards-in',zone:'graveyard'}"],
  ['SetBasePowerToughnessSourceEffect', 'HAVE', 0, "{layer:'pt-set'}"],
  ['MorphAbility', 'MISSING', 3, 'face-down permanents'],
  ['CrewAbility', 'MISSING', 2, 'advisory keyword; a tap-others cost with a power sum'],
  ['MyTurnCondition', 'HAVE', 0, "{if:'your-turn'}"],
  ['RegenerateSourceEffect', 'PARTIAL', 2, 'primitives/regenerate.ts written, unwired'],
  ['ReturnToHandSourceEffect', 'HAVE', 0, "{do:'move-zone',what:self,to:'hand'}"],
  ['LandfallAbility', 'MISSING', 2, 'a land entering under your control is not a derived event'],
  ['MillCardsControllerEffect', 'HAVE', 0, "{do:'mill'}"],
  ['SavedDamageValue', 'MISSING', 2, '"that much damage" needs the damage just dealt'],
  ['SpellAbility', 'PARTIAL', 3, 'nothing runs a compiled spell on resolution'],
  ['SpellsCostReductionControllerEffect', 'PARTIAL', 2, 'cost-modify is collected; costAdjustmentFor has no caller'],
  ['TransformSourceEffect', 'MISSING', 2, 'no transform'],
  ['FixedTargets', 'STRUCTURAL', 0, 'a target pointer'],
  ['AttacksWithCreaturesTriggeredAbility', 'MISSING', 2, "'attacks' fires only for the source"],
  ['SourcePermanentPowerValue', 'HAVE', 0, "{v:'power',of:self}"],
  ['TargetNonlandPermanent', 'HAVE', 0, 'TargetSpec + not filter'],
  ['DrawCardTargetEffect', 'HAVE', 0, "{do:'draw'} to a target player"],
  ['MillCardsTargetEffect', 'HAVE', 0, "{do:'mill'} to a target player"],
  ['SpellCostReductionSourceEffect', 'PARTIAL', 2, 'costAdjustmentFor has no caller'],
  ['EntersBattlefieldOrAttacksSourceTriggeredAbility', 'PARTIAL', 1, 'one ability, two events; TriggeredAbility carries one'],
  ['TargetCreatureOrPlaneswalker', 'HAVE', 0, "TargetSpec + {is:'or'}"],
  ['BecomesCreatureSourceEffect', 'PARTIAL', 2, "{layer:'type'} runs as a static; the timed spelling is a pump"],
  ['UntapSourceEffect', 'HAVE', 0, "{do:'untap',what:self}"],
  ['LeavesBattlefieldTriggeredAbility', 'MISSING', 1, "the engine derives no 'leaves' event"],
  ['AlternativeCostSourceAbility', 'MISSING', 3, 'alternative costs on cast'],
  ['BasicManaEffect', 'PARTIAL', 2, 'add-mana prints a note'],
  ['ExileTopXMayPlayUntilEffect', 'MISSING', 3, 'playing from exile with a window'],
  ['PutOnLibraryTargetEffect', 'HAVE', 0, "{do:'move-zone',to:'library',position}"],
  ['TargetPlayerOrPlaneswalker', 'HAVE', 0, 'TargetSpec any'],
  ['DoWhenCostPaid', 'MISSING', 3, 'an optional cost offered mid-resolution'],
  ['CounterUnlessPaysEffect', 'MISSING', 3, "to-actions.ts has no case for {do:'unless-pays'} and throws"],
  ['DevoidAbility', 'PARTIAL', 1, "{layer:'color'} exists; nothing emits an empty colour set"],
  ['RestrictionEffect', 'STRUCTURAL', 0, 'Java base class'],
  ['GetEnergyCountersControllerEffect', 'HAVE', 0, "{do:'player-counter'} -> PLAYER_COUNTER"],
  ['InvestigateEffect', 'PARTIAL', 2, 'the Clue token needs its own activated ability'],
  ['SourceHasCounterCondition', 'HAVE', 0, "{if:'value'} over {v:'counters'}"],
  ['SacrificeSourceUnlessPaysEffect', 'MISSING', 3, 'an optional cost offered mid-resolution'],
  ['ExileFromGraveCost', 'HAVE', 0, "{pay:'exile',from:'graveyard'}"],
  ['CostModificationEffectImpl', 'STRUCTURAL', 0, 'Java base class'],
  ['SecondTargetPointer', 'STRUCTURAL', 0, 'a target pointer'],
  ['PayEnergyCost', 'MISSING', 2, 'no cost that spends a player counter'],
  ['CantBeBlockedTargetEffect', 'MISSING', 2, "restriction 'cant-be-blocked-except-by' is collected, never read"],
  ['TargetSacrifice', 'HAVE', 0, "{pay:'sacrifice'} with a target"],
  ['ConvokeAbility', 'MISSING', 2, 'advisory keyword; a cost paid by tapping creatures'],
  ['CantBlockTargetEffect', 'HAVE', 0, "restriction 'cant-block', read by combat.ts"],
  ['SacrificeEffect', 'PARTIAL', 1, 'sacrifice is deferred as a player decision'],
  ['DiscardTargetCost', 'HAVE', 0, "{pay:'discard'}"],
  ['PreventDamageToTargetEffect', 'MISSING', 2, "restriction 'damage-prevention' is collected, never read"],
  ['LimitedTimesPerTurnActivatedAbility', 'HAVE', 0, 'activate.ts abilityUsesThisTurn'],
  ['ReturnSourceFromGraveyardToHandEffect', 'PARTIAL', 2, 'return-from defers'],
  ['EntersBattlefieldTappedUnlessAbility', 'MISSING', 2, 'a conditional replacement on entering'],
  ['BecomesCreatureTargetEffect', 'PARTIAL', 2, 'the timed spelling is a pump'],
  ['ShroudAbility', 'HAVE', 0, 'keywords.ts canBeTargetedBy'],
  ['ConditionalManaBuilder', 'MISSING', 2, 'E8 restriction is spelled; mana is not read from abilities'],
  ['TargetAttackingCreature', 'HAVE', 0, "TargetSpec + {is:'attacking'}"],
  ['TargetEnchantmentPermanent', 'HAVE', 0, 'TargetSpec + type filter'],
  ['DontUntapInControllersNextUntapStepTargetEffect', 'MISSING', 2, "restriction 'cant-untap' is collected, never read"],
  ['CantBeBlockedSourceEffect', 'MISSING', 2, 'no unblockable restriction is read'],
  ['PreventionEffectImpl', 'STRUCTURAL', 0, 'Java base class'],
  ['ThresholdCondition', 'HAVE', 0, "{if:'value'} over {v:'cards-in',zone:'graveyard'}"],
  ['DamageControllerEffect', 'HAVE', 0, "{do:'damage'} to you"],
  ['PutCardFromHandOntoBattlefieldEffect', 'PARTIAL', 2, 'needs a hand picker'],
  ['CantBlockAbility', 'HAVE', 0, "restriction 'cant-block'"],
  ['CopyTargetStackObjectEffect', 'MISSING', 3, 'copying an object on the stack'],
  ['EntersBattlefieldThisOrAnotherTriggeredAbility', 'MISSING', 2, 'a non-self enters event'],
  ['CantBeBlockedByCreaturesSourceEffect', 'MISSING', 2, 'the restriction is collected, never read'],
  ['ExileUntilSourceLeavesEffect', 'MISSING', 3, 'a linked exile that returns'],
  ['ExileSpellEffect', 'MISSING', 3, 'needs the stack'],
  ['EachTargetPointer', 'STRUCTURAL', 0, 'a target pointer'],
  ['TurnedFaceUpSourceTriggeredAbility', 'MISSING', 3, 'depends on morph'],
  ['ProliferateEffect', 'MISSING', 2, 'no proliferate'],
  ['DiscardControllerEffect', 'PARTIAL', 1, 'discard is deferred as a decision'],
  ['SacrificePermanentTriggeredAbility', 'MISSING', 2, "the engine derives no 'sacrificed' event"],
  ['DealsDamageToAPlayerAllTriggeredAbility', 'MISSING', 2, 'a non-self damage event'],
  ['DiscardEachPlayerEffect', 'PARTIAL', 1, 'discard is deferred as a decision'],
  ['DynamicManaAbility', 'MISSING', 2, 'mana is not read from abilities'],
  ['ExileSourceFromGraveCost', 'HAVE', 0, "{pay:'exile',from:'graveyard'}"],
  ['ProwessAbility', 'MISSING', 2, 'advisory keyword; needs a non-creature cast event'],
  ['CardTypesInGraveyardCount', 'MISSING', 1, 'no distinct-count value expression'],
  ['CastSourceTriggeredAbility', 'HAVE', 0, "{on:'cast',what:self}"],
  ['CumulativeUpkeepAbility', 'MISSING', 3, 'age counters plus an upkeep cost'],
  ['SuspendAbility', 'MISSING', 3, 'time counters plus a delayed cast'],
  ['DiesAttachedTriggeredAbility', 'MISSING', 2, 'a non-self dies event'],
  ['SpellCastOpponentTriggeredAbility', 'MISSING', 2, 'a non-self cast event'],
  ['SpellCastAllTriggeredAbility', 'MISSING', 2, 'a non-self cast event'],
  ['GreatestAmongPermanentsValue', 'MISSING', 2, 'no max-over-a-set value'],
  ['GetEmblemEffect', 'MISSING', 2, 'no emblem'],
  ['XTargetsCountAdjuster', 'MISSING', 2, 'target count driven by X'],
  ['OrCost', 'MISSING', 2, 'a choice between two costs'],
  ['CreaturesYouControlCount', 'HAVE', 0, "{v:'count',of:{sel:'all'}}"],
  ['GainLifeControllerTriggeredAbility', 'MISSING', 1, "the engine derives no 'gains-life' event"],
  ['FightTargetsEffect', 'MISSING', 2, 'no fight'],
  ['SacrificeTargetEffect', 'PARTIAL', 1, 'sacrifice is deferred as a decision'],
  ['AddManaOfAnyColorEffect', 'PARTIAL', 2, 'add-mana prints a note'],
  ['TargetCardInExile', 'HAVE', 0, "TargetSpec zone:'exile'"],
  ['CantBeCounteredSourceAbility', 'MISSING', 2, 'needs the stack'],
  ['AtTheEndOfCombatDelayedTriggeredAbility', 'MISSING', 3, 'delayed triggers'],
  ['ReturnToHandChosenControlledPermanentCost', 'HAVE', 0, "{pay:'return-to-hand'}"],
  ['CardsInControllerHandCount', 'HAVE', 0, "{v:'cards-in',zone:'hand'}"],
  ['DealtDamageToSourceTriggeredAbility', 'MISSING', 1, "the engine derives no 'dealt-damage' event"],
  ['EntersBattlefieldWithXCountersEffect', 'MISSING', 2, 'X on entry'],
  ['AttacksAttachedTriggeredAbility', 'MISSING', 2, 'a non-self attacks event'],
  ['SetBasePowerSourceEffect', 'HAVE', 0, "{layer:'pt-set'}"],
  ['FearAbility', 'MISSING', 2, 'advisory keyword'],
  ['DiscardCardYouChooseTargetEffect', 'MISSING', 3, 'looking at another hand'],
  ['OrTriggeredAbility', 'MISSING', 2, 'one ability, two events'],
  ['SimpleEvasionAbility', 'MISSING', 2, 'the restriction is collected, never read'],
  ['DeliriumCondition', 'MISSING', 1, 'needs a distinct-count value'],
  ['ReturnSourceFromGraveyardToBattlefieldEffect', 'PARTIAL', 2, 'return-from defers'],
  ['SignInversionDynamicValue', 'HAVE', 0, "{v:'sub'} from zero"],
  ['MultipliedValue', 'HAVE', 0, "{v:'mul'}"],
  ['AttacksEachCombatStaticAbility', 'MISSING', 1, "restriction 'must-attack' is collected, never read"],
  ['ChooseCreatureTypeEffect', 'MISSING', 3, 'a naming decision the engine cannot ask for'],
  ['DamageMultiEffect', 'MISSING', 2, 'damage divided among targets'],
  ['DontUntapInControllersUntapStepEnchantedEffect', 'MISSING', 2, "restriction 'cant-untap' is never read"],
  ['MyTurnHint', 'STRUCTURAL', 0, 'client display text'],
  ['TriggeredAbility', 'STRUCTURAL', 0, 'Java base interface'],
  ['CantBeBlockedSourceAbility', 'MISSING', 2, 'the restriction is collected, never read'],
  ['TargetAdjuster', 'STRUCTURAL', 0, 'Java base interface'],
  ['DamageWithPowerFromOneToAnotherTargetEffect', 'MISSING', 2, 'damage equal to a permanent power'],
  ['AmassEffect', 'MISSING', 2, 'no amass'],
  ['DrawNthCardTriggeredAbility', 'MISSING', 2, 'needs a per-turn draw count'],
  ['YouControlPermanentCondition', 'HAVE', 0, "{if:'controls'}"],
  ['InvertCondition', 'HAVE', 0, "{if:'not'}"],
  ['ChooseACardNameEffect', 'MISSING', 3, 'a naming decision'],
  ['CreaturesYouControlHint', 'STRUCTURAL', 0, 'client display text'],
  ['ConditionalAnyColorManaAbility', 'MISSING', 2, 'mana is not read from abilities'],
  ['BecomesTappedSourceTriggeredAbility', 'MISSING', 1, "the engine derives no 'tapped' event"],
  ['TapSourceEffect', 'HAVE', 0, "{do:'tap',what:self}"],
  ['TargetAttackingOrBlockingCreature', 'HAVE', 0, "TargetSpec + {is:'or'}"],
  ['SourceTappedCondition', 'HAVE', 0, "{if:'count'} over a tapped filter"],
  ['PlayFromNotOwnHandZoneTargetEffect', 'MISSING', 3, 'playing from another zone'],
  ['RemoveCounterSourceEffect', 'HAVE', 0, "{do:'remove-counters'}"],
  ['RegenerateTargetEffect', 'PARTIAL', 2, 'primitive written, unwired'],
  ['ChangelingAbility', 'MISSING', 1, 'all creature types'],
  ['MadnessAbility', 'MISSING', 3, 'casting from a discard window'],
  ['ExileSourceCost', 'HAVE', 0, "{pay:'exile'}"],
  ['CostImpl', 'STRUCTURAL', 0, 'Java base class'],
  ['SpellCostReductionForEachSourceEffect', 'PARTIAL', 2, 'costAdjustmentFor has no caller'],
  ['ManaEffect', 'STRUCTURAL', 0, 'Java base class'],
  ['TargetCreaturePermanentAmount', 'MISSING', 2, 'damage divided among targets'],
  ['ThatPlayerControlsTargetAdjuster', 'MISSING', 2, 'a target scoped to the trigger player'],
  ['ConditionalRestrictionEffect', 'HAVE', 0, "{layer:'restriction'} under a condition"],
  ['ControllerGainedLifeCount', 'MISSING', 2, 'needs the watch fold nothing supplies'],
  ['DrawCardAllEffect', 'HAVE', 0, "{do:'draw',who:'each-player'}"],
  ['ExileThenReturnTargetEffect', 'MISSING', 3, 'a linked exile that returns'],
  ['BecomesTargetSourceTriggeredAbility', 'MISSING', 2, 'no becomes-target event'],
  ['PutIntoGraveFromBattlefieldSourceTriggeredAbility', 'HAVE', 0, "{on:'dies',who:self}"],
];

/* ------------------------------------------------------------------ *
 * 1. Load the ground truth
 * ------------------------------------------------------------------ */

if (!existsSync(TRUTH)) {
  console.error(`Missing ${TRUTH}. Run scripts/xmage-ground-truth.mjs first.`);
  process.exit(1);
}

const truth = JSON.parse(readFileSync(TRUTH, 'utf8'));
const ranking = truth.ranking;
const cardToClasses = truth.cardToClasses;
const bySimple = new Map(ranking.map(r => [r.simple, r]));
const fqnToSimple = new Map(ranking.map(r => [r.fqn, r.simple]));

const lines = [];
const say = s => { lines.push(s); console.log(s); };

say('='.repeat(78));
say('THE XMAGE CLASS WORKLIST');
say('='.repeat(78));
say('');
say(`ground truth   ${truth.script}, generated ${truth.generatedAt}`);
say(`xmage commit   ${truth.source.commit}`);
say(`licence        ${truth.source.licence}`);
say(`classes        ${ranking.length}`);
say(`cards mapped   ${Object.keys(cardToClasses).length}`);
say('');

/* ------------------------------------------------------------------ *
 * 2. Sanity: the verdict table lines up with the ranking
 * ------------------------------------------------------------------ */

const verdictOf = new Map();
const effortOf = new Map();
const noteOf = new Map();
let unknownNames = 0;
let outOfOrder = 0;

VERDICTS.forEach(([name, verdict, effort, note], i) => {
  const row = ranking[i];
  if (!bySimple.has(name)) { unknownNames++; return; }
  if (!row || row.simple !== name) outOfOrder++;
  verdictOf.set(name, verdict);
  effortOf.set(name, effort);
  noteOf.set(name, note);
});

say('--- TABLE INTEGRITY ---');
say(`rows in the verdict table               ${VERDICTS.length}`);
say(`rows naming a class the ranking has     ${verdictOf.size}`);
say(`rows naming a class it does NOT have    ${unknownNames}`);
say(`rows sitting at a different rank        ${outOfOrder}`);
if (unknownNames > 0 || outOfOrder > 0) {
  say('  ^ a non-zero here means the table has drifted from the ranking. Fix before reading on.');
}
say('');

/* ------------------------------------------------------------------ *
 * 3. Verdict totals, by class and by card use
 * ------------------------------------------------------------------ */

const byVerdict = new Map();
for (const [name, verdict] of verdictOf) {
  const row = bySimple.get(name);
  const entry = byVerdict.get(verdict) ?? { classes: 0, cardUses: 0 };
  entry.classes++;
  entry.cardUses += row.cards;
  byVerdict.set(verdict, entry);
}

say('--- THE TOP 300, GRADED ---');
say('(the grade is a human judgement; the counts beside it are this script)');
say('');
say('verdict      classes   cards naming at least one such class');
for (const v of ['STRUCTURAL', 'HAVE', 'PARTIAL', 'MISSING']) {
  const e = byVerdict.get(v) ?? { classes: 0, cardUses: 0 };
  const names = new Set();
  for (const [card, fqns] of Object.entries(cardToClasses)) {
    for (const fqn of fqns) {
      const simple = fqnToSimple.get(fqn);
      if (simple && verdictOf.get(simple) === v) { names.add(card); break; }
    }
  }
  say(`${v.padEnd(12)} ${String(e.classes).padStart(5)}   ${String(names.size).padStart(6)}`);
}
say('');

/* ------------------------------------------------------------------ *
 * 4. The free classes: how much of the 1,932 is not work at all
 *
 * Interfaces, abstract base classes and client-side hints are Java structure,
 * not rules. A card naming `Effect` needs no engine primitive called Effect.
 * The published curve counts them, which overstates the requirement, so this
 * measures how many there are across the WHOLE ranking rather than the 300.
 * ------------------------------------------------------------------ */

const FREE_KINDS = new Set(['interface', 'abstract']);
const freeClasses = new Set();
for (const r of ranking) {
  if (FREE_KINDS.has(r.kind) || r.bucket === 'hint') freeClasses.add(r.fqn);
}

say('--- CLASSES THAT ARE NOT WORK, ACROSS ALL 1,932 ---');
const freeByReason = new Map();
for (const r of ranking) {
  if (!freeClasses.has(r.fqn)) continue;
  const why = r.bucket === 'hint' ? 'client hint' : `java ${r.kind}`;
  freeByReason.set(why, (freeByReason.get(why) ?? 0) + 1);
}
for (const [why, n] of [...freeByReason].sort((a, b) => b[1] - a[1])) {
  say(`  ${why.padEnd(16)} ${String(n).padStart(4)} classes`);
}
say(`  TOTAL            ${String(freeClasses.size).padStart(4)} of ${ranking.length} (${pct(freeClasses.size, ranking.length)}%)`);
say('');

/* ------------------------------------------------------------------ *
 * 5. Where we stand right now, as a composition
 *
 * A card is COVERED when every class it names is covered. Covered means
 * STRUCTURAL, HAVE, or free-by-kind. PARTIAL is not covered.
 * ------------------------------------------------------------------ */

const coveredNow = new Set(freeClasses);
for (const [name, verdict] of verdictOf) {
  if (verdict === 'HAVE' || verdict === 'STRUCTURAL') coveredNow.add(bySimple.get(name).fqn);
}

const cardEntries = Object.entries(cardToClasses);
const cardMeta = truth.cardMeta ?? {};
const isPure = name => !!cardMeta[name]?.pure;
const uncoveredFor = new Map(); // card -> Set of uncovered fqns
const composableNow = [];
for (const [card, fqns] of cardEntries) {
  const missing = fqns.filter(f => !coveredNow.has(f));
  if (missing.length === 0) composableNow.push(card);
  else uncoveredFor.set(card, missing);
}
const fullyCoveredNow = composableNow.length;
const composablePure = composableNow.filter(isPure);
const pureCards = cardEntries.filter(([n]) => isPure(n)).length;

say('--- STANDING, MEASURED AS A COMPOSITION ---');
say(`covered classes                         ${coveredNow.size} of ${ranking.length}`);
say(`  of those, free by kind                ${freeClasses.size}`);
say(`  of those, HAVE from the verdict table ${coveredNow.size - freeClasses.size}`);
say(`cards whose every class is covered      ${fullyCoveredNow} of ${cardEntries.length}  (${pct(fullyCoveredNow, cardEntries.length)}%)`);
say(`  of those, PURE composition            ${composablePure.length}  (${pct(composablePure.length, cardEntries.length)}%)`);
say(`  of those, carrying hand-written java  ${fullyCoveredNow - composablePure.length}  (the class list is not the whole card)`);
const one = [...uncoveredFor.values()].filter(m => m.length === 1).length;
const two = [...uncoveredFor.values()].filter(m => m.length === 2).length;
say(`cards blocked by exactly one class      ${one}  (${pct(one, cardEntries.length)}%)`);
say(`cards blocked by exactly two classes    ${two}  (${pct(two, cardEntries.length)}%)`);
say(`pure-composition cards in the pool      ${pureCards}  (${pct(pureCards, cardEntries.length)}%)`);
say('');

/* ------------------------------------------------------------------ *
 * 5b. The prize: cards our parts already compose that nothing runs.
 *
 * Needs the name lists from
 *   DM_NAME_LIST=1 node --experimental-strip-types scripts/verify-ability-coverage.mjs
 *   DM_NAME_LIST=1 DM_ACTIVATED_LIVE=1 node --experimental-strip-types scripts/verify-ability-coverage.mjs
 * and is skipped when they are absent, rather than estimated.
 * ------------------------------------------------------------------ */

const prize = {};
for (const [label, file] of [['baseline', 'verify-names.json'], ['activatedLive', 'verify-names-activated-live.json']]) {
  const path = join(ROOT, 'scratch', file);
  if (!existsSync(path)) continue;
  const n = JSON.parse(readFileSync(path, 'utf8'));
  const reached = new Set([...(n.automated ?? []), ...(n.promptable ?? [])]);
  prize[label] = {
    reachedToday: reached.size,
    composableAndReached: composableNow.filter(c => reached.has(c)).length,
    composableNotReached: composableNow.filter(c => !reached.has(c)).length,
    pureComposableNotReached: composablePure.filter(c => !reached.has(c)).length,
  };
}

if (Object.keys(prize).length > 0) {
  say('--- THE PRIZE: COMPOSABLE TODAY, RUNS NEVER ---');
  say('a card the engine could build out of parts it already has, that nothing builds');
  say('');
  for (const [label, p] of Object.entries(prize)) {
    say(`${label}`);
    say(`  cards the engine reaches today (automated + promptable)  ${p.reachedToday}`);
    say(`  composable AND reached                                   ${p.composableAndReached}`);
    say(`  composable and NOT reached                               ${p.composableNotReached}`);
    say(`  PURE composition and NOT reached  <- the honest figure   ${p.pureComposableNotReached}`);
  }
  say('');
}

/* ------------------------------------------------------------------ *
 * 6. The greedy ranking: which class to write next, over and over
 *
 * At each step, pick the single uncovered class that completes the most cards
 * outright. This is the front-loading question answered by measurement rather
 * than by taste. Greedy is not provably optimal for set cover, but the marginal
 * gain printed for each pick is exact.
 * ------------------------------------------------------------------ */

const STEPS = 200;
const picks = [];
const covered = new Set(coveredNow);
const blocked = new Map(uncoveredFor); // card -> uncovered fqns, kept live

for (let step = 0; step < STEPS; step++) {
  // Cards blocked by exactly one class vote for that class.
  const votes = new Map();
  for (const [, missing] of blocked) {
    if (missing.length !== 1) continue;
    votes.set(missing[0], (votes.get(missing[0]) ?? 0) + 1);
  }
  if (votes.size === 0) break;

  let best = null;
  let bestN = -1;
  for (const [fqn, n] of votes) {
    if (n > bestN || (n === bestN && fqn < best)) { best = fqn; bestN = n; }
  }

  covered.add(best);
  let completed = 0;
  let completedPure = 0;
  for (const [card, missing] of [...blocked]) {
    const left = missing.filter(f => f !== best);
    if (left.length === 0) { blocked.delete(card); completed++; if (isPure(card)) completedPure++; }
    else if (left.length !== missing.length) blocked.set(card, left);
  }

  const simple = fqnToSimple.get(best) ?? best;
  picks.push({
    step: step + 1,
    fqn: best,
    simple,
    bucket: bySimple.get(simple)?.bucket ?? '?',
    totalCardsNaming: bySimple.get(simple)?.cards ?? 0,
    marginalCards: completed,
    marginalPure: completedPure,
    verdict: verdictOf.get(simple) ?? 'UNGRADED',
    effort: effortOf.get(simple) ?? null,
    note: noteOf.get(simple) ?? '',
  });
}

say('--- GREEDY BUILD ORDER (the first 60 picks) ---');
say('each row: how many cards go from blocked to fully covered by that ONE class');
say('');
say('  #  marginal  cumulative  %pool   bucket        verdict     eff  class');
let cum = fullyCoveredNow;
for (const p of picks.slice(0, 60)) {
  cum += p.marginalCards;
  say(
    `${String(p.step).padStart(3)}  ${String(p.marginalCards).padStart(8)}  ` +
      `${String(cum).padStart(10)}  ${pct(cum, cardEntries.length).padStart(6)}  ` +
      `${p.bucket.padEnd(13)} ${p.verdict.padEnd(11)} ${String(p.effort ?? '-').padStart(3)}  ${p.simple}`
  );
}
say('');

const tranche = (from, to) => {
  const slice = picks.slice(from, to);
  const gain = slice.reduce((a, p) => a + p.marginalCards, 0);
  const gainPure = slice.reduce((a, p) => a + p.marginalPure, 0);
  const effort = slice.reduce((a, p) => a + (p.effort ?? 2), 0);
  return { classes: slice.length, gain, gainPure, effort };
};

say('--- TRANCHES ---');
say('effort is the SUM of the 0-3 estimates, and 2 is assumed for an ungraded class');
say('"pure" is the share of the gain whose class list is the WHOLE card in XMage,');
say('so it is what a class-composition path can build without also writing Java');
say('');
say('tranche          classes   cards gained    of those pure   cumulative   %pool    effort  cards/effort');
let running = fullyCoveredNow;
const trancheDefs = [
  ['1  picks 1-10', 0, 10],
  ['2  picks 11-25', 10, 25],
  ['3  picks 26-50', 25, 50],
  ['4  picks 51-100', 50, 100],
  ['5  picks 101-200', 100, 200],
];
const trancheRows = [];
for (const [label, from, to] of trancheDefs) {
  const t = tranche(from, to);
  running += t.gain;
  const ratio = t.effort === 0 ? '-' : (t.gain / t.effort).toFixed(0);
  trancheRows.push({ label, ...t, cumulative: running, pct: pct(running, cardEntries.length) });
  say(
    `${label.padEnd(16)} ${String(t.classes).padStart(7)}   ${String(t.gain).padStart(12)}   ` +
      `${String(t.gainPure).padStart(13)}   ${String(running).padStart(10)}   ${pct(running, cardEntries.length).padStart(6)}  ${String(t.effort).padStart(6)}  ${ratio.padStart(12)}`
  );
}
say('');

/* ------------------------------------------------------------------ *
 * 7. The join: could a name-keyed map drive our catalogue directly?
 *
 * This is the evidence for the (a) vs (b) decision. Same pool filter as
 * scripts/verify-ability-coverage.mjs, written out again rather than imported
 * so the two can disagree.
 * ------------------------------------------------------------------ */

if (existsSync(ORACLE)) {
  const NOT_A_CARD = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'front_card']);
  const NOT_A_NORMAL_GAME = new Set(['planar', 'scheme', 'vanguard']);
  const NOT_A_GAME_PRODUCT = new Set(['token', 'memorabilia']);

  const pool = [];
  const rl = createInterface({ input: createReadStream(ORACLE), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const c = JSON.parse(line);
    if (NOT_A_CARD.has(c.layout)) continue;
    if (NOT_A_GAME_PRODUCT.has(c.set_type)) continue;
    if (NOT_A_NORMAL_GAME.has(c.layout)) continue;
    if (c.digital) continue;
    if (!(c.games ?? []).includes('paper')) continue;
    pool.push(c);
  }

  const xmageNames = new Set(Object.keys(cardToClasses));
  let exact = 0;
  let frontFace = 0;
  let none = 0;
  const noneByLayout = new Map();
  const noneBySetType = new Map();
  const noneSamples = [];
  /*
   * The blind spot only matters for a card somebody can put in a deck. An
   * Unfinity card and a playtest card from a Mystery Booster are not cards this
   * app has to run, so the join is scored twice: over the whole pool, and over
   * the Commander-legal part of it.
   */
  let commanderLegal = 0;
  let commanderLegalUnjoined = 0;

  for (const c of pool) {
    const isCommanderLegal = c.legalities?.commander === 'legal';
    if (isCommanderLegal) commanderLegal++;
    if (xmageNames.has(c.name)) { exact++; continue; }
    const front = String(c.name).split(' // ')[0];
    if (front !== c.name && xmageNames.has(front)) { frontFace++; continue; }
    none++;
    if (isCommanderLegal) commanderLegalUnjoined++;
    noneByLayout.set(c.layout, (noneByLayout.get(c.layout) ?? 0) + 1);
    noneBySetType.set(c.set_type, (noneBySetType.get(c.set_type) ?? 0) + 1);
    if (noneSamples.length < 20) noneSamples.push(`${c.name} [${c.set}, ${c.layout}]`);
  }

  const joined = exact + frontFace;
  say('--- THE JOIN, FOR THE (a) vs (b) DECISION ---');
  say(`our pool (same filter as verify-ability-coverage.mjs)  ${pool.length}`);
  say(`xmage names in the map                                 ${xmageNames.size}`);
  say(`joined on the printed name exactly                     ${exact}  (${pct(exact, pool.length)}%)`);
  say(`joined on the front face of a "A // B" name            ${frontFace}  (${pct(frontFace, pool.length)}%)`);
  say(`JOINED, either way                                     ${joined}  (${pct(joined, pool.length)}%)`);
  say(`NO ENTRY IN XMAGE AT ALL                               ${none}  (${pct(none, pool.length)}%)`);
  say('');
  say(`Commander-legal cards in the pool                       ${commanderLegal}`);
  say(`  of those, NO ENTRY IN XMAGE                           ${commanderLegalUnjoined}  (${pct(commanderLegalUnjoined, commanderLegal)}%)`);
  say('');
  say('  the unjoined, by set_type:');
  for (const [t, n] of [...noneBySetType].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    say(`    ${String(t).padEnd(18)} ${n}`);
  }
  say('  the unjoined, by layout:');
  for (const [layout, n] of [...noneByLayout].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    say(`    ${String(layout).padEnd(18)} ${n}`);
  }
  say('  a sample of the unjoined:');
  for (const s of noneSamples) say(`    ${s}`);
  say('');

  writeFileSync(
    OUT_JSON,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        script: 'scripts/xmage-class-worklist.mjs',
        groundTruth: { script: truth.script, generatedAt: truth.generatedAt, commit: truth.source.commit, licence: truth.source.licence },
        tableIntegrity: { rows: VERDICTS.length, matched: verdictOf.size, unknownNames, outOfOrder },
        byVerdict: Object.fromEntries(byVerdict),
        free: { classes: freeClasses.size, ofTotal: ranking.length, byReason: Object.fromEntries(freeByReason) },
        standing: {
          coveredClasses: coveredNow.size,
          fullyCoveredCards: fullyCoveredNow,
          fullyCoveredPure: composablePure.length,
          pureCardsInPool: pureCards,
          ofCards: cardEntries.length,
          blockedByOne: one,
          blockedByTwo: two,
        },
        prize,
        picks,
        tranches: trancheRows,
        join: {
          pool: pool.length,
          xmageNames: xmageNames.size,
          exact,
          frontFace,
          joined,
          none,
          commanderLegal,
          commanderLegalUnjoined,
          noneByLayout: Object.fromEntries(noneByLayout),
          noneBySetType: Object.fromEntries(noneBySetType),
        },
        verdicts: VERDICTS.map(([name, verdict, effort, note]) => ({ name, verdict, effort, note, cards: bySimple.get(name)?.cards ?? null, bucket: bySimple.get(name)?.bucket ?? null })),
      },
      null,
      1
    )
  );
} else {
  say(`--- THE JOIN --- skipped, ${ORACLE} is not present`);
}

writeFileSync(OUT_TXT, lines.join('\n'));
say(`wrote ${OUT_TXT}`);
say(`wrote ${OUT_JSON}`);
