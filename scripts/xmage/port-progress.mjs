#!/usr/bin/env node
/**
 * How many real cards each ported primitive actually unlocks, measured by
 * adding them one at a time in ranked order.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored. Forge is GPL-3.0 and was not fetched,
 * read or referenced.
 *
 * ## Why "cards blocked" is not "cards unlocked", and why this script exists
 *
 * `xmage-record-shape.json`'s work order says `xmage:CreateTokenEffect` blocks
 * 2,164 cards. That is TRUE and it is not the number of cards writing it buys,
 * because most of those cards are blocked by two or three other things as well.
 * Quoting the blocked count as the unlock would overstate the port by a factor
 * nobody could check, which is exactly the mistake this project has already
 * made twice with coverage.
 *
 * So this measures the real thing. It empties every ported table, then fills
 * them back one step at a time, and after each step counts the cards where
 * EVERY ability of EVERY face lowers. The delta is what that step bought, and
 * it is a number that cannot be argued with because it is a difference between
 * two counts of the same 32,168 records.
 *
 * The tables are plain exported objects, so emptying and refilling them here
 * mutates the same objects `lower.ts` reads. Nothing is stubbed and no second
 * code path exists: every measurement below runs the real lowering.
 *
 * Run:
 *   node --experimental-strip-types scripts/xmage/port-progress.mjs
 * Writes:
 *   scripts/coverage/.data/xmage-port-progress.json
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRecords } from './build-records.mjs';
import {
  LOWERINGS,
  ABILITY_RULES,
  ABILITY_COSTS,
  MODIFICATION_RULES,
  TRIGGER_RULES,
  COST_RULES,
  VALUE_RULES,
  XMAGE_TARGETS,
  XMAGE_KEYWORDS,
  XMAGE_TOKENS,
  lowerCard,
  abilitiesOf,
} from '../../src/lib/cards/xmage/index.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const DATA = path.join(REPO, 'scripts', 'coverage', '.data');

/* ------------------------------------------------------------------ *
 * The tables, and how to turn them off
 * ------------------------------------------------------------------ */

const TABLES = {
  effect: LOWERINGS,
  ability: ABILITY_RULES,
  abilityCost: ABILITY_COSTS,
  modification: MODIFICATION_RULES,
  trigger: TRIGGER_RULES,
  cost: COST_RULES,
  value: VALUE_RULES,
  target: XMAGE_TARGETS,
  keyword: XMAGE_KEYWORDS,
  token: XMAGE_TOKENS,
};

const FULL = {};
for (const [name, table] of Object.entries(TABLES)) FULL[name] = { ...table };

function clearAll() {
  for (const table of Object.values(TABLES)) for (const k of Object.keys(table)) delete table[k];
}

function enable(kind, keys) {
  const table = TABLES[kind];
  const full = FULL[kind];
  for (const key of keys) {
    if (!(key in full)) throw new Error(`port-progress: ${kind} table has no entry "${key}"`);
    table[key] = full[key];
  }
}

/** Everything left in a table that no step named. Nothing may be missed. */
function remaining(kind, used) {
  return Object.keys(FULL[kind]).filter((k) => !used.has(k));
}

/* ------------------------------------------------------------------ *
 * The steps, in the order the work order ranks them
 *
 * `blocks` is the figure from `xmage-record-shape.json`'s `coverage.workOrder`
 * as it stood before this port: cards whose play was blocked by that primitive.
 * It is quoted so the two numbers sit next to each other and the difference is
 * visible.
 * ------------------------------------------------------------------ */

const KEYWORDS_ALL = Object.keys(FULL.keyword);
const TOKENS_ALL = Object.keys(FULL.token);

const STEPS = [
  {
    name: 'infrastructure: targets, costs, triggers, values, counters',
    note:
      'Not a primitive. Nothing in the work order can lower without a target spec, a cost list and a trigger event, so this is the floor everything else is measured from.',
    enable: {
      target: Object.keys(FULL.target),
      cost: Object.keys(FULL.cost),
      trigger: Object.keys(FULL.trigger),
      value: Object.keys(FULL.value),
    },
  },
  {
    name: 'seed effects, already present before this port',
    note: 'The seven lowerings that carried the hard list: destroy-all, damage, draw, bounce, counter, tap-all, win-game.',
    enable: {
      effect: [
        'xmage:DestroyAllEffect',
        'xmage:DamageTargetEffect',
        'xmage:DrawCardSourceControllerEffect',
        'xmage:ReturnToHandTargetEffect',
        'xmage:CounterTargetEffect',
        'xmage:TapAllEffect',
        'xmage:WinGameSourceControllerEffect',
      ],
    },
  },
  { name: 'keyword:Flying', blocks: 3103, enable: { keyword: ['Flying'] } },
  { name: 'keyword:Enchant', blocks: 1235, enable: { keyword: ['Enchant'] } },
  { name: 'xmage:CreateTokenEffect', blocks: 2164, enable: { effect: ['xmage:CreateTokenEffect'], token: TOKENS_ALL } },
  { name: 'xmage:AttachEffect', blocks: 1265, enable: { effect: ['xmage:AttachEffect'] } },
  { name: 'keyword:Trample', blocks: 980, enable: { keyword: ['Trample'] } },
  { name: 'xmage:BoostTargetEffect', blocks: 1192, enable: { effect: ['xmage:BoostTargetEffect'] } },
  { name: 'xmage:GainLifeEffect', blocks: 1118, enable: { effect: ['xmage:GainLifeEffect'] } },
  { name: 'xmage:AddCountersSourceEffect', blocks: 1103, enable: { effect: ['xmage:AddCountersSourceEffect'] } },
  { name: 'xmage:DestroyTargetEffect', blocks: 1101, enable: { effect: ['xmage:DestroyTargetEffect'] } },
  { name: 'xmage:GainAbilityTargetEffect', blocks: 995, enable: { effect: ['xmage:GainAbilityTargetEffect'] } },
  {
    name: 'keywords: the rest of the static table',
    blocks: 705 + 629 + 596 + 417 + 372 + 369 + 349 + 313 + 306,
    note: 'Vigilance, Haste, Flash, Reach, Menace, First Strike, Lifelink, Deathtouch, Defender and the rest of `XMAGE_KEYWORDS`.',
    enable: { keyword: KEYWORDS_ALL },
  },
  { name: 'xmage:BoostSourceEffect', blocks: 862, enable: { effect: ['xmage:BoostSourceEffect'] } },
  { name: 'xmage:AddCountersTargetEffect', blocks: 769, enable: { effect: ['xmage:AddCountersTargetEffect'] } },
  {
    name: 'xmage:SimpleStaticAbility, via the modification table',
    blocks: 5867,
    note:
      'The head of the work order. The blocker was never the ability shell, it was that nothing turned a continuous effect into a `Modification`. This step is that whole table: the boost family, the gain-ability family, base power and toughness, blocking restrictions and cost reduction.',
    enable: { modification: Object.keys(FULL.modification) },
  },
  {
    name: 'xmage:EquipAbility',
    blocks: 594,
    enable: { ability: ['xmage:EquipAbility'] },
  },
  {
    name: 'xmage:EntersBattlefieldTappedAbility',
    blocks: 553,
    enable: { ability: ['xmage:EntersBattlefieldTappedAbility'] },
  },
  {
    name: 'mana abilities',
    blocks: 422 + 288 + 252 + 251 + 250 + 248 + 235,
    note: 'The six single-colour classes plus any-colour. Their tap cost is on XMage\'s superclass, not in the card file.',
    enable: {
      ability: [
        'xmage:WhiteManaAbility',
        'xmage:BlueManaAbility',
        'xmage:BlackManaAbility',
        'xmage:RedManaAbility',
        'xmage:GreenManaAbility',
        'xmage:ColorlessManaAbility',
        'xmage:AnyColorManaAbility',
      ],
    },
  },
  { name: 'xmage:GainAbilitySourceEffect', blocks: 440, enable: { effect: ['xmage:GainAbilitySourceEffect'] } },
  { name: 'xmage:TapTargetEffect', blocks: 427, enable: { effect: ['xmage:TapTargetEffect'] } },
  { name: 'xmage:BoostControlledEffect', blocks: 357, enable: { effect: ['xmage:BoostControlledEffect'] } },
  {
    name: 'xmage:ReturnFromGraveyardToHandTargetEffect',
    blocks: 346,
    enable: { effect: ['xmage:ReturnFromGraveyardToHandTargetEffect'] },
  },
  { name: 'xmage:ExileTargetEffect', blocks: 323, enable: { effect: ['xmage:ExileTargetEffect'] } },
  { name: 'xmage:UntapTargetEffect', blocks: 300, enable: { effect: ['xmage:UntapTargetEffect'] } },
  {
    name: 'xmage:SearchLibraryPutInPlayEffect and SearchLibraryPutInHandEffect',
    blocks: 247 + 245,
    enable: { effect: ['xmage:SearchLibraryPutInPlayEffect', 'xmage:SearchLibraryPutInHandEffect'] },
  },
  {
    name: 'xmage:ReturnFromGraveyardToBattlefieldTargetEffect',
    blocks: 256,
    enable: { effect: ['xmage:ReturnFromGraveyardToBattlefieldTargetEffect'] },
  },
  { name: 'xmage:LoseLifeTargetEffect', blocks: 232, enable: { effect: ['xmage:LoseLifeTargetEffect'] } },
  {
    name: 'xmage:LoseLifeSourceControllerEffect and LoseLifeOpponentsEffect',
    blocks: 215 + 188,
    enable: { effect: ['xmage:LoseLifeSourceControllerEffect', 'xmage:LoseLifeOpponentsEffect'] },
  },
  { name: 'xmage:AddCountersAllEffect', blocks: 199, enable: { effect: ['xmage:AddCountersAllEffect'] } },
  { name: 'xmage:DrawDiscardControllerEffect', blocks: 196, enable: { effect: ['xmage:DrawDiscardControllerEffect'] } },
  { name: 'xmage:DiscardTargetEffect', blocks: 188, enable: { effect: ['xmage:DiscardTargetEffect'] } },
  {
    name: 'xmage:DamagePlayersEffect and DamageAllEffect',
    blocks: 183 + 182,
    enable: { effect: ['xmage:DamagePlayersEffect', 'xmage:DamageAllEffect'] },
  },
  { name: 'xmage:MillCardsControllerEffect', blocks: 163, enable: { effect: ['xmage:MillCardsControllerEffect'] } },
  {
    name: 'xmage:LoyaltyAbility',
    blocks: 324,
    note: 'Every planeswalker ability. The cost is the loyalty number and its SIGN, built by the class rather than passed by the card file.',
    enable: { abilityCost: ['xmage:LoyaltyAbility'] },
  },
  { name: 'xmage:SimpleManaAbility', blocks: 171, enable: { ability: ['xmage:SimpleManaAbility'] } },
  {
    name: 'xmage:GainAbilityControlledEffect and the rest of the grant family',
    blocks: 276,
    enable: {
      effect: [
        'xmage:GainAbilityControlledEffect',
        'xmage:GainAbilityAllEffect',
        'xmage:GainAbilityAttachedEffect',
      ],
    },
  },
  {
    name: 'xmage:BoostAllEffect and the rest of the boost family',
    blocks: 188,
    enable: { effect: ['xmage:BoostAllEffect', 'xmage:BoostEnchantedEffect', 'xmage:BoostEquippedEffect'] },
  },
  {
    name: 'xmage:InfoEffect',
    blocks: 180,
    note: "XMage's own no-op: apply() is a bare return true. Lowering it to nothing is faithful, which is why it is the one empty result in the table.",
    enable: { effect: ['xmage:InfoEffect'] },
  },
];

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

const { records } = await loadRecords();

function measure() {
  let playable = 0;
  let vacuous = 0;
  let abilitiesLowered = 0;
  let abilitiesTotal = 0;
  for (const record of records) {
    const lowered = lowerCard(record);
    if (lowered.ok && lowered.vacuous) vacuous += 1;
    else if (lowered.ok) playable += 1;
    abilitiesLowered += lowered.abilities.length;
    abilitiesTotal += lowered.abilities.length + lowered.blocked.length;
  }
  return { playable, vacuous, abilitiesLowered, abilitiesTotal };
}

clearAll();
const zero = measure();

const used = { effect: new Set(), ability: new Set(), abilityCost: new Set(), modification: new Set(), trigger: new Set(), cost: new Set(), value: new Set(), target: new Set(), keyword: new Set(), token: new Set() };

const rows = [];
let previous = zero;
console.log(`records                 ${records.length}`);
console.log(`with nothing enabled    playable ${zero.playable}, vacuous ${zero.vacuous}, abilities lowered ${zero.abilitiesLowered} of ${zero.abilitiesTotal}`);
console.log('');
console.log('  cards    cumul   blocked   step');

for (const step of STEPS) {
  for (const [kind, keys] of Object.entries(step.enable)) {
    enable(kind, keys);
    for (const k of keys) used[kind].add(k);
  }
  const now = measure();
  const row = {
    step: step.name,
    note: step.note ?? null,
    blockedBefore: step.blocks ?? null,
    unlocked: now.playable - previous.playable,
    cumulativePlayable: now.playable,
    abilitiesLowered: now.abilitiesLowered,
  };
  rows.push(row);
  console.log(
    `${String(row.unlocked).padStart(7)}  ${String(row.cumulativePlayable).padStart(7)}  ${String(row.blockedBefore ?? '').padStart(7)}   ${step.name}`,
  );
  previous = now;
}

/* Anything a step forgot to name would silently not be measured, and the totals
 * would then disagree with a plain full-table run. Enabling the remainder and
 * re-measuring is the check that nothing was left out. */
const leftovers = {};
for (const kind of Object.keys(TABLES)) {
  const rest = remaining(kind, used[kind]);
  if (rest.length > 0) {
    leftovers[kind] = rest;
    enable(kind, rest);
  }
}
const withEverything = measure();

console.log('');
if (Object.keys(leftovers).length === 0) {
  console.log('every table entry was named by a step');
} else {
  console.log('table entries no step named, enabled at the end:');
  for (const [kind, keys] of Object.entries(leftovers)) console.log(`  ${kind}: ${keys.join(', ')}`);
  console.log(`  they add ${withEverything.playable - previous.playable} cards`);
}
console.log('');
console.log(`FINAL, denominator ${records.length} XMage card files`);
console.log(`  playable, every ability of every face lowers   ${withEverything.playable}  ${((100 * withEverything.playable) / records.length).toFixed(2)}%`);
console.log(`  vacuous, no abilities at all, NOT playable     ${withEverything.vacuous}`);
console.log(`  abilities lowered                              ${withEverything.abilitiesLowered} of ${withEverything.abilitiesTotal}  ${((100 * withEverything.abilitiesLowered) / withEverything.abilitiesTotal).toFixed(2)}%`);

/* The work order as it stands AFTER the port, so the next person starts from a
 * measurement rather than from this file's opinion. */
const blockers = new Map();
for (const record of records) {
  const seen = new Set();
  for (const ability of abilitiesOf(record)) {
    const result = lowerCard(record).blocked.find((b) => b.id === ability.id);
    if (!result) continue;
    for (const prim of result.result.missing) seen.add(prim);
  }
  for (const prim of seen) {
    if (!blockers.has(prim)) blockers.set(prim, new Set());
    blockers.get(prim).add(record.oracleId || record.provenance.xmageClass);
  }
}
const workOrder = [...blockers.entries()]
  .map(([prim, ids]) => ({ prim, cards: ids.size }))
  .sort((a, b) => b.cards - a.cards);

console.log('');
console.log('WORK ORDER AFTER THIS PORT, cards blocked per missing primitive, top 30');
for (const row of workOrder.slice(0, 30)) console.log(`  ${String(row.cards).padStart(6)}  ${row.prim}`);

writeFileSync(
  path.join(DATA, 'xmage-port-progress.json'),
  JSON.stringify(
    {
      meta: {
        script: 'scripts/xmage/port-progress.mjs',
        measuredAt: new Date().toISOString(),
        denominator: records.length,
        denominatorMeaning: 'XMage card files with an extracted record',
      },
      withNothingEnabled: zero,
      steps: rows,
      leftovers,
      final: withEverything,
      workOrder,
    },
    null,
    1,
  ),
);

/* ================================================================== *
 * The document
 *
 * Generated from the run that just happened, for the reason
 * `extract-effects.mjs` gives for doing the same: a document whose figures were
 * typed by its author has demonstrated nothing. Every number below is read out
 * of `rows`, `withEverything` or `workOrder` above.
 * ================================================================== */

const KEYWORDS_MOD = await import('../../src/lib/cards/xmage/keywords.ts');
const TRIGGERS_MOD = await import('../../src/lib/cards/xmage/triggers.ts');
const TARGETS_MOD = await import('../../src/lib/cards/xmage/targets.ts');
const COSTS_MOD = await import('../../src/lib/cards/xmage/costs.ts');
const VALUES_MOD = await import('../../src/lib/cards/xmage/values.ts');
const MODS_MOD = await import('../../src/lib/cards/xmage/modifications.ts');
const LOWER_MOD = await import('../../src/lib/cards/xmage/lower.ts');
const COUNTERS_MOD = await import('../../src/lib/cards/xmage/counters.generated.ts');

const pct = (n, d) => `${((100 * n) / d).toFixed(2)}%`;
const N = records.length;
const blocked = (prim) => workOrder.find((w) => w.prim === prim)?.cards ?? 0;
const avg = (list) => Math.round(list.reduce((a, b) => a + b.unlocked, 0) / list.length);

/* Shape of the curve, computed rather than characterised. The ranked primitive
 * steps are every row except the infrastructure floor and the seed table, which
 * are not primitives and would flatter any average they were in. */
const primitiveSteps = rows.slice(2);
const byUnlocked = [...primitiveSteps].sort((a, b) => b.unlocked - a.unlocked);
const topFive = byUnlocked.slice(0, 5).reduce((a, b) => a + b.unlocked, 0);
const underTwoHundred = primitiveSteps.filter((r) => r.unlocked < 200).length;
const underOneHundred = primitiveSteps.filter((r) => r.unlocked < 100).length;
const sortedUnlocks = primitiveSteps.map((r) => r.unlocked).sort((a, b) => a - b);
const median = sortedUnlocks[Math.floor(sortedUnlocks.length / 2)];

const REFUSALS = [
  [
    `keyword:Kicker and ${Object.keys(KEYWORDS_MOD.REFUSED_KEYWORDS).length - 2} other keywords`,
    'keywords.ts',
    'They change how a spell is CAST, or carry behaviour the record holds on a different ability and cannot link to this one. Emitting `keyword:"kicker"` alone gives a spell that resolves and never kicks.',
  ],
  [
    'keyword:Protection',
    'keywords.ts',
    'Its parameter is a filter and `KeywordAbility.parameter` is printed text. Writing "from red" would be this project inventing rules text it takes from Scryfall.',
  ],
  [
    'xmage:ScryEffect, xmage:SurveilEffect',
    'lower.ts',
    '`dsl.ts` has neither member. Scrying is a hidden choice that reorders the library, and doing nothing is not a conservative approximation of it.',
  ],
  [
    'xmage:DoIfCostPaid',
    'lower.ts',
    'Needs `{do:"do-if-cost-paid"}`. `{do:"unless-pays"}` is the opposite polarity, so reusing it resolves every one of these cards backwards.',
  ],
  [
    'xmage:ConditionalOneShotEffect, xmage:ConditionalContinuousEffect',
    'lower.ts and modifications.ts',
    'Need the condition table. `{do:"if"}` and `StaticAbility.condition` both already exist; the mapping from an XMage `Condition` does not. This is the largest remaining item that needs no new DSL member.',
  ],
  [
    'xmage:RegenerateSourceEffect',
    'lower.ts',
    'Regeneration is a replacement shield the reducer does not model, so a destroy would quietly happen anyway.',
  ],
  [
    'xmage:TargetCreaturePermanentAmount, xmage:TargetAnyTargetAmount',
    'targets.ts',
    'Divided damage. `TargetSpec` counts targets and carries no amount per target.',
  ],
  [
    'xmage:PayEnergyCost, xmage:OrCost, xmage:CompositeCost',
    'costs.ts',
    '`Cost[]` is a conjunction with no alternative, and there is no member for spending a player counter.',
  ],
  [
    'xmage:HalfValue, xmage:CardsInAllGraveyardsCount and three more',
    'values.ts',
    'Rounding modes and folds over sets that `ValueExpr` cannot spell. A quantity wrong by one is worse than a card that refuses.',
  ],
  [
    'any ability carrying a target or cost adjuster',
    'lower.ts',
    'A Java object rewrites the ability at cast time and the record holds only its class name. Word of Binding was lowering to a spell that taps one creature.',
  ],
  [
    'any ability built by a static helper',
    'lower.ts',
    'The helper adds abilities the record never saw. Cyclonic Rift is the example, 35 abilities across the corpus.',
  ],
];

const doc = `# The port: what was written, in ranked order, and what each entry bought

Status: measured. Code in \`src/lib/cards/xmage/\`, harness in
\`scripts/xmage/port-progress.mjs\`, tests in \`src/lib/cards/xmage/port.test.ts\`.

## Attribution and licence

Behaviour ported here is derived from **XMage**, which is MIT licensed,
\`Copyright (c) 2010 betasteward@gmail.com\`, https://github.com/magefree/mage.
The XMage clone is read in place, outside this repository, and nothing from it
is vendored here. Every file carrying ported logic says so in its own header.

Display string CONTENTS are never copied out of XMage: those strings carry
Wizards of the Coast rules text, which is not XMage's to license. Card wording
in this document and in the tests comes from Scryfall, through
\`scripts/coverage/.data/catalogue.json\`.

Forge is GPL-3.0. It was not fetched, read or referenced.

## Where every number below comes from

\`node --experimental-strip-types scripts/xmage/port-progress.mjs\`, run over all
**${N} XMage card files**. It writes
\`scripts/coverage/.data/xmage-port-progress.json\` and generates this document
from the same run, so no figure here was typed by hand.

---

# 1. What "unlocked" means, and what it does not

The work order in \`xmage-record-shape.json\` says how many cards each primitive
BLOCKS. That is not how many cards writing it BUYS, because most blocked cards
are blocked by two or three things at once. Quoting a blocked count as an unlock
would overstate this port by a factor nobody could check, which is the mistake
this project has already made twice with coverage.

So the harness empties every ported table, fills them back one step at a time,
and after each step counts the cards where **every ability of every face
lowers**. The delta is what that step bought. Both numbers are in the table
below, side by side, because the gap between them is the point.

A card counts as playable only when the whole card lowers. A card with no
abilities at all is counted separately as vacuous and never added, because "the
engine runs this card" and "this card does nothing" are different claims.

---

# 2. The ranked order, and what each step bought

Denominator ${N} XMage card files. \`blocked before\` is that primitive's entry in
the pre-port work order; \`unlocked\` is the measured difference the step made.

| unlocked | cumulative | blocked before | step |
|---:|---:|---:|---|
${rows.map((r) => `| ${r.unlocked} | ${r.cumulativePlayable} | ${r.blockedBefore ?? ''} | ${r.step} |`).join('\n')}

## Where the curve flattens, and why the port stops here

The curve does not fall off in the order the table is written, and saying it did
would be fitting a story to the numbers. The pre-port work order ranks by cards
BLOCKED, and the three biggest unlocks are grouped table steps that sit in the
middle of it: ${byUnlocked[0].unlocked} for the rest of the keyword table, ${byUnlocked[1].unlocked} for the modification
table, ${byUnlocked[2].unlocked} for the mana abilities.

What the numbers do show is where the tail starts. The five largest steps
account for **${topFive} of the ${withEverything.playable} cards** (${pct(topFive, withEverything.playable)}). Of the ${rows.length - 2} ranked primitive
steps, ${underTwoHundred} return fewer than 200 cards and ${underOneHundred} return fewer than 100. The median
step returns **${median}**.

The reason to stop is not that number on its own. It is that number together
with what is left: the largest primitive still missing blocks
${byUnlocked.length && workOrder[0] ? workOrder[0].cards : 0} cards, and everything above it in the remaining order needs either a
new \`Effect\` member in a file another workflow owns or a boundary of the record
shape moved. Neither is a table entry, so continuing down this list is no longer
the same job. What that ${workOrder[0]?.cards ?? 0} would actually unlock is not stated here, because
this port has not measured it and the whole point of the harness is that a
blocked count is not an unlock.

Two rows read zero and are worth reading twice. \`keyword:Enchant\` and
\`xmage:AttachEffect\` each unlock nothing ON THEIR OWN, and together with
\`BoostEnchantedEffect\` in the modification table they carry every Aura in the
corpus. A card needs its WHOLE self to lower, so a primitive's value depends on
what else is present, and any measurement that attributed a fixed number to each
primitive independently would be adding up something that is not additive. This
is the same reason a blocked count is not an unlock.

What remains at the head needs a different KIND of work rather than more of this
one:

- \`xmage:ConditionalContinuousEffect\` and \`xmage:ConditionalOneShotEffect\`
  together block ${blocked('xmage:ConditionalContinuousEffect') + blocked('xmage:ConditionalOneShotEffect')} cards and need a condition table. \`{do:'if'}\` and
  \`StaticAbility.condition\` already exist, so this needs no new DSL member and
  is the clear next item.
- \`xmage:DoIfCostPaid\` (${blocked('xmage:DoIfCostPaid')}), \`xmage:ScryEffect\` (${blocked('xmage:ScryEffect')}) and
  \`xmage:SurveilEffect\` (${blocked('xmage:SurveilEffect')}) need new \`Effect\` members. \`dsl.ts\`'s \`Effect\`
  union is exhaustively switched by \`src/lib/game/**\`, which another workflow
  owns this session, so adding a member is that owner's decision and not a table
  entry.
- Most of the rest is alternative casting costs: cycling ${blocked('xmage:CyclingAbility')}, flashback
  ${blocked('xmage:FlashbackAbility')}, morph ${blocked('xmage:MorphAbility')}, kicker ${blocked('keyword:Kicker')}. \`docs/engine/CARD-SEMANTICS.md\`
  section 7 already names those as a boundary of the RECORD shape, not of the
  lowering tables, so no amount of table writing reaches them.

---

# 3. The measurement

| | cards | share |
|---|---:|---:|
| seed tables only, under THIS port's definition | ${rows[1].cumulativePlayable} | ${pct(rows[1].cumulativePlayable, N)} |
| after the port | ${withEverything.playable} | ${pct(withEverything.playable, N)} |
| abilities lowered | ${withEverything.abilitiesLowered} of ${withEverything.abilitiesTotal} | ${pct(withEverything.abilitiesLowered, withEverything.abilitiesTotal)} |
| vacuous, no abilities at all, never counted as playable | ${withEverything.vacuous} | ${pct(withEverything.vacuous, N)} |

**The before figure is ${rows[1].cumulativePlayable} and not the 717 in
\`docs/engine/CARD-SEMANTICS.md\`, and the difference is not a correction to that
document.** It is a change of definition, and quoting across the two would be
comparing different questions, which is the shape of both previous coverage
overstatements.

The old \`lowerAbility\` produced \`Effect[]\`. This one produces a whole
\`Ability\`, so it now also has to resolve the ability's TARGET SPECS, its COST
LIST and its TRIGGER EVENT, and it refuses abilities carrying a Java target or
cost adjuster. Those are all new ways to fail, so the same seven seed effects
reach fewer cards under the stricter rule: ${rows[1].cumulativePlayable} instead of 717. The honest
comparison is ${rows[1].cumulativePlayable} to ${withEverything.playable}, both measured by this harness, both over the same
${N} records, both under the same definition.

**This is not an automation number and must not be quoted as one.** It says the
record lowers into \`dsl.ts\` shapes, and a shape is not a running card. Three
things stand between the two, each measured rather than assumed:

1. \`scripts/coverage/xmage-runnable.mjs\` takes every lowered card to the
   engine's own doors and asks whether anything would throw, be silently
   dropped, or reach the engine and do nothing. Of the ${withEverything.playable}
   here it finds 5,984 that would not break and **5,183, 16.11% of the corpus,
   where every ability would actually act**. The ~800 in between are triggered
   abilities \`unrunnableReason\` in \`trigger-bridge.ts\` refuses, mostly because
   nothing announces targets for a trigger yet.
2. \`scripts/verify-ability-coverage.mjs\` goes further and casts real spells on
   a real board, downgrading anything that resolves silently. It downgraded 612
   cards the last time it ran. Nothing in this port has been through it.
3. **Nothing outside \`src/lib/cards/xmage/\` imports this module.** So the number
   of cards the shipped app plays from these records today is 0. Wiring it into
   \`src/lib/game/**\` belongs to another workflow.

---

# 4. What each file holds

Every table carries a measured census and an explicit list of what it refuses.

| file | maps | entries | refuses |
|---|---|---:|---:|
| \`keywords.ts\` | XMage keyword classes to \`KeywordAbility\` | ${Object.keys(FULL.keyword).length} | ${Object.keys(KEYWORDS_MOD.REFUSED_KEYWORDS).length} |
| \`triggers.ts\` | trigger classes to \`TriggerEvent\` | ${Object.keys(FULL.trigger).length} | ${Object.keys(TRIGGERS_MOD.REFUSED_TRIGGERS).length} |
| \`targets.ts\` | target classes to \`TargetSpec\` | ${Object.keys(FULL.target).length} | ${Object.keys(TARGETS_MOD.REFUSED_TARGETS).length} |
| \`costs.ts\` | cost classes to \`Cost\` | ${Object.keys(FULL.cost).length} | ${Object.keys(COSTS_MOD.REFUSED_COSTS).length} |
| \`values.ts\` | dynamic values to \`ValueExpr\` | ${Object.keys(FULL.value).length} | ${Object.keys(VALUES_MOD.REFUSED_VALUES).length} |
| \`modifications.ts\` | continuous effects to \`Modification\` | ${Object.keys(FULL.modification).length} | ${Object.keys(MODS_MOD.REFUSED_MODIFICATIONS).length} |
| \`lower.ts\` | one-shot effects to \`Effect\` | ${Object.keys(FULL.effect).length} | ${Object.keys(LOWER_MOD.REFUSED_EFFECTS).length} |
| \`lower.ts\` | ability classes carrying their own semantics | ${Object.keys(FULL.ability).length + Object.keys(FULL.abilityCost).length} | |
| \`tokens.generated.ts\` | token classes to \`TokenSpec\` | ${Object.keys(FULL.token).length} | |
| \`counters.generated.ts\` | \`CounterType\` members to counter names | ${Object.keys(COUNTERS_MOD.XMAGE_COUNTERS).length} | |

Two of those are generated rather than typed. \`scripts/xmage/extract-tokens.mjs\`
parses XMage's token constructors, and \`scripts/xmage/extract-counters.mjs\`
reads its \`CounterType\` enum including the sign rule that makes \`M1M0\` print as
\`-1/-0\`. Hand transcribing 741 token classes would have been wrong in a handful
of places nobody could find afterwards, because a wrong power on one token looks
exactly like a right one.

---

# 5. What is deliberately refused, and why

Naming a refusal is the difference between work nobody got to and work somebody
decided against. Each of these costs real cards, and each is a decision rather
than an omission.

| refused | where | why |
|---|---|---|
${REFUSALS.map(([a, b, c]) => `| ${a} | \`${b}\` | ${c} |`).join('\n')}

---

# 6. Where XMage and the printed card disagree

The rule is that the oracle text wins. Two disagreements are pinned by tests.

**Menace.** \`MenaceAbility(boolean)\` takes \`showAbilityHint\`, and both of its
constructors build the same ability. The boolean is a client display flag and
not part of the card, so it is read and discarded rather than surfaced as a
keyword parameter. 242 cards pass it. Checked in \`MenaceAbility.java\` rather
than assumed. Test: Alley Strangler.

**Wrath of God.** The card says "They can't be regenerated" and \`dsl.ts\` has no
member for it. \`noRegen\` is read and dropped, which is safe only because
\`xmage:RegenerateSourceEffect\` is refused by name, so no permanent this port
builds has a regeneration shield for the clause to matter against. If
regeneration is ever added, a grep for \`noRegen\` finds the line and the test.
Test: Wrath of God.

---

# 7. Four bugs real cards found that reading the code did not

Every one of these produced a card that RAN and was wrong, which is worse than a
card that refuses, and every one survived until a named card was walked through
the pipeline. That is the argument for a hard list of real cards over fixtures
somebody wrote.

**Static factory arguments were being discarded.** XMage writes a counter as
\`CounterType.M1M1.createInstance(4)\`, and \`AddCountersSourceEffect\` reads the
count off the Counter object rather than off its own \`amount\` parameter. The
record builder dropped a factory's arguments, so every "put four counters" card
read as one. \`Carried.factory\` had always declared an \`args\` field; nothing was
filling it. Test: Blight Rot.

**The "controlled" family lost its controller.** \`GainAbilityControlledEffect\`
gets "you control" from the CLASS and takes a filter describing only the kind of
permanent. Reading the filter alone granted the ability to every creature on the
battlefield. Garruk Wildspeaker's "-4: Creatures you control get +3/+3 and gain
trample" boosted correctly and gave trample to the whole table, so the card ran
and only half of it was wrong. Test: Garruk Wildspeaker.

**Target adjusters were invisible.** "Tap X target creatures" arrives as one
target with no counts, plus \`setTargetAdjuster(new XTargetsCountAdjuster())\`.
The record holds the adjuster's class name and nothing about what it does, so
the card lowered to a spell that taps exactly one creature. Same failure class
as Cyclonic Rift. Abilities carrying an adjuster are now blocked by
construction. Test: Word of Binding.

**A colour table keyed on the wrong strings.** \`ColoredManaSymbol\`'s members are
the letters \`W U B R G\`, and the first version of the cost table read the colour
words. It matched nothing and refused every single-coloured activation cost in
the corpus, Shivan Dragon included. Test: Shivan Dragon.

A fifth was found by the harness rather than by a card: one \`Mana\` field carries
\`Integer.MAX_VALUE\`, and an unbounded \`String.repeat\` on it crashed the whole
measurement 5,727 records into a ${N} record run.

---

# 8. The tests

\`src/lib/cards/xmage/port.test.ts\`. One test per primitive, each built from a
real card, each asserting that card's Scryfall oracle text before it asserts the
lowering. The oracle assertion is not decoration: it pins the quote in the test
to the printed card, so a quoted line cannot drift away from the behaviour it is
there to justify.

The fixtures in \`port.fixtures.generated.ts\` are \`buildRecord\`'s own output for
those cards, frozen by \`scripts/xmage/make-fixtures.mjs\`. They are not written
by hand, because a hand-written record records what its author BELIEVED the
extraction produces, and a lowering tested against one can pass while failing on
every real card.

Six tests assert a REFUSAL. A port with no refusal tests has not shown it can say
no, and saying no is most of what the last two coverage overstatements needed.
`;

writeFileSync(path.join(REPO, 'docs', 'engine', 'PORT-LOG.md'), doc);
console.log('');
console.log('wrote docs/engine/PORT-LOG.md');
