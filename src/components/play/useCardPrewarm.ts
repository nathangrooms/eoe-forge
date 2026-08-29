/**
 * Fetch a card's picture BEFORE the game needs to draw it.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS FOR
 * ---------------------------------------------------------------------------
 * Owner, on a screenshot: *"A CARD ON THE STACK RENDERS AS AN EMPTY GREY BOX
 * with its name in small text. A blank rectangle where a card should be is the
 * thing that most makes software look unfinished."*
 *
 * That was answered once by making `StackStrip` draw a real `GameCardView`
 * instead of a text row, and a later pass called what was left "mid-load" and
 * moved on. Measured properly on 29 Aug 2026, driving a real bot game and
 * reading the slot's DOM at the instant the stack opened, four times:
 *
 *   hit 0  img opacity 0     complete false  naturalWidth 488   strip gone by +2.5s
 *   hit 1  img opacity 0     complete false  naturalWidth 0     strip gone by +2.5s
 *   hit 2  img opacity 0.009 complete true   naturalWidth 488   strip gone by +2.5s
 *   hit 3  img opacity 0     complete false  naturalWidth 0     strip gone by +2.5s
 *
 * So it was not a rendering fault and it was not a fair "mid-load" either. A
 * spell's whole life on the stack is under two and a half seconds, and a cold
 * fetch plus `CardImage`'s 300ms fade is longer than that. **The card is never
 * seen.** Four times out of four the player watched a rectangle resolve.
 *
 * ---------------------------------------------------------------------------
 * WHY A PREWARM IS THE FIX AND A BIGGER CARD IS NOT
 * ---------------------------------------------------------------------------
 * Every other answer moves the problem. Dropping the fade makes the card
 * appear at once *when it has arrived*, which for a cold fetch is still after
 * the strip has gone. Drawing a card back under it replaces an empty rectangle
 * with a card back, which is honest but is still not the card. The only thing
 * that puts the actual card on screen for the whole time it is on the stack is
 * having the bytes already.
 *
 * And they are cheap to have. A card in this engine carries ONE `imageUrl`
 * (`getBestCardImage` falls through to `card.image_url` for the shape
 * `GameCardView` passes), so board, stack, preview and travel layer all request
 * the same URL. One warm fetch serves every surface for the rest of the game.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS WARMED, AND WHAT DELIBERATELY IS NOT
 * ---------------------------------------------------------------------------
 * Hands and battlefields, every seat, plus whatever is on the stack right now.
 * That is where a card is when it is about to become visible: a spell on the
 * stack came from a hand a moment earlier, and a permanent being pointed at was
 * already on a battlefield.
 *
 * NOT libraries. A commander game instantiates about a hundred cards a seat and
 * warming all of them is roughly 20 MB of images for a table nobody has played
 * a turn of yet — the sort of thing that took this project's database down
 * twice by being technically correct and operationally reckless. The set warmed
 * here is typically 15 to 40 pictures and grows one at a time as cards are
 * drawn.
 *
 * It is fire and forget by construction: nothing awaits it, nothing renders
 * from it, and a URL that fails is simply never asked for again. The browser
 * cache is the storage; this module only remembers what it has already asked
 * for so a hundred renders do not become a hundred requests.
 */

import { useEffect } from 'react';
import type { GameState } from '@/lib/game';

/**
 * URLs already requested this session.
 *
 * Module scope rather than a ref, because two surfaces can be mounted over one
 * game (the table and the centre preview) and asking twice is the thing being
 * avoided. It is bounded by the number of distinct cards a session touches.
 */
const asked = new Set<string>();

/** How many new pictures may be started per pass. See the note below. */
const PER_PASS = 12;

/**
 * Ask the browser for a picture, without rendering it.
 *
 * `new Image()` is the whole mechanism: it starts a normal image request, the
 * result lands in the HTTP cache, and the element is dropped. When `CardImage`
 * later mounts an `<img>` at the same `src`, the browser serves it from cache
 * and `complete` is already true at mount — which is the case `CardImage`'s own
 * `attachImage` callback exists to catch, so the fade never runs and the card
 * is there on the first frame.
 */
function warm(url: string) {
  if (asked.has(url)) return;
  asked.add(url);
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
}

/**
 * Warm every card that could become visible in the next few seconds.
 *
 * Runs on each new `GameState` — the reducer returns a new object per action,
 * so that is once per action rather than once per frame — and does nothing at
 * all once the set has stopped growing, which is the steady state after the
 * opening hand.
 *
 * The `PER_PASS` cap is not about bandwidth so much as about the first pass: a
 * four-seat table deals four opening hands at once, and firing forty requests
 * into the same connection pool the board is using to draw itself makes the
 * board slower to appear. Twelve a pass, and a pass happens on every action, so
 * a table is fully warm within the first turn.
 */
export function useCardPrewarm(state: GameState | null): void {
  useEffect(() => {
    if (!state) return;

    const urls: string[] = [];
    const take = (instanceId: string) => {
      const card = state.cards[instanceId];
      const url = card?.imageUrl;
      if (url && !asked.has(url)) urls.push(url);
    };

    /* On the stack first: that is the card with the shortest time on screen and
       therefore the least tolerance for a cold fetch. */
    for (const object of state.stack) {
      if (object.cardInstanceId) take(object.cardInstanceId);
      if (object.sourceInstanceId) take(object.sourceInstanceId);
    }
    for (const player of state.players) {
      for (const instanceId of player.zones.hand) take(instanceId);
      for (const instanceId of player.zones.battlefield) take(instanceId);
      for (const instanceId of player.zones.command) take(instanceId);
    }

    for (const url of urls.slice(0, PER_PASS)) warm(url);
  }, [state]);
}

/** Test seam: forget what has been asked for. Not used by the game. */
export function resetCardPrewarm(): void {
  asked.clear();
}
