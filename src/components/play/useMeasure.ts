/**
 * Measure a DOM box, and keep the measurement current.
 *
 * Every "shrink to fit" rule on the play board needs one number that CSS cannot
 * give it: how many pixels this container actually has right now. The owner hit
 * the failure directly — *"I loaded in smaller screen and cards went off page"* —
 * because a card width chosen against the design viewport is a card width that
 * overflows a laptop.
 *
 * A `ResizeObserver` rather than a window listener: a seat's box changes when
 * the inspector rail opens, when the hand grows, and when a quadrant is given
 * the whole viewport, none of which are window resizes.
 */

import { useLayoutEffect, useRef, useState } from 'react';

export interface MeasuredSize {
  width: number;
  height: number;
}

/** Sub-pixel churn re-renders forever otherwise. */
const EPSILON = 1;

export function useMeasuredSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<MeasuredSize>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const read = (width: number, height: number) =>
      setSize(previous =>
        Math.abs(previous.width - width) > EPSILON || Math.abs(previous.height - height) > EPSILON
          ? { width, height }
          : previous
      );

    read(element.clientWidth, element.clientHeight);

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) read(rect.width, rect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

/** Width alone, for the cases that only fan things horizontally. */
export function useMeasuredWidth<T extends HTMLElement>() {
  const [ref, size] = useMeasuredSize<T>();
  return [ref, size.width] as const;
}
