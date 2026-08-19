import { useEffect, useLayoutEffect, useReducer, useRef, type RefObject } from 'react';
import { MOTION_DURATION, motionTiming } from './tokens';
import { usePrefersReducedMotion } from './useReducedMotion';

/**
 * Lists that change.
 *
 * Two separate problems, and doing only the first is worse than doing neither:
 *
 * 1. **Something leaving should leave.** A row that vanishes between two frames
 *    leaves the player unsure whether their click registered.
 * 2. **Its neighbours must not jump.** Fading a row out and then deleting it
 *    makes everything after it snap into the gap, which is the layout shift the
 *    owner reported. So the survivors are moved with a transform from where
 *    they were to where they now are — the shift becomes a movement.
 *
 * Both are `transform` and `opacity` only. Neither is framer-motion: this is
 * roughly seventy lines against a 37 kB gzip shared chunk that the collection
 * and shopping pages do not currently load.
 */

/**
 * How many rows may leave at once.
 *
 * Emptying a whole list is not forty simultaneous departures, it is the list
 * being emptied — so past this it simply empties. Same reasoning as
 * `ZoneTravelLayer`'s `MAX_TRAVELS`.
 */
const MAX_LEAVING = 12;

/**
 * How many survivors may be slid into their new places at once.
 *
 * The count that matters is what is *on screen*, not what is in the list. The
 * shopping list this was built against holds 247 cards; taking one off moves
 * 246 of them and roughly a dozen of those are visible. An element nobody can
 * see does not need to be seen moving, so off-screen rows are skipped and the
 * work is bounded by the size of the screen rather than the size of the list.
 *
 * Within the visible set it is all or none: half a grid gliding while the other
 * half snaps looks more broken than the whole grid snapping.
 */
const MAX_FLIP = 60;

/** How far outside the viewport still counts as on screen, in px. */
const VIEWPORT_MARGIN_PX = 120;

/**
 * The furthest a row will be slid, in px.
 *
 * Taking one card off a grid moves its neighbours by about one cell. A figure
 * on the scale of the whole document means the two measurements being compared
 * were taken under different layouts, not that a row travelled — see the width
 * check in `useFlipOnChange`. This is the second net under that one, because a
 * row flying in from four thousand pixels away is far worse than a row that
 * simply snaps.
 */
const MAX_TRAVEL_PX = 2000;

/** A departed row is dropped this long after its animation, so it never clips. */
const LINGER_MS = 30;

/**
 * Joins the keys into one comparable string. A NUL rather than a space because
 * no key can contain one, so no pair of keys can spell another pair. Written as
 * an escape and never as a literal: a raw NUL in a source file makes git store
 * the whole file as a binary blob with no reviewable diff.
 */
const SEPARATOR = '\u0000';

export interface ListEntry<T> {
  key: string;
  item: T;
  /** True while this row is on its way out. Render it inert. */
  leaving: boolean;
}

/**
 * Keep a removed row on screen long enough to be seen leaving.
 *
 * ```tsx
 * const rows = useLeavingList(items, item => item.id);
 * rows.map(({ key, item, leaving }) => (
 *   <Row key={key} data-flip-key={key} className={leaving ? 'motion-leaving' : undefined} … />
 * ))
 * ```
 *
 * A row that is leaving still holds its place in the flow, so nothing moves
 * until it is gone — at which point `useFlipOnChange` moves the survivors.
 * Under reduced motion nothing is held back at all and the list is exactly the
 * array it was handed.
 *
 * ## Why the departure is worked out during render and not in an effect
 *
 * It was an effect first, and measuring it showed the effect doing the exact
 * opposite of what this hook is for. An effect runs after the browser has
 * painted, so one removal on the shopping list produced three layouts: the row
 * vanished and the grid closed over it, a frame later the row was put back and
 * the grid opened again, and 170ms after that it left for good and the grid
 * closed a second time. The same visible tiles were animated forward, back,
 * then forward again.
 *
 * Deriving it during render — the pattern React documents for state that
 * follows from props — means the row is never missing from a committed tree at
 * all, so there is one layout change instead of three: the one at the end.
 */
export function useLeavingList<T>(items: T[], keyOf: (item: T) => string): ListEntry<T>[] {
  const reduced = usePrefersReducedMotion();
  const [, rerender] = useReducer((tick: number) => tick + 1, 0);
  const previous = useRef<Array<{ key: string; item: T }> | null>(null);
  const departed = useRef<Array<{ key: string; item: T; index: number }>>([]);
  const lastSignature = useRef<string | null>(null);
  const pending = useRef<Set<string> | null>(null);
  const timers = useRef<Set<number>>(new Set());

  const signature = items.map(keyOf).join(SEPARATOR);

  /* Guarded on the signature, so rendering twice with the same list is a no-op
     and this stays safe to run in the render body. */
  if (lastSignature.current !== signature) {
    const before = previous.current;
    lastSignature.current = signature;
    previous.current = items.map(item => ({ key: keyOf(item), item }));

    if (reduced || !before) {
      // First render has no history, so nothing has left yet.
      departed.current = [];
    } else {
      const live = new Set(items.map(keyOf));
      const gone = before
        .map((entry, index) => ({ ...entry, index }))
        .filter(entry => !live.has(entry.key));

      if (gone.length > 0 && gone.length <= MAX_LEAVING) {
        /* A key already on its way out is not held a second time. Removing a
           row, putting it back and removing it again inside 170ms would
           otherwise put two nodes with the same React key in one list. */
        const held = new Set(departed.current.map(entry => entry.key));
        const fresh = gone.filter(entry => !held.has(entry.key));
        if (fresh.length > 0) {
          departed.current = [...departed.current, ...fresh];
          const keys = pending.current ?? new Set<string>();
          for (const entry of fresh) keys.add(entry.key);
          pending.current = keys;
        }
      }
    }
  }

  /* No dependency list: this runs after every render and does nothing unless
     the render above left something to schedule. The timer is dropped from the
     set as it fires, so a list edited a hundred times does not accumulate a
     hundred dead ids. */
  useEffect(() => {
    const keys = pending.current;
    if (!keys) return;
    pending.current = null;

    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      departed.current = departed.current.filter(entry => !keys.has(entry.key));
      rerender();
    }, MOTION_DURATION.exit + LINGER_MS);
    timers.current.add(timer);
  });

  useEffect(() => {
    const running = timers.current;
    return () => {
      for (const timer of running) window.clearTimeout(timer);
      running.clear();
    };
  }, []);

  const entries: ListEntry<T>[] = items.map(item => ({ key: keyOf(item), item, leaving: false }));
  if (departed.current.length === 0) return entries;

  const live = new Set(entries.map(entry => entry.key));
  for (const entry of [...departed.current].sort((a, b) => a.index - b.index)) {
    // It came back before its exit finished. The live copy is the real one.
    if (live.has(entry.key)) continue;
    live.add(entry.key);
    entries.splice(Math.min(entry.index, entries.length), 0, {
      key: entry.key,
      item: entry.item,
      leaving: true,
    });
  }
  return entries;
}

interface Place {
  x: number;
  y: number;
  height: number;
}

interface Measurement {
  /** The container's own width when this was taken. See below. */
  width: number;
  places: Map<string, Place>;
}

/**
 * Slide everything that moved from where it was to where it is.
 *
 * Keyed off the DOM rather than a parallel registry of refs, the way
 * `ZoneTravelLayer` reads `[data-instance]`: mark each row `data-flip-key`, hand
 * this the container and a signature that changes when the list does, and it
 * measures once per committed change — not per frame and not per render.
 *
 * `signature` should be the same string you would key the list on. Passing
 * something that changes every render would measure every render.
 *
 * ## Why the container's width is kept with the positions
 *
 * Measuring only when the list changes means the stored positions go stale the
 * moment anything else re-lays the grid out: the window resized, the card-size
 * slider moved, the nav rail collapsed. The next removal then compares this
 * layout against that one and calls the difference a movement. Measured on the
 * shopping list, with the window narrowed and widened again between two edits:
 * every visible tile was handed `translate3d(-1003px, 4910px, 0)` and flew in
 * across the whole page.
 *
 * A grid that changed width did not move its rows, it re-laid them out, so the
 * honest thing to do is take a fresh baseline and animate nothing.
 */
export function useFlipOnChange(ref: RefObject<HTMLElement | null>, signature: string): void {
  const reduced = usePrefersReducedMotion();
  const previous = useRef<Measurement | null>(null);
  const running = useRef<Animation[]>([]);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (reduced) {
      previous.current = null;
      return;
    }

    /* Cancel first, then measure. A rect read mid-flight is the animated
       position, not the resting one, and a second change arriving during the
       first would compound the error into a visible drift. */
    for (const animation of running.current) animation.cancel();
    running.current = [];

    const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-flip-key]'));

    /* Document coordinates, not viewport: `getBoundingClientRect` moves when
       the page scrolls, and a scroll between two commits is not a row moving. */
    const offsetX = window.scrollX;
    const offsetY = window.scrollY;

    const next = new Map<string, Place>();
    for (const node of nodes) {
      const key = node.dataset.flipKey;
      if (!key || next.has(key)) continue;
      const box = node.getBoundingClientRect();
      next.set(key, { x: box.left + offsetX, y: box.top + offsetY, height: box.height });
    }

    const width = root.getBoundingClientRect().width;
    const before = previous.current;
    previous.current = { width, places: next };
    if (!before) return;
    if (Math.abs(before.width - width) > 0.5) return;

    const viewTop = offsetY - VIEWPORT_MARGIN_PX;
    const viewBottom = offsetY + window.innerHeight + VIEWPORT_MARGIN_PX;
    const onScreen = (place: Place) => place.y + place.height > viewTop && place.y < viewBottom;

    const moves: Array<{ node: HTMLElement; dx: number; dy: number }> = [];
    for (const node of nodes) {
      const key = node.dataset.flipKey;
      if (!key) continue;
      const from = before.places.get(key);
      const to = next.get(key);
      if (!from || !to) continue;
      const dx = from.x - to.x;
      const dy = from.y - to.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      if (Math.abs(dx) > MAX_TRAVEL_PX || Math.abs(dy) > MAX_TRAVEL_PX) continue;
      // Either end on screen: a row that arrived into view is worth showing
      // arriving, and a row that left it is worth showing leaving.
      if (!onScreen(to) && !onScreen(from)) continue;
      moves.push({ node, dx, dy });
    }

    if (moves.length === 0 || moves.length > MAX_FLIP) return;

    for (const move of moves) {
      running.current.push(
        move.node.animate(
          [
            { transform: `translate3d(${move.dx}px, ${move.dy}px, 0)` },
            { transform: 'translate3d(0, 0, 0)' },
          ],
          // No fill: the transform is gone the instant it lands, so the row
          // never leaves a containing block behind for anything positioned
          // inside it.
          motionTiming('enter', 'standard')
        )
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, reduced]);

  useEffect(
    () => () => {
      for (const animation of running.current) animation.cancel();
      running.current = [];
    },
    []
  );
}
