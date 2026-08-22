/**
 * DeckMatrix playtest harness — the stack census.
 *
 * WHY THIS EXISTS SEPARATELY FROM `analyze.ts`
 * -------------------------------------------
 * `analyze.ts` section 5 prints "Nothing ever reaches the stack" as a fixed
 * paragraph. It is written into the file, not measured, and it is printed
 * whether the run put a thousand spells on the stack or none. That is fine as
 * commentary and useless as evidence, and this task needs evidence.
 *
 * So this pass counts the stack directly. It replays every recorded game
 * through the real reducer, exactly the way `analyzeRecord` does — same deck
 * rebuild, same `buildTable`, same setup actions, same per-action hash check —
 * and refuses to report anything from a game whose replay diverged. It then
 * counts, with the state before and after each action in hand:
 *
 *   spellsOnStack        stack objects of kind 'spell' that appeared
 *   abilitiesOnStack     stack objects of kind 'activated' or 'triggered'
 *   manaAbilitiesOnStack how many of those were mana abilities, which CR 605.3a
 *                        says must be none
 *   castSpellActions     CAST_SPELL actions the reducer ACCEPTED
 *   instantsCast         accepted PLAY or CAST_SPELL whose card is an Instant
 *   sorceriesCast        the same for a Sorcery
 *   priorityPasses       accepted PASS_PRIORITY, split by whether the stack
 *                        was non-empty in the state BEFORE the pass
 *   countersResolved     accepted COUNTER_SPELL
 *   stackResolutions     accepted RESOLVE_STACK
 *   fizzles              a resolution whose every announced target was illegal
 *   landDrops            lands played from hand, and how many of those are a
 *                        modal double-faced card whose front face is a spell
 *
 * Card type is read off the instance's own `typeLine`, FIRST FACE ONLY: a modal
 * double-faced card prints "Creature — Elemental // Instant" and asking whether
 * the whole string contains "instant" counts a creature as an instant. That is
 * the same trap `defaultResolutionZone` documents in `stack.ts`.
 *
 *   node --experimental-strip-types scripts/playtest/stack-census.ts \
 *     --run <absolute path to a run folder>
 *
 * Prints JSON on stdout. Nothing is written to disk and nothing is estimated.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyAction, applyActionTraced } from '../../src/lib/game/rules.ts';
import { buildTable } from '../../src/lib/game/setup.ts';
import type { CardInstance, GameState, StackObject } from '../../src/lib/game/types.ts';

import { loadPool, type CardPool } from './pool.ts';
import { buildDeck, type BuiltDeck } from './deck.ts';
import { deckHash, type GameRecord } from './runner.ts';
import { hashState } from './fingerprint.ts';
import { checkInvariants, type InvariantHit } from './observe.ts';
import { willFizzle } from '../../src/lib/game/stack.ts';
import { isLand } from '../../src/lib/game/mana.ts';
import { responseOptions, spellToAnswer } from '../../src/lib/game/respond.ts';
import { abilitiesFor } from '../../src/lib/game/abilities/card-abilities.ts';
import { isManaAbility } from '../../src/lib/game/activate.ts';

/** The printed face a spell is cast as. See the header on why only the first. */
function firstFace(card: CardInstance | undefined): string {
  const line = card?.typeLine ?? '';
  return line.split('//')[0].toLowerCase();
}

interface GameCensus {
  seed: number;
  replayOk: boolean;
  replayNote: string;
  ended: boolean;
  turns: number;
  actions: number;
  refused: number;
  winners: string[];
  spellsOnStack: number;
  abilitiesOnStack: number;
  /** CR 605.3a says this must be 0. See where it is counted. */
  manaAbilitiesOnStack: number;
  manaAbilitiesOnStackNames: string[];
  castSpellActions: number;
  instantsCast: number;
  sorceriesCast: number;
  instantsAndSorceriesInDecks: number;
  instantsAndSorceriesDrawn: number;
  priorityPassesTotal: number;
  priorityPassesWithStack: number;
  countersResolved: number;
  stackResolutions: number;
  fizzles: number;
  invariants: InvariantHit[];
  actionsByType: Record<string, number>;
  /**
   * EVERY action the engine applied, nested ones included, counted off the
   * game's own event log.
   *
   * `record.actions` holds only the batches a bot proposed. `applyAction` folds
   * `stackFollowUps` and trigger resolution INSIDE itself, recursing through
   * `applyOne`, so a `RESOLVE_STACK` never appears as a top level entry however
   * many objects resolved. Counting the proposed actions alone reports zero
   * resolutions in a game that resolved hundreds, which is how a real number
   * gets read as a defect. `logAction` writes one event per applied action
   * carrying its `type`, so the log is the honest denominator.
   */
  logByType: Record<string, number>;
  /** Names of the cards cast as an instant or a sorcery, and how they were cast. */
  instantSorceryCasts: string[];
  /** Names of the spells that reached the stack. */
  spellsOnStackNames: string[];
  /** Lands played from hand. */
  landDrops: number;
  /** Land drops whose FRONT face is an instant or a sorcery. */
  spellFacedLandDrops: string[];
  /**
   * THE OPPORTUNITY, which is what makes the zeroes above mean anything.
   *
   * After every applied action, the player holding priority is asked the two
   * questions `respond.ts` already answers: is there somebody else's object on
   * the stack (`spellToAnswer`), and is there anything in hand this seat could
   * legally cast and pay for right now (`responseOptions`). Counted once per
   * (stack object, seat) pair, because the same window is re-offered on every
   * action until somebody acts and counting it per action would multiply one
   * decision into dozens.
   *
   * `respondWindows` is how many times a seat was offered a real decision.
   * `windowsWithAnAnswer` is how many of those it was holding something for,
   * and `windowsWithACounter` how many of those were a counterspell. The gap
   * between the second and the third is exactly the instants the bot ignores.
   */
  respondWindows: number;
  windowsWithAnAnswer: number;
  windowsWithACounter: number;
  /**
   * WHAT WOULD HAPPEN IF THE BOT WERE ALLOWED TO CAST THEM.
   *
   * For every distinct instant and sorcery in this game's decklists, the
   * compiled abilities are read the same way `compiledSpellActions` reads them
   * on resolution: a `kind: 'spell'` ability is text the engine can run, and a
   * `targets` list on it is a question `CastOptions.targets` has no asker for.
   * Distinct by card name, because 80 copies of one card is one piece of work.
   */
  spellsRunnable: string[];
  spellsNeedingATarget: string[];
  spellsWithNoCompiledText: string[];
  /**
   * WAS THE SPELL AIMED, AND DID IT DO ANYTHING.
   *
   * "Instants cast" on its own is a count of louder, not of better. A bot that
   * casts a hundred removal spells at nobody has all access and no judgement,
   * which is precisely the failure the brief warns against, and it would move
   * `instantsCast` exactly as far as a bot that plays well.
   *
   * So each instant and sorcery cast is also judged on what happened to it:
   *
   *   castsWithATargetAnnounced  a CAST_SPELL whose `targets` list is non-empty
   *   resolutionsOfASpell        instant and sorcery resolutions off the stack
   *   resolvedUnaimed            ...that hit the "no target was chosen" note
   *   resolvedByHandNote         ...that hit the "resolve it by hand" note
   *   resolvedAndActed           ...that hit neither of those two sentences
   *
   * THE LAST ONE IS NOT A MEASURE OF WORK, and reading it as one was wrong by
   * ten in the twenty games it was written for. A modal spell prints "not
   * resolved automatically: choose 1 of" and a spell with nothing to do prints
   * "resolved, but there was nothing for it to do"; neither says "resolve by
   * hand", so both were counted as text that ran. The three below are the
   * measurement, taken off the actions `applyActionTraced` reports the engine
   * actually running, with the CR 608.2m graveyard move discounted because
   * every instant and sorcery gets one whether or not anything happened:
   *
   *   resolvedDoingNothing  the engine ran nothing at all for it
   *   resolvedPartly        it ran something AND printed a manual note
   *   resolvedInFull        it ran something and printed no note
   *
   * When two spells leave the stack inside one action the trace cannot say
   * which of them ran what, so both are credited with the union. Measured on
   * the twenty game run: every resolution was on its own.
   */
  castsWithATargetAnnounced: number;
  resolutionsOfASpell: number;
  resolvedUnaimed: number;
  resolvedByHandNote: number;
  resolvedAndActed: number;
  resolvedDoingNothing: number;
  resolvedPartly: number;
  resolvedInFull: number;
  resolvedUnaimedNames: string[];
  resolvedDoingNothingNames: string[];
}

async function censusOf(record: GameRecord, pool: CardPool): Promise<GameCensus> {
  const out: GameCensus = {
    seed: record.seed,
    replayOk: true,
    replayNote: '',
    ended: record.ended,
    turns: record.turns,
    actions: record.actions.length,
    refused: 0,
    winners: record.winnerNames,
    spellsOnStack: 0,
    abilitiesOnStack: 0,
    manaAbilitiesOnStack: 0,
    manaAbilitiesOnStackNames: [],
    castSpellActions: 0,
    instantsCast: 0,
    sorceriesCast: 0,
    instantsAndSorceriesInDecks: 0,
    instantsAndSorceriesDrawn: 0,
    priorityPassesTotal: 0,
    priorityPassesWithStack: 0,
    countersResolved: 0,
    stackResolutions: 0,
    fizzles: 0,
    invariants: [],
    actionsByType: {},
    logByType: {},
    instantSorceryCasts: [],
    spellsOnStackNames: [],
    landDrops: 0,
    spellFacedLandDrops: [],
    respondWindows: 0,
    windowsWithAnAnswer: 0,
    windowsWithACounter: 0,
    spellsRunnable: [],
    spellsNeedingATarget: [],
    spellsWithNoCompiledText: [],
    castsWithATargetAnnounced: 0,
    resolutionsOfASpell: 0,
    resolvedUnaimed: 0,
    resolvedByHandNote: 0,
    resolvedAndActed: 0,
    resolvedDoingNothing: 0,
    resolvedPartly: 0,
    resolvedInFull: 0,
    resolvedUnaimedNames: [],
    resolvedDoingNothingNames: [],
  };

  const built: BuiltDeck[] = [];
  for (let i = 0; i < record.players; i++) {
    built.push(
      await buildDeck({ seed: record.seed, kind: record.kind, label: `deck:${record.kind}:seat${i}`, pool })
    );
  }
  for (let i = 0; i < built.length; i++) {
    if (deckHash(built[i].deck) !== record.deckHashes[i]) {
      out.replayOk = false;
      out.replayNote = `Seat ${i} rebuilt to a different decklist.`;
      return out;
    }
  }

  const table = buildTable({
    id: `harness-${record.seed}`,
    seats: built.map((entry, index) => ({ deck: entry.deck, playerName: `Bot ${index + 1}`, isBot: true })),
    format: built[0].deck.format,
    seed: record.seed,
    now: 0,
  });

  let state: GameState = table.state;
  for (const action of record.setupActions) state = applyAction(state, action);
  if (hashState(state) !== record.openingHash) {
    out.replayOk = false;
    out.replayNote = 'The opening state did not reproduce.';
    return out;
  }

  /*
   * The denominator for "a bot never casts an instant". Counted off the built
   * decklists rather than off the cards seen in play, because a card that was
   * never drawn is still a card the bot was given and never used.
   */
  for (const card of Object.values(state.cards)) {
    /* A modal double-faced `Instant // Land` is not one of these. The bot plays
       it as a land, and counting it here would inflate the denominator with
       cards that were never meant to be cast as spells. */
    if (isLand(card)) continue;
    const face = firstFace(card);
    if (face.includes('instant') || face.includes('sorcery')) out.instantsAndSorceriesInDecks++;
  }

  /* Read off the opening state, so it describes the DECKS rather than what was
     drawn: a card nobody drew is still a card the engine would have to run. */
  const seenSpellName = new Set<string>();
  for (const card of Object.values(state.cards)) {
    if (isLand(card)) continue;
    const face = firstFace(card);
    if (!face.includes('instant') && !face.includes('sorcery')) continue;
    if (seenSpellName.has(card.name)) continue;
    seenSpellName.add(card.name);

    const spellAbilities = abilitiesFor(card).abilities.filter(ability => ability.kind === 'spell');
    if (spellAbilities.length === 0) {
      out.spellsWithNoCompiledText.push(card.name);
      continue;
    }
    out.spellsRunnable.push(card.name);
    const wantsTarget = spellAbilities.some(
      ability => 'targets' in ability && (ability.targets ?? []).length > 0
    );
    if (wantsTarget) out.spellsNeedingATarget.push(card.name);
  }

  const everHeld = new Set<string>();
  const seenWindow = new Set<string>();

  for (const entry of record.actions) {
    const before = state;
    const { state: after, applied } = applyActionTraced(before, entry.action);
    const refused = after === before;

    if (hashState(after) !== entry.hash) {
      out.replayOk = false;
      out.replayNote = `The replay diverged at action ${entry.i} (${entry.action.type}).`;
      return out;
    }
    state = after;

    out.actionsByType[entry.action.type] = (out.actionsByType[entry.action.type] ?? 0) + 1;
    if (refused) {
      out.refused++;
      continue;
    }

    /* Cards that reached a hand at any point, so "never cast" can be separated
       from "never drawn". */
    for (const player of after.players) {
      for (const id of player.zones.hand) {
        const card = after.cards[id];
        if (isLand(card)) continue;
        const face = firstFace(card);
        if (face.includes('instant') || face.includes('sorcery')) everHeld.add(id);
      }
    }

    const stackBefore: readonly StackObject[] = before.stack ?? [];
    const stackAfter: readonly StackObject[] = after.stack ?? [];
    const idsBefore = new Set(stackBefore.map(o => o.stackId));
    for (const object of stackAfter) {
      if (idsBefore.has(object.stackId)) continue;
      if (object.kind === 'spell') {
        out.spellsOnStack++;
        out.spellsOnStackNames.push(object.name);
      } else {
        out.abilitiesOnStack++;
        /*
         * CR 605.3a: a mana ability does not use the stack. Counted rather than
         * assumed, because it went wrong once already and expensively: trusting
         * the compiler's own stricter flag put 142 mana abilities on the stack
         * across 120 games, each of them charging its cost and binning the mana.
         * `isManaAbility` is imported from `activate.ts` so this asks the engine
         * its own question instead of keeping a second copy of the rule.
         */
        if (object.sourceInstanceId && object.abilityId) {
          const source = after.cards[object.sourceInstanceId] ?? before.cards[object.sourceInstanceId];
          const ability = source
            ? abilitiesFor(source).abilities.find(
                entry => entry.kind === 'activated' && entry.id === object.abilityId
              )
            : undefined;
          if (ability && ability.kind === 'activated' && isManaAbility(ability)) {
            out.manaAbilitiesOnStack++;
            out.manaAbilitiesOnStackNames.push(`${source?.name}: ${object.name}`);
          }
        }
      }
    }

    /*
     * WHAT HAPPENED TO EACH SPELL THAT RESOLVED.
     *
     * Counted off objects LEAVING the stack rather than off a `RESOLVE_STACK`
     * action, and that is not a stylistic choice. `record.actions` holds only
     * the batches a bot proposed, and nobody proposes a `RESOLVE_STACK`: the
     * engine derives it inside `stackFollowUps` and folds it in through
     * `applyOne`. A first draft of this counter sat in the switch below and
     * reported zero spell resolutions in a run with 1,599 of them, which is
     * exactly the false zero this whole harness keeps being burned by.
     *
     * A spell that was COUNTERED also leaves the stack and is not a resolution,
     * so it is excluded by name from the applied trace.
     */
    const idsAfter = new Set(stackAfter.map(o => o.stackId));
    const counteredIds = new Set(
      applied
        .filter(one => one.type === 'COUNTER_SPELL')
        .map(one => String((one as { stackId?: string }).stackId ?? ''))
    );
    for (const object of stackBefore) {
      if (idsAfter.has(object.stackId)) continue;
      if (object.kind !== 'spell' || !object.cardInstanceId) continue;
      if (counteredIds.has(object.stackId)) continue;
      const spellCard = before.cards[object.cardInstanceId];
      const spellFace = firstFace(spellCard);
      if (!spellFace.includes('instant') && !spellFace.includes('sorcery')) continue;

      out.resolutionsOfASpell++;
      const notes = applied
        .filter(
          one =>
            one.type === 'NOTE' &&
            (one as { instanceId?: string }).instanceId === object.cardInstanceId
        )
        .map(one => String((one as { message?: string }).message ?? ''));

      /*
       * WHAT THE ENGINE ACTUALLY RAN, not which sentence it printed.
       *
       * This counter used to read "produced neither of the two notes, so its
       * text ran". That is the absence of a phrase standing in for a
       * measurement, and it was wrong by ten in the run it was written for: a
       * modal spell prints "not resolved automatically: choose 1 of" and a
       * spell with nothing to do prints "resolved, but there was nothing for it
       * to do", neither of which contains "resolve by hand", so all of them
       * were filed as text that ran. This project has been burned three times
       * by a probe watching the wrong layer and this was a fourth.
       *
       * So the work is counted off `applyActionTraced`: every action the engine
       * ran, less the action that was proposed, less the bookkeeping, and less
       * the spell's own move to the graveyard, which CR 608.2m adds to every
       * instant and sorcery whether or not anything happened.
       */
      const work = applied.slice(1).filter(one => {
        if (one.type === 'NOTE' || one.type === 'RESOLVE_STACK' || one.type === 'PASS_PRIORITY') {
          return false;
        }
        const id = (one as { instanceId?: string }).instanceId;
        return !(one.type === 'MOVE_ZONE' && id === object.cardInstanceId);
      });

      if (notes.some(message => message.includes('no target was chosen when it was cast'))) {
        out.resolvedUnaimed++;
        out.resolvedUnaimedNames.push(object.name);
      } else if (notes.some(message => message.includes('resolve by hand'))) {
        out.resolvedByHandNote++;
      } else {
        out.resolvedAndActed++;
      }

      if (work.length === 0) {
        out.resolvedDoingNothing++;
        out.resolvedDoingNothingNames.push(object.name);
      } else if (notes.length > 0) {
        out.resolvedPartly++;
      } else {
        out.resolvedInFull++;
      }
    }

    switch (entry.action.type) {
      case 'CAST_SPELL': {
        out.castSpellActions++;
        const was = before.cards[entry.action.instanceId];
        const face = firstFace(was);
        if ((face.includes('instant') || face.includes('sorcery')) && (entry.action.targets ?? []).length > 0) {
          out.castsWithATargetAnnounced++;
        }
        if (face.includes('instant')) {
          out.instantsCast++;
          out.instantSorceryCasts.push(`${was?.name} (instant, CAST_SPELL)`);
        } else if (face.includes('sorcery')) {
          out.sorceriesCast++;
          out.instantSorceryCasts.push(`${was?.name} (sorcery, CAST_SPELL)`);
        }
        break;
      }
      case 'PLAY': {
        /* A `PLAY` out of hand or the command zone is a cast on the non-stack
           branch of `planCastFromHand`. A `PLAY` the reducer issues during a
           resolution comes from the stack, and is not a second cast. */
        const was = before.cards[entry.action.instanceId];
        if (was?.zone !== 'hand' && was?.zone !== 'command') break;

        /*
         * A LAND DROP IS NOT A CAST, and this is where the two get confused.
         *
         * `isLand` reads the WHOLE type line, so a modal double-faced card
         * printed `Instant // Land` is a land to it and the bot plays it with
         * `planLandDrop`. Its front face is an instant, so a census that asked
         * only "is the front face an instant" would report ten instants cast in
         * a run where the bot cast none. Ask `isLand` first, the same function
         * the bot asked.
         */
        if (isLand(was)) {
          out.landDrops++;
          if (firstFace(was).includes('instant') || firstFace(was).includes('sorcery')) {
            out.spellFacedLandDrops.push(was.name);
          }
          break;
        }

        const face = firstFace(was);
        if (face.includes('instant')) {
          out.instantsCast++;
          out.instantSorceryCasts.push(`${was?.name} (instant, PLAY from ${was?.zone})`);
        } else if (face.includes('sorcery')) {
          out.sorceriesCast++;
          out.instantSorceryCasts.push(`${was?.name} (sorcery, PLAY from ${was?.zone})`);
        }
        break;
      }
      case 'PASS_PRIORITY':
        out.priorityPassesTotal++;
        if (stackBefore.length > 0) out.priorityPassesWithStack++;
        break;
      case 'COUNTER_SPELL':
        out.countersResolved++;
        break;
      case 'RESOLVE_STACK': {
        out.stackResolutions++;
        const top = stackBefore[stackBefore.length - 1];
        /* CR 608.2b, asked of the state the object resolves in — after it has
           been popped, which is what `stackFollowUps` passes to
           `resolutionActionsFor`. */
        if (top && willFizzle(after, top)) out.fizzles++;
        break;
      }
      default:
        break;
    }

    /* The respond window, asked of the state as it now stands. */
    const priorityId = after.priorityPlayerId;
    if (priorityId && (after.stack ?? []).length > 0) {
      const answering = spellToAnswer(after, priorityId);
      if (answering) {
        const key = `${answering.stackId}:${priorityId}`;
        if (!seenWindow.has(key)) {
          seenWindow.add(key);
          out.respondWindows++;
          const options = responseOptions(after, priorityId);
          if (options.length > 0) out.windowsWithAnAnswer++;
          if (options.some(option => option.counters)) out.windowsWithACounter++;
        }
      }
    }

    out.invariants.push(
      ...checkInvariants({
        seed: record.seed,
        kind: record.kind,
        players: record.players,
        at: entry.i,
        action: entry.action,
        before,
        after,
        logAdded: after.log.slice(before.log.length),
        applied,
        refused,
      })
    );
  }

  out.instantsAndSorceriesDrawn = everHeld.size;

  /* Every action the engine actually applied, nested follow-ups included. */
  for (const event of state.log) {
    out.logByType[event.type] = (out.logByType[event.type] ?? 0) + 1;
  }

  return out;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const runIndex = argv.indexOf('--run');
  if (runIndex === -1 || !argv[runIndex + 1]) {
    console.error('usage: stack-census.ts --run <run folder>');
    process.exit(2);
  }
  const dir = path.resolve(argv[runIndex + 1]);
  const files = fs
    .readdirSync(dir)
    .filter(name => name.startsWith('game-') && name.endsWith('.json'))
    .sort();

  const pool = await loadPool();
  const read: GameCensus[] = [];
  for (const name of files) {
    const record = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as GameRecord;
    read.push(await censusOf(record, pool));
  }

  /*
   * ONLY THE GAMES THAT REPLAYED. The header of this file has always said the
   * census "refuses to report anything from a game whose replay diverged", and
   * until now it did not: `censusOf` returns early with every counter still at
   * zero, and the totals summed over all games regardless. A run of twenty in
   * which six diverged reported the fourteen games' figures under a heading
   * that said twenty, and — worse — reported `invariantViolations: 0` for
   * games it had never finished checking. That is the false zero this harness
   * has been burned by three times already.
   *
   * `games` is now what was measured and `gamesRead` is what was on disk, so
   * the denominator is on the page next to the numbers.
   */
  const games = read.filter(game => game.replayOk);

  const sum = (pick: (game: GameCensus) => number): number => games.reduce((total, g) => total + pick(g), 0);

  /* Wins per seat. `winnerNames` holds the seat's display name, which the
     harness sets to `Bot 1`..`Bot 4` in seat order. */
  const winsBySeat: Record<string, number> = {};
  for (const game of games) {
    for (const winner of game.winners) winsBySeat[winner] = (winsBySeat[winner] ?? 0) + 1;
  }

  const actionsByType: Record<string, number> = {};
  const logByType: Record<string, number> = {};
  for (const game of games) {
    for (const [type, count] of Object.entries(game.actionsByType)) {
      actionsByType[type] = (actionsByType[type] ?? 0) + count;
    }
    for (const [type, count] of Object.entries(game.logByType)) {
      logByType[type] = (logByType[type] ?? 0) + count;
    }
  }

  const castNames: Record<string, number> = {};
  for (const game of games) {
    for (const name of game.instantSorceryCasts) castNames[name] = (castNames[name] ?? 0) + 1;
  }
  const stackSpellNames: Record<string, number> = {};
  for (const game of games) {
    for (const name of game.spellsOnStackNames) stackSpellNames[name] = (stackSpellNames[name] ?? 0) + 1;
  }

  console.log(
    JSON.stringify(
      {
        run: dir,
        /* Every number below this line is over `games`, the ones that replayed.
           `gamesRead` is how many were on disk. See where `games` is built. */
        gamesRead: read.length,
        games: games.length,
        replayedOk: games.length,
        replayNotes: read.filter(g => !g.replayOk).map(g => `${g.seed}: ${g.replayNote}`),
        finished: games.filter(g => g.ended).length,
        stalled: games.filter(g => !g.ended).length,
        totalActions: sum(g => g.actions),
        refusedActions: sum(g => g.refused),
        invariantViolations: sum(g => g.invariants.length),
        invariantDetail: games.flatMap(g => g.invariants).slice(0, 20),
        spellsOnStack: sum(g => g.spellsOnStack),
        abilitiesOnStack: sum(g => g.abilitiesOnStack),
        manaAbilitiesOnStack: sum(g => g.manaAbilitiesOnStack),
        castSpellActions: sum(g => g.castSpellActions),
        instantsCast: sum(g => g.instantsCast),
        sorceriesCast: sum(g => g.sorceriesCast),
        instantsAndSorceriesInDecks: sum(g => g.instantsAndSorceriesInDecks),
        instantsAndSorceriesEverHeld: sum(g => g.instantsAndSorceriesDrawn),
        priorityPassesTotal: sum(g => g.priorityPassesTotal),
        priorityPassesWithStack: sum(g => g.priorityPassesWithStack),
        countersResolvedTopLevel: sum(g => g.countersResolved),
        stackResolutionsTopLevel: sum(g => g.stackResolutions),
        fizzles: sum(g => g.fizzles),
        landDrops: sum(g => g.landDrops),
        respondWindows: sum(g => g.respondWindows),
        windowsWithAnAnswer: sum(g => g.windowsWithAnAnswer),
        windowsWithACounter: sum(g => g.windowsWithACounter),
        distinctInstantsAndSorceries: new Set(
          games.flatMap(g => [...g.spellsRunnable, ...g.spellsWithNoCompiledText])
        ).size,
        distinctSpellsRunnable: new Set(games.flatMap(g => g.spellsRunnable)).size,
        distinctSpellsNeedingATarget: new Set(games.flatMap(g => g.spellsNeedingATarget)).size,
        distinctSpellsWithNoCompiledText: new Set(games.flatMap(g => g.spellsWithNoCompiledText)).size,
        castsWithATargetAnnounced: sum(g => g.castsWithATargetAnnounced),
        resolutionsOfASpell: sum(g => g.resolutionsOfASpell),
        resolvedUnaimed: sum(g => g.resolvedUnaimed),
        resolvedByHandNote: sum(g => g.resolvedByHandNote),
        resolvedAndActed: sum(g => g.resolvedAndActed),
        /* What the engine RAN, rather than which sentence it printed. See the
           note on `resolvedAndActed` in `GameCensus`. */
        resolvedDoingNothing: sum(g => g.resolvedDoingNothing),
        resolvedPartly: sum(g => g.resolvedPartly),
        resolvedInFull: sum(g => g.resolvedInFull),
        resolvedDoingNothingNames: [...new Set(games.flatMap(g => g.resolvedDoingNothingNames))],
        resolvedUnaimedNames: [...new Set(games.flatMap(g => g.resolvedUnaimedNames))],
        spellFacedLandDrops: games.flatMap(g => g.spellFacedLandDrops).length,
        spellFacedLandDropNames: [...new Set(games.flatMap(g => g.spellFacedLandDrops))],
        instantSorceryCasts: castNames,
        spellsOnStackNames: stackSpellNames,
        /* The honest totals. See `logByType` on `GameCensus`. */
        appliedFromLog: {
          total: Object.values(logByType).reduce((a, b) => a + b, 0),
          RESOLVE_STACK: logByType.RESOLVE_STACK ?? 0,
          COUNTER_SPELL: logByType.COUNTER_SPELL ?? 0,
          CAST_SPELL: logByType.CAST_SPELL ?? 0,
          PASS_PRIORITY: logByType.PASS_PRIORITY ?? 0,
          PUT_ABILITY_ON_STACK: logByType.PUT_ABILITY_ON_STACK ?? 0,
        },
        logByType,
        winsBySeat,
        turns: sum(g => g.turns),
        perGame: games.map(g => ({
          seed: g.seed,
          ended: g.ended,
          turns: g.turns,
          actions: g.actions,
          winners: g.winners,
          spellsOnStack: g.spellsOnStack,
          instantsCast: g.instantsCast,
          sorceriesCast: g.sorceriesCast,
          priorityPassesWithStack: g.priorityPassesWithStack,
          invariants: g.invariants.length,
        })),
        actionsByType,
      },
      null,
      2
    )
  );
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
