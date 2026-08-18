/**
 * Clause-level rules: the shapes an ability comes in.
 *
 * `effect-rules.ts` reads what an ability DOES. This file reads what KIND of
 * ability it is — the trigger condition, the activation cost, the continuous
 * modification, the replacement — and hands the remainder to the effect table.
 *
 * The same refusal discipline applies at every level. A trigger condition that
 * does not parse means the whole triggered ability is refused, not that it
 * becomes an ability that fires on nothing. An activation cost with one
 * unreadable atom refuses the whole activated ability, not just that atom: a
 * cost you can pay too cheaply is worse than a cost you cannot pay at all.
 */

import type {
  Cost,
  Modification,
  PlayerSelector,
  ReplaceableEvent,
  ReplacementResult,
  Selector,
  Step,
  TriggerEvent,
  ValueExpr,
} from './dsl.ts';
import { notF } from './dsl.ts';
import type { BuildCtx } from './effect-rules.ts';
import { phraseSelector } from './effect-rules.ts';
import {
  NUM,
  objectSelector,
  parseCount,
  parseKeywordList,
  parseKeywordWithParameter,
  parseObject,
  parsePlayer,
} from './grammar.ts';

const N = NUM;

/* ------------------------------------------------------------------ *
 * Trigger events
 * ------------------------------------------------------------------ */

/** Step phrases, longest first. `whose` is who the step belongs to. */
const STEP_TRIGGERS: Array<[RegExp, Step, PlayerSelector]> = [
  [/^your upkeep$/, 'upkeep', { who: 'you' }],
  [/^your end step$/, 'end', { who: 'you' }],
  [/^your draw step$/, 'draw', { who: 'you' }],
  [/^your untap step$/, 'untap', { who: 'you' }],
  [/^your (?:first |precombat )?main phase$/, 'precombat_main', { who: 'you' }],
  [/^your (?:second |postcombat )main phase$/, 'postcombat_main', { who: 'you' }],
  [/^combat on your turn$/, 'begin_combat', { who: 'you' }],
  [/^each upkeep$/, 'upkeep', { who: 'each-player' }],
  [/^each players upkeep$/, 'upkeep', { who: 'each-player' }],
  [/^each end step$/, 'end', { who: 'each-player' }],
  [/^each players end step$/, 'end', { who: 'each-player' }],
  [/^each players draw step$/, 'draw', { who: 'each-player' }],
  [/^each opponents upkeep$/, 'upkeep', { who: 'each-opponent' }],
  [/^each opponents end step$/, 'end', { who: 'each-opponent' }],
  [/^each opponents draw step$/, 'draw', { who: 'each-opponent' }],
  [/^each combat$/, 'begin_combat', { who: 'each-player' }],
  // "the end step" / "the upkeep" with no owner is the current turn's.
  [/^the end step$/, 'end', { who: 'active' }],
  [/^the upkeep$/, 'upkeep', { who: 'active' }],
];

/**
 * The thing a trigger is about: the source, an Aura's or Equipment's host, or a
 * group of permanents. Anything else — a player, a spell, a phrase we cannot
 * read — comes back `null` and the whole triggered ability is refused.
 */
function triggerSubject(phrase: string): Selector | null {
  const s = phrase.trim();
  if (s === '~') return { sel: 'self' };
  if (/^(equipped|enchanted) /.test(s)) return { sel: 'attached' };
  const ref = parseObject(s);
  if (!ref || ref.targeted) return null;
  return objectSelector(ref);
}

/**
 * A trigger condition -> one or more `TriggerEvent`s.
 *
 * More than one is returned for "enters or attacks" and "attacks or blocks".
 * Two abilities that each fire on their own event are behaviourally identical
 * to one ability firing on either, because the two events never occur
 * simultaneously — so the split is exact, not an approximation.
 */
export function parseTriggerEvent(phrase: string, ctx: BuildCtx): TriggerEvent[] | null {
  const p = phrase.trim().replace(/[.,]+$/, '');

  /* --- the source itself --- */
  if (/^~ enters(?: the battlefield)?$/.test(p)) return [{ on: 'enters', who: { sel: 'self' } }];
  if (/^~ enters or attacks$/.test(p)) return [{ on: 'enters', who: { sel: 'self' } }, { on: 'attacks', who: { sel: 'self' } }];
  if (/^~ dies$/.test(p)) return [{ on: 'dies', who: { sel: 'self' } }];
  if (/^~ attacks$/.test(p)) return [{ on: 'attacks', who: { sel: 'self' } }];
  if (/^~ attacks or blocks$/.test(p)) return [{ on: 'attacks', who: { sel: 'self' } }, { on: 'blocks', who: { sel: 'self' } }];
  if (/^~ blocks$/.test(p)) return [{ on: 'blocks', who: { sel: 'self' } }];
  if (/^~ becomes blocked$/.test(p)) return [{ on: 'becomes-blocked', who: { sel: 'self' } }];
  if (/^~ becomes tapped$/.test(p)) return [{ on: 'tapped', who: { sel: 'self' } }];
  if (/^~ becomes untapped$/.test(p)) return [{ on: 'untapped', who: { sel: 'self' } }];
  if (/^~ is dealt damage$/.test(p)) return [{ on: 'dealt-damage', who: { sel: 'self' } }];
  if (/^~ leaves the battlefield$/.test(p)) return [{ on: 'leaves', who: { sel: 'self' }, from: 'battlefield' }];
  if (/^~ is put into a graveyard from anywhere$/.test(p)) {
    return [{ on: 'zone-change', who: { sel: 'self' }, from: 'any', to: 'graveyard' }];
  }

  /* --- damage a subject deals. The subject may be the source, an Aura's or
         Equipment's host, or a whole group ("a creature you control"). --- */
  const dealt = p.match(/^(.+?) deals (combat )?damage(?: to (a player|an opponent|a creature|a planeswalker|any target))?$/);
  if (dealt) {
    const source = triggerSubject(dealt[1]);
    if (!source) return null;
    const e: TriggerEvent = { on: 'deals-damage', source };
    if (dealt[2]) (e as { combatOnly?: boolean }).combatOnly = true;
    const to = dealt[3];
    if (to === 'a player' || to === 'an opponent') (e as { to?: string }).to = 'player';
    else if (to === 'a creature') (e as { to?: string }).to = 'creature';
    else if (to === 'a planeswalker') (e as { to?: string }).to = 'planeswalker';
    else if (to === 'any target') (e as { to?: string }).to = 'any';
    return [e];
  }

  /* --- steps --- */
  const step = p.match(/^at the beginning of (.+)$/);
  if (step) {
    for (const [re, s, whose] of STEP_TRIGGERS) {
      if (re.test(step[1])) return [{ on: 'step', step: s, whose }];
    }
    return null; // an owner phrase we cannot name — "enchanted player's upkeep"
  }

  /* --- casting --- */
  const cast = p.match(/^(you|an opponent|a player|each opponent) cast(?:s)? (?:a|an|your) (.+) spell$/);
  if (cast) {
    const by =
      cast[1] === 'you' ? { who: 'you' } as PlayerSelector
      : cast[1] === 'a player' ? { who: 'each-player' } as PlayerSelector
      : { who: 'each-opponent' } as PlayerSelector;
    const ref = parseObject(cast[2]);
    if (!ref || ref.targeted) return null;
    return [{ on: 'cast', what: { sel: 'all', where: ref.filter, zone: 'stack' }, by }];
  }
  const castAny = p.match(/^(you|an opponent|a player) cast(?:s)? (?:a|an) spell$/);
  if (castAny) {
    const by =
      castAny[1] === 'you' ? { who: 'you' } as PlayerSelector
      : castAny[1] === 'a player' ? { who: 'each-player' } as PlayerSelector
      : { who: 'each-opponent' } as PlayerSelector;
    return [{ on: 'cast', what: { sel: 'all', where: { is: 'any' }, zone: 'stack' }, by }];
  }

  /* --- players --- */
  if (/^you gain life$/.test(p)) return [{ on: 'gains-life', whose: { who: 'you' } }];
  if (/^you lose life$/.test(p)) return [{ on: 'loses-life', whose: { who: 'you' } }];
  const draws = p.match(/^(you|an opponent|each opponent|a player) draws? a card$/);
  if (draws) {
    const whose = parsePlayer(draws[1] === 'an opponent' ? 'each opponent' : draws[1] === 'a player' ? 'each player' : draws[1], null);
    return whose ? [{ on: 'draws-card', whose }] : null;
  }

  /* --- "~ or another creature you control ..." ---
     The source is itself a member of the group it names, so "~ or another
     creature you control enters" is exactly "a creature you control enters".
     Rewriting it that way is a rules identity, not an approximation. */
  const orAnother = p.match(/^~ or another (.+?) (enters|dies|attacks|enters or attacks)$/);
  if (orAnother) {
    const ref = parseObject(orAnother[1]);
    if (!ref || ref.targeted) return null;
    const who = objectSelector(ref);
    switch (orAnother[2]) {
      case 'enters': return [{ on: 'enters', who }];
      case 'attacks': return [{ on: 'attacks', who }];
      case 'enters or attacks': return [{ on: 'enters', who }, { on: 'attacks', who }];
      default: return [{ on: 'dies', who }];
    }
  }

  /* --- any other subject: another permanent, a group, an Aura's host ---
         `triggerSubject` owns the vocabulary, so "another creature you control
         dies", "a creature you control attacks" and "equipped creature attacks"
         all take the same path and none of them needs its own rule. */
  const subjectEvent = p.match(
    /^(?:(?:a|an|another|one or more) )?(.+?) (enters|dies|attacks|blocks|becomes tapped|becomes untapped|is put into a graveyard from the battlefield)(?: under your control)?$/,
  );
  if (subjectEvent) {
    const who = triggerSubject(
      /^(?:a|an|another|one or more) /.test(p) && /^another /.test(p)
        ? 'another ' + subjectEvent[1]
        : subjectEvent[1],
    );
    if (!who) return null;
    switch (subjectEvent[2]) {
      case 'enters': return [{ on: 'enters', who }];
      case 'attacks': return [{ on: 'attacks', who }];
      case 'blocks': return [{ on: 'blocks', who }];
      case 'becomes tapped': return [{ on: 'tapped', who }];
      case 'becomes untapped': return [{ on: 'untapped', who }];
      default: return [{ on: 'dies', who }];
    }
  }

  const sacrificed = p.match(/^you sacrifice (?:a|an) (.+)$/);
  if (sacrificed) {
    const ref = parseObject(sacrificed[1] + ' you control');
    if (!ref) return null;
    return [{ on: 'sacrificed', who: objectSelector(ref) }];
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * Activation costs
 * ------------------------------------------------------------------ */

const MANA_ATOM = /^(?:\{[^}]+\})+$/;

/**
 * A cost string -> `Cost[]`, or `null` to refuse the whole ability.
 *
 * Refusing the whole ability on one unreadable atom is deliberate. An activated
 * ability whose cost is partly read is an ability a player can activate too
 * cheaply, and there is no marker that makes that safe — unlike a partly-read
 * EFFECT, which the `{do:'manual'}` marker does make safe.
 */
export function parseCosts(costText: string): Cost[] | null {
  const atoms = costText.split(',').map((a) => a.trim()).filter(Boolean);
  if (!atoms.length) return null;

  const out: Cost[] = [];
  for (const atom of atoms) {
    if (atom === '{t}') { out.push({ pay: 'tap' }); continue; }
    if (atom === '{q}') { out.push({ pay: 'untap' }); continue; }
    if (MANA_ATOM.test(atom)) { out.push({ pay: 'mana', cost: atom.toUpperCase() }); continue; }

    if (atom === 'sacrifice ~') { out.push({ pay: 'sacrifice', what: { sel: 'self' }, count: 1 }); continue; }

    const sac = atom.match(new RegExp(`^sacrifice (?:(${N}) )?(.+)$`));
    if (sac) {
      const ref = parseObject(sac[2]);
      if (!ref || ref.targeted) return null;
      const count = sac[1] ? parseCount(sac[1]) : ref.count;
      if (count === null) return null;
      out.push({ pay: 'sacrifice', what: objectSelector(ref), count });
      continue;
    }

    const discard = atom.match(new RegExp(`^discard (${N}) cards?( at random)?$`));
    if (discard) {
      const count = parseCount(discard[1]);
      if (count === null) return null;
      const c: Cost = { pay: 'discard', count };
      if (discard[2]) (c as { random?: boolean }).random = true;
      out.push(c);
      continue;
    }

    const life = atom.match(new RegExp(`^pay (${N}) life$`));
    if (life) {
      const amount = parseCount(life[1]);
      if (amount === null) return null;
      out.push({ pay: 'life', amount });
      continue;
    }

    const removeCounters = atom.match(new RegExp(`^remove (${N}) ([a-z+/-]+) counters? from ~$`));
    if (removeCounters) {
      const count = parseCount(removeCounters[1]);
      if (count === null) return null;
      out.push({ pay: 'remove-counters', counter: removeCounters[2], count, from: { sel: 'self' } });
      continue;
    }

    const exile = atom.match(new RegExp(`^exile (?:(${N}) )?(.+?) from your graveyard$`));
    if (exile) {
      const ref = parseObject(exile[2]);
      if (!ref || ref.targeted) return null;
      const count = exile[1] ? parseCount(exile[1]) : ref.count;
      if (count === null) return null;
      out.push({ pay: 'exile', from: 'graveyard', what: objectSelector({ ...ref, zone: 'graveyard' }), count });
      continue;
    }

    if (/^return ~ to (?:its|your) owners hand$/.test(atom)) {
      out.push({ pay: 'return-to-hand', what: { sel: 'self' }, count: 1 });
      continue;
    }

    const tapOthers = atom.match(new RegExp(`^tap (?:(${N}) )?untapped (.+?) you control$`));
    if (tapOthers) {
      const ref = parseObject(tapOthers[2] + ' you control');
      if (!ref) return null;
      const count = tapOthers[1] ? parseCount(tapOthers[1]) : 1;
      if (count === null) return null;
      out.push({ pay: 'tap-others', what: objectSelector(ref), count });
      continue;
    }

    return null; // an unread cost atom refuses the ability
  }
  return out;
}

/** Loyalty costs: `+1`, `0`, `-7` (the U+2212 minus is flattened upstream). */
export function parseLoyaltyCost(symbol: string): Cost[] | null {
  const m = symbol.trim().match(/^([+-]?)(\d+)$/);
  if (!m) return null;
  const n = Number(m[2]);
  if (m[1] === '-') return [{ pay: 'remove-counters', counter: 'loyalty', count: n, from: { sel: 'self' } }];
  return [{ pay: 'add-counters', counter: 'loyalty', count: n, to: { sel: 'self' } }];
}

/* ------------------------------------------------------------------ *
 * Static (continuous) abilities
 * ------------------------------------------------------------------ */

export interface StaticShape {
  affects: Selector;
  modifications: Modification[];
}

/** The subject of a continuous effect: a group, or an Aura/Equipment's host. */
function staticSubject(phrase: string, ctx: BuildCtx): Selector | null {
  const p = phrase.trim();
  if (p === '~') return { sel: 'self' };
  if (/^(enchanted|equipped) /.test(p)) return { sel: 'attached' };
  const ref = parseObject(p);
  if (!ref) return null;
  if (ref.targeted) return null; // a target is not a continuous effect's subject
  return objectSelector(ref);
}

/**
 * A whole paragraph -> a continuous effect, or `null`.
 *
 * Every rule here writes an EXPLICIT layer, following XMage's model, where a
 * continuous effect declares the CR 613 layers it acts in rather than having
 * them deduced from whichever fields it happens to set. Deduction reads tidier
 * and is wrong exactly where it matters: an effect that both changes a type and
 * modifies power belongs in two layers, and a scheme that infers one layer per
 * effect silently picks one of them. CR 613 is an ordering rule, so the
 * ordering has to be stated rather than guessed.
 */
export function parseStatic(paragraph: string, ctx: BuildCtx): StaticShape | null {
  const p = paragraph.trim().replace(/[.]+$/, '');

  /* Layer 7c — anthems. "Creatures you control get +1/+1". */
  const anthem = p.match(/^(.+?) gets? ([+-]\d+)\/([+-]\d+)$/);
  if (anthem) {
    const affects = staticSubject(anthem[1], ctx);
    if (affects) {
      return { affects, modifications: [{ layer: 'pt-modify', power: Number(anthem[2]), toughness: Number(anthem[3]) }] };
    }
  }

  /* Layer 7c plus layer 6 — "Creatures you control get +1/+1 and have vigilance". */
  const anthemPlus = p.match(/^(.+?) gets? ([+-]\d+)\/([+-]\d+) and (?:have|has|gains?) ([a-z, ]+)$/);
  if (anthemPlus) {
    const affects = staticSubject(anthemPlus[1], ctx);
    const grant = parseKeywordList(anthemPlus[4]);
    if (affects && grant) {
      return {
        affects,
        modifications: [
          { layer: 'pt-modify', power: Number(anthemPlus[2]), toughness: Number(anthemPlus[3]) },
          { layer: 'ability', grant },
        ],
      };
    }
  }

  /* Layer 6 — keyword granting. KEYWORDS ONLY: granting a whole nested ability
     is the declared `granted-ability` gap, and `parseKeywordList` refusing a
     non-keyword list is what keeps us on the right side of it. */
  const grantKw = p.match(/^(.+?) (?:have|has|gains?) ([a-z, ]+)$/);
  if (grantKw) {
    const affects = staticSubject(grantKw[1], ctx);
    const grant = parseKeywordList(grantKw[2]);
    if (affects && grant) return { affects, modifications: [{ layer: 'ability', grant }] };
  }

  /* Layer 6 — keyword removal. */
  const loseKw = p.match(/^(.+?) loses? ([a-z, ]+)$/);
  if (loseKw) {
    const affects = staticSubject(loseKw[1], ctx);
    const remove = parseKeywordList(loseKw[2]);
    if (affects && remove) return { affects, modifications: [{ layer: 'ability', remove }] };
  }

  /* Restrictions. */
  const cantBlock = p.match(/^(.+?) cant block$/);
  if (cantBlock) {
    const who = staticSubject(cantBlock[1], ctx);
    if (who) return { affects: who, modifications: [{ layer: 'restriction', rule: { rule: 'cant-block', who } }] };
  }
  const cantAttack = p.match(/^(.+?) cant attack$/);
  if (cantAttack) {
    const who = staticSubject(cantAttack[1], ctx);
    if (who) return { affects: who, modifications: [{ layer: 'restriction', rule: { rule: 'cant-attack', who } }] };
  }
  const mustAttack = p.match(/^(.+?) attacks? each combat if able$/);
  if (mustAttack) {
    const who = staticSubject(mustAttack[1], ctx);
    if (who) return { affects: who, modifications: [{ layer: 'restriction', rule: { rule: 'must-attack', who } }] };
  }
  const cantBlocked = p.match(/^(.+?) cant be blocked$/);
  if (cantBlocked) {
    const who = staticSubject(cantBlocked[1], ctx);
    if (who) {
      return { affects: who, modifications: [{ layer: 'restriction', rule: { rule: 'cant-be-blocked-except-by', who, by: { sel: 'none' } } }] };
    }
  }
  const cantBlockedExcept = p.match(/^(.+?) cant be blocked except by (.+)$/);
  if (cantBlockedExcept) {
    const who = staticSubject(cantBlockedExcept[1], ctx);
    const by = staticSubject(cantBlockedExcept[2], ctx);
    if (who && by) {
      return { affects: who, modifications: [{ layer: 'restriction', rule: { rule: 'cant-be-blocked-except-by', who, by } }] };
    }
  }
  const cantUntap = p.match(/^(.+?) doesnt untap during (?:your|its controllers) untap step$/);
  if (cantUntap) {
    const who = staticSubject(cantUntap[1], ctx);
    if (who) return { affects: who, modifications: [{ layer: 'restriction', rule: { rule: 'cant-untap', who } }] };
  }

  /* Cost modification. "Artifact spells you cast cost {1} less to cast." */
  const cheaper = p.match(/^(.+?) spells you cast cost \{(\d+)\} (less|more) to cast$/);
  if (cheaper) {
    const ref = parseObject(cheaper[1]);
    if (ref && !ref.targeted) {
      const delta = Number(cheaper[2]) * (cheaper[3] === 'less' ? -1 : 1);
      return {
        affects: { sel: 'self' },
        modifications: [{
          layer: 'cost-modify',
          applies: { sel: 'all', where: ref.filter, zone: 'stack' },
          delta, genericOnly: true, forWhom: { who: 'you' },
        }],
      };
    }
  }
  const selfCheaper = p.match(/^~ costs \{(\d+)\} (less|more) to cast$/);
  if (selfCheaper) {
    const delta = Number(selfCheaper[1]) * (selfCheaper[2] === 'less' ? -1 : 1);
    return {
      affects: { sel: 'self' },
      modifications: [{ layer: 'cost-modify', applies: { sel: 'self' }, delta, genericOnly: true, forWhom: { who: 'you' } }],
    };
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * Replacement effects
 * ------------------------------------------------------------------ */

export interface ReplacementShape {
  event: ReplaceableEvent;
  result: ReplacementResult;
  selfReplacement: boolean;
}

export function parseReplacement(paragraph: string): ReplacementShape | null {
  const p = paragraph.trim().replace(/[.]+$/, '');

  if (/^~ enters tapped$/.test(p)) {
    return { event: { on: 'enters', who: { sel: 'self' } }, result: { do: 'enters-tapped' }, selfReplacement: true };
  }

  const counters = p.match(new RegExp(`^~ enters with (${N}) (\\+\\d+/\\+\\d+|-\\d+/-\\d+|[a-z]+) counters? on it$`));
  if (counters) {
    const count = parseCount(counters[1]);
    if (count === null) return null;
    return {
      event: { on: 'enters', who: { sel: 'self' } },
      result: { do: 'enters-with-counters', counter: counters[2], count },
      selfReplacement: true,
    };
  }

  const tappedAnd = p.match(new RegExp('^~ enters tapped and (?:you )?gains? (\\d+) life$'));
  if (tappedAnd) {
    return {
      event: { on: 'enters', who: { sel: 'self' } },
      result: { do: 'enters-tapped' },
      selfReplacement: true,
    };
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * Keyword lines
 * ------------------------------------------------------------------ */

export interface KeywordHit { keyword: string; parameter?: string; }

/**
 * A paragraph that is nothing but keywords. Refuses the whole line if any
 * comma-separated element is not a keyword, because "flying, then draw a card"
 * is a sentence, not a keyword list.
 */
export function parseKeywordLine(paragraph: string): KeywordHit[] | null {
  const p = paragraph.trim().replace(/[.]+$/, '');
  if (!p) return null;

  // "Enchant creature" defines what an Aura may attach to; it is a keyword
  // ability with a filter as its parameter, and 936 rows carry it.
  const enchant = p.match(/^enchant (.+)$/);
  if (enchant) {
    const what = enchant[1];
    // Auras enchant objects ("creature you control") or players ("player",
    // "opponent"). Both are legal parameters; anything else we cannot read is
    // refused so the runtime never attaches an Aura to the wrong thing.
    const isPlayer = /^(player|opponent|player or planeswalker)$/.test(what);
    if (!isPlayer && !parseObject(what)) return null;
    return [{ keyword: 'enchant', parameter: what }];
  }

  const parts = p.split(',').map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return null;
  const out: KeywordHit[] = [];
  for (const part of parts) {
    const hit = parseKeywordWithParameter(part);
    if (!hit) return null;
    out.push(hit);
  }
  return out;
}
