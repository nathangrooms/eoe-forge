/**
 * How many cards the "a trigger cannot carry a target" refusal was costing, and
 * what shape the targets it refused actually are.
 *
 * Written on 23 Aug 2026 to size the tranche `announce.ts` opens, and kept so
 * the figures quoted in `announce.ts` and `trigger-bridge.ts` can be
 * reproduced rather than trusted. Every number those files state comes out of
 * this script.
 *
 *   node --experimental-strip-types scripts/xmage/trigger-target-census.mjs
 *
 * ## How it counts, so the denominator is never in doubt
 *
 * The pool filter is copied from `scripts/verify-ability-coverage.mjs` — the
 * same exclusions, in the same order — so the denominator is the same 32,469
 * cards every coverage figure in this project uses. It reads the cached
 * Scryfall bulk file and never touches the network or the database.
 *
 * Two different questions are asked and they give different answers, which is
 * the point of running both:
 *
 *   ABILITY HITS on `ability.targets`  — what the OLD refusal counted. It read
 *                                        the raw compiled spec list.
 *   ABILITY HITS on `announcedTargetsOf` — what the NEW one counts. A ref no
 *                                        effect ever indexes is not a target,
 *                                        so refusing on one refuses for nothing.
 *
 * And then the spec shapes, because only `min = 1` can be announced today:
 * "up to one" needs a way to DECLINE and "two target creatures" needs two
 * announced at once, and nothing can do either yet.
 *
 * Local file only. No Supabase, no network at run time, no model.
 */

import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWithTrace } from '../../src/lib/cards/abilities/compiler.ts';
import { announcedTargetsOf } from '../../src/lib/game/abilities/card-abilities.ts';
import { unrunnableReasons } from '../../src/lib/game/abilities/trigger-bridge.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');

if (!existsSync(SRC)) {
  console.error(`Missing ${SRC}. Cached bulk file only; this script never downloads.`);
  process.exit(1);
}

/* The pool, filtered exactly as `verify-ability-coverage.mjs` filters it. */
const NOT_A_CARD = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'front_card']);
const NOT_A_NORMAL_GAME = new Set(['planar', 'scheme', 'vanguard']);
const NOT_A_GAME_PRODUCT = new Set(['token', 'memorabilia']);

const bump = (map, key, by = 1) => map.set(key, (map.get(key) ?? 0) + by);

let pool = 0;
let abilitiesWithRawTargets = 0;
let abilitiesWithAnnouncedTargets = 0;
let cardsWithAnnouncedTargets = 0;
/* Cards whose every unrunnable trigger is unrunnable ONLY for the target
   reason. These are the ones the change can move; a card also blocked by "you
   may" stays where it was, and reporting it here would flatter the work. */
let cardsBlockedOnlyByTargets = 0;
let cardsBlockedOnlyByTargetsAndFull = 0;
const specShapes = new Map();
const otherReasons = new Map();
const examples = [];

const rl = createInterface({ input: createReadStream(SRC), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  const card = JSON.parse(line);
  if (NOT_A_CARD.has(card.layout)) continue;
  if (NOT_A_GAME_PRODUCT.has(card.set_type)) continue;
  if (NOT_A_NORMAL_GAME.has(card.layout)) continue;
  if (card.digital) continue;
  if (!(card.games ?? []).includes('paper')) continue;
  pool++;

  let result;
  try {
    result = compileWithTrace(card).result;
  } catch {
    continue;
  }

  const triggers = result.abilities.filter(ability => ability.kind === 'triggered');
  if (triggers.length === 0) continue;

  let cardAnnounces = false;
  let anyRefusal = false;
  let onlyTargetRefusals = true;

  for (const ability of triggers) {
    const raw = ability.targets ?? [];
    const announced = announcedTargetsOf(ability);
    if (raw.length > 0) abilitiesWithRawTargets++;
    if (announced.length > 0) {
      abilitiesWithAnnouncedTargets++;
      cardAnnounces = true;
      for (const spec of announced) bump(specShapes, `min=${spec.min} max=${spec.max}`);
    }

    /*
     * The refusals as they stand NOW. The target one is recognised by its own
     * wording rather than by re-deriving it, so this script and the predicate
     * cannot disagree about which reason is which.
     */
    for (const why of unrunnableReasons(ability)) {
      anyRefusal = true;
      const isTargetReason = /targets announced at once|declining a target|announced targets/.test(why);
      if (!isTargetReason) {
        onlyTargetRefusals = false;
        bump(otherReasons, why.slice(0, 60));
      }
    }
  }

  if (cardAnnounces) cardsWithAnnouncedTargets++;
  if (anyRefusal && onlyTargetRefusals) {
    cardsBlockedOnlyByTargets++;
    if (result.coverage === 'full') {
      cardsBlockedOnlyByTargetsAndFull++;
      if (examples.length < 12) {
        examples.push(`${card.name} :: ${(card.oracle_text ?? '').replace(/\n/g, ' | ').slice(0, 96)}`);
      }
    }
  }
}

const say = text => console.log(text);
const pct = (n, d) => (d === 0 ? '0.00' : ((n / d) * 100).toFixed(2));

say('==============================================================================');
say('TRIGGERED ABILITIES THAT NAME A TARGET');
say('==============================================================================');
say('');
say(`POOL                                            ${pool}`);
say('');
say('--- ABILITY HITS ---');
say(`abilities with a raw \`targets\` list              ${abilitiesWithRawTargets}`);
say(`abilities that ANNOUNCE one (a ref an effect reads) ${abilitiesWithAnnouncedTargets}`);
say(`  the difference is specs nothing indexes:       ${abilitiesWithRawTargets - abilitiesWithAnnouncedTargets}`);
say('');
say('--- SPEC SHAPES, and only min=1 can be announced today ---');
for (const [shape, count] of [...specShapes.entries()].sort((a, b) => b[1] - a[1])) {
  say(`  ${String(count).padStart(6)}  ${shape}`);
}
say('');
say('--- CARDS ---');
say(`cards with at least one announcing trigger       ${cardsWithAnnouncedTargets}  ${pct(cardsWithAnnouncedTargets, pool)}%`);
say(`cards whose ONLY trigger refusal is the target one ${cardsBlockedOnlyByTargets}`);
say(`  ...and whose compiler coverage is 'full'       ${cardsBlockedOnlyByTargetsAndFull}`);
say('');
say('  (a card also refused for "you may" or an event the engine never derives');
say('   is NOT counted above; clearing one reason only uncovers the next)');
say('');
for (const line of examples) say(`    ${line}`);
say('');
say('--- THE OTHER REFUSALS STILL STANDING, on the same abilities ---');
for (const [why, count] of [...otherReasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  say(`  ${String(count).padStart(6)}  ${why}`);
}
