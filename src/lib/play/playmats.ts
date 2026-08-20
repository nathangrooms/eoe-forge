/**
 * The playmat library, on the account.
 *
 * The boundary between the play surface and Supabase, in the same spirit as
 * `deckSource.ts`: nothing above this file knows a bucket exists.
 *
 * ---------------------------------------------------------------------------
 * SIGNED URLS, AND WHY THEY LAST SIX HOURS
 * ---------------------------------------------------------------------------
 * The bucket is private, so a mat is reached through a signed URL rather than
 * a public one. The term is a real trade and it is worth stating plainly:
 *
 *   too short  the link expires mid-game and the table loses its surface, or
 *              we spend the game re-signing on a timer;
 *   too long   the link is a capability, and anyone it is passed to can fetch
 *              the image until it expires, table or no table.
 *
 * Six hours covers a long Commander evening in one signing, and it is short
 * enough that a leaked link is not permanent. A cache in this module means one
 * signing per mat per tab rather than one per rendered seat, which matters
 * because a four-seat board asks for its mat on every mount.
 *
 * The rule about WHO may sign at all is not here. It is in the database, in
 * `playmat_visible_to_me`: the owner, and a player at a live table with them,
 * for the one mat that seat is playing on. This file cannot widen it and does
 * not try.
 */

import { supabase } from '@/integrations/supabase/client';

export const PLAYMAT_BUCKET = 'playmats';

/** How long a signed link lives. See the note above. */
const SIGNED_URL_SECONDS = 6 * 60 * 60;

/** Re-sign a little before the term is up rather than at the moment it fails. */
const RESIGN_MARGIN_MS = 10 * 60 * 1000;

export interface Playmat {
  id: string;
  name: string;
  objectPath: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: string;
}

export interface PlaymatPrefsRow {
  style: string;
  tint: string;
  playmatId: string | null;
  /** Where the live mat's file is, so it can be signed without a second read. */
  playmatPath: string | null;
}

interface PlaymatDbRow {
  id: string;
  name: string;
  object_path: string;
  width: number;
  height: number;
  bytes: number;
  created_at: string;
}

function toPlaymat(row: PlaymatDbRow): Playmat {
  return {
    id: row.id,
    name: row.name,
    objectPath: row.object_path,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    createdAt: row.created_at,
  };
}

/* -------------------------------------------------------------------------- */
/* The library                                                                */
/* -------------------------------------------------------------------------- */

export async function listPlaymats(): Promise<Playmat[]> {
  const { data, error } = await supabase
    .from('playmats' as never)
    .select('id, name, object_path, width, height, bytes, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as PlaymatDbRow[]).map(toPlaymat);
}

/**
 * Put a prepared image in the bucket and record it.
 *
 * The file goes up first and the row is written after, by an RPC that refuses
 * to record a mat whose object is not actually there. That ordering is the one
 * that fails safe: a half-finished upload leaves an orphan file, which counts
 * against the quota and can be cleared, rather than a row pointing at nothing,
 * which the board would try to draw on every frame.
 */
export async function uploadPlaymat(prepared: {
  blob: Blob;
  width: number;
  height: number;
  mime: string;
  name: string;
}): Promise<Playmat> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('Sign in to upload a playmat.');

  /* The folder IS the ownership check in the storage policies, so the path is
     built from the signed-in id and never from anything typed. */
  const extension = prepared.mime === 'image/png' ? 'png' : 'webp';
  const objectPath = `${userId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(PLAYMAT_BUCKET)
    .upload(objectPath, prepared.blob, { contentType: prepared.mime, upsert: false });
  if (uploadError) throw new Error(friendlyUploadError(uploadError.message));

  const { data, error } = await supabase.rpc('record_playmat' as never, {
    p_object_path: objectPath,
    p_name: prepared.name,
    p_mime: prepared.mime,
    p_width: prepared.width,
    p_height: prepared.height,
    p_bytes: prepared.blob.size,
  } as never);

  if (error) {
    // The row is what makes the file findable, so a file with no row is
    // rubbish. Clear it rather than letting it sit against the quota.
    await supabase.storage.from(PLAYMAT_BUCKET).remove([objectPath]);
    throw new Error(error.message);
  }

  return toPlaymat(data as unknown as PlaymatDbRow);
}

/**
 * Delete a mat: the file, then the row.
 *
 * That order round the other way would leave a file nothing points at and
 * nothing can find, which is the one state that cannot be cleaned up from the
 * interface.
 */
export async function deletePlaymat(mat: Playmat): Promise<void> {
  const { error: fileError } = await supabase.storage.from(PLAYMAT_BUCKET).remove([mat.objectPath]);
  if (fileError) throw new Error(fileError.message);

  const { error } = await supabase
    .from('playmats' as never)
    .delete()
    .eq('id', mat.id);
  if (error) throw new Error(error.message);

  signedUrls.delete(mat.objectPath);
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The whole of the reader's mat setting, in one read.
 *
 * The live mat's PATH is fetched alongside the id through the foreign key, not
 * in a second query. The board cannot paint an id: it needs a signed link, and
 * a link needs a path, so splitting these into two round trips would put a
 * blank mat on screen for the length of the second one.
 */
export async function loadPlaymatPrefs(): Promise<PlaymatPrefsRow | null> {
  const { data, error } = await supabase
    .from('playmat_prefs' as never)
    .select('style, tint, playmat_id, playmats(object_path)')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as unknown as {
    style: string;
    tint: string;
    playmat_id: string | null;
    playmats: { object_path: string } | { object_path: string }[] | null;
  };
  const joined = Array.isArray(row.playmats) ? row.playmats[0] : row.playmats;
  return {
    style: row.style,
    tint: row.tint,
    playmatId: row.playmat_id,
    playmatPath: joined?.object_path ?? null,
  };
}

/**
 * Save the surface, the colour and which upload is live.
 *
 * `playmatId: null` means "go back to a drawn surface" and has to be told
 * apart from "do not touch the mat", which is what the extra flag is for.
 */
export async function savePlaymatPrefs(prefs: {
  style?: string;
  tint?: string;
  playmatId?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('set_playmat_prefs' as never, {
    p_style: prefs.style ?? null,
    p_tint: prefs.tint ?? null,
    p_playmat: prefs.playmatId ?? null,
    p_clear_playmat: 'playmatId' in prefs && prefs.playmatId === null,
  } as never);
  if (error) throw new Error(error.message);
}

/* -------------------------------------------------------------------------- */
/* Signed links                                                               */
/* -------------------------------------------------------------------------- */

const signedUrls = new Map<string, { url: string; expiresAt: number }>();
const inFlight = new Map<string, Promise<string | null>>();

/**
 * A URL the browser can actually load, or null when this reader is not allowed
 * to see that mat. Null is a normal answer, not an error: an opponent whose
 * game has finished is exactly this case.
 */
export async function playmatUrl(objectPath: string): Promise<string | null> {
  const cached = signedUrls.get(objectPath);
  if (cached && cached.expiresAt - RESIGN_MARGIN_MS > Date.now()) return cached.url;

  const existing = inFlight.get(objectPath);
  if (existing) return existing;

  const request = (async () => {
    const { data, error } = await supabase.storage
      .from(PLAYMAT_BUCKET)
      .createSignedUrl(objectPath, SIGNED_URL_SECONDS);
    if (error || !data?.signedUrl) return null;
    signedUrls.set(objectPath, {
      url: data.signedUrl,
      expiresAt: Date.now() + SIGNED_URL_SECONDS * 1000,
    });
    return data.signedUrl;
  })().finally(() => inFlight.delete(objectPath));

  inFlight.set(objectPath, request);
  return request;
}

/** Forget every signed link. Called when the signed-in account changes. */
export function forgetPlaymatUrls(): void {
  signedUrls.clear();
}

/* -------------------------------------------------------------------------- */
/* Other seats                                                                */
/* -------------------------------------------------------------------------- */

export interface SeatPlaymat {
  userId: string;
  playerId: string;
  seat: number;
  objectPath: string;
}

/**
 * The live mat of every player at one online table, in one call.
 *
 * Nothing renders this yet: the online board does not exist, so no seat on
 * screen is currently tied to a user id. It is here because it is the read
 * half of the rule the storage policy already enforces, and because a per-seat
 * lookup on a four-seat board would be four round trips where this is one.
 */
export async function playmatsAtTable(tableId: string): Promise<SeatPlaymat[]> {
  const { data, error } = await supabase.rpc('playmats_at_table' as never, {
    p_table: tableId,
  } as never);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Array<{
    user_id: string;
    player_id: string;
    seat: number;
    object_path: string;
  }>).map(row => ({
    userId: row.user_id,
    playerId: row.player_id,
    seat: row.seat,
    objectPath: row.object_path,
  }));
}

/* -------------------------------------------------------------------------- */

function friendlyUploadError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('row-level security') || lower.includes('violates')) {
    return 'You already have the most playmats an account can hold. Delete one first.';
  }
  if (lower.includes('exceeded the maximum allowed size') || lower.includes('payload too large')) {
    return 'That image is still too big after resizing. Try a different picture.';
  }
  if (lower.includes('mime type')) {
    return 'That image could not be saved in a format we can use.';
  }
  return message;
}
