/**
 * The prompt sent to the model when we ask it to compile oracle text into our
 * ability DSL.
 *
 * ## This file has ZERO imports, on purpose
 *
 * A byte-identical copy lives at `supabase/functions/dsl-compile-batch/prompt.ts`,
 * because the edge function is the only place that holds the API key and it
 * cannot import from `src/`. `llm-validation.test.ts` reads both files and asserts
 * they are byte-for-byte the same, so the copy cannot drift silently — which is
 * the failure mode where the model is told about a DSL we no longer have and
 * every validation stage downstream blames the model for our own staleness.
 *
 * Nothing may be imported here, not even a type: an `import type` line is erased
 * by the compiler but is NOT erased from the file on disk, so the copy would
 * fail to resolve under Deno.
 *
 * ## What the prompt is designed to make happen
 *
 * The model is asked to REFUSE. Every instruction that could go either way is
 * written so that "I could not express this exactly" is the cheap, obvious,
 * rewarded answer and a guess is the expensive one. That is the same precision-
 * over-recall rule the hand-written compiler follows, pushed up into the prompt,
 * because the validator downstream can catch a malformed guess but cannot catch
 * a well-formed one.
 *
 * Three properties the prompt asks for exist so that a LATER stage can check the
 * model rather than trust it:
 *   - `text` on every ability and every unparsed clause must be a VERBATIM span
 *     of the oracle text. The harness locates it; a paraphrase fails to locate
 *     and the card is rejected. This is what makes the round-trip check possible
 *     at all.
 *   - `needs` names the engine primitive the model wanted and did not find. That
 *     is the second, more valuable output of the whole exercise: a build list
 *     derived from OUR catalogue instead of XMage's.
 *   - `{do:'manual'}` is forbidden. `manual` is the hand-written compiler's
 *     marker for "a human resolves this"; if the model could emit it, LLM output
 *     and compiler output would become indistinguishable in the coverage tables.
 */

/** Bumped whenever the grammar or the rules change. Stored on every row so a
 *  re-run can tell which prompt produced which answer. */
export const PROMPT_VERSION = 'dsl-compile-2026-08-19.3';

/**
 * The DSL, written as TypeScript declarations because that is the most
 * token-efficient form a model reads accurately. It is a trimmed transcription
 * of `dsl.ts`; `llm-validation.test.ts` cross-checks every tag string in here
 * against the tags the runtime validator actually accepts, in both directions,
 * so a member added to `dsl.ts` and not to this text is a failing test rather
 * than a silently unreachable feature.
 */
export const DSL_GRAMMAR = `
type ManaColor = 'W'|'U'|'B'|'R'|'G'|'C';
type Zone = 'library'|'hand'|'battlefield'|'graveyard'|'exile'|'command'|'stack';
type Step = 'untap'|'upkeep'|'draw'|'precombat_main'|'begin_combat'|'declare_attackers'
          |'declare_blockers'|'combat_damage'|'end_combat'|'postcombat_main'|'end'|'cleanup';
type Cmp = 'lt'|'lte'|'eq'|'gte'|'gt'|'ne';
type Duration = 'end-of-turn'|'your-next-turn'|'while-source-on-battlefield'|'permanent';

interface TokenSpec { name: string; typeLine?: string; power?: string; toughness?: string;
                      colorIdentity?: ManaColor[]; keywords?: string[]; oracleText?: string }

type Selector =
  | { sel:'self' } | { sel:'none' } | { sel:'each' }
  | { sel:'target'; ref:number }
  | { sel:'trigger-source' } | { sel:'trigger-subject' } | { sel:'attached' }
  | { sel:'all'; where:CardFilter; zone?:Zone; controller?:PlayerSelector };

type CardFilter =
  | { is:'type'|'subtype'|'supertype'|'name'|'keyword'; value:string }
  | { is:'color'; value:ManaColor } | { is:'colorless' } | { is:'multicolored' }
  | { is:'tapped' } | { is:'untapped' } | { is:'attacking' } | { is:'blocking' } | { is:'blocked' }
  | { is:'token' } | { is:'commander' } | { is:'other' } | { is:'any' }
  | { is:'has-counter'; counter:string; atLeast?:number }
  | { is:'power'|'toughness'|'mana-value'; cmp:Cmp; value:ValueExpr }
  | { is:'not'; of:CardFilter } | { is:'and'; of:CardFilter[] } | { is:'or'; of:CardFilter[] };

type PlayerSelector =
  | { who:'you' } | { who:'each-opponent' } | { who:'each-player' } | { who:'active' }
  | { who:'defending' } | { who:'monarch' }
  | { who:'trigger-player' }                       // "that player" is the one the trigger was ABOUT
  | { who:'target-player'; ref:number }
  | { who:'controller-of'; of:Selector } | { who:'owner-of'; of:Selector };

type WatchWindow = 'this-turn'|'this-game';
type WatchedEvent =
  | { saw:'spell-cast'; what?:CardFilter; by?:PlayerSelector }
  | { saw:'land-played'; by?:PlayerSelector }
  | { saw:'died'; what?:CardFilter; controller?:PlayerSelector }
  | { saw:'entered'; what?:CardFilter; controller?:PlayerSelector }
  | { saw:'attacked'; what?:CardFilter; controller?:PlayerSelector }
  | { saw:'token-created'; by?:PlayerSelector }
  | { saw:'drew'; by?:PlayerSelector }
  | { saw:'gained-life'; by?:PlayerSelector } | { saw:'lost-life'; by?:PlayerSelector }
  | { saw:'dealt-damage'; by?:PlayerSelector; to?:'player'|'permanent'|'any' };
interface WatchQuery { event:WatchedEvent; window:WatchWindow; measure:'events'|'amount' }

type ValueExpr =
  | number | { v:'x' }
  | { v:'count'; of:Selector } | { v:'count-players'; of:PlayerSelector }
  | { v:'power'|'toughness'|'mana-value'; of:Selector }
  | { v:'counters'; of:Selector; counter:string }
  | { v:'life'; of:PlayerSelector }
  | { v:'cards-in'; zone:Zone; of:PlayerSelector }
  | { v:'add'; of:ValueExpr[] } | { v:'sub'; a:ValueExpr; b:ValueExpr }
  | { v:'mul'; of:ValueExpr[] } | { v:'div'; a:ValueExpr; b:ValueExpr }
  | { v:'min'; of:ValueExpr[] } | { v:'max'; of:ValueExpr[] }
  | { v:'if'; condition:Condition; then:ValueExpr; else:ValueExpr }
  | { v:'watch'; query:WatchQuery };

type Condition =
  | { if:'count'; of:Selector; cmp:Cmp; value:ValueExpr }
  | { if:'value'; a:ValueExpr; cmp:Cmp; b:ValueExpr }
  | { if:'controls'; who:PlayerSelector; what:CardFilter; cmp:Cmp; value:ValueExpr }
  | { if:'step'; is:Step[] } | { if:'your-turn' }
  | { if:'first-time-this-turn'; key:string }
  | { if:'not'; of:Condition } | { if:'and'; of:Condition[] } | { if:'or'; of:Condition[] };

interface ManaSpendRestriction { spendOn:'cast'|'activate'|'cast-or-activate'; what?:CardFilter; text:string }

type Effect =
  | { do:'gain-life'|'lose-life'|'set-life'; who:PlayerSelector; amount:ValueExpr }
  | { do:'damage'; to:Selector|PlayerSelector; amount:ValueExpr }
  | { do:'poison'; who:PlayerSelector; amount:ValueExpr }
  | { do:'draw'|'mill'; who:PlayerSelector; count:ValueExpr }
  | { do:'discard'; who:PlayerSelector; count:ValueExpr; random?:boolean }
  | { do:'move-zone'; what:Selector; to:Zone; position?:'top'|'bottom'|number; tapped?:boolean }
  | { do:'destroy'; what:Selector }
  | { do:'sacrifice'; who:PlayerSelector; what:Selector; count:ValueExpr }
  | { do:'exile'; what:Selector }
  | { do:'return-from'; zone:Zone; who:PlayerSelector; what:Selector; count:ValueExpr; to:Zone }
  | { do:'search-library'; who:PlayerSelector; what:Selector; count:ValueExpr; to:Zone; thenShuffle:boolean; tapped?:boolean }
  | { do:'shuffle'; who:PlayerSelector }
  | { do:'create-token'; who:PlayerSelector; token:TokenSpec; count:ValueExpr; tapped?:boolean }
  | { do:'tap'|'untap'; what:Selector }
  | { do:'add-counters'|'remove-counters'; what:Selector; counter:string; count:ValueExpr }
  | { do:'pump'; what:Selector; power:ValueExpr; toughness:ValueExpr; grant?:string[]; duration:Duration }
  | { do:'gain-control'; what:Selector; who:PlayerSelector; duration:Duration }
  | { do:'add-mana'; who:PlayerSelector; mana:string; count?:ValueExpr; restriction?:ManaSpendRestriction }
  | { do:'player-counter'; who:PlayerSelector; counter:string; count:ValueExpr }
  | { do:'set-monarch'; who:PlayerSelector }
  | { do:'lose-game'|'win-game'; who:PlayerSelector }
  | { do:'attach'; what:Selector; to:Selector }   // equip / an Aura entering attached
  | { do:'counter'; what:Selector }
  | { do:'scry'; who:PlayerSelector; count:ValueExpr }        // CR 701.18, top N, any number to the BOTTOM
  | { do:'surveil'; who:PlayerSelector; count:ValueExpr }     // CR 701.44, top N, any number to the GRAVEYARD
  | { do:'look-and-pick'; who:PlayerSelector; look:ValueExpr; pick:ValueExpr; upTo:boolean;
      what?:CardFilter; pickedTo:CardDestination; restTo:CardDestination }   // look at the top N, take some, the rest go where it says
  | { do:'unless-pays'; who:PlayerSelector; cost:Cost[]; effects:Effect[] }   // somebody ELSE is offered the cost; effects run if they decline
  | { do:'do-if-cost-paid'; who:PlayerSelector; cost:Cost[]; optional:boolean; then:Effect[]; else?:Effect[] }   // "you may pay {2}. If you do, ..."; then runs if they PAY
  | { do:'if'; condition:Condition; then:Effect[]; else?:Effect[] }
  | { do:'for-each'; over:Selector|PlayerSelector; effects:Effect[] }
  | { do:'repeat'; times:ValueExpr; effects:Effect[] }
  | { do:'choose-mode'; min:ValueExpr; max:ValueExpr; modes:{ text:string; effects:Effect[] }[] }
  | { do:'may'; who:PlayerSelector; text:string; effects:Effect[] };

type Cost =
  | { pay:'mana'; cost:string } | { pay:'tap' } | { pay:'untap' }
  | { pay:'tap-others'; what:Selector; count:ValueExpr }
  | { pay:'sacrifice'; what:Selector; count:ValueExpr }
  | { pay:'discard'; what?:Selector; count:ValueExpr; random?:boolean }
  | { pay:'exile'; from:Zone; what:Selector; count:ValueExpr }
  | { pay:'life'; amount:ValueExpr }
  | { pay:'remove-counters'; counter:string; count:ValueExpr; from?:Selector }
  | { pay:'add-counters'; counter:string; count:ValueExpr; to?:Selector }
  | { pay:'return-to-hand'; what:Selector; count:ValueExpr }
  | { pay:'reveal'; what:Selector; count:ValueExpr };

type Restriction =
  | { rule:'cant-attack'|'cant-block'|'must-attack'|'cant-untap'; who:Selector; unless?:Condition }
  | { rule:'cant-be-blocked-except-by'; who:Selector; by:Selector }
  | { rule:'cant-be-targeted'; who:Selector; by:PlayerSelector }
  | { rule:'cant-cast'; what:Selector; who:PlayerSelector }
  | { rule:'max-lands-per-turn'; who:PlayerSelector; n:ValueExpr }
  | { rule:'damage-prevention'; to:Selector; from?:Selector; amount:ValueExpr|'all' };

type Modification =
  | { layer:'control'; newController:PlayerSelector }
  | { layer:'type'; addTypes?:string[]; addSubtypes?:string[]; removeTypes?:string[] }
  | { layer:'color'; setColors:ManaColor[] }
  | { layer:'ability'; grant?:string[]; remove?:string[] }
  | { layer:'pt-set'; power:ValueExpr; toughness:ValueExpr }
  | { layer:'pt-modify'; power:ValueExpr; toughness:ValueExpr }
  | { layer:'pt-switch' }
  | { layer:'cost-modify'; applies:Selector; delta:ValueExpr; genericOnly?:boolean; forWhom:PlayerSelector }
  | { layer:'restriction'; rule:Restriction };

type TriggerEvent =
  | { on:'enters'; who:Selector } | { on:'dies'; who:Selector }
  | { on:'leaves'; who:Selector; from?:Zone }
  | { on:'zone-change'; who:Selector; from:Zone|'any'; to:Zone|'any' }
  | { on:'attacks'; who:Selector } | { on:'blocks'; who:Selector } | { on:'becomes-blocked'; who:Selector }
  | { on:'deals-damage'; source:Selector; to?:'any'|'player'|'creature'|'planeswalker'; combatOnly?:boolean }
  | { on:'dealt-damage'; who:Selector }
  | { on:'cast'; what:Selector; by?:PlayerSelector }
  | { on:'step'; step:Step; whose:PlayerSelector }
  | { on:'tapped'|'untapped'; who:Selector }
  | { on:'counter-added'; who:Selector; counter:string }
  | { on:'gains-life'|'loses-life'; whose:PlayerSelector }
  | { on:'draws-card'; whose:PlayerSelector }
  | { on:'sacrificed'; who:Selector };

type ReplaceableEvent =
  | { on:'enters'; who:Selector }
  | { on:'damage'; to:Selector; from?:Selector; combatOnly?:boolean }
  | { on:'draw'; whose:PlayerSelector } | { on:'dies'; who:Selector }
  | { on:'counter-placed'; target:Selector; counter?:string }
  | { on:'life-gain'|'life-loss'; whose:PlayerSelector }
  | { on:'token-created'; whose:PlayerSelector }
  | { on:'step'; step:Step; whose:PlayerSelector };

type ReplacementResult =
  | { do:'enters-tapped' }
  | { do:'enters-with-counters'; counter:string; count:ValueExpr }
  | { do:'enters-under-control'; controller:PlayerSelector }
  | { do:'prevent'; amount:ValueExpr|'all' }
  | { do:'redirect'; to:TargetSpec }
  | { do:'multiply'; factor:ValueExpr }
  | { do:'replace-zone'; to:Zone } | { do:'skip' }
  | { do:'additional'; effects:Effect[] };

interface TargetSpec { ref:number; what:'card'|'player'|'any'; filter?:CardFilter; zone?:Zone;
                       controller?:PlayerSelector; min:number; max:number; distinct?:boolean; prompt:string }

// Every ability carries: text (VERBATIM oracle span).
type Ability =
  | { kind:'triggered'; text:string; event:TriggerEvent; activeZones?:Zone[]; condition?:Condition;
      interveningIf?:boolean; optional?:boolean; limit?:{per:'turn'|'game';count:number};
      targets?:TargetSpec[]; effects:Effect[] }
  | { kind:'activated'; text:string; costs:Cost[]; activeZones?:Zone[]; timing?:'any'|'sorcery';
      condition?:Condition; limit?:{per:'turn'|'game';count:number}; targets?:TargetSpec[];
      effects:Effect[]; isManaAbility?:boolean; isLoyalty?:boolean }
  | { kind:'static'; text:string; activeZones?:Zone[]; condition?:Condition; affects:Selector;
      modifications:Modification[] }
  | { kind:'replacement'; text:string; activeZones?:Zone[]; condition?:Condition;
      event:ReplaceableEvent; result:ReplacementResult; selfReplacement?:boolean }
  | { kind:'spell'; text:string; targets?:TargetSpec[]; effects:Effect[] }
  | { kind:'mana'; text:string; costs:Cost[]; activeZones?:Zone[]; effects:Effect[] }
  | { kind:'keyword'; text:string; keyword:string; parameter?:string };

type GapReason = 'copy-layer'|'alt-cast'|'granted-ability'|'layer-dependency'|'state-trigger'
  |'duration'|'hidden-choice'|'needs-history'|'outside-game'|'meta-replacement'|'complex-combat'
  |'stale'|'unrecognised'|'ambiguous'|'multi-face';
`.trim();

/**
 * The type line of the invented card in the worked example below.
 *
 * It is spelled here rather than inline because a Magic type line is printed
 * with an em-dash, which is card notation and not our words. Held on its own,
 * `scripts/probe/em-dash-sweep.mjs` recognises it for what it is instead of
 * reporting the whole prompt. The text the model receives is unchanged.
 */
const EXAMPLE_TYPE_LINE = 'Creature — Elf';

export const SYSTEM_PROMPT = `You compile Magic: The Gathering oracle text into a fixed JSON ability DSL for a rules engine.

THE ONLY RULE THAT MATTERS: precision over recall. A wrong ability corrupts a real
game of Magic. A missing one just means a human resolves it by hand, which is fine.
If you are not certain a clause maps EXACTLY onto the grammar below, do not map it.
Put it in "unparsed" and name what you needed in "needs". You are scored on how
little you invent, not on how much you cover. Refusing is a correct answer, and it
is the answer we want whenever there is any doubt at all.

THE GRAMMAR. This is the complete vocabulary. There is nothing else.
${DSL_GRAMMAR}

THE OUTPUT ENVELOPE. Raw JSON only. No markdown fence, no prose, no commentary.

{"results":[
  {"oracle_id":"<echo the id you were given>",
   "abilities":[ <Ability>, … ],
   "unparsed":[ {"text":"<verbatim span>","reason":"<GapReason>"}, … ],
   "needs":[ {"primitive":"<lowerCamelCaseId>","why":"<one clause>"}, … ]}
]}

Exactly one result object per card, in the order you were given them.

THE FOUR RULES THAT DISCARD THE MOST CARDS. Read these twice.

A. "unparsed" and "needs" are keys of the RESULT OBJECT and appear there exactly
   once each, beside "abilities". They may NEVER appear anywhere else: not inside
   an ability, not inside an effect, not inside a value, not inside a target, not
   inside a modification, not at any depth. An "unparsed" or "needs" key found
   below the result object is an unknown field and the entire card is discarded.
   If ONE ability of a card cannot be expressed, do not annotate that ability.
   Leave it out of "abilities" entirely and put its verbatim text in the card's
   one top-level "unparsed" array.

B. There is no "manual" anywhere in this grammar. Not as a "do", not as a "sel",
   not as a "v", not as a "who", not as a "rule", not as anything. If you find
   yourself reaching for a way to write "a human handles this", that is the
   signal to move the whole ability into "unparsed" instead.

C. Mana is always fully braced, one pair of braces per symbol.
   Correct: "{3}{R}{R}", "{1}{G}", "{C}", "{2}{W}{W}".
   Wrong and discarded: "3RR", "1R", "R", "C", "3{R}{R}".

D. "min" and "max" on a target are plain integers. Never an expression, never an
   object, never a string. If how many things a spell targets is variable, the
   ability cannot be represented. Put it in "unparsed".

THE REST OF THE RULES

1. Use ONLY the tag values in the grammar. Never invent a "do", "sel", "is", "v",
   "if", "pay", "on", "layer", "who", "saw" or "rule" value. An invented tag
   discards the whole card, including the parts you got right.
2. Every "text", on an ability and on an unparsed clause alike, must be a VERBATIM
   contiguous substring of the card's oracle_text, copied exactly, including
   punctuation and capitalisation. Do not paraphrase, do not normalise, do not
   join two sentences that are not adjacent, and never emit an empty "text".
3. Together, the "text" of every ability plus every unparsed clause must account
   for ALL of the oracle text. Nothing may be silently left out. Reminder text in
   parentheses may be omitted; nothing else may.
4. Do not emit "id", "confidence", "coverage", "span", "oracleHash" or "source".
   Those are assigned downstream and yours are ignored.
5. Numbers are numbers, not strings. "draw two cards" is count: 2.
6. An ability object carries only the keys its "kind" allows. A "spell" has no
   "costs". A "static" has no "effects". Its content is "modifications", which
   must not be empty. A "triggered" has exactly one "event".
7. There is no way to combine two trigger events into one. A card that triggers on
   two different things has two separate abilities.
8. Targets are declared in "targets" with ref 0,1,2… and referred to as
   { sel:'target', ref:0 } or { who:'target-player', ref:0 }. "up to three" is
   min 0, max 3.
9. Keyword abilities (flying, trample, ward {2}, protection from red) are
   { kind:'keyword' }. Do not expand them into effects.
10. A creature with no rules text has abilities: [] and unparsed: []. That is a
    complete, correct answer.
11. Only the FRONT face is in scope. A back face, a split half or an adventure
    goes in "unparsed" with reason 'multi-face', or 'alt-cast' for split,
    adventure and aftermath layouts.

THE "needs" FIELD. As valuable to us as the DSL itself.
Whenever you put something in "unparsed", add one entry to the card's "needs"
naming the single engine capability that was missing, as a short lowerCamelCase
identifier plus one clause of explanation. Use the SAME identifier every time you
meet the same missing capability, across every card, so they can be counted.
Prefer a specific verb to a vague category: "fightTargetCreature" not "combat";
"copyPermanent" not "copyEffects"; "castFromExile" not "alternativeCosts".
Never add a "needs" entry for something the grammar already covers.

WORKED EXAMPLE. The exact shape of a correct answer, for two cards.

Input:
 {"oracle_id":"a1","name":"Sear","type_line":"Instant","oracle_text":"Sear deals 3 damage to target creature."}
 {"oracle_id":"a2","name":"Grove Warden","type_line":"${EXAMPLE_TYPE_LINE}","oracle_text":"Flying\nWhen Grove Warden enters, you gain 2 life.\nGrove Warden assigns combat damage equal to its toughness rather than its power."}

Output:
{"results":[
 {"oracle_id":"a1",
  "abilities":[
   {"kind":"spell","text":"Sear deals 3 damage to target creature.",
    "targets":[{"ref":0,"what":"card","filter":{"is":"type","value":"Creature"},"min":1,"max":1,"prompt":"Choose target creature"}],
    "effects":[{"do":"damage","to":{"sel":"target","ref":0},"amount":3}]}],
  "unparsed":[],"needs":[]},
 {"oracle_id":"a2",
  "abilities":[
   {"kind":"keyword","text":"Flying","keyword":"Flying"},
   {"kind":"triggered","text":"When Grove Warden enters, you gain 2 life.",
    "event":{"on":"enters","who":{"sel":"self"}},
    "effects":[{"do":"gain-life","who":{"who":"you"},"amount":2}]}],
  "unparsed":[{"text":"Grove Warden assigns combat damage equal to its toughness rather than its power.","reason":"complex-combat"}],
  "needs":[{"primitive":"assignsDamageByToughness","why":"no way to change which characteristic assigns combat damage"}]}
]}`;

export interface PromptCard {
  oracle_id: string;
  name: string;
  type_line: string;
  mana_cost?: string;
  oracle_text: string;
  power?: string;
  toughness?: string;
  layout?: string;
}

/** The user turn: just the cards, as compact JSON. The grammar lives in the system turn. */
export function buildUserPrompt(cards: readonly PromptCard[]): string {
  const body = cards.map((c) => ({
    oracle_id: c.oracle_id,
    name: c.name,
    type_line: c.type_line,
    mana_cost: c.mana_cost || undefined,
    power: c.power || undefined,
    toughness: c.toughness || undefined,
    layout: c.layout || undefined,
    oracle_text: c.oracle_text,
  }));
  return `Compile these ${cards.length} cards. Return one result per card, in order.\n\n${JSON.stringify(body, null, 1)}`;
}
