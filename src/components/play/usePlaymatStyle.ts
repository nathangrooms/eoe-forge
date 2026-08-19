/**
 * The playmat the reader chose: its surface and its colour, remembered.
 *
 * Local rather than on the account, for now. It is a look, not data: it should
 * apply the moment it is picked with no round trip, it should not be a database
 * write every time somebody tries the six surfaces, and a reader who is not
 * signed in still gets to choose. When uploaded mats arrive this is the one
 * place that changes.
 *
 * Every mat on the board reads this, so a change has to reach all of them at
 * once. `storage` only fires in OTHER tabs, so a module-level subscriber list
 * carries the change within this one; without it, picking would repaint the
 * preview and leave the four seats behind it alone.
 */

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_MAT_STYLE, matStyleOf, type MatStyleId } from './matStyles';

const STYLE_KEY = 'deckmatrix.playmat.style';
const TINT_KEY = 'deckmatrix.playmat.tint';

/**
 * The mat's colour.
 *
 * `deck` follows whoever sits there, which is what tells four seats apart at a
 * glance and is the right default. The rest are a deliberate choice, for
 * somebody who wants a red table whatever they are playing. `none` is bare
 * charcoal.
 *
 * These are mana colours rather than free RGB on purpose: they run through
 * `identityGround`, which reads the app's own `--mana-*` tokens, so a mat can
 * never drift away from the palette the rest of the interface uses.
 */
export type MatTintId = 'deck' | 'none' | 'W' | 'U' | 'B' | 'R' | 'G' | 'WUBRG';

export const MAT_TINTS: ReadonlyArray<{ id: MatTintId; name: string }> = [
  { id: 'deck', name: 'Deck' },
  { id: 'W', name: 'White' },
  { id: 'U', name: 'Blue' },
  { id: 'B', name: 'Black' },
  { id: 'R', name: 'Red' },
  { id: 'G', name: 'Green' },
  { id: 'WUBRG', name: 'Five' },
  { id: 'none', name: 'None' },
];

const TINT_IDS = new Set<string>(MAT_TINTS.map(t => t.id));

export const DEFAULT_MAT_TINT: MatTintId = 'deck';

function tintOf(value: string | null | undefined): MatTintId {
  return TINT_IDS.has(value ?? '') ? (value as MatTintId) : DEFAULT_MAT_TINT;
}

/**
 * The colours a mat should actually paint with.
 *
 * `deck` hands back whatever the seat gave us, so a Simic seat stays blue-green.
 * A named tint overrides it, which is the whole point of choosing one. `none`
 * returns nothing, and `identityGround` draws no tint at all for that.
 */
export function tintColors(
  tint: MatTintId,
  seatColors?: readonly string[] | null
): readonly string[] | null {
  if (tint === 'deck') return seatColors ?? null;
  if (tint === 'none') return null;
  if (tint === 'WUBRG') return ['W', 'U', 'B', 'R', 'G'];
  return [tint];
}

const listeners = new Set<() => void>();

function readStyle(): MatStyleId {
  if (typeof window === 'undefined') return DEFAULT_MAT_STYLE;
  try {
    return matStyleOf(window.localStorage.getItem(STYLE_KEY)).id;
  } catch {
    // Private browsing and blocked storage throw here rather than returning
    // null, and neither is a reason to fail to draw a table.
    return DEFAULT_MAT_STYLE;
  }
}

function readTint(): MatTintId {
  if (typeof window === 'undefined') return DEFAULT_MAT_TINT;
  try {
    return tintOf(window.localStorage.getItem(TINT_KEY));
  } catch {
    return DEFAULT_MAT_TINT;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage refused, so the choice will not survive a reload. Applying it for
    // this session still beats refusing to change the table.
  }
  listeners.forEach(listener => listener());
}

export interface PlaymatPrefs {
  style: MatStyleId;
  tint: MatTintId;
  chooseStyle: (id: MatStyleId) => void;
  chooseTint: (id: MatTintId) => void;
}

export function usePlaymatPrefs(): PlaymatPrefs {
  const [style, setStyle] = useState<MatStyleId>(readStyle);
  const [tint, setTint] = useState<MatTintId>(readTint);

  useEffect(() => {
    const sync = () => {
      setStyle(readStyle());
      setTint(readTint());
    };
    listeners.add(sync);
    const onStorage = (event: StorageEvent) => {
      if (event.key === STYLE_KEY || event.key === TINT_KEY) sync();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const chooseStyle = useCallback((id: MatStyleId) => write(STYLE_KEY, matStyleOf(id).id), []);
  const chooseTint = useCallback((id: MatTintId) => write(TINT_KEY, tintOf(id)), []);

  return { style, tint, chooseStyle, chooseTint };
}
