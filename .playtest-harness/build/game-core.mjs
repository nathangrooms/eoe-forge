const ZONES = [
  "library",
  "hand",
  "battlefield",
  "graveyard",
  "exile",
  "command"
];
const HIDDEN_ZONES = ["library", "hand"];
const TURN_STEPS = [
  "untap",
  "upkeep",
  "draw",
  "precombat_main",
  "begin_combat",
  "declare_attackers",
  "declare_blockers",
  "combat_damage",
  "end_combat",
  "postcombat_main",
  "end",
  "cleanup"
];
const PHASE_OF_STEP = {
  untap: "beginning",
  upkeep: "beginning",
  draw: "beginning",
  precombat_main: "precombat_main",
  begin_combat: "combat",
  declare_attackers: "combat",
  declare_blockers: "combat",
  combat_damage: "combat",
  end_combat: "combat",
  postcombat_main: "postcombat_main",
  end: "ending",
  cleanup: "ending"
};
const STEP_LABELS = {
  untap: "Untap",
  upkeep: "Upkeep",
  draw: "Draw",
  precombat_main: "Main 1",
  begin_combat: "Begin Combat",
  declare_attackers: "Declare Attackers",
  declare_blockers: "Declare Blockers",
  combat_damage: "Combat Damage",
  end_combat: "End of Combat",
  postcombat_main: "Main 2",
  end: "End Step",
  cleanup: "Cleanup"
};
const COMMANDER_STARTING_LIFE = 40;
const DEFAULT_STARTING_LIFE = 20;
const COMMANDER_DAMAGE_LETHAL = 21;
const POISON_LETHAL = 10;
const COMMANDER_TAX_PER_CAST = 2;
const BASE_RULES = {
  format: "custom",
  label: "Custom",
  startingLife: DEFAULT_STARTING_LIFE,
  startingHandSize: 7,
  maxPlayers: 2,
  usesCommandZone: false,
  usesCommanderDamage: false,
  commanderDamageLethal: COMMANDER_DAMAGE_LETHAL,
  poisonLethal: POISON_LETHAL,
  singleton: false,
  commanderTaxPerCast: COMMANDER_TAX_PER_CAST
};
const FORMAT_RULES = {
  commander: {
    ...BASE_RULES,
    format: "commander",
    label: "Commander",
    startingLife: COMMANDER_STARTING_LIFE,
    maxPlayers: 6,
    usesCommandZone: true,
    usesCommanderDamage: true,
    singleton: true
  },
  brawl: {
    ...BASE_RULES,
    format: "brawl",
    label: "Brawl",
    // 25 heads-up, 30 multiplayer — resolved by player count in resolveFormatRules.
    startingLife: 25,
    maxPlayers: 4,
    usesCommandZone: true,
    usesCommanderDamage: true,
    singleton: true
  },
  oathbreaker: {
    ...BASE_RULES,
    format: "oathbreaker",
    label: "Oathbreaker",
    startingLife: DEFAULT_STARTING_LIFE,
    maxPlayers: 4,
    usesCommandZone: true,
    // Oathbreaker has no commander-damage loss condition.
    usesCommanderDamage: false,
    singleton: true
  },
  standard: { ...BASE_RULES, format: "standard", label: "Standard" },
  pioneer: { ...BASE_RULES, format: "pioneer", label: "Pioneer" },
  modern: { ...BASE_RULES, format: "modern", label: "Modern" },
  legacy: { ...BASE_RULES, format: "legacy", label: "Legacy" },
  vintage: { ...BASE_RULES, format: "vintage", label: "Vintage" },
  pauper: { ...BASE_RULES, format: "pauper", label: "Pauper" },
  historic: { ...BASE_RULES, format: "historic", label: "Historic" },
  alchemy: { ...BASE_RULES, format: "alchemy", label: "Alchemy" },
  explorer: { ...BASE_RULES, format: "explorer", label: "Explorer" },
  penny: { ...BASE_RULES, format: "penny", label: "Penny Dreadful" },
  limited: { ...BASE_RULES, format: "limited", label: "Limited", maxPlayers: 8 },
  custom: { ...BASE_RULES }
};
function resolveFormatRules(format, playerCount = 2) {
  const base = FORMAT_RULES[format] ?? FORMAT_RULES.custom;
  if (format === "brawl") {
    return { ...base, startingLife: playerCount > 2 ? 30 : 25 };
  }
  return { ...base };
}
function formatRules(format) {
  return { ...FORMAT_RULES[format] ?? FORMAT_RULES.custom };
}
function startingLifeFor(format, playerCount = 2) {
  return resolveFormatRules(format, playerCount).startingLife;
}
function phaseOf(step) {
  return PHASE_OF_STEP[step];
}
function nextRandom(rng) {
  const t = rng.seed + 1831565813 | 0;
  let r = t;
  r = Math.imul(r ^ r >>> 15, r | 1);
  r ^= r + Math.imul(r ^ r >>> 7, r | 61);
  const value = ((r ^ r >>> 14) >>> 0) / 4294967296;
  return { value, rng: { seed: t } };
}
function shuffleWithRng(items, rng) {
  const out = items.slice();
  let current = rng;
  for (let i = out.length - 1; i > 0; i--) {
    const step = nextRandom(current);
    current = step.rng;
    const j = Math.floor(step.value * (i + 1));
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return { items: out, rng: current };
}
function emptyZones() {
  const zones = {};
  for (const zone of ZONES) zones[zone] = [];
  return zones;
}
function createGame(config) {
  const seats = config.players ?? [];
  if (seats.length === 0) {
    throw new Error("createGame: at least one player is required");
  }
  const format = config.format ?? "commander";
  const rules = resolveFormatRules(format, seats.length);
  const mode = config.mode ?? "life-counter";
  const now = config.now ?? 0;
  const players = seats.map((seat2, index) => {
    const id = seat2.id ?? `p${index + 1}`;
    const commanders = (seat2.commanders ?? []).map((commander, ci) => ({
      id: commander.id ?? `${id}-cmd${ci + 1}`,
      playerId: id,
      name: commander.name,
      instanceId: commander.instanceId,
      castCount: 0,
      colorIdentity: commander.colorIdentity,
      imageUrl: commander.imageUrl
    }));
    return {
      id,
      name: seat2.name || `Player ${index + 1}`,
      seat: index,
      life: seat2.startingLife ?? config.startingLife ?? rules.startingLife,
      poison: 0,
      counters: {},
      commanders,
      commanderDamage: {},
      zones: emptyZones(),
      landsPlayedThisTurn: 0,
      drewFromEmptyLibrary: false,
      conceded: false,
      hasLost: false,
      lossReasons: [],
      profileId: seat2.profileId ?? null,
      deckId: seat2.deckId ?? null,
      avatarUrl: seat2.avatarUrl ?? null
    };
  });
  const startingPlayerId = config.startingPlayerId && players.some((p) => p.id === config.startingPlayerId) ? config.startingPlayerId : players[0].id;
  return {
    id: config.id ?? "game",
    mode,
    format,
    rules,
    status: "playing",
    players,
    cards: {},
    turn: 1,
    round: 1,
    activePlayerId: startingPlayerId,
    priorityPlayerId: startingPlayerId,
    startingPlayerId,
    step: "untap",
    combat: { attackers: [] },
    monarchId: null,
    initiativeId: null,
    winnerIds: [],
    log: [],
    rng: { seed: config.seed ?? 1 },
    startedAt: now,
    updatedAt: now,
    version: 0
  };
}
function addCard(state, card, zone = "library") {
  const owner = getPlayer(state, card.ownerId);
  if (!owner) return state;
  const instance = {
    controllerId: card.ownerId,
    tapped: false,
    faceDown: false,
    flipped: false,
    summoningSick: false,
    damage: 0,
    counters: {},
    isCommander: false,
    castCount: 0,
    isToken: false,
    removedFromGame: false,
    ...card,
    // The zone argument is authoritative — it decides which array holds the id.
    zone
  };
  const zones = { ...owner.zones, [zone]: [...owner.zones[zone], instance.instanceId] };
  return {
    ...state,
    cards: { ...state.cards, [instance.instanceId]: instance },
    players: state.players.map((p) => p.id === owner.id ? { ...p, zones } : p)
  };
}
function getPlayer(state, playerId) {
  return state.players.find((p) => p.id === playerId);
}
function getCard(state, instanceId) {
  return state.cards[instanceId];
}
function isAlive(player) {
  return !player.hasLost;
}
function livingPlayers(state) {
  return state.players.filter(isAlive);
}
function opponentsOf(state, playerId) {
  return state.players.filter((p) => p.id !== playerId);
}
function findCommander(state, commanderId) {
  for (const player of state.players) {
    const found = player.commanders.find((c) => c.id === commanderId);
    if (found) return found;
  }
  return void 0;
}
function allCommanders(state) {
  return state.players.flatMap((p) => p.commanders);
}
function commanderDamageOn(player, commanderId) {
  return player.commanderDamage[commanderId] ?? 0;
}
function highestCommanderDamageFrom(state, player, sourcePlayerId) {
  const source = getPlayer(state, sourcePlayerId);
  if (!source) return 0;
  return source.commanders.reduce(
    (worst, commander) => Math.max(worst, commanderDamageOn(player, commander.id)),
    0
  );
}
function commanderDamageRemaining(state, player, commanderId) {
  if (!state.rules.usesCommanderDamage) return Infinity;
  return Math.max(0, state.rules.commanderDamageLethal - commanderDamageOn(player, commanderId));
}
function commanderTax(state, commanderId) {
  const commander = findCommander(state, commanderId);
  if (!commander) return 0;
  return commander.castCount * state.rules.commanderTaxPerCast;
}
function cardsInZone(state, playerId, zone) {
  const player = getPlayer(state, playerId);
  if (!player) return [];
  return player.zones[zone].map((id) => state.cards[id]).filter(Boolean);
}
function isGameOver(state) {
  return state.status === "complete";
}
function winners(state) {
  return state.winnerIds.map((id) => getPlayer(state, id)).filter(Boolean);
}
function lossReasonLabel(reason) {
  switch (reason) {
    case "life":
      return "life total reached zero";
    case "poison":
      return "ten poison counters";
    case "commander_damage":
      return "21 commander damage";
    case "empty_library":
      return "drew from an empty library";
    case "concede":
      return "conceded";
    default:
      return "a game effect";
  }
}
function patchPlayer(state, playerId, patch) {
  let changed = false;
  const players = state.players.map((player) => {
    if (player.id !== playerId) return player;
    const next = patch(player);
    if (next !== player) changed = true;
    return next;
  });
  return changed ? { ...state, players } : state;
}
function patchCard(state, instanceId, patch) {
  const card = state.cards[instanceId];
  if (!card) return state;
  const next = patch(card);
  if (next === card) return state;
  return { ...state, cards: { ...state.cards, [instanceId]: next } };
}
function bumpCounter(counters, key, delta) {
  const next = { ...counters };
  const value = (next[key] ?? 0) + delta;
  if (value <= 0) delete next[key];
  else next[key] = value;
  return next;
}
function pushEvent(state, event) {
  return { ...state, log: [...state.log, { ...event, seq: state.log.length }] };
}
function logAction(state, action, at, message) {
  return pushEvent(state, {
    at,
    turn: state.turn,
    round: state.round,
    step: state.step,
    type: action.type,
    actorId: action.actorId,
    message
  });
}
function playerName(state, playerId) {
  return getPlayer(state, playerId)?.name ?? "Unknown player";
}
function cardName(state, instanceId) {
  return state.cards[instanceId]?.name ?? "a card";
}
function removeFromZones(player, instanceId) {
  let touched = false;
  const zones = {};
  for (const zone of ZONES) {
    const list = player.zones[zone];
    if (list.includes(instanceId)) {
      zones[zone] = list.filter((id) => id !== instanceId);
      touched = true;
    } else {
      zones[zone] = list;
    }
  }
  return touched ? { ...player, zones } : player;
}
function insertInto(list, instanceId, position) {
  if (position === "top" || position === void 0) return [instanceId, ...list];
  if (position === "bottom") return [...list, instanceId];
  const index = Math.max(0, Math.min(list.length, position));
  return [...list.slice(0, index), instanceId, ...list.slice(index)];
}
function moveCard(state, instanceId, to, options = {}) {
  const card = state.cards[instanceId];
  if (!card) return state;
  const players = state.players.map((player) => {
    const stripped = removeFromZones(player, instanceId);
    if (stripped.id !== card.ownerId) return stripped;
    const list = to === "library" ? insertInto(stripped.zones[to], instanceId, options.position ?? "top") : [...stripped.zones[to], instanceId];
    return { ...stripped, zones: { ...stripped.zones, [to]: list } };
  });
  const enteringBattlefield = to === "battlefield" && card.zone !== "battlefield";
  const nextCard = {
    ...card,
    zone: to,
    controllerId: options.controllerId ?? (to === "battlefield" ? card.controllerId : card.ownerId),
    tapped: to === "battlefield" ? options.tapped ?? false : false,
    // Leaving the battlefield resets everything a permanent was carrying.
    damage: to === "battlefield" ? card.damage : 0,
    counters: to === "battlefield" ? card.counters : {},
    attachedTo: to === "battlefield" ? card.attachedTo : void 0,
    summoningSick: enteringBattlefield ? true : to === "battlefield" ? card.summoningSick : false,
    faceDown: to === "battlefield" || to === "exile" ? card.faceDown : false
  };
  return { ...state, players, cards: { ...state.cards, [instanceId]: nextCard } };
}
function drawCards(state, playerId, count) {
  let next = state;
  for (let i = 0; i < count; i++) {
    const player = getPlayer(next, playerId);
    if (!player) break;
    const top = player.zones.library[0];
    if (!top) {
      next = patchPlayer(
        next,
        playerId,
        (p) => p.drewFromEmptyLibrary ? p : { ...p, drewFromEmptyLibrary: true }
      );
      break;
    }
    next = moveCard(next, top, "hand");
  }
  return next;
}
function applyDamage(state, targetPlayerId, options) {
  const { amount, commanderId, infect } = options;
  if (!amount) return state;
  return patchPlayer(state, targetPlayerId, (player) => {
    let next = player;
    if (infect) {
      next = { ...next, poison: Math.max(0, next.poison + amount) };
    } else {
      next = { ...next, life: next.life - amount };
    }
    if (commanderId && state.rules.usesCommanderDamage) {
      const current = next.commanderDamage[commanderId] ?? 0;
      const tally = Math.max(0, current + amount);
      const commanderDamage = { ...next.commanderDamage };
      if (tally === 0) delete commanderDamage[commanderId];
      else commanderDamage[commanderId] = tally;
      next = { ...next, commanderDamage };
    }
    return next;
  });
}
function untapPermanents(state, playerId) {
  const player = getPlayer(state, playerId);
  if (!player) return state;
  let cards = state.cards;
  let changed = false;
  for (const id of player.zones.battlefield) {
    const card = cards[id];
    if (!card || card.controllerId !== playerId) continue;
    if (!card.tapped) continue;
    if (!changed) {
      cards = { ...cards };
      changed = true;
    }
    cards[id] = { ...card, tapped: false };
  }
  return changed ? { ...state, cards } : state;
}
function clearSummoningSickness(state, playerId) {
  let cards = state.cards;
  let changed = false;
  for (const id of Object.keys(cards)) {
    const card = cards[id];
    if (card.zone !== "battlefield" || card.controllerId !== playerId || !card.summoningSick) continue;
    if (!changed) {
      cards = { ...cards };
      changed = true;
    }
    cards[id] = { ...card, summoningSick: false };
  }
  return changed ? { ...state, cards } : state;
}
function clearMarkedDamage(state) {
  let cards = state.cards;
  let changed = false;
  for (const id of Object.keys(cards)) {
    const card = cards[id];
    if (!card.damage) continue;
    if (!changed) {
      cards = { ...cards };
      changed = true;
    }
    cards[id] = { ...card, damage: 0 };
  }
  return changed ? { ...state, cards } : state;
}
function nextLivingPlayer(state, fromPlayerId) {
  const count = state.players.length;
  const fromSeat = getPlayer(state, fromPlayerId)?.seat ?? 0;
  for (let offset = 1; offset <= count; offset++) {
    const candidate = state.players[(fromSeat + offset) % count];
    if (candidate && isAlive(candidate)) return candidate;
  }
  return void 0;
}
function beginTurnFor(state, playerId) {
  let next = untapPermanents(state, playerId);
  next = clearSummoningSickness(next, playerId);
  next = patchPlayer(next, playerId, (p) => ({ ...p, landsPlayedThisTurn: 0 }));
  return next;
}
function passTurn(state, toPlayerId) {
  const explicit = toPlayerId ? getPlayer(state, toPlayerId) : void 0;
  const upNext = explicit ?? nextLivingPlayer(state, state.activePlayerId);
  if (!upNext) return state;
  const previousSeat = getPlayer(state, state.activePlayerId)?.seat ?? 0;
  const wrapped = upNext.seat <= previousSeat;
  let next = {
    ...clearMarkedDamage(state),
    turn: state.turn + 1,
    round: wrapped ? state.round + 1 : state.round,
    activePlayerId: upNext.id,
    priorityPlayerId: upNext.id,
    step: "untap",
    combat: { attackers: [] }
  };
  next = beginTurnFor(next, upNext.id);
  return next;
}
function skipsFirstDraw(state) {
  return state.players.length === 2 && state.turn === 1 && state.activePlayerId === state.startingPlayerId;
}
function enterStep(state, step) {
  let next = { ...state, step };
  switch (step) {
    case "untap":
      next = beginTurnFor(next, next.activePlayerId);
      break;
    case "draw":
      if (next.mode === "full" && !skipsFirstDraw(next)) {
        next = drawCards(next, next.activePlayerId, 1);
      }
      break;
    case "end_combat":
      next = { ...next, combat: { attackers: [] } };
      break;
    case "cleanup":
      next = clearMarkedDamage(next);
      break;
  }
  return next;
}
function advanceStep(state) {
  const index = TURN_STEPS.indexOf(state.step);
  const isLast = index === -1 || index === TURN_STEPS.length - 1;
  if (isLast) return passTurn(state);
  return enterStep(state, TURN_STEPS[index + 1]);
}
function lossReasonsFor(state, player) {
  const reasons = [];
  if (player.conceded) reasons.push("concede");
  if (player.life <= 0) reasons.push("life");
  if (player.poison >= state.rules.poisonLethal) reasons.push("poison");
  if (state.rules.usesCommanderDamage) {
    const lethal = Object.values(player.commanderDamage).some(
      (damage) => damage >= state.rules.commanderDamageLethal
    );
    if (lethal) reasons.push("commander_damage");
  }
  if (state.mode === "full" && player.drewFromEmptyLibrary) reasons.push("empty_library");
  return reasons;
}
function removePlayerCards(state, playerId) {
  const player = getPlayer(state, playerId);
  if (!player) return state;
  const owned = Object.values(state.cards).filter((card) => card.ownerId === playerId && !card.removedFromGame);
  if (owned.length === 0 && ZONES.every((zone) => player.zones[zone].length === 0)) return state;
  const cards = { ...state.cards };
  for (const card of owned) {
    cards[card.instanceId] = { ...card, removedFromGame: true, attachedTo: void 0 };
  }
  const ownedIds = new Set(owned.map((card) => card.instanceId));
  const players = state.players.map((p) => {
    if (p.id === playerId) return { ...p, zones: emptyZones() };
    let touched = false;
    const zones = {};
    for (const zone of ZONES) {
      const filtered = p.zones[zone].filter((id) => !ownedIds.has(id));
      if (filtered.length !== p.zones[zone].length) touched = true;
      zones[zone] = filtered;
    }
    return touched ? { ...p, zones } : p;
  });
  const combat = {
    attackers: state.combat.attackers.filter(
      (declaration) => declaration.defenderPlayerId !== playerId && !ownedIds.has(declaration.attackerId)
    )
  };
  return { ...state, cards, players, combat };
}
function checkStateBasedActions(state, at = state.updatedAt) {
  if (state.status !== "playing") return state;
  let next = state;
  const newlyLost = [];
  for (const player of state.players) {
    if (player.hasLost) continue;
    const reasons = lossReasonsFor(state, player);
    if (reasons.length === 0) continue;
    newlyLost.push({ player, reasons });
  }
  for (const { player, reasons } of newlyLost) {
    next = patchPlayer(next, player.id, (p) => ({ ...p, hasLost: true, lossReasons: reasons }));
    next = pushEvent(next, {
      at,
      turn: next.turn,
      round: next.round,
      step: next.step,
      type: "PLAYER_LOST",
      actorId: player.id,
      message: `${player.name} lost the game — ${lossReasonLabel(reasons[0])}.`
    });
    if (next.mode === "full") next = removePlayerCards(next, player.id);
  }
  const alive = livingPlayers(next);
  if (state.players.length > 1 && alive.length <= 1) {
    next = {
      ...next,
      status: "complete",
      winnerIds: alive.map((p) => p.id)
    };
    next = pushEvent(next, {
      at,
      turn: next.turn,
      round: next.round,
      step: next.step,
      type: "GAME_OVER",
      actorId: alive[0]?.id,
      message: alive.length === 1 ? `${alive[0].name} wins the game.` : "The game is a draw."
    });
  } else if (state.players.length === 1 && alive.length === 0) {
    next = { ...next, status: "complete", winnerIds: [] };
    next = pushEvent(next, {
      at,
      turn: next.turn,
      round: next.round,
      step: next.step,
      type: "GAME_OVER",
      message: "The game is over."
    });
  }
  if (next.status === "playing") {
    const active = getPlayer(next, next.activePlayerId);
    if (active && !isAlive(active)) {
      const upNext = nextLivingPlayer(next, next.activePlayerId);
      if (upNext) next = passTurn(next, upNext.id);
    }
  }
  return next;
}
const CARD_ACTIONS = /* @__PURE__ */ new Set([
  "DRAW",
  "PLAY",
  "MOVE_ZONE",
  "TAP",
  "UNTAP",
  "UNTAP_ALL",
  "SHUFFLE",
  "ATTACK",
  "BLOCK"
]);
function validateAction(state, action) {
  if (!action || typeof action.type !== "string") {
    return { ok: false, reason: "Malformed action." };
  }
  if (state.status === "complete" && action.type !== "RESET") {
    return { ok: false, reason: "The game is over." };
  }
  if (state.mode === "life-counter" && CARD_ACTIONS.has(action.type)) {
    return { ok: false, reason: `${action.type} needs a full game — this is a life counter.` };
  }
  const anyAction = action;
  for (const key of ["playerId", "targetPlayerId"]) {
    const value = anyAction[key];
    if (typeof value === "string" && !getPlayer(state, value)) {
      return { ok: false, reason: `Unknown player "${value}".` };
    }
  }
  if ("instanceId" in anyAction && typeof anyAction.instanceId === "string") {
    const card = state.cards[anyAction.instanceId];
    if (!card) return { ok: false, reason: "Unknown card instance." };
    if (card.removedFromGame) return { ok: false, reason: "That card has left the game." };
  }
  if (action.type === "COMMANDER_DAMAGE") {
    if (!state.rules.usesCommanderDamage) {
      return { ok: false, reason: `${state.rules.label} has no commander damage.` };
    }
    if (!findCommander(state, action.commanderId)) {
      return { ok: false, reason: "Unknown commander." };
    }
  }
  if (action.type === "CAST_COMMANDER" && !findCommander(state, action.commanderId)) {
    return { ok: false, reason: "Unknown commander." };
  }
  if (action.type === "PHASE_CHANGE" && !TURN_STEPS.includes(action.step)) {
    return { ok: false, reason: `Unknown step "${action.step}".` };
  }
  if (action.type === "MOVE_ZONE" && !ZONES.includes(action.to)) {
    return { ok: false, reason: `Unknown zone "${action.to}".` };
  }
  return { ok: true };
}
function describeAction(state, action) {
  switch (action.type) {
    case "LIFE_CHANGE": {
      const verb = action.delta >= 0 ? "gained" : "lost";
      return `${playerName(state, action.playerId)} ${verb} ${Math.abs(action.delta)} life.`;
    }
    case "SET_LIFE":
      return `${playerName(state, action.playerId)} set to ${action.life} life.`;
    case "DAMAGE": {
      const source = action.sourceInstanceId ? cardName(state, action.sourceInstanceId) : void 0;
      const suffix = source ? ` from ${source}` : "";
      if (action.infect) {
        return `${playerName(state, action.targetPlayerId)} took ${action.amount} poison${suffix}.`;
      }
      return `${playerName(state, action.targetPlayerId)} took ${action.amount} damage${suffix}.`;
    }
    case "COMMANDER_DAMAGE": {
      const commander = findCommander(state, action.commanderId);
      return `${playerName(state, action.targetPlayerId)} took ${Math.abs(action.amount)} commander damage from ${commander?.name ?? "a commander"}.`;
    }
    case "POISON":
      return `${playerName(state, action.playerId)} ${action.delta >= 0 ? "gained" : "lost"} ${Math.abs(action.delta)} poison.`;
    case "CONCEDE":
      return `${playerName(state, action.playerId)} conceded.`;
    case "PLAYER_COUNTER":
      return `${playerName(state, action.playerId)} ${action.delta >= 0 ? "+" : ""}${action.delta} ${action.counter}.`;
    case "CARD_COUNTER":
      return `${cardName(state, action.instanceId)} ${action.delta >= 0 ? "+" : ""}${action.delta} ${action.counter} counters.`;
    case "DRAW":
      return `${playerName(state, action.playerId)} drew ${action.count ?? 1} card${(action.count ?? 1) === 1 ? "" : "s"}.`;
    case "PLAY":
      return `${playerName(state, state.cards[action.instanceId]?.controllerId ?? state.activePlayerId)} played ${cardName(state, action.instanceId)}.`;
    case "MOVE_ZONE":
      return `${cardName(state, action.instanceId)} moved to ${action.to}.`;
    case "TAP":
      return `${cardName(state, action.instanceId)} tapped.`;
    case "UNTAP":
      return `${cardName(state, action.instanceId)} untapped.`;
    case "UNTAP_ALL":
      return `${playerName(state, action.playerId)} untapped everything.`;
    case "SHUFFLE":
      return `${playerName(state, action.playerId)} shuffled.`;
    case "CAST_COMMANDER": {
      const commander = findCommander(state, action.commanderId);
      return `${commander?.name ?? "A commander"} cast from the command zone.`;
    }
    case "ATTACK":
      return `${playerName(state, state.activePlayerId)} attacked with ${action.attackers.length} creature${action.attackers.length === 1 ? "" : "s"}.`;
    case "BLOCK":
      return `${action.blocks.length} block${action.blocks.length === 1 ? "" : "s"} declared.`;
    case "END_COMBAT":
      return "Combat ended.";
    case "PHASE_CHANGE":
      return `Step: ${action.step}.`;
    case "ADVANCE_STEP":
      return "Advanced a step.";
    case "PASS_TURN":
      return `Turn passed by ${playerName(state, state.activePlayerId)}.`;
    case "SET_MONARCH":
      return action.playerId ? `${playerName(state, action.playerId)} is the monarch.` : "No monarch.";
    case "SET_INITIATIVE":
      return action.playerId ? `${playerName(state, action.playerId)} has the initiative.` : "No initiative.";
    case "SET_PLAYER_NAME":
      return `${playerName(state, action.playerId)} is now ${action.name}.`;
    case "RESET":
      return "Game reset.";
    default:
      return "Action applied.";
  }
}
function reduce(state, action) {
  switch (action.type) {
    case "LIFE_CHANGE":
      return patchPlayer(state, action.playerId, (p) => ({ ...p, life: p.life + action.delta }));
    case "SET_LIFE":
      return patchPlayer(state, action.playerId, (p) => ({ ...p, life: action.life }));
    case "DAMAGE":
      return applyDamage(state, action.targetPlayerId, {
        amount: action.amount,
        commanderId: action.commanderId,
        infect: action.infect
      });
    case "COMMANDER_DAMAGE":
      return applyDamage(state, action.targetPlayerId, {
        amount: action.amount,
        commanderId: action.commanderId
      });
    case "POISON":
      return patchPlayer(state, action.playerId, (p) => ({
        ...p,
        poison: Math.max(0, p.poison + action.delta)
      }));
    case "CONCEDE":
      return patchPlayer(state, action.playerId, (p) => p.conceded ? p : { ...p, conceded: true });
    case "PLAYER_COUNTER":
      return patchPlayer(state, action.playerId, (p) => ({
        ...p,
        counters: bumpCounter(p.counters, action.counter, action.delta)
      }));
    case "CARD_COUNTER":
      return patchCard(state, action.instanceId, (card) => ({
        ...card,
        counters: bumpCounter(card.counters, action.counter, action.delta)
      }));
    case "DRAW":
      return drawCards(state, action.playerId, Math.max(1, action.count ?? 1));
    case "PLAY": {
      const card = state.cards[action.instanceId];
      if (!card) return state;
      const to = action.to ?? "battlefield";
      let next = moveCard(state, action.instanceId, to, {
        tapped: action.tapped,
        controllerId: action.controllerId ?? card.controllerId
      });
      if (card.zone === "command" && card.isCommander) {
        next = incrementCommanderCast(next, action.instanceId);
      }
      if (to === "battlefield" && (card.typeLine ?? "").toLowerCase().includes("land")) {
        next = patchPlayer(next, action.controllerId ?? card.controllerId, (p) => ({
          ...p,
          landsPlayedThisTurn: p.landsPlayedThisTurn + 1
        }));
      }
      return next;
    }
    case "MOVE_ZONE":
      return moveCard(state, action.instanceId, action.to, {
        position: action.position,
        controllerId: action.controllerId
      });
    case "TAP":
      return patchCard(state, action.instanceId, (card) => card.tapped ? card : { ...card, tapped: true });
    case "UNTAP":
      return patchCard(state, action.instanceId, (card) => card.tapped ? { ...card, tapped: false } : card);
    case "UNTAP_ALL":
      return untapPermanents(state, action.playerId);
    case "SHUFFLE": {
      const player = getPlayer(state, action.playerId);
      if (!player) return state;
      const rng = action.seed === void 0 ? state.rng : { seed: action.seed };
      const result = shuffleWithRng(player.zones.library, rng);
      return {
        ...patchPlayer(state, action.playerId, (p) => ({
          ...p,
          zones: { ...p.zones, library: result.items }
        })),
        rng: result.rng
      };
    }
    case "CAST_COMMANDER":
      return patchCommander(state, action.commanderId, (commander) => ({
        ...commander,
        castCount: commander.castCount + 1
      }));
    case "ATTACK": {
      let next = state;
      for (const declaration of action.attackers) {
        if (declaration.tap !== false) {
          next = patchCard(
            next,
            declaration.attackerId,
            (card) => card.tapped ? card : { ...card, tapped: true }
          );
        }
      }
      return {
        ...next,
        combat: {
          attackers: action.attackers.map((declaration) => ({
            attackerId: declaration.attackerId,
            defenderPlayerId: declaration.defenderPlayerId,
            defenderInstanceId: declaration.defenderInstanceId,
            blockedBy: []
          }))
        }
      };
    }
    case "BLOCK": {
      const attackers = state.combat.attackers.map((declaration) => {
        const blockers = action.blocks.filter((block) => block.attackerId === declaration.attackerId).map((block) => block.blockerId);
        if (blockers.length === 0) return declaration;
        return { ...declaration, blockedBy: [...declaration.blockedBy, ...blockers] };
      });
      return { ...state, combat: { attackers } };
    }
    case "END_COMBAT":
      return { ...state, combat: { attackers: [] } };
    case "PHASE_CHANGE":
      return enterStep(state, action.step);
    case "ADVANCE_STEP":
      return advanceStep(state);
    case "PASS_TURN":
      return passTurn(state, action.toPlayerId);
    case "SET_MONARCH":
      return { ...state, monarchId: action.playerId };
    case "SET_INITIATIVE":
      return { ...state, initiativeId: action.playerId };
    case "SET_PLAYER_NAME":
      return patchPlayer(state, action.playerId, (p) => ({ ...p, name: action.name }));
    case "RESET":
      return resetGame(state);
    default:
      return state;
  }
}
function patchCommander(state, commanderId, patch) {
  let changed = false;
  const players = state.players.map((player) => {
    if (!player.commanders.some((c) => c.id === commanderId)) return player;
    changed = true;
    return {
      ...player,
      commanders: player.commanders.map((c) => c.id === commanderId ? patch(c) : c)
    };
  });
  return changed ? { ...state, players } : state;
}
function incrementCommanderCast(state, instanceId) {
  const ref = allCommanders(state).find((commander) => commander.instanceId === instanceId);
  let next = patchCard(state, instanceId, (card) => ({ ...card, castCount: card.castCount + 1 }));
  if (ref) next = patchCommander(next, ref.id, (c) => ({ ...c, castCount: c.castCount + 1 }));
  return next;
}
function resetGame(state) {
  const players = state.players.map((player) => ({
    ...player,
    life: state.rules.startingLife,
    poison: 0,
    counters: {},
    commanderDamage: {},
    commanders: player.commanders.map((commander) => ({ ...commander, castCount: 0 })),
    landsPlayedThisTurn: 0,
    drewFromEmptyLibrary: false,
    conceded: false,
    hasLost: false,
    lossReasons: []
  }));
  return {
    ...state,
    status: "playing",
    players,
    turn: 1,
    round: 1,
    activePlayerId: state.startingPlayerId,
    priorityPlayerId: state.startingPlayerId,
    step: "untap",
    combat: { attackers: [] },
    monarchId: null,
    initiativeId: null,
    winnerIds: [],
    log: []
  };
}
function applyAction(state, action) {
  const check = validateAction(state, action);
  if (!check.ok) return state;
  const at = action.at ?? state.updatedAt;
  const message = describeAction(state, action);
  const reduced = reduce(state, action);
  if (reduced === state) return state;
  let next = logAction(reduced, action, at, message);
  next = { ...next, version: state.version + 1, updatedAt: at };
  return checkStateBasedActions(next, at);
}
function applyActions(state, actions) {
  return actions.reduce((current, action) => applyAction(current, action), state);
}
const SIDE_ROTATION = {
  bottom: 0,
  left: 90,
  top: 180,
  right: 270
};
const ROTATION_SIDE = {
  0: "bottom",
  90: "left",
  180: "top",
  270: "right"
};
const SIDE_LABEL = {
  bottom: "Bottom",
  left: "Left",
  top: "Top",
  right: "Right"
};
const CLOCKWISE_SIDES = ["bottom", "left", "top", "right"];
const seat = (index, side, rect) => ({
  index,
  side,
  rotation: SIDE_ROTATION[side],
  rect,
  isSideways: side === "left" || side === "right"
});
const LAYOUTS = {
  1: {
    table: {
      playerCount: 1,
      variant: "table",
      description: "Solo — the whole board faces you.",
      seats: [seat(0, "bottom", { x: 0, y: 0, w: 1, h: 1 })]
    }
  },
  2: {
    // Two players facing each other across the device.
    table: {
      playerCount: 2,
      variant: "table",
      description: "Head to head — one player on each long edge.",
      seats: [
        seat(0, "bottom", { x: 0, y: 0.5, w: 1, h: 0.5 }),
        seat(1, "top", { x: 0, y: 0, w: 1, h: 0.5 })
      ]
    },
    // Device held or laid between two players sitting side by side.
    shared: {
      playerCount: 2,
      variant: "shared",
      description: "Side by side — the device sits between both players.",
      seats: [
        seat(0, "left", { x: 0, y: 0, w: 0.5, h: 1 }),
        seat(1, "right", { x: 0.5, y: 0, w: 0.5, h: 1 })
      ]
    }
  },
  3: {
    // Three of the four edges occupied: bottom, left, right.
    table: {
      playerCount: 3,
      variant: "table",
      description: "Three edges — bottom, left and right.",
      seats: [
        seat(0, "bottom", { x: 0, y: 0.5, w: 1, h: 0.5 }),
        seat(1, "left", { x: 0, y: 0, w: 0.5, h: 0.5 }),
        seat(2, "right", { x: 0.5, y: 0, w: 0.5, h: 0.5 })
      ]
    },
    // Two players on the far edge, one on the near edge.
    stacked: {
      playerCount: 3,
      variant: "stacked",
      description: "One near, two across — for a couch or a narrow table.",
      seats: [
        seat(0, "bottom", { x: 0, y: 0.5, w: 1, h: 0.5 }),
        seat(1, "top", { x: 0, y: 0, w: 0.5, h: 0.5 }),
        seat(2, "top", { x: 0.5, y: 0, w: 0.5, h: 0.5 })
      ]
    }
  },
  4: {
    // A pinwheel: every player gets their own edge. The true four-player pod.
    table: {
      playerCount: 4,
      variant: "table",
      description: "Four edges — one player per side of the device.",
      seats: [
        seat(0, "bottom", { x: 0, y: 0.75, w: 1, h: 0.25 }),
        seat(1, "left", { x: 0, y: 0.25, w: 0.5, h: 0.5 }),
        seat(2, "top", { x: 0, y: 0, w: 1, h: 0.25 }),
        seat(3, "right", { x: 0.5, y: 0.25, w: 0.5, h: 0.5 })
      ]
    },
    // Classic 2x2 grid: two players along each long edge. Bigger panels.
    quads: {
      playerCount: 4,
      variant: "quads",
      description: "Two by two — two players along each long edge.",
      seats: [
        seat(0, "bottom", { x: 0, y: 0.5, w: 0.5, h: 0.5 }),
        seat(1, "top", { x: 0, y: 0, w: 0.5, h: 0.5 }),
        seat(2, "top", { x: 0.5, y: 0, w: 0.5, h: 0.5 }),
        seat(3, "bottom", { x: 0.5, y: 0.5, w: 0.5, h: 0.5 })
      ]
    }
  }
};
function generatedGrid(playerCount) {
  const bottomCount = Math.ceil(playerCount / 2);
  const topCount = playerCount - bottomCount;
  const seats = [];
  for (let i = 0; i < bottomCount; i++) {
    seats.push(
      seat(i, "bottom", { x: i / bottomCount, y: 0.5, w: 1 / bottomCount, h: 0.5 })
    );
  }
  for (let i = 0; i < topCount; i++) {
    const column = topCount - 1 - i;
    seats.push(
      seat(bottomCount + i, "top", { x: column / topCount, y: 0, w: 1 / topCount, h: 0.5 })
    );
  }
  return {
    playerCount,
    variant: "grid",
    description: `${playerCount} players in two facing rows.`,
    seats
  };
}
const MAX_SEATS = 6;
const TUNED_SEAT_COUNTS = [1, 2, 3, 4];
function seatingFor(playerCount, variant = "table") {
  if (!Number.isInteger(playerCount) || playerCount < 1 || playerCount > MAX_SEATS) {
    throw new Error(`seatingFor: unsupported player count ${playerCount} (expected 1–${MAX_SEATS})`);
  }
  const tuned = LAYOUTS[playerCount];
  if (!tuned) return generatedGrid(playerCount);
  return tuned[variant] ?? tuned.table ?? generatedGrid(playerCount);
}
function seatingVariants(playerCount) {
  const tuned = LAYOUTS[playerCount];
  if (!tuned) return [generatedGrid(playerCount)];
  const ordered = [];
  if (tuned.table) ordered.push(tuned.table);
  for (const key of Object.keys(tuned)) {
    if (key !== "table" && tuned[key]) ordered.push(tuned[key]);
  }
  return ordered;
}
function seatAt(layout, index) {
  return layout.seats.find((s) => s.index === index);
}
function rotationForSeat(layout, index) {
  return seatAt(layout, index)?.rotation ?? 0;
}
function sideForSeat(layout, index) {
  return seatAt(layout, index)?.side ?? "bottom";
}
function turnOrderFrom(layout, fromIndex = 0) {
  const count = layout.seats.length;
  const start = (fromIndex % count + count) % count;
  return Array.from({ length: count }, (_, offset) => (start + offset) % count);
}
function layoutFromViewpoint(layout, viewerIndex) {
  const order = turnOrderFrom(layout, viewerIndex);
  const seats = order.map((originalIndex, position) => {
    const source = layout.seats[position];
    return { ...source, index: originalIndex };
  });
  return { ...layout, seats };
}
const pct = (value) => `${Number((value * 100).toFixed(4))}%`;
function seatBoxStyle(seat2) {
  return {
    position: "absolute",
    left: pct(seat2.rect.x),
    top: pct(seat2.rect.y),
    width: pct(seat2.rect.w),
    height: pct(seat2.rect.h),
    containerType: "size"
  };
}
function seatContentStyle(seat2) {
  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: seat2.isSideways ? "100cqh" : "100cqw",
    height: seat2.isSideways ? "100cqw" : "100cqh",
    transform: `translate(-50%, -50%) rotate(${seat2.rotation}deg)`
  };
}
function seatContentStyleUpright(seat2) {
  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: "100cqw",
    height: "100cqh",
    transform: "translate(-50%, -50%)"
  };
}
function seatRotationTransform(seat2) {
  return `rotate(${seat2.rotation}deg)`;
}
const COLORS = ["W", "U", "B", "R", "G"];
const EMPTY_COST = { generic: 0, pips: [], colorless: 0, hasX: false, total: 0 };
function parseCost(cost) {
  if (!cost) return EMPTY_COST;
  let generic = 0;
  let colorless = 0;
  let hasX = false;
  const pips = [];
  const symbols = Array.from(cost.matchAll(/\{([^}]+)\}/g)).map((match) => match[1].toUpperCase());
  for (const symbol of symbols) {
    if (symbol === "X" || symbol === "Y" || symbol === "Z") {
      hasX = true;
      continue;
    }
    if (symbol === "S") {
      generic += 1;
      continue;
    }
    if (symbol === "C") {
      colorless += 1;
      continue;
    }
    if (/^\d+$/.test(symbol)) {
      generic += Number(symbol);
      continue;
    }
    if (symbol.includes("/")) {
      const parts = symbol.split("/");
      if (parts.includes("P")) {
        continue;
      }
      const colorParts = parts.filter((p) => COLORS.includes(p));
      const numeric = parts.find((p) => /^\d+$/.test(p));
      if (numeric && colorParts.length > 0) {
        pips.push(colorParts);
        continue;
      }
      if (colorParts.length > 0) {
        pips.push(colorParts);
        continue;
      }
      generic += 1;
      continue;
    }
    if (COLORS.includes(symbol)) {
      pips.push([symbol]);
      continue;
    }
    generic += 1;
  }
  return {
    generic,
    pips,
    colorless,
    hasX,
    total: generic + pips.length + colorless
  };
}
function isLand(card) {
  return !!card && (card.typeLine ?? "").toLowerCase().includes("land");
}
function isCreature(card) {
  return !!card && (card.typeLine ?? "").toLowerCase().includes("creature");
}
function isPermanent(card) {
  const line = (card?.typeLine ?? "").toLowerCase();
  if (!line) return false;
  return line.includes("creature") || line.includes("land") || line.includes("artifact") || line.includes("enchantment") || line.includes("planeswalker") || line.includes("battle");
}
function resolvesToGraveyard(card) {
  const line = (card?.typeLine ?? "").toLowerCase();
  return line.includes("instant") || line.includes("sorcery");
}
function producedColors(card) {
  const identity = card.colorIdentity ?? [];
  return identity.filter((c) => COLORS.includes(c));
}
function manaSourcesFor(state, playerId) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];
  const sources = [];
  for (const id of player.zones.battlefield) {
    const card = state.cards[id];
    if (!card || card.tapped || card.controllerId !== playerId) continue;
    const line = (card.typeLine ?? "").toLowerCase();
    const land = line.includes("land");
    const rock = !land && (line.includes("artifact") || line.includes("creature"));
    if (!land && !rock) continue;
    if (rock && card.summoningSick && line.includes("creature")) continue;
    if (rock && producedColors(card).length === 0) continue;
    sources.push({
      instanceId: card.instanceId,
      name: card.name,
      produces: producedColors(card),
      isLand: land
    });
  }
  return sources;
}
function matchPips(pips, sources) {
  const assignedTo = new Array(sources.length).fill(-1);
  const augment = (pipIndex, seen) => {
    for (let s = 0; s < sources.length; s++) {
      if (seen[s]) continue;
      const source = sources[s];
      const canPay = pips[pipIndex].some((color) => source.produces.indexOf(color) !== -1);
      if (!canPay) continue;
      seen[s] = true;
      if (assignedTo[s] === -1 || augment(assignedTo[s], seen)) {
        assignedTo[s] = pipIndex;
        return true;
      }
    }
    return false;
  };
  for (let p = 0; p < pips.length; p++) {
    if (!augment(p, new Array(sources.length).fill(false))) return null;
  }
  const result = new Array(pips.length).fill(-1);
  for (let s = 0; s < sources.length; s++) {
    if (assignedTo[s] !== -1) result[assignedTo[s]] = s;
  }
  return result;
}
function planPayment(cost, sources) {
  const parsed = parseCost(cost);
  const required = parsed.total;
  if (required === 0) {
    return { ok: true, tapIds: [], required: 0, available: sources.length, reason: "" };
  }
  if (sources.length < required) {
    return {
      ok: false,
      tapIds: [],
      required,
      available: sources.length,
      reason: `Needs ${required} mana, ${sources.length} untapped source${sources.length === 1 ? "" : "s"} available.`
    };
  }
  const matched = matchPips(parsed.pips, sources);
  if (!matched) {
    return {
      ok: false,
      tapIds: [],
      required,
      available: sources.length,
      reason: "No untapped source produces the colours this costs."
    };
  }
  const used = new Set(matched.filter((index) => index >= 0));
  const tapIds = matched.map((index) => sources[index].instanceId);
  let colorlessLeft = parsed.colorless;
  for (let s = 0; s < sources.length && colorlessLeft > 0; s++) {
    if (used.has(s) || sources[s].produces.length > 0) continue;
    used.add(s);
    tapIds.push(sources[s].instanceId);
    colorlessLeft -= 1;
  }
  if (colorlessLeft > 0) {
    return {
      ok: false,
      tapIds: [],
      required,
      available: sources.length,
      reason: "No untapped colourless source for the {C} in this cost."
    };
  }
  const spare = [];
  for (let s = 0; s < sources.length; s++) if (!used.has(s)) spare.push(s);
  spare.sort((a, b) => sources[a].produces.length - sources[b].produces.length);
  let genericLeft = parsed.generic;
  for (const index of spare) {
    if (genericLeft <= 0) break;
    tapIds.push(sources[index].instanceId);
    genericLeft -= 1;
  }
  if (genericLeft > 0) {
    return {
      ok: false,
      tapIds: [],
      required,
      available: sources.length,
      reason: `Needs ${required} mana, ${sources.length} untapped source${sources.length === 1 ? "" : "s"} available.`
    };
  }
  return { ok: true, tapIds, required, available: sources.length, reason: "" };
}
function planCast(state, playerId, card) {
  return planPayment(card.manaCost, manaSourcesFor(state, playerId));
}
function availableMana(state, playerId) {
  return manaSourcesFor(state, playerId).length;
}
function baseNumber(value) {
  if (!value) return 0;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
function counterDelta(card) {
  const plus = card.counters["+1/+1"] ?? 0;
  const minus = card.counters["-1/-1"] ?? 0;
  return plus - minus;
}
function powerOf(card) {
  if (!card) return 0;
  return Math.max(0, baseNumber(card.power) + counterDelta(card));
}
function toughnessOf(card) {
  if (!card) return 0;
  return baseNumber(card.toughness) + counterDelta(card);
}
function hasKeyword(card, keyword) {
  if (!card || !card.keywords) return false;
  const wanted = keyword.toLowerCase();
  return card.keywords.some((k) => k.toLowerCase() === wanted);
}
function statLine(card) {
  if (!card || !isCreature(card)) return null;
  return `${powerOf(card)}/${toughnessOf(card)}`;
}
function eligibleAttackers(state, playerId) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];
  return player.zones.battlefield.map((id) => state.cards[id]).filter((card) => {
    if (!card || card.controllerId !== playerId) return false;
    if (!isCreature(card)) return false;
    if (card.tapped) return false;
    if (hasKeyword(card, "defender")) return false;
    if (card.summoningSick && !hasKeyword(card, "haste")) return false;
    return true;
  });
}
function eligibleBlockers(state, playerId) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];
  return player.zones.battlefield.map((id) => state.cards[id]).filter((card) => !!card && card.controllerId === playerId && isCreature(card) && !card.tapped);
}
function canBlock(attacker, blocker) {
  if (!attacker || !blocker) return false;
  if (blocker.tapped) return false;
  if (hasKeyword(attacker, "flying")) {
    return hasKeyword(blocker, "flying") || hasKeyword(blocker, "reach");
  }
  return true;
}
function tapsToAttack(card) {
  return !hasKeyword(card, "vigilance");
}
const EMPTY_OUTCOME = {
  actions: [],
  playerDamage: [],
  destroyed: [],
  summary: "No combat damage."
};
function commanderIdFor(state, card) {
  if (!card.isCommander) return void 0;
  for (const player of state.players) {
    const ref = player.commanders.find((c) => c.instanceId === card.instanceId);
    if (ref) return ref.id;
  }
  return void 0;
}
function assignToBlockers(state, attacker, blockers) {
  const perBlocker = /* @__PURE__ */ new Map();
  const deathtouch = hasKeyword(attacker, "deathtouch");
  let remaining = powerOf(attacker);
  for (const blocker of blockers) {
    if (remaining <= 0) break;
    const lethal = deathtouch ? 1 : Math.max(1, toughnessOf(blocker));
    const assigned = Math.min(remaining, lethal);
    perBlocker.set(blocker.instanceId, assigned);
    remaining -= assigned;
  }
  const trampleOver = hasKeyword(attacker, "trample") ? Math.max(0, remaining) : 0;
  return { perBlocker, trampleOver };
}
function resolveCombat(state, at = 0) {
  const declarations = state.combat.attackers;
  if (!declarations || declarations.length === 0) return EMPTY_OUTCOME;
  const actions = [];
  const destroyed = [];
  const damageToPlayer = /* @__PURE__ */ new Map();
  const damageOnCreature = /* @__PURE__ */ new Map();
  const deathtouchedCreature = /* @__PURE__ */ new Set();
  const addPlayerDamage = (playerId, amount, commander) => {
    if (amount <= 0) return;
    const current = damageToPlayer.get(playerId) ?? { amount: 0, commander: false };
    damageToPlayer.set(playerId, {
      amount: current.amount + amount,
      commander: current.commander || commander
    });
  };
  const addCreatureDamage = (instanceId, amount, deathtouch) => {
    if (amount <= 0) return;
    damageOnCreature.set(instanceId, (damageOnCreature.get(instanceId) ?? 0) + amount);
    if (deathtouch) deathtouchedCreature.add(instanceId);
  };
  for (const declaration of declarations) {
    const attacker = state.cards[declaration.attackerId];
    if (!attacker || attacker.zone !== "battlefield") continue;
    const blockers = declaration.blockedBy.map((id) => state.cards[id]).filter((card) => !!card && card.zone === "battlefield");
    if (blockers.length === 0) {
      const defenderId = declaration.defenderPlayerId;
      if (!defenderId) continue;
      const amount = powerOf(attacker);
      if (amount <= 0) continue;
      const commanderId = commanderIdFor(state, attacker);
      actions.push({
        type: "DAMAGE",
        targetPlayerId: defenderId,
        amount,
        sourcePlayerId: attacker.controllerId,
        sourceInstanceId: attacker.instanceId,
        commanderId,
        combat: true,
        at
      });
      addPlayerDamage(defenderId, amount, !!commanderId);
      continue;
    }
    const { perBlocker, trampleOver } = assignToBlockers(state, attacker, blockers);
    const attackerDeathtouch = hasKeyword(attacker, "deathtouch");
    for (const blocker of blockers) {
      addCreatureDamage(blocker.instanceId, perBlocker.get(blocker.instanceId) ?? 0, attackerDeathtouch);
      addCreatureDamage(attacker.instanceId, powerOf(blocker), hasKeyword(blocker, "deathtouch"));
    }
    if (trampleOver > 0 && declaration.defenderPlayerId) {
      const commanderId = commanderIdFor(state, attacker);
      actions.push({
        type: "DAMAGE",
        targetPlayerId: declaration.defenderPlayerId,
        amount: trampleOver,
        sourcePlayerId: attacker.controllerId,
        sourceInstanceId: attacker.instanceId,
        commanderId,
        combat: true,
        at
      });
      addPlayerDamage(declaration.defenderPlayerId, trampleOver, !!commanderId);
    }
  }
  for (const [instanceId, amount] of damageOnCreature) {
    const card = state.cards[instanceId];
    if (!card || card.zone !== "battlefield") continue;
    const lethal = deathtouchedCreature.has(instanceId) || amount >= toughnessOf(card);
    if (!lethal) continue;
    destroyed.push(instanceId);
    actions.push({ type: "MOVE_ZONE", instanceId, to: "graveyard", at });
  }
  const playerDamage = Array.from(damageToPlayer.entries()).map(([playerId, entry]) => ({
    playerId,
    amount: entry.amount,
    commander: entry.commander
  }));
  const parts = [];
  for (const entry of playerDamage) {
    const name = state.players.find((p) => p.id === entry.playerId)?.name ?? "a player";
    parts.push(`${name} took ${entry.amount}`);
  }
  if (destroyed.length > 0) {
    parts.push(`${destroyed.length} creature${destroyed.length === 1 ? "" : "s"} died`);
  }
  return {
    actions,
    playerDamage,
    destroyed,
    summary: parts.length > 0 ? `${parts.join(", ")}.` : "Combat dealt no damage."
  };
}
function defendersUnderAttack(state) {
  const ids = /* @__PURE__ */ new Set();
  for (const declaration of state.combat.attackers) {
    if (declaration.defenderPlayerId) ids.add(declaration.defenderPlayerId);
  }
  return Array.from(ids);
}
function isUnderAttack(state, playerId) {
  return state.combat.attackers.some((d) => d.defenderPlayerId === playerId);
}
function attackingPlayerId(state) {
  for (const declaration of state.combat.attackers) {
    const card = state.cards[declaration.attackerId];
    if (card) return card.controllerId;
  }
  return void 0;
}
function combatLanes(state) {
  return state.combat.attackers.map((declaration) => {
    const attacker = state.cards[declaration.attackerId];
    const defender = declaration.defenderPlayerId ? state.players.find((p) => p.id === declaration.defenderPlayerId) : void 0;
    return {
      declaration,
      attacker,
      blockers: declaration.blockedBy.map((id) => state.cards[id]).filter(Boolean),
      defenderPlayerId: declaration.defenderPlayerId,
      lethalIfUnblocked: !!defender && declaration.blockedBy.length === 0 && powerOf(attacker) >= defender.life
    };
  });
}
function costWithTax(card, tax) {
  const base = card.manaCost ?? "";
  return tax > 0 ? `{${tax}}${base}` : base;
}
function taxForCard(state, card) {
  if (!card.isCommander || card.zone !== "command") return 0;
  for (const player of state.players) {
    const ref = player.commanders.find((c) => c.instanceId === card.instanceId);
    if (ref) return commanderTax(state, ref.id);
  }
  return 0;
}
function planCastFromHand(state, playerId, instanceId, options = {}) {
  const card = getCard(state, instanceId);
  const at = options.at ?? 0;
  const fail = (reason, payment2) => ({
    ok: false,
    actions: [],
    payment: payment2 ?? { ok: false, tapIds: [], required: 0, available: 0, reason },
    destination: "battlefield",
    tax: 0,
    reason
  });
  if (!card) return fail("That card is not in this game.");
  if (card.zone !== "hand" && card.zone !== "command") {
    return fail("Only cards in hand or the command zone can be cast.");
  }
  if (card.controllerId !== playerId && card.ownerId !== playerId) {
    return fail("That is not your card.");
  }
  if (isLand(card)) return fail("Lands are played, not cast.");
  const destination = resolvesToGraveyard(card) ? "graveyard" : "battlefield";
  const tax = taxForCard(state, card);
  const payment = options.ignoreMana ? { ok: true, tapIds: [], required: 0, available: 0, reason: "" } : planPayment(costWithTax(card, tax), manaSourcesFor(state, playerId));
  if (!payment.ok) {
    return { ...fail(payment.reason, payment), tax, destination };
  }
  const actions = payment.tapIds.map((id) => ({ type: "TAP", instanceId: id, at }));
  actions.push({
    type: "PLAY",
    instanceId,
    to: destination,
    tapped: options.tapped,
    controllerId: playerId,
    at
  });
  return { ok: true, actions, payment, destination, tax, reason: "" };
}
function planLandDrop(state, playerId, instanceId, options = {}) {
  const card = getCard(state, instanceId);
  const player = getPlayer(state, playerId);
  const at = options.at ?? 0;
  if (!card || !player) return { ok: false, actions: [], reason: "That card is not in this game." };
  if (!isLand(card)) return { ok: false, actions: [], reason: "That is not a land." };
  if (card.zone !== "hand") return { ok: false, actions: [], reason: "That land is not in your hand." };
  if (!options.ignoreLandLimit && player.landsPlayedThisTurn >= 1) {
    return { ok: false, actions: [], reason: "You have already played a land this turn." };
  }
  if (!options.ignoreLandLimit && state.activePlayerId !== playerId) {
    return { ok: false, actions: [], reason: "Lands can only be played on your own turn." };
  }
  return {
    ok: true,
    reason: "",
    actions: [{ type: "PLAY", instanceId, to: "battlefield", controllerId: playerId, at }]
  };
}
function declareAttack(state, attacks, at = 0) {
  if (attacks.length === 0) return [];
  return [
    {
      type: "ATTACK",
      at,
      attackers: attacks.map((attack) => {
        const card = getCard(state, attack.attackerId);
        return {
          attackerId: attack.attackerId,
          defenderPlayerId: attack.defenderPlayerId,
          tap: card ? tapsToAttack(card) : true
        };
      })
    }
  ];
}
function attackableWith(state, playerId) {
  if (state.activePlayerId !== playerId) return [];
  if (state.step !== "declare_attackers") return [];
  return eligibleAttackers(state, playerId);
}
function resolveCombatAndAdvance(state, at = 0) {
  const outcome = resolveCombat(state, at);
  return {
    outcome,
    actions: [...outcome.actions, { type: "ADVANCE_STEP", at }]
  };
}
function advanceActions(state, at = 0) {
  if (state.step === "combat_damage" && state.combat.attackers.length > 0) {
    return resolveCombatAndAdvance(state, at).actions;
  }
  return [{ type: "ADVANCE_STEP", at }];
}
function instanceIdFor(playerId, index) {
  return `${playerId}-c${index}`;
}
function buildTable(options) {
  const seats = options.seats ?? [];
  if (seats.length === 0) throw new Error("buildTable: at least one seat is required");
  const format = options.format ?? seats[0].deck.format ?? "commander";
  const now = options.now ?? 0;
  const playerConfigs = seats.map((seat2, index) => {
    const playerId = seat2.playerId ?? `p${index + 1}`;
    return {
      id: playerId,
      name: seat2.playerName,
      deckId: seat2.deck.id,
      commanders: seat2.deck.commanders.map((commander, ci) => ({
        id: `${playerId}-cmd${ci + 1}`,
        name: commander.name,
        // Reserve the top of this seat's id space for commanders.
        instanceId: instanceIdFor(playerId, ci),
        colorIdentity: commander.colorIdentity,
        imageUrl: commander.imageUrl
      }))
    };
  });
  let state = createGame({
    id: options.id,
    mode: "full",
    format,
    players: playerConfigs,
    seed: options.seed ?? 1,
    now
  });
  const decksBySeat = {};
  const botPlayerIds = [];
  seats.forEach((seat2, index) => {
    const playerId = playerConfigs[index].id;
    decksBySeat[playerId] = seat2.deck;
    if (seat2.isBot) botPlayerIds.push(playerId);
    let cursor = 0;
    for (const commander of seat2.deck.commanders) {
      state = addCard(
        state,
        {
          instanceId: instanceIdFor(playerId, cursor),
          cardId: commander.cardId,
          name: commander.name,
          ownerId: playerId,
          isCommander: true,
          manaCost: commander.manaCost,
          cmc: commander.cmc,
          typeLine: commander.typeLine,
          power: commander.power,
          toughness: commander.toughness,
          colorIdentity: commander.colorIdentity,
          imageUrl: commander.imageUrl,
          keywords: commander.keywords
        },
        "command"
      );
      cursor += 1;
    }
    for (const card of seat2.deck.cards) {
      state = addCard(
        state,
        {
          instanceId: instanceIdFor(playerId, cursor),
          cardId: card.cardId,
          name: card.name,
          ownerId: playerId,
          manaCost: card.manaCost,
          cmc: card.cmc,
          typeLine: card.typeLine,
          power: card.power,
          toughness: card.toughness,
          colorIdentity: card.colorIdentity,
          imageUrl: card.imageUrl,
          keywords: card.keywords
        },
        "library"
      );
      cursor += 1;
    }
  });
  for (const config of playerConfigs) {
    state = applyAction(state, { type: "SHUFFLE", playerId: config.id, at: now });
  }
  if (!options.skipOpeningHands) {
    const handSize = options.handSize ?? state.rules.startingHandSize;
    for (const config of playerConfigs) {
      state = applyAction(state, {
        type: "DRAW",
        playerId: config.id,
        count: handSize,
        at: now
      });
    }
  }
  return { state, botPlayerIds, decksBySeat };
}
function mulliganActions(state, playerId, at = 0) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || state.mode !== "full") return [];
  const handSize = player.zones.hand.length;
  if (handSize === 0) return [];
  const actions = player.zones.hand.map((instanceId) => ({
    type: "MOVE_ZONE",
    instanceId,
    to: "library",
    position: "bottom",
    at
  }));
  actions.push({ type: "SHUFFLE", playerId, at });
  actions.push({ type: "DRAW", playerId, count: Math.max(1, handSize - 1), at });
  return actions;
}
function handCards(state, playerId) {
  const player = getPlayer(state, playerId);
  if (!player) return [];
  return player.zones.hand.map((id) => state.cards[id]).filter(Boolean);
}
function castScore(card) {
  const cmc = card.cmc ?? 0;
  if (isCreature(card)) return 100 + powerOf(card) * 3 + toughnessOf(card) + cmc;
  if (isPermanent(card)) return 50 + cmc;
  return 10 + cmc;
}
function chooseLand(state, playerId) {
  const lands = handCards(state, playerId).filter(isLand);
  if (lands.length === 0) return null;
  const owned = /* @__PURE__ */ new Set();
  const player = getPlayer(state, playerId);
  for (const id of player?.zones.battlefield ?? []) {
    const card = state.cards[id];
    if (card && isLand(card)) for (const color of card.colorIdentity ?? []) owned.add(color);
  }
  const wanted = /* @__PURE__ */ new Map();
  for (const card of handCards(state, playerId)) {
    if (isLand(card)) continue;
    for (const color of card.colorIdentity ?? []) {
      wanted.set(color, (wanted.get(color) ?? 0) + 1);
    }
  }
  const score = (land) => {
    const colors = land.colorIdentity ?? [];
    if (colors.length === 0) return 0;
    let value = 0;
    for (const color of colors) {
      value += wanted.get(color) ?? 0;
      if (!owned.has(color)) value += 5;
    }
    return value;
  };
  return lands.slice().sort((a, b) => score(b) - score(a))[0];
}
function chooseSpell(state, playerId, at) {
  const player = getPlayer(state, playerId);
  if (!player) return null;
  const candidates = [
    ...handCards(state, playerId).filter((card) => !isLand(card)),
    // The commander is a card in a zone like any other; the tax is priced in by
    // `planCastFromHand`, so the bot naturally holds it when it cannot pay.
    ...player.zones.command.map((id) => state.cards[id]).filter(Boolean)
  ];
  const ranked = candidates.filter((card) => isPermanent(card)).sort((a, b) => castScore(b) - castScore(a));
  for (const card of ranked) {
    const plan = planCastFromHand(state, playerId, card.instanceId, { at });
    if (plan.ok) return { card, actions: plan.actions };
  }
  return null;
}
function attackTargets(state, playerId) {
  const openness = (opponentId) => eligibleBlockers(state, opponentId).reduce(
    (sum, blocker) => sum + 2 + toughnessOf(blocker),
    0
  );
  return livingPlayers(state).filter((p) => p.id !== playerId).map((p) => ({ player: p, score: p.life + openness(p.id) })).sort((a, b) => a.score - b.score || a.player.seat - b.player.seat).map((entry) => entry.player);
}
function shouldAttackWith(attacker, defenders, aggression, lethalSwing, boardAdvantage) {
  if (powerOf(attacker) <= 0) return false;
  if (lethalSwing) return true;
  const relevant = defenders.filter((defender) => canBlock(attacker, defender));
  if (relevant.length === 0) return true;
  const killsMeAndLives = relevant.some(
    (defender) => powerOf(defender) >= toughnessOf(attacker) && toughnessOf(defender) > powerOf(attacker)
  );
  const iKillIt = relevant.some((defender) => powerOf(attacker) >= toughnessOf(defender));
  if (aggression === "aggressive") return !killsMeAndLives || boardAdvantage;
  if (aggression === "timid") return !killsMeAndLives && iKillIt;
  return !killsMeAndLives || boardAdvantage && iKillIt;
}
function activeMove(state, playerId, options) {
  const at = options.at ?? 0;
  const aggression = options.aggression ?? "normal";
  const advance = (note) => ({ actions: advanceActions(state, at), note });
  switch (state.step) {
    case "untap":
      return advance("Untaps.");
    case "upkeep":
      return advance("Upkeep.");
    case "draw":
      return advance("Draws for turn.");
    case "precombat_main":
    case "postcombat_main": {
      const player = getPlayer(state, playerId);
      if (!player) return null;
      if (state.step === "precombat_main" && player.landsPlayedThisTurn === 0) {
        const land = chooseLand(state, playerId);
        if (land) {
          const plan = planLandDrop(state, playerId, land.instanceId, { at });
          if (plan.ok) return { actions: plan.actions, note: `Plays ${land.name}.` };
        }
      }
      const spell = chooseSpell(state, playerId, at);
      if (spell) {
        const mana = manaSourcesFor(state, playerId).length;
        return {
          actions: spell.actions,
          note: `Casts ${spell.card.name} (${mana} untapped before).`
        };
      }
      return advance(state.step === "precombat_main" ? "Moves to combat." : "Ends the turn.");
    }
    case "begin_combat":
      return advance("Begins combat.");
    case "declare_attackers": {
      if (state.combat.attackers.length > 0) return advance("Attackers are declared.");
      const targets = attackTargets(state, playerId);
      if (targets.length === 0) return advance("Nobody left to attack.");
      const target = targets[0];
      const declared = new Set(state.combat.attackers.map((d) => d.attackerId));
      const available = eligibleAttackers(state, playerId).filter(
        (card) => !declared.has(card.instanceId)
      );
      if (available.length === 0) return advance("No attackers.");
      const defenders = eligibleBlockers(state, target.id);
      const totalPower = available.reduce((sum, card) => sum + powerOf(card), 0);
      const lethalSwing = totalPower >= target.life && defenders.length === 0;
      const boardAdvantage = available.length > defenders.length + 1;
      const attacking = available.filter(
        (card) => shouldAttackWith(card, defenders, aggression, lethalSwing, boardAdvantage)
      );
      if (attacking.length === 0) return advance("Holds back this turn.");
      return {
        actions: declareAttack(
          state,
          attacking.map((card) => ({ attackerId: card.instanceId, defenderPlayerId: target.id })),
          at
        ),
        note: `Attacks ${target.name} with ${attacking.length} creature${attacking.length === 1 ? "" : "s"}.`
      };
    }
    case "declare_blockers": {
      const waiting = options.waitForPlayerIds ?? [];
      const humanDefenderPending = state.combat.attackers.some(
        (declaration) => declaration.defenderPlayerId && waiting.indexOf(declaration.defenderPlayerId) !== -1
      );
      if (humanDefenderPending) return null;
      return advance("Waits for blocks.");
    }
    case "combat_damage":
      return advance("Combat damage.");
    case "end_combat":
      return advance("Combat ends.");
    case "end":
      return advance("End step.");
    case "cleanup":
      return advance("Passes the turn.");
    default:
      return advance("Continues.");
  }
}
function blockMove(state, playerId, options) {
  const at = options.at ?? 0;
  const player = getPlayer(state, playerId);
  if (!player || !isAlive(player)) return null;
  const incoming = state.combat.attackers.filter(
    (declaration) => declaration.defenderPlayerId === playerId && declaration.blockedBy.length === 0
  );
  if (incoming.length === 0) return null;
  const attackers = incoming.map((declaration) => state.cards[declaration.attackerId]).filter(Boolean).sort((a, b) => powerOf(b) - powerOf(a));
  const incomingDamage = attackers.reduce((sum, card) => sum + powerOf(card), 0);
  const facingDeath = incomingDamage >= player.life;
  const alreadyBlocking = /* @__PURE__ */ new Set();
  for (const declaration of state.combat.attackers) {
    for (const id of declaration.blockedBy) alreadyBlocking.add(id);
  }
  const availableBlockers = eligibleBlockers(state, playerId).filter(
    (card) => !alreadyBlocking.has(card.instanceId)
  );
  const used = /* @__PURE__ */ new Set();
  const blocks = [];
  for (const attacker of attackers) {
    const candidates = availableBlockers.filter(
      (blocker) => !used.has(blocker.instanceId) && canBlock(attacker, blocker)
    );
    if (candidates.length === 0) continue;
    const kind = (blocker) => {
      const kills = powerOf(blocker) >= toughnessOf(attacker) || hasKeyword(blocker, "deathtouch");
      const survives = toughnessOf(blocker) > powerOf(attacker);
      if (kills && survives) return 3;
      if (kills) return 2;
      if (survives) return 1;
      return 0;
    };
    const best = candidates.slice().sort((a, b) => {
      const byKind = kind(b) - kind(a);
      if (byKind !== 0) return byKind;
      return (a.cmc ?? 0) - (b.cmc ?? 0);
    })[0];
    const quality = kind(best);
    const attackerValue = attacker.cmc ?? 0;
    const blockerValue = best.cmc ?? 0;
    const worthIt = quality === 3 || quality === 1 || quality === 2 && attackerValue >= blockerValue || quality === 0 && facingDeath;
    if (!worthIt) continue;
    used.add(best.instanceId);
    blocks.push({ blockerId: best.instanceId, attackerId: attacker.instanceId });
  }
  if (blocks.length === 0) return null;
  return {
    actions: [{ type: "BLOCK", blocks, at }],
    note: `Blocks with ${blocks.length} creature${blocks.length === 1 ? "" : "s"}.`
  };
}
function nextBotMove(state, playerId, options = {}) {
  if (state.status !== "playing") return null;
  const player = getPlayer(state, playerId);
  if (!player || !isAlive(player)) return null;
  if (state.activePlayerId === playerId) return activeMove(state, playerId, options);
  if (state.step === "declare_blockers") return blockMove(state, playerId, options);
  return null;
}
function botsAwaitingMove(state, botPlayerIds, options = {}) {
  return botPlayerIds.filter((id) => nextBotMove(state, id, options) !== null);
}
const hubs = /* @__PURE__ */ new Map();
function hubFor(tableId) {
  const existing = hubs.get(tableId);
  if (existing) return existing;
  const created = { tableId, members: [] };
  hubs.set(tableId, created);
  return created;
}
function notifyPresence(hub) {
  const list = hub.members.map((member) => member.presence);
  for (const member of hub.members) {
    member.handlers.onPresence?.(list);
  }
}
class LocalTransport {
  kind = "local";
  tableId;
  participantId;
  options;
  state = "idle";
  seq = 0;
  constructor(options) {
    this.options = options;
    this.tableId = options.tableId;
    this.participantId = options.participantId;
  }
  async join(handlers) {
    if (this.state === "connected") return;
    this.state = "connecting";
    handlers.onStatus?.("connecting");
    const hub = hubFor(this.tableId);
    hub.members = hub.members.filter((m) => m.presence.participantId !== this.participantId);
    hub.members.push({
      transport: this,
      handlers,
      presence: {
        participantId: this.participantId,
        name: this.options.name,
        playerId: this.options.playerId,
        isBot: this.options.isBot
      }
    });
    this.state = "connected";
    handlers.onStatus?.("connected");
    notifyPresence(hub);
  }
  async leave() {
    const hub = hubs.get(this.tableId);
    if (hub) {
      const departing = hub.members.find((m) => m.presence.participantId === this.participantId);
      hub.members = hub.members.filter((m) => m.presence.participantId !== this.participantId);
      departing?.handlers.onStatus?.("closed");
      if (hub.members.length === 0) hubs.delete(this.tableId);
      else notifyPresence(hub);
    }
    this.state = "closed";
  }
  async broadcast(action, baseVersion, at) {
    if (this.state !== "connected") {
      throw new Error("LocalTransport: broadcast before join");
    }
    this.seq += 1;
    const envelope = {
      tableId: this.tableId,
      from: this.participantId,
      seq: this.seq,
      baseVersion,
      at: at ?? Date.now(),
      action
    };
    const hub = hubs.get(this.tableId);
    if (!hub) return;
    const echo = this.options.echoToSender !== false;
    const targets = hub.members.filter(
      (member) => echo || member.presence.participantId !== this.participantId
    );
    const deliver = () => {
      for (const member of targets) member.handlers.onAction(envelope);
    };
    if (this.options.latencyMs && this.options.latencyMs > 0) {
      window.setTimeout(deliver, this.options.latencyMs);
    } else {
      deliver();
    }
  }
  status() {
    return this.state;
  }
  presence() {
    const hub = hubs.get(this.tableId);
    if (!hub) return [];
    return hub.members.map((member) => member.presence);
  }
}
function createLocalTransport(options) {
  return new LocalTransport(options);
}
function resetLocalTransports() {
  hubs.clear();
}
export {
  CLOCKWISE_SIDES,
  COLORS,
  COMMANDER_DAMAGE_LETHAL,
  COMMANDER_STARTING_LIFE,
  COMMANDER_TAX_PER_CAST,
  DEFAULT_STARTING_LIFE,
  HIDDEN_ZONES,
  MAX_SEATS,
  PHASE_OF_STEP,
  POISON_LETHAL,
  ROTATION_SIDE,
  SIDE_LABEL,
  SIDE_ROTATION,
  STEP_LABELS,
  TUNED_SEAT_COUNTS,
  TURN_STEPS,
  ZONES,
  addCard,
  advanceActions,
  allCommanders,
  applyAction,
  applyActions,
  attackableWith,
  attackingPlayerId,
  availableMana,
  botsAwaitingMove,
  buildTable,
  canBlock,
  cardsInZone,
  checkStateBasedActions,
  combatLanes,
  commanderDamageOn,
  commanderDamageRemaining,
  commanderTax,
  createGame,
  createLocalTransport,
  declareAttack,
  defendersUnderAttack,
  eligibleAttackers,
  eligibleBlockers,
  emptyZones,
  findCommander,
  formatRules,
  getCard,
  getPlayer,
  hasKeyword,
  highestCommanderDamageFrom,
  isAlive,
  isCreature,
  isGameOver,
  isLand,
  isPermanent,
  isUnderAttack,
  layoutFromViewpoint,
  livingPlayers,
  lossReasonLabel,
  manaSourcesFor,
  mulliganActions,
  nextBotMove,
  nextLivingPlayer,
  opponentsOf,
  parseCost,
  phaseOf,
  planCast,
  planCastFromHand,
  planLandDrop,
  planPayment,
  powerOf,
  resetGame,
  resetLocalTransports,
  resolveCombat,
  resolveCombatAndAdvance,
  resolveFormatRules,
  resolvesToGraveyard,
  rotationForSeat,
  seatAt,
  seatBoxStyle,
  seatContentStyle,
  seatContentStyleUpright,
  seatRotationTransform,
  seatingFor,
  seatingVariants,
  shuffleWithRng,
  sideForSeat,
  startingLifeFor,
  statLine,
  tapsToAttack,
  toughnessOf,
  turnOrderFrom,
  validateAction,
  winners
};
