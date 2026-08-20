/**
 * DeckMatrix — networked play: hidden information.
 *
 * This is the part of the design that a pure replayable log does not solve by
 * itself, and the part most likely to be waved past, so it gets stated plainly.
 *
 * ---------------------------------------------------------------------------
 * The problem
 * ---------------------------------------------------------------------------
 * Our reducer is seeded and deterministic. `state.rng.seed` lives *in the
 * state*, and `SHUFFLE` derives the library order from it. That is exactly what
 * makes a networked table cheap — and it is also, taken naively, a total
 * information leak: any client that can replay the log can compute every
 * library order and therefore every future draw. "Just ship the actions" is a
 * correct scaling argument and an unplayable security model. A seeded engine
 * does not hide anything; it makes everything reproducible, which is the
 * opposite.
 *
 * ---------------------------------------------------------------------------
 * The fix: separate position from identity
 * ---------------------------------------------------------------------------
 * `GameState` tracks *where cards are*, and stays identical on every client. It
 * never tracks *what they are* while they are hidden. A library is an ordered
 * array of anonymous slots — real, stable `instanceId`s with no card behind
 * them. Everyone can see that Ali has 63 cards in her library and that the
 * seventh one just went to her hand. Nobody can see what it was.
 *
 * Identity is assigned lazily by a `SecretDealer`, at the moment a card stops
 * being hidden:
 *
 *   library -> hand           private reveal, to that player only
 *   library/hand -> anywhere  public reveal, to the whole table
 *     public
 *   -> library (shuffle)      *forget*: the dealer re-randomises which slot
 *                             holds which card, so prior knowledge is now wrong
 *
 * The public `SHUFFLE` the reducer performs is theatre and leaks nothing: a
 * public permutation composed with the dealer's secret permutation is still a
 * secret permutation. This is what stops the classic attack of watching a known
 * card through a "shuffle" whose seed everybody holds.
 *
 * The consequence worth noticing: because secrets live outside `GameState`,
 * every client still holds a byte-identical state object, so the convergence
 * check in `digest.ts` can hash *everything* rather than some redacted
 * projection we hope we got right. Hidden information costs us nothing in the
 * integrity story.
 *
 * ---------------------------------------------------------------------------
 * What this costs, honestly
 * ---------------------------------------------------------------------------
 * A trusted dealer. Something has to know the deck order, and whatever knows it
 * can see everyone's hand. In production that is a Postgres row (readable by
 * `service_role` only, with no RLS policy granting anyone `select`) plus a
 * stateless function invoked on hidden-zone transitions. Note what it is *not*:
 * a live game object. It holds no turn structure, no priority, no combat — it
 * is a shuffled list and a cursor, touched maybe 15-20% of actions. That is why
 * the cost argument survives: the server does O(hidden-zone events), not
 * O(actions), and holds nothing between calls.
 *
 * The dealer can rig a deal. It cannot do so *undetectably*: `commitment()` is
 * published when the game starts and `disclose()` reveals the seed when it
 * ends, so any player can re-derive the deal afterwards and check it matches.
 * Commit-and-reveal proves fairness. It does not provide secrecy — a seed that
 * has been revealed reproduces everything, which is precisely why the reveal
 * waits until the game is over.
 *
 * The alternative, for completeness: mental poker (commutative encryption, each
 * player shuffling the encrypted deck in turn) removes the trusted dealer
 * entirely. It costs a modular exponentiation per card per player per shuffle,
 * needs every player online and responsive for every shuffle, and wedges the
 * table when someone's phone sleeps mid-protocol. For a 100-card singleton
 * format with four players and tutors that shuffle repeatedly, that is a bad
 * trade. Rejected deliberately, not overlooked.
 *
 * ---------------------------------------------------------------------------
 * Amendment, 20 Aug 2026: online tables have no trusted dealer at all
 * ---------------------------------------------------------------------------
 * The paragraph above assumes one dealer per table, running server-side. That
 * is still the right shape for ranked play. It is NOT what online tables ship
 * with, because the only place a dealer could run today is a browser, and a
 * dealer in one player's browser is one player holding four players' libraries.
 *
 * So an online table has one dealer per seat, built by `dealOwnSeat`. Each
 * holds its own deck and its own committed seed and nothing else, exactly like
 * four people each shuffling their own deck at a kitchen table. Nobody's hidden
 * cards exist on anybody else's machine, so there is nothing there to leak,
 * and no hidden card is ever put on the wire at all.
 *
 * What that gives up, stated plainly: a seat can look at its own library. The
 * commitment is what makes that catchable rather than free — the shuffle is
 * fixed before the first draw and the seed proves it afterwards — but the
 * disclosure step is not built yet, so today it is catchable in principle and
 * not in practice. For friends testing a game in development that is the right
 * trade. For ranked play it is not, and the server-side dealer above is the
 * thing that replaces it.
 */

import { addCard, createGame, shuffleWithRng, type NewGamePlayerConfig } from '../rules.ts';
import type { GameState, InstanceId, PlayerId, RngState, Zone } from '../types.ts';
import { digestString } from './digest.ts';
import { HIDDEN_ZONES } from './identity.ts';
import type { CardIdentity, LogEntry, ParticipantId, Reveal } from './protocol.ts';

/**
 * Zones whose contents this design refuses to put on the wire.
 *
 * Declared in `identity.ts` and imported rather than written out twice. A zone
 * that was secret to one of these two files and public to the other is the kind
 * of disagreement that leaks a hand and reads as nothing in review.
 */
const HIDDEN = HIDDEN_ZONES;

/* -------------------------------------------------------------------------- */
/* The seam                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The authority for everything a client is not allowed to compute for itself.
 *
 * One method does the work. `settle` is handed the state either side of a batch
 * and returns the reveals that batch earned — which means no new action types,
 * no reducer changes, and no way for a client to *ask* for a card it should not
 * see. The dealer reads zone transitions and answers with facts.
 */
export interface SecretDealer {
  readonly tableId: string;

  /**
   * Published at game start. `digest(seed | tableId)`, so revealing the seed at
   * the end proves the deal was fixed before the first draw.
   */
  commitment(): string;

  /**
   * Reveals earned by applying `entry` to `before`, producing `after`.
   * Pure with respect to the game; mutates only the dealer's own bookkeeping.
   */
  settle(before: GameState, after: GameState, entry: LogEntry): Reveal[];

  /** Everything a participant is entitled to at join or reconnect. */
  catchUp(state: GameState, participantId: ParticipantId): Reveal[];

  /** Game over. Hand back the seed so anyone can audit the deal. */
  disclose(): { seed: number; identities: Record<InstanceId, CardIdentity> };
}

/* -------------------------------------------------------------------------- */
/* Local implementation                                                       */
/* -------------------------------------------------------------------------- */

export interface LocalSecretDealerOptions {
  tableId: string;
  /** The secret. In production this is generated server-side and never sent. */
  seed: number;
  /** The truth: every instance id and what it really is. */
  identities: Record<InstanceId, CardIdentity>;
  /** Seat -> the connection allowed to learn that seat's private cards. */
  participantBySeat: Record<PlayerId, ParticipantId>;
  /**
   * The seats this dealer is responsible for. Absent means all of them.
   *
   * ---------------------------------------------------------------------------
   * Why one dealer per seat is better than one dealer per table
   * ---------------------------------------------------------------------------
   * A single dealer has to know every deck, and whatever knows every deck can
   * see every hand. In this codebase that dealer would run in a browser, which
   * means one player's machine holding four players' libraries. Naming that
   * "trusted" does not make it true.
   *
   * So online tables give every seat its own dealer, holding its own deck and
   * its own shuffle seed, exactly as a person at a table shuffles their own
   * deck and nobody else's. Nothing about another seat's hidden cards is ever
   * on that machine to leak. What a seat can still do is look at its own
   * library, which is why `commitment()` is published before the first draw:
   * the shuffle is fixed in advance and the seed proves it afterwards.
   *
   * The restriction has to cover shuffles as well as reveals. Without it, one
   * seat's dealer would re-permute another seat's library on a `SHUFFLE` it
   * holds no identities for, writing `undefined` over the slots and advancing
   * its own RNG for a shuffle that was never its business.
   */
  seats?: readonly PlayerId[];
  /**
   * RNG to continue from, when the opening shuffle has already been dealt.
   *
   * A per-seat deal shuffles the deck before the first frame, so the dealer's
   * next shuffle must carry on from where that left off rather than repeating
   * it. Absent, the RNG starts at `seed`.
   */
  rng?: RngState;
  /**
   * What the commitment is scoped to. Defaults to the table id.
   *
   * With one dealer per seat, two seats that happened to pick the same seed
   * would publish the same commitment, which is a tell about a secret. Scoping
   * it to the seat as well removes that.
   */
  commitmentScope?: string;
}

/**
 * A dealer that runs in-process. Drives solo play, bot pods and the tests, and
 * is the reference for the server-side one: same interface, same rules about
 * who learns what, different place to keep the secret.
 */
export class LocalSecretDealer implements SecretDealer {
  readonly tableId: string;

  private readonly seed: number;
  private readonly identities: Record<InstanceId, CardIdentity>;
  private readonly participantBySeat: Record<PlayerId, ParticipantId>;

  /** Advances on every shuffle, so two shuffles of one library differ. */
  private rng: RngState;
  /** Instances whose identity is now table knowledge. */
  private readonly publicly = new Set<InstanceId>();
  /** Instance -> participants that have been told, so we do not resend. */
  private readonly told = new Map<InstanceId, Set<ParticipantId>>();
  /** Seats this dealer answers for. Null means every seat at the table. */
  private readonly seats: ReadonlySet<PlayerId> | null;
  private readonly commitmentScope: string;

  constructor(options: LocalSecretDealerOptions) {
    this.tableId = options.tableId;
    this.seed = options.seed;
    this.identities = { ...options.identities };
    this.participantBySeat = { ...options.participantBySeat };
    this.rng = options.rng ?? { seed: options.seed };
    this.seats = options.seats ? new Set(options.seats) : null;
    this.commitmentScope = options.commitmentScope ?? options.tableId;
  }

  /** True when this dealer holds the deal for that seat. */
  private deals(playerId: PlayerId): boolean {
    return this.seats === null || this.seats.has(playerId);
  }

  commitment(): string {
    return digestString(`${this.commitmentScope}:${this.seed}`);
  }

  disclose(): { seed: number; identities: Record<InstanceId, CardIdentity> } {
    return { seed: this.seed, identities: { ...this.identities } };
  }

  settle(before: GameState, after: GameState, entry: LogEntry): Reveal[] {
    const reveals: Reveal[] = [];

    // 1. A shuffle re-randomises identity across the slots still in that
    //    library, and everything anyone knew about those slots becomes false.
    for (const action of entry.actions) {
      if (action.type !== 'SHUFFLE') continue;
      if (!this.deals(action.playerId)) continue;
      const forgotten = this.reshuffleLibrary(after, action.playerId);
      if (forgotten.length > 0) {
        reveals.push({ tableId: this.tableId, to: '*', cards: {}, forget: forgotten, public: true });
      }
    }

    // 2. Zone transitions out of a hidden zone earn a reveal.
    const publicCards: Record<InstanceId, CardIdentity> = {};
    const privateCards = new Map<ParticipantId, Record<InstanceId, CardIdentity>>();

    for (const instanceId of Object.keys(after.cards)) {
      const wasHidden = HIDDEN.has(before.cards[instanceId]?.zone ?? 'library');
      const nowZone = after.cards[instanceId].zone;
      if (!wasHidden || HIDDEN.has(nowZone)) {
        // library -> hand is hidden-to-hidden but still a private reveal.
        if (!(before.cards[instanceId]?.zone === 'library' && nowZone === 'hand')) continue;
      }

      if (!this.deals(after.cards[instanceId].ownerId)) continue;

      const identity = this.identities[instanceId];
      if (!identity) continue;

      if (!HIDDEN.has(nowZone)) {
        if (this.publicly.has(instanceId)) continue;
        this.publicly.add(instanceId);
        publicCards[instanceId] = identity;
        continue;
      }

      // library -> hand: only the owner learns it.
      const owner = after.cards[instanceId].ownerId;
      const participant = this.participantBySeat[owner];
      if (!participant) continue;
      if (this.hasBeenTold(instanceId, participant)) continue;
      this.markTold(instanceId, participant);
      const bucket = privateCards.get(participant) ?? {};
      bucket[instanceId] = identity;
      privateCards.set(participant, bucket);
    }

    if (Object.keys(publicCards).length > 0) {
      reveals.push({
        tableId: this.tableId,
        to: '*',
        causeBatchId: entry.batchId,
        cards: publicCards,
        public: true,
      });
    }
    for (const [participant, cards] of privateCards) {
      reveals.push({ tableId: this.tableId, to: participant, causeBatchId: entry.batchId, cards });
    }

    return reveals;
  }

  catchUp(state: GameState, participantId: ParticipantId): Reveal[] {
    const seat = Object.keys(this.participantBySeat).find(
      playerId => this.participantBySeat[playerId] === participantId
    );

    const publicCards: Record<InstanceId, CardIdentity> = {};
    for (const instanceId of this.publicly) {
      const identity = this.identities[instanceId];
      if (identity) publicCards[instanceId] = identity;
    }

    const reveals: Reveal[] = [
      { tableId: this.tableId, to: participantId, cards: publicCards, public: true },
    ];

    if (seat) {
      const hand = state.players.find(p => p.id === seat)?.zones.hand ?? [];
      const cards: Record<InstanceId, CardIdentity> = {};
      for (const instanceId of hand) {
        const identity = this.identities[instanceId];
        if (!identity) continue;
        cards[instanceId] = identity;
        this.markTold(instanceId, participantId);
      }
      reveals.push({ tableId: this.tableId, to: participantId, cards });
    }

    return reveals;
  }

  /**
   * Permute identity across the slots currently in one library, using the
   * dealer's private RNG. The public slot array has already been permuted by
   * the reducer; this is the permutation that actually matters.
   */
  private reshuffleLibrary(state: GameState, playerId: PlayerId): InstanceId[] {
    const library = state.players.find(p => p.id === playerId)?.zones.library ?? [];
    if (library.length < 2) return [];

    const current = library.map(instanceId => this.identities[instanceId]);
    const result = shuffleWithRng(current, this.rng);
    this.rng = result.rng;

    const forgotten: InstanceId[] = [];
    library.forEach((instanceId, index) => {
      this.identities[instanceId] = result.items[index];
      if (this.publicly.delete(instanceId)) forgotten.push(instanceId);
      const audience = this.told.get(instanceId);
      if (audience && audience.size > 0) {
        this.told.delete(instanceId);
        if (!forgotten.includes(instanceId)) forgotten.push(instanceId);
      }
    });

    return forgotten;
  }

  private hasBeenTold(instanceId: InstanceId, participant: ParticipantId): boolean {
    return this.told.get(instanceId)?.has(participant) ?? false;
  }

  private markTold(instanceId: InstanceId, participant: ParticipantId): void {
    const audience = this.told.get(instanceId) ?? new Set<ParticipantId>();
    audience.add(participant);
    this.told.set(instanceId, audience);
  }
}

/* -------------------------------------------------------------------------- */
/* Dealing a redacted table                                                   */
/* -------------------------------------------------------------------------- */

export interface DealSeat {
  playerId?: PlayerId;
  playerName: string;
  participantId: ParticipantId;
  /** The 99. Order is irrelevant — the dealer shuffles. */
  cards: CardIdentity[];
  /** Public from the first frame, as they are on a real table. */
  commanders: CardIdentity[];
}

export interface DealOptions {
  tableId: string;
  seats: DealSeat[];
  /** The secret. Server-generated in production; never leaves the dealer. */
  seed: number;
  format?: GameState['format'];
  now?: number;
}

export interface DealtTable {
  /** Identical on every client. Libraries and hands are anonymous slots. */
  state: GameState;
  dealer: SecretDealer;
  /** Published to the table so the deal can be audited after the game. */
  commitment: string;
}

/**
 * Build a table whose public state contains no card identities at all.
 *
 * Contrast with `setup.ts::buildTable`, which is the right tool for solo and
 * goldfish play: it puts real cards in every library because there is nobody to
 * hide them from. This is the networked equivalent — same reducer, same
 * actions, but every library card is a slot and the truth stays in the dealer.
 */
export function dealTable(options: DealOptions): DealtTable {
  const now = options.now ?? 0;
  const format = options.format ?? 'commander';

  const playerConfigs: NewGamePlayerConfig[] = options.seats.map((seat, index) => {
    const playerId = seat.playerId ?? `p${index + 1}`;
    return {
      id: playerId,
      name: seat.playerName,
      commanders: seat.commanders.map((commander, ci) => ({
        id: `${playerId}-cmd${ci + 1}`,
        name: commander.name,
        instanceId: `${playerId}-c${ci}`,
        imageUrl: commander.imageUrl,
      })),
    };
  });

  let state = createGame({
    id: options.tableId,
    mode: 'full',
    format,
    players: playerConfigs,
    // The *public* seed. Deliberately not the dealer's secret: this one only
    // permutes anonymous slots, so publishing it reveals nothing.
    seed: 1,
    now,
  });

  const identities: Record<InstanceId, CardIdentity> = {};
  const participantBySeat: Record<PlayerId, ParticipantId> = {};

  options.seats.forEach((seat, index) => {
    const playerId = playerConfigs[index].id as PlayerId;
    participantBySeat[playerId] = seat.participantId;

    let cursor = 0;
    for (const commander of seat.commanders) {
      const instanceId = `${playerId}-c${cursor}`;
      // Commanders start in the command zone, face up. Nothing to hide.
      state = addCard(
        state,
        { ...commander, instanceId, ownerId: playerId, isCommander: true } as never,
        'command' as Zone
      );
      identities[instanceId] = commander;
      cursor += 1;
    }

    for (const card of seat.cards) {
      const instanceId = `${playerId}-c${cursor}`;
      state = addCard(
        state,
        {
          instanceId,
          cardId: '',
          name: 'Card',
          ownerId: playerId,
          faceDown: true,
        },
        'library' as Zone
      );
      identities[instanceId] = card;
      cursor += 1;
    }
  });

  const dealer = new LocalSecretDealer({
    tableId: options.tableId,
    seed: options.seed,
    identities,
    participantBySeat,
  });

  return { state, dealer, commitment: dealer.commitment() };
}

/* -------------------------------------------------------------------------- */
/* Client-side overlay                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Fold reveals into what this client knows.
 *
 * `forget` is applied after `cards` so a batch that re-reveals a slot it also
 * invalidated ends up correct rather than ordering-dependent.
 */
export function applyReveal(
  knowledge: Record<InstanceId, CardIdentity>,
  reveal: Reveal
): Record<InstanceId, CardIdentity> {
  const next = { ...knowledge, ...reveal.cards };
  for (const instanceId of reveal.forget ?? []) {
    if (reveal.cards[instanceId]) continue;
    delete next[instanceId];
  }
  return next;
}

/**
 * What the surface should draw for one instance: the real card if this client
 * is entitled to it, and an honest blank if not.
 *
 * A blank is a blank. There is no half-knowledge here — no cmc, no colour, no
 * "it's a land" — because every one of those is a tell, and a UI that leaks a
 * tell is the same bug as a transport that leaks the card.
 */
export function viewCard(
  knowledge: Record<InstanceId, CardIdentity>,
  instanceId: InstanceId
): CardIdentity | null {
  return knowledge[instanceId] ?? null;
}

/* -------------------------------------------------------------------------- */
/* One table, four dealers                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A seat as everybody at the table can see it.
 *
 * Every field here is something a person sitting opposite would know: who is
 * in the seat, what their commander is, and how many cards are in their
 * library. What those cards ARE is not in this shape and never travels.
 */
export interface SharedSeat {
  /** The seat id inside `GameState`. Derived from the seat number, never chosen. */
  playerId: PlayerId;
  playerName: string;
  /** How many anonymous slots to put in that library. */
  librarySize: number;
  /** Face up from the first frame, as they are on a real table. */
  commanders: CardIdentity[];
}

export interface SharedTableOptions {
  tableId: string;
  /** In seat order. Every client must build this list the same way. */
  seats: readonly SharedSeat[];
  format?: GameState['format'];
  /**
   * Permutes anonymous slots only, so publishing it reveals nothing. It is the
   * table's seed, not anybody's deal.
   */
  publicSeed?: number;
  now?: number;
}

/**
 * The state every client at an online table holds, built from public
 * information alone.
 *
 * This is the half of `dealTable` that can be computed without knowing a single
 * card. Four clients running it over the same seat list produce the same object
 * byte for byte, which is what lets the convergence check in `digest.ts` hash
 * everything rather than some redacted projection.
 *
 * Instance ids are positional — `p2-c0` is that seat's first commander, `p2-c1`
 * its first library slot — so they can be derived rather than agreed. That
 * matters more than it looks: it is what lets a seat rebuild its own private
 * mapping after a reload, from its deck and its seed and nothing else.
 */
export function buildSharedTable(options: SharedTableOptions): GameState {
  const now = options.now ?? 0;
  const format = options.format ?? 'commander';

  const playerConfigs: NewGamePlayerConfig[] = options.seats.map(seat => ({
    id: seat.playerId,
    name: seat.playerName,
    commanders: seat.commanders.map((commander, ci) => ({
      id: `${seat.playerId}-cmd${ci + 1}`,
      name: commander.name,
      instanceId: `${seat.playerId}-c${ci}`,
      imageUrl: commander.imageUrl,
    })),
  }));

  let state = createGame({
    id: options.tableId,
    mode: 'full',
    format,
    players: playerConfigs,
    seed: options.publicSeed ?? 1,
    now,
  });

  for (const seat of options.seats) {
    let cursor = 0;
    for (const commander of seat.commanders) {
      state = addCard(
        state,
        {
          ...commander,
          colorIdentity: commander.colorIdentity as CardIdentity['colorIdentity'] as never,
          instanceId: `${seat.playerId}-c${cursor}`,
          ownerId: seat.playerId,
          isCommander: true,
        } as never,
        'command' as Zone
      );
      cursor += 1;
    }

    for (let i = 0; i < seat.librarySize; i += 1) {
      state = addCard(
        state,
        {
          instanceId: `${seat.playerId}-c${cursor}`,
          // An empty `cardId` is the marker for "this slot has no identity yet".
          // `installIdentities` refuses to overwrite a non-empty one, so this is
          // also what stops a second reveal changing a card already on the table.
          cardId: '',
          name: 'Card',
          ownerId: seat.playerId,
          faceDown: true,
        },
        'library' as Zone
      );
      cursor += 1;
    }
  }

  return state;
}

export interface OwnSeatDeal {
  /** Slot -> card, for this seat only. Never leaves this machine. */
  identities: Record<InstanceId, CardIdentity>;
  /** Restricted to this seat: it deals nobody else's cards and shuffles nobody else's library. */
  dealer: SecretDealer;
  /** Published before the first draw so the shuffle can be audited afterwards. */
  commitment: string;
}

export interface OwnSeatDealOptions {
  tableId: string;
  playerId: PlayerId;
  participantId: ParticipantId;
  /** This seat's secret. Generated here, stored where only this user can read it. */
  secretSeed: number;
  /** The 99. Order as given is irrelevant; it is shuffled by the secret seed. */
  deck: readonly CardIdentity[];
  commanders: readonly CardIdentity[];
}

/**
 * Shuffle your own deck and keep the answer.
 *
 * This is the whole of a seat's private state at an online table, and the
 * reason no client ever holds another seat's hidden cards: there is no dealer
 * anywhere that knows more than one deck.
 *
 * The opening shuffle happens here rather than as a `SHUFFLE` action, because
 * the slots in the shared state are anonymous and permuting anonymous slots
 * achieves nothing. The permutation that matters is this one, over identities,
 * driven by a seed that was committed to before the game started.
 *
 * Deterministic in `(deck, secretSeed)`, which is what makes a rejoin possible:
 * the same two inputs rebuild the same mapping, and folding the log rebuilds
 * everything the game did to it.
 */
export function dealOwnSeat(options: OwnSeatDealOptions): OwnSeatDeal {
  const shuffled = shuffleWithRng(options.deck, { seed: options.secretSeed });

  const identities: Record<InstanceId, CardIdentity> = {};
  let cursor = 0;
  for (const commander of options.commanders) {
    identities[`${options.playerId}-c${cursor}`] = commander;
    cursor += 1;
  }
  for (const card of shuffled.items) {
    identities[`${options.playerId}-c${cursor}`] = card;
    cursor += 1;
  }

  const dealer = new LocalSecretDealer({
    tableId: options.tableId,
    seed: options.secretSeed,
    // Carry on from the opening shuffle rather than repeating it: a tutor that
    // shuffled back to the same order would be a very strange card.
    rng: shuffled.rng,
    identities,
    participantBySeat: { [options.playerId]: options.participantId },
    seats: [options.playerId],
    commitmentScope: `${options.tableId}:${options.playerId}`,
  });

  return { identities, dealer, commitment: dealer.commitment() };
}
