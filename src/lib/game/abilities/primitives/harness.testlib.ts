/**
 * Test fixtures for the primitive behaviour gate.
 *
 * Not a `.test.ts` file: `node --test` would try to run it. It is imported by
 * the files that are.
 *
 * ## Real cards, or the gate proves nothing
 *
 * Every board here is built from a row of the actual `cards` table, cached by
 * `scripts/primitives/fetch-catalogue.mjs`. `realCard()` throws if the named
 * card is absent, and `assertOracleContains()` throws if its oracle text does
 * not say what the spec claims it says.
 *
 * That matters more than it looks. A fixture invented to make a primitive pass
 * is a tautology — it asserts that the implementation does what the
 * implementation does. Templating also moves: "Scry 2." and "When CARDNAME
 * enters the battlefield" have both been re-templated since 2024, and a test
 * written against a remembered wording validates the engine against a catalogue
 * nobody has.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { addCard, createGame } from '../../rules.ts';
import type { CardInstance, GameState, Zone } from '../../types.ts';
import type { AbilityContext } from '../context.ts';
import { makeContext } from '../context.ts';
import type { PrimitiveEnv } from './contract.ts';

const here = dirname(fileURLToPath(import.meta.url));
const CATALOGUE = join(here, '..', '..', '..', '..', '..', 'scripts', 'primitives', '.data', 'catalogue.json');

export interface CatalogueRow {
  id: string;
  oracle_id: string;
  name: string;
  type_line: string;
  oracle_text: string | null;
  keywords: string[] | null;
  mana_cost: string | null;
  cmc?: number;
  power: string | null;
  toughness: string | null;
}

let cache: Map<string, CatalogueRow> | null = null;

function catalogue(): Map<string, CatalogueRow> {
  if (cache) return cache;
  let rows: CatalogueRow[];
  try {
    rows = JSON.parse(readFileSync(CATALOGUE, 'utf8')) as CatalogueRow[];
  } catch {
    throw new Error(
      `catalogue cache missing at ${CATALOGUE}. Run: node scripts/primitives/fetch-catalogue.mjs`
    );
  }
  const map = new Map<string, CatalogueRow>();
  for (const row of rows) {
    const key = String(row.name ?? '').toLowerCase();
    if (key && !map.has(key)) map.set(key, row);
  }
  cache = map;
  return map;
}

/** A real row, or a throw naming the card. Never a fabricated fallback. */
export function realCard(name: string): CatalogueRow {
  const row = catalogue().get(name.toLowerCase());
  if (!row) throw new Error(`"${name}" is not in the cached catalogue — the fixture would be invented`);
  return row;
}

/** The spec's claim about what a card says, checked against what it says. */
export function assertOracleContains(name: string, needle: string): void {
  const row = realCard(name);
  const text = String(row.oracle_text ?? '');
  if (!text.toLowerCase().includes(needle.toLowerCase())) {
    throw new Error(`"${name}" oracle text does not contain "${needle}". It says: ${text}`);
  }
}

export interface Placement {
  /** Instance id used on the board. */
  id: string;
  /** Catalogue name. Resolved to a real row; a miss throws. */
  card: string;
  owner?: string;
  zone?: Zone;
  tapped?: boolean;
  damage?: number;
  counters?: Record<string, number>;
  /** Override the printed type line. For the rare fixture that needs a plain body. */
  typeLine?: string;
  power?: string;
  toughness?: string;
  keywords?: string[];
}

/** A two-player game holding the named real cards, in the named zones. */
export function board(placements: readonly Placement[], playerCount = 2): GameState {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    players: Array.from({ length: playerCount }, (_, index) => ({ name: `P${index + 1}` })),
    seed: 11,
  });
  state = { ...state, status: 'playing' };

  for (const place of placements) {
    const row = realCard(place.card);
    const partial: Partial<CardInstance> & Pick<CardInstance, 'instanceId' | 'cardId' | 'name' | 'ownerId'> = {
      instanceId: place.id,
      cardId: row.id,
      name: row.name,
      ownerId: place.owner ?? 'p1',
      typeLine: place.typeLine ?? row.type_line,
      oracleText: row.oracle_text ?? undefined,
      keywords: place.keywords ?? row.keywords ?? undefined,
      power: place.power ?? row.power ?? undefined,
      toughness: place.toughness ?? row.toughness ?? undefined,
      manaCost: row.mana_cost ?? undefined,
      /*
       * Mana value, from the row.
       *
       * It was missing, and the omission was invisible: `CardInstance.cmc` is
       * optional, every reader spells it `card.cmc ?? 0`, and a board built
       * here therefore said every card cost nothing. `setup.ts` fills it on the
       * real path, so a test could assert a mana-value effect, read 0, and pass
       * while the same card behaved differently in a game. Feed the Swarm found
       * it: "you lose life equal to that permanent's mana value" charged
       * nothing for a Grizzly Bears.
       */
      cmc: typeof row.cmc === 'number' ? row.cmc : undefined,
    };
    state = addCard(state, partial, place.zone ?? 'battlefield');
    if (place.tapped || place.damage || place.counters) {
      const existing = state.cards[place.id];
      state = {
        ...state,
        cards: {
          ...state.cards,
          [place.id]: {
            ...existing,
            tapped: place.tapped ?? existing.tapped,
            damage: place.damage ?? existing.damage,
            counters: place.counters ?? existing.counters,
          },
        },
      };
    }
  }

  return state;
}

/** A context whose source is `sourceId`, controlled by `controllerId`. */
export function ctxFor(
  state: GameState,
  sourceId: string,
  controllerId = 'p1',
  extra: Partial<AbilityContext> = {}
): AbilityContext {
  return makeContext(state, sourceId, controllerId, extra);
}

/**
 * A deterministic env. Every field is state-derived in production; here they are
 * literals, which is exactly the point — nothing in a primitive may reach past
 * this object for a clock or a random.
 */
export function env(overrides: Partial<PrimitiveEnv> = {}): PrimitiveEnv {
  return { idPrefix: 'st1', ordinal: 0, at: 0, timestamp: 1, ...overrides };
}
