/**
 * The playmat the reader chose: its surface, its colour, and their own image.
 *
 * ---------------------------------------------------------------------------
 * IT LIVES IN TWO PLACES, DELIBERATELY
 * ---------------------------------------------------------------------------
 * This file used to say it was local for now, and that it was the one place to
 * change when mats moved to the account. They have. It is now BOTH, and the
 * split is the whole design:
 *
 *   localStorage  is the thing that paints. It is read synchronously on the
 *                 first render, so the table never flashes the default mat
 *                 while a request is in flight, and it is what a signed-out
 *                 reader gets, because choosing a surface should not require
 *                 an account.
 *
 *   the account   is the thing that remembers. It follows you to another
 *                 device, and it is where an uploaded mat has to live anyway,
 *                 because the image is in a private bucket.
 *
 * A choice is applied locally the instant it is made and pushed to the account
 * behind a short delay, so trying the six surfaces is six repaints and one
 * write, not six writes. The original note here worried about exactly that and
 * it was right to.
 *
 * On sign-in the account wins, with one exception: if the account has never
 * saved anything, whatever was chosen locally is pushed up rather than
 * discarded. Otherwise picking a mat while signed out and then signing in
 * would silently throw the choice away.
 *
 * ---------------------------------------------------------------------------
 * ONE CHANGE HAS TO REACH EVERY MAT
 * ---------------------------------------------------------------------------
 * Every mat on the board reads this, so a change has to reach all of them at
 * once. `storage` only fires in OTHER tabs, so a module-level subscriber list
 * carries the change within this one; without it, picking would repaint the
 * preview and leave the four seats behind it alone.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  forgetPlaymatUrls,
  loadPlaymatPrefs,
  playmatUrl,
  savePlaymatPrefs,
} from '@/lib/play/playmats';
import { matStyleOf, type MatStyleId } from './matStyles';

const STYLE_KEY = 'deckmatrix.playmat.style';
const TINT_KEY = 'deckmatrix.playmat.tint';
/* The uploaded mat is cached as id AND path: the id is what the account
   stores, the path is what a signed link is made from.

   Caching the path saves one round trip, not the round trip. A private bucket
   is reached through a signed link and signing is a request, so the picture
   cannot be on screen in the first frame whatever we cache. What the cached
   path buys is that the signing starts immediately, in `ensureSync`, instead of
   waiting for the account read to come back and tell us a path we already had.
   Two sequential requests become one, and the second one is a cache hit. */
const MAT_ID_KEY = 'deckmatrix.playmat.mat';
const MAT_PATH_KEY = 'deckmatrix.playmat.matPath';

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

/* -------------------------------------------------------------------------- */
/* Local storage                                                              */
/* -------------------------------------------------------------------------- */

function read(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private browsing and blocked storage throw here rather than returning
    // null, and neither is a reason to fail to draw a table.
    return null;
  }
}

function write(key: string, value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage refused, so the choice will not survive a reload. Applying it for
    // this session still beats refusing to change the table.
  }
}

/* -------------------------------------------------------------------------- */
/* The store                                                                  */
/* -------------------------------------------------------------------------- */

interface MatState {
  style: MatStyleId;
  tint: MatTintId;
  /** The uploaded mat that is live, or null for one of the drawn surfaces. */
  matId: string | null;
  matPath: string | null;
  /** A loadable link for `matPath`, once it has been signed. */
  matUrl: string | null;
}

let state: MatState = {
  style: matStyleOf(read(STYLE_KEY)).id,
  tint: tintOf(read(TINT_KEY)),
  matId: read(MAT_ID_KEY),
  matPath: read(MAT_PATH_KEY),
  matUrl: null,
};

const listeners = new Set<() => void>();

function publish(next: Partial<MatState>): void {
  state = { ...state, ...next };
  listeners.forEach(listener => listener());
}

/* -------------------------------------------------------------------------- */
/* The account                                                                */
/* -------------------------------------------------------------------------- */

let pendingWrite: ReturnType<typeof setTimeout> | null = null;
let queued: { style?: string; tint?: string; playmatId?: string | null } = {};
let signedIn = false;
let syncStarted = false;

/**
 * Hold a change for a moment before writing it.
 *
 * 700 ms is long enough that clicking through the surfaces to see them is one
 * write, and short enough that nobody gets away before it lands. A failure is
 * swallowed on purpose: the choice is already applied and already in local
 * storage, and a message saying the table you are looking at did not save is
 * noise in the middle of a game.
 */
function queueAccountWrite(change: { style?: string; tint?: string; playmatId?: string | null }) {
  if (!signedIn) return;
  queued = { ...queued, ...change };
  if (pendingWrite) clearTimeout(pendingWrite);
  pendingWrite = setTimeout(() => {
    const payload = queued;
    queued = {};
    pendingWrite = null;
    void savePlaymatPrefs(payload).catch(() => {});
  }, 700);
}

/** Sign the live mat's path, so the board has something it can paint. */
async function resolveMatUrl(path: string | null): Promise<void> {
  if (!path) {
    publish({ matUrl: null });
    return;
  }
  const url = await playmatUrl(path);
  // Another choice may have landed while this was in flight. The last wins.
  if (state.matPath === path) publish({ matUrl: url });
}

async function syncFromAccount(): Promise<void> {
  const { data } = await supabase.auth.getUser();
  signedIn = Boolean(data.user);

  if (!signedIn) {
    /* Signed out means drawn surfaces only. An uploaded mat cannot be reached
       without an account, so leaving its id set would paint nothing and look
       like a bug. */
    if (state.matId || state.matPath) {
      write(MAT_ID_KEY, null);
      write(MAT_PATH_KEY, null);
      publish({ matId: null, matPath: null, matUrl: null });
    }
    return;
  }

  let saved: Awaited<ReturnType<typeof loadPlaymatPrefs>> = null;
  try {
    saved = await loadPlaymatPrefs();
  } catch {
    // Supabase has been unreachable on this project before. The local choice
    // still paints, which is the point of keeping one.
    return;
  }

  if (!saved) {
    // Nothing on the account yet. Adopt whatever this device was using rather
    // than resetting somebody to Cloth the first time they sign in.
    void savePlaymatPrefs({ style: state.style, tint: state.tint }).catch(() => {});
    return;
  }

  const style = matStyleOf(saved.style).id;
  const tint = tintOf(saved.tint);
  write(STYLE_KEY, style);
  write(TINT_KEY, tint);
  write(MAT_ID_KEY, saved.playmatId);
  write(MAT_PATH_KEY, saved.playmatPath);
  publish({ style, tint, matId: saved.playmatId, matPath: saved.playmatPath });
  await resolveMatUrl(saved.playmatPath);
}

/**
 * Start the account sync once per tab, whoever mounts a mat first.
 *
 * Guarded rather than left to each caller, because a four-seat board mounts
 * five of these and none of them should be the one that owns the fetch.
 */
function ensureSync(): void {
  if (syncStarted || typeof window === 'undefined') return;
  syncStarted = true;
  /* Start signing the mat this device already knows about, in parallel with
     the account read rather than after it. Without this the cached path is
     dead weight: the picture would still wait for the prefs round trip to hand
     back the same path. If the reader turns out to be signed out, the signing
     fails harmlessly and `syncFromAccount` clears the path anyway — and
     `resolveMatUrl` will not publish a link for a path that is no longer the
     live one. */
  void resolveMatUrl(state.matPath);
  void syncFromAccount();

  supabase.auth.onAuthStateChange(event => {
    if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return;
    // A different account has a different library, so nothing signed under the
    // old one may be reused.
    forgetPlaymatUrls();
    publish({ matUrl: null });
    void syncFromAccount();
  });
}

/* -------------------------------------------------------------------------- */
/* The hook                                                                   */
/* -------------------------------------------------------------------------- */

export interface PlaymatPrefs {
  style: MatStyleId;
  tint: MatTintId;
  /** Which uploaded mat is live, if any. */
  matId: string | null;
  /** A link the board can paint, or null when there is no uploaded mat. */
  matUrl: string | null;
  chooseStyle: (id: MatStyleId) => void;
  chooseTint: (id: MatTintId) => void;
  /** Make an uploaded mat live, or pass null to go back to a drawn surface. */
  chooseMat: (mat: { id: string; objectPath: string } | null) => void;
}

export function usePlaymatPrefs(): PlaymatPrefs {
  const [snapshot, setSnapshot] = useState<MatState>(state);

  useEffect(() => {
    const sync = () => setSnapshot(state);
    listeners.add(sync);
    sync();
    ensureSync();

    const onStorage = (event: StorageEvent) => {
      // Another tab changed the mat. Re-read every key rather than trusting the
      // event's value, so they stay consistent with each other.
      if (
        event.key === STYLE_KEY ||
        event.key === TINT_KEY ||
        event.key === MAT_ID_KEY ||
        event.key === MAT_PATH_KEY
      ) {
        const path = read(MAT_PATH_KEY);
        publish({
          style: matStyleOf(read(STYLE_KEY)).id,
          tint: tintOf(read(TINT_KEY)),
          matId: read(MAT_ID_KEY),
          matPath: path,
        });
        void resolveMatUrl(path);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const chooseStyle = useCallback((id: MatStyleId) => {
    const style = matStyleOf(id).id;
    write(STYLE_KEY, style);
    publish({ style });
    queueAccountWrite({ style });
  }, []);

  const chooseTint = useCallback((id: MatTintId) => {
    const tint = tintOf(id);
    write(TINT_KEY, tint);
    publish({ tint });
    queueAccountWrite({ tint });
  }, []);

  const chooseMat = useCallback((mat: { id: string; objectPath: string } | null) => {
    write(MAT_ID_KEY, mat?.id ?? null);
    write(MAT_PATH_KEY, mat?.objectPath ?? null);
    publish({ matId: mat?.id ?? null, matPath: mat?.objectPath ?? null, matUrl: null });
    queueAccountWrite({ playmatId: mat?.id ?? null });
    void resolveMatUrl(mat?.objectPath ?? null);
  }, []);

  return {
    style: snapshot.style,
    tint: snapshot.tint,
    matId: snapshot.matId,
    matUrl: snapshot.matUrl,
    chooseStyle,
    chooseTint,
    chooseMat,
  };
}

/**
 * Tell the store a mat is gone.
 *
 * Deleting the mat you are playing on has to put the table back on a drawn
 * surface at once, or the board keeps a signed link to a file that no longer
 * exists and paints nothing.
 */
export function forgetPlaymat(matId: string): void {
  if (state.matId !== matId) return;
  write(MAT_ID_KEY, null);
  write(MAT_PATH_KEY, null);
  publish({ matId: null, matPath: null, matUrl: null });
}
