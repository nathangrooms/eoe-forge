/**
 * How big an uploaded playmat is allowed to be, and why.
 *
 * Pure arithmetic, kept apart from the canvas work in `matImage.ts` so the
 * limits can be tested without a browser. Every number here is a decision, so
 * every number here is argued.
 *
 * ---------------------------------------------------------------------------
 * THE OUTPUT CAP: 1920 ON THE LONGEST EDGE
 * ---------------------------------------------------------------------------
 * A mat is not a wallpaper, it is the thing 120 permanents get drawn on top of.
 * The header of `Playmat.tsx` records the only measurements that matter, taken
 * from a real board:
 *
 *   two-seat table, 1920 wide     1912 x 369
 *   four-seat quads, 1920 wide     948 x 369
 *   two-seat table, 1680 wide     1672 x 358
 *
 * So the widest a single mat has ever been drawn in this app is 1912 CSS px.
 * 1920 covers that with nothing to spare and nothing wasted. It is deliberately
 * NOT doubled for high-density screens: the image is composited under a colour
 * tint, a woven texture and a vignette, and then covered in cards, and the
 * detail a 2x source would add is detail nobody can see. Doubling the edge
 * quadruples the pixels every player at the table has to decode.
 *
 * The mat is painted with `background-size: cover`, so a mat that is smaller
 * than the box is stretched rather than tiled, and one that is a different
 * shape is cropped rather than squashed. That is why there is no minimum size
 * and no fixed aspect ratio: any picture works, it is just softer if it is
 * small.
 *
 * ---------------------------------------------------------------------------
 * THE INPUT CAPS
 * ---------------------------------------------------------------------------
 * Two separate ceilings, because they stop two different things.
 *
 *   BYTES (12 MB) is about the network and about memory before we have looked
 *   at the file at all. It is generous: a 12 MP phone photo is 3 to 6 MB.
 *
 *   PIXELS (50 MP) is about the decode. A 12 MB file can be a 100 MP PNG, and
 *   decoding that costs 400 MB of RGBA regardless of how small the file was.
 *   50 MP is comfortably above any phone or camera anybody is going to point at
 *   this, and below the point where a browser tab falls over.
 *
 * ---------------------------------------------------------------------------
 * THE ENCODED CAP
 * ---------------------------------------------------------------------------
 * After downscaling, the file is re-encoded and has to come in under 1.5 MB,
 * with the bucket refusing anything over 2 MB as the backstop. At 1920 px a
 * WebP photograph is normally a few hundred KB, so the quality ladder in
 * `matImage.ts` almost never has to step down. Everyone at the table downloads
 * this once, so the number that matters is not "small", it is "small enough
 * that a four-seat pod is not four megabytes before the first land drop".
 */

/** The longest edge an uploaded mat is stored at. See above. */
export const MAT_MAX_EDGE = 1920;

/** Largest file we will even open. */
export const MAT_MAX_SOURCE_BYTES = 12 * 1024 * 1024;

/** Largest decoded image we will open, in pixels. */
export const MAT_MAX_SOURCE_PIXELS = 50_000_000;

/** Largest file we will store, after downscaling and re-encoding. */
export const MAT_MAX_STORED_BYTES = 1_500_000;

/** What a person is allowed to hand us. */
export const MAT_ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** How many mats one account may keep. Matched by the database, which is what actually enforces it. */
export const MAT_LIBRARY_LIMIT = 8;

export interface MatSize {
  width: number;
  height: number;
}

/**
 * The size an upload should be stored at.
 *
 * Never upscales: a small picture stays small rather than being blown up into
 * a soft one, which is the exact mistake the old card-art mats made.
 */
export function planMatSize(width: number, height: number, maxEdge = MAT_MAX_EDGE): MatSize {
  const w = Math.floor(width);
  const h = Math.floor(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
    throw new Error('that image has no size');
  }
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { width: w, height: h };

  const scale = maxEdge / longest;
  return {
    // `max(1, …)` guards a panorama so extreme that the short edge rounds to
    // zero, which would make an unpaintable canvas rather than a thin mat.
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

/**
 * Why a file cannot be used, in the words the interface shows. Null means it
 * is fine so far; the size checks that need the decoded image happen after.
 */
export function rejectSourceFile(file: { type: string; size: number }): string | null {
  if (!MAT_ACCEPTED_TYPES.includes(file.type as (typeof MAT_ACCEPTED_TYPES)[number])) {
    return 'Use a PNG, JPG or WebP image.';
  }
  if (file.size > MAT_MAX_SOURCE_BYTES) {
    return `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAT_MAX_SOURCE_BYTES)}.`;
  }
  if (file.size <= 0) return 'That file is empty.';
  return null;
}

/** Same, for what we learn only once the image is decoded. */
export function rejectSourcePixels(size: MatSize): string | null {
  if (size.width * size.height > MAT_MAX_SOURCE_PIXELS) {
    return 'That picture is too many pixels to work with. Try a smaller version of it.';
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}
