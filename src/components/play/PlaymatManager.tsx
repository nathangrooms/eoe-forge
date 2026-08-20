/**
 * Manage the mat you play on.
 *
 * Owner: *"maybe you have a page where you manage your playmat inside play
 * mode, this way its saved and we can have users upload their own images (only
 * seen by them and people they play games with)"*.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A PAGE AND NOT A THIRD PICKER
 * ---------------------------------------------------------------------------
 * There were already two places to pick a surface, on the lobby and in the
 * in-game menu, and both are the right size for a row of six swatches. Neither
 * is the right size for a library: uploading has a file to choose, a wait, a
 * failure that has to be explained, and mats to delete. Those want room and a
 * URL you can come back to, which the design law calls a destination. The two
 * pickers stay exactly as they were, and both now point here.
 *
 * Every preview on this page is a REAL `Playmat`, not a swatch, drawn at the
 * proportions a mat is drawn at on a table. That is the same decision
 * `MatStylePicker` made, for the same reason: what you are choosing between is
 * the surface itself.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Trash2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/AuthProvider';
import { Playmat } from './Playmat';
import { MAT_STYLES, MAT_STYLE_IDS } from './matStyles';
import { MAT_TINTS, forgetPlaymat, usePlaymatPrefs } from './usePlaymatStyle';
import { prepareMatImage } from '@/lib/play/matImage';
import {
  deletePlaymat,
  listPlaymats,
  playmatUrl,
  uploadPlaymat,
  type Playmat as PlaymatRow,
} from '@/lib/play/playmats';
import {
  MAT_ACCEPTED_TYPES,
  MAT_LIBRARY_LIMIT,
  MAT_MAX_EDGE,
  formatBytes,
} from '@/lib/play/matResize';

export function PlaymatManager({ colors }: { colors?: readonly string[] | null }) {
  const { user } = useAuth();
  const { style, tint, matId, matUrl, chooseStyle, chooseTint, chooseMat } = usePlaymatPrefs();

  const [mats, setMats] = useState<PlaymatRow[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /* Deleting confirms in place. The design law is explicit that a centred
     dialog that dims and traps focus is never the answer. */
  const [confirming, setConfirming] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setMats([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await listPlaymats();
      setMats(rows);
      setProblem(null);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Your playmats could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /* One signed link per mat, resolved once. `playmatUrl` caches, so remounting
     this page does not re-sign anything. */
  useEffect(() => {
    let live = true;
    void (async () => {
      const entries = await Promise.all(
        mats.map(async mat => [mat.id, await playmatUrl(mat.objectPath)] as const)
      );
      if (!live) return;
      const next: Record<string, string> = {};
      for (const [id, url] of entries) if (url) next[id] = url;
      setPreviews(next);
    })();
    return () => {
      live = false;
    };
  }, [mats]);

  const full = mats.length >= MAT_LIBRARY_LIMIT;

  const onPick = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setProblem(null);
      setMessage(null);
      setWorking('upload');
      try {
        const prepared = await prepareMatImage(file);
        const saved = await uploadPlaymat({
          blob: prepared.blob,
          width: prepared.width,
          height: prepared.height,
          mime: prepared.mime,
          name: nameFromFile(file.name),
        });
        setMats(current => [saved, ...current]);
        chooseMat({ id: saved.id, objectPath: saved.objectPath });
        setMessage(
          prepared.source.width > prepared.width
            ? `Resized from ${prepared.source.width} by ${prepared.source.height} down to ${prepared.width} by ${prepared.height}, and saved at ${formatBytes(prepared.blob.size)}.`
            : `Saved at ${prepared.width} by ${prepared.height}, ${formatBytes(prepared.blob.size)}.`
        );
      } catch (error) {
        setProblem(error instanceof Error ? error.message : 'That image could not be saved.');
      } finally {
        setWorking(null);
        if (fileInput.current) fileInput.current.value = '';
      }
    },
    [chooseMat]
  );

  const onDelete = useCallback(async (mat: PlaymatRow) => {
    setProblem(null);
    setWorking(mat.id);
    try {
      await deletePlaymat(mat);
      // The board is drawing this file right now if it was the live one.
      forgetPlaymat(mat.id);
      setMats(current => current.filter(row => row.id !== mat.id));
      setConfirming(null);
      setMessage(`${mat.name} deleted.`);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That playmat could not be deleted.');
    } finally {
      setWorking(null);
    }
  }, []);

  /* Every preview on this page needs colour behind it or all six surfaces are
     the same black rectangle. Owner, on the lobby picker: "need playmat colour
     picker, all look black". There, the fix was the chosen deck's colours.
     Here there is no deck and no seat, so `Deck` is previewed in all five
     colours and the copy says that is what it is doing. */
  const previewTint = tint === 'deck' ? 'WUBRG' : tint;

  /* A picture does not replace a surface, it sits under it, so the line under
     the preview names both when both are in play. */
  const liveName = useMemo(() => {
    if (!matId) return MAT_STYLES[style].name;
    const picture = mats.find(mat => mat.id === matId)?.name ?? 'Your picture';
    return `${picture}, under ${MAT_STYLES[style].name.toLowerCase()}`;
  }, [matId, mats, style]);

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------------------
          What you are playing on, at the size it is played on.
          ------------------------------------------------------------------ */}
      <section className="space-y-3">
        <Playmat
          colors={colors}
          tone="viewer"
          ownSeat
          tintOverride={previewTint}
          rounded="rounded-2xl"
          className="h-44 w-full shadow-sm md:h-64 xl:h-72"
        />
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm font-semibold text-foreground">{liveName}</span>
          <span className="text-xs text-muted-foreground">
            {matId ? 'This is your seat. Nobody else at the table wears it.' : MAT_STYLES[style].note}
          </span>
        </div>
      </section>

      {/* ------------------------------------------------------------------
          Colour
          ------------------------------------------------------------------ */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Colour</h2>
        <p className="text-xs text-muted-foreground">
          Deck follows whoever sits there, so a four seat table stays easy to read. Pick a colour
          to keep your own seat the same every game. There is no deck open here, so Deck is
          previewed in all five colours. A picture brings its own colour, so this only applies to
          the drawn surfaces.
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1" role="radiogroup" aria-label="Playmat colour">
          {MAT_TINTS.map(option => {
            const active = option.id === tint;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => chooseTint(option.id)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/60',
                  active
                    ? 'bg-foreground text-background'
                    : 'bg-foreground/10 text-muted-foreground hover:bg-foreground/15'
                )}
              >
                {option.name}
              </button>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------------------
          The built-in surfaces
          ------------------------------------------------------------------ */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Surfaces</h2>
        <p className="text-xs text-muted-foreground">
          Drawn rather than photographed, so they stay sharp on any screen and weigh nothing. The
          surface is drawn over your picture as well, the way a weave sits on printed cloth, so
          picking one here never removes a picture.
        </p>
        <div
          className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
          role="radiogroup"
          aria-label="Playmat surface"
        >
          {MAT_STYLE_IDS.map(id => {
            const surface = MAT_STYLES[id];
            const active = id === style;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => chooseStyle(id)}
                className={cn(
                  'group flex flex-col gap-2 rounded-xl p-1.5 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/60',
                  active ? 'bg-foreground/10' : 'hover:bg-foreground/5'
                )}
              >
                <Playmat
                  colors={colors}
                  tone="viewer"
                  style={id}
                  image={null}
                  tintOverride={previewTint}
                  rounded="rounded-lg"
                  className={cn(
                    'h-24 w-full ring-1 transition-shadow md:h-28',
                    active ? 'ring-foreground/70' : 'ring-transparent'
                  )}
                />
                <span className="flex items-center gap-1.5 px-0.5 text-xs font-medium">
                  {active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  {surface.name}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------------------
          Your pictures
          ------------------------------------------------------------------ */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Your pictures</h2>
          <div className="flex items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept={MAT_ACCEPTED_TYPES.join(',')}
              className="sr-only"
              onChange={event => void onPick(event.target.files?.[0])}
            />
            <Button
              size="sm"
              variant="secondary"
              className="h-9 text-xs"
              disabled={!user || full || working === 'upload'}
              onClick={() => fileInput.current?.click()}
            >
              {working === 'upload' ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              )}
              {working === 'upload' ? 'Working' : 'Upload a picture'}
            </Button>
          </div>
        </div>

        {/* The one line about rights, in a player's words. */}
        <p className="text-xs text-muted-foreground">
          Only upload art you are allowed to use. Your picture is private: you can see it, and so can
          the people at your table while you are playing. Nobody else can.
        </p>

        <p className="text-xs text-muted-foreground">
          Big images are resized down to {MAT_MAX_EDGE} across before they are saved, because a mat
          is drawn behind every card on the table and gets downloaded by everyone sitting at it. PNG,
          JPG and WebP, up to {MAT_LIBRARY_LIMIT} pictures.
        </p>

        {!user && (
          <p className="text-xs text-foreground">
            Sign in to upload a picture. The surfaces above work either way, and this device
            remembers which one you picked.
          </p>
        )}

        {full && (
          <p className="text-xs text-foreground">
            That is {MAT_LIBRARY_LIMIT} pictures, which is the limit. Delete one to add another.
          </p>
        )}

        {problem && <p className="text-xs text-foreground">{problem}</p>}
        {message && !problem && <p className="text-xs text-muted-foreground">{message}</p>}

        {loading && mats.length === 0 && (
          <p className="text-xs text-muted-foreground">Loading your pictures.</p>
        )}

        {user && !loading && mats.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nothing uploaded yet. A wide picture works best. A mat is a long thin strip on the table,
            so the middle of the picture is what you will see.
          </p>
        )}

        {mats.length > 0 && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {mats.map(mat => {
              const active = mat.id === matId;
              const url = previews[mat.id] ?? null;
              return (
                <div key={mat.id} className="rounded-xl bg-card p-2 shadow-sm">
                  {/* Clicking the one you are on takes it off, which is the
                      only way back to a bare surface and reads as a toggle
                      because that is what it is. */}
                  <button
                    type="button"
                    aria-pressed={active}
                    aria-label={active ? `Stop using ${mat.name}` : `Play on ${mat.name}`}
                    onClick={() =>
                      active ? chooseMat(null) : chooseMat({ id: mat.id, objectPath: mat.objectPath })
                    }
                    className={cn(
                      'block w-full rounded-lg text-left transition-transform',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/60'
                    )}
                  >
                    <Playmat
                      colors={colors}
                      tone="viewer"
                      image={url}
                      rounded="rounded-lg"
                      className={cn(
                        'h-32 w-full ring-1 transition-shadow md:h-36',
                        active ? 'ring-foreground/70' : 'ring-transparent'
                      )}
                    />
                  </button>

                  <div className="flex items-center justify-between gap-2 px-1 pt-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-xs font-medium text-foreground">
                        {active && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                        {mat.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {active
                          ? 'Playing on this. Click it again to take it off.'
                          : `${mat.width} by ${mat.height}, ${formatBytes(mat.bytes)}`}
                      </p>
                    </div>

                    {confirming === mat.id ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 px-2 text-[11px]"
                          disabled={working === mat.id}
                          onClick={() => void onDelete(mat)}
                        >
                          {working === mat.id ? 'Deleting' : 'Delete'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => setConfirming(null)}
                        >
                          Keep
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                        aria-label={`Delete ${mat.name}`}
                        onClick={() => setConfirming(mat.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {matId && !matUrl && (
          <p className="text-xs text-muted-foreground">
            Loading the picture you play on.
          </p>
        )}
      </section>
    </div>
  );
}

/** A file name, made into something worth showing under a mat. */
function nameFromFile(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '');
  const cleaned = withoutExtension.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (cleaned || 'Playmat').slice(0, 60);
}

export default PlaymatManager;
