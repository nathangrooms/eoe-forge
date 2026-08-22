/**
 * Being around: one row, overwritten, and never a query per friend.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A WRITE AND NOT A REALTIME PRESENCE CHANNEL
 * ---------------------------------------------------------------------------
 * Supabase Realtime has presence built in and it costs the database nothing,
 * which makes it the obvious answer and the wrong one. Presence on a shared
 * channel tells EVERYBODY on that channel who is on it, and anybody signed in
 * can join a channel. "Which accounts are online right now" would then be
 * readable by any account, and no policy could stop it, because there is no row
 * for a policy to be about.
 *
 * So it is a row. `friend_presence` has one row per account, overwritten in
 * place, and `my_friends()` decides who gets to see it. Turning "when I am
 * around" off deletes the row and `touch_presence` writes nothing while it is
 * off, so the switch costs the database as well as the interface.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT COSTS
 * ---------------------------------------------------------------------------
 * One upsert on a one-row-per-account table with a primary key, every 90
 * seconds, per tab, and ONLY while the tab is actually being looked at. A
 * hidden tab writes nothing at all, which is the half that matters: CLAUDE.md
 * records two outages caused by repeated reads, including from tabs nobody was
 * looking at.
 *
 * Reference counted, so a page with the friends strip at the top and the
 * friends panel further down beats once rather than twice.
 *
 * The window that counts as "around" is three minutes, in the database, in
 * `presence_window()`. Two missed beats is still around; three is not.
 */

import { supabase } from '@/integrations/supabase/client';

/** How often a visible tab says it is still there. */
export const BEAT_MS = 90_000;

export interface Doing {
  /** A short phrase in a player's words: "choosing a mode", "at a table". */
  doing?: string | null;
  /** The table code, when sitting at one, so a friend can come and join. */
  tableCode?: string | null;
}

let holders = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let latest: Doing = {};
let watchingVisibility = false;

async function beat(): Promise<void> {
  if (holders === 0) return;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

  const { error } = await supabase.rpc('touch_presence' as never, {
    p_doing: latest.doing ?? null,
    p_table_code: latest.tableCode ?? null,
  } as never);

  /* A failed heartbeat costs a dot on somebody else's screen. It is never worth
     a message on this one, and never worth a retry loop against a database that
     has just said no. */
  if (error) console.warn('[presence] could not say you are around:', error.message);
}

function onVisible(): void {
  if (document.visibilityState === 'visible') void beat();
}

/**
 * Say you are around, and keep saying it. Returns the function that stops.
 *
 * Call it from a page in the play section with what the reader is doing. The
 * phrase is shown to friends verbatim, so write it as a player would say it.
 */
export function keepPresence(what: Doing): () => void {
  latest = what;
  holders += 1;

  if (holders === 1) {
    void beat();
    timer = setInterval(() => void beat(), BEAT_MS);
    if (typeof document !== 'undefined' && !watchingVisibility) {
      document.addEventListener('visibilitychange', onVisible);
      watchingVisibility = true;
    }
  } else {
    /* A second holder with something more specific to say (a table code beats
       "choosing a mode") replaces the phrase without a second beat. */
    void beat();
  }

  return () => {
    holders = Math.max(0, holders - 1);
    if (holders === 0) {
      if (timer) clearInterval(timer);
      timer = null;
      if (typeof document !== 'undefined' && watchingVisibility) {
        document.removeEventListener('visibilitychange', onVisible);
        watchingVisibility = false;
      }
    }
  };
}
