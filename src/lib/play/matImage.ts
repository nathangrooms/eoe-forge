/**
 * Turning whatever somebody picked into a playmat.
 *
 * The rules and the numbers are in `matResize.ts`. This is the part that needs
 * a browser: decode, downscale, re-encode.
 *
 * ---------------------------------------------------------------------------
 * WHY THE DOWNSCALE HAPPENS HERE AND NOT ON THE SERVER
 * ---------------------------------------------------------------------------
 * Because the alternative is uploading the original. A 12 megapixel phone
 * photograph is 4 MB on the way up and then 4 MB on the way DOWN for every
 * other player at the table, to be drawn at 1912 px behind a hundred cards.
 * Doing it before the upload means the large file never crosses the network at
 * all, and the storage bill is a few hundred KB per mat instead of a few MB.
 *
 * The database still carries its own ceiling in bytes, because a client-side
 * guard is a courtesy and not a control. It cannot carry one in pixels; that
 * gap is written down in the migration.
 *
 * ---------------------------------------------------------------------------
 * THE QUALITY LADDER
 * ---------------------------------------------------------------------------
 * One encode at 0.82 is almost always enough at 1920 px. The ladder exists for
 * the picture that is not: fine noise, film grain and screenshots of text all
 * defeat WebP and can land well over the cap at a quality that looks identical
 * two steps down. Stepping down beats refusing a picture that would have been
 * fine, and beats storing something nobody wants to download.
 */

import {
  MAT_MAX_STORED_BYTES,
  formatBytes,
  planMatSize,
  rejectSourceFile,
  rejectSourcePixels,
  type MatSize,
} from './matResize';

export interface PreparedMat {
  blob: Blob;
  width: number;
  height: number;
  mime: string;
  /** What the original was, so the interface can say what it did. */
  source: { width: number; height: number; bytes: number };
}

const QUALITY_LADDER = [0.82, 0.72, 0.6];

/**
 * Decode a file, downscale it and re-encode it. Throws with a message meant to
 * be shown to a person, because every failure here is something they can act
 * on: pick a different file, or a smaller one.
 */
export async function prepareMatImage(file: File): Promise<PreparedMat> {
  const refusal = rejectSourceFile(file);
  if (refusal) throw new Error(refusal);

  const source = await decode(file);
  try {
    const pixelRefusal = rejectSourcePixels(source);
    if (pixelRefusal) throw new Error(pixelRefusal);

    const target = planMatSize(source.width, source.height);
    const canvas = draw(source.image, target);
    const encoded = await encode(canvas);

    return {
      ...encoded,
      width: target.width,
      height: target.height,
      source: { width: source.width, height: source.height, bytes: file.size },
    };
  } finally {
    // An ImageBitmap holds its pixels until it is closed, and a 50 megapixel
    // one is 200 MB. Waiting for the collector is not good enough on a phone.
    source.close();
  }
}

interface Decoded extends MatSize {
  image: CanvasImageSource;
  close: () => void;
}

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Safari has refused animated and some CMYK files here. Fall through to
      // the element, which is more forgiving, rather than refusing the upload.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const element = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('That file could not be opened as an image.'));
      img.src = url;
    });
    return {
      image: element,
      width: element.naturalWidth,
      height: element.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function draw(image: CanvasImageSource, size: MatSize): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser will not let us resize that image.');
  /* A mat is a photograph, not a diagram, so smoothing is what you want: the
     alternative on a 4x downscale is aliasing along every edge. */
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, size.width, size.height);
  return canvas;
}

async function encode(canvas: HTMLCanvasElement): Promise<{ blob: Blob; mime: string }> {
  for (const quality of QUALITY_LADDER) {
    const blob = await toBlob(canvas, 'image/webp', quality);
    if (blob.size <= MAT_MAX_STORED_BYTES) return { blob, mime: blob.type };
    /* `toBlob` does not fail on a type it cannot encode, it quietly hands back
       PNG, and PNG ignores quality. Stepping down the ladder would then be
       three identical encodes of the same file. */
    if (blob.type !== 'image/webp') break;
  }

  throw new Error(
    `That picture will not compress below ${formatBytes(MAT_MAX_STORED_BYTES)}. ` +
      'A photograph works better here than a screenshot.'
  );
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) resolve(blob);
        else reject(new Error('This browser could not save that image.'));
      },
      mime,
      quality
    );
  });
}
