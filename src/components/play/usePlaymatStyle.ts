/**
 * Which playmat surface the reader chose, remembered between games.
 *
 * Local rather than on the account, deliberately. It is a look, not data: it
 * should apply the moment it is picked with no round trip, it should not be a
 * write to the database every time somebody tries the six of them, and a reader
 * who is not signed in still gets to choose. If it ever needs to follow an
 * account, this is the one place that changes.
 *
 * Every mat on the board reads this, so a change has to reach all of them at
 * once. `storage` only fires in OTHER tabs, so a module-level subscriber list
 * carries the change within this one; without it, picking a style would repaint
 * the preview and leave the four seats behind it alone.
 */

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_MAT_STYLE, matStyleOf, type MatStyleId } from './matStyles';

const KEY = 'deckmatrix.playmat.style';

const listeners = new Set<(id: MatStyleId) => void>();

function read(): MatStyleId {
  if (typeof window === 'undefined') return DEFAULT_MAT_STYLE;
  try {
    return matStyleOf(window.localStorage.getItem(KEY)).id;
  } catch {
    // Private browsing and blocked storage both throw here rather than
    // returning null, and neither is a reason to fail to draw a table.
    return DEFAULT_MAT_STYLE;
  }
}

export function usePlaymatStyle(): [MatStyleId, (id: MatStyleId) => void] {
  const [style, setStyle] = useState<MatStyleId>(read);

  useEffect(() => {
    const onChange = (id: MatStyleId) => setStyle(id);
    listeners.add(onChange);
    // Another tab picking a style should land here too.
    const onStorage = (event: StorageEvent) => {
      if (event.key === KEY) setStyle(matStyleOf(event.newValue).id);
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const choose = useCallback((id: MatStyleId) => {
    const next = matStyleOf(id).id;
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Storage refused, so the choice will not survive a reload. Applying it
      // for this session is still better than refusing to change the table.
    }
    listeners.forEach(listener => listener(next));
  }, []);

  return [style, choose];
}
