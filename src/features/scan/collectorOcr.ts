/**
 * Tesseract, wired to read the collector-number block.
 *
 * Lazily constructed and only ever invoked when the art hash could not settle a
 * printing on its own — which is the minority of scans. Loading the worker
 * eagerly would add a multi-megabyte download and a second of startup to a
 * feature whose whole point is being instant.
 *
 * The recognition engine takes this as an injected function, so it never
 * imports Tesseract and stays testable without it.
 */

import type { GrayImage } from '@/lib/vision';

export interface CollectorOcr {
  read(image: GrayImage): Promise<string>;
  terminate(): void;
}

/**
 * Upscale factor applied before recognition.
 *
 * The collector line is the smallest text on the card; in a rectified 488x680
 * card the crop is roughly 285x61 px and the glyphs are ~10 px tall. Tesseract
 * does markedly better with more pixels even when they carry no new
 * information, because its classifier was trained on scanned print at far
 * higher effective resolution.
 */
const UPSCALE = 4;

/** Turn a grayscale buffer into something Tesseract accepts, upscaled. */
function toCanvas(image: GrayImage): HTMLCanvasElement {
  const src = document.createElement('canvas');
  src.width = image.width;
  src.height = image.height;
  const sctx = src.getContext('2d')!;
  const id = sctx.createImageData(image.width, image.height);
  for (let i = 0, p = 0; i < image.data.length; i++, p += 4) {
    const v = image.data[i];
    id.data[p] = v;
    id.data[p + 1] = v;
    id.data[p + 2] = v;
    id.data[p + 3] = 255;
  }
  sctx.putImageData(id, 0, 0);

  const out = document.createElement('canvas');
  out.width = image.width * UPSCALE;
  out.height = image.height * UPSCALE;
  const octx = out.getContext('2d')!;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

export function createCollectorOcr(): CollectorOcr {
  let workerPromise: Promise<import('tesseract.js').Worker> | null = null;

  async function worker() {
    if (!workerPromise) {
      workerPromise = (async () => {
        const { createWorker } = await import('tesseract.js');
        const w = await createWorker('eng');
        await w.setParameters({
          // The block contains a number, a slash, a rarity letter, a set code
          // and a language tag. Constraining the alphabet stops Tesseract
          // inventing punctuation out of the card's border.
          tessedit_char_whitelist:
            '0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
        });
        return w;
      })();
    }
    return workerPromise;
  }

  return {
    async read(image: GrayImage): Promise<string> {
      const w = await worker();
      const canvas = toCanvas(image);
      const { data } = await w.recognize(canvas);
      return data?.text ?? '';
    },
    terminate() {
      // Fire and forget: nothing downstream cares, and awaiting it in a React
      // cleanup would be ignored anyway.
      workerPromise?.then((w) => w.terminate()).catch(() => {});
      workerPromise = null;
    },
  };
}
