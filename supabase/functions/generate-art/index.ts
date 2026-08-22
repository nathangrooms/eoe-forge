/**
 * Generate an image and keep it, so the app can use it as a real asset.
 *
 * Owner wants cover art for the play modes and, shortly, custom icons.
 *
 *   POST /functions/v1/generate-art
 *   { "prompt": "...", "name": "play-mode-online", "aspect": "16:9" }
 *
 * Returns the storage path and a public URL. Calling it twice with the same
 * name overwrites, so a prompt can be iterated without collecting rubbish.
 *
 * ADMIN ONLY. This spends the owner's money on every call, so it checks
 * profiles.is_admin rather than merely requiring a signed-in user. It is not
 * something a visitor gets to run. The key stays here and never reaches a
 * browser.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

/* TWO WAYS TO REACH THE SAME MODEL, and the direct one is preferred.
   ------------------------------------------------------------------
   This started on the Lovable gateway, which bills against a credit pool that
   ran dry mid-batch: it answered 402 "Not enough credits, requires top_up" for
   every model, so three of the four covers were stuck.

   The owner then added GEMINI_API_KEY, which talks to Google directly. That is
   now the primary path. The gateway stays as a fallback rather than being
   deleted, because a project with one route to a paid service has an outage
   waiting whenever that route has a bad day. */
const GOOGLE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GATEWAY = 'https://ai.gateway.lovable.dev/v1/chat/completions';

/* Pro is the default because the owner asked for the best rather than flash,
   and in a painted illustration the difference is not subtle. Flash stays as an
   override for iterating on a prompt cheaply before spending pro calls on it. */
const PRO = 'gemini-3-pro-image-preview';
const FLASH = 'gemini-2.5-flash-image';

/* Landscape by default. The first batch came back 1024x1024 and every surface
   that shows a cover is wider than it is tall, so a square image is a square
   image with its sides cut off. Asking the model for the shape we need beats
   cropping art we paid for. */
const DEFAULT_ASPECT = '16:9';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const fail = (status: number, message: string, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

/** An image as raw bytes, however we got hold of it. */
interface Made {
  bytes: Uint8Array;
  type: string;
}

const decode = (b64: string, type: string): Made => ({
  bytes: Uint8Array.from(atob(b64), c => c.charCodeAt(0)),
  type,
});

/** Google's own API. Returns the image, or the reason there isn't one. */
async function viaGoogle(
  key: string,
  model: string,
  prompt: string,
  aspect: string
): Promise<Made | string> {
  const answer = await fetch(`${GOOGLE}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      /* Both modalities. The image models narrate what they drew as well as
         drawing it, and asking for IMAGE alone is refused by some versions. */
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: aspect },
      },
    }),
  });

  const text = await answer.text();
  if (!answer.ok) return `Google refused (${answer.status}): ${text.slice(0, 400)}`;

  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch {
    return `Google did not return JSON: ${text.slice(0, 300)}`;
  }

  /* The image is one part among several; the others are the model's commentary.
     Find the one with bytes rather than assuming a position. */
  const parts: any[] = payload?.candidates?.[0]?.content?.parts ?? [];
  const image = parts.find(p => p?.inlineData?.data);
  if (!image) {
    /* A refusal is a real answer and worth reading. A blocked prompt comes back
       as a finishReason with no image, and reporting "no image" alone sends you
       hunting for a bug that is really a content filter. */
    const why = payload?.candidates?.[0]?.finishReason ?? payload?.promptFeedback?.blockReason;
    return `No image in Google's reply${why ? ` (${why})` : ''}: ${JSON.stringify(payload).slice(0, 300)}`;
  }

  return decode(image.inlineData.data, image.inlineData.mimeType ?? 'image/png');
}

/** The Lovable gateway, kept as a fallback. */
async function viaGateway(key: string, model: string, prompt: string): Promise<Made | string> {
  const answer = await fetch(GATEWAY, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `google/${model}`,
      messages: [{ role: 'user', content: prompt }],
      modalities: ['image', 'text'],
    }),
  });

  const text = await answer.text();
  if (!answer.ok) return `Gateway refused (${answer.status}): ${text.slice(0, 400)}`;

  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch {
    return `Gateway did not return JSON: ${text.slice(0, 300)}`;
  }

  const message = payload?.choices?.[0]?.message;
  const found: string | undefined =
    message?.images?.[0]?.image_url?.url ??
    message?.images?.[0]?.url ??
    (typeof message?.content === 'string' && message.content.startsWith('data:image')
      ? message.content
      : undefined);
  if (!found) return `No image from the gateway: ${JSON.stringify(payload).slice(0, 300)}`;

  const comma = found.indexOf(',');
  const type = /data:([^;]+)/.exec(found.slice(0, comma))?.[1] ?? 'image/png';
  return decode(found.slice(comma + 1), type);
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  const google = Deno.env.get('GEMINI_API_KEY');
  const lovable = Deno.env.get('LOVABLE_API_KEY');
  if (!google && !lovable) {
    return fail(500, 'Neither GEMINI_API_KEY nor LOVABLE_API_KEY is set on this project.');
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const auth = req.headers.get('Authorization') ?? '';

  // Who is asking. The anon client reads the caller's JWT; the service client
  // does the writing, so storage rules do not have to be widened for this.
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: who } = await asCaller.auth.getUser();
  if (!who?.user) return fail(401, 'Sign in first.');

  const admin = createClient(url, service);
  const { data: profile } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', who.user.id)
    .maybeSingle();
  if (!profile?.is_admin) return fail(403, 'Admins only. This call costs money.');

  let body: { prompt?: string; name?: string; bucket?: string; cheap?: boolean; aspect?: string };
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Send JSON.');
  }

  const prompt = (body.prompt ?? '').trim();
  const name = (body.name ?? '').trim();
  const bucket = (body.bucket ?? 'art').trim();
  const aspect = (body.aspect ?? DEFAULT_ASPECT).trim();
  const model = body.cheap ? FLASH : PRO;

  if (!prompt) return fail(400, 'A prompt is required.');
  // The name becomes a storage path, so it may not wander out of the bucket.
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(name)) {
    return fail(400, 'name must be lowercase letters, numbers and hyphens.');
  }
  if (!/^\d{1,2}:\d{1,2}$/.test(aspect)) {
    return fail(400, 'aspect must look like 16:9.');
  }

  /* Try Google, then the gateway. Both failures are reported, because "it did
     not work" without the two reasons is the start of a long afternoon. */
  const tried: string[] = [];
  let made: Made | null = null;

  if (google) {
    const attempt = await viaGoogle(google, model, prompt, aspect);
    if (typeof attempt === 'string') tried.push(attempt);
    else made = attempt;
  }
  if (!made && lovable) {
    const attempt = await viaGateway(lovable, model, prompt);
    if (typeof attempt === 'string') tried.push(attempt);
    else made = attempt;
  }
  if (!made) return fail(502, 'No image came back.', { tried });

  const ext = made.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
  const path = `${name}.${ext}`;

  await admin.storage.createBucket(bucket, { public: true }).catch(() => {});
  const { error: upload } = await admin.storage
    .from(bucket)
    .upload(path, made.bytes, { contentType: made.type, upsert: true });
  if (upload) return fail(500, `Could not store it: ${upload.message}`);

  const { data: pub } = admin.storage.from(bucket).getPublicUrl(path);
  return new Response(
    JSON.stringify({
      ok: true,
      bucket,
      path,
      url: pub.publicUrl,
      bytes: made.bytes.length,
      type: made.type,
      model,
      aspect,
    }),
    { headers: { ...cors, 'Content-Type': 'application/json' } }
  );
});
