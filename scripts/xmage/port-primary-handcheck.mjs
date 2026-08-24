#!/usr/bin/env node
/**
 * The three disagreements the hand check found that are claims about the
 * RUNNING engine rather than about a JSON shape, put to the running engine.
 *
 * Reading a lowered ability and saying "that looks doubled" is an argument.
 * Building the board, letting `scanStatics` and the layer system do their work
 * and printing the number the engine arrives at is a measurement, and the
 * project law asks for the second. Nothing here grades anything; it prints what
 * happened so the document can quote it.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored here. XMage display strings are never
 * copied; the card wording quoted below is Scryfall's. Forge is GPL-3.0 and was
 * not fetched, read or referenced.
 *
 * Run: node --experimental-strip-types scripts/xmage/port-primary-handcheck.mjs
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWithTrace } from '../../src/lib/cards/abilities/compiler.ts';
import { addCard, createGame } from '../../src/lib/game/rules.ts';
import { powerIn, toughnessIn } from '../../src/lib/game/characteristics.ts';
import { abilityEngineOwns } from '../../src/lib/game/abilities/trigger-bridge.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');

const WANT = new Map([
  ['Vigilant Sentry', 'gets +1/+1 and has "{T}: ..." while seven cards are in your graveyard'],
  ['Wayward Angel', 'gets +3/+3, is black, has trample, and has an upkeep trigger, at threshold'],
  ['Steadfast Unicorn', 'the activated ability may be used only during your turn'],
  ['Goldmeadow Nomad', 'the activated ability may be used only as a sorcery, from the graveyard'],
  ['Garrulous Sycophant', 'the end-step drain happens only if you are the monarch'],
  ['Valley Mightcaller', 'trigger ownership, which the post-swap coverage decides'],
  ['Acidic Slime', 'trigger ownership, which the post-swap coverage decides'],
  ['Scourge of the Undercity', 'trigger ownership, which the post-swap coverage decides'],
  ['Promise of Bunrei', 'trigger ownership, which the post-swap coverage decides'],
]);

const found = new Map();
{
  const rl = createInterface({ input: createReadStream(SRC), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const c = JSON.parse(line);
    if (WANT.has(c.name) && !found.has(c.name)) found.set(c.name, c);
    if (found.size === WANT.size) break;
  }
}

function boardWith(card, graveyardFillers) {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    players: [
      { id: 'p1', name: 'P1', deck: [] },
      { id: 'p2', name: 'P2', deck: [] },
    ],
    seed: 9000,
  });
  let n = 0;
  const put = (c, zone, owner) => {
    const instanceId = `${c.name}-${zone}-${n++}`;
    state = addCard(state, {
      instanceId,
      cardId: `${c.name}-card`,
      ownerId: owner,
      oracleId: c.oracle_id,
      name: c.name,
      typeLine: c.type_line,
      oracleText: c.oracle_text,
      keywords: c.keywords ?? [],
      manaCost: c.mana_cost,
      cmc: c.cmc,
      power: c.power,
      toughness: c.toughness,
    }, zone);
    return instanceId;
  };
  const id = put(card, 'battlefield', 'p1');
  for (let i = 0; i < graveyardFillers; i++) put(card, 'graveyard', 'p1');
  return { state, id };
}

console.log('THE THREE CLAIMS, PUT TO THE ENGINE');
console.log('');

for (const name of ['Vigilant Sentry', 'Wayward Angel']) {
  const c = found.get(name);
  if (!c) { console.log(name, 'not in the bulk file'); continue; }
  const abilities = compileWithTrace(c).result;
  console.log('---', name, `[source ${abilities.source}]`);
  console.log('   printed box:', c.power + '/' + c.toughness);
  console.log('   oracle:', String(c.oracle_text).replace(/\n/g, ' / '));
  for (const fill of [0, 7]) {
    const { state, id } = boardWith(c, fill);
    console.log(`   with ${fill} cards in the graveyard: ${powerIn(state, id)}/${toughnessIn(state, id)}`);
  }
  console.log('');
}

for (const name of ['Steadfast Unicorn', 'Goldmeadow Nomad']) {
  const c = found.get(name);
  if (!c) { console.log(name, 'not in the bulk file'); continue; }
  const record = compileWithTrace(c).result;
  console.log('---', name, `[source ${record.source}]`);
  console.log('   oracle:', String(c.oracle_text).replace(/\n/g, ' / '));
  for (const a of record.abilities) {
    if (a.kind !== 'activated') continue;
    console.log(`   activated ${a.id}: timing=${JSON.stringify(a.timing)} activeZones=${JSON.stringify(a.activeZones)}`);
  }
  // Deliberately NOT counting what `activationsFor` offers here. On a board with
  // no lands it refuses for want of mana, and a zero would read as evidence
  // about timing when it is evidence about mana. The fields above are the claim:
  // the printed restriction is not on the ability at all.
  console.log('');
}

/*
 * Trigger ownership, which `compiler.ts:716` decides without meaning to.
 *
 * `abilityEngineOwns` refuses any card whose coverage is not `full`. The swap
 * recomputes coverage from the swapped list with an empty unparsed list, so
 * every swapped card reads `full`. Run this file with DM_XMAGE_OFF=1 for the
 * other half of the comparison: same cards, same board, second source off.
 */
{
  console.log('--- trigger ownership, second source', process.env.DM_XMAGE_OFF === '1' ? 'OFF' : 'ON');
  for (const name of ['Valley Mightcaller', 'Acidic Slime', 'Scourge of the Undercity', 'Promise of Bunrei']) {
    const c = found.get(name);
    if (!c) { console.log('   ', name, 'not in the bulk file'); continue; }
    const r = compileWithTrace(c).result;
    const { state, id } = boardWith(c, 0);
    console.log(
      '   ' + name.padEnd(26),
      'source=' + r.source,
      'coverage=' + r.coverage,
      'abilityEngineOwns=' + abilityEngineOwns(state.cards[id])
    );
  }
  console.log('');
}

{
  const c = found.get('Garrulous Sycophant');
  const record = compileWithTrace(c).result;
  console.log('--- Garrulous Sycophant', `[source ${record.source}]`);
  console.log('   oracle:', String(c.oracle_text).replace(/\n/g, ' / '));
  for (const a of record.abilities) {
    console.log('   ', a.kind, JSON.stringify({ event: a.event, condition: a.condition ?? null }));
  }
}
