/**
 * DeckMatrix — networked play: what this actually costs, and where it breaks.
 *
 * A scaling claim nobody has done the arithmetic on is a wish. This module is
 * the arithmetic, as executable code rather than prose, so it can be re-run
 * when the design or Supabase's pricing changes instead of quietly going stale
 * in a document.
 *
 * Every constant below is Supabase's published figure, checked against their
 * docs, with the source noted. Where a number is ours — how many actions a
 * Commander game takes, how well batching compresses them — it is marked as an
 * estimate, because it is one, and it is the input most worth measuring for
 * real before anyone commits money to a plan tier.
 *
 * The single most important fact in this file, and the one most often missed:
 * **broadcast is billed and rate-limited per recipient, not per send.** One
 * message to a four-player table is five messages — one sent, four received.
 * A pod of four costs 4x what the naive count suggests, and a spectated game
 * costs whatever the audience is.
 */

/* -------------------------------------------------------------------------- */
/* Platform figures                                                           */
/* -------------------------------------------------------------------------- */

export type SupabasePlan = 'free' | 'pro' | 'pro-no-cap' | 'team' | 'enterprise';

/**
 * Hard per-project ceilings. Source: Supabase Realtime "Limits by plan".
 * Exceeding them is not a slowdown — clients get `too_many_connections`,
 * `too_many_joins` or `tenant_events` and are disconnected.
 */
export const REALTIME_LIMITS: Record<SupabasePlan, {
  concurrentConnections: number;
  messagesPerSecond: number;
  channelJoinsPerSecond: number;
  channelsPerConnection: number;
  presenceMessagesPerSecond: number;
  broadcastPayloadKb: number;
}> = {
  free:         { concurrentConnections: 200,    messagesPerSecond: 100,   channelJoinsPerSecond: 100,   channelsPerConnection: 100, presenceMessagesPerSecond: 20,    broadcastPayloadKb: 256 },
  pro:          { concurrentConnections: 500,    messagesPerSecond: 500,   channelJoinsPerSecond: 500,   channelsPerConnection: 100, presenceMessagesPerSecond: 50,    broadcastPayloadKb: 3000 },
  'pro-no-cap': { concurrentConnections: 10_000, messagesPerSecond: 2_500, channelJoinsPerSecond: 2_500, channelsPerConnection: 100, presenceMessagesPerSecond: 1_000, broadcastPayloadKb: 3000 },
  team:         { concurrentConnections: 10_000, messagesPerSecond: 2_500, channelJoinsPerSecond: 2_500, channelsPerConnection: 100, presenceMessagesPerSecond: 1_000, broadcastPayloadKb: 3000 },
  enterprise:   { concurrentConnections: 10_000, messagesPerSecond: 2_500, channelJoinsPerSecond: 2_500, channelsPerConnection: 100, presenceMessagesPerSecond: 1_000, broadcastPayloadKb: 3000 },
};

/**
 * Billing. Source: Supabase Realtime pricing.
 *
 * Enterprise limits are quoted as "10,000+" and "2,500+" — negotiable, not
 * published. They are listed above at the floor so the model never flatters
 * itself with a number nobody has agreed to.
 */
export const REALTIME_PRICING = {
  usdPerMillionMessages: 2.5,
  includedMessagesPerMonth: { free: 2_000_000, pro: 5_000_000, 'pro-no-cap': 5_000_000, team: 5_000_000, enterprise: 5_000_000 } as Record<SupabasePlan, number>,
  usdPerThousandPeakConnections: 10,
  includedPeakConnections: { free: 200, pro: 500, 'pro-no-cap': 500, team: 500, enterprise: 500 } as Record<SupabasePlan, number>,
} as const;

/* -------------------------------------------------------------------------- */
/* Our workload                                                               */
/* -------------------------------------------------------------------------- */

export interface GameProfile {
  playersPerGame: number;
  spectatorsPerGame: number;
  /** Estimate. Our reducer is fine-grained: 12 steps x 4 seats x ~15 rounds is 720 step advances alone. */
  actionsPerGame: number;
  minutesPerGame: number;
  /**
   * Actions per broadcast message. Estimate. Runs of `ADVANCE_STEP` and the
   * tap-tap-cast sequence coalesce well; a turn with responses does not.
   */
  actionsPerMessage: number;
  /** Compact JSON, short keys. Estimate. */
  bytesPerAction: number;
  /** Fraction of actions the dealer must adjudicate: draws, mills, tutors, reveals. */
  hiddenZoneActionShare: number;
}

/**
 * Deliberately pessimistic where it is guessing. A four-player Commander pod,
 * 45 minutes, 2,000 actions.
 */
export const COMMANDER_POD: GameProfile = {
  playersPerGame: 4,
  spectatorsPerGame: 0,
  actionsPerGame: 2_000,
  minutesPerGame: 45,
  actionsPerMessage: 5,
  bytesPerAction: 120,
  hiddenZoneActionShare: 0.15,
};

/** What it looks like with no batching, to show what the optimisation buys. */
export const COMMANDER_POD_UNBATCHED: GameProfile = { ...COMMANDER_POD, actionsPerMessage: 1 };

/* -------------------------------------------------------------------------- */
/* Projection                                                                 */
/* -------------------------------------------------------------------------- */

export interface Projection {
  concurrentGames: number;
  plan: SupabasePlan;

  connections: number;
  /** Messages entering Realtime per second, across all games. */
  sendsPerSecond: number;
  /** Sends plus fanout. This is what both the quota and the invoice count. */
  billableMessagesPerSecond: number;
  channelJoinsPerSecond: number;

  gamesPerDay: number;
  logBytesPerDay: number;
  logGbPerMonth: number;
  dbWritesPerSecondCasual: number;
  dbWritesPerSecondRanked: number;
  dealerCallsPerSecond: number;

  usdPerGame: number;
  usdPerMonthMessages: number;
  usdPerMonthConnections: number;

  /** Every ceiling this projection is over, worst first. Empty means it fits. */
  breaches: Array<{ limit: string; needed: number; ceiling: number; overBy: number }>;
}

export function project(
  concurrentGames: number,
  profile: GameProfile = COMMANDER_POD,
  plan: SupabasePlan = 'team'
): Projection {
  const limits = REALTIME_LIMITS[plan];
  const seconds = profile.minutesPerGame * 60;

  const audience = profile.playersPerGame + profile.spectatorsPerGame;
  const connections = concurrentGames * audience;

  const messagesPerGame = profile.actionsPerGame / profile.actionsPerMessage;
  const sendsPerSecondPerGame = messagesPerGame / seconds;
  const sendsPerSecond = sendsPerSecondPerGame * concurrentGames;

  // One sent, plus one per subscribed client that receives it. The sender is
  // subscribed to its own channel, so a 4-player pod is 1 + 4.
  const fanout = 1 + audience;
  const billableMessagesPerSecond = sendsPerSecond * fanout;

  // Everyone rejoins once per game, plus reconnects. One channel per player.
  const gamesPerSecond = concurrentGames / seconds;
  const channelJoinsPerSecond = gamesPerSecond * audience * 1.3;

  const gamesPerDay = gamesPerSecond * 86_400;
  const logBytesPerGame = profile.actionsPerGame * profile.bytesPerAction;
  const logBytesPerDay = gamesPerDay * logBytesPerGame;
  const logGbPerMonth = (logBytesPerDay * 30) / 1e9;

  // Casual flushes batches every ~5s; ranked writes one row per batch.
  const dbWritesPerSecondCasual = concurrentGames / 5;
  const dbWritesPerSecondRanked = sendsPerSecond;
  const dealerCallsPerSecond =
    (profile.actionsPerGame * profile.hiddenZoneActionShare * concurrentGames) / seconds;

  const messagesPerGameBilled = messagesPerGame * fanout;
  const usdPerGame = (messagesPerGameBilled / 1e6) * REALTIME_PRICING.usdPerMillionMessages;

  const monthlyMessages = billableMessagesPerSecond * 2_592_000;
  const chargeable = Math.max(0, monthlyMessages - REALTIME_PRICING.includedMessagesPerMonth[plan]);
  const usdPerMonthMessages = Math.ceil(chargeable / 1e6) * REALTIME_PRICING.usdPerMillionMessages;

  const chargeableConnections = Math.max(0, connections - REALTIME_PRICING.includedPeakConnections[plan]);
  const usdPerMonthConnections =
    (chargeableConnections / 1000) * REALTIME_PRICING.usdPerThousandPeakConnections;

  const breaches: Projection['breaches'] = [];
  const check = (limit: string, needed: number, ceiling: number) => {
    if (needed > ceiling) breaches.push({ limit, needed, ceiling, overBy: needed / ceiling });
  };
  check('concurrent connections', connections, limits.concurrentConnections);
  check('messages per second', billableMessagesPerSecond, limits.messagesPerSecond);
  check('channel joins per second', channelJoinsPerSecond, limits.channelJoinsPerSecond);
  breaches.sort((a, b) => b.overBy - a.overBy);

  return {
    concurrentGames,
    plan,
    connections,
    sendsPerSecond,
    billableMessagesPerSecond,
    channelJoinsPerSecond,
    gamesPerDay,
    logBytesPerDay,
    logGbPerMonth,
    dbWritesPerSecondCasual,
    dbWritesPerSecondRanked,
    dealerCallsPerSecond,
    usdPerGame,
    usdPerMonthMessages,
    usdPerMonthConnections,
    breaches,
  };
}

/**
 * The largest number of concurrent games that fits inside a plan's ceilings.
 * Binary search rather than algebra, because the constraint set will grow.
 */
export function headroom(plan: SupabasePlan, profile: GameProfile = COMMANDER_POD): number {
  let low = 0;
  let high = 1_000_000;
  while (low < high) {
    const mid = Math.ceil((low + high + 1) / 2);
    if (project(mid, profile, plan).breaches.length === 0) low = mid;
    else high = mid - 1;
    if (low === high) break;
  }
  return low;
}
