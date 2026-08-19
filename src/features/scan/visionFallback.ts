/**
 * The vision model, as an explicit escape hatch.
 *
 * THIS MUST NEVER BE CALLED AUTOMATICALLY. It is wired to a button the user
 * presses after local recognition has told them it could not identify the card.
 * Every invocation is a paid model call over the network; the local pipeline
 * exists precisely so that the default path never reaches here.
 *
 * The rule, concretely:
 *   - `recognizeCard` sets `offerVisionFallback` when it gave up.
 *   - The UI may then SHOW a button. It may not press it.
 *   - Nothing else in the scan flow imports this module.
 *
 * `supabase/functions/scan-card-ai` is unchanged and unowned by this feature —
 * it is called from the client exactly as it always was, just no longer on the
 * happy path.
 */

import { supabase } from '@/integrations/supabase/client';
import { fetchPrintings, type PrintingDetail } from './printingLookup';

export interface VisionFallbackResult {
  /** The card name the model read, verbatim. */
  name: string;
  /** Printings of that name we hold, best-guess first. Possibly empty. */
  printings: PrintingDetail[];
  /**
   * True when the name matched nothing in the catalogue. Worth surfacing rather
   * than showing an empty list: it usually means the card is genuinely absent
   * from our data, not that the model failed.
   */
  notInCatalogue: boolean;
}

/**
 * Ask the model what card this is.
 *
 * Returns the name it read plus every printing of that name we hold, so the
 * user still chooses the printing. The model reads a NAME — it has never been
 * able to identify a printing, and presenting its answer as if it had would be
 * the same silent-wrong-printing bug in a more expensive wrapper.
 */
export async function identifyWithVisionModel(
  imageDataUrl: string,
  signal?: AbortSignal,
): Promise<VisionFallbackResult> {
  const { data, error } = await supabase.functions.invoke('scan-card-ai', {
    body: { image: imageDataUrl },
  });
  if (error) throw error;
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');

  const name = extractName(data);
  if (!name) throw new Error('The vision model did not return a card name.');

  // Exact name first; the model returns the printed name, and an exact match is
  // both cheaper and less prone to dragging in unrelated cards than a fuzzy one.
  const { data: rows, error: qErr } = await supabase
    .from('cards')
    .select('id')
    .eq('name', name)
    .limit(20);
  if (qErr) throw qErr;

  let ids = (rows ?? []).map((r) => r.id as string);

  if (ids.length === 0) {
    const { data: fuzzy } = await supabase
      .from('cards')
      .select('id')
      .ilike('name', `%${name}%`)
      .limit(20);
    ids = (fuzzy ?? []).map((r) => r.id as string);
  }

  const printings = ids.length ? await fetchPrintings(ids) : [];
  // Newest first: a user scanning a physical card is far more likely to be
  // holding a recent printing than a 1990s one, and the list stays honest
  // because every option is shown with its own art and set.
  printings.sort((a, b) => (b.releasedAt ?? '').localeCompare(a.releasedAt ?? ''));

  return { name, printings, notInCatalogue: printings.length === 0 };
}

/**
 * The edge function returns the name as text, but has been seen wrapping it in
 * a JSON envelope depending on how the gateway responds. Accept both rather
 * than depending on a shape we do not own and must not edit.
 */
function extractName(data: unknown): string | null {
  if (typeof data === 'string') return cleanName(data);
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    for (const key of ['name', 'cardName', 'text', 'result']) {
      const v = d[key];
      if (typeof v === 'string' && v.trim()) return cleanName(v);
    }
  }
  return null;
}

function cleanName(raw: string): string | null {
  const name = raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ');
  if (!name || /^(unknown|none|n\/a|not a card)$/i.test(name)) return null;
  return name;
}

/** Encode a video frame as a JPEG data URL for the model call. */
export function frameToDataUrl(video: HTMLVideoElement, maxWidth = 900): string | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const scale = vw > maxWidth ? maxWidth / vw : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vw * scale);
  canvas.height = Math.round(vh * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}
